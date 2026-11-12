// `exclusiveDeclared` — what the `exclusive` check reads out of an archipelago file, without importing
// it (a `root` is the application's component, and importing one drags the app's UI into the CLI).
//
// What has to hold: every slot form is read (string, `{ slot, when|unless }`, `{ region }`), host
// slots are named, groups come back as written — and a group that is not an array of string literals
// is REPORTED as unreadable rather than dropped, because a group silently missing from the check is a
// guarantee nobody is checking. An unparseable file is `null`, which is "unknown", never "no groups".
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exclusiveProblems, undeclaredAlternatives } from '@motu/core';
import { exclusiveDeclared } from '../src/lib/lagoon-declares.mjs';

function withFile(text, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'motu-excl-'));
  try {
    const file = join(dir, 'x.archipelago.ts');
    writeFileSync(file, text);
    return fn(file);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const REVIEW = `
import { archipelago } from '@motu/core';
import { ReviewLayout } from './layout';
import { Skeleton } from './skeleton';
export const review = archipelago<R>()({
  id: 'review',
  root: ReviewLayout,
  slots: {
    summary: 'status-summary',
    projects: { slot: 'repo-picker', unless: 'scopedRepo' },
    'accept': { slot: 'accept-bar' },
    team: { region: 'equipage' },
  },
  hostSlots: { placeholder: Skeleton },
  exclusive: [['accept', 'connect'], ['summary', 'placeholder']],
  islands: [{ slot: 'accept-bar', element: 'x-accept-bar' }],
} as const, { ownership: true });
`;

test('reads every slot form, the host slots and the groups as written', () => {
  const d = withFile(REVIEW, exclusiveDeclared);
  assert.equal(d.root, true);
  assert.deepEqual(d.slots, {
    summary: 'status-summary',
    projects: { slot: 'repo-picker', unless: 'scopedRepo' },
    accept: { slot: 'accept-bar' },
    team: { region: 'equipage' },
  });
  assert.deepEqual(d.hostSlots, { placeholder: true });
  assert.deepEqual(d.exclusive, [['accept', 'connect'], ['summary', 'placeholder']]);
  assert.deepEqual(d.unreadable, []);
  // What it reads is exactly what the core verdict takes.
  assert.deepEqual(exclusiveProblems(d), []);
  assert.deepEqual(undeclaredAlternatives(d), []);
});

test('a group that is not string literals is reported, not dropped', () => {
  const d = withFile(REVIEW.replace("['summary', 'placeholder']", '[SUMMARY, `placeholder`]'), exclusiveDeclared);
  assert.deepEqual(d.exclusive, [['accept', 'connect']]);
  assert.deepEqual(d.unreadable, ['[SUMMARY, `placeholder`]']);
  const whole = withFile(REVIEW.replace(/exclusive: \[.*\],/, 'exclusive: GROUPS,'), exclusiveDeclared);
  assert.deepEqual(whole.unreadable, ['GROUPS']);
});

test('the errors the check reports come out of a real file', () => {
  const noRoot = withFile(REVIEW.replace('root: ReviewLayout,', ''), exclusiveDeclared);
  assert.deepEqual(exclusiveProblems(noRoot).map((p) => p.kind), ['no-root', 'no-root']);
  const overlap = withFile(REVIEW.replace("['summary', 'placeholder']", "['accept', 'placeholder']"), exclusiveDeclared);
  assert.deepEqual(exclusiveProblems(overlap).map((p) => [p.kind, p.prop]), [['overlap', 'accept']]);
});

test('a when/unless pair nobody grouped is found in a real file', () => {
  const login = withFile(
    `export const login = archipelago<R>()({ id: 'login', root: L,
       slots: { authError: { slot: 'auth-error', when: 'authError' }, form: { slot: 'login-form', unless: 'authError' } },
       islands: [] } as const, {});`,
    exclusiveDeclared,
  );
  assert.deepEqual(undeclaredAlternatives(login), [{ key: 'authError', when: 'authError', unless: 'form' }]);
});

test('an unparseable or missing file is unknown, not empty', () => {
  assert.equal(exclusiveDeclared('/nonexistent/x.archipelago.ts'), null);
  assert.equal(withFile('export const nothing = 1;', exclusiveDeclared), null);
});
