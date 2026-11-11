// What an island or region ASKS for — declared reach against observed calls, and the operation universe.
// Split out of commands/verify.mjs; verify.mjs re-exports the public surface.
import { existsSync, readFileSync } from 'node:fs';
import { coversEffect, isDataKind, readEffectEntries } from '../../lib/effects.mjs';
import { readRegions } from '../../lib/eject.mjs';
import { listIslands } from '../../lib/islands.mjs';
import { askKind, indexOperations, readOperationNames, resolveOperation } from '../../lib/operations.mjs';
import { REPO_ROOT, names, paths } from '../../lib/util.mjs';
import { browserOverrideNote } from '../../playwright-lagoon.mjs';
import { declaredSources } from './region-sources.mjs';

/** A data entry — the kinds the runtime can observe, as opposed to a module or a host-scope name. */
export const isDataReach = isDataKind;

/**
 * WHAT EACH OWNER SAYS IT REACHES, keyed the way `DataReach.by` keys what it observed.
 *
 * One concept, declared where the reaching happens. An island that hits a backend directly declares it
 * in its own `contract.effects`, beside the host modules it stands down — a data entry is what an
 * module entry USED to imply, before wire mocking pushed the stub below the import graph and the
 * module check (direct imports only) stopped being able to see it. A declared SOURCE reads inside a
 * channel, at region level and outside any island's window, so it declares its own `reaches` and the
 * runtime attributes to it directly — charging a source's tables to whichever island was rendering
 * would report a correct declaration as a violation.
 */
export function declaredReach({ tag = null, regionId = null } = {}) {
  const out = {};
  // FROM THE ISLAND FILE, not from `contracts.generated.ts`.
  //
  // The generated contract's `effects` is DERIVED — read from the component's own imports — so it only
  // ever holds module entries. A `{ table: … }` is a decision nobody can infer from an import, so it is
  // hand-written in the island file and is invisible here otherwise: this read the generated map and
  // would have reported every island's data reach as undeclared, forever, while the declaration sat in
  // the file next to it. Caught by round-tripping one through `island sync`.
  const byTag = new Map();
  for (const i of listIslands(paths.islandsDir)) {
    const text = readFileSync(i.element, 'utf8');
    const tag = (text.match(/\btag:\s*'([^']+)'/) ?? text.match(/\bisland\(\s*'([^']+)'/))?.[1] ?? `${names(i.kebab).tag}`;
    const declared = text.match(/effects:\s*\[([\s\S]*?)\]/)?.[1];
    if (declared !== undefined) byTag.set(tag, readEffectEntries(declared));
  }
  const addIsland = (t) => {
    const entries = (byTag.get(t) ?? []).filter(isDataReach);
    if (entries.length) out[`island:${t}`] = [...entries].sort();
  };
  if (tag) addIsland(tag);
  if (regionId) {
    const region = readRegions(paths.archipelagosDir).find((r) => r.id === regionId);
    for (const i of region?.islands ?? []) if (i.element) addIsland(i.element);
    for (const [name, src] of Object.entries(declaredSources(regionId))) {
      const entries = (src.reaches ?? []).filter(isDataReach);
      if (entries.length) out[`source:${name}`] = [...entries].sort();
    }
  }
  return out;
}

/**
 * Observed reach against declared reach — the half `data-reach` could not do while it was a readout.
 *
 * WARNINGS, both ways, and deliberately not errors: every project that adopts this lights up on the
 * day it lands, and the module half of `effects` — the declaration this extends — is warnings-only for exactly
 * that reason. An entry observed under an owner that declared nothing at all is NOT reported: the
 * declaration is opt-in per island and per source, and reporting its absence would make adopting the
 * feature indistinguishable from failing it.
 */
