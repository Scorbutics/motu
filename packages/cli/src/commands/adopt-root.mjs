// `motu archipelago adopt-root <id>` — turn a frame-composed region into a root-composed one.
//
// A region composes either from its archipelago's `root` — safe by construction, because the page and
// the lagoon read the same map — or from a hand-written lagoon frame, which is a second description of
// the page and is only as safe as the checks comparing it. `region-root` names the difference on every
// run and does not fail on it, because moving a page is a real refactor of the host's own JSX.
//
// This does the half that is DERIVABLE, which is most of the tedium and none of the judgement:
//   - the host component the frame renders            -> `root`
//   - each `island('x')` and the prop it sits in      -> `slots`
// and prints, rather than guesses, the half that is not: the page's own rewrite.
//
// It REFUSES rather than approximating. A frame that nests two host components (acme's actions page
// stacks `ActionsPageStack` around `ActionsLayout`) has an arrangement no single component expresses
// yet, and the answer is a decision about the application's structure — which is exactly the kind of
// thing a codemod should hand back.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { SyntaxKind } from 'ts-morph';
import { color, paths, blankComments } from '../lib/util.mjs';
import { sourceFileAt } from '../lib/ts-project.mjs';
import { readRegions } from '../lib/eject.mjs';

/** `received-summary` -> `receivedSummary`. */
const camel = (kebab) => kebab.split(/[-_]/).map((w, i) => (i === 0 ? w : w[0].toUpperCase() + w.slice(1))).join('');
const pascal = (id) => {
  const c = camel(id);
  return c[0].toUpperCase() + c.slice(1);
};

