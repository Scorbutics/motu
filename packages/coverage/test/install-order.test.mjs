// A REGION DEFINED BEFORE COVERAGE IS CONFIGURED MUST STILL BE PICKED UP.
//
// Both are module-scope side effects in a generated barrel, so which runs first is decided by the
// order of two import lines. `offerRegionToCoverage` used to call the installer or silently do
// nothing, which made that ordering load-bearing and invisible: everything imports, everything
// type-checks, the config is in the client bundle, and no beacon is ever sent.
//
// It is not hypothetical. Moving coverage out of the island registry produced exactly this — the
// archipelago registry imports its archipelagos above the generated module, so every region defined
// itself before the installer existed, and coverage was silently off in production.
import { setRegionCoverageInstaller, offerRegionToCoverage } from '../../core/dist/sandbox.js';

let pass = 0, fail = 0;
const t = (n, ok, d = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? ` -> ${d}` : ''}`); };

console.log('\ncoverage install order\n');

// THE ORDER THAT BROKE: the region goes past the seam first.
setRegionCoverageInstaller(null);
const seen = [];
offerRegionToCoverage('actions', { enums: ['viewMode'] });
offerRegionToCoverage('directory', {});
t('nothing is installed while the seam is empty', seen.length === 0);
setRegionCoverageInstaller((id, opts) => seen.push([id, opts.enums ?? []]));
t('both regions are picked up when the seam fills', seen.length === 2, JSON.stringify(seen.map((s) => s[0])));
t('...with the options they offered', JSON.stringify(seen[0]) === '["actions",["viewMode"]]', JSON.stringify(seen[0]));

// THE ORDER THAT ALWAYS WORKED, which must keep working.
setRegionCoverageInstaller(null);
const later = [];
setRegionCoverageInstaller((id) => later.push(id));
offerRegionToCoverage('club', {});
t('a region offered after the seam fills is installed at once', later.length === 1 && later[0] === 'club');

// Draining must not replay: a second installer is a new lens/session, not a reason to double-install.
const again = [];
setRegionCoverageInstaller((id) => again.push(id));
t('the queue is drained, not replayed', again.length === 0, JSON.stringify(again));

// A project without coverage never fills the seam, and must not accumulate for ever.
setRegionCoverageInstaller(null);
for (let i = 0; i < 50; i++) offerRegionToCoverage('actions', {});
const drained = [];
setRegionCoverageInstaller((id) => drained.push(id));
t('the same region offered many times installs once', drained.length === 1, String(drained.length));

setRegionCoverageInstaller(null);
console.log(`\n${fail === 0 ? 'PASS' : `FAIL — ${fail} assertion(s)`}  (${pass} passed)`);
process.exit(fail ? 1 : 0);
