# ARM C — a single-package React app on npm

You are adopting a UI framework called **motu** into an application you have never seen, and you are
being observed while you do it. The point of the exercise is to find out how motu behaves for a
stranger, so **the friction you hit is the result** — do not smooth it over, record it.

## What this arm is for

The two applications motu has been cold-started against so far were both **pnpm monorepos**. This one
is neither: it is a **single-package application installed with npm**. Those are the two variables
under test, and they are not incidental — motu resolves its own packages by creating symlinks in
`node_modules/@motu/*`, and `npm install` is documented to delete them as extraneous. If something
goes wrong in that area, that IS the finding.

## Your environment

- **Your repository:** `/home/scorbutics/dev/motu-bench/shlink` — Shlink's web client. React 19 +
  Vite + TypeScript, one package, no workspaces, `npm`. Dependencies are already installed; **do not
  run `npm install`** (it would delete motu's symlinks, which is the hazard, not the test).
- **Typecheck:** `npm run types` from the repo root. Its baseline before you start is
  `/tmp/base-shlink-tsc.log` — **0 errors**, so any error is yours.
- **motu:** `motu` is on your PATH. Start with `motu --help`.
- **motu's documentation:** `/home/scorbutics/dev/motu/docs/` and `/home/scorbutics/dev/motu/README.md`.
  Log a DOC DIVE every time you open one.
- **motu's source** (`/home/scorbutics/dev/motu/packages/`) only as a last resort, logged as a SOURCE
  DIVE. **The checkout is read-only. Never edit it.**
- **Install motu's agent skills into your repo first:**
  `motu skills install /home/scorbutics/dev/motu-bench/shlink`. Read the relevant `.claude/skills/*/SKILL.md`
  and follow it where it applies.
- **Your run directory:** `/home/scorbutics/dev/motu-bench/runs/arm-c-npm/` — create it.

## The target screen

`src/servers/ManageServers.tsx` — the server list. It is small on purpose; the interesting parts are
what surrounds it:

- a page-level `useState('')` for `searchTerm`, which the search input writes and the list reads —
  the shared-state case motu exists to declare;
- `withDependencies(...)` from `src/container/context` — a DI container the components need to render
  at all;
- `useServers()` — a Redux store the app already owns;
- react-router links, and a UI kit from an external package (`@shlinkio/shlink-frontend-kit`).

## What to do, in order

1. **Survey the page** with the `island-locate` skill: which regions become islands, which stay host,
   who owns each shared key. Write the survey into your run directory.
2. **Adopt motu** and get a lagoon that boots. Record how many commands it took to the first state you
   can open in a browser. Pay attention to anything involving `node_modules/@motu` — see above.
3. **Make the page a region** following your survey. It needs a DI container and a Redux store to
   render — find out where motu wants those, and how clearly it tells you.
4. **Add ONE new island to that region** that owns a region key another island reads. `searchTerm` is
   the obvious candidate: a search island that owns it, and a list island that reads it.
5. **Land it on the real page** and get `motu integrate check` green plus `npm run types` clean
   against the 0-error baseline.
6. **Run the checks motu asks for**: `motu check`, then `motu check --runtime` for the region you
   touched. Record what each cost and what it found.

## Budget and stopping

Work efficiently; this run is being paid for. **If you are stuck on one thing for more than ~15 tool
calls, stop working on it**: write it in FRICTION, write it in WHAT I COULD NOT DO, and move to the
next numbered step. Do not keep trying to unblock the same thing — an accurate partial result is the
expected outcome and is worth more than a finish that glosses.

## Your journal

Follow `/home/scorbutics/dev/motu/bench/agent-cold-start/prompts/_journal-spec.md` exactly. Read it
first. Write to `/home/scorbutics/dev/motu-bench/runs/arm-c-npm/journal.md` **as you go** — not at the
end. Add one extra section:

```markdown
## NPM / SINGLE-PACKAGE
- anything that behaved differently from what the docs describe for a workspace project
- anything involving node_modules/@motu/*
- "nothing unusual" is a valid and useful answer
```

## Your final report to me

Short. Which numbered steps you completed, the single worst piece of friction, whether npm or the
single-package layout caused anything, and the URL of one lagoon state I can open (`motu lagoon states`).
