// The take. Runs in the tmux window `ctl` (lib/up.mjs puts it there), never on camera.
//
// It films what can be scripted exactly — the lagoon, the app, the checks, the deliberate failure —
// and waits through the one thing that cannot: the agents building the calendar. Every scene start
// is written to takes/<take>/markers.json on the RECORDING's clock, which is what the edit cuts on.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import {
  REPO, LAGOON, APP, STUDIO, PROMPT, ARCHIPELAGO, USERS_ARCHIPELAGO, TMUX, IDLE_MS, TAKES,
} from './config.mjs';
import { connectObs } from './lib/obs.mjs';
import { openBrowser, appMember } from './lib/browser.mjs';
import { tmux, show, type, enter, run, capture, clear, sleep } from './lib/tmux.mjs';

const STAGE = `${TMUX}:stage.0`;
const SHELL = `${TMUX}:shell.0`;
const CUE = path.join(TAKES, '.cue');
const log = (...a) => console.log(`\x1b[2m${new Date().toISOString().slice(11, 19)}\x1b[0m`, ...a);
// Island entries only (`planned: true,` on its own line) — the header comment mentions the flag too.
// A git merge REPLACES the file, so a read can land in the instant it is missing: that is "unknown"
// (null), never a crash — take 1 died on exactly that.
const planned = () => {
  try { return (fs.readFileSync(ARCHIPELAGO, 'utf8').match(/^\s*planned:\s*true,/gm) ?? []).length; }
  catch { return null; }
};
const branch = () => execFileSync('git', ['-C', REPO, 'branch', '--show-current'], { encoding: 'utf8' }).trim();
// FILM_DRY=1: a dress rehearsal. Every scene runs and is recorded, but the prompt is typed and NOT
// sent, and the build is skipped — no agent runs, nothing is built, any branch will do.
const DRY = process.env.FILM_DRY === '1';
// FILM_RESUME=1: a take stopped mid-build. Records a SECOND part into the same take, starting at the
// build (Claude still working in the stage window), then every scene after it. prepare-edit joins
// the parts; inside a 60× timelapse the gap does not show.
// FILM_RESUME=lagoon: the build is over too — records a THIRD part, from the lagoon scene to the end.
const RESUME = process.env.FILM_RESUME === '1' ? 'build' : (process.env.FILM_RESUME || null);
const PART = { build: 2, lagoon: 3 }[RESUME] ?? 1;
const DESKTOP_W = 1200; // CSS px each half of the side-by-side renders at, before scaling down

// ── preflight: everything that would ruin a take is checked before the camera rolls ───────────────
async function preflight() {
  const problems = [];
  const b = branch();
  if (!DRY && !b.startsWith('film/take-')) problems.push(`on branch "${b}" — start a take first: pnpm take:new`);
  if (!RESUME && planned() !== 3) problems.push(`profile.archipelago.ts has ${planned()} planned island(s), expected 3 — reset the take: pnpm take:reset`);
  for (const [name, url] of [['lagoon', LAGOON], ['app', APP]]) {
    try { await fetch(url); } catch { problems.push(`${name} not reachable at ${url}`); }
  }
  try { execFileSync('git', ['-C', REPO, 'diff', '--quiet', '--', USERS_ARCHIPELAGO]); }
  catch { problems.push('users.archipelago.ts has local changes — the failure scene edits it'); }
  return { take: DRY ? `dry-${Date.now()}` : b.replace('film/', ''), problems };
}

// ── the lagoon panel lives in a shadow root; Playwright's CSS pierces it ──────────────────────────
async function openPanel(page) {
  const fold = page.getByRole('button', { name: /^Lagoon controls/ });
  if (await fold.isVisible().catch(() => false)) await fold.click();
  await page.waitForTimeout(700);
}

/** Clicks a flow in the panel: the lagoon sails it to its last step itself (the boat animation). */
async function sail(page, trackLocator, settleMs = 4000) {
  await trackLocator.click();
  await page.waitForTimeout(settleMs);
  return page.evaluate(() => ({ url: location.search, state: window.__motuLagoonState }));
}

