#!/usr/bin/env node
/**
 * Compatibility suite: plays every fixture in test/fixtures/<name>/ (React, Vue, Alpine, a web
 * component, an iframe, a datepicker, a combobox, a modal, uploads, drag, a virtual list,
 * a three-page flow) with trusted input and with synthetic events, then asks the page
 * whether the tour really did the job (window.__verify()).
 *
 *   npm run test:compat                 all fixtures, both input modes
 *   node test/e2e/compat.js react modal     just these
 */
const path = require('path');
const { chromium } = require('playwright');
const { serve } = require('../helpers/server');
const { checkTour } = require('../../src/recorder/realtime');
const { resolveConfig } = require('../../src/recorder/config');

const ROOT = path.join(__dirname, '..', '..');
const FIX = path.join(__dirname, '..', 'fixtures');
const ALL = ['multipage', 'react', 'vue', 'alpine', 'webcomponent', 'iframe', 'datepicker', 'combobox', 'modal', 'upload', 'drag', 'virtual'];

(async () => {
  const only = process.argv.slice(2);
  const names = ALL.filter(n => !only.length || only.includes(n));
  const server = await serve(ROOT);
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  let failed = 0;
  for (const name of names) {
    for (const realInput of [true, false]) {
      const cfg = resolveConfig({ flags: {
        url: `${server.url}/test/fixtures/${name}/`, tour: [path.join(FIX, name, 'tour.js')],
        speed: 4, lead: 0, tail: 0, realInput, now: '2026-11-02T09:00:00Z', max: 60, viewport: { width: 1280, height: 800 }
      } }, ROOT);
      const errors = [];
      const t0 = Date.now();
      const r = await checkTour(browser, cfg, {
        quiet: true,
        inspect: page => page.evaluate(() => (window.__verify ? window.__verify() : { ok: false, detail: 'no __verify on ' + location.pathname })).catch(e => ({ ok: false, detail: e.message }))
      }, m => errors.push(m)).catch(e => ({ error: e.message }));
      const v = r.inspect || { ok: false, detail: '' };
      const ok = !r.error && v.ok;
      if (!ok) failed++;
      const mode = realInput ? 'real     ' : 'synthetic';
      console.log(`${ok ? '✔' : '✖'} ${name.padEnd(13)} ${mode} ${((Date.now() - t0) / 1000).toFixed(1)}s${ok ? '' : '  → ' + (r.error || 'verify failed: ' + v.detail)}`);
    }
  }
  await browser.close();
  await server.close();
  console.log(failed ? `\n${failed} failed` : `\nall ${names.length * 2} passed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
