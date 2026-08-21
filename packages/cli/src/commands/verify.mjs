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
import { SyntaxKind } from 'ts-morph';
import { sourceFileAt } from '../lib/ts-project.mjs';
import { listIslands } from '../lib/islands.mjs';
import { readRegions } from '../lib/eject.mjs';
import { stubParity } from '../lib/stubs.mjs';
import { islandContract, contractsDrift } from '../lib/contracts.mjs';
import { blankComments, paths, names, color, HOST, HOST_ROOT, APP_ROOT, resolveAppImport, LEGACY_FIT, islandComponentPath, islandComponentExport, islandComponentIdentifier, lagoonViewports, lagoonA11y } from '../lib/util.mjs';
import {
  runLagoon,
  runArchipelagoLagoon,
  differentiateLagoon,
  responsiveLagoon,
  axeLagoon,
  probeWiring,
  runRegionFlows,
} from '../playwright-lagoon.mjs';

const HARNESS = resolve(dirname(fileURLToPath(import.meta.url)), '../runtime-harness.mjs');
// The CLI package root — used as cwd for the harness so `--import tsx` and the @motu/* workspace
// symlinks resolve from packages/cli/node_modules (tsx is not hoisted to the repo root).
const CLI_PKG = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const DOC_QUERIES = new Set(['querySelector', 'querySelectorAll', 'getElementById', 'getElementsByClassName']);

/**
 * Say what is happening while it happens.
 *
 * The runtime checks drive a real browser, and a run that prints nothing until the end is
 * indistinguishable from a run that has hung — which is exactly how it read at fifteen islands. With
 * `--verbose` each step names itself as it starts and reports what it cost, so a slow check is
 * identifiable rather than merely suspected.
 */
let progressLabel = '';
let verbose = false;
export function setProgressScope(label) {
  progressLabel = label;
}

/** Turned on once per command (`--verbose`), rather than threaded through every check's arguments. */
export function setVerbose(on) {
  verbose = !!on;
}

export async function step(name, run) {
  if (!verbose) return run();
  const at = Date.now();
  process.stderr.write(color.dim(`  · ${progressLabel ? `${progressLabel} ` : ''}${name}…`));
  try {
    return await run();
  } finally {
    process.stderr.write(color.dim(` ${((Date.now() - at) / 1000).toFixed(1)}s\n`));
  }
}

function makeReport() {
  const findings = [];
  return {
    findings,
    error: (check, msg, line) => findings.push({ level: 'error', check, msg, line }),
    warn: (check, msg, line) => findings.push({ level: 'warn', check, msg, line }),
    /**
     * A claim that HELD — and, optionally, how much was looked at to say so.
     *
     * `seen` is not decoration. The worst bug of the Twenty adoption was `removal-check` printing
     * "no motu references in the host application" over a fully integrated app: it scanned the wrong
     * directories, examined ZERO files, and reported that as success. A check that looked at nothing
     * cannot have held, so passing `seen: 0` is converted to a `skip` here rather than trusted —
     * every call site gets the invariant whether or not its author thought about emptiness.
     */
    ok: (check, msg, seen) => {
      const n = Array.isArray(seen) ? seen.length : typeof seen === 'object' && seen ? seen.n : seen;
      const of = typeof seen === 'object' && seen && !Array.isArray(seen) ? seen.of : undefined;
      if (n === 0) {
        findings.push({
          level: 'skip',
          check,
          msg: `nothing to look at${of ? ` (no ${of})` : ''} — "${msg}" is not a result this run can claim`,
          examined: 0,
        });
        return;
      }
      findings.push({ level: 'ok', check, msg, ...(n === undefined ? {} : { examined: n, examinedOf: of }) });
    },
    /**
     * A rule that does not apply to this project's posture.
     *
     * Deliberately NOT `ok`: a rule silently reported as passing is indistinguishable from a rule that
     * ran, so the two host modes could drift apart with every report still green. `skip` always states
     * the reason.
     */
    skip: (check, msg) => findings.push({ level: 'skip', check, msg }),
    /**
     * COULD NOT LOOK — the check did not run, for a reason that is not the code's fault.
     *
     * A port that never opened, a browser that is not installed, a dev server that lost a race. A
     * human shrugs and re-runs. An AGENT reads `✗` and repairs a bug that does not exist, and with
     * several agents that is several confident wrong repairs — so this is the third outcome the
     * report needs, distinct from both "holds" and "contradicted", and the run exits 2 rather than 1
     * so a loop can tell "retry" from "fix".
     */
    inconclusive: (check, msg) => findings.push({ level: 'inconclusive', check, msg }),
  };
}

