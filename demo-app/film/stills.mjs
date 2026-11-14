// The README's lagoon images, regenerated from the running lagoon — rerun when the UI changes.
//
//   node stills.mjs            (lagoon at FILM_LAGOON, default http://localhost:8817)
//
// Headless: nothing opens on screen. Each image is a real state ADDRESS, opened and waited for until
// the lagoon itself reports that state applied (window.__motuLagoonState) — never a timed guess.
//
//   assets/readme/lagoon-state.webp   one address: the booking flow at its last step, panel open
//   assets/readme/lagoon-flow.webp    the same flow sailing step 1 → 2 → 3, looping (GitHub
//                                     autoplays images, not videos)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright-core';
import { LAGOON, REPO, FILM } from './config.mjs';

const FLOW = 'picking-a-day-then-a-time-is-confirmed-by-the-summary';
const STEPS = 3;
const OUT = path.join(REPO, 'assets/readme');
const TMP = fs.mkdtempSync(path.join(FILM, 'takes', '.stills-'));
const VIEW = { width: 1440, height: 860 };

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: VIEW, deviceScaleFactor: 1.5 });

// panel: open and PINNED beside the page (the page reflows, nothing hidden under it) — for the still.
// No panel for the loop: the panel describes the whole flow, the loop is about the page changing.
async function open(step, { panel }) {
  const url = `${LAGOON}/?region=profile&flow=${FLOW}&step=${step}`;
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction((n) => window.__motuLagoonState?.ok && window.__motuLagoonState.applied === n, step, { timeout: 20_000 });
  if (panel) {
    await page.getByRole('button', { name: /^Lagoon controls/ }).click();
    await page.waitForTimeout(700);
    await page.getByRole('button', { name: 'Pin the panel beside the page' }).click();
  }
  await page.waitForTimeout(1500); // layout and the panel's boat settle
  const state = await page.evaluate(() => window.__motuLagoonState);
  const file = path.join(TMP, `step-${step}${panel ? '-panel' : ''}.png`);
  // The loop is cropped to the page's content — the calendar, the times, the summary.
  await page.screenshot({ path: file, clip: panel ? undefined : { x: 0, y: 0, width: VIEW.width - 46, height: 620 } });
  console.log(`step ${step}${panel ? ' (panel)' : ''}: ${state.name} · ${state.applied}/${state.of}`);
  return file;
}

const frames = [];
for (let s = 1; s <= STEPS; s++) frames.push(await open(s, { panel: false }));
const still = await open(STEPS, { panel: true });
await browser.close();

const ff = (args) => execFileSync('ffmpeg', ['-y', '-v', 'error', ...args], { stdio: 'inherit' });
const W = 1280; // README column width is ~900 px; 1280 stays sharp on high-density screens

// The address, still.
ff(['-i', still, '-vf', `scale=${W}:-2`, '-c:v', 'libwebp', '-quality', '88', path.join(OUT, 'lagoon-state.webp')]);

// The flow, looping: each step held (the last one longer), as one input per frame with its duration.
const hold = [1.6, 1.6, 2.8];
ff([
  ...frames.flatMap((f, i) => ['-loop', '1', '-t', String(hold[i]), '-i', f]),
  '-filter_complex', `${frames.map((_, i) => `[${i}]`).join('')}concat=n=${frames.length}:v=1,scale=${W}:-2,fps=5`,
  '-c:v', 'libwebp_anim', '-loop', '0', '-quality', '80', path.join(OUT, 'lagoon-flow.webp'),
]);

fs.rmSync(TMP, { recursive: true, force: true });
for (const f of ['lagoon-state.webp', 'lagoon-flow.webp']) {
  console.log(`${path.join('assets/readme', f)} — ${(fs.statSync(path.join(OUT, f)).size / 1024).toFixed(0)} KB`);
}
