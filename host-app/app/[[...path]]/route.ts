// THE FALL-THROUGH. Every route the app does not own yet is the node host's, and this is the one
// place that says so. As phase 1 moves a route into the app it gets its own file, Next's more
// specific segment wins, and this handler stops seeing it — which is what makes the migration
// route-by-route rather than all at once. See docs/plan-lagoon-host.md.
import { proxyToHost } from '@/src/upstream';

// Nothing here may be prerendered or cached. The host answers `/`, the group pages and the record
// routes differently per viewer (access.mjs already varies on a cookie), and a static answer served
// to a second viewer is the exact failure `authorize` exists to prevent.
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

// The proxy streams request and response bodies, which only the node runtime can do.
export const runtime = 'nodejs';

const handler = (request: Request) => proxyToHost(request);

// Named exports, one per method, because that is the only way the App Router accepts a handler.
// The host itself only answers GET, HEAD and POST — everything else it 405s (server.mjs) — and the
// rest are listed here anyway ON PURPOSE: a method missing from this list is answered 405 by NEXT,
// from a different code path, before the host is ever asked. Forwarding them keeps the host the
// only thing deciding what it serves, so the day a route grows a DELETE nothing in front of it has
// to be remembered.
export {
  handler as GET,
  handler as HEAD,
  handler as POST,
  handler as PUT,
  handler as PATCH,
  handler as DELETE,
  handler as OPTIONS,
};
