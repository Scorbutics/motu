// Real-browser lagoon check. Boots the focused lagoon (the configured lagoon root via Vite,
// MOTU_TARGET=island:<tag>) and drives it with Playwright/Chromium, so verification exercises real
// layout, CSS and paint — not just an in-process DOM. Exposes runLagoon() for `motu island verify`;
// also runnable directly for a screenshot: `node --import tsx playwright-lagoon.mjs <tag> <fit> [screenshotPath]`.
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createConnection } from 'node:net';
import { setTimeout as sleep } from 'node:timers/promises';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { REPO_ROOT, paths, color } from './lib/util.mjs';

/** The framework's own lagoon dev-server runner (see lagoon-dev.mjs). */
const LAGOON_DEV = fileURLToPath(new URL('./lagoon-dev.mjs', import.meta.url));

const LAGOON_DIR = paths.lagoonDir;


/**
 * The lagoon is the loop: without it `verify` has static checks and nothing else. Both of its
 * preconditions used to fail as a bare spawn ENOENT (an unhandled 'error' event that killed the
 * process with a stack trace), which reads as a motu bug rather than a missing composition root.
 * Diagnose them up front instead.
 */
function assertLagoonBootable() {
  if (!existsSync(LAGOON_DIR)) {
    throw new Error(
      `no lagoon root at ${paths.rel(LAGOON_DIR)} — the lagoon is where verify mounts the island, so ` +
        `there is nothing to verify against. Run \`motu init --host <angularjs|next|none>\` to scaffold ` +
        `one, or point "lagoon" in motu.config.json at an existing composition root.`,
    );
  }

}

function waitForPort(port, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const sock = createConnection({ port, host: 'localhost' });
      sock.once('connect', () => {
        sock.destroy();
        resolve();
      });
      sock.once('error', () => {
        sock.destroy();
        if (Date.now() > deadline) reject(new Error(`vite did not open port ${port} in time`));
        else setTimeout(tryOnce, 200);
      });
    };
    tryOnce();
  });
}

// One server, one browser, for the whole run.
//
// Every runtime check used to boot its own Vite and its own Chromium: four per island, sixty for a
// project the size of peps, each paying a cold dep-optimize before it could answer a question that
// takes 200ms. The target is now read from the URL as well as the env, so the SAME server can serve
// every island and every region — a check navigates instead of booting. What still forces a separate
// server is what is baked at build time (fit, isolation, forced error, transport), so the pool is
// keyed by exactly those.
const servers = new Map();
let sharedBrowser = null;
let poolClosing = false;
let exitHooked = false;

/**
 * Kill the pool on the way out.
 *
 * Commands end with `process.exit`, so a `finally` in the caller is not enough — and a leaked vite
 * holds its port, which the next run then connects to and measures a stale build with.
 */
function hookExit() {
  if (exitHooked) return;
  exitHooked = true;
  const kill = () => {
    for (const entry of servers.values()) stopLagoonProcess(entry.child);
    servers.clear();
  };
  process.on('exit', kill);
  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, () => {
      kill();
      process.exit(130);
    });
  }
}

/** Everything the pool holds, released at the end of a command (see `closeLagoonPool`). */
export async function closeLagoonPool() {
  poolClosing = true;
  for (const page of pages.values()) await page.close().catch(() => {});
  pages.clear();
  for (const entry of servers.values()) stopLagoonProcess(entry.child);
  servers.clear();
  if (sharedBrowser) {
    await sharedBrowser.close().catch(() => {});
    sharedBrowser = null;
  }
  poolClosing = false;
}

/** The one Chromium every check drives. */
async function getBrowser() {
  const { chromium } = await import('playwright');
  if (!sharedBrowser || !sharedBrowser.isConnected()) sharedBrowser = await chromium.launch();
  return sharedBrowser;
}

// ONE PAGE, RE-AIMED.
//
// The lagoon is a single page holding the whole registry, every fixture and a mock transport. Loading
// it again to look at the next island rebuilt all of that to ask a question that takes milliseconds —
// which is what made the runtime lane feel like an integration suite. The page is opened once per run
// and each check asks it to show something else: a different island, a whole region, the same island
// with a failing backend. Feeding data and firing declared outputs then happen in the page that is
// already standing, which is the thing a browser-per-spec suite cannot do.
const pages = new Map();
/**
 * How long to wait for an island to paint.
 *
 * It used to be fifteen seconds because the page was loading from cold each time — Vite's first-run
 * dep optimization can reload underneath the check. The page is loaded once now, so a re-aimed mount
 * paints in tens of milliseconds, and the only thing the long wait still bought was thirty seconds per
 * island that legitimately renders nothing from its defaults. The first load keeps the long deadline;
 * everything after it gets the short one.
 */
const PAINT_TIMEOUT_COLD = 15000;
const PAINT_TIMEOUT_WARM = 3000;
let paintTimeout = PAINT_TIMEOUT_COLD;
/** Diagnostics of the CHECK currently running — console/pageerror listeners are per page, not per check. */
let diagnosticSink = [];

/** The page for a build posture, opened on first use. */
/** The view each pooled page is currently showing, so a check never inherits the previous one's. */
const pageView = new Map();

