/*
 * Configuration: defaults ← onetake.config.js (or .json) ← command-line flags.
 * Relative paths in a config file are resolved against the config file's folder;
 * relative paths given as flags are resolved against the current directory.
 */
const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  url: null,                 // first page (http(s):// URL or a local .html file)
  tour: [],                  // tour script(s); one script can span many pages
  include: [],               // shared step files prepended to every tour script
  viewport: { width: 1920, height: 1080 },
  scale: 1,                  // device pixel ratio: 2 = 3840x2160 from a 1920x1080 layout
  fps: 60,
  mode: 'frames',            // 'frames' (virtual clock, perfectly smooth) | 'realtime'
  speed: 1,
  seed: 7,                   // fixed Math.random: cursor paths and typing rhythm repeat exactly
  now: null,                 // the app's date/time, e.g. '2026-11-01T09:00' (frames mode)
  storage: null,             // Playwright storageState (from `onetake login`) to start signed in
  out: 'recordings',
  name: null,                // default: demo-<timestamp>
  lead: 800, tail: 1200,     // still time before / after the tour (ms)
  max: 900,                  // safety limit on video length (s)
  captureFormat: 'jpeg',     // frame capture: 'jpeg' (q95) | 'png' (lossless, slower)
  crf: 16,                   // x264 quality, lower = better
  headed: false,
  realInput: true,           // trusted mouse/keyboard from Playwright (false = synthetic events)
  options: {},               // passed to new OneTake(options) in the page, e.g. { autoZoom: true }
  // ---- output
  frame: false,              // true | { background, padding, radius, shadow, chrome, title }
  sound: false,              // click and key sounds
  music: null,               // background music file
  musicVolume: 0.18,
  subtitles: true,           // .srt/.vtt from captions (+ a soft subtitle track in the mp4)
  chapters: true,            // chapter markers from take.chapter()
  thumbnail: true,           // <name>.jpg (take.thumbnail() picks the frame)
  formats: ['mp4'],          // any of 'mp4', 'webm', 'gif'
  aspect: null,              // '9:16' | '1:1' | '4:5' … crop that follows the camera/cursor (frames mode)
  intro: null,               // { title, subtitle, duration, logo } or 'Title|Subtitle'
  outro: null,               // { title, subtitle, duration, logo } or 'Title|Subtitle'
  timeline: false            // also write <name>.timeline.json (steps, clicks, captions with times)
};

const FRAME_DEFAULTS = { background: 'gradient', padding: 72, radius: 14, shadow: true, chrome: 'mac', title: '' };

/** Command-line flags → config keys. Value-less flags are booleans; `--no-x` sets x to false. */
const FLAGS = {
  url: 'url', tour: 'tour', script: 'tour', include: 'include', width: 'viewport.width', height: 'viewport.height',
  scale: 'scale', fps: 'fps', speed: 'speed', seed: 'seed', now: 'now', storage: 'storage', out: 'out', name: 'name',
  lead: 'lead', tail: 'tail', max: 'max', format: 'captureFormat', 'capture-format': 'captureFormat', crf: 'crf',
  headed: 'headed', 'real-input': 'realInput', realtime: 'mode=realtime', frame: 'frame', background: 'frame.background',
  padding: 'frame.padding', radius: 'frame.radius', title: 'frame.title', chrome: 'frame.chrome', shadow: 'frame.shadow',
  sound: 'sound', music: 'music', 'music-volume': 'musicVolume', subtitles: 'subtitles', chapters: 'chapters',
  thumbnail: 'thumbnail', formats: 'formats', aspect: 'aspect', intro: 'intro', outro: 'outro',
  'auto-zoom': 'options.autoZoom', timeline: 'timeline', config: null, watch: null, help: null
};
const LISTS = new Set(['tour', 'include', 'formats']);
/** Flags that are switches: they never take the next argument (unless it is true/false). */
const BOOLEANS = new Set(['headed', 'realtime', 'watch', 'help', 'sound', 'auto-zoom', 'timeline', 'real-input',
  'subtitles', 'chapters', 'thumbnail', 'shadow']);
const NUMBERS = new Set(['viewport.width', 'viewport.height', 'scale', 'fps', 'speed', 'seed', 'lead', 'tail', 'max', 'crf',
  'musicVolume', 'frame.padding', 'frame.radius']);
const PATHS = ['storage', 'out', 'music'];

function setPath(obj, key, value) {
  const parts = key.split('.');
  let o = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const cur = o[parts[i]];
    if (parts[i] === 'frame' && typeof cur === 'string' && cur !== 'true') o[parts[i]] = { background: cur };   // --frame ocean --title X
    else if (cur === true || cur == null || typeof cur !== 'object') o[parts[i]] = {};
    o = o[parts[i]];
  }
  o[parts[parts.length - 1]] = value;
}

