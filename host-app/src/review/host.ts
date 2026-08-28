// The lagoon host, as a service.
//
// Every call to the host goes through here rather than a `fetch` in a component: the host is an
// external service whose shape is not ours, and the islands must be replaceable against a stand-in.
// It is also the seam the lagoon aliases — an island that reaches this module directly is one the
// lagoon can answer without a server running.

export type ShotStatus = "new" | "match" | "changed"

/** One (island, scenario@viewport) pair, and where it stands against what someone accepted. */
export interface Shot {
  island: string
  shot: string
  status: ShotStatus
  /** Content hash of the accepted baseline, or null when nobody has accepted one yet. */
  accepted: string | null
  acceptedAt: string | null
  /** What the last run rendered — null if this shot has never been uploaded. */
  last: { hash: string; at: string; sha: string | null; branch: string | null } | null
}

export interface RepoSummary {
  repo: string
  records: number
  slugs: string[]
  /**
   * The project's own colour, as it declared it (`chrome.brand` in its lagoon config), or null.
   *
   * Any self-contained CSS colour — a hex, an hsl(), a color-mix(). The console does not interpret
   * it; it hands it to motu's chrome, which rebuilds the water ramp around it.
   */
  brand?: string | null
}

/**
 * Where the host is. That is all, now.
 *
 * THE TOKEN IS GONE. This carried an admin bearer the operator pasted into the console and the
 * browser kept in localStorage — which was the honest trade while the console was a separate app
 * talking to a host that understands one all-or-nothing credential. Folded into the lagoon host app,
 * the question "may this person accept?" has a real answer: their GitHub session, and the
 * `repo_access` row it earned. `/api/baseline/accept` is the app's route now and asks that; nothing
 * on this side needs a secret, and the browser holds none.
 */
export interface HostConfig {
  base: string
}

async function json<T>(cfg: HostConfig, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${cfg.base}${path}`, {
    ...init,
    // SAME ORIGIN, SO THE SESSION TRAVELS. The credential is the cookie the app already set; there is
    // nothing to attach here and nothing for this module to be trusted with.
    credentials: "same-origin",
    headers: { ...(init?.headers ?? {}) },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => "")
    // The host answers errors as JSON with an `error`; anything else came from a proxy in front of it.
    let detail = body.slice(0, 200)
    try {
      detail = (JSON.parse(body) as { error?: string }).error ?? detail
    } catch {
      /* keep the raw text */
    }
    throw new Error(`${res.status}: ${detail || "no detail"}`)
  }
  return (await res.json()) as T
}

export async function listRepos(cfg: HostConfig): Promise<RepoSummary[]> {
  return (await json<{ repos: RepoSummary[] }>(cfg, "/api/repos")).repos
}

export async function listShots(cfg: HostConfig, repo: string): Promise<Shot[]> {
  return (await json<{ shots: Shot[] }>(cfg, `/api/baselines?repo=${encodeURIComponent(repo)}`)).shots
}

/**
 * Accept what was last rendered. Scope narrows from the repo down to one shot; omitting `shot`
 * accepts every pending shot of that island, and omitting both accepts the whole repo.
 *
 * Deliberately mirrors the CLI rather than inventing a second vocabulary: accepting here and
 * accepting from `motu island snapshot --accept` must mean the same thing.
 */
export async function acceptShots(
  cfg: HostConfig,
  repo: string,
  island?: string,
  shot?: string,
): Promise<{ accepted: string[]; count: number }> {
  const q = new URLSearchParams({ repo })
  if (island) q.set("island", island)
  if (shot) q.set("shot", shot)
  return json(cfg, `/api/baseline/accept?${q}`, { method: "POST" })
}

/** The bytes of one shot, by content hash — immutable, so the browser may cache it forever. */
export function shotUrl(cfg: HostConfig, hash: string): string {
  return `${cfg.base}/shot/${hash}`
}
