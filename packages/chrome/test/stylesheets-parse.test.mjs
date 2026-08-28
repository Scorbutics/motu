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

test('the kit cannot reach a host application it is injected into', async () => {
  // WHY THIS IS A TEST AND NOT A CONVENTION. The tide line injects `motuKitCss('#tide')` into
  // whatever application is rendering a lagoon — peps, Twenty, anyone who adopted motu. Handing that
  // application our `--ink`, or a rule that paints its <button>s, because it happens to show a dock
  // would be indefensible. Two properties make it safe, and both are silent when they break.
  const { motuKitCss } = await import('../src/kit.mjs');
  const css = motuKitCss('#tide').replace(/\/\*[\s\S]*?\*\//g, '');

  // ONE: the variables land on the scope they were given, never on the document.
  assert.ok(css.trimStart().startsWith('#tide {'), 'the variable block must open on the given scope');
  assert.doesNotMatch(css, /(^|\})\s*:root\s*\{/, 'a :root block would re-theme the host application');

  // TWO: every rule is anchored to a `motu-` class, so nothing selects an element the host owns.
  const selectors = [...css.matchAll(/(^|\})\s*([^{}@]+?)\s*\{/g)].map((m) => m[2].trim());
  const reaching = [];
  for (const group of selectors) {
    for (const part of group.split(',')) {
      const s = part.trim();
      // Keyframe stops (`0%`, `to`) and the scope block itself are not selectors in this sense.
      if (!s || /^[0-9]/.test(s) || s === 'to' || s === 'from' || s.startsWith('#tide')) continue;
      if (!s.includes('motu-')) reaching.push(s);
    }
  }
  assert.deepEqual(reaching, [], 'every kit rule must be anchored to a motu- class');
});
