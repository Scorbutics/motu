// `motu archipelago init <id> --page <page.tsx>` — everything a page needs before its FIRST island.
//
// The second island on a page is cheap. The first is not: an archipelago, an app-side region type the
// config is declared against, a composition root that binds the region to this environment, a lagoon
// module that seeds and arranges it, and two entries in the lagoon overrides. None of it is a
// decision — every one of those files is derivable from "this id, that page" — but all of it has to
// exist before anything can be verified, which is what makes adopting motu on a new page feel
// expensive when adding to an existing one does not.
//
// It derives from PRECEDENT, not from a template: the transport and host bridge of a new composition
// root are copied from the one this project already wrote, because those are environment decisions
// the project has already made once and must not answer differently by accident.
//
// It does NOT scaffold evidence. A file full of `TODO` looks like coverage and rots — the same reason
// `island create` stopped writing `fixtures.mock.ts`. Evidence appears when there is something real.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { color, paths, HOST_ROOT, APP_ROOT } from '../lib/util.mjs';
import { archipelagoCreateCommand } from './archipelago.mjs';

const written = [];
const skipped = [];

function put(path, contents) {
  if (existsSync(path)) return skipped.push(path);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
  written.push(path);
}

/** `client-portfolio` -> { pascal: 'ClientPortfolio', camel: 'clientPortfolio' }. */
function names(id) {
  const words = id.split(/[-_]/).filter(Boolean);
  return {
    pascal: words.map((w) => w[0].toUpperCase() + w.slice(1)).join(''),
    camel: words.map((w, i) => (i === 0 ? w : w[0].toUpperCase() + w.slice(1))).join(''),
  };
}

/** How this project imports host files: the `@/` alias when tsconfig declares one, else a relative path. */
function hostSpecifier(fromFile, targetFile) {
  const tsconfig = resolve(HOST_ROOT, 'tsconfig.json');
  const aliased = existsSync(tsconfig) && /"@\/\*"\s*:/.test(readFileSync(tsconfig, 'utf8'));
  const target = relative(HOST_ROOT, targetFile).replace(/\.tsx?$/, '');
  if (aliased) return `@/${target}`;
  const rel = relative(dirname(fromFile), targetFile).replace(/\.tsx?$/, '');
  return rel.startsWith('.') ? rel : `./${rel}`;
}

/** An existing composition root, so a new one inherits this project's transport and host bridge. */
function precedent() {
  const found = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = resolve(dir, e.name);
      if (full.startsWith(APP_ROOT)) continue;
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
        walk(full);
      } else if (/\.tsx?$/.test(e.name)) {
        const text = readFileSync(full, 'utf8');
        if (/createRegion\(/.test(text)) found.push({ file: full, text });
      }
    }
  };
  for (const top of ['app', 'components', 'lib', 'src']) walk(resolve(HOST_ROOT, top));
  return found[0] ?? null;
}

