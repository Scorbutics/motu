// The HMR socket address a `motu lagoon dev` bakes into its client.
//
// This is a regression test for a reload LOOP, not for a config shape. Pinning the host and the port
// sent a browser on localhost to `wss://<lagoon-host>/…/__motu_hmr`; that handshake failed, and because
// a port was pinned Vite skipped its direct-connection fallback and fell into "server connection lost.
// Polling for restart…" — which pings the page's own origin, succeeds, and calls `location.reload()`.
// Roughly one reload every 1.5s, for as long as the page stayed open, with nothing in any log naming
// the cause. See hmrForHost's own doc.
//
// The invariant is therefore NEGATIVE: no host, no port, no protocol may be pinned, so that every
// viewer's client derives the socket from where it loaded the page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hmrForHost } from '../src/commands/lagoon.mjs';

test('pins the path and nothing else, so each viewer connects to its own origin', () => {
  const hmr = hmrForHost({ slug: 'all', repo: 'owner/app', base: 'https://lagoon.example.com' });

  assert.equal(hmr.path, '__motu_hmr');
  for (const key of ['host', 'clientPort', 'port', 'protocol']) {
    assert.equal(hmr[key], undefined, `${key} is pinned — a local viewer would be sent to the host and reload-loop`);
  }
});

test('no configured host means no HMR override at all', () => {
  assert.equal(hmrForHost({ slug: 'all', repo: 'owner/app', base: undefined }), null);
});
