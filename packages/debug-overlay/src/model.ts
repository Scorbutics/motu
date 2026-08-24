// What the lens KNOWS, as functions of framework data alone.
//
// Everything here is pure: given the mount registry, an island definition and the observation log, it
// answers a question. No DOM, no React, no subscriptions. That split is the reason the panel could
// become React at all — it used to be interleaved with `document.createElement` calls, so the answer
// and the markup were the same expression and neither could be looked at on its own.

import {
  bindEntries,
  type MountedIslandInfo,
  type IslandDefinition,
} from '@motu/core';
import type { CallEvent, RecordedCall } from '@motu/runtime';

/** How a declared prop is being fed. */
export type PropState = 'bound' | 'bound-empty' | 'static' | 'default';

/**
 * An island's health, in four words. The tones are the kit's — `ok`/`warn`/`broken`/`neutral` are
 * MOTU_VERDICT, which is why the lens' outlines and the review console's shot statuses are the same
 * four colours: they mean the same four things.
 */
export type Verdict = 'ok' | 'warn' | 'broken' | 'neutral';

export interface PropRow {
  name: string;
  state: PropState;
  storeKey?: string;
  value: unknown;
}

export interface CallRecord {
  id: number;
  service: string;
  method: string;
  argsKey: string;
  island: string | null;
  phase: CallEvent['phase'];
  status?: number;
  durationMs?: number;
  error?: string;
}

/** How many contract calls and host intents the lens keeps. */
export const CALL_BUFFER = 200;

/**
 * The store keys an island reads. `bind` values are optional in the type (see IslandSpec), so a
 * declaration that leaves one out must not become an `undefined` key in the graph.
 */
export function bindKeys(info: MountedIslandInfo): string[] {
  return bindEntries(info.spec).map(([, key]) => key);
}

export function computeProps(info: MountedIslandInfo, def: IslandDefinition | undefined): PropRow[] {
  if (!def) return [];
  const bind = Object.fromEntries(bindEntries(info.spec));
  const staticProps = info.spec.props ?? {};
  return def.props.map((name): PropRow => {
    const storeKey = bind[name];
    if (storeKey) {
      const value = info.store.get(storeKey);
      return { name, state: value === undefined ? 'bound-empty' : 'bound', storeKey, value };
    }
    if (name in staticProps) {
      return { name, state: 'static', value: staticProps[name] };
    }
    return { name, state: 'default', value: undefined };
  });
}

// The single most valuable signal: an island whose declared props are ALL sitting at their defaults
// inside a real page usually means broken wiring. 'broken' = every declared prop defaulted; 'warn' =
// some prop is bound to a store key that is empty; 'neutral' = no declared props to reason about.
export function verdictOf(rows: PropRow[]): Verdict {
  if (!rows.length) return 'neutral';
  if (rows.every((r) => r.state === 'default')) return 'broken';
  if (rows.some((r) => r.state === 'bound-empty' || r.state === 'default')) return 'warn';
  return 'ok';
}

export function isolationOf(el: HTMLElement): 'shadow' | 'light' {
  return el.shadowRoot ? 'shadow' : 'light';
}

export function preview(v: unknown): string {
  if (v === undefined) return '∅';
  if (v === null) return 'null';
  if (typeof v === 'string') return v.length > 60 ? JSON.stringify(v.slice(0, 57)) + '…' : JSON.stringify(v);
  try {
    const s = JSON.stringify(v);
    return s.length > 60 ? s.slice(0, 57) + '…' : s;
  } catch {
    return String(v);
  }
}

export function safeKey(args: unknown): string {
  try {
    return JSON.stringify(args);
  } catch {
    return '?';
  }
}

export function ago(ts: number): string {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  return m < 60 ? `${m}m ago` : `${Math.round(m / 60)}h ago`;
}

export function avg(ns: number[]): number {
  return ns.reduce((a, b) => a + b, 0) / ns.length;
}

/**
 * The same module, said in a way that cannot be mistaken for an island: `services/club-feed`.
 *
 * One segment is ambiguous exactly where it matters — a service module is usually named after the
 * thing it serves, which is also what the island reading it is called. On the club screen the bare
 * form put "club-feed" on a hub between the feed and the counters banner, where it reads as the
 * island. The parent segment costs a few pixels and removes the reading.
 */
export function sourceLabel(module: string): string {
  const parts = module.split('/').filter((p) => p && p !== '@' && p !== '.' && p !== '..');
  return parts.slice(-2).join('/') || module;
}

// Serialize captured calls into the SAME request-keyed fixtures module the `motu fixtures record` CLI
// emits, so a human capture drops straight into fixtures.mock.ts.
export function renderRecordedFixtures(calls: RecordedCall[], seed: Record<string, unknown>): string {
  const rows = calls.map((c) => {
    const match = JSON.stringify(c.args);
    // A CAPTURED FAILURE IS A FIXTURE NOW, not a comment. This used to emit the recorded status as
    // two commented lines, because `Fixture` had no way to say "this call answers 500" — the recorder
    // had the truth and nowhere to put it. `FixtureFailure` is that place, so a 500 someone hit while
    // recording becomes a scenario they can look at.
    if (c.status) {
      return `  { service: ${JSON.stringify(c.service)}, method: ${JSON.stringify(c.method)}, match: ${match}, status: ${c.status} },`;
    }
    const response = JSON.stringify(c.response, null, 2)
      .split('\n')
      .map((l, i) => (i === 0 ? l : '    ' + l))
      .join('\n');
    return `  { service: ${JSON.stringify(c.service)}, method: ${JSON.stringify(c.method)}, match: ${match}, response: ${response} },`;
  });
  const seedBlock =
    Object.keys(seed).length > 0
      ? `\n// Host-fed store values (channels + provide) captured this session — pass as the lagoon seed so\n// the island receives REAL host config offline, not a hand-written stub.\nexport const seed: Record<string, unknown> = ${JSON.stringify(seed, null, 2)};\n`
      : '';
  return `// RECORDED in the debug overlay — request-keyed fixtures. Merge the ones you want into fixtures.mock.ts.
import type { Fixture } from '@motu/runtime/mock';

export const fixtures: Fixture[] = [
${rows.join('\n')}
];
${seedBlock}`;
}
