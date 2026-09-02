// EJECT — materialise the wiring the archipelago was holding, so removing motu is a no-op for the
// APP rather than for the framework's convenience (docs/plan-key-ownership.md, D1).
//
// Removal used to be "delete motu's files, unwrap motu's tags". That works only while the host also
// keeps its own copy of every coupling — which is exactly the duplication ownership exists to remove:
// once a key is an island's to produce, the page reads it (`useRegionValue`) and seeds it
// (`seedArchipelago`) instead of deriving it, and unwrapping alone would leave those calls dangling.
//
// So before the tags come off, this generates the plain-React equivalent:
//
//   const overallProgress = useRegionValue('overallProgress') ?? 0    // read
//        ->  const [overallProgress, setOverallProgress] = useState(0)
//   seedArchipelago(arch, 'weekMissions', m)                          // seed
//        ->  setWeekMissions(m)
//   <Island slot="week-actions"><WeekActionsView … />                 // producer
//        ->  <WeekActionsView … onProgress={(d) => { setOverallProgress(d.overallProgress); … }} />
//
// It is a CODEMOD, not a refactor: it may leave state the page also keeps under another name. That is
// the honest trade — the ejected app compiles and behaves the same, and a human can tidy after.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { blankComments as blankCommentsShared } from './util.mjs';
import { dirname, resolve } from 'node:path';
import { SyntaxKind } from 'ts-morph';
import { readGeneratedContracts } from './contracts.mjs';

/**
 * Read every archipelago's wiring from its config file: slot -> { element, writes }.
 *
 * Parsed from source rather than imported: the config is TypeScript with app imports, and eject runs
 * in node with no bundler. Only literal shapes are read — anything computed is reported, not guessed.
 */
