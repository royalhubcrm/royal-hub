@echo off
rem Mantem a ponte no ar: se ela cair por qualquer motivo, sobe de novo em 10 segundos.
rem Para parar de verdade, use o PARAR.bat (ele cria o arquivo parar.flag).
setlocal
cd /d "%~dp0"
set "PATH=%PATH%;%ProgramFiles%\nodejs;%ProgramFiles(x86)%\nodejs"
if exist parar.flag del /q parar.flag

:laco
if exist parar.flag goto fim
echo. >> ponte.log
echo ================ %date% %time% - ligando a ponte ================ >> ponte.log
node ponte.js >> ponte.log 2>&1
if exist parar.flag goto fim
echo ---------------- %date% %time% - caiu, subindo de novo em 10s ---------------- >> ponte.log
timeout /t 10 /nobreak >nul
goto laco

:fim
echo ================ %date% %time% - parada pelo PARAR.bat ================ >> ponte.log