/**
 * The profile flow to film, as its step addresses — asked of motu, not guessed. A screen view drops
 * `&step`, so steps are opened in the REGION view, where every step is its own URL.
 * Picks the flow whose name says the most about days, slots and the summary.
 */
function profileFlowSteps() {
  const out = execFileSync('motu', ['lagoon', 'states', 'profile'], { cwd: REPO, encoding: 'utf8' }).replace(/\x1b\[[0-9;]*m/g, '');
  // Two kinds of line: the flow's address, and "<title> · N step(s), &step=<n> stops earlier".
  const slugs = [...out.matchAll(/\/\?region=profile&flow=([\w-]+)/g)].map((m) => m[1]);
  const stepsOf = new Map();
  for (const m of out.matchAll(/^\s*(.+?) · (\d+) step\(s\)/gm)) {
    stepsOf.set(m[1].toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), Number(m[2]));
  }
  const best = slugs
    .filter((slug) => !/renders-its-own-island/.test(slug))
    .map((slug) => ({ slug, n: stepsOf.get(slug) ?? 1, score: (slug.match(/day|slot|summary|book|pick|confirm/g) ?? []).length }))
    .filter((f) => f.score > 0)
    .sort((a, b) => b.score - a.score || b.n - a.n)[0];
  if (!best) return null;
  const base = `${LAGOON}/?region=profile&flow=${best.slug}`;
  return { slug: best.slug, urls: Array.from({ length: best.n }, (_, i) => `${base}&step=${i + 1}`) };
}

/** Best effort: the first enabled button inside whatever the agents named the day / slot pickers. */
async function clickIn(page, words) {
  for (const frame of page.frames()) {
    for (const w of words) {
      const btn = frame.locator(`x-${w} button:not([disabled]), [class*="${w}"] button:not([disabled]), [data-slot="${w}"] button:not([disabled])`).first();
      if (await btn.isVisible({ timeout: 300 }).catch(() => false)) {
        await btn.click().catch(() => {});
        return true;
      }
    }
  }
  return false;
}

/** Serves one HTML page on a free localhost port. */
async function serveOnce(html) {
  const srv = http.createServer((_q, r) => { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(html); });
  await new Promise((done) => srv.listen(0, '127.0.0.1', done));
  return { url: `http://localhost:${srv.address().port}/`, close: () => srv.close() };
}

