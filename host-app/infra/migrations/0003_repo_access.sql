-- What GitHub said, so `authorize` does not have to ask it again.
--
-- THE ANSWER IS CACHED, NOT THE TOKEN. docs/plan-lagoon-host.md settles this: what `authorize` needs
-- is "may this user read owner/name", and that is a boolean. The provider token that produced it is a
-- credential for somebody else's service, and the safest place for a credential you do not need is
-- nowhere. So the callback spends it once, writes these rows, and drops it.
--
-- That choice has a consequence worth stating rather than discovering: with no stored token, these
-- rows cannot be refreshed except by signing in again. `checked_at` is therefore not a cache
-- expiry so much as a statement of how old the answer is, and `src/auth/repo-access.ts` decides what
-- to do about age.
create table if not exists repo_access (
  user_id     uuid not null references profiles(id) on delete cascade,
  repo        text not null,
  can_read    boolean not null,
  checked_at  timestamptz not null default now(),
  primary key (user_id, repo)
);

-- The read is always (user, repo) — the primary key covers it. This index is for the other question:
-- "how stale is this whole cache", which is what tells an operator whether a GitHub outage is about
-- to start locking people out.
create index if not exists repo_access_checked_at_idx on repo_access (checked_at);
