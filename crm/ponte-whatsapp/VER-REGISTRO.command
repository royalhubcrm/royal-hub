#!/bin/bash
cd "$(dirname "$0")" || exit 1
[ -f ponte.log ] && open -e ponte.log || echo "  Ainda não tem registro."
sleep 2