export async function archipelagoInitCommand(argv) {
  const id = argv._[0];
  const page = argv.page ? resolve(process.cwd(), argv.page) : null;
  if (!id || !page) {
    console.error('usage: motu archipelago init <id> --page <path/to/page.tsx>');
    process.exit(2);
  }
  if (!existsSync(page)) {
    console.error(color.red(`✗ no page at ${page}`));
    process.exit(2);
  }
  const { pascal, camel } = names(id);
  const archConst = `${camel}Archipelago`;

  // 1 — the APP's region type, beside its page. It belongs to the application: no motu import, and it
  //     erases at runtime, so the vocabulary survives motu's removal.
  const typeFile = resolve(dirname(page), `${id}-region.ts`);
  put(
    typeFile,
    `// The ${id} region's shared state, as a type.
//
// Belongs to the APPLICATION: no motu import, and it erases at runtime. It is the region's SHARED
// vocabulary, not everything the page holds — a key earns a place here when more than one part of the
// region needs it, or when motu binds it.
//
// EMPTY until the first key is shared. \`Record<string, never>\` rather than a speculative key: a key
// with no reader is not a key.
export type ${pascal}Region = Record<string, never>
`,
  );

  // 2 — the archipelago, DECLARED AGAINST that type (the shape `motu check`'s region-type rule wants).
  const archFile = paths.archipelagoFile(id);
  if (!existsSync(archFile)) {
    await archipelagoCreateCommand({ _: [id] });
    written.push(archFile);
  } else {
    skipped.push(archFile);
  }
  const archText = readFileSync(archFile, 'utf8');
  if (!/ArchipelagoConfig<|archipelago</.test(archText)) {
    // UPGRADED TO THE CHECKED CALL, which this step is the first that can do it: the cross-checks are
    // stated against the app-side region type, and `archipelago init` is what just wrote that type.
    // `archipelago create` cannot — there is nothing to check against yet — which is why the plain
    // config form still exists and why a region scaffolded that way is asserting nothing.
    //
    // `as const` is not decoration. The checks are derived from the config's LITERAL type, and `const A`
    // is best effort: past a certain size TypeScript falls back to the constraint and every check
    // silently passes without checking. `ConstInferenceLost` turns that into an error, and this is what
    // stops a new region ever meeting it.
    writeFileSync(
      archFile,
      archText
        .replace(
          "import type { ArchipelagoConfig } from '@motu/core';",
          `import { archipelago } from '@motu/core';\n// TYPE-ONLY, from the app: the page's vocabulary is the application's to name.\nimport type { ${pascal}Region } from '${hostSpecifier(archFile, typeFile)}';`,
        )
        .replace(`export const ${camel}Archipelago: ArchipelagoConfig = {`, `export const ${camel}Archipelago = archipelago<${pascal}Region>()({`)
        .replace(
          /\n\};\n$/,
          `\n} as const,\n// The region's cross-checks, as the declaration's SECOND ARGUMENT. Each property is the check's\n// own result type, so \`true\` is the only value that compiles and a drift errors on that line naming\n// the offending key. Add \`wiring\` once this region has islands (it needs the generated elements map\n// as the second type argument) and \`produced\` once the app declares its produced-key type.\n{ ownership: true });\n`,
        ),
    );
  }

  // 3 — the lagoon's module for this region: what the page establishes, and where its islands sit.
  const regionModule = resolve(paths.lagoonDir, 'src/regions', `${id}.tsx`);
  put(
    regionModule,
    `// The ${id} region, for the lagoon: what the page establishes, and where the islands sit.
import type { ReactNode } from 'react';
import type { LagoonOverrides } from '@motu/react';

/** What the PAGE establishes on first paint. Add a key when an island binds one. */
export const ${camel}Seed: NonNullable<LagoonOverrides['seed']>[string] = {};

/**
 * The region's arrangement.
 *
 * Point this at the APPLICATION's own layout component as soon as the page has one — one description
 * of the page's shape, rendered by the page with live content and here with islands. Restating the
 * arrangement in JSX here is the drift the region type exists to prevent, one level up.
 */
export function ${pascal}RegionFrame({ island }: { island: (slot: string) => ReactNode }) {
  return <div className="flex flex-col gap-6 p-4 lg:p-8">{/* {island('your-slot')} */}</div>;
}
`,
  );

  // 4 — the composition root, modelled on the one this project already has.
  const model = precedent();
  const bindingDir = model ? dirname(model.file) : dirname(page);
  // ONE MODULE SPECIFIER, TWO FILES — the collision that only bites the FIRST region in a project,
  // which is the case this command exists for. With no precedent the binding lands beside the page,
  // where the region TYPE already lives as `<id>-region.ts`; TypeScript resolves `./<id>-region` to
  // the `.ts` and the composition root is unreachable, so the screen importing `MotuRegion` fails to
  // compile with no hint that a second file is involved. A project with a precedent never sees it —
  // peps' binding sits in `components/motu/` and its type in `app/`.
  const collides = bindingDir === dirname(typeFile);
  const bindingFile = resolve(bindingDir, `${id}-${collides ? 'binding' : 'region'}.tsx`);
  const transportLine = model?.text.match(/^\s*transport:.*$/m)?.[0]?.trim() ?? 'transport: undefined, // TODO(motu): the transport this environment uses';
  const useHostLine = model?.text.match(/^\s*useHost:.*$/m)?.[0]?.trim() ?? 'useHost: undefined, // TODO(motu): the host bridge for this stack';
  const modelImports = model
    ? model.text
        .split('\n')
        .filter((l) => /^import /.test(l) && !/Archipelago|ELEMENT_REGISTRY/.test(l))
        .join('\n')
    : '';
  // Compared as SPECIFIERS, not as paths: `a-region.ts` and `a-region.tsx` are different paths and
  // the same module, which is what let the collision above through.
  const specifierOf = (f) => f.replace(/\.tsx?$/, '');
  if (specifierOf(bindingFile) !== specifierOf(typeFile)) {
    put(
      bindingFile,
      `'use client';
// The composition root for the \`${id}\` PAGE archipelago.
//
// 100% motu, by design: it is the one file that has to go when motu does, and \`motu removal-check\`
// deletes it whole and unwraps <${pascal}Region> wherever the page used it.
//
// The transport and host bridge are COPIED from this project's existing composition root, not chosen
// again: they are environment decisions the project already made, and answering them differently by
// accident is how two regions end up with two securities.
${modelImports}
import { ELEMENT_REGISTRY, ${archConst} } from '${paths.appPackage}';

export const ${pascal} = createRegion(${archConst}, {
  elements: ELEMENT_REGISTRY,
  ${transportLine}
  ${useHostLine}
});

/** The region wrapper, for the page to wrap its content in. */
export const MotuRegion = ${pascal}.Region;
`,
    );
  }

  // 5 — the lagoon overrides: two entries, added in place when the maps are where we expect them.
  const overrides = resolve(paths.lagoonDir, 'src/lagoon.tsx');
  const manual = [];
  if (existsSync(overrides)) {
    let text = readFileSync(overrides, 'utf8');
    const before = text;
    // ANCHORED, AND NOT INTO A COMMENT. These patterns used to match anywhere, and the scaffold's own
    // overrides file ships every map COMMENTED OUT as a template — so the first `archipelago init` in a
    // project spliced its entry into the middle of `// export const seed: … = {`, leaving a bare
    // `'id': seed, someArchipelago: { … } };` on the next line. A file that cannot parse, written by
    // the command whose job is to make the region work, and reported as a success.
    const seedMap = /^export const seed: LagoonOverrides\['seed'\] = \{/m;
    const layoutMap = /^export const layout: LagoonOverrides\['layout'\] = \{/m;
    const canSplice = seedMap.test(text) || layoutMap.test(text);
    const importLine = `import { ${pascal}RegionFrame, ${camel}Seed } from './regions/${id}.js';`;
    // The import goes in only if something will USE it. Adding it to a file whose maps are all
    // commented out left a dangling import of a module nothing referenced, and — because the file had
    // changed — suppressed the instruction telling the user to wire it up by hand.
    if (canSplice && !text.includes(importLine)) {
      text = text.replace(/^(import [\s\S]*?;\n)(?!import )/m, `$1${importLine}\n`);
    }
    if (seedMap.test(text) && !new RegExp(`\\b${id}:`).test(text)) {
      text = text.replace(seedMap, `$&\n  '${id}': ${camel}Seed,`);
    }
    if (layoutMap.test(text)) {
      text = text.replace(
        layoutMap,
        `$&\n  '${id}': (island) => <${pascal}RegionFrame island={island} />,`,
      );
    }
    if (text !== before) {
      writeFileSync(overrides, text);
      written.push(overrides);
    } else {
      manual.push(
        `wire \`${id}\` into ${relative(process.cwd(), overrides)} — its maps are still the scaffold's ` +
          `commented-out template, so there is nothing to add an entry to. Uncomment \`seed\` and ` +
          `\`layout\` (or use the \`regions\` array form) and reference \`${camel}Seed\` and ` +
          `\`${pascal}RegionFrame\` from ./regions/${id}.js`,
      );
    }
  }

  const rel = (f) => relative(process.cwd(), f);
  console.log(color.bold(`\nmotu archipelago init — ${id}\n`));
  for (const f of written) console.log('  ' + color.green('+ ') + rel(f));
  for (const f of skipped) console.log('  ' + color.dim('= ' + rel(f) + ' (exists, untouched)'));
  console.log('');
  console.log(color.bold('Next, and these are the parts nobody can generate:'));
  console.log(`  1. wrap the page's content in ${color.bold('<MotuRegion>')} (${rel(bindingFile)})`);
  console.log(`  2. add islands: ${color.bold(`motu island integrate <name> --archipelago ${id}`)}`);
  console.log(`  3. place each one in the page: ${color.bold(`<${pascal}.Island slot="…">`)}`);
  console.log(`  4. prove the host really uses it: ${color.bold('motu integrate check ' + id)}`);
  for (const m of manual) console.log('  ' + color.yellow('! ') + m);
}
