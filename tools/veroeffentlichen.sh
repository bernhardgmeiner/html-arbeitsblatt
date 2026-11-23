#!/usr/bin/env bash
# Gebautes Blatt nach docs/<id>/index.html kopieren (GitHub Pages). Danach committen und pushen.
# Aufruf: bash tools/veroeffentlichen.sh <id>
set -euo pipefail
cd "$(dirname "$0")/.."
id="$1"
src="dist/$id/index.html"
[ -f "$src" ] || { echo "Fehlt: $src (zuerst bauen, ohne --salt)"; exit 1; }
if grep -q 'data-k="n4bQgYhMfWWaL+qgxVrQFaO/TxsrC4Is"' "$src"; then echo "Das ist ein Test-Build mit --salt test. Ohne --salt neu bauen."; exit 1; fi
mkdir -p "docs/$id"
cp "$src" "docs/$id/index.html"
echo "Bereit: docs/$id/index.html  →  https://bernhardgmeiner.github.io/html-arbeitsblatt/$id/"