async function lagoonPage(server, target, view) {
  const existing = pages.get(server.key);
  const wanted = view ?? 'region';
  // A view change is a different render, not a re-aim: the warm path swaps the TARGET in place and
  // keeps whatever view the page already had. Left unhandled it is a silent contaminated result —
  // the region-render check inherited the wiring probe's 'mountpoints' page and reported every
  // declared slot as mounted, including one the arrangement never places.
  if (existing && !existing.isClosed() && pageView.get(server.key) === wanted) {
    // Re-aim it. `false` means this build has no harness (an older lagoon entry) — fall back to a load.
    paintTimeout = PAINT_TIMEOUT_WARM;
    const aimed = await existing
      .evaluate(
        ([t, fit, forceError]) => !!window.__motuLagoonHarness?.mount(t, { fit, forceError }),
        [target, server.fit ?? '', server.forceError ?? 0],
      )
      .catch(() => false);
    if (aimed) return existing;
    pageView.set(server.key, view ?? 'region');
    await existing.goto(lagoonUrl(server, target, view), { waitUntil: 'load' });
    return existing;
  }
  const browser = await getBrowser();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await setupPageDiagnostics(page, null);
  pageView.set(server.key, view ?? 'region');
  await page.goto(lagoonUrl(server, target, view), { waitUntil: 'load' });
  pages.set(server.key, page);
  return page;
}

/**
 * Run one check against the shared page: re-aim it, collect this check's diagnostics, restore the
 * viewport it was handed.
 */
async function onLagoonPage({ target, fit, forceError, transport, port, viewport, diagnostics, view }, fn) {
  const server = await startLagoon({ target, fit, forceError, transport, port });
  const page = await lagoonPage(server, target, view);
  const previousSink = diagnosticSink;
  diagnosticSink = diagnostics ?? [];
  try {
    if (viewport) await page.setViewportSize(viewport);
    return await fn(page, server);
  } finally {
    diagnosticSink = previousSink;
  }
}

/** `/lagoon.html` for a target, on a pooled server. */
function lagoonUrl(server, target, view) {
  const q = new URLSearchParams({ target: target ?? '' });
  if (view) q.set('view', view);
  if (server.fit) q.set('fit', server.fit);
  if (server.forceError) q.set('forceError', String(server.forceError));
  return `http://localhost:${server.port}/lagoon.html?${q}`;
}

/** Start the lagoon Vite dev server focused on one target ("island:x-…" | "archipelago:id"). */
async function startLagoonProcess({ target, fit = 'native', port, forceError, transport }) {
  assertLagoonBootable();
  // Spawn vite DIRECTLY (not via `pnpm exec`) in its own process group: a pnpm wrapper would spawn
  // vite as a grandchild that gets orphaned on kill and keeps holding the strict port, so a later run
  // would connect to the stale server. `detached: true` lets us SIGKILL the whole group in stop().
  const child = spawn(
    process.execPath,
    [LAGOON_DEV, '--port', String(port), '--strictPort'],
    {
      // The project root, not the lagoon: the runner resolves motu.config.json by walking up from cwd.
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        MOTU_NO_SSL: '1',
        MOTU_TARGET: target,
        MOTU_FIT: fit,
        ...(forceError ? { MOTU_FORCE_ERROR: String(forceError) } : {}),
        ...(transport ? { MOTU_TRANSPORT: transport } : {}),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    },
  );
  let log = '';
  child.stdout.on('data', (d) => (log += d));
  child.stderr.on('data', (d) => (log += d));
  try {
    await waitForPort(port);
  } catch (err) {
    stopLagoon(child);
    throw new Error(`${err.message}\n--- vite output ---\n${log}`);
  }
  return child;
}

/**
 * Take (or start) a pooled server for this build posture. The `target` is passed for the first boot's
 * env — later callers pass theirs in the URL.
 */
async function startLagoon(opts) {
  // Only what is BAKED at build time can force another server. Target, fit and the forced error all
  // travel in the URL, so what is left is the transport choice, which vite compiles in.
  const key = String(opts.transport ?? '');
  const existing = servers.get(key);
  if (existing) return { ...existing, target: opts.target, fit: opts.fit, forceError: opts.forceError };
  hookExit();
  const port = opts.port ?? 5200 + Math.floor(Math.random() * 700);
  const child = await startLagoonProcess({ ...opts, port });
  const entry = { key, child, port };
  servers.set(key, entry);
  return { ...entry, target: opts.target, fit: opts.fit, forceError: opts.forceError };
}

/** A pooled server is not stopped by its caller — the pool outlives the check (see closeLagoonPool). */
function stopLagoon(server) {
  if (poolClosing || !server) return;
  if (servers.has(server.key)) return;
  stopLagoonProcess(server.child ?? server);
}

/** Kill the vite process group started by startLagoon. */
function stopLagoonProcess(child) {
  if (!child || child.killed) return;
  try {
    process.kill(-child.pid, 'SIGKILL'); // negative pid → the whole detached group
  } catch {
    try {
      child.kill('SIGKILL');
    } catch {
      /* already gone */
    }
  }
}

// Dev-server / framework noise that isn't the island's fault — filtered out of diagnostics.
const NOISE = /\[vite\]|Download the React DevTools|favicon|net::ERR|Failed to load resource/i;

/**
 * Wire a page's diagnostics capture: (1) a resolver that finds an island even when it's nested in a
 * <motu-archipelago> shadow root (the lagoon wraps island targets in a one-island archipelago that
 * owns the shadow boundary; the island renders LIGHT inside it, so it has no own shadowRoot and isn't
 * reachable from document.querySelector); (2) console.error / uncaught / unhandled-rejection collection.
 */
