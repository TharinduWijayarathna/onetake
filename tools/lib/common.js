/* Shared helpers for the OneTake recorder. */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');

function fail(msg) { console.error('✖ ' + msg); process.exit(1); }

function loadPlaywright() {
  try { return require('playwright'); }
  catch (e) { fail('Playwright is not installed. Run:  npm install && npx playwright install chromium'); }
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

/** Evaluated in the page: start one demo script (does not wait for it to finish). */
function startScript({ code, speed, startPosition }) {
  const take = new window.OneTake({ speed, startPosition, sound: false });
  window.__otTake = take;
  window.__otDone = false;
  window.__otError = null;
  try {
    // eslint-disable-next-line no-new-func
    new Function('take', code)(take);
  } catch (e) {
    window.__otError = String(e && e.message || e); window.__otDone = true; return;
  }
  take.then(() => { window.__otDone = true; },
            e => { window.__otError = String(e && e.message || e); window.__otDone = true; });
}

const isNavError = e => /context was destroyed|navigat|Target closed|frame was detached/i.test(e.message);

function attachLogging(page) {
  page.on('pageerror', e => console.error('[page error]', e.message));
  page.on('console', m => { if (m.type() === 'error') console.error('[console]', m.text()); });
}

module.exports = { ROOT, fail, loadPlaywright, findFfmpeg, readLibrary, startScript, isNavError, attachLogging };
