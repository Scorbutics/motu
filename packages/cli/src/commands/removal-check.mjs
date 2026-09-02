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
import { paths, color, blankComments } from '../lib/util.mjs';
import { loadMotuConfig } from '../lib/config.mjs';
import { hostSourceFiles, describeSources } from '../lib/host-sources.mjs';
import { listIslands } from '../lib/islands.mjs';
import { ejectFile, readOutputs, readRegions, regionOfRoot } from '../lib/eject.mjs';

/** The host's own typecheck, run the way the host would run it. */
function hostTypecheck(hostRoot) {
  const tsconfig = existsSync(resolve(hostRoot, 'tsconfig.json')) ? 'tsconfig.json' : null;
  return spawnSync('npx', ['tsc', '--noEmit', ...(tsconfig ? ['-p', tsconfig] : [])], {
    cwd: hostRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
  });
}


/**
 * Every app source and what it imports, read as TEXT.
 *
 * The check used to hand the whole application to ts-morph — a thousand files parsed and type-loaded
 * so it could find the dozen that mention motu. What it actually needs first is an import graph, and
 * an import graph is a regex over source text. The files that matter are then parsed properly; the
 * rest are never opened again.
 */
function importGraph(hostRoot, motuRoot, cfg) {
  const graph = new Map();
  const resolved = hostSourceFiles(hostRoot, cfg);
  // The ORIGIN travels with the graph: a scan that found nothing has to be able to say what it
  // trusted, or "0 files" is indistinguishable from "the host has no source".
  graph.origin = resolved.origin;
  graph.detail = resolved.detail;
  for (const full of resolved.files) {
    // MOTU'S OWN SOURCE IS NOT THE HOST'S — unless the host lives inside the checkout.
    //
    // This skipped everything under `motuRoot`, which is right for an application that sits beside
    // motu and wrong for one that sits inside it. The review console does: it was subtree'd into
    // this repository, so every one of its files matched and the walk returned nothing, and the
    // check reported "examined no files" over a fully integrated app — the same empty-search
    // failure `hostSourceFiles` was written to stop, arriving by a different door.
    //
    // Guarded on the two being different so the repo-root project, whose hostRoot IS the checkout,
    // does not start treating motu's own packages as the host.
    if (full.startsWith(motuRoot) && (hostRoot === motuRoot || !full.startsWith(hostRoot))) continue;
    let text;
    try {
      text = readFileSync(full, 'utf8');
    } catch {
      continue;
    }
    graph.set(
      full,
      [...text.matchAll(/(?:^|\n)\s*(?:import|export)[^'"\n]*?from\s*['"]([^'"]+)['"]/g)].map((m) => m[1]),
    );
  }
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
/**
 * `<X.Root a={<A/>} header={{ member }} />` -> `<RootComponent a={<A/>} header={<Header member={member} />} />`.
 *
 * The region's whole composition is declared, so this is a rename plus two import lines rather than a
 * reconstruction: every prop the page passes is already the page's own JSX, and the archipelago says
 * which of them an island was wrapping (nothing to unwrap — the island wrapper is motu's, the child is
 * the app's) and which is a host component given as data.
 */
function rewriteRegionRoots(sf, regions, tags, filePath) {
  const rooted = regions.filter((r) => r.root);
  if (!rooted.length) return;
  const needed = new Map();
  for (const el of [
    ...sf.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement),
    ...sf.getDescendantsOfKind(SyntaxKind.JsxOpeningElement),
  ].reverse()) {
    const tag = el.getTagNameNode().getText();
    if (tag.split('.').pop() !== 'Root') continue;
    if (!tags.has(rootTagName(tag))) continue;
    const region = regionOfRoot(el, rooted) ?? (rooted.length === 1 ? rooted[0] : null);
    if (!region) continue;

    // A host-slot prop carries the component's PROPS; it has to become the element again.
    for (const [prop, spec] of Object.entries(region.rootHostSlots ?? {})) {
      const attr = el.getAttribute?.(prop);
      const expr = attr?.getInitializer?.()?.getExpression?.();
      if (!expr || !spec.component) continue;
      const text = expr.getText().trim();
      const inner = text.startsWith('{') && text.endsWith('}') ? text.slice(1, -1).trim() : null;
      // `{{ member }}` is an object literal of props; spreading it keeps whatever shape it had,
      // including a shorthand, without this having to parse the properties.
      attr.replaceWithText(`${prop}={<${spec.component} {...${inner === null ? text : `{${inner}}`}} />}`);
      needed.set(spec.component, spec.from);
    }

    el.getTagNameNode().replaceWithText(region.root);
    // A paired `<X.Root>…</X.Root>` closes with the same name.
    const closing = el.getParent?.()?.getClosingElement?.();
    if (closing) closing.getTagNameNode().replaceWithText(region.root);
    needed.set(region.root, region.rootFrom);
  }
  for (const [name, from] of needed) {
    if (!from) continue;
    if (sf.getImportDeclarations().some((i) => (i.getNamedImports?.() ?? []).some((n) => n.getName() === name))) continue;
    sf.addImportDeclaration({ moduleSpecifier: from, namedImports: [name] });
  }
  void filePath;
}

function unwrappableTags(sf, isMotuSpec, motuOnly, resolveSpec) {
  const names = new Set();
  for (const imp of sf.getImportDeclarations()) {
    const spec = imp.getModuleSpecifierValue();
    const target = resolveSpec(sf, spec);
    if (!isMotuSpec(spec) && !(target && motuOnly.has(target))) continue;
    // A UI KIT IS NOT A SEAM, so its tags are not unwrappable.
    //
    // Unwrapping means "keep the children, drop the wrapper" — right for `<X.Island slot="y">`, which
    // WRAPS host content, and wrong for `<Panel>` or `<PanelHead title={…} sub={<span/>}>`, which IS
    // the content. Unwrapping those threw their attributes away and could leave invalid JSX behind,
    // so the check reported TS1005 (a syntax error it had caused) instead of TS2304 (the true answer:
    // this name no longer exists). The import is still removed below, which is what makes the honest
    // diagnostic appear.
    //
    // It also states something real: an application that builds its UI out of `@motu/chrome/react` is
    // load-bearing on motu for its APPEARANCE, not just its wiring. That is a legitimate thing to
    // adopt and it should show up here as exactly what it is.
    if (CHROME_KIT.test(spec)) continue;
    for (const named of imp.getNamedImports()) names.add(named.getNameNode().getText());
    const def = imp.getDefaultImport();
    if (def) names.add(def.getText());
  }
  return names;
}

/** motu's design kit: motu's own code, but presentation rather than a boundary. */
const CHROME_KIT = /^@motu\/chrome(\/|$)/;

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
 *   1. An import can reach motu WITHOUT a motu specifier: acme's composition root imports
 *      `@/motu/src/services`, an app-alias path INTO the motu project directory. Anything importing
 *      from that directory is motu's.
 *   2. It is TRANSITIVE. The dev page's only import is the composition root — no motu specifier at
 *      all — so deleting the root strands it. A file whose imports are all motu-only is motu-only.
 */
function motuOnlySet(graph, hostRoot, motuDirs) {
  // One or several directories motu owns outright (see the caller: a single `motu/` tree when it has
  // one, otherwise the declared islands/archipelagos/ui/shared/lagoon dirs).
  const dirs = (Array.isArray(motuDirs) ? motuDirs : [motuDirs]).filter(Boolean);
  const escape = (d) => d.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const insideMotu = dirs.length
    ? new RegExp(`(^|/)(${dirs.map(escape).join('|')})/`)
    : /^(?!)/; // nothing declared: match nothing rather than guess a path that does not exist
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

  // A PROJECT THAT NEVER CLAIMED REMOVABILITY. See `removable` in the config loader for why motu's
  // own tools cannot answer this question. Said out loud rather than passed over, and reported as a
  // SKIP: opting out proves nothing, and the verdict must not read like proof.
  if (!cfg.removable) {
    if (!quiet) {
      console.log(
        color.dim('– removal-check') +
          color.dim('  this project declares `removable: false` — motu is meant to be load-bearing here, ' +
            'so "does it compile without motu" is not a question about its integration'),
      );
    }
    return { pass: true, skipped: true, scanned: 0, deleted: [], stripped: [], ejected: [], errors: [] };
  }

  // The app's own sources — never motu's own tree, which is what is being removed.
  // THE FRAMEWORK CHECKOUT, not the project root.
  //
  // This passed `cfg.root` — the directory holding motu.config.json — into a parameter named
  // `motuRoot` and used as "skip motu's own source". Every project keeps its sources under its own
  // root, so the exclusion swallowed the entire application and the walk returned nothing, for every
  // project, always. That is the real reason removal-check kept reporting "scanned 0 files"; the
  // roots guess above it was fixed twice for a symptom this was causing.
  const graph = importGraph(hostRoot, cfg.motuRoot, cfg);
  // WHEN MOTU HAS NO SUBDIRECTORY OF ITS OWN, do not invent one.
  //
  // `relative(hostRoot, cfg.root) || 'motu'` guessed a directory named `motu/` whenever motu was
  // initialised INTO the host app root — which is exactly what `motu init . --host next` produces and
  // therefore the common Next layout. No such directory exists there, so `insideMotu` matched nothing
  // and every motu-generated file under `src/` read as application code. The visible symptom was a
  // composition root reported as "imports the application" while the very imports it named were
  // listed as motu-deletable two lines above in the same report.
  //
  // The declared directories are the answer and were available all along: `islands`, `archipelagos`,
  // `ui`, `shared` and the lagoon root are motu's by definition, whether or not they sit under a
  // shared parent.
  const motuDir = relative(hostRoot, cfg.root);
  const motuDirs = motuDir
    ? [motuDir]
    : [cfg.islands, cfg.archipelagos, cfg.ui, cfg.shared, cfg.lagoon]
        .filter(Boolean)
        .map((d) => relative(hostRoot, resolve(cfg.root, d)))
        .filter((d) => d && !d.startsWith('..'));
  const { set: motuOnly, isMotuSpec, resolveSpec } = motuOnlySet(graph, hostRoot, motuDirs);

  // WHY A COMPOSITION ROOT DID NOT QUALIFY, computed before anything is rewritten.
  //
  // The rule is simple and its consequence is not: a file is deleted whole only if EVERY import it
  // makes is motu's. One application import — `signIn` from the app's auth client, say — and the file
  // is stripped instead, which leaves `createRegion(...)` behind with its imports gone and reports as
  // "the host does not compile without motu" pointing at a line that looks fine. The cause is an
  // import three lines above, and nothing said so; finding it meant reading motu's source.
  //
  // So: any file that composes a region and did NOT qualify gets its disqualifying imports named.
  const disqualified = [];
  for (const [p, specs] of graph) {
    if (motuOnly.has(p)) continue;
    let text = '';
    try {
      text = readFileSync(p, 'utf8');
    } catch {
      continue;
    }
    // COMMENTS BLANKED FIRST, the same rule every other text match here follows: a file that merely
    // MENTIONS `createRegion` in a comment does not compose a region. acme's `mission-helpers.tsx`
    // explains in prose which module holds its region binding, and was reported as an undeletable
    // composition root for saying so — an error whose advice was to restructure a file that was
    // already correct.
    if (!/\bcreateRegion\s*\(/.test(blankComments(text))) continue;
    const offenders = specs.filter((spec) => {
      if (INFRA.test(spec) || isMotuSpec(spec)) return false;
      const target = resolveSpec(p, spec);
      return !(target && motuOnly.has(target));
    });
    if (offenders.length) disqualified.push([p, offenders]);
  }

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
    // A ROOT REGION IS REWRITTEN, NOT UNWRAPPED. `<Directory.Root …/>` is self-closing, so the
    // generic pass below would replace it with `null` and take the whole page with it — which is
    // exactly what it did, and the removal proof failed on a page that was perfectly fine.
    //
    // What it becomes is the application's own component with the same props: the island props
    // already hold the page's own JSX, and a host-slot prop holds that component's props, so it
    // grows back into an element. Both imports are added; motu's go with the rest.
    rewriteRegionRoots(sf, regions, tags, p);
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
      // WHERE THE WRAPPER STOOD DECIDES WHAT REPLACES IT.
      //
      // `{expr}` is how a JSX child holds an expression, and it is an OBJECT LITERAL anywhere else. So
      // unwrapping `return <MotuRegion>{screen}</MotuRegion>` by keeping the child verbatim produced
      // `return {screen}` — valid TypeScript, a completely different program, and a removal proof that
      // failed with "type '{ screen: Element }' is not a valid JSX element type". Strip the braces when
      // the wrapper was NOT itself a JSX child; keep them when it was, or `<div>{x}</div>` unwraps to a
      // div containing the letter x.
      const parentKind = el.getParent()?.getKind();
      const inJsxChild = parentKind === SyntaxKind.JsxElement || parentKind === SyntaxKind.JsxFragment;
      const braced = single && inner.startsWith('{') && inner.endsWith('}') && !inJsxChild;
      el.replaceWithText(
        inner === '' ? 'null' : braced ? inner.slice(1, -1).trim() : single ? inner : `<>${inner}</>`,
      );
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
    // TWO DIFFERENT ANSWERS, and printing them the same way is what let this command report success
    // over a fully integrated app: it scanned Next's directories, found none of Twenty's `src/`, and
    // called the emptiness a clean bill of health.
    //
    //   scanned files, found no motu  -> genuinely nothing to remove
    //   scanned NOTHING               -> the check did not run, and must not read as a pass
    const scanned = graph.size;
    if (scanned === 0) {
      if (!quiet) {
        console.log(
          color.yellow('– removal-check') +
            color.dim(
              `  scanned 0 files under ${paths.rel(hostRoot)} ` +
                `(${describeSources(graph, paths.rel)}) — ` +
                `nothing was examined, so nothing is proved. ` +
                `Set \`hostSources\` in motu.config.json to the host's own source directories.`,
            ),
        );
      }
      return {
        pass: false,
        scanned: 0,
        deleted: [],
        stripped: [],
        ejected: [],
        errors: [`removal-check examined no files under ${paths.rel(hostRoot)}`],
      };
    }
    if (!quiet) {
      console.log(
        color.green('✓ removal-check') +
          color.dim(`  no motu references in the host application  · ${scanned} host file(s) scanned`),
      );
    }
    return { pass: true, scanned, deleted: [], stripped: [], ejected: [], errors: [] };
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

    result = hostTypecheck(hostRoot);
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
  let real = lines.filter((l) => l.trim() && !generated.includes(l));

  // PRE-EXISTING errors are not evidence that motu is load-bearing.
  //
  // The check asks one question — does removing motu BREAK the host — and a host that did not
  // typecheck to begin with still answers it. Real applications fail this the moment you try:
  // Twenty's `tsc` reports 4 errors at a clean checkout because a package's generated file needs a
  // build step that does not run here. Demanding zero would make every such app look like motu had
  // welded itself in, which is the exact opposite of what the check exists to prove.
  //
  // The baseline runs only when something failed, on the RESTORED tree (the `finally` above put every
  // file back). So the common case — a clean removal — still pays for exactly one typecheck.
  let preExisting = [];
  if (real.length) {
    const before = hostTypecheck(hostRoot);
    const beforeOut = ((before?.stdout ?? '') + (before?.stderr ?? '')).trim();
    const baseline = new Set(beforeOut ? beforeOut.split('\n').map((l) => l.trim()).filter(Boolean) : []);
    preExisting = real.filter((l) => baseline.has(l.trim()));
    real = real.filter((l) => !baseline.has(l.trim()));
  }

  const summary = {
    scanned: graph.size,
    // A file the surgery could not rewrite is an UNANSWERED question, not a pass.
    pass: (result?.status === 0 || real.length === 0) && surgeryErrors.length === 0,
    fingerprint,
    deleted: deleted.map((p) => relative(hostRoot, p)),
    stripped: stripped.map((p) => relative(hostRoot, p)),
    ejected: ejected.map(([p, notes]) => ({ file: relative(hostRoot, p), notes })),
    errors: [...surgeryErrors, ...real].slice(0, 15),
    surgeryErrors,
    disqualified: disqualified.map(([p, specs]) => ({ file: relative(hostRoot, p), imports: specs })),
    deletedModules: deleted.map((p) => relative(hostRoot, p)),
    preExisting: preExisting.length,
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
    console.log(
      color.green(color.bold('PASS')) +
        color.dim(`  the host typechecks with motu removed  · ${summary.scanned} host file(s) scanned, ` +
          `${summary.deleted.length} deleted, ${summary.stripped.length} unwrapped`) +
        (summary.preExisting ? color.dim(` · ${summary.preExisting} pre-existing error(s) in the host, unchanged by the removal`) : ''),
    );
    if (generated.length) {
      console.log(color.dim(`  (${generated.length} stale generated route-type error(s) ignored — build artifacts of the deleted route)`));
    }
    return summary;
  }
  console.log(color.red(color.bold('FAIL')) + '  the host does NOT compile without motu:');

  // A FILE THE SURGERY COULD NOT REWRITE IS AN UNANSWERED QUESTION, not a verdict about the app — and
  // it used to be invisible here: these went into `summary.errors` for `motu check` to aggregate and
  // were never printed by this command, so the same failure reported differently depending on which
  // entry point you ran. Printed FIRST, because every TypeScript error below may be its consequence:
  // a file that threw mid-surgery keeps the imports the surgery was about to remove.
  if (surgeryErrors.length) {
    console.log(color.yellow('\n  motu could not rewrite these files, so removal was never actually tried on them:'));
    for (const e of surgeryErrors) console.log(`    ${e}`);
    console.log(
      color.dim('    This is an UNANSWERED question, not a verdict about the app: the file was left as it was,\n') +
        color.dim('    so any error below naming it — a dangling import above all — is a consequence of this and\n') +
        color.dim('    not a finding of its own. It means the rewriter met a JSX shape it cannot express: what a\n') +
        color.dim('    wrapper leaves behind has to be ONE expression, and where it stood decides whether that is\n') +
        color.dim('    `{x}` or `x`. Reduce the wrapper\'s children to a single element or a single `{…}` (lift a\n') +
        color.dim('    branch into a named value if it helps) and run again — and please report the shape, because\n') +
        color.dim('    a shape the surgery cannot rewrite is motu\'s bug before it is yours.'),
    );
  }

  if (real.length) {
    console.log(color.dim('\n  what the host said with motu removed:'));
    console.log(real.slice(0, 15).join('\n'));
  }

  // A DANGLING IMPORT OF A DELETED FILE has one cause and it is never the line it points at.
  const danglers = real.filter((l) => summary.deletedModules.some((m) => l.includes(m.replace(/\.tsx?$/, ''))));
  if (danglers.length) {
    console.log(
      color.dim('\n  Those name a file motu DELETED (it was 100% motu). The import should have gone with it,\n') +
        color.dim('  so this means the surgery on the importing file did not finish — see above.'),
    );
  }

  // THE OTHER HALF, and the one that cost the most to find by hand.
  if (disqualified.length) {
    console.log(color.yellow('\n  these compose a region but are NOT deletable, because they import the application:'));
    for (const [p, specs] of disqualified) {
      console.log(`    ${relative(hostRoot, p)}`);
      for (const spec of specs) console.log(color.dim(`      ${spec}`));
    }
    console.log(
      color.dim('    A composition root is deleted WHOLE only when every import it makes is motu\'s. One\n') +
        color.dim('    application import and it is stripped instead, leaving `createRegion(...)` with no imports.\n') +
        color.dim('    Move what needs the application — a source\'s port, a service, a browser API — into an app\n') +
        color.dim('    file that renders the real components inside `<R.Island slot="…">`, and keep this file to\n') +
        color.dim('    the wiring motu owns.'),
    );
  }

  console.log(color.dim('\n  motu is load-bearing in the app. Either the file is 100% motu (deletable whole),'));
  console.log(color.dim('  or the wrapper must leave valid JSX behind when removed (C2).'));
  return summary;
}

/** `motu removal-check` — the report, and the exit code CI reads. */
export async function removalCheckCommand(argv) {
  const summary = await runRemovalCheck(argv);
  process.exit(summary.pass ? 0 : 1);
}
