// WORLDS: named answers for the states no flow can reach (docs/proposals/worlds.md).
//
// A flow drives what the lagoon was handed, and the lagoon was handed ONE set of answers: the member,
// what each source's port returns, the wire's tables, the clock. A paused member, "no week created
// yet", a later "now" — states production reaches every day — were unreachable by any flow, and the
// only advice coverage could give ("widen the seeds") pinned the very keys a source should produce.
//
// A world is a named overlay on what the override file ALREADY declares — a region's seed, the args a
// source's channel is built with, the wire, the page's props — plus FACTS, values a lagoon stand-in reads
// instead of a constant. It adds no new kind of thing, and it never touches the app's code: a source
// still runs, only its port answers differently.
//
// The overlay is applied in `regionOverrides`, the one reader both entries share, so the gallery a
// person opens and the focused entry every check drives see the same world.
import { channelSourceId, channelWithArgs } from '@motu/core';

/** What a world may re-answer for one region. Everything else about the region stays as declared. */
export interface WorldRegion {
  /** Overlays the region's seed (shallow). Never a key a source of the region produces — see `world-pins`. */
  seed?: Record<string, unknown>;
  /** Per declared source id: the args its channel is rebuilt with. The source itself still runs. */
  channels?: Record<string, readonly unknown[]>;
  /** Replaces the region's wire (tables and fixtures beneath the app's own client). */
  wire?: unknown;
  /** Per slot: what the page passes an island that is not region state (merged over the declared props). */
  props?: Record<string, Record<string, unknown>>;
}

export interface WorldSpec {
  /** Build on another world, explicitly. Worlds are never combined implicitly. */
  extends?: string;
  /** One sentence: what is true in this world that is not in the default one. */
  description?: string;
  regions?: Record<string, WorldRegion>;
  /** Values a lagoon stand-in reads with `worldFact(name, fallback)` instead of a constant. */
  facts?: Record<string, unknown>;
}

export type Worlds = Record<string, WorldSpec>;

/** Declare the project's worlds. An identity function: the declaration is the data. */
export function defineWorlds<const W extends Worlds>(worlds: W): W {
  return worlds;
}

export const DEFAULT_WORLD = 'default';

let declared: Worlds = {};
let active = DEFAULT_WORLD;
const listeners = new Set<(id: string) => void>();

/** Hand the lagoon the project's worlds. Called by both entries with the override module's `worlds`. */
export function installWorlds(worlds: Worlds | undefined): void {
  declared = worlds ?? {};
}

export function declaredWorlds(): string[] {
  return Object.keys(declared);
}

export function worldExists(id: string | null | undefined): boolean {
  return !id || id === DEFAULT_WORLD || Object.prototype.hasOwnProperty.call(declared, id);
}

export function currentWorld(): string {
  return active;
}

export function describeWorld(id: string): string | undefined {
  return declared[id]?.description;
}

/**
 * Make `id` the active world. False (and nothing changes) when no such world is declared: a name that
 * resolves to nothing must refuse, never quietly be the default. Listeners — the entries — remount
 * what is on screen, so its channels are reinstalled with the new answers.
 */
export function setWorld(id: string | null | undefined): boolean {
  const next = id || DEFAULT_WORLD;
  if (!worldExists(next)) return false;
  if (next === active) return true;
  active = next;
  for (const l of listeners) {
    try {
      l(next);
    } catch {
      /* a listener's own problem */
    }
  }
  return true;
}

