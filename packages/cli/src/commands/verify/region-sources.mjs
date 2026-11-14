// A region's channels and sources: declared, live, and what they reach.
// Split out of commands/verify.mjs; verify.mjs re-exports the public surface.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { readComponentContract } from '../../lib/component-props.mjs';
import { readGeneratedContracts } from '../../lib/contracts.mjs';
import { declaredSourcesOf } from '../../lib/declared-sources.mjs';
import { readEffectEntries } from '../../lib/effects.mjs';
import { exclusiveDeclared } from '../../lib/lagoon-declares.mjs';
import { regionRefsOf } from '../../lib/region-refs.mjs';
import { exclusiveProblems, undeclaredAlternatives } from '@motujs/core';
import { blankComments, islandComponentExport, islandComponentPath, lagoonViewports, names, paths, resolveAppImport } from '../../lib/util.mjs';
import { auditRegionLagoon } from '../../playwright-lagoon.mjs';
import { declaredWrites, readScenariosFor } from './region-flows.mjs';
import { environmentalCause, step } from './report.mjs';

/**
 * What the STORE said while the region was being driven.
 *
 * `no-console-errors` runs on a page that only mounts the region — it never writes, so motu's own
 * ownership guard ("key X is produced by island A, but it was written by B") could fire on every
 * driven page and never reach a report. That is the shape of miss this exists for: the framework had
 * already caught it, in a console nobody was reading.
 */
export function reportStoreComplaints(report, diagnostics, where) {
  const motu = (diagnostics ?? []).filter((d) => /console\.error:\s*motu:/.test(d));
  for (const line of [...new Set(motu)]) {
    report.error('store-guard', `${line.replace(/^console\.error:\s*/, '')} (seen during the ${where})`);
  }
}

/**
 * A channel that ORCHESTRATES must install the application's own logic, not re-implement it.
 *
 * The inbound seam is where a lagoon quietly becomes a second application. A channel that watches the
 * region and answers with host-fed keys is doing what the PAGE does — debounce, page, derive, reset —
 * and a copy of that is free to drift: a different page size in the preview than in production looks
 * like a working preview for months. Both of this project's first channels were written that way, and
 * nothing said a word.
 *
 * The rule is deliberately narrow, so it accuses only what it can see:
 *   REACTIVE (it subscribes to the store) + WRITES host-fed keys + imports NO application module.
 * A channel that only publishes a constant is not orchestration and is not flagged; a channel that
 * imports the app's source is doing the right thing by construction, whatever it does with it.
 */
