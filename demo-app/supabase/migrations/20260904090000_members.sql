-- The members directory, as the islands actually read it.
--
-- COLUMN NAMES ARE NOT A DESIGN CHOICE HERE. `member-results` probes `firstname`, `surname`,
-- `email`, `plan` and `updated`; `member-filter-chips` filters on `email`, `firstname`, `surname`,
-- `status` and `plan`. Those names came from the islands, which took them from the search schema
-- the host already understood — so the table matches the vocabulary the UI already speaks rather
-- than the other way round.
--
-- The rest of the columns exist for the member CARD: a chapter, a membership number, a joined date
-- and an optional photo. They are the fields the card was designed against.

create table if not exists public.members (
  id          uuid primary key default gen_random_uuid(),
  firstname   text        not null,
  surname     text        not null,
  email       text        not null unique,
  -- Membership state and plan, spelled as the chips expect ("active"/"suspended",
  -- "premium"/"standard"). Constrained, so a typo is a write error and never a chip that filters
  -- to nothing for reasons nobody can see.
  status      text        not null default 'active'  check (status in ('active', 'suspended')),
  plan        text        not null default 'standard' check (plan in ('premium', 'standard')),
  chapter     text,
  member_no   text        not null unique,
  joined      date        not null default current_date,
  photo       text,
  updated     timestamptz not null default now()
);

-- The list is sorted by surname and filtered by email/name substrings, which is all this index has
-- to serve. 240 rows do not need more, and pretending otherwise would be theatre.
create index if not exists members_surname_idx on public.members (surname, firstname);
create index if not exists members_email_idx   on public.members (email);

-- READ-ONLY TO THE BROWSER. The app is a directory: the anon key may list members and may not
-- change them. RLS is on with a single select policy, so the absence of an insert policy is what
-- refuses a write — not a check in the client that a client could skip.
alter table public.members enable row level security;

drop policy if exists "members are readable by anyone" on public.members;
create policy "members are readable by anyone"
  on public.members for select
  to anon, authenticated
  using (true);
