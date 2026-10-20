/*
 * Finishing: turns the raw capture and its timeline into the final files.
 *   framed output   background, padding, rounded corners, shadow, window chrome
 *   intro / outro   title cards that cross-fade into the video
 *   audio           synthesised click and key sounds, optional background music
 *   subtitles       .srt / .vtt from captions, plus a soft subtitle track in the mp4
 *   chapters        from take.chapter(): mp4 chapter markers + a YouTube-ready list
 *   thumbnail       .jpg from take.thumbnail() (or a sensible moment)
 *   formats         .webm and .gif next to the .mp4
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync, spawnSync } = require('child_process');
const { synthTrack, writeWav } = require('./audio');

const XF = 0.5; // cross-fade between cards and the video (s)

const BACKGROUNDS = {
  gradient: 'linear-gradient(135deg,#a5b4fc 0%,#6366f1 45%,#4338ca 100%)',
  ocean: 'linear-gradient(135deg,#7dd3fc 0%,#2563eb 55%,#1e3a8a 100%)',
  sunset: 'linear-gradient(135deg,#fdba74 0%,#ec4899 55%,#7c3aed 100%)',
  forest: 'linear-gradient(135deg,#bbf7d0 0%,#10b981 50%,#065f46 100%)',
  dark: 'radial-gradient(circle at 30% 20%,#334155 0%,#0f172a 70%)',
  light: 'linear-gradient(135deg,#ffffff 0%,#e2e8f0 100%)'
};

const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function dataUrl(file) {
  const ext = path.extname(file).slice(1).toLowerCase();
  const type = ext === 'svg' ? 'image/svg+xml' : ext === 'jpg' ? 'image/jpeg' : 'image/' + ext;
  return `data:${type};base64,${fs.readFileSync(file).toString('base64')}`;
}

function backgroundCss(bg) {
  if (!bg) return BACKGROUNDS.gradient;
  if (BACKGROUNDS[bg]) return BACKGROUNDS[bg];
  if (/\.(png|jpe?g|webp)$/i.test(bg) && fs.existsSync(bg)) return `center / cover no-repeat url("${dataUrl(bg)}")`;
  return bg; // any CSS colour or gradient
}

/** Video duration (s) by asking ffmpeg (ffprobe isn't always installed). */
function durationOf(ffmpeg, file) {
  const r = spawnSync(ffmpeg, ['-i', file], { encoding: 'utf8' });
  const m = /Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(r.stderr || '');
  return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : 0;
}

/** Where the video sits inside the frame, in output pixels. */
function frameLayout(cfg, W, H) {
  const f = cfg.frame, k = cfg.scale;
  const pad = Math.round(f.padding * k);
  const bar = f.chrome && f.chrome !== 'none' ? Math.round(36 * k) : 0;
  const availW = W - 2 * pad, availH = H - 2 * pad - bar;
  let w = availW, h = Math.round(availW * H / W);
  if (h > availH) { h = availH; w = Math.round(availH * W / H); }
  w -= w % 2; h -= h % 2;
  const x = Math.round((W - w) / 2), y = Math.round((H - h - bar) / 2) + bar;
  return { x, y, w, h, bar, radius: Math.round(f.radius * k) };
}

/** The frame's background (with window, shadow and title bar) and the rounded mask for the video. */
function frameHtml(cfg, W, H, L) {
  const f = cfg.frame, k = cfg.scale, r = L.radius;
  const shadow = f.shadow ? `box-shadow:0 ${30 * k}px ${80 * k}px rgba(15,23,42,.45),0 ${6 * k}px ${18 * k}px rgba(15,23,42,.25);` : '';
  const dots = f.chrome === 'mac'
    ? ['#ff5f57', '#febc2e', '#28c840'].map((c, i) => `<i style="position:absolute;top:${12 * k}px;left:${(14 + i * 20) * k}px;width:${12 * k}px;height:${12 * k}px;border-radius:50%;background:${c}"></i>`).join('')
    : '';
  const bar = L.bar ? `<div style="position:absolute;left:0;right:0;top:0;height:${L.bar}px;background:#f1f5f9;border-bottom:1px solid #e2e8f0;border-radius:${r}px ${r}px 0 0">${dots}
      <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font:500 ${13 * k}px system-ui,-apple-system,'Segoe UI',sans-serif;color:#475569">${esc(f.title)}</div></div>` : '';
  const page = `<!doctype html><html><body style="margin:0;width:${W}px;height:${H}px;overflow:hidden;background:${backgroundCss(f.background)}">
    <div style="position:absolute;left:${L.x}px;top:${L.y - L.bar}px;width:${L.w}px;height:${L.h + L.bar}px;border-radius:${r}px;background:#fff;${shadow}">${bar}</div></body></html>`;
  const radii = L.bar ? `0 0 ${r}px ${r}px` : `${r}px`;
  const mask = `<!doctype html><html><body style="margin:0;width:${L.w}px;height:${L.h}px;background:#000;overflow:hidden">
    <div style="width:${L.w}px;height:${L.h}px;background:#fff;border-radius:${radii}"></div></body></html>`;
  return { page, mask };
}

