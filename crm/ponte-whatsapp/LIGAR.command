#!/bin/bash
cd "$(dirname "$0")" || exit 1
launchctl load "$HOME/Library/LaunchAgents/com.royal.ponte.plist" 2>/dev/null
echo "  Ponte ligada. O QR aparece no painel, em Ajustes > WhatsApp."
sleep 3
