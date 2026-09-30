@echo off
setlocal
cd /d "%~dp0"
title Royal - instalar a ponte do WhatsApp

echo.
echo   ============================================
echo     ROYAL - PONTE DO WHATSAPP
echo     Instalacao neste computador
echo   ============================================
echo.

rem ---------------------------------------------------------------- 1. Node
where node >nul 2>&1
if errorlevel 1 (
  echo   O Node.js nao esta instalado. Vou tentar instalar agora...
  winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
  set "PATH=%PATH%;%ProgramFiles%\nodejs"
)
where node >nul 2>&1
if errorlevel 1 (
  echo.
  echo   Nao consegui instalar o Node.js sozinho.
  echo   Baixe em https://nodejs.org (botao LTS), instale e rode este arquivo de novo.
  echo.
  pause
  exit /b 1
)
for /f "delims=" %%v in ('node -v') do echo   Node.js %%v encontrado.

rem ---------------------------------------------------------------- 2. .env
if not exist ".env" (
  copy /y ".env.exemplo" ".env" >nul
  echo.
  echo   Vou abrir o arquivo de configuracao. Preencha EMPRESA e PONTE_TOKEN
  echo   (os dois estao no painel, em Ajustes ^> WhatsApp, canal "QR code"),
  echo   salve e feche o Bloco de Notas para continuar.
  echo.
  pause
  notepad ".env"
)

rem ---------------------------------------------------------------- 3. dependencias
echo.
echo   Baixando o que a ponte precisa (demora uns minutos na primeira vez)...
call npm install --omit=dev --no-audit --no-fund
if errorlevel 1 (
  echo.
  echo   Algo falhou no download. Confira a internet e rode de novo.
  pause
  exit /b 1
)

rem ---------------------------------------------------------------- 4. nao deixar o PC dormir
powercfg /change standby-timeout-ac 0 >nul 2>&1
powercfg /change hibernate-timeout-ac 0 >nul 2>&1
powercfg /change disk-timeout-ac 0 >nul 2>&1

rem ---------------------------------------------------------------- 5. subir sozinha com o Windows
wscript "%~dp0criar-atalho-inicio.vbs"
if errorlevel 1 (
  echo   Nao consegui deixar no inicio automatico. A ponte ainda funciona,
  echo   mas voce vai precisar rodar o LIGAR.bat quando ligar o PC.
) else (
  echo   Pronto: a ponte sobe sozinha toda vez que voce entrar neste Windows.
)

rem ---------------------------------------------------------------- 6. ligar agora
if exist parar.flag del /q parar.flag
start "" wscript.exe "%~dp0ponte-oculta.vbs"

echo.
echo   ============================================
echo     PRONTO. A ponte esta rodando.
echo.
echo     Agora abra o painel em Ajustes ^> WhatsApp:
echo     o QR code aparece la. No celular:
echo     WhatsApp ^> Aparelhos conectados ^> Conectar aparelho.
echo   ============================================
echo.
echo   Para ver o que ela esta fazendo: VER-REGISTRO.bat
echo   Para desligar: PARAR.bat   /   Para ligar de novo: LIGAR.bat
echo.
pause
