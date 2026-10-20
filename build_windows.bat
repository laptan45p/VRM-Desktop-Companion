@echo off
setlocal
cd /d "%~dp0"
call npm ci
if errorlevel 1 goto fail
call npm run package:win
if errorlevel 1 goto fail
echo Build complete. See the release folder.
pause
exit /b 0
:fail
pause
exit /b 1
