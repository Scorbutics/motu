// Real-browser lagoon check. Boots the focused lagoon (the configured lagoon root via Vite,
// MOTU_TARGET=island:<tag>) and drives it with Playwright/Chromium, so verification exercises real
// layout, CSS and paint — not just an in-process DOM. Exposes runLagoon() for `motu island verify`;
// also runnable directly for a screenshot: `node --import tsx playwright-lagoon.mjs <tag> <fit> [screenshotPath]`.
import { spawn } from 'node:child_process';
import { createConnection } from 'node:net';
import { setTimeout as sleep } from 'node:timers/promises';
import { resolve } from 'node:path';
import { REPO_ROOT, paths, color } from './lib/util.mjs';

const VITE_BIN = resolve(REPO_ROOT, 'node_modules/vite/bin/vite.js');
const LAGOON_DIR = paths.lagoonDir;

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
      const parent = el.parentNode;
      const clone = el.cloneNode(false); // attributes only — a genuinely fresh element, no shadow
      parent.removeChild(el); // disconnectedCallback -> __motuDispose
      parent.appendChild(clone); // connectedCallback -> fresh mount
      return html;
    }, tag);
    if (before == null) return null;

    let after = '';
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      after = await page.evaluate((t) => window.__motuRendered(window.__motuFindIsland(t)), tag).catch(() => '');
      if (after && after.length > 0) break;
      await sleep(150);
    }
    return after === before;
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
          const arch = document.querySelector('motu-archipelago');
          if (!arch) return { region: false, islands: [] };
          const root = arch.shadowRoot || arch;
          const rendered = (el) => (el ? (el.shadowRoot ? el.shadowRoot.innerHTML : el.innerHTML) : '');
          const islands = [...root.querySelectorAll('motu-island')].map((marker) => {
            const child = [...marker.children].find((c) => c.tagName.includes('-'));
            return {
              slot: marker.getAttribute('slot'),
              tag: child ? child.tagName.toLowerCase() : null,
              len: rendered(child || marker).length,
            };
          });
          return { region: true, islands };
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
        if (arch && typeof arch.provide === 'function') {
          for (const [k, v] of Object.entries(seed || {})) arch.provide(k, v);
        }
      }, scenario.seed ?? {});
      // Let the store write, bound props flow, the contract re-fetch and React re-render settle.
      await sleep(500);
      const html = await page
        .evaluate((t) => window.__motuRendered(window.__motuFindIsland(t)), tag)
        .catch(() => '');
      outputs.push(html);
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