export function reportReachDrift(report, observed, declared, label) {
  const owners = Object.keys(declared);
  if (!owners.length) return;
  let clean = 0;
  for (const owner of owners) {
    const saw = [...new Set(observed?.[owner] ?? [])].sort();
    const said = declared[owner];
    // `{ table: 'shots' }` covers every operation on that table and `{ route: '/api/x' }` every method
    // on that route — naming a dependency without pinning how it is used is a legitimate declaration.
    const missing = saw.filter((e) => !said.some((d) => coversEffect(d, e)));
    const stale = said.filter((d) => !saw.some((e) => coversEffect(d, e)));
    if (missing.length) {
      report.warn('data-reach', `${owner} reaches undeclared: ${missing.join(', ')} (${label}) — add it to ${owner.startsWith('source:') ? '`reaches`' : '`contract.effects`'}`);
    }
    if (stale.length) {
      // NOT "declares what it does not use" — that is the module half's wording, and it can say it
      // because it reads the component's imports STATICALLY. This half is observed at runtime, so an
      // unreached declaration has two causes and only one of them is a stale claim: the review
      // region's own accept route is declared, real, and simply not driven by any flow. Say what was
      // actually seen and name both readings, or the honest answer to a true warning is to delete a
      // correct declaration.
      report.warn(
        'data-reach',
        `${owner} declares reach that nothing exercised: ${stale.join(', ')} (${label}) — either the ` +
          `declaration is stale, or no flow drives that path`,
      );
    }
    if (!missing.length && !stale.length) clean++;
  }
  if (clean) report.ok('data-reach', `${clean} owner(s) reach exactly what they declare (${label})`, clean);
}

/** `1 portal` / `2 portals` — the body-level nodes an island's own mount portaled and a check counted. */
export function portalNote(n) {
  return `${n} portal${n === 1 ? '' : 's'}`;
}

