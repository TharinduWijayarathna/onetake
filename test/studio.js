#!/usr/bin/env node
/**
 * End-to-end test for OneTake Studio. Drives the studio UI headlessly with real mouse and
 * keyboard input, as a person would: record actions on examples/demo.html, mark a zoom and a
 * highlight, add a caption, edit the timeline, generate scripts, replay them, and render.
 *   node test/studio.js            (add --no-render to skip the short render)
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { startStudio } = require('../tools/studio');

const ROOT = path.join(__dirname, '..');
const results = [];
function check(name, ok, detail) { results.push([name, !!ok, detail]); }

function serve() {
  const types = { '.html': 'text/html', '.js': 'text/javascript' };
  const extra = {
    '/nav/a.html': '<!doctype html><title>A</title><h1>Page A</h1><a id="go" href="/nav/b.html">Go to B</a>',
    '/nav/b.html': '<!doctype html><title>B</title><h1>Page B</h1><input id="q" aria-label="Search"><a href="/nav/a.html">Back</a>',
    '/nav/c.html': '<!doctype html><title>C</title><h1>Page C</h1><button id="done">Done</button>'
  };
  const server = http.createServer((req, res) => {
    const url = req.url.split('?')[0];
    if (extra[url]) { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(extra[url]); }
    const file = path.join(ROOT, url);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(r => server.listen(0, () => r({ server, base: 'http://localhost:' + server.address().port })));
}

async function center(page, selector) {
  const box = await page.locator(selector).first().boundingBox();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function mark(page, selector, { up = 0, kind, label, seconds }) {
  await page.click('button[data-act="mark"]');
  const p = await center(page, selector);
  await page.mouse.move(p.x, p.y);
  for (let i = 0; i < up; i++) await page.keyboard.press('ArrowUp');
  await page.mouse.click(p.x, p.y);
  if (label) await page.fill('.menu input.label', label);
  if (seconds) await page.fill('.menu .z input', String(seconds));
  await page.click(`.menu button[data-mark="${kind}"]`);
}

const settle = page => page.waitForTimeout(150);

(async () => {
  const { server, base } = await serve();
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'ot-studio-'));
  const errors = [];

  /* ---------- 1. a single-page tour on the example app ---------- */
  const studio = await startStudio({ url: base + '/examples/demo.html', out, headless: true, fresh: true, width: 1280, height: 760 });
  const { page, session } = studio;
  page.on('pageerror', e => errors.push(e.message));
  await page.waitForSelector('button[data-act="record"]');
  check('toolbar is injected', true);

  await page.click('button[data-act="record"]');
  await settle(page);
  check('recording starts', session.recording && session.data.url === base + '/examples/demo.html', session.data.url);

  await page.click('aside a[data-section="contacts"]');
  await page.click('#new-contact');
  await mark(page, '#contact-form h3', { up: 1, kind: 'zoom', seconds: 12 });     // h3 → its parent: the form
  await page.fill('input[name="name"]', 'Priya Raman');
  await page.fill('input[name="email"]', 'priya@lumen.dev');
  await page.selectOption('select[name="role"]', 'Decision maker');
  await page.check('input[value="Pro"]');
  await page.check('input[name="newsletter"]');
  await mark(page, '#save', { kind: 'box', label: 'Save when ready' });
  await page.click('#save');
  await page.click('button[data-act="caption"]');
  await page.fill('.captionbox input:not(.secs)', 'Contact saved.');
  await page.keyboard.press('Enter');
  await settle(page);

  const types = session.steps.map(s => s.type).join(',');
  check('recorded the right steps', types === 'click,click,zoom,type,type,select,check,check,highlight,click,caption', types);
  const byType = t => session.steps.filter(s => s.type === t);
  check('stable selectors', byType('type').map(s => s.target).join(' | ') === 'label=Full name | label=Email' &&
    byType('click')[1].target === '#new-contact' && byType('select')[0].target === 'label=Role', JSON.stringify(session.steps.map(s => s.target)));
  check('zoom mark targets the form with seconds', byType('zoom')[0].target === '#contact-form' && byType('zoom')[0].seconds === 12, JSON.stringify(byType('zoom')[0]));
  check('highlight mark has shape and label', byType('highlight')[0].shape === 'box' && byType('highlight')[0].label === 'Save when ready');

  // timeline: edit a typed value, move a step, delete a step
  await page.click('button[data-act="steps"]');
  const rows = await page.locator('.panel .step').count();
  check('timeline lists every step', rows === session.steps.length, rows);
  const nameRow = page.locator('.panel .step', { hasText: 'Type' }).first();
  await nameRow.locator('input[data-field="value"]').fill('Emma Clarke');
  await nameRow.locator('input[data-field="value"]').press('Tab');
  await settle(page);
  check('timeline edits update the step', byType('type')[0].value === 'Emma Clarke', byType('type')[0].value);
  await page.locator('.panel .step', { hasText: 'Caption' }).locator('button[data-op="up"]').click();
  await settle(page);
  check('timeline reorders', session.steps[session.steps.length - 2].type === 'caption', session.steps.map(s => s.type).join(','));
  await page.locator('.panel .step', { hasText: 'Caption' }).locator('button[data-op="down"]').click();
  await page.click('button[data-act="wait"]');
  await settle(page);
  await page.locator('.panel .step', { hasText: 'Wait' }).locator('button[data-op="del"]').click();
  await settle(page);
  check('timeline deletes', !byType('wait').length);

  await page.click('button[data-act="generate"]');
  await settle(page);
  const files = session.data.generated;
  check('generate writes one script + render.sh', files.length === 1 && fs.existsSync(path.join(out, 'render.sh')), files);
  const code = fs.readFileSync(path.join(out, files[0]), 'utf8');
  check('script has zoom, highlight and caption', /\.zoom\("#contact-form", 12\)/.test(code) && /\.box\("#save", \{ label: "Save when ready"/.test(code) && /\.caption\("Contact saved\."/.test(code), code);

  // replay the generated script on a fresh page and check it really drives the app
  const replay = await studio.browser.newPage({ viewport: { width: 1280, height: 760 } });
  replay.on('pageerror', e => errors.push('replay: ' + e.message));
  await replay.goto(base + '/examples/demo.html');
  await replay.addScriptTag({ path: path.join(ROOT, 'dist', 'onetake.js') });
  const outcome = await replay.evaluate(async src => {
    const take = new OneTake({ speed: 6 });
    new Function('take', src)(take);
    try { await take; } catch (e) { return 'failed: ' + e.message; }
    return [...document.querySelectorAll('#contact-table tbody tr:first-child td')].map(td => td.textContent.trim()).join(' | ');
  }, code);
  check('generated script replays the tour', outcome === 'Emma Clarke | priya@lumen.dev | — | Decision maker | Pro', outcome);
  await replay.close();

  if (!process.argv.includes('--no-render')) {
    await studio.render.render({ fps: 30, scale: 1, max: 4, name: 'test' });
    while (studio.render.status.running) await new Promise(r => setTimeout(r, 300));
    const video = path.join(out, 'videos', 'test.mp4');
    check('render writes a video', fs.existsSync(video) && fs.statSync(video).size > 10000, studio.render.status.message);
  }
  await studio.browser.close();

  /* ---------- 2. multi-page: page loads split scripts; direct visits navigate ---------- */
  const out2 = fs.mkdtempSync(path.join(os.tmpdir(), 'ot-studio-nav-'));
  const s2 = await startStudio({ url: base + '/nav/a.html', out: out2, headless: true, fresh: true });
  s2.page.on('pageerror', e => errors.push(e.message));
  await s2.page.waitForSelector('button[data-act="record"]');
  await s2.page.click('button[data-act="record"]');
  await settle(s2.page);
  await s2.page.click('#go');
  await s2.page.waitForURL(/b\.html/);
  await s2.page.waitForSelector('button[data-act="record"]');
  await s2.page.fill('#q', 'hello');
  await s2.page.keyboard.press('Tab');
  await settle(s2.page);
  await s2.page.goto(base + '/nav/c.html');                      // typed into the address bar
  await s2.page.waitForSelector('button[data-act="record"]');
  await s2.page.click('#done');
  await settle(s2.page);
  const navTypes = s2.session.steps.map(s => s.type + (s.direct ? '(direct)' : '')).join(',');
  check('page loads become page markers', navTypes === 'click,page,type,page(direct),click', navTypes);
  await s2.page.click('button[data-act="generate"]');
  await settle(s2.page);
  const navFiles = s2.session.data.generated;
  check('one script per page', navFiles.join(',') === '1-nav-a.html.js,2-nav-b.html.js,3-nav-c.html.js' || navFiles.length === 3, navFiles);
  const second = fs.readFileSync(path.join(out2, navFiles[1]), 'utf8');
  check('direct visit becomes a navigation step', second.includes('"#q"') && /location\.href = ".*\/nav\/c\.html"/.test(second), second);
  await s2.browser.close();

  server.close();
  check('no page errors', !errors.length, errors.join(' | '));

  let failed = 0;
  for (const [name, ok, detail] of results) {
    console.log(`${ok ? '✔' : '✖'} ${name}${ok ? '' : '  → ' + (typeof detail === 'string' ? detail : JSON.stringify(detail))}`);
    if (!ok) failed++;
  }
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
