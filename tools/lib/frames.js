/*
 * Frame-by-frame capture: the page runs on a virtual clock (tools/virtual-time.js)
 * that is advanced exactly 1/fps per frame, then each frame is screenshotted and
 * streamed into ffmpeg. Perfectly smooth at any fps / resolution.
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { fail, startScript, isNavError, attachLogging } = require('./common');

const clockLib = fs.readFileSync(path.join(__dirname, '..', 'virtual-time.js'), 'utf8');

module.exports = async function recordFrames(browser, job) {
  const { opt, scripts, url, lib, baseName, ffmpeg } = job;
  if (!ffmpeg) fail('Frame-by-frame mode needs ffmpeg. Run: npm install (installs ffmpeg-static), or install ffmpeg (macOS: brew install ffmpeg)');

  const context = await browser.newContext({
    viewport: { width: opt.width, height: opt.height },
    deviceScaleFactor: opt.scale,
    storageState: opt.storage || undefined,
    reducedMotion: 'no-preference'
  });
  const seedLine = opt.seed != null ? `window.__OT_SEED = ${opt.seed};\n` : '';
  await context.addInitScript({ content: seedLine + clockLib });
  const page = await context.newPage();
  attachLogging(page);
  const cdp = await context.newCDPSession(page);

  const outFile = baseName + '.mp4';
  const ff = spawn(ffmpeg, [
    '-y', '-loglevel', 'error',
    '-f', 'image2pipe', '-framerate', String(opt.fps), '-c:v', opt.format === 'png' ? 'png' : 'mjpeg', '-i', '-',
    '-vf', `scale=${Math.round(opt.width * opt.scale / 2) * 2}:${Math.round(opt.height * opt.scale / 2) * 2}:flags=lanczos`,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', opt.crf, '-pix_fmt', 'yuv420p',
    '-r', String(opt.fps), '-movflags', '+faststart', outFile
  ], { stdio: ['pipe', 'inherit', 'inherit'] });
  const ffDone = new Promise((res, rej) => ff.on('close', c => c === 0 ? res() : rej(new Error('ffmpeg exited with code ' + c))));

  const dt = 1000 / opt.fps;
  const maxFrames = Math.ceil(opt.max * opt.fps);
  let frames = 0, lastLog = Date.now();
  const t0 = Date.now();

  async function capture() {
    const params = opt.format === 'png'
      ? { format: 'png', fromSurface: true, optimizeForSpeed: true }
      : { format: 'jpeg', quality: 95, fromSurface: true, optimizeForSpeed: true };
    const shot = await cdp.send('Page.captureScreenshot', params);
    const buf = Buffer.from(shot.data, 'base64');
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    frames++;
    if (Date.now() - lastLog > 2000) {
      lastLog = Date.now();
      const rate = frames / ((Date.now() - t0) / 1000);
      process.stdout.write(`  … ${(frames / opt.fps).toFixed(1)}s of video (${frames} frames, ${rate.toFixed(0)} frames/s)\n`);
    }
  }

  /** Advance one frame and capture it. Returns script status, or {nav:true} if the page navigated. */
  async function step() {
    let status;
    try {
      status = await page.evaluate(async d => {
        await window.__otClock.tick(d);
        return { done: window.__otDone, error: window.__otError, pos: window.__otTake ? window.__otTake.pos : null };
      }, dt);
    } catch (e) {
      if (isNavError(e)) return { nav: true };
      throw e;
    }
    await capture();
    return status;
  }

  async function idle(ms) {
    for (let i = 0, n = Math.round(ms / dt); i < n; i++) {
      const s = await step();
      if (s.nav) await page.waitForLoadState('load');
    }
  }

  await page.goto(url, { waitUntil: 'load' });
  await idle(opt.lead);

  let pos = null, error = null;
  for (let i = 0; i < scripts.length && !error; i++) {
    if (i > 0) await page.waitForLoadState('load').catch(() => {});
    await page.addScriptTag({ content: lib });
    console.log(`▶ ${scripts[i].file}`);
    await page.evaluate(startScript, { code: scripts[i].code, speed: opt.speed, startPosition: pos });
    for (;;) {
      if (frames >= maxFrames) { error = `stopped at --max ${opt.max}s`; break; }
      const s = await step();
      if (s.nav) {
        if (i < scripts.length - 1) break;                   // next script continues on the new page
        await page.waitForLoadState('load').catch(() => {});  // last script navigated: keep filming
        continue;
      }
      if (s.pos) pos = s.pos;
      if (s.error) { error = s.error; break; }
      if (s.done) break;
    }
  }
  if (!error) await idle(opt.tail);

  ff.stdin.end();
  await ffDone;
  await context.close();
  const secs = (frames / opt.fps).toFixed(1);
  const took = ((Date.now() - t0) / 1000).toFixed(0);
  if (error) console.error('✖ script error: ' + error + ' (video saved up to that point)');
  console.log(`✔ saved ${outFile}  — ${secs}s @ ${opt.fps} fps, ${opt.width * opt.scale}x${opt.height * opt.scale}, rendered in ${took}s`);
  if (error) process.exitCode = 1;
};
