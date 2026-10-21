/*
 * `onetake mcp`: a Model Context Protocol server (stdio, JSON-RPC 2.0) so AI agents can
 * explore an app and build a tour without guessing:
 *
 *   open_page      open a page (with the kit's saved login and viewport) in a browser the server keeps
 *   inspect_page   buttons, links, fields, headings… each with a unique OneTake target to copy
 *   test_target    does a target match exactly one visible element? which ones if not?
 *   run_steps      play a few OneTake steps on the open page (to reach the next state while exploring)
 *   screenshot     what the page looks like now
 *   check_tour     dry-run a kit's tour: every step, with the line and reason of the first failure
 *   record_video   render the kit's video (onetake record)
 *   get_docs       the OneTake documentation, by topic
 *
 * stdout carries only protocol messages; everything else goes to stderr.
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { loadPlaywright, readLibrary } = require('./util');
const { resolveConfig } = require('./config');

const ROOT = path.join(__dirname, '..', '..');
const VERSION = require(path.join(ROOT, 'package.json')).version;
const PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const log = (...a) => process.stderr.write(a.join(' ') + '\n');

const INSTRUCTIONS = `OneTake makes product demo videos from a tour script (a chain of steps on \`take\`).
Workflow: open_page the start URL (pass the demo kit folder as cwd to use its onetake.config.js and auth.json),
inspect_page to get unique targets, test_target anything you write by hand, run_steps to move through the flow while
exploring, write tour.js, check_tour until it passes, then record_video. get_docs explains the API (topic "api"),
targets, waiting, camera, output and recipes. Prefer role=…[name="…"], text=… and label=… targets; text=/label=/role=
must match exactly one visible element.`;

/* ---------- the browser the server keeps between calls ---------- */

const state = { browser: null, context: null, page: null, cwd: null, lib: null };

async function browser() {
  if (state.browser && state.browser.isConnected()) return state.browser;
  const { chromium } = loadPlaywright();
  const opts = { headless: true };
  if (process.env.CHROMIUM_PATH) opts.executablePath = process.env.CHROMIUM_PATH;
  state.browser = await chromium.launch(opts);
  return state.browser;
}

function kitConfig(cwd, flags = {}, positional = []) {
  const dir = path.resolve(cwd || process.cwd());
  if (!fs.existsSync(dir)) throw new Error('Folder not found: ' + dir);
  return resolveConfig({ flags, positional, meta: {} }, dir);
}

async function ensureLib(page) {
  state.lib = state.lib || readLibrary();
  if (!(await page.evaluate(() => !!window.OneTake).catch(() => false))) await page.addScriptTag({ content: state.lib });
}

function needPage() {
  if (!state.page || state.page.isClosed()) throw new Error('No page is open. Call open_page first.');
  return state.page;
}

/** Trusted input for run_steps, like the recorder's. */
async function exposeInput(context, dir) {
  let chain = Promise.resolve();
  await context.exposeBinding('__otInput', ({ page }, msg) => {
    const run = async () => {
      const m = page.mouse, k = page.keyboard;
      switch (msg.type) {
        case 'move': return m.move(msg.x, msg.y);
        case 'click': await m.move(msg.x, msg.y); await m.down({ button: msg.button || 'left', clickCount: msg.clickCount || 1 }); return m.up({ button: msg.button || 'left', clickCount: msg.clickCount || 1 });
        case 'down': await m.move(msg.x, msg.y); return m.down();
        case 'up': await m.move(msg.x, msg.y); return m.up();
        case 'type': return k.type(msg.text);
        case 'press': return k.press(msg.key);
        case 'file': {
          const f = path.resolve(dir, msg.path);
          return { name: path.basename(f), type: 'application/octet-stream', base64: fs.readFileSync(f).toString('base64') };
        }
      }
    };
    const p = chain.then(run);
    chain = p.catch(() => {});
    return p;
  });
}

/* ---------- in-page inspector (runs in the browser) ---------- */

