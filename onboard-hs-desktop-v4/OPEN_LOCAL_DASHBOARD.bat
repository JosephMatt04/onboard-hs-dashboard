@echo off
cd /d "%~dp0"
where node >nul 2>&1 || (echo Install Node.js LTS once from nodejs.org & pause & exit /b 1)
node local-server.js
if errorlevel 1 pause
