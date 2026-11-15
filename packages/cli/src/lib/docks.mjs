// DOCKS ACROSS THE PROJECT — `slots: { aside: { dock } }` and `{ slot, dockInto }`, read from every
// archipelago on disk.
//
// The graph is the project's, not one region's: whether base's claim is honoured depends on what
// equipage opens and on whether base composes equipage at all. The verdict is `dockProblems` from
// @motujs/core — the function the lagoon uses to refuse a composed dock state — so the check and the
// preview cannot disagree about which docks are broken.
import { dockProblems, dockStates } from '@motujs/core';
import { readRegions } from './eject.mjs';
import { docksDeclared } from './lagoon-declares.mjs';

/** `{ graph, unreadable }` — every archipelago's dock node, and the ids whose file did not parse. */
export function dockGraphOnDisk(archipelagosDir) {
  const graph = {};
  const unreadable = [];
  const unreadFields = {};
  for (const region of readRegions(archipelagosDir)) {
    const node = docksDeclared(region.file);
    if (node === null) {
      unreadable.push(region.id);
      graph[region.id] = { root: Boolean(region.root), docks: {}, claims: [], refs: {}, islandSlots: [], placements: [] };
      continue;
    }
    if (node.unreadable.length) unreadFields[region.id] = node.unreadable;
    graph[region.id] = node;
  }
  return { graph, unreadable, unreadFields };
}

/**
 * One region's docks as seen from the whole project: what it opens, what it claims, who claims its
 * docks, and what is wrong — only the problems reported ON this region.
 */
export function docksOfRegion(id, archipelagosDir) {
  const { graph, unreadable, unreadFields } = dockGraphOnDisk(archipelagosDir);
  const node = graph[id] ?? { docks: {}, claims: [] };
  const problems = dockProblems(graph).filter((p) => p.region === id);
  const filledBy = Object.entries(graph).flatMap(([other, n]) =>
    n.claims.filter((c) => c.region === id).map((c) => ({ ...c, claimant: other })),
  );
  return {
    docks: node.docks,
    claims: node.claims,
    filledBy,
    problems,
    unreadable: unreadable.includes(id),
    unreadFields: unreadFields[id] ?? [],
    states: dockStates(graph).filter((d) => d.view === id),
  };
}

/** Every composed dock state in the project — what `motu lagoon states` prints. */
export function allDockStates(archipelagosDir) {
  return dockStates(dockGraphOnDisk(archipelagosDir).graph);
}
