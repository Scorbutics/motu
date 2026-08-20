// `motu contract check [--update]` — the application's boundary as one reviewable artifact.
//
// Everything motu knows about the boundary is already declared or derivable: the callable surface, each
// island's input/output/ambient, each archipelago's bindings, and the coupling graph those bindings
// imply. Scattered across a dozen files it is invisible in review; gathered into one committed file it
// becomes a diff. Widening the callable surface, adding an input, or coupling two islands that were
// independent all stop being things you have to notice.
//
// The snapshot is GENERATED and committed. `check` fails when the code has moved and the snapshot has
// not — the same contract a lockfile offers, for architecture instead of dependencies.
import { existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { Project, SyntaxKind } from 'ts-morph';
import { paths, color, HOST, APP_ROOT } from '../lib/util.mjs';
import { listIslands } from '../lib/islands.mjs';

const SNAPSHOT = () => resolve(APP_ROOT, 'src/contract.snapshot.json');

function project() {
  return new Project({
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: true,
    compilerOptions: { allowJs: true, jsx: 4 },
  });
}

/** The callable surface: `defineServices({ svc: { method: fn } })` — the only functions an island may reach. */
function services() {
  const file = resolve(APP_ROOT, 'src/services/index.ts');
  if (!existsSync(file)) return {};
  const sf = project().addSourceFileAtPath(file);
  const call = sf.getDescendantsOfKind(SyntaxKind.CallExpression).find((c) => c.getExpression().getText() === 'defineServices');
  const arg = call?.getArguments()[0];
  if (!arg || arg.getKind() !== SyntaxKind.ObjectLiteralExpression) return {};
  const out = {};
  for (const svc of arg.getProperties()) {
    const name = svc.getFirstChild()?.getText();
    const body = svc.getLastChildByKind?.(SyntaxKind.ObjectLiteralExpression);
    if (!name || !body) continue;
    out[name] = body.getProperties().map((m) => m.getFirstChild()?.getText()).filter(Boolean).sort();
  }
  return out;
}

/** Each island's declared boundary. */
function islands() {
  const out = {};
  for (const { kebab, element } of listIslands(paths.islandsDir)) {
    const sf = project().addSourceFileAtPath(element);
    const row = sf.getDescendantsOfKind(SyntaxKind.ObjectLiteralExpression).find((o) => o.getProperty('tag') && o.getProperty('component'));
    if (!row) continue;
    const text = (n) => n?.getText().replace(/^[\w]+:\s*/, '').trim().replace(/['"]/g, '');
    const opts = row.getProperty('options')?.getInitializerIfKind(SyntaxKind.ObjectLiteralExpression);
    const contract = opts?.getProperty('contract')?.getInitializerIfKind(SyntaxKind.ObjectLiteralExpression);
    const list = (name) => {
      const arr = contract?.getProperty(name)?.getInitializerIfKind(SyntaxKind.ArrayLiteralExpression);
      return arr ? arr.getElements().map((e) => e.getText().replace(/['"]/g, '').replace(/\{\s*name:\s*/, '')).sort() : [];
    };
    const outputObj = contract?.getProperty('output')?.getInitializerIfKind(SyntaxKind.ObjectLiteralExpression);
    out[kebab] = {
      tag: text(row.getProperty('tag')),
      component: text(row.getProperty('component')),
      input: list('input'),
      output: outputObj ? Object.fromEntries(outputObj.getProperties().map((p) => p.getText().split(':').map((x) => x.trim().replace(/['"]/g, '')))) : {},
      ambient: list('ambient'),
    };
  }
  return out;
}

/** The text of one `name:` clause in an island entry — brace/bracket balanced, '' when absent. */
function clause(block, name) {
  const start = block.search(new RegExp(`\\b${name}\\s*:\\s*[[{]`));
  if (start === -1) return '';
  const open = block.slice(start).search(/[[{]/) + start;
  const pairs = { '{': '}', '[': ']' };
  const closer = pairs[block[open]];
  let depth = 0;
  for (let i = open; i < block.length; i++) {
    if (block[i] === block[open]) depth++;
    else if (block[i] === closer && --depth === 0) return block.slice(open, i + 1);
  }
  return block.slice(open);
}

/** Each archipelago's bindings, and the coupling those bindings imply. */
function archipelagos() {
  const out = {};
  if (!existsSync(paths.archipelagosDir)) return out;
  for (const dir of readdirSync(paths.archipelagosDir, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const file = resolve(paths.archipelagosDir, dir.name, `${dir.name}.archipelago.ts`);
    if (!existsSync(file)) continue;
    // Comments blanked: scaffolded wiring examples are comments, and reading them as real coupling has
    // already produced one false green in this codebase.
    const raw = readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
      .replace(/\/\/[^\n]*/g, '');
    const bindsBySlot = {};
    for (const m of raw.matchAll(/slot:\s*'([^']+)'[\s\S]*?(?=slot:\s*'|\n\s{2}\][\s\S]*$)/g)) {
      const [, slot] = m;
      const block = m[0];
      // READS from the `bind` clause only. Taken from the whole block, every produced key came back
      // as a read of itself (it appears as a value in `writes`), so every owned key looked "shared".
      const bindBlock = clause(block, 'bind');
      const bind = Object.fromEntries(
        [...bindBlock.matchAll(/(\w+):\s*'([^']+)'/g)].filter(([, k]) => !['slot', 'element'].includes(k)).map(([, k, v]) => [k, v]),
      );
      // Bare entries: `bind: ['compactMode', { stats: 'networkStats' }]` — the strings that are not
      // part of a rename pair are keys read under their own name.
      for (const [, key] of bindBlock.matchAll(/(?:^|[[,]\s*)'([^']+)'/g)) bind[key] = key;
      // WRITES from the `writes` clause. It used to look for `store.set('key')`, which nothing has
      // written since regions started DECLARING their outputs — so the graph silently went empty and
      // `--update` accepted the loss. Both declaration shapes count:
      //   writes: { 'compact-toggled': 'compactMode' }
      //   writes: { 'week-progress': { overallProgress: 'overallProgress', … } }
      // Event names are object KEYS, so matching only values takes the store keys and nothing else.
      const writesBlock = clause(block, 'writes');
      const writes = [
        ...[...writesBlock.matchAll(/:\s*'([^']+)'/g)].map((w) => w[1]),
        ...[...block.matchAll(/store\.set\(\s*'([^']+)'/g)].map((w) => w[1]),
      ];
      bindsBySlot[slot] = { reads: bind, writes };
    }
    const reads = new Set(Object.values(bindsBySlot).flatMap((b) => Object.values(b.reads)));
    const writes = new Set(Object.values(bindsBySlot).flatMap((b) => b.writes));
    const shared = [...writes].filter((k) => reads.has(k)).sort();
    // The graph a human cannot see: who feeds whom, derived from what is already declared.
    const edges = [];
    for (const key of shared) {
      const from = Object.entries(bindsBySlot).filter(([, b]) => b.writes.includes(key)).map(([s]) => s);
      const to = Object.entries(bindsBySlot).filter(([, b]) => Object.values(b.reads).includes(key)).map(([s]) => s);
      for (const f of from) for (const t of to) edges.push({ key, from: f, to: t });
    }
    out[dir.name] = { islands: Object.keys(bindsBySlot).sort(), sharedState: shared, coupling: edges };
  }
  return out;
}

function build() {
  return { host: HOST, services: services(), islands: islands(), archipelagos: archipelagos() };
}

export function contractCheckCommand(argv) {
  const snap = build();
  const text = JSON.stringify(snap, null, 2) + '\n';
  const file = SNAPSHOT();

  if (argv.update) {
    writeFileSync(file, text);
    console.log(`${paths.rel(file)} updated`);
    return;
  }
  if (!existsSync(file)) {
    console.error(color.red(`no snapshot at ${paths.rel(file)} — run \`motu contract check --update\``));
    process.exit(1);
  }
  if (readFileSync(file, 'utf8') === text) {
    const edges = Object.values(snap.archipelagos).flatMap((a) => a.coupling).length;
    const methods = Object.values(snap.services).flat().length;
    console.log(
      color.green(color.bold('PASS')) +
        color.dim(`  boundary unchanged — ${methods} callable method(s), ${Object.keys(snap.islands).length} island(s), ${edges} coupling edge(s)`),
    );
    return;
  }
  console.error(color.red(color.bold('FAIL')) + `  the boundary moved and ${paths.rel(file)} did not.`);
  console.error(color.dim('  Review the change, then acknowledge it: `motu contract check --update`'));
  process.exit(1);
}
