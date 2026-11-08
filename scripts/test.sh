#!/bin/sh
# Validates the mod and runs its tests with the engine the desktop app uses (the newest one
# installed), because the `claude` in the terminal may be older and refuse what the app accepts.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_ENGINES="$HOME/Library/Application Support/Claude/claude-code"
ENGINE="$(ls -d "$APP_ENGINES"/*/*/claude.app/Contents/MacOS/claude 2>/dev/null | sort -V | tail -1)"
if [ -z "$ENGINE" ]; then
  ENGINE="$(command -v claude)"
  echo "desktop app engine not found; using $ENGINE"
fi
echo "engine: $("$ENGINE" --version)"
"$ENGINE" plugin validate "$ROOT"
"$ENGINE" plugin test "$ROOT"
