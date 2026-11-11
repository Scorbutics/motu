// A region's composition: registered tags, which islands compose it, whether its frame is the page.
// Split out of commands/verify.mjs; verify.mjs re-exports the public surface.
import { existsSync, readFileSync } from 'node:fs';
import { placementsIn } from '../../lib/island-placement.mjs';
import { listIslands } from '../../lib/islands.mjs';
import { frameModuleFor, nestedSlots } from '../../lib/lagoon-declares.mjs';
import { sourceFileAt } from '../../lib/ts-project.mjs';
import { HOST, blankComments, paths } from '../../lib/util.mjs';
import { conditionallyPlaced, hostSources } from '../integration.mjs';

/** All island tags declared in the registry, gathered from each islands/<kebab>/element.ts `tag:`. */
export function registeredTags() {
  const tags = new Set();
  if (!existsSync(paths.islandsDir)) return tags;
  for (const entry of listIslands(paths.islandsDir)) {
    const el = entry.element;
    if (!existsSync(el)) continue;
    const text = readFileSync(el, 'utf8');
    const m = text.match(/tag:\s*['"]([^'"]+)['"]/) ?? text.match(/\bisland\(\s*'([^']+)'/);
    if (m) tags.add(m[1]);
  }
  return tags;
}

/** Static checks over an archipelago config file: it's registered, and every island tag it uses exists. */
/**
 * The region's lagoon FRAME MODULE — the file holding its `layout` — or null.
 *
 * Resolved rather than guessed by filename: `overridesFor(someArchipelago, …)` names the archipelago
 * it belongs to, so the module is identified by what it POINTS AT, never by a spelling that could
 * disagree with the registry.
 */
/**
 * IS THE REGION THE PAGE, OR A DRAWING OF IT?
 *
 * The lagoon's whole claim is that what you look at is what ships. A frame that writes its own JSX
 * breaks that claim silently, and this project proved it: `regions/forgot-password.tsx` rendered
 * `<h2>On récupère ton accès</h2>` while the page rendered `Mot de passe oublié ?` — a heading that
 * existed nowhere in the application, previewed for weeks under a green PASS, because every other
 * check reads motu's own declarations and none of them opens the page.
 *
 * So a frame may contain ONLY:
 *   - components imported from the HOST application (the arrangement it already ships),
 *   - fragments,
 *   - `island(slot)` calls.
 *
 * An intrinsic element or a literal string is arrangement that exists only here. And a host component
 * the frame calls must be one the PAGE composing this region actually renders — pointing at a real
 * component that no page uses is the same lie with better manners.
 *
 * The escape hatch costs a sentence, like `rawChannel`: `inventedArrangement('why', <…/>)`. It
 * downgrades to a warning that prints the reason, so a deliberate stand-in stays findable.
 */
/**
 * DOES THE REGION COMBINE THE SAME ISLANDS THE APPLICATION DOES?
 *
 * The arrangement is the page's own business — a lagoon frame is allowed to place things differently,
 * and forcing one component on every page would mean restructuring pages around motu. What is NOT the
 * frame's business is WHICH ISLANDS the region is made of. Get that wrong and the region previewed,
 * flowed and snapshotted is a different region from the one that ships: an island nobody mounts looks
 * proven, and an island the page mounts is never looked at.
 *
 * This is the drift `region-root` cannot see. acme's annuaire frame simply omitted `header`, and its
 * actions frame omits `ambassador-card` — both under green checks, because every other check reads
 * motu's declarations and the page's placements separately, and nothing compared the two.
 *
 * Decidable without a browser, from three sources:
 *   - the FRAME's `island(<slot>)` calls,
 *   - the archipelago's own NESTED slots (`slots: { ambassador: 'ambassador-inline' }`), which motu
 *     fills itself, so the frame never names them and their absence is not a finding,
 *   - the HOST's `<X.Island slot="…">` placements.
 *
 * A region composed from a declared `root` cannot drift here at all — the page passes props by name
 * and motu maps them — so it is reported as such rather than compared.
 */
