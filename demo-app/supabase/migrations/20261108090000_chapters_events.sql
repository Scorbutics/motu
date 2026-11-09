-- Chapters, the club's events, and who is going: the demo's first WRITE path.
--
-- Until this migration every table here was read-only to the browser, on purpose. A club app where
-- nobody can do anything is not what an existing app looks like, so `event_rsvps` is writable — and
-- the policy below says exactly by whom, which is the part worth reading.

-- ---------------------------------------------------------------------------------------- chapters --
-- `members.chapter` has always held one of these names; this is what the club knows ABOUT each one.
-- Joined on the NAME rather than an id because that is the column the directory already speaks, and
-- renaming a chapter is rare enough to be a migration of its own.
create table if not exists public.chapters (
  name     text primary key,
  slug     text not null unique,
  tagline  text not null,
  meets    text not null,
  venue    text not null,
  lead_id  uuid references public.members (id) on delete set null
);

alter table public.chapters enable row level security;
drop policy if exists "chapters are readable by anyone" on public.chapters;
create policy "chapters are readable by anyone"
  on public.chapters for select to anon, authenticated using (true);

-- ------------------------------------------------------------------------------------------ events --
create table if not exists public.events (
  id         uuid primary key default gen_random_uuid(),
  title      text        not null,
  -- Constrained, like `timeslots.kind`: a typo is a write error, never a pill with no label.
  kind       text        not null check (kind in ('meetup', 'workshop', 'social', 'talk')),
  -- NULL is a whole-club event. Otherwise one of the chapters.
  chapter    text        references public.chapters (name) on update cascade,
  starts_at  timestamptz not null,
  minutes    integer     not null check (minutes > 0),
  venue      text        not null,
  capacity   integer     not null check (capacity > 0),
  host_id    uuid        references public.members (id) on delete set null,
  blurb      text        not null default ''
);

create index if not exists events_starts_idx on public.events (starts_at);

alter table public.events enable row level security;
drop policy if exists "events are readable by anyone" on public.events;
create policy "events are readable by anyone"
  on public.events for select to anon, authenticated using (true);

-- ------------------------------------------------------------------------------------ event_rsvps --
create table if not exists public.event_rsvps (
  event_id   uuid        not null references public.events (id) on delete cascade,
  member_id  uuid        not null references public.members (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, member_id)
);

create index if not exists event_rsvps_member_idx on public.event_rsvps (member_id);

-- THE RULES LIVE HERE, NOT IN THE CLIENT. Three refusals, each with a message the app maps to a
-- sentence (`RSVP_REFUSAL_TEXT`): a full event, an event that has started, a suspended membership.
--
-- `for update` on the event row serialises RSVPs to the SAME event, so two people taking the last
-- seat at once cannot both get it — without it the count below is read by both before either
-- inserts. RSVPs to different events do not wait on each other.
--
-- SECURITY DEFINER, and it has to be. The trigger runs as the WRITER — `anon` — and `for update`
-- needs UPDATE rights that RLS gives nobody on `events`, so as the caller the row is invisible and
-- every RSVP came back "missing". (Found by driving it as anon; as postgres it looked fine.) The
-- function reads one event and counts one table, and `search_path` is pinned so a caller cannot
-- shadow either.
create or replace function public.event_rsvps_guard() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  ev public.events%rowtype;
  taken integer;
begin
  select * into ev from public.events where id = new.event_id for update;
  if not found then
    raise exception 'rsvp_refused:missing' using errcode = 'P0001';
  end if;
  if ev.starts_at <= now() then
    raise exception 'rsvp_refused:started' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.members m where m.id = new.member_id and m.status = 'suspended') then
    raise exception 'rsvp_refused:suspended' using errcode = 'P0001';
  end if;
  select count(*) into taken from public.event_rsvps where event_id = new.event_id;
  if taken >= ev.capacity then
    raise exception 'rsvp_refused:full' using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists event_rsvps_guard on public.event_rsvps;
create trigger event_rsvps_guard before insert on public.event_rsvps
  for each row execute function public.event_rsvps_guard();

alter table public.event_rsvps enable row level security;

drop policy if exists "rsvps are readable by anyone" on public.event_rsvps;
create policy "rsvps are readable by anyone"
  on public.event_rsvps for select to anon, authenticated using (true);

-- WHO MAY WRITE: ANYONE, AS ANYONE. Said plainly because it is the decision a reviewer has to see.
-- This demo has no login — the sidebar's "acting as" is a choice kept in the browser — so there is no
-- `auth.uid()` to compare `member_id` against, and a policy pretending otherwise would be theatre.
-- The trigger above still enforces the CLUB's rules (capacity, suspension, start time) for every
-- writer. With real auth this becomes `with check (member_id = auth.uid())`, and only this changes.
drop policy if exists "anyone may rsvp as any member (demo: no login)" on public.event_rsvps;
create policy "anyone may rsvp as any member (demo: no login)"
  on public.event_rsvps for insert to anon, authenticated with check (true);

drop policy if exists "anyone may cancel any rsvp (demo: no login)" on public.event_rsvps;
create policy "anyone may cancel any rsvp (demo: no login)"
  on public.event_rsvps for delete to anon, authenticated using (true);
