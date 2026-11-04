# One-time setup for a designated, IT-approved Windows publisher computer.
# This computer must stay signed in to Windows and have write access to the shared update folder.
[CmdletBinding()]
param([string]$UpdateFolder='Z:\Health & Safety\Dashboard Updates')
$ErrorActionPreference='Stop'
$source=Join-Path $PSScriptRoot 'Publish-PrivateUpdate.ps1'
if(-not (Test-Path -LiteralPath $source -PathType Leaf)) {
  throw 'Publish-PrivateUpdate.ps1 must be in the same folder as this installer.'
}
# GitHub personal access token (fine-grained), limited to the dashboard repo, with Actions:read only.
# Password-protected input is never displayed, and only a current-user DPAPI-encrypted token is saved.
$stateDir=Join-Path $env:LOCALAPPDATA 'OnboardCorrugated\UpdatePublisher'
New-Item -ItemType Directory -Path $stateDir -Force | Out-Null
$secretFile=Join-Path $stateDir 'github-token.dpapi'
if(-not (Test-Path -LiteralPath $secretFile -PathType Leaf)){
  Write-Host 'Create a read-only GitHub fine-grained token for the dashboard repository. Do not share it in chat.' -ForegroundColor Yellow
  Write-Host 'Repository access: Only JosephMatt04/onboard-hs-dashboard; Permissions: Actions = Read-only and Metadata = Read-only.'
  $secure=Read-Host 'Paste your GitHub fine-grained token (input hidden)' -AsSecureString
  if($secure.Length -lt 20){throw 'Token was empty or too short. No credential was saved.'}
  $secure | ConvertFrom-SecureString | Set-Content -LiteralPath $secretFile -Encoding UTF8
}
if(-not (Test-Path -LiteralPath $UpdateFolder -PathType Container)) {
  throw "Cannot find the approved folder: $UpdateFolder. Connect the company Z: drive first."
}
$targetDir=$stateDir
New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
$target=Join-Path $targetDir 'Publish-PrivateUpdate.ps1'
Copy-Item -LiteralPath $source -Destination $target -Force
$task='Onboard H&S Private Update Publisher'
$action="powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$target`" -UpdateFolder `"$UpdateFolder`""
& schtasks.exe /Create /F /SC HOURLY /MO 1 /TN $task /TR $action
if($LASTEXITCODE -ne 0){throw 'Windows Task Scheduler could not register the publisher task. Ask IT for permission.'}
Write-Host 'Hourly private update publication task installed.' -ForegroundColor Green
Write-Host 'Testing the publisher now. This may download and publish the latest successful build.'
& powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $target -UpdateFolder $UpdateFolder
if($LASTEXITCODE -ne 0){throw 'Publisher test failed. Inspect publisher.log in your LOCALAPPDATA\OnboardCorrugated\UpdatePublisher folder.'}
Write-Host 'Publisher test finished. It will check for new builds every hour while this Windows user is logged in.' -ForegroundColor Green
Write-Host 'The dashboard itself will still ask the user before starting an unsigned installer.'
