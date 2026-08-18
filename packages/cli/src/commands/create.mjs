// `motu island create <name>` — scaffolds a motu island as a mount point plus its ui component:
//   ui/<kebab>/<Pascal>.tsx   — the plain, mode-agnostic component (the reusable "mainland")
//   islands/<kebab>/element.ts        — the element-registry row (tag -> ui component + legacy fit)
//   islands/<kebab>/fixtures.mock.ts  — the lagoon fixtures stub
//   islands/<kebab>/index.ts          — the mount point's public surface (its element)
// and adds one import + one row to the islands registry (via ts-morph AST). The
// component lives OUTSIDE islands/ so mount points can never import each other. TODO(motu:*) markers
// are left for the extraction skill.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { Project, QuoteKind, SyntaxKind } from 'ts-morph';
import { paths, names, color, FMT } from '../lib/util.mjs';

function componentSource(pascal, kebab) {
  return `export interface ${pascal}Props {
  /** TODO(motu:props): declare inputs. Every prop MUST have a default so the island renders in the
   * lagoon from its defaults alone (verified by \`motu island verify\`). */
  title?: string;
}

/**
 * ${pascal} — TODO(motu:body): implement this island.
 *
 * Rules enforced by \`motu island verify\` (see README "The rules that make islands verifiable"):
 *  - Mode-agnostic: no bare fetch, no history/pushState, no document reach-out into the host.
 *  - All server I/O goes through the generated @motu/contract, never a raw transport.
 *  - Renders correctly from default props alone (the lagoon mounts it with none).
 */
export function ${pascal}({ title = '${pascal}' }: ${pascal}Props = {}) {
  return (
    <section className="motu-${kebab}">
      <h2>{title}</h2>
      <p className="motu-note">TODO(motu:body): build the ${kebab} island.</p>
    </section>
  );
}
`;
}

function elementSource(pascal, camel, tag, kebab) {
  return `import type { ElementSpec } from '@motu/react';
import { ${pascal}, type ${pascal}Props } from '../../ui/${kebab}/${pascal}.js';

export const ${camel}Element: ElementSpec = {
  tag: '${tag}',
  component: ${pascal},
  options: {
    // The island contract in one place — input (props), output (events), coupling (host reach).
    contract: { input: ['title'] as (keyof ${pascal}Props & string)[] },
    legacy: 'fill',
  },
};
`;
}

function indexSource(camel) {
  return `export { ${camel}Element } from './element.js';\n`;
}

function fixturesSource(kebab, contractHint) {
  return `// Lagoon fixtures for x-${kebab}: replayed by MockTransport so the island renders offline (no backend,
// no login). Fill these in with the shapes the island's @motu/contract calls return.
//
// Contract methods available to mock (from @motu/contract):
${contractHint}
import type { Fixture, Scenario } from '@motu/runtime/mock';

export const fixtures: Fixture[] = [
  // TODO(motu:fixtures): e.g.
  // { service: 'SomeService', method: 'search', roles: ['CAN_...'], response: { /* ... */ } },
  // Request-keyed (return different data per input) — 'match' deep-equals the call args, with
  // 'undefined' as a wildcard slot and a plain object matched as a subset:
  // { service: 'SomeService', method: 'search', match: [undefined, { login: 'brice' }], response: { /* ... */ } },
];

/** Roles the mock caller holds — must satisfy the fixtures' role gates. */
export const roles: string[] = [];

/** Optional data-flow cases: two+ seeds whose DISTINCT output proves inputs reach the render
 *  (\`motu island verify\` mounts each and asserts they differ). Pair with request-keyed fixtures. */
export const scenarios: Scenario[] = [
  // { name: 'empty', seed: { criteria: {} } },
  // { name: 'filtered', seed: { criteria: { login: 'brice' } } },
];
`;
}

/** A comment block listing contract services/methods so the fixtures author knows what to mock. */
function readContractHint() {
  try {
    const text = readFileSync(paths.contract, 'utf8');
    const services = [...text.matchAll(/export const (\w+) = \{([\s\S]*?)\n\};/g)];
    const lines = [];
    for (const [, name, body] of services) {
      for (const [, method] of body.matchAll(/^\s{2}(\w+):/gm)) {
        lines.push(`//   - ${name}.${method}`);
      }
    }
    return lines.length ? lines.join('\n') : '//   (none found — regenerate @motu/contract)';
  } catch {
    return '//   (@motu/contract not found)';
  }
}

/** Add the import + ELEMENT_REGISTRY entry to the islands registry via AST. */
function addRegistryEntry(project, camel, kebab) {
  const sf = project.addSourceFileAtPath(paths.islandsRegistry);
  const spec = `./${kebab}/element.js`;
  const constName = `${camel}Element`;

  if (!sf.getImportDeclarations().some((d) => d.getModuleSpecifierValue() === spec)) {
    sf.addImportDeclaration({ moduleSpecifier: spec, namedImports: [constName] });
  }

  const registry = sf.getVariableDeclarationOrThrow('ELEMENT_REGISTRY');
  const arr = registry.getInitializerIfKindOrThrow(SyntaxKind.ArrayLiteralExpression);
  if (!arr.getElements().some((e) => e.getText().trim() === constName)) {
    arr.addElement(constName);
  }
  return sf;
}

export async function createCommand(argv) {
  const name = argv._[0];
  if (!name) {
    console.error('usage: motu island create <name>');
    process.exit(2);
  }
  const { pascal, camel, kebab, tag } = names(name);
  const componentPath = paths.componentFile(kebab, pascal);
  const fixturesPath = paths.fixturesFile(kebab);

  if (existsSync(componentPath) && !argv.force) {
    console.error(color.red(`✗ ${componentPath} already exists (use --force to overwrite)`));
    process.exit(1);
  }

  mkdirSync(dirname(componentPath), { recursive: true }); // ui/<kebab>/
  mkdirSync(paths.islandDir(kebab), { recursive: true }); // islands/<kebab>/

  // Component in ui/; the mount point (element + index + fixtures) in islands/.
  writeFileSync(componentPath, componentSource(pascal, kebab));
  writeFileSync(paths.elementFile(kebab), elementSource(pascal, camel, tag, kebab));
  writeFileSync(paths.islandIndexFile(kebab), indexSource(camel));
  if (!existsSync(fixturesPath) || argv.force) {
    writeFileSync(fixturesPath, fixturesSource(kebab, readContractHint()));
  }

  // Registry edit (AST).
  const project = new Project({
    manipulationSettings: { quoteKind: QuoteKind.Single, useTrailingCommas: true },
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: true,
    compilerOptions: { allowJs: true },
  });
  const registrySf = addRegistryEntry(project, camel, kebab);
  registrySf.formatText(FMT);
  await registrySf.save();

  const rel = paths.rel(paths.islandDir(kebab));
  console.log(color.green(`✓ created island ${color.bold(kebab)}  (component ${pascal}, tag ${tag})`));
  console.log('  ' + color.dim(`${paths.rel(paths.componentFile(kebab, pascal))}   (component)`));
  console.log('  ' + color.dim(`${rel}/element.ts   (registry row)`));
  console.log('  ' + color.dim(`${rel}/fixtures.mock.ts`));
  console.log('  ' + color.dim(`${rel}/index.ts   (exports)`));
  console.log('  ' + color.dim(`${paths.rel(paths.islandsRegistry)}   (ELEMENT_REGISTRY entry)`));
  console.log('');
  console.log('Next: fill the TODO(motu:*) markers, then ' + color.bold(`motu island verify ${kebab}`));
}
