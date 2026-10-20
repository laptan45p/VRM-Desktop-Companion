@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js LTS is required. Install from https://nodejs.org/
  pause
  exit /b 1
)
if not exist "node_modules\.bin\electron.cmd" (
  call npm ci
  if errorlevel 1 goto fail
)
if not exist "node_modules\electron\dist\electron.exe" (
  node node_modules\electron\install.js
  if errorlevel 1 goto fail
)
call npm start
if errorlevel 1 goto fail
exit /b 0
:fail
echo.
echo Startup failed. Please copy the error message above.
pause
exit /b 1
