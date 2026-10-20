#!/usr/bin/env node
/**
 * Visual regression: renders the three-page fixture frame by frame and compares a few
 * frames with the golden images in test/golden/ (SSIM via ffmpeg). Fonts differ between
 * machines, so goldens are only comparable on the machine (or CI image) that made them.
 *   npm run test:visual             compare
 *   node test/visual.js --update    write new goldens
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { serve } = require('./lib/server');
const run = require('./lib/run');
const { findFfmpeg } = require('../tools/lib/common');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, '.output', 'visual');
const GOLD = path.join(__dirname, 'golden');
const TIMES = [1.0, 3.0, 6.5, 12.6];      // list page, form typing, select, confirmation
const MIN_SSIM = 0.985;
const update = process.argv.includes('--update');
const ffmpeg = findFfmpeg();

(async () => {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync(GOLD, { recursive: true });
  const server = await serve(ROOT);
  const r = await run(['record', path.join(__dirname, 'fixtures', 'multipage.tour.js'), '--url', server.url + '/test/fixtures/multipage-index.html',
    '--width', '640', '--height', '400', '--fps', '30', '--now', '2026-11-02T09:00:00Z', '--seed', '3', '--out', OUT, '--name', 'v',
    '--frame', '--no-subtitles', '--no-chapters', '--no-thumbnail', '--format', 'png']);
  await server.close();
  if (r.code !== 0) { console.error(r.out); process.exit(1); }
  let failed = 0;
  for (const t of TIMES) {
    const name = `multipage-${t.toFixed(1)}s.png`;
    const got = path.join(OUT, name);
    spawnSync(ffmpeg, ['-loglevel', 'error', '-y', '-ss', String(t), '-i', path.join(OUT, 'v.mp4'), '-frames:v', '1', got]);
    const gold = path.join(GOLD, name);
    if (update || !fs.existsSync(gold)) { fs.copyFileSync(got, gold); console.log(`+ ${path.relative(ROOT, gold)}`); continue; }
    const s = spawnSync(ffmpeg, ['-i', got, '-i', gold, '-lavfi', 'ssim', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
    const m = /All:([\d.]+)/.exec(s);
    const ssim = m ? +m[1] : 0;
    const ok = ssim >= MIN_SSIM;
    if (!ok) failed++;
    console.log(`${ok ? '✔' : '✖'} ${name}  SSIM ${ssim.toFixed(4)}${ok ? '' : `  (< ${MIN_SSIM}; compare ${path.relative(ROOT, got)} with the golden)`}`);
  }
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
