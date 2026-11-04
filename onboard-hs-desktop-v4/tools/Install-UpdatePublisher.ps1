# One-time setup for a designated, IT-approved Windows publisher computer.
# This computer must stay signed in to Windows and have write access to the shared update folder.
[CmdletBinding()]
param([string]$UpdateFolder='Z:\Health & Safety\Dashboard Updates')
$ErrorActionPreference='Stop'
$source=Join-Path $PSScriptRoot 'Publish-PrivateUpdate.ps1'
if(-not (Test-Path -LiteralPath $source -PathType Leaf)) {
  throw 'Publish-PrivateUpdate.ps1 must be in the same folder as this installer.'
}
if(-not (Get-Command gh -ErrorAction SilentlyContinue)) {
  throw 'GitHub CLI is not installed. Ask IT to install GitHub CLI (https://cli.github.com/), reopen PowerShell, then try again.'
}
& gh auth status
if($LASTEXITCODE -ne 0) {
  throw 'You need to sign in once. Run: gh auth login --hostname github.com --scopes repo'
}
if(-not (Test-Path -LiteralPath $UpdateFolder -PathType Container)) {
  throw "Cannot find the approved folder: $UpdateFolder. Connect the company Z: drive first."
}
$targetDir=Join-Path $env:LOCALAPPDATA 'OnboardCorrugated\UpdatePublisher'
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
