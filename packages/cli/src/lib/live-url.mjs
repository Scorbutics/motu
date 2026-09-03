// WHERE A PERSON CAN LOOK AT THIS RIGHT NOW.
//
// One file, written by a running dev server and read by every check's verdict line. It exists because
// a green report describes FILES, while the thing the work is for is a rendered region — and across a
// whole bench run no agent ever handed one over: each finished on a passing check, and the person who
// asked for the work had nothing to open.
//
// ONE MODULE FOR THE PATH, and that is not tidiness. The first version spelled the directory two ways
// (`paths.cacheDir`, which does not exist, against the config's `cacheDir`, which does), so the writer
// silently wrote nothing and the reader silently found nothing — while the dev server printed a
// perfectly correct "live at:" line. Both halves agreed, both were wrong, and nothing said so.
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadMotuConfig } from './config.mjs';

/** The dev server rewrites this every heartbeat; two beats of silence means the process is gone. */
const STALE_MS = 90_000;

function file() {
  return resolve(loadMotuConfig().cacheDir, 'lagoon-live.url');
}

/**
 * Record the member URL a dev server is currently serving.
 *
 * Rewritten on EVERY heartbeat rather than once, so the file's own mtime carries how long ago this
 * was true. A URL left behind by a killed dev server is worse than no URL at all: it sends whoever
 * reads it to a page that no longer exists, and it reads exactly like a working one.
 */
export function writeLiveUrl(url) {
  const f = file();
  mkdirSync(resolve(f, '..'), { recursive: true });
  writeFileSync(f, `${url}\n`);
}

export function clearLiveUrl() {
  try {
    rmSync(file(), { force: true });
  } catch {
    /* nothing to clean up */
  }
}

/** The live member URL, or null when there is none or the last heartbeat is too old to believe. */
export function readLiveUrl() {
  try {
    const f = file();
    if (Date.now() - statSync(f).mtimeMs >= STALE_MS) return null;
    return readFileSync(f, 'utf8').trim() || null;
  } catch {
    return null;
  }
}
