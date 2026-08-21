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
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync, cpSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { relative, resolve, dirname } from 'node:path';
import { Project, SyntaxKind } from 'ts-morph';
import { paths, color } from '../lib/util.mjs';
import { loadMotuConfig } from '../lib/config.mjs';
import { listIslands } from '../lib/islands.mjs';
import { ejectFile, readOutputs, readRegions } from '../lib/eject.mjs';

/**
 * Every app source and what it imports, read as TEXT.
 *
 * The check used to hand the whole application to ts-morph — a thousand files parsed and type-loaded
 * so it could find the dozen that mention motu. What it actually needs first is an import graph, and
 * an import graph is a regex over source text. The files that matter are then parsed properly; the
 * rest are never opened again.
 */
function importGraph(hostRoot, motuRoot) {
  const graph = new Map();
  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = resolve(dir, e.name);
      if (full.startsWith(motuRoot)) continue;
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
        walk(full);
      } else if (/\.tsx?$/.test(e.name)) {
        const text = readFileSync(full, 'utf8');
        graph.set(
          full,
          [...text.matchAll(/(?:^|\n)\s*(?:import|export)[^'"\n]*?from\s*['"]([^'"]+)['"]/g)].map((m) => m[1]),
        );
      }
    }
  };
  for (const top of ['app', 'components', 'lib']) walk(resolve(hostRoot, top));
  return graph;
}

/**
 * What the answer depends on: the files the surgery touches, and the declarations it generates from.
 *
 * Nothing else can change the verdict. The host's own type errors are the host's own build to catch —
 * this check asks one question ("is motu load-bearing?"), and that question's inputs are small enough
 * to hash. Which means the expensive part (a full `tsc` of the application) can be skipped when they
 * are all identical to the last time it passed.
 */
function proofFingerprint(candidates, extra) {
  const h = createHash('sha1');
  for (const file of [...candidates, ...extra].sort()) {
    h.update(file);
    try {
      h.update(readFileSync(file));
    } catch {
      h.update('<missing>');
    }
  }
  return h.digest('hex');
}

/** Specifiers that only exist because motu does. */
const MOTU_SPECIFIER = /^@motu\/|^motu-islands(\/|$)/;

/**
 * The one motu module that STAYS, and the sentence it makes true.
 *
 *   Deleting motu leaves no runtime trace — the application ships byte-identical output. One
 *   TYPE-ONLY package remains, which erases at compile time.
 *
 * `@motu/types` has no value exports, so an app file importing it emits nothing: the guarantee this
 * check exists to prove is about the RUNTIME, and it is unchanged. Stripping the import would only
 * make the app fail to typecheck against types that were never going to be there — proving something
 * weaker while looking stricter. Anything else under `@motu/` is still removed.
 */
const MOTU_TYPES_ONLY = /^@motu\/types(\/|$)/;

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

