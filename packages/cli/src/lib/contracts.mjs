// The generated half of an island's declaration.
//
// An island file used to open with twenty lines transcribing its own component: the props, the
// callback props as events, the host modules it imports. All three are FACTS about code that already
// exists a few directories away, and a fact is not something to review — it is something to derive.
// What was left after removing them is what a person actually decided: the tag, the component, and
// where an event's name differs from the callback's.
//
// So `motu island sync` writes them here, once, for every island, and the island file reads its own
// entry back through the generated `island()` helper. The map is `as const`, so `EventsOf` still sees
// literal event names and `RegionWiringOk` still fails the build on a mistyped wire — the guarantees
// are unchanged, the transcription is gone.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { readComponentContract } from './component-props.mjs';
import { listIslands } from './islands.mjs';
import { readEffectEntries, writeEffectEntry } from './effects.mjs';

export const CONTRACTS_FILE = 'contracts.generated.ts';

/** The `events` override an island file passes to `island()`: callback prop -> the region's word. */
function eventOverrides(text) {
  const at = text.indexOf('events:');
  if (at === -1) return {};
  const open = text.indexOf('{', at);
  if (open === -1) return {};
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}' && --depth === 0) {
      const body = text.slice(open + 1, i);
      return Object.fromEntries([...body.matchAll(/(\w+)\s*:\s*'([^']+)'/g)].map((m) => [m[1], m[2]]));
    }
  }
  return {};
}

/** The component an island file mounts: `{ name, from }`, read off its own import. */
function componentImport(text) {
  const name =
    text.match(/\bcomponent\s*:\s*([A-Za-z_$][\w$]*)/)?.[1] ??
    text.match(/\bisland\(\s*'[^']+'\s*,\s*([A-Za-z_$][\w$]*)/)?.[1];
  if (!name) return null;
  for (const m of text.matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*'([^']+)';/g)) {
    for (const entry of m[1].split(',')) {
      const [exported, alias] = entry.split(/\s+as\s+/).map((n) => n.trim());
      if ((alias ?? exported) === name) return { name: exported, from: m[2] };
    }
  }
  return null;
}

/** What one island declares about itself, read from its file and its component. */
const islandCache = new Map();

export function islandContract(island, util) {
  const cached = islandCache.get(island.element);
  if (cached) return cached;
  const result = islandContractUncached(island, util);
  islandCache.set(island.element, result);
  return result;
}

function islandContractUncached(island, { islandComponentPath, islandComponentExport, names }) {
  const text = readFileSync(island.element, 'utf8');
  const component = componentImport(text);
  const tag = (text.match(/\btag:\s*'([^']+)'/) ?? text.match(/\bisland\(\s*'([^']+)'/))?.[1] ?? `x-${island.kebab}`;
  const { pascal } = names(island.kebab);
  const contract = readComponentContract(islandComponentPath(island.kebab, pascal), islandComponentExport(island.kebab, pascal));
  const overrides = eventOverrides(text);
  const output = {};
  for (const o of contract?.output ?? []) output[o.prop] = overrides[o.prop] ?? o.event;
  // An override for a callback the component does not have is a wire that can never fire; keep it out
  // of the generated map so `RegionWiringOk` reports it instead of blessing it.
  return {
    tag,
    kebab: island.kebab,
    input: contract?.input ?? [],
    output,
    effects: contract?.effects ?? [],
    read: !!contract,
    component,
  };
}

/** Every island's contract, as it will be generated. */
export function projectContracts(islandsDir, util) {
  return listIslands(islandsDir).map((i) => islandContract(i, util));
}