function inspectInPage(opts) {
  const OT = window.OneTake, max = opts.limit || 150;
  const scope = opts.scope ? OT.query(opts.scope) : document;
  if (!scope) throw new Error('scope not found: ' + opts.scope);
  const SEL = 'a[href],button,input:not([type=hidden]),select,textarea,[contenteditable=""],[contenteditable=true],[role=button],[role=link],[role=tab],[role=menuitem],[role=option],[role=checkbox],[role=switch],[role=radio],[role=combobox],[role=textbox],summary,h1,h2,h3,[role=dialog],dialog,form,table';
  const all = [];
  (function walk(root) {
    root.querySelectorAll(SEL).forEach(el => all.push(el));
    root.querySelectorAll('*').forEach(el => { if (el.shadowRoot) walk(el.shadowRoot); });
  })(scope);
  const q = s => '"' + String(s).replace(/"/g, '\\"') + '"';
  const unique = (t, el) => { try { const r = OT.resolveAll(t).filter(OT.isVisible); return r.length === 1 && r[0] === el; } catch (e) { return false; } };
  const short = s => (s.length > 70 ? s.slice(0, 67) + '…' : s);
  const clean = s => String(s || '').replace(/\s+/g, ' ').trim();
  // Names in the page's own casing (matching ignores case, but tours read better this way).
  function labelText(l) { const c = l.cloneNode(true); c.querySelectorAll('input,select,textarea,button,option').forEach(n => n.remove()); return clean(c.textContent); }
  function nameOf(el) {
    const by = el.getAttribute('aria-labelledby');
    if (by) { const t = by.split(/\s+/).map(id => { const n = document.getElementById(id); return n ? n.textContent : ''; }).join(' '); if (clean(t)) return clean(t); }
    if (el.getAttribute('aria-label')) return clean(el.getAttribute('aria-label'));
    const tag = el.tagName;
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(tag) && el.labels && el.labels.length) return labelText(el.labels[0]);
    if (tag === 'IMG') return clean(el.alt);
    if (tag === 'INPUT' && /^(button|submit|reset)$/i.test(el.type)) return clean(el.value);
    if (tag === 'INPUT' || tag === 'TEXTAREA') return clean(el.placeholder || el.title);
    return clean(el.innerText || el.textContent || el.title);
  }
  function labelOf(el) {
    if (el.labels && el.labels.length) return labelText(el.labels[0]);
    return clean(el.getAttribute('aria-label') || el.getAttribute('placeholder') || '');
  }
  function targetFor(el) {
    const role = OT.roleOf(el), name = nameOf(el), tag = el.tagName.toLowerCase();
    const field = /^(input|select|textarea)$/.test(tag) || el.isContentEditable || /^(textbox|combobox)$/.test(role || '');
    const tries = [];
    if (field) { const l = labelOf(el); if (l) tries.push('label=' + l); }
    if (role && name && name.length <= 80) tries.push('role=' + role + '[name=' + q(name) + ']');
    const text = (el.innerText || '').trim().replace(/\s+/g, ' ');
    if (!field && text && text.length <= 60) tries.push('text=' + text);
    if (el.id && /^[A-Za-z][\w-]*$/.test(el.id)) tries.push('#' + el.id);
    for (const a of ['data-testid', 'data-test', 'data-cy', 'dusk', 'name']) {
      const v = el.getAttribute(a);
      if (v) tries.push(tag + '[' + a + '=' + q(v) + ']');
    }
    for (const t of tries) if (unique(t, el)) return t;
    // Not unique on its own: pick the match by position.
    for (const t of tries) {
      try { const r = OT.resolveAll(t).filter(OT.isVisible); const i = r.indexOf(el); if (i >= 0) return t + ' >> nth=' + i; } catch (e) { /* next */ }
    }
    return null;
  }
  const groups = { headings: [], fields: [], actions: [], regions: [] };
  let count = 0;
  for (const el of all) {
    if (count >= max) break;
    if (!OT.isVisible(el) || (el.closest && el.closest('.ot-layer'))) continue;
    const tag = el.tagName.toLowerCase(), role = OT.roleOf(el) || tag;
    const text = short(nameOf(el));
    let group = 'actions';
    if (/^h[1-3]$/.test(tag)) group = 'headings';
    else if (/^(form|table|dialog)$/.test(tag) || role === 'dialog') group = 'regions';
    else if (/^(input|select|textarea)$/.test(tag) || el.isContentEditable || /^(textbox|combobox|checkbox|switch|radio)$/.test(role)) group = 'fields';
    let target = group === 'regions'
      ? (el.id ? '#' + el.id : (el.getAttribute('action') ? 'form[action*=' + q(new URL(el.action, location.href).pathname) + ']' : null))
      : targetFor(el);
    const info = { target, role, text };
    if (group === 'fields') {
      info.kind = tag === 'input' ? (el.type || 'text') : tag;
      if (el.value && el.type !== 'password') info.value = short(String(el.value));
      if (el.disabled) info.disabled = true;
      if (tag === 'select') info.options = [].slice.call(el.options, 0, 12).map(o => o.text.trim());
    }
    if (group === 'actions' && (el.disabled || el.getAttribute('aria-disabled') === 'true')) info.disabled = true;
    if (group === 'regions') info.text = short((el.innerText || '').trim().split('\n')[0] || tag);
    groups[group].push(info);
    count++;
  }
  return { title: document.title, url: location.href, groups, truncated: count >= max };
}

