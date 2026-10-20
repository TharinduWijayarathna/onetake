#!/usr/bin/env node
/**
 * Recorder integration test: renders the three-page fixture with the CLI and checks the
 * results: one script across page loads, identical timing on a second take, subtitles,
 * chapters, thumbnail, sound, frame, --aspect, and the realtime mode.
 *   npm run test:record
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { serve } = require('./lib/server');
const run = require('./lib/run');
const { findFfmpeg } = require('../tools/lib/common');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, '.output', 'record');
const ffmpeg = findFfmpeg();
const probe = f => spawnSync(ffmpeg, ['-i', f], { encoding: 'utf8' }).stderr;

(async () => {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const server = await serve(ROOT);
  const base = ['record', path.join(__dirname, 'fixtures', 'multipage.tour.js'), '--url', server.url + '/test/fixtures/multipage-index.html',
    '--width', '800', '--height', '500', '--fps', '30', '--now', '2026-11-02T09:00:00Z', '--out', OUT, '--timeline'];
  const checks = [];
  const check = (name, ok, detail) => { checks.push(ok); console.log(`${ok ? '✔' : '✖'} ${name}${ok ? '' : '  → ' + detail}`); };

  const a = await run([...base, '--name', 'a', '--sound']);
  check('take A rendered', a.code === 0, a.out.slice(-600));
  check('one script continued across two page loads', (a.out.match(/↻ page loaded/g) || []).length === 2, a.out);
  const b = await run([...base, '--name', 'b']);
  check('take B rendered', b.code === 0, b.out.slice(-600));
  const ta = JSON.parse(fs.readFileSync(path.join(OUT, 'a.timeline.json'))).events;
  const tb = JSON.parse(fs.readFileSync(path.join(OUT, 'b.timeline.json'))).events;
  const sig = ev => ev.map(e => e.type + (e.name || e.key || '') + '@' + e.t.toFixed(1)).join(' ');
  check('two takes have identical timing', sig(ta) === sig(tb), 'timelines differ');

  const info = probe(path.join(OUT, 'a.mp4'));
  check('mp4 has video, audio and a subtitle track', /Video: h264/.test(info) && /Audio: aac/.test(info) && /Subtitle: mov_text/.test(info), info);
  check('mp4 has chapters', (info.match(/Chapter #/g) || []).length === 3, info);
  check('chapter list for YouTube', fs.readFileSync(path.join(OUT, 'a.chapters.txt'), 'utf8').startsWith('0:00 List\n'), '');
  check('subtitles', /Creating an inquiry/.test(fs.readFileSync(path.join(OUT, 'a.srt'), 'utf8')), '');
  check('thumbnail', fs.statSync(path.join(OUT, 'a.jpg')).size > 5000, '');
  check('raw capture cleaned up', !fs.existsSync(path.join(OUT, 'a.raw.mp4')), '');

  const v = await run([...base, '--name', 'v', '--aspect', '9:16', '--frame', 'ocean', '--intro', 'Inquiries|A short tour', '--formats', 'webm', '--no-thumbnail']);
  const vi = probe(path.join(OUT, 'v.mp4'));
  check('vertical framed render with an intro card and webm', v.code === 0 && /\b450x800\b/.test(vi) && fs.existsSync(path.join(OUT, 'v.webm')), v.out.slice(-600) + vi);

  const r = await run([...base.filter(x => x !== '--timeline'), '--name', 'rt', '--realtime']);
  check('realtime mode', r.code === 0 && /Video: h264/.test(probe(path.join(OUT, 'rt.mp4'))), r.out.slice(-600));

  const f = await run(['check', path.join(__dirname, 'fixtures', 'react.tour.js'), '--url', server.url + '/test/fixtures/vue.html', '--out', OUT, '--speed', '4']);
  check('check mode fails on the wrong page and saves a screenshot', f.code === 1 && fs.existsSync(path.join(OUT, 'check.failure.png')) && /step 1 expect/.test(f.out), f.out.slice(-600));

  await server.close();
  const failed = checks.filter(x => !x).length;
  console.log(failed ? `\n${failed} failed` : `\nall ${checks.length} passed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
