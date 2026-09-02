# ARM A — Next.js host, CLI + docs only (no motu agent skills)

You are adopting a UI framework called **motu** into an application you have never seen, and you are
being observed while you do it. The point of the exercise is to find out how motu behaves for a
stranger, so **the friction you hit is the result** — do not smooth it over, record it.

## Your environment

- **Your repository:** `/home/scorbutics/dev/motu-bench/formbricks` — the Formbricks monorepo. The
  Next.js app is `apps/web`. Dependencies are already installed; do not re-run `pnpm install`.
- **motu:** `motu` is on your PATH. Start with `motu --help`.
- **motu's documentation:** `/home/scorbutics/dev/motu/docs/` and `/home/scorbutics/dev/motu/README.md`.
  You may read them — but every time you do, log a DOC DIVE, because a stranger evaluating this
  framework will judge it largely by how far they get without them.
- **motu's source** (`/home/scorbutics/dev/motu/packages/`) you may read only as a last resort, and
  every read is a SOURCE DIVE in your journal. **The checkout is read-only. Never edit it.**
- **You do NOT have motu's agent skills** (`/island-locate`, `/island-extract`, …) in this arm. Work
  from the CLI and the docs.
- **Your run directory:** `/home/scorbutics/dev/motu-bench/runs/arm-a-next/` — create it. Your
  journal goes there.

## The target screen

`apps/web/app/(auth)/auth/login/page.tsx` → `apps/web/modules/auth/login/page.tsx`, which renders
`FormWrapper` around `LoginForm` (`modules/auth/login/components/login-form.tsx`, ~369 lines, 15
props). It is the sign-in screen: a form, a pending state, a server-side failure, OAuth/SSO buttons,
an "email just verified" notice, a prefilled email, and a success whose consequence is a navigation.
It renders without a database.

## What to do, in order

1. **Adopt motu** into `apps/web` and get a lagoon that boots. Stop at the first state you can open
   in a browser and record how many commands it took.
2. **Make the login screen a region.** `LoginForm` becomes an island; `FormWrapper` is the region's
   root/layout. Give it evidence — at least the states above that differ from one another.
   Look at it in the lagoon.
3. **Add ONE new island to that region**, and make it a real coupling rather than a decoration: lift
   the OAuth / SSO provider buttons out of `LoginForm` into their own island that **owns** a region
   key (a pending/selected provider), which the form island **reads** and shows a pending state for.
   One producer per key — motu should enforce that; find out whether it does.
4. **Land it on the real page** — `modules/auth/login/page.tsx` composes the region — and get both
   `motu integrate check` and the app's own typecheck green:
   `pnpm --filter @formbricks/web run typecheck` (its pre-motu baseline is in
   `/tmp/base-fb-tsc.log`; only NEW errors are yours).
5. **Run the checks motu asks for**: `motu check`, then `motu check --runtime` for the region you
   touched. Record what each cost and what it found.

## Budget and stopping

Work efficiently; this run is being paid for. If you are stuck on one thing for more than ~15 tool
calls, write it in FRICTION, mark it in WHAT I COULD NOT DO, and move to the next numbered step. Do
not silently abandon a step. Getting to step 3 with a good journal is a better result than getting to
step 5 by faking.

## Your journal

Follow `/home/scorbutics/dev/motu/bench/agent-cold-start/prompts/_journal-spec.md` exactly. Read it
first. Write to `/home/scorbutics/dev/motu-bench/runs/arm-a-next/journal.md` as you go.

## Your final report to me

Short. The journal carries the detail. Give me: which numbered steps you completed, the single worst
piece of friction, the single place motu concretely earned its keep (or "none"), and the URL of one
lagoon state I can open (`motu lagoon states`).
