/**
 * onetake: record product demo videos from a OneTake tour script.
 *
 *   onetake setup                        install the Chromium build OneTake's Playwright needs
 *   onetake init                         scaffold a demo kit here (from templates/demo-kit)
 *   onetake check  [tour.js] [options]   play the tour without recording, fast; report each step
 *   onetake record [tour.js] [options]   render the video (60 fps frame by frame by default)
 *   onetake login  --url <login page> [--until <regex>] [--out auth.json]   save a signed-in session
 *   onetake help
 *
 * Settings come from onetake.config.js (if present), then from options. See docs/recording.md.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { fail, findFfmpeg, launchChromium, installBrowser } = require('./util');
const { parseArgs, resolveConfig } = require('./config');

const HELP = `
OneTake: scripted product demo videos

Usage
  onetake setup [--with-deps]           install the Chromium build OneTake uses (once)
  onetake init [folder]                 create a demo kit: onetake.config.js, tour.js, steps.js, record.sh
  onetake check  [tour.js…] [options]   dry run: play the tour (no video), stop at the first broken step
  onetake record [tour.js…] [options]   render the video
  onetake login  --url <login page> [--until <regex>] [--out auth.json]
  onetake mcp                           MCP server for AI agents (inspect pages, test targets, check, record)
  onetake help

Page and tour
  --url <url|file>          first page                     --include <file>   shared steps (repeatable)
  --storage <auth.json>     start signed in (onetake login) --config <file>    config file to use
  --now <date>              the app's clock, e.g. 2026-11-01T09:00   --seed <n>  fixed randomness (default 7)
  --speed <n>               tour speed (check runs at the given speed, default 1)

Capture
  --width / --height <px>   viewport (default 1920x1080)   --scale <n>   pixel ratio (2 = 4K from 1080p)
  --fps <n>                 frames per second (default 60) --realtime    live screencast instead of frame by frame
  --aspect 9:16 | 1:1 | 4:5 crop that follows the cursor   --auto-zoom   zoom in on each click
  --max <s>                 safety limit on length         --headed      show the browser
  --format jpeg|png  --crf <n>  --lead <ms>  --tail <ms>   --no-real-input  synthetic events only

Output
  --out <dir>               folder (default ./recordings)  --name <name>  file name (default demo-<time>)
  --frame [background]      window frame on a background: gradient | ocean | sunset | forest | dark | light |
                            any CSS colour/gradient | an image   (--padding, --radius, --title, --chrome mac|none)
  --intro "Title|Subtitle"  title card at the start        --outro "Title|Subtitle"  card at the end
  --sound                   click and key sounds           --music <file>  background music (--music-volume 0.18)
  --formats mp4,webm,gif    extra formats                  --no-subtitles --no-chapters --no-thumbnail
  --timeline                also write <name>.timeline.json
  --watch                   re-run when the tour, includes or config change
`;

const KIT = path.join(__dirname, '..', '..', 'templates', 'demo-kit');

/** Scaffold a demo kit (onetake.config.js, tour.js, steps.js, record.sh) from templates/demo-kit. */
function init(dir) {
  const target = path.resolve(dir || '.');
  fs.mkdirSync(target, { recursive: true });
  for (const name of fs.readdirSync(KIT)) {
    if (name.startsWith('.')) continue;
    const f = path.join(target, name);
    if (fs.existsSync(f)) { console.log('  · ' + name + ' exists, left as is'); continue; }
    fs.copyFileSync(path.join(KIT, name), f);
    if (name.endsWith('.sh')) fs.chmodSync(f, 0o755);
    console.log('  + ' + path.relative(process.cwd(), f));
  }
  const gi = path.join(target, '.gitignore');
  const ignore = ['videos/', 'recordings/', 'auth.json', 'node_modules/'];
  const have = fs.existsSync(gi) ? fs.readFileSync(gi, 'utf8') : '';
  const missing = ignore.filter(l => !have.split(/\r?\n/).includes(l));
  if (missing.length) { fs.appendFileSync(gi, (have && !have.endsWith('\n') ? '\n' : '') + missing.join('\n') + '\n'); console.log('  + .gitignore: ' + missing.join(' ')); }
  console.log('\nNext: set url in onetake.config.js and write tour.js, then\n  npx onetake check     # quick dry run\n  npx onetake record    # the video\n(or: bash record.sh, which signs in, checks and renders)');
}

function login(argv) {
  const r = spawnSync(process.execPath, [path.join(__dirname, 'login.js'), ...argv], { stdio: 'inherit' });
  process.exit(r.status == null ? 1 : r.status);
}

function launch(cfg) { return launchChromium(!cfg.headed); }

function validate(cfg) {
  if (!cfg.url) fail('No page to open. Give --url, or set url in onetake.config.js (try: onetake init).');
  if (!cfg.tour.length) fail('No tour script. Give one (onetake record tour.js), or set tour in onetake.config.js.');
}

