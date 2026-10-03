#!/usr/bin/env bash
# Provision a lagoon host on a fresh Oracle Cloud Ampere A1 running Ubuntu 24.04.
#
# Idempotent: safe to re-run. Run it as root on the box.
#
#   sudo ./provision.sh lagoon.example.com [git-url]
#
# SEVERAL NAMES, comma-separated, is how you move to a real domain without downtime.
# Caddy serves all of them and gets a certificate for each, so the old name keeps
# working while DNS for the new one propagates. Drop the old one on a later run.
#
#   sudo ./provision.sh lagoon.example.com,me.duckdns.org
#
# The FIRST name is the canonical one: it is what gets printed and what belongs in
# ~/.config/motu/host.json.
#
# Optional, and note it goes AFTER sudo — sudo strips the environment, so exporting it
# in your own shell reaches nothing. A *.duckdns.org name among the list then gets a
# systemd timer that keeps its record pointed here, so rebuilding the box needs no
# DNS edit for that name.
#
#   sudo DUCKDNS_TOKEN=xxxxxxxx ./provision.sh me.duckdns.org
#
# What it leaves behind:
#   /opt/motu              the checkout, owned by the `motu` user
#   /var/lib/motu-host     the store — publish records, baselines, access policy
#   /etc/motu-host.env     the upload token (0600)
#   motu-host.service      the host, on 127.0.0.1:8818
#   caddy.service          TLS termination, ACME, no buffering
set -euo pipefail

DOMAINS_RAW="${1:-}"
REPO="${2:-https://github.com/Scorbutics/motu.git}"

# Comma- or space-separated. DOMAIN stays the canonical (first) name so every later
# reference — the printed URL, host.json, the health check — keeps meaning one thing.
IFS=', ' read -r -a DOMAINS <<< "$DOMAINS_RAW"
DOMAIN="${DOMAINS[0]:-}"
STORE=/var/lib/motu-host
APP=/opt/motu
ENVFILE=/etc/motu-host.env

[ -n "$DOMAIN" ] || { echo "usage: $0 <domain>[,<domain>...] [git-url]" >&2; exit 2; }

# A name that does not resolve here cannot get a certificate, and Caddy's failure for
# that arrives minutes later in a log nobody is reading. Say it now instead.
for d in "${DOMAINS[@]}"; do
  resolved="$(getent ahostsv4 "$d" 2>/dev/null | awk 'NR==1{print $1}')" || true
  if [ -z "$resolved" ]; then
    echo "WARNING: $d does not resolve. Caddy will retry ACME but cannot succeed until it does." >&2
  fi
done
[ "$(id -u)" = 0 ] || { echo "run as root" >&2; exit 2; }

say() { printf '\n\033[1m== %s\033[0m\n' "$*"; }

say "packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl ca-certificates gnupg git debian-keyring debian-archive-keyring apt-transport-https iptables-persistent

# ---------------------------------------------------------------- node 22
# Ubuntu 24.04 ships node 18.19; motu needs >= 20.11.
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  say "node 22 (NodeSource)"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y -qq nodejs
fi
corepack enable
# NON-INTERACTIVE, or the first run stops on "Corepack is about to download ... [Y/n]"
# and waits forever behind whatever ran it.
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
corepack prepare pnpm@10.15.0 --activate

# ---------------------------------------------------------------- caddy
if ! command -v caddy >/dev/null; then
  say "caddy"
  curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/gpg.key \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt \
    | tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  apt-get update -qq
  apt-get install -y -qq caddy
fi

# ---------------------------------------------------------------- user + code
# ---------------------------------------------------------------- swap
# THE AMD MICRO SHAPE IS THE LIKELY FALLBACK when A1 has no capacity in your home
# region, and Always Free cannot cross regions to find some. The host runs fine in
# 1 GB; `tsc` across the workspace does not, and an OOM here looks like an install
# that "just stopped". 2 GB of swap costs nothing on a 50 GB volume.
if [ "$(free -m | awk '/^Mem:/{print $2}')" -lt 2000 ] && [ ! -f /swapfile ]; then
  say "swap (small instance)"
  fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

