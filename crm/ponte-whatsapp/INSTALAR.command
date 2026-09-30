#!/bin/bash
# Royal - instalar a ponte do WhatsApp neste Mac (dois cliques neste arquivo).
cd "$(dirname "$0")" || exit 1
clear
echo
echo "  ============================================"
echo "    ROYAL - PONTE DO WHATSAPP"
echo "    Instalação neste Mac"
echo "  ============================================"
echo

# ---------------------------------------------------------------- 1. Node
NODE="$(command -v node || true)"
for tentativa in /opt/homebrew/bin/node /usr/local/bin/node; do
  [ -z "$NODE" ] && [ -x "$tentativa" ] && NODE="$tentativa"
done
if [ -z "$NODE" ]; then
  echo "  O Node.js não está instalado."
  if command -v brew >/dev/null 2>&1; then
    echo "  Instalando com o Homebrew (pode demorar)..."
    brew install node
    NODE="$(command -v node || true)"
  fi
fi
if [ -z "$NODE" ]; then
  echo
  echo "  Não consegui instalar o Node.js sozinho."
  echo "  Baixe em https://nodejs.org (botão LTS), instale e rode este arquivo de novo."
  echo
  read -r -p "  Enter para fechar."
  exit 1
fi
echo "  Node.js $("$NODE" -v) em $NODE"

# ---------------------------------------------------------------- 2. .env
if [ ! -f .env ]; then
  cp .env.exemplo .env
  echo
  echo "  Vou abrir o arquivo de configuração. Preencha EMPRESA e PONTE_TOKEN"
  echo "  (os dois estão no painel, em Ajustes > WhatsApp, canal \"QR code\"),"
  echo "  salve com Cmd+S e feche a janela."
  echo
  read -r -p "  Enter para abrir."
  open -W -e .env
fi

# ---------------------------------------------------------------- 3. dependências
echo
echo "  Baixando o que a ponte precisa (demora uns minutos na primeira vez)..."
NPM="$(dirname "$NODE")/npm"
"$NPM" install --omit=dev --no-audit --no-fund || { echo "  Falhou o download. Confira a internet."; read -r -p "  Enter para fechar."; exit 1; }

# ---------------------------------------------------------------- 4. subir sozinha
PASTA="$(pwd)"
PLIST="$HOME/Library/LaunchAgents/com.royal.ponte.plist"
mkdir -p "$HOME/Library/LaunchAgents"
cat > "$PLIST" <<PLISTFIM
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.royal.ponte</string>
  <key>ProgramArguments</key>
  <array><string>$NODE</string><string>$PASTA/ponte.js</string></array>
  <key>WorkingDirectory</key><string>$PASTA</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>StandardOutPath</key><string>$PASTA/ponte.log</string>
  <key>StandardErrorPath</key><string>$PASTA/ponte.log</string>
</dict>
</plist>
PLISTFIM

launchctl unload "$PLIST" 2>/dev/null
launchctl load "$PLIST" 2>/dev/null && echo "  Pronto: a ponte sobe sozinha toda vez que você entrar neste Mac." \
  || echo "  Não consegui deixar no início automático; use o LIGAR.command quando ligar o Mac."

echo
echo "  ============================================"
echo "    PRONTO. A ponte está rodando."
echo
echo "    Agora abra o painel em Ajustes > WhatsApp:"
echo "    o QR code aparece lá. No celular:"
echo "    WhatsApp > Aparelhos conectados > Conectar aparelho."
echo "  ============================================"
echo
echo "  Ver o que ela está fazendo:  VER-REGISTRO.command"
echo "  Parar:  PARAR.command    Ligar de novo:  LIGAR.command"
echo
read -r -p "  Enter para fechar."
