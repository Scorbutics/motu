// WHICH REGIONS ARE WATCHED — and why "*" exists when absence already means the same thing.
//
// A config file cannot distinguish "we want every region" from "somebody forgot this line". The
// wildcard is a decision an author can be held to; it also survives a region being added later, which
// an explicit list silently excludes with nothing to say so.
import { configureCoverage, installRegionCoverage, resetRegionCoverage } from '../dist/index.js';
import { setRegionCoverageInstaller } from '../../core/dist/sandbox.js';

let pass = 0, fail = 0;
const t = (n, ok, d = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? ` -> ${d}` : ''}`); };

// No store is registered for these ids, so `installRegionCoverage` returns a handle only when the
// region PASSES the filter and then a noop — what matters here is null (filtered) versus not.
const watched = (regions, id) => {
  resetRegionCoverage();
  configureCoverage(regions === undefined ? { enabled: true } : { enabled: true, regions });
  return installRegionCoverage(id) !== null;
};

console.log('\ncoverage — which regions are watched\n');
t('a named region is watched', watched(['actions'], 'actions'));
t('...and one not named is not', !watched(['actions'], 'directory'));
t('"*" watches a region nobody named', watched(['*'], 'directory'));
t('...and every other one too', watched(['*'], 'club') && watched(['*'], 'ambassador'));
t('absent still means every region', watched(undefined, 'directory'));
t('"*" beside a name is still every region', watched(['actions', '*'], 'club'));
t('an empty list watches nothing', !watched([], 'actions'));

setRegionCoverageInstaller(null);
resetRegionCoverage();
console.log(`\n${fail === 0 ? 'PASS' : `FAIL — ${fail} assertion(s)`}  (${pass} passed)`);
process.exit(fail ? 1 : 0);
