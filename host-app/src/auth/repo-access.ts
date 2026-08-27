// May this person read this repository? — the one question `authorize` will ask in phase 2.
//
// SERVER ONLY. Kept out of `./client` for the reason that split exists: nothing here may be reachable
// from a browser module.
//
// The shape is a PORT and a decision, so both halves can be tested without a network or a database:
// `AccessStore` is where the answers live and `fetchReadableRepos` is what GitHub says. What is worth
// getting right is neither of those — it is `decideOnMiss` below.

/** A repo, normalised the way `access.mjs` normalises it: `name` or `owner/name`. */
export type Repo = string

export interface CachedAnswer {
  canRead: boolean
  checkedAt: Date
}

export interface AccessStore {
  get(userId: string, repo: Repo): Promise<CachedAnswer | null>
  put(userId: string, answers: Array<{ repo: Repo; canRead: boolean }>): Promise<void>
}

/**
 * How old an answer may be before it is merely the best guess available.
 *
 * SHORT on purpose. This is how long it takes for somebody removed from a repository to lose access
 * here, and "revocation that cannot be forgotten" is one of the three reasons the plan chose GitHub
 * identity at all. Ten minutes is short enough that a removal takes effect while somebody is still
 * annoyed about it, and long enough that a page of twelve lagoons is not twelve API calls.
 */
export const FRESH_FOR_MS = 10 * 60 * 1000

export type Verdict = {
  canRead: boolean
  /** Why, in a word — this is what gets logged, and what a support question is answered from. */
  because: 'fresh' | 'stale-but-known' | 'no-answer' | 'public'
}

/**
 * THE DECISION THE PLAN ASKED FOR, in one function, so it is testable and so it is in one place.
 *
 * Two situations that look alike and are not:
 *
 *   A STALE ANSWER IS STILL AN ANSWER. GitHub said yes eleven minutes ago; GitHub is unreachable now.
 *   Refusing here would lock out a whole team over somebody else's outage, which is precisely the
 *   "degrade to stale-but-working rather than locked-out" the plan asks for. So a stale row is used.
 *
 *   NO ANSWER IS A NO. Nothing was ever recorded for this pair, so the only honest thing to say is
 *   that we do not know — and "we do not know" must not open a private lagoon. This is the cold-cache
 *   case the plan says to decide before shipping: it FAILS CLOSED. What keeps that from being cruel
 *   is that the cache is populated at sign-in, so a person who has just signed in is never in it.
 *
 * Neither branch is reached for a public project — that is decided before this is called, and is the
 * reason `authorize`'s first rule is "project is public → yes".
 */
export function decide(cached: CachedAnswer | null, now: Date): Verdict {
  if (!cached) return { canRead: false, because: 'no-answer' }
  const age = now.getTime() - cached.checkedAt.getTime()
  if (age <= FRESH_FOR_MS) return { canRead: cached.canRead, because: 'fresh' }
  // A stale NO stays a no, and that asymmetry is deliberate: using an old refusal costs somebody a
  // re-authentication, while using an old grant costs a private lagoon.
  return { canRead: cached.canRead, because: 'stale-but-known' }
}

/**
 * Every repository this token can read, as `owner/name`.
 *
 * ASKED ONCE, AT SIGN-IN, and this is the only place the provider token is ever used. `/user/repos`
 * answers for everything the grant covers — personal, organisation and collaborator — in one paginated
 * call, which is what makes "spend the token, keep the answer" affordable. Asking per repo instead
 * would mean holding the token for as long as somebody might open a lagoon.
 */
export async function fetchReadableRepos(
  providerToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Repo[]> {
  const repos: Repo[] = []
  // BOUNDED. A person on a hundred organisations should not turn one sign-in into forty requests, and
  // an unbounded loop over somebody else's API is how a callback route becomes a timeout.
  for (let page = 1; page <= 10; page++) {
    const res = await fetchImpl(
      `https://api.github.com/user/repos?per_page=100&page=${page}&affiliation=owner,collaborator,organization_member`,
      {
        headers: {
          authorization: `Bearer ${providerToken}`,
          accept: 'application/vnd.github+json',
          'user-agent': 'motu-lagoon-host',
        },
      },
    )
    if (!res.ok) throw new Error(`github /user/repos answered ${res.status}`)
    const batch = (await res.json()) as Array<{ full_name?: string }>
    for (const r of batch) if (typeof r.full_name === 'string') repos.push(r.full_name)
    if (batch.length < 100) break
  }
  return repos
}

/**
 * Spend the token, write the answers, and let the token go.
 *
 * Returns how many were recorded, because that number is the one thing worth logging at a callback:
 * zero means the grant carried no repository scope, which renders as "signed in and can see nothing"
 * and is otherwise indistinguishable from having no access.
 */
export async function recordAccessAtSignIn(
  userId: string,
  providerToken: string,
  store: AccessStore,
  fetchImpl: typeof fetch = fetch,
): Promise<number> {
  const repos = await fetchReadableRepos(providerToken, fetchImpl)
  await store.put(
    userId,
    repos.map((repo) => ({ repo, canRead: true })),
  )
  return repos.length
}

/** The question itself, for phase 2's `authorize` to call. */
export async function canReadRepo(
  userId: string,
  repo: Repo,
  store: AccessStore,
  now: Date = new Date(),
): Promise<Verdict> {
  return decide(await store.get(userId, repo), now)
}
