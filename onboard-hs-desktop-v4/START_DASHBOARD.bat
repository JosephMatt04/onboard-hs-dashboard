@echo off
cd /d "%~dp0"
if not exist "node_modules\electron" (
 echo Electron is not installed in this project folder.
 echo Get IT approval if needed, then open Command Prompt here and run: npm install
 pause
 exit /b 1
)
call npm start
if errorlevel 1 pause
