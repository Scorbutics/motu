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
  return `// The ${id} page. Add islands with \`motu island integrate <name> --archipelago ${id}\`.

import type { ArchipelagoConfig } from '@motu/core';

export const ${constName}: ArchipelagoConfig = {
  id: '${id}',
  islands: [],
  // layout: \`<div class="gm-arch"></div>\`, // arrange <motu-island slot="…"> markers as you integrate
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
