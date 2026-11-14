# The demo app, and how to film it

**The README film is scripted:** [`film/`](film/README.md) records it (OBS, tmux, Playwright) and
edits it (Remotion). This page is the app it films.

Six screens over a real local Postgres. Everything below has been run; the numbers are what it
actually printed.

    My club        /me              who you are in the club, your events, your chapter      motu region `home`
    Directory      /                240 members, searched and filtered through the region   motu region `members`
    Chapters       /chapters        the eight chapters, and one page per chapter           PLAIN REACT, no motu
    Events         /events          the calendar, filters, one event in detail, and RSVP   motu region `events`
    Add a member   /add             the form and the card, one key between them             motu region `users`
    Profile        /member/<id>     one member and their availability                       motu region `profile`

All of them sit under one sidebar, the `shell` region, which outlives every page.

**The app looks like an existing one on purpose.** The chapter pages are ordinary React — effects,
`useState`, their own member table — the shape every adopting app already has a lot of, and the page
you would survey first. The regions beside them are what adoption turns that into.

**Who you are.** There is no login. The sidebar's *Switch* acts as one of four seed members (Dennis
Shaw, Guido Bartik, Rich Stroustrup, Karen Okonkwo — suspended) or as a guest, kept in the browser.
The menu says "demo, no password", and the RSVP policy in the database says the same in SQL.

**The first write.** RSVPs are the only thing the browser can write. The database refuses a full
event, a started one and a suspended member (a guard trigger), and the app shows the refusal's own
sentence. "Portfolio review night" is full in the seed — press RSVP on it to show the refusal.

**The profile region is untouched.** Its three `planned: true` calendar islands are still yours to
build on camera; nothing in this change reads or writes `selectedDay` / `selectedSlot`.

## Start it (two terminals, ~40 seconds)

```
cd demo-app
pnpm --filter @demo-app/app db:start     # supabase start
pnpm --filter @demo-app/app dev          # http://localhost:5300
```

**After pulling this change, reset once** — new migration, new seeds, and member ids that are now
fixed: `pnpm --filter @demo-app/app db:reset`. The seeds for chapters and events are GENERATED from
TypeScript (`pnpm --filter @demo-app/app seed:club`); a test fails if the committed SQL drifts.

`db:start` prints an `ANON_KEY`. It is already in `roots/app/.env.local`; if you ever reset the
stack and the key changes, copy the new one in. `.env.example` says the same thing.

**The ports are not Supabase's defaults.** Another local Supabase project (`peps_ta_boite_backend`)
already holds 54321–54323 on this machine, so this stack lives at:

    API / PostgREST   http://127.0.0.1:54421
    Postgres          postgresql://postgres:postgres@127.0.0.1:54422/postgres
    Studio            http://127.0.0.1:54523

Studio is worth a shot in the film: it shows the 240 rows as a table, which is the least arguable
way to prove the data is real.

## The lagoon, beside it

```
pnpm dev:lagoon                          # from the repo root
motu lagoon states                       # every state, as URLs
```

## Screens in the lagoon (experimental)

The panel lists the app's SCREENS (`▣`) above its regions: `AppFrame` — the app's own layout — with
the sidebar region and the page's region beside it, at `?screen=<id>`. Clicking a section in the
sidebar, a member row or "All events" moves between screens by their declared routes
(`src/screens/screens.ts`), so the lagoon clicks through like the app. Chapters shows "Not a motu
region (yet)" on purpose: that page is plain React. `motu check` prints a `screens` section and fails
on a navigation target no screen serves. Each region on a screen is still its own region, checked
alone — a screen only arranges them. See docs/08-lagoon.md, "Screens".

## What each command prints, so nothing surprises you on camera

| command | takes | says |
|---|---|---|
| `motu check` | ~8s | PASS · 23 island(s), 6 region(s), removable |
| `motu integrate check` | ~1s | PASS · 6 region(s) integrated · 0 warning(s) |
| `motu removal-check --force` | ~1–30s | PASS · 161 host file(s) scanned, 133 deleted, 8 unwrapped |
| `motu lagoon states` | instant | 91 island scenarios + 30 flows (43 steps, each a `&step=` stop) |
| `motu check --runtime` | ~220s | **never run this live** — run it before you record |

## The deliberate failure (scene 5)

Rehearse this; it must go red in one keystroke.

**Ownership.** In `src/archipelagos/users/users.archipelago.ts`, add to the `member-card` entry:

```ts
writes: { 'member-draft': 'draft' },
```

`motu check` then fails with `ownership` — two islands declaring they write `draft`. Undo it.

## What is NOT proved here, and do not claim it is

The lagoon answers the contract with recorded fixtures; the app answers it with Postgres. That is
the swap the film shows, and it is real. What it does **not** show is the two sides running the same
adapter: `supabase-port.ts` — the few lines turning a PostgREST answer into what the source expects
— runs only in the app. Nothing in motu checks it. It is short by construction for that reason, and
everything worth reasoning about lives in `members-source.ts`, over a port, where a test can reach it.

Say "same component, different answers". Do not say "the same code path runs in both".

## Where things live

    src/shared/members-source.ts        criteria -> a page, over a port. No motu, no vendor.
    src/shared/availability-source.ts   the profile calendar's half of the same idea
    roots/app/src/lib/supabase-port.ts  the adapter. The unproven inch.
    roots/app/src/lib/members-transport.ts   the contract's one seam
    src/shared/events-source.ts         the calendar, your RSVPs and the RSVP itself, over a port —
                                        installed by the page AND by the lagoon (`channelFrom`)
    src/shared/events-seed.ts           the events and who is going; generates supabase/seeds/events.sql
    src/shared/chapter-types.ts         the eight chapters; generates supabase/seeds/chapters.sql
    roots/app/src/lib/session.ts        who you are acting as (the sidebar's Switch)
    roots/app/src/motu/*-region.ts      the bindings. Every one imports the app's `useHostBridge`, and
                                        events/home also name the app's port for their source, so
                                        `removal-check` unwraps all six rather than deleting them —
                                        and the host still typechecks afterwards
    roots/app/src/pages/*.tsx           arrangement — except ChaptersPage/ChapterPage, plain React
    roots/lagoon/src/regions/club.ts    the events source over the seed, for BOTH lagoon entries
    supabase/migrations, supabase/seed.sql   the schema and the 240 members (fixed ids)
