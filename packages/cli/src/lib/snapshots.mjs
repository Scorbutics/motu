// Visual baselines — the gate for the one thing nothing else in motu looks at: what the island LOOKS
// like.
//
// Everything else here proves structure: props match the component, keys have one owner, the region
// mounts, the wiring resolves. None of it notices that a card lost its padding, that a heading now
// wraps on a phone, or that editing the header moved the panel underneath it. An agent cannot see, and
// a human reviewing a diff of TSX cannot either — so the harness has to.
//
// Baselines live beside the island's evidence, one per scenario × viewport, and are committed. A change
// to them is a change to the UI, and it shows up in review as an image, which is exactly where a
// reviewer can judge it.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';

/** Where an island's baselines live: `<islands>/<kebab>.snapshots/`. */
export function snapshotDir(islandsDir, kebab) {
  return resolve(islandsDir, `${kebab}.snapshots`);
}

/** `<scenario>@<viewport>.png`, with anything filesystem-hostile flattened out of the scenario name. */
export function snapshotName(scenario, viewport) {
  const slug = String(scenario)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${slug || 'default'}@${viewport}.png`;
}

/**
 * Compare a fresh capture against its baseline.
 *
 * Returns `{ status, diffPixels, ratio }` where status is 'new' (no baseline yet), 'match',
 * 'changed', or 'resized'. A size change is reported separately because pixel comparison is
 * meaningless across dimensions, and because it is nearly always a layout change worth looking at.
 */
export async function compareSnapshot(baselinePath, actual) {
  if (!existsSync(baselinePath)) return { status: 'new', diffPixels: 0, ratio: 0 };
  return compareBuffers(readFileSync(baselinePath), actual);
}

/**
 * The same comparison against BYTES rather than a path — what `--remote` needs, where the accepted
 * baseline arrives over http and never touches the repository.
 */
export async function compareBuffers(baselineBytes, actual) {
  const { PNG } = await import('pngjs');
  const { default: pixelmatch } = await import('pixelmatch');
  const before = PNG.sync.read(baselineBytes);
  const after = PNG.sync.read(actual);
  if (before.width !== after.width || before.height !== after.height) {
    return { status: 'resized', diffPixels: 0, ratio: 1, from: [before.width, before.height], to: [after.width, after.height] };
  }
  const diff = new PNG({ width: before.width, height: before.height });
  // A small threshold absorbs antialiasing differences without hiding a real change: anything a human
  // would notice moves far more than a handful of pixels.
  const diffPixels = pixelmatch(before.data, after.data, diff.data, before.width, before.height, { threshold: 0.12 });
  const ratio = diffPixels / (before.width * before.height);
  return { status: ratio > 0.001 ? 'changed' : 'match', diffPixels, ratio, diff: PNG.sync.write(diff) };
}

/** Write a baseline (and drop any stale `.actual`/`.diff` beside it). */
export function writeBaseline(dir, file, png) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, file), png);
  for (const suffix of ['.actual.png', '.diff.png']) {
    const stale = resolve(dir, file.replace(/\.png$/, suffix));
    if (existsSync(stale)) rmSync(stale);
  }
}

/** Write what was actually rendered + the diff, so a failure is inspectable rather than described. */
export function writeFailureArtifacts(dir, file, actual, diff) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, file.replace(/\.png$/, '.actual.png')), actual);
  if (diff) writeFileSync(resolve(dir, file.replace(/\.png$/, '.diff.png')), diff);
}

/** Baselines with no scenario behind them any more — evidence was renamed or deleted. */
export function orphanBaselines(dir, expected) {
  if (!existsSync(dir)) return [];
  const keep = new Set(expected);
  return readdirSync(dir)
    .filter((f) => f.endsWith('.png') && !f.endsWith('.actual.png') && !f.endsWith('.diff.png'))
    .filter((f) => !keep.has(basename(f)));
}
