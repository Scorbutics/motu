// The lagoon's generated entries must not be TOUCHED when they have not changed.
//
// Asserting on mtime rather than on content, deliberately: the content was already correct before this
// existed. What was wrong was that an identical write bumped mtime, Vite's watcher fired, and every
// open lagoon tab full-reloaded — once per `motu … --runtime` / `snapshot` / `lagoon states` run in
// another terminal. A test that only compared bytes would have passed against the bug.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { writeIfChanged } from '../src/lib/write-if-changed.mjs';

/** mtime at nanosecond resolution — a same-millisecond rewrite is exactly the case that must not fire. */
const mtime = (f) => statSync(f, { bigint: true }).mtimeNs;

test('an identical write does not touch the file', () => {
  const dir = mkdtempSync(resolve(tmpdir(), 'motu-wic-'));
  const file = resolve(dir, 'main.tsx');
  writeFileSync(file, 'export const a = 1;\n');
  // Backdate, so "untouched" cannot be confused with "written within the same clock tick".
  const past = Date.now() / 1000 - 60;
  utimesSync(file, past, past);
  const before = mtime(file);

  assert.equal(writeIfChanged(file, 'export const a = 1;\n'), false);
  assert.equal(mtime(file), before, 'mtime moved — the watcher would have fired');
});

test('a changed write lands', () => {
  const dir = mkdtempSync(resolve(tmpdir(), 'motu-wic-'));
  const file = resolve(dir, 'main.tsx');
  writeFileSync(file, 'export const a = 1;\n');

  assert.equal(writeIfChanged(file, 'export const a = 2;\n'), true);
  assert.equal(readFileSync(file, 'utf8'), 'export const a = 2;\n');
});

test('a missing file is created, directories and all', () => {
  const dir = mkdtempSync(resolve(tmpdir(), 'motu-wic-'));
  const file = resolve(dir, 'nested/src/env.ts');

  assert.equal(writeIfChanged(file, 'export {};\n'), true);
  assert.equal(readFileSync(file, 'utf8'), 'export {};\n');
});
