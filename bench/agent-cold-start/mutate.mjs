#!/usr/bin/env node
// DEFECT DETECTION, measured — what does each setup CATCH?
//
//   node mutate.mjs --arm region|props --list
//   node mutate.mjs --arm region --apply M3      # inject one regression
//   node mutate.mjs --arm region --revert M3     # put it back
//
// WHY THIS EXISTS. Four rounds of cold-start benches measured ADOPTION COST — tool calls, invocations,
// time to a booting lagoon — on a FIRST change. That is motu's worst case: adoption is paid once and
// whatever it buys accrues to every change afterwards. None of it measured whether the result is any
// better, and the effort numbers could not settle it anyway: two runs of the same task with an
// identical CLI differed by 2x on every metric, purely from the order an agent happened to work in.
//
// So this measures something effort cannot confound: inject the SAME user-visible regression into two
// implementations of the SAME feature, run whatever checks each side has, and record which catches it.
// Deterministic, repeatable, no agent in the loop.
//
// THE REGRESSIONS ARE NOT CHOSEN BY THE PERSON WHO WROTE THE CHECKS. They were authored by an agent
// given both implementations and asked for plausible developer mistakes, explicitly forbidden from
// investigating what tooling either side has — because a mutation set written by the framework's
// author measures the author's imagination, not the framework.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BENCH = '/home/scorbutics/dev/motu-bench';

/**
 * Which pairing to drive. A pairing is one repository holding two implementations of one feature and
 * a mutation document written against both.
 *
 * `formbricks` was the first and could not be measured on the region side: its region contains an
 * island the lagoon cannot bundle, so its flows are red before any mutation is applied. `shlink` is
 * the pairing that works — a fully bundlable region, and a control that has its own test suite.
 */
const PAIRINGS = {
  formbricks: { root: 'formbricks', spec: 'runs/mutations/mutations.md' },
  shlink: { root: 'shlink', spec: 'runs/mutations-shlink/mutations.md' },
};

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? null : (args[i + 1] ?? true);
};
const arm = flag('arm');
const pairing = PAIRINGS[String(flag('pairing') ?? 'shlink')];
if (!pairing) throw new Error(`unknown --pairing; expected one of ${Object.keys(PAIRINGS).join(', ')}`);
const SPEC = resolve(BENCH, pairing.spec);
const ROOT = resolve(BENCH, pairing.root);
const listOnly = args.includes('--list');
const apply = flag('apply');
const revert = flag('revert');

/** Parse the mutation document into `{ id, name, symptom, edits: { region, props } }`. */
function parseSpec() {
  const text = readFileSync(SPEC, 'utf8');
  const out = [];
  for (const block of text.split(/^## /m).slice(1)) {
    const id = block.match(/^(M\d+)/)?.[1];
    if (!id) continue;
    const name = block.split('\n')[0].replace(/^M\d+\s*[—-]\s*/, '').trim();
    const symptom = block.match(/\*\*User-visible symptom:\*\*\s*(.+)/)?.[1]?.trim() ?? '';
    const edits = {};
    for (const armBlock of block.split(/^### /m).slice(1)) {
      const which = armBlock.split('\n')[0].trim();
      const file = armBlock.match(/file:\s*(\S+)/)?.[1];
      // Fenced or bare: the author writes `find:` / `replace:` followed by the text, and either form
      // has to parse — a spec that only reads when it is formatted perfectly is a spec nobody can use.
      const find = armBlock.match(/find:\s*\n?([\s\S]*?)\nreplace:/)?.[1];
      const replace = armBlock.match(/replace:\s*\n?([\s\S]*?)(?:\n### |\n## |$)/)?.[1];
      if (file && find != null && replace != null) {
        edits[which] = { file, find: strip(find), replace: strip(replace) };
      }
    }
    out.push({ id, name, symptom, edits });
  }
  return out;
}

/** Drop code fences and outer blank lines, keeping the text's own indentation. */
function strip(s) {
  let t = s
    .replace(/^\s*```[a-z]*\n?/i, '')
    .replace(/\n?```\s*$/i, '')
    .replace(/^\n+|\n+$/g, '');
  // INLINE BACKTICKS TOO. The author wrote single-line edits as markdown inline code, so the target
  // text carried a leading and trailing backtick and matched nothing — the harness correctly refused
  // rather than silently applying a mutation to the wrong place, which is what it is for.
  const lines = t.split('\n');
  if (lines.every((l) => /^\s*`.*`\s*$/.test(l) || !l.trim())) {
    t = lines.map((l) => l.replace(/^(\s*)`(.*)`\s*$/, '$1$2')).join('\n');
  }
  return t;
}

const mutations = parseSpec();

if (listOnly || (!apply && !revert)) {
  for (const m of mutations) {
    const both = m.edits.region && m.edits.props ? 'both' : Object.keys(m.edits).join(',') || 'NONE';
    console.log(`${m.id}  [${both}]  ${m.name}\n    ${m.symptom}`);
  }
  process.exit(0);
}

const id = apply || revert;
const m = mutations.find((x) => x.id === id);
if (!m) throw new Error(`no mutation ${id}`);
const edit = m.edits[arm];
if (!edit) throw new Error(`mutation ${id} has no edit for arm '${arm}'`);

const file = resolve(ROOT, edit.file);
const before = readFileSync(file, 'utf8');
const [from, to] = apply ? [edit.find, edit.replace] : [edit.replace, edit.find];

// EXACTLY ONE OCCURRENCE, or refuse. A mutation applied twice, or to the wrong line, silently changes
// what the experiment measured — and a "not found" that is treated as a no-op would score the arm as
// catching nothing when nothing was injected.
const count = before.split(from).length - 1;
if (count !== 1) {
  console.error(`✗ ${id}/${arm}: found ${count} occurrence(s) of the target text in ${edit.file} — expected exactly 1`);
  console.error(`  looking for:\n${from}`);
  process.exit(2);
}
writeFileSync(file, before.replace(from, to));
console.log(`✓ ${apply ? 'applied' : 'reverted'} ${id} on ${arm}: ${edit.file}`);
