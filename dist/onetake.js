/*!
 * OneTake v1.0.0
 * Scripted, human-looking cursor, UI automation, highlights and camera zoom
 * for recording product demo videos in one take.
 * https://github.com/TharinduWijayarathna/one-take
 * MIT License. Built from src/ by scripts/build.js — edit the sources, not this file.
 */
(function (global, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else if (typeof define === 'function' && define.amd) define(factory);
  else global.OneTake = factory();
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  /* ---- src/00-core.js ---- */
  /* ==================================================================
   * Core: options, helpers, the chainable step queue and the overlay layer.
   * Feature modules (src/NN-*.js) extend OneTake.prototype and register
   * CSS / lifecycle hooks below.
   * ================================================================== */

  var DEFAULTS = {
    speed: 1,                 // global speed multiplier (2 = twice as fast)
    waitTimeout: 8000,        // ms to wait for an element to appear
    startPosition: null,      // {x, y} in viewport px for the cursor; default = centre-ish
    zIndex: 2147483000,
    onStep: null,             // function (name, args) — called before each step
    onError: null             // function (error, stepName)
  };

  /* ---------- small helpers ---------- */

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, Math.max(0, ms)); }); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function norm(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().toLowerCase(); }
  function assign(target) {
    for (var i = 1; i < arguments.length; i++) {
      var src = arguments[i];
      if (src) for (var k in src) if (Object.prototype.hasOwnProperty.call(src, k)) target[k] = src[k];
    }
    return target;
  }

  /* ---------- module registry ---------- */

  var CSS = [];   // functions (opts) → css text, injected once on mount
  var HOOKS = { init: [], mount: [], step: [], stop: [], destroy: [] };
  function feature(def) {
    if (def.defaults) assign(DEFAULTS, def.defaults);
    if (def.css) CSS.push(def.css);
    for (var k in HOOKS) if (def[k]) HOOKS[k].push(def[k]);
  }
  function runHooks(self, name, arg) {
    for (var i = 0; i < HOOKS[name].length; i++) HOOKS[name][i].call(self, arg);
  }

  feature({
    css: function (o) {
      return '.ot-layer{position:fixed;inset:0;pointer-events:none;z-index:' + o.zIndex + ';overflow:hidden;contain:strict;}' +
        '.ot-layer *{pointer-events:none!important;box-sizing:border-box;}';
    }
  });

  /* ---------- OneTake ---------- */

  function OneTake(options) {
    if (!(this instanceof OneTake)) return new OneTake(options);
    this.opts = assign({}, DEFAULTS, options);
    this.pos = null;
    this._queue = Promise.resolve();
    this._mounted = false;
    this._aborted = false;
    runHooks(this, 'init');
  }

  var P = OneTake.prototype;

  /** Queue a step. Every public action goes through here, so calls chain and run in order. */
  P._step = function (name, args, fn) {
    var self = this;
    this._queue = this._queue.then(function () {
      if (self._aborted) throw new Error('OneTake: stopped');
      self._mount();
      if (self.opts.onStep) self.opts.onStep(name, args);
      return Promise.resolve(fn.call(self)).catch(function (err) {
        if (self.opts.onError) self.opts.onError(err, name);
        else if (!self._aborted) console.error('[OneTake] step "' + name + '" failed:', err);
        throw err;
      });
    });
    return this;
  };

  /** Makes the chain awaitable: `await take.click('#a').type('#b', 'hi')` */
  P.then = function (res, rej) { return this._queue.then(function () {}, undefined).then(res, rej); };
  P.catch = function (rej) { return this.then(undefined, rej); };

  /** Stop the running script. Pending steps are discarded. */
  P.stop = function () {
    this._aborted = true;
    var self = this;
    this._queue = this._queue.catch(function () {}).then(function () { self._aborted = false; });
    runHooks(this, 'stop');
    return this;
  };

  /** Remove everything OneTake added to the page. */
  P.destroy = function () {
    this.stop();
    runHooks(this, 'destroy');
    if (this._layer) this._layer.remove();
    if (this._style) this._style.remove();
    this._mounted = false;
  };

  /** Create the overlay layer the first time a step runs. */
  P._mount = function () {
    if (this._mounted) { runHooks(this, 'step'); return; }
    var o = this.opts;
    this._style = document.createElement('style');
    this._style.setAttribute('data-ot', '');
    this._style.textContent = CSS.map(function (f) { return f(o); }).join('\n');
    document.head.appendChild(this._style);

    this._layer = document.createElement('div');
    this._layer.className = 'ot-layer';
    this._layer.setAttribute('aria-hidden', 'true');
    document.documentElement.appendChild(this._layer);
    this._mounted = true;
    runHooks(this, 'mount', this._layer);
  };

  /** A child element of the overlay layer, created on first use. */
  P._part = function (key, tag, className) {
    if (!this[key]) {
      var el = tag === 'svg' ? document.createElementNS('http://www.w3.org/2000/svg', 'svg') : document.createElement(tag);
      el.setAttribute('class', className);
      this._layer.appendChild(el);
      this[key] = el;
    }
    return this[key];
  };

  /* ---------- extension points (overridden by feature modules) ---------- */

  P._toVisual = function (x, y) { return { x: x, y: y }; };   // camera: layout → screen coords
  P._toLayout = function (x, y) { return { x: x, y: y }; };   // camera: screen → layout coords
  P._visScale = function () { return 1; };
  P._updateHighlights = function () {};
  P._sound = function () {};

  /* ---------- basic steps ---------- */

  /** Pause for ms (scaled by speed). */
  P.wait = function (ms) {
    return this._step('wait', arguments, function () { return sleep(ms / this.opts.speed); });
  };

  /** Run any custom code as a step. May return a promise. Receives the OneTake instance. */
  P.run = function (fn) {
    return this._step('run', arguments, function () { return fn(this); });
  };

  /** Change options mid-script, e.g. take.set({ speed: 2 }). */
  P.set = function (opts) {
    return this._step('set', arguments, function () { assign(this.opts, opts); });
  };

  OneTake.defaults = DEFAULTS;
  OneTake.feature = feature;

  /* ---- src/10-targets.js ---- */
  /* ==================================================================
   * Targets: find elements by CSS selector, text=, label=, element or
   * function, and wait for them to appear.
   * ================================================================== */

  var CLICKABLE = 'a[href],button,[role="button"],[role="tab"],[role="link"],[role="menuitem"],' +
    '[role="option"],[role="checkbox"],[role="radio"],[role="switch"],label,summary,select,' +
    'input[type="checkbox"],input[type="radio"],input[type="submit"],input[type="button"],' +
    'input[type="reset"],input[type="file"],input[type="range"],[onclick]';
  var TEXTY = 'textarea,[contenteditable=""],[contenteditable="true"],input:not([type]),' +
    'input[type="text"],input[type="email"],input[type="password"],input[type="search"],' +
    'input[type="url"],input[type="tel"],input[type="number"]';
  var FOCUSABLE = 'input,select,textarea,button,a[href],summary,[tabindex],[contenteditable=""],[contenteditable="true"]';

  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    var r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return false;
    var cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none' && parseFloat(cs.opacity) > 0.01;
  }

  function textOf(el) {
    if (el.tagName === 'INPUT') return el.value || el.getAttribute('aria-label') || '';
    return el.innerText != null ? el.innerText : el.textContent;
  }

  /** text=Save → best visible element whose text matches (exact first, then "contains"). */
  function findByText(text, root) {
    root = root || document;
    var wanted = norm(text);
    var groups = [CLICKABLE + ',h1,h2,h3,h4,h5,h6,legend,th,dt', '*'];
    for (var g = 0; g < groups.length; g++) {
      var nodes = root.querySelectorAll(groups[g]);
      var exact = null, partial = null, partialLen = Infinity;
      for (var i = 0; i < nodes.length; i++) {
        var el = nodes[i];
        if (el.closest('.ot-layer')) continue;
        var t = norm(textOf(el));
        if (!t || t.indexOf(wanted) === -1 || !isVisible(el)) continue;
        if (t === wanted) { exact = el; if (g === 0) break; }
        else if (t.length < partialLen) { partial = el; partialLen = t.length; }
      }
      if (exact || partial) return exact || partial;
    }
    return null;
  }

  /** label=Email → the form control associated with a label / aria-label / placeholder / name. */
  function findByLabel(text, root) {
    root = root || document;
    var wanted = norm(text);
    var labels = root.querySelectorAll('label');
    for (var i = 0; i < labels.length; i++) {
      var l = labels[i];
      var lt = norm(l.textContent);
      if (lt === wanted || lt.indexOf(wanted) === 0) {
        var ctl = l.control || (l.htmlFor && document.getElementById(l.htmlFor)) ||
          l.querySelector('input,select,textarea');
        if (ctl) return ctl;
      }
    }
    var ctls = root.querySelectorAll('input,select,textarea,[contenteditable],[role="textbox"],[role="combobox"]');
    for (var j = 0; j < ctls.length; j++) {
      var c = ctls[j];
      var names = [c.getAttribute('aria-label'), c.getAttribute('placeholder'), c.getAttribute('name')];
      for (var n = 0; n < names.length; n++) if (names[n] && norm(names[n]) === wanted) return c;
    }
    return null;
  }

  function queryTarget(target) {
    if (!target) return null;
    if (typeof target === 'function') return target();
    if (target.nodeType === 1) return target;
    if (typeof target === 'string') {
      if (target.indexOf('text=') === 0) return findByText(target.slice(5));
      if (target.indexOf('label=') === 0) return findByLabel(target.slice(6));
      return document.querySelector(target);
    }
    return null;
  }

  function describe(target) {
    if (typeof target === 'string') return target;
    if (target && target.nodeType === 1) return '<' + target.tagName.toLowerCase() + (target.id ? '#' + target.id : '') + '>';
    return String(target);
  }

  /** Resolve a target, polling until it exists and is visible (or the timeout passes). */
  P._resolve = function (target, timeout) {
    var self = this, t0 = performance.now();
    timeout = timeout != null ? timeout : this.opts.waitTimeout;
    return new Promise(function (resolve, reject) {
      (function poll() {
        if (self._aborted) return reject(new Error('OneTake: stopped'));
        var el = null;
        try { el = queryTarget(target); } catch (e) { return reject(e); }
        if (el && isVisible(el)) return resolve(el);
        if (performance.now() - t0 > timeout) return reject(new Error('OneTake: element not found or not visible: ' + describe(target)));
        setTimeout(poll, 60);
      })();
    });
  };

  /** Wait until an element exists and is visible (e.g. after navigation or an API call). */
  P.waitFor = function (target, o) {
    return this._step('waitFor', arguments, function () { return this._resolve(target, o && o.timeout); });
  };

  OneTake.findByText = findByText;
  OneTake.findByLabel = findByLabel;

  OneTake.version = '1.0.0';
  return OneTake;
});