export function readRegions(archipelagosDir) {
  const regions = [];
  if (!existsSync(archipelagosDir)) return regions;
  for (const entry of readdirSync(archipelagosDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const file = resolve(archipelagosDir, entry.name, `${entry.name}.archipelago.ts`);
    if (!existsSync(file)) continue;
    const text = readFileSync(file, 'utf8');
    regions.push({
      id: entry.name,
      file,
      /** `catalogue` when the island list is data — see ArchipelagoConfig.membership. */
      membership: text.match(/\bmembership:\s*'(placed|catalogue)'/)?.[1] ?? 'placed',
      islands: readIslands(text),
      sources: readSources(text, file),
      // The region's ROOT and how its props map — what an ejected page needs to keep composing the
      // same arrangement once `<X.Root>` is gone.
      ...readRoot(text),
      // The APP's own region type, and where it comes from. Generated state is typed with it —
      // `useState<ActionsRegion['weekMissions']>()` — so an ejected page keeps the exact types it had,
      // from a declaration that is the app's and survives motu's removal.
      ...regionTypeOf(text),
    });
  }
  return regions;
}

/**
 * WHICH REGION a `<X.Root …>` composes, from the props it passes.
 *
 * The binding is named by the page (`Directory`, `Actions`, anything), so the tag cannot say it. What
 * can is the prop set: a root's props are that region's own vocabulary, and a page passing four of
 * the annuaire's is composing the annuaire.
 *
 * SCORED, not "the first region with a prop in common" — which is what this was, and it broke the
 * moment a second region declared a root: both acme's regions have a `header`, so the annuaire's page
 * matched the actions region, was typed with `ActionsRegion`, and had its host-slot prop rewritten
 * with the wrong mapping. Two type errors in a page that had not changed.
 */
export function regionOfRoot(el, regions) {
  const passed = new Set(
    (el.getAttributes?.() ?? []).map((a) => a.getNameNode?.().getText?.()).filter(Boolean),
  );
  let best = null;
  let bestScore = 0;
  for (const region of regions) {
    if (!region.root) continue;
    const names = [...Object.keys(region.rootSlots ?? {}), ...Object.keys(region.rootHostSlots ?? {})];
    const score = names.filter((n) => passed.has(n)).length;
    if (score > bestScore) {
      best = region;
      bestScore = score;
    } else if (score === bestScore && score > 0) {
      best = null; // ambiguous: two regions match equally well, so say nothing rather than guess
    }
  }
  return best;
}

/**
 * What actually STANDS IN a root slot, from the expression the page passed for it.
 *
 * Only the branch results — the element itself, or each side of a conditional / `&&` guard. NOT every
 * JSX descendant: `weekNav={<WeekNavigator ambassador={<X.Island>…</X.Island>} …/>}` contains four
 * more elements, and wiring them all put the week navigator's `onChange` on the ambassador strip, the
 * summary button and everything inside them. The generated page still compiled, which is the whole
 * reason this needed looking at rather than trusting.
 */
function slotElements(expr) {
  if (!expr) return [];
  switch (expr.getKind()) {
    case SyntaxKind.JsxSelfClosingElement:
      return [expr];
    case SyntaxKind.JsxElement:
      return [expr.getOpeningElement()];
    case SyntaxKind.ParenthesizedExpression:
      return slotElements(expr.getExpression());
    case SyntaxKind.ConditionalExpression:
      return [...slotElements(expr.getWhenTrue()), ...slotElements(expr.getWhenFalse())];
    case SyntaxKind.BinaryExpression:
      // `cond && <C/>` — the element is the right-hand side; the left is the test.
      return expr.getOperatorToken().getText() === '&&' ? slotElements(expr.getRight()) : [];
    case SyntaxKind.JsxFragment:
      return expr
        .getJsxChildren()
        .flatMap((c) => (c.getKind() === SyntaxKind.JsxElement ? [c.getOpeningElement()] : c.getKind() === SyntaxKind.JsxSelfClosingElement ? [c] : []));
    default:
      return [];
  }
}

/**
 * The region's `root`, its `slots` and its `hostSlots`, with the module each component comes from.
 *
 * `removal-check` needs all of it: `<Directory.Root search={…} header={{ member }} />` has to become
 * `<DirectoryLayout search={…} header={<DirectoryHeader member={member} />} />`, with both imports
 * added — and every prop mapped in `slots` has to keep the wiring the region was holding for it.
 *
 * Read from TEXT, like the rest of this module. A `root` is a component reference, so importing the
 * archipelago to read it would pull the application's UI into the CLI.
 */
function readRoot(text) {
  const code = blankComments(text);
  const root = code.match(/^\s*root\s*:\s*([A-Za-z_$][\w$]*)\s*,/m)?.[1] ?? null;
  if (!root) return { root: null, rootFrom: null, rootSlots: {}, rootHostSlots: {} };
  const importOf = (name) =>
    [...code.matchAll(/import\s*\{([^}]*)\}\s*from\s*'([^']+)'/g)].find(([, names]) =>
      new RegExp(`(^|[\\s,])${name}([\\s,]|$)`).test(names),
    )?.[2] ?? null;
  const rootSlots = {};
  // One-line and multi-line forms both — see `rootSlotMap` for what matching only one of them cost.
  const slotBlock =
    code.match(/^ {2}slots\s*:\s*\{([^}\n]*)\}/m) ?? code.match(/^ {2}slots\s*:\s*\{([\s\S]*?)^ {2}\},/m);
  // Both value forms — see `rootSlotMap` for the object one.
  for (const [, prop, rest] of (slotBlock?.[1] ?? '').matchAll(/(\w+)\s*:\s*(\{[^}]*\}|'[^']+')/g)) {
    const slot = rest.startsWith('{') ? rest.match(/\bslot\s*:\s*'([^']+)'/)?.[1] : rest.slice(1, -1);
    if (slot) rootSlots[prop] = slot;
  }
  const rootHostSlots = {};
  const hostBlock = code.match(/^\s*hostSlots\s*:\s*\{([^}]*)\}/m);
  for (const [, prop, comp] of (hostBlock?.[1] ?? '').matchAll(/(\w+)\s*:\s*([A-Za-z_$][\w$]*)/g)) {
    rootHostSlots[prop] = { component: comp, from: importOf(comp) };
  }
  return { root, rootFrom: importOf(root), rootSlots, rootHostSlots };
}

