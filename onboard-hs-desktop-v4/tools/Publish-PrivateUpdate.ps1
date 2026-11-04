# Onboard Corrugated private updater publisher.
# Run on an IT-approved Windows machine that can WRITE to the private update share.
# Requires an encrypted GitHub fine-grained token with Actions:read on the private repository.
[CmdletBinding()]
param(
  [string]$UpdateFolder = 'Z:\Health & Safety\Dashboard Updates',
  [string]$Repository = 'JosephMatt04/onboard-hs-dashboard'
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$stateDir = Join-Path $env:LOCALAPPDATA 'OnboardCorrugated\UpdatePublisher'
New-Item -ItemType Directory -Path $stateDir -Force | Out-Null
$logFile = Join-Path $stateDir 'publisher.log'
function Log([string]$message) {
  $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $message"
  Add-Content -LiteralPath $logFile -Value $line
  Write-Host $line
}
function VersionParts([string]$version) {
  if ($version -notmatch '^\d+\.\d+\.\d+$') { throw "Invalid version: $version" }
  return @($version.Split('.') | ForEach-Object { [int]$_ })
}
function Compare-Versions([string]$a,[string]$b) {
  $left=VersionParts $a; $right=VersionParts $b
  for($i=0;$i -lt 3;$i++) {
    if($left[$i] -gt $right[$i]) { return 1 }
    if($left[$i] -lt $right[$i]) { return -1 }
  }
  return 0
}
function GithubHeaders {
  $secretFile=Join-Path $stateDir 'github-token.dpapi'
  if(-not (Test-Path -LiteralPath $secretFile -PathType Leaf)) { throw 'Publisher credential not configured. Run Install-UpdatePublisher.ps1.' }
  $encrypted=(Get-Content -LiteralPath $secretFile -Raw).Trim()
  $secret=ConvertTo-SecureString $encrypted
  $ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
  try {
    $token=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
    return @{
      Authorization="Bearer $token"
      Accept='application/vnd.github+json'
      'X-GitHub-Api-Version'='2022-11-28'
      'User-Agent'='Onboard-Private-Update-Publisher'
    }
  }finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)}
}
function GithubGet([string]$uri,[hashtable]$headers){
 return Invoke-RestMethod -Uri $uri -Headers $headers -Method Get -TimeoutSec 90
}
$mutex = [System.Threading.Mutex]::new($false,'Local\OnboardCorrugatedUpdatePublisher')
$acquired = $false
$temp = $null
try {
  $acquired=$mutex.WaitOne(0)
  if(-not $acquired) { Log 'Another publisher check is already running.'; return }
  if(-not (Test-Path -LiteralPath $UpdateFolder -PathType Container)) {
    throw "Update folder unavailable: $UpdateFolder (check VPN / mapped drive and permissions)"
  }
  # Do not publish a previous successful build if the newest build failed or is still running.
  $headers=GithubHeaders
  $endpoint="https://api.github.com/repos/$Repository/actions/workflows/build-windows.yml/runs?branch=main&per_page=1"
  $response=GithubGet $endpoint $headers
  $runs=@($response.workflow_runs)
  if($runs.Count -eq 0){Log 'No workflow runs available yet.';return}
  $run=$runs[0]
  if($run.status -ne 'completed' -or $run.conclusion -ne 'success'){
    Log "Latest build $($run.id) is $($run.status)/$($run.conclusion). Not publishing."
    return
  }
  $temp=Join-Path $env:TEMP ('onboard-update-'+[guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $temp -Force | Out-Null
  $artifactList=GithubGet "https://api.github.com/repos/$Repository/actions/runs/$($run.id)/artifacts?per_page=100" $headers
  $artifact=@($artifactList.artifacts | Where-Object { $_.name -eq 'Onboard-HS-Windows-Installer' -and -not $_.expired } | Select-Object -First 1)
  if($artifact.Count -ne 1){throw 'Build has no available Onboard-HS-Windows-Installer artifact'}
  $zipPath=Join-Path $temp 'private-installer.zip'
  # Invoke-WebRequest follows the authenticated GitHub redirect to the time-limited artifact download URL.
  Invoke-WebRequest -Uri "https://api.github.com/repos/$Repository/actions/artifacts/$($artifact[0].id)/zip" -Headers $headers -OutFile $zipPath -MaximumRedirection 5 -TimeoutSec 180
  Expand-Archive -LiteralPath $zipPath -DestinationPath $temp -Force
  $manifestPath=Join-Path $temp 'onboard-hs-update.json'
  if(-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) { throw 'Downloaded build is missing onboard-hs-update.json' }
  if((Get-Item -LiteralPath $manifestPath).Length -gt 16384) { throw 'Manifest is too large' }
  $manifest=Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
  $candidate=[string]$manifest.version
  [void](VersionParts $candidate)
  $fileName=[string]$manifest.file
  if($fileName -notmatch '^Onboard-HS-Dashboard-Setup-[a-zA-Z0-9._-]+\.exe$' -or $fileName.Contains('..')) {
    throw 'Unexpected installer filename'
  }
  if($fileName -ne "Onboard-HS-Dashboard-Setup-$candidate-x64.exe") { throw 'Installer version does not match manifest' }
  $source=Join-Path $temp $fileName
  if(-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw 'Installer missing from downloaded artifact' }
  $size=(Get-Item -LiteralPath $source).Length
  if($size -lt 1 -or $size -gt 600MB -or $size -ne [long]$manifest.size) { throw 'Installer size mismatch' }
  $digest=(Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash
  if($digest -ne [string]$manifest.sha256) { throw 'Installer SHA256 mismatch' }
  $currentPath=Join-Path $UpdateFolder 'onboard-hs-update.json'
  if(Test-Path -LiteralPath $currentPath -PathType Leaf) {
    try {
      $current=Get-Content -LiteralPath $currentPath -Raw | ConvertFrom-Json
      if((Compare-Versions $candidate ([string]$current.version)) -le 0) {
        Log "Version $candidate is already published, or a newer version is available."
        return
      }
    }catch {
      throw "Existing update manifest is invalid. Please have IT inspect the folder: $($_.Exception.Message)"
    }
  }
  # Atomic-ish publishing: installer first, validate destination, then replace manifest LAST.
  $destination=Join-Path $UpdateFolder $fileName
  $partial=Join-Path $UpdateFolder ($fileName+'.uploading')
  try {
    Copy-Item -LiteralPath $source -Destination $partial -Force
    if((Get-FileHash -LiteralPath $partial -Algorithm SHA256).Hash -ne $digest) {
      throw 'Published file failed SHA256 verification'
    }
    Move-Item -LiteralPath $partial -Destination $destination -Force
    $manifestTemp=Join-Path $UpdateFolder 'onboard-hs-update.json.uploading'
    Copy-Item -LiteralPath $manifestPath -Destination $manifestTemp -Force
    Move-Item -LiteralPath $manifestTemp -Destination $currentPath -Force
  }finally {
    if(Test-Path -LiteralPath $partial) { Remove-Item -LiteralPath $partial -Force }
  }
  Log "Published v$candidate from build $($run.id) into $UpdateFolder"
}catch {
  Log "ERROR: $($_.Exception.Message)"
  exit 1
}finally {
  if($temp -and (Test-Path -LiteralPath $temp)) { Remove-Item -LiteralPath $temp -Recurse -Force -ErrorAction SilentlyContinue }
  if($acquired){$mutex.ReleaseMutex()}
  $mutex.Dispose()
}
