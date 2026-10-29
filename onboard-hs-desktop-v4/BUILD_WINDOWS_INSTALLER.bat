@echo off
cd /d "%~dp0"
if not exist "node_modules\electron-builder" (
 echo Build dependencies are not installed.
 echo Get approval, then open Command Prompt here and run: npm install
 pause
 exit /b 1
)
call npm run dist:win
pause
