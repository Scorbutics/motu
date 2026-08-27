#!/usr/bin/env bash
# Did signing in actually do what it claims? — the whole chain, checked from the outside.
#
# Every step of a GitHub sign-in is invisible: the session is a cookie, the provider token is spent
# and dropped inside one request, and `authorize` only shows itself by REFUSING. So a sign-in that
# half-worked looks exactly like one that worked. This asks the database what happened.
#
#   infra/verify-signin.sh                    # what the sign-in left behind
#   infra/verify-signin.sh --private <repo>   # ...then prove the gate opens for you and not a stranger
#   infra/verify-signin.sh --restore <repo>   # put it back to public
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
psql () { docker exec -i -e PGPASSWORD=postgres motu_host_db psql -U supabase_admin -d motu_host -tA "$@"; }
pub="$(grep -E '^MOTU_HOST_PUBLIC_URL=' "$(dirname "$here")/.env.local" | cut -d= -f2-)"

case "${1:-}" in
  --private|--restore)
    repo="${2:?usage: $0 --private <owner/name>}"
    vis=$([ "$1" = --private ] && echo private || echo public)
    # The row may not exist yet — a repo the database has never heard of is ABSTAIN, answered by the
    # host, which is not the state this test wants to be in.
    psql -c "insert into orgs (slug,name) values ('motu','motu') on conflict (slug) do nothing" >/dev/null
    psql -c "insert into projects (org_id,repo,visibility) select id,'$repo','$vis' from orgs where slug='motu'
             on conflict (org_id,repo) do update set visibility=excluded.visibility" >/dev/null
    echo "· $repo is now $vis"
    code=$(curl -s -m 40 -o /dev/null -w '%{http_code}' "$pub/$repo/latest/all")
    echo "  a stranger (no cookie) gets: $code   $([ "$vis" = private ] && echo '(404 is correct — and it is byte-identical to a genuine miss)' || echo '(200 expected)')"
    [ "$1" = --private ] && echo "  now open $pub/$repo/latest/all in the browser you signed in with."
    exit 0 ;;
esac

echo "=== who has signed in ==="
psql -c "select coalesce(github_login,'<no github_login>')||'  ('||id||')' from profiles order by created_at" \
  | sed 's/^/  /' | grep . || echo "  (nobody yet — the profile trigger fires on the first sign-in)"

echo "=== what GitHub said they can read ==="
n=$(psql -c "select count(*) from repo_access")
echo "  $n repository answer(s) cached"
[ "$n" = 0 ] || psql -c "select '  '||repo||'  can_read='||can_read||'  age='||age(now(),checked_at) from repo_access order by repo limit 12"

echo "=== the gate's own view ==="
psql -c "select '  '||repo||' -> '||visibility from projects order by repo" | sed 's/^/  /'
