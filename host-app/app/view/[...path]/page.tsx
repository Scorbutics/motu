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

export default async function LagoonViewPage({ params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  const record = '/' + path.join('/')

  // THE ARTIFACT'S OWN ADDRESS, which the host already has a name for: `__motu_frame` is the same
  // bytes without the shell around them, and the route handler rewrites it away before reading the
  // store. Pointing the frame anywhere else would serve the shell inside the shell.
  return (
    <LagoonViewScreen
      frameSrc={`${record}/__motu_frame`}
      title={path[1] ?? 'lagoon'}
      subtitle={path.slice(2).join(' · ')}
    />
  )
}
