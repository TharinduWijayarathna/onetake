const test = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('../lib/browser');

let env;
test.before(async () => { env = await setup(); });
test.after(() => env.close());

test('virtual clock: timers in order, rAF once per frame, idle callbacks, fixed now', async () => {
  const page = await env.page('', { clock: true, noLib: true, init: 'window.__OT_NOW = Date.parse("2026-11-01T09:00:00Z");' });
  const r = await page.evaluate(async () => {
    sessionStorage.removeItem('__ot_vnow');
    const log = [];
    setTimeout(() => log.push('t30'), 30);
    setTimeout(() => log.push('t10'), 10);
    const iv = setInterval(() => log.push('iv'), 20);
    requestAnimationFrame(t => log.push('raf'));
    requestIdleCallback(() => log.push('idle'));
    const start = performance.now();
    for (let i = 0; i < 3; i++) await window.__otClock.tick(1000 / 60);   // 50 ms of page time
    clearInterval(iv);
    return { log, elapsed: performance.now() - start, year: new Date().getUTCFullYear(), hour: new Date().getUTCHours() };
  });
  assert.deepEqual(r.log, ['t10', 'raf', 'idle', 'iv', 't30', 'iv']);
  assert.ok(Math.abs(r.elapsed - 50) < 1, 'virtual time advanced exactly');
  assert.equal(r.year, 2026);
  assert.equal(r.hour, 9);
  await page.done();
});

test('busy-waiting on the clock still finishes (reads creep forward)', async () => {
  const page = await env.page('', { clock: true, noLib: true });
  const n = await page.evaluate(() => { const t = performance.now(); let n = 0; while (performance.now() - t < 1) n++; return n; });
  assert.ok(n > 10 && n < 1e6);
  await page.done();
});

test('CSS animations follow virtual time', async () => {
  const page = await env.page('<div id="a" style="width:10px;height:10px;transition:opacity 1s linear;opacity:1"></div>', { clock: true });
  const ops = await page.evaluate(async () => {
    const a = document.getElementById('a');
    a.getBoundingClientRect(); a.style.opacity = '0';
    const out = [];
    for (let i = 0; i < 60; i++) { await window.__otClock.tick(1000 / 60); if (i === 29) out.push(+getComputedStyle(a).opacity); }
    await window.__otClock.tick(1000 / 60);
    out.push(+getComputedStyle(a).opacity);
    return out;
  });
  assert.ok(ops[0] > 0.4 && ops[0] < 0.6, 'half way after 0.5 s: ' + ops[0]);
  assert.equal(ops[1], 0);
  await page.done();
});

test('external camera publishes a zoom rectangle for the recorder', async () => {
  const page = await env.page('<div id="box" style="margin:200px;width:200px;height:120px;background:#ddd"></div>', { clock: true, init: "window.__OT_CAMERA = 'external';" });
  const cam = await page.evaluate(async () => {
    const t = new OneTake();
    t.zoom('#box', { scale: 2 });
    for (let i = 0; i < 240 && !(window.__otCamera && Math.abs(window.__otCamera.scale - 2) < 0.002); i++) await window.__otClock.tick(1000 / 60);
    return window.__otCamera;
  });
  assert.ok(cam && Math.abs(cam.scale - 2) < 0.02, JSON.stringify(cam));
  assert.ok(Math.abs(cam.width - 500) < 3 && Math.abs(cam.height - 350) < 3, JSON.stringify(cam));
  await page.done();
});