/** Parse argv into { command, positional, flags (config keys), meta (config/watch/help) }. */
function parseArgs(argv) {
  const out = { command: null, positional: [], flags: {}, meta: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { if (!out.command) out.command = a; else out.positional.push(a); continue; }
    let name = a.slice(2), value;
    const eq = name.indexOf('=');
    if (eq !== -1) { value = name.slice(eq + 1); name = name.slice(0, eq); }
    let negate = false;
    if (name.startsWith('no-') && !(name in FLAGS)) { negate = true; name = name.slice(3); }
    if (!(name in FLAGS)) throw new Error(`Unknown option --${name}. Run "onetake help" for the list.`);
    const key = FLAGS[name];
    const next = argv[i + 1];
    const takesValue = value === undefined && !negate && next != null && !next.startsWith('--') &&
      (BOOLEANS.has(name) ? /^(true|false)$/.test(next) : !(name === 'frame' && /\.(m?js|cjs|json)$/.test(next)));
    if (takesValue) value = argv[++i];
    if (key === null) { out.meta[name] = value === undefined ? true : value; continue; }
    if (key.includes('=')) { const [k, v] = key.split('='); out.flags[k] = negate ? DEFAULTS[k] : v; continue; }
    if (value === undefined) value = !negate;
    else if (NUMBERS.has(key)) value = +value;
    else if (value === 'true' || value === 'false') value = value === 'true';
    if (LISTS.has(key)) {
      const items = String(value).split(',').map(s => s.trim()).filter(Boolean);
      out.flags[key] = (out.flags[key] || []).concat(items);
    } else setPath(out.flags, key, value);
  }
  return out;
}

function findConfig(explicit, cwd) {
  if (explicit) return path.resolve(cwd, explicit);
  for (const n of ['onetake.config.js', 'onetake.config.cjs', 'onetake.config.json']) {
    const p = path.join(cwd, n);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function loadConfigFile(file) {
  if (!file) return {};
  if (!fs.existsSync(file)) throw new Error('Config file not found: ' + file);
  if (/\.json$/.test(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  delete require.cache[require.resolve(file)];
  const mod = require(file);
  return (mod && mod.default) || mod;
}

function parseCard(v) {
  if (!v) return null;
  if (typeof v === 'string') { const [title, subtitle] = v.split('|'); return { title: title.trim(), subtitle: (subtitle || '').trim() }; }
  return v;
}

/** Merge everything into one normalized config. */
function resolveConfig({ flags = {}, positional = [], meta = {} }, cwd = process.cwd()) {
  const configFile = findConfig(meta.config, cwd);
  const fileCfg = loadConfigFile(configFile);
  const base = configFile ? path.dirname(configFile) : cwd;
  const abs = (p, from) => (p && !/^[a-z]+:\/\//i.test(p) ? path.resolve(from, p) : p);

  const cfg = JSON.parse(JSON.stringify(DEFAULTS));
  const mergeIn = (src, from) => {
    for (const [k, v] of Object.entries(src)) {
      if (v === undefined) continue;
      if (k === 'viewport' || k === 'options') cfg[k] = Object.assign({}, cfg[k], v);
      else if (k === 'frame' && v && typeof v === 'object') cfg.frame = Object.assign({}, cfg.frame && typeof cfg.frame === 'object' ? cfg.frame : {}, v);
      else if (k === 'frame' && typeof v === 'string' && v !== 'true' && cfg.frame && typeof cfg.frame === 'object') cfg.frame = Object.assign({}, cfg.frame, { background: v });
      else if (k === 'frame' && (v === true || v === 'true') && cfg.frame && typeof cfg.frame === 'object') { /* keep the configured frame */ }
      else cfg[k] = v;
      if (k === 'tour' || k === 'include') cfg[k] = [].concat(v).map(p => abs(p, from));
      if (PATHS.includes(k)) cfg[k] = abs(v, from);
      if (k === 'url' && v && !/^[a-z]+:\/\//i.test(v)) cfg.url = 'file://' + path.resolve(from, v);
      if ((k === 'intro' || k === 'outro') && v && v.logo) cfg[k] = Object.assign({}, v, { logo: abs(v.logo, from) });
    }
  };
  mergeIn(fileCfg, base);
  mergeIn(positional.length ? Object.assign({}, flags, { tour: positional.concat(flags.tour || []) }) : flags, cwd);

  if (cfg.frame === true || cfg.frame === 'true' || (cfg.frame && typeof cfg.frame === 'string')) {
    cfg.frame = cfg.frame === true || cfg.frame === 'true' ? {} : { background: cfg.frame };
  }
  if (cfg.frame) cfg.frame = Object.assign({}, FRAME_DEFAULTS, cfg.frame);
  if (cfg.frame && cfg.frame.background && /\.(png|jpe?g|webp)$/i.test(cfg.frame.background)) cfg.frame.background = abs(cfg.frame.background, base);
  cfg.intro = parseCard(cfg.intro);
  cfg.outro = parseCard(cfg.outro);
  cfg.formats = [].concat(cfg.formats).map(f => String(f).toLowerCase().replace(/^\./, ''));
  if (!cfg.formats.includes('mp4')) cfg.formats.unshift('mp4');
  cfg.configFile = configFile;
  cfg.baseDir = base;
  return cfg;
}

module.exports = { DEFAULTS, parseArgs, resolveConfig };