/**
 * The app-side region type a config is declared against, and the module it comes from.
 *
 * Either declaration form carries it: `satisfies ArchipelagoConfig<ActionsRegion, …>` or
 * `archipelago<ActionsRegion, …>()`. The argument list can carry more than the region, so stop at the
 * first `,` or `>`, and find the import by the NAME just captured rather than by anything hard-coded.
 */
function regionTypeOf(text) {
  const regionType = text.match(/(?:ArchipelagoConfig|\barchipelago)<\s*([A-Za-z_$][\w$]*)\s*[,>]/)?.[1] ?? null;
  if (!regionType) return { regionType: null, regionTypeFrom: null };
  const imported = [...text.matchAll(/import type \{([^}]*)\}\s*from\s*'([^']+)'/g)].find(([, names]) =>
    new RegExp(`\\b${regionType}\\b`).test(names),
  );
  return { regionType, regionTypeFrom: imported?.[2] ?? null };
}

/**
 * id -> { produces: [...] } for each DECLARED source, from the config's text.
 *
 * Two forms, and the difference matters to how far this has to look:
 *   sources: { favorites: { module: '…', produces: ['favoriteIds'] } }   produces is right here
 *   sources: { results: resultsSource }                                   produces is in ANOTHER file
 * The second is the form the rules prefer — the region points at what produces its keys, not at a
 * string — so the import is followed and the `produces` array read from the source's own module.
 * Returning `{}` when a region declares none is correct; returning it when a region declares some and
 * the import could not be followed is a check that looked at nothing, so that case says so instead.
 */
function readSources(text, file) {
  const code = blankComments(text);
  const block = blockAfter(code, 'sources:', '{', 0);
  if (!block) return {};
  const out = {};
  for (const entry of splitTopLevel(block.body)) {
    const m = entry.match(/^\s*(\w+)\s*:\s*([\s\S]+)$/);
    if (!m) continue;
    const [, id, value] = m;
    const inline = value.match(/\bproduces:\s*\[([^\]]*)\]/);
    if (inline) {
      const names = quotedNames(inline[1]);
      out[id] = names ? { produces: names } : { produces: null, unresolved: `${id}.produces` };
      continue;
    }
    const ident = value.trim().match(/^([A-Za-z_$][\w$]*)\s*,?$/)?.[1];
    if (!ident) continue;
    const spec = [...code.matchAll(/import\s*\{([^}]*)\}\s*from\s*'([^']+)'/g)].find(([, names]) =>
      new RegExp(`\\b${ident}\\b`).test(names),
    )?.[2];
    const produces = spec ? producesOf(resolveSourceFile(spec, file), ident) : null;
    // UNRESOLVED IS NOT EMPTY. A source whose module could not be read has unknown keys, and saying
    // `[]` would let every check downstream conclude that nothing is source-owned.
    out[id] = produces ? { produces } : { produces: null, unresolved: spec ?? ident };
  }
  return out;
}

/**
 * Where a specifier written in an archipelago actually lives.
 *
 * Relative is exact. `@/` is the app's own tsconfig alias and motu does not read tsconfig here — it
 * points at the repo root in one project and at `src/` in another — so rather than guess, walk up
 * from the archipelago and take the first ancestor where the rest of the path is a real file. Wrong
 * only if two ancestors both contain the same path, which would make the app's own imports ambiguous.
 */
