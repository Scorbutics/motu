// `motu integrate check` — the LAST MILE: does the HOST actually use what verifies green?
//
// Everything else proves one side of the boundary. `island verify` proves an island renders and
// declares honestly; `archipelago verify` proves the region's wires carry; `removal-check` proves you
// can delete the whole thing. Nothing proved the step in between — that the application composes the
// region, places its slots and reads its state — so a region could pass every check while no browser
// had ever rendered it. That is not hypothetical: `directory` verified clean for a day while the page
// still rendered the components directly and nothing called `createRegion` at all.
//
// STATIC, because the facts are in source: the composition root, the slot markers, and the page's own
// state. It answers "is this wired?", which is the question that blocks adoption; the runtime half
// ("does the wired page hold the same values it held before") needs the host's own dev server and is
// a separate lane.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { color, paths, HOST_ROOT, APP_ROOT, resolveAppImport } from '../lib/util.mjs';
import { readRegions } from '../lib/eject.mjs';

/** `client-portfolio` -> `clientPortfolioArchipelago`, the const an archipelago file exports. */
function archConst(id) {
  const camel = id.split(/[-_]/).map((w, i) => (i === 0 ? w : w[0].toUpperCase() + w.slice(1))).join('');
  return `${camel}Archipelago`;
}

/**
 * Every host source file, as text.
 *
 * The motu app root is excluded: a region composed inside motu's own folder is not the application
 * using it, it is motu talking to itself. Same walk as removal-check — the host's own top-level
 * folders, no node_modules, no dotfiles.
 */
function hostSources() {
  const files = new Map();
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
        files.set(full, readFileSync(full, 'utf8'));
      }
    }
  };
  for (const top of ['app', 'components', 'lib', 'src', 'pages']) walk(resolve(HOST_ROOT, top));
  return files;
}

/** Comments blanked, so a commented-out `<X.Island>` never counts as a placement. */
function code(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/\/\/[^\n]*/g, '');
}

/** Every store key an island produces (the `writes` values, both shapes). */
function producedKeys(region) {
  const keys = new Set();
  for (const island of region.islands) {
    for (const target of Object.values(island.writes ?? {})) {
      if (typeof target === 'string') keys.add(target);
      else for (const key of Object.values(target)) keys.add(key);
    }
  }
  return keys;
}

