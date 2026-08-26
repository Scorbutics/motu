// `motu island defaults [name]` — classify every default an island declares, and say where it belongs.
//
// An island's `contract.input` defaults exist so the lagoon's "renders from default props alone" gate
// can hold. But most of them are not motu's business at all: measured across peps' eight islands,
// THIRTEEN of fourteen declared defaults are honest component defaults (`isLoading: false`,
// `missions: []`, `overallProgress: 0`) — values the app's own component should carry, where they are
// an improvement rather than a motu artifact. Exactly one is a lagoon fiction: a real-looking phone
// number, in a component a production page renders.
//
// That one is the tell, and it is the rule this command applies:
//
//   If a default cannot be honest in production, it is not a default — it is missing evidence.
//
// It reports and proposes; it does not rewrite. Whether `kind: 'no-social'` is a sound empty state or
// a stand-in for data is a domain judgement, and the tool's job is to put it in front of the person
// who can make it — not to guess and quietly edit an app component.
import { existsSync, readFileSync } from 'node:fs';
import { Project, SyntaxKind } from 'ts-morph';
import { paths, color, names, islandComponentPath, islandComponentExport } from '../lib/util.mjs';
import { listIslands, syncRegistry } from '../lib/islands.mjs';
import { syncContracts } from '../lib/contracts.mjs';

/** Values that are neutral for their type: an empty state, not a piece of data. */
function classifyLiteral(node) {
  const kind = node.getKind();
  if (kind === SyntaxKind.NullKeyword) return 'empty';
  if (node.getText() === 'undefined') return 'empty';
  if (kind === SyntaxKind.FalseKeyword) return 'empty';
  if (kind === SyntaxKind.TrueKeyword) return 'judge'; // `true` asserts something; `false` asserts nothing
  if (kind === SyntaxKind.StringLiteral) return node.getLiteralValue() === '' ? 'empty' : 'judge';
  if (kind === SyntaxKind.NumericLiteral) return node.getLiteralValue() === 0 ? 'empty' : 'judge';
  if (kind === SyntaxKind.ArrayLiteralExpression) return node.getElements().length === 0 ? 'empty' : 'judge';
  if (kind === SyntaxKind.ObjectLiteralExpression) {
    // An object is empty when every leaf is. `{ profilsWaiting: 0, recap: [] }` is a zeroed shape —
    // the component's own empty state, written out.
    const props = node.getProperties();
    if (!props.length) return 'empty';
    return props.every((p) => {
      const init = p.getInitializer?.();
      return init && classifyLiteral(init) === 'empty';
    })
      ? 'empty'
      : 'judge';
  }
  return 'judge';
}

/** Every `{ name, default }` entry in the island's declared input. */
function declaredDefaults(elementPath) {
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: true,
    compilerOptions: { allowJs: true },
  });
  const sf = project.addSourceFileAtPath(elementPath);
  const out = [];
  for (const obj of sf.getDescendantsOfKind(SyntaxKind.ObjectLiteralExpression)) {
    const contract = obj.getProperty('contract')?.getInitializerIfKind(SyntaxKind.ObjectLiteralExpression);
    const input = contract?.getProperty('input')?.getInitializerIfKind(SyntaxKind.ArrayLiteralExpression);
    if (!input) continue;
    for (const entry of input.getElements()) {
      if (entry.getKind() !== SyntaxKind.ObjectLiteralExpression) continue;
      const nameInit = entry.getProperty('name')?.getInitializer();
      const defProp = entry.getProperty('default');
      if (!nameInit || !defProp) continue;
      const init = defProp.getInitializer();
      out.push({
        prop: nameInit.getText().replace(/['"]/g, ''),
        text: init.getText().replace(/\s+/g, ' '),
        verdict: classifyLiteral(init),
        line: entry.getStartLineNumber(),
      });
    }
  }
  return out;
}

/** The component an island's element.ts mounts, and where it comes from. */
function componentImport(elementPath) {
  const src = readFileSync(elementPath, 'utf8');
  const comp = src.match(/component:\s*([A-Za-z0-9_]+)/)?.[1];
  if (!comp) return {};
  const imp = src.match(new RegExp(`import\\s*\\{[^}]*\\b${comp}\\b[^}]*\\}\\s*from\\s*['"]([^'"]+)['"]`));
  return { component: comp, from: imp?.[1] };
}

export function islandDefaultsCommand(argv) {
  const only = argv._?.[0];
  const kebabs = only ? [names.kebab(only)] : listIslands(paths.islandsDir).map((i) => i.kebab);

  const rows = [];
  for (const kebab of kebabs) {
    const el = paths.elementFile(kebab);
    if (!existsSync(el)) continue;
    const { component, from } = componentImport(el);
    for (const d of declaredDefaults(el)) rows.push({ kebab, component, from, ...d });
  }

  if (argv.json) {
    console.log(JSON.stringify({ defaults: rows }, null, 2));
    return;
  }

  console.log(color.bold('\nmotu island defaults — where each declared default belongs\n'));
  if (!rows.length) {
    console.log(color.dim('  no declared defaults'));
    return;
  }
  let judge = 0;
  for (const r of rows) {
    const mark = r.verdict === 'empty' ? color.green('→') : color.yellow('?');
    const note =
      r.verdict === 'empty'
        ? color.dim('empty state — belongs in the component')
        : color.yellow('needs judgement — honest default, or missing evidence?');
    if (r.verdict !== 'empty') judge++;
    console.log(`  ${mark} ${color.dim(r.kebab.padEnd(18))} ${(r.prop + ' = ' + r.text).padEnd(46)} ${note}`);
  }
  console.log('');
  console.log(color.dim(`  ${rows.length - judge} can move into the component as-is.`));
  if (judge) {
    console.log(color.yellow(`  ${judge} carry a value, so you decide:`));
    console.log(color.dim('    • a sound empty state for the domain  → move it into the component'));
    console.log(color.dim('    • a stand-in for real data            → it is EVIDENCE, not a default:'));
    console.log(color.dim('      drop it and add a scenario seed, or the component ships a fiction'));
  }
  console.log('');
}


/**
 * `motu island sync` — regenerate the element registry from what is on disk.
 *
 * The registry stops being a file anyone edits: adding, renaming or deleting an island is a file
 * operation, and this reconciles. Static imports rather than a glob, because the barrel that exports
 * it is consumed by the host application's bundler, which has no `import.meta.glob`.
 */
export function islandSyncCommand() {
  const { path, count } = syncRegistry(paths.islandsDir, paths.isolation);
  console.log(`${paths.rel(path)} — ${count} island(s)`);
  // The contracts are the same kind of file: derived from what is on disk, never edited by hand.
  const contracts = syncContracts(paths.islandsDir, { islandComponentPath, islandComponentExport, names });
  console.log(`${paths.rel(contracts.path)} — ${contracts.count} contract(s)${contracts.changed ? '' : ' (unchanged)'}`);
}
