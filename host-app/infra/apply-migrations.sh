#!/usr/bin/env bash
# Re-apply every migration to a database that already exists.
#
# NOT A MIGRATION RUNNER, and deliberately not one yet: it applies all files in order, every time, and
# every file is written to be idempotent. At this size a ledger of which migrations have run is a
# second source of truth about the schema, and the failure it prevents (running one twice) is one
# `if not exists` already prevents.
#
# It exists because `docker-entrypoint-initdb.d` only fires on the FIRST boot of an empty volume — so
# a schema change on a database that already holds data would otherwise need the volume dropped. It is
# also what applies 0002, which cannot run at initdb time at all: see its header.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
container="${MOTU_HOST_DB_CONTAINER:-motu_host_db}"
db="${MOTU_HOST_DB_NAME:-motu_host}"

if ! docker ps --format '{{.Names}}' | grep -qx "$container"; then
  echo "✗ $container is not running — docker compose -f $here/docker-compose.yml up -d" >&2
  exit 1
fi

# AS supabase_admin, not postgres. This image's bootstrap superuser is `supabase_admin`; `postgres`
# is a role 0001 creates for GoTrue's benefit, so connecting as it would fail on a database where
# 0001 has not run — which is exactly the database this script is for.
for f in "$here"/migrations/*.sql; do
  echo "→ $(basename "$f")"
  docker exec -i -e PGPASSWORD="${POSTGRES_PASSWORD:-postgres}" "$container" psql -v ON_ERROR_STOP=1 -U supabase_admin -d "$db" < "$f" > /dev/null
done
echo "✓ schema applied to $db"
