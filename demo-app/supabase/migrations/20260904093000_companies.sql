-- Companies for the org lookup.
--
-- Small on purpose: this table exists so a lookup has something to look up, and the org CHART it
-- opens is a constant in the application (`orgChartFor`) rather than a second set of tables. That is
-- the honest shape of this screen today — the lookup is backed, the drill-down is not — and pretending
-- otherwise would mean inventing a department schema no island reads.
create table if not exists public.companies (
  id      uuid primary key default gen_random_uuid(),
  name    text not null unique,
  code    text not null unique,
  updated timestamptz not null default now()
);

alter table public.companies enable row level security;

drop policy if exists "companies are readable by anyone" on public.companies;
create policy "companies are readable by anyone"
  on public.companies for select to anon, authenticated using (true);
