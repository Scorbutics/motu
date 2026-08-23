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

// Every file that builds CSS as a string. Named rather than globbed: the point is that someone adding
// another one has to say so, and a glob that silently matches nothing is the check looking at nothing.
const FILES = [
  '../src/views.mjs',
  '../../chrome/src/css.mjs',
  '../../chrome/src/html.mjs',
];

/** Bodies of every backtick template literal in a source file, with their line numbers. */
function literals(src) {
  const out = [];
  for (let i = 0; i < src.length; i++) {
    if (src[i] !== '`' || src[i - 1] === '\\') continue;
    let j = i + 1;
    let depth = 0;
    for (; j < src.length; j++) {
      if (src[j] === '\\') { j++; continue; }
      if (src[j] === '$' && src[j + 1] === '{') { depth++; j++; continue; }
      if (src[j] === '}' && depth) { depth--; continue; }
      if (src[j] === '`' && !depth) break;
    }
    out.push({ line: src.slice(0, i).split('\n').length, body: src.slice(i + 1, j) });
    i = j;
  }
  return out;
}

let failures = 0;
for (const rel of FILES) {
  const path = resolve(here, rel);
  let src;
  try {
    src = readFileSync(path, 'utf8');
  } catch {
    console.error(`✗ ${rel} — not found; did it move?`);
    failures++;
    continue;
  }
  // A COMMENT inside a template literal is where this goes wrong, and a comment is the only thing in
  // one that has any reason to hold a backtick. Nothing else in these files legitimately does.
  const bad = [];
  for (const lit of literals(src)) {
    for (const [n, line] of lit.body.split('\n').entries()) {
      const isComment = /^\s*(\/\*|\*|\/\/)/.test(line) || line.includes('/*') || line.includes('//');
      if (isComment && line.includes('`')) bad.push(`${lit.line + n}: ${line.trim()}`);
    }
  }
  if (bad.length) {
    console.error(`✗ ${rel} — a comment inside a template literal carries a backtick, which ENDS it`);
    for (const b of bad) console.error(`    ${b}`);
    failures++;
  } else {
    console.log(`✓ ${rel}`);
  }
}

if (failures) process.exit(1);
console.log('PASS');
