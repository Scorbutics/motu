// A write that does not touch the file when the bytes are already there.
//
// EVERY generated lagoon entry goes through this, and it is not an optimisation. Vite watches
// `.motu/cache/lagoon/**`, and the entries are re-rendered on EVERY lagoon build — `motu island verify
// --runtime`, `archipelago verify --runtime`, `island snapshot`, `lagoon states`, each of which boots a
// lagoon of its own. Rendering is deterministic, so those writes were almost always byte-identical, and
// an identical write still bumps mtime, which still fires the watcher, which still full-reloads every
// open lagoon tab.
//
// The cost was not performance. It was that a person (or an agent) looking at a state in a browser had
// the page reload under them every time a check ran in another terminal — measured at roughly one
// reload per CLI invocation, ~6 `[vite] page reload` lines each. It closed a confirm dialog between
// opening it and screenshotting it, during the "LOOK at it" step motu itself insists on. A preview you
// cannot hold still is a preview you cannot inspect.
//
// So: compare, then write. `existsSync` is not enough (the content may have genuinely changed) and a
// hash is not worth it (these files are kilobytes).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Write `content` to `file` only if it differs from what is there.
 *
 * @returns true when the file was actually written — the caller can report what moved.
 */
export function writeIfChanged(file, content) {
  try {
    if (readFileSync(file, 'utf8') === content) return false;
  } catch {
    // Missing or unreadable — fall through and write it.
  }
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
  return true;
}
