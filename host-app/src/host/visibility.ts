// May this viewer see that a repo EXISTS? — one predicate, shared by every listing.
//
// Extracted from the catch-all when `/` became a real page: the index and the read APIs must ask the
// same question, and two copies of "the same question" is how a listing and a gate drift apart. That
// drift is not cosmetic here — it is the leak the whole region exists to close.
import { authorize, type Asker, type AuthorizeDeps } from '../auth/authorize.ts'
import { postgresProjectStore, postgresMembershipStore } from '../auth/stores.ts'
import { postgresAccessStore } from '../auth/access-store.ts'
import { postgresShareLinkStore } from '../auth/share-link-store.ts'
import { access } from './store.ts'
// @motu/host is plain ESM node; tsc reads it through allowJs.
import { canRead } from '@motu/host/src/access.mjs'

/**
 * The same decision the record route makes, asked for a listing.
 *
 * ABSTAIN falls back to the host's own access.json, exactly as it does for a record: a repo the
 * database has never heard of is still the host's to judge, by the policy it used before phase 2.
 */
async function visibleTo(
  asker: Asker,
  repo: string,
  deps: AuthorizeDeps,
  hostAccess: unknown,
): Promise<boolean> {
  const decision = await authorize(asker, { repo, ref: 'latest', slug: 'all' }, deps)
  if (decision.outcome === 'allow') return true
  if (decision.outcome === 'deny') return false
  return canRead(hostAccess, repo, { adminOk: false, readSecret: null }) as boolean
}

/**
 * One predicate for one request, memoised per repo.
 *
 * Built once rather than per repo: the index asks it for every repository AND every group member, so
 * a fresh client per call would turn one page into dozens of connections.
 */
export async function visibilityFor(asker: Asker) {
  const hostAccess = access()
  const deps: AuthorizeDeps = {
    projects: postgresProjectStore(),
    memberships: postgresMembershipStore(),
    access: postgresAccessStore(),
    shareLinks: postgresShareLinkStore(),
  }
  const cache = new Map<string, Promise<boolean>>()
  return (repo: string) => {
    let hit = cache.get(repo)
    if (!hit) {
      hit = visibleTo(asker, repo, deps, hostAccess)
      cache.set(repo, hit)
    }
    return hit
  }
}
