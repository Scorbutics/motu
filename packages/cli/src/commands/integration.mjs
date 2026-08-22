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
import { blankComments, color, paths, HOST_ROOT, APP_ROOT, resolveAppImport } from '../lib/util.mjs';
import { readRegions } from '../lib/eject.mjs';
import { SyntaxKind } from 'ts-morph';
import { sourceFileAt } from '../lib/ts-project.mjs';

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
const code = blankComments;

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

  // MEMBERSHIP FIRST when it is DATA. A catalogue region's members are decided at runtime, so nothing
  // about them depends on the composition root existing — and the questions worth asking (does every
  // declared type have a contract?) are most useful during adoption, before anything is wired.
  // Planned islands are surveyed, not built: nothing places a slot whose island does not exist.
  const liveIslands = region.islands.filter((i) => !i.planned);
  const catalogueMembers = region.membership === 'catalogue' ? liveIslands.filter((i) => i.member) : [];
  const placedIslands = region.membership === 'catalogue' ? liveIslands.filter((i) => !i.member) : liveIslands;

  if (region.membership === 'catalogue') {
    add(
      'ok',
      'catalogue',
      `${catalogueMembers.length} member type(s) summoned by data (${catalogueMembers.map((i) => i.member).join(', ')}), ` +
        `${placedIslands.length} island(s) still placed in source — run \`motu verify catalogue\` against a capture ` +
        `to learn whether the declared types are the types the data produces`,
    );
    const withoutContract = catalogueMembers.filter((i) => !i.writes || !Object.keys(i.writes).length);
    if (withoutContract.length) {
      add(
        'warn',
        'contract',
        `${withoutContract.map((i) => i.slot).join(', ')} declare no \`writes\` — a catalogue member that ` +
          `owns nothing is fine, but check it is not simply undeclared`,
      );
    }
  }

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

  // 2 — PLACED? every declared slot marked in the host's own JSX. In a catalogue region this covers
  //     the chrome only: an island summoned by a data row has no `<X.Island slot>` to find, and
  //     demanding one would report the app's own design as an error.
  {
  const placed = new Map();
  const slotRe = new RegExp(`<${binding}\\.Island\\s[^>]*?slot=["'\`]([^"'\`]+)`, 'g');
  for (const [file, text] of sources) {
    for (const [, slot] of code(text).matchAll(slotRe)) {
      placed.set(slot, [...(placed.get(slot) ?? []), file]);
    }
  }
  // PLACED IS NOT THE SAME AS RENDERED, and the regex above cannot tell them apart. A slot written
  // inside `{isOpen && …}`, a ternary, or a `.map()` callback reads as placed and may never appear —
  // this region once carried an island that was declared for months and rendered by nothing, while
  // every check stayed green. The lagoon renders every declared slot unconditionally, so it cannot
  // catch it either; only the host's own source says so.
  //
  // A WARNING, not an error: conditional placement is often correct (a drawer, a tab, a permission).
  // What is not correct is not knowing.
  const conditional = conditionallyPlaced(sources, binding, code);
  for (const [slot, why] of conditional) {
    if (!placedIslands.some((i) => i.slot === slot)) continue;
    add(
      'warn',
      'placed',
      `${slot} is placed inside ${why} — the lagoon renders it unconditionally, so nothing here proves ` +
        `the application ever reaches it. Check the branch is one users actually take`,
    );
  }

  // 2b — DOES THE PAGE FILL WHAT THE ISLAND BINDS?
  //
  // `<X.Island slot="s"><Card/></X.Island>` publishes the CHILD's props into the region under the
  // island's `bind` keys. A prop the page does not pass is a key nothing feeds, and the island runs on
  // its default — placed, composed, read, and quietly empty. The lagoon cannot see this: it seeds the
  // key itself, which is the whole point of a preview and the reason it cannot answer this question.
  const passed = passedProps(sources, binding, code);
  for (const island of liveIslands) {
    const bound = Object.entries(island.bind ?? {});
    if (!bound.length) continue;
    const props = passed.get(island.slot);
    if (!props) continue; // not placed with children — the registry form takes its props from the store
    const unfed = bound.filter(([prop]) => !props.has(prop));
    if (unfed.length) {
      add(
        'warn',
        'placed',
        `${island.slot} binds ${unfed.map(([p, k]) => `${p} → ${k}`).join(', ')}, and the page's own element ` +
          `passes ${unfed.length > 1 ? 'none of those props' : 'no such prop'} — the island renders its default ` +
          `and the region key stays empty`,
      );
    }
  }

  // 2c — IS EVERY HOST-FED KEY ACTUALLY ESTABLISHED?
  //
  // Host-fed is DERIVED, exactly as the rules say it is: every bound key that no island `writes`. The
  // page owes each of them a value, by one of the two acts that exist — `seed(...)`, or passing the
  // bound prop on a placed island's own element. A key that gets neither is read as `undefined` by
  // whoever reads it, and no other check can see it: the archipelago declares the key, the island
  // binds it, the lagoon SEEDS it (that is what a preview does), and the host quietly feeds nothing.
  const produced = new Set(liveIslands.flatMap((i) => Object.values(i.writes ?? {}).map((t) => (typeof t === 'string' ? t : Object.values(t)).toString())).flat());
  const seeded = seededKeys(sources, binding, code);
  const fedBy = new Map(); // host-fed key -> the slots whose bind could feed it
  for (const island of liveIslands) {
    for (const [prop, key] of Object.entries(island.bind ?? {})) {
      if (produced.has(key)) continue;
      const entry = fedBy.get(key) ?? { slots: [], passed: false };
      entry.slots.push(island.slot);
      if (passed.get(island.slot)?.has(prop)) entry.passed = true;
      fedBy.set(key, entry);
    }
  }
  const starved = [...fedBy].filter(([key, e]) => !e.passed && !seeded.has(key));
  for (const [key, e] of starved) {
    add(
      'warn',
      'fed',
      `host-fed key ${key} is never established: the host neither seeds it nor passes it on ` +
        `${e.slots.join(', ')} — every reader sees undefined, and the lagoon cannot tell you because it ` +
        `seeds the key itself`,
    );
  }
  if (fedBy.size && !starved.length) add('ok', 'fed', `all ${fedBy.size} host-fed key(s) seeded or passed`);

  const declared = placedIslands.map((i) => i.slot);
  const missing = declared.filter((s) => !placed.has(s));
  // UNKNOWN means the archipelago declares no such slot — measured against EVERY live island, not
  // just the source-placed ones. A catalogue member is summoned by data AND may still be wrapped in
  // source (Twenty's dispatch wraps two of its widget cases), and comparing against the chrome-only
  // list reported both of them as slots the region had never heard of.
  const knownSlots = liveIslands.map((i) => i.slot);
  const unknown = [...placed.keys()].filter((s) => !knownSlots.includes(s));
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
  if (!missing.length && !unknown.length && declared.length)
    add('ok', 'placed', `all ${declared.length} source-placed slot(s) placed in the host`);
  }

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
/**
 * slot -> the props the page passes to the island's child element.
 *
 * Only the WRAP form has an answer: `<X.Island slot="s"><Card a={1}/></X.Island>` publishes `a`. A
 * self-closing `<X.Island slot="s"/>` renders from the registry and takes its props from the store, so
 * there is nothing here to compare and the slot is absent from the map rather than empty in it —
 * "passes nothing" and "there is nothing to pass" are different answers.
 */
