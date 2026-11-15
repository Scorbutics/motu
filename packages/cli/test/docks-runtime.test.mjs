// The React half of docks, in CI: runs `docks-runtime.tsx` (a real React tree under happy-dom) and
// fails when it does. The .tsx is where the assertions are; this only puts it in the test glob.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

test('docked islands land where the declarations say, at every moment of the dock region\'s life', () => {
  const res = spawnSync(process.execPath, ['--import', 'tsx', resolve(here, 'docks-runtime.tsx')], {
    cwd: resolve(here, '..'),
    encoding: 'utf8',
    timeout: 120_000,
  });
  const out = `${res.stdout}\n${res.stderr}`;
  assert.equal(res.status, 0, out);
  assert.match(res.stdout, /^PASS/m, out);
});
