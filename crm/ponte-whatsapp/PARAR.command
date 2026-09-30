#!/bin/bash
cd "$(dirname "$0")" || exit 1
launchctl unload "$HOME/Library/LaunchAgents/com.royal.ponte.plist" 2>/dev/null
echo "  Ponte parada. Para ligar de novo: LIGAR.command"
sleep 3
