-- ONE ROW PER STATE, not one row per corpus.
--
-- docs/plan-lagoon-host.md: four current problems go away with this primary key. `keysHash` bucketing
-- survives and gets cheaper (a corpus recorded against a different key list still cannot mix with
-- this one, and "one file to delete" becomes one DELETE). The accepted set stops being a second file
-- beside the corpus — it is a nullable column on the state it is about, which deletes the
-- `<keysHash>.json` versus `<keysHash>.accepted.json` suffix hazard the code carries a comment about.
-- `forget` becomes a DELETE instead of read-filter-rewrite.
--
-- And the one that is a correctness fix rather than tidiness: CONCURRENT INGEST STOPS LOSING WRITES.
-- Today two POSTs that arrive together both read the same stored corpus, both merge, and the second
-- rename wins — the first one's states are gone, silently. An upsert cannot do that.
create table if not exists coverage_states (
  project_id   uuid not null references projects(id) on delete cascade,
  region       text not null,
  keys_hash    text not null,
  -- `fingerprintId(fingerprint)` — @motu/coverage's own identity for a state, not ours. The whole
  -- point of the key is that it is computed the same way on every side.
  state_id     text not null,
  fingerprint  jsonb not null,
  count        bigint not null,
  first_at     bigint not null,
  last_at      bigint not null,
  -- NULL = still on the worklist. "This happened" and "we decided this needs no scenario" are
  -- different claims by different authors — one written by browsers, the other by a person — which is
  -- why the file version kept them apart. A nullable column keeps them apart too, and keeps them
  -- attached to the state they are about.
  accepted_at  timestamptz,
  primary key (project_id, region, keys_hash, state_id)
);

-- The worklist query: per region, ordered by count, filtered by `accepted_at is null`. This is what
-- makes the corpus useful in a console rather than only at the CLI.
create index if not exists coverage_states_worklist_idx
  on coverage_states (project_id, region, keys_hash, count desc)
  where accepted_at is null;
