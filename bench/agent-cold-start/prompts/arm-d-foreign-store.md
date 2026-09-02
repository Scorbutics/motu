# ARM D — a React frontend inside a server-rendered app, with a store motu does not own

You are adopting a UI framework called **motu** into an application you have never seen, and you are
being observed while you do it. The point of the exercise is to find out how motu behaves for a
stranger, so **the friction you hit is the result** — do not smooth it over, record it.

## What this arm is for

The three applications motu has been cold-started against so far were all standalone React apps whose
state motu could own. This one is neither:

- **The host is a Rails application.** The React frontend lives under `app/javascript/mastodon`, is
  built by Vite, and is mounted into server-rendered pages. motu's own documentation claims this
  works — *"your backend language is not the question; what renders your components is"* — and
  nothing has ever tested that claim.
- **The application already owns its state**, in Redux. motu's rules are explicit that a host with
  its own state architecture should NOT move it into motu's store: declare the region over the keys
  it already has, use `reads:` for what an island consumes without a prop, and reach for a
  `StoreAdapter` + `observeForeignStore` if you need the lens to see it. That road is the least
  proven in the framework. Finding out where it breaks IS the deliverable.

If either of those turns out not to work, that is a finding, not a failure of yours. Say so plainly.

## Your environment

- **Your repository:** `/home/scorbutics/dev/motu-bench/mastodon` — Mastodon. React 19, Vite, Redux,
  TypeScript, yarn 4 (`nodeLinker: node-modules`). Dependencies are installed; **do not run
  `yarn install`**.
- **Typecheck:** `yarn typecheck` from the repo root. Its baseline before you start is in
  `/tmp/base-mastodon-tsc.log` — treat only NEW errors as yours.
- **motu:** `motu` is on your PATH. Start with `motu --help`.
- **motu's documentation:** `/home/scorbutics/dev/motu/docs/` and `.../README.md`. Log a DOC DIVE each
  time you open one. `docs/12-hosts-and-adapters.md` and the foreign-store section of the host's motu
  rules are the two most relevant here.
- **motu's source** (`/home/scorbutics/dev/motu/packages/`) only as a last resort, logged as a SOURCE
  DIVE. **The checkout is read-only. Never edit it.**
- **Install the agent skills first:** `motu skills install /home/scorbutics/dev/motu-bench/mastodon`.
- **Your run directory:** `/home/scorbutics/dev/motu-bench/runs/arm-d-mobx/` — create it.

## The target screen

`app/javascript/mastodon/features/lists/members.tsx` (~318 lines) — the members of a list. It has,
deliberately, every awkward thing at once:

- a local `useState` for the search term, which the search header writes and the results read;
- Redux for everything else (`useAppDispatch`, actions in `mastodon/actions/*`, reducers in
  `mastodon/reducers/*`);
- `react-router` params, `react-intl` messages;
- SVG imported as a component (`…svg?react`, a Vite plugin);
- **two alias forms in one file** — `@/mastodon/…` and bare `mastodon/…`.

## What to do, in order

1. **Survey the page** with the `island-locate` skill. Decide explicitly which state stays in Redux
   and which (if any) becomes a region key — and write the reasoning down. Do not move the app's state
   into motu just because motu offers a store.
2. **Adopt motu** and get a lagoon that boots. Decide where motu's own directories go in a Rails
   repository, and record how you decided.
3. **Make the page a region** following your survey. It needs Redux, a router and i18n to render at
   all — find out where motu wants those and how clearly it tells you.
4. **Add ONE new island to that region** that owns a region key another island reads (the search term
   is the obvious candidate), while the rest keeps coming from Redux.
5. **Land it on the real page** and get `motu integrate check` green plus `yarn typecheck` with no new
   errors.
6. **Run the checks motu asks for**: `motu check`, then `motu check --runtime` for what you touched.

## Budget and stopping

**If you are stuck on one thing for more than ~15 tool calls, stop working on it**: write it in
FRICTION, write it in WHAT I COULD NOT DO, and move to the next numbered step. An accurate partial
result is the expected outcome and is worth more than a finish that glosses.

## Your journal

Follow `/home/scorbutics/dev/motu/bench/agent-cold-start/prompts/_journal-spec.md` exactly. Write to
`/home/scorbutics/dev/motu-bench/runs/arm-d-mobx/journal.md` **as you go**. Add:

```markdown
## FOREIGN STORE
- what stayed in Redux, what became a region key, and why
- did `reads:` / `StoreAdapter` / `observeForeignStore` work as documented? where did they not?
- anything motu assumed it owned the state

## SERVER-RENDERED HOST
- how you decided where motu's directories go in a Rails repo
- anything that assumed a standalone SPA
```

## Your final report to me

Short: which numbered steps you completed, the single worst piece of friction, whether the foreign
store or the Rails host caused anything, and one lagoon state URL (`motu lagoon states`).
