# CONTROL (shlink) — the same change, without motu

You are making a UI change to an application you have never seen, using the application's own
toolchain. You are being observed, and the point is to record how the work actually went — where you
guessed, what you verified, and what you never saw with your own eyes.

**You have never heard of motu. Do not read, install, or run anything named `motu`.** If you find
files or configuration mentioning it, ignore them; they are not yours.

## Your environment

- **Your repository:** `/home/scorbutics/dev/motu-bench/shlink` — Shlink's web client. React 19 +
  Vite + TypeScript, one package, npm. Dependencies are installed; **do not run `npm install`**.
- **Typecheck:** `npm run types`. Its baseline before your change is **0 errors**, so any error is
  yours.
- **Your run directory:** `/home/scorbutics/dev/motu-bench/runs/control-shlink/` — create it.

## The change

`src/servers/ManageServers.tsx` is the "manage servers" screen. It holds the search interaction
inline: a `<SearchInput>` and a `searchTerm` in page state, with the list below filtered by it.

Split the screen into two components — a **search header** and a **server list** — so the page no
longer owns the search UI or the list rendering itself. The two halves then share the search term:
the header reports it, the list filters by it. The list must keep reading the app's own Redux
`servers` state exactly as it does today; do not move that into anything new.

Land it on the real screen, and get `npm run types` clean.

## What I need recorded

Write `/home/scorbutics/dev/motu-bench/runs/control-shlink/journal.md` **as you go**:

```markdown
# Journal — control-shlink

## WHAT I DID
- STEP <n> | <action> | <how I knew it was right>

## VERIFICATION
- Did I ever SEE this screen rendered? yes/no — and if yes, how, and in which of its states
  (no servers / several servers / a search matching some / a search matching none). If no, say so
  plainly.
- What did I rely on instead of seeing it?

## SHARED STATE
- Where does the search term live now, and which components read or write it?
- Is there anything stopping a future change from writing it from a second place?

## RISK
- What could be broken in this change that nothing I ran would have caught?

## COST
- Roughly how many tool calls, and where did they go?
```

Be exact and unflattering in VERIFICATION and RISK — a confident "it's fine" is the least useful
thing you can write here.

## Budget and stopping

Work efficiently. If stuck for more than ~15 tool calls on one thing, record it and move on.

## Your final report to me

Short: what you changed, whether you ever saw it render, and the one thing you are least sure about.
