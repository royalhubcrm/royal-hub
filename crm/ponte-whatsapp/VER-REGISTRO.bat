@echo off
cd /d "%~dp0"
if not exist ponte.log (
  echo   Ainda nao tem registro. A ponte talvez nem tenha ligado.
  pause
  exit /b
)
notepad ponte.log
