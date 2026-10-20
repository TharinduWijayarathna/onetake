const test = require('node:test');
const assert = require('node:assert/strict');
const { captionCues, chapterList, toSrt, toVtt, ffmeta, youtube, frameLayout } = require('../../src/recorder/render');
const { synthTrack, RATE } = require('../../src/recorder/audio');

test('caption cues: carry-over across page loads is merged, hide and duration end cues', () => {
  const cues = captionCues([
    { t: 1000, type: 'caption', text: 'Hello' },
    { t: 4000, type: 'caption', text: 'Hello' },              // same caption re-shown after a page load
    { t: 6000, type: 'caption', text: 'Next', duration: 1500 },
    { t: 9000, type: 'caption', text: 'Last' }
  ], 12);
  assert.deepEqual(cues.map(c => c.text), ['Hello', 'Next', 'Last']);
  assert.equal(cues[0].end, 6);
  assert.equal(cues[1].end, 7.5);
  assert.equal(cues[2].end, 12);
});

test('srt and vtt timestamps', () => {
  const cues = [{ start: 61.5, end: 3725.25, text: 'Hi' }];
  assert.equal(toSrt(cues), '1\n00:01:01,500 --> 01:02:05,250\nHi\n');
  assert.ok(toVtt(cues).startsWith('WEBVTT\n\n00:01:01.500 --> 01:02:05.250\nHi'));
});

test('chapters: first one snaps to 0 inside the lead-in, an Intro is added after a card', () => {
  const ev = [{ t: 800, type: 'chapter', title: 'List' }, { t: 65000, type: 'chapter', title: 'Form' }];
  const a = chapterList(ev, 0, 90, false);
  assert.deepEqual(a.map(c => [c.start, c.title]), [[0, 'List'], [65, 'Form']]);
  assert.equal(youtube(a), '0:00 List\n1:05 Form\n');
  const b = chapterList([{ t: 5000, type: 'chapter', title: 'Start here' }], 2, 30, true);
  assert.deepEqual(b.map(c => c.title), ['Intro', 'Start here']);
  assert.ok(ffmeta(a).includes('title=List') && ffmeta([{ start: 0, end: 1, title: 'a=b' }]).includes('title=a\\=b'));
});

test('frame layout keeps the aspect ratio, even sizes, and room for the title bar', () => {
  const cfg = { scale: 2, frame: { padding: 72, radius: 14, chrome: 'mac' } };
  const L = frameLayout(cfg, 3840, 2160);
  assert.equal(L.w % 2, 0); assert.equal(L.h % 2, 0);
  assert.ok(Math.abs(L.w / L.h - 16 / 9) < 0.01);
  assert.ok(L.y - L.bar >= 144 - 1 && L.y + L.h <= 2160 - 144 + 1);
});

test('sound track has clicks and keys where the timeline says', () => {
  const buf = synthTrack([{ t: 500, type: 'click' }, { t: 1500, type: 'key' }], 2, 0, 1);
  const peak = (from, to) => { let m = 0; for (let i = from; i < to; i++) m = Math.max(m, Math.abs(buf[i])); return m; };
  assert.ok(buf.length >= 2 * RATE);
  assert.ok(peak(0, 0.49 * RATE) === 0);
  assert.ok(peak(0.5 * RATE, 0.55 * RATE) > 0.1);
  assert.ok(peak(1.5 * RATE, 1.53 * RATE) > 0.05);
});
