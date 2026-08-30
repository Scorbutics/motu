// SWITCHING REGIONS AND SWITCHING FLOWS — the gallery's own two verbs, in a real browser.
//
// Everything else in this repo's test suites is decidable from source. These are not: a region
// switch MOUNTS something, a flow switch REPLAYS a sequence against a live store, and the bugs both
// have shipped were about what survives the switch — a URL still claiming an island that is no
// longer on screen, a panel lighting "As seeded" whatever you pressed, a second flow's steps applied
// on top of the first one's result under the second one's name. None of those are visible to a
// parser, and every one of them was found by hand.
//
// ONE PAGE FOR THE WHOLE FILE, re-aimed per case, for the reason `motu check --runtime` uses one
// lagoon for every island: the cost here is the first boot (a vite build of the whole gallery), not
// the navigation. Cases that need a fresh document say so and pay for it explicitly.
//
// THE FIXTURE IS THIS REPO'S OWN LAGOON (`host-app/motu`): four regions, and `review` carries five
// flows, so both verbs have something real to switch between. A fixture project invented for the
// test would be a fifth copy of a lagoon nobody else runs.
//
// If the environment cannot boot it — no chromium, a port that never opens, a gallery that fails to
// build — these SKIP with the reason attached rather than failing. That is motu's own rule about the
// difference between "contradicted" and "could not run": a false red here would send someone
// repairing a region switch that works.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createConnection } from 'node:net';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../../..');
const LAGOON_PROJECT = resolve(REPO, 'host-app/motu');
const RUN = resolve(REPO, 'packages/cli/src/run.mjs');
const PORT = 8951;
const BASE = `http://127.0.0.1:${PORT}/lagoon.html`;

/** The region we switch to, and the flows we switch between — read back from the page, not assumed. */
const REGION = 'review';

function waitForPort(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((ok, fail) => {
    const tryOnce = () => {
      const sock = createConnection({ port, host: '127.0.0.1' });
      sock.once('connect', () => {
        sock.destroy();
        ok();
      });
      sock.once('error', () => {
        sock.destroy();
        if (Date.now() > deadline) fail(new Error(`nothing opened port ${port} in ${timeoutMs}ms`));
        else setTimeout(tryOnce, 250);
      });
    };
    tryOnce();
  });
}

let server = null;
let browser = null;
let page = null;
/** Why the suite could not run, if it could not. Every case reports it rather than failing. */
let unavailable = null;

/**
 * Wait for the CATALOGUE, not for load.
 *
 * `load` fires on a page whose bundle then throws — that is the whole reason the boot guard exists —
 * so a test that waits for it and reads the control surface gets `undefined` and blames the feature.
 * `__motuLagoonStates` is published by startLagoon, so its presence is the bundle having finished.
 */
async function waitForGallery(p, timeoutMs = 60000) {
  await p.waitForFunction(() => Boolean(window.__motuLagoonStates), null, { timeout: timeoutMs });
}

async function openFresh(url) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await waitForGallery(page);
}

