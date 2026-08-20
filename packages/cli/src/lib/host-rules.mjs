// The rules a HOST's coding agent has to follow for motu to keep its guarantees.
//
// They used to live nowhere: every adopting repo re-typed them into its own CLAUDE.md from memory, or
// (more often) did not, and the framework enforced a shape nobody had told the agent about. They ship
// with motu now, from one source, and land in the host's instruction files — the same reasoning as
// `motu skills install`, which already refuses to let the judgement half drift from the CLI half.
//
// Written between markers and rewritten in place, so a `motu init` on an existing repo updates the
// block instead of appending a second copy, and anything the project added around it survives.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
/** The motu checkout that owns this CLI (packages/cli/src/lib → repo root). */
const MOTU_ROOT = resolve(here, '../../../..');
const SOURCE = resolve(MOTU_ROOT, '.github/host-rules.md');

const BEGIN = '<!-- motu:rules -->';
const END = '<!-- /motu:rules -->';

/** The instruction files a coding agent reads, in the order motu writes them. */
const TARGETS = ['CLAUDE.md', 'AGENTS.md', '.github/copilot-instructions.md'];

/** The shipped rules text, or null when this checkout has none (an older motu). */
export function hostRulesText() {
  return existsSync(SOURCE) ? readFileSync(SOURCE, 'utf8').trim() : null;
}

/**
 * Write the rules into every instruction file the repo already has (and CLAUDE.md if it has none).
 *
 * Returns the paths written, relative to `dir`. Idempotent: a repo that already carries the block gets
 * it replaced, so upgrading motu upgrades the rules.
 */
export function applyHostRules(dir) {
  const text = hostRulesText();
  if (!text) return [];
  const block = `${BEGIN}\n${text}\n${END}`;
  const existing = TARGETS.filter((t) => existsSync(resolve(dir, t)));
  const written = [];
  for (const target of existing.length ? existing : ['CLAUDE.md']) {
    const path = resolve(dir, target);
    const before = existsSync(path) ? readFileSync(path, 'utf8') : '';
    const next = before.includes(BEGIN)
      ? before.replace(new RegExp(`${BEGIN}[\\s\\S]*?${END}`), block)
      : `${before.trimEnd()}${before.trim() ? '\n\n' : ''}${block}\n`;
    if (next === before) continue;
    writeFileSync(path, next);
    written.push(target);
  }
  return written;
}
