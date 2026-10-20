/*
 * Synthesised UI sounds (no sample files): a soft mouse click and a keyboard tap,
 * slightly varied each time, mixed onto a mono track at the timeline's event times.
 */
const fs = require('fs');

const RATE = 48000;

function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Add one sound into buf at sample offset `at`. */
function addClick(buf, at, rand, gain) {
  // press: a short filtered tick plus a low body; release ~70 ms later, quieter
  [[0, 1], [Math.round(RATE * (0.065 + rand() * 0.02)), 0.45]].forEach(([off, g]) => {
    let lp = 0;
    const n = Math.round(RATE * 0.04), f = 150 + rand() * 40;
    for (let i = 0; i < n; i++) {
      const j = at + off + i;
      if (j < 0 || j >= buf.length) continue;
      const t = i / RATE;
      lp += 0.35 * ((rand() * 2 - 1) - lp);
      const tick = lp * Math.exp(-t / 0.0035);
      const body = Math.sin(2 * Math.PI * f * t) * Math.exp(-t / 0.012) * 0.6;
      buf[j] += (tick + body) * g * gain;
    }
  });
}

function addKey(buf, at, rand, gain) {
  let hp = 0, prev = 0;
  const n = Math.round(RATE * 0.03), pitch = 1800 + rand() * 900, g = gain * (0.75 + rand() * 0.35);
  for (let i = 0; i < n; i++) {
    const j = at + i;
    if (j < 0 || j >= buf.length) continue;
    const t = i / RATE;
    const x = rand() * 2 - 1;
    hp = 0.6 * (hp + x - prev); prev = x;                     // brighter noise
    const tap = hp * Math.exp(-t / 0.0022);
    const ring = Math.sin(2 * Math.PI * pitch * t) * Math.exp(-t / 0.004) * 0.25;
    const thock = Math.sin(2 * Math.PI * 240 * t) * Math.exp(-t / 0.008) * 0.35;
    buf[j] += (tap + ring + thock) * g;
  }
}

/** Mono Float32 track `total` seconds long; events are shifted by `shift` seconds (intro card). */
function synthTrack(events, total, shift = 0, seed = 7) {
  const buf = new Float32Array(Math.ceil(total * RATE) + RATE);
  const rand = rng(seed);
  for (const e of events) {
    const at = Math.round((e.t / 1000 + shift) * RATE);
    if (e.type === 'click') addClick(buf, at, rand, 0.55);
    else if (e.type === 'key') addKey(buf, at, rand, 0.32);
  }
  return buf;
}

function writeWav(file, samples) {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), i * 2);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(RATE, 24);
  h.writeUInt32LE(RATE * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(data.length, 40);
  fs.writeFileSync(file, Buffer.concat([h, data]));
}

module.exports = { synthTrack, writeWav, RATE };