/** Static analysis of the component source. */
function staticChecks(report, componentPath, pascal) {
  const sf = sourceFileAt(componentPath, { allowJs: true, jsx: 4 /* react-jsx */ });
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
function paramPropNames(fn) {
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
function configChecks(report, kebab, pascal, expectedTag, standalone, componentProps, componentPath) {
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
  const shortForm = !row && /\bisland\(\s*'[^']+'/.test(elementText);
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
  // Either layout's specifier: flat `./<kebab>.island.js` or the original `./<kebab>/element.js`.
  if (registryText.includes(`./${kebab}.island.js`) || registryText.includes(`./${kebab}/element.js`)) {
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
      const declaredText = readFileSync(elementPath, 'utf8').match(/ambient:\s*\[([^\]]*)\]/)?.[1];
      const declared = (
        declaredText !== undefined
          ? declaredText.split(',').map((x) => x.trim().replace(/['"]/g, '')).filter(Boolean)
          : islandContract({ kebab, element: elementPath }, { islandComponentPath, islandComponentExport, names }).ambient
      ).slice().sort();
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

/**
 * The balanced block that follows `label` — `{...}` or `[...]`, nesting included.
 *
 * The naive `label:\s*\{([^}]*)\}` this replaces stops at the first inner `}`, which silently
 * truncated any nested declaration (`writes: { 'e': { field: 'key' } }` lost everything after it).
 */
function blockAfter(code, label, open, from = 0) {
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
function blocksAfter(code, label, open) {
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
function boundKeysIn(code) {
  return boundKeyGroups(code).flat();
}

/** The same keys, GROUPED — one array per `bind:` block, which is one per island. */
function boundKeyGroups(code) {
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
function keysIn(blocks) {
  return blocks.flatMap((b) => [...b.matchAll(/:\s*['"]([^'"]+)['"]/g)].map((m) => m[1]));
}

/** Every quoted string in a block (used for the `provides: [...]` array). */
function quotedIn(block) {
  return block ? [...block.body.matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1]) : [];
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
    const r = await step('data-flow', () => differentiateLagoon({ tag, port, scenarios }));
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
/**
 * Was this the ENVIRONMENT failing, rather than the code?
 *
 * Decided on two signals, and the second one matters more than the first: a known environmental
 * signature, AND the absence of any application cause in the output. `lagoonFailure` already appends
 * the first line of vite's output that names a problem — when that line exists, something in the
 * project is broken and this is a finding, whatever the headline says.
 */
const ENVIRONMENTAL =
  /did not open port .* in time|Executable doesn't exist|playwright install|EADDRINUSE|ECONNREFUSED|ETIMEDOUT|Target page, context or browser has been closed|browserType\.launch/i;

function environmentalCause(err) {
  const full = String(err?.message || err);
  if (!ENVIRONMENTAL.test(full)) return null;
  // An application cause anywhere in the output disqualifies it: the port never opened BECAUSE the
  // project does not build, and that is a finding.
  const appCause = full
    .split('\n')
    .find((l) => /^(Error|\s*failed to|.*ERR_[A-Z_]+|.*Cannot find)/.test(l) && !l.includes('did not open port'));
  return appCause ? null : full.split('\n')[0];
}

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
    const r = await step('mount', () => runLagoon({ tag, fit, port }));
    if (r.ok) report.ok('lagoon-render', `renders in the real-browser lagoon (fit=${fit})`);
    else if (!r.mounted) report.error('lagoon-render', `island tag <${tag}> did not upgrade (fit=${fit})`);
    else report.warn('lagoon-render', `mounts but renders nothing from default props (fit=${fit}) — confirm this island's empty state is intentional (e.g. a pure projection)`);
    reportRuntimeDiagnostics(report, r, `fit=${fit}`);
  } catch (err) {
    const msg = lagoonFailure(err);
    const env = environmentalCause(err);
    if (/Executable doesn't exist|playwright install/i.test(msg)) {
      report.inconclusive('lagoon-render', `Chromium not installed — run \`npx playwright install chromium\` (in packages/cli), or use --fast for the happy-dom mount`);
    } else if (env) {
      report.inconclusive('lagoon-render', `could not boot the lagoon (fit=${fit}): ${env} — the environment, not the island`);
    } else {
      report.error('lagoon-render', `lagoon failed (fit=${fit}): ${msg}`);
    }
  }
}

/** Mount the island against a backend that fails every call (500), asserting it survives — renders and
 *  leaks no unhandled rejection / console error (i.e. it catches its own fetch failures). */
async function runtimeErrorCheck(report, tag, port) {
  try {
    const r = await step('error-resilience', () => runLagoon({ tag, fit: 'native', port, forceError: 500, checkRemount: false }));
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
  const sf = sourceFileAt(elementPath, { allowJs: true });
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
  if (!name && !argv.all) {
    console.error('usage: motu island verify <name|--all> [--no-runtime] [--fast] [--standalone] [--json]');
    process.exit(2);
  }

  // --all: every island in the project, one after another. Sequential on purpose — each runtime check
  // boots a lagoon on its own port, and a CI box does not thank you for fourteen browsers at once.
  if (argv.all) {
    const islands = listIslands(paths.islandsDir);
    const results = [];
    for (const island of islands) results.push(await runIslandVerify(argv, island.kebab));
    if (argv.json) {
      console.log(JSON.stringify({ islands: results.map(summaryOf) }, null, 2));
    } else {
      printSweep('motu island verify — all islands', results);
    }
    process.exit(results.every((r) => r.errors.length === 0) ? 0 : 1);
  }

  const result = await runIslandVerify(argv, name);
  if (argv.json) {
    console.log(JSON.stringify({ island: result.kebab, tag: result.tag, pass: result.errors.length === 0, findings: result.report.findings }, null, 2));
  } else {
    printReport(result.report, `motu island verify — ${result.kebab} (${result.tag})`, result.errors, result.warns);
  }
  process.exit(verifyExitCode(result));
}

/** One island's checks, as data — printing and exiting belong to the caller (see `--all`). */
export async function runIslandVerify(argv, name) {
  setVerbose(argv?.verbose);
  const { pascal, kebab, tag } = names(name);
  setProgressScope(kebab);
  // Follow element.ts to the component it mounts: on a React host the island wraps a component the
  // app already owns, which does not live under ui/.
  const componentPath = islandComponentPath(kebab, pascal);
  // What the component is actually CALLED where it lives — see islandComponentExport.
  const componentName = islandComponentExport(kebab, pascal);
  const uiDir = paths.uiDir(kebab);
  const isReactIsland = existsSync(componentPath);
  // An AngularJS island has no React `.tsx` — its component is a `*.ng.ts` spec (in ui/<kebab>/).
  const isAdapterIsland =
    !isReactIsland &&
    existsSync(uiDir) &&
    readdirSync(uiDir).some((f) => f.endsWith('.ng.ts'));
  const report = makeReport();
  if (!isReactIsland && !isAdapterIsland) {
    report.error('component', `no island component at ${paths.rel(componentPath)}`);
    return { kebab, tag, report, errors: report.findings, warns: [] };
  }

  let componentProps = null;
  let resolvedTag = tag;
  if (isReactIsland) {
    componentProps = staticChecks(report, componentPath, componentName);
    resolvedTag = configChecks(report, kebab, componentName, tag, argv.standalone, componentProps, componentPath) ?? tag;
  } else {
    report.ok('adapter-island', `AngularJS island (no React component) — running config-lite + adapter + runtime checks`);
  }

  // Adapter-owned checks (e.g. the AngularJS host-scope contract) fold in regardless of island kind.
  await adapterChecks(report, kebab, isReactIsland ? componentPath : null);

  // CSS lint of the island's OWN stylesheet if it owns one (opt-in; the shared sheet is linted at
  // region scope by `motu archipelago verify`).
  const ownCss = islandOwnCss(kebab);
  if (ownCss) cssChecks(report, readFileSync(ownCss, 'utf8'), paths.rel(ownCss));

  // OPT-IN, not default. `verify` answers "has this island drifted from what it declares?", and that
  // question is static: props against the component, contract against the generated one, imports,
  // registration. Everything below drives a real browser once per scenario × viewport, which is a
  // different question ("does it still behave?") and a different cost — a few seconds per island, so a
  // migrated project pays minutes for a check most edits do not need. It belongs in `--runtime`
  // (and in `motu check --runtime`), where someone asked for it.
  if (argv.runtime === true) {
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
    // A seed only helps if it SURVIVES the trip. Checked before the checks that use one, because
    // every one of them fails misleadingly otherwise.
    if (!argv.fast) await seedTransportCheck(report, kebab);
    // Data-flow differentiation (opt-in via declared `scenarios`).
    await runtimeDifferentiationCheck(report, resolvedTag, fixturesPath, port++, Boolean(argv.fast));
    // Every declared viewport — the phone included, which nothing checked before.
    if (!argv.fast) await responsiveCheck(report, resolvedTag, kebab, port++);
    // Accessibility, in the browser that is already open.
    if (!argv.fast) await a11yCheck(report, resolvedTag, kebab, port++);
  }

  return {
    kebab,
    tag: resolvedTag,
    report,
    errors: report.findings.filter((f) => f.level === 'error'),
    warns: report.findings.filter((f) => f.level === 'warn'),
  };
}

/**
 * 0 pass · 1 contradicted · 2 could not look.
 *
 * The third code is the whole point: an unattended loop must be able to tell "the declarations are
 * wrong, fix them" from "the check never ran, try again". Collapsing them into 1 is what makes an
 * agent repair a bug that does not exist.
 */
export function verifyExitCode(result) {
  if (result.errors.length) return 1;
  return result.report.findings.some((f) => f.level === 'inconclusive') ? 2 : 0;
}

/** `--json` shape for one member of a sweep. */
export function summaryOf(r) {
  return { name: r.kebab, tag: r.tag, pass: r.errors.length === 0, findings: r.report.findings };
}

/**
 * A sweep's result: one line per member, and findings only for those that have something to say.
 *
 * A full report per island is unreadable at fourteen of them, and what a sweep answers is "is anything
 * wrong, and where" — so a clean island costs one line.
 */
export function printSweep(title, results) {
  console.log(color.bold(`\n${title}\n`));
  for (const r of results) {
    const mark = r.errors.length ? color.red('✗') : r.warns.length ? color.yellow('!') : color.green('✓');
    const tally = r.errors.length
      ? color.red(`${r.errors.length} error(s)`) + color.dim(`, ${r.warns.length} warning(s)`)
      : color.dim(`${r.warns.length} warning(s)`);
    console.log(`  ${mark} ${color.dim(r.kebab.padEnd(20))} ${tally}`);
    for (const f of r.report.findings) {
      if (f.level !== 'error' && f.level !== 'warn') continue;
      const m = f.level === 'error' ? color.red('✗') : color.yellow('!');
      console.log(`      ${m} ${color.dim(f.check.padEnd(18))} ${f.msg}${f.line ? color.dim(`  (line ${f.line})`) : ''}`);
    }
  }
  const failed = results.filter((r) => r.errors.length).length;
  const warned = results.reduce((n, r) => n + r.warns.length, 0);
  console.log('');
  const head = failed
    ? color.red(color.bold('FAIL')) + `  ${failed}/${results.length} with errors`
    : color.green(color.bold('PASS')) + `  ${results.length}/${results.length} clean`;
  console.log(head + color.dim(` · ${warned} warning(s) total`));
}

/**
 * axe, per declared scenario, scoped to the island's own subtree.
 *
 * Serious violations fail; the rest are reported. The line is `impact`: 'critical' and 'serious' are
 * axe's own words for "a person cannot use this", which is not a matter of taste.
 */
async function a11yCheck(report, tag, kebab, port) {
  let findings;
  try {
    findings = await step('a11y', async () => axeLagoon({ tag, port, scenarios: await islandScenarios(kebab) }));
  } catch (err) {
    report[environmentalCause(err) ? 'inconclusive' : 'warn']('a11y', `could not run axe: ${err.message}`);
    return;
  }
  const policy = lagoonA11y();
  const kept = findings.filter((f) => !policy.ignore.has(f.id));
  if (!kept.length) {
    report.ok('a11y', `no axe violations in any declared scenario${policy.ignore.size ? ` (${policy.ignore.size} rule(s) ignored by config)` : ''}`);
    return;
  }
  // 'never' (the default) reports everything and fails on nothing; 'serious' and 'critical' promote at
  // that severity and above.
  const rank = { minor: 0, moderate: 1, serious: 2, critical: 3 };
  const bar = policy.fail === 'never' ? Infinity : rank[policy.fail] ?? Infinity;
  const say = (f) => `${f.impact}: ${f.help} — ${f.where || '?'} (${f.nodes} node(s), scenario "${f.scenario}")`;
  for (const f of kept) {
    if ((rank[f.impact] ?? 0) >= bar) report.error('a11y', say(f));
    else report.warn('a11y', say(f));
  }
}

/**
 * Scenario seeds have to cross into the browser, and the crossing is JSON.
 *
 * A `Set`, a `Map`, a function or a Date in a seed arrives as `{}` — so the island renders against a
 * value of the wrong SHAPE. When that throws (`favoriteIds.has is not a function`), the mount dies and
 * EVERY scenario renders empty, which the differentiation check then reports as "scenarios rendered
 * identically" and the responsive check as "renders nothing" — three misleading findings, none of them
 * naming the cause. Name it here instead, once, before those checks run.
 *
 * The fix is always at the component: take the ITERABLE, not the Set, and rebuild it inside.
 */
async function seedTransportCheck(report, kebab) {
  const scenarios = await islandScenarios(kebab);
  if (!scenarios.length) return;
  const kind = (v) =>
    v instanceof Set ? 'Set' : v instanceof Map ? 'Map' : typeof v === 'function' ? 'function' : v instanceof Date ? 'Date' : null;
  const bad = [];
  for (const s of scenarios) {
    for (const [key, value] of Object.entries(s?.seed ?? {})) {
      const k = kind(value);
      if (k) bad.push(`${s.name ?? '(unnamed)'} → ${key} (${k})`);
    }
  }
  if (bad.length) {
    report.error(
      'seed-transport',
      `seed value(s) that do not survive the trip into the browser: ${bad.join(', ')} — they arrive as {}, ` +
        `which breaks EVERY scenario, not just this one. Take an iterable/plain value in the component and rebuild the Set inside.`,
    );
  } else {
    report.ok('seed-transport', `${scenarios.length} scenario seed(s) cross into the browser intact`);
  }
}

/** An island's declared scenarios, loaded from its evidence file (node strips the types). */
async function islandScenarios(kebab) {
  const file = paths.fixturesFile(kebab);
  if (!existsSync(file)) return [];
  try {
    const mod = await import(`file://${file}?t=${Date.now()}`);
    const scenarios = Array.isArray(mod.scenarios) ? mod.scenarios : [];
    // A plain node import cannot resolve a `.js` specifier that points at a `.ts` sibling — which is
    // the convention every file here uses. It THREW, this returned [], and the island quietly lost
    // every scenario: `data-flow` still saw five (it loads through tsx) while `responsive` reported
    // one. Two loaders for one file, disagreeing in silence. Cross-check against the tsx loader and
    // take the fuller answer, so evidence can import a shared module like any other code.
    const viaTsx = readScenarios(file);
    return viaTsx.length > scenarios.length ? viaTsx : scenarios;
  } catch {
    return readScenarios(file);
  }
}

/**
 * Renders at every declared width, and fits.
 *
 * An error, not a warning: a page the member has to scroll sideways is broken, and the project rule
 * ("always implement mobile AND desktop") had no enforcement at all until this.
 */
async function responsiveCheck(report, tag, kebab, port) {
  const viewports = lagoonViewports();
  if (!viewports.length) return;
  let measured;
  try {
    measured = await step('responsive', async () =>
      responsiveLagoon({ tag, port, viewports, scenarios: await islandScenarios(kebab) }));
  } catch (err) {
    report.warn('responsive', `could not measure viewports: ${err.message}`);
    return;
  }
  const overflowing = measured.filter((m) => m.overflow > 1);
  // Overflow is an error — a page the member has to pan sideways is broken. Rendering nothing is a
  // WARNING: an island's empty state can legitimately be empty, and only the author knows which.
  if (overflowing.length) {
    report.error(
      'responsive',
      `overflows horizontally at ${overflowing
        .map((m) => `${m.name} (${m.width}px, +${m.overflow}px${m.scenario === 'default' ? '' : `, "${m.scenario}"`})`)
        .join(', ')}`,
    );
  }
  if (measured.every((m) => !m.rendered)) {
    report.warn('responsive', 'renders nothing at any declared viewport, in any scenario — is there evidence that shows it?');
  }
  if (!overflowing.length && measured.some((m) => m.rendered)) {
    const widths = [...new Set(measured.map((m) => `${m.name} ${m.width}px`))].join(', ');
    const states = new Set(measured.map((m) => m.scenario)).size;
    report.ok('responsive', `fits every declared viewport (${widths}) in ${states} scenario(s)`);
  }
}


/**
 * A CATALOGUE region's declared members are the members the data actually produces.
 *
 * Static by design and it needs no browser: the two inputs are the app's captured payloads and the
 * enum its own codegen emits. That is the whole reversal — a UI decided by data looked like the case
 * motu could say nothing about, and it is the case where the answer can be READ instead of inferred
 * from JSX. `<id>.evidence.ts` supplies them via `export const capture = { universe, present }`.
 */
async function catalogueCheck(report, id, region) {
  const members = region.islands.filter((i) => i.member);
  if (!members.length) {
    report.warn('catalogue', 'region is declared `membership: \'catalogue\'` but no island declares a `member` — nothing ties a declaration to a data row');
    return;
  }
  const file = paths.archipelagoEvidence(id);
  if (!existsSync(file)) {
    report.warn(
      'catalogue',
      `${members.length} member type(s) declared and no capture to check them against — export \`capture\` ` +
        `from ${paths.rel(file)} pointing at the app's own fixtures, or the declaration is a guess`,
    );
    return;
  }

  const res = spawnSync(process.execPath, ['--import', 'tsx', HARNESS, '', file, 'native', 'catalogue'], {
    encoding: 'utf8',
    cwd: CLI_PKG,
    env: { ...process.env, MOTU_CATALOGUE_DECLARED: JSON.stringify(members.map((i) => i.member)) },
  });
  let parsed = {};
  try {
    parsed = JSON.parse((res.stdout || '').trim().split('\n').filter(Boolean).pop());
  } catch {
    parsed = { error: (res.stderr || '').trim().split('\n').pop() || 'harness produced no output' };
  }
  if (parsed.error || !parsed.report) {
    // An evidence file carrying flows but no `capture` is the NORMAL state, not a broken read: the two
    // answer different questions (does the region move, vs are its declared members the real ones).
    const missing = /no `capture` export/.test(parsed.error ?? '');
    report.warn(
      'catalogue',
      missing
        ? `${members.length} member type(s) declared and no capture to check them against — add a \`capture\` ` +
            `export to ${paths.rel(file)} pointing at the app's own fixtures, or the declaration is a guess`
        : `capture could not be read from ${paths.rel(file)}: ${parsed.error ?? 'no report'}`,
    );
    return;
  }
  const { covered, uncovered, speculative, unreachable, coverage } = parsed.report;
  const presentTypes = covered.length + uncovered.length;

  if (unreachable.length)
    report.error(
      'catalogue',
      `${unreachable.join(', ')} — not in the app's own enum of member types, so no data row can ever summon ` +
        `${unreachable.length > 1 ? 'them' : 'it'}; the island is unreachable, not merely unexercised`,
    );
  if (uncovered.length)
    report.error(
      'catalogue',
      `${uncovered.join(', ')} — the capture contains ${uncovered.length > 1 ? 'these member types' : 'this member type'} and no island declares ` +
        `${uncovered.length > 1 ? 'them' : 'it'}; the region renders less than the page does, and the lagoon frame is short by that much`,
    );
  for (const t of speculative)
    report.warn('catalogue', `${t} declared but absent from the capture — no evidence has ever exercised it`);
  if (!uncovered.length && !unreachable.length)
    report.ok(
      'catalogue',
      `${covered.length}/${presentTypes} member type(s) in the capture are declared (${(coverage * 100).toFixed(0)}%)`,
      { n: presentTypes, of: 'member type(s) in the capture' },
    );
}



/**
 * Every slot a region declares should be asserted by some flow's `expectRender`.
 *
 * The gap this closes was found by running two agents in parallel. Both implemented their island
 * correctly; the MERGE went wrong — each had extended the lagoon frame's slot→row lookup, whose
 * fallback was another island's row, so resolving the conflict naively made one agent's widget render
 * as the other's. `archipelago verify --runtime` was byte-identical between the correct and the broken
 * resolution, because the frame is arrangement: not declared, and therefore not checked.
 *
 * What distinguishes them is an assertion on the island's OWN rendered output. A slot no flow looks at
 * can be wired to anything and stay green.
 *
 * A WARNING, not an error, and deliberately: the rule is new, and regions written before it would go
 * red wholesale — which teaches people to ignore the report rather than to fix it. It states the count
 * so the backlog is visible.
 */
function renderCoverageCheck(report, id) {
  const region = readRegions(paths.archipelagosDir).find((r) => r.id === id);
  const slots = (region?.islands ?? []).filter((i) => !i.planned).map((i) => i.slot);
  if (!slots.length) return;

  const asserted = new Set();
  for (const scenario of readScenariosFor(id)) {
    for (const st of scenario.steps ?? []) {
      for (const slot of Object.keys(st.expectRender ?? {})) asserted.add(slot);
    }
  }
  const uncovered = slots.filter((s) => !asserted.has(s));
  if (!uncovered.length) {
    report.ok('render-coverage', `every declared slot is asserted by a flow`, { n: slots.length, of: 'slot(s) asserted' });
    return;
  }
  report.warn(
    'render-coverage',
    `${uncovered.length}/${slots.length} slot(s) no flow asserts: ${uncovered.join(', ')} — nothing distinguishes ` +
      `"this slot renders its own island" from "it renders someone else's data". Add a step with ` +
      `\`expectRender: { '<slot>': '<text the island itself produces>' }\``,
  );
}

/**
 * A step that cannot fail is not a check.
 *
 * Every green flow in this project has, at some point, been a tautology. The worst one asserted that
 * providing `editingWidgetId` made one island render "editing" and the other "idle" — and passed for
 * hours against stand-in components that printed those words because I had written them. Nothing
 * mechanical caught it; swapping in the app's real components did.
 *
 * TWO RULES, one static and one that runs:
 *
 *   BY CONSTRUCTION — a step whose `expect` names only keys that same step `provide`d asserts that the
 *   lagoon stored what it was handed. That cannot fail unless the lagoon itself is broken, and it is
 *   decidable without a browser.
 *
 *   BY MUTATION — change the STIMULUS and re-run. If the assertion still holds, it does not depend on
 *   the input, so the step is asserting a constant. This is the `data-flow` idea (a scenario set whose
 *   members render identically fails) applied per step to a region's flows.
 *
 * What neither rule catches, and it should be said rather than implied: an assertion on a stand-in's
 * invented vocabulary is sensitive to its stimulus and mutates correctly. Only rendering the
 * application's own component makes that one visible.
 */
/** The region's declared scenarios, by the same two paths `regionFlowCheck` uses. */
function readScenariosFor(id) {
  const file = paths.archipelagoEvidence(id);
  if (!existsSync(file)) return [];
  const viaTsx = readScenarios(file);
  return Array.isArray(viaTsx) ? viaTsx : [];
}

async function flowMutationCheck(report, id, port, scenarios) {
  // --- by construction ---------------------------------------------------------------------------
  let vacuous = 0;
  for (const scenario of scenarios) {
    for (const [i, step] of (scenario.steps ?? []).entries()) {
      const expected = Object.keys(step.expect ?? {});
      const provided = Object.keys(step.provide ?? {});
      if (!expected.length || !provided.length) continue;
      if (expected.every((k) => provided.includes(k)) && !Object.keys(step.expectRender ?? {}).length) {
        vacuous++;
        report.error(
          'flow-mutation',
          `"${scenario.name ?? 'flow'}" step ${i + 1} expects only ${expected.join(', ')} — the key(s) it just ` +
            `provided. That asserts the lagoon stored what it was handed, not that the region did anything. ` +
            `End on a key another island produces, or on \`expectRender\` of an island that is not the one driven`,
        );
      }
    }
  }

  // --- by mutation -------------------------------------------------------------------------------
  // One mutant per assertion-bearing step: the same scenario truncated there, with that step's
  // stimulus changed. The assertion is left EXACTLY as declared — the question is whether it notices.
  const mutants = [];
  let coverageOnly = 0;
  for (const scenario of scenarios) {
    for (const [i, step] of (scenario.steps ?? []).entries()) {
      if (!Object.keys(step.expect ?? {}).length && !Object.keys(step.expectRender ?? {}).length) continue;
      const mutated = mutateStimulus(step);
      if (!mutated) {
        // No stimulus to change — a coverage step. Counted, not mutated, and said out loud rather
        // than quietly dropped, because "0 mutants" and "3 steps nothing could mutate" are different.
        coverageOnly++;
        continue;
      }
      mutants.push({
        name: `${scenario.name ?? 'flow'} § ${i + 1}`,
        seed: scenario.seed,
        steps: [...(scenario.steps ?? []).slice(0, i), mutated],
      });
    }
  }
  if (!mutants.length) {
    report.skip('flow-mutation', 'no step carries both a stimulus and an assertion, so there is nothing to mutate');
    return;
  }

  let survived = [];
  try {
    const run = await step('flow-mutation', () => runRegionFlows({ id, port, scenarios: mutants }));
    // ONLY THE MUTATED STEP COUNTS. A mutant is the scenario truncated at step i, so the runner also
    // replays steps 1..i-1 untouched — and those pass, correctly. Counting them made every mutant
    // report survivors, which would have turned this check into the thing it exists to catch.
    const lastOf = new Map();
    for (const f of run.flows ?? []) {
      const prev = lastOf.get(f.scenario);
      if (!prev || f.step > prev.step) lastOf.set(f.scenario, f);
    }
    survived = [...lastOf.values()].filter((f) => f.ok);
  } catch (err) {
    if (err instanceof ReferenceError || err instanceof TypeError) throw err;
    report[environmentalCause(err) ? 'inconclusive' : 'warn'](
      'flow-mutation',
      `could not run mutants: ${err.message}`,
    );
    return;
  }

  for (const s of survived) {
    report.error(
      'flow-mutation',
      `"${s.scenario}" still holds when its input is changed — the assertion does not depend on what the ` +
        `step does, so it is asserting a constant. Assert something the stimulus actually moves`,
    );
  }
  if (!survived.length && !vacuous)
    report.ok(
      'flow-mutation',
      `${mutants.length} step(s) fail when their input is mutated` +
        (coverageOnly ? `; ${coverageOnly} coverage step(s) have no input to mutate` : ''),
      { n: mutants.length, of: 'mutant(s) killed' },
    );
}

/**
 * The same step, driven differently.
 *
 * Deliberately crude: a value the region cannot mistake for the real one. Subtlety would only make it
 * possible for a mutant to accidentally reproduce the original behaviour, which turns a tautology into
 * a pass — the exact failure this check exists to remove.
 */
function mutateStimulus(step) {
  if (step.provide) {
    const provide = Object.fromEntries(
      Object.entries(step.provide).map(([k, v]) => [k, v === null || v === undefined ? '__motu_mutant__' : null]),
    );
    return { ...step, provide };
  }
  if (step.emit) {
    return { ...step, emit: { ...step.emit, detail: step.emit.detail === null ? '__motu_mutant__' : null } };
  }
  return null;
}

/**
 * The region's declared flows end where they say they do.
 *
 * Optional: a region with no `<id>.evidence.ts` is reported as having none, rather than passing
 * quietly — a check that says nothing is indistinguishable from one that did not run.
 */
async function regionFlowCheck(report, id, port, region) {
  const file = paths.archipelagoEvidence(id);
  if (!existsSync(file)) {
    report.warn('region-flow', 'no declared flows — add `<id>.evidence.ts` with the couplings this region promises');
    return;
  }
  let scenarios = [];
  try {
    const mod = await import(`file://${file}?t=${Date.now()}`);
    scenarios = Array.isArray(mod.scenarios) ? mod.scenarios : [];
  } catch {
    // Same trap as the island evidence: a plain node import cannot resolve a `.js` specifier pointing
    // at a `.ts` sibling, which is the convention every file here uses. Fall through to the tsx
    // loader rather than reporting "no flows" for a file that declares several.
    scenarios = readScenarios(file);
  }
  if (!scenarios.length) {
    report.warn('region-flow', 'declared flows could not be read, or none are declared');
    return;
  }
  const steps = scenarios.reduce((n, s) => n + (s.steps?.length ?? 0), 0);
  if (!steps) {
    report.warn('region-flow', 'evidence declares no steps — a flow is a seed, an emit and an expectation');
    return;
  }
  let results;
  let suspects = [];
  try {
    const run = await runRegionFlows({ id, port, scenarios });
    results = run.flows;
    suspects = run.suspects ?? [];
    reportStoreComplaints(report, run.diagnostics, 'declared flows');
    sourcesLiveCheck(report, id, run.channels, region);
  } catch (err) {
    // A ReferenceError or a TypeError here is a BUG IN THIS FILE, not a region that could not be
    // driven — and reporting it as a warning meant the flows silently stopped running twice today
    // while the check still passed. Fail loudly for those; keep the warning for real inability.
    if (err instanceof ReferenceError || err instanceof TypeError) throw err;
    report[environmentalCause(err) ? 'inconclusive' : 'warn'](
      'region-flow',
      `could not run declared flows: ${err.message}`,
    );
    return;
  }
  for (const s of suspects) {
    report.warn(
      'laundering',
      `the host wrote "${s.key}" (read by ${s.readers.join(', ')}) ${s.gapMs}ms after ${s.after.slot} emitted ` +
        `"${s.after.event}" — if that value is derived from what ${s.after.slot} did, declare it as an output ` +
        `instead of feeding it from the page`,
    );
  }
  for (const r of results.filter((x) => !x.ok)) {
    const detail = r.error
      ? r.error
      : r.mismatches.map((m) => `${m.key}: expected ${JSON.stringify(m.expected)}, got ${JSON.stringify(m.actual)}`).join('; ');
    report.error('region-flow', `"${r.scenario}" step ${r.step}: ${detail}`);
  }
  const passed = results.filter((r) => r.ok).length;
  if (passed === results.length)
    report.ok('region-flow', `${passed} declared flow step(s) end as declared`, { n: passed, of: 'step(s)' });
}

/**
 * Every declared wire carries something.
 *
 * The runtime half of the ownership work: `RegionWiringOk` proves an event NAME resolves to an island
 * that declares it, and that is all a type can do. Whether firing it actually moves the key it claims
 * to write is a question only a run answers — and a wire that resolves, compiles and moves nothing is
 * exactly what a broken change looks like from outside.
 */
async function wiringProbe(report, id, port) {
  const islands = declaredWrites(id);
  if (!islands.length) return;
  let results;
  try {
    const probe = await step('wiring-live', () => probeWiring({ id, port, islands }));
    results = probe.results;
    reportStoreComplaints(report, probe.diagnostics, 'wiring probe');
  } catch (err) {
    report[environmentalCause(err) ? 'inconclusive' : 'warn'](
      'wiring-live',
      `could not probe declared writes: ${err.message}`,
    );
    return;
  }
  const noSeam = results.filter((r) => r.reason === 'no-seam');
  const unmounted = results.filter((r) => r.reason === 'not-mounted');
  const dead = results.filter((r) => r.moved === false);
  const live = results.filter((r) => r.moved === true);

  if (noSeam.length) {
    report.skip('wiring-live', 'this mount path has no emit seam — probing declared writes needs the React lagoon');
    return;
  }
  for (const r of unmounted) {
    report.error('wiring-live', `${r.slot} declares it writes "${r.key}", but this region mounts no island under that slot`);
  }
  for (const r of dead) {
    report.error('wiring-live', `${r.slot} declares it writes "${r.key}" on "${r.event}", but firing it changed nothing`);
  }
  if (live.length && !dead.length && !unmounted.length) {
    // Deliberately precise about what this proves: the region APPLIES each declared write. Whether the
    // component ever emits it is a different question, and one only a declared interaction can ask
    // (nothing here touches the DOM, on purpose).
    report.ok(
      'wiring-live',
      `${live.length} declared write(s) reach their key: ${live.map((r) => `${r.slot} → ${r.key}`).join(', ')}`,
      { n: live.length, of: 'declared write(s)' },
    );
  }
}

/** `writes` per island, read from the config's text — the same reader eject uses. */
function declaredWrites(id) {
  const file = paths.archipelagoFile(id);
  if (!existsSync(file)) return [];
  return readRegions(paths.archipelagosDir)
    .find((r) => r.id === id)
    ?.islands.filter((i) => Object.keys(i.writes ?? {}).length) ?? [];
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
            : f.level === 'inconclusive'
              ? color.yellow('?')
              : color.green('✓');
    const at = f.line ? color.dim(`  (line ${f.line})`) : '';
    // WHAT IT LOOKED AT, on the line itself. A reader skimming a wall of green cannot tell a check
    // that examined forty files from one that examined none, and an agent reporting the former while
    // doing the latter is the failure this whole report exists to catch.
    const seen =
      f.examined === undefined ? '' : color.dim(`  · ${f.examined} ${f.examinedOf ?? 'examined'}`);
    console.log(`  ${mark} ${color.dim(f.check.padEnd(18))} ${f.msg}${seen}${at}`);
  }
  console.log('');
  const unknown = report.findings.filter((f) => f.level === 'inconclusive');
  if (errors.length) {
    console.log(color.red(color.bold('FAIL')) + `  ${errors.length} error(s), ${warns.length} warning(s)`);
  } else if (unknown.length) {
    // NOT a pass: nothing contradicted the declarations, but some of them were never examined.
    console.log(
      color.yellow(color.bold('INCONCLUSIVE')) +
        color.dim(`  ${unknown.length} check(s) could not run, ${warns.length} warning(s) — retry, do not repair`),
    );
  } else {
    console.log(color.green(color.bold('PASS')) + color.dim(`  ${warns.length} warning(s)`));
  }
}

/** All island tags declared in the registry, gathered from each islands/<kebab>/element.ts `tag:`. */
function registeredTags() {
  const tags = new Set();
  if (!existsSync(paths.islandsDir)) return tags;
  for (const entry of listIslands(paths.islandsDir)) {
    const el = entry.element;
    if (!existsSync(el)) continue;
    const text = readFileSync(el, 'utf8');
    const m = text.match(/tag:\s*['"]([^'"]+)['"]/) ?? text.match(/\bisland\(\s*'([^']+)'/);
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
    // Either declaration form carries it — `satisfies ArchipelagoConfig<R, …>` or `archipelago<R, …>()`
    // — and the argument list can carry more than the region, so stop at the first `,` or `>`.
    const param = text.match(/(?:ArchipelagoConfig|\barchipelago)<\s*([A-Za-z_$][\w$]*)\s*[,>]/);
    if (param) {
      report.ok('region-type', `bind keys are checked against \`${param[1]}\``);
    } else {
      report.error(
        'region-type',
        'no region type — declare it as `archipelago<TRegion, keyof ElementTypes>()({…})` with a type ' +
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

    // WHO OWNS WHAT (docs/plan-key-ownership.md). Three declarations, all static:
    //   provides: [...]        the host feeds these
    //   writes:   { ev: key }  an island owns these, and the mapping is what makes them ejectable
    //   bind:     { prop: key} who reads
    // A `store.set` left inside an `on` handler still writes, but opaquely — it is counted as written
    // and reported, because nothing can draw it or generate wiring from it.
    const declaredProvided = new Set(quotedIn(blockAfter(code, 'provides:', '[')));
    const declaredWritten = new Set(keysIn(blocksAfter(code, 'writes:', '{')));
    const opaqueWritten = new Set([...code.matchAll(/store\.set\(\s*['"]([^'"]+)['"]/g)].map((m) => m[1]));
    const written = new Set([...declaredWritten, ...opaqueWritten]);
    // Both forms of `bind`, PLUS declared `reads` — a key an island consumes straight from the host's
    // own store, which has no prop to find. Without those, a region whose islands talk through the
    // app's state looks uncoupled.
    const declaredReads = [...code.matchAll(/\breads:\s*\[([^\]]*)\]/g)].flatMap((m) =>
      [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]),
    );
    const read = new Set([...boundKeysIn(code), ...declaredReads]);
    // Host-fed is DERIVED — bound here, written by no island — with the explicit list still honoured
    // for a key nothing binds.
    const provided = new Set([...declaredProvided, ...[...read].filter((k) => !written.has(k))]);
    const shared = [...written].filter((k) => read.has(k));

    // Keys more than one island READS and no island writes: the host drives them, and two islands
    // moving together because of one is a coupling even though motu owns neither end of it.
    const readCount = new Map();
    for (const group of [...boundKeyGroups(code), ...[...code.matchAll(/\breads:\s*\[([^\]]*)\]/g)].map((m) => [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]))]) {
      for (const k of new Set(group)) readCount.set(k, (readCount.get(k) ?? 0) + 1);
    }
    // n > 1, OR one island that DECLARED the read. `reads` is an explicit statement that this island
    // depends on host state — the whole reason to write it down — so reporting it needs no second
    // reader. Twenty's side panel is the case: one island, one key, and a coupling that is the point
    // of the region.
    const hostShared = [...readCount]
      .filter(([k, n]) => !written.has(k) && (n > 1 || declaredReads.includes(k)))
      .map(([k]) => k);

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
      report.ok('coupling', `shared state: ${shared.join(', ')}`, { n: shared.length, of: 'shared key(s)' });
    } else if (hostShared.length) {
      // NOT independent, and saying so mattered: Twenty's two record-page widgets both bind
      // `editingWidgetId`, which the app writes, and driving the lagoon showed one flipping to
      // "editing" while the other stayed idle — a visible coupling this check called independence,
      // because `shared` is the intersection of ISLAND-written and island-read.
      report.ok(
        'coupling',
        `coupled through the host: ${hostShared.join(', ')} — read by more than one island, written by ` +
          `none of them, so the application is what couples them and the lagoon must seed it to show them apart`,
        { n: hostShared.length, of: 'host-driven key(s)' },
      );
    } else {
      // Always say something. A check that reports nothing is indistinguishable from one that did not
      // run — and "these islands are independent" is a real, useful answer, not an absence.
      report.ok(
        'coupling',
        'no shared state between islands — a page whose islands are independent',
        { n: readCount.size, of: 'key(s) read' },
      );
    }

    // --- composition: a slot filled by another island must be one this region declares -------------
    {
      const declaredSlots = new Set([...code.matchAll(/\bslot:\s*'([^']+)'/g)].map((m) => m[1]));
      const filled = blocksAfter(code, 'slots:', '{').flatMap((b) => [...b.matchAll(/:\s*'([^']+)'/g)].map((m) => m[1]));
      const missing = [...new Set(filled)].filter((slot) => !declaredSlots.has(slot));
      if (missing.length) {
        report.error(
          'composition',
          `island slot(s) filled with an island this region does not declare: ${missing.join(', ')}`,
        );
      } else if (filled.length) {
        report.ok('composition', `${filled.length} island(s) nested inside another by declaration`);
      }
    }

    // --- ownership: every key an island READS should have exactly one declared owner --------------
    //
    // ONE PRODUCER, checked per island rather than over the file. `declaredWritten` is a Set, so two
    // islands claiming the same key collapse into one entry and the region reported "4/4 bound key(s)
    // owned" for a key with two owners — caught only later, at runtime, by the store guard.
    //
    // The timing is the point. Two agents working in parallel each add an island in their own branch;
    // neither branch is wrong on its own, and the conflict appears where both declarations meet. If
    // the region is declared UP FRONT (the survey writes every slot and owner before implementation),
    // that meeting happens in each agent's own branch on their first `motu check` — which is why this
    // has to be static, in the fast loop, and not a runtime gate they reach after the work is done.
    // Grouped by ELEMENT, not by slot. peps caught the first version of this rule as a false positive:
    // its filter panel is one island placed twice (`filters-desktop`, `filters-mobile`), both writing
    // `filters` — which is exactly what "two slots, one island" has to mean, and the region's evidence
    // says so on purpose. Two SLOTS may share a producer; two IMPLEMENTATIONS may not.
    const writersByKey = new Map();
    for (const island of readRegions(paths.archipelagosDir).find((r) => r.id === id)?.islands ?? []) {
      for (const key of Object.values(island.writes ?? {})) {
        const k = typeof key === 'string' ? key : null;
        if (!k) continue;
        writersByKey.set(k, [...(writersByKey.get(k) ?? []), { slot: island.slot, element: island.element }]);
      }
    }
    for (const [key, writers] of writersByKey) {
      const elements = [...new Set(writers.map((w) => w.element))];
      if (elements.length < 2) continue;
      report.error(
        'ownership',
        `"${key}" is written by ${elements.length} different islands (${writers.map((w) => `${w.slot} → ${w.element}`).join(', ')}) — ` +
          `a key has ONE producer. If both really write it, the producer is something they SHARE (their ` +
          `container, the page) and that is what should declare it; if not, one of them is reading, not writing`,
      );
    }

    const unowned = [...read].filter((k) => !provided.has(k) && !written.has(k));
    const disputed = [...declaredWritten].filter((k) => declaredProvided.has(k));
    const owned = [...read].filter((k) => provided.has(k) || written.has(k));

    if (disputed.length) {
      report.error(
        'ownership',
        `key(s) declared in \`provides\` AND written by an island: ${disputed.join(', ')} — two owners is ` +
          `the ambiguity the declaration exists to remove. Drop it from \`provides\` if the island owns ` +
          `it, or stop writing it if the host does`,
      );
    }
    if (unowned.length) {
      // A warning, not an error: ownership is adopted per key (D3), so an un-migrated region is not
      // broken — it is un-migrated, and this is its backlog.
      report.warn(
        'ownership',
        `key(s) read here with no declared owner: ${unowned.join(', ')} — add them to \`provides\` if the ` +
          `host feeds them, or to an island's \`writes\` if one produces them. Until then nothing stops ` +
          `the page wiring two islands together through its own state`,
      );
    }
    if (read.size) {
      report.ok(
        'ownership',
        `${owned.length}/${read.size} bound key(s) owned — ${[...read].filter((k) => provided.has(k)).length} host, ` +
          `${[...read].filter((k) => declaredWritten.has(k)).length} island`,
      );
    }

    // An opaque write is the static cousin of the laundering smell: it updates a key, but nothing can
    // draw it in the region graph and no wiring can be generated from it when motu is removed.
    const opaqueOnly = [...opaqueWritten].filter((k) => !declaredWritten.has(k));
    if (opaqueOnly.length) {
      report.warn(
        'ownership',
        `key(s) written from a handler body: ${opaqueOnly.join(', ')} — declare \`writes: { <event>: '<key>' }\` ` +
          `instead. A handler can do anything, so it cannot be drawn before it fires, and it cannot be ` +
          `materialised when motu is ejected; \`on\` is for effects that are NOT store writes`,
      );
    }
  }

  // --- the lagoon's stand-ins still stand in ----------------------------------------------------
  {
    const results = stubParity();
    const broken = results.filter((r) => r.missing.length || r.unresolved);
    for (const r of broken) {
      if (r.unresolved) {
        report.error('host-stubs', `${r.specifier}: ${r.unresolved}`);
      } else {
        report.error(
          'host-stubs',
          `${r.specifier}: islands import ${r.missing.map((m) => `\`${m}\``).join(', ')}, which the stub does not export — ` +
            `the lagoon is standing in for a module it no longer mirrors`,
        );
      }
    }
    if (results.length && !broken.length) {
      const covered = results.reduce((n, r) => n + r.needed.length, 0);
      report.ok('host-stubs', `${results.length} stub(s) cover the ${covered} export(s) the islands reach for`);
    }
  }

  const registryText = existsSync(paths.archipelagosRegistry) ? readFileSync(paths.archipelagosRegistry, 'utf8') : '';
  if (registryText.includes(`./${id}/${id}.archipelago.js`)) {
    report.ok('registered', 'registered in ARCHIPELAGOS');
  } else {
    report.error('registered', `not wired into ${paths.rel(paths.archipelagosRegistry)}`);
  }

  // Every `element: 'x-…'` the config references must be a registered island tag — EXCEPT the ones
  // the survey declared and nobody has built yet. Those are the price of declaring a region up front
  // so parallel work conflicts early; without this split the region is red in every branch until the
  // last island lands, and a red region teaches everyone to ignore it.
  const known = registeredTags();
  const declared = readRegions(paths.archipelagosDir).find((r) => r.id === id)?.islands ?? [];
  const plannedTags = new Set(declared.filter((i) => i.planned).map((i) => i.element));
  const used = [...text.matchAll(/element:\s*['"]([^'"]+)['"]/g)].map((m) => m[1]).filter((t) => !plannedTags.has(t));
  const unknown = [...new Set(used)].filter((t) => !known.has(t));

  // The flag REMOVES ITSELF. Once the island exists, `planned` is no longer a promise, it is a stale
  // claim — and a survey that quietly becomes a list of things nobody built is worse than no survey.
  const built = [...plannedTags].filter((t) => known.has(t));
  if (built.length) {
    report.error(
      'planned',
      `${built.join(', ')} is registered but still marked \`planned: true\` — drop the flag; the checks that ` +
        `skip a planned island (does it exist, does it mount, is it placed) are exactly the ones it now needs`,
    );
  }
  const pending = [...plannedTags].filter((t) => !known.has(t));
  if (pending.length) {
    report.warn(
      'planned',
      `${pending.length} island(s) declared but not built: ${pending.join(', ')} — their ownership is being ` +
        `enforced (a second claim on their keys fails), their existence is not checked`,
    );
  }
  if (used.length === 0) {
    // "declares no islands" is false when it declares four and nobody has built them yet — and a
    // wrong message is how a reader learns to stop reading the report.
    report[plannedTags.size ? 'skip' : 'warn'](
      'islands-registered',
      plannedTags.size
        ? `every declared island is still \`planned\` (${plannedTags.size}) — nothing to look for yet`
        : 'archipelago declares no islands',
    );
  } else if (unknown.length === 0) {
    report.ok('islands-registered', `all ${new Set(used).size} island tag(s) are registered`, {
      n: new Set(used).size,
      of: 'declared tag(s)',
    });
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
  if (!id && !argv.all) {
    console.error('usage: motu archipelago verify <id|--all> [--no-runtime] [--json]');
    process.exit(2);
  }

  if (argv.all) {
    const ids = existsSync(paths.archipelagosDir)
      ? readdirSync(paths.archipelagosDir, { withFileTypes: true })
          .filter((e) => e.isDirectory() && existsSync(paths.archipelagoFile(e.name)))
          .map((e) => e.name)
      : [];
    const results = [];
    for (const one of ids) results.push(await runArchipelagoVerify(argv, one));
    if (argv.json) {
      console.log(JSON.stringify({ archipelagos: results.map(summaryOf) }, null, 2));
    } else {
      printSweep('motu archipelago verify — all regions', results);
    }
    process.exit(results.every((r) => r.errors.length === 0) ? 0 : 1);
  }

  const result = await runArchipelagoVerify(argv, id);
  if (argv.json) {
    console.log(JSON.stringify({ archipelago: result.kebab, pass: result.errors.length === 0, findings: result.report.findings }, null, 2));
  } else {
    printReport(result.report, `motu archipelago verify — ${result.kebab}`, result.errors, result.warns);
  }
  process.exit(verifyExitCode(result));
}

/**
 * What the STORE said while the region was being driven.
 *
 * `no-console-errors` runs on a page that only mounts the region — it never writes, so motu's own
 * ownership guard ("key X is produced by island A, but it was written by B") could fire on every
 * driven page and never reach a report. That is the shape of miss this exists for: the framework had
 * already caught it, in a console nobody was reading.
 */
function reportStoreComplaints(report, diagnostics, where) {
  const motu = (diagnostics ?? []).filter((d) => /console\.error:\s*motu:/.test(d));
  for (const line of [...new Set(motu)]) {
    report.error('store-guard', `${line.replace(/^console\.error:\s*/, '')} (seen during the ${where})`);
  }
}

/**
 * A channel that ORCHESTRATES must install the application's own logic, not re-implement it.
 *
 * The inbound seam is where a lagoon quietly becomes a second application. A channel that watches the
 * region and answers with host-fed keys is doing what the PAGE does — debounce, page, derive, reset —
 * and a copy of that is free to drift: a different page size in the preview than in production looks
 * like a working preview for months. Both of this project's first channels were written that way, and
 * nothing said a word.
 *
 * The rule is deliberately narrow, so it accuses only what it can see:
 *   REACTIVE (it subscribes to the store) + WRITES host-fed keys + imports NO application module.
 * A channel that only publishes a constant is not orchestration and is not flagged; a channel that
 * imports the app's source is doing the right thing by construction, whatever it does with it.
 */
function channelSourceCheck(report, id, region) {
  const overridesFile = ['src/lagoon.tsx', 'src/lagoon.ts']
    .map((f) => resolve(paths.lagoonDir, f))
    .find((f) => existsSync(f));
  if (!overridesFile) return;
  const overrides = stripComments(readFileSync(overridesFile, 'utf8'));

  // `channels: { <id>: [ … ] }` — the ENTRIES installed for this region.
  const map = overrides.match(/export const channels[^=]*=\s*\{([\s\S]*?)\n\};/)?.[1];
  const list = map?.match(new RegExp(`['"\`]?${id}['"\`]?\\s*:\\s*\\[([\\s\\S]*?)\\n  \\]`))?.[1];
  if (!list) return;

  // Split on top-level commas: each element is one channel, and the question is what BUILT it.
  const entries = [];
  let depth = 0;
  let current = '';
  for (const ch of list) {
    if ('([{'.includes(ch)) depth++;
    else if (')]}'.includes(ch)) depth--;
    if (ch === ',' && depth === 0) {
      entries.push(current);
      current = '';
    } else current += ch;
  }
  if (current.trim()) entries.push(current);

  let vouched = 0;
  for (const entry of entries.map((e) => e.trim()).filter(Boolean)) {
    // Built here, by the tool.
    if (/^(channelFrom|rawChannel)\s*\(/.test(entry)) {
      vouched++;
      continue;
    }
    // Or an identifier from a file that builds it with the tool.
    const file = /^[A-Za-z_$][\w$]*$/.test(entry) ? channelFileOf(overrides, overridesFile, entry) : null;
    if (file && /\b(channelFrom|rawChannel)\s*\(/.test(stripComments(readFileSync(file, 'utf8')))) {
      vouched++;
      continue;
    }
    report.error(
      'channel-source',
      `a channel of "${id}" is not built by the tool — write \`channelFrom({ to, id, args })\`, whose copy ` +
        `into the region comes from the archipelago's \`sources\`, or \`rawChannel('<why>', fn)\` if this seam ` +
        `genuinely is not a source. Hand-written channels forget keys, rename them in transit, and derive ` +
        `what the page already derives — all three have happened here.`,
    );
  }
  if (vouched === entries.length && vouched > 0) {
    report.ok('channel-source', `${vouched} channel(s) built from a declared source`);
  }
}

/**
 * PROVENANCE: what the channels really produced, against what the region declared.
 *
 * `sources` is a static promise — "these keys come from that source". This is the runtime half, the
 * same idea as `wiring-live` on the island side: a declaration nobody can see firing is one nobody can
 * trust. A channel writing a key no source claims is an ERROR; a source no channel produced is a
 * WARNING, because seeding it in the lagoon is legitimate.
 */
function sourcesLiveCheck(report, id, channels, region) {
  const declared = declaredSources(id);
  if (!Object.keys(declared).length || !channels) return;
  const claimed = new Map();
  for (const [name, src] of Object.entries(declared)) for (const key of src.produces) claimed.set(key, name);
  // A source the region REFERENCES carries its keys in the source file, not here; the compiler checks
  // those. What is checkable at runtime is that nothing OUTSIDE the declared set was written.
  const byReference = Object.values(declared).some((src) => src.byReference);

  const written = new Set();
  for (const channel of channels) {
    const stray = claimed.size ? channel.keys.filter((k) => !claimed.has(k)) : [];
    for (const key of channel.keys) written.add(key);
    if (stray.length && !byReference) {
      report.error(
        'sources-live',
        `channel "${channel.name}" wrote ${stray.join(', ')}, which no declared source claims — either the ` +
          `region's \`sources\` are incomplete, or this channel is orchestrating outside them`,
      );
    }
  }
  const islandOwned = region ? producedKeysOf(region) : new Set();
  const silent = [...claimed.keys()].filter((k) => !written.has(k) && !islandOwned.has(k));
  if (silent.length) {
    report.warn('sources-live', `declared but produced by no channel while the region ran: ${silent.join(', ')} — seeded, or dead?`);
  }
  const live = [...written].filter((k) => claimed.has(k) || byReference);
  if (live.length) report.ok('sources-live', `${live.length} key(s) produced by a declared source at runtime`);
}

/** Comments blanked, because an apostrophe in prose opens a string as far as a regex is concerned —
 *  "the week's missions" inside a `produces` array became a key named ` missions, so it comes...`. */
const stripComments = blankComments;

/**
 * The text of the `factory:` belonging to one `channelFrom({ … id: '<id>' … })`, brace-balanced.
 *
 * Scoped deliberately: the question is not whether the app's source is mentioned in the file, it is
 * whether the factory INSTALLS it.
 */
function factoryBody(text, id) {
  // The CALL, not the word: `import { channelFrom }` matched first, and balancing from the next paren
  // walked into whatever function happened to be declared above the call — which reported the real
  // channel as never installing its source.
  const call = /\bchannelFrom\s*\(/.exec(text);
  if (!call) return null;
  const open = call.index + call[0].length - 1;
  let depth = 0;
  let end = -1;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')' && --depth === 0) {
      end = i;
      break;
    }
  }
  const spec = text.slice(open, end === -1 ? undefined : end);
  if (!new RegExp(`\\bid:\\s*'${id}'`).test(spec)) return null;
  const factory = spec.indexOf('factory');
  return factory === -1 ? null : spec.slice(factory);
}

/** `sources` as data, straight from the archipelago file. */
function declaredSources(id) {
  const text = stripComments(readFileSync(paths.archipelagoFile(id), 'utf8'));
  const block = text.match(/sources:\s*\{([\s\S]*?)\n  \},/)?.[1];
  if (!block) return {};
  const out = {};
  // A source the region REFERENCES: `week: weekSource`. Its module is the import that brought the
  // identifier in — the same fact, read from the one place it is written.
  for (const [, name, ref] of block.matchAll(/(\w+):\s*(\w+),/g)) {
    const module = text.match(new RegExp(`import\\s*\\{[^}]*\\b${ref}\\b[^}]*\\}\\s*from\\s*'([^']+)'`))?.[1];
    if (module) out[name] = { module, produces: [], byReference: true };
  }
  // A source declared by module NAME: no channel installs it, the page fetches it itself.
  for (const m of block.matchAll(/(\w+):\s*\{([\s\S]*?)\}/g)) {
    const module = m[2].match(/module:\s*'([^']+)'/)?.[1];
    const produces = [...(m[2].match(/produces:\s*\[([^\]]*)\]/)?.[1] ?? '').matchAll(/'([^']+)'/g)].map((x) => x[1]);
    if (module) out[m[1]] = { module, produces };
  }
  return out;
}

/** The file a channel identifier resolves to, or null. */
function channelFileOf(overrides, overridesFile, name) {
  const spec = overrides.match(new RegExp(`import\\s*\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from\\s*['"]([^'"]+)['"]`))?.[1];
  if (!spec || !spec.startsWith('.')) return null;
  return (
    ['', '.ts', '.tsx']
      .map((ext) => resolve(dirname(overridesFile), spec.replace(/\.js$/, ext || '.ts')))
      .find((f) => existsSync(f)) ?? null
  );
}

/** Every key the region's islands bind (the map form's targets included). */
function bindKeysOf(region) {
  const text = stripComments(readFileSync(paths.archipelagoFile(region.id), 'utf8'));
  const keys = [];
  for (const m of text.matchAll(/bind:\s*\[([\s\S]*?)\]/g)) {
    // `^\s*` as well as a delimiter: the FIRST bare key sits right after the `[` the outer match
    // consumed, so anchoring only on `[,{` silently dropped one key per island — `members` among them.
    for (const [, bare] of m[1].matchAll(/(?:^\s*|[[,{]\s*)'([^']+)'/g)) keys.push(bare);
    for (const [, target] of m[1].matchAll(/\w+:\s*'([^']+)'/g)) keys.push(target);
  }
  return keys;
}

/** Every key an island of the region produces. */
function producedKeysOf(region) {
  const keys = new Set();
  for (const island of region.islands) {
    for (const target of Object.values(island.writes ?? {})) {
      if (typeof target === 'string') keys.add(target);
      else for (const key of Object.values(target)) keys.add(key);
    }
  }
  return keys;
}

/** One region's checks, as data — see `runIslandVerify`. */
export async function runArchipelagoVerify(argv, id) {
  setVerbose(argv?.verbose);
  setProgressScope(id);
  const report = makeReport();
  const hasLayout = archipelagoConfigChecks(report, id);

  // The inbound seam: a channel that orchestrates must install the app's logic, not restate it.
  const region = readRegions(paths.archipelagosDir).find((r) => r.id === id);
  if (region) channelSourceCheck(report, id, region);

  // Static, so an uncovered slot shows up in the fast loop rather than behind a browser.
  renderCoverageCheck(report, id);

  // Membership as data: static, so it runs whether or not a browser was asked for.
  if (region?.membership === 'catalogue') await catalogueCheck(report, id, region);

  // Region styling: until islands own their CSS, the shared sheet is the region's stylesheet — lint it.
  if (existsSync(paths.sharedStyles)) {
    cssChecks(report, readFileSync(paths.sharedStyles, 'utf8'), paths.rel(paths.sharedStyles));
  }

  // Same line as the islands: static by default, browser on request (see runIslandVerify).
  if (argv.runtime === true) {
    if (hasLayout) await wiringProbe(report, id, 5300 + Math.floor(Math.random() * 400));
    if (hasLayout) await regionFlowCheck(report, id, 5300 + Math.floor(Math.random() * 400), region);
    // After the flows, and only when they exist: mutation asks whether the flows that just passed
    // COULD have failed.
    if (hasLayout) {
      const declared = readScenariosFor(id);
      if (declared.length) await flowMutationCheck(report, id, 5300 + Math.floor(Math.random() * 400), declared);
    }
    if (!hasLayout) {
      report.warn('lagoon-render', 'no layout — islands are placed individually across the host, not as a region; region render skipped');
    } else {
      const port = 5300 + Math.floor(Math.random() * 400);
      try {
        const r = await step('region-mount', () => runArchipelagoLagoon({ id, port }));
        if (r.region) {
          const unmounted = r.islands.filter((i) => !i.tag);
          if (r.islands.length === 0) {
            report.error('lagoon-render', 'archipelago region rendered no island slots');
          } else if (unmounted.length === 0) {
            // "all N" used to mean "all N I happened to find". A slot the arrangement never places —
            // an island behind a closed drawer, a conditional branch — simply was not in the list, so
            // the check congratulated itself on a region missing an island. Say what is declared.
            const declaredRegion = readRegions(paths.archipelagosDir).find((x) => x.id === id);
            // A planned island has nothing to mount yet; demanding it here would make the survey red.
            const declared =
              declaredRegion?.membership === 'catalogue'
                ? []
                : (declaredRegion?.islands ?? []).filter((i) => !i.planned).map((i) => i.slot);
            const placed = new Set(r.islands.map((i) => i.slot).filter(Boolean));
            const unplaced = declared.filter((slot) => !placed.has(slot));
            report.ok('lagoon-render', `region + all ${r.islands.length} island(s) mounted in the lagoon`, {
              n: r.islands.length,
              of: 'mounted island(s)',
            });
            if (unplaced.length) {
              report.warn(
                'lagoon-render',
                `${unplaced.join(', ')} declared but not placed by this arrangement — behind an overlay or a ` +
                  `conditional branch. Declared wires are still driven (the probe uses the mountpoints view), ` +
                  `but nothing here shows it to a human: confirm that is what the page does.`,
              );
            }
          } else {
            report.error('lagoon-render', `slot(s) with no island mounted: ${unmounted.map((i) => i.slot || '?').join(', ')}`);
          }
        } else {
          report.error('lagoon-render', `archipelago <${id}> did not render — unknown id or boot failure`);
        }
        reportRuntimeDiagnostics(report, r, 'region');
      } catch (err) {
        const msg = String(err?.message || err).split('\n')[0];
        const env = environmentalCause(err);
        if (/Executable doesn't exist|playwright install/i.test(msg)) {
          report.inconclusive('lagoon-render', `Chromium not installed — run \`npx playwright install chromium\` (in packages/cli)`);
        } else if (env) {
          report.inconclusive('lagoon-render', `could not boot the lagoon: ${env} — the environment, not the region`);
        } else {
          report.error('lagoon-render', `lagoon failed: ${msg}`);
        }
      }
    }
  }

  return {
    kebab: id,
    report,
    errors: report.findings.filter((f) => f.level === 'error'),
    warns: report.findings.filter((f) => f.level === 'warn'),
  };
}