async function setupPageDiagnostics(page, diagnostics) {
  // `null` means "the shared sink" — the page outlives any one check, so its listeners write into
  // whichever check is running (see onLagoonPage).
  const sink = diagnostics ?? { push: (line) => diagnosticSink.push(line) };
  await page.addInitScript(() => {
    window.__motuFindIsland = (t) => {
      let el = document.querySelector(t);
      if (!el) {
        for (const arch of document.querySelectorAll('motu-archipelago')) {
          const hit = arch.shadowRoot && arch.shadowRoot.querySelector(t);
          if (hit) {
            el = hit;
            break;
          }
        }
      }
      // React mount path: the island renders in the host's own tree, so there is no <x-tag> element.
      // Its wrapper carries the tag instead (display:contents, so it is the same box as the content).
      if (!el) el = document.querySelector('[data-motu-island="' + t + '"]');
      return el;
    };
    // Rendered output = the island's own shadow (standalone) or its light DOM (nested in an archipelago).
    window.__motuRendered = (el) => (el ? (el.shadowRoot ? el.shadowRoot.innerHTML : el.innerHTML) : '');
    window.addEventListener('unhandledrejection', (e) => {
      const r = e && e.reason;
      (window.__motuRejections = window.__motuRejections || []).push(
        'unhandledrejection: ' + String((r && (r.stack || r.message)) || r),
      );
    });
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !NOISE.test(msg.text())) sink.push(`console.error: ${msg.text()}`);
  });
  page.on('pageerror', (err) => {
    const m = String(err?.message || err);
    if (!NOISE.test(m)) sink.push(`pageerror: ${m}`);
  });
}

/**
 * Neutralise auto-generated element ids before two renders are compared.
 *
 * React's `useId` hands out ids from a per-root counter, so a second mount legitimately produces
 * `radix-_r_1_` where the first had `radix-_r_0_`. Any component library built on it (Radix, and so
 * every shadcn UI) therefore differs between mounts for a reason that says nothing about the island.
 * Comparing raw HTML made that look like leaked module state, and — in the other direction — could
 * make two identical scenarios look meaningfully different and pass the data-flow check for free.
 * Both comparisons are about CONTENT, so strip the counter from both.
 */
function normalizeRender(html) {
  return String(html)
    .replace(/_r_[0-9a-z]+_/gi, '_r_#_') // React 19
    .replace(/:r[0-9a-z]+:/gi, ':r#:') //   React 18
    .replace(/\u00abr[0-9a-z]+\u00bb/gi, 'r#'); // React 18, SSR-safe form

}

/**
 * Wait for the island's rendered output to SETTLE, and return it.
 *
 * "Non-empty" is not the same as "finished". An island that loads through the contract paints an empty
 * shell first and fills in a tick later, so a snapshot taken at first paint is a race: the re-mount
 * check compares an empty first mount against a warm, already-filled second one and reports phantom
 * instability, and the data-flow check compares two shells and calls them identical. Since almost every
 * island that talks to a backend behaves this way, settling has to be the default, not an opt-in.
 *
 * Settled = non-empty and unchanged across consecutive samples. Returns '' if it never rendered.
 */
async function waitForStableRender(page, tag, { timeoutMs, quietSamples = 3, intervalMs = 120 } = {}) {
  const started = Date.now();
  const deadline = started + (timeoutMs ?? paintTimeout);
  let last = null;
  let stable = 0;
  while (Date.now() < deadline) {
    let html = '';
    try {
      html = await page.evaluate((t) => window.__motuRendered(window.__motuFindIsland(t)), tag);
    } catch {
      // Execution context destroyed by Vite's dep re-optimization reload — re-poll on the new one.
      last = null;
      stable = 0;
      html = null;
    }
    if (html !== null && html === (last ?? '')) {
      // EMPTY settles too, after a grace period. Only counting non-empty output as settled meant an
      // island that legitimately renders nothing from its defaults (a pure projection with no input)
      // burned the whole timeout on every check — fifteen seconds to observe an emptiness that was
      // decided in the first frame.
      const grace = html === '' ? started + 1000 : started;
      if (++stable >= quietSamples && Date.now() >= grace) return html;
    } else if (html !== null) {
      stable = 0;
      last = html;
    }
    await sleep(intervalMs);
  }
  return last ?? '';
}

/**
 * Mount one island in the real-browser lagoon and report whether it rendered. Optionally screenshots.
 * Returns { ok, mounted, shadowLength, diagnostics, remountIdentical }.
 *   diagnostics       — console.error lines + uncaught errors + unhandled rejections (empty = clean).
 *   remountIdentical  — true/false if the re-mount check ran, null if it couldn't (island never rendered).
 */
export async function runLagoon({ tag, fit = 'native', port = 5199, screenshotPath, checkRemount = true, forceError }) {
  const { chromium } = await import('playwright');
  const diagnostics = [];
  return onLagoonPage({ target: `island:${tag}`, fit, port, forceError, viewport: { width: 900, height: 720 }, diagnostics }, async (page, server) => {

    // Poll the DOM until the island upgrades and paints. This is a retry loop rather than a single
    // waitForFunction because Vite's first-run dep re-optimization can trigger a full page reload that
    // destroys the execution context mid-check — we simply re-poll on the new one.
    let result = { mounted: false, shadowLength: 0 };
    const deadline = Date.now() + paintTimeout;
    while (Date.now() < deadline) {
      try {
        result = await page.evaluate((t) => {
          const el = window.__motuFindIsland(t);
          const html = window.__motuRendered(el);
          return { mounted: !!el, shadowLength: html.length };
        }, tag);
        if (result.mounted && result.shadowLength > 0) break;
      } catch {
        // Execution context destroyed by an HMR/full reload — wait and retry on the fresh context.
      }
      await sleep(200);
    }
    // Let an async-loading island finish before anything is measured from it.
    if (result.mounted) {
      const settled = await waitForStableRender(page, tag);
      result.shadowLength = settled.length;
    }

    if (screenshotPath) await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});

    // Re-mount identical: dispose the element and mount a fresh clone, then diff the rendered output. A
    // difference means the island carries accidental module-level state (islands mount/unmount often).
    let remountIdentical = null;
    if (checkRemount && result.mounted && result.shadowLength > 0) {
      remountIdentical = await remountAndCompare(page, tag);
    }

    const rejections = await page.evaluate(() => window.__motuRejections || []).catch(() => []);
    for (const r of rejections) if (!NOISE.test(r)) diagnostics.push(r);

    return { ok: result.mounted && result.shadowLength > 0, ...result, diagnostics, remountIdentical };
  });
}

