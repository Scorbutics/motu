# The demo app, and how to film it

Three pages over a real local Postgres, built out of the same islands the lagoon previews.
Everything below has been run; the numbers are what it actually printed.

    Directory      240 members, searched and filtered through the region
    Add a member   the form and the card, one key between them
    Org lookup     a company from Postgres, then its structure

## Start it (two terminals, ~40 seconds)

```
cd demo-app
pnpm --filter @demo-app/app db:start     # supabase start
pnpm --filter @demo-app/app dev          # http://localhost:5300
```

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

## What each command prints, so nothing surprises you on camera

| command | takes | says |
|---|---|---|
| `motu check` | ~2s | PASS · 13 island(s), 3 region(s), removable |
| `motu integrate check` | ~2s | PASS · 3 region(s) integrated · 0 warning(s) |
| `motu removal-check --force` | ~30s | PASS · 66 host file(s) scanned, 57 deleted, 3 unwrapped |
| `motu lagoon states` | instant | 15 island scenarios + 13 flow step-stops = 28 addresses |
| `motu check --runtime` | ~100s | **never run this live** — run it before you record |

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
    src/shared/companies-source.ts      the lookup's half of the same idea
    roots/app/src/lib/supabase-port.ts  the adapter. The unproven inch.
    roots/app/src/lib/members-transport.ts   the contract's one seam
    roots/app/src/motu/*-region.ts      the bindings — motu imports only, so they delete cleanly
    roots/app/src/pages/*.tsx           arrangement, and nothing else
    supabase/migrations, supabase/seed.sql   the schema and the 240 members