/** The region's frame module, from the lagoon overrides. Mirrors `frameModuleFor` in verify. */
function frameModuleFor(id) {
  for (const f of ['src/lagoon.tsx', 'src/lagoon.ts']) {
    const overrides = paths.lagoonDir ? `${paths.lagoonDir}/${f}` : null;
    if (!overrides || !existsSync(overrides)) continue;
    const src = readFileSync(overrides, 'utf8');
    const named = new RegExp(`(^|[\\s{,])['"\`]?${id}['"\`]?\\s*:\\s*([A-Za-z_$][\\w$]*)?`, 'm');
    const moduleOf = (ident) => {
      const spec = src.match(new RegExp(`import\\s*\\{[^}]*\\b${ident}\\b[^}]*\\}\\s*from\\s*['"]([^'"]+)['"]`));
      if (!spec) return null;
      const base = new URL(spec[1].replace(/\.js$/, ''), `file://${overrides}`).pathname;
      return ['.tsx', '.ts', ''].map((e) => base + e).find((c) => existsSync(c)) ?? null;
    };
    const record = src.match(/export const regions[^=]*=\s*\{([\s\S]*?)\s*\};/);
    if (record) {
      const entry = record[1].match(named);
      return entry?.[2] ? moduleOf(entry[2]) : null;
    }
    const array = src.match(/export const regions[^=]*=\s*\[([\s\S]*?)\s*\];/);
    for (const ident of array?.[1].match(/[A-Za-z_$][\w$]*/g) ?? []) {
      const module = moduleOf(ident);
      if (!module) continue;
      const body = readFileSync(module, 'utf8');
      const bound = body.match(/overridesFor\(\s*([A-Za-z_$][\w$]*)/);
      if (!bound) continue;
      const from = body.match(new RegExp(`import\\s*\\{[^}]*\\b${bound[1]}\\b[^}]*\\}\\s*from\\s*['"]([^'"]+)['"]`));
      if (from && new RegExp(`(^|/)${id}\\.archipelago`).test(from[1])) return module;
    }
  }
  return null;
}

export async function archipelagoAdoptRootCommand(argv) {
  const id = argv._[0];
  if (!id) {
    console.error('usage: motu archipelago adopt-root <id>');
    process.exit(2);
  }
  const archPath = paths.archipelagoFile(id);
  if (!existsSync(archPath)) {
    console.error(color.red(`✗ no archipelago '${id}' at ${paths.rel(archPath)}`));
    process.exit(2);
  }
  const archText = readFileSync(archPath, 'utf8');
  if (/^\s*root\s*:/m.test(blankComments(archText))) {
    console.log(color.yellow(`! '${id}' already declares a root — nothing to do`));
    return;
  }
  const frame = frameModuleFor(id);
  if (!frame) {
    console.error(color.red(`✗ '${id}' has no lagoon frame to read`));
    console.error(color.dim('  there is nothing to derive from — declare `root` + `slots` by hand'));
    process.exit(2);
  }

  const sf = sourceFileAt(frame, { allowJs: true, jsx: 4 });
  // The frame's returned tree. Its host components are the app's; `island(slot)` calls are motu's.
  // The frame's OWN components are the frame, not the app's — `<SetupAccountDetailsRegionFrame>` is
  // the thing being replaced, and counting it made the command report the frame as its own root.
  const own = new Set(
    [...sf.getText().matchAll(/(?:export\s+)?(?:function|const)\s+([A-Z][A-Za-z0-9]*)/g)].map((m) => m[1]),
  );
  const hosts = [
    ...sf.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement),
    ...sf.getDescendantsOfKind(SyntaxKind.JsxOpeningElement),
  ].filter((el) => {
    const tag = el.getTagNameNode().getText();
    return /^[A-Z]/.test(tag) && !own.has(tag);
  });

  if (hosts.length === 0) {
    console.error(color.red(`✗ ${paths.rel(frame)} renders no application component`));
    console.error(color.dim('  a root IS the app\'s own layout component; this frame has none to point at'));
    process.exit(2);
  }
  if (hosts.length > 1) {
    console.error(color.red(`✗ ${paths.rel(frame)} nests ${hosts.length} application components:`));
    for (const el of hosts) console.error(color.dim(`    <${el.getTagNameNode().getText()}>`));
    console.error(
      color.dim('  a root is ONE component, so this arrangement is not expressed by any of them yet.\n') +
        color.dim('  Extract a component that takes the whole region as props, then run this again.\n') +
        color.dim('  That is a decision about the application\'s structure, which is why it is not guessed here.'),
    );
    process.exit(2);
  }

  const el = hosts[0];
  const rootName = el.getTagNameNode().getText();
  const rootFrom = sf
    .getImportDeclarations()
    .find((i) => (i.getNamedImports?.() ?? []).some((n) => n.getName() === rootName))
    ?.getModuleSpecifierValue();
  if (!rootFrom) {
    console.error(color.red(`✗ could not find where <${rootName}> is imported from in ${paths.rel(frame)}`));
    process.exit(2);
  }

  // prop -> slot, from `prop={island('x')}`; plus the nesting form, `<X>{island('x')}</X>` -> children.
  //
  // A prop holding MORE THAN ONE island is the shape `slots` cannot express: acme's sign-in shows
  // EITHER `auth-error` OR `login-form` in one child, and a region cannot declare that two slots are
  // exclusive. Taking the first match would have written a map that silently drops the other island —
  // which this did, on its first run, and produced a plausible wrong answer instead of a refusal.
  const slots = {};
  const exclusive = [];
  const islandsIn = (text) => [...text.matchAll(/\bisland\(\s*['"`]([^'"`]+)['"`]/g)].map((m) => m[1]);
  for (const attr of el.getAttributes?.() ?? []) {
    const prop = attr.getNameNode?.().getText?.();
    const found = islandsIn(attr.getInitializer?.()?.getText?.() ?? '');
    if (!prop || !found.length) continue;
    if (found.length > 1) exclusive.push([prop, found]);
    else slots[prop] = found[0];
  }
  const parent = el.getParent?.();
  if (parent?.getKind?.() === SyntaxKind.JsxElement) {
    const found = islandsIn(parent.getJsxChildren().map((c) => c.getText()).join(''));
    if (found.length > 1) exclusive.push(['children', found]);
    else if (found.length === 1) slots.children = found[0];
  }
  if (exclusive.length) {
    console.error(color.red(`✗ ${paths.rel(frame)} puts more than one island in a single prop:`));
    for (const [prop, found] of exclusive) console.error(color.dim(`    ${prop}: ${found.join(' | ')}`));
    console.error(
      color.dim('  `slots` maps one prop to one island, and a region cannot declare that two of them\n') +
        color.dim('  are exclusive. Give the root a prop per island (each rendering nothing when it is\n') +
        color.dim('  not the one), or leave this region on its frame — that is what the frame is for.'),
    );
    process.exit(2);
  }

  if (!Object.keys(slots).length) {
    console.error(color.red(`✗ ${paths.rel(frame)} passes no island to <${rootName}>`));
    process.exit(2);
  }

  // --- write the archipelago ---------------------------------------------------------------------
  const slotLines = Object.entries(slots).map(([p, s]) => `    ${p}: '${s}',`).join('\n');
  let out = archText.replace(
    /(\n\s*id:\s*'[^']+',\n)/,
    `$1  // THE ARRANGEMENT, DECLARED ONCE: the page renders \`<${pascal(id)}.Root>\` with these prop names and\n` +
      `  // never writes a slot, and the lagoon renders the same component from this same map.\n` +
      `  root: ${rootName},\n  slots: {\n${slotLines}\n  },\n`,
  );
  const importLine = `import { ${rootName} } from '${rootFrom}';\n`;
  if (!out.includes(importLine)) {
    out = out.replace(/(^import [\s\S]*?;\n)/m, `$1${importLine}`);
  }
  writeFileSync(archPath, out);

  console.log(color.green(`✓ ${id} now composes from its own root`));
  console.log('  ' + color.dim(`${paths.rel(archPath)}   root: ${rootName}, slots: ${Object.keys(slots).length}`));
  console.log('');
  console.log(color.bold('Still yours to do — this cannot be derived:'));
  console.log(color.dim(`  1. the page renders <${pascal(id)}.Root …/> instead of <${rootName}> + <${pascal(id)}.Island>:`));
  for (const [prop, slot] of Object.entries(slots)) {
    console.log(color.dim(`       ${prop}={…}   (was <${pascal(id)}.Island slot="${slot}">)`));
  }
  console.log(color.dim('     pass null for a slot the page decides not to show; a prop it never passes'));
  console.log(color.dim('     is an island that never renders, and `integrate check` will say so.'));
  console.log(color.dim(`  2. delete the frame in ${paths.rel(frame)} and its \`layout:\` entry.`));
  console.log(color.dim('  3. any prop of the root the islands do NOT fill: `hostSlots` if it is a'));
  console.log(color.dim('     component, a plain prop otherwise — and give the lagoon its value in `hostProps`.'));
  console.log('');
  console.log('Then: ' + color.bold(`motu archipelago verify ${id} --runtime`));
}
