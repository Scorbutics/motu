// `motu check — worlds`: do the declared worlds hold together, and does every one earn its place?
//
// A WORLD (docs/proposals/worlds.md) is a named overlay on what the lagoon override file already
// declares — a region's seed, a source's channel args, its wire, page props — plus facts a lagoon
// stand-in reads. Statically, without a browser:
//
//   world-declared  every name resolves: a flow's `world`, a world's region, its source ids, its slots,
//                   its `extends`. A name that resolves to nothing is an error, as in an address.
//   world-used      a world no flow names is a warning: nothing without a caller (the roadmap's rule).
//   world-pins      a flow in a world, or a world's own seed, must not seed a key one of the region's
//                   SOURCES produces. A seeded key is pinned and the source can never move it — the trap
//                   that kept Peps' week navigator on the current week while showing a past one.
//
// `world-differs` (does the world change anything?) needs a browser, and runs with the region's flows.
//
// READ, NOT EVALUATED: the override file imports the application, which plain node cannot load.
import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { SyntaxKind } from 'ts-morph';
import { paths, resolveAppImport } from './util.mjs';
import { sourceFileAt } from './ts-project.mjs';
import { readRegions } from './eject.mjs';
import { declaredSourcesOf } from './declared-sources.mjs';
import { screensFile } from './screens.mjs';

const text = (node) =>
  node && (node.getKind() === SyntaxKind.StringLiteral || node.getKind() === SyntaxKind.NoSubstitutionTemplateLiteral)
    ? node.getLiteralText()
    : null;
const nameOf = (prop) => (prop.getNameNode?.()?.getText?.() ?? '').replace(/^['"`]|['"`]$/g, '');
const objectKeys = (obj) =>
  obj?.getKind?.() === SyntaxKind.ObjectLiteralExpression
    ? obj.getProperties().filter((p) => p.getKind() === SyntaxKind.PropertyAssignment || p.getKind() === SyntaxKind.ShorthandPropertyAssignment).map(nameOf)
    : [];
const propOf = (obj, name) => (obj?.getKind?.() === SyntaxKind.ObjectLiteralExpression ? obj.getProperty?.(name)?.getInitializer?.() : undefined);

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e.startsWith('.')) continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|mts)$/.test(e)) out.push(p);
  }
  return out;
}

/**
 * The project's declared worlds, read from the first `defineWorlds({…})` in the lagoon's sources.
 * Null when none is declared — then no section is printed at all.
 */
export function declaredWorldsStatic() {
  for (const file of walk(resolve(paths.lagoonDir, 'src'))) {
    let sf;
    try {
      sf = sourceFileAt(file, { allowJs: true, jsx: 4 });
    } catch {
      continue;
    }
    const call = sf
      .getDescendantsOfKind(SyntaxKind.CallExpression)
      .find((c) => c.getExpression().getText() === 'defineWorlds');
    if (!call) continue;
    const obj = call.getArguments()[0];
    const worlds = {};
    for (const w of obj?.getKind?.() === SyntaxKind.ObjectLiteralExpression ? obj.getProperties() : []) {
      const id = nameOf(w);
      const spec = w.getInitializer?.();
      const regions = {};
      const regionsObj = propOf(spec, 'regions');
      for (const r of regionsObj?.getKind?.() === SyntaxKind.ObjectLiteralExpression ? regionsObj.getProperties() : []) {
        const ov = r.getInitializer?.();
        regions[nameOf(r)] = {
          seed: objectKeys(propOf(ov, 'seed')),
          channels: objectKeys(propOf(ov, 'channels')),
          props: objectKeys(propOf(ov, 'props')),
          wire: !!propOf(ov, 'wire'),
        };
      }
      worlds[id] = {
        extends: text(propOf(spec, 'extends')),
        regions,
        facts: objectKeys(propOf(spec, 'facts')),
        line: w.getStartLineNumber(),
      };
    }
    return { file, worlds };
  }
  return null;
}

/** `scenarios` in an evidence file, as written: name, world, seed keys, and (screens) the start screen. */
export function flowsWorlds(file) {
  if (!existsSync(file)) return [];
  let sf;
  try {
    sf = sourceFileAt(file, { allowJs: true });
  } catch {
    return [];
  }
  const decl = sf.getVariableDeclaration('scenarios');
  const arr = decl?.getInitializer?.();
  const list = arr?.getKind?.() === SyntaxKind.AsExpression ? arr.getExpression() : arr;
  if (list?.getKind?.() !== SyntaxKind.ArrayLiteralExpression) return [];
  return list
    .getElements()
    .filter((e) => e.getKind() === SyntaxKind.ObjectLiteralExpression)
    .map((o) => ({
      name: text(propOf(o, 'name')) ?? '(unnamed flow)',
      world: text(propOf(o, 'world')),
      screen: text(propOf(o, 'screen')),
      seed: objectKeys(propOf(o, 'seed')),
      line: o.getStartLineNumber(),
    }));
}

/**
 * Which keys each of a region's RUNNING sources produces — the ones declared by reference, which a
 * channel installs and which keep moving their keys in the lagoon. Their `produces` lives in their own
 * module, resolved and read here.
 *
 * A source declared by MODULE NAME (`activity: { module, produces }`) is a claim about the page's code;
 * nothing installs it in the lagoon, so its keys only ever hold what was seeded. Seeding them pins
 * nothing, and a world re-answers them through `seed` — so they are left out here, deliberately.
 */
