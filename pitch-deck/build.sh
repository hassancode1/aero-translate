#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
"$CHROME" --headless --disable-gpu --no-pdf-header-footer \
  --print-to-pdf="$(pwd)/AeroTranslate-Pitch-Deck.pdf" \
  --print-to-pdf-no-header \
  "file://$(pwd)/pitch-deck/deck.html"

echo "Wrote AeroTranslate-Pitch-Deck.pdf"