function baseName(cfg) {
  const out = path.resolve(cfg.out);
  fs.mkdirSync(out, { recursive: true });
  return path.join(out, cfg.name || 'demo-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19));
}

function reportError(result) {
  console.error('\n✖ ' + result.error);
  if (result.failure && result.failure.length) console.error('  saved for debugging: ' + result.failure.map(f => path.relative(process.cwd(), f)).join(', '));
}

async function check(cfg, browser) {
  const { checkTour } = require('./realtime');
  const base = baseName(Object.assign({}, cfg, { name: 'check' }));   // <out>/check.failure.png
  const quick = Object.assign({}, cfg, { lead: 0, tail: 0 });
  console.log(`▶ checking ${cfg.tour.map(t => path.relative(process.cwd(), t)).join(', ')} on ${cfg.url}`);
  const result = await checkTour(browser, quick, { base });
  if (result.error) { reportError(result); return false; }
  const steps = result.events.filter(e => e.type === 'step').length;
  console.log(`✔ all ${steps} steps passed in ${result.seconds.toFixed(1)}s`);
  return true;
}

async function record(cfg, browser) {
  const { render, needsRender } = require('./render');
  const ffmpeg = findFfmpeg();
  const base = baseName(cfg);
  const t0 = Date.now();
  let result, raw;
  console.log(`▶ recording ${cfg.tour.map(t => path.relative(process.cwd(), t)).join(', ')} on ${cfg.url}`);
  if (cfg.mode === 'realtime') {
    const { recordRealtime } = require('./realtime');
    raw = base + '.raw.webm';
    result = await recordRealtime(browser, cfg, { file: raw, base });
    result.size = { width: Math.round(cfg.viewport.width * cfg.scale / 2) * 2, height: Math.round(cfg.viewport.height * cfg.scale / 2) * 2 };
    if (cfg.aspect) console.warn('⚠ --aspect needs frame-by-frame mode; ignored with --realtime');
    if (!ffmpeg) {
      fs.renameSync(raw, base + '.webm');
      console.warn('⚠ ffmpeg not found: saved the raw screencast only (' + base + '.webm)');
      if (result.error) reportError(result);
      return !result.error;
    }
  } else {
    if (!ffmpeg) fail('Frame-by-frame mode needs ffmpeg. Run: npm install (installs ffmpeg-static), or install ffmpeg (macOS: brew install ffmpeg)');
    const recordFrames = require('./frames');
    raw = base + '.raw.mp4';
    const finish = needsRender(cfg);
    result = await recordFrames(browser, cfg, ffmpeg, { file: raw, crf: finish ? Math.min(10, cfg.crf) : cfg.crf, preset: finish ? 'fast' : 'medium' });
  }
  if (result.error) reportError(result);
  if (cfg.timeline) fs.writeFileSync(base + '.timeline.json', JSON.stringify({ events: result.events, track: result.track }, null, 1));
  console.log('▶ finishing');
  const out = await render({ browser, ffmpeg, cfg, raw, base, result });
  fs.rmSync(raw, { force: true });
  const rel = f => path.relative(process.cwd(), f);
  const size = result.size;
  console.log(`✔ ${rel(out.files[0])}  ${out.duration.toFixed(1)}s · ${size.width}x${size.height} · ${cfg.mode === 'realtime' ? 'realtime' : cfg.fps + ' fps'} · made in ${((Date.now() - t0) / 1000).toFixed(0)}s` +
    (result.error ? '  (up to the error)' : ''));
  if (out.files.length > 1) console.log('  also: ' + out.files.slice(1).map(rel).join(', '));
  return !result.error;
}

function watchFiles(cfg, run) {
  const files = [...cfg.tour, ...cfg.include, cfg.configFile].filter(Boolean);
  let timer = null, busy = false, again = false;
  const trigger = () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      if (busy) { again = true; return; }
      busy = true;
      console.log('\n↻ change detected\n');
      try { await run(); } catch (e) { console.error('✖ ' + e.message); }
      busy = false;
      if (again) { again = false; trigger(); }
    }, 150);
  };
  files.forEach(f => fs.watchFile(f, { interval: 300 }, (cur, prev) => { if (cur.mtimeMs !== prev.mtimeMs) trigger(); }));   // survives editors' atomic saves
  console.log(`\n👀 watching ${files.map(f => path.relative(process.cwd(), f)).join(', ')} (Ctrl+C to stop)`);
}

async function main(argv) {
  if (argv[0] === 'login') return login(argv.slice(1));     // login has its own options (--check, --until, …)
  if (argv[0] === 'setup') process.exit(installBrowser(argv.slice(1)));  // Chromium for this Playwright version
  if (argv[0] === 'mcp') return require('./mcp').serve();    // MCP server for AI agents, over stdio
  let parsed;
  try { parsed = parseArgs(argv); } catch (e) { fail(e.message); }
  const cmd = parsed.command || 'help';
  if (cmd === 'help' || parsed.meta.help) { console.log(HELP); return; }
  if (cmd === 'init') return init(parsed.positional[0]);
  if (cmd !== 'record' && cmd !== 'check') fail(`Unknown command "${cmd}". Run: onetake help`);

  const load = () => { const c = resolveConfig(parsed); validate(c); return c; };
  let cfg;
  try { cfg = load(); } catch (e) { fail(e.message); }
  const browser = await launch(cfg);
  const run = async () => {
    const c = load();                                  // pick up config edits in watch mode
    return cmd === 'check' ? check(c, browser) : record(c, browser);
  };
  const ok = await run().catch(e => { console.error('✖ ' + e.message); return false; });
  if (parsed.meta.watch) { watchFiles(cfg, run); return; }
  await browser.close();
  if (!ok) process.exitCode = 1;
}

/** Entry point for bin/onetake.js. */
function run(argv = process.argv.slice(2)) {
  main(argv).catch(e => fail(e.stack || e.message));
}

module.exports = { main, run };
