  /* ==================================================================
   * Core: options, helpers, the chainable step queue and the overlay layer.
   * Feature modules (src/NN-*.js) extend OneTake.prototype and register
   * CSS / lifecycle hooks below.
   * ================================================================== */

  var DEFAULTS = {
    speed: 1,                 // global speed multiplier (2 = twice as fast)
    waitTimeout: 8000,        // ms to wait for an element to appear / become actionable
    startPosition: null,      // {x, y} in viewport px for the cursor; default = centre-ish
    zIndex: 2147483000,
    resumeFrom: 0,            // skip the first N steps (the recorder uses this after a page load)
    onStep: null,             // function (name, args, info) — called before each step
    onError: null             // function (error, stepName, info)
  };

  /* ---------- small helpers ---------- */

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, Math.max(0, ms)); }); }
  function nextFrame() { return new Promise(function (r) { requestAnimationFrame(function () { r(); }); }); }
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

  /** Send an event to the recorder (no-op on live pages). */
  function report(type, data) {
    if (typeof window.__otReport !== 'function') return;
    try { window.__otReport(assign({ type: type }, data)); } catch (e) { /* the recorder may be gone */ }
  }

  /** "tour.js:12" for the script line that called a chain method (from the stack trace). */
  function callSite() {
    var stack = (new Error()).stack || '';
    var lines = stack.split('\n');
    for (var i = 1; i < lines.length; i++) {
      var l = lines[i];
      if (/onetake(\.min)?\.js/.test(l)) continue;                // frames inside the library itself
      var m = l.match(/([^\s(@]+):(\d+):(\d+)\)?\s*$/);
      if (m && !/^(native|<anonymous>)$/.test(m[1])) {
        var file = m[1].replace(/^.*[\\/]/, '');
        return file + ':' + m[2];
      }
    }
    return null;
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
    this._count = 0;
    runHooks(this, 'init');
  }

  var P = OneTake.prototype;

  /** Steps whose interruption by a page load means they already did their job (the recorder skips them). */
  var ACTION_STEPS = { click: 1, doubleClick: 1, type: 1, press: 1, select: 1, check: 1, clear: 1, drag: 1, upload: 1, run: 1 };

  /**
   * Queue a step. Every public action goes through here, so calls chain and run in order.
   * Each step knows its index and the script line that created it, for clear errors.
   */
  P._step = function (name, args, fn) {
    var self = this, index = this._count++;
    var info = { index: index, name: name, site: callSite(), arg: describeArg(args && args[0]) };
    if (index < (this.opts.resumeFrom || 0)) {
      if (name === 'set') assign(this.opts, args[0]);     // options still apply when resuming
      return this;
    }
    this._queue = this._queue.then(function () {
      if (self._aborted) throw new Error('OneTake: stopped');
      self._mount();
      self._current = info;
      report('step', { index: index, name: name, site: info.site, action: !!ACTION_STEPS[name] });
      if (self.opts.onStep) self.opts.onStep(name, args, info);
      return Promise.resolve(fn.call(self)).then(function (v) {
        report('stepDone', { index: index, name: name });
        return v;
      }, function (err) {
        err = decorate(err, info);
        report('error', { index: index, name: name, site: info.site, message: err.message });
        if (self.opts.onError) self.opts.onError(err, name, info);
        else if (!self._aborted) console.error('[OneTake] ' + err.message);
        throw err;
      });
    });
    return this;
  };

  function describeArg(a) {
    if (a == null) return '';
    if (typeof a === 'string') return a.length > 60 ? a.slice(0, 57) + '…' : a;
    if (typeof a === 'number') return String(a);
    if (typeof a === 'function') return 'ƒ';
    if (a.nodeType === 1) return '<' + a.tagName.toLowerCase() + '>';
    return '';
  }

  /** "step 7 click("text=Save") at tour.js:23: element not found …" */
  function decorate(err, info) {
    if (!(err instanceof Error)) err = new Error(String(err));
    if (err.__ot) return err;
    var where = 'step ' + (info.index + 1) + ' ' + info.name + (info.arg ? '(' + JSON.stringify(info.arg) + ')' : '()') +
      (info.site ? ' at ' + info.site : '');
    err.message = where + ': ' + err.message.replace(/^OneTake[.:]\s*/, '');
    err.__ot = true;
    err.step = info;
    return err;
  }

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
  P._settle = function () { return Promise.resolve(); };

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

  /** Mark the start of a chapter (written to the video's chapter list by the recorder). */
  P.chapter = function (title) {
    return this._step('chapter', arguments, function () { report('chapter', { title: String(title) }); });
  };

  /** Use the current frame as the video's thumbnail (recorder). */
  P.thumbnail = function () {
    return this._step('thumbnail', arguments, function () { report('thumbnail', {}); });
  };

  OneTake.defaults = DEFAULTS;
  OneTake.feature = feature;
  OneTake.ACTION_STEPS = ACTION_STEPS;
