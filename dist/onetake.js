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

  /* ---- src/20-cursor.js ---- */
  /* ==================================================================
   * Cursor: a realistic pointer drawn on the overlay. It switches between
   * arrow, hand (over clickable things) and I-beam (over text fields).
   * ================================================================== */

  function cursorSVG(kind, fill, outline) {
    if (kind === 'hand') {
      return '<svg viewBox="0 0 24 24" width="100%" height="100%"><path d="M9.5 13V4a1.5 1.5 0 0 1 3 0V10.6a1.3 1.3 0 0 1 2.6 0v1a1.3 1.3 0 0 1 2.6 0v.8a1.3 1.3 0 0 1 2.6 0V16c0 3.3-2.5 6-5.8 6h-1.6c-1.9 0-3.4-.9-4.5-2.4l-3.1-4.6a1.4 1.4 0 0 1 2.1-1.9L9.5 15.5z" fill="' + fill + '" stroke="' + outline + '" stroke-width="1.4" stroke-linejoin="round"/></svg>';
    }
    if (kind === 'text') {
      var d = 'M9 3.5c1.5 0 2.5.5 3 1.5.5-1 1.5-1.5 3-1.5M9 20.5c1.5 0 2.5-.5 3-1.5.5 1 1.5 1.5 3 1.5M12 5v14';
      return '<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke-linecap="round"><path d="' + d + '" stroke="' + outline + '" stroke-width="3.6"/><path d="' + d + '" stroke="' + fill + '" stroke-width="1.6"/></svg>';
    }
    return '<svg viewBox="0 0 24 24" width="100%" height="100%"><path d="M4 2.5v17.2l4.6-4.4 3.1 6.9 3-1.3-3-6.8h6.4z" fill="' + fill + '" stroke="' + outline + '" stroke-width="1.5" stroke-linejoin="round"/></svg>';
  }
  var HOTSPOT = { arrow: [4, 2.5], hand: [11, 2.6], text: [12, 12] };

  feature({
    defaults: {
      cursorSize: 28,           // px
      cursorColor: '#111827',
      cursorOutline: '#ffffff',
      hideNativeCursor: true    // hide the real mouse pointer while the demo runs
    },
    css: function (o) {
      return '.ot-cursor{position:absolute;left:0;top:0;z-index:4;width:' + o.cursorSize + 'px;height:' + o.cursorSize + 'px;opacity:0;transition:opacity .25s ease;will-change:transform;filter:drop-shadow(0 2px 3px rgba(0,0,0,.35));}' +
        '.ot-cursor.ot-visible{opacity:1;}' +
        '.ot-cursor-inner{width:100%;height:100%;transition:transform .09s ease;}' +
        '.ot-cursor.ot-pressed .ot-cursor-inner{transform:scale(.82);}' +
        'html.ot-hide-native,html.ot-hide-native *{cursor:none!important;}';
    },
    init: function () { this._kind = 'arrow'; },
    mount: function () {
      var c = this._part('_cursor', 'div', 'ot-cursor');
      c.innerHTML = '<div class="ot-cursor-inner"></div>';
      this._cursorInner = c.firstChild;
      this._setKind('arrow', true);
      if (this.opts.hideNativeCursor) document.documentElement.classList.add('ot-hide-native');
      var sp = this.opts.startPosition || { x: innerWidth * 0.62, y: innerHeight * 0.72 };
      this._setPos(sp.x, sp.y);
      requestAnimationFrame(function () { c.classList.add('ot-visible'); });
    },
    destroy: function () { document.documentElement.classList.remove('ot-hide-native'); }
  });

  /** Place the cursor. Positions are layout coordinates; the camera maps them to the screen. */
  P._setPos = function (x, y) {
    this.pos = { x: x, y: y };
    if (!this._cursor) return;
    var v = this._toVisual(x, y), z = this._visScale();
    var h = HOTSPOT[this._kind], k = this.opts.cursorSize / 24;
    this._cursor.style.transformOrigin = (h[0] * k) + 'px ' + (h[1] * k) + 'px';
    this._cursor.style.transform = 'translate3d(' + (v.x - h[0] * k) + 'px,' + (v.y - h[1] * k) + 'px,0)' +
      (z !== 1 ? ' scale(' + z.toFixed(4) + ')' : '');
  };

  P._setKind = function (kind, force) {
    if (kind === this._kind && !force) return;
    this._kind = kind;
    this._cursorInner.innerHTML = cursorSVG(kind, this.opts.cursorColor, this.opts.cursorOutline);
    if (this.pos) this._setPos(this.pos.x, this.pos.y);
  };

  P._kindFor = function (el) {
    if (!el || !el.closest) return 'arrow';
    if (el.closest(TEXTY)) return 'text';
    if (el.closest(CLICKABLE)) return 'hand';
    return 'arrow';
  };

  /** The page element under a layout point. */
  P._hit = function (x, y) { var v = this._toVisual(x, y); return document.elementFromPoint(v.x, v.y); };

  P.showCursor = function () {
    return this._step('showCursor', arguments, function () { this._cursor.classList.add('ot-visible'); return sleep(260); });
  };
  P.hideCursor = function () {
    return this._step('hideCursor', arguments, function () { this._cursor.classList.remove('ot-visible'); return sleep(260); });
  };

  /* ---- src/30-hover.js ---- */
  /* ==================================================================
   * Hover: pointer/mouse enter, leave, over, out and move events under the
   * cursor, and :hover / :active emulation (synthetic events can't trigger
   * CSS :hover, so the rules are copied to .ot-hover / .ot-active classes).
   * ================================================================== */

  function buildHoverCSS() {
    var out = [];
    function walk(rules, wrapOpen, wrapClose) {
      for (var i = 0; i < rules.length; i++) {
        var r = rules[i];
        if (r.selectorText && /:hover|:active/.test(r.selectorText)) {
          var sel = r.selectorText.replace(/:hover/g, '.ot-hover').replace(/:active/g, '.ot-active');
          out.push(wrapOpen + sel + '{' + r.style.cssText + '}' + wrapClose);
        } else if (r.cssRules && r.conditionText != null) {
          var kw = r.constructor && /Supports/.test(r.constructor.name) ? '@supports ' : '@media ';
          walk(r.cssRules, wrapOpen + kw + r.conditionText + '{', '}' + wrapClose);
        }
      }
    }
    for (var s = 0; s < document.styleSheets.length; s++) {
      var sheet = document.styleSheets[s];
      if (sheet.ownerNode && sheet.ownerNode.hasAttribute && sheet.ownerNode.hasAttribute('data-ot')) continue;
      var rules;
      try { rules = sheet.cssRules; } catch (e) { continue; } // cross-origin sheet
      if (rules) walk(rules, '', '');
    }
    return out.join('\n');
  }

  function mouseInit(x, y, extra) {
    return assign({ bubbles: true, cancelable: true, composed: true, view: window,
      clientX: x, clientY: y, screenX: x + (window.screenX || 0), screenY: y + (window.screenY || 0),
      button: 0, buttons: 0, pointerId: 1, pointerType: 'mouse', isPrimary: true }, extra);
  }
  function fire(el, type, init) {
    if (!el) return true;
    var Ctor = /^pointer/.test(type) && window.PointerEvent ? PointerEvent : MouseEvent;
    return el.dispatchEvent(new Ctor(type, init));
  }

  feature({
    defaults: {
      emulateHover: true        // make CSS :hover / :active rules react to the fake cursor
    },
    init: function () { this._hoverSet = []; this._sheetCount = -1; },
    mount: function () {
      if (!this.opts.emulateHover) return;
      this._hoverStyle = document.createElement('style');
      this._hoverStyle.setAttribute('data-ot', '');
      document.head.appendChild(this._hoverStyle);
      this._refreshHoverCSS();
    },
    step: function () {
      if (this.opts.emulateHover && document.styleSheets.length !== this._sheetCount) this._refreshHoverCSS();
    },
    destroy: function () {
      this._setHover([]);
      if (this._hoverStyle) this._hoverStyle.remove();
    }
  });

  P._refreshHoverCSS = function () {
    this._sheetCount = document.styleSheets.length;
    if (this._hoverStyle) this._hoverStyle.textContent = buildHoverCSS();
  };

  /** Update hover state (classes + enter/leave/over/out events) for a layout point. */
  P._hoverAt = function (lx, ly, move) {
    var hit = this._hit(lx, ly);
    var vis = this._toVisual(lx, ly), x = vis.x, y = vis.y; // events carry on-screen coordinates
    var chain = [];
    for (var n = hit; n && n.nodeType === 1; n = n.parentElement) chain.push(n);
    var prevTop = this._hoverSet[0];
    if (hit !== prevTop) {
      var init = mouseInit(x, y);
      if (prevTop) { fire(prevTop, 'pointerout', init); fire(prevTop, 'mouseout', init); }
      var left = this._hoverSet.filter(function (e) { return chain.indexOf(e) === -1; });
      var entered = chain.filter(function (e) { return this._hoverSet.indexOf(e) === -1; }, this);
      var leaveInit = assign({}, init, { bubbles: false });
      left.forEach(function (e) { fire(e, 'pointerleave', leaveInit); fire(e, 'mouseleave', leaveInit); });
      if (hit) { fire(hit, 'pointerover', init); fire(hit, 'mouseover', init); }
      entered.reverse().forEach(function (e) { fire(e, 'pointerenter', leaveInit); fire(e, 'mouseenter', leaveInit); });
      this._setHover(chain);
      this._setKind(this._kindFor(hit));
    }
    if (move && hit) { var mi = mouseInit(x, y); fire(hit, 'pointermove', mi); fire(hit, 'mousemove', mi); }
    return hit;
  };

  P._setHover = function (chain) {
    if (this.opts.emulateHover) {
      this._hoverSet.forEach(function (e) { if (chain.indexOf(e) === -1) e.classList.remove('ot-hover'); });
      chain.forEach(function (e) { e.classList.add('ot-hover'); });
    }
    this._hoverSet = chain;
  };

  /* ---- src/40-movement.js ---- */
  /* ==================================================================
   * Movement: curved, eased, human-like cursor paths (cubic Bézier with a
   * random bend, minimum-jerk speed profile, occasional overshoot).
   * ================================================================== */

  function minJerk(t) { return t * t * t * (10 - 15 * t + 6 * t * t); }
  function bezier(p0, p1, p2, p3, t) {
    var u = 1 - t;
    return {
      x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
      y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y
    };
  }

  feature({
    defaults: {
      overshoot: true           // occasionally overshoot long moves and correct
    }
  });

  P._animatePath = function (pts, duration) {
    var self = this, start = performance.now(), frame = 0;
    return new Promise(function (resolve) {
      function loop(now) {
        if (self._aborted) return resolve();
        var t = clamp((now - start) / duration, 0, 1);
        var p = bezier(pts[0], pts[1], pts[2], pts[3], minJerk(t));
        self._setPos(p.x, p.y);
        if ((frame++ & 1) === 0 || t === 1) self._hoverAt(p.x, p.y, true);
        if (t < 1) requestAnimationFrame(loop); else resolve();
      }
      requestAnimationFrame(loop);
    });
  };

  P._moveToPoint = function (x, y, o) {
    o = o || {};
    var from = this.pos, dx = x - from.x, dy = y - from.y, dist = Math.hypot(dx, dy);
    this._moveDest = { x: x, y: y };
    if (dist < 1) { this._hoverAt(x, y, true); return Promise.resolve(); }
    var speed = (o.speed || 1) * this.opts.speed;
    var duration = o.duration != null ? o.duration : clamp(260 + dist * 0.55 + rand(-40, 70), 280, 1400);
    duration /= speed;
    var nx = -dy / dist, ny = dx / dist;
    var bend = clamp(rand(-0.16, 0.16) * dist, -140, 140) * (o.curve != null ? o.curve : 1);
    var overshoot = this.opts.overshoot && o.overshoot !== false && dist > 320 && Math.random() < 0.55;
    var end = { x: x, y: y };
    if (overshoot) {
      var k = rand(7, 15) / dist;
      end = { x: x + dx * k + nx * rand(-4, 4), y: y + dy * k + ny * rand(-4, 4) };
    }
    var pts = [
      from,
      { x: from.x + dx * 0.28 + nx * bend, y: from.y + dy * 0.28 + ny * bend },
      { x: from.x + dx * 0.78 + nx * bend * 0.55, y: from.y + dy * 0.78 + ny * bend * 0.55 },
      end
    ];
    var self = this;
    return this._animatePath(pts, duration).then(function () {
      if (!overshoot || self._aborted) return;
      var p = self.pos;
      return self._animatePath([p, p, { x: x, y: y }, { x: x, y: y }], rand(120, 190) / speed);
    });
  };

  /** Pick a natural point inside an element (not dead-centre), in layout coordinates. */
  P._pointIn = function (el, o) {
    var r = el.getBoundingClientRect(), p;
    if (o && o.position && typeof o.position === 'object') {
      p = { x: r.left + r.width * o.position.x, y: r.top + r.height * o.position.y };
    } else {
      var jx = r.width > 40 ? rand(-0.18, 0.18) * r.width : 0;
      var jy = r.height > 30 ? rand(-0.15, 0.15) * r.height : 0;
      if (el.matches && el.matches(TEXTY) && r.width > 120) jx = rand(-0.3, -0.1) * r.width;
      p = { x: r.left + r.width / 2 + jx, y: r.top + r.height / 2 + jy };
    }
    return this._toLayout(p.x, p.y);
  };

  /** Make sure an element is visible before acting on it (the scroll module animates this). */
  P._ensureInView = function () { return Promise.resolve(); };

  /** Resolve + bring into view + move the cursor onto the element. Resolves with the element. */
  P._approach = function (target, o) {
    var self = this;
    return this._resolve(target, o && o.timeout).then(function (el) {
      return self._ensureInView(el).then(function () {
        var pt = self._pointIn(el, o);
        return self._moveToPoint(pt.x, pt.y, o).then(function () { return el; });
      });
    });
  };

  /** Move the cursor to an element, or to {x, y} viewport coordinates. */
  P.moveTo = function (target, o) {
    return this._step('moveTo', arguments, function () {
      if (target && typeof target.x === 'number' && target.nodeType == null) return this._moveToPoint(target.x, target.y, o);
      return this._approach(target, o);
    });
  };

  /** Hover over an element for `o.duration` ms (default 800). */
  P.hover = function (target, o) {
    return this._step('hover', arguments, function () {
      var self = this;
      return this._approach(target, o).then(function () { return sleep(((o && o.duration) || 800) / self.opts.speed); });
    });
  };

  /* ---- src/50-scroll.js ---- */
  /* ==================================================================
   * Scroll: bring targets into view with a JS-driven smooth scroll. It is
   * frame-exact, so it also renders correctly in frame-by-frame recording,
   * and it handles nested scroll containers.
   * ================================================================== */

  feature({
    defaults: {
      scrollBehavior: 'smooth'  // 'smooth' (animated by OneTake, frame-exact) | 'native' | 'instant'
    }
  });

  function scrollersOf(el) {
    var list = [], se = document.scrollingElement || document.documentElement;
    for (var n = el.parentElement; n; n = n.parentElement) {
      if (n === se || n === document.body) continue;
      var cs = getComputedStyle(n);
      if (/(auto|scroll|overlay)/.test(cs.overflowY + ' ' + cs.overflowX) &&
          (n.scrollHeight > n.clientHeight || n.scrollWidth > n.clientWidth)) list.push(n);
    }
    list.push(se);
    return list;
  }
  function scrollPositions(boxes) { return boxes.map(function (b) { return [b.scrollLeft, b.scrollTop]; }); }
  function easeInOutCubic(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

  P._ensureInView = function (el, o) {
    var r = el.getBoundingClientRect(), m = 40;
    var inView = r.top >= m && r.bottom <= innerHeight - m && r.left >= 0 && r.right <= innerWidth;
    if (inView && !(o && o.force)) return Promise.resolve();
    var block = (o && o.block) || 'center';
    if (this.opts.scrollBehavior === 'native') {
      el.scrollIntoView({ behavior: 'smooth', block: block, inline: 'nearest' });
      return this._waitScrollSettle(el);
    }
    // Work out where every scroll container needs to end up, put them back, then animate there ourselves.
    var boxes = scrollersOf(el), from = scrollPositions(boxes);
    el.scrollIntoView({ behavior: 'instant', block: block, inline: 'nearest' });
    var to = scrollPositions(boxes);
    boxes.forEach(function (b, i) { b.scrollTo({ left: from[i][0], top: from[i][1], behavior: 'instant' }); });
    return this._animateScroll(boxes, to, o);
  };

  P._animateScroll = function (boxes, to, o) {
    var self = this, from = scrollPositions(boxes), dist = 0;
    boxes.forEach(function (b, i) {
      dist = Math.max(dist, Math.abs(to[i][0] - from[i][0]), Math.abs(to[i][1] - from[i][1]));
    });
    if (dist < 1) return Promise.resolve();
    function apply(e) {
      boxes.forEach(function (b, i) {
        b.scrollTo({ left: from[i][0] + (to[i][0] - from[i][0]) * e, top: from[i][1] + (to[i][1] - from[i][1]) * e, behavior: 'instant' });
      });
      self._updateHighlights();
    }
    if (this.opts.scrollBehavior === 'instant') { apply(1); return Promise.resolve(); }
    var duration = ((o && o.duration) || clamp(320 + dist * 0.45, 380, 1400)) / this.opts.speed;
    var start = performance.now(), frame = 0;
    return new Promise(function (resolve) {
      (function loop() {
        var t = clamp((performance.now() - start) / duration, 0, 1);
        apply(easeInOutCubic(t));
        if (self.pos && (frame++ % 3 === 0 || t === 1)) self._hoverAt(self.pos.x, self.pos.y, true);
        if (t < 1 && !self._aborted) requestAnimationFrame(loop);
        else resolve(sleep(60 / self.opts.speed));
      })();
    });
  };

  /** For scrollBehavior: 'native' — wait until the browser's smooth scroll has stopped. */
  P._waitScrollSettle = function (el) {
    var last = null, stable = 0, t0 = performance.now(), self = this;
    return new Promise(function (resolve) {
      (function loop() {
        var r = el.getBoundingClientRect();
        var key = Math.round(r.top) + ',' + Math.round(r.left);
        stable = key === last ? stable + 1 : 0; last = key;
        self._updateHighlights();
        if (stable >= 6 || performance.now() - t0 > 2500) resolve(sleep(80 / self.opts.speed));
        else requestAnimationFrame(loop);
      })();
    });
  };

  /** Smoothly scroll an element into view (block: 'center' | 'start' ...) or to a y position. */
  P.scrollTo = function (target, o) {
    return this._step('scrollTo', arguments, function () {
      var self = this;
      if (typeof target === 'number') {
        var se = document.scrollingElement || document.documentElement;
        var max = se.scrollHeight - se.clientHeight;
        return this._animateScroll([se], [[se.scrollLeft, clamp(target, 0, max)]], o);
      }
      return this._resolve(target).then(function (el) { return self._ensureInView(el, assign({ force: true }, o)); });
    });
  };

  /** Scroll the page (or a scroll container) by dy pixels, like a mouse wheel. */
  P.scrollBy = function (dy, o) {
    o = o || {};
    return this._step('scrollBy', arguments, function () {
      var box = o.container ? queryTarget(o.container) : (document.scrollingElement || document.documentElement);
      if (!box) throw new Error('OneTake.scrollBy: container not found');
      var max = box.scrollHeight - box.clientHeight;
      return this._animateScroll([box], [[box.scrollLeft, clamp(box.scrollTop + dy, 0, max)]], o);
    });
  };

  /* ---- src/60-click.js ---- */
  /* ==================================================================
   * Click: real pointer/mouse event sequences with a press animation and a
   * ripple, plus double-click and checkbox / radio helpers.
   * ================================================================== */

  feature({
    defaults: {
      clickColor: 'rgba(59,130,246,0.45)'
    },
    css: function (o) {
      return '.ot-fx{position:absolute;inset:0;z-index:2;}' +
        '.ot-ripple{position:absolute;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;background:' + o.clickColor + ';transform:scale(.2);opacity:1;animation:ot-ripple .55s ease-out forwards;}' +
        '@keyframes ot-ripple{to{transform:scale(1.35);opacity:0;}}';
    }
  });

  P._ripple = function (x, y) {
    var d = document.createElement('div');
    d.className = 'ot-ripple';
    d.style.left = x + 'px'; d.style.top = y + 'px';
    this._part('_fx', 'div', 'ot-fx').appendChild(d);
    setTimeout(function () { d.remove(); }, 700);
  };

  /** Press and release at the cursor's current position. */
  P._clickAt = function (el, o) {
    o = o || {};
    var self = this, sp = this.opts.speed;
    var hit = this._hit(this.pos.x, this.pos.y);
    var vis = this._toVisual(this.pos.x, this.pos.y), x = vis.x, y = vis.y;
    if (!hit || (el && !el.contains(hit) && !hit.contains(el))) hit = el; // be forgiving about overlays
    var count = o.double ? 2 : 1;
    function once(i) {
      var down = mouseInit(x, y, { buttons: 1, detail: i + 1 });
      self._cursor.classList.add('ot-pressed');
      self._sound('click');
      fire(hit, 'pointerdown', down);
      var proceed = fire(hit, 'mousedown', down);
      if (proceed) {
        // Real mouse clicks focus form fields but don't show focus rings on links/buttons.
        var f = hit.closest && hit.closest(TEXTY + ',select');
        if (f && f !== document.activeElement) f.focus({ preventScroll: true });
        else if (!f && document.activeElement && document.activeElement !== document.body &&
                 !document.activeElement.contains(hit)) document.activeElement.blur();
      }
      self._hoverSet.forEach(function (e) { e.classList.add('ot-active'); });
      self._ripple(x, y);
      return sleep(rand(70, 120) / sp).then(function () {
        var up = mouseInit(x, y, { detail: i + 1 });
        fire(hit, 'pointerup', up);
        fire(hit, 'mouseup', up);
        self._hoverSet.forEach(function (e) { e.classList.remove('ot-active'); });
        self._cursor.classList.remove('ot-pressed');
        fire(hit, 'click', up); // synthetic click runs activation behaviour (links, checkboxes, submit)
        if (i === 1) fire(hit, 'dblclick', mouseInit(x, y, { detail: 2 }));
      });
    }
    var p = once(0);
    if (count === 2) p = p.then(function () { return sleep(rand(60, 90) / sp); }).then(function () { return once(1); });
    return p.then(function () { return sleep(rand(90, 160) / sp); });
  };

  /** Move to and click an element. o: { double, position: {x, y}, speed, timeout } */
  P.click = function (target, o) {
    return this._step('click', arguments, function () {
      var self = this;
      return this._approach(target, o).then(function (el) {
        return sleep(rand(80, 160) / self.opts.speed).then(function () { return self._clickAt(el, o); });
      });
    });
  };

  P.doubleClick = function (target, o) { return this.click(target, assign({}, o, { double: true })); };

  /** Make sure a checkbox / radio / switch is in the given state (default checked). */
  P.check = function (target, state, o) {
    if (state == null) state = true;
    return this._step('check', arguments, function () {
      var self = this;
      return this._resolve(target).then(function (el) {
        var input = el.matches('input') ? el : (el.control || el.querySelector('input[type=checkbox],input[type=radio]'));
        var current = input ? input.checked : el.getAttribute('aria-checked') === 'true';
        if (current === state) return self._approach(el, o);
        return self._approach(el, o).then(function () { return self._clickAt(el, o); });
      });
    });
  };
  P.uncheck = function (target, o) { return this.check(target, false, o); };

  OneTake.version = '1.0.0';
  return OneTake;
});