/** One region's integration, as data. */
function checkRegion(region, sources) {
  const findings = [];
  const add = (level, check, msg) => findings.push({ level, check, msg });
  const constName = archConst(region.id);
  const rel = (f) => relative(HOST_ROOT, f);

  // 1 — COMPOSED? `createRegion(<id>Archipelago)` somewhere in the host.
  let binding = null;
  let bindingFile = null;
  for (const [file, text] of sources) {
    const m = code(text).match(new RegExp(`const\\s+(\\w+)\\s*=\\s*createRegion\\(\\s*${constName}\\b`));
    if (m) {
      binding = m[1];
      bindingFile = file;
      break;
    }
  }
  if (!binding) {
    add(
      'error',
      'composed',
      `no \`createRegion(${constName})\` in the host — the region is declared and verified, but the ` +
        `application never composes it, so nothing it promises has ever run outside the lagoon`,
    );
    return { id: region.id, findings };
  }
  add('ok', 'composed', `${binding} = createRegion(${constName}) in ${rel(bindingFile)}`);

  // 1b — MOUNTED? a composition root nobody renders is a binding, not an integration. The wrapper is
  //      often re-exported under the page's own name (`export const MotuRegion = Actions.Region`), so
  //      take every name that resolves to it and look for any of them in the host's JSX.
  const wrappers = [`${binding}.Region`];
  for (const [, alias] of code(readFileSync(bindingFile, 'utf8')).matchAll(new RegExp(`const\\s+(\\w+)\\s*=\\s*${binding}\\.Region`, 'g'))) {
    wrappers.push(alias);
  }
  const mountedIn = [...sources].filter(([f, t]) => f !== bindingFile && wrappers.some((w) => code(t).includes(`<${w}`)));
  if (mountedIn.length) add('ok', 'mounted', `<${wrappers[wrappers.length - 1]}> renders in ${rel(mountedIn[0][0])}`);
  else
    add(
      'error',
      'mounted',
      `nothing renders <${wrappers.join('> or <')}> — the region is composed but no page wraps its content in it, ` +
        `so the store exists and no island ever mounts`,
    );

  // 2 — PLACED? every declared slot marked in the host's own JSX.
  const placed = new Map();
  const slotRe = new RegExp(`<${binding}\\.Island\\s[^>]*?slot=["'\`]([^"'\`]+)`, 'g');
  for (const [file, text] of sources) {
    for (const [, slot] of code(text).matchAll(slotRe)) {
      placed.set(slot, [...(placed.get(slot) ?? []), file]);
    }
  }
  const declared = region.islands.map((i) => i.slot);
  const missing = declared.filter((s) => !placed.has(s));
  const unknown = [...placed.keys()].filter((s) => !declared.includes(s));
  if (missing.length) {
    add(
      'error',
      'placed',
      `slot(s) declared but never placed in the host: ${missing.join(', ')} — the island cannot render ` +
        `in the application, whatever the lagoon shows`,
    );
  }
  for (const slot of unknown) {
    add('error', 'placed', `<${binding}.Island slot="${slot}"> is placed but the archipelago declares no such slot`);
  }
  if (!missing.length && !unknown.length) add('ok', 'placed', `all ${declared.length} declared slot(s) placed in the host`);

  // 3 — READ? a region nobody reads is a store the page writes into and ignores.
  const readers = [...sources].filter(([, t]) => code(t).includes(`${binding}.useRegion(`));
  const bound = region.islands.some((i) => i.bind ?? true);
  if (readers.length) add('ok', 'read', `${binding}.useRegion() in ${readers.length} host file(s)`);
  else if (bound) add('warn', 'read', `nothing calls ${binding}.useRegion() — the host feeds the region but never reads it back`);

  // 3b — does the PAGE install the declared source? The region names one module per host-fed group
  //      precisely so both consumers use it; a page that fetches those keys its own way is the other
  //      half of the drift the lagoon side already refuses.
  const sourcesBlock = readFileSync(region.file, 'utf8').match(/sources:\s*\{([\s\S]*?)\n  \},/)?.[1];
  if (sourcesBlock) {
    const users = [...sources].filter(([, t]) => code(t).includes(`${binding}.`));

    for (const m of sourcesBlock.matchAll(/(\w+):\s*\{([\s\S]*?)\}/g)) {
      const module = m[2].match(/module:\s*'([^']+)'/)?.[1];
      if (!module) continue;
      // Resolved, not compared as text: the page says `./directory-source`, the region says
      // `@/app/dashboard/directory/directory-source`, and they are the same file.
      const target = resolveAppImport(region.file, module);
      const installed = users.some(([f, t]) =>
        [...code(t).matchAll(/from\s*['"]([^'"]+)['"]/g)].some((i) => resolveAppImport(f, i[1]) === target),
      );
      if (installed) add('ok', 'source', `source "${m[1]}" installed from ${module}`);
      else
        add(
          'error',
          'source',
          `no host file that uses ${binding} imports ${module} — the region declares source "${m[1]}" ` +
            `produces its keys, so the page must install it rather than feed them another way`,
        );
    }
  }

  // 4 — DUPLICATED? the page keeping its own copy of a key an island produces is integration
  //     half-done: both exist, they drift, and the one the user sees is whichever the page renders.
  const produced = producedKeys(region);
  const users = [...sources].filter(([, t]) => code(t).includes(`${binding}.`));
  for (const [file, text] of users) {
    for (const [, name] of code(text).matchAll(/const\s+\[(\w+)\s*,\s*set\w+\]\s*=\s*useState/g)) {
      if (produced.has(name)) {
        add(
          'warn',
          'duplicated',
          `${rel(file)} keeps \`useState\` for "${name}", which an island produces — the region owns it ` +
            `after integration, and two copies of one value drift`,
        );
      }
    }
  }
  return { id: region.id, findings };
}

/**
 * Every region's integration, as data — shared with `motu check`, which runs this as its last section.
 *
 * Deliberately the same code path: an integration gate that only exists behind its own verb is a gate
 * nobody runs, and this is the one question the rest of `check` cannot ask.
 */
export function integrationResults(only) {
  const regions = readRegions(paths.archipelagosDir).filter((r) => !only || r.id === only);
  if (!regions.length) return [];
  const sources = hostSources();
  return regions.map((r) => checkRegion(r, sources));
}

export async function integrateCheckCommand(argv) {
  const results = integrationResults(argv._[0]);
  if (!results.length) {
    console.error(color.red(`✗ no archipelago${argv._[0] ? ` "${argv._[0]}"` : 's'} to check`));
    process.exit(2);
  }

  if (argv.json) {
    console.log(JSON.stringify({ host: HOST_ROOT, regions: results }, null, 2));
    return process.exit(results.some((r) => r.findings.some((f) => f.level === 'error')) ? 1 : 0);
  }

  console.log(color.bold('\nmotu integrate check — is the host using what verifies green?\n'));
  let errors = 0;
  let warns = 0;
  for (const result of results) {
    const bad = result.findings.filter((f) => f.level === 'error').length;
    const warn = result.findings.filter((f) => f.level === 'warn').length;
    errors += bad;
    warns += warn;
    const mark = bad ? color.red('✗') : warn ? color.yellow('!') : color.green('✓');
    console.log(`  ${mark} ${color.bold(result.id.padEnd(18))}${color.dim(bad ? `${bad} error(s)` : warn ? `${warn} warning(s)` : 'integrated')}`);
    for (const f of result.findings) {
      if (f.level === 'ok') continue;
      const m = f.level === 'error' ? color.red('✗') : color.yellow('!');
      console.log(`      ${m} ${color.dim(f.check.padEnd(12))} ${f.msg}`);
    }
  }
  console.log('');
  if (errors) console.log(color.red(color.bold('FAIL')) + `  ${errors} error(s), ${warns} warning(s)`);
  else console.log(color.green(color.bold('PASS')) + color.dim(`  ${results.length} region(s) integrated · ${warns} warning(s)`));
  process.exit(errors ? 1 : 0);
}
