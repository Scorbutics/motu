#!/bin/sh
# motu — one-command installer.
#
#   ./install.sh                 # put `motu` on PATH, then install the skills into the CWD repo
#   ./install.sh ~/dev/ocean     # ...and install the skills into that repo instead
#   ./install.sh --no-skills     # CLI only
#   ./install.sh --no-path       # skills only (don't touch the shell rc)
#
# What it does:
#   1. links <motu>/packages/cli/src/cli.mjs into a bin dir (default ~/.local/bin) as `motu`,
#   2. makes sure that bin dir is on PATH by adding ONE guarded block to your shell rc
#      (~/.zshrc, ~/.bashrc, fish config, or ~/.profile — detected from $SHELL),
#   3. runs `motu skills install <target>` so the island-create / island-extract skills land in the
#      target repo for both GitHub Copilot (.github/agents + .github/prompts) and Claude Code
#      (.claude/skills/<name>/SKILL.md).
#
# POSIX sh, no dependencies beyond node. Idempotent: safe to re-run after `git pull`.
set -eu

BIN_DIR="${MOTU_BIN_DIR:-$HOME/.local/bin}"
MARKER_BEGIN="# >>> motu >>>"
MARKER_END="# <<< motu <<<"

TARGET=""
DO_PATH=1
DO_SKILLS=1
for arg in "$@"; do
  case "$arg" in
    --no-path) DO_PATH=0 ;;
    --no-skills) DO_SKILLS=0 ;;
    -h|--help) awk 'NR>1 && /^#/ {sub(/^# ?/, ""); print; next} NR>1 {exit}' "$0"; exit 0 ;;
    -*) echo "motu: unknown option $arg" >&2; exit 2 ;;
    *) TARGET="$arg" ;;
  esac
done

# --- 1. locate the motu checkout -------------------------------------------------------------
# The script's own directory when run from a clone; $MOTU_REPO when piped into a shell.
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" 2>/dev/null && pwd) || SCRIPT_DIR=""
MOTU_ROOT=""
for candidate in "$SCRIPT_DIR" "${MOTU_REPO:-}" "$PWD"; do
  [ -n "$candidate" ] || continue
  if [ -f "$candidate/packages/cli/src/cli.mjs" ]; then MOTU_ROOT=$candidate; break; fi
done
if [ -z "$MOTU_ROOT" ]; then
  echo "motu: could not find a motu checkout (no packages/cli/src/cli.mjs)." >&2
  echo "      clone it first, then run ./install.sh from the clone — or set MOTU_REPO=/path/to/motu." >&2
  exit 1
fi

command -v node >/dev/null 2>&1 || { echo "motu: node is required but not on PATH." >&2; exit 1; }

# --- 2. link the CLI --------------------------------------------------------------------------
mkdir -p "$BIN_DIR"
chmod +x "$MOTU_ROOT/packages/cli/src/cli.mjs"
ln -sf "$MOTU_ROOT/packages/cli/src/cli.mjs" "$BIN_DIR/motu"
echo "✓ motu -> $BIN_DIR/motu"

# --- 3. put the bin dir on PATH, once ---------------------------------------------------------
if [ "$DO_PATH" -eq 1 ]; then
  shell_name=$(basename "${SHELL:-/bin/sh}")
  case "$shell_name" in
    zsh)  RC="${ZDOTDIR:-$HOME}/.zshrc"; LINE="export PATH=\"$BIN_DIR:\$PATH\"" ;;
    bash) RC="$HOME/.bashrc";            LINE="export PATH=\"$BIN_DIR:\$PATH\"" ;;
    fish) RC="${XDG_CONFIG_HOME:-$HOME/.config}/fish/config.fish"; LINE="set -gx PATH $BIN_DIR \$PATH" ;;
    *)    RC="$HOME/.profile";           LINE="export PATH=\"$BIN_DIR:\$PATH\"" ;;
  esac
  mkdir -p "$(dirname "$RC")"
  [ -f "$RC" ] || : > "$RC"
  if grep -Fq "$MARKER_BEGIN" "$RC"; then
    echo "= PATH block already in $RC"
  else
    { echo ""; echo "$MARKER_BEGIN"; echo "$LINE"; echo "$MARKER_END"; } >> "$RC"
    echo "✓ added $BIN_DIR to PATH in $RC"
  fi
  case ":$PATH:" in
    *":$BIN_DIR:"*) ;;
    *) echo "  (this shell hasn't picked it up yet — run: . $RC)" ;;
  esac
fi

# --- 4. install the skills into the target repo ------------------------------------------------
if [ "$DO_SKILLS" -eq 1 ]; then
  [ -n "$TARGET" ] || TARGET=$PWD
  echo ""
  node "$MOTU_ROOT/packages/cli/src/cli.mjs" skills install "$TARGET" || true
fi

echo ""
echo "Next: motu init .   then   motu island create <name>"
