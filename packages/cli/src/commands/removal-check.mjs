// `motu removal-check` — prove that removing motu from the host application is a NO-OP.
//
// C2: motu may appear in app code, but it must never be load-bearing. Delete the framework and the app
// must still compile and render. Two allowed shapes:
//
//   1. a file that is 100% motu (a composition root, a dev page) — deletable whole;
//   2. a wrapper whose deletion leaves valid JSX — strip the import, unwrap the element, and the page
//      still renders its own components with the props it already computes.
//
// This performs exactly that surgery and runs the HOST's own typecheck on the result. Everything is
// backed up first and restored in a finally block: the check must never be able to leave a repo
// half-stripped, including when the typecheck itself throws.
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, cpSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { relative, resolve, dirname } from 'node:path';
import { Project, SyntaxKind } from 'ts-morph';
import { paths, color } from '../lib/util.mjs';
import { loadMotuConfig } from '../lib/config.mjs';
import { listIslands } from '../lib/islands.mjs';
import { ejectFile, readOutputs, readRegions } from '../lib/eject.mjs';

/** Specifiers that only exist because motu does. */
const MOTU_SPECIFIER = /^@motu\/|^motu-islands(\/|$)/;

/**
 * Which JSX tags in THIS file disappear with motu.
 *
 * Not a fixed list. A project legitimately has its own thin composition root — a client component that
 * configures the transport, builds the host bridge and renders `<Archipelago>` — and that file is 100%
 * motu, so it gets deleted. Any tag imported FROM a deleted file must therefore be unwrapped too, or
 * removing motu leaves a dangling element referring to a file that is gone.
 *
 * So: a tag is unwrappable when it was imported from a motu specifier, or from a file that is itself
 * motu-only. Unwrapping keeps the children — that is the whole C2 property.
 */
function unwrappableTags(sf, isMotuSpec, motuOnly, resolveSpec) {
  const names = new Set();
  for (const imp of sf.getImportDeclarations()) {
    const spec = imp.getModuleSpecifierValue();
    const target = resolveSpec(sf, spec);
    if (!isMotuSpec(spec) && !(target && motuOnly.has(target))) continue;
    for (const named of imp.getNamedImports()) names.add(named.getNameNode().getText());
    const def = imp.getDefaultImport();
    if (def) names.add(def.getText());
  }
  return names;
}

/** Framework/runtime imports a composition root legitimately needs; they say nothing about ownership. */
const INFRA = /^react$|^react-dom|^next\//;

/**
 * Which files exist ONLY because motu does — computed to a fixpoint.
 *
 * Two things the first version got wrong, both found by running it:
 *   1. An import can reach motu WITHOUT a motu specifier: peps' composition root imports
 *      `@/motu/src/services`, an app-alias path INTO the motu project directory. Anything importing
 *      from that directory is motu's.
 *   2. It is TRANSITIVE. The dev page's only import is the composition root — no motu specifier at
 *      all — so deleting the root strands it. A file whose imports are all motu-only is motu-only.
 */
function motuOnlySet(project, hostRoot, motuDir) {
  const insideMotu = new RegExp(`(^|/)${motuDir}/`);
  const isMotuSpec = (spec) => MOTU_SPECIFIER.test(spec) || insideMotu.test(spec);
  const resolveSpec = (sf, spec) => {
    const base = spec.startsWith('@/') ? resolve(hostRoot, spec.slice(2)) : spec.startsWith('.') ? resolve(dirname(sf.getFilePath()), spec) : null;
    if (!base) return null;
    for (const ext of ['.tsx', '.ts', '/index.tsx', '/index.ts', '']) {
      const f = project.getSourceFile(base + ext);
      if (f) return f.getFilePath();
    }
    return null;
  };

  const set = new Set();
  for (let changed = true; changed; ) {
    changed = false;
    for (const sf of project.getSourceFiles()) {
      const p = sf.getFilePath();
      if (set.has(p)) continue;
      const imports = sf.getImportDeclarations().map((i) => i.getModuleSpecifierValue());
      if (!imports.length) continue;
      const meaningful = imports.filter((spec) => !INFRA.test(spec));
      if (!meaningful.length) continue;
      const allMotu = meaningful.every((spec) => {
        if (isMotuSpec(spec)) return true;
        const target = resolveSpec(sf, spec);
        return target ? set.has(target) : false;
      });
      // At least one import must actually be motu's, or a file importing nothing but a deleted file
      // would qualify for the wrong reason.
      if (allMotu && meaningful.some((spec) => isMotuSpec(spec) || set.has(resolveSpec(sf, spec) ?? ''))) {
        set.add(p);
        changed = true;
      }
    }
  }
  return { set, isMotuSpec, resolveSpec };
}

