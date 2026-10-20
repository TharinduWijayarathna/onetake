/*
 * Real-time drivers.
 *   recordRealtime  Playwright's live screencast (~25 fps). Quick to make, less smooth.
 *   checkTour       no video at all: plays the tour as fast as it allows and reports each
 *                   step, so a broken script is found in seconds instead of after a render.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { attachLogging, isNavError } = require('./common');
const { runSession, contextOptions, initGlobals, saveFailure } = require('./session');

const sleep = ms => new Promise(r => setTimeout(r, ms));

function realtimeDriver(page, cfg, poll) {
  const t0 = Date.now();
  const driver = {
    time: () => Date.now() - t0,
    overLimit: () => Date.now() - t0 > cfg.max * 1000,
    navGrace: 4,
    navWait: 60,
    async advance() {
      await sleep(poll);
      try { return await page.evaluate(() => window.__otStatus()); }
      catch (e) { if (isNavError(e)) return { nav: true }; throw e; }
    },
    idle: ms => sleep(ms)
  };
  return driver;
}

/** Record with the live screencast. Returns the session result plus { webm }. */
async function recordRealtime(browser, cfg, out, log = console.log) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'onetake-'));
  const context = await browser.newContext(contextOptions(cfg, {
    recordVideo: { dir, size: { width: cfg.viewport.width * cfg.scale, height: cfg.viewport.height * cfg.scale } }
  }));
  await context.addInitScript({ content: initGlobals(cfg) });
  const page = await context.newPage();
  attachLogging(page);
  const driver = realtimeDriver(page, cfg, 50);
  let result;
  try {
    result = await runSession(page, cfg, driver, log);
    if (result.error) result.failure = await saveFailure(page, out.base);
  } finally {
    const video = page.video();
    await context.close();
    if (video) { const p = await video.path(); fs.renameSync(p, out.file); }
    fs.rmSync(dir, { recursive: true, force: true });
  }
  return result;
}

/** Play the tour without recording. Prints each step; on failure saves a screenshot and the page HTML. */
async function checkTour(browser, cfg, out, log = console.log) {
  const context = await browser.newContext(contextOptions(cfg));
  await context.addInitScript({ content: initGlobals(cfg) });
  const page = await context.newPage();
  attachLogging(page);
  const driver = realtimeDriver(page, cfg, 25);
  const t0 = Date.now();
  driver.onStep = out.quiet ? null : ev => log(`  ${String(ev.index).padStart(3)}  ${ev.name}${ev.arg ? '(' + JSON.stringify(ev.arg) + ')' : ''}${ev.site ? '  ' + ev.site : ''}`);
  let result;
  try {
    result = await runSession(page, cfg, driver, log);
    if (result.error && out.base) result.failure = await saveFailure(page, out.base);
    if (out.inspect) result.inspect = await out.inspect(page);
  } finally {
    await context.close();
  }
  result.seconds = (Date.now() - t0) / 1000;
  return result;
}

module.exports = { recordRealtime, checkTour };
