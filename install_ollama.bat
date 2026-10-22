@echo off
setlocal
chcp 65001 >nul
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0llm-tools\ollama_setup.ps1"
set "result=%errorlevel%"
pause
exit /b %result%
