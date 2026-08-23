// The stylesheet is a template literal, and a backtick inside it ENDS the literal.
//
// This has cost three restarts. Each time the same shape: a CSS comment naming a class or a property
// in backticks, the way a code comment normally would — `.motu-row`, `overflow: hidden` — and each
// time the module died at import with something that names neither CSS nor the comment
// ("row is not defined", "Unexpected identifier 'overflow'"). A reviewer does not see it, because a
// backtick in prose is exactly what prose wants.
//
// So it is a test rather than a rule to remember. It reads the file as TEXT on purpose: parsing it
// would only tell us it happens to be valid today, and the point is the class of mistake.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(here, '../src/views.mjs'), 'utf8');

let failures = 0;
for (const name of ['SHELL_CSS']) {
  const open = src.indexOf(`const ${name} = \``);
  if (open === -1) {
    console.error(`✗ ${name} not found in views.mjs — did it get renamed?`);
    failures++;
    continue;
  }
  const start = open + `const ${name} = \``.length;
  const end = src.indexOf('`;', start);
  const body = src.slice(start, end);
  const count = (body.match(/`/g) ?? []).length;
  if (count) {
    console.error(`✗ ${name} contains ${count} backtick(s) — the template literal ends there`);
    for (const line of body.split('\n')) if (line.includes('`')) console.error(`    ${line.trim()}`);
    failures++;
  } else {
    console.log(`✓ ${name} — no backticks (${body.split('\n').length} lines)`);
  }
}

if (failures) process.exit(1);
console.log('PASS');
