// An island's static checks: its component's source, its registry entry, its stylesheet.
// Split out of commands/verify.mjs; verify.mjs re-exports the public surface.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { SyntaxKind } from 'ts-morph';
import { islandContract } from '../../lib/contracts.mjs';
import { isKinded, readEffectEntries } from '../../lib/effects.mjs';
import { listIslands } from '../../lib/islands.mjs';
import { sourceFileAt } from '../../lib/ts-project.mjs';
import { HOST, LEGACY_FIT, islandComponentExport, islandComponentIdentifier, islandComponentPath, names, paths } from '../../lib/util.mjs';

export const DOC_QUERIES = new Set(['querySelector', 'querySelectorAll', 'getElementById', 'getElementsByClassName']);

/** Static analysis of the component source. */
export function staticChecks(report, componentPath, pascal) {
  const sf = sourceFileAt(componentPath, { allowJs: true, jsx: 4 /* react-jsx */ });
  const line = (n) => n.getStartLineNumber();

  let sawFetch = false,
    sawHistory = false,
    sawDoc = false;

  for (const id of sf.getDescendantsOfKind(SyntaxKind.Identifier)) {
    if (id.getText() === 'fetch') {
      const call = id.getParentIfKind(SyntaxKind.CallExpression);
      if (call && call.getExpression() === id) {
        report.error('no-bare-fetch', 'bare fetch() in the island — I/O goes through the contract, or through a host module the island declares in `contract.effects`', line(id));
        sawFetch = true;
      }
    }
    if (id.getText() === 'XMLHttpRequest') {
      report.error('no-bare-fetch', 'XMLHttpRequest in the island — I/O goes through the contract, or through a host module the island declares in `contract.effects`', line(id));
      sawFetch = true;
    }
  }

  for (const pa of sf.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression)) {
    const name = pa.getName();
    const obj = pa.getExpression().getText();
    if (name === 'pushState' || name === 'replaceState') {
      report.error('no-history', `history.${name}() — the ocean owns the URL; emit a navigate intent`, line(pa));
      sawHistory = true;
    }
    if (/^(window\.)?history$/.test(obj)) {
      report.error('no-history', 'history access — navigation is a host intent, not the island', line(pa));
      sawHistory = true;
    }
    if (/^(window\.|document\.)?location$/.test(obj) && name !== 'origin') {
      report.error('no-history', `location.${name} — the ocean owns the URL`, line(pa));
      sawHistory = true;
    }
    if (DOC_QUERIES.has(name) && /^(window\.)?document$/.test(obj)) {
      report.error('no-doc-reachout', `document.${name}() — islands never reach into the host DOM`, line(pa));
      sawDoc = true;
    }
  }
  if (!sawFetch) report.ok('no-bare-fetch', 'no bare fetch / XMLHttpRequest');
  if (!sawHistory) report.ok('no-history', 'no history / location access');
  if (!sawDoc) report.ok('no-doc-reachout', 'no document reach-out');

  // Import discipline: no raw transport, no third-party HTTP client.
  let badImport = false;
  const httpLibs = new Set(['axios', 'ky', 'superagent', 'node-fetch', 'got']);
  const rawTransport = new Set(['configure', 'HttpTransport', 'MockTransport']);
  for (const imp of sf.getImportDeclarations()) {
    const spec = imp.getModuleSpecifierValue();
    if (httpLibs.has(spec)) {
      report.error('contract-only-io', `imports HTTP client '${spec}' — use @motujs/contract`, line(imp));
      badImport = true;
    }
    if (spec === '@motujs/runtime' || spec === '@motujs/runtime/mock') {
      for (const n of imp.getNamedImports()) {
        if (rawTransport.has(n.getName())) {
          report.error('contract-only-io', `imports raw transport '${n.getName()}' — use @motujs/contract`, line(imp));
          badImport = true;
        }
      }
    }
  }
  if (!badImport) report.ok('contract-only-io', 'server I/O only via @motujs/contract');

  // Layer discipline: a ui/ component is the reusable "mainland" — it must not reach back into the
  // mount points (islands/) or compositions (archipelagos/), so it stays liftable and islands can't
  // couple through it. ui -> ui composition (`../<other>/…`) and shared/ are fine.
  let sawLayerViolation = false;
  for (const imp of sf.getImportDeclarations()) {
    const spec = imp.getModuleSpecifierValue();
    const m = spec.match(/(?:^|\/)(islands|archipelagos)\//);
    if (m) {
      report.error('ui-layering', `imports ${m[1]}/ — a ui component must not depend on mount points or compositions (keep it liftable; coordinate at runtime via the store)`, line(imp));
      sawLayerViolation = true;
    }
  }
  if (!sawLayerViolation) report.ok('ui-layering', 'ui component does not reach into islands/ or archipelagos/');

  // Contract calls: every @motujs/contract service.method the component invokes must exist in the
  // generated contract — catches invented endpoints / method names stale after a backend change.
  const contractServices = new Set();
  for (const imp of sf.getImportDeclarations()) {
    if (imp.getModuleSpecifierValue() === '@motujs/contract' && !imp.isTypeOnly()) {
      for (const n of imp.getNamedImports()) contractServices.add(n.getName());
    }
  }
  if (contractServices.size) {
    const pairs = contractPairs();
    const seen = new Set();
    let badCall = false;
    for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      const expr = call.getExpression();
      if (expr.getKind() !== SyntaxKind.PropertyAccessExpression) continue;
      const obj = expr.getExpression().getText();
      if (!contractServices.has(obj)) continue;
      const key = `${obj}.${expr.getName()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (pairs.size && !pairs.has(key)) {
        report.error('contract-calls', `calls ${key}() which isn't in @motujs/contract`, line(call));
        badCall = true;
      }
    }
    if (!badCall) report.ok('contract-calls', 'contract calls exist in @motujs/contract');
  }

  // Renders from default props alone. The lagoon mount below is the authoritative check (it mounts
  // with zero props); statically we only flag the clearly-bad case: a required, non-destructured props
  // object with no default. Destructured params (with per-field defaults / optional callbacks) are the
  // idiom and are confirmed at runtime.
  const fn =
    sf.getFunction(pascal) ??
    sf.getVariableDeclaration(pascal)?.getInitializerIfKind(SyntaxKind.ArrowFunction);
  if (!fn) {
    report.warn('default-props', `couldn't find component function ${pascal} to check default props`);
  } else {
    const p = fn.getParameters()[0];
    const isDestructured = p?.getNameNode()?.getKind() === SyntaxKind.ObjectBindingPattern;
    if (!p || p.hasInitializer() || p.isOptional() || isDestructured) {
      report.ok('default-props', 'renders from default props alone');
    } else {
      report.error(
        'default-props',
        'component must render from default props — destructure with defaults or give the props param a default (e.g. `= {}`)',
        line(fn),
      );
    }
  }

  // The component's declared prop names, for the registry reconciliation in configChecks.
  //
  // Read from the props PARAMETER'S TYPE, not from a `${Pascal}Props` interface by name. The name
  // lookup only saw components written for this check: an app's own components type their props
  // inline, so the reconciliation silently skipped exactly the components a modern host wraps — and
  // made the framework ask for an interface it did not actually need. The parameter's type covers
  // every shape (inline literal, named interface, intersection); the interface lookup stays as the
  // fallback for when types cannot be resolved from this file alone (an imported props type).
  const propNames = paramPropNames(fn) ?? sf.getInterface(`${pascal}Props`)?.getProperties().map((m) => m.getName()) ?? null;
  return { propNames };
}

