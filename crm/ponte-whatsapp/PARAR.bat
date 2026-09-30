@echo off
cd /d "%~dp0"
title Royal - parar a ponte do WhatsApp
echo   Parando a ponte...
echo parada em %date% %time% > parar.flag
taskkill /f /im node.exe >nul 2>&1
echo   Parada. Para ligar de novo: LIGAR.bat (ou reinicie o computador).
pause