function cardHtml(card, cfg, W, H) {
  const k = H / 1080;
  const bg = backgroundCss(card.background || (cfg.frame && cfg.frame.background) || 'gradient');
  const light = /^(light|#f|#e|white)/i.test(card.background || '');
  const color = card.color || (light ? '#0f172a' : '#ffffff');
  const logo = card.logo && fs.existsSync(card.logo) ? `<img src="${dataUrl(card.logo)}" style="max-height:${110 * k}px;max-width:${520 * k}px;margin-bottom:${40 * k}px">` : '';
  return `<!doctype html><html><body style="margin:0;width:${W}px;height:${H}px;overflow:hidden;background:${bg};display:flex;align-items:center;justify-content:center;flex-direction:column;text-align:center;color:${color};font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif">
    ${logo}<div style="font-weight:700;font-size:${76 * k}px;letter-spacing:-.02em;line-height:1.1;max-width:80%">${esc(card.title)}</div>
    ${card.subtitle ? `<div style="margin-top:${22 * k}px;font-size:${32 * k}px;opacity:.85;max-width:75%">${esc(card.subtitle)}</div>` : ''}</body></html>`;
}

async function shoot(browser, html, w, h, file) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'load' });
  await page.screenshot({ path: file, omitBackground: false });
  await page.close();
}

/* ---------- subtitles and chapters ---------- */

function captionCues(events, end) {
  const cues = [];
  let open = null;
  const close = t => { if (open) { open.end = Math.max(open.start + 0.3, Math.min(t, open.end || t)); cues.push(open); open = null; } };
  for (const e of events) {
    const t = e.t / 1000;
    if (e.type === 'caption') {
      if (open && open.text === e.text) continue;            // the same caption carried over a page load
      close(t);
      open = { start: t + 0.15, text: e.text, end: e.duration ? t + e.duration / 1000 : null };
    } else if (e.type === 'captionHide') close(t);
  }
  close(end);
  return cues;
}