/** Render `contracts.generated.ts`. */
export function renderContracts(contracts) {
  const entry = (c) => {
    const input = c.input.map((p) => `'${p}'`).join(', ');
    const output = Object.entries(c.output).map(([prop, ev]) => `${prop}: '${ev}'`).join(', ');
    // Written back in the AUTHORED form, so the generated file reads like a hand-written one and a
    // person diffing it sees the same vocabulary they would type.
    const effects = c.effects.map((a) => writeEffectEntry(a)).join(', ');
    return [
      `  '${c.tag}': {`,
      `    input: [${input}],`,
      `    output: { ${output} },`,
      `    effects: [${effects}],`,
      '  },',
    ].join('\n');
  };
  const withComponent = contracts.filter((c) => c.component);
  const local = (c) => `C_${c.kebab.replace(/-/g, '_')}`;
  const imports = withComponent
    .map((c) => `import type { ${c.component.name} as ${local(c)} } from '${c.component.from}';`)
    .join('\n');
  const assertions = withComponent
    .map(
      (c) =>
        `const _${c.kebab.replace(/-/g, '_')}: ContractFitsComponent<typeof ${local(c)}, '${c.tag}'> = true;\n` +
        `void _${c.kebab.replace(/-/g, '_')};`,
    )
    .join('\n');
  return `// GENERATED by \`motu island sync\` — do not edit by hand.
//
// Each island's boundary, READ from the component it mounts: the props it takes, the callback props it
// calls (as event names), and everything it reaches that is not a prop. Editing the component changes this file;
// editing this file changes nothing.
//
// The one part that is a decision — an event whose region name differs from the callback's — is
// declared in the island file, as \`island(tag, Component, { events: { onProgress: 'week-progress' } })\`,
// and baked in here so the compiler still sees literal event names.
import { islandElement } from '@motu/react';
${imports}

export const CONTRACTS = {
${contracts.map(entry).join('\n')}
} as const;

type Tag = keyof typeof CONTRACTS;

type PropsOf<C> = C extends (props: infer P, ...rest: never[]) => unknown ? NonNullable<P> : never;

/**
 * The generated contract names only props the component actually has — as a BUILD error.
 *
 * Reading the contract from the component removes the chance of transcribing it wrong, but not the
 * chance of the file going stale: rename a prop and this map still names the old one until the next
 * sync. The assertions below are what makes that a compile failure instead of an island that mounts
 * with a prop nobody fills. Type-only, so nothing here reaches a bundle.
 */
type ContractFitsComponent<C, T extends Tag> = [
  Exclude<
    (typeof CONTRACTS)[T]['input'][number] | keyof (typeof CONTRACTS)[T]['output'],
    keyof PropsOf<C>
  >,
] extends [never]
  ? true
  : ['contract is stale — run \`motu island sync\`; the component has no such prop:', Exclude<
      (typeof CONTRACTS)[T]['input'][number] | keyof (typeof CONTRACTS)[T]['output'],
      keyof PropsOf<C>
    >];

${assertions}

/**
 * Declare an island: its tag, the component it mounts, and nothing that can be derived.
 *
 * \`options.events\` is read by \`motu island sync\` (it is what produced the output names above) and
 * applied here too, so the island is correct even before the next sync.
 */
export function island<T extends Tag>(
  tag: T,
  component: Parameters<typeof islandElement>[0]['component'],
  options?: Record<string, unknown> & { events?: Record<string, string> },
): ReturnType<typeof islandElement> & { options: { contract: (typeof CONTRACTS)[T] } } {
  const { events, ...rest } = options ?? {};
  const base = CONTRACTS[tag];
  const spec = { tag, component, options: { ...rest, contract: { ...base, output: { ...base.output, ...(events ?? {}) } } } };
  return islandElement(spec as never) as never;
}
`;
}

/** Write the contracts file. Returns { path, count, changed }. */
export function syncContracts(islandsDir, util) {
  const out = resolve(islandsDir, CONTRACTS_FILE);
  const next = renderContracts(projectContracts(islandsDir, util));
  const changed = !existsSync(out) || readFileSync(out, 'utf8') !== next;
  if (changed) writeFileSync(out, next);
  return { path: out, count: listIslands(islandsDir).length, changed };
}

/** Is the committed file what the components say it should be? (`motu check`'s drift gate.) */
export function contractsDrift(islandsDir, util) {
  const out = resolve(islandsDir, CONTRACTS_FILE);
  if (!existsSync(out)) return { missing: true, drifted: false };
  const next = renderContracts(projectContracts(islandsDir, util));
  return { missing: false, drifted: readFileSync(out, 'utf8') !== next };
}

/**
 * The generated contracts as data, read from the file rather than recomputed.
 *
 * Eject needs the event names an island declares, and after the short form there is nowhere else to
 * read them: the island file names its component and nothing more. Parsing the generated file keeps
 * eject working off exactly what the build compiled.
 */
export function readGeneratedContracts(islandsDir) {
  const file = resolve(islandsDir, CONTRACTS_FILE);
  if (!existsSync(file)) return {};
  const text = readFileSync(file, 'utf8');
  const start = text.indexOf('export const CONTRACTS');
  if (start === -1) return {};
  const out = {};
  const re = /'([^']+)':\s*\{\s*input:\s*\[([^\]]*)\],\s*output:\s*\{([^}]*)\},\s*effects:\s*\[([\s\S]*?)\],\n/g;
  for (const m of text.slice(start).matchAll(re)) {
    const list = (body) => [...body.matchAll(/'([^']+)'/g)].map((x) => x[1]);
    out[m[1]] = {
      input: list(m[2]),
      output: Object.fromEntries([...m[3].matchAll(/(\w+):\s*'([^']+)'/g)].map((x) => [x[1], x[2]])),
      effects: readEffectEntries(m[4]),
    };
  }
  return out;
}
