// A region's archipelago config: bind, writes, slots, ownership — the declaration itself.
// Split out of commands/verify.mjs; verify.mjs re-exports the public surface.
import { existsSync, readFileSync } from 'node:fs';
import { readRegions } from '../../lib/eject.mjs';
import { declaredSlotNames, frameModuleFor, nestedSlots } from '../../lib/lagoon-declares.mjs';
import { stubParity } from '../../lib/stubs.mjs';
import { HOST, LEGACY_FIT, paths } from '../../lib/util.mjs';
import { blocksAfter, boundKeyGroups, boundKeysIn, keysIn } from './island-static.mjs';
import { registeredTags } from './region-composition.mjs';

export function archipelagoConfigChecks(report, id) {
  const archPath = paths.archipelagoFile(id);
  if (!existsSync(archPath)) {
    report.error('registered', `no archipelago at ${paths.rel(archPath)}`);
    return;
  }
  const text = readFileSync(archPath, 'utf8');

  // The region's declared shape (D8). Under a host that owns its own page state, the page and the
  // archipelago otherwise name the same values twice with nothing linking them — acme's page called it
  // `loadingReceived` while the store key was `receivedLoading`. Requiring the parameter makes the
  // app's own type the single vocabulary, and a rename becomes a compile error.
  //
  // Skipped on an ocean: there is no app-side type to extract there — region state lives in `$scope`
  // and motu declares it, so there is no second declaration and nothing to drift against.
  if (LEGACY_FIT) {
    report.skip('region-type', `region state is motu's on host '${HOST}' — no app-side type to reference`);
  } else {
    // Either declaration form carries it — `satisfies ArchipelagoConfig<R, …>` or `archipelago<R, …>()`
    // — and the argument list can carry more than the region, so stop at the first `,` or `>`.
    const param = text.match(/(?:ArchipelagoConfig|\barchipelago)<\s*([A-Za-z_$][\w$]*)\s*[,>]/);
    if (param) {
      report.ok('region-type', `bind keys are checked against \`${param[1]}\``);
    } else if (!(readRegions(paths.archipelagosDir).find((r) => r.id === id)?.islands ?? []).length) {
      // A REGION WITH NO ISLANDS HAS NO BIND KEYS TO CHECK. `archipelago create` scaffolds exactly
      // that, so a new project's first `motu check` — run straight after the next-step the scaffolder
      // prints — opened on an ERROR about the thing it had just been given. The demand is right the
      // moment the region has a member; before that it is the tool failing its own output.
      report.warn(
        'region-type',
        'no region type yet — declare it as `archipelago<TRegion, ElementTypes, ProducedKeys>()({…}, {…})` with a ' +
          'type EXTRACTED FROM THE APP before adding the first island, so bind keys cannot drift from it',
      );
    } else {
      report.error(
        'region-type',
        'no region type — declare it as `archipelago<TRegion, ElementTypes, ProducedKeys>()({…}, {…})` with a type ' +
          'EXTRACTED FROM THE APP (no motu import, erases at runtime) so bind keys cannot drift from it',
      );
    }
  }

  // --- coupling: which members actually share state? -------------------------------------------
  //
  // An archipelago is a declared grouping of islands scattered across ONE PAGE. Most members couple
  // with nothing — they are fed by props or read the backend themselves — and that is normal, not a
  // smell: a page is a mix. So there is no rule here that a grouping must be coupled.
  //
  // What IS reported: a key written inside and read by no member. That means the coupling escapes the
  // archipelago, and it is the check that found the real bug — `newReceivedCount` was written here and
  // read by a button on the same page that had been left out because the boundary followed a DOM
  // subtree rather than the page.
  //
  // A warning, not an error: under Model B the host page is a legitimate reader, so a key crossing to
  // it is a design choice the rule names rather than forbids.
  {
    // Over CODE, not comments. `motu archipelago create` scaffolds its wiring examples as comments
    // (`// bind: { someProp: 'someStoreKey' }`), so analysing the raw text reports a scaffolded TODO
    // as real shared state — a green light for coupling that does not exist. Blank comments out,
    // keeping newlines so any line number stays true.
    const code = text
      .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
      .replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length));

    // WHO OWNS WHAT (docs/plan-key-ownership.md). Three declarations, all static:
    //   writes:   { ev: key }  an island owns these, and the mapping is what makes them ejectable
    //   bind:     { prop: key} who reads
    // A `store.set` left inside an `on` handler still writes, but opaquely — it is counted as written
    // and reported, because nothing can draw it or generate wiring from it.
    const declaredWritten = new Set(keysIn(blocksAfter(code, 'writes:', '{')));
    const opaqueWritten = new Set([...code.matchAll(/store\.set\(\s*['"]([^'"]+)['"]/g)].map((m) => m[1]));
    const written = new Set([...declaredWritten, ...opaqueWritten]);
    // Both forms of `bind`, PLUS declared `reads` — a key an island consumes straight from the host's
    // own store, which has no prop to find. Without those, a region whose islands talk through the
    // app's state looks uncoupled.
    const declaredReads = [...code.matchAll(/\breads:\s*\[([^\]]*)\]/g)].flatMap((m) =>
      [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]),
    );
    const read = new Set([...boundKeysIn(code), ...declaredReads]);
    // Host-fed is DERIVED — bound here, written by no island — with the explicit list still honoured
    // for a key nothing binds.
    // HOST-FED, DERIVED: read by an island, written by none. This used to union a declared
    // `provides: [...]` on top, and that list is gone — it restated exactly this subtraction, had to be
    // maintained by hand, and its only checks (`unowned`, `disputed`) were empty by construction:
    // `unowned` subtracted a set that already covered every read key, and `disputed` needed a
    // `provides` no region had written since the derivation existed.
    const provided = new Set([...read].filter((k) => !written.has(k)));
    const shared = [...written].filter((k) => read.has(k));

    // Keys more than one island READS and no island writes: the host drives them, and two islands
    // moving together because of one is a coupling even though motu owns neither end of it.
    const readCount = new Map();
    for (const group of [...boundKeyGroups(code), ...[...code.matchAll(/\breads:\s*\[([^\]]*)\]/g)].map((m) => [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]))]) {
      for (const k of new Set(group)) readCount.set(k, (readCount.get(k) ?? 0) + 1);
    }
    // n > 1, OR one island that DECLARED the read. `reads` is an explicit statement that this island
    // depends on host state — the whole reason to write it down — so reporting it needs no second
    // reader. Twenty's side panel is the case: one island, one key, and a coupling that is the point
    // of the region.
    const hostShared = [...readCount]
      .filter(([k, n]) => !written.has(k) && (n > 1 || declaredReads.includes(k)))
      .map(([k]) => k);

    const orphanKeys = [...written].filter((k) => !read.has(k));
    if (orphanKeys.length) {
      report.warn(
        'coupling',
        `key(s) written but read by no island here: ${orphanKeys.join(', ')} — the coupling ESCAPES this ` +
          `archipelago. Either its reader is an island on this page that is not a member yet, or it is ` +
          `cross-page, which the lagoon does not verify (D11) and the store does not survive`,
      );
    }
    if (shared.length) {
      report.ok('coupling', `shared state: ${shared.join(', ')}`, { n: shared.length, of: 'shared key(s)' });
    } else if (hostShared.length) {
      // NOT independent, and saying so mattered: Twenty's two record-page widgets both bind
      // `editingWidgetId`, which the app writes, and driving the lagoon showed one flipping to
      // "editing" while the other stayed idle — a visible coupling this check called independence,
      // because `shared` is the intersection of ISLAND-written and island-read.
      report.ok(
        'coupling',
        `coupled through the host: ${hostShared.join(', ')} — read by more than one island, written by ` +
          `none of them, so the application is what couples them and the lagoon must seed it to show them apart`,
        { n: hostShared.length, of: 'host-driven key(s)' },
      );
    } else {
      // Always say something. A check that reports nothing is indistinguishable from one that did not
      // run — and "these islands are independent" is a real, useful answer, not an absence.
      report.ok(
        'coupling',
        'no shared state between islands — a page whose islands are independent',
        { n: readCount.size, of: 'key(s) read' },
      );
    }

    // --- composition: a slot filled by another island must be one this region declares -------------
    {
      // PARSED, NOT MATCHED — and by the reader this file ALREADY IMPORTS and uses 400 lines above
      // (`nestedSlots`, for `render-coverage`). One question, two implementations, in one file.
      //
      // What the regexes had to encode, and no longer do: that the region's own `slots` sits at two
      // spaces of indent while a member's nested map is deeper (counting the region's made every root
      // slot read as an island nested in another), and that a slot entry may take the object form
      // `{ slot: 'auth-error', when: 'authError' }` where taking every quoted string read `when`'s
      // region key as an undeclared slot — an error about a shape that was correct.
      //
      // `declaredSlotNames` reads the ISLAND ENTRIES rather than every `slot:` in the file, which the
      // regex could not distinguish: it also counted the names inside the region-level map, so a slot
      // referenced there and declared by no island entry passed the very check that exists to catch it.
      const declaredSlots = declaredSlotNames(paths.archipelagoFile(id));
      const filled = [...nestedSlots(paths.archipelagoFile(id))];
      const missing = [...new Set(filled)].filter((slot) => !declaredSlots.has(slot));
      if (missing.length) {
        report.error(
          'composition',
          `island slot(s) filled with an island this region does not declare: ${missing.join(', ')}`,
        );
      } else if (filled.length) {
        report.ok('composition', 'every nested slot is one this region declares', { n: filled.length, of: 'nested island(s)' });
      }
    }

    // --- ownership: every key an island READS should have exactly one declared owner --------------
    //
    // ONE PRODUCER, checked per island rather than over the file. `declaredWritten` is a Set, so two
    // islands claiming the same key collapse into one entry and the region reported "4/4 bound key(s)
    // owned" for a key with two owners — caught only later, at runtime, by the store guard.
    //
    // The timing is the point. Two agents working in parallel each add an island in their own branch;
    // neither branch is wrong on its own, and the conflict appears where both declarations meet. If
    // the region is declared UP FRONT (the survey writes every slot and owner before implementation),
    // that meeting happens in each agent's own branch on their first `motu check` — which is why this
    // has to be static, in the fast loop, and not a runtime gate they reach after the work is done.
    // Grouped by ELEMENT, not by slot. acme caught the first version of this rule as a false positive:
    // its filter panel is one island placed twice (`filters-desktop`, `filters-mobile`), both writing
    // `filters` — which is exactly what "two slots, one island" has to mean, and the region's evidence
    // says so on purpose. Two SLOTS may share a producer; two IMPLEMENTATIONS may not.
    const writersByKey = new Map();
    for (const island of readRegions(paths.archipelagosDir).find((r) => r.id === id)?.islands ?? []) {
      for (const key of Object.values(island.writes ?? {})) {
        const k = typeof key === 'string' ? key : null;
        if (!k) continue;
        writersByKey.set(k, [...(writersByKey.get(k) ?? []), { slot: island.slot, element: island.element }]);
      }
    }
    for (const [key, writers] of writersByKey) {
      const elements = [...new Set(writers.map((w) => w.element))];
      if (elements.length < 2) continue;
      report.error(
        'ownership',
        `"${key}" is written by ${elements.length} different islands (${writers.map((w) => `${w.slot} → ${w.element}`).join(', ')}) — ` +
          `a key has ONE producer. If both really write it, the producer is something they SHARE (their ` +
          `container, the page) and that is what should declare it; if not, one of them is reading, not writing.\n` +
          `    OPEN/CLOSE is the common shape here — one island opens a dialog and the dialog closes ` +
          `itself. That is not two producers: the OWNER is whichever island the other sits inside, via ` +
          `nested \`slots\`, and it keeps the key. Where the dialog cannot be nested, the host may put ` +
          `the key back with \`seed(...)\` — that is sanctioned for a produced key (it re-establishes a ` +
          `starting value), unlike \`provide()\`, which the region type refuses for exactly this key`,
      );
    }

    const owned = [...read].filter((k) => provided.has(k) || written.has(k));
    if (read.size) {
      report.ok(
        'ownership',
        `${owned.length}/${read.size} bound key(s) owned — ${[...read].filter((k) => provided.has(k)).length} host, ` +
          `${[...read].filter((k) => declaredWritten.has(k)).length} island`,
      );
    }

    // An opaque write is the static cousin of the laundering smell: it updates a key, but nothing can
    // draw it in the region graph and no wiring can be generated from it when motu is removed.
    const opaqueOnly = [...opaqueWritten].filter((k) => !declaredWritten.has(k));
    if (opaqueOnly.length) {
      report.warn(
        'ownership',
        `key(s) written from a handler body: ${opaqueOnly.join(', ')} — declare \`writes: { <event>: '<key>' }\` ` +
          `instead. A handler can do anything, so it cannot be drawn before it fires, and it cannot be ` +
          `materialised when motu is ejected; \`on\` is for effects that are NOT store writes`,
      );
    }
  }

  // --- the lagoon's stand-ins still stand in ----------------------------------------------------
  {
    const results = stubParity();
    const broken = results.filter((r) => r.missing.length || r.unresolved);
    for (const r of broken) {
      if (r.unresolved) {
        report.error('host-stubs', `${r.specifier}: ${r.unresolved}`);
      } else {
        report.error(
          'host-stubs',
          `${r.specifier}: islands import ${r.missing.map((m) => `\`${m}\``).join(', ')}, which the stub does not export — ` +
            `the lagoon is standing in for a module it no longer mirrors`,
        );
      }
    }
    if (results.length && !broken.length) {
      const covered = results.reduce((n, r) => n + r.needed.length, 0);
      report.ok('host-stubs', `stubs cover the ${covered} export(s) the islands reach for`, { n: results.length, of: 'stub(s)' });
    }
  }

  const registryText = existsSync(paths.archipelagosRegistry) ? readFileSync(paths.archipelagosRegistry, 'utf8') : '';
  const archRegistered = [`./${id}/${id}.archipelago`].some(
    (s) => registryText.includes(`${s}'`) || registryText.includes(`${s}.js'`) ||
           registryText.includes(`${s}"`) || registryText.includes(`${s}.js"`),
  );
  if (archRegistered) {
    report.ok('registered', 'registered in ARCHIPELAGOS');
  } else {
    report.error('registered', `not wired into ${paths.rel(paths.archipelagosRegistry)}`);
  }

  // Every `element: 'x-…'` the config references must be a registered island tag — EXCEPT the ones
  // the survey declared and nobody has built yet. Those are the price of declaring a region up front
  // so parallel work conflicts early; without this split the region is red in every branch until the
  // last island lands, and a red region teaches everyone to ignore it.
  const known = registeredTags();
  const declared = readRegions(paths.archipelagosDir).find((r) => r.id === id)?.islands ?? [];
  const plannedTags = new Set(declared.filter((i) => i.planned).map((i) => i.element));
  const used = [...text.matchAll(/element:\s*['"]([^'"]+)['"]/g)].map((m) => m[1]).filter((t) => !plannedTags.has(t));
  const unknown = [...new Set(used)].filter((t) => !known.has(t));

  // The flag REMOVES ITSELF. Once the island exists, `planned` is no longer a promise, it is a stale
  // claim — and a survey that quietly becomes a list of things nobody built is worse than no survey.
  const built = [...plannedTags].filter((t) => known.has(t));
  if (built.length) {
    report.error(
      'planned',
      `${built.join(', ')} is registered but still marked \`planned: true\` — drop the flag; the checks that ` +
        `skip a planned island (does it exist, does it mount, is it placed) are exactly the ones it now needs`,
    );
  }
  const pending = [...plannedTags].filter((t) => !known.has(t));
  if (pending.length) {
    report.warn(
      'planned',
      `${pending.length} island(s) declared but not built: ${pending.join(', ')} — their ownership is being ` +
        `enforced (a second claim on their keys fails), their existence is not checked`,
    );
  }
  if (used.length === 0) {
    // "declares no islands" is false when it declares four and nobody has built them yet — and a
    // wrong message is how a reader learns to stop reading the report.
    report[plannedTags.size ? 'skip' : 'warn'](
      'islands-registered',
      plannedTags.size
        ? `every declared island is still \`planned\` (${plannedTags.size}) — nothing to look for yet`
        : 'archipelago declares no islands',
    );
  } else if (unknown.length === 0) {
    report.ok('islands-registered', `all ${new Set(used).size} island tag(s) are registered`, {
      n: new Set(used).size,
      of: 'declared tag(s)',
    });
  } else {
    report.error('islands-registered', `unknown island tag(s): ${unknown.join(', ')} — not in ELEMENT_REGISTRY`);
  }

  // Does this region have an arrangement to render?
  //
  // Two places it can live, and checking only the first is what made removing a duplicated template
  // silently disable the whole-region render — the check that catches slot/config drift:
  //   1. a `layout:` template in the archipelago config (the ocean's answer), or
  //   2. the region's lagoon frame, i.e. the APPLICATION's own layout component, which is the right
  //      answer under a React host and the one that cannot drift.
  // Genuinely layout-less still means "islands placed individually across the host", and still skips.
  // `root:` — the region declares the APPLICATION's own component, which the lagoon composes from the
  // same `slots` the page uses. The strongest form, and the one with no second copy anywhere.
  if (/^\s*root\s*:/m.test(text)) return true;
  if (/\blayout\s*:/.test(text)) return true;
  const frame = frameModuleFor(id);
  // Declared but unresolvable: assume it HAS an arrangement, so the render check runs and fails loudly
  // if it does not. The opposite default is how this went quiet in the first place.
  if (frame.declared && !frame.module) return true;
  if (frame.module && /\blayout\s*:/.test(readFileSync(frame.module, 'utf8'))) return true;
  return false;
}