/** Snapshot the island's rendered output, swap in a fresh clone (fires disconnect+reconnect), diff. */
async function remountAndCompare(page, tag) {
  try {
    const before = await page.evaluate((t) => {
      const el = window.__motuFindIsland(t);
      if (!el) return null;
      const html = window.__motuRendered(el);
      // React mount path: swapping the DOM node only detaches React's tree — the "fresh" node would
      // stay empty and every island would look unstable. Tear the tree down and rebuild it instead,
      // which is the same question asked of the same code: does anything survive that should not.
      if (window.__motuLagoon && typeof window.__motuLagoon.remount === 'function') {
        window.__motuLagoon.remount();
        return html;
      }
      const parent = el.parentNode;
      const clone = el.cloneNode(false); // attributes only — a genuinely fresh element, no shadow
      parent.removeChild(el); // disconnectedCallback -> __motuDispose
      parent.appendChild(clone); // connectedCallback -> fresh mount
      return html;
    }, tag);
    if (before == null) return null;

    const after = await waitForStableRender(page, tag, { timeoutMs: 8000 });
    return normalizeRender(after) === normalizeRender(before);
  } catch {
    return null;
  }
}

/**
 * Run a region's declared FLOWS: seed, fire a declared output, check what the region holds.
 *
 * The executable form of a coupling. `wiring-live` proves a declared write reaches its key; this
 * proves the region ends up in the state the flow says it should — which is the difference between
 * "the wire is connected" and "answering a card raises the banner's number".
 *
 * Returns [{ scenario, step, ok, mismatches: [{ key, expected, actual }] }].
 */
export async function runRegionFlows({ id, port = 5199, scenarios = [] }) {
  const { chromium } = await import('playwright');
  // See probeWiring: the flows are where writes happen, so this is where a store complaint lands.
  const diagnostics = [];
  return onLagoonPage({ target: `archipelago:${id}`, port, viewport: { width: 1280, height: 900 }, diagnostics, view: 'mountpoints' }, async (page, server) => {
    await page.waitForFunction(() => !!window.__motuLagoon, null, { timeout: 15000 }).catch(() => {});
    await sleep(400);

    const out = [];
    for (const scenario of scenarios) {
      // A fresh mount per scenario. One flow CAN leave the region unrenderable — seed an index past the
      // end of a list and the component that reads it throws, React tears the tree down, and every
      // later flow reports "no island mounted under that slot", which is true and completely
      // misleading. Isolation keeps each verdict about its own flow.
      await page.evaluate(() => window.__motuLagoon?.remount?.());
      await sleep(250);
      for (const [index, step] of (scenario.steps ?? []).entries()) {
        const result = await page.evaluate(
          async ({ seed, step: st }) => {
            const lagoon = window.__motuLagoon;
            if (!lagoon || typeof lagoon.emit !== 'function') return { error: 'no emit seam on this mount path' };
            // A flow's `seed` is a SEED — the page establishing a starting value — even when the key
            // belongs to an island. Applying it as a host write made the harness trip motu's own
            // ownership guard on every produced key a flow starts from.
            for (const [k, v] of Object.entries(seed ?? {})) (lagoon.seed ?? lagoon.provide)(k, v);
            await new Promise((r) => setTimeout(r, 120));
            // Setup done. From here, a host write is a RESPONSE to what the island did.
            window.__motuSuspects?.reset?.();
            if (!lagoon.emit(st.emit.slot, st.emit.event, st.emit.detail)) {
              return { error: `no island mounted under slot "${st.emit.slot}"` };
            }
            await new Promise((r) => setTimeout(r, 120));
            const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
            const mismatches = Object.entries(st.expect ?? {})
              .map(([key, expected]) => ({ key, expected, actual: lagoon.read(key) }))
              .filter((m) => !same(m.expected, m.actual));
            // Did the region survive its own flow? A step that leaves nothing on screen has broken
            // something, even when every key it asserted holds the right value.
            const alive = document.querySelectorAll('[data-motu-slot]').length > 0;
            return { mismatches, alive };
          },
          { seed: scenario.seed ?? {}, step },
        );
        out.push({
          scenario: scenario.name ?? 'flow',
          step: index + 1,
          ok: !result.error && result.mismatches.length === 0 && result.alive !== false,
          error: result.error ?? (result.alive === false ? 'the region rendered nothing after this step' : null),
          mismatches: result.mismatches ?? [],
        });
      }
    }
    // One beat before reading: a host effect answering an island lands a tick later, and the last
    // step's assertion returns before it does.
    await sleep(300);
    // The smell, read after the flows have run: an island emitted, and the HOST answered by writing a
    // key some island reads. Declared ownership cannot see this — the declaration is consistent, it is
    // just not honest — so it is reported as a suspicion, never as a violation.
    const suspects = await page.evaluate(() => window.__motuSuspects?.list?.() ?? []).catch(() => []);
    return { flows: out, suspects, diagnostics };
  });
}

/**
 * Probe every wire a region DECLARES: fire each `writes` event and see whether its key moved.
 *
 * This is the contract test the archipelago can write for itself. Nothing is hand-scripted and nothing
 * touches the DOM — the harness can only emit what an island declares as an output, so the probe list
 * IS the declaration. What it catches is the failure types cannot: a wire that resolves, compiles and
 * never carries anything ("declared but never fired"), which is what a broken change looks like from
 * the outside.
 *
 * Returns [{ slot, event, key, moved }].
 */
