In host-app, add a page `/share` where a project's owner manages its share links (see
`src/auth/share-links.ts` and `infra/mint-share-link.mjs` for what a share link is).

They should see the project's links with what each one opens (one commit or every commit, one page or
every page) and whether it is live, expired or revoked. They can create a new one — choosing a commit
or all, a page or all, and an expiry of 1, 7 or 30 days or never (never must be a deliberate choice) —
and see its token once, right after creating it. They can revoke a link, with a confirmation.

Build it as a motu region following host-app/CLAUDE.md, with a source behind a port for the data (no
database in the lagoon). Done when `motu check` passes, the region's runtime verification passes, and
you have looked at it in the lagoon.
