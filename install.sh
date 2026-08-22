#!/bin/sh
# motu — one-command installer.
#
#   ./install.sh                 # put `motu` on PATH, then install the skills into the CWD repo
#   ./install.sh ~/dev/ocean     # ...and install the skills into that repo instead
#   ./install.sh --no-skills     # CLI only
#   ./install.sh --no-path       # skills only (don't touch the shell rc)
#
# What it does:
#   1. installs the checkout's own dependencies if they are missing, then links
#      <motu>/packages/cli/src/cli.mjs into a bin dir (default ~/.local/bin) as `motu`
#      (and packages/host/src/cli.mjs as `motu-host`, the lagoon host),
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

# --- 1b. the checkout's OWN dependencies ------------------------------------------------------
# An adopting project installs nothing — motu resolves vite, tsx, ts-morph and playwright from HERE,
# which is what makes that promise possible. This checkout therefore needs them once, and the README
# used to say "one command" while never mentioning it: on a clean machine every command, `--help`
# included, died with ERR_MODULE_NOT_FOUND about two seconds after cloning. Do it here instead.
if [ ! -d "$MOTU_ROOT/node_modules/ts-morph" ]; then
  # THIS IS A PNPM WORKSPACE. `npm install` cannot resolve the `workspace:*` ranges the packages use,
  # so falling back to it looks like it might work and does not — measured on a clean container with
  # no pnpm, where the fallback failed silently and every command then hit the preflight. node ships
  # corepack, and package.json declares `packageManager`, so fetch the right pnpm rather than guess.
  if command -v pnpm >/dev/null 2>&1; then PM="pnpm install";
  elif command -v corepack >/dev/null 2>&1; then PM="corepack pnpm install";
  else PM=""; fi
  if [ -z "$PM" ]; then
    echo "motu: this is a pnpm workspace and neither pnpm nor corepack is available." >&2
    echo "      Install pnpm (https://pnpm.io/installation) or use node >= 16.9 (which ships corepack)," >&2
    echo "      then re-run ./install.sh." >&2
    exit 1
  fi
  echo "installing motu's own dependencies ($PM)…"
  ( cd "$MOTU_ROOT" && COREPACK_ENABLE_DOWNLOAD_PROMPT=0 $PM ) || {
    echo "motu: '$PM' failed in $MOTU_ROOT — install the dependencies there and re-run." >&2
    exit 1
  }
fi

# --- 2. link the CLI --------------------------------------------------------------------------
mkdir -p "$BIN_DIR"
chmod +x "$MOTU_ROOT/packages/cli/src/cli.mjs"
ln -sf "$MOTU_ROOT/packages/cli/src/cli.mjs" "$BIN_DIR/motu"
echo "✓ motu -> $BIN_DIR/motu"
# The lagoon host is its own binary on purpose: every `motu` subcommand resolves ONE project's
# motu.config.json at import time, and the host serves many repositories and belongs to none.
if [ -f "$MOTU_ROOT/packages/host/src/cli.mjs" ]; then
  chmod +x "$MOTU_ROOT/packages/host/src/cli.mjs"
  ln -sf "$MOTU_ROOT/packages/host/src/cli.mjs" "$BIN_DIR/motu-host"
  echo "✓ motu-host -> $BIN_DIR/motu-host"
fi

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