async function main() {
  const { take, problems } = await preflight();
  if (problems.length) {
    console.log('\x1b[31mNot rolling:\x1b[0m\n  ' + problems.join('\n  '));
    process.exit(1);
  }
  const dir = path.join(TAKES, take);
  fs.mkdirSync(dir, { recursive: true });
  fs.rmSync(CUE, { force: true });

  const obs = await connectObs();
  log(`take ${take} — OBS connected, recording to ${dir}`);
  if (!RESUME) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    await rl.question('\nEverything is ready. Press Enter to roll (the browser goes fullscreen first)… ');
    rl.close();
  }

  const browser = await openBrowser();
  const { page } = browser;
  await browser.go(`${LAGOON}/?screen=home`, 2000);
  if (RESUME) { await browser.hide(); show('stage'); tmux('select-pane', '-t', STAGE); }
  else await browser.reveal();
  await sleep(1500);

  await obs.setDir(dir);
  await obs.start();
  const markers = [];
  const mark = async (id, extra = {}) => { markers.push({ id, t: await obs.now(), ...extra }); log('●', id); };
  const markersFile = path.join(dir, PART === 1 ? 'markers.json' : `markers.part${PART}.json`);
  const save = (extra = {}) => fs.writeFileSync(markersFile, JSON.stringify({ take, prompt: PROMPT, part: PART, markers, ...extra }, null, 2));

  try {
   if (!RESUME) {
    // 1 · WALL — the lagoon: the whole app, no backend, and a flow sailing through its states.
    await mark('wall');
    await sleep(2500);
    await openPanel(page);
    await sleep(1500);
    const flow = page.locator('.track').filter({ hasText: /acting as another member/ }).first();
    const wallStates = await sail(page, flow).catch(() => null);
    for (const s of ['events', 'directory']) {
      await browser.go(`${LAGOON}/?screen=${s}`, 2200);
    }
    await mark('wall-end', { states: wallStates });

    // 2 · REAL — the same app on a real Postgres, then the 240 rows in Studio.
    await mark('real');
    await browser.go(`${APP}/me`, 3000);
    await browser.go(`${STUDIO}/project/default/editor`, 2500);
    await page.getByText('members', { exact: true }).first().click({ timeout: 4000 }).catch(() => log('studio: no members link, skipped'));
    await sleep(3500);

    // 3 · DECLARED — the profile page names three islands that do not exist yet.
    await mark('declared');
    await browser.go(appMember(), 4500);

    // 4 · PROMPT — cut to the terminal and ask for it.
    await browser.hide();
    show('stage');
    tmux('select-pane', '-t', STAGE);
    await sleep(2000);
    await mark('prompt');
    await type(STAGE, PROMPT, { cps: 20 });
    await sleep(2200);
    if (DRY) tmux('send-keys', '-t', STAGE, 'C-u'); // rehearsal: wipe it instead of sending it
    else enter(STAGE);
   }

    // 5 · BUILD — the part nobody scripts. Done when nothing is planned any more and Claude has been
    // still for IDLE_MS, or when you press F9.
   if (RESUME !== 'lagoon') {
    await mark(RESUME ? 'build-resume' : 'build');
    let lastHash = '', stillSince = Date.now(), asked = false;
    if (DRY) await sleep(6000);
    else for (;;) {
      await sleep(2000);
      if (fs.existsSync(CUE)) { log('cue (F9)'); break; }
      const pane = capture(STAGE);
      if (/Do you want to|Allow .* \?|❯ 1\. Yes/.test(pane)) {
        if (!asked) log('\x1b[33mClaude is asking for permission — answer it in the stage window\x1b[0m');
        asked = true; stillSince = Date.now(); continue;
      }
      asked = false;
      if (pane !== lastHash) { lastHash = pane; stillSince = Date.now(); }
      if (planned() === 0 && Date.now() - stillSince > IDLE_MS) { log('built and idle'); break; }
    }
    fs.rmSync(CUE, { force: true });
    await mark('built', { planned: planned() });
    save();
   }

    // 6 · LAGOON — the member screen the calendar now fills, then the agents' flow, one step address
    // at a time: pick a day, pick a slot, the summary confirms it.
    // Asked BEFORE the cut: `motu lagoon states` takes ~30 s, which on camera is a frozen frame.
    const flowSteps = (() => { try { return profileFlowSteps(); } catch (e) { log('lagoon states failed:', e.message); return null; } })();
    if (!flowSteps) log('no profile flow names a day/slot/summary — the lagoon scene shows the screen only');
    await browser.go(`${LAGOON}/?screen=member`, 2000);
    await browser.reveal();
    await mark('lagoon');
    await sleep(3500);
    for (const url of flowSteps?.urls ?? []) {
      await browser.go(url, 600);
      await openPanel(page);
      await mark('step', { url: url.replace(LAGOON, ''), state: await page.evaluate(() => window.__motuLagoonState) });
      await sleep(3200);
    }
    await mark('lagoon-end', { flow: flowSteps?.slug });

    // 7 · CHECKS — the verdicts, in the shell.
    await browser.hide();
    show('shell');
    clear(SHELL);
    await sleep(1200);
    await mark('checks');
    await run(SHELL, 'motu check', { timeoutMs: 120_000 });
    await sleep(2500);
    await run(SHELL, 'motu integrate check', { timeoutMs: 60_000 });
    await sleep(3000);

    // 8 · FAILURE — a second island claims a key someone already owns. One line; red.
    clear(SHELL);
    await mark('failure');
    const original = fs.readFileSync(USERS_ARCHIPELAGO, 'utf8');
    try {
      await sleep(800);
      fs.writeFileSync(USERS_ARCHIPELAGO, original.replace(
        "element: 'x-member-card',",
        "element: 'x-member-card',\n      writes: { 'member-draft': 'draft' },",
      ));
      await run(SHELL, 'git diff demo-app/src/archipelagos/users', { timeoutMs: 10_000 });
      await sleep(3500);
      clear(SHELL);
      await run(SHELL, 'motu archipelago verify users', { timeoutMs: 60_000 });
      // The error is near the top; the warnings after it scroll it away. Search back to it.
      tmux('copy-mode', '-t', SHELL);
      tmux('send-keys', '-t', SHELL, '-X', 'search-backward', '✗ ownership');
      await mark('failure-red');
      await sleep(5000);
      tmux('send-keys', '-t', SHELL, '-X', 'cancel');
    } finally {
      fs.writeFileSync(USERS_ARCHIPELAGO, original);
    }
    clear(SHELL);
    await run(SHELL, 'motu archipelago verify users', { timeoutMs: 60_000 });
    await sleep(2500);
    await mark('failure-end');

    // 9 · SAME — the lagoon and the app, side by side: same component, different answers.
    // Served from localhost, NOT set as about:blank content: an opaque parent makes both frames
    // third-party, Chrome denies them localStorage, and the lagoon does not boot. localhost on any
    // port is the same site as :8817 and :5300.
    const sideBySide = await serveOnce(`<!doctype html><style>
      html,body{margin:0;height:100%;background:#e9e1cf;font:600 14px system-ui}
      .row{display:flex;height:100%;gap:10px;padding:10px;box-sizing:border-box}
      .col{flex:1;display:flex;flex-direction:column;gap:6px;min-width:0}
      .tag{color:#3b3f5c;letter-spacing:.08em;text-transform:uppercase}
      .frame{flex:1;position:relative;overflow:hidden;border-radius:8px;background:#fff}
      /* Each page renders at DESKTOP width and is scaled into its half — at half width both would
         fall back to their narrow layout, which is not the page anyone uses. */
      iframe{position:absolute;top:0;left:0;width:${DESKTOP_W}px;border:0;transform-origin:0 0}
      </style><div class="row">
      <div class="col"><div class="tag">Lagoon · recorded fixtures, no backend</div><div class="frame"><iframe src="${LAGOON}/?screen=member"></iframe></div></div>
      <div class="col"><div class="tag">App · live Postgres</div><div class="frame"><iframe src="${appMember()}"></iframe></div></div>
      </div><script>
      const fit = () => document.querySelectorAll('.frame').forEach((f) => {
        const s = f.clientWidth / ${DESKTOP_W}, i = f.querySelector('iframe');
        i.style.transform = 'scale(' + s + ')';
        i.style.height = (f.clientHeight / s) + 'px';
      });
      addEventListener('resize', fit); fit();
      </script>`);
    await browser.go(sideBySide.url, 500);
    await browser.reveal();
    await sleep(4000);
    await mark('same');
    await sleep(2500);
    const day = await clickIn(page, ['calendar-days', 'days']);
    await sleep(1800);
    const slot = await clickIn(page, ['calendar-slots', 'slots']);
    await sleep(4500);
    await mark('end', { clickedDay: day, clickedSlot: slot });
    sideBySide.close();
  } catch (e) {
    log('\x1b[31mscene failed:\x1b[0m', e.message);
    await mark('error', { message: e.message });
  } finally {
    const file = await obs.stop().catch(() => null);
    save({ recording: file });
    await obs.disconnect();
    await browser.close().catch(() => {});
    show('ctl');
    log(`saved ${markersFile}${file ? `\n  recording: ${file}` : ''}`);
    log('next: pnpm take:keep (commit the build) · pnpm prepare-edit ' + take);
  }
}

main();