function formatInspect(r) {
  const out = [`${r.title} · ${r.url}`];
  const line = i => {
    const extra = [i.kind, i.value != null && `value: ${JSON.stringify(i.value)}`, i.options && `options: ${i.options.join(' | ')}`, i.disabled && 'disabled']
      .filter(Boolean).join(', ');
    const t = i.target || '(no unique target: use a function target)';
    const showText = i.text && !t.toLowerCase().includes(i.text.toLowerCase());
    return `  ${t}${showText ? '   — ' + i.text : ''}${extra ? '   [' + extra + ']' : ''}`;
  };
  for (const [k, title] of [['headings', 'Headings'], ['regions', 'Regions (good zoom targets)'], ['fields', 'Fields'], ['actions', 'Buttons, links, tabs']]) {
    if (r.groups[k].length) out.push('', title + ':', ...r.groups[k].map(line));
  }
  if (r.truncated) out.push('', '(list cut short: pass scope to inspect one part of the page)');
  return out.join('\n');
}

/* ---------- tools ---------- */

const text = t => ({ content: [{ type: 'text', text: t }] });
const withImage = (t, buf) => ({ content: [{ type: 'text', text: t }, { type: 'image', data: buf.toString('base64'), mimeType: 'image/png' }] });

const TOOLS = [
  {
    name: 'open_page',
    description: 'Open a page in a browser the server keeps, signed in with the demo kit\'s saved session. Pass cwd (the folder with onetake.config.js) to use its url, viewport and storage. Returns the page inspection.',
    inputSchema: { type: 'object', properties: {
      url: { type: 'string', description: 'Page to open. Default: the config\'s url.' },
      cwd: { type: 'string', description: 'Demo kit folder (onetake.config.js, auth.json). Default: the server\'s working directory.' },
      storage: { type: 'string', description: 'Playwright storageState file (e.g. auth.json). Default: the config\'s storage.' },
      width: { type: 'number' }, height: { type: 'number' }
    } },
    async run(a) {
      const cfg = kitConfig(a.cwd);
      const url = a.url || cfg.url;
      if (!url) throw new Error('No url: pass url, or a cwd whose onetake.config.js sets one.');
      const storage = a.storage ? path.resolve(cfg.baseDir, a.storage) : cfg.storage;
      if (state.context) await state.context.close().catch(() => {});
      const b = await browser();
      state.context = await b.newContext({
        viewport: { width: a.width || cfg.viewport.width, height: a.height || cfg.viewport.height },
        storageState: storage && fs.existsSync(storage) ? storage : undefined, bypassCSP: true
      });
      state.cwd = cfg.baseDir;
      await exposeInput(state.context, cfg.baseDir);
      state.page = await state.context.newPage();
      state.page.on('pageerror', e => log('[page error]', e.message));
      await state.page.goto(/^(https?|file|data|about):/i.test(url) ? url : 'file://' + path.resolve(cfg.baseDir, url), { waitUntil: 'load', timeout: 60000 });
      await ensureLib(state.page);
      const r = await state.page.evaluate(inspectInPage, {});
      const note = storage && !fs.existsSync(storage) ? `\n\n(Note: ${storage} doesn't exist, so the page opened signed out. Run onetake login to create it.)` : '';
      return text(formatInspect(r) + note);
    }
  },
  {
    name: 'inspect_page',
    description: 'List what a tour can act on in the open page: headings, regions (forms, tables, dialogs), fields and buttons/links/tabs, each with a OneTake target that matches exactly that element.',
    inputSchema: { type: 'object', properties: {
      scope: { type: 'string', description: 'Only inspect inside this target, e.g. "role=dialog" or "#billing-form".' },
      limit: { type: 'number', description: 'Most elements to list (default 150).' }
    } },
    async run(a) {
      const page = needPage();
      await ensureLib(page);
      return text(formatInspect(await page.evaluate(inspectInPage, { scope: a.scope, limit: a.limit })));
    }
  },
  {
    name: 'test_target',
    description: 'Check a OneTake target on the open page: how many visible elements it matches, which ones, and whether a step would accept it (text=/label=/role= must be unique).',
    inputSchema: { type: 'object', required: ['target'], properties: { target: { type: 'string' } } },
    async run(a) {
      const page = needPage();
      await ensureLib(page);
      const r = await page.evaluate(t => {
        const OT = window.OneTake;
        let all;
        try { all = OT.resolveAll(t); } catch (e) { return { error: e.message }; }
        const vis = all.filter(OT.isVisible);
        let ok = true, why = null;
        try { if (!OT.query(t)) { ok = false; why = 'nothing matches'; } } catch (e) { ok = false; why = e.message; }
        if (ok && !vis.length) { ok = false; why = 'it matches only hidden elements (a step would wait for it to appear)'; }
        return { ok, why, total: all.length, visible: vis.length, matches: vis.slice(0, 8).map(OT.describe) };
      }, a.target);
      if (r.error) return text(`✖ ${a.target}: ${r.error}`);
      const head = r.ok ? `✔ ${a.target} → ${r.matches[0]}` : `✖ ${a.target}: ${r.why}`;
      const list = r.visible > 1 || !r.ok ? `\n${r.visible} visible of ${r.total}:\n${r.matches.map((m, i) => `  nth=${i}  ${m}`).join('\n')}` : '';
      return text(head + list);
    }
  },
  {
    name: 'run_steps',
    description: 'Play OneTake steps on the open page with real mouse and keyboard, e.g. "take.click(\'text=New client\').type(\'label=Name\', \'Ada\')". Use it to reach the next state while exploring. Page loads are fine (the result says where you ended up).',
    inputSchema: { type: 'object', required: ['code'], properties: {
      code: { type: 'string', description: 'JavaScript using `take`.' },
      speed: { type: 'number', description: 'Default 3.' },
      timeout: { type: 'number', description: 'ms, default 60000.' }
    } },
    async run(a) {
      const page = needPage();
      await ensureLib(page);
      const before = page.url();
      const run = page.evaluate(({ code, speed }) => {
        const names = [];
        const take = new window.OneTake({ speed, onStep: n => names.push(n), onError: () => {} });
        window.__otMcp = { names };
        (0, eval)('(function (take) {' + code + '\n})')(take);
        return take.then(() => ({ ok: true, names }), e => ({ ok: false, error: e.message, names }));
      }, { code: a.code, speed: a.speed || 3 });
      let r;
      try {
        r = await Promise.race([run, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), a.timeout || 60000))]);
      } catch (e) {
        if (/context was destroyed|navigat|Target closed/i.test(e.message)) {
          await page.waitForLoadState('load').catch(() => {});
          r = { ok: true, navigated: true };
        } else if (e.message === 'timeout') r = { ok: false, error: 'still running after ' + (a.timeout || 60000) + ' ms' };
        else throw e;
      }
      await ensureLib(page).catch(() => {});
      const where = page.url() !== before ? `\nNow on ${page.url()}` : '';
      if (!r.ok) return { isError: true, content: [{ type: 'text', text: `✖ ${r.error}${where}` }, { type: 'image', data: (await page.screenshot()).toString('base64'), mimeType: 'image/png' }] };
      return text(`✔ done${r.navigated ? ' (the page loaded a new document)' : ''}${r.names ? ': ' + r.names.join(', ') : ''}${where}`);
    }
  },
  {
    name: 'screenshot',
    description: 'A screenshot of the open page.',
    inputSchema: { type: 'object', properties: { fullPage: { type: 'boolean' }, target: { type: 'string', description: 'Only this element.' } } },
    async run(a) {
      const page = needPage();
      let buf;
      if (a.target) {
        await ensureLib(page);
        const h = await page.evaluateHandle(t => window.OneTake.query(t), a.target);
        const el = h.asElement();
        if (!el) throw new Error('target not found: ' + a.target);
        buf = await el.screenshot();
      } else buf = await page.screenshot({ fullPage: !!a.fullPage });
      return withImage(`${await page.title()} · ${page.url()}`, buf);
    }
  },
  {
    name: 'check_tour',
    description: 'Dry-run a demo kit\'s tour (onetake check): plays it with real input, lists every step with its line, and stops at the first failure with the reason and a screenshot. Creates whatever the tour creates in the app.',
    inputSchema: { type: 'object', properties: {
      cwd: { type: 'string', description: 'Demo kit folder. Default: the server\'s working directory.' },
      tour: { type: 'string', description: 'Tour file, if not the config\'s.' },
      url: { type: 'string', description: 'Start page, if not the config\'s.' },
      speed: { type: 'number', description: 'Default 3.' }
    } },
    async run(a) {
      const flags = { speed: a.speed || 3, lead: 0, tail: 0 };
      if (a.url) flags.url = a.url;
      const cfg = kitConfig(a.cwd, flags, a.tour ? [a.tour] : []);
      if (!cfg.url || !cfg.tour.length) throw new Error('No url or tour: pass them, or a cwd with onetake.config.js.');
      const { checkTour } = require('./realtime');
      const base = path.join(path.resolve(cfg.baseDir, cfg.out), 'check');
      fs.mkdirSync(path.dirname(base), { recursive: true });
      const lines = [];
      const r = await checkTour(await browser(), cfg, { base, quiet: true }, m => lines.push(m));
      const steps = r.events.filter(e => e.type === 'step');
      const list = steps.map(s => `  ${String(s.index + 1).padStart(3)}  ${s.name}${s.arg ? '(' + JSON.stringify(s.arg) + ')' : ''}${s.site ? '  ' + s.site : ''}`).join('\n');
      if (!r.error) return text(`✔ all ${steps.length} steps passed in ${r.seconds.toFixed(1)}s\n${list}`);
      const png = (r.failure || []).find(f => f.endsWith('.png'));
      const msg = `✖ ${r.error}\n\nSteps that ran:\n${list}\n\nThe page at the failure: ${(r.failure || []).join(', ')}`;
      return png && fs.existsSync(png)
        ? { isError: true, content: [{ type: 'text', text: msg }, { type: 'image', data: fs.readFileSync(png).toString('base64'), mimeType: 'image/png' }] }
        : { isError: true, content: [{ type: 'text', text: msg }] };
    }
  },
  {
    name: 'record_video',
    description: 'Render the demo kit\'s video (onetake record) and return the files it made. Takes minutes; preview: true renders at 1× scale and 30 fps, about 6× faster.',
    inputSchema: { type: 'object', properties: {
      cwd: { type: 'string', description: 'Demo kit folder. Default: the server\'s working directory.' },
      preview: { type: 'boolean' },
      args: { type: 'array', items: { type: 'string' }, description: 'Extra onetake record flags, e.g. ["--aspect", "9:16"].' }
    } },
    async run(a, notify) {
      const cwd = path.resolve(a.cwd || process.cwd());
      const args = [path.join(ROOT, 'bin', 'onetake.js'), 'record', ...(a.preview ? ['--scale', '1', '--fps', '30'] : []), ...(a.args || [])];
      const out = await new Promise(resolve => {
        const p = spawn(process.execPath, args, { cwd });
        let buf = '', n = 0;
        const on = d => { buf += d; const m = String(d).match(/… ([\d.]+)s of video/); if (m) notify(++n, `${m[1]}s of video rendered`); };
        p.stdout.on('data', on); p.stderr.on('data', on);
        p.on('close', code => resolve({ code, buf }));
      });
      const tail = out.buf.split('\n').filter(l => !/^\s+… /.test(l)).slice(-25).join('\n');
      return out.code === 0 ? text(tail) : { isError: true, content: [{ type: 'text', text: tail }] };
    }
  },
  {
    name: 'get_docs',
    description: 'OneTake documentation. Topics: introduction, getting-started, writing-tours, targets, waiting-and-assertions, camera-and-highlights, recording, output, recipes, api, troubleshooting, ai-agents, mcp, architecture, contributing.',
    inputSchema: { type: 'object', required: ['topic'], properties: { topic: { type: 'string' } } },
    async run(a) {
      const t = String(a.topic).toLowerCase().replace(/\.md$/, '');
      const file = t === 'introduction' ? path.join(ROOT, 'README.md') : path.join(ROOT, 'docs', t + '.md');
      if (!/^[\w-]+$/.test(t) || !fs.existsSync(file)) throw new Error('Unknown topic "' + a.topic + '". ' + TOOLS.find(x => x.name === 'get_docs').description.split('. ')[1]);
      return text(fs.readFileSync(file, 'utf8'));
    }
  }
];

