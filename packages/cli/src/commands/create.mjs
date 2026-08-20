// `motu island create <name>` — scaffolds an island as ONE file, plus its ui component if motu owns it:
//   ui/<kebab>/<Pascal>.tsx   — the plain, mode-agnostic component (only when not wrapping the app's)
//   islands/<kebab>.island.ts — the island: tag, component, and its declared boundary
// then regenerates the registry from what is on disk.
//
// It does NOT scaffold an evidence file. A `fixtures.mock.ts` full of `TODO(motu:fixtures)` is worse
// than no file: it looks like coverage, invites a hand-written response shape, and rots — six of them
// sat empty in the reference adopter for months. Evidence appears when `motu fixtures record` produces
// it, or when you write a scenario because you need one.
//
// The component lives OUTSIDE islands/ so mount points can never import each other. TODO(motu:*)
// markers are left for the extraction skill.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Project, QuoteKind, SyntaxKind } from 'ts-morph';
import { paths, names, color, FMT, resolveModuleSpecifier, LEGACY_FIT } from '../lib/util.mjs';
import { syncRegistry } from '../lib/islands.mjs';

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

function elementSource(pascal, camel, tag, kebab, from, exportName) {
  // Only where the host HAS a legacy skin. Under a modern host it is not optional but absent —
  // declaring it would be a field nothing reads (see `motu island verify`'s legacy-strategy rule).
  const legacy = LEGACY_FIT ? "\n    legacy: 'fill'," : '';
  // `from` = wrapping a component the app already owns; otherwise the scaffolded ui/ component.
  // One directory shallower than the old folder layout: the island file sits IN islands/.
  const spec = from ?? `../ui/${kebab}/${pascal}.js`;
  const header = from
    ? `// Mount point for ${pascal}: it wraps the application's OWN component rather than a copy, so the
// island cannot drift from what the app already ships. The component stays where it is and keeps
// being used directly elsewhere; this file only declares how it is mounted as an island.
`
    : '';
  const input = from
    ? `// TODO(motu:contract): list the props this island is fed — e.g. ['phone', 'isLoading'].
    //   DEFAULTS BELONG IN THE COMPONENT, not here: an island must render from its defaults alone,
    //   and a default that cannot be honest in production is not a default, it is missing evidence
    //   (put it in \`${kebab}.evidence.ts\` as a scenario seed instead).
    contract: { input: [] },`
    : `contract: { input: ['title'] },`;
  // No `as (keyof Props)[]` cast: `input` is already typed PropEntry<P>[], which accepts BOTH a bare
  // name and the `{ name, default }` form — the cast only fitted the former, so it broke the moment a
  // prop declared a default. `motu island verify`'s props-match is what actually reconciles the
  // registry against the component.
  const typeImport = '';
  // The app's export is rarely named after the island: `motu island create network-stats` should wrap
  // `NetworkStatsBanner`, not a `NetworkStats` that does not exist. Alias it so the rest of the file
  // (and the component-name conventions verify relies on) still reads as the island's own name.
  const imported = exportName && exportName !== pascal ? `${exportName} as ${pascal}` : `${pascal}${typeImport}`;
  return `${header}import type { ElementSpec } from '@motu/react';
import { ${imported} } from '${spec}';

export const element: ElementSpec = {
  tag: '${tag}',
  component: ${pascal},
  options: {
    // The island's boundary in one place — input (props), output (events), ambient (host reach).
    ${input}${legacy}
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
  // `--from <specifier>` wraps a component the application already owns (the React-host case: there is
  // nothing to write, only something to mount). Without it, scaffold a new component under ui/ — the
  // extraction case, where the original is not React and a component has to be authored.
  const from = typeof argv.from === 'string' ? argv.from : null;
  // `--export` names the component INSIDE the module, when it is not the island's Pascal name.
  const exportName = typeof argv.export === 'string' ? argv.export : null;
  const componentPath = paths.componentFile(kebab, pascal);
  const fixturesPath = paths.fixturesFile(kebab);

  if (!from && existsSync(componentPath) && !argv.force) {
    console.error(color.red(`✗ ${componentPath} already exists (use --force to overwrite)`));
    process.exit(1);
  }
  if (from && !resolveModuleSpecifier(from, paths.islandDir(kebab))) {
    console.error(
      color.red(`✗ --from '${from}' does not resolve to a file from ${paths.rel(paths.islandDir(kebab))}`) +
        color.dim('\n  Use the specifier the app itself uses (e.g. an alias like @/components/foo), or a relative path.'),
    );
    process.exit(1);
  }

  if (!from) mkdirSync(dirname(componentPath), { recursive: true }); // ui/<kebab>/
  mkdirSync(paths.islandsDir, { recursive: true });

  // Component in ui/ (unless wrapping one the app owns), then the island itself — one file.
  if (!from) writeFileSync(componentPath, componentSource(pascal, kebab));
  const islandFile = resolve(paths.islandsDir, `${kebab}.island.ts`);
  writeFileSync(islandFile, elementSource(pascal, camel, tag, kebab, from, exportName));

  // The registry is GENERATED from what is on disk, not edited: adding an island is a file operation,
  // and reconciling is what keeps a deleted or renamed one from lingering in it.
  syncRegistry(paths.islandsDir);
  console.log(color.green(`✓ created island ${color.bold(kebab)}  (component ${pascal}, tag ${tag})`));
  if (from) console.log('  ' + color.dim(`wraps ${from}   (the app's own component — not copied)`));
  else console.log('  ' + color.dim(`${paths.rel(paths.componentFile(kebab, pascal))}   (component)`));
  console.log('  ' + color.dim(`${paths.rel(islandFile)}   (the island)`));
  console.log('  ' + color.dim(`${paths.rel(paths.islandsRegistry)}   (regenerated)`));
  console.log('');
  console.log('Next: fill the TODO(motu:*) markers, then ' + color.bold(`motu island verify ${kebab}`));
  console.log(
    color.dim('  Evidence (fixtures/scenarios) goes in ') +
      color.dim(color.bold(`${kebab}.evidence.ts`)) +
      color.dim(' — write one when you need it, or record it with `motu fixtures record`.'),
  );
}