export function channelSourceCheck(report, id, region) {
  // WHERE THE CHANNELS ARE WRITTEN, in both shapes — and this check saw only the older one.
  //
  // It looked exclusively for `export const channels = { <id>: [ … ] }` in `src/lagoon.tsx`, the
  // kind-first override map. Regions have since moved to a per-region module,
  // `<lagoon>/src/regions/<id>.tsx`, holding `overridesFor(archipelago, { channels: [ … ] })` — so on
  // every project in this repository the check found nothing and RETURNED SILENTLY. Not a skip, not a
  // pass: no row at all, for the check that stops hand-written channels. It had been dormant since the
  // authoring shape changed and nothing could have told you, which is the failure mode a silent return
  // always is.
  const perRegion = ['tsx', 'ts']
    .map((ext) => resolve(paths.lagoonDir, 'src/regions', `${id}.${ext}`))
    .find((f) => existsSync(f));
  const overridesFile =
    perRegion ??
    ['src/lagoon.tsx', 'src/lagoon.ts'].map((f) => resolve(paths.lagoonDir, f)).find((f) => existsSync(f));
  if (!overridesFile) {
    report.skip('channel-source', 'no lagoon overrides module — nothing declares channels for this region');
    return;
  }
  const overrides = stripComments(readFileSync(overridesFile, 'utf8'));

  // The per-region module holds ONE region's channels, so the array is unqualified; the shared module
  // keys them by id. Try the qualified form first, since the shared module also contains bare arrays.
  const map = overrides.match(/export const channels[^=]*=\s*\{([\s\S]*?)\n\};/)?.[1];
  const keyed = map?.match(new RegExp(`['"\`]?${id}['"\`]?\\s*:\\s*\\[([\\s\\S]*?)\\n  \\]`))?.[1];
  const bare = overrides.match(/\bchannels:\s*\[([\s\S]*?)\n\s*\],/)?.[1];
  const list = keyed ?? bare;
  if (!list) {
    // SAID, not silent: a region with no channels is a fact worth one dim line, because the alternative
    // is indistinguishable from this check being broken again.
    report.skip('channel-source', `no channels declared for "${id}" in ${paths.rel(overridesFile)}`);
    return;
  }

  // Split on top-level commas: each element is one channel, and the question is what BUILT it.
  const entries = [];
  let depth = 0;
  let current = '';
  for (const ch of list) {
    if ('([{'.includes(ch)) depth++;
    else if (')]}'.includes(ch)) depth--;
    if (ch === ',' && depth === 0) {
      entries.push(current);
      current = '';
    } else current += ch;
  }
  if (current.trim()) entries.push(current);

  let vouched = 0;
  for (const entry of entries.map((e) => e.trim()).filter(Boolean)) {
    // Built here, by the tool.
    if (/^(channelFrom|rawChannel)\s*\(/.test(entry)) {
      vouched++;
      continue;
    }
    // Or an identifier from a file that builds it with the tool.
    const file = /^[A-Za-z_$][\w$]*$/.test(entry) ? channelFileOf(overrides, overridesFile, entry) : null;
    if (file && /\b(channelFrom|rawChannel)\s*\(/.test(stripComments(readFileSync(file, 'utf8')))) {
      vouched++;
      continue;
    }
    report.error(
      'channel-source',
      `a channel of "${id}" is not built by the tool — write \`channelFrom({ to, id, args })\`, whose copy ` +
        `into the region comes from the archipelago's \`sources\`, or \`rawChannel('<why>', fn)\` if this seam ` +
        `genuinely is not a source. Hand-written channels forget keys, rename them in transit, and derive ` +
        `what the page already derives — all three have happened here.`,
    );
  }
  if (vouched === entries.length && vouched > 0) {
    report.ok('channel-source', 'every channel is built from a declared source', { n: vouched, of: 'channel(s)' });
  }
}

/**
 * DID THE COMPONENT ACTUALLY EMIT? The half no CLI check could reach until now.
 *
 * `wiring-live` fires each declared output itself, and a flow's `emit` goes through the same seam, so
 * both prove the region APPLIES a write and neither can see a component that stopped producing it.
 * Measured on a real region: silencing a component's `onProgress` changed no check at any tier, even
 * though a flow drove that very event. The seam lens shows it — its region sheet has always had a
 * "never moved" column — and the lens is a panel a human opens. Agents read the CLI, so the one signal
 * that catches this was human-only.
 *
 * WHY IT IS NARROW, and must be. Only outputs the component invokes from an EFFECT are checked: those
 * must fire when the island simply renders, so their absence is a fact. An output fired from a click
 * handler legitimately never fires in a render-only pass, and demanding it would flag every
 * well-behaved island in the project. `calledFromEffect` answers "provably effect-driven" and reports
 * anything it cannot prove as not — costing a missed finding rather than a false one.
 *
 * RUNTIME, and the LAST mile: it needs a browser, a mounted region and its effects to have run, so it
 * belongs with the punctual gate that runs when a region is done — never in the fast loop, which has
 * no browser to observe.
 *
 * A WARNING, like every check that arrives after the regions it judges.
 */
export function emittedLiveCheck(report, id, renderOutputs) {
  const islands = declaredWrites(id);
  if (!islands.length || !Array.isArray(renderOutputs)) return;

  const generated = readGeneratedContracts(paths.islandsDir);
  const fired = new Set(renderOutputs.map((o) => `${o.slot}\u0000${o.event}`));

  const dead = [];
  let checked = 0;
  for (const island of islands) {
    const tag = island.element;
    const contract = generated[tag];
    if (!contract) continue;
    const { kebab, pascal } = names(String(tag).replace(new RegExp(`^${paths.tagPrefix ?? 'x-'}`), ''));
    const componentFile = islandComponentPath(kebab, pascal);
    const comp = componentFile ? readComponentContract(componentFile, islandComponentExport(kebab, pascal)) : null;
    if (!comp?.output) continue;
    // prop -> event, from the generated contract; prop -> effect-driven, from the component itself.
    const effectProps = new Set(comp.output.filter((o) => o.effectDriven).map((o) => o.prop));
    for (const [prop, event] of Object.entries(contract.output ?? {})) {
      if (!effectProps.has(prop)) continue;
      if (!island.writes?.[event]) continue;
      checked++;
      if (!fired.has(`${island.slot}\u0000${event}`)) dead.push({ slot: island.slot, prop, event });
    }
  }

  if (!checked) return;
  if (!dead.length) {
    report.ok('emitted-live', `${checked} effect-driven output(s) fired while the region rendered`, {
      n: checked,
      of: 'effect-driven output(s)',
    });
    return;
  }
  report.warn(
    'emitted-live',
    `${dead.length}/${checked} declared output(s) never fired while the region rendered: ` +
      `${dead.map((d) => `${d.slot}.${d.prop} (on "${d.event}")`).join(', ')} — the component calls it from an effect, so ` +
      `rendering should produce it. A flow that emits the same event proves only that the region APPLIES the write; ` +
      `this says nothing produced it.`,
  );
}

/**
 * Does the region FIT, and does axe find anything in the composed page.
 *
 * Reported per viewport rather than as one verdict: "the region overflows" is not actionable, and the
 * width it starts at is the whole finding.
 */
export async function regionAuditCheck(report, id, port) {
  const viewports = lagoonViewports();
  if (!viewports.length) return;
  // The states the flows establish, deduped — the same list `archipelago snapshot` pictures, so the
  // page is audited in the shapes somebody thought worth driving rather than in one arbitrary one.
  const seen = new Set();
  const states = [];
  for (const f of readScenariosFor(id)) {
    const key = JSON.stringify(f.seed ?? {});
    if (seen.has(key)) continue;
    seen.add(key);
    states.push({ name: f.name ?? 'flow', seed: f.seed ?? {} });
  }
  let out;
  try {
    out = await step('region-audit', () => auditRegionLagoon({ id, port, states, viewports }));
  } catch (err) {
    report[environmentalCause(err) ? 'inconclusive' : 'warn']('region-responsive', `could not audit the region: ${err.message}`);
    return;
  }

  // A LAYOUT CANNOT BE JUDGED ON AN UNSTYLED PAGE. The runtime region lane renders through a mount
  // path that never inserts the island stylesheet, so every box is block-level and nothing ever
  // overflows: this reported "fits every declared viewport" about a page a human had just watched
  // scroll sideways by 197px. A false green is worse than no check, so it says what it could not see.
  if (out.measurements.some((m) => m.styled === false)) {
    report.inconclusive(
      'region-responsive',
      'the region rendered WITHOUT the island stylesheet, so its layout cannot be judged here — ' +
        'every box is block-level and nothing overflows by construction. Look at the published region ' +
        '(`motu lagoon publish --remote`) or `motu archipelago snapshot`, which render it styled.',
    );
    return;
  }
  const over = out.measurements.filter((m) => m.overflow > 1);
  if (!over.length) {
    report.ok('region-responsive', `the composed page fits every declared viewport (${viewports.map((v) => `${v.name} ${v.width}px`).join(', ')})`, {
      n: out.measurements.length,
      of: 'measurement(s)',
    });
  } else {
    // Narrowest first: that is where it starts, and the wider ones are usually the same cause.
    const worst = [...over].sort((a, b) => a.width - b.width);
    report.error(
      'region-responsive',
      `the composed page overflows at ${worst.length}/${out.measurements.length} viewport(s): ` +
        `${worst.map((m) => `${m.viewport} ${m.width}px by ${m.overflow}px${m.scenario !== 'default' ? ` (${m.scenario})` : ''}`).join(', ')} ` +
        `— every island fits on its own; this is the ARRANGEMENT, which no island check can see`,
    );
  }

  const severe = (out.violations ?? []).filter((v) => v.impact === 'critical' || v.impact === 'serious');
  if (!out.violations?.length) {
    report.ok('region-a11y', 'axe finds nothing in the composed page', { n: 1, of: 'axe pass' });
  } else {
    for (const v of severe) report.warn('region-a11y', `${v.impact}: ${v.help} — ${v.target} (${v.nodes} node(s))`);
    if (!severe.length) report.ok('region-a11y', `${out.violations.length} minor axe finding(s), none serious`, { n: out.violations.length, of: 'finding(s)' });
  }
}

/**
 * PROVENANCE: what the channels really produced, against what the region declared.
 *
 * `sources` is a static promise — "these keys come from that source". This is the runtime half, the
 * same idea as `wiring-live` on the island side: a declaration nobody can see firing is one nobody can
 * trust. A channel writing a key no source claims is an ERROR; a source no channel produced is a
 * WARNING, because seeding it in the lagoon is legitimate.
 */
export function sourcesLiveCheck(report, id, channels, region, held = []) {
  const declared = declaredSources(id);
  if (!Object.keys(declared).length || !channels) return;
  const claimed = new Map();
  for (const [name, src] of Object.entries(declared)) for (const key of src.produces) claimed.set(key, name);
  // A source the region REFERENCES carries its keys in the source file, not here; the compiler checks
  // those. What is checkable at runtime is that nothing OUTSIDE the declared set was written.
  const byReference = Object.values(declared).some((src) => src.byReference);

  const written = new Set();
  for (const channel of channels) {
    const stray = claimed.size ? channel.keys.filter((k) => !claimed.has(k)) : [];
    for (const key of channel.keys) written.add(key);
    if (stray.length && !byReference) {
      report.error(
        'sources-live',
        `channel "${channel.name}" wrote ${stray.join(', ')}, which no declared source claims — either the ` +
          `region's \`sources\` are incomplete, or this channel is orchestrating outside them`,
      );
    }
  }
  const islandOwned = region ? producedKeysOf(region) : new Set();
  const silent = [...claimed.keys()].filter((k) => !written.has(k) && !islandOwned.has(k));
  // PER SOURCE, and split by whether the keys hold anything — "seeded, or dead?" asked the reader to
  // go and find out, and the two answers call for opposite actions. Seeded means the lagoon writes
  // the answer down: the region renders, every check passes, and the page's own derivation is not
  // exercised until production. Installing the source (a channel over the same fixtures, the way
  // `week` and `networkStats` do it) is what turns a preview into evidence about the app's code.
  const holds = new Set(held);
  const bySource = new Map();
  for (const key of silent) {
    const name = claimed.get(key);
    const entry = bySource.get(name) ?? { keys: [], module: declared[name]?.module };
    entry.keys.push(key);
    bySource.set(name, entry);
  }
  for (const [name, entry] of bySource) {
    const anyHeld = entry.keys.some((k) => holds.has(k));
    const where = entry.module ? ` (${entry.module})` : '';
    if (anyHeld) {
      report.warn(
        'sources-live',
        `source "${name}"${where} is SEEDED here, not installed: ${entry.keys.join(', ')} ` +
          `${entry.keys.length > 1 ? 'hold values' : 'holds a value'} no channel produced. The region renders and ` +
          `the page's own derivation is never exercised — ` +
          `install the source with \`channelFrom({ to, id: '${name}', args: [...] })\` and drop them from the seed. ` +
          // THE CALL IS NOT THE DESIGN. This line used to end at the channelFrom signature, which
          // tells you what to type and nothing about what to build — and the thing to build is the
          // source, not the channel. Whoever reads this is usually mid-migration and has never
          // written one.
          `That means extracting a SOURCE: a port the page and the lagoon fill differently, a factory ` +
          `holding the state with subscribe/getState, and \`intents\` for what islands ask the host. ` +
          `See docs/05-archipelagos-and-regions.md "Writing a source"`,
      );
    } else {
      report.warn(
        'sources-live',
        `source "${name}"${where} produced nothing and its keys hold nothing: ${entry.keys.join(', ')} — ` +
          `declared, and fed by neither a channel nor the seed`,
      );
    }
  }
  const live = [...written].filter((k) => claimed.has(k) || byReference);
  if (live.length) report.ok('sources-live', `${live.length} key(s) produced by a declared source at runtime`);
}

/** Comments blanked, because an apostrophe in prose opens a string as far as a regex is concerned —
 *  "the week's missions" inside a `produces` array became a key named ` missions, so it comes...`. */
export const stripComments = blankComments;

/**
 * The text of the `factory:` belonging to one `channelFrom({ … id: '<id>' … })`, brace-balanced.
 *
 * Scoped deliberately: the question is not whether the app's source is mentioned in the file, it is
 * whether the factory INSTALLS it.
 */
export function factoryBody(text, id) {
  // The CALL, not the word: `import { channelFrom }` matched first, and balancing from the next paren
  // walked into whatever function happened to be declared above the call — which reported the real
  // channel as never installing its source.
  const call = /\bchannelFrom\s*\(/.exec(text);
  if (!call) return null;
  const open = call.index + call[0].length - 1;
  let depth = 0;
  let end = -1;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')' && --depth === 0) {
      end = i;
      break;
    }
  }
  const spec = text.slice(open, end === -1 ? undefined : end);
  if (!new RegExp(`\\bid:\\s*'${id}'`).test(spec)) return null;
  const factory = spec.indexOf('factory');
  return factory === -1 ? null : spec.slice(factory);
}

/**
 * `sources` as data, straight from the archipelago file.
 *
 * PARSED, NOT MATCHED, and shared with `integrate check` — which had its own regex over the same
 * declaration, handling only the `{ module, produces }` form. Two readers of one shape drift, and
 * this pair had: moving a region to the by-reference form turned off the integration check that says
 * the page installs the source, silently. What is left here is the part that is this command's own:
 * where a by-reference source's `reaches` comes from.
 */
export function declaredSources(id) {
  const file = paths.archipelagoFile(id);
  const out = {};
  for (const [name, src] of Object.entries(declaredSourcesOf(file))) {
    out[name] = src.byReference
      ? { ...src, reaches: reachesOfSourceModule(src.module, file) }
      : { ...src, reaches: readEffectEntries(src.reachesText ?? '') };
  }
  return out;
}

/**
 * A by-reference source's `reaches`, read from the SOURCE MODULE.
 *
 * `shots: shotsSource` puts the declaration in the app's own file, beside `produces` — one place that
 * says what this source hands over and what it touches. The archipelago cannot see either; the
 * compiler checks `produces`, and this reads `reaches` the same way `declaredSources` reads a module
 * specifier: from the one place it is written.
 */
export function reachesOfSourceModule(module, fromFile) {
  try {
    // `resolveAppImport` takes the importing file (a relative specifier needs it) and returns the path
    // WITHOUT an extension, so the candidates have to be tried here.
    const base = resolveAppImport(fromFile, module);
    const file = base && ['.ts', '.tsx', '/index.ts', ''].map((e) => `${base}${e}`).find((f) => existsSync(f));
    if (!file) return [];
    const text = stripComments(readFileSync(file, 'utf8'));
    return readEffectEntries(text.match(/reaches:\s*\[([\s\S]*?)\]/)?.[1] ?? '');
  } catch {
    return [];
  }
}

/** The file a channel identifier resolves to, or null. */
export function channelFileOf(overrides, overridesFile, name) {
  const spec = overrides.match(new RegExp(`import\\s*\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from\\s*['"]([^'"]+)['"]`))?.[1];
  if (!spec || !spec.startsWith('.')) return null;
  return (
    ['', '.ts', '.tsx']
      .map((ext) => resolve(dirname(overridesFile), spec.replace(/\.js$/, ext || '.ts')))
      .find((f) => existsSync(f)) ?? null
  );
}

/** Every key the region's islands bind (the map form's targets included). */
export function bindKeysOf(region) {
  const text = stripComments(readFileSync(paths.archipelagoFile(region.id), 'utf8'));
  const keys = [];
  for (const m of text.matchAll(/bind:\s*\[([\s\S]*?)\]/g)) {
    // `^\s*` as well as a delimiter: the FIRST bare key sits right after the `[` the outer match
    // consumed, so anchoring only on `[,{` silently dropped one key per island — `members` among them.
    for (const [, bare] of m[1].matchAll(/(?:^\s*|[[,{]\s*)'([^']+)'/g)) keys.push(bare);
    for (const [, target] of m[1].matchAll(/\w+:\s*'([^']+)'/g)) keys.push(target);
  }
  return keys;
}

/** Every key an island of the region produces. */
export function producedKeysOf(region) {
  const keys = new Set();
  for (const island of region.islands) {
    for (const target of Object.values(island.writes ?? {})) {
      if (typeof target === 'string') keys.add(target);
      else for (const key of Object.values(target)) keys.add(key);
    }
  }
  return keys;
}

/** One region's checks, as data — see `runIslandVerify`. */
/**
 * A region inside a region: `slots: { prop: { region: '<id>' } }`.
 *
 * Refused, not rendered as a default: a reference to an id no archipelago has, one that leads back to
 * the region making it (a region cannot contain itself), or one from a region with no `root` (there is
 * no prop for it to fill). The verdict is `regionRefProblems` — the function the lagoon uses to refuse
 * the placeholder — so the check and the preview give one answer.
 *
 * Says nothing on a region that neither references nor is referenced: that is nearly every region,
 * and a row there would be a check that examined nothing reporting as one that passed.
 */
export function regionRefCheck(report, id) {
  const { refs, problems, referencedBy, unreadable } = regionRefsOf(id, paths.archipelagosDir);
  if (unreadable) {
    report.warn('region-ref', `${paths.rel(paths.archipelagoFile(id))} could not be parsed, so its region references were not read`);
    return;
  }
  for (const p of problems) report.error('region-ref', p.message);
  const entries = Object.entries(refs);
  if (entries.length && !problems.length) {
    report.ok(
      'region-ref',
      `${entries.map(([prop, ref]) => `${prop} → region ${ref}`).join(', ')} — a separate region: its islands, keys ` +
        `and flows are its own and are not counted here; the lagoon shows a placeholder until it is loaded`,
      { n: entries.length, of: 'region reference(s)' },
    );
  }
  if (referencedBy.length) {
    report.ok('region-ref', `fills ${referencedBy.join(', ')} — composed inside another region, verified on its own`, {
      n: referencedBy.length,
      of: 'slot(s) this region fills',
    });
  }
}

/**
 * ALTERNATIVES: `exclusive: [['accept', 'connect']]` — root props of which at most one is non-null.
 *
 * The guarantee itself is the compiler's (`RootPropsOf` takes one union per group) and the runtime's
 * (`<X.Root>` reports a cast that got past it). What is left for a static check is the DECLARATION:
 * a group on a region with no root, a group of one, a prop in two groups — and the either/or the
 * region describes with `when`/`unless` but never declares, which the lagoon follows and nothing holds
 * the page to.
 *
 * Says nothing on a region that declares no group and no `when`/`unless` pair: that is nearly every
 * region, and a row there would be a check that examined nothing reporting as one that passed.
 */
export function exclusiveCheck(report, id) {
  const file = paths.archipelagoFile(id);
  const declared = exclusiveDeclared(file);
  if (declared === null) {
    if (existsSync(file)) report.warn('exclusive', `${paths.rel(file)} could not be parsed, so its exclusive groups were not read`);
    return;
  }
  for (const text of declared.unreadable) {
    report.error(
      'exclusive',
      `exclusive group ${text} is not an array of string literals — it cannot be read, so it is not checked. ` +
        `Write the prop names inline: \`exclusive: [['a', 'b']]\``,
    );
  }
  const problems = exclusiveProblems(declared);
  for (const p of problems) report.error('exclusive', p.message);
  for (const alt of undeclaredAlternatives(declared)) {
    report.warn(
      'exclusive',
      `\`${alt.when}\` (when: '${alt.key}') and \`${alt.unless}\` (unless: '${alt.key}') are alternatives the lagoon ` +
        `follows and nothing holds the page to — add \`exclusive: [['${alt.when}', '${alt.unless}']]\` and the page ` +
        `cannot pass both`,
    );
  }
  if (declared.exclusive.length && !problems.length && !declared.unreadable.length) {
    report.ok(
      'exclusive',
      `${declared.exclusive.map((g) => g.join(' | ')).join(', ')} — at most one of each, held by the type of the region's Root`,
      { n: declared.exclusive.length, of: 'exclusive group(s)' },
    );
  }
}
