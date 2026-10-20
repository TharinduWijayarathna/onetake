const test = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('../lib/browser');

let env, page;
test.before(async () => {
  env = await setup();
  page = await env.page(`
    <nav><a href="#">Save drafts</a></nav>
    <button id="b1">Save</button> <button id="b2" aria-label="Close dialog">×</button>
    <div class="card"><h3>Alpha</h3><button>Open</button></div>
    <div class="card"><h3>Beta</h3><button>Open</button></div>
    <label for="em">Email address</label><input id="em">
    <input placeholder="Search people"> <input id="flt" aria-label="Filter">
    <div role="tab" aria-selected="true">Overview</div><div role="tab">Billing</div>
    <span style="display:none">Hidden text</span>
    <x-box></x-box>
    <iframe id="fr" srcdoc="<button>Inside</button>"></iframe>
    <script></script>`);
  await page.evaluate(() => {
    const h = document.querySelector('x-box').attachShadow({ mode: 'open' });
    h.innerHTML = '<button>Shadow button</button><label>Shadow field <input id="sf"></label>';
  });
  await page.waitForFunction(() => document.getElementById('fr').contentDocument && document.getElementById('fr').contentDocument.querySelector('button'));
});
test.after(async () => { await page.done(); await env.close(); });

const q = t => page.evaluate(t => { try { const el = OneTake.query(t); return el ? (el.id || el.tagName + ':' + el.textContent.trim()) : null; } catch (e) { return 'ERR ' + e.message; } }, t);

test('text= is exact and prefers clickable elements', async () => {
  assert.equal(await q('text=Save'), 'b1');
  assert.equal(await q('text*=Save drafts'), 'A:Save drafts');
  assert.equal(await q('text="Save"'), 'b1');                    // quotes are fine
});

test('text= refuses ambiguous matches and says how to narrow them', async () => {
  const r = await q('text=Open');
  assert.match(r, /^ERR .*2 elements/);
});

test('chaining and nth narrow a match', async () => {
  assert.equal(await q('.card >> nth=1 >> text=Open'), 'BUTTON:Open');
  assert.equal(await page.evaluate(() => OneTake.resolveAll('.card >> nth=1 >> text=Open')[0].closest('.card').querySelector('h3').textContent), 'Beta');
});

test('label= finds fields by label, aria-label and placeholder', async () => {
  assert.equal(await q('label=Email address'), 'em');
  assert.equal(await q('label=Email'), 'em');                    // prefix of the label
  assert.equal(await q('label=Search people'), 'INPUT:');
  assert.equal(await q('label=Filter'), 'flt');                   // aria-label
});

test('role= with accessible names', async () => {
  assert.equal(await q('role=tab[name="Billing"]'), 'DIV:Billing');
  assert.equal(await q('role=button[name="Close dialog"]'), 'b2');
  assert.equal(await q('role=button[name*="Shadow"]'), 'BUTTON:Shadow button');
});

test('hidden elements are not text matches', async () => {
  assert.equal(await q('text=Hidden text'), null);
});

test('shadow DOM and iframes', async () => {
  assert.equal(await q('text=Shadow button'), 'BUTTON:Shadow button');
  assert.equal(await q('label=Shadow field'), 'sf');
  assert.equal(await q('#fr >> text=Inside'), 'BUTTON:Inside');
});