export function onWorldChange(listener: (id: string) => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/** The chain from `id` to its root, root first, so later worlds override earlier ones. */
function chain(id: string): WorldSpec[] {
  const out: WorldSpec[] = [];
  const seen = new Set<string>();
  for (let cur: string | undefined = id; cur && cur !== DEFAULT_WORLD && !seen.has(cur); cur = declared[cur]?.extends) {
    seen.add(cur);
    const spec = declared[cur];
    if (!spec) break;
    out.unshift(spec);
  }
  return out;
}

/**
 * A fact of the active world, or `fallback` when no world in its chain sets it. The same object for
 * the same world, every time — a stand-in that hands it to a React context keeps its identity.
 */
export function worldFact<T>(name: string, fallback: T): T {
  let value: unknown = fallback;
  for (const spec of chain(active)) if (spec.facts && name in spec.facts) value = spec.facts[name];
  return value as T;
}

/**
 * One value per world, built once: for a stand-in whose context object must keep its identity
 * (`useMember()` returning a fresh object every render re-runs every effect that depends on it).
 */
export function perWorld<T>(build: () => T): () => T {
  const cache = new Map<string, T>();
  return () => {
    if (!cache.has(active)) cache.set(active, build());
    return cache.get(active)!;
  };
}

/** The active world's overlay for one region, merged through its `extends` chain. */
export function worldRegion(regionId: string): WorldRegion | null {
  const parts = chain(active).map((s) => s.regions?.[regionId]).filter(Boolean) as WorldRegion[];
  if (!parts.length) return null;
  const out: WorldRegion = {};
  for (const p of parts) {
    if (p.seed) out.seed = { ...(out.seed ?? {}), ...p.seed };
    if (p.channels) out.channels = { ...(out.channels ?? {}), ...p.channels };
    if (p.wire !== undefined) out.wire = p.wire;
    if (p.props) {
      out.props = { ...(out.props ?? {}) };
      for (const [slot, props] of Object.entries(p.props)) out.props[slot] = { ...(out.props[slot] ?? {}), ...props };
    }
  }
  return out;
}

/** Rebuilt channels, cached per (channel, world) so a region's channel keeps its identity in one world. */
const rebuilt = new WeakMap<object, Map<string, unknown>>();

/**
 * Apply the active world to a region's resolved overrides. Called by `regionOverrides`, the one reader
 * both entries share. Fields are typed loosely here because the overlay is data the static
 * `worlds` check validates against the archipelago (region ids, source ids, region keys, slots).
 */
export function applyWorld<O extends { seed?: unknown; channels?: readonly unknown[]; wire?: unknown; props?: unknown }>(regionId: string, merged: O): O {
  const w = worldRegion(regionId);
  // A LEDGER of what each world overlay did, for the checks and for a person asking "is the world on?":
  // which region, which world, which sources were re-answered.
  const ledger = ((globalThis as { __motuWorldApplied?: { region: string; world: string; swapped: string[] }[] }).__motuWorldApplied ??= []);
  if (!w) return merged;
  const out = { ...merged } as O & Record<string, unknown>;
  if (w.seed) out.seed = { ...((merged.seed as Record<string, unknown>) ?? {}), ...w.seed } as O['seed'];
  if (w.props) {
    const base = (merged.props as Record<string, Record<string, unknown>> | undefined) ?? {};
    const props: Record<string, Record<string, unknown>> = { ...base };
    for (const [slot, p] of Object.entries(w.props)) props[slot] = { ...(base[slot] ?? {}), ...p };
    out.props = props as O['props'];
  }
  if (w.wire !== undefined) out.wire = w.wire as O['wire'];
  const swapped: string[] = [];
  if (w.channels && merged.channels) {
    out.channels = merged.channels.map((ch) => {
      const source = channelSourceId(ch);
      const args = source ? w.channels![source] : undefined;
      if (!args || typeof ch !== 'function') return ch;
      swapped.push(source!);
      const byWorld = rebuilt.get(ch as object) ?? new Map<string, unknown>();
      rebuilt.set(ch as object, byWorld);
      if (!byWorld.has(active)) byWorld.set(active, channelWithArgs(ch, args) ?? ch);
      return byWorld.get(active);
    }) as O['channels'];
  }
  ledger.push({ region: regionId, world: active, swapped });
  if (ledger.length > 200) ledger.splice(0, ledger.length - 200);
  return out as O;
}
