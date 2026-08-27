-- The lagoon host's identity schema, first migration.
--
-- ORG-SHAPED FROM THE START even though there will be one org for a long time. Adding orgs later
-- means migrating every row that assumed a single tenant; adding them now costs one column. See
-- docs/plan-lagoon-host.md.
--
-- WHAT IS NOT HERE: blobs. A lagoon stays a file on disk owned by store.mjs, whose retention rule —
-- never evict what an alias or a composed manifest points at, and order eviction by LAST ACCESS
-- rather than publish date — is the kind of invariant normally learned from an incident. This
-- database holds what you would want to WHERE or ORDER BY; it does not hold what you fetch whole.

-- TWO ROLES GOTRUE NEEDS, and only one of them is obvious.
--
-- `supabase_auth_admin` is the one it connects as. `postgres` is one it never connects as and cannot
-- boot without: GoTrue's own migration 20240612123726_enable_rls_update_grants runs
-- `grant select on auth.users to postgres with grant option`, with the role name hardwired. This
-- image ships `supabase_admin` as its superuser and no `postgres` at all, so without this the auth
-- container boot-loops on `role "postgres" does not exist` — after having already created half its
-- schema, which makes it look like a schema problem rather than a missing role.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'postgres') then
    create role postgres superuser createdb createrole login bypassrls
      password 'postgres';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    create role supabase_auth_admin noinherit createrole login password 'postgres';
  end if;
end
$$;
create schema if not exists auth authorization supabase_auth_admin;
grant usage on schema public to supabase_auth_admin;

create extension if not exists pgcrypto;

create table if not exists orgs (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  created_at  timestamptz not null default now()
);

-- One row per human, hanging off GoTrue's own user. NO foreign key to auth.users: GoTrue creates that
-- table itself, on its own schedule, and a migration that depends on it cannot run before the first
-- boot of the auth container. The id IS the auth user id; `handle_new_user` below keeps them in step.
create table if not exists profiles (
  id            uuid primary key,
  display_name  text,
  github_login  text unique,
  created_at    timestamptz not null default now()
);

create table if not exists memberships (
  org_id      uuid not null references orgs(id) on delete cascade,
  user_id     uuid not null references profiles(id) on delete cascade,
  role        text not null check (role in ('owner', 'admin', 'member', 'viewer')),
  created_at  timestamptz not null default now(),
  primary key (org_id, user_id)
);

-- `repo` is literally what the host already calls a project: 'Scorbutics/peps_ta_boite_app'. Same
-- normalisation as access.mjs — `name` or `owner/name`, [A-Za-z0-9._-] — because a second spelling of
-- the same repo is a second set of permissions nobody knows about.
create table if not exists projects (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  repo        text not null,
  visibility  text not null default 'public' check (visibility in ('public', 'private')),
  created_at  timestamptz not null default now(),
  unique (org_id, repo),
  constraint projects_repo_shape check (repo ~ '^[A-Za-z0-9._-]+(/[A-Za-z0-9._-]+)?$')
);
-- Resolution is by repo on every read of every lagoon. It is the hot path of the one route that
-- matters, so it gets the index even at this size.
create index if not exists projects_repo_idx on projects (repo);

-- SCOPED TO A RECORD, not a project. That is what keeps "the link I sent still resolves" true without
-- handing over the whole repo. Null sha/slug means the whole project, which should be rare and worth
-- a second look when it appears — hence the partial index, which makes them countable.
create table if not exists share_links (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects(id) on delete cascade,
  sha         text,
  slug        text,
  -- A sha256 DIGEST, hashed by the same helper access.mjs already uses for ingest tokens, compared in
  -- constant time over fixed-width digests. A backup of this table is not a set of working links.
  token_hash  text not null unique,
  expires_at  timestamptz,
  revoked_at  timestamptz,
  created_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists share_links_project_idx on share_links (project_id);
create index if not exists share_links_whole_project_idx on share_links (project_id)
  where sha is null and slug is null;

-- A profile per GoTrue user, created where the user is. Doing it in the app instead would mean every
-- read path has to cope with a signed-in person who has no profile row yet — a state that exists only
-- because nobody wrote this trigger.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, github_login)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'user_name'),
    new.raw_user_meta_data ->> 'user_name'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
