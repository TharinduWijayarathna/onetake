#!/usr/bin/env node
/**
 * OneTake Studio: make a demo by using your app.
 *
 *   node tools/studio.js --url http://localhost:3000 [--out my-demo]
 *
 * A browser opens with the OneTake toolbar on top of your app:
 *   ● Record      click, type, select and check as you normally would; page loads are tracked
 *   ✎ Mark        pick an element on the page → Zoom (for N seconds), Circle, Box, Underline,
 *                 Arrow, Spotlight or Pulse, with an optional label (↑/↓ = parent/child element)
 *   💬 Caption    add a line of narration       ⤢ Zoom out     ⏱ Wait
 *   ☰ Steps       the timeline: edit, reorder or delete steps
 *   Generate      writes one OneTake script per page load (+ render.sh) into --out
 *   Render        renders the video to <out>/videos/demo.mp4 (frame by frame, 60 fps)
 *
 * Options
 *   --url <url>          page to start on
 *   --out <dir>          where scripts, studio.json and videos go (default ./studio-demo)
 *   --width / --height   browser viewport, also used for the video (default 1440 x 900)
 *   --storage <file>     start signed in (Playwright storageState, see tools/save-login.js)
 *   --new                ignore a saved session in <out>/studio.json and start fresh
 *   --headless           no window (for automated tests)
 */
const fs = require('fs');
const path = require('path');
const { fail, loadPlaywright, readLibrary } = require('./lib/common');
const { Session } = require('./studio/session');

const CLIENT_DIR = path.join(__dirname, 'studio', 'client');

function clientSource() {
  const parts = fs.readdirSync(CLIENT_DIR).filter(f => f.endsWith('.js')).sort()
    .map(f => `/* ---- ${f} ---- */\n` + fs.readFileSync(path.join(CLIENT_DIR, f), 'utf8'));
  return `(function () {
  if (window.top !== window || window.__otStudioClient) return;
  window.__otStudioClient = true;
${parts.join('\n')}
})();`;
}

function optional(mod) {
  try { return require(mod); } catch (e) { if (e.code === 'MODULE_NOT_FOUND') return null; throw e; }
}

async function startStudio(opts) {
  const { chromium } = loadPlaywright();
  const outDir = path.resolve(opts.out || 'studio-demo');
  const viewport = { width: +(opts.width || 1440), height: +(opts.height || 900) };
  const sessionFile = path.join(outDir, 'studio.json');
  if (opts.fresh && fs.existsSync(sessionFile)) fs.unlinkSync(sessionFile);
  const session = new Session(sessionFile, { viewport });
  session.data.viewport = viewport;

  const launch = { headless: !!opts.headless, args: opts.headless ? [] : [`--window-size=${viewport.width},${viewport.height + 120}`] };
  if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
  const browser = await chromium.launch(launch);
  const context = await browser.newContext({ viewport, storageState: opts.storage || undefined });

  const generator = optional('./studio/generate');
  const renderer = optional('./studio/render');
  const render = renderer ? renderer.createRenderer(session, context, outDir) : null;

  // The page talks to the session through one binding; every call returns the new state.
  await context.exposeBinding('__otStudio', async (source, msg) => {
    const pageUrl = source.page ? source.page.url() : null;
    switch (msg && msg.op) {
      case 'hello': return Object.assign(session.state(), { caps: { generate: !!generator, render: !!render } });
      case 'pageLoaded': return session.pageLoaded(msg.url);
      case 'setRecording': return session.setRecording(msg.on, pageUrl);
      case 'add': return session.recording || msg.force ? session.add(msg.step) : session.state();
      case 'update': return session.update(msg.id, msg.patch || {});
      case 'remove': return session.remove(msg.id);
      case 'move': return session.move(msg.id, msg.dir);
      case 'clear': return session.clear();
      case 'generate':
        if (!generator) return { error: 'Generate is not available in this version.' };
        try { return Object.assign(session.state(), { result: generator.generate(session, outDir) }); }
        catch (e) { return { error: e.message }; }
      case 'render':
        if (!render) return { error: 'Render is not available in this version.' };
        try { return { status: await render.render(msg.opts) }; } catch (e) { return { error: e.message }; }
      case 'renderStatus': return { status: render ? render.status : null };
      default: return { error: 'unknown op ' + (msg && msg.op) };
    }
  });
  await context.addInitScript({ content: readLibrary() });     // OneTake's element finders for selectors/preview
  await context.addInitScript({ content: clientSource() });

  const page = await context.newPage();
  await page.goto(opts.url);
  return { browser, context, page, session, outDir, render };
}

if (require.main === module) {
  const args = {};
  for (let i = 2; i < process.argv.length; i++) {
    const k = process.argv[i];
    if (!k.startsWith('--')) continue;
    const key = k.slice(2), next = process.argv[i + 1];
    if (!next || next.startsWith('--')) args[key] = true; else { args[key] = next; i++; }
  }
  if (!args.url) fail('Usage: node tools/studio.js --url <page to start on> [--out dir] [--storage auth.json]');
  const url = /^[a-z]+:\/\//i.test(args.url) ? args.url : 'file://' + path.resolve(args.url);
  startStudio({ url, out: args.out, width: args.width, height: args.height, storage: args.storage, fresh: args.new, headless: args.headless })
    .then(({ browser, outDir }) => {
      console.log(`OneTake Studio is open. Press ● Record in the toolbar, use your app, then Generate or Render.`);
      console.log(`Session and scripts: ${outDir}`);
      browser.on('disconnected', () => process.exit(0));
    })
    .catch(e => fail(e.message));
}

module.exports = { startStudio, clientSource };