function resolveSourceFile(spec, fromFile) {
  const isFile = (p) => {
    try {
      return existsSync(p) && statSync(p).isFile();
    } catch {
      return false;
    }
  };
  const withExt = (base) => [base, `${base}.ts`, `${base}.tsx`, resolve(base, 'index.ts')].find(isFile) ?? null;

  if (spec.startsWith('.')) return withExt(resolve(dirname(fromFile), spec));
  if (!spec.startsWith('@/')) return null;
  const rest = spec.slice(2);
  for (let dir = dirname(fromFile); ; dir = dirname(dir)) {
    const hit = withExt(resolve(dir, rest));
    if (hit) return hit;
    if (dir === dirname(dir)) return null;
  }
}

/** The `produces: [...]` of a named export in a source module. */
function producesOf(file, ident) {
  if (!file) return null;
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return null;
  }
  const code = blankComments(text);
  const at = code.search(new RegExp(`export\\s+const\\s+${ident}\\b`));
  if (at === -1) return null;
  const arr = code.slice(at).match(/\bproduces:\s*\[([^\]]*)\]/);
  return arr ? quotedNames(arr[1]) : null;
}

/**
 * The quoted names in an array literal — single, double or backtick, because the QUOTE STYLE IS THE
 * APP'S and its prettier config decides it, not motu's.
 *
 * Returns null rather than `[]` when there was text it could not parse. Reading `["shots"]` with a
 * single-quote regex yields an empty array, and an empty array is a perfectly good answer meaning
 * "this source produces nothing" — so the caller concludes no key is source-owned and every check
 * downstream passes by looking at nothing. An honest failure is the only safe kind here.
 */
