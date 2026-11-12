// EXCLUSIVE ROOT PROPS — `exclusive: [['accept', 'connect']]`: at most one member non-null per render.
//
// The guarantee is the compiler's (`RootPropsOf`, pinned in packages/react/test/exclusive-types.test.mjs).
// These pin the three functions everything else reads, so the CLI, `<X.Root>` and the lagoon cannot
// disagree about what a group is, what breaks one, and which alternative the lagoon shows.
//
// Run: node --test packages/core/test/exclusive.test.mjs   (after `node scripts/build-packages.mjs`)
import test from 'node:test';
import assert from 'node:assert/strict';
import { exclusiveProblems, exclusiveViolations, keepOneAlternative, undeclaredAlternatives } from '../dist/index.js';

const Root = () => null;
const review = {
  root: Root,
  slots: { accept: { slot: 'accept-bar' }, shots: 'shot-list' },
  exclusive: [['accept', 'connect']],
};

test('a clean declaration has no problems — a pass-through member is trusted when the root props are unknown', () => {
  assert.deepEqual(exclusiveProblems(review), []);
});

test('a pass-through member that is not a prop of the root is unknown, once the root props are known', () => {
  const problems = exclusiveProblems(review, ['title', 'shots']);
  assert.deepEqual(problems.map((p) => [p.kind, p.prop]), [['unknown', 'connect']]);
  assert.deepEqual(exclusiveProblems(review, ['connect']), []);
});

test('refused: no root, a group of one, the same member twice, a prop in two groups', () => {
  assert.equal(exclusiveProblems({ ...review, root: undefined })[0].kind, 'no-root');
  assert.deepEqual(exclusiveProblems({ ...review, exclusive: [['accept']] }).map((p) => p.kind), ['size']);
  assert.deepEqual(exclusiveProblems({ ...review, exclusive: [['accept', 'accept']] }).map((p) => p.kind), ['size']);
  const overlap = exclusiveProblems({ ...review, exclusive: [['accept', 'connect'], ['shots', 'accept']] });
  assert.deepEqual(overlap.map((p) => [p.kind, p.prop]), [['overlap', 'accept']]);
});

test('a violation is two non-null members; null and undefined are absent, and other props do not count', () => {
  assert.deepEqual(exclusiveViolations(review, { accept: 'A', connect: null, shots: 'S' }), []);
  assert.deepEqual(exclusiveViolations(review, { connect: 'C' }), []);
  assert.deepEqual(exclusiveViolations(review, { accept: 'A', connect: 'C' }), [
    { group: ['accept', 'connect'], set: ['accept', 'connect'] },
  ]);
  // A falsy value that is not null is still something on screen — `0` renders as "0".
  assert.equal(exclusiveViolations(review, { accept: 0, connect: '' }).length, 1);
});

test('the lagoon keeps the first member still standing, in the order the group is written', () => {
  assert.deepEqual(keepOneAlternative(review, { accept: 'A', connect: 'C', shots: 'S' }), { accept: 'A', connect: null, shots: 'S' });
  // `when`/`unless` already removed the first: the second is the one shown, not neither.
  assert.deepEqual(keepOneAlternative(review, { accept: null, connect: 'C' }), { accept: null, connect: 'C' });
  const props = { accept: 'A' };
  assert.equal(keepOneAlternative({}, props), props, 'no group: the same object back');
});

test('a when/unless pair on one key is an undeclared either/or until a group covers it', () => {
  const login = {
    root: Root,
    slots: { authError: { slot: 'auth-error', when: 'authError' }, form: { slot: 'login-form', unless: 'authError' }, help: 'help' },
  };
  assert.deepEqual(undeclaredAlternatives(login), [{ key: 'authError', when: 'authError', unless: 'form' }]);
  assert.deepEqual(undeclaredAlternatives({ ...login, exclusive: [['form', 'authError']] }), []);
  // `unless` alone (review's picker, hidden when scoped) is a condition, not an either/or.
  assert.deepEqual(undeclaredAlternatives({ root: Root, slots: { projects: { slot: 'repo-picker', unless: 'scopedRepo' } } }), []);
});
