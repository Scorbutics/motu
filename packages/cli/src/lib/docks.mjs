// DOCKS ACROSS THE PROJECT — `slots: { aside: { dock } }` and `{ slot, dockInto }`, read from every
// archipelago on disk.
//
// The graph is the project's, not one region's: whether base's claim is honoured depends on what
// equipage opens and on whether base composes equipage at all. The verdict is `dockProblems` from
// @motujs/core — the function the lagoon uses to refuse a composed dock state — so the check and the
// preview cannot disagree about which docks are broken.
import { existsSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { SyntaxKind } from 'ts-morph';
import { composePath, dockProblems, dockStates } from '@motujs/core';
import { readRegions } from './eject.mjs';
import { docksDeclared } from './lagoon-declares.mjs';
import { sourceFileAt } from './ts-project.mjs';
import { paths, resolveAppImport } from './util.mjs';

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

/**
 * The OTHER regions on screen in this region's composed dock states — the dock's region (and every
 * region on the `{ region }` path to it) when this region claims, the claimant when it hosts. What a
 * composed flow's lane renders besides this region, so whose asks those may be.
 */
export function composedRegionsOf(id, archipelagosDir) {
  const { graph } = dockGraphOnDisk(archipelagosDir);
  const out = new Set();
  for (const s of dockStates(graph).filter((d) => d.view === id)) {
    if (s.claimant === id) for (const r of composePath(graph, id, s.host) ?? [s.host]) out.add(r);
    else out.add(s.claimant);
  }
  out.delete(id);
  return [...out];
}

/** Every composed dock state in the project — what `motu lagoon states` prints. */
export function allDockStates(archipelagosDir) {
  return dockStates(dockGraphOnDisk(archipelagosDir).graph);
}

/**
 * Does this region's ROOT render every dock prop it opens? Shared by `archipelago verify` (here) and
 * `integrate check` (integration.mjs). Reports through `add(level, check, msg)`; returns how many dock
 * props the root provably never renders.
 */
export function dockRootFindings(region, docks, filledBy, add) {
  const props = Object.keys(docks ?? {});
  if (!props.length) return 0;
  const r = rootRendersProps(region, props);
  if (r.unread) {
    add('warn', 'dock', `could not read whether ${region.root ?? 'the root'} renders its dock prop(s) ${props.join(', ')} — ${r.unread}`);
    return 0;
  }
  const where = paths.rel(r.file);
  for (const prop of r.missing) {
    const dock = docks[prop];
    const guests = (filledBy ?? []).filter((f) => f.dock === dock).map((f) => `${f.claimant}'s ${f.slot}`);
    add(
      'error',
      'dock',
      `dock "${dock}" is the root prop \`${prop}\`, and ${r.component} (${where}) never renders it — ` +
        (guests.length ? `${guests.join(', ')}, docked there, has no place to land. ` : 'whatever docks there has no place to land. ') +
        `Render {${prop}} where the dock belongs in ${where}`,
    );
  }
  for (const prop of r.unknown) {
    add('warn', 'dock', `dock "${docks[prop]}" (\`${prop}\`): ${r.component} (${where}) hands its props on without naming \`${prop}\` — whether it renders it is not readable from the source`);
  }
  const rendered = props.filter((p) => !r.missing.includes(p) && !r.unknown.includes(p));
  if (rendered.length) add('ok', 'dock', `${r.component} (${where}) renders dock prop(s) ${rendered.join(', ')}`);
  return r.missing.length;
}

/**
 * DOES THE ROOT RENDER THESE PROPS? — read from the root component's own source.
 *
 * A dock is a root prop motu fills. If B's root never renders that prop (`{aside}` dropped from the
 * layout in a refactor), the docked island has no place to land: the static `dock` check and
 * `integrate check` both passed, and only `--runtime` noticed. The prop being DECLARED in the
 * component's signature says nothing; what matters is whether the body ever USES it.
 *
 * Conservative, so it is only ever wrong in the direction of silence: a prop is "missing" only when
 * the component provably never references it — destructured and never mentioned, or not destructured
 * at all with no rest/spread that could carry it. A `{...rest}` / `{...props}` spread, or a shape this
 * cannot follow, is `unknown`, never missing.
 *
 * Returns `{ file, component, missing: string[], unknown: string[], unread: string | null }`.
 */
export function rootRendersProps(region, props) {
  const out = { file: null, component: region?.root ?? null, missing: [], unknown: [], unread: null };
  if (!region?.root || !region.rootFrom) {
    out.unread = region?.root ? `\`${region.root}\` is not imported by a path motu can follow` : 'no `root` declared';
    return out;
  }
  const file = moduleFile(resolveAppImport(region.file, region.rootFrom));
  if (!file) {
    out.unread = `${region.rootFrom} (where \`${region.root}\` is imported from) does not resolve to a file`;
    return out;
  }
  out.file = file;
  let found;
  try {
    found = componentFunction(file, region.root, 0);
  } catch (err) {
    out.unread = `${file} could not be parsed (${String(err?.message ?? err).split('\n')[0]})`;
    return out;
  }
  if (!found) {
    out.unread = `\`${region.root}\` is not a function component declared in ${file}`;
    return out;
  }
  out.file = found.file;
  for (const prop of props) {
    const v = propUse(found.fn, prop);
    if (v === 'missing') out.missing.push(prop);
    else if (v === 'unknown') out.unknown.push(prop);
  }
  return out;
}

function moduleFile(base) {
  if (!base) return null;
  const isFile = (p) => existsSync(p) && statSync(p).isFile();
  return ['.tsx', '.ts', '.jsx', '.js', '', '/index.tsx', '/index.ts'].map((x) => base + x).find(isFile) ?? null;
}

/** The function node of component `name` in `file`, following one `export { name } from './x'` hop. */
function componentFunction(file, name, hops) {
  const sf = sourceFileAt(file, { allowJs: true, jsx: 4 });
  const unwrap = (node) => {
    // memo(…) / forwardRef(…) / React.memo(…): the component is the first argument.
    for (let n = node, i = 0; n && i < 3; i++) {
      const k = n.getKind();
      if (k === SyntaxKind.ArrowFunction || k === SyntaxKind.FunctionExpression) return n;
      if (k === SyntaxKind.CallExpression) n = n.getArguments()[0];
      else if (k === SyntaxKind.ParenthesizedExpression || k === SyntaxKind.AsExpression || k === SyntaxKind.SatisfiesExpression) n = n.getExpression();
      else return null;
    }
    return null;
  };
  const fn = sf.getFunction(name) ?? unwrap(sf.getVariableDeclaration(name)?.getInitializer());
  if (fn) return { fn, file };
  if (hops > 1) return null;
  for (const ed of sf.getExportDeclarations()) {
    const spec = ed.getModuleSpecifierValue();
    if (!spec?.startsWith('.')) continue;
    const named = ed.getNamedExports().find((e) => (e.getAliasNode()?.getText() ?? e.getName()) === name);
    if (!named) continue;
    const next = moduleFile(resolve(dirname(file), spec).replace(/\.(js|jsx|ts|tsx)$/, ''));
    if (next) return componentFunction(next, named.getName(), hops + 1);
  }
  return null;
}

/** 'used' | 'missing' | 'unknown' — whether function component `fn` references root prop `prop`. */
function propUse(fn, prop) {
  const param = fn.getParameters()[0];
  if (!param) return 'missing';
  const body = fn.getBody();
  if (!body) return 'unknown';
  const mentions = (ident) => references(body, ident) > 0;
  const pattern = param.getNameNode();
  if (pattern.getKind() === SyntaxKind.ObjectBindingPattern) {
    let rest = null;
    for (const el of pattern.getElements()) {
      if (el.getDotDotDotToken()) {
        rest = el.getName();
        continue;
      }
      const key = el.getPropertyNameNode()?.getText() ?? el.getName();
      if (key.replace(/^['"]|['"]$/g, '') !== prop) continue;
      const local = el.getNameNode();
      if (local.getKind() !== SyntaxKind.Identifier) return 'unknown'; // a nested pattern: not followed
      return mentions(local.getText()) ? 'used' : 'missing';
    }
    if (rest) return restUse(body, rest, prop);
    return 'missing';
  }
  if (pattern.getKind() === SyntaxKind.Identifier) return restUse(body, pattern.getText(), prop);
  return 'unknown';
}

/** A props bag (`props` or `...rest`): `bag.prop` is a use, a spread or any other escape is unknown. */
function restUse(body, bag, prop) {
  for (const i of body.getDescendantsOfKind(SyntaxKind.Identifier)) {
    if (i.getText() !== bag) continue;
    const parent = i.getParent();
    if (parent?.getKind() === SyntaxKind.PropertyAccessExpression && parent.getExpression() === i && parent.getName() === prop) return 'used';
    if (parent?.getKind() === SyntaxKind.ElementAccessExpression && parent.getExpression() === i) {
      const arg = parent.getArgumentExpression()?.getText().replace(/^['"`]|['"`]$/g, '');
      if (arg === prop) return 'used';
    }
  }
  // `const { aside } = props` inside the body: follow it once.
  for (const decl of body.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
    if (decl.getInitializer()?.getText() !== bag) continue;
    const p = decl.getNameNode();
    if (p.getKind() !== SyntaxKind.ObjectBindingPattern) continue;
    const el = p.getElements().find((e) => (e.getPropertyNameNode()?.getText() ?? e.getName()) === prop);
    if (el) {
      // The binding itself is one reference-shaped identifier; a use is any other.
      return references(body, el.getName()) > 1 ? 'used' : 'missing';
    }
  }
  // Every other mention: `bag.other` reads a different prop; anything else (a spread, the bag handed
  // on, a destructure this did not follow) could carry this one.
  let escapes = false;
  for (const i of body.getDescendantsOfKind(SyntaxKind.Identifier)) {
    if (i.getText() !== bag) continue;
    const parent = i.getParent();
    if (parent?.getKind() === SyntaxKind.PropertyAccessExpression && parent.getExpression() === i) continue;
    if (parent?.getKind() === SyntaxKind.JsxAttribute) continue;
    escapes = true;
  }
  return escapes ? 'unknown' : 'missing';
}

/**
 * How many identifiers in `node` named `name` are REFERENCES — not a JSX attribute's name
 * (`<Child aside={x} />` does not use `aside`), a member name (`o.aside`) or an object key.
 */
function references(node, name) {
  return node.getDescendantsOfKind(SyntaxKind.Identifier).filter((i) => {
    if (i.getText() !== name) return false;
    const parent = i.getParent();
    const k = parent?.getKind();
    if (k === SyntaxKind.JsxAttribute) return false;
    if (k === SyntaxKind.PropertyAccessExpression && parent.getNameNode() === i) return false;
    if (k === SyntaxKind.PropertyAssignment && parent.getNameNode() === i) return false;
    if (k === SyntaxKind.BindingElement && parent.getPropertyNameNode?.() === i) return false;
    return true;
  }).length;
}