function quotedNames(body) {
  const names = [...body.matchAll(/['"`]([^'"`]+)['"`]/g)].map((m) => m[1]);
  if (names.length) return names;
  return body.trim() ? null : [];
}

/** Split an object body on commas at depth 0. */
function splitTopLevel(body) {
  const out = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if ('{[('.includes(c)) depth++;
    else if ('}])'.includes(c)) depth--;
    else if (c === ',' && depth === 0) {
      out.push(body.slice(start, i));
      start = i + 1;
    }
  }
  out.push(body.slice(start));
  return out.filter((e) => e.trim());
}

/** slot -> { element, writes: { event: key | { field: key } } }, from the config's text. */
function readIslands(text) {
  const code = blankComments(text);
  const islands = [];
  for (const block of balancedBlocks(code, /\bslot:\s*'([^']+)'/g)) {
    const element = block.body.match(/\belement:\s*'([^']+)'/)?.[1];
    const writes = {};
    const w = blockAfter(code, 'writes:', '{', block.start);
    if (w && w.start < block.end) {
      for (const [, event, target] of w.body.matchAll(/'([^']+)':\s*(\{[^}]*\}|'[^']*')/g)) {
        writes[event] = target.startsWith('{')
          ? Object.fromEntries([...target.matchAll(/(\w+):\s*'([^']+)'/g)].map((m) => [m[1], m[2]]))
          : target.slice(1, -1);
      }
    }
    const member = block.body.match(/\bmember:\s*'([^']+)'/)?.[1];
    const readsBlock = block.body.match(/\breads:\s*\[([^\]]*)\]/)?.[1] ?? '';
    const reads = [...readsBlock.matchAll(/'([^']+)'/g)].map((m) => m[1]);
    const planned = /\bplanned:\s*true/.test(block.body);
    // WHICH PROP CARRIES WHICH KEY. Both `bind` forms: the rename map `{ prop: 'key' }` and the short
    // array `['key']`, where the prop and the key are the same word. Needed by `integrate check` to ask
    // whether the PAGE actually passes what the island says it binds — a slot can be placed, composed
    // and read while the island quietly runs on its defaults.
    const bind = {};
    const bindMap = block.body.match(/\bbind:\s*\{([^}]*)\}/)?.[1];
    if (bindMap) {
      for (const [, prop, key] of bindMap.matchAll(/(\w+)\s*:\s*'([^']+)'/g)) bind[prop] = key;
    } else {
      const bindArr = block.body.match(/\bbind:\s*\[([^\]]*)\]/)?.[1];
      if (bindArr) {
        // RENAMES FIRST, then the bare entries with the objects removed. Reading every quoted string
        // as a bare entry turned `[{ value: 'filters' }]` into a binding on a prop called `filters`,
        // which the component does not have — and the check then reported the page as not passing a
        // prop nobody ever declared.
        for (const [, prop, key] of bindArr.matchAll(/(\w+)\s*:\s*'([^']+)'/g)) bind[prop] = key;
        for (const [, key] of bindArr.replace(/\{[^}]*\}/g, '').matchAll(/'([^']+)'/g)) bind[key] = key;
      }
    }
    islands.push({ slot: block.name, element, writes, member, reads, planned, bind });
  }
  return islands;
}

/** tag -> { callbackProp: eventName }, from each island file's declared contract output. */
export function readOutputs(islandFiles, islandsDir) {
  // The generated contracts first: with the short island form (`island('x-tag', Component)`) they are
  // the only place the event names exist. An island file that still declares its own contract wins for
  // its own tag — nothing has to be migrated for eject to keep working.
  const out = { ...Object.fromEntries(Object.entries(readGeneratedContracts(islandsDir ?? '')).map(([tag, c]) => [tag, c.output])) };
  for (const file of islandFiles) {
    const text = blankComments(readFileSync(file, 'utf8'));
    const tag = text.match(/\btag:\s*'([^']+)'/)?.[1];
    if (!tag) continue;
    const block = blockAfter(text, 'output:', '{');
    out[tag] = block
      ? Object.fromEntries([...block.body.matchAll(/(\w+):\s*'([^']+)'/g)].map((m) => [m[1], m[2]]))
      : {};
  }
  return out;
}

/**
 * Rewrite one host source file so it no longer needs motu, and report what was generated.
 *
 * Runs BEFORE the unwrap: it needs `<Island slot="…">` still in place to find which element is the
 * producer. Returns [] when the file holds no region reads or seeds.
 */
export function ejectFile(sf, regions, outputs) {
  // WHICH region this file belongs to, by the slots it actually places — a project has several, and
  // picking the first typed one silently typed a page's state with another region's shape.
  const usedSlots = new Set(
    sf
      .getDescendantsOfKind(SyntaxKind.JsxElement)
      .filter((el) => el.getOpeningElement().getTagNameNode().getText().split('.').pop() === 'Island')
      .map((el) => jsxStringProp(el.getOpeningElement(), 'slot'))
      .filter(Boolean),
  );
  // A ROOT REGION places nothing by slot — that is the point of it — so the page names PROPS instead.
  // Without this the file matched no region and fell back to "the first typed one", which typed the
  // annuaire's state with the actions region's shape and failed the removal proof on a page that was
  // otherwise correct.
  const rootRegions = new Set(
    [
      ...sf.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement),
      ...sf.getDescendantsOfKind(SyntaxKind.JsxOpeningElement),
    ]
      .filter((el) => el.getTagNameNode().getText().split('.').pop() === 'Root')
      .map((el) => regionOfRoot(el, regions))
      .filter(Boolean),
  );
  const mine = regions.filter((r) => r.islands.some((i) => usedSlots.has(i.slot)) || rootRegions.has(r));
  const typed = (mine.length ? mine : regions).find((r) => r.regionType && r.regionTypeFrom) ?? null;
  // A key with no fallback in the host's read has no value until its producer fires, so the generated
  // state is `T | undefined` — the same thing `useRegionValue` returned.
  const typeOf = (key, initial) =>
    typed ? `<${typed.regionType}[${JSON.stringify(key)}]${initial === 'undefined' ? ' | undefined' : ''}>` : '';
  const notes = [];
  const calls = sf.getDescendantsOfKind(SyntaxKind.CallExpression);
  const reads = calls.filter((c) => isCall(c, 'useRegionValue'));
  const regionReads = calls.filter((c) => isCall(c, 'useRegion'));
  // `seedArchipelago(id, key, value)` and a binding's `seed(key, value)` — same act, one argument apart.
  const seeds = calls.filter((c) => isCall(c, 'seedArchipelago', 'seed'));
  if (!reads.length && !regionReads.length && !seeds.length) return notes;

  // The component the reads live in, captured BEFORE any rewrite: replacing a node forgets it, and
  // with it every ancestor lookup it could have answered.
  const anchor = reads[0] ?? regionReads[0] ?? seeds[0];
  const holderFn =
    anchor.getFirstAncestorByKind(SyntaxKind.FunctionDeclaration) ??
    anchor.getFirstAncestorByKind(SyntaxKind.ArrowFunction);

  // key -> { name, setter, initial } for every key this file reads or seeds.
  const state = new Map();
  const claim = (key, name, initial) => {
    if (!state.has(key)) {
      state.set(key, { key, name, setter: `set${name[0].toUpperCase()}${name.slice(1)}`, initial });
    }
    return state.get(key);
  };

  // 1. Reads become state. `const x = useRegionValue<T>('k') ?? 0` keeps its name and its fallback as
  //    the initial value — the fallback is what the page already decided an absent key means.
  for (const call of reads) {
    const key = literalArg(call, 0);
    if (!key) continue;
    const parent = call.getParent();
    const binary = parent?.getKind() === SyntaxKind.BinaryExpression ? parent : null;
    const initial = binary ? binary.getRight().getText() : 'undefined';
    const decl = (binary ?? call).getParentIfKind(SyntaxKind.VariableDeclaration);
    const name = decl ? decl.getName() : key;
    const s = claim(key, name, initial);
    if (decl) {
      decl.replaceWithText(`[${s.name}, ${s.setter}] = useState${typeOf(key, s.initial)}(${s.initial})`);
    } else {
      (binary ?? call).replaceWithText(s.name);
    }
  }

  // 1b. `const { a = 0, b } = useRegion<R>()` — every destructured key becomes state, and the
  //     statement goes: the declarations are re-inserted together at the top of the component.
  for (const call of regionReads) {
    const decl = call.getParentIfKind(SyntaxKind.VariableDeclaration);
    const pattern = decl?.getNameNode();
    if (!pattern || pattern.getKind() !== SyntaxKind.ObjectBindingPattern) continue;
    for (const el of pattern.getElements()) {
      const key = (el.getPropertyNameNode() ?? el.getNameNode()).getText();
      claim(key, el.getNameNode().getText(), el.getInitializer()?.getText() ?? 'undefined');
    }
    decl.getVariableStatement()?.remove();
  }

  // 2. Seeds become a plain setState on that key's state.
  for (const call of seeds) {
    // The archipelago id is only present on the bare form, so find the key by shape, not by position.
    const keyIndex = literalArg(call, 0) && !literalArg(call, 1) ? 0 : literalArg(call, 1) ? 1 : -1;
    const key = keyIndex === -1 ? null : literalArg(call, keyIndex);
    if (!key) continue;
    const s = claim(key, key, 'undefined');
    call.replaceWithText(`${s.setter}(${call.getArguments()[keyIndex + 1]?.getText() ?? 'undefined'})`);
  }

  // 3. The producer's output prop gets the wiring the archipelago's `writes` mapping described.
  //
  // The producer is reached two ways, and BOTH have to be walked. `<X.Island slot="s"><C/></X.Island>`
  // is the page composing it directly; `<X.Root s={<C/>} />` is the page naming a prop and the region
  // deciding which island wraps it. Handling only the first is not a smaller check, it is a silent
  // one: the annuaire ejected `query` and `filters` as state and generated NOTHING to set them, so
  // the rewritten page compiled — which is all the removal proof asserts — with a search box and a
  // filter panel that could no longer change anything.
  const wireInto = (opening, spec, label) => {
    for (const [event, target] of Object.entries(spec.writes ?? {})) {
      const callbackProp = Object.entries(outputs[spec.element] ?? {}).find(([, e]) => e === event)?.[0];
      if (!callbackProp) continue;
      // Only the keys the host actually holds state for: a produced key nobody here reads needs no
      // wiring, and inventing a setter for it would be generated dead code.
      const wired =
        typeof target === 'string'
          ? state.has(target)
            ? [[target, `${state.get(target).setter}(d)`]]
            : []
          : Object.entries(target)
              .filter(([, key]) => state.has(key))
              .map(([field, key]) => [key, `${state.get(key).setter}(d.${field})`]);
      if (!wired.length) continue;
      const body = wired.map(([, call]) => call).join('; ');

      // A prop the page already passes is KEPT and called first. Replacing it would silently drop
      // wiring the app had of its own — the opposite of what eject is for.
      const existing = opening.getAttribute(callbackProp);
      const previous = existing?.getInitializer?.()?.getExpression?.()?.getText();
      const handler = `(d) => { ${previous ? `(${previous})(d); ` : ''}${body}; }`;
      if (existing) existing.replaceWithText(`${callbackProp}={${handler}}`);
      else opening.addAttribute({ name: callbackProp, initializer: `{${handler}}` });
      notes.push(`${label}.${callbackProp} -> ${wired.map(([key]) => key).join(', ')}${previous ? ' (kept the page\'s own handler)' : ''}`);
    }
  };

  for (const island of sf.getDescendantsOfKind(SyntaxKind.JsxElement)) {
    // `<Island>` or a binding's `<Actions.Island>`.
    if (island.getOpeningElement().getTagNameNode().getText().split('.').pop() !== 'Island') continue;
    const slot = jsxStringProp(island.getOpeningElement(), 'slot');
    const spec = regions.flatMap((r) => r.islands).find((i) => i.slot === slot);
    if (!spec) continue;
    const child = island.getJsxChildren().find((c) => c.getKind() === SyntaxKind.JsxSelfClosingElement || c.getKind() === SyntaxKind.JsxElement);
    if (!child) continue;
    wireInto(child.getKind() === SyntaxKind.JsxElement ? child.getOpeningElement() : child, spec, slot);
  }

  // The root form: the prop names the slot, and the component to wire is whatever JSX the page put in
  // it. A conditional prop (`notice={cond ? <A/> : null}`) holds it one level down, so every element
  // inside the attribute is wired — each of them stands in that slot when its branch is the one taken.
  for (const el of [
    ...sf.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement),
    ...sf.getDescendantsOfKind(SyntaxKind.JsxOpeningElement),
  ]) {
    if (el.getTagNameNode().getText().split('.').pop() !== 'Root') continue;
    const region = regionOfRoot(el, regions);
    if (region) {
      for (const [prop, slot] of Object.entries(region.rootSlots ?? {})) {
        const spec = region.islands.find((i) => i.slot === slot);
        if (!spec?.writes) continue;
        const expr = el.getAttribute?.(prop)?.getInitializer?.()?.getExpression?.();
        if (!expr) continue;
        for (const target of slotElements(expr)) wireInto(target, spec, `${slot} (via ${prop})`);
      }
    }
  }

  // 4. The state itself, at the top of the component the reads were in, plus React's useState.
  if (state.size) {
    const fn = holderFn;
    const declared = new Set([...sf.getText().matchAll(/\[(\w+), (set\w+)\] = useState/g)].map((m) => m[1]));
    const missing = [...state.values()].filter((s) => !declared.has(s.name));
    if (fn && missing.length) {
      fn.getBody()?.insertStatements(
        0,
        missing.map((s) => `const [${s.name}, ${s.setter}] = useState${typeOf(s.key, s.initial)}(${s.initial})`),
      );
    }
    ensureUseState(sf);
    if (typed) ensureRegionType(sf, typed);
    for (const s of state.values()) notes.push(`state ${s.name} (was region key)`);
  }
  return notes;
}

/**
 * A call to `name`, however it is reached: bare (`useRegion()`), namespaced by a region binding
 * (`Actions.useRegion()`), or with type arguments. Aliases are the point of `createRegion` — the host
 * calls the region's own surface, not the framework's.
 */
function isCall(call, ...names) {
  const text = call.getExpression().getText().replace(/<.*>$/s, '');
  const last = text.split('.').pop();
  return names.includes(text) || names.includes(last);
}

function literalArg(call, index) {
  const arg = call.getArguments()[index];
  return arg?.getKind() === SyntaxKind.StringLiteral ? arg.getLiteralText() : null;
}

function jsxStringProp(opening, name) {
  const attr = opening.getAttribute(name);
  const init = attr?.getInitializer?.();
  return init?.getKind() === SyntaxKind.StringLiteral ? init.getLiteralText() : null;
}

/** The app's region type, imported for the generated state's annotations. */
function ensureRegionType(sf, region) {
  // Already imported under any specifier — the app may reach the same module by a relative path where
  // the archipelago used an alias, and adding a second import is a duplicate identifier, not a no-op.
  const alreadyNamed = sf
    .getImportDeclarations()
    .some((i) => i.getNamedImports().some((n) => (n.getAliasNode() ?? n.getNameNode()).getText() === region.regionType));
  if (alreadyNamed) return;
  const existing = sf.getImportDeclaration((i) => i.getModuleSpecifierValue() === region.regionTypeFrom);
  if (existing) {
    if (!existing.getNamedImports().some((n) => n.getName() === region.regionType)) {
      existing.addNamedImport({ name: region.regionType, isTypeOnly: !existing.isTypeOnly() });
    }
    return;
  }
  sf.insertStatements(0, `import type { ${region.regionType} } from "${region.regionTypeFrom}"`);
}

function ensureUseState(sf) {
  const react = sf.getImportDeclaration((i) => i.getModuleSpecifierValue() === 'react');
  if (!react) {
    sf.insertStatements(0, `import { useState } from "react"`);
    return;
  }
  if (!react.getNamedImports().some((n) => n.getName() === 'useState')) react.addNamedImport('useState');
}

// --- text helpers (shared shape with verify's balanced-block reader) -----------------------------

// One implementation, in util: a glob is a string containing `/*`, and three hand-rolled copies of
// this got that wrong in three places.
const blankComments = blankCommentsShared;

function blockAfter(code, label, open, from = 0) {
  const at = code.indexOf(label, from);
  if (at === -1) return null;
  const start = code.indexOf(open, at);
  if (start === -1) return null;
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  for (let i = start; i < code.length; i++) {
    if (code[i] === open) depth++;
    else if (code[i] === close && --depth === 0) return { body: code.slice(start + 1, i), start, end: i };
  }
  return null;
}

/** The `{ … }` object literal around each match of `re`, with the capture as `name`. */
function balancedBlocks(code, re) {
  const out = [];
  for (const m of code.matchAll(re)) {
    let depth = 0;
    let start = -1;
    for (let i = m.index; i >= 0; i--) {
      if (code[i] === '}') depth++;
      else if (code[i] === '{') {
        if (depth === 0) {
          start = i;
          break;
        }
        depth--;
      }
    }
    if (start === -1) continue;
    depth = 0;
    for (let i = start; i < code.length; i++) {
      if (code[i] === '{') depth++;
      else if (code[i] === '}' && --depth === 0) {
        out.push({ name: m[1], body: code.slice(start + 1, i), start, end: i });
        break;
      }
    }
  }
  return out;
}
