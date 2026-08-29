// The boot guard: what a lagoon page says when its own bundle never ran.
//
// Driven as text rather than in a browser, because what has to hold is decidable here: the guard is
// installed BEFORE the module script (a module is deferred, so anything after it is too late to catch
// an evaluation crash), it only speaks when the catalogue is absent, and it carries nothing that
// depends on the document's encoding.
//
// The browser behaviour was checked by hand on three fixtures — a bundle that throws while
// evaluating, a bundle that boots and throws later, and one that is fine — and only the first paints.
import test from 'node:test';
import assert from 'node:assert/strict';
import { LAGOON_BOOT_GUARD, LAGOON_INDEX_HTML, LAGOON_FOCUS_HTML } from '../src/lib/scaffold.mjs';

for (const [name, html] of [['gallery', LAGOON_INDEX_HTML], ['focus', LAGOON_FOCUS_HTML]]) {
  test(`the ${name} entry installs the boot guard before its module script`, () => {
    const guard = html.indexOf('data-motu-boot-error');
    const module = html.indexOf('type="module"');
    assert.ok(guard > 0, 'the guard is missing entirely');
    assert.ok(module > 0, 'no module script to be ahead of');
    // A MODULE SCRIPT IS DEFERRED. A guard after it still runs first in practice, and relying on that
    // is how it silently stops catching the case it exists for.
    assert.ok(guard < module, 'the guard must be installed before the bundle it is watching');
  });

  test(`the ${name} entry declares its charset before the guard`, () => {
    // The guard writes text into the document; a charset declared after it is a charset declared too
    // late, and the banner reads as mojibake at exactly the moment somebody needs to read it.
    assert.ok(html.indexOf('charset') < html.indexOf('data-motu-boot-error'));
  });
}

test('the guard speaks only when the lagoon never published its catalogue', () => {
  // `__motuLagoonStates` is published by startLagoon, so its absence after load IS "the bundle did
  // not finish". With it present, an error belongs to somebody's component and the page is not ours
  // to paint over.
  assert.match(LAGOON_BOOT_GUARD, /if \(window\.__motuLagoonStates \|\| first === null\) return;/);
});

test('the guard reports through the same channel a refused state does', () => {
  // An agent reads `__motuLagoonState`, not the screen. A boot failure that only painted a banner
  // would be invisible to exactly the reader this project builds addresses for.
  assert.match(LAGOON_BOOT_GUARD, /window\.__motuLagoonState = \{ ok: false, kind: 'boot'/);
});

test('the guard is ASCII, because it is injected into somebody else\'s document', () => {
  const nonAscii = [...LAGOON_BOOT_GUARD].filter((c) => c.charCodeAt(0) > 127);
  assert.deepEqual(nonAscii, [], 'non-ASCII in the guard: ' + nonAscii.join(''));
});
