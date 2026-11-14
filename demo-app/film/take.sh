#!/usr/bin/env bash
# Takes are branches, so nothing a take builds can reach main by accident.
#
#   take.sh new     film/hero → film/take-N (next free N), fresh demo database
#   take.sh keep    commit whatever the take left uncommitted ON the take branch, back to film/hero
#   take.sh reset   throw this take's work away: back to the branch point, worktrees removed
set -euo pipefail
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO"
BASE=film/hero
cur="$(git branch --show-current)"

case "${1:-}" in
  new)
    [ "$cur" = "$BASE" ] || { echo "start takes from $BASE (you are on $cur)"; exit 1; }
    git diff --quiet && git diff --cached --quiet || { echo "$BASE has uncommitted changes — commit them first"; exit 1; }
    n=1; while git rev-parse -q --verify "refs/heads/film/take-$n" >/dev/null; do n=$((n+1)); done
    git switch -c "film/take-$n"
    date +%s > "demo-app/film/takes/.take-$n.started"   # reset removes only worktrees made after this
    pnpm --filter @demo-app/app db:reset >/dev/null && echo "demo database reset"
    echo "on film/take-$n — now: pnpm up (from demo-app/film)"
    ;;
  keep)
    [[ "$cur" == film/take-* ]] || { echo "not on a take branch"; exit 1; }
    git add -A -- . ':!demo-app/film/takes' ':!.claude/worktrees'
    git diff --cached --quiet || git commit -q -m "film: $cur — the calendar as built on camera"
    git switch "$BASE"
    echo "kept $cur. The recording stays in demo-app/film/takes/${cur#film/}/ (not committed)."
    ;;
  reset)
    [[ "$cur" == film/take-* ]] || { echo "not on a take branch"; exit 1; }
    base_sha="$(git merge-base "$BASE" HEAD)"
    started="$(cat "demo-app/film/takes/.${cur#film/}.started" 2>/dev/null || echo 9999999999)"
    for wt in $(git worktree list --porcelain | awk '/^worktree /{print $2}' | grep '/.claude/worktrees/' || true); do
      created="$(stat -c %W "$wt" 2>/dev/null || echo 0)"
      if [ "$created" -ge "$started" ]; then git worktree remove --force "$wt" && echo "removed worktree $wt"; fi
    done
    git reset -q --hard "$base_sha"
    git clean -qfd -- demo-app ':!demo-app/film/takes'
    pnpm --filter @demo-app/app db:reset >/dev/null && echo "demo database reset"
    echo "$cur is back at its branch point"
    ;;
  *) echo "usage: take.sh new|keep|reset"; exit 1 ;;
esac
