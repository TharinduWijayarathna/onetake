/*
 * One recording session: opens the page, plays the tour scripts and keeps them going
 * across page loads. Used by every capture mode through a small "driver":
 *
 *   driver.advance()   move time forward (one frame, or a short real wait) and return the
 *                      page status { run, done, error, pos, cam } or { nav: true }
 *   driver.time()      video time in ms (for the timeline)
 *   driver.idle(ms)    keep filming for ms
 *   driver.beforeTick  awaited before every advance (frames mode waits for pending input)
 *
 * Page loads: when a step navigates, the new page gets the library again and the same
 * script runs again with `resumeFrom` set, so it carries on from the next step. Several
 * tour files still work the v1 way: each file continues on the page the previous one left.
 */
const fs = require('fs');
const path = require('path');
const { readLibrary, isNavError } = require('./common');

const MIME = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
  pdf: 'application/pdf', csv: 'text/csv', txt: 'text/plain', json: 'application/json', zip: 'application/zip',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  mp4: 'video/mp4', mp3: 'audio/mpeg', wav: 'audio/wav', md: 'text/markdown', html: 'text/html'
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

/** Read a tour file plus its includes. */
function loadTour(cfg) {
  const read = f => {
    if (!fs.existsSync(f)) throw new Error('Tour script not found: ' + f);
    return { file: f, name: path.basename(f), code: fs.readFileSync(f, 'utf8') };
  };
  return { tours: cfg.tour.map(read), includes: cfg.include.map(read) };
}

/** Context options shared by every mode. */
function contextOptions(cfg, extra) {
  return Object.assign({
    viewport: { width: cfg.viewport.width, height: cfg.viewport.height },
    deviceScaleFactor: cfg.scale,
    storageState: cfg.storage || undefined,
    reducedMotion: 'no-preference',
    bypassCSP: true                      // the library and tour scripts are injected into the page
  }, extra);
}

/** Globals set before any page script runs. */
function initGlobals(cfg, extra) {
  const lines = [];
  if (cfg.seed != null) lines.push(`window.__OT_SEED = ${+cfg.seed};`);
  if (cfg.now) {
    const t = Date.parse(cfg.now);
    if (isNaN(t)) throw new Error(`--now "${cfg.now}" is not a date (try 2026-11-01T09:00)`);
    lines.push(`window.__OT_NOW = ${t};`);
  }
  lines.push('window.__otStatus = ' + pageStatus.toString() + ';');
  // Without the virtual clock (realtime / check), --now still shifts Date to the given time.
  if (cfg.now && !extra) lines.push('(' + shiftDate.toString() + ')();');
  return lines.join('\n') + '\n' + (extra || '');
}

/** Evaluated in the page (realtime modes): Date runs from __OT_NOW, carried across page loads. */
function shiftDate() {
  if (window.__OT_NOW == null || window.__otClock) return;
  var R = Date, off = window.__OT_NOW - R.now();
  try { var c = sessionStorage.getItem('__ot_off'); if (c != null) off = +c; else sessionStorage.setItem('__ot_off', String(off)); } catch (e) { /* opaque origin */ }
  window.Date = new Proxy(R, {
    construct: function (T, a) { return a.length ? new (Function.prototype.bind.apply(T, [null].concat(a)))() : new T(R.now() + off); },
    apply: function () { return new R(R.now() + off).toString(); },
    get: function (T, k) { return k === 'now' ? function () { return R.now() + off; } : T[k]; }
  });
}

/** Evaluated in the page: start a tour script (returns at once; the status is polled). */
function startScript(a) {
  const take = new window.OneTake(Object.assign({}, a.options, { speed: a.speed, resumeFrom: a.resumeFrom, startPosition: a.startPosition }));
  window.__otTake = take;
  window.__otRun = a.run;
  window.__otDone = false;
  window.__otError = null;
  const fail = e => { window.__otError = String((e && e.message) || e); window.__otDone = true; };
  try {
    window.take = take;
    // Includes run as global scripts: their functions and OneTake.define() steps are visible to the tour.
    for (const inc of a.includes) (0, eval)(inc.code + '\n//# sourceURL=' + inc.name);
    // The tour runs with `take` in scope; the wrapper sits on line 1 so line numbers match the file.
    const fn = (0, eval)('(function (take) {' + a.code + '\n})\n//# sourceURL=' + a.name);
    if (a.caption) { take._mount(); take._setCaption(a.caption.text, a.caption.duration ? { duration: a.caption.duration } : undefined); }
    fn(take);
  } catch (e) { fail(e); return; }
  take.then(() => { window.__otDone = true; }, fail);
}

