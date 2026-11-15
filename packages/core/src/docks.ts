// DOCKS — one region's island, placed inside ANOTHER region's arrangement.
//
// « Ma Base » (`base`) places « Mon Équipage » (`equipage`) in one of its root props, and the design
// puts base's « Ton Conseil Énergie » column INSIDE equipage's arrangement, beside the rocket. The
// island is base's in every sense — its keys, its intents, the page's callbacks on it — and only its
// DOM position is equipage's. Before this, the application hand-rolled it: equipage's layout kept an
// empty `<div>` handed up by ref, base's layout `createPortal`ed the column into it, and nothing in
// motu knew. The lagoon rendered the two regions apart, `integrate check` saw the island in base only,
// and a refactor that dropped the ref left everything green and the column gone.
//
// BOTH SIDES DECLARE, in `slots` — the map that already answers "what fills this prop of the root":
//
//   // B, the host of the place:         aside:   { dock: 'equipage-aside' }
//   // A, the owner of the island:       conseil: { slot: 'base-conseil', dockInto: { region: 'equipage', dock: 'equipage-aside' } }
//
// So either side's change is caught: B renaming its dock fails A's claim, A claiming a dock B never
// opened fails A, and a second claimant fails both. One verdict function (`dockProblems`) serves the
// CLI's static check and the lagoon's refusal, so the two cannot disagree. See docs/proposals/docks.md.

/** B's side: this root prop is an OPEN slot that a foreign island fills. */
export interface DockSlot {
  dock: string;
}

/** A's side: the island in this root prop is placed in another region's dock. */
export interface DockInto {
  /** The archipelago id of the region whose arrangement holds the dock. */
  region: string;
  /** The dock's name, as that region declares it. */
  dock: string;
  /**
   * Where the island renders when that region is NOT on screen.
   *
   * `here` (the default): where A's root places this prop — the arrangement the page had before the
   * dock existed. `none`: nowhere; the island only makes sense docked.
   */
  fallback?: 'here' | 'none';
}

/** One claim: A's root prop `prop`, filled by A's island `slot`, placed in `region`'s dock `dock`. */
export interface DockClaim {
  prop: string;
  slot: string;
  region: string;
  dock: string;
  fallback: 'here' | 'none';
}

/** The dock a root slot entry OPENS, or undefined. */
export function dockOf(entry: unknown): string | undefined {
  if (!entry || typeof entry !== 'object') return undefined;
  const dock = (entry as { dock?: unknown }).dock;
  return typeof dock === 'string' ? dock : undefined;
}

/** The claim a root slot entry makes on another region's dock, or undefined. */
export function dockIntoOf(entry: unknown): DockInto | undefined {
  if (!entry || typeof entry !== 'object') return undefined;
  const into = (entry as { dockInto?: unknown }).dockInto;
  if (!into || typeof into !== 'object') return undefined;
  const { region, dock, fallback } = into as { region?: unknown; dock?: unknown; fallback?: unknown };
  if (typeof region !== 'string' || typeof dock !== 'string') return undefined;
  return { region, dock, fallback: fallback === 'none' ? 'none' : 'here' };
}

/** prop -> dock name, for every root prop this config opens as a dock. */
export function docksOf(config: { slots?: Record<string, unknown> }): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [prop, entry] of Object.entries(config.slots ?? {})) {
    const dock = dockOf(entry);
    if (dock !== undefined) out[prop] = dock;
  }
  return out;
}

/** Every claim this config makes on another region's dock. */
export function dockClaimsOf(config: { slots?: Record<string, unknown> }): DockClaim[] {
  const out: DockClaim[] = [];
  for (const [prop, entry] of Object.entries(config.slots ?? {})) {
    const into = dockIntoOf(entry);
    if (!into) continue;
    const slot = (entry as { slot?: unknown }).slot;
    out.push({ prop, slot: typeof slot === 'string' ? slot : '', region: into.region, dock: into.dock, fallback: into.fallback ?? 'here' });
  }
  return out;
}

/** `equipage.equipage-aside` — how a dock is named outside its region (addresses, `in`, messages). */
export function dockAddress(region: string, dock: string): string {
  return `${region}.${dock}`;
}

/**
 * One region, as the dock graph sees it — plain data, so the CLI (which parses archipelago files) and
 * the lagoon (which has live configs) build the same thing.
 */
export interface DockNode {
  root: boolean;
  /** prop -> dock name this region opens. */
  docks: Record<string, string>;
  /** Claims this region makes on other regions' docks. */
  claims: DockClaim[];
  /** prop -> region id, for every `{ region }` slot. */
  refs: Record<string, string>;
  /** Every island slot this region declares (its island entries). */
  islandSlots: string[];
  /** Every slot this region places: root `slots` values (island forms) and islands' nested `slots`. */
  placements: { slot: string; where: string }[];
}

export type DockGraph = Record<string, DockNode>;

