const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { parseArgs, resolveConfig } = require('../../src/recorder/config');

test('parses commands, positionals, values, booleans and negations', () => {
  const a = parseArgs(['record', 'tour.js', '--url', 'http://x', '--fps', '30', '--headed', '--no-subtitles', '--formats', 'webm,gif']);
  assert.equal(a.command, 'record');
  assert.deepEqual(a.positional, ['tour.js']);
  assert.equal(a.flags.url, 'http://x');
  assert.equal(a.flags.fps, 30);
  assert.equal(a.flags.headed, true);
  assert.equal(a.flags.subtitles, false);
  assert.deepEqual(a.flags.formats, ['webm', 'gif']);
});

test('v1 flags still work', () => {
  const a = parseArgs(['record', '--script', 'a.js', '--script', 'b.js', '--width', '1280', '--height', '720', '--format', 'png', '--realtime']);
  assert.deepEqual(a.flags.tour, ['a.js', 'b.js']);
  assert.deepEqual(a.flags.viewport, { width: 1280, height: 720 });
  assert.equal(a.flags.captureFormat, 'png');
  assert.equal(a.flags.mode, 'realtime');
});

test('unknown options are rejected with a hint', () => {
  assert.throws(() => parseArgs(['record', '--fsp', '30']), /Unknown option --fsp/);
});

test('merges defaults, config file and flags; resolves paths against the config folder', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ot-cfg-'));
  fs.writeFileSync(path.join(dir, 'onetake.config.js'), "module.exports = { url: 'app.html', tour: 'tour.js', fps: 30, frame: { title: 'App' }, viewport: { width: 1000 } };");
  const cfg = resolveConfig(parseArgs(['record', '--fps', '24', '--frame', 'dark']), dir);
  assert.equal(cfg.url, 'file://' + path.join(dir, 'app.html'));
  assert.deepEqual(cfg.tour, [path.join(dir, 'tour.js')]);
  assert.equal(cfg.fps, 24);                                     // flag beats file
  assert.deepEqual(cfg.viewport, { width: 1000, height: 1080 });  // partial viewport merges
  assert.equal(cfg.frame.background, 'dark');
  assert.equal(cfg.frame.title, 'App');
  assert.equal(cfg.frame.padding, 72);
  assert.equal(cfg.configFile, path.join(dir, 'onetake.config.js'));
});

test('cards accept "Title|Subtitle"; mp4 is always produced', () => {
  const cfg = resolveConfig(parseArgs(['record', 'x.js', '--intro', 'Acme | The tour', '--formats', 'gif']), os.tmpdir());
  assert.deepEqual(cfg.intro, { title: 'Acme', subtitle: 'The tour' });
  assert.deepEqual(cfg.formats, ['mp4', 'gif']);
});

test('resolving twice does not duplicate tours (watch mode)', () => {
  const parsed = parseArgs(['check', 'a.js']);
  resolveConfig(parsed, os.tmpdir());
  assert.equal(resolveConfig(parsed, os.tmpdir()).tour.length, 1);
});

test('switches never swallow the tour path; --frame <bg> keeps --title', () => {
  const a = parseArgs(['record', '--auto-zoom', 'tour.js', '--timeline', 'more.js', '--frame', 'ocean', '--title', 'Acme']);
  assert.deepEqual(a.positional, ['tour.js', 'more.js']);
  assert.equal(a.flags.options.autoZoom, true);
  assert.deepEqual(a.flags.frame, { background: 'ocean', title: 'Acme' });
  assert.equal(parseArgs(['record', '--sound', 'false']).flags.sound, false);
});
