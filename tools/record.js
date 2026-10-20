#!/usr/bin/env node
/**
 * OneTake recorder: plays a OneTake script in Chromium and saves an MP4.
 *
 *   npm install && npx playwright install chromium
 *   node tools/record.js --url http://localhost:3000 --script my-tour.js
 *
 * Capture modes
 *   frame-by-frame (default)  the page runs on a virtual clock stepped exactly 1/fps per
 *                             frame, so the video is perfectly smooth at any fps/resolution.
 *                             Rendering takes longer than real time. No audio.
 *   --realtime                Playwright's live screencast (~25 fps, plays in real time).
 *
 * Options
 *   --url <url|file>      page to open
 *   --script <file>       demo script; repeat for multi-page flows (each runs after the next page load)
 *   --out <dir>           output folder (default ./recordings)
 *   --name <name>         output file name without extension (default demo-<timestamp>)
 *   --width / --height    viewport in CSS px (default 1920 x 1080)
 *   --scale <n>           device pixel ratio, e.g. 2 → 3840x2160 from a 1920x1080 layout (default 1)
 *   --fps <n>             frames per second in frame mode (default 60)
 *   --format jpeg|png     frame capture format (default jpeg q95; png is lossless but slower)
 *   --crf <n>             x264 quality, lower = better (default 16)
 *   --seed <n>            fix Math.random so every take is identical
 *   --speed <n>           OneTake speed multiplier (default 1)
 *   --storage <file>      Playwright storageState JSON to start logged in
 *   --lead <ms> / --tail <ms>   still time before / after the script (default 800 / 1200)
 *   --max <seconds>       safety limit on video length in frame mode (default 900)
 *   --headed              show the browser window
 *
 * A script file is plain JavaScript run inside the page with a ready `take` in scope:
 *   take.caption('Creating an invoice').click('text=New invoice').type('label=Amount', '120');
 */
const fs = require('fs');
const path = require('path');
const { fail, loadPlaywright, findFfmpeg, readLibrary } = require('./lib/common');

function parseArgs(argv) {
  const a = { script: [] };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (!k.startsWith('--')) continue;
    const key = k.slice(2);
    if (key === 'headed' || key === 'realtime') { a[key] = true; continue; }
    const v = argv[++i];
    if (key === 'script') a.script.push(v); else a[key] = v;
  }
  return a;
}

const args = parseArgs(process.argv.slice(2));
if (!args.url || !args.script.length) {
  fail('Usage: node tools/record.js --url <url> --script <file> [--script <file2>] [--fps 60] [--out dir]');
}

const opt = {
  width: +(args.width || 1920),
  height: +(args.height || 1080),
  scale: +(args.scale || 1),
  fps: +(args.fps || 60),
  format: args.format === 'png' ? 'png' : 'jpeg',
  crf: String(args.crf || 16),
  speed: +(args.speed || 1),
  lead: +(args.lead || 800),
  tail: +(args.tail || 1200),
  max: +(args.max || 900),
  seed: args.seed != null ? +args.seed : null,
  storage: args.storage || null
};

const outDir = path.resolve(args.out || 'recordings');
fs.mkdirSync(outDir, { recursive: true });

const job = {
  opt,
  outDir,
  baseName: path.join(outDir, args.name || 'demo-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)),
  lib: readLibrary(),
  scripts: args.script.map(f => ({ file: f, code: fs.readFileSync(path.resolve(f), 'utf8') })),
  url: /^[a-z]+:\/\//i.test(args.url) ? args.url : 'file://' + path.resolve(args.url),
  ffmpeg: findFfmpeg()
};

(async () => {
  const { chromium } = loadPlaywright();
  const launch = { headless: !args.headed };
  if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
  const browser = await chromium.launch(launch);
  try {
    const record = args.realtime ? require('./lib/realtime') : require('./lib/frames');
    await record(browser, job);
  } finally {
    await browser.close();
  }
})().catch(e => fail(e.message));
