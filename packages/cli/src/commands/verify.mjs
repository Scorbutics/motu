// `motu island verify <name>` — the deterministic gate that turns the README's island rules into
// machine-checkable pass/fail, so an agent can close the loop without a human eyeballing the host.
//
//   static  (AST over the component): no bare fetch, no history/pushState, no document reach-out into
//           the host, all server I/O via @motu/contract, renders from default props alone.
//   config  (AST over the registry):  registered with a REQUIRED legacy-fit strategy; archipelago
//           membership (warn if standalone).
//   runtime (lagoon):                 boots the focused lagoon and asserts the island renders a
//           non-empty shadow DOM in both native and legacy fit. Default: a REAL browser (Playwright/
//           Chromium) so layout/CSS/paint are exercised; `--fast` uses an in-process happy-dom mount.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { Project, SyntaxKind } from 'ts-morph';
import { listIslands } from '../lib/islands.mjs';
import { paths, names, color, HOST, LEGACY_FIT, islandComponentPath } from '../lib/util.mjs';
import { runLagoon, runArchipelagoLagoon, differentiateLagoon } from '../playwright-lagoon.mjs';

const HARNESS = resolve(dirname(fileURLToPath(import.meta.url)), '../runtime-harness.mjs');
// The CLI package root — used as cwd for the harness so `--import tsx` and the @motu/* workspace
// symlinks resolve from packages/cli/node_modules (tsx is not hoisted to the repo root).
const CLI_PKG = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const DOC_QUERIES = new Set(['querySelector', 'querySelectorAll', 'getElementById', 'getElementsByClassName']);

function makeReport() {
  const findings = [];
  return {
    findings,
    error: (check, msg, line) => findings.push({ level: 'error', check, msg, line }),
    warn: (check, msg, line) => findings.push({ level: 'warn', check, msg, line }),
    ok: (check, msg) => findings.push({ level: 'ok', check, msg }),
    /**
     * A rule that does not apply to this project's posture.
     *
     * Deliberately NOT `ok`: a rule silently reported as passing is indistinguishable from a rule that
     * ran, so the two host modes could drift apart with every report still green. `skip` always states
     * the reason.
     */
    skip: (check, msg) => findings.push({ level: 'skip', check, msg }),
  };
}

/** Static analysis of the component source. */
function staticChecks(report, componentPath, pascal) {
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: true,
    compilerOptions: { allowJs: true, jsx: 4 /* react-jsx */ },
  });
  const sf = project.addSourceFileAtPath(componentPath);
  const line = (n) => n.getStartLineNumber();

  let sawFetch = false,
    sawHistory = false,
    sawDoc = false;

  for (const id of sf.getDescendantsOfKind(SyntaxKind.Identifier)) {
    if (id.getText() === 'fetch') {
      const call = id.getParentIfKind(SyntaxKind.CallExpression);
      if (call && call.getExpression() === id) {
        report.error('no-bare-fetch', 'bare fetch() — all I/O must go through @motu/contract', line(id));
        sawFetch = true;
      }
    }
    if (id.getText() === 'XMLHttpRequest') {
      report.error('no-bare-fetch', 'XMLHttpRequest — all I/O must go through @motu/contract', line(id));
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
      report.error('contract-only-io', `imports HTTP client '${spec}' — use @motu/contract`, line(imp));
      badImport = true;
    }
    if (spec === '@motu/runtime' || spec === '@motu/runtime/mock') {
      for (const n of imp.getNamedImports()) {
        if (rawTransport.has(n.getName())) {
          report.error('contract-only-io', `imports raw transport '${n.getName()}' — use @motu/contract`, line(imp));
          badImport = true;
        }
      }
    }
  }
  if (!badImport) report.ok('contract-only-io', 'server I/O only via @motu/contract');

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

  // Contract calls: every @motu/contract service.method the component invokes must exist in the
  // generated contract — catches invented endpoints / method names stale after a backend change.
  const contractServices = new Set();
  for (const imp of sf.getImportDeclarations()) {
    if (imp.getModuleSpecifierValue() === '@motu/contract' && !imp.isTypeOnly()) {
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
        report.error('contract-calls', `calls ${key}() which isn't in @motu/contract`, line(call));
        badCall = true;
      }
    }
    if (!badCall) report.ok('contract-calls', 'contract calls exist in @motu/contract');
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

  // The component's declared prop names (authoritative: the `${Pascal}Props` interface, not the
  // destructure, which only carries defaults). Used by the registry reconciliation in configChecks.
  const iface = sf.getInterface(`${pascal}Props`);
  const propNames = iface ? iface.getProperties().map((m) => m.getName()) : null;
  return { propNames };
}

