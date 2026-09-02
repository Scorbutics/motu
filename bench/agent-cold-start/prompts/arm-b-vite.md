# ARM B — Vite host, CLI + docs + motu's agent skills

You are adopting a UI framework called **motu** into an application you have never seen, and you are
being observed while you do it. The point of the exercise is to find out how motu behaves for a
stranger, so **the friction you hit is the result** — do not smooth it over, record it.

## Your environment

- **Your repository:** `/home/scorbutics/dev/motu-bench/novu` — the Novu monorepo. The app you are
  working in is `apps/dashboard`: Vite + React + TypeScript + Tailwind, `@/*` → `./src/*`.
  Dependencies are already installed; do not re-run `pnpm install`.
- **motu:** `motu` is on your PATH. Start with `motu --help`.
- **motu's documentation:** `/home/scorbutics/dev/motu/docs/` and `/home/scorbutics/dev/motu/README.md`.
  Log a DOC DIVE every time you open one.
- **motu's source** (`/home/scorbutics/dev/motu/packages/`) only as a last resort, logged as a SOURCE
  DIVE. **The checkout is read-only. Never edit it.**
- **You DO have motu's agent skills in this arm.** Install them into your repo first:
  `motu skills install /home/scorbutics/dev/motu-bench/novu`. They land in `.claude/skills/` — read
  the relevant `SKILL.md` and follow it. The skills are the variable this arm is testing, so *use
  them where they apply* and say in your journal whether each one earned its place.
- **Your run directory:** `/home/scorbutics/dev/motu-bench/runs/arm-b-vite/` — create it.

## The target screen

`apps/dashboard/src/pages/api-keys.tsx` (~388 lines). A real admin page: a react-query data fetch
(`useFetchApiKeys`), two React contexts (`useEnvironment`, `useRegion`), a permission hook, a feature
flag, toasts, a confirmation modal, a regenerate dialog, and **two pieces of page-level `useState`**
(`isRegenerateDialogOpen`, `keyPendingDeletion`) that several parts of the screen share. That shared
state is the thing motu claims to be about — pay attention to whether motu's model fits it or fights
it.

## What to do, in order

1. **Survey the page first** with the `island-locate` skill: which regions become islands, which stay
   host, who owns each shared key. Write the survey down in your run directory.
2. **Adopt motu** into `apps/dashboard` and get a lagoon that boots. Record how many commands it took
   to the first state you can open in a browser.
3. **Make the page a region** following your survey, using `island-extract` for UI the app already
   owns. This page needs contexts and a data source to render at all — find out where motu wants
   those to go, and how clearly it tells you.
4. **Add ONE new island to that region** that owns a region key another island reads. Your survey
   decides which; if nothing obvious presents itself, make the delete-confirmation an island that
   owns `keyPendingDeletion`, read by the list island.
5. **Land it on the real page** and get `motu integrate check` green plus the app's own typecheck:
   `npx tsc -b` in `apps/dashboard` (pre-motu baseline: `/tmp/base-novu-tsc.log`; only NEW errors are
   yours).
6. **Run the checks motu asks for**: `motu check`, then `motu check --runtime` for the region you
   touched. Record what each cost and what it found.

## Budget and stopping

Work efficiently; this run is being paid for. If you are stuck on one thing for more than ~15 tool
calls, write it in FRICTION, mark it in WHAT I COULD NOT DO, and move to the next numbered step. Do
not silently abandon a step. Getting to step 4 with a good journal beats reaching step 6 by faking.

## Your journal

Follow `/home/scorbutics/dev/motu/bench/agent-cold-start/prompts/_journal-spec.md` exactly. Read it
first. Write to `/home/scorbutics/dev/motu-bench/runs/arm-b-vite/journal.md` as you go. Add one extra
section:

```markdown
## SKILLS
- <skill name> | did it apply? | did following it produce the right thing? | what it left me to guess
```

## Your final report to me

Short. Which numbered steps you completed, the single worst piece of friction, whether the skills
carried you or the CLI did, and the URL of one lagoon state I can open (`motu lagoon states`).
