// `/examples/dock` — motu's DOCK, end to end, on this host's own data.
//
// Two regions: the harbour (a bay with the readout and the account) places the quay (the
// repositories). The harbour's readout is DOCKED in the quay's arrangement, beside the list. Open
// `?quay=off` for the screen without the quay: the readout falls back into the bay.
//
// A SERVER component, like the front page: it reads the store and renders both regions in one pass.
// The docked island is the one thing absent from the server HTML — a portal has no server target — and
// it appears on hydration, already in its final place.
import { store } from '@/src/host/store'
import { DockScreen } from './dock-screen'
import type { LagoonRepo } from '@/app/index-region'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function DockExamplePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams
  const s = store()
  // PUBLIC REPOSITORIES ONLY is not decided here: this example shows nothing the front page would not
  // show a visitor, so it lists what `listRepos` returns with no viewer — the shape, not the policy.
  const repos = (s.listRepos() as LagoonRepo[]).slice(0, 5)
  const stats = s.stats() as { blobs: number; bytes: number; maxRecords: number }
  return <DockScreen stats={stats} viewer={null} repos={repos} cap={stats.maxRecords} quay={params.quay !== 'off'} />
}