/** Map the runtime result's diagnostics + remount signal onto report findings (shared by both engines). */
export function reportRuntimeDiagnostics(report, r, label, declared = null) {
  const diagnostics = r?.diagnostics ?? [];
  if (diagnostics.length === 0) {
    report.ok('no-console-errors', `no console errors / unhandled rejections (${label})`);
  } else {
    report.error('no-console-errors', `console error / unhandled rejection (${label}): ${diagnostics[0]}`);
  }

  // Both renders include what the island portaled (lib/island-render.mjs), and the line says so.
  const portaled = r?.portals ? ` · ${portalNote(r.portals)}` : '';
  if (r?.remountIdentical === true) {
    report.ok('remount-stable', `re-mount produces identical output (${label}${portaled})`);
  } else if (r?.remountIdentical === false) {
    report.error('remount-stable', `re-mount changed the output (${label}${portaled}) — likely accidental module-level state`);
  }
  // remountIdentical == null → the island never rendered; the mount error already covers it.

  // Only present when the lagoon's fake fetch (`@motu/runtime/postgrest-fetch`) is in play — a project
  // still on module-alias stubs never populates this, so `undefined` skips it rather than reporting a
  // false pass for a mechanism that never ran. `seen` is the TOTAL request count, not the unscoped
  // one: a run that made zero requests has zero unscoped requests too, and `report.ok`'s own "0 seen
  // is a skip, not an ok" rule is what tells those two apart, the same as every other check here.
  // IS THIS ISLAND STANDING ON ITS STUBS? Two halves of one question, under one id.
  //
  // They were `fixture-coverage` and `network-sealed`, and the second's own comment called it "the
  // counterpart" to the first: one asks whether the requests the fake fetch SAW were declared, the
  // other whether any request got PAST the stubs entirely. Both are errors, both mean the island is
  // standing on something that is not there, and reading them as separate results invited fixing one.
  //
  // The preconditions differ and that is why this is not a concatenation: the escape half applies to
  // EVERY runtime run, including a project still on module-alias stubs where no fake fetch is
  // installed and `fixtureCoverage` is undefined. So each half reports only when it has something to
  // say, and the single `ok` names whichever halves actually held.
  if (r?.fixtureCoverage !== undefined || r?.networkEscapes !== undefined) {
    const unscoped = r?.fixtureCoverage?.unscoped ?? [];
    const escapes = r?.networkEscapes ?? [];
    // THE THIRD HALF, and the one that made the name only two-thirds true. `escapes` counts requests
    // that left for a non-loopback host; an unstubbed APP route is SAME-ORIGIN, so it 404s against the
    // dev server and neither of the other two ever saw it. Recorded at the delegate seam inside
    // `installFakeFetch`, which is the one place that knows a request was not claimed.
    const unanswered = r?.fixtureCoverage?.unanswered ?? [];
    if (unscoped.length) {
      const first = unscoped[0];
      report.error(
        'stubs-sealed',
        `${unscoped.length} request(s) matched no declared table/fixture (${label}): ` +
          `${first.method} ${first.path} — ${first.reason}`,
      );
    }
    if (escapes.length) {
      const first = escapes[0];
      const hosts = [...new Set(escapes.map((e) => { try { return new URL(e.url).host; } catch { return e.url; } }))];
      report.error(
        'stubs-sealed',
        `${escapes.length} request(s) escaped the lagoon to ${hosts.join(', ')} (${label}): ` +
          `${first.method} ${first.url} — a host module reached a real backend, so this island is not ` +
          `standing on its stubs. The failure is normally invisible: the island catches it and renders empty`,
      );
    }
    if (unanswered.length) {
      const first = unanswered[0];
      report.error(
        'stubs-sealed',
        `${unanswered.length} request(s) reached the dev server instead of a stub (${label}): ` +
          `${first.method} ${first.url} — ${first.why}. No fixture claimed it, so the island is standing on ` +
          `nothing. Add the path to \`appRoutes\` (and a fixture for it), or point \`baseUrl\` at its origin`,
      );
    }
    if (!unscoped.length && !escapes.length && !unanswered.length) {
      // `seen` is the FAKE-FETCH request count, not the escape count: zero escapes proves nothing on
      // its own (an island that made no backend call at all also escapes nothing). Passing the count
      // of requests actually answered lets `report.ok`'s "0 examined is a skip" rule tell the two
      // apart — which is precisely "is the fake fetch wired, or is this check vacuous?".
      const answered = r?.fixtureCoverage !== undefined;
      report.ok(
        'stubs-sealed',
        answered
          ? `every request matched a declared table/fixture, and nothing escaped the lagoon (${label})`
          : `nothing escaped the lagoon — every backend call was answered locally (${label})`,
        r?.fixtureCoverage?.seen,
      );
    }
  }

  // WHAT DOES THIS ISLAND NEED FROM THE BACKEND? Observed, not declared — see `DataReach` in
  // `@motu/runtime/postgrest-fetch` for why this exists at all: mocking at the wire made an island's
  // data dependency transitive, so the module half of `effects` stopped being able to see it. A
  // table-and-RPC list is a better answer than the module name it replaces, and it is already the
  // vocabulary `.assay/operations.json` uses — which is where a motu↔assay drift check would compare.
  //
  // IT NOW HAS SOMETHING TO COMPARE AGAINST. This was a readout, on the argument that "declaring a
  // per-island table list before assay's comparison exists would invent a format that then has to
  // survive contact with it". What changed is the format question: the entries below are already
  // assay's granularity (tables read/written, functions called), so the declaration is not an
  // invention — and the readout alone left a real hole. An island that reached a table nobody expected
  // failed `fixture-coverage`, and the fix was to add the table to the lagoon's `tables:` — so the
  // FIXTURE SET was doing double duty as the declaration, and widening it was a one-line edit made by
  // whoever was trying to get to green. `reportReachDrift` is the missing half; it stays a WARNING.
  if (r?.fixtureCoverage?.reach !== undefined) {
    const { tables, rpcs, functions = [], routes = [] } = r.fixtureCoverage.reach;
    const tableNames = Object.keys(tables).sort();
    const parts = [
      ...tableNames.map((t) => `${t}(${[...tables[t]].sort().join('/')})`),
      ...[...rpcs].sort().map((fn) => `rpc:${fn}`),
      // Named apart from `rpc:` because they are different things to whatever compares this against
      // a backend ledger: an edge function is its own deployable, an app route its own handler.
      ...[...functions].sort().map((fn) => `fn:${fn}`),
      ...[...routes].sort().map((r2) => `route:${r2}`),
    ];
    report.ok('data-reach', `reaches ${parts.join(', ')} (${label})`, {
      n: tableNames.length + rpcs.length + functions.length + routes.length,
      of: 'backend dependencies',
    });
    if (declared) reportReachDrift(report, r.fixtureCoverage.reach.by, declared, label);
  }

}

/**
 * WHERE THE REGION'S INPUT CAME FROM — through every door, in one list.
 *
 * The lagoon replaces host modules so completely that nothing shows a fetch happened: no request, no
 * network row, and the lens shows only the keys that resulted. Looking at a region and seeing no HTTP
 * at all is accurate and tells you nothing about whether an island asked for anything.
 *
 * An island's I/O leaves by one of THREE doors, and "all island I/O goes through the contract" is a
 * rule about an island's own file (`no-bare-fetch` reads the component, not its import graph) rather
 * than about the app: a service the island imports may read a table, and `contract.effects` has
 * `{ table }`/`{ rpc }`/`{ route }` kinds precisely so that can be DECLARED. Each door used to be
 * observed on its own — a traced stub here, `__motuDataReach` at the wire, and the contract's own
 * `CallEvent`, which no check ever printed. One question, so one readout:
 *
 *   ✓ provenance  contract: shots.list() ×2 · host-module: fetchClubFeed(11) ×4 · wire: table:shots(select)
 *
 * Two things stay visible that nothing else here can see, and now for all three doors: an island that
 * renders content while asking for NOTHING (its data came from somewhere it did not declare), and a
 * dependency it declares but never reaches.
 */
