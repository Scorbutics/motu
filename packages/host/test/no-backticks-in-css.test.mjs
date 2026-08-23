// The files that build CSS as strings must still be loadable.
//
// Four outages, one cause: a comment INSIDE a template literal carrying a backtick — naming a class
// or a property the way a code comment normally would. A backtick ENDS the literal, so the CSS after
// it becomes code and the module dies at import with a message that names neither CSS nor the comment
// ("row is not defined", "Unexpected identifier 'overflow'").
//
// THE FIRST TWO VERSIONS OF THIS TEST SCANNED TEXT, AND THE SECOND PASSED AN ALREADY-BROKEN FILE.
// That is worth keeping, because the reason is the point: to scan for "a backtick inside a template
// literal" you must know where the literals are, and a stray backtick MOVES that boundary — the
// offending line lands outside the literal the scanner believes it is in. The check was built on a
// model the bug invalidates, and it reported PASS on the very mistake it exists for.
//
// So: load the module. That is the property that actually matters, it is decidable, and it cannot be
// fooled by the thing it is looking for.
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

// Named rather than globbed: someone adding another CSS-in-a-string module has to say so, and a glob
// that silently matches nothing is the check looking at nothing.
const FILES = ['../src/views.mjs', '../../chrome/src/css.mjs', '../../chrome/src/html.mjs'];

let failures = 0;
for (const rel of FILES) {
  try {
    await import(pathToFileURL(resolve(here, rel)).href);
    console.log(`✓ ${rel}`);
  } catch (err) {
    failures++;
    console.error(`✗ ${rel} — ${err.name}: ${err.message}`);
    if (err instanceof SyntaxError) {
      console.error('    A backtick in a comment inside a template literal ends the literal.');
      console.error('    Comments in these files carry no backticks: name things without them.');
    }
  }
}

if (failures) process.exit(1);
console.log('PASS');