/** One reason a dock declaration cannot be honoured. `unclaimed` is the only warning. */
export interface DockProblem {
  kind:
    | 'unknown-region'
    | 'unknown-dock'
    | 'taken'
    | 'duplicate-dock'
    | 'self'
    | 'not-composed'
    | 'unknown-slot'
    | 'also-placed'
    | 'no-root'
    | 'unclaimed';
  level: 'error' | 'warn';
  /** The region the problem is reported on. */
  region: string;
  prop?: string;
  dock?: string;
  message: string;
}

/** The graph, from live configs (the lagoon's registry). */
export function dockGraph(
  configs: Record<string, { root?: unknown; slots?: Record<string, unknown>; islands?: readonly { slot?: string; slots?: Record<string, unknown> }[] }>,
): DockGraph {
  const graph: DockGraph = {};
  for (const [id, config] of Object.entries(configs)) {
    const refs: Record<string, string> = {};
    const placements: { slot: string; where: string }[] = [];
    for (const [prop, entry] of Object.entries(config.slots ?? {})) {
      if (typeof entry === 'string') placements.push({ slot: entry, where: `slots.${prop}` });
      else if (entry && typeof entry === 'object') {
        const e = entry as { slot?: unknown; region?: unknown };
        if (typeof e.region === 'string') refs[prop] = e.region;
        else if (typeof e.slot === 'string') placements.push({ slot: e.slot, where: `slots.${prop}` });
      }
    }
    for (const island of config.islands ?? []) {
      for (const [prop, nested] of Object.entries(island.slots ?? {})) {
        const s = typeof nested === 'string' ? nested : (nested as { slot?: unknown } | null)?.slot;
        if (typeof s === 'string') placements.push({ slot: s, where: `${island.slot ?? '?'}.slots.${prop}` });
      }
    }
    graph[id] = {
      root: Boolean(config.root),
      docks: docksOf(config),
      claims: dockClaimsOf(config),
      refs,
      islandSlots: (config.islands ?? []).map((i) => i.slot).filter((s): s is string => typeof s === 'string'),
      placements,
    };
  }
  return graph;
}

/** The region ids on the `{ region }` path from `from` to `to`, `from` excluded — or null. */
export function composePath(graph: Record<string, { refs: Record<string, string> }>, from: string, to: string): string[] | null {
  const walk = (at: string, seen: Set<string>): string[] | null => {
    for (const next of Object.values(graph[at]?.refs ?? {})) {
      if (seen.has(next)) continue;
      if (next === to) return [next];
      seen.add(next);
      const rest = walk(next, seen);
      if (rest) return [next, ...rest];
    }
    return null;
  };
  return from === to ? [] : walk(from, new Set([from]));
}

/**
 * Every dock declaration in the graph that cannot be honoured.
 *
 * Errors are refusals — the lagoon will not compose them and `motu check` fails. `unclaimed` (a dock
 * no region fills) is a warning: B may be built before A, and an open place is not wrong, only empty.
 */
