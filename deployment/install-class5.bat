@echo off
setlocal
cd /d "%~dp0.."
where wsl.exe >nul 2>nul
if errorlevel 1 (
  echo Windows Subsystem for Linux is required. Starting Ubuntu installation...
  wsl.exe --install -d Ubuntu
  echo Restart Windows if requested, open Ubuntu once to create its user, then run this file again.
  exit /b 1
)
wsl.exe --status >nul 2>nul
if errorlevel 1 (
  echo WSL is not ready. Starting Ubuntu installation...
  wsl.exe --install -d Ubuntu
  echo Restart Windows if requested, open Ubuntu once to create its user, then run this file again.
  exit /b 1
)
wsl.exe -- bash deployment/bootstrap.sh
exit /b %errorlevel%
