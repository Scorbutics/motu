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
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { SyntaxKind } from 'ts-morph';

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
      islands: readIslands(text),
      // The APP's own region type, and where it comes from. Generated state is typed with it —
      // `useState<ActionsRegion['weekMissions']>()` — so an ejected page keeps the exact types it had,
      // from a declaration that is the app's and survives motu's removal.
      ...regionTypeOf(text),
    });
  }
  return regions;
}

/**
 * The app-side region type a config is declared against, and the module it comes from.
 *
 * `ArchipelagoConfig<ActionsRegion, keyof ElementTypes>` — the type argument list can carry more than
 * the region, so stop at the first `,` or `>`, and find the import by the NAME just captured rather
 * than by anything hard-coded.
 */
function regionTypeOf(text) {
  const regionType = text.match(/ArchipelagoConfig<\s*([A-Za-z_$][\w$]*)\s*[,>]/)?.[1] ?? null;
  if (!regionType) return { regionType: null, regionTypeFrom: null };
  const imported = [...text.matchAll(/import type \{([^}]*)\}\s*from\s*'([^']+)'/g)].find(([, names]) =>
    new RegExp(`\\b${regionType}\\b`).test(names),
  );
  return { regionType, regionTypeFrom: imported?.[2] ?? null };
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
    islands.push({ slot: block.name, element, writes });
  }
  return islands;
}

/** tag -> { callbackProp: eventName }, from each island file's declared contract output. */
export function readOutputs(islandFiles) {
  const out = {};
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
  // Region types, so generated state is typed rather than `undefined`. One region per host file in
  // practice; when several apply, the first that declares a type wins and the rest fall back.
  const typed = regions.find((r) => r.regionType && r.regionTypeFrom) ?? null;
  // A key with no fallback in the host's read has no value until its producer fires, so the generated
  // state is `T | undefined` — the same thing `useRegionValue` returned.
  const typeOf = (key, initial) =>
    typed ? `<${typed.regionType}[${JSON.stringify(key)}]${initial === 'undefined' ? ' | undefined' : ''}>` : '';
  const notes = [];
  const calls = sf.getDescendantsOfKind(SyntaxKind.CallExpression);
  const reads = calls.filter((c) => isCall(c, 'useRegionValue'));
  const regionReads = calls.filter((c) => isCall(c, 'useRegion'));
  const seeds = calls.filter((c) => isCall(c, 'seedArchipelago'));
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
    const key = literalArg(call, 1);
    if (!key) continue;
    const s = claim(key, key, 'undefined');
    call.replaceWithText(`${s.setter}(${call.getArguments()[2]?.getText() ?? 'undefined'})`);
  }

  // 3. The producer's output prop gets the wiring the archipelago's `writes` mapping described.
  for (const island of sf.getDescendantsOfKind(SyntaxKind.JsxElement)) {
    if (island.getOpeningElement().getTagNameNode().getText() !== 'Island') continue;
    const slot = jsxStringProp(island.getOpeningElement(), 'slot');
    const spec = regions.flatMap((r) => r.islands).find((i) => i.slot === slot);
    if (!spec) continue;
    const child = island.getJsxChildren().find((c) => c.getKind() === SyntaxKind.JsxSelfClosingElement || c.getKind() === SyntaxKind.JsxElement);
    if (!child) continue;
    const opening = child.getKind() === SyntaxKind.JsxElement ? child.getOpeningElement() : child;
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
      notes.push(`${slot}.${callbackProp} -> ${wired.map(([key]) => key).join(', ')}${previous ? ' (kept the page\'s own handler)' : ''}`);
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

function isCall(call, name) {
  return call.getExpression().getText().replace(/<.*>$/s, '') === name;
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

function blankComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length));
}

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
