#!/usr/bin/env bash
# Point this host's GoTrue at a GitHub OAuth App.
#
# The three human clicks are on GitHub's side and cannot be scripted; everything after them is this.
# It writes the credentials into .env.local (gitignored), flips MOTU_GITHUB_ENABLED, restarts the auth
# container, and CHECKS that GoTrue now advertises github — because "the container restarted" and
# "the provider works" are different claims and only the second one matters.
#
#   infra/link-github.sh --client-id Ov23li... --secret abc123...
#   infra/link-github.sh --off                     # back to refusing, cleanly
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
app="$(dirname "$here")"
env_file="$app/.env.local"

client_id=""; secret=""; off=false
while [ $# -gt 0 ]; do
  case "$1" in
    --client-id) client_id="${2:-}"; shift 2 ;;
    --secret)    secret="${2:-}"; shift 2 ;;
    --off)       off=true; shift ;;
    *) echo "unknown flag: $1" >&2; exit 1 ;;
  esac
done

[ -f "$env_file" ] || { echo "✗ no .env.local — cp .env.example .env.local first" >&2; exit 1; }

set_var () { # name value
  if grep -qE "^$1=" "$env_file"; then
    # `|` as the delimiter: a client secret can contain a slash.
    python3 - "$env_file" "$1" "$2" <<'PY'
import sys
path, name, value = sys.argv[1], sys.argv[2], sys.argv[3]
lines = open(path).read().split('\n')
out = [f'{name}={value}' if l.startswith(f'{name}=') else l for l in lines]
open(path, 'w').write('\n'.join(out))
PY
  else
    printf '%s=%s\n' "$1" "$2" >> "$env_file"
  fi
}

if $off; then
  set_var MOTU_GITHUB_ENABLED false
  set_var MOTU_GITHUB_CLIENT_ID ""
  set_var MOTU_GITHUB_SECRET ""
else
  [ -n "$client_id" ] && [ -n "$secret" ] || {
    echo "usage: infra/link-github.sh --client-id <id> --secret <secret>   (or --off)" >&2; exit 1; }
  set_var MOTU_GITHUB_ENABLED true
  set_var MOTU_GITHUB_CLIENT_ID "$client_id"
  set_var MOTU_GITHUB_SECRET "$secret"
fi

# The compose file reads these from the environment, so they have to be exported for `up`.
set -a; . "$env_file"; set +a
docker compose -f "$here/docker-compose.yml" up -d >/dev/null 2>&1

public="${MOTU_HOST_PUBLIC_URL:-http://127.0.0.1:8817}"
printf 'waiting for gotrue'
for _ in $(seq 1 20); do
  state=$(docker inspect -f '{{.State.Health.Status}}' motu_host_auth 2>/dev/null || echo none)
  [ "$state" = healthy ] && break
  printf '.'; sleep 2
done
echo

# THE CHECK THAT MATTERS. A restarted container proves nothing; this asks GoTrue what it thinks it
# offers, through the app's own gateway — the same path a browser takes.
answer=$(curl -s -m 15 "$public/auth/v1/settings" | python3 -c 'import json,sys; print(json.load(sys.stdin)["external"]["github"])' 2>/dev/null || echo error)
if $off; then
  [ "$answer" = "False" ] && echo "✓ github is off" || { echo "✗ expected github:false, got $answer" >&2; exit 1; }
else
  [ "$answer" = "True" ] && echo "✓ github is live — try $public/signin" || { echo "✗ gotrue still reports github:$answer" >&2; exit 1; }
fi
