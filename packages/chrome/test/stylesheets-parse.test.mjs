// The stylesheets parse, and produce the shapes their callers name.
//
// WHY THIS TEST EXISTS. Every rule in `css.mjs` and `kit.mjs` lives inside a template literal, so one
// backtick written in a comment — around a class name, a property, an example — ENDS the CSS string.
// The file then fails to parse, and node reports the error at whatever identifier follows several
// rules later, which is why the same mistake has cost four separate debugging rounds. Nothing else in
// this package is imported by a test, so the first thing that noticed was always a Next build.
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('the chrome sheet parses and carries the shapes its callers name', async () => {
  const { motuChromeCss } = await import('../src/css.mjs');
  const css = motuChromeCss();
  for (const shape of [
    '.motu-bay',
    '[data-shape="masthead"]',
    '.motu-bay__waves',
    '.motu-bay__headline',
    '.motu-panel',
    '.motu-row',
    '.motu-search',
    '.motu-rail',
    '.motu-mark',
  ]) {
    assert.ok(css.includes(shape), `${shape} is missing from the chrome sheet`);
  }
});

test('every inlined SVG is encoded — a raw # truncates a data URI silently', async () => {
  const { motuChromeCss } = await import('../src/css.mjs');
  const urls = motuChromeCss().match(/url\("data:image\/svg\+xml,[^"]*"\)/g) ?? [];
  // The two waves, the mark and the search field's clear glyph. A COUNT, so deleting one is a
  // failure rather than a quiet pass — and adding one is a decision somebody has to come here to make.
  // Five OCCURRENCES of four glyphs: the clear cross is emitted twice, once for mask and once for
  // the -webkit- prefix Chrome still needs on a search field's cancel button.
  assert.equal(urls.length, 5, 'expected the two wave layers, the mark and the clear glyph (twice)');
  for (const url of urls) {
    assert.ok(!url.includes('#'), 'a raw # ends the data URI: the rule would paint nothing');
    assert.ok(!url.includes('var(--'), 'an SVG in a data URI is an isolated document: no page variable reaches it');
  }
});
