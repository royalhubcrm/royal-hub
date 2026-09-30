@echo off
cd /d "%~dp0"
title Royal - tirar a ponte do inicio automatico
wscript "%~dp0criar-atalho-inicio.vbs" /tirar
echo   A ponte nao sobe mais sozinha com o Windows.
echo   Os arquivos e a sessao do WhatsApp continuam nesta pasta.
pause