export function removalCheckCommand(argv) {
  const cfg = loadMotuConfig();
  const hostRoot = cfg.hostRoot;
  const backupDir = resolve(cfg.cacheDir, 'removal-check');

  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: true,
    compilerOptions: { allowJs: true, jsx: 4 },
  });
  // The app's own sources — never motu's own tree, which is what is being removed.
  project.addSourceFilesAtPaths([
    `${hostRoot}/app/**/*.{ts,tsx}`,
    `${hostRoot}/components/**/*.{ts,tsx}`,
    `${hostRoot}/lib/**/*.{ts,tsx}`,
    `!${cfg.root}/**`,
  ]);

  const motuDir = relative(hostRoot, cfg.root) || 'motu';
  const { set: motuOnly, isMotuSpec, resolveSpec } = motuOnlySet(project, hostRoot, motuDir);

  // The wiring the archipelagos hold, read from their configs and the islands' declared outputs.
  const regions = readRegions(paths.archipelagosDir);
  const outputs = readOutputs(listIslands(paths.islandsDir).map((i) => i.element));

  const deleted = [];
  const stripped = [];
  const touched = [];
  const ejected = [];

  for (const sf of project.getSourceFiles()) {
    const p = sf.getFilePath();
    if (motuOnly.has(p)) {
      touched.push(p);
      deleted.push(p);
      continue;
    }
    const tags = unwrappableTags(sf, isMotuSpec, motuOnly, resolveSpec);
    if (!tags.size && !sf.getImportDeclarations().some((i) => isMotuSpec(i.getModuleSpecifierValue()))) continue;
    touched.push(p);
    // EJECT FIRST, while `<Island slot="…">` is still there to say which element produces what: region
    // reads and seeds become plain state, and the producer's output prop is wired to its setters.
    const notes = ejectFile(sf, regions, outputs);
    if (notes.length) ejected.push([p, notes]);
    // Form 2: unwrap motu's JSX, keep the children, drop the imports.
    for (const el of [...sf.getDescendantsOfKind(SyntaxKind.JsxElement)].reverse()) {
      const name = el.getOpeningElement().getTagNameNode().getText();
      if (!tags.has(name)) continue;
      const inner = el.getJsxChildren().map((c) => c.getText()).join('').trim();
      el.replaceWithText(inner.startsWith('<') || inner.startsWith('{') ? inner : `<>${inner}</>`);
    }
    for (const el of [...sf.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement)].reverse()) {
      if (tags.has(el.getTagNameNode().getText())) el.replaceWithText('null');
    }
    for (const imp of sf.getImportDeclarations()) {
      const spec = imp.getModuleSpecifierValue();
      const target = resolveSpec(sf, spec);
      if (isMotuSpec(spec) || (target && motuOnly.has(target))) imp.remove();
    }
    stripped.push(p);
  }

  if (!touched.length) {
    console.log(color.green('✓ removal-check') + color.dim('  no motu references in the host application'));
    process.exit(0);
  }

  // --- apply, typecheck, ALWAYS restore -----------------------------------------------------------
  rmSync(backupDir, { recursive: true, force: true });
  mkdirSync(backupDir, { recursive: true });
  const backup = (p) => {
    const dest = resolve(backupDir, relative(hostRoot, p));
    mkdirSync(dirname(dest), { recursive: true });
    cpSync(p, dest);
  };
  let result;
  try {
    for (const p of [...deleted, ...stripped]) backup(p);
    for (const p of deleted) rmSync(p);
    for (const p of stripped) writeFileSync(p, project.getSourceFile(p).getFullText());

    const tsconfig = existsSync(resolve(hostRoot, 'tsconfig.json')) ? 'tsconfig.json' : null;
    result = spawnSync('npx', ['tsc', '--noEmit', ...(tsconfig ? ['-p', tsconfig] : [])], {
      cwd: hostRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } finally {
    for (const p of [...deleted, ...stripped]) {
      const src = resolve(backupDir, relative(hostRoot, p));
      if (existsSync(src)) cpSync(src, p);
    }
  }

  console.log(color.bold('\nmotu removal-check — is motu removable from the host application?\n'));
  for (const p of deleted) console.log(`  ${color.dim('delete ')} ${relative(hostRoot, p)} ${color.dim('(100% motu)')}`);
  for (const p of stripped) console.log(`  ${color.dim('unwrap ')} ${relative(hostRoot, p)}`);
  for (const [p, notes] of ejected) {
    console.log(`  ${color.dim('eject  ')} ${relative(hostRoot, p)}`);
    for (const n of notes) console.log(`           ${color.dim(n)}`);
  }
  console.log('');

  const out = ((result?.stdout ?? '') + (result?.stderr ?? '')).trim();

  // Deleting a route leaves the framework's GENERATED route types pointing at it until the next build.
  // Those are build artifacts, not application code, so they are not evidence that motu is
  // load-bearing — but they are reported rather than dropped, because a check that silently discards
  // errors is how a green result stops meaning anything.
  const lines = out ? out.split('\n') : [];
  const generated = lines.filter((l) => /^\.?next[\/\\]|^\.next[\/\\]/.test(l.trim()));
  const real = lines.filter((l) => l.trim() && !generated.includes(l));

  if (result?.status === 0 || real.length === 0) {
    console.log(color.green(color.bold('PASS')) + color.dim('  the host typechecks with motu removed'));
    if (generated.length) {
      console.log(color.dim(`  (${generated.length} stale generated route-type error(s) ignored — build artifacts of the deleted route)`));
    }
    process.exit(0);
  }
  console.log(color.red(color.bold('FAIL')) + '  the host does NOT compile without motu:');
  console.log(real.slice(0, 15).join('\n'));
  console.log(color.dim('\n  motu is load-bearing in the app. Either the file is 100% motu (deletable whole),'));
  console.log(color.dim('  or the wrapper must leave valid JSX behind when removed (C2).'));
  process.exit(1);
}
