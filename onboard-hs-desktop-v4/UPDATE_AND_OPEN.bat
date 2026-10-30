@echo off
cd /d "%~dp0"
where git >nul 2>&1 || (echo Install Git for Windows once & pause & exit /b 1)
git rev-parse --is-inside-work-tree >nul 2>&1 || (echo Clone the private repository with GitHub Desktop first & pause & exit /b 1)
git pull --ff-only
if errorlevel 1 (echo Update could not be applied. Files and records unchanged. & pause & exit /b 1)
call OPEN_LOCAL_DASHBOARD.bat
