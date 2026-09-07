// Which sources a host file INSTALLS, when the region declares them by reference.
//
// THE BUG THIS CLOSES. `integrate check`'s `source` rule asked one question of both declaration
// forms: does a host file that uses the region IMPORT the source's module? That is the right
// question for `{ module, produces }` — a claim about somebody else's code, which the page has to
// reach for itself. It is the wrong question for `shots: shotsSource`, where the ARCHIPELAGO holds
// the import and the page installs it by name:
//
//   channelFrom({ to: reviewArchipelago, id: 'shots', args: [port] })
//
// So this host's own review console — the shape the docs recommend — reported a real installation as
// missing, and every push was red for it. `channelFrom` itself draws the same line: handed a source
// declared by module name only, it throws "there is nothing to install".
//
// Each case below is a shape a regex over the call text gets wrong, or a property of the check.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { channelSourceIds } from '../src/commands/integration.mjs';

const dir = mkdtempSync(join(tmpdir(), 'motu-channel-sources-'));
let n = 0;
const ids = (body, regionId = 'review') => {
  const file = join(dir, `s${n++}.tsx`);
  writeFileSync(file, body);
  return channelSourceIds(file, regionId);
};

test('reads the id a channelFrom installs', () => {
  assert.deepEqual(
    ids(`const R = createRegion(reviewArchipelago, {
      channels: [channelFrom({ to: reviewArchipelago, id: 'shots', args: [port] })],
    })`),
    ['shots'],
  );
});

test('an argument that ends in a brace does not truncate the call', () => {
  // `args: [fixtures, { now }]` — a regex reaching for the call's closing `})` stops on the `}` of
  // the last argument and never sees the `id`. This is why the call is parsed rather than matched.
  assert.deepEqual(
    ids(`channelFrom({ args: [fixtures, { now }], to: reviewArchipelago, id: 'shots' })`),
    ['shots'],
  );
});

test('a channel for ANOTHER region does not answer for this one', () => {
  assert.deepEqual(
    ids(`channelFrom({ to: signinArchipelago, id: 'shots', args: [port] })`),
    [],
  );
});

test('several channels in one composition root are all read', () => {
  assert.deepEqual(
    ids(`createRegion(reviewArchipelago, { channels: [
      channelFrom({ to: reviewArchipelago, id: 'shots', args: [port] }),
      channelFrom({ to: reviewArchipelago, id: 'repos', args: [port] }),
    ] })`),
    ['shots', 'repos'],
  );
});

test('a `to` that is not a plain identifier is COUNTED, not dropped', () => {
  // The failure this check is repairing was a false red, and a false red is the expensive direction:
  // it sends someone looking for an import that should not exist. An assembled or re-exported
  // archipelago is still an installation of that id.
  assert.deepEqual(ids(`channelFrom({ to: regions.review, id: 'shots', args: [port] })`), ['shots']);
});

test('a computed id is not guessed at, and an unreadable file does not throw', () => {
  assert.deepEqual(ids(`channelFrom({ to: reviewArchipelago, id: which, args: [port] })`), []);
  assert.deepEqual(channelSourceIds(join(dir, 'no-such-file.tsx'), 'review'), []);
});

test('a file with no channel at all installs nothing', () => {
  assert.deepEqual(ids(`const R = createRegion(reviewArchipelago, { elements: ELEMENT_REGISTRY })`), []);
});
