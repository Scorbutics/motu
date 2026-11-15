// RUNTIME VERDICTS, REMEMBERED BY WHAT THEY DEPEND ON.
//
// The runtime half of a check is a function of its inputs (lib/fingerprint.mjs). A verdict that HELD
// is stored against their hash; the next run with the same hash replays it instead of driving the
// browser again. On Peps a full `check --runtime` is ~22 min; after a typical commit, ~80% of it is
// islands and regions whose inputs did not move.
//
// THREE RULES, each for a failure this would otherwise reintroduce:
//
//   ONLY CLEAN VERDICTS ARE STORED. A run with an error or an INCONCLUSIVE finding always re-runs: a
//   flaky failure must not become permanent, and a check that could not look must look next time.
//
//   A REPLAY IS NEVER SILENT. Every replayed finding carries `cached: { at, fp }`, every sweep line
//   says "cached", and the verdict line counts re-proved against replayed — narrowing the run without
//   saying so is the failure `--changed` was written to avoid, and this must not reintroduce it.
//
//   THE ESCAPE IS ONE FLAG. `--no-cache` re-proves everything; `--max-age <n>(h|d)` re-proves what
//   was proved longer ago than that (the nightly's backstop against an input nobody thought of).
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadMotuConfig } from './config.mjs';

const DIR = resolve(loadMotuConfig().cacheDir, 'verdicts');
/** A few fingerprints per target, so switching branches back and forth stays warm. */
const KEEP = 4;

const fileOf = (kind, id) => resolve(DIR, `${kind}-${String(id).replace(/[^\w.-]/g, '_')}.json`);

function read(kind, id) {
  try {
    const j = JSON.parse(readFileSync(fileOf(kind, id), 'utf8'));
    return Array.isArray(j.entries) ? j.entries : [];
  } catch {
    return [];
  }
}

/** `--max-age 12h` / `7d` / `30m` → ms; null when unset or unreadable. */
export function parseMaxAge(v) {
  if (v === undefined || v === true || v === false) return null;
  const m = String(v).trim().match(/^(\d+(?:\.\d+)?)\s*(m|h|d)?$/i);
  if (!m) return null;
  const n = Number(m[1]);
  const unit = (m[2] ?? 'h').toLowerCase();
  return n * (unit === 'm' ? 60_000 : unit === 'h' ? 3_600_000 : 86_400_000);
}

/** The policy for one run, from its flags. */
export function cachePolicy(argv) {
  return {
    enabled: argv.cache !== false && process.env.MOTU_NO_CACHE !== '1',
    maxAgeMs: parseMaxAge(argv['max-age']),
  };
}

/** A stored verdict for exactly this fingerprint, or null. */
export function lookupVerdict(kind, id, fp, policy) {
  if (!fp || !policy?.enabled) return null;
  const hit = read(kind, id).find((e) => e.fp === fp);
  if (!hit) return null;
  if (policy.maxAgeMs != null && Date.now() - Date.parse(hit.at) > policy.maxAgeMs) return null;
  return hit;
}

/** Only clean verdicts are worth remembering — see the rules at the top. */
export function isStorable(findings) {
  return findings.length > 0 && findings.every((f) => f.level !== 'error' && f.level !== 'inconclusive');
}

export function storeVerdict(kind, id, fp, findings) {
  if (!fp || !isStorable(findings)) return false;
  // A replayed finding is stored as itself, not as a replay of a replay.
  const clean = findings.map(({ cached: _c, ...f }) => f);
  const entries = [{ fp, at: new Date().toISOString(), findings: clean }, ...read(kind, id).filter((e) => e.fp !== fp)].slice(0, KEEP);
  try {
    if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
    const file = fileOf(kind, id);
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify({ kind, id, entries }, null, 1));
    renameSync(tmp, file); // atomic: two agents writing one target never leave half a file
    return true;
  } catch {
    return false; // a read-only cache dir costs speed, never correctness
  }
}

/** "3h ago" — how old the proof being replayed is. */
export function ageOf(at) {
  const ms = Date.now() - Date.parse(at);
  if (!Number.isFinite(ms) || ms < 0) return 'just now';
  const m = Math.round(ms / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

/**
 * Run `work` (which appends the runtime findings to `report`), or replay a stored verdict in its place.
 *
 * Returns `{ cached: { at, fp } | null, uncacheable: string | null }` so the caller can say which.
 */
export async function withVerdictCache({ kind, id, report, fingerprint, policy }, work) {
  const fp = fingerprint?.fp ?? null;
  const hit = lookupVerdict(kind, id, fp, policy);
  if (hit) {
    for (const f of hit.findings) report.findings.push({ ...f, cached: { at: hit.at, fp } });
    return { cached: { at: hit.at, fp }, uncacheable: null };
  }
  const start = report.findings.length;
  await work();
  if (policy?.enabled && fp) storeVerdict(kind, id, fp, report.findings.slice(start));
  return { cached: null, uncacheable: fingerprint?.uncacheable ?? null };
}
