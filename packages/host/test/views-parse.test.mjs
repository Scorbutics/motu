// The pages this host renders itself parse, and render.
//
// SAME HAZARD AS packages/chrome's STYLESHEETS. `SHELL_CSS` here is a template literal, so a backtick
// written in one of its comments — around a class name, which is the natural way to write about one —
// ends the CSS string, and what follows becomes JavaScript. It fails at IMPORT rather than at parse,
// so `node --check` passes and the first thing that notices is `next build` reporting "failed to
// collect page data" for the route that imports this, with the host's own service down behind it.
// That is exactly what happened, for the text `.motu-breathe` inside a comment.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const NOW = '2026-01-01T00:00:00.000Z';

test('every page this host renders builds a document', async () => {
  const views = await import('../src/views.mjs');

  const composed = views.composedPage({
    id: 'm1',
    group: 'product',
    members: [{ repo: 'owner/name', slug: 'all', sha: 'abc1234def', title: 'A lagoon', live: true }],
  });
  assert.ok(composed.startsWith('<!doctype html>'));
  // The rail's header is the index's own water at rail size, and a live member breathes with the
  // kit's ring rather than a second keyframe of the same name.
  assert.match(composed, /class="motu-bay compact" data-shape="masthead"/);
  assert.match(composed, /class="live-dot motu-breathe"/);
  // ONCE, not never: the kit defines it and this page loads the kit. A second definition is what the
  // browser silently prefers, for every element in the document, and is what was here.
  assert.equal(
    (composed.match(/@keyframes motu-breathe\s*\{/g) ?? []).length,
    1,
    'the kit owns this keyframe — a second definition would outrank it everywhere',
  );

  const repo = views.repoIndexPage({
    repo: 'owner/name',
    aliases: { latest: { all: 1 } },
    history: [
      { id: 1, sha: 'abc1234def', slug: 'all', branch: 'main', publishedAt: NOW, title: 'A lagoon' },
      { id: 2, sha: '9876543210', slug: 'all', branch: 'main', publishedAt: NOW },
    ],
  });
  assert.match(repo, /data-shape="masthead"/);
  assert.match(repo, /<main class="motu-page"/);
  // The action is the row's only outbound link. An <a> inside an <a> closes the outer one, which put
  // the sub line and the button outside the card they belong to.
  assert.match(repo, /<a class="motu-open" href="\/owner\/name\/latest\/all">/);
  assert.doesNotMatch(repo, /<a class="motu-row"[^>]*>(?:(?!<\/a>)[\s\S])*<a /, 'no anchor inside an anchor');
  // History fades with age rather than dividing the list.
  assert.match(repo, /--age:1/);

  assert.ok(views.errorPage(404, 'nothing at owner/name/latest/all').includes('nothing at'));
});