/** Evaluated in the page: wait for web fonts and images. */
async function pageReady() {
  if (document.fonts && document.fonts.ready) await document.fonts.ready;
  await Promise.all([...document.images].filter(i => !i.complete).map(i => new Promise(r => { i.addEventListener('load', r); i.addEventListener('error', r); })));
}

async function runSession(page, cfg, driver, log = console.log) {
  const lib = readLibrary();
  const { tours, includes } = loadTour(cfg);
  const events = [];
  const track = [];
  let current = null;          // { index, name, action, acted, done } of the latest step
  let caption = null;          // the caption on screen: { text, until }
  let tourDir = path.dirname(tours[0].file);
  let navRequested = false;

  /* ---- page → recorder: timeline events ---- */
  await page.exposeBinding('__otReport', (source, ev) => {
    if (source.frame !== page.mainFrame()) return;
    const t = driver.time();
    events.push(Object.assign({ t }, ev));
    switch (ev.type) {
      case 'step':
        current = { index: ev.index, name: ev.name, action: ev.action, acted: ev.name === 'run', done: false };
        if (driver.onStep) driver.onStep(ev);
        break;
      case 'stepDone': if (current && current.index === ev.index) current.done = true; break;
      case 'click': case 'key': if (current) current.acted = true; break;
      case 'caption': caption = { text: ev.text, until: ev.duration ? t + ev.duration : null }; break;
      case 'captionHide': caption = null; break;
      case 'chapter': log(`  § ${ev.title}`); break;
    }
  });

  /* ---- page → recorder: trusted input (in order) ---- */
  let inputs = Promise.resolve(), pending = 0;
  const doInput = async msg => {
    const m = page.mouse, k = page.keyboard;
    switch (msg.type) {
      case 'move': return m.move(msg.x, msg.y);
      case 'click':
        await m.move(msg.x, msg.y);
        await m.down({ button: msg.button || 'left', clickCount: msg.clickCount || 1 });
        await m.up({ button: msg.button || 'left', clickCount: msg.clickCount || 1 });
        if (current) current.acted = true;
        return sleep(40);                        // let a page load this click starts register first (steady timing)
      case 'down': await m.move(msg.x, msg.y); if (current) current.acted = true; return m.down();
      case 'up': await m.move(msg.x, msg.y); return m.up();
      case 'type': if (current) current.acted = true; return k.type(msg.text);
      case 'press': if (current) current.acted = true; await k.press(msg.key); return sleep(msg.key === 'Enter' ? 40 : 0);
      case 'file': {
        const f = path.resolve(tourDir, msg.path);
        if (!fs.existsSync(f)) throw new Error('upload: file not found: ' + f);
        const ext = path.extname(f).slice(1).toLowerCase();
        return { name: path.basename(f), type: MIME[ext] || 'application/octet-stream', base64: fs.readFileSync(f).toString('base64') };
      }
      default: throw new Error('unknown input ' + msg.type);
    }
  };
  if (cfg.realInput !== false) {
    await page.exposeBinding('__otInput', (source, msg) => {
      pending++;
      const p = inputs.then(() => doInput(msg));
      inputs = p.catch(() => {}).then(() => { pending--; });
      return p;
    });
  }
  driver.inputsIdle = async () => { while (pending) await inputs; };

  // A page load in flight: frames mode holds the clock until it lands, so server time never
  // shows up as frozen frames and every take has the same timing.
  let navInFlight = null;
  page.on('request', r => {
    if (!r.isNavigationRequest() || r.frame() !== page.mainFrame()) return;
    navRequested = true;
    navInFlight = r;
  });
  const navOver = r => { if (r === navInFlight) navInFlight = null; };
  page.on('requestfailed', navOver);
  page.on('requestfinished', r => { if (r === navInFlight) setTimeout(() => navOver(r), 1500); });   // 204s and downloads never commit
  page.on('framenavigated', f => { if (f === page.mainFrame()) navInFlight = null; });
  driver.waitForNav = async (limit = 15000) => {
    const t = Date.now();
    while (navInFlight && Date.now() - t < limit) await sleep(10);
  };

  async function ready() {
    await page.waitForLoadState('load', { timeout: 60000 }).catch(() => {});
    await Promise.race([page.evaluate(pageReady).catch(() => {}), sleep(5000)]);
  }

  let runId = 0, pos = null;
  async function start(tour, resumeFrom) {
    for (let attempt = 0; ; attempt++) {
      try {
        if (!(await page.evaluate(() => !!window.OneTake))) await page.addScriptTag({ content: lib });
        let carry = null;
        if (caption && (!caption.until || caption.until > driver.time() + 300)) {
          carry = { text: caption.text, duration: caption.until ? (caption.until - driver.time()) * cfg.speed : null };
        }
        navRequested = false;
        await page.evaluate(startScript, {
          code: tour.code, name: tour.name, includes, options: cfg.options || {}, speed: cfg.speed,
          resumeFrom, startPosition: pos, run: ++runId, caption: carry
        });
        return;
      } catch (e) {
        if (!isNavError(e) || attempt > 5) throw e;
        await ready();                                  // the page navigated while we were starting
      }
    }
  }

  await page.goto(cfg.url, { waitUntil: 'load', timeout: 60000 });
  await ready();
  await driver.idle(cfg.lead);

  let error = null, failedStep = null;
  outer:
  for (let i = 0; i < tours.length; i++) {
    const tour = tours[i];
    tourDir = path.dirname(tour.file);
    if (tours.length > 1) log(`▶ ${tour.name}`);
    current = null;
    await start(tour, 0);
    let finished = false, waitedForNav = 0;
    for (;;) {
      if (driver.overLimit && driver.overLimit()) { error = `stopped at the --max limit (${cfg.max}s)`; break outer; }
      const s = await driver.advance();
      if (s.nav || s.run !== runId) {
        await ready();
        if (finished) break;                            // v1 style: the next file runs on the new page
        // A step that already acted (clicked, typed) is not repeated; one cut short before acting is.
        const from = current ? current.index + (current.done || current.acted ? 1 : 0) : 0;
        log(`  ↻ page loaded, continuing from step ${from}`);
        current = null;
        await start(tour, from);
        continue;
      }
      if (s.pos) pos = s.pos;
      track.push({ t: driver.time(), pos: s.pos, cam: s.cam || null });
      if (s.error) { error = s.error; failedStep = current; break outer; }
      if (s.done) {
        if (i === tours.length - 1) break;
        finished = true;
        // A last click may have started a page load; give it a moment, then wait for it.
        if (!navRequested && waitedForNav++ >= (driver.navGrace || 3)) break;
        if (navRequested && waitedForNav++ > (driver.navWait || 180)) break;
      }
    }
  }
  if (!error) await driver.idle(cfg.tail);
  return { error, failedStep, events, track };
}

/** Save a screenshot and the HTML of the page when a take fails. */
async function saveFailure(page, base) {
  const out = [];
  try { await page.screenshot({ path: base + '.failure.png' }); out.push(base + '.failure.png'); } catch (e) { /* page gone */ }
  try { fs.writeFileSync(base + '.failure.html', await page.content()); out.push(base + '.failure.html'); } catch (e) { /* page gone */ }
  return out;
}

/** Evaluated in the page: status for the recorder. */
function pageStatus() {
  const c = window.__otCamera;
  return {
    run: window.__otRun, done: window.__otDone, error: window.__otError, sx: scrollX, sy: scrollY,
    pos: window.__otTake ? { x: window.__otTake.pos.x, y: window.__otTake.pos.y } : null,
    cam: c ? { x: c.x, y: c.y, width: c.width, height: c.height, scale: c.scale, sx: scrollX, sy: scrollY } : null
  };
}

module.exports = { runSession, contextOptions, initGlobals, saveFailure, pageStatus, loadTour, isNavError };
