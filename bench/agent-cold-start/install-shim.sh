#!/bin/sh
# Swap ~/.local/bin/motu for the tracing shim. Reversible: uninstall-shim.sh restores the symlink.
set -eu
BIN="${MOTU_BIN_DIR:-$HOME/.local/bin}"
HERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REAL="${MOTU_REPO:-/home/scorbutics/dev/motu}/packages/cli/src/cli.mjs"
mkdir -p "$(dirname "${MOTU_BENCH_TRACE:-/home/scorbutics/dev/motu-bench/runs/trace.jsonl}")"
if [ ! -e "$BIN/motu.real-link" ]; then
  cp -P "$BIN/motu" "$BIN/motu.real-link"
fi
ln -sf "$HERE/shim/motu" "$BIN/motu"
echo "✓ traced motu installed at $BIN/motu (real: $REAL)"