export function dockProblems(graph: DockGraph): DockProblem[] {
  const out: DockProblem[] = [];
  const known = Object.keys(graph).join(', ') || 'none';

  // B's side: each dock declared once per region, on a region with a root.
  for (const [region, node] of Object.entries(graph)) {
    const seen = new Map<string, string>();
    for (const [prop, dock] of Object.entries(node.docks)) {
      if (!node.root) {
        out.push({
          kind: 'no-root', level: 'error', region, prop, dock,
          message: `region "${region}" opens dock "${dock}" on \`${prop}\` but declares no \`root\` — a dock is a ROOT prop, so declare the application's own component as \`root\``,
        });
      }
      const earlier = seen.get(dock);
      if (earlier) {
        out.push({
          kind: 'duplicate-dock', level: 'error', region, prop, dock,
          message: `region "${region}" opens dock "${dock}" twice (\`${earlier}\` and \`${prop}\`) — one name, one place; name the second dock differently`,
        });
      } else seen.set(dock, prop);
    }
  }

  // A's side: each claim against what B opens, what A composes, and what A already places.
  const claimants = new Map<string, { region: string; prop: string }[]>();
  for (const [region, node] of Object.entries(graph)) {
    for (const claim of node.claims) {
      const at = `\`${claim.prop}\` (${claim.slot || '?'})`;
      const target = dockAddress(claim.region, claim.dock);
      if (!node.root) {
        out.push({
          kind: 'no-root', level: 'error', region, prop: claim.prop, dock: target,
          message: `region "${region}" docks ${at} into ${target} but declares no \`root\` — a docked island is a ROOT prop, so declare the application's own component as \`root\``,
        });
      }
      if (!claim.slot || !node.islandSlots.includes(claim.slot)) {
        out.push({
          kind: 'unknown-slot', level: 'error', region, prop: claim.prop, dock: target,
          message: `region "${region}" docks ${at} into ${target}, and "${claim.slot}" is not one of its islands — the docked island must be declared in this region's \`islands\``,
        });
      }
      const elsewhere = node.placements.filter((p) => p.slot === claim.slot && p.where !== `slots.${claim.prop}`);
      if (claim.slot && elsewhere.length) {
        out.push({
          kind: 'also-placed', level: 'error', region, prop: claim.prop, dock: target,
          message: `region "${region}" docks "${claim.slot}" into ${target} AND places it at ${elsewhere.map((p) => p.where).join(', ')} — a docked island has one placement in its own region, the claim's prop (its fallback). Remove the other`,
        });
      }
      if (claim.region === region) {
        out.push({
          kind: 'self', level: 'error', region, prop: claim.prop, dock: target,
          message: `region "${region}" docks ${at} into its OWN dock "${claim.dock}" — a dock is for another region's island; place your own in a slot`,
        });
        continue;
      }
      const host = graph[claim.region];
      if (!host) {
        out.push({
          kind: 'unknown-region', level: 'error', region, prop: claim.prop, dock: target,
          message: `region "${region}" docks ${at} into ${target}, and no region has the id "${claim.region}" (known: ${known})`,
        });
        continue;
      }
      if (!Object.values(host.docks).includes(claim.dock)) {
        const open = Object.values(host.docks);
        out.push({
          kind: 'unknown-dock', level: 'error', region, prop: claim.prop, dock: target,
          message:
            `region "${region}" docks ${at} into ${target}, and "${claim.region}" opens no dock "${claim.dock}" ` +
            `(${open.length ? `it opens: ${open.join(', ')}` : 'it opens none'}) — declare \`<prop>: { dock: '${claim.dock}' }\` in ${claim.region}'s \`slots\``,
        });
        continue;
      }
      if (!composePath(graph, region, claim.region)) {
        out.push({
          kind: 'not-composed', level: 'error', region, prop: claim.prop, dock: target,
          message:
            `region "${region}" docks ${at} into ${target}, but never composes "${claim.region}" — no \`{ region: '${claim.region}' }\` ` +
            `slot leads there, so nothing says the dock is ever on the same screen. Place ${claim.region} in one of ${region}'s root props`,
        });
      }
      const list = claimants.get(target) ?? [];
      list.push({ region, prop: claim.prop });
      claimants.set(target, list);
    }
  }

  // One island per dock: a second claimant is an error, reported on every claimant and on the host.
  for (const [target, list] of claimants) {
    if (list.length < 2) continue;
    const who = list.map((c) => `${c.region}.${c.prop}`).join(' and ');
    const [hostRegion, dock] = [target.slice(0, target.indexOf('.')), target.slice(target.indexOf('.') + 1)];
    for (const c of list) {
      out.push({
        kind: 'taken', level: 'error', region: c.region, prop: c.prop, dock: target,
        message: `dock ${target} is claimed by ${who} — a dock holds ONE island; open a second dock in ${hostRegion} for the other`,
      });
    }
    out.push({
      kind: 'taken', level: 'error', region: hostRegion, dock: target,
      message: `dock "${dock}" is claimed by ${who} — a dock holds ONE island; open a second dock for the other`,
    });
  }

  // An open place nobody fills — a warning.
  for (const [region, node] of Object.entries(graph)) {
    for (const [prop, dock] of Object.entries(node.docks)) {
      if (claimants.has(dockAddress(region, dock))) continue;
      out.push({
        kind: 'unclaimed', level: 'warn', region, prop, dock: dockAddress(region, dock),
        message: `dock "${dock}" (\`${prop}\`) is claimed by no region — it renders as an empty place. Claim it from the region whose island goes there (\`dockInto: { region: '${region}', dock: '${dock}' }\`), or remove it`,
      });
    }
  }
  return out;
}

/**
 * Who fills a dock — `{ region, claim }` — or null when nobody (or the graph refuses the claim).
 * What the lagoon uses to compose a dock state from the HOST's side.
 */
export function dockClaimant(graph: DockGraph, host: string, dock: string): { region: string; claim: DockClaim } | null {
  const refused = new Set(dockProblems(graph).filter((p) => p.level === 'error' && p.dock === dockAddress(host, dock)).map((p) => `${p.region}.${p.prop}`));
  for (const [region, node] of Object.entries(graph)) {
    for (const claim of node.claims) {
      if (claim.region === host && claim.dock === dock && !refused.has(`${region}.${claim.prop}`)) return { region, claim };
    }
  }
  return null;
}

/**
 * Every composed dock state the graph declares, as `{ view, host, dock }`: one viewed from the
 * claimant (A, with B loaded in place) and one from the host (B, with A's island as a guest). The list
 * `motu lagoon states` prints and the lagoon accepts — a composition nobody declared is not a state.
 */
export function dockStates(graph: DockGraph): { view: string; host: string; dock: string; claimant: string; slot: string }[] {
  const out: { view: string; host: string; dock: string; claimant: string; slot: string }[] = [];
  const errors = dockProblems(graph).filter((p) => p.level === 'error');
  for (const [region, node] of Object.entries(graph)) {
    for (const claim of node.claims) {
      const target = dockAddress(claim.region, claim.dock);
      if (errors.some((p) => p.dock === target && (p.region === region || p.region === claim.region))) continue;
      out.push({ view: region, host: claim.region, dock: claim.dock, claimant: region, slot: claim.slot });
      out.push({ view: claim.region, host: claim.region, dock: claim.dock, claimant: region, slot: claim.slot });
    }
  }
  return out;
}
