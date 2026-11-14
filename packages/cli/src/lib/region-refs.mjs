// REGIONS INSIDE REGIONS — `slots: { prop: { region: '<id>' } }`, read from every archipelago on disk.
//
// The graph is the project's, not one region's: whether `base → equipage` is a cycle depends on what
// `equipage` references, so a single file cannot answer it. The verdict on the graph is
// `regionRefProblems` from @motujs/core — the same function the lagoon uses to refuse a placeholder — so
// the check and the preview cannot disagree about which references are broken.
import { regionRefProblems } from '@motujs/core';
import { readRegions } from './eject.mjs';
import { regionRefsDeclared } from './lagoon-declares.mjs';

/**
 * `{ graph, unreadable }` — every archipelago's root-ness and references, and the ids whose file did
 * not parse (their references are unknown, which is not the same as none).
 */
export function regionRefGraphOnDisk(archipelagosDir) {
  const graph = {};
  const unreadable = [];
  for (const region of readRegions(archipelagosDir)) {
    const refs = regionRefsDeclared(region.file);
    if (refs === null) unreadable.push(region.id);
    graph[region.id] = { root: Boolean(region.root), refs: refs ?? {} };
  }
  return { graph, unreadable };
}

/**
 * What one region's references look like from the whole graph: the props it fills with another
 * region, what is wrong with them, and who fills a slot with IT.
 */
export function regionRefsOf(id, archipelagosDir) {
  const { graph, unreadable } = regionRefGraphOnDisk(archipelagosDir);
  const refs = graph[id]?.refs ?? {};
  const problems = regionRefProblems(graph).filter((p) => p.region === id);
  const referencedBy = Object.entries(graph).filter(([other]) => other !== id).flatMap(([other, node]) =>
    Object.entries(node.refs)
      .filter(([, ref]) => ref === id)
      .map(([prop]) => `${other}.${prop}`),
  );
  return { refs, problems, referencedBy, unreadable: unreadable.includes(id) };
}
