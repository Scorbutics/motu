// THE COMPARISON, on its own — because nothing in this repository can drive it end to end.
//
// `data-reach` only fires when a project installs the wire fake (`@motu/runtime/postgrest-fetch`), and
// no project here does: motu's own hosts talk to their backends through other seams. So the check
// cannot be exercised by running `motu check` on this repo, and "it passed" would mean "it never ran".
// These drive `reportReachDrift` directly, over the shape `DataReach.by` produces.
import { reportReachDrift } from '../src/commands/verify.mjs';

let pass = 0, fail = 0;
const t = (name, ok, detail = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ' -> ' + detail : ''}`); };

/** A report stand-in that just collects, so the assertions are about findings and not about printing. */
const collector = () => {
  const found = [];
  return { found, warn: (id, msg) => found.push(['warn', id, msg]), ok: (id, msg) => found.push(['ok', id, msg]) };
};

// --- exactly what it declared --------------------------------------------------------------------
{
  const r = collector();
  reportReachDrift(r, { 'island:x-shot-list': ['table:shots(select)'] }, { 'island:x-shot-list': ['table:shots(select)'] }, 'region');
  t('a matching declaration is an ok, not silence', r.found.length === 1 && r.found[0][0] === 'ok', JSON.stringify(r.found));
}

// --- reached something it never declared ---------------------------------------------------------
{
  const r = collector();
  reportReachDrift(r, { 'island:x-shot-list': ['table:shots(select)', 'table:repos(select)'] }, { 'island:x-shot-list': ['table:shots(select)'] }, 'region');
  const [level, id, msg] = r.found[0];
  t('an undeclared reach warns and names it', level === 'warn' && id === 'data-reach' && msg.includes('table:repos(select)'), msg);
  t('and it points at the island\'s own declaration', msg.includes('contract.effects'), msg);
}

// --- declared something it never reached ---------------------------------------------------------
{
  const r = collector();
  reportReachDrift(r, { 'source:shots': ['table:shots(select)'] }, { 'source:shots': ['table:shots(select)', 'rpc:gone'] }, 'region');
  const msg = r.found[0][2];
  t('an unexercised declaration warns, naming BOTH readings', msg.includes('rpc:gone') && msg.includes('nothing exercised') && msg.includes('no flow drives'), msg);
}

// --- a source points at `reaches`, not at ambient -------------------------------------------------
{
  const r = collector();
  reportReachDrift(r, { 'source:shots': ['rpc:accept_shots'] }, { 'source:shots': ['table:shots(select)'] }, 'region');
  t('a source is told to fix `reaches`', r.found.some(([, , m]) => m.includes('`reaches`')), JSON.stringify(r.found));
}

// --- a method-less declaration covers every method -----------------------------------------------
{
  const r = collector();
  reportReachDrift(r, { 'island:x-a': ['table:shots(select)', 'table:shots(insert)'] }, { 'island:x-a': ['table:shots'] }, 'region');
  t('`table:shots` covers select and insert without pinning either', r.found.length === 1 && r.found[0][0] === 'ok', JSON.stringify(r.found));
}

// --- an owner that declared NOTHING is not reported ------------------------------------------------
// Opt-in per island and per source: reporting the absence of a declaration would make adopting the
// feature indistinguishable from failing it, which is how a warning gets switched off wholesale.
{
  const r = collector();
  reportReachDrift(r, { 'island:x-undeclared': ['table:whatever(select)'] }, { 'island:x-declared': ['table:shots'] }, 'region');
  t('an owner with no declaration is left alone', !r.found.some(([, , m]) => m.includes('x-undeclared')), JSON.stringify(r.found));
}

// --- nobody declared anything: the check says nothing at all ---------------------------------------
{
  const r = collector();
  reportReachDrift(r, { 'island:x-a': ['table:shots(select)'] }, {}, 'region');
  t('no declarations anywhere means no findings, not a false pass', r.found.length === 0, JSON.stringify(r.found));
}

// --- declared, but the run observed nothing for it -------------------------------------------------
{
  const r = collector();
  reportReachDrift(r, {}, { 'island:x-a': ['table:shots(select)'] }, 'region');
  t('a declaration nothing reached is reported, without calling it stale', r.found.some(([, , m]) => m.includes('nothing exercised')), JSON.stringify(r.found));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
