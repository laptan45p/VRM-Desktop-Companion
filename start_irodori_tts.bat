@echo off
chcp 65001 >nul
setlocal
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0tts-tools\irodori_server.ps1" -Mode Start
set "TTS_RESULT=%ERRORLEVEL%"
echo.
pause
exit /b %TTS_RESULT%
