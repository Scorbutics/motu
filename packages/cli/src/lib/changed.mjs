// Which islands and regions did this branch actually touch?
//
// The per-island cost of `--runtime` is roughly constant, so a project pays it once per island: at
// sixteen islands a full run is a hundred seconds, and an agent that changed one file pays for the
// other fifteen. That is the difference between a check an agent runs and one it learns to skip.
//
// THE RULE THIS FOLLOWS: narrowing must never be silent. A change this cannot attribute to an island
// or a region — the shared module, the lagoon frame, the config, the framework itself — widens the run
// back to everything and says why. A check that quietly examined less than you think is the failure
// this whole report exists to avoid, and "fast because it skipped your change" is the worst version.
import { execFileSync } from 'node:child_process';
import { relative, resolve, sep } from 'node:path';
import { islandComponentPath, names, paths, REPO_ROOT } from './util.mjs';
import { listIslands } from './islands.mjs';
import { readRegions } from './eject.mjs';

/** Files this working tree has touched, relative to `base` (default: everything not yet committed). */
function changedFiles(base) {
  const git = (args) => execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  const out = new Set();
  try {
    // Uncommitted work, staged and not, plus untracked files: what an agent has in front of it.
    for (const f of git(['diff', '--name-only', 'HEAD']).split('\n')) if (f) out.add(f);
    for (const f of git(['ls-files', '--others', '--exclude-standard']).split('\n')) if (f) out.add(f);
    // And, when asked, everything since a branch point.
    if (base) for (const f of git(['diff', '--name-only', `${base}...HEAD`]).split('\n')) if (f) out.add(f);
  } catch {
    return null; // not a git repo, or git unavailable — cannot scope, so do not pretend to
  }
  return [...out].map((f) => resolve(gitRoot(), f));
}

function gitRoot() {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  } catch {
    return REPO_ROOT;
  }
}

const under = (dir, file) => {
  const rel = relative(dir, file);
  return rel && !rel.startsWith('..') && !rel.startsWith(sep) ? rel : null;
};

/**
 * Split the touched files into the islands and regions they belong to.
 *
 * Returns `{ scoped: false, reason }` when something changed that cannot be attributed — the caller
 * then runs everything, which is the safe direction to be wrong in.
 */
/**
 * Files that cannot change what an island renders, whatever else they change.
 *
 * NARROWING MUST NEVER BE SILENT — that rule is why anything unattributable widens the run, and it is
 * right. But it made the most common edit in an agent's tree the most expensive: `.claude/
 * settings.local.json` changes every time a permission is granted, belongs to no island, and forced a
 * hundred-second sweep to prove something about a file the lagoon never loads. Editor and CI
 * configuration is not a silent narrowing; it is a file that provably cannot reach a render.
 *
 * Deliberately short, and deliberately NOT including lockfiles: a dependency version absolutely can
 * change what renders. If a pattern here is ever wrong, the run gets narrower than the truth, so the
 * bar for adding one is "there is no path from this file to a rendered pixel".
 */
const CANNOT_AFFECT_A_RENDER = [
  /(^|\/)\.claude\//,
  /(^|\/)\.vscode\//,
  /(^|\/)\.idea\//,
  /(^|\/)\.github\//,
  /\.md$/,
];

export function changedScope(base) {
  const files = changedFiles(base);
  if (!files) return { scoped: false, reason: 'not a git repository, so nothing can be attributed' };
  if (!files.length) return { scoped: true, islands: [], regions: [], files: 0 };

  const islands = new Set();
  const regions = new Set();
  const unattributed = [];

  // AN ISLAND'S COMPONENT MAY NOT LIVE UNDER motu AT ALL. On a React host the island wraps a component
  // the application already owns — acme's `src/ui` is empty and every component sits in the app — so
  // mapping by directory alone would attribute the most common edit to nothing and widen every run
  // back to the whole project. Follow each island to the file it actually mounts.
  const byComponent = new Map();
  for (const i of listIslands(paths.islandsDir)) {
    try {
      const componentPath = islandComponentPath(i.kebab, names(i.kebab).pascal);
      if (componentPath) byComponent.set(componentPath, i.kebab);
    } catch {
      // An island whose component cannot be resolved is one this cannot scope; leave it to widen.
    }
  }

  for (const file of files) {
    if (CANNOT_AFFECT_A_RENDER.some((re) => re.test(file))) continue;
    const inIslands = under(paths.islandsDir, file);
    const inUi = under(paths.uiRoot, file);
    const inRegions = under(paths.archipelagosDir, file);

    if (inRegions) {
      const id = inRegions.split(sep)[0];
      if (id && !id.endsWith('.ts')) regions.add(id);
      else unattributed.push(file); // the registry itself, or a loose file — affects every region
      continue;
    }
    if (inIslands) {
      // `<kebab>.island.ts`, `<kebab>.evidence.ts` or `<kebab>/…`; the generated registry is nobody's.
      const head = inIslands.split(sep)[0];
      const kebab = head.replace(/\.(island|evidence)\.tsx?$/, '').replace(/\.tsx?$/, '');
      if (head.startsWith('registry.') || head.startsWith('contracts.')) continue; // generated
      if (kebab) islands.add(kebab);
      else unattributed.push(file);
      continue;
    }
    if (inUi) {
      const dir = inUi.split(sep)[0];
      if (dir) islands.add(dir);
      else unattributed.push(file);
      continue;
    }
    const owner = byComponent.get(file);
    if (owner) {
      islands.add(owner);
      continue;
    }
    // THE LAGOON'S PER-REGION MODULE belongs to that region and to no other: `regions/<id>.tsx` holds
    // one region's seed and one region's arrangement. The map that wires them all together
    // (`lagoon.tsx`) is a different file and still widens, as it should.
    const inLagoonRegions = under(resolve(paths.lagoonDir, 'src/regions'), file);
    if (inLagoonRegions && !inLagoonRegions.includes(sep)) {
      regions.add(inLagoonRegions.replace(/\.tsx?$/, ''));
      continue;
    }
    unattributed.push(file);
  }

  if (unattributed.length) {
    return {
      scoped: false,
      reason:
        `${unattributed.length} changed file(s) belong to no single island or region ` +
        `(e.g. ${relative(gitRoot(), unattributed[0])})`,
    };
  }
  // A CHANGED ISLAND BELONGS TO SPECIFIC REGIONS, not to all of them. Running every region because one
  // island moved cost more than running every island: a region check is ~20s, an island ~3s.
  for (const region of readRegions(paths.archipelagosDir)) {
    const tags = new Set((region.islands ?? []).map((i) => i.element));
    for (const kebab of islands) {
      if (tags.has(names(kebab).tag)) regions.add(region.id);
    }
  }

  return { scoped: true, islands: [...islands], regions: [...regions], files: files.length };
}