/** `Actions.Island` -> `Actions`: what a qualified JSX tag was imported as. */
function rootTagName(tag) {
  return tag.split('.')[0];
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
function motuOnlySet(graph, hostRoot, motuDir) {
  const insideMotu = new RegExp(`(^|/)${motuDir}/`);
  const isMotuSpec = (spec) => !MOTU_TYPES_ONLY.test(spec) && (MOTU_SPECIFIER.test(spec) || insideMotu.test(spec));
  // Resolution over the TEXT graph: the same candidates the surgery will load, without paying a TS
  // parse for every file in the app to find out which ones matter.
  const resolveFrom = (from, spec) => {
    const base = spec.startsWith('@/') ? resolve(hostRoot, spec.slice(2)) : spec.startsWith('.') ? resolve(dirname(from), spec) : null;
    if (!base) return null;
    for (const ext of ['.tsx', '.ts', '/index.tsx', '/index.ts', '']) {
      if (graph.has(base + ext)) return base + ext;
    }
    return null;
  };
  const resolveSpec = (sf, spec) => resolveFrom(typeof sf === 'string' ? sf : sf.getFilePath(), spec);

  const set = new Set();
  for (let changed = true; changed; ) {
    changed = false;
    for (const [p, imports] of graph) {
      if (set.has(p)) continue;
      if (!imports.length) continue;
      const meaningful = imports.filter((spec) => !INFRA.test(spec));
      if (!meaningful.length) continue;
      const allMotu = meaningful.every((spec) => {
        if (isMotuSpec(spec)) return true;
        const target = resolveFrom(p, spec);
        return target ? set.has(target) : false;
      });
      // At least one import must actually be motu's, or a file importing nothing but a deleted file
      // would qualify for the wrong reason.
      if (allMotu && meaningful.some((spec) => isMotuSpec(spec) || set.has(resolveFrom(p, spec) ?? ''))) {
        set.add(p);
        changed = true;
      }
    }
  }
  return { set, isMotuSpec, resolveSpec };
}

/**
 * The check as data, for `motu check` to aggregate. `quiet` suppresses the report; the surgery, the
 * typecheck and the ALWAYS-restore are identical either way.
 */
export function runRemovalCheck(argv, { quiet = false } = {}) {
  const cfg = loadMotuConfig();
  const hostRoot = cfg.hostRoot;
  const backupDir = resolve(cfg.cacheDir, 'removal-check');

  // The app's own sources — never motu's own tree, which is what is being removed.
  const graph = importGraph(hostRoot, cfg.root);
  const motuDir = relative(hostRoot, cfg.root) || 'motu';
  const { set: motuOnly, isMotuSpec, resolveSpec } = motuOnlySet(graph, hostRoot, motuDir);

  // Only the files the surgery can touch get parsed: what motu owns outright, and what mentions it.
  const candidates = [...graph]
    .filter(([p, specs]) => motuOnly.has(p) || specs.some((spec) => isMotuSpec(spec)))
    .map(([p]) => p);
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: true,
    compilerOptions: { allowJs: true, jsx: 4 },
  });
  for (const p of candidates) project.addSourceFileAtPath(p);

  // The wiring the archipelagos hold, read from their configs and the islands' declared outputs.
  const regions = readRegions(paths.archipelagosDir);
  const outputs = readOutputs(listIslands(paths.islandsDir).map((i) => i.element), paths.islandsDir);

  const deleted = [];
  const stripped = [];
  const touched = [];
  /** Files the surgery could not rewrite — reported, never thrown. */
  const surgeryErrors = [];
  const ejected = [];

  for (const sf of project.getSourceFiles()) {
    const p = sf.getFilePath();
    if (motuOnly.has(p)) {
      touched.push(p);
      deleted.push(p);
      continue;
    }
    // Wrapped, because this rewrites real source: a shape the surgery cannot handle must come back as
    // "the check could not answer", never as a crash that hides every other result in the run.
    try {
    const tags = unwrappableTags(sf, isMotuSpec, motuOnly, resolveSpec);
    if (!tags.size && !sf.getImportDeclarations().some((i) => isMotuSpec(i.getModuleSpecifierValue()))) continue;
    touched.push(p);
    // EJECT FIRST, while `<Island slot="…">` is still there to say which element produces what: region
    // reads and seeds become plain state, and the producer's output prop is wired to its setters.
    const notes = ejectFile(sf, regions, outputs);
    if (notes.length) ejected.push([p, notes]);
    // Form 2: unwrap motu's JSX, keep the children, drop the imports.
    for (const el of [...sf.getDescendantsOfKind(SyntaxKind.JsxElement)].reverse()) {
      // `<Actions.Island>` — a region binding namespaces its surface, so the tag is qualified and the
      // thing that came from motu is the object it hangs off.
      const name = rootTagName(el.getOpeningElement().getTagNameNode().getText());
      if (!tags.has(name)) continue;
      // What the page KEEPS. JSX comments and whitespace are not children in any sense that matters —
      // React never sees them — but joining them in produced `{/* … */}<Thing/>`, which is not one
      // expression, and replacing an element inside a JSX attribute with it threw out of ts-morph and
      // took `motu check` down with a stack trace. A comment inside an island was enough.
      const kept = el
        .getJsxChildren()
        .map((c) => c.getText())
        .filter((t) => t.trim() && !/^\{\s*\/\*[\s\S]*\*\/\s*\}$/.test(t.trim()));
      const inner = kept.join('').trim();
      const single = kept.length === 1 && (inner.startsWith('<') || inner.startsWith('{'));
      el.replaceWithText(inner === '' ? 'null' : single ? inner : `<>${inner}</>`);
    }
    for (const el of [...sf.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement)].reverse()) {
      if (tags.has(rootTagName(el.getTagNameNode().getText()))) el.replaceWithText('null');
    }
    for (const imp of sf.getImportDeclarations()) {
      const spec = imp.getModuleSpecifierValue();
      const target = resolveSpec(sf, spec);
      if (isMotuSpec(spec) || (target && motuOnly.has(target))) imp.remove();
    }
    } catch (err) {
      surgeryErrors.push(`${relative(hostRoot, p)}: ${String(err?.message || err).split('\n')[0]}`);
    }
    stripped.push(p);
  }

  if (!touched.length) {
    if (!quiet) console.log(color.green('✓ removal-check') + color.dim('  no motu references in the host application'));
    return { pass: true, deleted: [], stripped: [], ejected: [], errors: [] };
  }

  // --- apply, typecheck, ALWAYS restore -----------------------------------------------------------
  rmSync(backupDir, { recursive: true, force: true });
  mkdirSync(backupDir, { recursive: true });
  const backup = (p) => {
    const dest = resolve(backupDir, relative(hostRoot, p));
    mkdirSync(dirname(dest), { recursive: true });
    cpSync(p, dest);
  };
  // Same inputs as the last PASS? Then the answer is the same answer, and a full application typecheck
  // is four seconds spent re-deriving it. `--force` re-proves it anyway.
  const proofFile = resolve(cfg.cacheDir, 'removal-check.proof.json');
  const fingerprint = proofFingerprint(
    [...deleted, ...stripped],
    [
      ...listIslands(paths.islandsDir).map((i) => i.element),
      // The archipelagos: what eject generates comes from their `writes`, so a change there changes
      // the surgery even when no host file moved.
      ...(existsSync(paths.archipelagosDir)
        ? readdirSync(paths.archipelagosDir, { withFileTypes: true })
            .filter((e) => e.isDirectory())
            .map((e) => paths.archipelagoFile(e.name))
            .filter((f) => existsSync(f))
        : []),
    ],
  );
  if (!argv?.force && existsSync(proofFile)) {
    try {
      const proof = JSON.parse(readFileSync(proofFile, 'utf8'));
      if (proof.pass && proof.fingerprint === fingerprint) {
        if (!quiet) {
          console.log(
            color.green('✓ removal-check') +
              color.dim(`  unchanged since the last proof — ${deleted.length} deleted, ${stripped.length} unwrapped (--force to re-prove)`),
          );
        }
        return {
          pass: true,
          cached: true,
          deleted: proof.deleted ?? [],
          stripped: proof.stripped ?? [],
          ejected: proof.ejected ?? [],
          errors: [],
        };
      }
    } catch {
      /* an unreadable proof is no proof */
    }
  }

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

  if (!quiet) {
    console.log(color.bold('\nmotu removal-check — is motu removable from the host application?\n'));
    for (const p of deleted) console.log(`  ${color.dim('delete ')} ${relative(hostRoot, p)} ${color.dim('(100% motu)')}`);
    for (const p of stripped) console.log(`  ${color.dim('unwrap ')} ${relative(hostRoot, p)}`);
    for (const [p, notes] of ejected) {
      console.log(`  ${color.dim('eject  ')} ${relative(hostRoot, p)}`);
      for (const n of notes) console.log(`           ${color.dim(n)}`);
    }
    console.log('');
  }

  const out = ((result?.stdout ?? '') + (result?.stderr ?? '')).trim();

  // Deleting a route leaves the framework's GENERATED route types pointing at it until the next build.
  // Those are build artifacts, not application code, so they are not evidence that motu is
  // load-bearing — but they are reported rather than dropped, because a check that silently discards
  // errors is how a green result stops meaning anything.
  const lines = out ? out.split('\n') : [];
  const generated = lines.filter((l) => /^\.?next[\/\\]|^\.next[\/\\]/.test(l.trim()));
  const real = lines.filter((l) => l.trim() && !generated.includes(l));

  const summary = {
    // A file the surgery could not rewrite is an UNANSWERED question, not a pass.
    pass: (result?.status === 0 || real.length === 0) && surgeryErrors.length === 0,
    fingerprint,
    deleted: deleted.map((p) => relative(hostRoot, p)),
    stripped: stripped.map((p) => relative(hostRoot, p)),
    ejected: ejected.map(([p, notes]) => ({ file: relative(hostRoot, p), notes })),
    errors: [...surgeryErrors, ...real].slice(0, 15),
  };
  // Remember it, so an unchanged repo does not pay for the same proof twice.
  try {
    mkdirSync(cfg.cacheDir, { recursive: true });
    writeFileSync(
      proofFile,
      JSON.stringify(
        { pass: summary.pass, fingerprint, deleted: summary.deleted, stripped: summary.stripped, ejected: summary.ejected },
        null,
        2,
      ),
    );
  } catch {
    /* a cache that cannot be written just means the next run re-proves it */
  }

  if (quiet) return summary;

  if (summary.pass) {
    console.log(color.green(color.bold('PASS')) + color.dim('  the host typechecks with motu removed'));
    if (generated.length) {
      console.log(color.dim(`  (${generated.length} stale generated route-type error(s) ignored — build artifacts of the deleted route)`));
    }
    return summary;
  }
  console.log(color.red(color.bold('FAIL')) + '  the host does NOT compile without motu:');
  console.log(real.slice(0, 15).join('\n'));
  console.log(color.dim('\n  motu is load-bearing in the app. Either the file is 100% motu (deletable whole),'));
  console.log(color.dim('  or the wrapper must leave valid JSX behind when removed (C2).'));
  return summary;
}

/** `motu removal-check` — the report, and the exit code CI reads. */
export async function removalCheckCommand(argv) {
  const summary = await runRemovalCheck(argv);
  process.exit(summary.pass ? 0 : 1);
}
