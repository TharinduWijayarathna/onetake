/*
 * Studio session: the recorded steps, kept in Node so they survive page loads,
 * and saved to <out>/studio.json after every change (so a session can be resumed).
 *
 * Step shapes (all have an `id`):
 *   { type: 'page', url, direct }            a new page load; `direct` = not caused by a recorded action
 *   { type: 'click', target, text }
 *   { type: 'type', target, value, enter }
 *   { type: 'select', target, value }
 *   { type: 'check', target, state }
 *   { type: 'zoom', target, seconds }          seconds: null = until zoomOut
 *   { type: 'zoomOut' }
 *   { type: 'highlight', shape, target, label }
 *   { type: 'caption', text, duration }
 *   { type: 'wait', ms }
 *   { type: 'note', text }                     becomes a comment in the script
 */
const fs = require('fs');
const path = require('path');

const NAVIGATING = new Set(['click', 'type', 'select', 'check']);

class Session {
  constructor(file, defaults) {
    this.file = file;
    this.data = { version: 1, url: null, viewport: defaults.viewport, steps: [], generated: [], nextId: 1 };
    if (fs.existsSync(file)) {
      try { Object.assign(this.data, JSON.parse(fs.readFileSync(file, 'utf8'))); } catch (e) { /* start fresh */ }
    }
    this.recording = false;
  }

  get steps() { return this.data.steps; }

  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2));
  }

  state() {
    return { url: this.data.url, steps: this.data.steps, recording: this.recording, generated: this.data.generated };
  }

  add(step) {
    step = Object.assign({ id: this.data.nextId++ }, step);
    const last = this.steps[this.steps.length - 1];
    // Typing into the same field again just updates the value (the field was re-focused).
    if (step.type === 'type' && last && last.type === 'type' && last.target === step.target) {
      last.value = step.value; last.enter = step.enter || last.enter;
    } else {
      this.steps.push(step);
    }
    this.save();
    return this.state();
  }

  update(id, patch) {
    const s = this.steps.find(x => x.id === id);
    if (s) { delete patch.id; delete patch.type; Object.assign(s, patch); this.save(); }
    return this.state();
  }

  remove(id) {
    this.data.steps = this.steps.filter(x => x.id !== id);
    this.save();
    return this.state();
  }

  move(id, dir) {
    const i = this.steps.findIndex(x => x.id === id), j = i + dir;
    if (i >= 0 && j >= 0 && j < this.steps.length) {
      const [s] = this.steps.splice(i, 1);
      this.steps.splice(j, 0, s);
      this.save();
    }
    return this.state();
  }

  clear() { this.data.steps = []; this.data.url = null; this.save(); return this.state(); }

  setRecording(on, currentUrl) {
    this.recording = !!on;
    if (on && !this.data.url) { this.data.url = currentUrl; this.save(); }
    return this.state();
  }

  /** A document finished loading while recording: start a new page section. */
  pageLoaded(url) {
    if (!this.recording || !this.data.url) return this.state();
    const real = this.steps.filter(s => s.type !== 'page');
    if (!real.length && url === this.data.url) return this.state();        // just the start page reloading
    const last = this.steps[this.steps.length - 1];
    if (last && last.type === 'page') { last.url = url; this.save(); return this.state(); } // redirect chain
    if (!last && url === this.data.url) return this.state();
    const prev = [...this.steps].reverse().find(s => s.type !== 'page' && s.type !== 'note');
    const direct = !(prev && (NAVIGATING.has(prev.type) && (prev.type !== 'type' || prev.enter) || prev.type === 'click'));
    return this.add({ type: 'page', url, direct });
  }
}

module.exports = { Session };
