// THE RAIL EVERY LAGOON CARRIES: every other lagoon you may see, beside the one you are looking at.
//
// This was a GROUP's shell — `/g/<name>` composed a named list of members and gave you a rail to move
// between them. Which meant the rail existed only if somebody had composed a group, and the front
// page listed those groups as things to browse. On a host where every group holds very nearly every
// repository, that was the same list twice: noise above the actual one.
//
// So the rail stops being a property of a GROUP and becomes a property of a LAGOON. Every published
// page gets the same sidebar, and what it lists is not a curated set but the honest one: everything
// this viewer may see. A group is then only a way of LOOKING at lagoons — which is what it always
// was — and stops needing to be a thing you browse to.
import { store } from './store.ts'
import type { Visible } from './read-routes.ts'

/** One lagoon in the rail, in the shape `lagoonPage` renders. */
export type RailMember = {
  repo: string
  slug: string
  hash: string | null
  title: string
  sha: string | null
  live: string | null
  /**
   * The colour the project DECLARED, or null.
   *
   * The shell detects a lagoon's colour from its own pixels, so this is not needed to make the chrome
   * follow a project. It is here so that a project which went to the trouble of saying what it is
   * still WINS: inference is what you get when nobody decided, not an override of somebody who did.
   */
  brand: string | null
  /**
   * The member's own bare address.
   *
   * A GROUP's frames are relative (`f/<i>`) because a group is a named thing with a URL to be
   * relative to. These members are whole lagoons with addresses of their own, so each frame points
   * at its own page — and no index has to agree with anything, which is the class of bug that made
   * a group's shell and frames have to move together. `__motu_frame` rather than `f`, because a slug
   * is any segment and `f` is a legal lagoon name.
   */
  frameHref: string
}

/**
 * Every lagoon this viewer may see, in listing order.
 *
 * ONE `resolveRef` PER LAGOON, and no attempt to be clever about it: this host holds single figures
 * of repositories and the store reads an index it already has in memory. If that stops being true
 * the answer is a store method, not a cache here that can disagree with the page it is drawn on.
 */
export async function railMembers(visible: Visible): Promise<RailMember[]> {
  const s = store()
  const repos = s.listRepos() as Array<{ repo: string; slugs: string[]; brand: string | null }>
  const keep = await Promise.all(repos.map((r) => visible(r.repo)))
  const out: RailMember[] = []
  for (const [i, r] of repos.entries()) {
    if (!keep[i]) continue
    for (const slug of r.slugs) {
      const rec = s.resolveRef(r.repo, 'latest', slug) as { hash: string; title?: string; sha?: string } | null
      // A slug with no resolvable record is not a lagoon anybody can open, so it is not in the rail.
      if (!rec) continue
      out.push({
        repo: r.repo,
        slug,
        hash: rec.hash,
        title: rec.title || slug,
        sha: rec.sha ?? null,
        live: null,
        brand: r.brand ?? null,
        frameHref: `/${r.repo}/latest/${slug}/__motu_frame`,
      })
    }
  }
  return out
}

/** Where the lagoon being looked at sits in that rail, or 0 if it is not in it. */
export function focusIndex(members: RailMember[], repo: string, slug: string): number {
  const at = members.findIndex((m) => m.repo === repo && m.slug === slug)
  return at < 0 ? 0 : at
}
