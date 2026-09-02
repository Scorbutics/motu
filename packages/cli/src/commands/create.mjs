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
import { paths, names, color, FMT, resolveModuleSpecifier, LEGACY_FIT, islandComponentPath, islandComponentExport } from '../lib/util.mjs';
import { syncRegistry } from '../lib/islands.mjs';
import { syncContracts } from '../lib/contracts.mjs';
import { readComponentContract } from '../lib/component-props.mjs';

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

function elementSource(pascal, camel, tag, kebab, from, exportName, contract) {
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

  // READ from the component when there is one to read. Every line below is a fact already in its
  // source — transcribing it by hand is how an island's contract drifts from the component on its
  // first day. What is left for a human is the part that is a decision: the event NAMES (renamed here
  // to the region's vocabulary if it has a better word) and, in the archipelago, what they bind to.
  const lines = [];
  if (contract?.effects?.length) {
    lines.push('      // AMBIENT — host capabilities this island reaches for without being handed them.');
    lines.push('      effects: [');
    for (const a of contract.effects) lines.push(`        '${a}',`);
    lines.push('      ],');
  }
  if (contract?.input?.length) {
    lines.push('      input: [');
    for (const i of contract.input) lines.push(`        '${i}',`);
    lines.push('      ],');
  } else if (from) {
    lines.push("      // TODO(motu:contract): this component's props could not be read — list them here.");
    lines.push('      input: [],');
  } else {
    lines.push("      input: ['title'],");
  }
  if (contract?.output?.length) {
    lines.push('      // Event names are the REGION\'s vocabulary — rename them if it has a better word.');
    lines.push('      output: {');
    for (const o of contract.output) lines.push(`        ${o.prop}: '${o.event}',`);
    lines.push('      },');
  }

  const imported = exportName && exportName !== pascal ? `${exportName} as ${pascal}` : pascal;
  return `${header}import { islandElement } from '@motu/react';
import { ${imported} } from '${spec}';

export const element = islandElement({
  tag: '${tag}',
  component: ${pascal},
  options: {
    // The island's boundary in one place — input (props), output (events), effects (what it reaches).
    contract: {
${lines.join('\n')}
    },${legacy}
  },
});
`;
}

function indexSource(camel) {
  return `export { ${camel}Element } from './element';\n`;
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
  const spec = `./${kebab}/element`;
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
  let from = typeof argv.from === 'string' ? argv.from : null;
  // `--export` names the component INSIDE the module, when it is not the island's Pascal name.
  let exportName = typeof argv.export === 'string' ? argv.export : null;

  // `--from <module>:<Export>` IS ACCEPTED, because it is what people actually type.
  //
  // Measured on three cold-start adoptions: two independent agents, on two different applications,
  // invented exactly this form, spent three invocations each on it, and only recovered via the docs
  // or `--help`. When two strangers independently guess the same syntax, the syntax is not the
  // problem — refusing it is. `--export` remains the canonical spelling and still wins if both are
  // given; this only stops the guess from being a dead end.
  //
  // Split on the LAST colon, and only when the tail looks like an export name, so a Windows drive
  // letter or a `node:`/`virtual:` style specifier is untouched.
  if (from && !exportName) {
    const m = from.match(/^(.*[^:]):([A-Za-z_$][\w$]*)$/);
    if (m && !/^[a-z]+:$/.test(m[1] + ':')) {
      from = m[1];
      exportName = m[2];
    }
  }
  const componentPath = paths.componentFile(kebab, pascal);
  const fixturesPath = paths.fixturesFile(kebab);

  if (!from && existsSync(componentPath) && !argv.force) {
    console.error(color.red(`✗ ${componentPath} already exists (use --force to overwrite)`));
    process.exit(1);
  }
  // RESOLVE FROM WHERE THE ISLAND FILE WILL ACTUALLY SIT.
  //
  // This resolved against `islandDir(kebab)` — the FOLDER layout, `src/islands/<kebab>/` — while
  // create always writes the FLAT one, `src/islands/<kebab>.island.ts`, one level up. So a relative
  // `--from` was broken in both directions: the specifier that is correct for the emitted file
  // (`../ui/x`) was rejected, and the one that satisfied this check (`../../ui/x`) was written
  // verbatim into a file where it resolves one level too high — a broken import that passed the
  // CLI's own validation. Only the alias form worked, because aliases resolve from the host root,
  // which is why the React hosts never hit it.
  const islandDir = paths.islandsDir;
  if (from && !resolveModuleSpecifier(from, islandDir)) {
    // SHOW A CORRECT CALL. The old message said what was wrong and never what to type, so an agent
    // that had guessed the syntax had nothing to correct toward — it guessed twice more, then read
    // the docs. A message that ends in an example is the difference between three invocations and one.
    const guessedExt = /\.(tsx?|jsx?)$/.test(from);
    console.error(
      color.red(`✗ --from '${from}' does not resolve to a file from ${paths.rel(islandDir)}`) +
        (guessedExt ? color.dim('\n  Drop the file extension — this is a module specifier, not a path.') : '') +
        color.dim('\n  Use the specifier the APP itself uses, and name the export with --export:') +
        color.dim(`\n      motu island create ${kebab} --from @/components/${kebab} --export ${pascal}`) +
        color.dim(`\n      motu island create ${kebab} --from ../components/${kebab} --export ${pascal}   (relative to ${paths.rel(islandDir)})`) +
        color.dim('\n  `--from <module>:<Export>` is also accepted.'),
    );
    process.exit(1);
  }

  if (!from) mkdirSync(dirname(componentPath), { recursive: true }); // ui/<kebab>/
  mkdirSync(paths.islandsDir, { recursive: true });

  // Component in ui/ (unless wrapping one the app owns), then the island itself — one file.
  if (!from) writeFileSync(componentPath, componentSource(pascal, kebab));
  const islandFile = resolve(paths.islandsDir, `${kebab}.island.ts`);
  // The component's own source answers most of the contract; read it rather than asking for it again.
  const contract = from ? readComponentContract(resolveModuleSpecifier(from, islandDir), exportName ?? pascal) : null;
  writeFileSync(islandFile, elementSource(pascal, camel, tag, kebab, from, exportName, contract));

  // The registry is GENERATED from what is on disk, not edited: adding an island is a file operation,
  // and reconciling is what keeps a deleted or renamed one from lingering in it.
  syncRegistry(paths.islandsDir, paths.isolation);
  // AND THE CONTRACTS, in the same breath. Creating an island left `contracts.generated.ts` missing,
  // so the very first `motu check` a new project runs — straight after the next-step this command
  // prints — opened with `✗ generated  contracts.generated.ts is missing`. The scaffolder failing its
  // own check is the first thing a stranger sees, and the fix was a command they had not been told
  // about yet.
  syncContracts(paths.islandsDir, { islandComponentPath, islandComponentExport, names });
  console.log(color.green(`✓ created island ${color.bold(kebab)}  (component ${pascal}, tag ${tag})`));
  if (contract) {
    console.log(
      '  ' +
        color.dim(
          `read from the component: ${contract.input.length} input(s), ${contract.output.length} output(s)` +
            `${contract.effects.length ? `, ${contract.effects.length} effect(s)` : ''}`,
        ),
    );
  }
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