/* ---------- JSON-RPC over stdio ---------- */

function send(msg) { process.stdout.write(JSON.stringify(msg) + '\n'); }

async function handle(msg) {
  const { id, method, params = {} } = msg;
  const reply = result => id !== undefined && send({ jsonrpc: '2.0', id, result });
  const fail = (code, message) => id !== undefined && send({ jsonrpc: '2.0', id, error: { code, message } });
  try {
    switch (method) {
      case 'initialize':
        return reply({
          protocolVersion: PROTOCOLS.includes(params.protocolVersion) ? params.protocolVersion : PROTOCOLS[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'onetake', version: VERSION },
          instructions: INSTRUCTIONS
        });
      case 'notifications/initialized': case 'notifications/cancelled': return;
      case 'ping': return reply({});
      case 'tools/list': return reply({ tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
      case 'tools/call': {
        const tool = TOOLS.find(t => t.name === params.name);
        if (!tool) return fail(-32602, 'Unknown tool: ' + params.name);
        const token = params._meta && params._meta.progressToken;
        const notify = (progress, message) => token !== undefined && send({ jsonrpc: '2.0', method: 'notifications/progress', params: { progressToken: token, progress, message } });
        try { return reply(await tool.run(params.arguments || {}, notify)); }
        catch (e) { return reply({ isError: true, content: [{ type: 'text', text: '✖ ' + e.message }] }); }
      }
      default:
        if (id !== undefined) return fail(-32601, 'Method not found: ' + method);
    }
  } catch (e) { fail(-32603, e.message); }
}

function serve() {
  console.log = (...a) => log(...a);          // stdout is the protocol channel
  let buf = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => {
    buf += chunk;
    let i;
    while ((i = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      let msg;
      try { msg = JSON.parse(line); } catch (e) { send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }); continue; }
      handle(msg);
    }
  });
  const quit = async () => { if (state.browser) await state.browser.close().catch(() => {}); process.exit(0); };
  process.stdin.on('end', quit);
  process.on('SIGINT', quit);
  process.on('SIGTERM', quit);
  log(`onetake MCP server ${VERSION} ready (stdio)`);
}

module.exports = { serve, TOOLS, inspectInPage, formatInspect };
