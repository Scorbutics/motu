// EVERY NAME THE DOCK CALLS EXISTS.
//
// The dock ships as a STRING — `motuMountDock.toString()`, inlined into a page by the host and by
// `lagoon serve` — so no bundler, linter or typecheck ever reads it as code. A helper deleted in one
// refactor and still called from another tab threw only when someone opened that tab: the Islands
// tab was blank on every lagoon for a release ("scenarioCount is not defined"), and every test here
// stayed green, because parsing the string proves it is valid syntax, not that its names resolve.
//
// TypeScript's checker reads plain JavaScript (`checkJs`) and reports exactly that class — "Cannot
// find name" — and nothing about types, which this file does not declare. Only those two codes are
// asserted, so the check says one thing and cannot drift into a style opinion.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { motuDockJs } from '../src/dock.mjs';

/** Names a program reads that nothing declares — TypeScript's 2304 / 2552 ("did you mean"). */
function undeclaredNames(source) {
  const file = 'dock.js';
  const host = ts.createCompilerHost({});
  const read = host.getSourceFile;
  host.getSourceFile = (name, lang) => (name === file ? ts.createSourceFile(file, source, lang, true, ts.ScriptKind.JS) : read(name, lang));
  const program = ts.createProgram(
    [file],
    { allowJs: true, checkJs: true, noEmit: true, lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'], target: ts.ScriptTarget.ES2022 },
    host,
  );
  return ts
    .getPreEmitDiagnostics(program)
    .filter((d) => d.file?.fileName === file && (d.code === 2304 || d.code === 2552))
    .map((d) => ts.flattenDiagnosticMessageText(d.messageText, ' '));
}

test('the dock calls no name it does not declare', () => {
  assert.deepEqual(undeclaredNames(motuDockJs()), []);
});

test('…and the check would catch the one that shipped', () => {
  // The regression, reproduced: the helper renamed away from its last caller.
  const broken = motuDockJs().replace('var scenarioCount = function', 'var scenarioCountGone = function');
  assert.notEqual(broken, motuDockJs(), 'the mutation must land, or this test proves nothing');
  assert.ok(undeclaredNames(broken).some((m) => /scenarioCount/.test(m)));
});
