// The stylesheets parse, and produce the shapes their callers name.
//
// WHY THIS TEST EXISTS. Every rule in `css.mjs` and `kit.mjs` lives inside a template literal, so one
// backtick written in a comment — around a class name, a property, an example — ENDS the CSS string.
// The file then fails to parse, and node reports the error at whatever identifier follows several
// rules later, which is why the same mistake has cost four separate debugging rounds. Nothing else in
// this package is imported by a test, so the first thing that noticed was always a Next build.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';

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

// The dock's stylesheet, for the reason the others are here: it is a template literal, and a backtick
// in a comment inside one ends the string several rules early. That has happened four times in this
// package's stylesheets; the module simply fails to import, which is what these tests catch.
test('the dock sheet parses, and its bootstrap is valid script', async () => {
  const { motuDockCss, motuDockJs } = await import('../src/dock.mjs');
  const css = motuDockCss();
  assert.ok(css.length > 1000, 'the dock sheet came back empty');
  for (const shape of ['#tide .rail-dock', '#tide .panel', '#tide .grab', '#tide .scrim']) {
    assert.ok(css.includes(shape), 'the dock sheet lost ' + shape);
  }
  // The bootstrap is serialised into a page that has no bundler, so it has to be valid on its own.
  new vm.Script(motuDockJs());
});

test('the dock panel slides rather than toggling display', async () => {
  const { motuDockCss } = await import('../src/dock.mjs');
  // A panel switched between `none` and `flex` cannot transition, and the shell's own sheet beside it
  // does. This is the rule that keeps the two behaving alike.
  const css = motuDockCss();
  assert.match(css, /#tide \.panel \{[^}]*transform: translateX\(100%\)/s);
  assert.match(css, /#tide\[data-open="true"\] \.panel \{[^}]*transform: none/s);
  assert.ok(!/#tide \.panel \{[^}]*display: none/s.test(css), 'the panel is back to a display toggle');
});

test('the dock asks for no safe-area inset', async () => {
  // TWICE NOW, IN TWO CODEBASES. On Firefox for Android env(safe-area-inset-bottom) comes back
  // non-zero even though nothing here sets viewport-fit=cover, and a bottom bar that folds it into
  // its padding arrives about twice as tall as it should. peps deleted every one of these rather
  // than working around it (peps_ta_boite e0eeea7); this keeps them from coming back here.
  const { motuDockCss } = await import('../src/dock.mjs');
  const withoutComments = motuDockCss().replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!withoutComments.includes('env('), 'an env() inset is back in the dock stylesheet');
});
