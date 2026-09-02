// Fixture data for the review console's islands and flows, in ONE module.
//
// Types only, and they erase — this file is read by plain node where `@/…` does not resolve. The
// shapes are the SERVICE's own (`lib/host`), so a field renamed there fails here rather than quietly
// previewing last month's answer.
import type { RepoSummary, Shot } from "@/src/review/host"
import type { ShotRef } from "@/app/console/review-region"

export const REPOS = [
  { repo: "Scorbutics/motu", records: 3, slugs: ["all"] },
  { repo: "acme/example-app", records: 4, slugs: ["all"] },
  { repo: "twentyhq/twenty", records: 3, slugs: ["all"] },
] satisfies RepoSummary[]

const at = (h: string) => ({ hash: h, at: "2026-08-23T09:00:00.000Z", sha: "abc123def456", branch: "main" })

/** A real review: one island fully settled, one with a change to look at, one never accepted. */
export const SHOTS = [
  { island: "week-actions", shot: "compact-rows@desktop", status: "match", accepted: "aaa1", acceptedAt: "2026-08-22T10:00:00.000Z", last: at("aaa1") },
  { island: "week-actions", shot: "compact-rows@mobile", status: "changed", accepted: "aaa2", acceptedAt: "2026-08-22T10:00:00.000Z", last: at("bbb2") },
  { island: "load-error", shot: "nothing-wrong@desktop", status: "new", accepted: null, acceptedAt: null, last: at("ccc3") },
] satisfies Shot[]

export const SHOTS_ALL_GREEN = SHOTS.map((s) => ({
  ...s,
  status: "match" as const,
  accepted: s.last?.hash ?? null,
}))

export const SELECTED: ShotRef = { island: "week-actions", shot: "compact-rows@mobile" }

/**
 * What EACH project holds — the thing a single `SHOTS` list could not express.
 *
 * With one list, every project card rendered the same three shots, so the console's central promise
 * ("picking a repo changes what the list shows") was indistinguishable from a console where clicking
 * does nothing. The three states below are deliberately different SHAPES, not just different rows:
 * a project mid-review, a project that has never published, and a project where everything is settled.
 */
export const SHOTS_BY_REPO: Record<string, Shot[]> = {
  "acme/example-app": SHOTS,
  "Scorbutics/motu": [
    { island: "region-actions", shot: "default@desktop", status: "new", accepted: null, acceptedAt: null, last: at("ddd4") },
    { island: "region-actions", shot: "default@mobile", status: "new", accepted: null, acceptedAt: null, last: at("eee5") },
  ],
  // A project that has published a lagoon and no baselines. The empty list is a state worth having
  // evidence for: it is what a reviewer sees most often on a project someone just adopted.
  "twentyhq/twenty": [],
}

/** The port the lagoon installs the shots source over — the host's answer, from fixtures. */
export const shotsFixturePort = {
  list: async (repo: string): Promise<Shot[]> => SHOTS_BY_REPO[repo] ?? [],
  // Accepting in the lagoon settles the shots it was asked about, which is what the host would then
  // report. It is a stand-in for an ANSWER, not a re-implementation of the host: no storage, no hashes.
  accept: async (repo: string, island?: string, shot?: string) => {
    SHOTS_BY_REPO[repo] = (SHOTS_BY_REPO[repo] ?? []).map((s) =>
      (island && s.island !== island) || (shot && s.shot !== shot)
        ? s
        : { ...s, status: "match" as const, accepted: s.last?.hash ?? null },
    )
    return { accepted: [], count: 0 }
  },
}
