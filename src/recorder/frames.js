/*
 * Frame-by-frame capture: the page runs on a virtual clock (clock.js) that is
 * advanced exactly 1/fps per frame; each frame is screenshotted and streamed into ffmpeg.
 * Perfectly smooth at any fps / resolution, and identical from take to take.
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { attachLogging, isNavError } = require('./util');
const { runSession, contextOptions, initGlobals, saveFailure } = require('./session');

const clockLib = fs.readFileSync(path.join(__dirname, 'clock.js'), 'utf8');
const even = n => Math.round(n / 2) * 2;

/**
 * Render the tour to `out.file` (H.264). Returns { error, events, track, frames, size, failure }.
 * out: { file, crf, preset }
 */
/**
 * --aspect 9:16 / 1:1 / 4:5 …: a window of that shape that follows the cursor inside the
 * camera's view, captured at full resolution (re-rendered, not upscaled).
 */
function aspectCrop(cfg) {
  if (!cfg.aspect) return null;
  const m = String(cfg.aspect).match(/^(\d+(?:\.\d+)?)[:/x](\d+(?:\.\d+)?)$/);
  if (!m) throw new Error(`--aspect "${cfg.aspect}" should look like 9:16`);
  const ratio = +m[1] / +m[2];
  const vw = cfg.viewport.width, vh = cfg.viewport.height;
  // Portrait output is as tall as the source is wide (1920x1080 → 1080x1920); otherwise as tall as the source.
  const H = even((ratio < 1 ? vw : vh) * cfg.scale), W = even(H * ratio);
  let cx = null, cy = null;
  return {
    W, H, ratio,
    next(cam, pos, dt, scroll) {
      const r = cam && cam.scale > 1.0005 ? { x: cam.x, y: cam.y, w: cam.width, h: cam.height } : { x: 0, y: 0, w: vw, h: vh };
      let w, h;
      if (r.w / r.h > ratio) { h = r.h; w = h * ratio; } else { w = r.w; h = w / ratio; }
      const tx = pos ? pos.x : r.x + r.w / 2, ty = pos ? pos.y : r.y + r.h / 2;
      if (cx == null) { cx = tx; cy = ty; }
      // Follow the cursor with a dead zone in the middle and a soft spring, like a camera operator.
      const dz = 0.18, k = 1 - Math.exp(-dt / 280);
      const want = (c, t, size) => (Math.abs(t - c) < size * dz ? c : t - Math.sign(t - c) * size * dz);
      cx += (want(cx, tx, w) - cx) * k;
      cy += (want(cy, ty, h) - cy) * k;
      cx = Math.min(Math.max(cx, r.x + w / 2), r.x + r.w - w / 2);
      cy = Math.min(Math.max(cy, r.y + h / 2), r.y + r.h - h / 2);
      return { x: cx - w / 2 + scroll.x, y: cy - h / 2 + scroll.y, width: w, height: h, scale: H / h / cfg.scale };
    }
  };
}

module.exports = async function recordFrames(browser, cfg, ffmpeg, out, log = console.log) {
  const context = await browser.newContext(contextOptions(cfg));
  // zoom() is rendered here (re-rasterised, crisp) instead of with a CSS transform
  await context.addInitScript({ content: initGlobals(cfg, "window.__OT_CAMERA = 'external';\n" + clockLib) });
  const page = await context.newPage();
  attachLogging(page);
  const cdp = await context.newCDPSession(page);

  const vw = cfg.viewport.width, vh = cfg.viewport.height;
  const crop = aspectCrop(cfg);
  const W = crop ? crop.W : even(vw * cfg.scale), H = crop ? crop.H : even(vh * cfg.scale);
  const png = cfg.captureFormat === 'png';
  const ff = spawn(ffmpeg, [
    '-y', '-loglevel', 'error',
    '-f', 'image2pipe', '-framerate', String(cfg.fps), '-c:v', png ? 'png' : 'mjpeg', '-i', '-',
    '-vf', `scale=${W}:${H}:flags=lanczos`,
    '-c:v', 'libx264', '-preset', out.preset || 'medium', '-crf', String(out.crf), '-pix_fmt', 'yuv420p',
    '-r', String(cfg.fps), '-movflags', '+faststart', out.file
  ], { stdio: ['pipe', 'inherit', 'inherit'] });
  const ffDone = new Promise((res, rej) => {
    ff.on('error', rej);
    ff.on('close', c => (c === 0 ? res() : rej(new Error('ffmpeg exited with code ' + c))));
  });

  const dt = 1000 / cfg.fps;
  const maxFrames = Math.ceil(cfg.max * cfg.fps);
  let frames = 0, lastLog = Date.now(), lastView = null;
  const t0 = Date.now();

  async function capture(cam, pos, scroll) {
    const params = png
      ? { format: 'png', fromSurface: true, optimizeForSpeed: true }
      : { format: 'jpeg', quality: 95, fromSurface: true, optimizeForSpeed: true };
    lastView = null;
    if (crop) {
      params.clip = crop.next(cam, pos, dt, scroll);
      lastView = { x: params.clip.x - scroll.x, y: params.clip.y - scroll.y, width: params.clip.width, height: params.clip.height };
    } else if (cam && cam.scale > 1.0005) {
      lastView = { x: cam.x, y: cam.y, width: cam.width, height: cam.height };
      // Camera zoom: capture just the camera's rectangle, rendered at a higher scale (sharp text, not upscaled pixels).
      params.clip = { x: cam.x + cam.sx, y: cam.y + cam.sy, width: cam.width, height: cam.height, scale: cam.scale };
    }
    const shot = await cdp.send('Page.captureScreenshot', params);
    if (!ff.stdin.write(Buffer.from(shot.data, 'base64'))) await new Promise(r => ff.stdin.once('drain', r));
    frames++;
    if (Date.now() - lastLog > 2000) {
      lastLog = Date.now();
      const rate = frames / ((Date.now() - t0) / 1000);
      log(`  … ${(frames / cfg.fps).toFixed(1)}s of video (${frames} frames, ${rate.toFixed(0)} frames/s)`);
    }
  }

  const driver = {
    time: () => frames * dt,
    overLimit: () => frames >= maxFrames,
    navGrace: 3,
    navWait: Math.round(3 * cfg.fps),
    async advance() {
      await driver.inputsIdle();                  // trusted input lands before time moves on (deterministic)
      await driver.waitForNav();                  // and a page load in flight finishes first
      let status;
      try {
        status = await page.evaluate(async ({ d, view }) => {
          if (window.OneTake && window.OneTake.view) window.OneTake.view(view);   // keep captions inside the picture
          if (window.__otClock) await window.__otClock.tick(d);
          return window.__otStatus();
        }, { d: dt, view: lastView });
      } catch (e) {
        if (isNavError(e)) return { nav: true };
        throw e;
      }
      await capture(status.cam, status.pos, { x: status.sx || 0, y: status.sy || 0 });
      return status;
    },
    async idle(ms) {
      for (let i = 0, n = Math.round(ms / dt); i < n; i++) {
        const s = await driver.advance();
        if (s.nav) await page.waitForLoadState('load').catch(() => {});
      }
    }
  };

  let result, failure = [];
  try {
    result = await runSession(page, cfg, driver, log);
    if (result.error) failure = await saveFailure(page, out.file.replace(/(\.raw)?\.mp4$/, ''));
  } finally {
    ff.stdin.end();
    await ffDone.catch(e => { if (!result || !result.error) throw e; });
    await context.close();
  }
  return Object.assign(result, { frames, size: { width: W, height: H }, failure, renderSeconds: (Date.now() - t0) / 1000 });
};