const stamp = (s, sep) => {
  const ms = Math.max(0, Math.round(s * 1000));
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)}${sep}${p(ms % 1000, 3)}`;
};
const toSrt = cues => cues.map((c, i) => `${i + 1}\n${stamp(c.start, ',')} --> ${stamp(c.end, ',')}\n${c.text}\n`).join('\n');
const toVtt = cues => 'WEBVTT\n\n' + cues.map(c => `${stamp(c.start, '.')} --> ${stamp(c.end, '.')}\n${c.text}\n`).join('\n');

function chapterList(events, shift, total, intro) {
  const list = events.filter(e => e.type === 'chapter').map(e => ({ start: e.t / 1000 + shift, title: e.title }));
  if (!list.length) return [];
  if (list[0].start > shift + 1.5) list.unshift({ start: 0, title: intro ? 'Intro' : 'Start' });   // (the lead-in doesn't count)
  else list[0].start = 0;
  list.forEach((c, i) => { c.end = i + 1 < list.length ? list[i + 1].start : total; });
  return list;
}
const ffmeta = chapters => ';FFMETADATA1\n' + chapters.map(c =>
  `[CHAPTER]\nTIMEBASE=1/1000\nSTART=${Math.round(c.start * 1000)}\nEND=${Math.round(c.end * 1000)}\ntitle=${c.title.replace(/[=;#\\\n]/g, m => '\\' + m)}\n`).join('');
const youtube = chapters => chapters.map(c => {
  const s = Math.floor(c.start);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} ${c.title}`;
}).join('\n') + '\n';

/* ---------- the render ---------- */

/**
 * raw: path of the captured video. result: { events, size: {width,height} }.
 * Writes <base>.mp4 (+ .srt/.vtt, .chapters.txt, .jpg, .webm, .gif). Returns the list of files.
 */
async function render({ browser, ffmpeg, cfg, raw, base, result, log = console.log }) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'onetake-render-'));
  const files = [];
  try {
    const W = result.size.width, H = result.size.height;
    const mainDur = durationOf(ffmpeg, raw);
    const fps = cfg.mode === 'realtime' ? 30 : cfg.fps;
    const intro = cfg.intro ? Object.assign({ duration: 2.5 }, cfg.intro) : null;
    const outro = cfg.outro ? Object.assign({ duration: 3 }, cfg.outro) : null;
    const shift = intro ? intro.duration - XF : 0;                 // where the video starts in the final cut
    const total = shift + mainDur + (outro ? outro.duration - XF : 0);
    const events = result.events || [];

    const inputs = ['-i', raw];
    const filters = [];
    let v = '[0:v]';
    const add = (...args) => { inputs.push(...args); return inputs.filter(a => a === '-i').length - 1; };

    filters.push(`${v}fps=${fps},format=yuv420p,setsar=1,settb=AVTB[base]`); v = '[base]';

    if (cfg.frame) {
      const L = frameLayout(cfg, W, H);
      const { page, mask } = frameHtml(cfg, W, H, L);
      await shoot(browser, page, W, H, path.join(tmp, 'frame.png'));
      await shoot(browser, mask, L.w, L.h, path.join(tmp, 'mask.png'));
      const bi = add('-loop', '1', '-framerate', String(fps), '-i', path.join(tmp, 'frame.png'));
      const mi = add('-loop', '1', '-framerate', String(fps), '-i', path.join(tmp, 'mask.png'));
      filters.push(`${v}scale=${L.w}:${L.h}:flags=lanczos,format=rgba[vs]`, `[${mi}:v]format=gray[m]`, `[vs][m]alphamerge[va]`,
        `[${bi}:v]format=rgba[bg]`, `[bg][va]overlay=${L.x}:${L.y}:shortest=1,format=yuv420p,fps=${fps},settb=AVTB[framed]`);
      v = '[framed]';
    }

    const card = async (c, name) => {
      const f = path.join(tmp, name + '.png');
      await shoot(browser, cardHtml(c, cfg, W, H), W, H, f);
      const i = add('-loop', '1', '-framerate', String(fps), '-t', String(c.duration), '-i', f);
      filters.push(`[${i}:v]fps=${fps},format=yuv420p,setsar=1,settb=AVTB[${name}]`);
      return `[${name}]`;
    };
    if (intro) {
      const c = await card(intro, 'intro');
      filters.push(`${c}${v}xfade=transition=fade:duration=${XF}:offset=${(intro.duration - XF).toFixed(3)}[wi]`);
      v = '[wi]';
    }
    if (outro) {
      const c = await card(outro, 'outro');
      filters.push(`${v}${c}xfade=transition=fade:duration=${XF}:offset=${(shift + mainDur - XF).toFixed(3)}[wo]`);
      v = '[wo]';
    }

    /* audio: synthesised UI sounds + music */
    let a = null;
    if (cfg.sound) {
      const wav = path.join(tmp, 'sfx.wav');
      writeWav(wav, synthTrack(events, total, shift, cfg.seed || 7));
      const i = add('-i', wav);
      filters.push(`[${i}:a]anull[sfx]`);
      a = '[sfx]';
    }
    if (cfg.music) {
      if (!fs.existsSync(cfg.music)) throw new Error('music file not found: ' + cfg.music);
      const i = add('-stream_loop', '-1', '-i', cfg.music);
      const fadeAt = Math.max(0, total - 2.5);
      filters.push(`[${i}:a]atrim=0:${total.toFixed(3)},volume=${cfg.musicVolume},afade=t=in:d=1.2,afade=t=out:st=${fadeAt.toFixed(3)}:d=2.5[mus]`);
      if (a) { filters.push(`${a}[mus]amix=inputs=2:duration=longest:normalize=0[aud]`); a = '[aud]'; } else a = '[mus]';
    }

    /* subtitles */
    const cues = cfg.subtitles ? captionCues(events, mainDur).map(c => ({ start: c.start + shift, end: c.end + shift, text: c.text })) : [];
    let srt = null;
    if (cues.length) {
      srt = base + '.srt';
      fs.writeFileSync(srt, toSrt(cues));
      fs.writeFileSync(base + '.vtt', toVtt(cues));
      files.push(srt, base + '.vtt');
    }

    /* chapters */
    const chapters = cfg.chapters ? chapterList(events, shift, total, !!intro) : [];
    let meta = null;
    if (chapters.length) {
      meta = path.join(tmp, 'chapters.txt');
      fs.writeFileSync(meta, ffmeta(chapters));
      fs.writeFileSync(base + '.chapters.txt', youtube(chapters));
      files.push(base + '.chapters.txt');
    }

    const mp4 = base + '.mp4';
    const args = ['-y', '-loglevel', 'error', ...inputs];
    let subIdx = null, metaIdx = null;
    if (srt) { args.push('-i', srt); subIdx = inputs.filter(x => x === '-i').length; }
    if (meta) { args.push('-i', meta); metaIdx = inputs.filter(x => x === '-i').length + (srt ? 1 : 0); }
    const copy = !needsRender(cfg);           // nothing to draw: keep the captured stream as is
    if (copy) args.push('-map', '0:v', '-c:v', 'copy');
    else args.push('-filter_complex', filters.join(';'), '-map', v);
    if (a) args.push('-map', a, '-c:a', 'aac', '-b:a', '192k');
    if (srt) args.push('-map', `${subIdx}:s`, '-c:s', 'mov_text', '-metadata:s:s:0', 'language=eng');
    if (meta) args.push('-map_metadata', String(metaIdx), '-map_chapters', String(metaIdx));
    if (!copy) args.push('-c:v', 'libx264', '-preset', 'medium', '-crf', String(cfg.crf), '-pix_fmt', 'yuv420p', '-r', String(fps), '-t', total.toFixed(3));
    args.push('-movflags', '+faststart', mp4);
    execFileSync(ffmpeg, args, { stdio: ['ignore', 'inherit', 'inherit'] });
    files.unshift(mp4);

    /* thumbnail */
    if (cfg.thumbnail) {
      // take.thumbnail() if the tour marks a frame, else the first highlight in full view, else a third of the way in
      const marked = events.find(e => e.type === 'thumbnail');
      const hl = events.find(e => e.type === 'step' && /^(highlight|circle|spotlight|arrow|underline)$/.test(e.name));
      const at = marked ? marked.t / 1000 + shift + 0.05 : hl ? Math.min(hl.t / 1000 + shift + 1.1, total - 0.1) : shift + mainDur / 3;
      execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-ss', at.toFixed(3), '-i', mp4, '-frames:v', '1', '-q:v', '2', base + '.jpg']);
      files.push(base + '.jpg');
    }

    /* other formats */
    if (cfg.formats.includes('webm')) {
      execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-i', mp4, '-map', '0:v', '-map', '0:a?', '-c:v', 'libvpx-vp9', '-crf', '32', '-b:v', '0',
        '-row-mt', '1', '-deadline', 'good', '-cpu-used', '4', '-c:a', 'libopus', base + '.webm']);
      files.push(base + '.webm');
    }
    if (cfg.formats.includes('gif')) {
      const gw = Math.min(960, W);
      execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-i', mp4, '-filter_complex',
        `fps=15,scale=${gw}:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4`, base + '.gif']);
      files.push(base + '.gif');
    }
    return { files, duration: total, cues: cues.length, chapters: chapters.length };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/** Whether the video has to be re-encoded (false: the captured stream is copied as is). */
function needsRender(cfg) {
  return !!(cfg.frame || cfg.intro || cfg.outro || cfg.sound || cfg.music || cfg.mode === 'realtime');
}

module.exports = { render, needsRender, captionCues, chapterList, toSrt, toVtt, ffmeta, youtube, frameLayout, BACKGROUNDS, durationOf };
