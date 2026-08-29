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
import { sep } from 'node:path';
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
export function hostSources() {
  const files = new Map();
  // The directories motu writes into. Everything else under the host root is the application's.
  const motuOwned = [paths.islandsDir, paths.archipelagosDir, paths.uiRoot, paths.lagoonDir].filter(Boolean);
  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = resolve(dir, e.name);
      // EXCLUDE MOTU'S OWN FILES, not the whole app. `APP_ROOT` is the motu app root, and when motu
      // owns the repository (`"app": "."`, the natural greenfield shape) it EQUALS the host root — so
      // this skipped every file, scanned nothing, and reported "no createRegion in the host" about a
      // host it had never opened. Excluding the directories motu actually owns keeps the check
      // meaningful in both layouts.
      if (motuOwned.some((d) => full === d || full.startsWith(d + sep))) continue;
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
/** Where a JSX opening tag ends, from its `<` — so an attribute scan stops at the element it is on. */
function closingOf(text, from) {
  let depth = 0;
  for (let i = from; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    else if (ch === '>' && depth === 0) return i - from + 1;
  }
  return text.length - from;
}

/**
 * The archipelago's prop -> slot map, when it declares a `root`; null when it does not.
 *
 * Read from the file's text like everything else here: this module never imports an archipelago, and
 * a `root` is a component reference, so importing one would drag the application's UI into the CLI.
 */
function rootSlotMap(id) {
  const file = paths.archipelagoFile(id);
  if (!existsSync(file)) return null;
  const text = blankComments(readFileSync(file, 'utf8'));
  if (!/^\s*root\s*:/m.test(text)) return null;
  // Both shapes: `slots: { a: 'x' }` on one line, and the multi-line form closing with `},`. Matching
  // only the second returned an EMPTY map for a small region, and an empty map reads as "this root
  // fills no slots" — so every prop the page passed came back as a slot the archipelago never
  // declared. Wrong, and loud, which is the only reason it was found.
  const block =
    // TOP-LEVEL ONLY (two spaces of indent), one-line form first. An island may declare its OWN
    // `slots` for nesting — actions' week navigator does, on one line — so an unanchored match read a
    // member's nested map as the region's. And the multi-line pattern is lazy but unanchored at its
    // start, so on a one-line map it ran on to the next `},` and swallowed the island entries below,
    // reading their `bind` pairs as slot mappings. The multi-line pattern is lazy but unanchored
    // at its start, so on a one-line `slots: { card: 'x' },` it ran on to the next line beginning with
    // `},` — swallowing the island entries below and reading their `bind` pairs as slot mappings. The
    // page's own props then matched those invented names, and five props of one card were reported as
    // slots the archipelago had never declared.
    text.match(/^ {2}slots\s*:\s*\{([^}\n]*)\}/m) ?? text.match(/^ {2}slots\s*:\s*\{([\s\S]*?)^ {2}\},/m);
  const map = {};
  // Both value forms: `prop: 'slot'` and `prop: { slot: 'slot', when|unless: 'key' }`.
  for (const [, prop, rest] of (block?.[1] ?? '').matchAll(/(\w+)\s*:\s*(\{[^}]*\}|'[^']+')/g)) {
    const slot = rest.startsWith('{') ? rest.match(/\bslot\s*:\s*'([^']+)'/)?.[1] : rest.slice(1, -1);
    if (slot) map[prop] = slot;
  }
  return map;
}

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

  // 1a — WHERE THE ARCHIPELAGO CAME FROM, which decides whether this file can be evaluated at all.
  //
  // Taking the archipelago from the SAME module that supplies the island registry means taking it
  // from the project barrel, and a barrel that exports the registry necessarily pulls in every
  // island. Any island whose view reaches an application page, and that page composing a region,
  // closes a cycle back to this file — and then `createRegion(<archipelago>)` runs while the
  // archipelago is still in its temporal dead zone.
  //
  // That is not hypothetical. On peps it was eight hops:
  //   directory-fiche root -> barrel -> islands/registry -> week-actions.island -> WeekActionsView
  //   -> BoosterStrip -> mission-helpers -> directory-member-fiche -> directory-fiche root
  // The whole lagoon is one module graph, so one module throwing took EVERY region blank, not just
  // that one, and the page said nothing at all.
  //
  // The fix is one line: import the archipelago from its own module. The registry may still come
  // from wherever it likes — it is the ARCHIPELAGO's path that has to be short.
  //
  // A WARNING, not an error: the rule is new, regions predate it, and a project whose islands never
  // reach a page is genuinely fine. `sources-tested` was introduced the same way.
  const bindingSrc = code(readFileSync(bindingFile, 'utf8'));
  const archImport = bindingSrc.match(new RegExp(`import\\s*\\{([^}]*\\b${constName}\\b[^}]*)\\}\\s*from\\s*['"]([^'"]+)['"]`));
  if (archImport && /\bELEMENT_REGISTRY\b|\bREGISTRY\b/.test(archImport[1])) {
    add(
      'warn',
      'root-imports',
      `${rel(bindingFile)} takes ${constName} from '${archImport[2]}' — the same module it takes the ` +
        `island registry from, which is the project barrel. That barrel pulls in every island, so an ` +
        `island reaching an application page that composes a region closes a cycle back to this file ` +
        `and ${constName} is read before it is initialised. Import it from its own module instead; ` +
        `the registry can stay where it is.`,
    );
  }

  // 1b — MOUNTED? a composition root nobody renders is a binding, not an integration. The wrapper is
  //      often re-exported under the page's own name (`export const MotuRegion = Actions.Region`), so
  //      take every name that resolves to it and look for any of them in the host's JSX.
  const wrappers = [`${binding}.Region`];
  for (const [, alias] of code(readFileSync(bindingFile, 'utf8')).matchAll(new RegExp(`const\\s+(\\w+)\\s*=\\s*${binding}\\.Region`, 'g'))) {
    wrappers.push(alias);
  }
  // THE MEMBER FORM IS NOT THE ONLY ONE, and on a React Server Component host it is not even legal.
  //
  // A server component may RENDER a client component; it may not read a property off a client
  // module's export. So `<Login.Island slot="…">` cannot appear in an RSC page at all — the
  // composition root has to re-export it (`export const LoginIsland = Login.Island`) and the page
  // renders that name. This scan knew only the member form, so peps' sign-in page — the project's
  // first server-component region — reported its one island as never placed while it was placed,
  // seeded and rendering. Take every name that resolves to the binding's Island, exactly as
  // `wrappers` above already does for its Region.
  const islandNames = [`${binding}.Island`];
  for (const [, alias] of code(readFileSync(bindingFile, 'utf8')).matchAll(
    new RegExp(`const\\s+(\\w+)\\s*=\\s*${binding}\\.Island\\b`, 'g'),
  )) {
    islandNames.push(alias);
  }

  // EVERY source, INCLUDING the one that composed it. This excluded `bindingFile`, on the assumption
  // that a region is composed in one module and rendered from another — true of a Next app, and false
  // of any application small enough to do both in its page. The review console does exactly that:
  // `const Review = createRegion(...)` at module scope and `<Review.Region>` in the component below
  // it, in one file, which is the shape motu's own scaffolding produces. It reported "nothing renders
  // <Review.Region>" about a file containing `<Review.Region>`.
  //
  // Nothing is lost by including it: the claim is "someone renders this wrapper", and the alias
  // declaration that prompted the exclusion (`const X = Review.Region`) has no `<` in front of it.
  const mountedIn = [...sources].filter(([, t]) => wrappers.some((w) => code(t).includes(`<${w}`)));
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
  const slotRe = new RegExp(`<(?:${islandNames.map(escapeRe).join('|')})\\s[^>]*?slot=["'\`]([^"'\`]+)`, 'g');
  for (const [file, text] of sources) {
    for (const [, slot] of code(text).matchAll(slotRe)) {
      placed.set(slot, [...(placed.get(slot) ?? []), file]);
    }
  }

  // A ROOT REGION places its islands BY PROP NAME. `<X.Root results={…} />` is the page saying it
  // wants the island the archipelago maps to `results`, and it never writes the slot — that is the
  // point of `root`, and it is why the scan above finds nothing on such a page.
  //
  // Whether a prop is passed is the whole check here, because `Root` deliberately does NOT fill in a
  // slot the page left out. Filling it in would turn a forgotten prop into a page that quietly
  // renders something different from the region everyone previewed; leaving it out and saying so
  // puts the decision in front of a human. (The lagoon mounts every declared slot regardless — there
  // is no page there to have an opinion.)
  const rootSlots = rootSlotMap(region.id);
  if (rootSlots) {
    const rootNames = [`${binding}.Root`];
    for (const [, alias] of code(readFileSync(bindingFile, 'utf8')).matchAll(
      new RegExp(`const\\s+(\\w+)\\s*=\\s*${binding}\\.Root\\b`, 'g'),
    )) {
      rootNames.push(alias);
    }
    let rootRendered = false;
    for (const [file, text] of sources) {
      const t = code(text);
      for (const name of rootNames) {
        const at = t.indexOf(`<${name}`);
        if (at === -1) continue;
        rootRendered = true;
        // The element's own attribute region: up to the matching `/>` or `>`, whichever ends it.
        const tag = t.slice(at, at + Math.max(0, closingOf(t, at)));
        // A SPREAD is still the page passing props — `{...(cond ? { hero } : { hero, frozenBanner })}`
        // is how a page keeps a whole branch in one expression, and reading only `prop=` reported four
        // of the ambassador region's slots as never placed on a page that places all four.
        const spreads = [...tag.matchAll(/\{\.\.\.([\s\S]*?)\}\s*(?=\s[\w{]|\/?>)/g)].map((m) => m[1]).join(' ');
        for (const [prop, slot] of Object.entries(rootSlots)) {
          // `children` is not an attribute: `<X.Root><Form/></X.Root>` passes it by nesting, which is
          // the natural shape for a region whose root takes one child.
          const asChild = prop === 'children' && !tag.trimEnd().endsWith('/>');
          if (asChild || new RegExp(`(^|\\s)${prop}\\s*=`).test(tag) || new RegExp(`(^|[\\s,{])${prop}\\s*[,:}]`).test(spreads)) {
            placed.set(slot, [...(placed.get(slot) ?? []), file]);
          }
        }
      }
    }
    if (rootRendered) add('ok', 'root', `<${rootNames[0]}> composes the region from its declared slots`);
    else
      add(
        'error',
        'root',
        `the archipelago declares a \`root\` and nothing renders <${rootNames.join('> or <')}> — ` +
          `the region has one description and the page is not using it`,
      );
  }
  // PLACED IS NOT THE SAME AS RENDERED, and the regex above cannot tell them apart. A slot written
  // inside `{isOpen && …}`, a ternary, or a `.map()` callback reads as placed and may never appear —
  // this region once carried an island that was declared for months and rendered by nothing, while
  // every check stayed green. The lagoon renders every declared slot unconditionally, so it cannot
  // catch it either; only the host's own source says so.
  //
  // A WARNING, not an error: conditional placement is often correct (a drawer, a tab, a permission).
  // What is not correct is not knowing.
  const conditional = conditionallyPlaced(sources, islandNames, code);
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
  const passed = passedProps(sources, islandNames, code, rootSlotMap(region.id));
  // AN ISLAND-PRODUCED KEY IS NOT THE PAGE'S TO FEED, so its absence is correct rather than a finding.
  //
  // This check and the runtime used to contradict each other. `react-island.tsx` refuses to publish a
  // prop whose key has a declared producer — "OWNED KEYS ARE NOT THE PAGE'S TO PUBLISH", D5 — and warns
  // when a page passes one; this warned when a page did NOT. A region with an island-owned key could
  // not satisfy both, and doing what this line asked was the laundering the ownership rules exist to
  // stop. Only HOST-FED keys are the page's responsibility.
  const producedHere = producedKeys(region);
  for (const island of liveIslands) {
    const bound = Object.entries(island.bind ?? {});
    if (!bound.length) continue;
    const props = passed.get(island.slot);
    if (!props) continue; // not placed with children — the registry form takes its props from the store
    const unfed = bound.filter(([prop, key]) => !props.has(prop) && !producedHere.has(key));
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

  // WHAT A DECLARED SOURCE PRODUCES. Needed twice below: a key a source feeds is established (2c),
  // and it is not the page's to feed by hand (2d).
  const sourceKeys = new Map(); // key -> declared source id
  const unreadable = [];
  for (const [sourceId, declared] of Object.entries(region.sources ?? {})) {
    // `produces: null` is "could not be read", which is NOT "produces nothing" — treating the two the
    // same is how this check would pass by looking at nothing.
    if (declared?.produces == null) {
      unreadable.push(`${sourceId} (${declared?.unresolved ?? 'unresolved'})`);
      continue;
    }
    for (const key of declared.produces) sourceKeys.set(key, sourceId);
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
  // THREE acts establish a host-fed key, not two: seed, a passed prop, and `provide()`. The docstring
  // above named two and the check believed it, so a key the page provides on mount was reported as
  // never established — advice to go and do what the page already does.
  const provided = providedKeys(sources, binding, code);
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
  // A key a DECLARED SOURCE produces is established by that source — it is neither seeded nor passed
  // as a prop, and reporting it as starved sends someone to add the very hand-feeding that 2d forbids.
  const starved = [...fedBy].filter(
    ([key, e]) => !e.passed && !seeded.has(key) && !provided.has(key) && !sourceKeys.has(key),
  );
  for (const [key, e] of starved) {
    add(
      'warn',
      'fed',
      `host-fed key ${key} is never established: the host neither seeds it nor passes it on ` +
        `${e.slots.join(', ')} — every reader sees undefined, and the lagoon cannot tell you because it ` +
        `seeds the key itself`,
    );
  }
  if (fedBy.size && !starved.length)
    add('ok', 'fed', `all ${fedBy.size} host-fed key(s) established · ${sourceKeys.size} by a declared source`);

  // DOES THE LAGOON PREVIEW THE REGION IN THE SHAPE THE PAGE CREATES?
  //
  // Every other check compares the region against its DECLARATION. This compares two things that are
  // both real: the keys the page establishes on first paint, and the keys the flows ever establish.
  // A key the page always seeds and no flow ever seeds is not a missing scenario — it is a missing
  // COLUMN. Every flow runs against a region shaped differently from the one users get, and nothing
  // else notices, because each side is internally consistent.
  //
  // Found by the coverage fold on motu's own review console — `App.tsx` seeds seven keys, its flows
  // seed four, so `busy` and `error` were absent from every previewed state. Which is the point of
  // putting it HERE: that finding cost a beacon, a corpus and a comparison to learn, and it is two
  // literal object key-lists in source. No browser, no traffic, no production.
  const flowSeeded = flowSeedKeys(region.id);
  // BOTH WAYS A PAGE CAN SEED: the call forms `seededKeys` knows, and the `createRegion` option.
  const pageSeeded = new Set([...seeded, ...createRegionSeedKeys(bindingFile, constName)]);
  if (flowSeeded === null) {
    add('skip', 'flow-shape', 'no readable flows — nothing to compare the page\'s seed against');
  } else if (!pageSeeded.size) {
    add('skip', 'flow-shape', 'the page establishes no keys by `seed(...)` — nothing to compare');
  } else {
    const missing = [...pageSeeded].filter((k) => !flowSeeded.has(k)).sort();
    if (missing.length) {
      add(
        'warn',
        'flow-shape',
        `the page seeds ${pageSeeded.size} key(s) and the flows seed ${flowSeeded.size}: ${missing.join(', ')} ` +
          `${missing.length === 1 ? 'is' : 'are'} established on every real page load and in no flow. ` +
          `The lagoon previews a region shaped differently from the one users get — add ${missing.length === 1 ? 'it' : 'them'} ` +
          `to the flow seeds in ${paths.rel(paths.archipelagoEvidence(region.id))}`,
      );
    } else {
      add('ok', 'flow-shape', `the flows seed every key the page does · ${pageSeeded.size} key(s)`, pageSeeded.size);
    }
  }

  // 2d — DOES THE HOST GO ROUND ITS OWN DECLARED SOURCES?
  //
  // A source declares which keys it produces, and the LAGOON has no way to go round it: `channelFrom`
  // names the declared source and passes data, with no expression position left for hand-written
  // orchestration. The page had one — fetch however you like, then `provide()` the result — so the
  // two halves could implement the same coupling differently, or the page could implement one the
  // region never carried at all. That is not a hypothetical: a console whose archipelago promised
  // "picking a repo changes what the list shows" performed it in two page effects, so the published
  // lagoon showed a project rail where clicking did nothing, and every check passed.
  //
  // Caught here as well as at runtime because `provide()` throwing is the moment someone runs the
  // page, and this is the moment they run `motu check`.
  if (unreadable.length) {
    add(
      'warn',
      'source-owned',
      `could not read what ${unreadable.join(', ')} produces, so nothing was checked against ` +
        `${unreadable.length > 1 ? 'those sources' : 'that source'} — the host may be feeding their keys by hand`,
    );
  }
  if (sourceKeys.size) {
    const bypassed = [...sourceKeys].filter(([key]) => provided.has(key));
    for (const [key, sourceId] of bypassed) {
      add(
        'error',
        'source-owned',
        `the host calls ${binding}.provide('${key}'), but ${key} is produced by the declared source ` +
          `'${sourceId}' — install the source instead of feeding its key by hand ` +
          `(\`channels: [channelFrom({ to: archipelago, id: '${sourceId}', args: [port] })]\`), or the page ` +
          `and the lagoon are free to answer the same coupling differently`,
      );
    }
    if (!bypassed.length)
      add('ok', 'source-owned', `no host write goes round a declared source · ${sourceKeys.size} source-produced key(s)`, sourceKeys.size);
  }


  // 2e — DOES THE LAGOON RENDER THESE ISLANDS WITH WHAT THE PAGE GIVES THEM?
  //
  // `<R.Island slot="x" props={{ shotUrl }} />` is the page's other expression position. Those props
  // are NOT region state — where the host lives, a formatter, a URL builder — so no bind declares
  // them and `fed` never looks. The lagoon had no counterpart at all until `LagoonOverrides.props`,
  // which means the island a human approves can be missing the very thing that makes it useful: the
  // review console's diff viewer rendered `<img src="">`, naturalWidth 0, with every check green and
  // a flow asserting its heading text.
  const pageEnvProps = elementProps(sources, binding);
  const overridesFile = paths.lagoonDir ? resolve(paths.lagoonDir, 'src/lagoon.tsx') : null;
  const fromLagoon = lagoonProps(overridesFile);
  if (pageEnvProps.size && fromLagoon === null) {
    add(
      'warn',
      'island-props',
      `the page passes props on ${[...pageEnvProps.keys()].join(', ')}, and the lagoon overrides could ` +
        `not be read — nothing was compared`,
    );
  } else if (pageEnvProps.size) {
    const slotsHere = new Map(liveIslands.map((i) => [i.slot, i]));
    const supplied = fromLagoon.get(region.id) ?? new Map();
    let compared = 0;
    for (const [slot, names] of pageEnvProps) {
      const island = slotsHere.get(slot);
      if (!island) continue;
      const bound = new Set(Object.keys(island.bind ?? {}));
      const env = [...names].filter((n) => !bound.has(n));
      if (!env.length) continue;
      compared += env.length;
      const missing = env.filter((n) => !(supplied.get(slot) ?? new Set()).has(n));
      if (missing.length) {
        add(
          'error',
          'island-props',
          `the page passes ${missing.join(', ')} to ${slot} and the lagoon supplies ${missing.length > 1 ? 'none of them' : 'nothing for it'} — ` +
            `the island is previewed and approved without what the page gives it. Add it to the lagoon's ` +
            `\`props\` override (a stand-in, not the real thing)`,
        );
      }
    }
    for (const [slot, names] of supplied) {
      const extra = [...names].filter((n) => !(pageEnvProps.get(slot) ?? new Set()).has(n));
      if (extra.length && slotsHere.has(slot)) {
        add(
          'warn',
          'island-props',
          `the lagoon gives ${slot} ${extra.join(', ')} and the page passes ${extra.length > 1 ? 'none of them' : 'no such prop'} — ` +
            `the preview shows more than the application does`,
        );
      }
    }
    if (compared) add('ok', 'island-props', `page-passed props are supplied by the lagoon too · ${compared} prop(s)`);
  }

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
    add('error', 'placed', `<${islandNames[0]} slot="${slot}"> is placed but the archipelago declares no such slot`);
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
/**
 * slot -> the props the page passes on the ISLAND ELEMENT itself (`<R.Island slot="x" props={{ a }} />`).
 *
 * Distinct from `passedProps`, which reads the CHILDREN form — the page's own component inside the
 * island. This is the other placement form, and its props are the ones with no lagoon counterpart:
 * not region state, so no bind declares them, and until now nothing compared them with anything.
 */
function elementProps(sources, binding) {
  const out = new Map();
  for (const [file] of sources) {
    let sf;
    try {
      sf = sourceFileAt(file, { allowJs: true, jsx: 4 });
    } catch {
      continue;
    }
    const opens = [
      ...sf.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement),
      ...sf.getDescendantsOfKind(SyntaxKind.JsxElement).map((e) => e.getOpeningElement?.()).filter(Boolean),
    ];
    for (const open of opens) {
      if (open.getTagNameNode?.().getText() !== `${binding}.Island`) continue;
      const attrs = open.getAttributes?.() ?? [];
      const attr = (n) => attrs.find((a) => (a.getNameNode?.().getText?.() ?? a.getName?.()) === n);
      const slot = attr('slot')?.getInitializer?.()?.getText?.()?.replace(/['"`{}]/g, '');
      const propsInit = attr('props')?.getInitializer?.();
      if (!slot || !propsInit) continue;
      const obj = propsInit.getExpression?.();
      const names = new Set(out.get(slot) ?? []);
      for (const prop of obj?.getProperties?.() ?? []) {
        const name = prop.getNameNode?.()?.getText?.() ?? prop.getName?.();
        if (name) names.add(String(name).replace(/['"`]/g, ''));
      }
      out.set(slot, names);
    }
  }
  return out;
}

/**
 * regionId -> slot -> prop names, from the lagoon's `props` override.
 *
 * Read with ts-morph rather than a regex: it is a nested object literal whose values are functions,
 * and a brace-counting reader over that is the kind of thing that silently returns nothing.
 */
function lagoonProps(overridesFile) {
  const out = new Map();
  if (!overridesFile || !existsSync(overridesFile)) return null;
  let sf;
  try {
    sf = sourceFileAt(overridesFile, { allowJs: true, jsx: 4 });
  } catch {
    return null;
  }
  const decl = sf.getVariableDeclaration?.('props');
  const obj = decl?.getInitializer?.();
  if (!obj?.getProperties) return out;
  for (const regionProp of obj.getProperties()) {
    const region = (regionProp.getNameNode?.()?.getText?.() ?? '').replace(/['"`]/g, '');
    const slots = new Map();
    for (const slotProp of regionProp.getInitializer?.()?.getProperties?.() ?? []) {
      const slot = (slotProp.getNameNode?.()?.getText?.() ?? '').replace(/['"`]/g, '');
      const names = new Set();
      for (const p of slotProp.getInitializer?.()?.getProperties?.() ?? []) {
        const n = p.getNameNode?.()?.getText?.() ?? p.getName?.();
        if (n) names.add(String(n).replace(/['"`]/g, ''));
      }
      slots.set(slot, names);
    }
    out.set(region, slots);
  }
  return out;
}

function passedProps(sources, islandNames, code, rootSlots) {
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
      if (!islandNames.includes(open?.getTagNameNode?.().getText())) continue;
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

    // THE ROOT FORM. `<X.Root header={<C a={1}/>} />` is the page passing that island's props too —
    // it just names the PROP instead of the slot, which is the whole point of `root`. Reading only
    // the `<X.Island>` form reported two of the actions region's keys as never established the moment
    // that page stopped writing slots, when the page was passing them exactly as before.
    for (const el of [
      ...sf.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement),
      ...sf.getDescendantsOfKind(SyntaxKind.JsxOpeningElement),
    ]) {
      if (el.getTagNameNode?.().getText().split('.').pop() !== 'Root') continue;
      for (const attr of el.getAttributes?.() ?? []) {
        const prop = attr.getNameNode?.().getText?.();
        const slot = prop ? rootSlots?.[prop] : null;
        if (!slot) continue;
        const props = new Set(out.get(slot) ?? []);
        for (const target of rootSlotElements(attr.getInitializer?.()?.getExpression?.())) {
          for (const a of target.getAttributes?.() ?? []) {
            const name = a.getNameNode?.().getText?.() ?? a.getName?.();
            if (name) props.add(name);
          }
        }
        out.set(slot, props);
      }
    }
  }
  return out;
}

/** What stands in a root slot: the element, or each branch of a conditional / `&&`. Never a descendant. */
function rootSlotElements(expr) {
  if (!expr) return [];
  switch (expr.getKind()) {
    case SyntaxKind.JsxSelfClosingElement:
      return [expr];
    case SyntaxKind.JsxElement:
      return [expr.getOpeningElement()];
    case SyntaxKind.ParenthesizedExpression:
      return rootSlotElements(expr.getExpression());
    case SyntaxKind.ConditionalExpression:
      return [...rootSlotElements(expr.getWhenTrue()), ...rootSlotElements(expr.getWhenFalse())];
    case SyntaxKind.BinaryExpression:
      return expr.getOperatorToken().getText() === '&&' ? rootSlotElements(expr.getRight()) : [];
    default:
      return [];
  }
}

/**
 * Slots whose `<X.Island>` sits under something that may not run: a logical `&&`, a ternary, or a
 * callback (`.map`, `.filter`). Uses the AST rather than the text, because "is this line inside a
 * conditional" is exactly the question a regex cannot answer.
 */
/** A name that goes into a RegExp — `Login.Island` carries a dot that must not match anything. */
function escapeRe(name) {
  return name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function conditionallyPlaced(sources, islandNames, code) {
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
        if (!islandNames.includes(el.getTagNameNode?.().getText())) continue;
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
  // A CHECK THAT LOOKED AT NOTHING HAS NOT PASSED — and, worse here, has not FAILED either. With no
  // host files in view every region reports "the application never composes it", which reads as a
  // finding about the app rather than about the scan. Say which it is.
  if (sources.size === 0) {
    console.log(color.bold('\nmotu integrate check\n'));
    console.log(
      `  ${color.yellow('!')} ${color.dim('host-sources'.padEnd(12))} scanned 0 files under ${paths.rel(HOST_ROOT)} ` +
        `(app, components, lib, src, pages) — nothing was examined, so nothing is proved about the host. ` +
        `Set \`hostSources\` in motu.config.json if the application lives elsewhere.`,
    );
    process.exit(2);
  }
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
 * Keys the host establishes through `createRegion(config, { seed: { … } })`.
 *
 * `seededKeys` knows the two CALL forms — `X.seed(k, v)` and `X.seed({ k })` — and motu's own review
 * console uses neither: it hands the seed to `createRegion` as an option, at module scope, which is
 * what the scaffolding produces and what the docs show. So the one shape most likely to be in front
 * of a reader was the shape this could not see.
 */
function createRegionSeedKeys(bindingFile, constName) {
  if (!bindingFile) return new Set();
  let src;
  try {
    src = blankComments(readFileSync(bindingFile, 'utf8'));
  } catch {
    return new Set();
  }
  const call = src.match(new RegExp(`createRegion\\(\\s*${constName}\\b`));
  if (!call) return new Set();
  const seedAt = src.indexOf('seed:', call.index);
  if (seedAt < 0) return new Set();
  const brace = src.indexOf('{', seedAt);
  if (brace < 0) return new Set();
  let depth = 0;
  let body = '';
  for (let i = brace; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) {
      body = src.slice(brace + 1, i);
      break;
    }
  }
  const keys = new Set();
  for (const entry of body.split(/,(?![^{[(]*[}\])])/)) {
    const name = entry.split(':')[0].trim().replace(/^\.\.\./, '');
    if (/^[A-Za-z_$][\w$]*$/.test(name)) keys.add(name);
  }
  return keys;
}

/**
 * The union of keys every declared FLOW establishes in its seed.
 *
 * Read from source rather than by importing the module: this runs inside a static check that must not
 * boot a loader, and a flow's seed is a literal object at the top of the file. Returns null when there
 * is nothing readable — a check that cannot see its input reports a skip, never a pass.
 *
 * Deliberately UNION rather than per-flow: one flow establishing a key is enough for the region to
 * have been previewed with that column present. What this catches is a key NO flow ever mentions.
 */
function flowSeedKeys(id) {
  const file = paths.archipelagoEvidence(id);
  if (!existsSync(file)) return null;
  let src;
  try {
    src = blankComments(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
  const keys = new Set();
  // `seed: { a, b: 1, ...SEED }` and `seed: SEED` both appear in real evidence. The spread and the
  // bare identifier are followed to their `const NAME = { … }` in the same file, which is the form
  // every evidence module in this repository uses.
  const objectKeys = (body) => {
    for (const entry of body.split(/,(?![^{[(]*[}\])])/)) {
      const name = entry.split(':')[0].trim().replace(/^\.\.\./, '');
      if (/^[A-Za-z_$][\w$]*$/.test(name)) keys.add(name);
    }
  };
  const balanced = (text, from) => {
    let depth = 0;
    for (let i = from; i < text.length; i++) {
      if (text[i] === '{') depth++;
      else if (text[i] === '}' && --depth === 0) return text.slice(from + 1, i);
    }
    return '';
  };
  const constObject = (name) => {
    const m = src.match(new RegExp(`const\\s+${name}\\s*(?::[^=]*)?=\\s*\\{`));
    return m ? balanced(src, m.index + m[0].length - 1) : null;
  };
  let found = false;
  for (const m of src.matchAll(/\bseed\s*:\s*/g)) {
    const rest = src.slice(m.index + m[0].length);
    found = true;
    if (rest.startsWith('{')) {
      const body = balanced(src, m.index + m[0].length);
      objectKeys(body);
      // `{ ...SEED, selectedShot }` — follow every spread to its declaration.
      for (const sp of body.matchAll(/\.\.\.([A-Za-z_$][\w$]*)/g)) {
        const inner = constObject(sp[1]);
        if (inner) objectKeys(inner);
      }
    } else {
      const ident = rest.match(/^([A-Za-z_$][\w$]*)/);
      const inner = ident && constObject(ident[1]);
      if (inner) objectKeys(inner);
    }
  }
  return found ? keys : null;
}

/**
 * The region keys the host establishes by hand, by either act: `X.seed(...)` / `seedArchipelago(...)`.
 *
 * Both the positional form (`seed('k', v)`) and the object form (`seed({ k: v })`), because both are
 * written in this codebase and a check that knew only one would report the other as missing.
 */
/**
 * Keys the host hands over with `provide(...)`. Same two argument forms as `seededKeys`, and split
 * from it because the two acts mean different things: a seed is first paint, a provide is the host
 * feeding a key it owns — and it must not own one a declared source produces.
 */
function providedKeys(sources, binding, code) {
  const keys = new Set();
  const idents = (text) =>
    splitTop(text)
      .map((entry) => entry.split(':')[0].trim())
      .filter((k) => /^[A-Za-z_$][\w$]*$/.test(k));
  for (const [, text] of sources) {
    const src = code(text);
    for (const m of src.matchAll(new RegExp(`(?:${binding}\\.provide|provideToArchipelago)\\s*\\(`, 'g'))) {
      let depth = 0;
      let i = m.index + m[0].length - 1;
      const start = i + 1;
      for (; i < src.length; i++) {
        if (src[i] === '(') depth++;
        else if (src[i] === ')' && --depth === 0) break;
      }
      for (const arg of splitTop(src.slice(start, i))) {
        const a = arg.trim();
        const quoted = a.match(/^['"`]([A-Za-z_$][\w$]*)['"`]$/);
        if (quoted) keys.add(quoted[1]);
        else if (a.startsWith('{')) for (const k of idents(a.slice(1, -1))) keys.add(k);
      }
    }
  }
  return keys;
}

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
