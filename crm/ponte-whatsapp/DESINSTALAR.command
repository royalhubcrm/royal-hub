#!/bin/bash
cd "$(dirname "$0")" || exit 1
P="$HOME/Library/LaunchAgents/com.royal.ponte.plist"
launchctl unload "$P" 2>/dev/null
[ -f "$P" ] && mv "$P" "$P.desligado"
echo "  A ponte não sobe mais sozinha. Os arquivos e a sessão continuam nesta pasta."
sleep 3