export function provenanceCheck(report, id, region, calls, outbound = []) {
  // The unified ledger when the page carries one; the traced-calls list is the fallback for a lagoon
  // built before it existed, so an older bundle still reports what it always did.
  // `args ? name(args) : name` — a wire reach's declared form (`table:shots(select)`) has no argument
  // half, and appending `()` to it would print an operation as an empty call.
  const label = (o) => (o.args ? `${o.name}(${o.args})` : o.name);
  const asks = outbound.length
    ? outbound.map((o) => ({ via: o.via, label: label(o), owner: o.owner }))
    : calls.map((c) => ({ via: 'host-module', label: `${c.fn}(${(c.args ?? []).join(', ')})`, owner: `island:${c.island ?? '?'}` }));
  if (!asks.length) {
    report.skip(
      'provenance',
      'no outbound calls observed — the islands asked for nothing through the contract, a traced host ' +
        'module or the wire. If that is wrong, wrap a stub export in `traced(module, fn, impl)`; ' +
        'without it the lagoon shows the result and never the question',
    );
    return;
  }
  // GROUPED BY DOOR, THE SAME GROUPING THE LENS SHOWS. Which one an ask left by is the thing a reader
  // is deciding about — a contract call is answered by the transport, a wire reach by fixtures, a
  // host-module call by a stub — and the two surfaces disagreeing about how the seams are grouped is
  // how one of them ends up trusted and the other ignored.
  const order = ['contract', 'host-module', 'wire'];
  const groups = new Map();
  for (const a of asks) {
    const counts = groups.get(a.via) ?? new Map();
    counts.set(a.label, (counts.get(a.label) ?? 0) + 1);
    groups.set(a.via, counts);
  }
  const parts = [...groups]
    .sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
    .map(([via, counts]) => {
      const shown = [...counts].map(([k, n]) => (n > 1 ? `${k} \u00d7${n}` : k));
      return `${via}: ${shown.join(', ')}`;
    });
  // WHO ASKED, named — because "nobody asked for anything" was printed for months over a region whose
  // SOURCE was asking constantly, and an owner list is what makes that impossible to print again.
  const owners = [...new Set(asks.map((a) => a.owner))].sort();
  const unowned = asks.filter((a) => a.owner === 'unattributed').length;
  const by = owners.length ? ` \u2014 by ${owners.join(', ')}` : '';
  // ASKED FOR, not "islands fetched": a source asks too, at region level, and calling every ask an
  // island's is the same blind spot that dropped them from the lens.
  report.ok('provenance', `asked for: ${parts.join(' \u00b7 ')}${by}`, { n: asks.length, of: 'outbound call(s)' });
  if (unowned) {
    report.warn(
      'provenance',
      `${unowned} ask(s) attributed to nobody — the request left while no island's and no source's ` +
        `window was open, so nothing can say which declaration should account for it`,
    );
  }
}

/**
 * Say it when the browser was not the one motu pinned.
 *
 * A WARNING rather than a note in passing: a build motu did not pin can render and behave differently
 * from the one it did, so every runtime verdict below is worth slightly less than it looks and the
 * run should say so where the findings are read. Warnings do not fail `motu check`, which is the
 * right weight — using the browser a machine already has is a legitimate way to run, not a fault.
 */
export function reportBrowserOverride(report) {
  const note = browserOverrideNote();
  if (note) {
    report.warn(
      'browser',
      `${note} — the runtime findings below hold for THAT build; a pinned run can still differ`,
    );
  }
}

/**
 * The backend's list of operations, or null when the project has not pointed at one.
 *
 * Read once per verify run. An unreadable or empty file is an ERROR OBJECT rather than an empty
 * list: an empty universe would make every ask unreachable, which is a wall of red that says the
 * opposite of what happened and is exactly the failure this check exists to be the opposite of.
 */
export function operationUniverse() {
  if (!paths.operations) return null;
  const rel = paths.operations.replace(`${REPO_ROOT}/`, '');
  if (!existsSync(paths.operations)) return { error: `\`operations\` names ${rel}, which does not exist` };
  const { names, error } = readOperationNames(readFileSync(paths.operations, 'utf8'));
  if (error) return { error: `${rel} ${error}` };
  if (!names.length) return { error: `${rel} holds no operation names` };
  return { names, index: indexOperations(names), rel };
}

