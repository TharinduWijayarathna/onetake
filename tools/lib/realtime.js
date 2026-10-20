/* Real-time capture: Playwright's live screencast (~25 fps). Fast to make, less smooth. */
const fs = require('fs');
const { execFileSync } = require('child_process');
const { startScript, isNavError, attachLogging } = require('./common');

module.exports = async function recordRealtime(browser, job) {
  const { opt, scripts, url, lib, outDir, baseName, ffmpeg } = job;
  const context = await browser.newContext({
    viewport: { width: opt.width, height: opt.height },
    deviceScaleFactor: opt.scale,
    recordVideo: { dir: outDir, size: { width: opt.width, height: opt.height } },
    storageState: opt.storage || undefined
  });
  const page = await context.newPage();
  attachLogging(page);

  let pos = null;
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(opt.lead);

  for (let i = 0; i < scripts.length; i++) {
    if (i > 0) await page.waitForLoadState('load').catch(() => {});
    await page.addScriptTag({ content: lib });
    console.log(`▶ ${scripts[i].file}`);
    await page.evaluate(startScript, { code: scripts[i].code, speed: opt.speed, startPosition: pos });
    for (;;) {
      let s;
      try {
        s = await page.evaluate(() => ({ done: window.__otDone, error: window.__otError, pos: window.__otTake && window.__otTake.pos }));
      } catch (e) {
        if (isNavError(e) && i < scripts.length - 1) break;            // next script continues on the new page
        if (isNavError(e)) { await page.waitForLoadState('load').catch(() => {}); continue; }
        throw e;
      }
      if (s.pos) pos = s.pos;
      if (s.error) throw new Error(s.error);
      if (s.done) break;
      await page.waitForTimeout(100);
    }
  }

  await page.waitForTimeout(opt.tail);
  const video = page.video();
  await context.close();
  const webm = await video.path();
  fs.renameSync(webm, baseName + '.webm');
  let final = baseName + '.webm';
  if (ffmpeg) {
    execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-i', final, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', opt.crf, '-movflags', '+faststart', baseName + '.mp4']);
    fs.unlinkSync(final);
    final = baseName + '.mp4';
  }
  console.log('✔ saved', final);
};