export function islandCompositionCheck(report, id, region, composedBy, sources) {
  const archPath = paths.archipelagoFile(id);
  const archText = existsSync(archPath) ? blankComments(readFileSync(archPath, 'utf8')) : '';
  if (/^\s*root\s*:/m.test(archText)) {
    report.skip('island-composition', 'composed from the archipelago’s `root` — one declaration, nothing to compare');
    return;
  }

  const { module } = frameModuleFor(id);
  if (!module) {
    report.skip('island-composition', 'no region frame — the islands are placed individually across the host');
    return;
  }

  const declared = new Set((region?.islands ?? []).map((i) => i.slot).filter(Boolean));
  const frame = new Set(
    [...blankComments(readFileSync(module, 'utf8')).matchAll(/\bisland\(\s*['"`]([^'"`]+)['"`]/g)].map((m) => m[1]),
  );
  // Nested by DECLARATION: motu fills these into the outer island's props, in the page and in the
  // lagoon alike, so a frame that does not name them is composing them all the same.
  const nested = nestedSlots(paths.archipelagoFile(id));
  const placed = new Set();
  // PARSED, and the same parse `integrate check` uses — see `island-placement.mjs`. This asked the
  // same question with a pattern, which could not see a multi-line element, a computed slot, or a
  // commented-out one.
  for (const code of composedBy) {
    for (const slot of placementsIn(code).named) if (declared.has(slot)) placed.add(slot);
  }

  if (!placed.size) {
    report.skip('island-composition', 'no host file placing this region’s islands could be read');
    return;
  }

  const mounts = new Set([...frame, ...nested]);
  const onlyInFrame = [...mounts].filter((slot) => !placed.has(slot));
  const onlyInPage = [...placed].filter((slot) => !mounts.has(slot));

  const findings = [];
  if (onlyInFrame.length) {
    findings.push(
      `the region mounts ${onlyInFrame.join(', ')}, which the application never places — previewed, ` +
        `flowed and pictured, and shipped by nothing`,
    );
  }
  // A slot the page places CONDITIONALLY may legitimately be missing from the frame: the frame shows
  // one STATE of the page, and acme's `ambassador-card` is the empty-week fallback that the normal week
  // does not reach. That is a different state, not a different composition — so it is said, not failed.
  // A slot placed UNCONDITIONALLY and never mounted is the real finding: it ships on every render and
  // the region has never once looked at it.
  // The TAG NAMES as the host actually writes them (`<Actions.Island …>`), read from the files that
  // place them — the binding's name is the page's to choose, so it cannot be derived from the region.
  const islandNames = [
    ...new Set(composedBy.flatMap((code) => [...code.matchAll(/<([A-Z][A-Za-z0-9]*\.Island)[\s/>]/g)].map((m) => m[1]))),
  ];
  let conditional = new Map();
  try {
    conditional = conditionallyPlaced(sources, ['Island', ...islandNames], blankComments) ?? new Map();
  } catch {
    conditional = new Map();
  }
  const missedAlways = onlyInPage.filter((slot) => !conditional.has(slot));
  const missedSometimes = onlyInPage.filter((slot) => conditional.has(slot));
  if (missedAlways.length) {
    findings.push(
      `the application always places ${missedAlways.join(', ')}, which the region never mounts — it ` +
        `ships on every render, and nothing here has ever looked at it`,
    );
  }
  if (findings.length) {
    report.error('island-composition', `${paths.rel(module)}: ${findings.join('; ')}`);
    return;
  }
  if (missedSometimes.length) {
    report.warn(
      'island-composition',
      `${paths.rel(module)}: the application places ${missedSometimes.join(', ')} in a branch this ` +
        `region's frame does not show — a different STATE of the same page, so confirm the state the ` +
        `frame shows is the one worth looking at, and that the other has a scenario or a flow`,
    );
    return;
  }
  report.ok(
    'island-composition',
    `the region is made of the same ${mounts.size} island(s) the application places`,
    mounts.size,
  );
}

/**
 * The source of the `layout` export alone, or the whole file when it cannot be isolated.
 *
 * Falls back deliberately: a frame reached through the array form has no single named export, and
 * judging nothing would be worse than judging too much.
 */
export function frameDeclarationText(file, raw, exportName) {
  if (!exportName) return raw;
  try {
    const sf = sourceFileAt(file);
    const decl = sf.getVariableDeclaration(exportName) ?? sf.getFunction(exportName);
    return decl ? decl.getText() : raw;
  } catch {
    return raw;
  }
}

export function frameIsPageCheck(report, id, region) {
  // THE ANSWER, when the region has one: `root` names the application's own component and `slots`
  // maps its props to islands, so the page and the lagoon compose from the SAME declaration and
  // neither writes the other's half. Nothing is left to compare, because nothing is duplicated.
  const archText = existsSync(paths.archipelagoFile(id)) ? readFileSync(paths.archipelagoFile(id), 'utf8') : '';
  const rootDecl = blankComments(archText).match(/^\s*root\s*:\s*([A-Za-z_$][\w$]*)/m);
  if (rootDecl) {
    const mapped = [...blankComments(archText).matchAll(/^\s{4}(\w+)\s*:\s*'([^']+)'/gm)];
    report.ok(
      'region-root',
      `composed from the archipelago's own \`root\` (${rootDecl[1]}) — the page and the lagoon share one declaration`,
      1 + mapped.length,
    );
    const { module: leftover } = frameModuleFor(id);
    if (leftover && /\blayout\s*:/.test(blankComments(readFileSync(leftover, 'utf8')))) {
      report.error(
        'region-root',
        `${paths.rel(leftover)} still declares a \`layout\` while the archipelago declares a \`root\` — ` +
          `two arrangements for one region, which is the duplication \`root\` exists to remove. Delete the frame`,
      );
    }
    report.skip(
      'island-composition',
      'composed from the archipelago\u2019s `root` \u2014 one declaration, so the region cannot be made of ' +
        'different islands from the page',
    );
    return;
  }

  // AN OCEAN COMPOSES FROM ITS OWN `layout`, and that is a third legitimate shape rather than a
  // missing `root`.
  //
  // `root` is a React component and `<X.Island>` is a React binding, so an AngularJS ocean can supply
  // neither. What it has is a template of `<motu-island slot="…">` markers on the archipelago, which
  // `<motu-archipelago name="…">` renders in the page and which the lagoon's own preference order
  // already honours (`lagoon-react-mount.tsx`: root, then `layout`, then declared order). Demanding a
  // React `root` from a legacy host made every ocean region a hard error — motu's own `demo-app`, the
  // reference ocean, could not pass `motu check` at all.
  //
  // Reported with its LIMIT named. In the embedded ocean the legacy page may place its own markers
  // rather than mounting the whole region, and nothing compares those two — which is the same class of
  // gap a hand-written frame has, so it gets the same kind of line.
  const layoutDecl = /^\s*layout\s*:/m.test(blankComments(archText));
  // AND ONLY AN OCEAN. `layout` is a template of `<motu-island slot="…">` markers rendered by the
  // custom element; a REACT host has no custom element to render it and `<X.Island>` is the binding
  // it does have, so the same declaration composes nothing there.
  //
  // This branch did not ask, so a Vite or Next region declaring `layout` — which is what the
  // scaffold's own commented example suggests — passed `region-root` green, passed every other static
  // check, and then failed the runtime pass outright: "archipelago did not render", "reaches NONE of
  // its declared slots". A cold-start agent lost its remaining budget to exactly that, and nothing in
  // the CLI said `layout` was the wrong shape for its host until the expensive check ran.
  //
  // An ERROR rather than a warning: unlike a stage-1 overlay, this is not a shape someone can ship
  // and migrate later — it does not work at all on this host.
  if (layoutDecl && HOST !== 'angularjs') {
    report.error(
      'region-root',
      `this region declares \`layout\` in the ARCHIPELAGO — the ocean's composition, a template of ` +
        `<motu-island> markers rendered by <motu-archipelago>. This project's host is \`${HOST}\`, ` +
        `which has no such element: the region would pass every static check and render NOTHING.\n` +
        `    TWO THINGS ARE CALLED \`layout\` AND THIS IS THE OTHER ONE. In the LAGOON OVERRIDES, ` +
        `\`layout: (island) => <YourPageFrame island={island} />\` is a React frame and is correct here — ` +
        `that is the one the scaffold's commented example shows. In the ARCHIPELAGO, \`layout\` is the ` +
        `ocean's template and means nothing on a React host.\n` +
        `    So: move it to the region's lagoon overrides, or declare \`root\` — the application's own ` +
        `layout component, with \`slots\` mapping its props to islands, which is the form with no ` +
        `second copy anywhere. See docs/06-composition-and-adoption.md`,
    );
    report.skip('island-composition', '`layout` is not a composition on this host — see region-root');
    return;
  }
  if (layoutDecl) {
    report.ok(
      'region-root',
      `composed from the archipelago's own \`layout\` — the ocean's form, rendered by ` +
        `<motu-archipelago> in the page and by the lagoon from the same template. Where the legacy ` +
        `page places its own <motu-island> markers instead, that placement is a second description ` +
        `nothing here compares`,
      (region?.islands ?? []).length,
    );
    report.skip(
      'island-composition',
      "composed from the archipelago's `layout` — one template, so the region cannot be made of " +
        'different islands from the page that mounts it',
    );
    return;
  }

  const { module, inline, exportName } = frameModuleFor(id);
  // AN INLINE `layout` IS AN ARRANGEMENT, NOT A MISSING ONE. It renders — both cold-start agents
  // confirmed the region painted correctly from one — so the only thing lost is this file's ability
  // to OPEN the frame and run the checks below (what it draws itself, which slots it places). Say
  // that, and say the one-line fix, instead of demanding a `root` the region may not need yet.
  if (!module && inline) {
    report.warn(
      'region-root',
      `\`layout\` for this region is written inline in the lagoon overrides, so the frame checks ` +
        `cannot read it — what it draws itself and which slots it places are unchecked. Move it to a ` +
        `named export beside the region (\`export const ${id.replace(/[^\w$]/g, '')}Frame = (island) => …\`) ` +
        `and reference it by name. The region still composes; this is the frame, not the archipelago`,
    );
    return;
  }
  if (!module) {
    // A REGION WITH NO ISLANDS HAS NOTHING TO COMPOSE YET. `archipelago create` scaffolds exactly
    // that, so demanding a root here would open a new project's first `motu check` on an error about
    // the thing it had just been handed — the same mistake `region-type` already records. The demand
    // is right the moment the region has a member.
    const empty = !(region?.islands ?? []).length;
    report[empty ? 'warn' : 'error'](
      'region-root',
      `no \`root\` — declare the application's own component as \`root\` in the archipelago, with ` +
        `\`slots\` mapping its props to this region's islands. Without it the page and the lagoon each ` +
        `compose the region their own way, and nothing compares the two`,
    );
    return;
  }
  const raw = readFileSync(module, 'utf8');
  // ONLY THE `layout` EXPORT, when we know which one it is.
  //
  // This read the whole FILE, so anything else living in the same module was judged as arrangement
  // the frame draws itself. Measured on a cold adoption: a region kept its `providers` (a DI
  // container, a Redux `Provider`, a router) beside its frame — the natural place for them — and
  // `region-root` reported the providers' own JSX, and a string from a button inside them, as the
  // frame inventing a layout. The adopter split the file to satisfy a check that was reading the
  // wrong thing.
  const body = blankComments(frameDeclarationText(module, raw, exportName));

  const excused = body.match(/inventedArrangement\(\s*(['"`])([\s\S]*?)\1/);

  // --- 1. what does the frame draw itself? -----------------------------------------------------
  //
  // `[^\w$.]` before the `<` is what separates JSX from a TYPE ARGUMENT: `SlotsOf<typeof x>` and
  // `new Set<string>()` are not elements, and reporting them as invented arrangement would make the
  // check's first impression a false one.
  const intrinsic = [...new Set([...body.matchAll(/(?:^|[^\w$.])<([a-z][a-zA-Z0-9-]*)[\s/>]/gm)].map((m) => m[1]))];
  // Literal text sitting between JSX tags: `>Some words<`. Whitespace and expressions are not text —
  // and neither is code that happens to sit between a `=>` and the next element, so anything carrying
  // punctuation only code has is skipped.
  const literals = [...new Set(
    [...body.matchAll(/>\s*([^<>{}\s][^<>{};=()]*?)\s*</g)].map((m) => m[1].trim()).filter((t) => /[A-Za-zÀ-ÿ]/.test(t)),
  )];

  // --- 2. which host components does it call, and does the page render them? -------------------
  const called = [...new Set([...body.matchAll(/<([A-Z][A-Za-z0-9]*)[\s/>]/g)].map((m) => m[1]))];
  // The frame's own exported components are not host components — they ARE the frame.
  const ownExports = new Set([...body.matchAll(/export\s+(?:function|const)\s+([A-Z][A-Za-z0-9]*)/g)].map((m) => m[1]));
  const hostCalled = called.filter((c) => !ownExports.has(c));

  const sources = hostSources();
  const islandNames = [...new Set((region?.islands ?? []).map((i) => i.element).filter(Boolean))];
  // WHERE THIS REGION IS COMPOSED: the files placing its slots, plus one hop up — a page that renders
  // a screen component which places the islands is composing this region too, and it is usually the
  // page that holds the layout (acme's `/forgot-password` is exactly that shape).
  const composing = new Map();
  const slotRe = /<[A-Z][A-Za-z0-9]*\.Island\s[^>]*?slot=["'`]([^"'`]+)/g;
  const declaredSlots = new Set((region?.islands ?? []).map((i) => i.slot).filter(Boolean));
  for (const [file, text] of sources) {
    const code = blankComments(text);
    for (const [, slot] of code.matchAll(slotRe)) if (declaredSlots.has(slot)) composing.set(file, code);
  }
  for (const [file, code] of [...composing]) {
    const exported = [...code.matchAll(/export\s+(?:default\s+)?(?:function|const)\s+([A-Za-z0-9_$]*)/g)].map((m) => m[1]).filter(Boolean);
    for (const [other, text] of sources) {
      if (composing.has(other)) continue;
      const oc = blankComments(text);
      if (exported.some((e) => new RegExp(`<${e}[\\s/>]`).test(oc))) composing.set(other, oc);
    }
    void file;
  }
  const composedBy = [...composing.values()];
  islandCompositionCheck(report, id, region, composedBy, sources);
  const orphan = hostCalled.filter((c) => !composedBy.some((code) => new RegExp(`<${c}[\\s/>]`).test(code)));

  const findings = [];
  if (intrinsic.length) findings.push(`draws ${intrinsic.length} element(s) of its own (<${intrinsic.join('>, <')}>)`);
  if (literals.length) {
    const shown = literals.slice(0, 3).map((t) => `"${t.length > 44 ? t.slice(0, 41) + '…' : t}"`);
    findings.push(`writes ${literals.length} literal string(s) the page may never say (${shown.join(', ')})`);
  }
  if (!composedBy.length && hostCalled.length) {
    findings.push(`calls ${hostCalled.join(', ')}, and no host file placing this region's slots could be found to compare against`);
  } else if (orphan.length) {
    findings.push(`calls ${orphan.join(', ')}, which no file composing this region renders`);
  }

  const where = paths.rel(module);
  if (!findings.length) {
    // A CLEAN FRAME IS A LEGITIMATE WAY TO COMPOSE A REGION, and saying otherwise is how a tool
    // prices itself out of being adopted: moving a page to `root` is a real refactor of the host's
    // own JSX, and a project cannot do ten of them before its first green run.
    //
    // What IS true is that a frame is a SECOND description of the page, safe only as far as the checks
    // comparing it reach — `island-composition` compares which islands, nothing compares the
    // arrangement. So the line names `root` without failing on it, and a project that has finished
    // migrating sets `"regionRoot": "required"` and the frame becomes an error from then on.
    const stronger =
      `composed by a hand-written frame in ${where}, and it holds the page's own components ` +
      `(${hostCalled.length ? hostCalled.join(', ') : 'islands only'}). Declaring \`root\` + \`slots\` on the ` +
      `archipelago instead leaves ONE description — the page and the lagoon compose from the same map, ` +
      `so they cannot differ`;
    if (paths.regionRoot === 'required') report.error('region-root', `${stronger}. This project sets \`regionRoot: "required"\``);
    else report.ok('region-root', stronger, hostCalled.length + composedBy.length);
    return;
  }
  const detail = `${where}: ${findings.join('; ')} — a frame may hold only the application's own components, fragments and island(slot). What you look at in the lagoon is otherwise a drawing of the page, not the page`;
  if (excused) report.warn('region-root', `${detail}. Excused: "${excused[2].trim()}"`);
  else report.error('region-root', detail);
}
