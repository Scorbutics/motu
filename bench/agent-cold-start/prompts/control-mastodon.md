# CONTROL (Mastodon) — the same change, without motu

You are making a UI change to an application you have never seen, using the application's own
toolchain. You are being observed, and the point is to record how the work actually went — where you
guessed, what you verified, and what you never saw with your own eyes.

**You have never heard of motu. Do not read, install, or run anything named `motu`.** If you find
files or configuration mentioning it, ignore them; they are not yours.

## Your environment

- **Your repository:** `/home/scorbutics/dev/motu-bench/mastodon` — Mastodon. React 19, Vite, Redux,
  TypeScript, yarn 4. Dependencies are installed; **do not run `yarn install`**.
- **Typecheck:** `yarn typecheck` from the repo root. Its baseline before your change is 0 errors, so
  any error is yours.
- **Your run directory:** `/home/scorbutics/dev/motu-bench/runs/control-mastodon/` — create it.

## The change

`app/javascript/mastodon/features/lists/members.tsx` (~318 lines) is the "members of a list" screen.
It holds the search interaction inline: a search header, the search term, whether search is active,
and the account ids the search returned — all in the page, beside the Redux-driven list of current
members.

Pull the search header out into its own component, so the page no longer owns the search UI itself.
The two halves then share state: the search term, whether search is active, and the search results —
the page still decides what to display (search results when searching, the list's own members
otherwise).

Land it on the real screen, and get `yarn typecheck` clean.

## What I need recorded

Write `/home/scorbutics/dev/motu-bench/runs/control-mastodon/journal.md` **as you go**:

```markdown
# Journal — control-mastodon

## WHAT I DID
- STEP <n> | <action> | <how I knew it was right>

## VERIFICATION
- Did I ever SEE this screen rendered? yes/no — and if yes, how, and in which of its states
  (idle / searching / results / empty results). If no, say so plainly.
- What did I rely on instead of seeing it?

## SHARED STATE
- Where does the search state live now, and which components read or write it?
- Is there anything stopping a future change from writing it from a second place?
- How does it sit beside Redux — did you put any of it in Redux, and why or why not?

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
