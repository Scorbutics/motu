// The Next.js mount. An adopting application's whole coverage backend:
//
//     // app/api/motu/coverage/route.ts
//     export const dynamic = 'force-dynamic';
//     export { POST } from '@motu/coverage/server/next';
//
// Nothing else — no table, no RPCs, no RLS, no migration. What used to be four hundred lines of
// application-specific storage is those two lines plus three environment variables.
//
// `dynamic` HAS TO BE DECLARED IN THE ROUTE FILE. Next parses route segment config statically at
// build time, so re-exporting it fails with "the exported configuration object needs to have a very
// specific format" — found by building, and the reason the export below exists but cannot be the
// one an application uses.
//
// A THIN MOUNT ON PURPOSE. Everything that could be wrong lives in `handleCoverage`, which takes a
// standard Request and returns a standard Response, so it is tested once and serves every host that
// speaks them. If this file grows logic, that logic stops being tested for the standalone deployment.
import { handleCoverage, type CoverageServerOptions } from './index';

/**
 * The value to copy into the route file. Exported for reference and for tests; Next will not read it
 * through a re-export, so an application declares its own `export const dynamic = 'force-dynamic'`.
 *
 * It matters: a route that forwards must not be statically evaluated at build time, or Next runs it
 * once during the build and serves that answer forever.
 */
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  return handleCoverage(request);
}

/**
 * For an application that would rather configure this in code than in the environment — a monorepo
 * with several apps forwarding as different repos, say.
 *
 *     export const POST = createCoverageRoute({ repo: 'acme/web', regions: ['actions'] });
 */
export function createCoverageRoute(opts: CoverageServerOptions) {
  return (request: Request): Promise<Response> => handleCoverage(request, opts);
}
