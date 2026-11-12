// `motu assurance [id] [--json]` — one row per declared thing, with the strongest evidence that holds
// it. See lib/assurance.mjs for the levels and docs/proposals/constraint-loop.md (item 3) for why.
import { readRegions } from '../lib/eject.mjs';
import { assuranceRows, summarize, LEVELS } from '../lib/assurance.mjs';
import { color, paths } from '../lib/util.mjs';
import { readScenariosFor } from './verify/region-flows.mjs';

const tint = (level) =>
  level === 'unchecked' ? color.red(level) : level === 'static' ? color.yellow(level) : level === 'runtime·emit' ? color.yellow(level) : color.green(level);

export function assuranceCommand(argv) {
  const only = argv._?.[0];
  const regions = readRegions(paths.archipelagosDir).filter((r) => !only || r.id === only);
  if (only && !regions.length) {
    console.error(color.red(`✗ no region "${only}"`));
    return 2;
  }
  const out = regions.map((r) => {
    const rows = assuranceRows(r, readScenariosFor(r.id));
    return { region: r.id, rows, summary: summarize(rows) };
  });
  if (argv.json) {
    console.log(JSON.stringify({ levels: LEVELS, note: 'levels are what the evidence CLAIMS; motu check --runtime confirms them', regions: out }, null, 2));
    return 0;
  }
  console.log(color.bold('\nmotu assurance — what each declaration is held by\n'));
  for (const { region, rows, summary } of out) {
    console.log(color.bold(`  ${region}`) + color.dim(`  ${summary.total} declared thing(s) · weakest: ${summary.weakest}`));
    for (const r of rows) {
      console.log(`    ${tint(r.level).padEnd(22)} ${color.dim(r.kind.padEnd(5))} ${r.subject}`);
      console.log(`      ${color.dim(r.evidence)}`);
      if (r.missing) console.log(`      ${color.yellow('missing:')} ${r.missing}`);
    }
    console.log('');
  }
  console.log(color.dim('  Levels are what the evidence CLAIMS; `motu check --runtime` is what confirms them.'));
  console.log(color.dim(`  ${LEVELS.join(' < ')}`));
  // Reporting, not gating: a level is information for a person to decide about, not a failure.
  return 0;
}
