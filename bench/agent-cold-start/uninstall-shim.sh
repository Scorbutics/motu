#!/bin/sh
set -eu
BIN="${MOTU_BIN_DIR:-$HOME/.local/bin}"
REAL="${MOTU_REPO:-/home/scorbutics/dev/motu}/packages/cli/src/cli.mjs"
ln -sf "$REAL" "$BIN/motu"
rm -f "$BIN/motu.real-link"
echo "✓ restored $BIN/motu -> $REAL"