export async function probeWiring({ id, port = 5199, islands = [] }) {
  const { chromium } = await import('playwright');
  // Diagnostics belong to the page that WRITES. The console check runs on a page that only mounts the
  // region, so anything the store says about a bad write — the ownership guard above all — was raised
  // where nobody was listening. Collect them here and hand them back with the results.
  const diagnostics = [];
  return onLagoonPage({ target: `archipelago:${id}`, port, viewport: { width: 1280, height: 900 }, diagnostics, view: 'mountpoints' }, async (page, server) => {
    await page.waitForFunction(() => !!window.__motuLagoon, null, { timeout: 15000 }).catch(() => {});
    await sleep(400);

    const results = [];
    for (const island of islands) {
      for (const [event, target] of Object.entries(island.writes ?? {})) {
        const keys = typeof target === 'string' ? [target] : Object.values(target);
        const fields = typeof target === 'string' ? null : Object.entries(target);
        const probe = await page.evaluate(
          ({ slot, event: ev, keys: ks, fields: fs }) => {
            const lagoon = window.__motuLagoon;
            if (!lagoon || typeof lagoon.emit !== 'function' || typeof lagoon.read !== 'function') {
              return { kind: 'no-seam' };
            }
            // A sentinel that keeps the SHAPE of what is there. The first version wrote a string over
            // the week's mission array, the island that renders it threw on `.filter`, React unmounted
            // the tree, and every island probed after that looked unmounted — the probe destroying the
            // page it was measuring. Different value, same type: enough to see the store move, safe
            // enough to leave the region standing.
            const nudge = (v) => {
              if (typeof v === 'number') return v + 1;
              if (typeof v === 'boolean') return !v;
              if (typeof v === 'string') return `${v}\u00b7probe`;
              if (Array.isArray(v)) return v.length ? v.slice(0, v.length - 1) : ['motu-probe'];
              if (v && typeof v === 'object') return { ...v };
              return 'motu-probe';
            };
            const read = () => ks.map((k) => lagoon.read(k));
            const before = read();
            const detail = fs
              ? Object.fromEntries(fs.map(([field, key]) => [field, nudge(lagoon.read(key))]))
              : nudge(lagoon.read(ks[0]));
            if (!lagoon.emit(slot, ev, detail)) return { kind: 'not-mounted' };
            const after = read();
            const rows = ks.map((k, i) => ({ key: k, moved: before[i] !== after[i] }));
            // Put the region back the way it was, so a later probe measures the page and not the wake
            // of this one.
            // Put it back as a SEED, not a host write: a rollback must not look like the host
            // reaching into a key an island owns (that is what the ownership guard is for).
            ks.forEach((k, i) => (lagoon.seed ?? lagoon.provide)(k, before[i]));
            return { kind: 'measured', rows };
          },
          { slot: island.slot, event, keys, fields },
        );
        if (probe.kind === 'measured') {
          for (const row of probe.rows) results.push({ slot: island.slot, event, ...row });
        } else {
          results.push({ slot: island.slot, event, key: keys.join(', '), moved: null, reason: probe.kind });
        }
      }
    }
    return { results, diagnostics };
  });
}

/**
 * Run axe against one island, in the lagoon, per scenario.
 *
 * Cheap because the browser is already open, and it catches the class of mistake that types cannot see
 * at all: a clickable div, a control with no accessible name, text that fails contrast. Scoped to the
 * island's own subtree — the lagoon's chrome is motu's, and an island should not fail for it.
 */
export async function axeLagoon({ tag, port = 5199, scenarios = [] }) {
  const { chromium } = await import('playwright');
  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url);
  const axeSource = readFileSync(require.resolve('axe-core'), 'utf8');
  return onLagoonPage({ target: `island:${tag}`, port, viewport: { width: 1280, height: 900 } }, async (page, server) => {
    const deadline = Date.now() + paintTimeout;
    while (Date.now() < deadline) {
      const ready = await page
        .evaluate((t) => {
          const el = window.__motuFindIsland(t);
          return !!el && (el.innerHTML || '').trim().length > 0;
        }, tag)
        .catch(() => false);
      if (ready) break;
      await sleep(250);
    }
    await page.addScriptTag({ content: axeSource });

    const findings = [];
    const list = scenarios.length ? scenarios : [{ name: 'default', seed: {} }];
    for (const scenario of list) {
      await page.evaluate((seed) => {
        const arch = document.querySelector('motu-archipelago');
        const provide =
          arch && typeof arch.provide === 'function'
            ? (k, v) => arch.provide(k, v)
            : window.__motuLagoon
              ? (k, v) => window.__motuLagoon.provide(k, v)
              : null;
        if (provide) for (const [k, v] of Object.entries(seed || {})) provide(k, v);
      }, scenario.seed ?? {});
      await sleep(250);
      const violations = await page.evaluate(async (t) => {
        const el = window.__motuFindIsland(t);
        if (!el) return [];
        // A `display: contents` wrapper is not a valid axe context; its painted content is.
        const target = el.getBoundingClientRect().height ? el : el.firstElementChild;
        if (!target) return [];
        const res = await window.axe.run(target, { resultTypes: ['violations'] });
        return res.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          help: v.help,
          nodes: v.nodes.length,
          // The first offender, so a finding says WHERE — a count alone sends you hunting.
          where: v.nodes[0]?.target?.join(' ') ?? '',
          html: (v.nodes[0]?.html ?? '').slice(0, 120),
        }));
      }, tag);
      for (const v of violations) findings.push({ scenario: scenario.name ?? 'default', ...v });
    }
    return findings;
  });
}

/**
 * Capture one island's rendered pixels, per scenario × viewport, in one browser.
 *
 * Same seams as everything else here: scenarios come from the island's declared evidence and are
 * driven through `provide()`, viewports from `lagoon.config.json`. Nothing accepts a selector or a
 * script — a capture can only put the island in a state the island itself declares, which is what
 * keeps this a harness rather than a second, untyped test suite.
 *
 * Returns [{ scenario, viewport, width, png }].
 */
