#!/usr/bin/env node
/**
 * MCP server test: starts `onetake mcp`, speaks JSON-RPC to it over stdio and drives the
 * fixture apps through its tools (open, inspect, test targets, run steps, screenshot, check).
 *   node test/e2e/mcp.js
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const { serve } = require('../helpers/server');

const ROOT = path.join(__dirname, '..', '..');

function client() {
  const p = spawn(process.execPath, [path.join(ROOT, 'bin', 'onetake.js'), 'mcp'], { stdio: ['pipe', 'pipe', 'pipe'] });
  let buf = '', id = 0;
  const waiting = new Map(), stray = [];
  p.stdout.on('data', d => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, i); buf = buf.slice(i + 1);
      let msg; try { msg = JSON.parse(line); } catch (e) { stray.push(line); continue; }
      if (waiting.has(msg.id)) { waiting.get(msg.id)(msg); waiting.delete(msg.id); }
    }
  });
  p.stderr.on('data', () => {});
  const call = (method, params) => new Promise(r => { const n = ++id; waiting.set(n, r); p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: n, method, params }) + '\n'); });
  return { call, stray, close: () => { p.stdin.end(); return new Promise(r => p.on('close', r)); } };
}

(async () => {
  const server = await serve(ROOT);
  const c = client();
  const checks = [];
  const check = (name, ok, detail) => { checks.push(ok); console.log(`${ok ? '✔' : '✖'} ${name}${ok ? '' : '  → ' + String(detail).slice(0, 600)}`); };
  const tool = async (name, args) => (await c.call('tools/call', { name, arguments: args })).result;
  const textOf = r => (r.content || []).filter(x => x.type === 'text').map(x => x.text).join('\n');

  const init = await c.call('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } });
  check('initialize', init.result && init.result.serverInfo.name === 'onetake' && init.result.capabilities.tools, JSON.stringify(init));
  const list = await c.call('tools/list', {});
  const names = list.result.tools.map(t => t.name);
  check('tools/list', ['open_page', 'inspect_page', 'test_target', 'run_steps', 'screenshot', 'check_tour', 'record_video', 'get_docs'].every(n => names.includes(n)), names);

  // A kit folder that points at the React fixture
  const kit = fs.mkdtempSync(path.join(os.tmpdir(), 'ot-mcp-'));
  fs.writeFileSync(path.join(kit, 'onetake.config.js'), `module.exports = { url: '${server.url}/test/fixtures/react/', tour: 'tour.js', viewport: { width: 1200, height: 800 } };`);
  fs.copyFileSync(path.join(ROOT, 'test/fixtures/react/tour.js'), path.join(kit, 'tour.js'));

  let r = await tool('open_page', { cwd: kit });
  let t = textOf(r);
  check('open_page lists fields and buttons with unique targets', /label=New task/.test(t) && /role=button\[name="Add task"\]/.test(t) && /disabled/.test(t), t);

  r = await tool('test_target', { target: 'text=Add task' });
  check('test_target: unique', /^✔ text=Add task/.test(textOf(r)), textOf(r));
  r = await tool('test_target', { target: 'text*=a' });
  check('test_target: contains takes the shortest', /^✔/.test(textOf(r)), textOf(r));
  r = await tool('test_target', { target: 'text=Nope' });
  check('test_target: missing', /^✖ text=Nope: nothing matches/.test(textOf(r)), textOf(r));

  r = await tool('run_steps', { code: "take.type('label=New task', 'From MCP').click('text=Add task')" });
  check('run_steps', /^✔ done: type, click/.test(textOf(r)), textOf(r));
  r = await tool('inspect_page', { scope: '#list' });
  check('inspect_page sees the result (scoped)', !r.isError, textOf(r));
  r = await tool('test_target', { target: 'text=From MCP' });
  check('the step really ran', /^✔/.test(textOf(r)), textOf(r));

  r = await tool('screenshot', {});
  check('screenshot', r.content.some(x => x.type === 'image' && x.data.length > 1000), JSON.stringify(r).slice(0, 200));

  // Multi-page navigation through run_steps
  await tool('open_page', { url: server.url + '/test/fixtures/multipage/' });
  r = await tool('run_steps', { code: "take.click('text=New inquiry')" });
  check('run_steps across a page load', /Now on .*form\.html/.test(textOf(r)), textOf(r));
  r = await tool('inspect_page', {});
  check('inspect after navigation', /label=Client name/.test(textOf(r)) && /role=button\[name="Send inquiry"\]/.test(textOf(r)), textOf(r));

  r = await tool('check_tour', { cwd: kit, speed: 4 });
  check('check_tour passes', /^✔ all 6 steps passed/.test(textOf(r)), textOf(r));
  fs.writeFileSync(path.join(kit, 'bad.js'), "take.click('text=Missing button', { timeout: 500 });");
  r = await tool('check_tour', { cwd: kit, tour: 'bad.js' });
  check('check_tour reports the failing line with a screenshot', r.isError && /step 1 click\("text=Missing button"\) at bad\.js:1/.test(textOf(r)) && r.content.some(x => x.type === 'image'), textOf(r));

  r = await tool('get_docs', { topic: 'targets' });
  check('get_docs', /# Targets/.test(textOf(r)), textOf(r).slice(0, 100));
  r = await c.call('tools/call', { name: 'nope', arguments: {} });
  check('unknown tool is an error', !!r.error, JSON.stringify(r));
  check('stdout carries only JSON-RPC', c.stray.length === 0, c.stray.join('\n'));

  await c.close();
  await server.close();
  const failed = checks.filter(x => !x).length;
  console.log(failed ? `\n${failed} failed` : `\nall ${checks.length} passed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
