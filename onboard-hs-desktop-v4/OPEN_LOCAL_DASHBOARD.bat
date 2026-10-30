@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -File "%~dp0local-server.ps1"
if errorlevel 1 pause
