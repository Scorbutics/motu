import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('console', (msg) => { if (msg.type() === 'error') console.log('[console-error]', msg.text().slice(0, 300)); });
page.on('pageerror', (err) => console.log('[pageerror]', err.message));

await page.goto('http://127.0.0.1:8933/?target=island:x-challenges-panel', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);
const scenarios = await page.evaluate(() => window.__motuLagoonStates?.scenarios?.['x-challenges-panel'] ?? []);
console.log('scenarios:', JSON.stringify(scenarios.map(s => s.name)));

for (const s of scenarios) {
  await page.evaluate((name) => window.__motuLagoonControl.openScenario(name), s.name);
  await page.waitForTimeout(1200);
  const text = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 300));
  const state = await page.evaluate(() => window.__motuLagoonState);
  console.log('---', s.name);
  console.log('  state:', JSON.stringify(state));
  console.log('  text:', text);
}
await browser.close();
