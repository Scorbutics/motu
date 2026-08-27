// THE ONE ROUTE THAT MATTERS, as a function.
//
//   resolve(repo, ref, slug) -> authorize(viewer, project) -> store.read(...) -> stream
//
// docs/plan-lagoon-host.md calls this "the entire security surface of the host — everything else is
// presentation". So it is a pure decision over ports, with no database, no request and no framework
// in it, because the only way to be sure about a gate is to be able to enumerate what it lets past.

// `.ts` ON THE SPECIFIER, and it is load-bearing in the other direction from the barrel's `.js`.
// This module is imported by `node --test`, whose ESM resolver does no extension guessing at all, so
// an extensionless relative import is ERR_MODULE_NOT_FOUND there while resolving fine in tsc and in
// Turbopack. `allowImportingTsExtensions` is on and nothing is emitted, so all three agree on this.
import { canReadRepo, type AccessStore } from './repo-access.ts'
import { grants, tokenHash, type ShareLinkStore } from './share-links.ts'

/** A project as this app knows it. Null means the database has never heard of this repo. */
export type Project = {
  id: string
  orgId: string
  repo: string
  visibility: 'public' | 'private'
}

/** Whoever is asking. Null means nobody is signed in. */
export type Viewer = { userId: string } | null

/**
 * Everything about the asker, which is TWO things and not one.
 *
 * A session says who they are; a share token says what they were given. Somebody following a link
 * has the second and not the first, which is the entire point of share links — so these are separate
 * fields rather than a union, and either, both or neither may be present.
 */
export type Asker = { viewer: Viewer; shareToken: string | null }

export interface ProjectStore {
  byRepo(repo: string): Promise<Project | null>
}

export interface MembershipStore {
  /** Is this user a member of this org, in any role? Roles matter for writing, not for reading. */
  isMember(userId: string, orgId: string): Promise<boolean>
}

/**
 * The four outcomes, and one of them is not in the plan's list on purpose.
 *
 * `abstain` is what makes phase 2 shippable without a migration that must be perfect on the first
 * try. It means THE DATABASE HAS NO OPINION — no `projects` row for this repo — and the honest
 * response to that is not "deny". Denying would turn every lagoon published before this table was
 * populated into a 404 the moment this ships, which is precisely the regression phase 0 exists to
 * prevent. So the app steps aside and the host answers as it does today, from `access.json`.
 *
 * It is a MIGRATION STATE, not a permanent design. The plan's own open question — "whether visibility
 * lives in `projects` or stays in `access.json` until phase 2; two sources of truth for one afternoon
 * is fine, for a month it is not" — is exactly this, and `abstain` is the thing to count until it is
 * always zero.
 */
export type Decision =
  | { outcome: 'allow'; because: 'public' | 'membership' | 'repo-access' | 'share-link' }
  // `never-asked` and `refused` are both a no and are NOT the same operational fact: the first means
  // this person has no cached answer at all — they have not signed in since the cache was written, or
  // the callback's one GitHub call failed — and the second means GitHub was asked and said no. One is
  // a reason to look at the callback logs; the other is working correctly.
  | { outcome: 'deny'; because: 'no-session' | 'never-asked' | 'refused' }
  | { outcome: 'abstain'; because: 'unknown-project' }

export type AuthorizeDeps = {
  projects: ProjectStore
  memberships: MembershipStore
  access: AccessStore
  shareLinks: ShareLinkStore
  now?: Date
}

/**
 * May this viewer read this repo's records?
 *
 * IN ORDER, and the order is the design:
 *
 *   1. The project is public -> yes, and nothing else is consulted. A public lagoon must not cost a
 *      database round-trip per membership or an answer that depends on GitHub being reachable.
 *   2. A session AND either a membership in the project's org, or GitHub saying they can read the
 *      repo. Two ways in because they answer for two kinds of person: `memberships` is what a guest
 *      who is not on the repo will need, and repo access is what makes "if you can read the repo you
 *      can read its lagoons" true without anybody maintaining a list.
 *   3. A valid, unexpired, unrevoked share link scoping this record -> yes, WITH NO SESSION. That is
 *      what a share link is for: somebody who was sent a link is not somebody with an account, and
 *      requiring one would make the feature pointless. Checked before the session rules for the same
 *      reason — a person following a link may also happen to be signed in as somebody with no access,
 *      and the link is what they are presenting.
 *   4. Otherwise -> deny, which the route renders as 404 and never 403.
 */
export async function authorize(
  asker: Asker,
  record: { repo: string; ref: string; slug: string },
  deps: AuthorizeDeps,
): Promise<Decision> {
  const now = deps.now ?? new Date()
  const project = await deps.projects.byRepo(record.repo)
  if (!project) return { outcome: 'abstain', because: 'unknown-project' }

  if (project.visibility === 'public') return { outcome: 'allow', because: 'public' }

  // FROM HERE THE PROJECT IS PRIVATE. Everything below decides whether this particular asker gets in,
  // and every path out of it that is not `allow` must be indistinguishable to them.
  if (asker.shareToken) {
    const link = await deps.shareLinks.byTokenHash(tokenHash(asker.shareToken))
    if (grants(link, project.id, record, now)) return { outcome: 'allow', because: 'share-link' }
    // A BAD LINK IS NOT THE END OF THE QUESTION. Somebody signed in with access may follow a stale
    // link to their own project, and refusing them here would be the link taking away what their
    // session already gave. So it falls through to the session rules rather than denying.
  }

  const { viewer } = asker
  if (!viewer) return { outcome: 'deny', because: 'no-session' }

  if (await deps.memberships.isMember(viewer.userId, project.orgId)) {
    return { outcome: 'allow', because: 'membership' }
  }

  const verdict = await canReadRepo(viewer.userId, project.repo, deps.access, now)
  if (verdict.canRead) return { outcome: 'allow', because: 'repo-access' }

  return { outcome: 'deny', because: verdict.because === 'no-answer' ? 'never-asked' : 'refused' }
}

/**
 * WHY A REFUSAL IS A 404.
 *
 * A 403 confirms that a private lagoon exists at that address, which is a fact the asker has not
 * earned — and the name of an unreleased project is often the interesting part. The host already
 * makes this choice in `server.mjs` for the same reason; this keeps the two saying the same thing.
 *
 * It is a function rather than a constant so the reason can be logged on the way past without any
 * of it reaching the response.
 */
export function refusalStatus(): 404 {
  return 404
}

/**
 * WHAT A REFUSAL SAYS, and it is what an ABSENCE says.
 *
 * The status code alone does not make a refusal indistinguishable from a miss, and both this app and
 * `server.mjs` proved it independently: each rendered its refusal from the request PATH (with a
 * leading slash) and its not-found from `repo/ref/slug` (without one). One character apart, and
 * enough to tell somebody that the repo exists and is private — which is the single fact the 404 was
 * chosen to withhold.
 *
 * So the message is built here, in one place, in the not-found form. If it ever diverges again this
 * function is what a test can hold on to.
 */
export function refusalMessage(record: { repo: string; ref: string; slug: string }): string {
  return `nothing at ${record.repo}/${record.ref}/${record.slug}`
}
