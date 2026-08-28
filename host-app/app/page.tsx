// The front page. A SERVER component, which is what lets it read the store and render the region in
// one pass — a route handler cannot, because Next refuses `react-dom/server` inside one, correctly.
//
// Next prefers this over the optional catch-all for `/`, so everything else still falls through.
import { cookies } from 'next/headers';
import { store } from '@/src/host/store';
import { visibilityFor } from '@/src/host/visibility';
import { createClient } from '@/src/supabase/server';
import { viewerFrom } from '@/src/auth/viewer';
import { IndexScreen } from '@/app/index-screen';
import type { LagoonGroup, LagoonRepo } from '@/app/index-region';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/** Whoever is asking, or null. Never throws: an unreadable session is nobody, not an error. */
async function viewerOf() {
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    // The id is what `authorize` gates by; the reduced form is what the badge renders. Both from one
    // read, so the page cannot show a name it is not also gating with.
    return data.user ? { userId: data.user.id, viewer: viewerFrom(data.user) } : null;
  } catch {
    return null;
  }
}

export default async function IndexPage() {
  const s = store();
  const jar = await cookies();
  const who = await viewerOf();
  const visible = await visibilityFor({
    viewer: who,
    shareToken: jar.get('motu_share')?.value ?? null,
  });

  const allRepos = s.listRepos() as LagoonRepo[];
  const keep = await Promise.all(allRepos.map((r) => visible(r.repo)));
  const repos = allRepos.filter((_, i) => keep[i]);

  // A GROUP'S SUMMARY NAMES ITS MEMBERS, so filtering the repo list alone is not enough — and a group
  // left with nothing readable is DROPPED rather than shown empty, because "a gallery you may not
  // see" is itself the fact being withheld. Both rules are server.mjs's, kept deliberately.
  const allGroups = s.listGroups() as LagoonGroup[];
  const groups: LagoonGroup[] = [];
  for (const g of allGroups) {
    const members = [];
    for (const m of g.members ?? []) if (await visible(m.repo)) members.push(m);
    if (members.length) groups.push({ ...g, members });
  }

  const stats = s.stats() as { blobs: number; bytes: number; maxRecords: number };
  return (
    <IndexScreen
      groups={groups}
      repos={repos}
      stats={stats}
      cap={stats.maxRecords}
      viewer={who?.viewer ?? null}
    />
  );
}
