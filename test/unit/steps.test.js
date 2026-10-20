const test = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('../lib/browser');

let env;
test.before(async () => { env = await setup(); });
test.after(() => env.close());

const FORM = `<button id="go">Go</button><button id="off" disabled>Off</button><p id="out"></p>
  <input id="name" aria-label="Name"><div id="cover" style="position:fixed;inset:0;background:rgba(0,0,0,.2)"></div>`;

test('actions wait for a covering element to go away, then click', async () => {
  const page = await env.page(FORM);
  const r = await page.evaluate(async () => {
    document.getElementById('go').onclick = () => { document.getElementById('out').textContent = 'clicked'; };
    setTimeout(() => document.getElementById('cover').remove(), 600);
    const t0 = performance.now();
    await new OneTake({ speed: 6 }).click('#go');
    return { text: document.getElementById('out').textContent, waited: performance.now() - t0 };
  });
  assert.equal(r.text, 'clicked');
  assert.ok(r.waited >= 550, 'waited for the overlay');
  await page.done();
});

test('a disabled or covered target fails with a clear message and the script line', async () => {
  const page = await env.page(FORM);
  const msg = await page.evaluate(async () => {
    try { await new OneTake({ speed: 6, waitTimeout: 400 }).click('#off'); return 'no error'; } catch (e) { return e.message; }
  });
  assert.match(msg, /^step 1 click\("#off"\)/);
  assert.match(msg, /disabled|covered/);
  await page.done();
});

test('resumeFrom skips steps that already ran (but keeps set())', async () => {
  const page = await env.page(FORM);
  const ran = await page.evaluate(async () => {
    const seen = [];
    const t = new OneTake({ speed: 8, resumeFrom: 2, onStep: n => seen.push(n) });
    await t.run(() => seen.push('A')).set({ typingDelay: 5 }).run(() => seen.push('B')).wait(1);
    return { seen, delay: t.opts.typingDelay };
  });
  assert.deepEqual(ran.seen, ['run', 'B', 'wait']);
  assert.equal(ran.delay, 5);
  await page.done();
});

test('OneTake.define and take.use expand into ordinary steps', async () => {
  const page = await env.page('<input id="name" aria-label="Name">');
  const v = await page.evaluate(async () => {
    OneTake.define('fill', (take, s) => { take.type('label=Name', s); });
    const names = [];
    await new OneTake({ speed: 8, onStep: n => names.push(n) }).fill('Ada').use((t, x) => t.type('label=Name', x, { clear: true }), 'Grace');
    return { value: document.getElementById('name').value, names };
  });
  assert.equal(v.value, 'Grace');
  assert.deepEqual(v.names, ['type', 'type']);
  await page.done();
});

test('settle waits for fetch requests started by an action', async () => {
  const page = await env.page('<button id="load">Load</button><p id="res"></p>');
  const text = await page.evaluate(async () => {
    document.getElementById('load').onclick = () => {
      // three requests in a row, like an app loading data after a click
      setTimeout(() => fetch('style.css').then(r => r.text()).then(() => fetch('blank.html')).then(r => r.text())
        .then(() => fetch('style.css?2')).then(r => r.text()).then(() => { document.getElementById('res').textContent = 'loaded'; }), 50);
    };
    await new OneTake({ speed: 8 }).click('#load');
    return document.getElementById('res').textContent;          // no expect: settle alone must cover it
  });
  assert.equal(text, 'loaded');
  await page.done();
});

test('expect explains what it found', async () => {
  const page = await env.page('<p id="total">£3,000</p><ul><li>a</li><li>b</li></ul>');
  const msgs = await page.evaluate(async () => {
    const out = [];
    for (const [t, a] of [['#total', { text: '£4,000' }], ['li', { count: 3 }], ['#nope', {}]]) {
      try { await new OneTake({ waitTimeout: 200 }).expect(t, a); out.push('ok'); } catch (e) { out.push(e.message); }
    }
    return out;
  });
  assert.match(msgs[0], /contain text "£4,000", but its text is "£3,000"/);
  assert.match(msgs[1], /match 3 visible elements, but found 2/);
  assert.match(msgs[2], /not on the page/);
  await page.done();
});

test('chapter, thumbnail, captions and clicks are reported to the recorder', async () => {
  const page = await env.page('<button id="b">B</button>', { init: 'window.__ev = []; window.__otReport = e => window.__ev.push(e.type);' });
  const ev = await page.evaluate(async () => {
    await new OneTake({ speed: 8 }).chapter('One').caption('Hi').click('#b').thumbnail();
    return window.__ev.filter(t => !/^step/.test(t));
  });
  assert.deepEqual(ev, ['chapter', 'caption', 'click', 'thumbnail']);
  await page.done();
});
