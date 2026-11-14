// The browser the camera sees: your Chrome, a throwaway profile (no tabs, bookmarks or extensions),
// driven by Playwright. It lives FULLSCREEN over the terminal; `hide()` minimises it to reveal the
// terminal and `reveal()` brings it back — the cut between the two halves of the film.
import path from 'node:path';
import { chromium } from 'playwright-core';
import { FILM, APP, MEMBER_ID, SESSION_KEY } from '../config.mjs';

export async function openBrowser() {
  const context = await chromium.launchPersistentContext(path.join(FILM, '.chrome-profile'), {
    channel: 'chrome',
    headless: false,
    viewport: null, // the page is the window
    args: [
      '--ozone-platform=x11', // XWayland: window state (fullscreen/minimise) is scriptable there
      '--kiosk', // fullscreen with no "press Esc to exit" bubble
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-infobars',
      '--hide-crash-restore-bubble',
      '--force-device-scale-factor=1.25', // bigger UI on a 1080p screen: reads well once encoded
    ],
    // No "controlled by automated software" bar, and no "unsupported flag: --no-sandbox" bar.
    ignoreDefaultArgs: ['--enable-automation', '--no-sandbox'],
  });
  const page = context.pages()[0] ?? (await context.newPage());

  // Signed in as Dennis before the first app page loads.
  await context.addInitScript(([key, id]) => {
    try { if (location.origin.includes('5300')) localStorage.setItem(key, id); } catch {}
  }, [SESSION_KEY, MEMBER_ID]);

  const cdp = await context.newCDPSession(page);
  const { windowId } = await cdp.send('Browser.getWindowForTarget');
  // State changes are asynchronous in the window manager, and Chrome refuses fullscreen ↔ minimised
  // directly: every change goes through `normal`, and each one is waited for before the next.
  const setState = async (windowState) => {
    await cdp.send('Browser.setWindowBounds', { windowId, bounds: { windowState } });
    for (let i = 0; i < 40; i++) {
      const { bounds } = await cdp.send('Browser.getWindowBounds', { windowId });
      if (bounds.windowState === windowState) return;
      await new Promise((r) => setTimeout(r, 50));
    }
  };

  return {
    page,
    context,
    // Chrome refuses to minimise a fullscreen window directly: back to normal first.
    async hide() { await setState('normal'); await setState('minimized'); },
    async reveal() { await setState('normal'); await setState('fullscreen'); await page.bringToFront(); },
    async go(url, settleMs = 1200) {
      // 'load', not 'networkidle': Vite's HMR socket keeps the network busy, so idle never comes.
      await page.goto(url, { waitUntil: 'load', timeout: 15_000 }).catch(() => {});
      await page.waitForTimeout(settleMs);
    },
    /** Scrolls the element (or the page) smoothly over `ms`. */
    async glide(selector, dy, ms) {
      await page.evaluate(([sel, dy, ms]) => new Promise((done) => {
        const el = (sel && document.querySelector(sel)) || document.scrollingElement;
        const y0 = el.scrollTop, t0 = performance.now();
        const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
        const step = (now) => {
          const t = Math.min(1, (now - t0) / ms);
          el.scrollTop = y0 + dy * ease(t);
          t < 1 ? requestAnimationFrame(step) : done();
        };
        requestAnimationFrame(step);
      }), [selector, dy, ms]);
    },
    close: () => context.close(),
  };
}

export const appMember = () => `${APP}/member/${MEMBER_ID}`;