export async function captureLagoon({ tag, port = 5199, scenarios = [], viewports = [] }) {
  const { chromium } = await import('playwright');
  return onLagoonPage({ target: `island:${tag}`, port, viewport: { width: viewports[0]?.width ?? 1280, height: 900 } }, async (page, server) => {

    const deadline = Date.now() + paintTimeout;
    while (Date.now() < deadline) {
      const ready = await page
        .evaluate((t) => {
          const el = window.__motuFindIsland(t);
          return !!el && (el.innerHTML || '').trim().length > 0;
        }, tag)
        .catch(() => false);
      if (ready) break;
      await sleep(250);
    }

    // Motion makes a baseline flap. Freeze it rather than sampling and hoping.
    await page.addStyleTag({
      content: '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}',
    });

    const shots = [];
    const list = scenarios.length ? scenarios : [{ name: 'default', seed: {} }];
    for (const scenario of list) {
      await page.evaluate((seed) => {
        const arch = document.querySelector('motu-archipelago');
        const provide =
          arch && typeof arch.provide === 'function'
            ? (k, v) => arch.provide(k, v)
            : window.__motuLagoon
              ? (k, v) => window.__motuLagoon.provide(k, v)
              : null;
        if (provide) for (const [k, v] of Object.entries(seed || {})) provide(k, v);
      }, scenario.seed ?? {});
      for (const vp of viewports) {
        await page.setViewportSize({ width: vp.width, height: 900 });
        await sleep(250);
        const handle = await page.evaluateHandle((t) => window.__motuFindIsland(t), tag);
        const el = handle.asElement();
        // A `display: contents` wrapper cannot be screenshotted; its first painted child can.
        const target = (await el?.evaluateHandle((n) => (n.getBoundingClientRect().height ? n : n.firstElementChild)))?.asElement();
        const png = target
          ? await target.screenshot({ animations: 'disabled' }).catch(() => null)
          : await page.screenshot({ animations: 'disabled' });
        if (png) shots.push({ scenario: scenario.name ?? 'default', viewport: vp.name, width: vp.width, png });
      }
    }
    return shots;
  });
}

/**
 * Render one island at each declared viewport and report what does not fit.
 *
 * The check nobody was running: motu knew `native | legacy` (footprint and skin) and nothing about
 * WIDTH, so "does this work on a phone" was a human dragging a window. One mount, resized — a browser
 * per width would triple the wall clock for the same answer.
 *
 * Horizontal overflow of the DOCUMENT is the signal, not of the island: a card that scrolls its own
 * table on purpose is fine; a page the member has to pan sideways is the bug this catches.
 */
export async function responsiveLagoon({ tag, port = 5199, viewports = [], scenarios = [] }) {
  return onLagoonPage(
    { target: `island:${tag}`, port, viewport: { width: viewports[0]?.width ?? 1280, height: 900 } },
    async (page) => {
    // Poll for a PAINTED island, not just a mounted one: Vite's first-run dep re-optimization reloads
    // the page, and an island that fetches its own data paints a frame later.
    const deadline = Date.now() + paintTimeout;
    while (Date.now() < deadline) {
      const ready = await page
        .evaluate((t) => {
          const el = window.__motuFindIsland(t);
          return !!el && (el.innerHTML || '').trim().length > 0;
        }, tag)
        .catch(() => false);
      if (ready) break;
      await sleep(250);
    }
    await sleep(250);

    const results = [];
    // Per SCENARIO, not just the default state: an island whose empty state is legitimately blank (a
    // notice with nothing to say) would otherwise be measured empty at every width and reported as
    // rendering nothing — a false alarm that teaches people to ignore the check.
    const list = scenarios.length ? scenarios : [{ name: 'default', seed: {} }];
    for (const scenario of list) {
    await page.evaluate((seed) => {
      const arch = document.querySelector('motu-archipelago');
      const provide =
        arch && typeof arch.provide === 'function'
          ? (k, v) => arch.provide(k, v)
          : window.__motuLagoon
            ? (k, v) => window.__motuLagoon.provide(k, v)
            : null;
      if (provide) for (const [k, v] of Object.entries(seed || {})) provide(k, v);
    }, scenario.seed ?? {});
    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: 900 });
      // Two beats: one for the resize to land, one for anything that re-measures on it.
      await sleep(200);
      const measured = await page.evaluate((t) => {
        // A React-mounted island's wrapper is `display: contents` — no box of its own — so measuring it
        // directly reports every island as blank. Fall back to what it rendered, the same way the seam
        // lens does for its outlines.
        const boxOf = (el) => {
          if (!el) return null;
          const own = el.getBoundingClientRect();
          if (own.width || own.height) return own;
          let l = Infinity, t2 = Infinity, r = -Infinity, b = -Infinity;
          for (const child of el.children) {
            const c = boxOf(child);
            if (!c || (!c.width && !c.height)) continue;
            l = Math.min(l, c.left); t2 = Math.min(t2, c.top);
            r = Math.max(r, c.right); b = Math.max(b, c.bottom);
          }
          return l === Infinity ? null : { left: l, top: t2, right: r, bottom: b, width: r - l, height: b - t2 };
        };
        const doc = document.documentElement;
        const rect = boxOf(window.__motuFindIsland(t));
        return {
          overflow: doc.scrollWidth - doc.clientWidth,
          rendered: !!rect && rect.width > 0 && rect.height > 0,
          height: rect ? Math.round(rect.height) : 0,
        };
      }, tag);
      results.push({ ...vp, scenario: scenario.name ?? 'default', ...measured });
    }
    }
    return results;
    },
  );
}

