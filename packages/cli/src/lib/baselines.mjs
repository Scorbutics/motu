// Talking to the lagoon host about visual baselines.
//
// The repository stores no PNGs. A run renders locally, POSTs each shot, and the HOST decides whether
// it is new, matches the accepted baseline, or differs from it — because "accepted" is a decision
// somebody made, not whatever happened to be on disk last. That distinction is the whole reason this
// lives on the host: `--update` overwriting files is why a stale baseline and a real regression look
// identical.
//
// Diff images are still produced, and still locally: the host hands back the accepted bytes, the same
// pixelmatch comparison runs here, and the artifacts land under `.motu/` where they are ignored. The
// answer to "what changed?" stays an image you can open.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { REPO_ROOT } from './util.mjs';
import { loadHostConfig, gitIdentity } from './remote.mjs';

/** Where the host is, by the same precedence `lagoon publish --remote` uses. */
export function resolveBaselineHost(argv) {
  const cfg = loadHostConfig();
  const url = (typeof argv.remote === 'string' ? argv.remote : null) || process.env.MOTU_HOST_URL || cfg.url;
  const token = (typeof argv.token === 'string' ? argv.token : null) || process.env.MOTU_HOST_TOKEN || cfg.token || null;
  if (!url) return null;
  return { base: String(url).replace(/\/+$/, ''), token, id: gitIdentity(REPO_ROOT) };
}

async function api(host, path, init = {}) {
  let res;
  try {
    res = await fetch(`${host.base}${path}`, {
      ...init,
      headers: { ...(init.headers ?? {}), ...(host.token ? { authorization: `Bearer ${host.token}` } : {}) },
    });
  } catch (err) {
    throw new Error(`cannot reach the lagoon host at ${host.base} — ${err.message}`);
  }
  const text = await res.text();
  let payload = null;
  try {
    payload = JSON.parse(text);
  } catch {
    /* something other than the host answered */
  }
  if (!res.ok) throw new Error(payload?.error ?? `${res.status} ${text.slice(0, 160).replace(/\s+/g, ' ').trim()}`);
  return payload;
}

/** `<scenario>@<viewport>` — the shot's identity, derived from the same name the files used. */
export const shotId = (file) => file.replace(/\.png$/, '');

/** Send one rendered shot. Returns { status: 'new'|'match'|'changed', accepted, hash }. */
export async function putShot(host, island, file, png) {
  const q = new URLSearchParams({ repo: host.id.repo, island, shot: shotId(file) });
  if (host.id.sha) q.set('sha', host.id.sha);
  if (host.id.branch) q.set('branch', host.id.branch);
  return api(host, `/api/baseline?${q}`, {
    method: 'POST',
    headers: { 'content-type': 'image/png', 'content-encoding': 'gzip' },
    body: gzipSync(png),
  });
}

/** The accepted bytes, so a difference can be shown rather than reported as a percentage. */
export async function fetchShot(host, hash) {
  const res = await fetch(`${host.base}/shot/${hash}`);
  if (!res.ok) return null;
  return Buffer.from(await res.arrayBuffer());
}

/** Move the accepted pointer. `island` null accepts everything the repo has pending. */
export async function acceptShots(host, island) {
  const q = new URLSearchParams({ repo: host.id.repo });
  if (island) q.set('island', island);
  return api(host, `/api/baseline/accept?${q}`, { method: 'POST' });
}

/**
 * Failure artifacts, under `.motu/` rather than beside the evidence.
 *
 * They are outputs of a run, not sources: writing them into the island's folder is what taught people
 * to gitignore the whole directory, and it is why removing baselines from the repo has to move these
 * too. Returns the path to show.
 */
export function writeRemoteArtifacts(island, file, actual, diff) {
  const dir = resolve(REPO_ROOT, '.motu/snapshots', island);
  mkdirSync(dir, { recursive: true });
  const base = file.replace(/\.png$/, '');
  writeFileSync(resolve(dir, `${base}.actual.png`), actual);
  if (diff) writeFileSync(resolve(dir, `${base}.diff.png`), diff);
  return resolve(dir, `${base}.diff.png`);
}