export function producedKeys(archipelagoFile) {
  const out = {};
  for (const [id, src] of Object.entries(declaredSourcesOf(archipelagoFile))) {
    if (!src.byReference || !src.module) continue;
    let keys = [];
    const base = resolveAppImport(archipelagoFile, src.module);
    const file = base && ['', '.ts', '.tsx', '.js', '/index.ts', '/index.tsx'].map((x) => base + x).find((f) => existsSync(f) && statSync(f).isFile());
    if (file) {
      try {
        const sf = sourceFileAt(file, { allowJs: true, jsx: 4 });
        const prop = sf
          .getDescendantsOfKind(SyntaxKind.PropertyAssignment)
          .find((p) => nameOf(p) === 'produces' && p.getInitializer()?.getKind() === SyntaxKind.ArrayLiteralExpression);
        keys = prop ? prop.getInitializer().getElements().map(text).filter(Boolean) : [];
      } catch {
        keys = [];
      }
    }
    out[id] = keys;
  }
  return out;
}

/** The findings, in the `{ level, check, msg }` shape the screens section already prints. */
export function worldFindings() {
  const declared = declaredWorldsStatic();
  if (!declared) return null;
  const regions = readRegions(paths.archipelagosDir).map((r) => ({
    id: r.id,
    slots: (r.islands ?? []).map((i) => i.slot),
    sources: producedKeys(paths.archipelagoFile(r.id)),
    flows: flowsWorlds(paths.archipelagoEvidence(r.id)),
  }));
  const screenFlows = flowsWorlds(resolve(dirname(screensFile()), 'screens.evidence.ts'));
  const findings = judgeWorlds({ worlds: declared.worlds, regions, screenFlows, where: (line) => `${paths.rel(declared.file)}:${line}` });
  return { file: declared.file, worlds: Object.keys(declared.worlds), findings };
}

/**
 * The rules, over what was read: no file system, so each is testable on its own.
 * `regions`: `[{ id, slots, sources: { sourceId: producedKeys[] }, flows }]`.
 */
export function judgeWorlds({ worlds, regions: regionList, screenFlows = [], where = (line) => `line ${line}` }) {
  const findings = [];
  const add = (level, check, msg) => findings.push({ level, check, msg });
  const ids = new Set(['default', ...Object.keys(worlds)]);
  const regions = new Map(regionList.map((r) => [r.id, r]));
  const producedBy = (sources) => new Map(Object.entries(sources).flatMap(([s, keys]) => keys.map((k) => [k, s])));

  // world-declared: what a world names.
  let named = 0;
  for (const [id, w] of Object.entries(worlds)) {
    if (w.extends && !ids.has(w.extends)) add('error', 'world-declared', `world "${id}" extends "${w.extends}", which is not declared (${where(w.line)})`);
    for (const [rid, ov] of Object.entries(w.regions ?? {})) {
      named++;
      const region = regions.get(rid);
      if (!region) {
        add('error', 'world-declared', `world "${id}" re-answers region "${rid}", which does not exist (${where(w.line)})`);
        continue;
      }
      const sources = region.sources;
      for (const ch of ov.channels ?? []) {
        if (!(ch in sources)) add('error', 'world-declared', `world "${id}" re-answers source "${ch}" of ${rid}, which has no source a channel installs under that name — installable: ${Object.keys(sources).join(', ') || 'none'} (a source declared by module name is re-answered through \`seed\`)`);
      }
      const slots = new Set(region.slots);
      for (const slot of ov.props ?? []) if (!slots.has(slot)) add('error', 'world-declared', `world "${id}" passes props to slot "${slot}" of ${rid}, which has no such slot`);
      // world-pins, on the world's own seed.
      const produced = producedBy(sources);
      for (const key of ov.seed ?? []) {
        if (produced.has(key)) add('error', 'world-pins', `world "${id}" seeds ${rid}.${key}, which source "${produced.get(key)}" produces — a seeded key is pinned and the source can never move it. Re-answer the source instead (\`channels: { ${produced.get(key)}: [...] }\`)`);
      }
    }
  }

  // world-declared / world-pins / world-used: what flows name.
  const users = new Map([...ids].map((id) => [id, 0]));
  let flowsSeen = 0;
  for (const region of regions.values()) {
    const produced = producedBy(region.sources);
    for (const f of region.flows) {
      flowsSeen++;
      if (!f.world) continue;
      if (!ids.has(f.world)) {
        add('error', 'world-declared', `${region.id} flow "${f.name}" names world "${f.world}", which is not declared — declared: ${[...ids].join(', ')}`);
        continue;
      }
      users.set(f.world, users.get(f.world) + 1);
      for (const key of f.seed) {
        if (produced.has(key)) add('error', 'world-pins', `${region.id} flow "${f.name}" (world "${f.world}") seeds ${key}, which source "${produced.get(key)}" produces — it is pinned, and the world's answer for that source can never show`);
      }
    }
  }
  for (const f of screenFlows) {
    flowsSeen++;
    if (!f.world) continue;
    if (!ids.has(f.world)) add('error', 'world-declared', `screen flow "${f.name}" names world "${f.world}", which is not declared`);
    else users.set(f.world, users.get(f.world) + 1);
  }
  // A world another world EXTENDS is used through it.
  for (const w of Object.values(worlds)) if (w.extends && users.has(w.extends) && users.get(w.extends) === 0) users.set(w.extends, -1);
  for (const [id, n] of users) {
    if (id === 'default') continue;
    if (!n) add('warn', 'world-used', `no flow runs in world "${id}" — a world nobody uses is a removal candidate (${where(worlds[id].line)})`);
  }

  if (!findings.some((f) => f.level === 'error' && f.check === 'world-declared')) {
    add('ok', 'world-declared', `${ids.size - 1} world(s), every name resolves · ${named} region overlay(s), ${flowsSeen} flow(s) read`);
  }
  if (!findings.some((f) => f.check === 'world-pins')) add('ok', 'world-pins', 'no world or world flow pins a key a source produces');
  return findings;
}
