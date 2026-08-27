// PHASE 0: this app owns no route of its own yet. Everything falls through the optional catch-all
// in `app/[[...path]]/route.ts` to the node host. See docs/plan-lagoon-host.md.
/** @type {import('next').NextConfig} */
export default {
  // The proxy hands `request.body` straight to the upstream as a stream, which fetch only accepts
  // on a real node runtime. `/api/publish` posts a gzipped fragment up to 24 MB and must not be
  // buffered on the way through.
  serverExternalPackages: [],
  // Nothing this app serves is cacheable by a shared cache: the plan's one security-relevant route
  // answers differently per viewer. Keep the framework from adding its own layer in front.
  poweredByHeader: false,
  // motu's own packages ship raw TypeScript for the islands project, so Next compiles them rather
  // than treating them as prebuilt deps. Peps needs a twenty-entry resolveAlias block for this
  // because it consumes motu as a vendored sibling checkout; in-tree the workspace resolves them and
  // only the compile step is left.
  transpilePackages: ['motu-host-islands'],
  // A TRAILING SLASH IS PART OF THE HOST'S ADDRESSES, not a typo to be corrected. `/motu-review/`
  // is a repo's group page and `/motu-review` is not; Next's default is to 308 one to the other
  // BEFORE the route handler runs, so without this the first page anybody clicks from the index
  // answers 308-to-nothing. Found by diffing every index link through the proxy against the host.
  skipTrailingSlashRedirect: true,
};
