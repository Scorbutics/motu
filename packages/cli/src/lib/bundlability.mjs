// CAN THIS ISLAND BE BUNDLED FOR A BROWSER, and if not, which module stopped it?
//
// Two callers, one answer. `motu island verify` asks it to REPORT (`rsc-boundary`), and the lagoon
// build asks it to DECIDE — because an island whose import graph cannot be bundled does not merely
// fail its own preview, it fails the whole build.
//
// WHY THE SECOND CALLER EXISTS. Measured on a cold adoption of Formbricks: a SAML button statically
// imports a Next server action, which reaches `node:async_hooks` five hops down. The lagoon builds
// every archipelago as ONE chunk, so that single island took the entire gallery with it — rollup died
// 11,000 modules deep, no island in the project was previewable, and the agent that hit it ended with
// a fully green `motu check --runtime` and not one openable URL. Green checks and nothing to look at
// is the worst possible state for a tool whose promise is "every declared state has an address".
//
// The island's own verdict does not change: it still fails `rsc-boundary`, and its own preview is
// still broken. What changes is the BLAST RADIUS.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { blankComments, names, paths, resolveAppImport, HOST, islandComponentPath } from './util.mjs';
import { listIslands } from './islands.mjs';

/** Adapters that ship a verify contribution, by the specifier an island imports / by host. */
const ADAPTER_VERIFY = { '@motu/adapter-next': '@motu/adapter-next/verify' };
const HOST_ADAPTER_VERIFY = { next: '@motu/adapter-next/verify' };

/**
 * Every APPLICATION file an island's component can reach, breadth-first from the component.
 *
 * A host boundary is a property of the BUNDLE, not of one file. Judging it from the island's own
 * source alone is how `rsc-boundary` printed `✓` over a component that could not be built.
 *
 * Bounded on purpose — package specifiers are not followed, and the file count is capped so a check
 * that runs per island stays cheap. The cap being HIT is reported, because a check that quietly
 * examined part of a graph is the bug this closes.
 */
export function reachableAppSources(entry, { aliased = [], limit = 400 } = {}) {
  const isAliased = (spec) => aliased.some((a) => spec === a || spec.startsWith(a + '/'));
  const seen = new Set();
  const out = [];
  const queue = [entry];
  let truncated = false;
  while (queue.length) {
    const file = queue.shift();
    const found = ['', '.tsx', '.ts', '/index.tsx', '/index.ts']
      .map((e) => file + e)
      .find((c) => existsSync(c) && statSync(c).isFile());
    if (!found || seen.has(found)) continue;
    seen.add(found);
    if (out.length >= limit) {
      truncated = true;
      break;
    }
    let src;
    try {
      src = readFileSync(found, 'utf8');
    } catch {
      continue;
    }
    if (found !== entry) out.push({ file: paths.rel(found), source: src });
    for (const m of blankComments(src).matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)) {
      if (isAliased(m[1])) continue;
      const next = resolveAppImport(found, m[1]);
      if (next) queue.push(next);
    }
  }
  if (truncated) out.push({ file: '(truncated)', source: '', truncated: true });
  return out;
}

/** The adapter verify module for one island, or null when no adapter judges this host. */
function adapterFor(elementPath) {
  if (!existsSync(elementPath)) return null;
  const text = readFileSync(elementPath, 'utf8');
  const pkgs = [...text.matchAll(/from\s+['"](@motu\/adapter-[\w-]+)['"]/g)].map((m) => m[1]);
  return pkgs.map((p) => ADAPTER_VERIFY[p]).find(Boolean) ?? HOST_ADAPTER_VERIFY[HOST] ?? null;
}

/**
 * Islands that CANNOT be bundled, as `{ kebab, tag, element, componentPath, reason }`.
 *
 * Only an ERROR-level `rsc-boundary` finding counts. A warning is a note about how something renders;
 * this list decides whether a module is put into the build at all, so it takes only the level that
 * means "this cannot work", and errs toward including an island when it cannot tell.
 */
export async function unbundlableIslands({ aliased = [] } = {}) {
  const out = [];
  for (const island of listIslands(paths.islandsDir)) {
    const specifier = adapterFor(island.element);
    if (!specifier) continue;
    // `islandComponentPath(kebab, PASCAL)` — the pascal name, which is what every other caller passes.
    // Handing it the EXPORTED name instead returned nothing, so the detector found no islands at all
    // and excluded nothing, silently. Caught only because the build then behaved identically with the
    // feature on and off.
    const { pascal } = names(island.kebab);
    const componentPath = islandComponentPath(island.kebab, pascal);
    if (!componentPath || !existsSync(componentPath)) continue;
    let mod;
    try {
      mod = await import(specifier);
    } catch {
      continue; // no adapter available: not our place to exclude anything
    }
    let findings = [];
    try {
      findings = mod.checkCoupling({
        source: readFileSync(componentPath, 'utf8'),
        elementSource: readFileSync(island.element, 'utf8'),
        graph: reachableAppSources(componentPath, { aliased }),
      });
    } catch {
      continue;
    }
    const fatal = findings.filter((f) => f.level === 'error' && f.check === 'rsc-boundary');
    if (!fatal.length) continue;
    const tag = readFileSync(island.element, 'utf8').match(/tag:\s*['"]([^'"]+)['"]/)?.[1];
    out.push({
      kebab: island.kebab,
      tag: tag ?? null,
      element: island.element,
      componentPath,
      reason: fatal[0].msg,
    });
  }
  return out;
}
