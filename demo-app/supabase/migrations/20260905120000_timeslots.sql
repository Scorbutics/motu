-- Bookable time with a member: what the profile page's calendar reads.
--
-- WHY THE SLOTS ARE GENERATED RELATIVE TO `current_date` RATHER THAN COMMITTED AS LITERALS.
-- `members` is committed as fixed rows on purpose — a directory that changes between rehearsal and
-- the take is a directory you cannot cut around. A CALENDAR has the opposite requirement: a demo
-- recorded in September that offers slots in "last April" is visibly broken, and the fix would be
-- re-seeding before every recording. So the ROWS are generated from `current_date` at reset time and
-- the SHAPE is fixed: which weekdays, which hours, which kinds, who has availability at all. What a
-- viewer sees is stable; only the dates move with them.
--
-- Note what is NOT here: a `bookings` table. This demo books nothing — the region's job is to let a
-- person find a slot, and the confirmation island renders the choice rather than persisting it.
-- Inventing a write path no island exercises would be schema nobody reads, which is the same mistake
-- as a fixture inventing a vocabulary.

create table if not exists public.timeslots (
  id         uuid primary key default gen_random_uuid(),
  member_id  uuid        not null references public.members (id) on delete cascade,
  starts_at  timestamptz not null,
  -- The length a slot runs for. Kept explicit rather than derived from `kind` so the calendar can
  -- render a duration without a lookup table the database does not have.
  minutes    integer     not null default 30 check (minutes > 0),
  -- What the slot is FOR. Constrained, so a typo is a write error rather than a slot that renders
  -- with an empty label for reasons nobody can see (the same rule `members.status` follows).
  kind       text        not null check (kind in ('intro', 'mentoring', 'workshop')),
  -- Whether someone already took it. The calendar renders taken slots as disabled rather than
  -- hiding them: a day that shows "3 slots, 2 taken" reads as a real calendar, and an empty day
  -- reads as a mistake.
  taken      boolean     not null default false,
  unique (member_id, starts_at)
);

-- The calendar always asks the same question: this member's slots, in time order, from today on.
create index if not exists timeslots_member_start_idx on public.timeslots (member_id, starts_at);

-- READ-ONLY TO THE BROWSER, exactly like `members`. The anon key may list availability and may not
-- change it; the absence of an insert/update policy is what refuses a booking write, rather than a
-- check in the client that a client could skip.
alter table public.timeslots enable row level security;

drop policy if exists "timeslots are readable by anyone" on public.timeslots;
create policy "timeslots are readable by anyone"
  on public.timeslots for select
  to anon, authenticated
  using (true);
