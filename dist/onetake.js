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

  /* ---- src/70-input.js ---- */
  /* ==================================================================
   * Input: human-like typing (variable rhythm, optional typos), key presses
   * and native <select>. Values go through the native setter plus
   * beforeinput / input / change, so React, Vue, Angular and Svelte update.
   * ================================================================== */

  feature({
    defaults: {
      typingDelay: 75,          // average ms per character
      typingVariance: 0.55,     // 0..1 random variance on typing delay
      typos: 0                  // probability (0..1) per letter of a typo + backspace
    }
  });

  function nativeSetter(el, prop) {
    var proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype :
      el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    var d = Object.getOwnPropertyDescriptor(proto, prop);
    return function (v) { if (d && d.set) d.set.call(el, v); else el[prop] = v; };
  }

  function keyInit(key) {
    var code = key.length === 1 ? (/[a-z]/i.test(key) ? 'Key' + key.toUpperCase() : /\d/.test(key) ? 'Digit' + key : '') : key;
    return { key: key, code: code, bubbles: true, cancelable: true, composed: true };
  }

  var NEIGHBOURS = 'qwertyuiopasdfghjklzxcvbnm';
  function typoFor(ch) {
    var lower = ch.toLowerCase(), i = NEIGHBOURS.indexOf(lower);
    var c = NEIGHBOURS[clamp(i + (Math.random() < 0.5 ? -1 : 1), 0, NEIGHBOURS.length - 1)];
    return ch === lower ? c : c.toUpperCase();
  }

  P._insertText = function (el, text, inputType) {
    if (el.isContentEditable) {
      document.execCommand(inputType === 'deleteContentBackward' ? 'delete' : 'insertText', false, text);
      return;
    }
    var v = el.value, s = el.selectionStart, e = el.selectionEnd;
    if (s == null) { s = e = v.length; } // email/number inputs have no selection API
    var nv, caret;
    if (inputType === 'deleteContentBackward') {
      if (s === e) s = Math.max(0, s - 1);
      nv = v.slice(0, s) + v.slice(e); caret = s;
    } else { nv = v.slice(0, s) + text + v.slice(e); caret = s + text.length; }
    el.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: inputType, data: text || null }));
    nativeSetter(el, 'value')(nv); // works with React/Vue controlled inputs
    try { el.setSelectionRange(caret, caret); } catch (err) { /* not supported */ }
    el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: inputType, data: text || null }));
  };

  P._key = function (el, key, char) {
    this._sound('key');
    var ok = el.dispatchEvent(new KeyboardEvent('keydown', keyInit(key)));
    if (ok && char != null) {
      el.dispatchEvent(new KeyboardEvent('keypress', keyInit(key)));
      this._insertText(el, char, 'insertText');
    } else if (ok && key === 'Backspace') {
      this._insertText(el, '', 'deleteContentBackward');
    }
    el.dispatchEvent(new KeyboardEvent('keyup', keyInit(key)));
    return ok;
  };

  P._typeInto = function (el, text, o) {
    o = o || {};
    var self = this, base = o.delay || this.opts.typingDelay, v = this.opts.typingVariance;
    var typos = o.typos != null ? o.typos : this.opts.typos;
    var chars = Array.from(String(text));
    var i = 0;
    function delay(ch) {
      var d = base * (1 + rand(-v, v));
      if (/[\s.,!?;:@]/.test(ch)) d += rand(30, 140);
      if (Math.random() < 0.04) d += rand(150, 380); // occasional thinking pause
      return d / self.opts.speed;
    }
    function step() {
      if (self._aborted || i >= chars.length) return Promise.resolve();
      var ch = chars[i++];
      var p = Promise.resolve();
      if (typos && /[a-z]/i.test(ch) && Math.random() < typos) {
        var wrong = typoFor(ch);
        p = p.then(function () { self._key(el, wrong, wrong); return sleep(delay(wrong) + rand(120, 260) / self.opts.speed); })
             .then(function () { self._key(el, 'Backspace'); return sleep(delay(ch)); });
      }
      return p.then(function () {
        if (ch === '\n') {
          if (el.tagName === 'TEXTAREA' || el.isContentEditable) self._key(el, 'Enter', '\n');
          else self._pressKey(el, 'Enter');
        } else self._key(el, ch, ch);
        return sleep(delay(ch));
      }).then(step);
    }
    return step().then(function () {
      if (!el.isContentEditable) el.dispatchEvent(new Event('change', { bubbles: true }));
    });
  };

  P._pressKey = function (el, key) {
    el = el || document.activeElement || document.body;
    var ok = el.dispatchEvent(new KeyboardEvent('keydown', keyInit(key)));
    if (ok && key === 'Enter' && el.form && el.tagName === 'INPUT') {
      if (el.form.requestSubmit) el.form.requestSubmit(); else el.form.submit();
    } else if (ok && key === 'Tab') {
      var all = Array.prototype.filter.call(document.querySelectorAll(FOCUSABLE), function (n) {
        return n.tabIndex >= 0 && !n.disabled && isVisible(n);
      });
      var idx = all.indexOf(el);
      var next = all[(idx + 1) % all.length];
      if (next) next.focus();
    } else if (ok && key === 'Backspace' && (el.value != null || el.isContentEditable)) {
      this._insertText(el, '', 'deleteContentBackward');
    }
    el.dispatchEvent(new KeyboardEvent('keyup', keyInit(key)));
  };

  /**
   * Click into a field and type text like a person.
   * o: { clear: true, delay, typos, click: true, enter: false }
   */
  P.type = function (target, text, o) {
    o = o || {};
    return this._step('type', arguments, function () {
      var self = this;
      return this._approach(target, o).then(function (el) {
        var ready = o.click === false ? Promise.resolve() : self._clickAt(el, o);
        return ready.then(function () {
          var f = el.matches(FOCUSABLE) ? el : el.querySelector(TEXTY) || el;
          if (document.activeElement !== f) f.focus({ preventScroll: true });
          if (o.clear !== false && !f.isContentEditable && f.value) {
            f.select && f.select();
            self._insertText(f, '', 'deleteContentBackward');
            return sleep(120 / self.opts.speed).then(function () { return f; });
          }
          return f;
        }).then(function (f) {
          return self._typeInto(f, text, o).then(function () {
            if (o.enter) { self._pressKey(f, 'Enter'); return sleep(150 / self.opts.speed); }
          });
        });
      });
    });
  };

  /** Clear a text field (visible select-all + delete). */
  P.clear = function (target) {
    return this._step('clear', arguments, function () {
      var self = this;
      return this._approach(target).then(function (el) {
        return self._clickAt(el).then(function () {
          el.select && el.select();
          self._insertText(el, '', 'deleteContentBackward');
          el.dispatchEvent(new Event('change', { bubbles: true }));
        });
      });
    });
  };

  /** Press a key on the focused element: 'Enter', 'Tab', 'Escape', 'Backspace', ... */
  P.press = function (key, o) {
    return this._step('press', arguments, function () {
      var self = this, times = (o && o.times) || 1, i = 0;
      return (function again() {
        if (i++ >= times) return Promise.resolve();
        self._sound('key');
        self._pressKey(document.activeElement, key);
        return sleep(rand(90, 150) / self.opts.speed).then(again);
      })();
    });
  };

  /** Choose an option of a native <select> by value or visible text. */
  P.select = function (target, valueOrText, o) {
    return this._step('select', arguments, function () {
      var self = this;
      return this._approach(target, o).then(function (el) {
        return self._clickAt(el, o).then(function () { return sleep(rand(350, 550) / self.opts.speed); }).then(function () {
          if (el.tagName !== 'SELECT') throw new Error('OneTake.select: target is not a <select>; use click() for custom dropdowns');
          var want = norm(valueOrText), opt = null;
          for (var i = 0; i < el.options.length; i++) {
            var op = el.options[i];
            if (op.value === String(valueOrText) || norm(op.text) === want) { opt = op; break; }
          }
          if (!opt) throw new Error('OneTake.select: no option "' + valueOrText + '"');
          nativeSetter(el, 'value')(opt.value);
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          el.blur();
        });
      });
    });
  };

  /* ---- src/80-sound.js ---- */
  /* ==================================================================
   * Sound: optional soft click and key sounds (WebAudio, no files),
   * for videos captured with a screen recorder.
   * ================================================================== */

  feature({
    defaults: {
      sound: false              // soft click / key sounds
    }
  });

  var audioCtx = null;
  function tick(kind) {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      var len = kind === 'key' ? 0.025 : 0.04;
      var buf = audioCtx.createBuffer(1, Math.floor(audioCtx.sampleRate * len), audioCtx.sampleRate);
      var data = buf.getChannelData(0);
      for (var i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 4);
      var src = audioCtx.createBufferSource(); src.buffer = buf;
      var f = audioCtx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = kind === 'key' ? 3200 : 1800;
      var g = audioCtx.createGain(); g.gain.value = kind === 'key' ? 0.18 : 0.35;
      src.connect(f); f.connect(g); g.connect(audioCtx.destination); src.start();
    } catch (e) { /* audio is best-effort */ }
  }

  P._sound = function (kind) { if (this.opts.sound) tick(kind); };

  /* ---- src/90-highlights.js ---- */
  /* ==================================================================
   * Highlights: hand-drawn circle, box, underline and arrow strokes that
   * draw themselves like a pen, with optional callout labels. Shapes are a
   * small registry (SHAPES), so new ones can be added.
   * ================================================================== */

  var SVGNS = 'http://www.w3.org/2000/svg';

  function seeded(seed) { // tiny deterministic PRNG so redrawn shapes keep their wobble
    var s = seed % 2147483647; if (s <= 0) s += 2147483646;
    return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  }

  function circlePath(w, h, pad, rnd) {
    var cx = w / 2, cy = h / 2;
    var rx = w / 2 + pad + Math.min(w * 0.1, 40), ry = h / 2 + pad + Math.min(h * 0.22, 30);
    var start = -Math.PI * (0.55 + rnd() * 0.2); // begin near the top-left, like a pen stroke
    var sweep = Math.PI * 2 + 0.35 + rnd() * 0.25;
    var ph = rnd() * 6.28, steps = 96, d = '';
    for (var i = 0; i <= steps; i++) {
      var t = i / steps, a = start + sweep * t;
      var wob = 1 + 0.025 * Math.sin(a * 3 + ph) + 0.06 * t; // spirals out slightly for the overlap
      var x = cx + Math.cos(a) * rx * wob, y = cy + Math.sin(a) * ry * wob;
      d += (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
    }
    return d;
  }

  function boxPath(w, h, pad, rnd) {
    var x0 = -pad, y0 = -pad, x1 = w + pad, y1 = h + pad, j = function () { return (rnd() - 0.5) * 4; };
    var r = Math.min(10, (h + pad * 2) / 3);
    return 'M' + (x0 + r) + ' ' + (y0 + j()) +
      'L' + (x1 - r) + ' ' + (y0 + j()) + 'Q' + x1 + ' ' + y0 + ' ' + (x1 + j() * 0.3) + ' ' + (y0 + r) +
      'L' + (x1 + j()) + ' ' + (y1 - r) + 'Q' + x1 + ' ' + y1 + ' ' + (x1 - r) + ' ' + (y1 + j() * 0.3) +
      'L' + (x0 + r) + ' ' + (y1 + j()) + 'Q' + x0 + ' ' + y1 + ' ' + (x0 + j() * 0.3) + ' ' + (y1 - r) +
      'L' + (x0 + j()) + ' ' + (y0 + r) + 'Q' + x0 + ' ' + y0 + ' ' + (x0 + r + 8) + ' ' + (y0 - 1);
  }

  function underlinePath(w, h, pad, rnd) {
    var y = h + Math.max(4, pad * 0.6), d = 'M' + (-4) + ' ' + y, n = 6;
    for (var i = 1; i <= n; i++) {
      var x = -4 + (w + 8) * i / n;
      d += 'Q' + (x - (w + 8) / n / 2) + ' ' + (y + (rnd() - 0.5) * 7) + ' ' + x + ' ' + (y + (rnd() - 0.5) * 2);
    }
    return d;
  }

  function arrowPaths(w, h, from, rnd) {
    var dirs = { 'top-left': [-1, -1], 'top-right': [1, -1], 'bottom-left': [-1, 1], 'bottom-right': [1, 1],
      left: [-1, 0], right: [1, 0], top: [0, -1], bottom: [0, 1] };
    var v = dirs[from] || dirs['top-left'];
    var ex = w / 2 + v[0] * (w / 2 + 10), ey = h / 2 + v[1] * (h / 2 + 10);
    var len = 110;
    var sx = ex + v[0] * len + (v[0] === 0 ? 60 : 0), sy = ey + v[1] * len * 0.75 + (v[1] === 0 ? -50 : 0);
    var mx = (sx + ex) / 2 + (rnd() - 0.5) * 50 + v[1] * 25, my = (sy + ey) / 2 - (rnd() - 0.5) * 50 - v[0] * 25;
    var ang = Math.atan2(ey - my, ex - mx), hl = 16;
    var head = 'M' + (ex - hl * Math.cos(ang - 0.45)) + ' ' + (ey - hl * Math.sin(ang - 0.45)) +
      'L' + ex + ' ' + ey + 'L' + (ex - hl * Math.cos(ang + 0.45)) + ' ' + (ey - hl * Math.sin(ang + 0.45));
    return ['M' + sx + ' ' + sy + 'Q' + mx + ' ' + my + ' ' + ex + ' ' + ey, head];
  }

  /** Pen-stroke shapes: return SVG path(s) in the element's local coordinates. */
  function strokeShape(makePaths) {
    return function (self, h, r, o, rnd, drawMs) {
      var g = document.createElementNS(SVGNS, 'g');
      g.setAttribute('class', 'ot-fade');
      self._part('_svg', 'svg', 'ot-svg').appendChild(g);
      h.nodes.push(g); h.group = g;
      var promises = [], t = 0;
      makePaths(r, o, rnd).forEach(function (pd, i) {
        var dur = i === 0 ? drawMs : drawMs * 0.35;
        promises.push(self._drawStroke(g, pd, o, t, dur));
        t += dur;
      });
      return Promise.all(promises);
    };
  }

  var SHAPES = {
    circle: strokeShape(function (r, o, rnd) { return [circlePath(r.width, r.height, o.padding, rnd)]; }),
    box: strokeShape(function (r, o, rnd) { return [boxPath(r.width, r.height, o.padding, rnd)]; }),
    underline: strokeShape(function (r, o, rnd) { return [underlinePath(r.width, r.height, o.padding, rnd)]; }),
    arrow: strokeShape(function (r, o, rnd) { return arrowPaths(r.width, r.height, o.from, rnd); })
  };
  SHAPES.rect = SHAPES.box;

  feature({
    defaults: {
      highlightColor: '#ef4444'
    },
    css: function () {
      return '.ot-svg{position:absolute;inset:0;z-index:1;width:100%;height:100%;overflow:visible;}' +
        '.ot-svg path{fill:none;stroke-linecap:round;stroke-linejoin:round;}' +
        '.ot-fade{transition:opacity .35s ease;}' +
        '.ot-fx{position:absolute;inset:0;z-index:2;}' +
        '.ot-label{position:absolute;max-width:280px;padding:7px 12px;border-radius:9px;color:#fff;font:600 14px/1.35 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.25);opacity:0;transform:translateY(6px);transition:opacity .3s ease,transform .3s ease;white-space:normal;}' +
        '.ot-label.ot-in{opacity:1;transform:none;}';
    },
    init: function () { this._highlights = []; },
    mount: function () {
      var self = this;
      this._onResize = function () { self._updateHighlights(); };
      window.addEventListener('resize', this._onResize);
    },
    stop: function () { this._clearHighlights(true); },
    destroy: function () { window.removeEventListener('resize', this._onResize); }
  });

  P._drawStroke = function (group, d, o, delay, duration) {
    var p = document.createElementNS(SVGNS, 'path');
    p.setAttribute('d', d);
    p.setAttribute('stroke', o.color);
    p.setAttribute('stroke-width', o.strokeWidth);
    if (o.glow !== false) p.style.filter = 'drop-shadow(0 1px 2px rgba(0,0,0,.25))';
    group.appendChild(p);
    var len = p.getTotalLength();
    p.style.strokeDasharray = len + ' ' + len;
    p.style.strokeDashoffset = len;
    var anim = p.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }],
      { duration: duration, delay: delay, easing: 'cubic-bezier(.55,.1,.35,1)', fill: 'forwards' });
    return anim.finished.catch(function () {});
  };

  P._highlight = function (target, o) {
    var self = this;
    o = assign({
      shape: 'circle', color: this.opts.highlightColor, padding: 10, strokeWidth: 4,
      drawDuration: 750, duration: 2600, block: true, label: null, labelPosition: 'auto', from: 'top-left'
    }, o);
    var shape = SHAPES[o.shape];
    if (!shape) return Promise.reject(new Error('OneTake.highlight: unknown shape "' + o.shape + '"'));
    var sp = this.opts.speed;
    return this._resolve(target, o.timeout).then(function (el) {
      return self._ensureInView(el).then(function () {
        var r = el.getBoundingClientRect(), rnd = seeded(Math.floor(Math.random() * 1e9));
        var h = { el: el, nodes: [], w: r.width, h: r.height, pad: o.padding, shape: o.shape };
        var drawMs = o.drawDuration / sp;
        var drawn = shape(self, h, r, o, rnd, drawMs);

        if (o.label) {
          var lab = document.createElement('div');
          lab.className = 'ot-label';
          lab.style.background = o.labelColor || o.color;
          lab.textContent = o.label;
          self._part('_fx', 'div', 'ot-fx').appendChild(lab);
          h.nodes.push(lab); h.label = lab; h.labelPosition = o.labelPosition;
          setTimeout(function () { lab.classList.add('ot-in'); }, drawMs * 0.6);
        }

        self._highlights.push(h);
        self._updateHighlights();
        self._startTracking();

        var removeAfter = o.duration && isFinite(o.duration) ? o.duration / sp : null;
        if (removeAfter) setTimeout(function () { self._removeHighlight(h); }, removeAfter);
        if (o.block && removeAfter) return sleep(removeAfter);
        return drawn.then(function () { return sleep(o.hold != null ? o.hold / sp : 0); });
      });
    });
  };

  /** Keep every highlight glued to its element (scrolling, resizing, camera zoom). */
  P._updateHighlights = function () {
    this._highlights.forEach(function (h) {
      if (!h.el.isConnected) return;
      var r = h.el.getBoundingClientRect(), pad = h.pad;
      if (h.group) h.group.setAttribute('transform', 'translate(' + r.left + ' ' + r.top + ')' +
        (h.w > 0 && Math.abs(r.width / h.w - 1) > 0.001 ? ' scale(' + (r.width / h.w) + ')' : ''));
      if (h.box) {
        h.box.style.left = (r.left - pad) + 'px'; h.box.style.top = (r.top - pad) + 'px';
        h.box.style.width = (r.width + pad * 2) + 'px'; h.box.style.height = (r.height + pad * 2) + 'px';
      }
      if (h.label) {
        var lw = h.label.offsetWidth, lh = h.label.offsetHeight, gap = pad + (h.shape === 'circle' ? 26 : 14);
        var pos = h.labelPosition;
        if (pos === 'auto') pos = r.top - gap - lh > 8 ? 'top' : 'bottom';
        var x = clamp(r.left + r.width / 2 - lw / 2, 8, innerWidth - lw - 8);
        var y = pos === 'top' ? r.top - gap - lh : pos === 'bottom' ? r.bottom + gap : r.top + r.height / 2 - lh / 2;
        if (pos === 'right') x = Math.min(r.right + gap, innerWidth - lw - 8);
        if (pos === 'left') x = Math.max(r.left - gap - lw, 8);
        h.label.style.left = x + 'px'; h.label.style.top = y + 'px';
      }
    });
  };

  P._startTracking = function () {
    if (this._tracking) return;
    var self = this;
    this._tracking = true;
    (function loop() {
      if (!self._highlights.length) { self._tracking = false; return; }
      self._updateHighlights();
      requestAnimationFrame(loop);
    })();
  };

  P._removeHighlight = function (h, instant) {
    var i = this._highlights.indexOf(h);
    if (i === -1) return;
    this._highlights.splice(i, 1);
    h.nodes.forEach(function (n) {
      if (instant) return n.remove();
      n.style.transition = 'opacity .35s ease';
      n.style.opacity = '0';
      if (n.classList) n.classList.remove('ot-in');
      setTimeout(function () { n.remove(); }, 400);
    });
  };

  P._clearHighlights = function (instant) {
    var self = this;
    this._highlights.slice().forEach(function (h) { self._removeHighlight(h, instant); });
  };

  /**
   * Draw attention to an element.
   * shape: 'circle' | 'box' | 'underline' | 'arrow' (+ 'spotlight' | 'pulse')
   * o: { color, padding, strokeWidth, drawDuration, duration (0 = until clearHighlights),
   *      block (wait for duration before next step), hold, label, labelPosition, from (arrow) }
   */
  P.highlight = function (target, o) {
    if (typeof o === 'string') o = { shape: o };
    return this._step('highlight', arguments, function () { return this._highlight(target, o); });
  };
  P.circle = function (target, o) { return this.highlight(target, assign({}, o, { shape: 'circle' })); };
  P.box = function (target, o) { return this.highlight(target, assign({}, o, { shape: 'box' })); };
  P.underline = function (target, o) { return this.highlight(target, assign({}, o, { shape: 'underline' })); };
  P.arrow = function (target, o) { return this.highlight(target, assign({}, o, { shape: 'arrow' })); };

  P.clearHighlights = function () {
    return this._step('clearHighlights', arguments, function () { this._clearHighlights(); return sleep(380 / this.opts.speed); });
  };

  OneTake.shapes = SHAPES;

  /* ---- src/91-spotlight.js ---- */
  /* ==================================================================
   * Spotlight & pulse: dim everything except one element, or ring it with
   * a pulsing outline. Registered as highlight shapes.
   * ================================================================== */

  function boxShape(className, fadeMs) {
    return function (self, h, r, o) {
      var d = document.createElement('div');
      d.className = className;
      d.style.color = o.color;
      if (o.radius != null) d.style.borderRadius = o.radius + 'px';
      var fx = self._part('_fx', 'div', 'ot-fx');
      fx.insertBefore(d, fx.firstChild);
      h.nodes.push(d); h.box = d;
      if (fadeMs) requestAnimationFrame(function () { d.style.opacity = '1'; });
      return sleep(fadeMs / self.opts.speed);
    };
  }

  SHAPES.spotlight = boxShape('ot-spot', 420);
  SHAPES.pulse = boxShape('ot-pulse', 0);

  feature({
    css: function () {
      return '.ot-spot{position:absolute;border-radius:12px;box-shadow:0 0 0 200vmax rgba(15,23,42,.6);opacity:0;transition:opacity .4s ease;}' +
        '.ot-pulse{position:absolute;border-radius:12px;border:3px solid currentColor;animation:ot-pulse 1.2s ease-out infinite;}' +
        '@keyframes ot-pulse{0%{transform:scale(.96);opacity:.95}100%{transform:scale(1.18);opacity:0}}';
    }
  });

  P.spotlight = function (target, o) { return this.highlight(target, assign({}, o, { shape: 'spotlight' })); };
  P.pulse = function (target, o) { return this.highlight(target, assign({}, o, { shape: 'pulse' })); };

  OneTake.version = '1.0.0';
  return OneTake;
});