function passedProps(sources, binding, code) {
  const out = new Map();
  for (const [file] of sources) {
    let sf;
    try {
      sf = sourceFileAt(file, { allowJs: true, jsx: 4 });
    } catch {
      continue;
    }
    for (const el of sf.getDescendantsOfKind(SyntaxKind.JsxElement)) {
      const open = el.getOpeningElement?.();
      if (open?.getTagNameNode?.().getText() !== `${binding}.Island`) continue;
      const slot = open
        .getAttributes?.()
        ?.find((a) => (a.getNameNode?.().getText?.() ?? a.getName?.()) === 'slot')
        ?.getInitializer?.()
        ?.getText?.()
        ?.replace(/['"`{}]/g, '');
      if (!slot) continue;
      const props = new Set();
      for (const child of el.getJsxChildren?.() ?? []) {
        const childOpen =
          child.getKind?.() === SyntaxKind.JsxElement
            ? child.getOpeningElement?.()
            : child.getKind?.() === SyntaxKind.JsxSelfClosingElement
              ? child
              : null;
        for (const a of childOpen?.getAttributes?.() ?? []) {
          const name = a.getNameNode?.().getText?.() ?? a.getName?.();
          if (name) props.add(name);
        }
      }
      out.set(slot, props);
    }
  }
  return out;
}

/**
 * Slots whose `<X.Island>` sits under something that may not run: a logical `&&`, a ternary, or a
 * callback (`.map`, `.filter`). Uses the AST rather than the text, because "is this line inside a
 * conditional" is exactly the question a regex cannot answer.
 */
function conditionallyPlaced(sources, binding, code) {
  const out = new Map();
  for (const [file] of sources) {
    let sf;
    try {
      sf = sourceFileAt(file, { allowJs: true, jsx: 4 });
    } catch {
      continue; // unparseable here is not a finding — `placed` already read it as text
    }
    for (const kind of [SyntaxKind.JsxOpeningElement, SyntaxKind.JsxSelfClosingElement]) {
      for (const el of sf.getDescendantsOfKind(kind)) {
        if (el.getTagNameNode?.().getText() !== `${binding}.Island`) continue;
        // `getName()` is not the accessor here — on a JsxAttribute the name is a node, and reading it
        // the wrong way returned undefined for EVERY element, so the whole check silently found
        // nothing while looking like it ran.
        const slotAttr = el
          .getAttributes?.()
          ?.find((a) => (a.getNameNode?.().getText?.() ?? a.getName?.()) === 'slot');
        const slot = slotAttr?.getInitializer?.()?.getText?.()?.replace(/['"`{}]/g, '');
        if (!slot) continue;
        let why = null;
        for (let node = el.getParent(); node && !why; node = node.getParent()) {
          const k = node.getKind();
          if (k === SyntaxKind.ConditionalExpression) why = 'a ternary';
          else if (k === SyntaxKind.BinaryExpression && node.getOperatorToken?.().getText() === '&&') why = 'a `&&` guard';
          else if (k === SyntaxKind.ArrowFunction || k === SyntaxKind.FunctionExpression) {
            const call = node.getParent();
            const callee = call?.getExpression?.()?.getText?.() ?? '';
            if (/\.(map|filter|flatMap|forEach)$/.test(callee)) why = `a \`${callee.split('.').pop()}()\` callback`;
          }
        }
        if (why) out.set(slot, why);
      }
    }
  }
  return out;
}

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

/**
 * The region keys the host establishes by hand, by either act: `X.seed(...)` / `seedArchipelago(...)`.
 *
 * Both the positional form (`seed('k', v)`) and the object form (`seed({ k: v })`), because both are
 * written in this codebase and a check that knew only one would report the other as missing.
 */
function seededKeys(sources, binding, code) {
  const keys = new Set();
  const idents = (text) =>
    splitTop(text)
      .map((entry) => entry.split(':')[0].trim())
      .filter((k) => /^[A-Za-z_$][\w$]*$/.test(k));
  for (const [, text] of sources) {
    const src = code(text);
    for (const m of src.matchAll(new RegExp(`(?:${binding}\\.seed|seedArchipelago)\\s*\\(`, 'g'))) {
      let depth = 0;
      let i = m.index + m[0].length - 1;
      const start = i + 1;
      for (; i < src.length; i++) {
        if (src[i] === '(') depth++;
        else if (src[i] === ')' && --depth === 0) break;
      }
      const args = splitTop(src.slice(start, i));
      for (const arg of args) {
        const a = arg.trim();
        // `seed('key', value)` / `seedArchipelago(id, 'key', value)` — a quoted argument is a key name.
        const quoted = a.match(/^['"`]([A-Za-z_$][\w$]*)['"`]$/);
        if (quoted) keys.add(quoted[1]);
        // `seed({ recentMembers })` — the SHORTHAND is the form this codebase actually writes, and a
        // `key:` regex reads right past it. That is how the object form went undetected while the
        // positional one passed: the check was half-blind and both halves looked identical from here.
        else if (a.startsWith('{')) for (const k of idents(a.slice(1, -1))) keys.add(k);
      }
    }
  }
  return keys;
}

/** Split on commas at depth 0 — nested objects, arrays, calls and generics stay whole. */
function splitTop(text) {
  const out = [];
  let depth = 0;
  let last = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) depth--;
    else if (c === ',' && depth === 0) {
      out.push(text.slice(last, i));
      last = i + 1;
    }
  }
  out.push(text.slice(last));
  return out.filter((s) => s.trim());
}
