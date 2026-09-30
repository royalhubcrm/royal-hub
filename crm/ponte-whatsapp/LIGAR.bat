@echo off
cd /d "%~dp0"
if exist parar.flag del /q parar.flag
start "" wscript.exe "%~dp0ponte-oculta.vbs"
echo   Ponte ligada. O QR aparece no painel, em Ajustes ^> WhatsApp.
timeout /t 4 >nul
