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
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { readLiveUrl } from '../lib/live-url.mjs';
import { conditionalSlots, frameModuleFor, nestedSlots } from '../lib/lagoon-declares.mjs';
import { placementsIn } from '../lib/island-placement.mjs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { basename, dirname, resolve } from 'node:path';
import { SyntaxKind } from 'ts-morph';
import { sourceFileAt } from '../lib/ts-project.mjs';
import { listIslands } from '../lib/islands.mjs';
import { readRegions } from '../lib/eject.mjs';
import { reachableAppSources } from '../lib/bundlability.mjs';
import { unchangedSinceLastRun } from '../lib/finding-memory.mjs';
import { stubParity } from '../lib/stubs.mjs';
import { hostSources, conditionallyPlaced } from './integration.mjs';
import { islandContract, contractsDrift, readGeneratedContracts } from '../lib/contracts.mjs';
import { readEffectEntries, isKinded, isDataKind, coversEffect } from '../lib/effects.mjs';
import { readComponentContract } from '../lib/component-props.mjs';
import { lagoonEnv, nodeAliasEnv } from '../lib/node-aliases.mjs';
import { ensureNoInstallLinks, MOTU_CHECKOUT, REPO_ROOT, blankComments, paths, names, color, HOST, HOST_ROOT, APP_ROOT, resolveAppImport, LEGACY_FIT, islandComponentPath, islandComponentExport, islandComponentIdentifier, lagoonViewports, lagoonA11y, lagoonAliases } from '../lib/util.mjs';
import {
  runLagoon,
  runArchipelagoLagoon,
  pageRenderLagoon,
  differentiateLagoon,
  responsiveLagoon,
  axeLagoon,
  probeWiring,
  runRegionFlows,
  auditRegionLagoon,
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

/**
 * Total time inside instrumented steps. Read by `motu check --verbose` to print the REMAINDER.
 *
 * A list of timed parts reads as a partition of the run, and it is not one: after the flow session was
 * merged into `regionFlowCheck` it stopped being wrapped, and a `--runtime` profile accounted for 13.8s
 * of 31.8 — 57% invisible, while every printed line looked precise. A profile that cannot say what it
 * missed is a profile you will optimise the wrong half of.
 */
let stepMsTotal = 0;
export const profiledMs = () => stepMsTotal;

export async function step(name, run) {
  const started = Date.now();
  if (!verbose) {
    try {
      return await run();
    } finally {
      stepMsTotal += Date.now() - started;
    }
  }
  const at = Date.now();
  process.stderr.write(color.dim(`  · ${progressLabel ? `${progressLabel} ` : ''}${name}…`));
  try {
    return await run();
  } finally {
    stepMsTotal += Date.now() - at;
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


/** A data entry — the kinds the runtime can observe, as opposed to a module or a host-scope name. */
const isDataReach = isDataKind;

/**
 * WHAT EACH OWNER SAYS IT REACHES, keyed the way `DataReach.by` keys what it observed.
 *
 * One concept, declared where the reaching happens. An island that hits a backend directly declares it
 * in its own `contract.effects`, beside the host modules it stands down — a data entry is what an
 * module entry USED to imply, before wire mocking pushed the stub below the import graph and the
 * module check (direct imports only) stopped being able to see it. A declared SOURCE reads inside a
 * channel, at region level and outside any island's window, so it declares its own `reaches` and the
 * runtime attributes to it directly — charging a source's tables to whichever island was rendering
 * would report a correct declaration as a violation.
 */
function declaredReach({ tag = null, regionId = null } = {}) {
  const out = {};
  // FROM THE ISLAND FILE, not from `contracts.generated.ts`.
  //
  // The generated contract's `effects` is DERIVED — read from the component's own imports — so it only
  // ever holds module entries. A `{ table: … }` is a decision nobody can infer from an import, so it is
  // hand-written in the island file and is invisible here otherwise: this read the generated map and
  // would have reported every island's data reach as undeclared, forever, while the declaration sat in
  // the file next to it. Caught by round-tripping one through `island sync`.
  const byTag = new Map();
  for (const i of listIslands(paths.islandsDir)) {
    const text = readFileSync(i.element, 'utf8');
    const tag = (text.match(/\btag:\s*'([^']+)'/) ?? text.match(/\bisland\(\s*'([^']+)'/))?.[1] ?? `${names(i.kebab).tag}`;
    const declared = text.match(/effects:\s*\[([\s\S]*?)\]/)?.[1];
    if (declared !== undefined) byTag.set(tag, readEffectEntries(declared));
  }
  const addIsland = (t) => {
    const entries = (byTag.get(t) ?? []).filter(isDataReach);
    if (entries.length) out[`island:${t}`] = [...entries].sort();
  };
  if (tag) addIsland(tag);
  if (regionId) {
    const region = readRegions(paths.archipelagosDir).find((r) => r.id === regionId);
    for (const i of region?.islands ?? []) if (i.element) addIsland(i.element);
    for (const [name, src] of Object.entries(declaredSources(regionId))) {
      const entries = (src.reaches ?? []).filter(isDataReach);
      if (entries.length) out[`source:${name}`] = [...entries].sort();
    }
  }
  return out;
}

/**
 * Observed reach against declared reach — the half `data-reach` could not do while it was a readout.
 *
 * WARNINGS, both ways, and deliberately not errors: every project that adopts this lights up on the
 * day it lands, and the module half of `effects` — the declaration this extends — is warnings-only for exactly
 * that reason. An entry observed under an owner that declared nothing at all is NOT reported: the
 * declaration is opt-in per island and per source, and reporting its absence would make adopting the
 * feature indistinguishable from failing it.
 */
export function reportReachDrift(report, observed, declared, label) {
  const owners = Object.keys(declared);
  if (!owners.length) return;
  let clean = 0;
  for (const owner of owners) {
    const saw = [...new Set(observed?.[owner] ?? [])].sort();
    const said = declared[owner];
    // `{ table: 'shots' }` covers every operation on that table and `{ route: '/api/x' }` every method
    // on that route — naming a dependency without pinning how it is used is a legitimate declaration.
    const missing = saw.filter((e) => !said.some((d) => coversEffect(d, e)));
    const stale = said.filter((d) => !saw.some((e) => coversEffect(d, e)));
    if (missing.length) {
      report.warn('data-reach', `${owner} reaches undeclared: ${missing.join(', ')} (${label}) — add it to ${owner.startsWith('source:') ? '`reaches`' : '`contract.effects`'}`);
    }
    if (stale.length) {
      // NOT "declares what it does not use" — that is the module half's wording, and it can say it
      // because it reads the component's imports STATICALLY. This half is observed at runtime, so an
      // unreached declaration has two causes and only one of them is a stale claim: the review
      // region's own accept route is declared, real, and simply not driven by any flow. Say what was
      // actually seen and name both readings, or the honest answer to a true warning is to delete a
      // correct declaration.
      report.warn(
        'data-reach',
        `${owner} declares reach that nothing exercised: ${stale.join(', ')} (${label}) — either the ` +
          `declaration is stale, or no flow drives that path`,
      );
    }
    if (!missing.length && !stale.length) clean++;
  }
  if (clean) report.ok('data-reach', `${clean} owner(s) reach exactly what they declare (${label})`, clean);
}

/** Map the runtime result's diagnostics + remount signal onto report findings (shared by both engines). */
function reportRuntimeDiagnostics(report, r, label, declared = null) {
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

  // Only present when the lagoon's fake fetch (`@motu/runtime/postgrest-fetch`) is in play — a project
  // still on module-alias stubs never populates this, so `undefined` skips it rather than reporting a
  // false pass for a mechanism that never ran. `seen` is the TOTAL request count, not the unscoped
  // one: a run that made zero requests has zero unscoped requests too, and `report.ok`'s own "0 seen
  // is a skip, not an ok" rule is what tells those two apart, the same as every other check here.
  // IS THIS ISLAND STANDING ON ITS STUBS? Two halves of one question, under one id.
  //
  // They were `fixture-coverage` and `network-sealed`, and the second's own comment called it "the
  // counterpart" to the first: one asks whether the requests the fake fetch SAW were declared, the
  // other whether any request got PAST the stubs entirely. Both are errors, both mean the island is
  // standing on something that is not there, and reading them as separate results invited fixing one.
  //
  // The preconditions differ and that is why this is not a concatenation: the escape half applies to
  // EVERY runtime run, including a project still on module-alias stubs where no fake fetch is
  // installed and `fixtureCoverage` is undefined. So each half reports only when it has something to
  // say, and the single `ok` names whichever halves actually held.
  if (r?.fixtureCoverage !== undefined || r?.networkEscapes !== undefined) {
    const unscoped = r?.fixtureCoverage?.unscoped ?? [];
    const escapes = r?.networkEscapes ?? [];
    // THE THIRD HALF, and the one that made the name only two-thirds true. `escapes` counts requests
    // that left for a non-loopback host; an unstubbed APP route is SAME-ORIGIN, so it 404s against the
    // dev server and neither of the other two ever saw it. Recorded at the delegate seam inside
    // `installFakeFetch`, which is the one place that knows a request was not claimed.
    const unanswered = r?.fixtureCoverage?.unanswered ?? [];
    if (unscoped.length) {
      const first = unscoped[0];
      report.error(
        'stubs-sealed',
        `${unscoped.length} request(s) matched no declared table/fixture (${label}): ` +
          `${first.method} ${first.path} — ${first.reason}`,
      );
    }
    if (escapes.length) {
      const first = escapes[0];
      const hosts = [...new Set(escapes.map((e) => { try { return new URL(e.url).host; } catch { return e.url; } }))];
      report.error(
        'stubs-sealed',
        `${escapes.length} request(s) escaped the lagoon to ${hosts.join(', ')} (${label}): ` +
          `${first.method} ${first.url} — a host module reached a real backend, so this island is not ` +
          `standing on its stubs. The failure is normally invisible: the island catches it and renders empty`,
      );
    }
    if (unanswered.length) {
      const first = unanswered[0];
      report.error(
        'stubs-sealed',
        `${unanswered.length} request(s) reached the dev server instead of a stub (${label}): ` +
          `${first.method} ${first.url} — ${first.why}. No fixture claimed it, so the island is standing on ` +
          `nothing. Add the path to \`appRoutes\` (and a fixture for it), or point \`baseUrl\` at its origin`,
      );
    }
    if (!unscoped.length && !escapes.length && !unanswered.length) {
      // `seen` is the FAKE-FETCH request count, not the escape count: zero escapes proves nothing on
      // its own (an island that made no backend call at all also escapes nothing). Passing the count
      // of requests actually answered lets `report.ok`'s "0 examined is a skip" rule tell the two
      // apart — which is precisely "is the fake fetch wired, or is this check vacuous?".
      const answered = r?.fixtureCoverage !== undefined;
      report.ok(
        'stubs-sealed',
        answered
          ? `every request matched a declared table/fixture, and nothing escaped the lagoon (${label})`
          : `nothing escaped the lagoon — every backend call was answered locally (${label})`,
        r?.fixtureCoverage?.seen,
      );
    }
  }

  // WHAT DOES THIS ISLAND NEED FROM THE BACKEND? Observed, not declared — see `DataReach` in
  // `@motu/runtime/postgrest-fetch` for why this exists at all: mocking at the wire made an island's
  // data dependency transitive, so the module half of `effects` stopped being able to see it. A
  // table-and-RPC list is a better answer than the module name it replaces, and it is already the
  // vocabulary `.assay/operations.json` uses — which is where a motu↔assay drift check would compare.
  //
  // IT NOW HAS SOMETHING TO COMPARE AGAINST. This was a readout, on the argument that "declaring a
  // per-island table list before assay's comparison exists would invent a format that then has to
  // survive contact with it". What changed is the format question: the entries below are already
  // assay's granularity (tables read/written, functions called), so the declaration is not an
  // invention — and the readout alone left a real hole. An island that reached a table nobody expected
  // failed `fixture-coverage`, and the fix was to add the table to the lagoon's `tables:` — so the
  // FIXTURE SET was doing double duty as the declaration, and widening it was a one-line edit made by
  // whoever was trying to get to green. `reportReachDrift` is the missing half; it stays a WARNING.
  if (r?.fixtureCoverage?.reach !== undefined) {
    const { tables, rpcs, functions = [], routes = [] } = r.fixtureCoverage.reach;
    const tableNames = Object.keys(tables).sort();
    const parts = [
      ...tableNames.map((t) => `${t}(${[...tables[t]].sort().join('/')})`),
      ...[...rpcs].sort().map((fn) => `rpc:${fn}`),
      // Named apart from `rpc:` because they are different things to whatever compares this against
      // a backend ledger: an edge function is its own deployable, an app route its own handler.
      ...[...functions].sort().map((fn) => `fn:${fn}`),
      ...[...routes].sort().map((r2) => `route:${r2}`),
    ];
    report.ok('data-reach', `reaches ${parts.join(', ')} (${label})`, {
      n: tableNames.length + rpcs.length + functions.length + routes.length,
      of: 'backend dependencies',
    });
    if (declared) reportReachDrift(report, r.fixtureCoverage.reach.by, declared, label);
  }

}


/**
 * Every harness call, spawned the same way.
 *
 * The mount path got the alias loader, the project root and the lagoon env; the differentiation and
 * scenario-reading calls did not, so on any project whose islands import through an alias they failed
 * — and `runtimeDifferentiationCheck` returned SILENTLY on a non-zero exit, so `data-flow` simply
 * never appeared in the report. A check that vanishes when it breaks is worse than one that fails.
 */
async function spawnHarness(args) {
  ensureNoInstallLinks(REPO_ROOT, MOTU_CHECKOUT);
  const ALIAS_REGISTER = resolve(dirname(fileURLToPath(import.meta.url)), '../alias-register.mjs');
  return spawnSync(process.execPath, ['--import', 'tsx', '--import', pathToFileURL(ALIAS_REGISTER).href, ...args], {
    encoding: 'utf8',
    cwd: CLI_PKG,
    env: {
      ...lagoonEnv(),
      ...process.env,
      MOTU_PROJECT_ROOT: REPO_ROOT,
      MOTU_NODE_ALIASES: await nodeAliasEnv(),
    },
  });
}

/** Fast in-process lagoon mount under happy-dom for one fit (used with --fast). */
async function runtimeCheckFast(report, tag, fixturesPath, fit) {
  // The alias hook goes AFTER tsx so tsx compiles what it resolves.
  const ALIAS_LOADER = resolve(dirname(fileURLToPath(import.meta.url)), '../alias-register.mjs');
  const args = ['--import', 'tsx', '--import', pathToFileURL(ALIAS_LOADER).href, HARNESS, tag, fixturesPath || '', fit];
  // Node has to be able to resolve @motu/* from the project's own files before it can load them.
  ensureNoInstallLinks(REPO_ROOT, MOTU_CHECKOUT);
  const res = await step('mount(fast)', async () =>
    spawnSync(process.execPath, args, {
    encoding: 'utf8',
    cwd: CLI_PKG,
    // cwd is the CLI package so `--import tsx` resolves; MOTU_PROJECT_ROOT says which project to load.
    env: { ...lagoonEnv(), ...process.env, MOTU_PROJECT_ROOT: REPO_ROOT, MOTU_NODE_ALIASES: await nodeAliasEnv() },
    }),
  );
  if (res.status !== 0) {
    // The LAST stderr line is a stack frame; the useful one is what the harness said it died of.
    const lines = (res.stderr || '').trim().split('\n').filter(Boolean);
    const why = lines.find((l) => /harness-fatal|^Error|^[A-Za-z]*Error:/.test(l)) ?? lines.pop() ?? 'no output';

    // TWO COPIES OF REACT is this path's own failure, not the island's.
    //
    // `--fast` is plain node: the project resolves `react` from its own node_modules and the framework
    // packages resolve theirs, so a component that calls a hook meets a null dispatcher. The browser
    // lagoon does not have this problem — vite dedupes — and the island that fails here passes there,
    // which is exactly what happened to `promo-box` the first time this ran. Reporting it as a defect
    // would send an agent to rewrite a component that is fine.
    if (/Invalid hook call|Cannot read properties of null \(reading 'use[A-Z]/.test(res.stderr || '')) {
      report.inconclusive(
        'lagoon-render',
        `--fast cannot mount this island: two copies of React (the project's and the framework's) meet ` +
          `in one tree, so hooks see a null dispatcher. Re-run without --fast; the browser lagoon dedupes`,
      );
      return;
    }
    report.error('lagoon-render', `lagoon mount failed (fit=${fit}) — ${why.trim()}`);
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
export function readScenarios(fixturesPath) {
  const args = ['--import', 'tsx', HARNESS, '', fixturesPath, 'native', 'scenarios'];
  // Node has to be able to resolve @motu/* from the project's own files before it can load them.
  ensureNoInstallLinks(REPO_ROOT, MOTU_CHECKOUT);
  const res = spawnSync(process.execPath, args, {
    encoding: 'utf8',
    cwd: CLI_PKG,
    // cwd is the CLI package so `--import tsx` resolves; MOTU_PROJECT_ROOT says which project to load.
    env: { ...process.env, MOTU_PROJECT_ROOT: REPO_ROOT },
  });
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
    const res = await spawnHarness([HARNESS, tag, fixturesPath, 'native', 'differentiate']);
    if (res.status !== 0) {
      const why = (res.stderr || '').trim().split('\n').find((l) => /harness-fatal|Error/.test(l)) ?? 'no output';
      report.inconclusive('data-flow', `could not compare scenarios: ${why.trim()}`);
      return;
    }
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

/**
 * A scenario's scripted interactions must have DONE something — the guard that keeps
 * `Scenario.interactions` from becoming the untyped browser-test suite the region-flow model
 * deliberately refuses (see `RegionStep`'s doc comment in `@motu/runtime/mock`).
 *
 * Sibling of `flow-mutation`'s "a step that cannot fail is not a check". The rule here is NOT "did
 * the render change?" — the properties interactions exist for often assert that it did NOT (a panel
 * keeping its last-good data through a failed refetch renders identically on purpose). Load-bearing
 * means the render moved OR the interaction caused work. Neither means somebody clicked a journey
 * whose end state a plain seed could have described, and it should be a seed.
 *
 * A WARNING, not an error: with no fake-fetch in play there is no request signal, so an interaction
 * that legitimately only moves state the capture cannot see is indistinguishable from a decorative
 * one, and the report says which case it could not tell apart.
 */
function reportInteractions(report, r) {
  const inert = r.inertInteractions;
  if (!inert) return; // the `--fast` lane runs no interactions — nothing to judge
  if (inert.length === 0) {
    report.ok('interaction-effective', 'every scripted interaction moved the render or caused work');
    return;
  }
  for (const { name, requestsObservable } of inert) {
    report.warn(
      'interaction-effective',
      `"${name}" scripted an interaction that changed nothing observable — ` +
        (requestsObservable
          ? 'no render change and no request. A seed describing the same end state is the honest form'
          : 'no render change, and this project has no fake-fetch request signal to check against. ' +
            'Either it is decorative, or what it moved is not captured — assert on what it produced'),
    );
  }
}

function reportDifferentiation(report, r) {
  if (!r || r.differentiates == null) return;
  reportInteractions(report, r);
  if (r.differentiates) {
    // Duplicates are not a failure — two seeds may legitimately normalise to one output — but they are
    // not evidence either, and the ok line used to cover for them.
    if (r.distinctOutputs != null && r.distinctOutputs < r.scenarioCount) {
      report.warn(
        'data-flow',
        `${r.scenarioCount} scenarios produced only ${r.distinctOutputs} distinct render(s) — ` +
          `${r.scenarioCount - r.distinctOutputs} of them show nothing the others do not`,
      );
    }
    report.ok(
      'data-flow',
      `distinct inputs produce distinct output (${r.scenarioCount} scenarios) — data flows past the seam`,
      { n: r.distinctOutputs ?? r.scenarioCount, of: 'distinct render(s)' },
    );
  } else if (r.empty?.length) {
    // AN EMPTY SCENARIO IS NOT AN IDENTICAL ONE. The comparison needs every scenario to have rendered
    // something, so one that renders nothing sinks the check — and saying "rendered identically" then
    // points at the wrong thing entirely. Name the scenarios, because an island whose empty state IS
    // its correct answer (a summary of nothing, a bar with nothing to act on) cannot take part in this
    // check at all, and the author needs to know that rather than hunt a bind gap.
    report.error(
      'data-flow',
      `${r.empty.length} of ${r.scenarioCount} scenario(s) rendered NOTHING — ${r.empty.join(', ')}. ` +
        `Distinct output cannot be compared against a blank one. Either the island is not receiving that ` +
        `seed, or its empty state is deliberate — in which case that scenario does not belong here`,
    );
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
/*
 * RESOURCE EXHAUSTION BELONGS HERE, and its absence was measured rather than guessed. On a machine
 * running several agents at once, Vite's dev server died with
 * `ENOSPC: System limit for number of file watchers reached` — the box was out of inotify watches,
 * nothing to do with the island — and `island verify --runtime` reported it as exit 1, FAIL. That is
 * precisely the outcome the three-code design exists to prevent: an unattended agent reads `✗` and
 * repairs a bug that does not exist. Two arms of one bench run hit it.
 *
 * ENOSPC is listed with its siblings (EMFILE/ENFILE — descriptors, ENOMEM — memory) because they are
 * the same class: the machine ran out of something, and no edit to the project changes that.
 */
const ENVIRONMENTAL =
  /did not open port .* in time|Executable doesn't exist|playwright install|EADDRINUSE|ECONNREFUSED|ETIMEDOUT|Target page, context or browser has been closed|browserType\.launch|ENOSPC|System limit for number of file watchers|EMFILE|ENFILE|ENOMEM|JavaScript heap out of memory/i;

function environmentalCause(err) {
  const full = String(err?.message || err);
  if (!ENVIRONMENTAL.test(full)) return null;
  // An application cause anywhere in the output disqualifies it: the port never opened BECAUSE the
  // project does not build, and that is a finding.
  // …but the environmental line itself is not an application cause, and it usually LOOKS like one:
  // node prints `Error: ENOSPC: System limit for number of file watchers reached`, which matches the
  // `^Error` disqualifier and sent the whole classification back to FAIL. Skip any line that is
  // itself a known environmental signature before deciding the project is at fault.
  const appCause = full
    .split('\n')
    .find(
      (l) =>
        /^(Error|\s*failed to|.*ERR_[A-Z_]+|.*Cannot find)/.test(l) &&
        !l.includes('did not open port') &&
        !ENVIRONMENTAL.test(l),
    );
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
    reportRuntimeDiagnostics(report, r, `fit=${fit}`, declaredReach({ tag }));
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
    // MECHANISM AND BOUNDARY, READ APART. `mount` says how the element attaches to a legacy scope;
    // the names it RESOLVES from that scope are boundary facts and live in `contract.effects` as
    // `scope:…`, beside the modules and tables. One list for everything an island reaches.
    const contract = obj.getProperty('contract')?.getInitializerIfKind(SyntaxKind.ObjectLiteralExpression);
    const mount = obj.getProperty('mount')?.getInitializerIfKind(SyntaxKind.ObjectLiteralExpression);
    // Through the shared reader, so an authored `{ scope: 'search' }` and the canonical `scope:search`
    // this check wants are the same fact read once. Reading the array's TEXT rather than its AST nodes
    // keeps one implementation for the island file, the source module and the generated contracts.
    const effectsProp = contract?.getProperty('effects');
    const effects = effectsProp ? readEffectEntries(effectsProp.getText()) : undefined;
    const hostScope = effects?.filter((e) => e.startsWith('scope:')).map((e) => e.slice('scope:'.length));
    if (!mount && !hostScope?.length) continue;
    return {
      adopt: mount && strAt(mount, 'adopt'),
      inheritScope: mount && strAt(mount, 'inheritScope'),
      hostScopeKey: mount && strAt(mount, 'hostScopeKey'),
      hostScope: hostScope?.length ? hostScope : undefined,
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
  const graph = componentPath ? reachableAppSources(componentPath, { aliased: lagoonAliases() ?? [] }) : [];
  try {
    const mod = await import(specifier);
    for (const f of mod.checkCoupling({ coupling, source, elementSource: text, graph })) report[f.level](f.check, f.msg);
  } catch (err) {
    // INCONCLUSIVE, NOT A WARNING. A warning does not affect the exit code, so an adapter that failed
    // to load meant its checks silently did not run and the island still reported PASS — the exact
    // case exit 2 exists for ("a check could not run — retry, do NOT repair"). It is an environment
    // failure, not a finding about the island.
    report.inconclusive('adapter-verify', `could not run ${specifier}: ${String(err?.message || err)} — the ${specifier} checks did not run`);
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
    process.exit(sweepExitCode(results));
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
    // A SKIP, NOT AN OK. This says the React-only checks did not run — which is the report model's own
    // definition of a skip ("a rule silently reported as passing is indistinguishable from a rule that
    // ran"). Reported as `ok` it added a green tick for checks that never happened.
    report.skip('adapter-island', `AngularJS island (no React component) — the React checks do not apply; running config-lite + adapter + runtime`);
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
  if (argv.runtime === true || argv.audit === true) {
    // Randomize the base port so parallel/back-to-back verifies don't collide on a strict port.
    let port = 5300 + Math.floor(Math.random() * 400);
    const fixturesPath = existsSync(paths.fixturesFile(kebab)) ? paths.fixturesFile(kebab) : '';
    // Reading the evidence costs a tsx spawn, so this rides with the tiers that already load it rather
    // than slowing the static sweep. It needs no browser and runs under `--fast` too.
    if (fixturesPath) inputCoverageCheck(report, readScenarios(fixturesPath));
    // 'legacy' fit re-mounts the island under the host's legacy skin. Skip it where there is no
    // legacy skin — it would verify the same thing twice and double the wall clock.
    for (const fit of LEGACY_FIT ? ['native', 'legacy'] : ['native']) {
      if (argv.fast) {
        await runtimeCheckFast(report, resolvedTag, fixturesPath, fit);
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
    // AUDIT, not dev loop. Layout at every viewport and axe over every scenario answer "is this fit
    // for people", which changes when the RENDERING changes — not on the edit that moved a key. They
    // are the two most expensive per-island checks and they belong where their answer is acted on:
    // before integrating, and in CI as a non-regression gate. `--audit` asks for them.
    if (!argv.fast && argv.audit) await responsiveCheck(report, resolvedTag, kebab, port++);
    // Accessibility, in the browser that is already open.
    if (!argv.fast && argv.audit) await a11yCheck(report, resolvedTag, kebab, port++);
    if (!argv.fast && !argv.audit) {
      report.skip('audit', 'responsive + a11y not run — they are the `--audit` gate (before integrating, and in CI)');
    }
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

/**
 * A SWEEP's exit code: the worst verdict any member reached.
 *
 * Both sweeps used to gate on `errors.length === 0` alone, which made them the one path where an
 * inconclusive run reported success — no Chromium, every runtime check unanswered, `--all` exits 0
 * and CI goes green on a question nobody asked. The single-target form has always used
 * `verifyExitCode`; this is the same rule applied across members.
 *
 * An error still beats an inconclusive, exactly as it does for one member: a run that found something
 * wrong has an answer, and that answer is 1.
 */
export function sweepExitCode(results) {
  const codes = results.map(verifyExitCode);
  if (codes.includes(1)) return 1;
  return codes.includes(2) ? 2 : 0;
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
/** Per-sweep tally of how much of this section the reader has already seen. */
const sweepSeen = { total: 0, repeated: 0 };

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
      const again = unchangedSinceLastRun(f) ? color.dim('  · unchanged') : '';
      sweepSeen.total++;
      if (again) sweepSeen.repeated++;
      console.log(`      ${m} ${color.dim(f.check.padEnd(18))} ${f.msg}${again}${f.line ? color.dim(`  (line ${f.line})`) : ''}`);
    }
  }
  const failed = results.filter((r) => r.errors.length).length;
  const warned = results.reduce((n, r) => n + r.warns.length, 0);
  console.log('');
  const head = failed
    ? color.red(color.bold('FAIL')) + `  ${failed}/${results.length} with errors`
    : color.green(color.bold('PASS')) + `  ${results.length}/${results.length} clean`;
  // WHAT MOVED, on the line a reader piping through `tail` will actually see.
  const { total, repeated } = sweepSeen;
  const delta =
    total && repeated === total
      ? color.dim(' · all unchanged since your last run')
      : repeated
        ? color.dim(` · ${repeated} unchanged, ${total - repeated} new since your last run`)
        : '';
  console.log(head + color.dim(` · ${warned} warning(s) total`) + delta);
  sweepSeen.total = 0;
  sweepSeen.repeated = 0;
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
    // The count goes in `seen`, not the message: that is what makes `report.ok`'s "0 examined is a
    // skip" rule apply, so a run with no scenarios reports a SKIP instead of a green tick over nothing.
    report.ok('seed-transport', 'every scenario seed crosses into the browser intact', { n: scenarios.length, of: 'scenario seed(s)' });
  }
}

/**
 * The values an island's scenarios never show it.
 *
 * `data-flow` proves the scenarios DIFFER; nothing asks whether they differ in the ways that matter.
 * Two classes, both read from the VALUES the scenarios supply rather than from types, so this needs no
 * type-checker and says nothing about a prop no scenario sets:
 *   - a prop always given a non-empty array — the empty case is the one components forget;
 *   - a boolean prop that only ever takes one value — the other branch is never rendered.
 *
 * WHAT IT DOES NOT CATCH, stated because the case that prompted it is exactly this. An unguarded array
 * access reachable only with `compactMode: true` AND an empty list survived this check, and rightly:
 * each prop is well covered on its own — the region has an empty-list scenario and both values of the
 * boolean — and the hole is the CROSSING nothing renders. Per-prop coverage cannot see a per-pair gap,
 * and checking every pair over eight inputs would report more combinations than anyone would read.
 * The message says "cross it with the other inputs" because that is the part a human still owns.
 *
 * Deliberately not general property testing. These two are cheap, common and specific; everything
 * beyond them is a research project that would drown the report.
 */
function inputCoverageCheck(report, scenarios) {
  if (!Array.isArray(scenarios) || scenarios.length === 0) return;
  const seen = new Map();
  for (const sc of scenarios) {
    for (const [prop, value] of Object.entries(sc?.seed ?? sc?.props ?? {})) {
      if (!seen.has(prop)) seen.set(prop, []);
      seen.get(prop).push(value);
    }
  }
  if (!seen.size) return;

  const gaps = [];
  for (const [prop, values] of seen) {
    if (values.every((v) => Array.isArray(v)) && !values.some((v) => v.length === 0)) {
      gaps.push(`${prop} is never seeded empty`);
      continue;
    }
    if (values.every((v) => typeof v === 'boolean') && new Set(values).size === 1) {
      gaps.push(`${prop} is only ever seeded ${values[0]}`);
    }
  }
  if (!gaps.length) {
    report.ok('input-coverage', 'every seeded input is shown in more than one shape', {
      n: seen.size,
      of: 'seeded input(s)',
    });
    return;
  }
  report.warn(
    'input-coverage',
    `${gaps.length}/${seen.size} seeded input(s) are only ever seeded one way: ${gaps.join(', ')} — the state ` +
      `nothing renders is the one that breaks. Add a scenario for it, and cross it with the other inputs ` +
      `rather than varying one at a time`,
  );
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
 * WHERE THE REGION'S INPUT CAME FROM — through every door, in one list.
 *
 * The lagoon replaces host modules so completely that nothing shows a fetch happened: no request, no
 * network row, and the lens shows only the keys that resulted. Looking at a region and seeing no HTTP
 * at all is accurate and tells you nothing about whether an island asked for anything.
 *
 * An island's I/O leaves by one of THREE doors, and "all island I/O goes through the contract" is a
 * rule about an island's own file (`no-bare-fetch` reads the component, not its import graph) rather
 * than about the app: a service the island imports may read a table, and `contract.effects` has
 * `{ table }`/`{ rpc }`/`{ route }` kinds precisely so that can be DECLARED. Each door used to be
 * observed on its own — a traced stub here, `__motuDataReach` at the wire, and the contract's own
 * `CallEvent`, which no check ever printed. One question, so one readout:
 *
 *   ✓ provenance  contract: shots.list() ×2 · host-module: fetchClubFeed(11) ×4 · wire: table:shots(select)
 *
 * Two things stay visible that nothing else here can see, and now for all three doors: an island that
 * renders content while asking for NOTHING (its data came from somewhere it did not declare), and a
 * dependency it declares but never reaches.
 */
function provenanceCheck(report, id, region, calls, outbound = []) {
  // The unified ledger when the page carries one; the traced-calls list is the fallback for a lagoon
  // built before it existed, so an older bundle still reports what it always did.
  // `args ? name(args) : name` — a wire reach's declared form (`table:shots(select)`) has no argument
  // half, and appending `()` to it would print an operation as an empty call.
  const label = (o) => (o.args ? `${o.name}(${o.args})` : o.name);
  const asks = outbound.length
    ? outbound.map((o) => ({ via: o.via, label: label(o), owner: o.owner }))
    : calls.map((c) => ({ via: 'host-module', label: `${c.fn}(${(c.args ?? []).join(', ')})`, owner: `island:${c.island ?? '?'}` }));
  if (!asks.length) {
    report.skip(
      'provenance',
      'no outbound calls observed — the islands asked for nothing through the contract, a traced host ' +
        'module or the wire. If that is wrong, wrap a stub export in `traced(module, fn, impl)`; ' +
        'without it the lagoon shows the result and never the question',
    );
    return;
  }
  // GROUPED BY DOOR, THE SAME GROUPING THE LENS SHOWS. Which one an ask left by is the thing a reader
  // is deciding about — a contract call is answered by the transport, a wire reach by fixtures, a
  // host-module call by a stub — and the two surfaces disagreeing about how the seams are grouped is
  // how one of them ends up trusted and the other ignored.
  const order = ['contract', 'host-module', 'wire'];
  const groups = new Map();
  for (const a of asks) {
    const counts = groups.get(a.via) ?? new Map();
    counts.set(a.label, (counts.get(a.label) ?? 0) + 1);
    groups.set(a.via, counts);
  }
  const parts = [...groups]
    .sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
    .map(([via, counts]) => {
      const shown = [...counts].map(([k, n]) => (n > 1 ? `${k} \u00d7${n}` : k));
      return `${via}: ${shown.join(', ')}`;
    });
  // WHO ASKED, named — because "nobody asked for anything" was printed for months over a region whose
  // SOURCE was asking constantly, and an owner list is what makes that impossible to print again.
  const owners = [...new Set(asks.map((a) => a.owner))].sort();
  const unowned = asks.filter((a) => a.owner === 'unattributed').length;
  const by = owners.length ? ` \u2014 by ${owners.join(', ')}` : '';
  // ASKED FOR, not "islands fetched": a source asks too, at region level, and calling every ask an
  // island's is the same blind spot that dropped them from the lens.
  report.ok('provenance', `asked for: ${parts.join(' \u00b7 ')}${by}`, { n: asks.length, of: 'outbound call(s)' });
  if (unowned) {
    report.warn(
      'provenance',
      `${unowned} ask(s) attributed to nobody — the request left while no island's and no source's ` +
        `window was open, so nothing can say which declaration should account for it`,
    );
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
    env: { ...process.env, MOTU_PROJECT_ROOT: REPO_ROOT, MOTU_CATALOGUE_DECLARED: JSON.stringify(members.map((i) => i.member)) },
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
 * Every key a region declares an island WRITES should be moved by some flow.
 *
 * `wiring-live` is precise about what it proves: the region APPLIES a declared write when the event is
 * fired. It fires that event ITSELF, and so does a flow's `emit` — both go through the lagoon's emit
 * seam, not through the component. So neither can tell you the component still produces the event.
 *
 * Measured, and it corrected the guess that prompted this check: silencing a component's `onProgress`
 * in a real region changed nothing at any tier, EVEN THOUGH a flow drove `week-progress`. Driving a
 * coupling is not exercising the thing that emits it. That miss belongs to the runtime `emitted-live`,
 * which observes what actually fired; this check cannot catch it and does not claim to.
 *
 * What this one answers is narrower and still worth having: is this coupling exercised AT ALL? A
 * declared write no flow ever drives has never been shown to reach its key in a running region — the
 * declaration is unproven rather than merely unobserved. Static, because it is a question about the
 * evidence files, so it belongs in the fast loop.
 *
 * A WARNING, for the same reason `render-coverage` is one: the rule is new, and every region written
 * before it would go red wholesale, which teaches people to ignore the report rather than fix it.
 */
function writesCoveredCheck(report, id) {
  const islands = declaredWrites(id);
  // Slot → the events that slot declares it writes on. A slot with no `writes` is not a finding.
  const declared = [];
  for (const island of islands) {
    for (const event of Object.keys(island.writes ?? {})) {
      const target = island.writes[event];
      const key = typeof target === 'string' ? target : (target?.key ?? Object.keys(target ?? {})[0] ?? '?');
      declared.push({ slot: island.slot, event, key });
    }
  }
  if (!declared.length) return;

  const driven = new Set();
  for (const scenario of readScenariosFor(id)) {
    for (const st of scenario.steps ?? []) {
      if (st.emit?.slot && st.emit?.event) driven.add(`${st.emit.slot}\u0000${st.emit.event}`);
    }
  }
  const undriven = declared.filter((d) => !driven.has(`${d.slot}\u0000${d.event}`));
  if (!undriven.length) {
    report.ok('writes-covered', 'every declared write is driven by a flow', {
      n: declared.length,
      of: 'declared write(s)',
    });
    return;
  }
  report.warn(
    'writes-covered',
    `${undriven.length}/${declared.length} declared write(s) no flow drives: ` +
      `${undriven.map((d) => `${d.slot} → ${d.key} (on "${d.event}")`).join(', ')} — the coupling is declared and ` +
      `never exercised, so the component could stop emitting it and nothing here would change. Add a step with ` +
      `\`emit: { slot: '<slot>', event: '<event>' }\` and an \`expect\` on what ANOTHER island then shows`,
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

/**
 * The mutants for a scenario set, and the findings that need no browser at all.
 *
 * Split out so the mutants can ride ALONG with the real flows in one page session. They used to be a
 * second `runRegionFlows` call, which meant a second lagoon boot — and booting is most of what a flow
 * check costs. One boot, both sets, partitioned by name afterwards.
 */
function buildMutants(report, scenarios) {
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

  const mutants = [];
  let coverageOnly = 0;
  for (const scenario of scenarios) {
    for (const [i, step] of (scenario.steps ?? []).entries()) {
      if (!Object.keys(step.expect ?? {}).length && !Object.keys(step.expectRender ?? {}).length) continue;
      const mutated = mutateStimulus(step);
      if (!mutated) {
        coverageOnly++;
        continue;
      }
      mutants.push({
        name: `${MUTANT_PREFIX}${scenario.name ?? 'flow'} § ${i + 1}`,
        seed: scenario.seed,
        steps: [...(scenario.steps ?? []).slice(0, i), mutated],
      });
    }
  }
  return { mutants, coverageOnly, vacuous };
}


/**
 * The same step, driven differently.
 *
 * Deliberately crude: a value the region cannot mistake for the real one. Subtlety would only make it
 * possible for a mutant to reproduce the original behaviour by accident, which turns a tautology into
 * a pass — the exact failure this check exists to remove.
 */
function mutateStimulus(step) {
  if (step.provide) {
    const provide = Object.fromEntries(
      Object.entries(step.provide).map(([k, v]) => [k, v === null || v === undefined ? '__motu_mutant__' : null]),
    );
    return { ...step, provide, __mutant: true };
  }
  if (step.emit) {
    return {
      ...step,
      emit: { ...step.emit, detail: step.emit.detail === null ? '__motu_mutant__' : null },
      __mutant: true,
    };
  }
  return null;
}

/** Mutant scenarios are tagged so one run can carry both sets and tell them apart afterwards. */
const MUTANT_PREFIX = 'µ mutant · ';

/** Report what the mutants did — no browser here; they ran with the real flows. */
function reportMutants(report, flows, { mutants, coverageOnly, vacuous }) {
  if (!mutants.length) {
    report.skip('flow-mutation', 'no step carries both a stimulus and an assertion, so there is nothing to mutate');
    return;
  }
  const lastOf = new Map();
  for (const f of flows) {
    if (!String(f.scenario).startsWith(MUTANT_PREFIX)) continue;
    const prev = lastOf.get(f.scenario);
    if (!prev || f.step > prev.step) lastOf.set(f.scenario, f);
  }
  const survived = [...lastOf.values()].filter((f) => f.ok);
  // A mutant that BROKE the region proves nothing. Crude values are deliberate — they must not
  // reproduce the original behaviour by accident — but emitting one can crash the island receiving it,
  // and a crash is not the assertion discriminating. Counting those as kills was hiding exactly the
  // tautology this check exists to find: a step asserting a total the PREVIOUS step already produced
  // was reported killed, because its mutant died on the way rather than on the claim.
  const broke = [...lastOf.values()].filter((f) => !f.ok && f.error && !(f.mismatches ?? []).length);

  // COUNT WHAT CAME BACK, not what was sent. Reporting `mutants.length` killed regardless of results
  // meant that when the mutants failed to come back at all — a tag that did not survive the round
  // trip, say — the check printed a confident green for work it never saw. Which is the exact failure
  // `report.ok(…, seen)` exists to prevent, reproduced inside the check that polices tautologies.
  if (lastOf.size !== mutants.length) {
    report.inconclusive(
      'flow-mutation',
      `sent ${mutants.length} mutant(s) and got ${lastOf.size} back — the run did not answer for all of ` +
        `them, so nothing is proved about the ones missing`,
    );
    return;
  }
  for (const s of survived) {
    report.error(
      'flow-mutation',
      `"${String(s.scenario).replace(MUTANT_PREFIX, '')}" still holds when its input is changed — the assertion ` +
        `does not depend on what the step does, so it is asserting a constant. Assert something the stimulus moves`,
    );
  }
  for (const b of broke) {
    report.warn(
      'flow-mutation',
      `"${String(b.scenario).replace(MUTANT_PREFIX, '')}" broke the region when its input was mutated ` +
        `(${b.error}) — the assertion was never evaluated, so this step's discrimination is unproven`,
    );
  }
  if (!survived.length && !vacuous)
    report.ok(
      'flow-mutation',
      `${lastOf.size - broke.length}/${mutants.length} step(s) fail on their assertion when mutated` +
        (coverageOnly ? `; ${coverageOnly} coverage step(s) have no input to mutate` : ''),
      { n: mutants.length, of: 'mutant(s) killed' },
    );
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
  // The mutants ride along: one lagoon boot answers "do the flows hold?" and "could they have
  // failed?" together. Booting is most of what a flow check costs, and this was paying it twice.
  const mutation = buildMutants(report, scenarios);

  let results;
  let suspects = [];
  try {
    const run = await step('region-flow', () =>
      runRegionFlows({ id, port, scenarios: [...scenarios, ...mutation.mutants] }),
    );
    results = (run.flows ?? []).filter((f) => !String(f.scenario).startsWith(MUTANT_PREFIX));
    reportMutants(report, run.flows ?? [], mutation);
    suspects = run.suspects ?? [];
    reportStoreComplaints(report, run.diagnostics, 'declared flows');
    provenanceCheck(report, id, region, run.provenance ?? [], run.outbound ?? []);
    sourcesLiveCheck(report, id, run.channels, region, run.held ?? []);
    emittedLiveCheck(report, id, run.renderOutputs);
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
  const line = (f) => {
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
    // UNCHANGED SINCE THE LAST RUN OF THIS SAME COMMAND. Half of everything read in the check loop
    // was a repeat; saying so is what lets a reader skip it and look at the delta instead.
    const again = f.level === 'ok' || f.level === 'skip' ? '' : unchangedSinceLastRun(f) ? color.dim('  · unchanged') : '';
    console.log(`  ${mark} ${color.dim(f.check.padEnd(18))} ${f.msg}${seen}${again}${at}`);
  };

  // THE PASSES COLLAPSE; EVERYTHING ELSE DOES NOT.
  //
  // One island under `--runtime` printed 24 rows, 20 of them green, and `motu check --runtime` does
  // that once per island — so the findings worth reading were a fifth of the output and got skimmed
  // past. Warnings, errors, skips and inconclusives keep their own line, because each is something to
  // act on or to know was not run.
  //
  // The ids are still NAMED, not just counted. `report.ok(check, msg, 0)` already becomes a `skip`, so
  // a check that examined nothing is never inside this line — but a check that never RAN would leave
  // no trace at all, and the whole point of the seen-count is that silence must be legible. Listing
  // them keeps a missing check visible; `--verbose` prints the full rows with their counts.
  const passed = report.findings.filter((f) => f.level === 'ok');
  for (const f of report.findings) if (verbose || f.level !== 'ok') line(f);
  if (!verbose && passed.length) {
    console.log(`  ${color.green('✓')} ${color.dim('passed'.padEnd(18))} ${passed.length} check(s)`);
    console.log(`    ${color.dim(passed.map((f) => f.check).join(', '))}`);
  }
  console.log('');
  const unknown = report.findings.filter((f) => f.level === 'inconclusive');
  // THE DELTA, ON THE VERDICT LINE. Every agent observed in the bench piped this report through
  // `tail`, so the end is the only part reliably read — which makes it where "what moved" belongs.
  const actionable = report.findings.filter((f) => f.level === 'error' || f.level === 'warn');
  const repeated = actionable.filter((f) => unchangedSinceLastRun(f)).length;
  const delta =
    repeated && repeated < actionable.length
      ? color.dim(` · ${repeated} unchanged, ${actionable.length - repeated} new since your last run`)
      : repeated && repeated === actionable.length
        ? color.dim(' · all unchanged since your last run')
        : '';
  if (errors.length) {
    console.log(color.red(color.bold('FAIL')) + `  ${errors.length} error(s), ${warns.length} warning(s)` + delta);
  } else if (unknown.length) {
    // NOT a pass: nothing contradicted the declarations, but some of them were never examined.
    console.log(
      color.yellow(color.bold('INCONCLUSIVE')) +
        color.dim(`  ${unknown.length} check(s) could not run, ${warns.length} warning(s) — retry, do not repair`),
    );
  } else {
    console.log(color.green(color.bold('PASS')) + color.dim(`  ${warns.length} warning(s)`));
  }
  printLagoonAvailability();
}

/**
 * WHERE A PERSON CAN LOOK AT THIS RIGHT NOW — printed under every verdict, pass or fail.
 *
 * A green report describes files. The thing the work is FOR is a rendered region, and for the whole
 * of a bench run no agent ever handed one over: each finished on a passing check and a summary, and
 * the person who asked for the work had nothing to open. The rules already said to look; nothing in
 * the loop ever mentioned it, so it was the step that quietly did not happen.
 *
 * This is a NUDGE, not a gate, and deliberately so. Failing a static check because no dev server is
 * running would make `motu check` depend on a process and a network — untrue to what it examines, and
 * unrunnable in CI. So: the URL when there is one, and how to get one when there is not.
 */
function printLagoonAvailability() {
  const url = readLiveUrl();
  if (url) console.log(color.dim('  look at it: ') + url);
  else console.log(color.dim('  no live lagoon — start one with: motu lagoon dev --detach'));
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
/**
 * The region's lagoon FRAME MODULE — the file holding its `layout` — or null.
 *
 * Resolved rather than guessed by filename: `overridesFor(someArchipelago, …)` names the archipelago
 * it belongs to, so the module is identified by what it POINTS AT, never by a spelling that could
 * disagree with the registry.
 */
/**
 * IS THE REGION THE PAGE, OR A DRAWING OF IT?
 *
 * The lagoon's whole claim is that what you look at is what ships. A frame that writes its own JSX
 * breaks that claim silently, and this project proved it: `regions/forgot-password.tsx` rendered
 * `<h2>On récupère ton accès</h2>` while the page rendered `Mot de passe oublié ?` — a heading that
 * existed nowhere in the application, previewed for weeks under a green PASS, because every other
 * check reads motu's own declarations and none of them opens the page.
 *
 * So a frame may contain ONLY:
 *   - components imported from the HOST application (the arrangement it already ships),
 *   - fragments,
 *   - `island(slot)` calls.
 *
 * An intrinsic element or a literal string is arrangement that exists only here. And a host component
 * the frame calls must be one the PAGE composing this region actually renders — pointing at a real
 * component that no page uses is the same lie with better manners.
 *
 * The escape hatch costs a sentence, like `rawChannel`: `inventedArrangement('why', <…/>)`. It
 * downgrades to a warning that prints the reason, so a deliberate stand-in stays findable.
 */
/**
 * DOES THE REGION COMBINE THE SAME ISLANDS THE APPLICATION DOES?
 *
 * The arrangement is the page's own business — a lagoon frame is allowed to place things differently,
 * and forcing one component on every page would mean restructuring pages around motu. What is NOT the
 * frame's business is WHICH ISLANDS the region is made of. Get that wrong and the region previewed,
 * flowed and snapshotted is a different region from the one that ships: an island nobody mounts looks
 * proven, and an island the page mounts is never looked at.
 *
 * This is the drift `region-root` cannot see. acme's annuaire frame simply omitted `header`, and its
 * actions frame omits `ambassador-card` — both under green checks, because every other check reads
 * motu's declarations and the page's placements separately, and nothing compared the two.
 *
 * Decidable without a browser, from three sources:
 *   - the FRAME's `island(<slot>)` calls,
 *   - the archipelago's own NESTED slots (`slots: { ambassador: 'ambassador-inline' }`), which motu
 *     fills itself, so the frame never names them and their absence is not a finding,
 *   - the HOST's `<X.Island slot="…">` placements.
 *
 * A region composed from a declared `root` cannot drift here at all — the page passes props by name
 * and motu maps them — so it is reported as such rather than compared.
 */
function islandCompositionCheck(report, id, region, composedBy, sources) {
  const archPath = paths.archipelagoFile(id);
  const archText = existsSync(archPath) ? blankComments(readFileSync(archPath, 'utf8')) : '';
  if (/^\s*root\s*:/m.test(archText)) {
    report.skip('island-composition', 'composed from the archipelago’s `root` — one declaration, nothing to compare');
    return;
  }

  const { module } = frameModuleFor(id);
  if (!module) {
    report.skip('island-composition', 'no region frame — the islands are placed individually across the host');
    return;
  }

  const declared = new Set((region?.islands ?? []).map((i) => i.slot).filter(Boolean));
  const frame = new Set(
    [...blankComments(readFileSync(module, 'utf8')).matchAll(/\bisland\(\s*['"`]([^'"`]+)['"`]/g)].map((m) => m[1]),
  );
  // Nested by DECLARATION: motu fills these into the outer island's props, in the page and in the
  // lagoon alike, so a frame that does not name them is composing them all the same.
  const nested = nestedSlots(paths.archipelagoFile(id));
  const placed = new Set();
  // PARSED, and the same parse `integrate check` uses — see `island-placement.mjs`. This asked the
  // same question with a pattern, which could not see a multi-line element, a computed slot, or a
  // commented-out one.
  for (const code of composedBy) {
    for (const slot of placementsIn(code).named) if (declared.has(slot)) placed.add(slot);
  }

  if (!placed.size) {
    report.skip('island-composition', 'no host file placing this region’s islands could be read');
    return;
  }

  const mounts = new Set([...frame, ...nested]);
  const onlyInFrame = [...mounts].filter((slot) => !placed.has(slot));
  const onlyInPage = [...placed].filter((slot) => !mounts.has(slot));

  const findings = [];
  if (onlyInFrame.length) {
    findings.push(
      `the region mounts ${onlyInFrame.join(', ')}, which the application never places — previewed, ` +
        `flowed and pictured, and shipped by nothing`,
    );
  }
  // A slot the page places CONDITIONALLY may legitimately be missing from the frame: the frame shows
  // one STATE of the page, and acme's `ambassador-card` is the empty-week fallback that the normal week
  // does not reach. That is a different state, not a different composition — so it is said, not failed.
  // A slot placed UNCONDITIONALLY and never mounted is the real finding: it ships on every render and
  // the region has never once looked at it.
  // The TAG NAMES as the host actually writes them (`<Actions.Island …>`), read from the files that
  // place them — the binding's name is the page's to choose, so it cannot be derived from the region.
  const islandNames = [
    ...new Set(composedBy.flatMap((code) => [...code.matchAll(/<([A-Z][A-Za-z0-9]*\.Island)[\s/>]/g)].map((m) => m[1]))),
  ];
  let conditional = new Map();
  try {
    conditional = conditionallyPlaced(sources, ['Island', ...islandNames], blankComments) ?? new Map();
  } catch {
    conditional = new Map();
  }
  const missedAlways = onlyInPage.filter((slot) => !conditional.has(slot));
  const missedSometimes = onlyInPage.filter((slot) => conditional.has(slot));
  if (missedAlways.length) {
    findings.push(
      `the application always places ${missedAlways.join(', ')}, which the region never mounts — it ` +
        `ships on every render, and nothing here has ever looked at it`,
    );
  }
  if (findings.length) {
    report.error('island-composition', `${paths.rel(module)}: ${findings.join('; ')}`);
    return;
  }
  if (missedSometimes.length) {
    report.warn(
      'island-composition',
      `${paths.rel(module)}: the application places ${missedSometimes.join(', ')} in a branch this ` +
        `region's frame does not show — a different STATE of the same page, so confirm the state the ` +
        `frame shows is the one worth looking at, and that the other has a scenario or a flow`,
    );
    return;
  }
  report.ok(
    'island-composition',
    `the region is made of the same ${mounts.size} island(s) the application places`,
    mounts.size,
  );
}


/**
 * The source of the `layout` export alone, or the whole file when it cannot be isolated.
 *
 * Falls back deliberately: a frame reached through the array form has no single named export, and
 * judging nothing would be worse than judging too much.
 */
function frameDeclarationText(file, raw, exportName) {
  if (!exportName) return raw;
  try {
    const sf = sourceFileAt(file);
    const decl = sf.getVariableDeclaration(exportName) ?? sf.getFunction(exportName);
    return decl ? decl.getText() : raw;
  } catch {
    return raw;
  }
}

function frameIsPageCheck(report, id, region) {
  // THE ANSWER, when the region has one: `root` names the application's own component and `slots`
  // maps its props to islands, so the page and the lagoon compose from the SAME declaration and
  // neither writes the other's half. Nothing is left to compare, because nothing is duplicated.
  const archText = existsSync(paths.archipelagoFile(id)) ? readFileSync(paths.archipelagoFile(id), 'utf8') : '';
  const rootDecl = blankComments(archText).match(/^\s*root\s*:\s*([A-Za-z_$][\w$]*)/m);
  if (rootDecl) {
    const mapped = [...blankComments(archText).matchAll(/^\s{4}(\w+)\s*:\s*'([^']+)'/gm)];
    report.ok(
      'region-root',
      `composed from the archipelago's own \`root\` (${rootDecl[1]}) — the page and the lagoon share one declaration`,
      1 + mapped.length,
    );
    const { module: leftover } = frameModuleFor(id);
    if (leftover && /\blayout\s*:/.test(blankComments(readFileSync(leftover, 'utf8')))) {
      report.error(
        'region-root',
        `${paths.rel(leftover)} still declares a \`layout\` while the archipelago declares a \`root\` — ` +
          `two arrangements for one region, which is the duplication \`root\` exists to remove. Delete the frame`,
      );
    }
    report.skip(
      'island-composition',
      'composed from the archipelago\u2019s `root` \u2014 one declaration, so the region cannot be made of ' +
        'different islands from the page',
    );
    return;
  }

  // AN OCEAN COMPOSES FROM ITS OWN `layout`, and that is a third legitimate shape rather than a
  // missing `root`.
  //
  // `root` is a React component and `<X.Island>` is a React binding, so an AngularJS ocean can supply
  // neither. What it has is a template of `<motu-island slot="…">` markers on the archipelago, which
  // `<motu-archipelago name="…">` renders in the page and which the lagoon's own preference order
  // already honours (`lagoon-react-mount.tsx`: root, then `layout`, then declared order). Demanding a
  // React `root` from a legacy host made every ocean region a hard error — motu's own `demo-app`, the
  // reference ocean, could not pass `motu check` at all.
  //
  // Reported with its LIMIT named. In the embedded ocean the legacy page may place its own markers
  // rather than mounting the whole region, and nothing compares those two — which is the same class of
  // gap a hand-written frame has, so it gets the same kind of line.
  const layoutDecl = /^\s*layout\s*:/m.test(blankComments(archText));
  // AND ONLY AN OCEAN. `layout` is a template of `<motu-island slot="…">` markers rendered by the
  // custom element; a REACT host has no custom element to render it and `<X.Island>` is the binding
  // it does have, so the same declaration composes nothing there.
  //
  // This branch did not ask, so a Vite or Next region declaring `layout` — which is what the
  // scaffold's own commented example suggests — passed `region-root` green, passed every other static
  // check, and then failed the runtime pass outright: "archipelago did not render", "reaches NONE of
  // its declared slots". A cold-start agent lost its remaining budget to exactly that, and nothing in
  // the CLI said `layout` was the wrong shape for its host until the expensive check ran.
  //
  // An ERROR rather than a warning: unlike a stage-1 overlay, this is not a shape someone can ship
  // and migrate later — it does not work at all on this host.
  if (layoutDecl && HOST !== 'angularjs') {
    report.error(
      'region-root',
      `this region declares \`layout\` in the ARCHIPELAGO — the ocean's composition, a template of ` +
        `<motu-island> markers rendered by <motu-archipelago>. This project's host is \`${HOST}\`, ` +
        `which has no such element: the region would pass every static check and render NOTHING.\n` +
        `    TWO THINGS ARE CALLED \`layout\` AND THIS IS THE OTHER ONE. In the LAGOON OVERRIDES, ` +
        `\`layout: (island) => <YourPageFrame island={island} />\` is a React frame and is correct here — ` +
        `that is the one the scaffold's commented example shows. In the ARCHIPELAGO, \`layout\` is the ` +
        `ocean's template and means nothing on a React host.\n` +
        `    So: move it to the region's lagoon overrides, or declare \`root\` — the application's own ` +
        `layout component, with \`slots\` mapping its props to islands, which is the form with no ` +
        `second copy anywhere. See docs/06-composition-and-adoption.md`,
    );
    report.skip('island-composition', '`layout` is not a composition on this host — see region-root');
    return;
  }
  if (layoutDecl) {
    report.ok(
      'region-root',
      `composed from the archipelago's own \`layout\` — the ocean's form, rendered by ` +
        `<motu-archipelago> in the page and by the lagoon from the same template. Where the legacy ` +
        `page places its own <motu-island> markers instead, that placement is a second description ` +
        `nothing here compares`,
      (region?.islands ?? []).length,
    );
    report.skip(
      'island-composition',
      "composed from the archipelago's `layout` — one template, so the region cannot be made of " +
        'different islands from the page that mounts it',
    );
    return;
  }

  const { module, inline, exportName } = frameModuleFor(id);
  // AN INLINE `layout` IS AN ARRANGEMENT, NOT A MISSING ONE. It renders — both cold-start agents
  // confirmed the region painted correctly from one — so the only thing lost is this file's ability
  // to OPEN the frame and run the checks below (what it draws itself, which slots it places). Say
  // that, and say the one-line fix, instead of demanding a `root` the region may not need yet.
  if (!module && inline) {
    report.warn(
      'region-root',
      `\`layout\` for this region is written inline in the lagoon overrides, so the frame checks ` +
        `cannot read it — what it draws itself and which slots it places are unchecked. Move it to a ` +
        `named export beside the region (\`export const ${id.replace(/[^\w$]/g, '')}Frame = (island) => …\`) ` +
        `and reference it by name. The region still composes; this is the frame, not the archipelago`,
    );
    return;
  }
  if (!module) {
    // A REGION WITH NO ISLANDS HAS NOTHING TO COMPOSE YET. `archipelago create` scaffolds exactly
    // that, so demanding a root here would open a new project's first `motu check` on an error about
    // the thing it had just been handed — the same mistake `region-type` already records. The demand
    // is right the moment the region has a member.
    const empty = !(region?.islands ?? []).length;
    report[empty ? 'warn' : 'error'](
      'region-root',
      `no \`root\` — declare the application's own component as \`root\` in the archipelago, with ` +
        `\`slots\` mapping its props to this region's islands. Without it the page and the lagoon each ` +
        `compose the region their own way, and nothing compares the two`,
    );
    return;
  }
  const raw = readFileSync(module, 'utf8');
  // ONLY THE `layout` EXPORT, when we know which one it is.
  //
  // This read the whole FILE, so anything else living in the same module was judged as arrangement
  // the frame draws itself. Measured on a cold adoption: a region kept its `providers` (a DI
  // container, a Redux `Provider`, a router) beside its frame — the natural place for them — and
  // `region-root` reported the providers' own JSX, and a string from a button inside them, as the
  // frame inventing a layout. The adopter split the file to satisfy a check that was reading the
  // wrong thing.
  const body = blankComments(frameDeclarationText(module, raw, exportName));

  const excused = body.match(/inventedArrangement\(\s*(['"`])([\s\S]*?)\1/);

  // --- 1. what does the frame draw itself? -----------------------------------------------------
  //
  // `[^\w$.]` before the `<` is what separates JSX from a TYPE ARGUMENT: `SlotsOf<typeof x>` and
  // `new Set<string>()` are not elements, and reporting them as invented arrangement would make the
  // check's first impression a false one.
  const intrinsic = [...new Set([...body.matchAll(/(?:^|[^\w$.])<([a-z][a-zA-Z0-9-]*)[\s/>]/gm)].map((m) => m[1]))];
  // Literal text sitting between JSX tags: `>Some words<`. Whitespace and expressions are not text —
  // and neither is code that happens to sit between a `=>` and the next element, so anything carrying
  // punctuation only code has is skipped.
  const literals = [...new Set(
    [...body.matchAll(/>\s*([^<>{}\s][^<>{};=()]*?)\s*</g)].map((m) => m[1].trim()).filter((t) => /[A-Za-zÀ-ÿ]/.test(t)),
  )];

  // --- 2. which host components does it call, and does the page render them? -------------------
  const called = [...new Set([...body.matchAll(/<([A-Z][A-Za-z0-9]*)[\s/>]/g)].map((m) => m[1]))];
  // The frame's own exported components are not host components — they ARE the frame.
  const ownExports = new Set([...body.matchAll(/export\s+(?:function|const)\s+([A-Z][A-Za-z0-9]*)/g)].map((m) => m[1]));
  const hostCalled = called.filter((c) => !ownExports.has(c));

  const sources = hostSources();
  const islandNames = [...new Set((region?.islands ?? []).map((i) => i.element).filter(Boolean))];
  // WHERE THIS REGION IS COMPOSED: the files placing its slots, plus one hop up — a page that renders
  // a screen component which places the islands is composing this region too, and it is usually the
  // page that holds the layout (acme's `/forgot-password` is exactly that shape).
  const composing = new Map();
  const slotRe = /<[A-Z][A-Za-z0-9]*\.Island\s[^>]*?slot=["'`]([^"'`]+)/g;
  const declaredSlots = new Set((region?.islands ?? []).map((i) => i.slot).filter(Boolean));
  for (const [file, text] of sources) {
    const code = blankComments(text);
    for (const [, slot] of code.matchAll(slotRe)) if (declaredSlots.has(slot)) composing.set(file, code);
  }
  for (const [file, code] of [...composing]) {
    const exported = [...code.matchAll(/export\s+(?:default\s+)?(?:function|const)\s+([A-Za-z0-9_$]*)/g)].map((m) => m[1]).filter(Boolean);
    for (const [other, text] of sources) {
      if (composing.has(other)) continue;
      const oc = blankComments(text);
      if (exported.some((e) => new RegExp(`<${e}[\\s/>]`).test(oc))) composing.set(other, oc);
    }
    void file;
  }
  const composedBy = [...composing.values()];
  islandCompositionCheck(report, id, region, composedBy, sources);
  const orphan = hostCalled.filter((c) => !composedBy.some((code) => new RegExp(`<${c}[\\s/>]`).test(code)));

  const findings = [];
  if (intrinsic.length) findings.push(`draws ${intrinsic.length} element(s) of its own (<${intrinsic.join('>, <')}>)`);
  if (literals.length) {
    const shown = literals.slice(0, 3).map((t) => `"${t.length > 44 ? t.slice(0, 41) + '…' : t}"`);
    findings.push(`writes ${literals.length} literal string(s) the page may never say (${shown.join(', ')})`);
  }
  if (!composedBy.length && hostCalled.length) {
    findings.push(`calls ${hostCalled.join(', ')}, and no host file placing this region's slots could be found to compare against`);
  } else if (orphan.length) {
    findings.push(`calls ${orphan.join(', ')}, which no file composing this region renders`);
  }

  const where = paths.rel(module);
  if (!findings.length) {
    // A CLEAN FRAME IS A LEGITIMATE WAY TO COMPOSE A REGION, and saying otherwise is how a tool
    // prices itself out of being adopted: moving a page to `root` is a real refactor of the host's
    // own JSX, and a project cannot do ten of them before its first green run.
    //
    // What IS true is that a frame is a SECOND description of the page, safe only as far as the checks
    // comparing it reach — `island-composition` compares which islands, nothing compares the
    // arrangement. So the line names `root` without failing on it, and a project that has finished
    // migrating sets `"regionRoot": "required"` and the frame becomes an error from then on.
    const stronger =
      `composed by a hand-written frame in ${where}, and it holds the page's own components ` +
      `(${hostCalled.length ? hostCalled.join(', ') : 'islands only'}). Declaring \`root\` + \`slots\` on the ` +
      `archipelago instead leaves ONE description — the page and the lagoon compose from the same map, ` +
      `so they cannot differ`;
    if (paths.regionRoot === 'required') report.error('region-root', `${stronger}. This project sets \`regionRoot: "required"\``);
    else report.ok('region-root', stronger, hostCalled.length + composedBy.length);
    return;
  }
  const detail = `${where}: ${findings.join('; ')} — a frame may hold only the application's own components, fragments and island(slot). What you look at in the lagoon is otherwise a drawing of the page, not the page`;
  if (excused) report.warn('region-root', `${detail}. Excused: "${excused[2].trim()}"`);
  else report.error('region-root', detail);
}

function archipelagoConfigChecks(report, id) {
  const archPath = paths.archipelagoFile(id);
  if (!existsSync(archPath)) {
    report.error('registered', `no archipelago at ${paths.rel(archPath)}`);
    return;
  }
  const text = readFileSync(archPath, 'utf8');

  // The region's declared shape (D8). Under a host that owns its own page state, the page and the
  // archipelago otherwise name the same values twice with nothing linking them — acme's page called it
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
    } else if (!(readRegions(paths.archipelagosDir).find((r) => r.id === id)?.islands ?? []).length) {
      // A REGION WITH NO ISLANDS HAS NO BIND KEYS TO CHECK. `archipelago create` scaffolds exactly
      // that, so a new project's first `motu check` — run straight after the next-step the scaffolder
      // prints — opened on an ERROR about the thing it had just been given. The demand is right the
      // moment the region has a member; before that it is the tool failing its own output.
      report.warn(
        'region-type',
        'no region type yet — declare it as `archipelago<TRegion, ElementTypes, ProducedKeys>()({…}, {…})` with a ' +
          'type EXTRACTED FROM THE APP before adding the first island, so bind keys cannot drift from it',
      );
    } else {
      report.error(
        'region-type',
        'no region type — declare it as `archipelago<TRegion, ElementTypes, ProducedKeys>()({…}, {…})` with a type ' +
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
    //   writes:   { ev: key }  an island owns these, and the mapping is what makes them ejectable
    //   bind:     { prop: key} who reads
    // A `store.set` left inside an `on` handler still writes, but opaquely — it is counted as written
    // and reported, because nothing can draw it or generate wiring from it.
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
    // HOST-FED, DERIVED: read by an island, written by none. This used to union a declared
    // `provides: [...]` on top, and that list is gone — it restated exactly this subtraction, had to be
    // maintained by hand, and its only checks (`unowned`, `disputed`) were empty by construction:
    // `unowned` subtracted a set that already covered every read key, and `disputed` needed a
    // `provides` no region had written since the derivation existed.
    const provided = new Set([...read].filter((k) => !written.has(k)));
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
      // Only the SLOT NAME out of each entry. A region-level `slots` may take the object form for an
      // exclusive pair (`{ slot: 'auth-error', when: 'authError' }`), and taking every quoted string
      // read `when`'s region key as a slot this region had never declared — an error about a shape
      // that was correct.
      // ISLAND-LEVEL ONLY. The region's own `slots` sits at two spaces of indent; a member's nested
      // map is deeper inside an entry. Counting the region's made every root slot read as an island
      // nested in another, which is a different claim entirely.
      const filled = blocksAfter(code.replace(/^ {2}slots\s*:[\s\S]*?^ {2}\},/m, ''), 'slots:', '{').flatMap((b) =>
        [...b.matchAll(/(\w+)\s*:\s*(\{[^}]*\}|'[^']+')/g)].map(([, , rest]) =>
          rest.startsWith('{') ? rest.match(/\bslot\s*:\s*'([^']+)'/)?.[1] : rest.slice(1, -1),
        ),
      ).filter(Boolean);
      const missing = [...new Set(filled)].filter((slot) => !declaredSlots.has(slot));
      if (missing.length) {
        report.error(
          'composition',
          `island slot(s) filled with an island this region does not declare: ${missing.join(', ')}`,
        );
      } else if (filled.length) {
        report.ok('composition', 'every nested slot is one this region declares', { n: filled.length, of: 'nested island(s)' });
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
    // Grouped by ELEMENT, not by slot. acme caught the first version of this rule as a false positive:
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
          `container, the page) and that is what should declare it; if not, one of them is reading, not writing.\n` +
          `    OPEN/CLOSE is the common shape here — one island opens a dialog and the dialog closes ` +
          `itself. That is not two producers: the OWNER is whichever island the other sits inside, via ` +
          `nested \`slots\`, and it keeps the key. Where the dialog cannot be nested, the host may put ` +
          `the key back with \`seed(...)\` — that is sanctioned for a produced key (it re-establishes a ` +
          `starting value), unlike \`provide()\`, which the region type refuses for exactly this key`,
      );
    }

    const owned = [...read].filter((k) => provided.has(k) || written.has(k));
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
      report.ok('host-stubs', `stubs cover the ${covered} export(s) the islands reach for`, { n: results.length, of: 'stub(s)' });
    }
  }

  const registryText = existsSync(paths.archipelagosRegistry) ? readFileSync(paths.archipelagosRegistry, 'utf8') : '';
  const archRegistered = [`./${id}/${id}.archipelago`].some(
    (s) => registryText.includes(`${s}'`) || registryText.includes(`${s}.js'`) ||
           registryText.includes(`${s}"`) || registryText.includes(`${s}.js"`),
  );
  if (archRegistered) {
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
  //   2. the region's lagoon frame, i.e. the APPLICATION's own layout component, which is the right
  //      answer under a React host and the one that cannot drift.
  // Genuinely layout-less still means "islands placed individually across the host", and still skips.
  // `root:` — the region declares the APPLICATION's own component, which the lagoon composes from the
  // same `slots` the page uses. The strongest form, and the one with no second copy anywhere.
  if (/^\s*root\s*:/m.test(text)) return true;
  if (/\blayout\s*:/.test(text)) return true;
  const frame = frameModuleFor(id);
  // Declared but unresolvable: assume it HAS an arrangement, so the render check runs and fails loudly
  // if it does not. The opposite default is how this went quiet in the first place.
  if (frame.declared && !frame.module) return true;
  if (frame.module && /\blayout\s*:/.test(readFileSync(frame.module, 'utf8'))) return true;
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
    process.exit(sweepExitCode(results));
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
  // WHERE THE CHANNELS ARE WRITTEN, in both shapes — and this check saw only the older one.
  //
  // It looked exclusively for `export const channels = { <id>: [ … ] }` in `src/lagoon.tsx`, the
  // kind-first override map. Regions have since moved to a per-region module,
  // `<lagoon>/src/regions/<id>.tsx`, holding `overridesFor(archipelago, { channels: [ … ] })` — so on
  // every project in this repository the check found nothing and RETURNED SILENTLY. Not a skip, not a
  // pass: no row at all, for the check that stops hand-written channels. It had been dormant since the
  // authoring shape changed and nothing could have told you, which is the failure mode a silent return
  // always is.
  const perRegion = ['tsx', 'ts']
    .map((ext) => resolve(paths.lagoonDir, 'src/regions', `${id}.${ext}`))
    .find((f) => existsSync(f));
  const overridesFile =
    perRegion ??
    ['src/lagoon.tsx', 'src/lagoon.ts'].map((f) => resolve(paths.lagoonDir, f)).find((f) => existsSync(f));
  if (!overridesFile) {
    report.skip('channel-source', 'no lagoon overrides module — nothing declares channels for this region');
    return;
  }
  const overrides = stripComments(readFileSync(overridesFile, 'utf8'));

  // The per-region module holds ONE region's channels, so the array is unqualified; the shared module
  // keys them by id. Try the qualified form first, since the shared module also contains bare arrays.
  const map = overrides.match(/export const channels[^=]*=\s*\{([\s\S]*?)\n\};/)?.[1];
  const keyed = map?.match(new RegExp(`['"\`]?${id}['"\`]?\\s*:\\s*\\[([\\s\\S]*?)\\n  \\]`))?.[1];
  const bare = overrides.match(/\bchannels:\s*\[([\s\S]*?)\n\s*\],/)?.[1];
  const list = keyed ?? bare;
  if (!list) {
    // SAID, not silent: a region with no channels is a fact worth one dim line, because the alternative
    // is indistinguishable from this check being broken again.
    report.skip('channel-source', `no channels declared for "${id}" in ${paths.rel(overridesFile)}`);
    return;
  }

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
    report.ok('channel-source', 'every channel is built from a declared source', { n: vouched, of: 'channel(s)' });
  }
}

/**
 * DID THE COMPONENT ACTUALLY EMIT? The half no CLI check could reach until now.
 *
 * `wiring-live` fires each declared output itself, and a flow's `emit` goes through the same seam, so
 * both prove the region APPLIES a write and neither can see a component that stopped producing it.
 * Measured on a real region: silencing a component's `onProgress` changed no check at any tier, even
 * though a flow drove that very event. The seam lens shows it — its region sheet has always had a
 * "never moved" column — and the lens is a panel a human opens. Agents read the CLI, so the one signal
 * that catches this was human-only.
 *
 * WHY IT IS NARROW, and must be. Only outputs the component invokes from an EFFECT are checked: those
 * must fire when the island simply renders, so their absence is a fact. An output fired from a click
 * handler legitimately never fires in a render-only pass, and demanding it would flag every
 * well-behaved island in the project. `calledFromEffect` answers "provably effect-driven" and reports
 * anything it cannot prove as not — costing a missed finding rather than a false one.
 *
 * RUNTIME, and the LAST mile: it needs a browser, a mounted region and its effects to have run, so it
 * belongs with the punctual gate that runs when a region is done — never in the fast loop, which has
 * no browser to observe.
 *
 * A WARNING, like every check that arrives after the regions it judges.
 */
function emittedLiveCheck(report, id, renderOutputs) {
  const islands = declaredWrites(id);
  if (!islands.length || !Array.isArray(renderOutputs)) return;

  const generated = readGeneratedContracts(paths.islandsDir);
  const fired = new Set(renderOutputs.map((o) => `${o.slot}\u0000${o.event}`));

  const dead = [];
  let checked = 0;
  for (const island of islands) {
    const tag = island.element;
    const contract = generated[tag];
    if (!contract) continue;
    const { kebab, pascal } = names(String(tag).replace(new RegExp(`^${paths.tagPrefix ?? 'x-'}`), ''));
    const componentFile = islandComponentPath(kebab, pascal);
    const comp = componentFile ? readComponentContract(componentFile, islandComponentExport(kebab, pascal)) : null;
    if (!comp?.output) continue;
    // prop -> event, from the generated contract; prop -> effect-driven, from the component itself.
    const effectProps = new Set(comp.output.filter((o) => o.effectDriven).map((o) => o.prop));
    for (const [prop, event] of Object.entries(contract.output ?? {})) {
      if (!effectProps.has(prop)) continue;
      if (!island.writes?.[event]) continue;
      checked++;
      if (!fired.has(`${island.slot}\u0000${event}`)) dead.push({ slot: island.slot, prop, event });
    }
  }

  if (!checked) return;
  if (!dead.length) {
    report.ok('emitted-live', `${checked} effect-driven output(s) fired while the region rendered`, {
      n: checked,
      of: 'effect-driven output(s)',
    });
    return;
  }
  report.warn(
    'emitted-live',
    `${dead.length}/${checked} declared output(s) never fired while the region rendered: ` +
      `${dead.map((d) => `${d.slot}.${d.prop} (on "${d.event}")`).join(', ')} — the component calls it from an effect, so ` +
      `rendering should produce it. A flow that emits the same event proves only that the region APPLIES the write; ` +
      `this says nothing produced it.`,
  );
}

/**
 * Does the region FIT, and does axe find anything in the composed page.
 *
 * Reported per viewport rather than as one verdict: "the region overflows" is not actionable, and the
 * width it starts at is the whole finding.
 */
async function regionAuditCheck(report, id, port) {
  const viewports = lagoonViewports();
  if (!viewports.length) return;
  // The states the flows establish, deduped — the same list `archipelago snapshot` pictures, so the
  // page is audited in the shapes somebody thought worth driving rather than in one arbitrary one.
  const seen = new Set();
  const states = [];
  for (const f of readScenariosFor(id)) {
    const key = JSON.stringify(f.seed ?? {});
    if (seen.has(key)) continue;
    seen.add(key);
    states.push({ name: f.name ?? 'flow', seed: f.seed ?? {} });
  }
  let out;
  try {
    out = await step('region-audit', () => auditRegionLagoon({ id, port, states, viewports }));
  } catch (err) {
    report[environmentalCause(err) ? 'inconclusive' : 'warn']('region-responsive', `could not audit the region: ${err.message}`);
    return;
  }

  // A LAYOUT CANNOT BE JUDGED ON AN UNSTYLED PAGE. The runtime region lane renders through a mount
  // path that never inserts the island stylesheet, so every box is block-level and nothing ever
  // overflows: this reported "fits every declared viewport" about a page a human had just watched
  // scroll sideways by 197px. A false green is worse than no check, so it says what it could not see.
  if (out.measurements.some((m) => m.styled === false)) {
    report.inconclusive(
      'region-responsive',
      'the region rendered WITHOUT the island stylesheet, so its layout cannot be judged here — ' +
        'every box is block-level and nothing overflows by construction. Look at the published region ' +
        '(`motu lagoon publish --remote`) or `motu archipelago snapshot`, which render it styled.',
    );
    return;
  }
  const over = out.measurements.filter((m) => m.overflow > 1);
  if (!over.length) {
    report.ok('region-responsive', `the composed page fits every declared viewport (${viewports.map((v) => `${v.name} ${v.width}px`).join(', ')})`, {
      n: out.measurements.length,
      of: 'measurement(s)',
    });
  } else {
    // Narrowest first: that is where it starts, and the wider ones are usually the same cause.
    const worst = [...over].sort((a, b) => a.width - b.width);
    report.error(
      'region-responsive',
      `the composed page overflows at ${worst.length}/${out.measurements.length} viewport(s): ` +
        `${worst.map((m) => `${m.viewport} ${m.width}px by ${m.overflow}px${m.scenario !== 'default' ? ` (${m.scenario})` : ''}`).join(', ')} ` +
        `— every island fits on its own; this is the ARRANGEMENT, which no island check can see`,
    );
  }

  const severe = (out.violations ?? []).filter((v) => v.impact === 'critical' || v.impact === 'serious');
  if (!out.violations?.length) {
    report.ok('region-a11y', 'axe finds nothing in the composed page', { n: 1, of: 'axe pass' });
  } else {
    for (const v of severe) report.warn('region-a11y', `${v.impact}: ${v.help} — ${v.target} (${v.nodes} node(s))`);
    if (!severe.length) report.ok('region-a11y', `${out.violations.length} minor axe finding(s), none serious`, { n: out.violations.length, of: 'finding(s)' });
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
function sourcesLiveCheck(report, id, channels, region, held = []) {
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
  // PER SOURCE, and split by whether the keys hold anything — "seeded, or dead?" asked the reader to
  // go and find out, and the two answers call for opposite actions. Seeded means the lagoon writes
  // the answer down: the region renders, every check passes, and the page's own derivation is not
  // exercised until production. Installing the source (a channel over the same fixtures, the way
  // `week` and `networkStats` do it) is what turns a preview into evidence about the app's code.
  const holds = new Set(held);
  const bySource = new Map();
  for (const key of silent) {
    const name = claimed.get(key);
    const entry = bySource.get(name) ?? { keys: [], module: declared[name]?.module };
    entry.keys.push(key);
    bySource.set(name, entry);
  }
  for (const [name, entry] of bySource) {
    const anyHeld = entry.keys.some((k) => holds.has(k));
    const where = entry.module ? ` (${entry.module})` : '';
    if (anyHeld) {
      report.warn(
        'sources-live',
        `source "${name}"${where} is SEEDED here, not installed: ${entry.keys.join(', ')} ` +
          `${entry.keys.length > 1 ? 'hold values' : 'holds a value'} no channel produced. The region renders and ` +
          `the page's own derivation is never exercised — ` +
          `install the source with \`channelFrom({ to, id: '${name}', args: [...] })\` and drop them from the seed. ` +
          // THE CALL IS NOT THE DESIGN. This line used to end at the channelFrom signature, which
          // tells you what to type and nothing about what to build — and the thing to build is the
          // source, not the channel. Whoever reads this is usually mid-migration and has never
          // written one.
          `That means extracting a SOURCE: a port the page and the lagoon fill differently, a factory ` +
          `holding the state with subscribe/getState, and \`intents\` for what islands ask the host. ` +
          `See docs/05-archipelagos-and-regions.md "Writing a source"`,
      );
    } else {
      report.warn(
        'sources-live',
        `source "${name}"${where} produced nothing and its keys hold nothing: ${entry.keys.join(', ')} — ` +
          `declared, and fed by neither a channel nor the seed`,
      );
    }
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
    if (module) out[name] = { module, produces: [], byReference: true, reaches: reachesOfSourceModule(module, paths.archipelagoFile(id)) };
  }
  // A source declared by module NAME: no channel installs it, the page fetches it itself.
  for (const m of block.matchAll(/(\w+):\s*\{([\s\S]*?)\}/g)) {
    const module = m[2].match(/module:\s*'([^']+)'/)?.[1];
    const produces = [...(m[2].match(/produces:\s*\[([^\]]*)\]/)?.[1] ?? '').matchAll(/'([^']+)'/g)].map((x) => x[1]);
    const reaches = readEffectEntries(m[2].match(/reaches:\s*\[([\s\S]*?)\]/)?.[1] ?? '');
    if (module) out[m[1]] = { module, produces, reaches };
  }
  return out;
}

/**
 * A by-reference source's `reaches`, read from the SOURCE MODULE.
 *
 * `shots: shotsSource` puts the declaration in the app's own file, beside `produces` — one place that
 * says what this source hands over and what it touches. The archipelago cannot see either; the
 * compiler checks `produces`, and this reads `reaches` the same way `declaredSources` reads a module
 * specifier: from the one place it is written.
 */
function reachesOfSourceModule(module, fromFile) {
  try {
    // `resolveAppImport` takes the importing file (a relative specifier needs it) and returns the path
    // WITHOUT an extension, so the candidates have to be tried here.
    const base = resolveAppImport(fromFile, module);
    const file = base && ['.ts', '.tsx', '/index.ts', ''].map((e) => `${base}${e}`).find((f) => existsSync(f));
    if (!file) return [];
    const text = stripComments(readFileSync(file, 'utf8'));
    return readEffectEntries(text.match(/reaches:\s*\[([\s\S]*?)\]/)?.[1] ?? '');
  } catch {
    return [];
  }
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

  // Is what the lagoon draws the page's own code, or a second copy of it?
  frameIsPageCheck(report, id, region);

  // The other half of what a source is worth: a flow drives it through the screen, and the branches
  // no screen tells apart need a test that drives it directly.

  // Static, so an uncovered slot shows up in the fast loop rather than behind a browser.
  renderCoverageCheck(report, id);
  writesCoveredCheck(report, id);

  // Membership as data: static, so it runs whether or not a browser was asked for.
  if (region?.membership === 'catalogue') await catalogueCheck(report, id, region);

  // Region styling: until islands own their CSS, the shared sheet is the region's stylesheet — lint it.
  if (existsSync(paths.sharedStyles)) {
    cssChecks(report, readFileSync(paths.sharedStyles, 'utf8'), paths.rel(paths.sharedStyles));
  }

  // Same line as the islands: static by default, browser on request (see runIslandVerify).
  if ((argv.runtime === true || argv.audit === true) && argv.fast) {
    // `--fast` means NO BROWSER, and a region's runtime checks are browser-only: flows, mutation and
    // the region render all drive the lagoon. Running them anyway made `--fast` an island-only flag
    // whose regions still booted chromium — 43s of an 87s run, most of what was left after the islands
    // got cheaper. Skipped, and SAID, because a flag that quietly does half of what it claims is worse
    // than one that costs more.
    report.skip(
      'region-runtime',
      'flows, mutation and the region render need a browser — re-run without --fast before handing over',
    );
  } else if (argv.runtime === true || argv.audit === true) {
    // FIRST, before anything that drives the mountpoints view. The lane reuses one page and a warm
    // re-aim keeps whatever view it already had, so running this after the wiring probe measured a
    // DIAGNOSTIC layout and reported a page that overflows by 197px as fitting every viewport. The
    // trap this file already documents, walked into by the check that needed the region view most.
    if (hasLayout && argv.audit === true) await regionAuditCheck(report, id, 5300 + Math.floor(Math.random() * 400));
    if (hasLayout) await wiringProbe(report, id, 5300 + Math.floor(Math.random() * 400));
    // THE COMPOSED PAGE, at each declared viewport. Island `responsive` mounts each island alone, so
    // every one of them fits and the arrangement still overflows — a fixed-rail grid fits nothing on
    // a phone and no island in it is at fault. Only under `--audit`, beside the island checks whose
    // answer changes when the RENDERING changes rather than when a key moves.
    // One call, both questions: do the flows hold, and could they have failed.
    if (hasLayout) await regionFlowCheck(report, id, 5300 + Math.floor(Math.random() * 400), region);
    if (!hasLayout) {
      // NAME WHERE THE ARRANGEMENT WAS LOOKED FOR. The old wording ("islands are placed individually
      // across the host") describes the PAGE, and was read as a claim about the lagoon frame — so an
      // author who had just written a `layout` saw motu deny it and had no idea which of the three
      // places it looks at came up empty.
      report.warn(
        'lagoon-render',
        'no arrangement for this region, so the composed render was skipped. Looked for: `root:` or ' +
          `\`layout:\` on ${paths.rel(paths.archipelagoFile(id))}, and a \`layout\` for '${id}' in the ` +
          'lagoon overrides (`regions` or the kind-first `layout` map). Without one the islands are ' +
          'only ever placed individually by the host, and the arrangement is not checked anywhere',
      );
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
        reportRuntimeDiagnostics(report, r, 'region', declaredReach({ regionId: id }));

        // THE PAGE ITSELF — the only check here that renders the application rather than the region.
        // Reuses the same pooled page: the whole runtime lane is one browser re-aimed per check, and
        // a second boot for this would double the cost of a region's run for one navigation.
        const pr = await step('page-render', () => pageRenderLagoon({ id, port }));
        if (!pr.declared) {
          report.ok('page-render', `no \`page\` declared for '${id}' — the application's own page is not checked`, {
            n: 0,
            of: 'page(s)',
          });
        } else if (pr.crashed) {
          report.error(
            'page-render',
            `the application's own page threw while rendering:\n      ${pr.crashed.split('\n').slice(0, 6).join('\n      ')}`,
          );
        } else {
          const declaredRegion2 = readRegions(paths.archipelagosDir).find((x) => x.id === id);
          const declared2 =
            declaredRegion2?.membership === 'catalogue'
              ? []
              : (declaredRegion2?.islands ?? []).filter((i) => !i.planned).map((i) => i.slot);
          const reached = new Set(pr.slots.filter((x) => x.len > 0).map((x) => x.slot));
          // DEDUPED, because a slot name appears both in the root's mapping and in the island entry,
          // so the raw list said "1/4" and named `login-form` twice for a region with two slots.
          const slots2 = [...new Set(declared2)];
          // AND A CONDITIONAL SLOT IS NOT A MISS. The region declares its own either/or with
          // `when`/`unless`; a slot the page did not take because the region says it is an alternative
          // is the page behaving, not a finding.
          const conditional = conditionalSlots(paths.archipelagoFile(id));
          const missing = slots2.filter((slot) => !reached.has(slot) && !conditional.has(slot));
          if (!reached.size) {
            // NOTHING AT ALL. The page mounted and reached no declared slot, so whatever it drew, it
            // was not this region. That is a failure however the page is written.
            report.error(
              'page-render',
              `the page renders and reaches NONE of its ${slots2.length} declared slot(s) — it mounted ` +
                `without throwing and drew none of the region. Open ?region=${id}&view=page to see what ` +
                `it did instead`,
            );
          } else if (missing.length) {
            // A WARNING, LIKE `lagoon-render`'s, AND FOR THE SAME REASON. A slot the page did not reach
            // is sometimes exactly right: two slots can be ALTERNATIVES — peps' login passes the error
            // banner or the form and never both — and no check can tell a deliberate either/or from an
            // accidentally unreachable branch. What is not right is not knowing, so it is named.
            //
            // It was an error for one run, which made a correctly-written exclusive region red. An
            // error nobody can act on is how a check teaches people to ignore it.
            report.warn(
              'page-render',
              `the page renders and reaches ${reached.size}/${slots2.length} declared slot(s); not ` +
                `reached: ${missing.join(', ')} — either an alternative the page deliberately did not ` +
                `take (an error banner instead of a form), or a branch that never runs. Open ` +
                `?region=${id}&view=page and confirm which`,
            );
          } else {
            report.ok('page-render', `the application's own page renders and reaches all ${slots2.length} slot(s)`, {
              n: slots2.length,
              of: 'slot(s) reached by the page',
            });
          }
        }
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
