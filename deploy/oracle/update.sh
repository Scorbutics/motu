#!/usr/bin/env bash
# Pull main, rebuild, restart. Run as root on the box after pushing host changes.
set -euo pipefail
APP=/opt/motu
sudo -u motu git -C "$APP" fetch --depth 1 origin main
sudo -u motu git -C "$APP" reset --hard origin/main
sudo -u motu env HOME=/home/motu PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
  bash -lc "cd $APP && COREPACK_ENABLE_DOWNLOAD_PROMPT=0 pnpm install --frozen-lockfile && node scripts/build-packages.mjs"
systemctl restart motu-host
systemctl --no-pager status motu-host | head -5
