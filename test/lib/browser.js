/* Shared browser setup for the in-page unit tests. */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { serve } = require('./server');

const ROOT = path.join(__dirname, '..', '..');
const LIB = fs.readFileSync(path.join(ROOT, 'dist', 'onetake.js'), 'utf8');
const CLOCK = fs.readFileSync(path.join(ROOT, 'tools', 'virtual-time.js'), 'utf8');

async function setup() {
  const server = await serve(ROOT);
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  return {
    server, browser,
    /** A page with `html` as its body and OneTake loaded. o: { clock, init } */
    async page(html, o = {}) {
      const context = await browser.newContext({ viewport: { width: 1000, height: 700 } });
      if (o.init) await context.addInitScript({ content: o.init });
      if (o.clock) await context.addInitScript({ content: CLOCK });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(server.url + '/test/fixtures/blank.html');
      await page.evaluate(h => { document.body.innerHTML = h; }, html);
      if (!o.noLib) await page.addScriptTag({ content: LIB });
      page.errors = errors;
      page.done = () => context.close();
      return page;
    },
    async close() { await browser.close(); await server.close(); }
  };
}

module.exports = { setup, LIB, CLOCK };