/** Registry + archipelago membership checks. Returns the tag if registered. */
function configChecks(report, kebab, pascal, expectedTag, standalone, componentProps, componentPath) {
  const elementPath = paths.elementFile(kebab);
  if (!existsSync(elementPath)) {
    report.error('registered', `no element.ts at ${paths.rel(elementPath)}`);
    return null;
  }
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: true,
    compilerOptions: { allowJs: true },
  });
  const sf = project.addSourceFileAtPath(elementPath);

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

  // The exported ElementSpec object literal for this island.
  let row;
  for (const obj of sf.getDescendantsOfKind(SyntaxKind.ObjectLiteralExpression)) {
    if (obj.getProperty('tag') && obj.getProperty('component')) {
      row = obj;
      break;
    }
  }
  if (!row) {
    report.error('registered', `${pascal} has no ElementSpec in ${paths.rel(elementPath)}`);
    return null;
  }
  const comp = row.getProperty('component')?.getText().replace(/^component:\s*/, '').trim();
  if (comp && comp !== pascal) {
    report.warn('registered', `element.ts component is '${comp}', expected ${pascal}`);
  }

  // Confirm it's wired into the assembled ELEMENT_REGISTRY.
  const registryText = existsSync(paths.islandsRegistry) ? readFileSync(paths.islandsRegistry, 'utf8') : '';
  // Either layout's specifier: flat `./<kebab>.island.js` or the original `./<kebab>/element.js`.
  if (registryText.includes(`./${kebab}.island.js`) || registryText.includes(`./${kebab}/element.js`)) {
    report.ok('registered', 'registered in ELEMENT_REGISTRY');
  } else {
    report.error('registered', `not wired into ${paths.rel(paths.islandsRegistry)}`);
  }

  const tag = row
    .getProperty('tag')
    ?.getText()
    .replace(/^tag:\s*/, '')
    .trim()
    .replace(/['"]/g, '');
  const options = row.getProperty('options')?.getInitializerIfKind(SyntaxKind.ObjectLiteralExpression);
  // Fitting an island to a legacy skin is only meaningful when the host HAS one. On a React host
  // (next/none) the island mounts directly, so requiring the strategy would be dead ceremony.
  // POSTURE FIRST. Testing for the field first (as this did) makes the skip branch unreachable for any
  // project that declares it — which is every project, because the type used to require it. peps' eight
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
    const registeredProps = objectArrayStrings(optionProp(options, 'props', 'input'));
    const eventKeys = objectKeys(optionProp(options, 'events', 'output'));
    const before = report.findings.length;

    for (const rp of registeredProps) {
      if (!compNames.includes(rp)) {
        report.error('props-match', `registered prop '${rp}' is not a prop of ${pascal} (dead registry entry)`);
      }
    }
    for (const cp of compNames) {
      if (cp === 'fit') continue; // framework-injected footprint prop
      if (cp.startsWith('on')) {
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

  // --- ambient: the third leg of the boundary ---------------------------------------------------
  //
  // Input and output are declared. AMBIENT — the host capabilities a component reaches for without
  // being handed them: a React context, a session hook, a feature gate, a service module it imports
  // directly — was not, and it is the coupling most likely to make an island unmountable somewhere
  // else. It hid in the lagoon's `alias` table, where standing a module down looked like build
  // configuration rather than a declared dependency.
  //
  // It is DERIVED, not asked for twice: the lagoon's alias keys are exactly the modules this project
  // has had to stand down, so an island importing one of them requires it. Declaring `ambient` makes
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
      const src = readFileSync(componentPath, 'utf8');
      const used = aliases.filter((a) => new RegExp(`from\\s*['"]${a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`).test(src)).sort();
      const declared = (readFileSync(elementPath, 'utf8').match(/ambient:\s*\[([^\]]*)\]/)?.[1] ?? '')
        .split(',').map((x) => x.trim().replace(/['"]/g, '')).filter(Boolean).sort();
      const missing = used.filter((u) => !declared.includes(u));
      const stale = declared.filter((d) => !used.includes(d));
      if (missing.length) {
        report.warn('ambient', `reaches host capability not declared: ${missing.join(', ')} — add it to \`contract.ambient\``);
      }
      if (stale.length) {
        report.warn('ambient', `declares ambient it does not use: ${stale.join(', ')}`);
      }
      if (!missing.length && !stale.length) {
        report.ok('ambient', used.length ? `declares its host capabilities: ${used.join(', ')}` : 'reaches no host capability');
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
function contractPairs() {
  const set = new Set();
  if (!existsSync(paths.contract)) return set;
  const text = readFileSync(paths.contract, 'utf8');
  for (const m of text.matchAll(/'(\w+)',\s*'(\w+)',\s*\[/g)) set.add(`${m[1]}.${m[2]}`);
  return set;
}

/** Unwrap a `[...] as T[]` cast to the underlying node (props arrays are written with an `as` cast). */
function unwrapAs(node) {
  return node && node.getKind() === SyntaxKind.AsExpression ? node.getExpression() : node;
}

/** The `contract: { ... }` object literal on an options node, if the island uses the grouped form. */
function contractObj(options) {
  return options?.getProperty('contract')?.getInitializerIfKind(SyntaxKind.ObjectLiteralExpression);
}

/** An options property, preferring the grouped `contract.<contractName>` over the flat `<flatName>`. */
function optionProp(options, flatName, contractName) {
  return options?.getProperty(flatName) ?? contractObj(options)?.getProperty(contractName);
}

/** The prop names of a `props: [...]` (possibly `as`-cast) assignment — bare strings or {name} specs. */
function objectArrayStrings(prop) {
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
function objectKeys(prop) {
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
function cssChecks(report, cssText, label) {
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
function islandOwnCss(kebab) {
  const dir = paths.islandDir(kebab);
  if (!existsSync(dir)) return null;
  const css = readdirSync(dir).find((f) => f.endsWith('.css'));
  return css ? resolve(dir, css) : null;
}

/** True if any archipelago file contains the given substring. */
function archipelagoFilesInclude(needle) {
  const dir = paths.archipelagosDir;
  if (!existsSync(dir)) return false;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const f = paths.archipelagoFile(entry.name);
    if (existsSync(f) && readFileSync(f, 'utf8').includes(needle)) return true;
  }
  return false;
}

/** Map the runtime result's diagnostics + remount signal onto report findings (shared by both engines). */
function reportRuntimeDiagnostics(report, r, label) {
  const diagnostics = r?.diagnostics ?? [];
  if (diagnostics.length === 0) {
    report.ok('no-console-errors', `no console errors / unhandled rejections (${label})`);
  } else {
    report.error('no-console-errors', `console error / unhandled rejection (${label}): ${diagnostics[0]}`);
  }

  if (r?.remountIdentical === true) {
    report.ok('remount-stable', `re-mount produces identical output (${label})`);
  } else if (r?.remountIdentical === false) {
    report.error('remount-stable', `re-mount changed the output (${label}) — likely accidental module-level state`);
  }
  // remountIdentical == null → the island never rendered; the mount error already covers it.
}

/** Fast in-process lagoon mount under happy-dom for one fit (used with --fast). */
function runtimeCheckFast(report, tag, fixturesPath, fit) {
  const args = ['--import', 'tsx', HARNESS, tag, fixturesPath || '', fit];
  const res = spawnSync(process.execPath, args, { encoding: 'utf8', cwd: CLI_PKG });
  if (res.status !== 0) {
    report.error('lagoon-render', `lagoon mount failed (fit=${fit}) — ${(res.stderr || '').trim().split('\n').pop() || 'no output'}`);
    return;
  }
  const jsonLine = (res.stdout || '').trim().split('\n').filter(Boolean).pop();
  let parsed;
  try {
    parsed = JSON.parse(jsonLine);
  } catch {
    report.error('lagoon-render', `lagoon produced no result (fit=${fit})`);
    return;
  }
  if (parsed.ok) report.ok('lagoon-render', `renders in the lagoon (happy-dom, fit=${fit})`);
  else if (!parsed.mounted) report.error('lagoon-render', `island tag <${tag}> did not upgrade (fit=${fit})`);
  else report.warn('lagoon-render', `mounts but renders nothing from default props (fit=${fit}) — confirm this island's empty state is intentional (e.g. a pure projection)`);
  reportRuntimeDiagnostics(report, parsed, `fit=${fit}`);
}

/**
 * Data-flow (differentiation) check. Opt-in: only runs when the island's fixtures export two or more
 * `scenarios` (distinct store seeds). Drives each seed across the archipelago boundary and asserts the
 * rendered output DIFFERS — proving inputs actually flow across the seam (criteria -> contract ->
 * render), not merely that the wiring type-checks. Uses the real-browser lagoon by default (so Vite
 * resolves the island's assets); `--fast` uses the in-process happy-dom harness. Silent when fewer than
 * two scenarios are declared.
 */
function readScenarios(fixturesPath) {
  const args = ['--import', 'tsx', HARNESS, '', fixturesPath, 'native', 'scenarios'];
  const res = spawnSync(process.execPath, args, { encoding: 'utf8', cwd: CLI_PKG });
  if (res.status !== 0) return [];
  const jsonLine = (res.stdout || '').trim().split('\n').filter(Boolean).pop();
  try {
    return JSON.parse(jsonLine).scenarios ?? [];
  } catch {
    return [];
  }
}

async function runtimeDifferentiationCheck(report, tag, fixturesPath, port, fast) {
  if (!fixturesPath) return;
  const scenarios = readScenarios(fixturesPath);
  if (scenarios.length < 2) return; // the check is opt-in

  if (fast) {
    // In-process happy-dom: mount once per seed and diff (works when the registry has no vite-only imports).
    const args = ['--import', 'tsx', HARNESS, tag, fixturesPath, 'native', 'differentiate'];
    const res = spawnSync(process.execPath, args, { encoding: 'utf8', cwd: CLI_PKG });
    if (res.status !== 0) return;
    const jsonLine = (res.stdout || '').trim().split('\n').filter(Boolean).pop();
    let parsed;
    try {
      parsed = JSON.parse(jsonLine);
    } catch {
      return;
    }
    reportDifferentiation(report, parsed);
    return;
  }

  try {
    const r = await differentiateLagoon({ tag, port, scenarios });
    reportDifferentiation(report, r);
  } catch (err) {
    const msg = String(err?.message || err).split('\n')[0];
    if (!/Executable doesn't exist|playwright install/i.test(msg)) {
      report.warn('data-flow', `differentiation check could not run: ${msg}`);
    }
  }
}

function reportDifferentiation(report, r) {
  if (!r || r.differentiates == null) return;
  if (r.differentiates) {
    report.ok('data-flow', `distinct inputs produce distinct output (${r.scenarioCount} scenarios) — data flows past the seam`);
  } else {
    report.error(
      'data-flow',
      `${r.scenarioCount} scenarios rendered identically — inputs don't reach the output: the seam is wired but data doesn't flow (bind gap, or fixtures aren't request-keyed with \`match\`)`,
    );
  }
}

/**
 * Condense a lagoon boot failure into one actionable line.
 *
 * startLagoon attaches vite's own stdout/stderr to the error, but taking only the first line threw it
 * away — so every misconfiguration surfaced as "vite did not open port N in time", which says nothing
 * about the cause. Keep the headline, then append the first line of vite output that actually names
 * the problem.
 */
function lagoonFailure(err) {
  const full = String(err?.message || err);
  const headline = full.split('\n')[0];
  const detail = full
    .split('\n')
    .find((l) => /^(Error|\s*failed to|.*ERR_[A-Z_]+|.*Cannot find)/.test(l) && !l.includes('did not open port'));
  return detail ? `${headline} — ${detail.trim()}` : headline;
}

/** Real-browser lagoon mount via Playwright/Chromium for one fit (the default). */
async function runtimeCheckBrowser(report, tag, fit, port) {
  try {
    const r = await runLagoon({ tag, fit, port });
    if (r.ok) report.ok('lagoon-render', `renders in the real-browser lagoon (fit=${fit})`);
    else if (!r.mounted) report.error('lagoon-render', `island tag <${tag}> did not upgrade (fit=${fit})`);
    else report.warn('lagoon-render', `mounts but renders nothing from default props (fit=${fit}) — confirm this island's empty state is intentional (e.g. a pure projection)`);
    reportRuntimeDiagnostics(report, r, `fit=${fit}`);
  } catch (err) {
    const msg = lagoonFailure(err);
    if (/Executable doesn't exist|playwright install/i.test(msg)) {
      report.error('lagoon-render', `Chromium not installed — run \`npx playwright install chromium\` (in packages/cli), or use --fast for the happy-dom mount`);
    } else {
      report.error('lagoon-render', `lagoon failed (fit=${fit}): ${msg}`);
    }
  }
}

/** Mount the island against a backend that fails every call (500), asserting it survives — renders and
 *  leaks no unhandled rejection / console error (i.e. it catches its own fetch failures). */
async function runtimeErrorCheck(report, tag, port) {
  try {
    const r = await runLagoon({ tag, fit: 'native', port, forceError: 500, checkRemount: false });
    if (!r.mounted) {
      report.warn('error-resilient', 'island did not mount under forced backend errors');
    } else if (r.diagnostics.length === 0) {
      report.ok('error-resilient', 'survives a backend error (renders, no unhandled rejection)');
    } else {
      report.error('error-resilient', `unhandled backend error — the island must catch its own calls: ${r.diagnostics[0]}`);
    }
  } catch (err) {
    const msg = lagoonFailure(err);
    // A missing browser is already reported by the normal lagoon check; don't double-report.
    if (!/Executable doesn't exist|playwright install/i.test(msg)) {
      report.error('error-resilient', `error mount failed: ${msg}`);
    }
  }
}

// Known adapter packages -> their verify contribution's export specifier. Discovery is by the adapter
// the island actually imports (read from element.ts), resolved via the package's `./verify` export.
const ADAPTER_VERIFY = {
  '@motu/adapter-angularjs': '@motu/adapter-angularjs/verify',
  '@motu/adapter-next': '@motu/adapter-next/verify',
};

// Fallback discovery for hosts whose islands don't import an adapter at the mount point.
const HOST_ADAPTER_VERIFY = { next: '@motu/adapter-next/verify' };

/** Extract the structured `contract.coupling` from an island's element.ts (AST, not regex). */
function extractCoupling(elementPath) {
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: true,
    compilerOptions: { allowJs: true },
  });
  const sf = project.addSourceFileAtPath(elementPath);
  const strAt = (obj, name) => {
    const init = obj.getProperty(name)?.getInitializer();
    return init && init.getKind() === SyntaxKind.StringLiteral ? init.getText().replace(/['"]/g, '') : undefined;
  };
  for (const obj of sf.getDescendantsOfKind(SyntaxKind.ObjectLiteralExpression)) {
    const contract = obj.getProperty('contract')?.getInitializerIfKind(SyntaxKind.ObjectLiteralExpression);
    const coupling = contract?.getProperty('coupling')?.getInitializerIfKind(SyntaxKind.ObjectLiteralExpression);
    if (!coupling) continue;
    const hsProp = coupling.getProperty('hostScope');
    return {
      adopt: strAt(coupling, 'adopt'),
      inheritScope: strAt(coupling, 'inheritScope'),
      hostScopeKey: strAt(coupling, 'hostScopeKey'),
      hostScope: hsProp ? objectArrayStrings(hsProp) : undefined,
    };
  }
  return {};
}

/**
 * Adapter-owned verify layer. Core verify is framework-neutral; the one coupling it cannot judge is an
 * island reaching into the ocean's own framework scope. Discover the adapter the island imports (from
 * element.ts) and hand its verify contribution the STRUCTURED coupling we extract by AST — the CLI owns
 * the parsing (it has ts-morph), the adapter owns the semantics.
 */
async function adapterChecks(report, kebab, componentPath) {
  const elementPath = paths.elementFile(kebab);
  if (!existsSync(elementPath)) return;
  const text = readFileSync(elementPath, 'utf8');
  // Discovery is by the adapter the island IMPORTS — right for AngularJS, where the mount point is
  // adapter-specific. A React host's mount point imports no adapter (the adapter lives at the
  // composition root), so fall back to the configured host: the coupling is a property of where the
  // island is going, not of what element.ts happens to import.
  const pkgs = [...text.matchAll(/from\s+['"](@motu\/adapter-[\w-]+)['"]/g)].map((m) => m[1]);
  const specifier = pkgs.map((p) => ADAPTER_VERIFY[p]).find(Boolean) ?? HOST_ADAPTER_VERIFY[HOST];
  if (!specifier) return; // no adapter ships a verify contribution for this island/host
  const coupling = extractCoupling(elementPath);
  // Hand over the component source too: some host boundaries (Next's server/client split) live in the
  // component, not in the mount point. The CLI reads; the adapter judges.
  const source = componentPath && existsSync(componentPath) ? readFileSync(componentPath, 'utf8') : undefined;
  try {
    const mod = await import(specifier);
    for (const f of mod.checkCoupling({ coupling, source, elementSource: text })) report[f.level](f.check, f.msg);
  } catch (err) {
    report.warn('adapter-verify', `could not run ${specifier}: ${String(err?.message || err)}`);
  }
}

export async function verifyCommand(argv) {
  const name = argv._[0];
  if (!name) {
    console.error('usage: motu island verify <name> [--no-runtime] [--fast] [--standalone] [--json]');
    process.exit(2);
  }
  const { pascal, kebab, tag } = names(name);
  // Follow element.ts to the component it mounts: on a React host the island wraps a component the
  // app already owns, which does not live under ui/.
  const componentPath = islandComponentPath(kebab, pascal);
  const uiDir = paths.uiDir(kebab);
  const isReactIsland = existsSync(componentPath);
  // An AngularJS island has no React `.tsx` — its component is a `*.ng.ts` spec (in ui/<kebab>/).
  const isAdapterIsland =
    !isReactIsland &&
    existsSync(uiDir) &&
    readdirSync(uiDir).some((f) => f.endsWith('.ng.ts'));
  if (!isReactIsland && !isAdapterIsland) {
    console.error(color.red(`✗ no island component at ${componentPath}`));
    process.exit(1);
  }

  const report = makeReport();
  let componentProps = null;
  let resolvedTag = tag;
  if (isReactIsland) {
    componentProps = staticChecks(report, componentPath, pascal);
    resolvedTag = configChecks(report, kebab, pascal, tag, argv.standalone, componentProps, componentPath) ?? tag;
  } else {
    report.ok('adapter-island', `AngularJS island (no React component) — running config-lite + adapter + runtime checks`);
  }

  // Adapter-owned checks (e.g. the AngularJS host-scope contract) fold in regardless of island kind.
  await adapterChecks(report, kebab, isReactIsland ? componentPath : null);

  // CSS lint of the island's OWN stylesheet if it owns one (opt-in; the shared sheet is linted at
  // region scope by `motu archipelago verify`).
  const ownCss = islandOwnCss(kebab);
  if (ownCss) cssChecks(report, readFileSync(ownCss, 'utf8'), paths.rel(ownCss));

  if (argv.runtime !== false) {
    // Randomize the base port so parallel/back-to-back verifies don't collide on a strict port.
    let port = 5300 + Math.floor(Math.random() * 400);
    const fixturesPath = existsSync(paths.fixturesFile(kebab)) ? paths.fixturesFile(kebab) : '';
    // 'legacy' fit re-mounts the island under the host's legacy skin. Skip it where there is no
    // legacy skin — it would verify the same thing twice and double the wall clock.
    for (const fit of LEGACY_FIT ? ['native', 'legacy'] : ['native']) {
      if (argv.fast) {
        runtimeCheckFast(report, resolvedTag, fixturesPath, fit);
      } else {
        await runtimeCheckBrowser(report, resolvedTag, fit, port++);
      }
    }
    // Error-resilience mount (real browser only; the happy-dom --fast path can't host the lagoon).
    if (!argv.fast) await runtimeErrorCheck(report, resolvedTag, port++);
    // Data-flow differentiation (opt-in via declared `scenarios`).
    await runtimeDifferentiationCheck(report, resolvedTag, fixturesPath, port++, Boolean(argv.fast));
  }

  const errors = report.findings.filter((f) => f.level === 'error');
  const warns = report.findings.filter((f) => f.level === 'warn');

  if (argv.json) {
    console.log(JSON.stringify({ island: kebab, tag: resolvedTag, pass: errors.length === 0, findings: report.findings }, null, 2));
  } else {
    printReport(report, `motu island verify — ${kebab} (${resolvedTag})`, errors, warns);
  }

  process.exit(errors.length === 0 ? 0 : 1);
}

/** Pretty-print a report's findings + the PASS/FAIL summary line (shared by island + archipelago verify). */
function printReport(report, title, errors, warns) {
  console.log(color.bold(`\n${title}\n`));
  for (const f of report.findings) {
    const mark =
      f.level === 'error'
        ? color.red('✗')
        : f.level === 'warn'
          ? color.yellow('!')
          : f.level === 'skip'
            ? color.dim('–')
            : color.green('✓');
    const at = f.line ? color.dim(`  (line ${f.line})`) : '';
    console.log(`  ${mark} ${color.dim(f.check.padEnd(18))} ${f.msg}${at}`);
  }
  console.log('');
  if (errors.length === 0) console.log(color.green(color.bold(`PASS`)) + color.dim(`  ${warns.length} warning(s)`));
  else console.log(color.red(color.bold(`FAIL`)) + `  ${errors.length} error(s), ${warns.length} warning(s)`);
}

/** All island tags declared in the registry, gathered from each islands/<kebab>/element.ts `tag:`. */
function registeredTags() {
  const tags = new Set();
  if (!existsSync(paths.islandsDir)) return tags;
  for (const entry of listIslands(paths.islandsDir)) {
    const el = entry.element;
    if (!existsSync(el)) continue;
    const m = readFileSync(el, 'utf8').match(/tag:\s*['"]([^'"]+)['"]/);
    if (m) tags.add(m[1]);
  }
  return tags;
}

/** Static checks over an archipelago config file: it's registered, and every island tag it uses exists. */
function archipelagoConfigChecks(report, id) {
  const archPath = paths.archipelagoFile(id);
  if (!existsSync(archPath)) {
    report.error('registered', `no archipelago at ${paths.rel(archPath)}`);
    return;
  }
  const text = readFileSync(archPath, 'utf8');

  // The region's declared shape (D8). Under a host that owns its own page state, the page and the
  // archipelago otherwise name the same values twice with nothing linking them — peps' page called it
  // `loadingReceived` while the store key was `receivedLoading`. Requiring the parameter makes the
  // app's own type the single vocabulary, and a rename becomes a compile error.
  //
  // Skipped on an ocean: there is no app-side type to extract there — region state lives in `$scope`
  // and motu declares it, so there is no second declaration and nothing to drift against.
  if (LEGACY_FIT) {
    report.skip('region-type', `region state is motu's on host '${HOST}' — no app-side type to reference`);
  } else {
    const param = text.match(/ArchipelagoConfig<\s*([A-Za-z_$][\w$]*)\s*>/);
    if (param) {
      report.ok('region-type', `bind keys are checked against \`${param[1]}\``);
    } else {
      report.error(
        'region-type',
        'ArchipelagoConfig has no region type — declare `ArchipelagoConfig<TRegion>` with a type ' +
          'EXTRACTED FROM THE APP (no motu import, erases at runtime) so bind keys cannot drift from it',
      );
    }
  }

  // --- coupling: which members actually share state? -------------------------------------------
  //
  // An archipelago is a declared grouping of islands scattered across ONE PAGE. Most members couple
  // with nothing — they are fed by props or read the backend themselves — and that is normal, not a
  // smell: a page is a mix. So there is no rule here that a grouping must be coupled.
  //
  // What IS reported: a key written inside and read by no member. That means the coupling escapes the
  // archipelago, and it is the check that found the real bug — `newReceivedCount` was written here and
  // read by a button on the same page that had been left out because the boundary followed a DOM
  // subtree rather than the page.
  //
  // A warning, not an error: under Model B the host page is a legitimate reader, so a key crossing to
  // it is a design choice the rule names rather than forbids.
  {
    // Over CODE, not comments. `motu archipelago create` scaffolds its wiring examples as comments
    // (`// bind: { someProp: 'someStoreKey' }`), so analysing the raw text reports a scaffolded TODO
    // as real shared state — a green light for coupling that does not exist. Blank comments out,
    // keeping newlines so any line number stays true.
    const code = text
      .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
      .replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length));
    const written = new Set([...code.matchAll(/store\.set\(\s*['"]([^'"]+)['"]/g)].map((m) => m[1]));
    const bindBlocks = [...code.matchAll(/bind:\s*\{([^}]*)\}/g)].map((m) => m[1]).join(',');
    const read = new Set([...bindBlocks.matchAll(/:\s*['"]([^'"]+)['"]/g)].map((m) => m[1]));
    const shared = [...written].filter((k) => read.has(k));

    const orphanKeys = [...written].filter((k) => !read.has(k));
    if (orphanKeys.length) {
      report.warn(
        'coupling',
        `key(s) written but read by no island here: ${orphanKeys.join(', ')} — the coupling ESCAPES this ` +
          `archipelago. Either its reader is an island on this page that is not a member yet, or it is ` +
          `cross-page, which the lagoon does not verify (D11) and the store does not survive`,
      );
    }
    if (shared.length) {
      report.ok('coupling', `shared state: ${shared.join(', ')}`);
    } else {
      // Always say something. A check that reports nothing is indistinguishable from one that did not
      // run — and "these islands are independent" is a real, useful answer, not an absence.
      report.ok('coupling', 'no shared state between islands — a page whose islands are independent');
    }
  }

  const registryText = existsSync(paths.archipelagosRegistry) ? readFileSync(paths.archipelagosRegistry, 'utf8') : '';
  if (registryText.includes(`./${id}/${id}.archipelago.js`)) {
    report.ok('registered', 'registered in ARCHIPELAGOS');
  } else {
    report.error('registered', `not wired into ${paths.rel(paths.archipelagosRegistry)}`);
  }

  // Every `element: 'x-…'` the config references must be a registered island tag.
  const known = registeredTags();
  const used = [...text.matchAll(/element:\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
  const unknown = [...new Set(used)].filter((t) => !known.has(t));
  if (used.length === 0) {
    report.warn('islands-registered', 'archipelago declares no islands');
  } else if (unknown.length === 0) {
    report.ok('islands-registered', `all ${new Set(used).size} island tag(s) are registered`);
  } else {
    report.error('islands-registered', `unknown island tag(s): ${unknown.join(', ')} — not in ELEMENT_REGISTRY`);
  }

  // Does this region have an arrangement to render?
  //
  // Two places it can live, and checking only the first is what made removing a duplicated template
  // silently disable the whole-region render — the check that catches slot/config drift:
  //   1. a `layout:` template in the archipelago config (the ocean's answer), or
  //   2. the region named in the lagoon overrides' `layout` map, i.e. the APPLICATION's own layout
  //      component, which is the right answer under a React host and the one that cannot drift.
  // Genuinely layout-less still means "islands placed individually across the host", and still skips.
  if (/\blayout\s*:/.test(text)) return true;
  for (const f of ['src/lagoon.tsx', 'src/lagoon.ts']) {
    const overrides = resolve(paths.lagoonDir, f);
    if (!existsSync(overrides)) continue;
    const src = readFileSync(overrides, 'utf8');
    const map = src.match(/export const layout[^=]*=\s*\{([\s\S]*?)\n\};/);
    if (map && new RegExp(`(^|[\\s{,])['"\`]?${id}['"\`]?\\s*:`, 'm').test(map[1])) return true;
  }
  return false;
}

export async function archipelagoVerifyCommand(argv) {
  const id = argv._[0];
  if (!id) {
    console.error('usage: motu archipelago verify <id> [--no-runtime] [--json]');
    process.exit(2);
  }

  const report = makeReport();
  const hasLayout = archipelagoConfigChecks(report, id);

  // Region styling: until islands own their CSS, the shared sheet is the region's stylesheet — lint it.
  if (existsSync(paths.sharedStyles)) {
    cssChecks(report, readFileSync(paths.sharedStyles, 'utf8'), paths.rel(paths.sharedStyles));
  }

  if (argv.runtime !== false) {
    if (!hasLayout) {
      report.warn('lagoon-render', 'no layout — islands are placed individually across the host, not as a region; region render skipped');
    } else {
      const port = 5300 + Math.floor(Math.random() * 400);
      try {
        const r = await runArchipelagoLagoon({ id, port });
        if (r.region) {
          const unmounted = r.islands.filter((i) => !i.tag);
          if (r.islands.length === 0) {
            report.error('lagoon-render', 'archipelago region rendered no island slots');
          } else if (unmounted.length === 0) {
            report.ok('lagoon-render', `region + all ${r.islands.length} island(s) mounted in the lagoon`);
          } else {
            report.error('lagoon-render', `slot(s) with no island mounted: ${unmounted.map((i) => i.slot || '?').join(', ')}`);
          }
        } else {
          report.error('lagoon-render', `archipelago <${id}> did not render — unknown id or boot failure`);
        }
        reportRuntimeDiagnostics(report, r, 'region');
      } catch (err) {
        const msg = String(err?.message || err).split('\n')[0];
        if (/Executable doesn't exist|playwright install/i.test(msg)) {
          report.error('lagoon-render', `Chromium not installed — run \`npx playwright install chromium\` (in packages/cli)`);
        } else {
          report.error('lagoon-render', `lagoon failed: ${msg}`);
        }
      }
    }
  }

  const errors = report.findings.filter((f) => f.level === 'error');
  const warns = report.findings.filter((f) => f.level === 'warn');

  if (argv.json) {
    console.log(JSON.stringify({ archipelago: id, pass: errors.length === 0, findings: report.findings }, null, 2));
  } else {
    printReport(report, `motu archipelago verify — ${id}`, errors, warns);
  }

  process.exit(errors.length === 0 ? 0 : 1);
}
