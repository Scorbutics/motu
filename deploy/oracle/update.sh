#!/usr/bin/env bash
# Pull main, rebuild, restart. Run as root on the box after pushing host changes.
set -euo pipefail
APP=/opt/motu

# RUN FROM A COPY. This script lives inside the checkout it is about to `git reset --hard`, and bash
# reads a script incrementally rather than loading it whole — so when the pull rewrites these very
# lines, the shell resumes at a byte offset into different content and executes whatever is there.
# Silent, occasional, and impossible to read from the error it eventually produces.
if [ "${MOTU_UPDATE_DETACHED:-}" != "1" ]; then
  copy="$(mktemp /tmp/motu-update.XXXXXX.sh)"
  cat "$0" > "$copy"
  chmod +x "$copy"
  trap 'rm -f "$copy"' EXIT
  MOTU_UPDATE_DETACHED=1 bash "$copy" "$@"
  exit $?
fi
sudo -u motu git -C "$APP" fetch --depth 1 origin main
sudo -u motu git -C "$APP" reset --hard origin/main
sudo -u motu env HOME=/home/motu PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
  bash -lc "cd $APP && COREPACK_ENABLE_DOWNLOAD_PROMPT=0 pnpm install --frozen-lockfile && node scripts/build-packages.mjs"
systemctl restart motu-host
systemctl --no-pager status motu-host | head -5
