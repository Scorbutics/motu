// WHERE THE HOST KEEPS ITS CODE — asked once, for every check that needs the answer.
//
// Two checks walk the host application: `removal-check` (delete motu, does it still compile?) and
// `integrate check` (does the page compose, place and read the region?). Both used to hardcode
// `['app', 'components', 'lib', 'src', 'pages']` — Next's layout, and the only host motu had ever been
// integrated into. Pointed at Twenty, whose source is all under `src/`, that found nothing and printed
// "no motu references in the host application" over a fully integrated app. A green result from an
// empty search is the worst failure mode either tool has.
//
// THE APPLICATION ALREADY DECLARED THIS, and it is not a guess: `tsconfig.json` says which files the
// project compiles, via `include`/`exclude` and its `extends` chain. `removal-check` was already
// trusting it for the half that decides the verdict — it runs `tsc --noEmit -p tsconfig.json` — while
// its file walk used the five-directory guess, so ONE CHECK CARRIED TWO DEFINITIONS of "the
// application" and they were free to disagree. Measured on this repo's own Next host, the guess misses
// `middleware.ts` and everything under `test/`: files `tsc` compiles and the surgery never unwraps,
// which is how a dangling import lands on a line that looks fine.
//
// Precedence, widest trust last:
//
//   1. `hostSources` in motu.config.json  — an explicit answer for a layout neither of the below gets
//                                           right. Still supported; it just stopped being the only way.
//   2. the host's tsconfig/jsconfig       — the application's own declaration.
//   3. the five-directory guess           — a host with no tsconfig at all (a JS host, or the review
//                                           console, which has none).
//
// It returns FILES, not roots, because that is what a tsconfig knows: reducing its file set back to
// top-level directories would throw away the `exclude` that made it precise. Callers apply their own
// skip rule (motu's own source, for one; the directories motu writes into, for the other) and the
// ORIGIN travels with the answer so a report can say what it trusted.
import { existsSync, readdirSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { ts } from 'ts-morph';

/** Source files, as both walks have always defined them: `.ts`/`.tsx`, no `node_modules`, no dotdirs. */
const isSource = (p) => /\.tsx?$/.test(p);

/** A path is out if any segment is `node_modules` or starts with a dot — `.next/types` is generated. */
function inHiddenOrVendored(rel) {
  return rel.split(sep).some((seg) => seg === 'node_modules' || (seg.startsWith('.') && seg !== '.' && seg !== '..'));
}

/** The recursive walk both checks used, kept for the config and guess paths. */
function walkRoots(hostRoot, roots) {
  const out = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = resolve(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
        walk(full);
      } else if (isSource(e.name)) {
        out.push(full);
      }
    }
  };
  for (const top of roots) walk(resolve(hostRoot, top));
  return out;
}

/**
 * The file list the host's own TypeScript config declares, or `null` when there is no config to read.
 *
 * `getParsedCommandLineOfConfigFile` is the API that follows `extends` — `parseJsonConfigFileContent`
 * alone does not, and a host whose `include` lives in a base config would silently resolve to nothing.
 * A config that parses but matches no file returns `null` too, so the caller falls through to the
 * guess rather than inheriting an empty answer: that is the original bug, arriving by a new door.
 */
function fromTsconfig(hostRoot) {
  const file = ['tsconfig.json', 'jsconfig.json'].map((n) => resolve(hostRoot, n)).find((p) => existsSync(p));
  if (!file) return null;
  let parsed;
  try {
    parsed = ts.getParsedCommandLineOfConfigFile(file, {}, { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => {} });
  } catch {
    return null;
  }
  if (!parsed?.fileNames?.length) return null;
  const files = parsed.fileNames
    .map((p) => resolve(p))
    .filter((p) => isSource(p) && p.startsWith(hostRoot + sep) && !inHiddenOrVendored(p.slice(hostRoot.length + 1)));
  return files.length ? { files, origin: 'tsconfig', detail: file } : null;
}

/**
 * Every host source file, and where the answer came from.
 *
 * `{ files, origin, detail }` — `origin` is `'config' | 'tsconfig' | 'guess'`, and `detail` names the
 * tsconfig or the roots, so a check that examined nothing can say what it trusted before it found
 * nothing. Callers still have to treat an empty result as "could not run": nothing here decides that.
 */
export function hostSourceFiles(hostRoot, cfg) {
  const configured = Array.isArray(cfg?.hostSources) ? cfg.hostSources : null;
  if (configured?.length) {
    return { files: walkRoots(hostRoot, configured), origin: 'config', detail: configured.join(', ') };
  }

  const declared = fromTsconfig(hostRoot);
  if (declared) return declared;

  const guessed = ['app', 'components', 'lib', 'src', 'pages'].filter((d) => existsSync(resolve(hostRoot, d)));
  const roots = guessed.length ? guessed : ['.'];
  return { files: walkRoots(hostRoot, roots), origin: 'guess', detail: roots.join(', ') };
}

/**
 * How to say, in a report, where the scan looked — because "scanned 0 files" alone cannot be acted on.
 *
 * `rel` is the caller's path shortener (`paths.rel`), kept out of here so this module stays free of
 * the CLI's own config object.
 */
export function describeSources({ origin, detail }, rel = (p) => p) {
  if (origin === 'tsconfig') return `declared by ${rel(detail)}`;
  if (origin === 'config') return `hostSources: ${detail}`;
  return detail === '.' ? 'guessed: the whole host root' : `guessed: ${detail}`;
}
