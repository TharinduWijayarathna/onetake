/* Shared helpers for the OneTake recorder. */
const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');

function fail(msg) { console.error('✖ ' + msg); process.exit(1); }

function loadPlaywright() {
  try { return require('playwright'); }
  catch (e) { fail('Playwright is not installed. Run:  npm install, then npx onetake setup'); }
}

/** ffmpeg from FFMPEG_PATH, the ffmpeg-static package, or the PATH. */
function findFfmpeg() {
  const candidates = [];
  if (process.env.FFMPEG_PATH) candidates.push(process.env.FFMPEG_PATH);
  try { const p = require('ffmpeg-static'); if (p) candidates.push(p); } catch (e) { /* optional */ }
  candidates.push('ffmpeg');
  for (const c of candidates) {
    try { execFileSync(c, ['-version'], { stdio: 'ignore' }); return c; } catch (e) { /* try next */ }
  }
  return null;
}

function readLibrary() {
  const file = path.join(ROOT, 'dist', 'onetake.js');
  if (!fs.existsSync(file)) fail('dist/onetake.js not found. Run:  npm run build');
  return fs.readFileSync(file, 'utf8');
}

const isNavError = e => /context was destroyed|navigat|Target closed|frame was detached/i.test(e.message);

function attachLogging(page) {
  page.on('pageerror', e => console.error('[page error]', e.message));
  page.on('console', m => { if (m.type() === 'error') console.error('[console]', m.text()); });
}

/** Launch Chromium; when Playwright's browser isn't installed, say how to fix it. */
async function launchChromium(headless = true) {
  const { chromium } = loadPlaywright();
  const opts = { headless };
  if (process.env.CHROMIUM_PATH) opts.executablePath = process.env.CHROMIUM_PATH;
  try { return await chromium.launch(opts); }
  catch (e) {
    if (/Executable doesn't exist|install/i.test(e.message)) {
      throw new Error("Chromium for OneTake isn't installed yet. Run:  npx onetake setup   (Linux CI: npx onetake setup --with-deps)");
    }
    throw e;
  }
}

/** Install the Chromium build that matches OneTake's own Playwright version. */
function installBrowser(extra = []) {
  let dir;
  try { dir = path.dirname(require.resolve('playwright/package.json')); }
  catch (e) { dir = path.dirname(require.resolve('playwright')); }
  const cli = path.join(dir, 'cli.js');
  const r = spawnSync(process.execPath, [cli, 'install', 'chromium', ...extra], { stdio: 'inherit' });
  return r.status == null ? 1 : r.status;
}

module.exports = { ROOT, fail, loadPlaywright, findFfmpeg, readLibrary, isNavError, attachLogging, launchChromium, installBrowser };