say "checkout"
id -u motu >/dev/null 2>&1 || useradd --system --create-home --home-dir /home/motu --shell /usr/sbin/nologin motu
install -d -o motu -g motu "$STORE" "$APP"
if [ -d "$APP/.git" ]; then
  sudo -u motu git -C "$APP" fetch --depth 1 origin main
  sudo -u motu git -C "$APP" reset --hard origin/main
else
  sudo -u motu git clone --depth 1 "$REPO" "$APP"
fi

say "install + build"
# @motu/host reads @motu/coverage from its dist, so the workspace has to be built once.
# The build script compiles every package, so the install cannot be filtered down to the
# host's own dependency closure. It CAN skip the browsers: playwright is a dependency of
# @motu/cli, which never runs here — the CLI drives a browser on your machine and uploads
# only the result. Downloading Chromium onto this box buys nothing and costs ~400 MB.
sudo -u motu env HOME=/home/motu PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
  bash -lc "cd $APP && COREPACK_ENABLE_DOWNLOAD_PROMPT=0 pnpm install --frozen-lockfile && node scripts/build-packages.mjs"

# ---------------------------------------------------------------- token
if [ ! -f "$ENVFILE" ]; then
  say "upload token"
  umask 077
  printf 'MOTU_HOST_TOKEN=%s\nMOTU_HOST_DIR=%s\n' "$(openssl rand -hex 24)" "$STORE" > "$ENVFILE"
  chmod 600 "$ENVFILE"
fi

# ---------------------------------------------------------------- service
say "systemd"
cat > /etc/systemd/system/motu-host.service <<UNIT
[Unit]
Description=motu lagoon host
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=motu
Group=motu
WorkingDirectory=$APP
EnvironmentFile=$ENVFILE
# Loopback only: caddy terminates TLS in front. MOTU_LIVE_ALLOW stays UNSET on
# purpose — with --live-push the host never fetches a URL it was told, so there
# is no request-forgery surface to allow.
ExecStart=/usr/bin/node $APP/packages/host/src/cli.mjs --port 8818 --dir $STORE --max-bytes 1073741824
Restart=always
RestartSec=2

# The store is the only thing it writes.
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=strict
ProtectHome=yes
ReadWritePaths=$STORE
ProtectKernelTunables=yes
ProtectControlGroups=yes
RestrictAddressFamilies=AF_INET AF_INET6
MemoryMax=1G

[Install]
WantedBy=multi-user.target
UNIT

cat > /etc/caddy/Caddyfile <<CADDY
# One line, because that is all this needs: caddy does not buffer responses and
# has no read timeout to trip, which is what the __motu_reload SSE stream needs.
# (The nginx equivalent needs proxy_buffering off AND a long proxy_read_timeout,
# and getting either wrong gives you a live lagoon that stops reloading silently.)
$(printf '%s, ' "${DOMAINS[@]}" | sed 's/, $//') {
	encode zstd gzip
	reverse_proxy 127.0.0.1:8818
}
CADDY

systemctl daemon-reload
systemctl enable --now motu-host
systemctl restart motu-host
systemctl enable --now caddy
systemctl reload caddy || systemctl restart caddy

