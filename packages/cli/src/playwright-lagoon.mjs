// Real-browser lagoon check. Boots the focused lagoon (the configured lagoon root via Vite,
// MOTU_TARGET=island:<tag>) and drives it with Playwright/Chromium, so verification exercises real
// layout, CSS and paint — not just an in-process DOM. Exposes runLagoon() for `motu island verify`;
// also runnable directly for a screenshot: `node --import tsx playwright-lagoon.mjs <tag> <fit> [screenshotPath]`.
import { spawn } from 'node:child_process';
import { createConnection } from 'node:net';
import { setTimeout as sleep } from 'node:timers/promises';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { REPO_ROOT, paths, color, VITE_BIN } from './lib/util.mjs';

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
  if (!existsSync(VITE_BIN)) {
    throw new Error(
      `vite not found — the lagoon is a Vite app. Searched node_modules from ${paths.rel(LAGOON_DIR)} ` +
        `up to the filesystem root, and the motu checkout. Install dependencies in the project ` +
        `(${paths.rel(REPO_ROOT)}) first.`,
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

/** Start the lagoon Vite dev server focused on one target ("island:x-…" | "archipelago:id"). */
async function startLagoon({ target, fit = 'native', port, forceError, transport }) {
  assertLagoonBootable();
  // Spawn vite DIRECTLY (not via `pnpm exec`) in its own process group: a pnpm wrapper would spawn
  // vite as a grandchild that gets orphaned on kill and keeps holding the strict port, so a later run
  // would connect to the stale server. `detached: true` lets us SIGKILL the whole group in stop().
  const child = spawn(
    process.execPath,
    [VITE_BIN, '--port', String(port), '--strictPort', '--clearScreen', 'false'],
    {
      cwd: LAGOON_DIR,
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

/** Kill the vite process group started by startLagoon. */
function stopLagoon(child) {
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
    if (msg.type() === 'error' && !NOISE.test(msg.text())) diagnostics.push(`console.error: ${msg.text()}`);
  });
  page.on('pageerror', (err) => {
    const m = String(err?.message || err);
    if (!NOISE.test(m)) diagnostics.push(`pageerror: ${m}`);
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
async function waitForStableRender(page, tag, { timeoutMs = 15000, quietSamples = 3, intervalMs = 120 } = {}) {
  const deadline = Date.now() + timeoutMs;
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
    }
    if (html && html === last) {
      if (++stable >= quietSamples) return html;
    } else {
      stable = 0;
      last = html || null;
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
  const server = await startLagoon({ target: `island:${tag}`, fit, port, forceError });
  let browser;
  const diagnostics = [];
  try {
    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 900, height: 720 } });
    await setupPageDiagnostics(page, diagnostics);
    await page.goto(`http://localhost:${port}/lagoon.html`, { waitUntil: 'load' });

    // Poll the DOM until the island upgrades and paints. This is a retry loop rather than a single
    // waitForFunction because Vite's first-run dep re-optimization can trigger a full page reload that
    // destroys the execution context mid-check — we simply re-poll on the new one.
    let result = { mounted: false, shadowLength: 0 };
    const deadline = Date.now() + 15000;
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
  } finally {
    if (browser) await browser.close();
    stopLagoon(server);
    // Give the OS a beat to release the strict port before the next fit runs.
    await sleep(200);
  }
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
 * Boot a whole archipelago in the real-browser lagoon and report every island slot it mounted. Returns
 * { ok, region, islands: [{ slot, tag, len }], diagnostics }. `ok` is true when the region rendered and
 * every declared slot MOUNTED its island element. Emptiness of content is NOT a failure — an island may
 * legitimately render nothing (e.g. filter chips with no active filter); a real mount throw is caught by
 * the diagnostics (console/pageerror) instead.
 */
export async function runArchipelagoLagoon({ id, port = 5199 }) {
  const { chromium } = await import('playwright');
  const server = await startLagoon({ target: `archipelago:${id}`, port });
  let browser;
  const diagnostics = [];
  try {
    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    await setupPageDiagnostics(page, diagnostics);
    await page.goto(`http://localhost:${port}/lagoon.html`, { waitUntil: 'load' });

    let result = { region: false, islands: [] };
    const deadline = Date.now() + 15000;
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
  } finally {
    if (browser) await browser.close();
    stopLagoon(server);
    await sleep(200);
  }
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
  const server = await startLagoon({ target: `island:${tag}`, fit, port });
  let browser;
  const diagnostics = [];
  try {
    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 900, height: 720 } });
    await setupPageDiagnostics(page, diagnostics);
    await page.goto(`http://localhost:${port}/lagoon.html`, { waitUntil: 'load' });

    // Wait for the island to upgrade and paint.
    let mounted = false;
    const deadline = Date.now() + 15000;
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
  } finally {
    if (browser) await browser.close();
    stopLagoon(server);
    await sleep(200);
  }
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
  const server = await startLagoon({ target: `island:${tag}`, fit, port, transport });
  let browser;
  const diagnostics = [];
  try {
    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 900, height: 720 } });
    await setupPageDiagnostics(page, diagnostics);
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
    await page.goto(`http://localhost:${port}/lagoon.html`, { waitUntil: 'load' });

    // Wait for the island to upgrade and paint (its mount fetch fires here).
    let mounted = false;
    const deadline = Date.now() + 15000;
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
  } finally {
    if (browser) await browser.close();
    stopLagoon(server);
    await sleep(200);
  }
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