/** Property names of a component's props parameter, or null when its type resolves to nothing. */
export function paramPropNames(fn) {
  const param = fn?.getParameters?.()[0];
  if (!param) return null;
  let props;
  try {
    props = param.getType().getProperties();
  } catch {
    return null;
  }
  // `getProperties()` on an unresolved type is empty, not an error — treat that as "unknown", so the
  // caller falls back rather than reporting a component with props as having none.
  return props.length ? props.map((p) => p.getName()) : null;
}

/** Registry + archipelago membership checks. Returns the tag if registered. */
export function configChecks(report, kebab, pascal, expectedTag, standalone, componentProps, componentPath) {
  const elementPath = paths.elementFile(kebab);
  if (!existsSync(elementPath)) {
    report.error('registered', `no element.ts at ${paths.rel(elementPath)}`);
    return null;
  }
  const sf = sourceFileAt(elementPath, { allowJs: true });

  // Mount-point discipline: an island's element.ts must never import ANOTHER island — mount points
  // coordinate only at runtime through the store. Its own component lives in ui/ (`../../ui/…`, which
  // is two levels up), so a single `../<other>/…` is a sibling-island reference.
  let sawSiblingIsland = false;
  // Resolve against the actual island list rather than a path SHAPE. The folder layout made
  // "sibling island" and "../<something>/" the same thing; the flat layout does not — there,
  // `../ui/...` is the ui directory one level up, which is exactly what a mount point is supposed to
  // import. Matching on shape flagged it as a sibling island.
  const otherIslands = new Set(listIslands(paths.islandsDir).map((i) => i.kebab).filter((k) => k !== kebab));
  for (const imp of sf.getImportDeclarations()) {
    const spec = imp.getModuleSpecifierValue();
    const sibling =
      spec.match(/^\.\.\/([^./][^/]*)\//)?.[1] ?? // folder layout: ../<kebab>/element.js
      spec.match(/^\.\/([^./]+)\.island(?:\.js)?$/)?.[1]; // flat layout: ./<kebab>.island.js
    if (sibling && otherIslands.has(sibling)) {
      report.error('no-island-import', `imports sibling island '${sibling}' — mount points never import each other`, imp.getStartLineNumber());
      sawSiblingIsland = true;
    }
  }
  if (!sawSiblingIsland) report.ok('no-island-import', 'mount point imports no sibling island');

  // What the island file declares, in EITHER form: the long `islandElement({ tag, component, options })`
  // literal, or the short `island('x-tag', Component)` call whose derivable half lives in the generated
  // contracts file. The short form is the point of that generation — a mount point that says only what
  // someone decided — so the checks below read both rather than insisting on the shape.
  const elementText = readFileSync(elementPath, 'utf8');
  let row;
  for (const obj of sf.getDescendantsOfKind(SyntaxKind.ObjectLiteralExpression)) {
    if (obj.getProperty('tag') && obj.getProperty('component')) {
      row = obj;
      break;
    }
  }
  const shortForm = !row && /\bisland\(\s*['"`]/.test(elementText);
  if (!row && !shortForm) {
    report.error('registered', `${pascal} has no island declaration in ${paths.rel(elementPath)}`);
    return null;
  }
  // The identifier must resolve to something imported here; its NAME is the app's business (an island
  // wraps the app's own component), so a difference from the island's kebab is not a finding.
  const comp = row
    ? row.getProperty('component')?.getText().replace(/^component:\s*/, '').trim()
    : islandComponentIdentifier(elementText);
  if (comp && !sf.getImportDeclarations().some((i) => i.getNamedImports().some((n) => (n.getAliasNode() ?? n.getNameNode()).getText() === comp))) {
    report.warn('registered', `element.ts mounts '${comp}', which is not imported in this file`);
  }

  // Confirm it's wired into the assembled ELEMENT_REGISTRY.
  const registryText = existsSync(paths.islandsRegistry) ? readFileSync(paths.islandsRegistry, 'utf8') : '';
  // Either layout's specifier, with or without the '.js'. motu now writes them extensionless (the
  // host's bundler has to resolve them and not every one can map '.js' -> '.ts'), but a project
  // generated before that still has the old form and is not broken.
  const registered = [`./${kebab}.island`, `./${kebab}/element`].some(
    (s) => registryText.includes(`${s}'`) || registryText.includes(`${s}.js'`) ||
           registryText.includes(`${s}"`) || registryText.includes(`${s}.js"`),
  );
  if (registered) {
    report.ok('registered', 'registered in ELEMENT_REGISTRY');
  } else {
    report.error('registered', `not wired into ${paths.rel(paths.islandsRegistry)}`);
  }

  const tag = row
    ? row
        .getProperty('tag')
        ?.getText()
        .replace(/^tag:\s*/, '')
        .trim()
        .replace(/['"]/g, '')
    : elementText.match(/\bisland\(\s*'([^']+)'/)?.[1];
  const options = row?.getProperty('options')?.getInitializerIfKind(SyntaxKind.ObjectLiteralExpression);
  // In the short form the boundary is generated, so it is read from the generated file rather than
  // from this one — the same data the checks below expect, just not hand-written.
  const generated = shortForm
    ? islandContract({ kebab, element: elementPath }, { islandComponentPath, islandComponentExport, names })
    : null;
  // Fitting an island to a legacy skin is only meaningful when the host HAS one. On a React host
  // (next/none) the island mounts directly, so requiring the strategy would be dead ceremony.
  // POSTURE FIRST. Testing for the field first (as this did) makes the skip branch unreachable for any
  // project that declares it — which is every project, because the type used to require it. acme's eight
  // islands each reported "declares a required legacy-fit strategy" under `host: next`, asserting a
  // requirement that does not exist there.
  if (!LEGACY_FIT) {
    if (options?.getProperty('legacy')) {
      report.warn(
        'legacy-strategy',
        `declares \`legacy\` but host is '${HOST}', which has no legacy skin to fit — remove it (nothing reads it)`,
      );
    } else {
      report.skip('legacy-strategy', `no legacy fit on host '${HOST}' — nothing to fit to`);
    }
  } else if (options?.getProperty('legacy')) {
    report.ok('legacy-strategy', 'declares a required legacy-fit strategy');
  } else {
    report.error('legacy-strategy', 'element row is missing the required `legacy` strategy');
  }

  // props/events reconciliation: the registry (element.ts) and the component are the two sources of
  // truth for an island's props. Cross-check them so they can't drift — a registered prop the component
  // doesn't accept is dead config; a component prop that's neither registered nor an event can never be
  // set. (Only for destructured React components; AngularJS/opaque components are skipped.) Reads
  // either the grouped `contract: { input, output }` or the flat `props`/`events` form.
  if (componentProps?.propNames) {
    const compNames = componentProps.propNames;
    const registeredProps = generated ? generated.input : objectArrayStrings(optionProp(options, 'props', 'input'));
    const eventKeys = generated ? Object.keys(generated.output) : objectKeys(optionProp(options, 'events', 'output'));
    const before = report.findings.length;

    for (const rp of registeredProps) {
      if (!compNames.includes(rp)) {
        report.error('props-match', `registered prop '${rp}' is not a prop of ${pascal} (dead registry entry)`);
      }
    }
    for (const cp of compNames) {
      if (cp === 'fit') continue; // framework-injected footprint prop
      // `/^on[A-Z]/`, the same rule the contract reader uses. `startsWith('on')` called
      // `onboardingState` a callback and asked for an event mapping for a string prop.
      if (/^on[A-Z]/.test(cp)) {
        if (!eventKeys.includes(cp)) {
          report.warn('props-match', `callback '${cp}' isn't mapped to an event in element.ts (its output is dropped)`);
        }
      } else if (!registeredProps.includes(cp)) {
        report.warn('props-match', `prop '${cp}' isn't registered in element.ts props — it can never be set`);
      }
    }
    if (report.findings.length === before) report.ok('props-match', 'registry props/events match the component');
  } else {
    // Drift detection reads the `${Pascal}Props` interface. A component that types its props inline
    // (common in an app's own components, which never expected to be reconciled against a registry)
    // gives nothing to compare — say so, rather than silently dropping the check and looking green.
    report.warn(
      'props-match',
      `no \`${pascal}Props\` interface on the component — registry/component drift can't be checked (declare one to enable it)`,
    );
  }

  // --- effects: the third leg of the boundary ---------------------------------------------------
  //
  // Input and output are declared. EFFECTS — everything a component reaches that it was not handed:
  // a React context, a session hook, a feature gate, a service module it imports directly — was not,
  // and it is the reach most likely to make an island unmountable somewhere else. It hid in the
  // lagoon's `alias` table, where standing a module down looked like build configuration rather than
  // a declared dependency.
  //
  // ONLY THE MODULE ENTRIES ARE ANSWERABLE HERE. `effects` is one list of everything an island
  // reaches, tagged by kind, and the kinds are checked where each can be known: a bare specifier is a
  // module and is compared against the component's own imports, below; `scope:` is the AngularJS
  // adapter's to check; `table:`/`rpc:`/`fn:`/`route:` are runtime facts and belong to `data-reach`.
  // Comparing a prefixed entry against an import list would report every one of them as undeclared.
  //
  // It is DERIVED, not asked for twice: the lagoon's alias keys are exactly the modules this project
  // has had to stand down, so an island importing one of them requires it. Declaring it in `effects` makes
  // that visible in the island, in the seam lens and in the contract snapshot.
  {
    const lagoonCfg = resolve(paths.lagoonDir, 'lagoon.config.json');
    let aliases = [];
    try {
      aliases = Object.keys(JSON.parse(readFileSync(lagoonCfg, 'utf8')).alias ?? {});
    } catch {
      /* no lagoon config, or none declared */
    }
    if (aliases.length && existsSync(componentPath)) {
      // Over RUNTIME imports only. A `import type { Mission } from '@/lib/services/missions'` erases —
      // the island never calls that module, and asking it to declare the shape it borrows as a host
      // capability is how a true list turns into a list nobody trusts.
      const src = readFileSync(componentPath, 'utf8')
        .split('\n')
        .filter((l) => !/^\s*import\s+type\b/.test(l))
        .join('\n');
      const used = aliases.filter((a) => new RegExp(`from\\s*['"]${a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`).test(src)).sort();
      // Either place the boundary can live: written in the island file, or generated from the
      // component into the contracts file. Reading only the island file reported every short-form
      // island as declaring nothing.
      // `[\s\S]*?` up to the closing bracket, because an entry may now be an OBJECT and the old
      // `[^\]]*` stopped at the first one containing a bracket. `readEffectEntries` then normalises
      // both forms to the canonical strings the runtime records.
      const declaredText = readFileSync(elementPath, 'utf8').match(/effects:\s*\[([\s\S]*?)\]/)?.[1];
      const all =
        declaredText !== undefined
          ? readEffectEntries(declaredText)
          : islandContract({ kebab, element: elementPath }, { islandComponentPath, islandComponentExport, names }).effects.slice();
      // The MODULE entries only — see the note above about the other kinds.
      const declared = all.filter((e) => !isKinded(e)).sort();
      const missing = used.filter((u) => !declared.includes(u));
      const stale = declared.filter((d) => !used.includes(d));
      if (missing.length) {
        report.warn('effects', `reaches a host module it does not declare: ${missing.join(', ')} — add it to \`contract.effects\``);
      }
      if (stale.length) {
        report.warn('effects', `declares a host module it does not import: ${stale.join(', ')}`);
      }
      if (!missing.length && !stale.length) {
        report.ok('effects', used.length ? `declares the host modules it reaches: ${used.join(', ')}` : 'reaches no host module');
      }
    }
  }

  // Membership: scan every archipelago file for this tag.
  //
  // An archipelago is shared state, so most islands are NOT in one — an island that couples with
  // nothing is standalone, and that is a normal, permanent state rather than unfinished work. It is
  // declared on the island (`standalone: true`) rather than passed to verify, because it is a property
  // of the island, not of how you happened to invoke the check.
  const declaredStandalone = /\bstandalone:\s*true\b/.test(readFileSync(elementPath, 'utf8'));
  if (tag && archipelagoFilesInclude(`element: '${tag}'`)) {
    report.ok('archipelago', 'member of an archipelago');
  } else if (standalone || declaredStandalone) {
    report.ok('archipelago', 'standalone island — couples with nothing');
  } else {
    report.warn('archipelago', `not in an archipelago — declare \`standalone: true\` if it shares state with no other island`);
  }
  return tag ?? expectedTag;
}

/** The service.method pairs the generated contract actually exposes (each method body is a
 *  `call<…>('Service', 'method', [args])`). Used to reject invented endpoints. */
export function contractPairs() {
  const set = new Set();
  if (!existsSync(paths.contract)) return set;
  const text = readFileSync(paths.contract, 'utf8');
  for (const m of text.matchAll(/'(\w+)',\s*'(\w+)',\s*\[/g)) set.add(`${m[1]}.${m[2]}`);
  return set;
}

/** Unwrap a `[...] as T[]` cast to the underlying node (props arrays are written with an `as` cast). */
export function unwrapAs(node) {
  return node && node.getKind() === SyntaxKind.AsExpression ? node.getExpression() : node;
}

/** The `contract: { ... }` object literal on an options node, if the island uses the grouped form. */
export function contractObj(options) {
  return options?.getProperty('contract')?.getInitializerIfKind(SyntaxKind.ObjectLiteralExpression);
}

/** An options property, preferring the grouped `contract.<contractName>` over the flat `<flatName>`. */
export function optionProp(options, flatName, contractName) {
  return options?.getProperty(flatName) ?? contractObj(options)?.getProperty(contractName);
}

/** The prop names of a `props: [...]` (possibly `as`-cast) assignment — bare strings or {name} specs. */
export function objectArrayStrings(prop) {
  const init = unwrapAs(prop?.getInitializer());
  if (!init || init.getKind() !== SyntaxKind.ArrayLiteralExpression) return [];
  const names = [];
  for (const e of init.getElements()) {
    if (e.getKind() === SyntaxKind.StringLiteral) {
      names.push(e.getText().replace(/['"]/g, ''));
    } else if (e.getKind() === SyntaxKind.ObjectLiteralExpression) {
      const nameProp = e.getProperty('name')?.getInitializer();
      if (nameProp?.getKind() === SyntaxKind.StringLiteral) names.push(nameProp.getText().replace(/['"]/g, ''));
    }
  }
  return names;
}

/** The property names of an `events: { ... }` (possibly `as`-cast) property assignment. */
export function objectKeys(prop) {
  const init = unwrapAs(prop?.getInitializer());
  if (!init || init.getKind() !== SyntaxKind.ObjectLiteralExpression) return [];
  return init.getProperties().map((p) => p.getName?.()).filter(Boolean);
}

/** Lint a stylesheet for the two motu CSS rules: dual-mode host selectors, and colours from tokens.
 *  - css-host-form (error): every `:host` must be functional (`:host(...)`) or wrapped in
 *    `:where(:host, .motu-root)`, so the rule also applies in light isolation (a bare `:host` is
 *    inert in light DOM). The attribute-variant form `:host([attr]), .motu-root[attr]` is fine.
 *  - css-tokens (warn): brand-ish hex literals belong in a `--x-*`/`--_*` token definition or a
 *    `var(...)`, not raw in a normal declaration (white/black are allowed).
 */
export function cssChecks(report, cssText, label) {
  // Blank out comments but keep newlines so line numbers stay accurate.
  const src = cssText.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  const lineAt = (idx) => src.slice(0, Math.max(0, idx)).split('\n').length;

  let bareHost = 0;
  let literals = 0;
  const ruleRe = /([^{}]*)\{([^{}]*)\}/g;
  let m;
  while ((m = ruleRe.exec(src))) {
    const selector = m[1];
    const body = m[2];
    const bodyStart = m.index + m[1].length + 1;

    if (selector.includes(':host')) {
      const stripped = selector.replace(/:where\([^)]*\)/g, '');
      if (/:host(?!\()/.test(stripped)) {
        report.error(
          'css-host-form',
          `${label}: bare \`:host\` — use \`:where(:host, .motu-root)\` (base) or \`:host([attr]), .motu-root[attr]\` (variant) so light mode works`,
          lineAt(m.index + selector.indexOf(':host')),
        );
        bareHost++;
      }
    }

    let d;
    const declRe = /([-\w]+)\s*:\s*([^;]+)/g;
    while ((d = declRe.exec(body))) {
      const prop = d[1];
      if (prop.startsWith('--')) continue; // custom-property definition — the token's literal source
      const brand = (d[2].match(/#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/g) || []).filter(
        (h) => !/^#(fff|ffffff|000|000000)$/i.test(h),
      );
      if (brand.length) {
        report.warn('css-tokens', `${label}: literal colour ${brand[0]} in \`${prop}\` — prefer a --x-*/--_* token`, lineAt(bodyStart + d.index));
        literals++;
      }
    }
  }
  if (!bareHost) report.ok('css-host-form', `${label}: host rules work in both isolation modes`);
  if (!literals) report.ok('css-tokens', `${label}: colours come from tokens`);
}

/** The island's own stylesheet if it owns one (any .css in its folder), else null (opt-in ownership). */
export function islandOwnCss(kebab) {
  const dir = paths.islandDir(kebab);
  if (!existsSync(dir)) return null;
  const css = readdirSync(dir).find((f) => f.endsWith('.css'));
  return css ? resolve(dir, css) : null;
}

/**
 * The balanced block that follows `label` — `{...}` or `[...]`, nesting included.
 *
 * The naive `label:\s*\{([^}]*)\}` this replaces stops at the first inner `}`, which silently
 * truncated any nested declaration (`writes: { 'e': { field: 'key' } }` lost everything after it).
 */
export function blockAfter(code, label, open, from = 0) {
  const at = code.indexOf(label, from);
  if (at === -1) return null;
  const start = code.indexOf(open, at);
  if (start === -1) return null;
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  for (let i = start; i < code.length; i++) {
    if (code[i] === open) depth++;
    else if (code[i] === close && --depth === 0) return { body: code.slice(start + 1, i), end: i };
  }
  return null;
}

/** Every balanced block introduced by `label` in the file. */
export function blocksAfter(code, label, open) {
  const out = [];
  let from = 0;
  for (;;) {
    const at = code.indexOf(label, from);
    if (at === -1) return out;
    const block = blockAfter(code, label, open, at);
    if (!block) return out;
    out.push(block.body);
    from = block.end;
  }
}

/**
 * Store keys read by the islands in an archipelago file, in either `bind` form.
 *
 * The opener has to be the character that IMMEDIATELY follows `bind:` — searching for the next `[`
 * from there would happily jump over a `{...}` bind and land in some unrelated array later in the
 * file, reporting keys nobody binds.
 */
export function boundKeysIn(code) {
  return boundKeyGroups(code).flat();
}

/** The same keys, GROUPED — one array per `bind:` block, which is one per island. */
export function boundKeyGroups(code) {
  const out = [];
  const re = /\bbind:\s*([[{])/g;
  for (const m of code.matchAll(re)) {
    const block = blockAfter(code, 'bind:', m[1], m.index);
    if (!block) continue;
    // In the array form a bare entry IS the key and a `{ prop: 'key' }` entry names one; taking every
    // quoted string would count the prop name as a key, so the renames are read off the value side and
    // the bare entries off what is left.
    const keys =
      m[1] === '['
        ? [
            ...[...block.body.matchAll(/(?<![\w'"])'([^']+)'(?!\s*:)/g)].map((x) => x[1]),
            ...[...block.body.matchAll(/:\s*'([^']+)'/g)].map((x) => x[1]),
          ]
        : [...block.body.matchAll(/:\s*['"]([^'"]+)['"]/g)].map((x) => x[1]);
    out.push(keys);
  }
  return out;
}

/** Store keys in a `bind` / `writes` block: every quoted string that sits on the VALUE side. */
export function keysIn(blocks) {
  return blocks.flatMap((b) => [...b.matchAll(/:\s*['"]([^'"]+)['"]/g)].map((m) => m[1]));
}

/** True if any archipelago file contains the given substring. */
export function archipelagoFilesInclude(needle) {
  const dir = paths.archipelagosDir;
  if (!existsSync(dir)) return false;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const f = paths.archipelagoFile(entry.name);
    if (existsSync(f) && readFileSync(f, 'utf8').includes(needle)) return true;
  }
  return false;
}