/**
 * Boot a whole archipelago in the real-browser lagoon and report every island slot it mounted. Returns
 * { ok, region, islands: [{ slot, tag, len }], diagnostics }. `ok` is true when the region rendered and
 * every declared slot MOUNTED its island element. Emptiness of content is NOT a failure — an island may
 * legitimately render nothing (e.g. filter chips with no active filter); a real mount throw is caught by
 * the diagnostics (console/pageerror) instead.
 */
export async function runArchipelagoLagoon({ id, port = 5199 }) {
  const { chromium } = await import('playwright');
  const diagnostics = [];
  return onLagoonPage({ target: `archipelago:${id}`, port, viewport: { width: 1200, height: 900 }, diagnostics }, async (page, server) => {

    let result = { region: false, islands: [] };
    const deadline = Date.now() + paintTimeout;
    while (Date.now() < deadline) {
      try {
        result = await page.evaluate(() => {
          const rendered = (el) => (el ? (el.shadowRoot ? el.shadowRoot.innerHTML : el.innerHTML) : '');
          const arch = document.querySelector('motu-archipelago');
          if (arch) {
            const root = arch.shadowRoot || arch;
            const islands = [...root.querySelectorAll('motu-island')].map((marker) => {
              const child = [...marker.children].find((c) => c.tagName.includes('-'));
              return {
                slot: marker.getAttribute('slot'),
                tag: child ? child.tagName.toLowerCase() : null,
                len: rendered(child || marker).length,
              };
            });
            return { region: true, islands };
          }
          // React mount path: no region element and no markers — islands render in the host's own
          // tree, each behind a wrapper carrying its slot and tag.
          if (window.__motuLagoon) {
            const islands = [...document.querySelectorAll('[data-motu-island]')].map((el) => ({
              slot: el.getAttribute('data-motu-slot'),
              tag: el.getAttribute('data-motu-island'),
              len: rendered(el).length,
            }));
            return { region: true, islands };
          }
          return { region: false, islands: [] };
        });
        // Ready once the region is up and every declared slot has mounted its island element.
        if (result.region && result.islands.length > 0 && result.islands.every((i) => i.tag)) break;
      } catch {
        // HMR/full reload destroyed the context — re-poll on the fresh one.
      }
      await sleep(200);
    }

    const rejections = await page.evaluate(() => window.__motuRejections || []).catch(() => []);
    for (const r of rejections) if (!NOISE.test(r)) diagnostics.push(r);

    const ok = result.region && result.islands.length > 0 && result.islands.every((i) => i.tag);
    return { ok, ...result, diagnostics };
  });
}

/**
 * Data-flow differentiation in the real-browser lagoon. Mounts the island once, then drives each
 * declared scenario's seed into the store via the archipelago's `provide()` seam (the same inbound
 * boundary the ocean uses) and captures the rendered output after each. Distinct inputs producing
 * distinct output prove data flows criteria -> contract -> render, not merely that the wiring exists.
 * Returns { differentiates, scenarioCount, mounted, diagnostics }.
 */
export async function differentiateLagoon({ tag, fit = 'native', port = 5199, scenarios = [] }) {
  const { chromium } = await import('playwright');
  const diagnostics = [];
  return onLagoonPage({ target: `island:${tag}`, fit, port, viewport: { width: 900, height: 720 }, diagnostics }, async (page, server) => {

    // Wait for the island to upgrade and paint.
    let mounted = false;
    const deadline = Date.now() + paintTimeout;
    while (Date.now() < deadline) {
      try {
        const r = await page.evaluate((t) => {
          const el = window.__motuFindIsland(t);
          return { mounted: !!el, len: window.__motuRendered(el).length };
        }, tag);
        if (r.mounted && r.len > 0) {
          mounted = true;
          break;
        }
      } catch {
        // context replaced by HMR — retry
      }
      await sleep(200);
    }
    if (!mounted) return { differentiates: null, scenarioCount: scenarios.length, mounted: false, diagnostics };

    // Drive each scenario's seed through the archipelago boundary and capture rendered output.
    const outputs = [];
    for (const scenario of scenarios) {
      await page.evaluate((seed) => {
        const arch = document.querySelector('motu-archipelago');
        // Either mount path exposes the same `provide` seam: the element on the custom-element path,
        // window.__motuLagoon on the React one.
        const provide =
          arch && typeof arch.provide === 'function'
            ? (k, v) => arch.provide(k, v)
            : window.__motuLagoon
              ? (k, v) => window.__motuLagoon.provide(k, v)
              : null;
        if (provide) for (const [k, v] of Object.entries(seed || {})) provide(k, v);
      }, scenario.seed ?? {});
      // Let the store write and bound props flow, then wait for the render to settle rather than
      // guessing at a fixed delay — a contract re-fetch can easily outlast one.
      await sleep(150);
      outputs.push(normalizeRender(await waitForStableRender(page, tag, { timeoutMs: 8000 })));
    }

    const rejections = await page.evaluate(() => window.__motuRejections || []).catch(() => []);
    for (const r of rejections) if (!NOISE.test(r)) diagnostics.push(r);

    const differentiates = outputs.every((o) => o.trim().length > 0) && new Set(outputs).size > 1;
    return { differentiates, scenarioCount: scenarios.length, mounted: true, diagnostics };
  });
}

/**
 * Record contract calls in the real-browser lagoon. Starts capturing as early as the runtime exposes
 * the recorder (before the island's mount self-fetch), drives each scenario's seed through the
 * archipelago's `provide()` seam, and returns every captured call (request + response). With
 * `transport: 'http'` this records the REAL backend; default (mock) records the mock's own responses
 * (a self-consistency check of the pipeline). Returns { calls, mounted, diagnostics }.
 */
