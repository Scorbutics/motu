// The screens check reads navigation targets without evaluating anything. Each case is a shape the
// demo app actually writes; the last two are the boundaries — a target it cannot read must say so,
// and a target that MATCHES the wrong route passes (the documented limit, pinned so it stays honest).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Project, SyntaxKind } from 'ts-morph';
import { compilePath, served, targetsOf } from '../src/lib/screens.mjs';

const SCREENS = [{ path: '/' }, { path: '/add' }, { path: '/events' }, { path: '/member/:memberId' }, { path: '/chapters' }, { path: '/chapters/:slug' }];

function targets(code) {
  const sf = new Project({ useInMemoryFileSystem: true }).createSourceFile('a.ts', code);
  const call = sf.getDescendantsOfKind(SyntaxKind.CallExpression).find((c) => /\.navigate$/.test(c.getExpression().getText()));
  return targetsOf(call.getArguments()[0], sf);
}

test('compilePath matches whole paths, params as one segment', () => {
  assert.ok(compilePath('/member/:memberId').test('/member/abc'));
  assert.ok(!compilePath('/member/:memberId').test('/member/abc/edit'));
  assert.ok(compilePath('/').test('/'));
  assert.ok(!compilePath('/').test('/events'));
});

test('a literal, a prefix, a ternary and a path map are all read', () => {
  assert.deepEqual(targets(`host.navigate('/add')`), [{ kind: 'exact', value: '/add' }]);
  assert.deepEqual(targets(`host.navigate('/member/' + encodeURIComponent(String(id)))`), [{ kind: 'prefix', value: '/member/' }]);
  assert.deepEqual(targets("host.navigate(`/member/${id}`)"), [{ kind: 'prefix', value: '/member/' }]);
  assert.deepEqual(
    targets(`host.navigate(slug ? '/chapters/' + slug : '/chapters')`),
    [{ kind: 'prefix', value: '/chapters/' }, { kind: 'exact', value: '/chapters' }],
  );
  assert.deepEqual(
    targets(`const PATHS = { a: '/', b: '/events' }; host.navigate(PATHS[s] ?? '/')`),
    [{ kind: 'exact', value: '/' }, { kind: 'exact', value: '/events' }, { kind: 'exact', value: '/' }],
  );
});

test('served: a prefix needs a parameterised route behind it', () => {
  assert.ok(served(SCREENS, { kind: 'prefix', value: '/member/' }));
  assert.ok(!served(SCREENS, { kind: 'exact', value: '/settings' }));
  assert.ok(!served(SCREENS, { kind: 'prefix', value: '/settings/' }));
});

test('a target it cannot read is reported, not passed', () => {
  assert.deepEqual(targets(`host.navigate(String(slug))`), [{ unread: 'String(slug)' }]);
});

test('KNOWN LIMIT: a target matching the wrong route passes — "/member/edit" is a profile to the matcher', () => {
  assert.ok(served(SCREENS, { kind: 'exact', value: '/member/edit' }));
});
