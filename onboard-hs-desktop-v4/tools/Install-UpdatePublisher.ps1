# One-time setup for a designated, IT-approved Windows publisher computer.
# This computer must stay signed in to Windows and have write access to the shared update folder.
[CmdletBinding()]
param([string]$UpdateFolder='Z:\Health & Safety\Dashboard Updates')
$ErrorActionPreference='Stop'
$source=Join-Path $PSScriptRoot 'Publish-PrivateUpdate.ps1'
if(-not (Test-Path -LiteralPath $source -PathType Leaf)) {
  throw 'Publish-PrivateUpdate.ps1 must be in the same folder as this installer.'
}
if(-not (Get-Command gh -ErrorAction SilentlyContinue)) { throw 'Install GitHub CLI before continuing.' }
& gh auth status
if($LASTEXITCODE -ne 0) { throw 'GitHub CLI is not authenticated; complete gh auth login first.' }
$stateDir=Join-Path $env:LOCALAPPDATA 'OnboardCorrugated\UpdatePublisher'
New-Item -ItemType Directory -Path $stateDir -Force | Out-Null
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