test.before(async () => {
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch (err) {
    unavailable = `playwright is not installed here (${err.message})`;
    return;
  }

  server = spawn(process.execPath, [RUN, 'lagoon', 'serve', '--port', String(PORT)], {
    cwd: LAGOON_PROJECT,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let serverLog = '';
  server.stdout.on('data', (d) => (serverLog += d));
  server.stderr.on('data', (d) => (serverLog += d));
  server.once('error', (err) => (unavailable = `could not spawn the lagoon server: ${err.message}`));

  try {
    await waitForPort(PORT, 120000);
    browser = await chromium.launch();
    page = await browser.newPage();
    await openFresh(BASE);
  } catch (err) {
    // The server's own output is the only thing that says WHY, and it is otherwise swallowed.
    unavailable = `${err.message}\n--- lagoon serve said ---\n${serverLog.slice(-1500)}`;
  }
}, { timeout: 180000 });

test.after(async () => {
  await browser?.close().catch(() => {});
  server?.kill();
});

/** Every case funnels through this, so "could not run" is never mistaken for "passed". */
function guard(t) {
  if (unavailable) {
    t.skip(`lagoon gallery unavailable — ${unavailable}`);
    return true;
  }
  return false;
}

test('switching a region mounts it, and says so on the control surface', async (t) => {
  if (guard(t)) return;
  await openFresh(BASE);

  const result = await page.evaluate(async (region) => {
    const ctl = window.__motuLagoonControl;
    const before = ctl.current().region;
    const others = ctl.regions().map((r) => r.id);
    ctl.show(region);
    // The mount is synchronous into React's queue, not into the DOM; give it a frame to paint.
    await new Promise((r) => setTimeout(r, 800));
    return { before, after: ctl.current().region, known: others };
  }, REGION);

  assert.ok(result.known.includes(REGION), `the fixture lost its ${REGION} region: ${result.known}`);
  assert.equal(result.after, REGION, 'the control surface still reports the previous region');
  // A switch that "worked" by already being there proves nothing about switching.
  assert.notEqual(result.before, result.after, 'the fixture opened on the region under test');
});

test('switching a region drops an island target the URL was still carrying', async (t) => {
  if (guard(t)) return;
  // The bug this encodes: open an island address, switch to a region, and the URL kept claiming
  // `target=island:…`. Reload — or hand the link to someone — and you are back on an island you left,
  // while the page you are looking at is a region. The address IS the state here, so a stale one is
  // not cosmetic.
  // An island's address is CONSTRUCTED, not listed: the catalogue publishes scenarios by element tag
  // and the address is `?target=island:<tag>&scenario=<name>`. Build it from a tag this build really
  // has, so the case cannot pass by opening a target that resolves to nothing.
  const target = await page.evaluate(() => {
    const scenarios = window.__motuLagoonStates?.scenarios ?? {};
    const tag = Object.keys(scenarios).find((k) => (scenarios[k] ?? []).length > 0);
    return tag ? { tag, scenario: scenarios[tag][0]?.name ?? null } : null;
  });
  if (!target) {
    t.skip('this lagoon publishes no island scenarios to switch away from');
    return;
  }

  const url = new URL(BASE);
  url.searchParams.set('target', `island:${target.tag}`);
  if (target.scenario) url.searchParams.set('scenario', target.scenario);
  await openFresh(url.href);
  const opened = await page.evaluate(() => window.__motuLagoonState);
  assert.ok(opened?.ok !== false, `the island address refused to open: ${JSON.stringify(opened)}`);

  const after = await page.evaluate(async (region) => {
    window.__motuLagoonControl.show(region);
    await new Promise((r) => setTimeout(r, 800));
    return { search: location.search, region: window.__motuLagoonControl.current().region };
  }, REGION);

  assert.equal(after.region, REGION);
  assert.ok(!after.search.includes('target='), `the island target survived the switch: ${after.search}`);
  assert.ok(!after.search.includes('scenario='), `the scenario survived the switch: ${after.search}`);
});

test('switching a flow records which state is showing, and puts it in the address', async (t) => {
  if (guard(t)) return;
  // `shownFlow` is REMEMBERED rather than inferred, because a panel drawn outside the page (the dock
  // is now one) has nowhere else to read it from. Before it existed, the sidebar lit "As seeded"
  // whatever you pressed — every flow ran correctly and none of them looked selected.
  await openFresh(`${BASE}?region=${REGION}`);

  const flows = await page.evaluate(
    (region) => (window.__motuLagoonStates?.flows?.[region] ?? []).map((f) => f.name ?? f),
    REGION,
  );
  if (flows.length < 2) {
    t.skip(`${REGION} declares ${flows.length} flow(s); this case needs two to switch between`);
    return;
  }

  const seen = await page.evaluate(async (name) => {
    const ctl = window.__motuLagoonControl;
    ctl.runFlow(name);
    await new Promise((r) => setTimeout(r, 1500));
    return { flow: ctl.current().flow, search: location.search };
  }, flows[0]);

  assert.equal(seen.flow, flows[0], 'the control surface does not know which flow is showing');
  // PARSE the address rather than matching text on it: URLSearchParams writes a space as `+`, so a
  // string built with encodeURIComponent (`%20`) never matches a flow whose name has a space in it —
  // which is every flow this fixture declares.
  const params = new URLSearchParams(seen.search);
  assert.equal(params.get('flow'), flows[0], `flow missing from ${seen.search}`);
  assert.equal(params.get('region'), REGION, `region missing from ${seen.search}`);
  // `step` addresses a point INSIDE a flow. Left behind, it silently truncates the next flow you run.
  assert.ok(!seen.search.includes('step='), `a stale step survived into ${seen.search}`);
});

test('a second flow starts from the seeded state, not on top of the first', async (t) => {
  if (guard(t)) return;
  // Flows are sequences and the region keeps what the last one left. Without `__motuLagoon.reset()`
  // the second flow's steps land on the first one's result and are reported under the second one's
  // name — a green run describing a state the page never establishes.
  //
  // THE PAIR IS DISCOVERED, NOT CHOSEN. Most pairs cannot detect this: if A writes only keys B also
  // writes, B overwrites the leftovers and a reset-free run is indistinguishable from a reset one.
  // Both earlier versions of this case were green with `reset()` deleted for exactly that reason —
  // first comparing step counts (which never depend on prior state at all), then comparing held keys
  // on the fixture's first two flows, which happen to write the same set. So: run every flow alone,
  // then look for an ordered pair where A leaves a key B never touches. That key is the leak this
  // asserts the absence of, and the search is what keeps the case falsifiable on a fixture whose
  // flows get rearranged.
  await openFresh(`${BASE}?region=${REGION}`);

  const flows = await page.evaluate(
    (region) => (window.__motuLagoonStates?.flows?.[region] ?? []).map((f) => f.name ?? f),
    REGION,
  );
  if (flows.length < 2) {
    t.skip(`${REGION} declares ${flows.length} flow(s); this case needs two`);
    return;
  }

  /** Run a flow and read back everything the region holds — the surface a leftover shows up in. */
  const runAndRead = async (name) =>
    page.evaluate(async (n) => {
      window.__motuLagoonControl.runFlow(n);
      await new Promise((r) => setTimeout(r, 1500));
      const l = window.__motuLagoon;
      const held = {};
      for (const k of l?.held() ?? []) {
        try {
          held[k] = JSON.stringify(l.read(k)) ?? 'undefined';
        } catch {
          held[k] = '<unserialisable>'; // a value that will not serialise still counts as present
        }
      }
      return { held, state: window.__motuLagoonState };
    }, name);

  const alone = {};
  for (const name of flows) {
    await openFresh(`${BASE}?region=${REGION}`);
    alone[name] = await runAndRead(name);
  }

  let pair = null;
  for (const a of flows) {
    for (const b of flows) {
      if (a === b) continue;
      const leak = Object.keys(alone[a].held).filter((k) => !(k in alone[b].held));
      if (leak.length) {
        pair = { a, b, leak };
        break;
      }
    }
    if (pair) break;
  }
  if (!pair) {
    // Not a pass. Every flow here writes the same key set, so a missing reset is invisible in this
    // region and this case would be asserting a constant.
    t.skip(`no two flows in ${REGION} write different keys — a missing reset is undetectable here`);
    return;
  }

  await openFresh(`${BASE}?region=${REGION}`);
  await runAndRead(pair.a);
  const afterOther = await runAndRead(pair.b);

  assert.ok(alone[pair.b].state?.ok, `${pair.b} does not pass on its own`);
  assert.deepEqual(
    afterOther.held,
    alone[pair.b].held,
    `"${pair.b}" ran after "${pair.a}" and kept ${pair.leak.join(', ')} — the region was not reset first`,
  );
});

test('a flow name that resolves to nothing refuses instead of showing the seeded state', async (t) => {
  if (guard(t)) return;
  // Being handed the default state while believing it is the one you named is the failure this
  // project engineers against — the same rule an unresolvable address obeys.
  await openFresh(`${BASE}?region=${REGION}`);

  const outcome = await page.evaluate(async () => {
    const ctl = window.__motuLagoonControl;
    ctl.runFlow('no-such-flow-anywhere');
    await new Promise((r) => setTimeout(r, 1200));
    return {
      banner: document.querySelector('[role="alert"]')?.textContent ?? '',
      state: window.__motuLagoonState,
    };
  });

  // The contract for an address that resolves to nothing: a banner a screenshot keeps, a console
  // error, and a machine flag. Assert the flag and the banner — the dock is not the channel, which is
  // what made this silent in the first place.
  assert.equal(outcome.state?.ok, false, 'an unresolvable flow did not report a refusal');
  assert.match(String(outcome.state?.error ?? ''), /no flow/, `unhelpful refusal: ${JSON.stringify(outcome.state)}`);
  assert.ok(
    (outcome.state?.available ?? []).length > 0,
    'the refusal did not say what this region does declare',
  );
  assert.match(outcome.banner, /no flow/, 'nothing on screen said the flow could not be found');
});

test('going back to "As seeded" reloads the document rather than re-mounting it', async (t) => {
  if (guard(t)) return;
  // Deliberate, and load-bearing: a source is installed ONCE, with the store, so re-mounting reuses
  // both. A region whose source fetches came back holding nothing and sat forever at its pre-answer
  // state — which is not a state the page establishes, it is one it passes through. The address is
  // already in the URL, so a reload loses nothing.
  await openFresh(`${BASE}?region=${REGION}`);
  const flows = await page.evaluate(
    (region) => (window.__motuLagoonStates?.flows?.[region] ?? []).map((f) => f.name ?? f),
    REGION,
  );
  if (!flows.length) {
    t.skip(`${REGION} declares no flows to come back from`);
    return;
  }

  await page.evaluate(async (n) => {
    window.__motuLagoonControl.runFlow(n);
    await new Promise((r) => setTimeout(r, 1200));
  }, flows[0]);

  // A sentinel on the window survives a re-mount and cannot survive a navigation.
  await page.evaluate(() => {
    window.__reloadSentinel = 'still here';
  });
  await page.evaluate(() => window.__motuLagoonControl.runFlow(null));
  await page.waitForFunction(() => !window.__reloadSentinel, null, { timeout: 20000 });
  await waitForGallery(page);

  const after = await page.evaluate(() => ({
    search: location.search,
    flow: window.__motuLagoonControl.current().flow,
  }));
  assert.equal(after.flow, null, 'the control surface still names a flow after returning to seeded');
  assert.ok(!after.search.includes('flow='), `the flow survived in the address: ${after.search}`);
});
