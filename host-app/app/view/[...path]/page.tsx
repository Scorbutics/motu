// The migrated lagoon viewer, as a PAGE — which is the whole reason it can be a region.
//
// `app/[...path]/route.ts` still serves the same screen at `/<repo>/<project>/<ref>/<slug>` with the
// vanilla dock, and its own header says why this file had to exist: "a route handler cannot render
// the region, because Next will not allow react-dom/server inside one". That is what kept ~3,900
// lines of dock outside motu.
//
// SERVED HERE FIRST, DELIBERATELY. This path is the migrated implementation; the live one is not
// switched over until every pane the vanilla dock draws has an island. Flipping it is its own change,
// with its own look at the screen.
import { LagoonViewScreen } from '../lagoon-view-screen'

export default async function LagoonViewPage({
  params,
  searchParams,
}: {
  params: Promise<{ path: string[] }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { path } = await params
  const record = '/' + path.join('/')

  // THE STATE ADDRESS HAS TO CROSS INTO THE FRAME, and this is the only place it can.
  //
  // `?target=island:…&scenario=…&step=…` is read from `location.search` by the lagoon — which, in
  // here, is the IFRAME's search, not this page's. Dropping the query meant a published scenario
  // address resolved to the default region: silently, looking exactly like success, which is the one
  // failure the whole state-address design refuses everywhere else. The bare proxy path
  // (`app/[...path]/route.ts`) never had this problem because it serves the artifact itself rather
  // than framing it — so the bug arrives only when this migrated viewer is switched on.
  //
  // Forwarded wholesale rather than by allow-list: the frame is the lagoon's own document, every
  // parameter it understands is its business, and a list here would silently drop the next one added.
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(await searchParams)) {
    for (const v of Array.isArray(value) ? value : value === undefined ? [] : [value]) query.append(key, v)
  }
  const search = query.toString()

  // THE ARTIFACT'S OWN ADDRESS, which the host already has a name for: `__motu_frame` is the same
  // bytes without the shell around them, and the route handler rewrites it away before reading the
  // store. Pointing the frame anywhere else would serve the shell inside the shell.
  return (
    <LagoonViewScreen
      frameSrc={`${record}/__motu_frame${search ? `?${search}` : ''}`}
      title={path[1] ?? 'lagoon'}
      subtitle={path.slice(2).join(' · ')}
    />
  )
}
