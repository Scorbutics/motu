// The Next.js mount for the accepted set:
//
//     // app/api/motu/coverage/known/route.ts
//     export const dynamic = 'force-dynamic';
//     export { GET } from '@motu/coverage/server/next/known';
//
// A SEPARATE MODULE from the forwarder, because Next names route handlers by export: a single module
// exporting both `POST` and `GET` would work, and it would also mean each route file re-exports one
// name from a module that secretly serves the other path too. Two modules say which is which.
//
// `dynamic` is declared in the route file, not re-exported — Next parses route segment config
// statically at build time and a re-export fails the build.
import { handleKnown, type CoverageServerOptions } from './index';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  return handleKnown(request);
}

/** For an app configuring in code rather than the environment — see `createCoverageRoute`. */
export function createKnownRoute(opts: CoverageServerOptions) {
  return (request: Request): Promise<Response> => handleKnown(request, opts);
}
