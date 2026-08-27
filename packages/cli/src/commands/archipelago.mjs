// `motu archipelago create <id>` — scaffolds a new (empty) archipelago as its own folder and
// registers it so the lagoon / CLI can resolve it by id. It:
//   1. Writes <archipelagos>/<id>/<id>.archipelago.ts with
//      `export const <id>Archipelago: ArchipelagoConfig = { id, islands: [] }`.
//   2. Registers it in <archipelagos>/registry.ts (value import + ARCHIPELAGOS map) and
//      re-exports it from the app barrel.
// Islands are added later with `motu island integrate <name> --archipelago <id>`.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { Project, QuoteKind, SyntaxKind } from 'ts-morph';
import { paths, color, FMT } from '../lib/util.mjs';

/** 'client-portfolio' | 'clientPortfolio' -> { id:'client-portfolio', constName:'clientPortfolioArchipelago' }. */
function archNames(input) {
  const words = String(input)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase());
  if (words.length === 0) throw new Error('archipelago id is empty');
  const id = words.join('-');
  const camel = words.map((w, i) => (i === 0 ? w : w[0].toUpperCase() + w.slice(1))).join('');
  return { id, constName: `${camel}Archipelago` };
}

function archipelagoSource(id, constName) {
  // The BINDING's name, PascalCase — a component identifier and a JSX tag, so the archipelago's
  // camelCase const name cannot stand in for it.
  const base = constName.replace(/Archipelago$/, '');
  const Base = base[0].toUpperCase() + base.slice(1);
  return `// The ${id} region. Add islands with \`motu island integrate <name> --archipelago ${id}\`.
//
// DECLARE THE ROOT FIRST. An archipelago is the scope of one root component — usually a page, and it
// does not have to be. Naming it here is what leaves ONE description of how this region composes:
// the page renders \`<${Base}.Root prop={…} />\` using its own prop names and never
// writes a slot, and the lagoon renders the same component from the same map. Skip it and the two
// sides each compose the region their own way, with nothing comparing them — which is a drift that
// ships green.

import type { ArchipelagoConfig } from '@motu/core';
// import { ${Base}Layout } from '@/app/${id}/${id}-layout';

export const ${constName}: ArchipelagoConfig = {
  id: '${id}',
  // The APPLICATION's own layout component, imported — not a copy of it, and not a template.
  // root: ${Base}Layout,
  // Which of the root's props an island fills: the app's vocabulary on the left, motu's on the right.
  // slots: { results: '${id}-results' },
  // Props the HOST fills, and the app component that fills them — region UI that reads no region key
  // and writes none. A COMPONENT, never a hole: the lagoon then supplies only its props, as data.
  // hostSlots: { header: ${Base}Header },
  islands: [],
  // layout: \`<div class="gm-arch"></div>\`, // an OCEAN's answer: a legacy page cannot hand React anything
};
`;
}

export async function archipelagoCreateCommand(argv) {
  const raw = argv._[0];
  if (!raw) {
    console.error('usage: motu archipelago create <id>');
    process.exit(2);
  }
  const { id, constName } = archNames(raw);
  const archPath = paths.archipelagoFile(id);

  if (existsSync(archPath) && !argv.force) {
    console.log(color.yellow(`! ${archPath} already exists — nothing to do`));
    process.exit(0);
  }

  mkdirSync(dirname(archPath), { recursive: true });
  writeFileSync(archPath, archipelagoSource(id, constName));

  const project = new Project({
    manipulationSettings: { quoteKind: QuoteKind.Single, useTrailingCommas: true },
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: true,
    compilerOptions: { allowJs: true },
  });

  // 1) registry.ts — value import + ARCHIPELAGOS registry entry.
  const registrySf = project.addSourceFileAtPath(paths.archipelagosRegistry);
  const spec = `./${id}/${id}.archipelago`;
  if (!registrySf.getImportDeclarations().some((d) => d.getModuleSpecifierValue() === spec)) {
    registrySf.addImportDeclaration({ moduleSpecifier: spec, namedImports: [constName] });
  }
  const registry = registrySf.getVariableDeclaration('ARCHIPELAGOS')?.getInitializerIfKind(SyntaxKind.ObjectLiteralExpression);
  if (registry && !registry.getProperty(`[${constName}.id]`)) {
    registry.addPropertyAssignment({ name: `[${constName}.id]`, initializer: constName });
  }

  // 2) barrel (src/index.ts) — re-export the config const (barrel is one level above archipelagos/).
  const barrelSpec = `./archipelagos/${id}/${id}.archipelago`;
  const barrelSf = project.addSourceFileAtPath(paths.barrel);
  if (!barrelSf.getExportDeclarations().some((d) => d.getModuleSpecifierValue() === barrelSpec)) {
    barrelSf.addExportDeclaration({ moduleSpecifier: barrelSpec, namedExports: [constName] });
  }

  registrySf.formatText(FMT);
  barrelSf.formatText(FMT);
  await project.save();

  console.log(color.green(`✓ created archipelago ${color.bold(id)} (${constName})`));
  console.log('  ' + color.dim(`${paths.rel(paths.archipelagoFile(id))}   (config const)`));
  console.log('  ' + color.dim(`${paths.rel(paths.archipelagosRegistry)}   (import + ARCHIPELAGOS)`));
  console.log('  ' + color.dim(`${paths.rel(paths.barrel)}   (barrel re-export)`));
  console.log('');
  console.log('Next: ' + color.bold(`motu island integrate <name> --archipelago ${id}`));
}
