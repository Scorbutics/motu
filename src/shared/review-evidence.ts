// Fixture data for the review console's islands and flows, in ONE module.
//
// Types only, and they erase — this file is read by plain node where `@/…` does not resolve. The
// shapes are the SERVICE's own (`lib/host`), so a field renamed there fails here rather than quietly
// previewing last month's answer.
import type { RepoSummary, Shot } from "@/lib/host"
import type { ShotRef } from "@/lib/review-region"

export const REPOS = [
  { repo: "Scorbutics/motu", records: 3, slugs: ["all"] },
  { repo: "Scorbutics/peps_ta_boite_app", records: 4, slugs: ["all"] },
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
