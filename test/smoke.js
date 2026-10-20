#!/usr/bin/env node
/**
 * Smoke test: plays examples/demo.html end to end in headless Chromium (at 4x speed)
 * and checks that the scripted tour actually drove the app.
 *   npm test
 */
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) { console.error('Playwright is not installed. Run: npm install && npx playwright install chromium'); process.exit(1); }

(async () => {
  const launch = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
  const browser = await chromium.launch(launch);
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto('file://' + path.join(__dirname, '..', 'examples', 'demo.html') + '?autoplay&speed=4');
  const result = await page.evaluate(() => window.__demo.then(() => 'ok', e => 'failed: ' + e.message));
  const state = await page.evaluate(() => ({
    firstRow: [...document.querySelectorAll('#contact-table tbody tr:first-child td')].map(td => td.textContent.trim()).join(' | '),
    weekly: document.querySelector('#n-weekly').checked,
    zoomedOut: !document.body.style.transform || /scale\(1(\.0+)?\)/.test(document.body.style.transform),
    overlaysLeft: document.querySelectorAll('.ot-layer svg g, .ot-spot, .ot-pulse, .ot-label').length
  }));
  await browser.close();

  const checks = [
    ['tour finished', result === 'ok', result],
    ['form was filled and saved', state.firstRow === 'Priya Raman | priya@lumen.dev | Lumen Labs | Decision maker | Pro', state.firstRow],
    ['checkbox was checked', state.weekly === true, state.weekly],
    ['camera zoomed back out', state.zoomedOut, state.zoomedOut],
    ['highlights cleaned up', state.overlaysLeft === 0, state.overlaysLeft],
    ['no page errors', errors.length === 0, errors.join(' | ')]
  ];
  let failed = 0;
  for (const [name, ok, detail] of checks) {
    console.log(`${ok ? '✔' : '✖'} ${name}${ok ? '' : '  → ' + detail}`);
    if (!ok) failed++;
  }
  process.exit(failed ? 1 : 0);
})();
