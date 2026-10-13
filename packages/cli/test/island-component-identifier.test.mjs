// Which identifier an island file mounts — read from the declaration, never from a comment.
//
// `islandComponentIdentifier` matched `component: <name>` and `island('x-tag', <name>)` against the
// raw file text, so a comment saying "it wraps the application's OWN component: the admin dialog…"
// was read as `component: the`. Every check that follows the identifier to its import then looked for
// an import named `the`, found none, and `island verify` reported "no island component at
// src/ui/<kebab>/<Pascal>.tsx" for a wrapped component sitting right in front of it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { islandComponentIdentifier } from '../src/lib/util.mjs';

test('a `component:` inside a line comment is not the declaration', () => {
  const text = [
    "// It wraps the application's OWN component: the admin dialog keeps rendering it directly.",
    "import { MemberProfilePanel } from '@/components/member-profile-panel';",
    "import { island } from './contracts.generated';",
    '',
    "export const element = island('x-member-profile-panel', MemberProfilePanel);",
  ].join('\n');
  assert.equal(islandComponentIdentifier(text), 'MemberProfilePanel');
});

test('a `component:` inside a block comment is not the declaration', () => {
  const text = [
    '/* component: Nope */',
    "import { Real } from './real';",
    "export const element = islandElement({ tag: 'x-real', component: Real });",
  ].join('\n');
  assert.equal(islandComponentIdentifier(text), 'Real');
});

test('the short form with double quotes is read too', () => {
  assert.equal(islandComponentIdentifier('export const element = island("x-a", A);'), 'A');
});

test('a string containing `component:` is left alone and the real property still wins', () => {
  const text = "const why = 'see component: docs'; export const element = islandElement({ component: Real });";
  assert.equal(islandComponentIdentifier(text), 'Real');
});