/**
 * DOES THE THING THIS REGION ASKED FOR EXIST?
 *
 * `provenance` above records every ask and validates none of them — it cannot, because motu has no
 * view of a backend. Given a list of the backend's own operations it can: the wire door records
 * `route:<METHOD> <path>` and `fn:<name>`, which is an identifier an operation is keyed by, so an
 * ask resolving to nothing is a region asking for something that is not there.
 *
 * ## Two directions, and only one of them is an error
 *
 * UNREACHABLE — an ask that resolves to no operation. An error: either the path is wrong, or an
 * operation exists that the backend's own declarations have never covered. Both are real, and both
 * are silent today.
 *
 * UNCOVERED — an operation this region DECLARES IT REACHES that no flow ever asked for. A warning,
 * and narrowed hard: the universe is the whole backend, and a login region will never ask for an
 * admin route, so reporting the universe per region would be wrong dozens of times on day one —
 * which is how a check teaches people to ignore it. The narrowing uses motu's OWN existing
 * declaration (`reaches` / `contract.effects`, via `declaredReach`), so both sides are artifacts the
 * project already maintains and there is no third list to rot.
 *
 * ## What it says nothing about
 *
 * A contract call is `service.method` and a traced host module is a bare function name; neither says
 * which backend thing answered, and a table or an rpc is a PostgREST identifier rather than an
 * operation. Those are COUNTED AND NAMED rather than dropped — quietly ignoring the doors that
 * cannot be checked is how this check would come to claim more than it examined.
 */
export function operationReachCheck(report, outbound, universe, declared) {
  if (!universe) {
    report.skip(
      'operation-reach',
      'no `operations` in motu.config.json — set it to the backend\'s own list of operations (a path, ' +
        'e.g. ".assay/operations.json") and every ask this region makes is checked against it',
    );
    return;
  }
  if (universe.error) {
    // COULD NOT RUN, not a finding: exit 2, retry, do not repair.
    report.inconclusive('operation-reach', `${universe.error} — nothing was compared`);
    return;
  }

  const asks = (outbound ?? []).filter((o) => o.via === 'wire');
  const resolvable = asks.filter((o) => askKind(o.name));
  const unresolvable = (outbound ?? []).length - resolvable.length;

  const reached = new Set();
  const unreachable = new Map();
  for (const ask of resolvable) {
    const hit = resolveOperation(ask.name, universe.index);
    if (hit) reached.add(hit);
    else unreachable.set(ask.name, (unreachable.get(ask.name) ?? new Set()).add(ask.owner));
  }

  for (const [name, owners] of unreachable) {
    report.error(
      'operation-reach',
      `${[...owners].sort().join(', ')} asked for \`${name}\`, which names no operation in ` +
        `${universe.rel} — either the path is wrong, or the backend has an operation nothing declares`,
    );
  }

  // NARROWED to what this region says it reaches. Everything else in the universe is out of scope
  // for this region by construction, and saying so is what keeps the number believable.
  //
  // Taken as a PARAMETER rather than read in here, the way `reportReachDrift` takes its declarations:
  // a check that goes to the filesystem for half its input cannot be driven by a test without a
  // fixture project, and the half that decides whether a finding is reported is exactly the half
  // worth driving.
  const declaredOps = new Set();
  for (const entries of Object.values(declared ?? {})) {
    for (const entry of entries) {
      if (!askKind(entry)) continue;
      const hit = resolveOperation(entry, universe.index);
      if (hit) declaredOps.add(hit);
    }
  }
  const uncovered = [...declaredOps].filter((op) => !reached.has(op)).sort();
  if (uncovered.length) {
    report.warn(
      'operation-reach',
      `declared as reached and never asked for: ${uncovered.join(', ')} — the declaration is a claim ` +
        'no flow has exercised, so either a flow is missing or the declaration is stale',
    );
  }

  const aside = [
    `${universe.names.length} operation(s) declared`,
    unresolvable ? `${unresolvable} ask(s) name no operation (contract, host module, table or rpc)` : '',
  ].filter(Boolean).join(' · ');
  report.ok(
    'operation-reach',
    `${reached.size}/${resolvable.length} ask(s) resolve to a declared operation — ${aside}`,
    { n: resolvable.length, of: 'operation ask(s)' },
  );
}
