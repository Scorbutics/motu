// The GoTrue gateway: this app is the only thing that talks to the auth container.
//
// The same proxy the phase-0 catch-all uses, with the `/auth/v1` prefix taken off — see
// `src/auth/gotrue.ts` for why the prefix exists at all. It must sit BEFORE the catch-all in
// specificity, which it does: Next prefers the more specific segment, so `/auth/v1/token` lands here
// and everything else still falls through to `store.mjs`.
import { proxyToHost } from '@/src/upstream';
import { gotrueOrigin, stripAuthPrefix } from '@/src/auth/gotrue';

// A token exchange is never cacheable and never prerendered.
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';
export const runtime = 'nodejs';

const handler = (request: Request) =>
  proxyToHost(request, { origin: gotrueOrigin(), rewritePath: stripAuthPrefix });

export {
  handler as GET,
  handler as HEAD,
  handler as POST,
  handler as PUT,
  handler as PATCH,
  handler as DELETE,
  handler as OPTIONS,
};
