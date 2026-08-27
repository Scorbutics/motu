// The sign-in source, driven DIRECTLY — the branches no rendered state tells apart.
//
// A region flow drives this source through the screen, so it reaches what a member can see: the
// handoff starting, and the message when it does not. What it cannot reach is in here — the race
// between two clicks, and the reason there is no success branch at all. The source owns no framework
// and no motu, which is what makes this test cheap enough to be worth having.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSigninSource, isSafeReturn } from '../app/signin/signin-source.ts';
import type { SigninPort } from '../app/signin/signin-source.ts';

/** A port whose promise this test resolves or rejects by hand, so the race is deterministic. */
function deferredPort() {
  const calls: Array<{ args: unknown[]; resolve: () => void; reject: (e: unknown) => void }> = [];
  const port: SigninPort = {
    signInWithGitHub: (returnTo) =>
      new Promise<void>((resolve, reject) => {
        calls.push({ args: [returnTo], resolve, reject: (e) => reject(e) });
      }),
  };
  return { port, calls };
}

test('asking reports the handoff, and clears the previous failure', async () => {
  const { port, calls } = deferredPort();
  const source = createSigninSource(port);

  assert.deepEqual(source.getState(), { signingIn: false, signInError: null, destination: null });
  void source.signIn();
  // No `?next=`, so the granted destination is the index rather than a refusal: an ordinary visit is
  // not a failure, and this is the branch that makes the region flow's assertion non-constant.
  assert.deepEqual(source.getState(), { signingIn: true, signInError: null, destination: '/' });
  assert.equal(calls.length, 1);
});

test('a refused handoff keeps the provider’s own words', async () => {
  const { port, calls } = deferredPort();
  const source = createSigninSource(port);
  void source.signIn();
  calls[0]!.reject(new Error('Unsupported provider: provider is not enabled'));
  await new Promise((r) => setImmediate(r));

  assert.deepEqual(source.getState(), {
    signingIn: false,
    signInError: 'Unsupported provider: provider is not enabled',
    // CLEARED on failure. A destination left standing would have the control promising to bring them
    // back somewhere while telling them the handoff never happened.
    destination: null,
  });
});

test('a thrown non-Error still says something', async () => {
  // The branch a rendered state cannot distinguish: a client that rejects with a string leaves
  // `(e as Error).message` undefined, and the member would get a blank error box that looks like a
  // working screen. The fallback is the only thing standing between that and a message.
  const { port, calls } = deferredPort();
  const source = createSigninSource(port);
  void source.signIn();
  calls[0]!.reject('not an Error object');
  await new Promise((r) => setImmediate(r));

  assert.equal(source.getState().signInError, 'Could not reach GitHub');
});

test('the slower of two clicks does not overwrite the faster one', async () => {
  // Two in flight, and the FIRST one fails after the second has started. Without the generation
  // guard, the stale rejection lands and a member who is already being redirected is told the
  // sign-in failed — a screen that contradicts what is about to happen to them.
  const { port, calls } = deferredPort();
  const source = createSigninSource(port);

  void source.signIn();
  void source.signIn();
  assert.equal(calls.length, 2);

  calls[0]!.reject(new Error('the stale one'));
  await new Promise((r) => setImmediate(r));

  assert.deepEqual(
    source.getState(),
    { signingIn: true, signInError: null, destination: '/' },
    'still handing over',
  );

  calls[1]!.reject(new Error('the current one'));
  await new Promise((r) => setImmediate(r));
  assert.equal(source.getState().signInError, 'the current one');
});

test('a resolved handoff never goes idle again — success is a navigation, not a state', async () => {
  // The asymmetry the source documents, pinned. In production `signInWithOAuth` unloads the page, so
  // nothing after the await runs; if this ever started setting `signingIn: false` on success, the
  // lagoon would preview a button going idle with the member still sitting there — a state the
  // application cannot reach, previewed as if it could.
  const { port, calls } = deferredPort();
  const source = createSigninSource(port);
  void source.signIn();
  calls[0]!.resolve();
  await new Promise((r) => setImmediate(r));

  assert.deepEqual(source.getState(), { signingIn: true, signInError: null, destination: '/' });
});

test('dispose stops a late answer from moving the state', async () => {
  const { port, calls } = deferredPort();
  const source = createSigninSource(port);
  void source.signIn();
  source.dispose();
  calls[0]!.reject(new Error('too late'));
  await new Promise((r) => setImmediate(r));

  assert.equal(source.getState().signInError, null);
});

test('the declared intent is what an island asks for', async () => {
  // The wiring the archipelago names: `intents: { 'sign-in-requested': 'signin-start' }`. If this
  // handler were renamed, the button would emit into nothing and the screen would look idle forever.
  const { port, calls } = deferredPort();
  const source = createSigninSource(port);
  source.intents['signin-start']({ returnTo: '/motu-review/latest/all' });
  assert.equal(calls.length, 1);
  assert.equal(source.getState().signingIn, true);
});

test('an off-host return address is refused before anything leaves', async () => {
  // The open-redirect guard, and the reason it is HERE rather than on the page: this runs in the
  // lagoon and under this test, and a copy on the server would be a second rule to keep in step.
  const { port, calls } = deferredPort();
  const source = createSigninSource(port);

  await source.signIn({ returnTo: '//evil.example/harvest' });
  assert.equal(calls.length, 0, 'the handoff never started');
  assert.deepEqual(source.getState(), {
    signingIn: false,
    signInError:
      'Cannot return to //evil.example/harvest after signing in — that address would leave this ' +
      'host. Open the lagoon again without it.',
    destination: null,
  });
});

test('a protocol-relative address is the case a slash test misses', () => {
  // `//evil.example` starts with a slash and the browser still leaves the host. Pinned separately
  // because the naive guard passes every other case in this file.
  assert.equal(isSafeReturn('/motu-review/latest/all'), true);
  assert.equal(isSafeReturn('//evil.example/harvest'), false);
  assert.equal(isSafeReturn('https://evil.example/harvest'), false);
});

test('the address is carried through to the port unchanged', async () => {
  const { port, calls } = deferredPort();
  const source = createSigninSource(port);
  void source.signIn({ returnTo: '/acme/repo/latest/cart' });
  assert.deepEqual(calls[0]!.args, ['/acme/repo/latest/cart']);
});