# ---------------------------------------------------------------- duckdns
# AN OCI EPHEMERAL IP LASTS AS LONG AS THE INSTANCE — it survives reboot and
# stop/start, and dies only with a terminate. So this is not a treadmill, it is
# insurance: rebuild the box and DNS repairs itself within five minutes instead of
# you remembering that Caddy cannot get a certificate because the name still points
# at a machine that no longer exists.
#
# WHICH MATTERS MORE ONCE YOU MOVE TO A DOMAIN YOU OWN, not less. The one path to a
# terminate you did not ask for is Oracle's Always Free IDLE RECLAMATION, and a
# lagoon host is idle by their definition almost all the time — it serves a page when
# someone opens it and does nothing in between. Nothing here prevents that; what it
# decides is whether a rebuild costs five minutes or a DNS edit you have to remember.
#
# So on a custom domain, pick one deliberately:
#   RESERVE THE IP (free, two minutes, OCI console) and point an A record at it. A
#     reserved IP can be re-attached to the replacement instance, so the name keeps
#     working and duckdns stops being needed at all. This is the one to pick.
#   OR CNAME the pretty name at the duckdns one and keep this timer. Zero effort,
#     keeps the self-repair, costs a lookup and a dependency on duckdns staying up.
# What you should NOT do is drop duckdns for a hand-written A record on an EPHEMERAL
# IP: that removes the insurance and adds nothing.
#
# The `ip=` parameter is left EMPTY on purpose: duckdns then uses the source address
# of the request, so the box never has to discover its own public IP.
duck=""
for d in "${DOMAINS[@]}"; do [[ "$d" == *.duckdns.org ]] && duck="$d"; done
if [ -n "${DUCKDNS_TOKEN:-}" ] && [ -n "$duck" ]; then
  say "duckdns updater"
  sub="${duck%.duckdns.org}"
  umask 077
  printf 'DUCKDNS_SUB=%s\nDUCKDNS_TOKEN=%s\n' "$sub" "$DUCKDNS_TOKEN" > /etc/duckdns.env
  chmod 600 /etc/duckdns.env
  cat > /etc/systemd/system/duckdns.service <<'DUCKSVC'
[Unit]
Description=Refresh the duckdns record for this host
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
EnvironmentFile=/etc/duckdns.env
ExecStart=/usr/bin/curl -fsS --retry 3 -o /dev/null "https://www.duckdns.org/update?domains=${DUCKDNS_SUB}&token=${DUCKDNS_TOKEN}&ip="
DUCKSVC
  cat > /etc/systemd/system/duckdns.timer <<'DUCKTIMER'
[Unit]
Description=Refresh the duckdns record every 5 minutes

[Timer]
OnBootSec=1min
OnUnitActiveSec=5min

[Install]
WantedBy=timers.target
DUCKTIMER
  systemctl daemon-reload
  systemctl enable --now duckdns.timer
  systemctl start duckdns.service
fi

# ---------------------------------------------------------------- firewall
# ORACLE BLOCKS PORTS IN TWO PLACES and this is only the second one. Their Ubuntu
# image ships an iptables INPUT chain ending in REJECT, so inserting at the top is
# what gets past it — and it is NOT saved across reboots without netfilter-persistent.
# The other place is the VCN security list, in the web console. See README.md.
say "firewall"
for port in 80 443; do
  iptables -C INPUT -p tcp --dport "$port" -j ACCEPT 2>/dev/null || iptables -I INPUT -p tcp --dport "$port" -j ACCEPT
  ip6tables -C INPUT -p tcp --dport "$port" -j ACCEPT 2>/dev/null || ip6tables -I INPUT -p tcp --dport "$port" -j ACCEPT
done
netfilter-persistent save >/dev/null

say "done"
echo
echo "  host:   https://$DOMAIN"
if [ "${#DOMAINS[@]}" -gt 1 ]; then
  echo "  also:   $(for d in "${DOMAINS[@]:1}"; do printf 'https://%s ' "$d"; done)"
  echo "          (certificates are issued per name; drop the old one from a later run)"
fi
echo "  token:  $(grep MOTU_HOST_TOKEN "$ENVFILE" | cut -d= -f2)"
echo
echo "  On your laptop, write ~/.config/motu/host.json:"
echo "    { \"url\": \"https://$DOMAIN\", \"token\": \"<the token above>\" }"
echo
echo "  Then check it answers:   curl -sS https://$DOMAIN/api/live"