export async function recordLagoon({ tag, fit = 'native', port = 5199, scenarios = [], transport }) {
  const { chromium } = await import('playwright');
  const diagnostics = [];
  return onLagoonPage({ target: `island:${tag}`, fit, port, transport, viewport: { width: 900, height: 720 }, diagnostics }, async (page, server) => {
    // Turn on recording the instant the runtime module exposes the hook — before the island's mount
    // self-fetch — so the default (first scenario) request is captured too. Also start the seed
    // recorder (@motu/core) to capture host-fed store writes (channels + provide()).
    await page.addInitScript(() => {
      const iv = setInterval(() => {
        if (window.__motuRecorder) {
          window.__motuRecorder.start();
          if (window.__motuSeedRecorder) window.__motuSeedRecorder.start();
          clearInterval(iv);
        }
      }, 0);
    });

    // Wait for the island to upgrade and paint (its mount fetch fires here).
    let mounted = false;
    const deadline = Date.now() + paintTimeout;
    while (Date.now() < deadline) {
      try {
        const r = await page.evaluate((t) => {
          const el = window.__motuFindIsland(t);
          return { mounted: !!el, len: window.__motuRendered(el).length };
        }, tag);
        if (r.mounted && r.len > 0) {
          mounted = true;
          break;
        }
      } catch {
        // context replaced by HMR — retry
      }
      await sleep(200);
    }

    // Drive each scenario so its request is issued and captured. To make it DETERMINISTIC (a scenario
    // equal to the current store — e.g. the empty default — wouldn't re-fetch on its own), first set
    // the scenario's keys to a unique sentinel, then to the real seed: the change always re-issues the
    // request. Sentinel calls are filtered out below.
    let reset = 0;
    const provide = (seed) =>
      page.evaluate((s) => {
        const arch = document.querySelector('motu-archipelago');
        if (arch && typeof arch.provide === 'function') {
          for (const [k, v] of Object.entries(s || {})) arch.provide(k, v);
        }
      }, seed);
    for (const scenario of scenarios) {
      const seed = scenario.seed ?? {};
      const sentinel = { __motuRecordReset: ++reset };
      await provide(Object.fromEntries(Object.keys(seed).map((k) => [k, sentinel])));
      await sleep(300);
      await provide(seed);
      await sleep(500);
    }
    await sleep(200);

    const raw = await page.evaluate(() => (window.__motuRecorder ? window.__motuRecorder.stop() : []));
    // Drop the sentinel-priming calls; keep the real scenario requests.
    const calls = (raw || []).filter((c) => !JSON.stringify(c.args).includes('__motuRecordReset'));
    // Host-fed store writes (channel + provide) captured as lagoon seed; drop sentinel-primed values.
    const rawSeed = await page.evaluate(() => (window.__motuSeedRecorder ? window.__motuSeedRecorder.stop() : []));
    const seedWrites = (rawSeed || []).filter((w) => !JSON.stringify(w.value).includes('__motuRecordReset'));

    const rejections = await page.evaluate(() => window.__motuRejections || []).catch(() => []);
    for (const r of rejections) if (!NOISE.test(r)) diagnostics.push(r);

    return { calls, seedWrites, mounted, diagnostics };
  });
}

/**
 * Record per-mountpoint "callsite frames" from the LIVE embedded ocean. Opens a headed, PERSISTENT
 * browser (so a human logs in once + navigates to the page where the archipelago's islands render),
 * waits for <motu-island slot> to appear, then measures each island's REPLACED CONTAINER (the ocean
 * box it lands in): content width, padding, background, and inherited typography. Replayed offline by
 * the lagoon's mountpoint gallery so a framed cell mimics the real callsite. Returns [{ slot, … }].
 */
export async function recordFrames({ url, headed = true, userDataDir, timeoutMs = 180000 }) {
  const { chromium } = await import('playwright');
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: !headed,
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true, // the console dev cert is self-signed
  });
  try {
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => {});
    process.stdout.write(
      color.dim(`\nOpened ${url}. Log in if prompted and navigate to the page where the islands render.\n` +
        `Waiting for <motu-island slot> to appear (up to ${Math.round(timeoutMs / 1000)}s)…\n`),
    );

    const deadline = Date.now() + timeoutMs;
    let found = false;
    while (Date.now() < deadline) {
      found = await page.evaluate(() => !!document.querySelector('motu-island[slot]')).catch(() => false);
      if (found) break;
      await sleep(1000);
    }
    if (!found) throw new Error('no <motu-island slot> appeared before the timeout');

    // Give the ocean a beat to finish laying out (fonts, async region) before measuring.
    await sleep(600);
    return await page.evaluate(() => {
      const num = (v) => parseFloat(v) || 0;
      const seen = new Set();
      const out = [];
      for (const el of document.querySelectorAll('motu-island[slot]')) {
        const slot = el.getAttribute('slot');
        if (!slot || seen.has(slot)) continue;
        const container = el.parentElement;
        if (!container) continue;
        seen.add(slot);
        const cs = getComputedStyle(container);
        out.push({
          slot,
          // The container's CONTENT width — what the island actually gets to fill.
          width: Math.round(container.clientWidth - num(cs.paddingLeft) - num(cs.paddingRight)),
          padding: [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft].join(' '),
          background: cs.backgroundColor,
          color: cs.color,
          fontFamily: cs.fontFamily,
          fontSize: cs.fontSize,
          lineHeight: cs.lineHeight,
        });
      }
      return out;
    });
  } finally {
    await context.close();
  }
}

// Direct invocation: screenshot helper for a manual dry-run.
if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , tag, fit = 'native', screenshotPath] = process.argv;
  runLagoon({ tag, fit, screenshotPath })
    .then((r) => {
      process.stdout.write(JSON.stringify(r) + '\n');
      process.exit(r.ok ? 0 : 1);
    })
    .catch((err) => {
      process.stderr.write(`playwright-lagoon: ${err?.stack || err}\n`);
      process.exit(3);
    });
}
