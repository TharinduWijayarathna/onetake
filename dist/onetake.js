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

  /* ---- src/10-targets.js ---- */
  /* ==================================================================
   * Targets: find the element a step acts on.
   *
   *   '#save', '.card button'             CSS selector (first match)
   *   'text=Save'                         exact visible text; a unique partial match is accepted;
   *                                       several matches is an error (no guessing)
   *   'text*=Sav'                         text contains; picks the shortest (innermost) match
   *   'label=Email'                       form control by label / aria-label / placeholder / name
   *   'role=button[name="Save"]'          ARIA role (implicit or explicit) + accessible name
   *                                       ([name*="Sa"] for contains)
   *   '#form >> text=Save'                `>>` scopes the next part inside the previous match;
   *                                       an iframe match continues inside its document
   *   'text=Delete >> nth=1'              pick one of several matches (0-based, -1 = last)
   *   element / () => element             anything else
   *
   * Lookups pierce open shadow roots and same-origin iframes.
   * ================================================================== */

  var CLICKABLE = 'a[href],button,[role="button"],[role="tab"],[role="link"],[role="menuitem"],' +
    '[role="option"],[role="checkbox"],[role="radio"],[role="switch"],label,summary,select,' +
    'input[type="checkbox"],input[type="radio"],input[type="submit"],input[type="button"],' +
    'input[type="reset"],input[type="file"],input[type="range"],[onclick]';
  var TEXTY = 'textarea,[contenteditable=""],[contenteditable="true"],input:not([type]),' +
    'input[type="text"],input[type="email"],input[type="password"],input[type="search"],' +
    'input[type="url"],input[type="tel"],input[type="number"]';
  var FOCUSABLE = 'input,select,textarea,button,a[href],summary,[tabindex],[contenteditable=""],[contenteditable="true"]';
  var TEXT_PRIORITY = CLICKABLE + ',h1,h2,h3,h4,h5,h6,legend,th,dt,[role="heading"]';

  function AmbiguousTarget(target, list) {
    var shown = list.slice(0, 4).map(describeEl).join(', ') + (list.length > 4 ? ', …' : '');
    this.message = JSON.stringify(target) + ' matches ' + list.length + ' elements: ' + shown +
      '. Make it unique: scope it ("#form >> ' + target + '"), pick one ("' + target + ' >> nth=0")' +
      (/^text=/.test(target) ? ', or use text*= to take the shortest match' : '') + '.';
    this.name = 'AmbiguousTarget';
  }
  AmbiguousTarget.prototype = Object.create(Error.prototype);

  /* ---------- documents, shadow roots and frames ---------- */

  function winOf(el) { return (el.ownerDocument && el.ownerDocument.defaultView) || window; }
  function frameOf(el) { try { return winOf(el).frameElement || null; } catch (e) { return null; } }

  /** Viewport rect in the top-level document, accounting for same-origin iframes. */
  function rectOf(el) {
    var r = el.getBoundingClientRect(), x = r.left, y = r.top;
    for (var f = frameOf(el); f; f = frameOf(f)) {
      var fr = f.getBoundingClientRect();
      x += fr.left + f.clientLeft; y += fr.top + f.clientTop;
    }
    return { left: x, top: y, width: r.width, height: r.height, right: x + r.width, bottom: y + r.height };
  }

  /** Offset of an element's document inside the top-level viewport. */
  function frameOffset(el) {
    var x = 0, y = 0;
    for (var f = frameOf(el); f; f = frameOf(f)) {
      var fr = f.getBoundingClientRect();
      x += fr.left + f.clientLeft; y += fr.top + f.clientTop;
    }
    return { x: x, y: y };
  }

  /** `root` plus every open shadow root inside it (including root's own, if it is a shadow host). */
  function shadowRoots(root, out) {
    out = out || [root];
    if (root.shadowRoot && out.indexOf(root.shadowRoot) === -1) { out.push(root.shadowRoot); shadowRoots(root.shadowRoot, out); }
    var all = root.querySelectorAll('*');
    for (var i = 0; i < all.length; i++) if (all[i].shadowRoot) { out.push(all[i].shadowRoot); shadowRoots(all[i].shadowRoot, out); }
    return out;
  }

  /** querySelectorAll that falls back to searching inside shadow roots when the light DOM has no match. */
  function deepAll(scope, selector) {
    var found = Array.prototype.slice.call(scope.querySelectorAll(selector));
    if (found.length) return found;
    var roots = shadowRoots(scope);
    for (var i = 1; i < roots.length; i++) found = found.concat(Array.prototype.slice.call(roots[i].querySelectorAll(selector)));
    return found;
  }

  /** The element under a top-level viewport point, looking inside same-origin iframes and open shadow roots. */
  function hitTest(x, y) {
    var doc = document, el = null, ox = 0, oy = 0;
    for (var depth = 0; depth < 8; depth++) {
      el = doc.elementFromPoint(x - ox, y - oy);
      while (el && el.shadowRoot && el.shadowRoot.elementFromPoint) {
        var inner = el.shadowRoot.elementFromPoint(x - ox, y - oy);
        if (!inner || inner === el) break;
        el = inner;
      }
      if (el && el.tagName === 'IFRAME') {
        var d = null;
        try { d = el.contentDocument; } catch (e) { d = null; }
        if (!d) return el;
        var fr = el.getBoundingClientRect();
        ox += fr.left + el.clientLeft; oy += fr.top + el.clientTop;
        doc = d;
        continue;
      }
      return el;
    }
    return el;
  }

  /** a contains b, across shadow roots. */
  function deepContains(a, b) {
    for (var n = b; n; n = n.parentNode || n.host) if (n === a) return true;
    return false;
  }

  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    var r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return false;
    var cs = winOf(el).getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none' && parseFloat(cs.opacity) > 0.01;
  }

  function textOf(el) {
    if (el.tagName === 'INPUT') return el.value || el.getAttribute('aria-label') || '';
    return el.innerText != null ? el.innerText : el.textContent;
  }

  function squash(t) { return String(t == null ? '' : t).replace(/\s+/g, '').toLowerCase(); }
  function inOverlay(el) { return !!(el.closest && el.closest('.ot-layer')); }

  /** Drop matches contained in another match (keep the outermost: the link around a heading). */
  function outermost(list) {
    return list.filter(function (a) { return !list.some(function (b) { return b !== a && deepContains(b, a); }); });
  }

  /** Drop matches that contain another match (keep the innermost). */
  function innermost(list) {
    return list.filter(function (a) { return !list.some(function (b) { return b !== a && deepContains(a, b); }); });
  }
  function unique(list) { return list.filter(function (x, i) { return list.indexOf(x) === i; }); }

  /* ---------- matchers ---------- */

  /**
   * Text matches, best first: exact text on clickable/heading elements → exact text anywhere →
   * partial text on clickable/heading elements → partial text anywhere. mode 'contains' (text*=)
   * returns every match, shortest text first.
   */
  function textMatches(scope, wanted, mode) {
    var wantedSquashed = squash(wanted);
    function collect(selector) {
      var nodes = deepAll(scope, selector), exact = [], partial = [];
      for (var i = 0; i < nodes.length; i++) {
        var el = nodes[i];
        if (inOverlay(el)) continue;
        if (el.tagName !== 'INPUT' && squash(el.textContent).indexOf(wantedSquashed) === -1) continue;   // cheap pre-check
        var t = norm(textOf(el));
        if (!t || t.indexOf(wanted) === -1 || !isVisible(el)) continue;
        (t === wanted ? exact : partial).push(el);
      }
      return { exact: exact, partial: partial };
    }
    var top = collect(TEXT_PRIORITY), any = null;
    if (mode === 'contains') {
      any = collect('*');
      var all = innermost(unique(top.exact.concat(top.partial, any.exact, any.partial)));
      return all.sort(function (a, b) { return norm(textOf(a)).length - norm(textOf(b)).length; });
    }
    if (top.exact.length) return outermost(top.exact);
    any = collect('*');
    if (any.exact.length) return innermost(any.exact);
    if (top.partial.length) return outermost(top.partial);
    return innermost(any.partial);
  }

  function labelText(label) {
    var copy = label.cloneNode(true);
    Array.prototype.forEach.call(copy.querySelectorAll('select,input,textarea,button,option'), function (n) { n.remove(); });
    return norm(copy.textContent);
  }

  function labelMatches(scope, wanted) {
    var exact = [], prefix = [];
    var labels = deepAll(scope, 'label');
    for (var i = 0; i < labels.length; i++) {
      var l = labels[i], lt = labelText(l);
      if (lt !== wanted && lt.indexOf(wanted) !== 0) continue;
      var ctl = l.control || (l.htmlFor && (l.getRootNode().getElementById ? l.getRootNode().getElementById(l.htmlFor) : null)) ||
        l.querySelector('input,select,textarea');
      if (ctl) (lt === wanted ? exact : prefix).push(ctl);
    }
    var ctls = deepAll(scope, 'input,select,textarea,[contenteditable],[role="textbox"],[role="combobox"]');
    for (var j = 0; j < ctls.length; j++) {
      var c = ctls[j];
      var names = [c.getAttribute('aria-label'), c.getAttribute('placeholder'), c.getAttribute('name'), labelledBy(c)];
      for (var n = 0; n < names.length; n++) if (names[n] && norm(names[n]) === wanted) { exact.push(c); break; }
    }
    return unique(exact.length ? exact : prefix);
  }

  function labelledBy(el) {
    var ids = el.getAttribute && el.getAttribute('aria-labelledby');
    if (!ids) return null;
    var root = el.getRootNode();
    return ids.split(/\s+/).map(function (id) { var n = root.getElementById ? root.getElementById(id) : null; return n ? n.textContent : ''; }).join(' ');
  }

  var ROLE_SELECTORS = {
    button: 'button,input[type=button],input[type=submit],input[type=reset],[role=button]',
    link: 'a[href],[role=link]',
    textbox: TEXTY + ',[role=textbox]',
    checkbox: 'input[type=checkbox],[role=checkbox],[role=switch]',
    radio: 'input[type=radio],[role=radio]',
    combobox: 'select,[role=combobox]',
    heading: 'h1,h2,h3,h4,h5,h6,[role=heading]',
    img: 'img[alt],[role=img]',
    dialog: 'dialog,[role=dialog],[role=alertdialog]',
    listitem: 'li,[role=listitem]',
    row: 'tr,[role=row]',
    cell: 'td,[role=cell],[role=gridcell]',
    table: 'table,[role=table],[role=grid]',
    navigation: 'nav,[role=navigation]',
    tab: '[role=tab]', option: 'option,[role=option]', menuitem: '[role=menuitem]'
  };

  function roleOf(el) {
    var explicit = el.getAttribute('role');
    if (explicit) return explicit.split(/\s+/)[0];
    var tag = el.tagName.toLowerCase(), type = (el.getAttribute('type') || '').toLowerCase();
    if (tag === 'button' || (tag === 'input' && /^(button|submit|reset)$/.test(type))) return 'button';
    if (tag === 'a' && el.hasAttribute('href')) return 'link';
    if (tag === 'input' && type === 'checkbox') return 'checkbox';
    if (tag === 'input' && type === 'radio') return 'radio';
    if (tag === 'select') return 'combobox';
    if (/^h[1-6]$/.test(tag)) return 'heading';
    if (tag === 'textarea' || el.isContentEditable || (tag === 'input' && /^(|text|email|search|url|tel|password|number)$/.test(type))) return 'textbox';
    if (tag === 'img') return 'img';
    if (tag === 'dialog') return 'dialog';
    if (tag === 'li') return 'listitem';
    if (tag === 'tr') return 'row';
    if (tag === 'td') return 'cell';
    if (tag === 'table') return 'table';
    if (tag === 'nav') return 'navigation';
    if (tag === 'option') return 'option';
    return null;
  }

  function accessibleName(el) {
    var n = labelledBy(el) || el.getAttribute('aria-label');
    if (n) return norm(n);
    var tag = el.tagName;
    if ((tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') && el.labels && el.labels.length) return labelText(el.labels[0]);
    if (tag === 'IMG') return norm(el.getAttribute('alt'));
    if (tag === 'INPUT' && /^(button|submit|reset)$/i.test(el.type)) return norm(el.value);
    if (tag === 'INPUT' || tag === 'TEXTAREA') return norm(el.getAttribute('placeholder') || el.getAttribute('title'));
    return norm(el.innerText || el.textContent || el.getAttribute('title'));
  }

  function roleMatches(scope, spec) {
    var m = spec.match(/^([a-z]+)(?:\[name(\*?)=(["'])(.*)\3\])?$/i);
    if (!m) throw new Error('Bad role target "role=' + spec + '". Use role=button or role=button[name="Save"].');
    var role = m[1].toLowerCase(), contains = m[2] === '*', name = m[4] != null ? norm(m[4]) : null;
    var nodes = deepAll(scope, ROLE_SELECTORS[role] || '[role="' + role + '"]');
    return nodes.filter(function (el) {
      if (inOverlay(el) || roleOf(el) !== role || !isVisible(el)) return false;
      if (name == null) return true;
      var an = accessibleName(el);
      return contains ? an.indexOf(name) !== -1 : an === name;
    });
  }

  /* ---------- resolution ---------- */

  /** Every element a target matches, in order. */
  function resolveAll(target) {
    if (!target) return [];
    if (typeof target === 'function') { var r = target(); return r ? (r.nodeType ? [r] : Array.prototype.slice.call(r)) : []; }
    if (target.nodeType === 1) return [target];
    if (typeof target !== 'string') return [];
    var parts = target.split(/\s+>>\s+/), list = null;
    for (var i = 0; i < parts.length; i++) {
      var part = parts[i].trim(), m;
      if ((m = part.match(/^nth=(-?\d+)$/))) {
        if (!list) throw new Error('"nth=" needs something before it, e.g. "text=Delete >> nth=1".');
        var k = +m[1]; list = [list[k < 0 ? list.length + k : k]].filter(Boolean);
        continue;
      }
      var scopes = list ? list.map(function (el) {
        if (el.tagName === 'IFRAME') { try { return el.contentDocument; } catch (e) { return null; } }
        return el;
      }).filter(Boolean) : [document];
      var next = [];
      for (var s = 0; s < scopes.length; s++) next = next.concat(matchPart(scopes[s], part));
      list = unique(next);
      if (!list.length) return [];
    }
    return list || [];
  }

  function matchPart(scope, part) {
    if (part.indexOf('text*=') === 0) return textMatches(scope, norm(part.slice(6)), 'contains');
    if (part.indexOf('text=') === 0) return textMatches(scope, norm(part.slice(5)), 'exact');
    if (part.indexOf('label=') === 0) return labelMatches(scope, norm(part.slice(6)));
    if (part.indexOf('role=') === 0) return roleMatches(scope, part.slice(5).trim());
    if (part.indexOf('css=') === 0) part = part.slice(4);
    return deepAll(scope, part);
  }

  /** The single element a target points at, null if none yet; throws if a text/label/role target is ambiguous. */
  function queryTarget(target) {
    var list = resolveAll(target);
    if (list.length <= 1) return list[0] || null;
    var last = typeof target === 'string' ? target.split(/\s+>>\s+/).pop().trim() : '';
    if (/^(text=|label=|role=)/.test(last)) {
      var shown = list.filter(isVisible);
      if (shown.length === 1) return shown[0];
      throw new AmbiguousTarget(target, list);
    }
    return list[0];
  }

  function describeEl(el) {
    if (!el || !el.tagName) return String(el);
    var t = (el.innerText || el.value || '').trim().replace(/\s+/g, ' ');
    return '<' + el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') +
      (el.classList && el.classList.length ? '.' + Array.prototype.slice.call(el.classList, 0, 2).join('.') : '') + '>' +
      (t ? ' "' + (t.length > 24 ? t.slice(0, 23) + '…' : t) + '"' : '');
  }

  function describe(target) {
    if (typeof target === 'string') return target;
    if (target && target.nodeType === 1) return describeEl(target);
    if (typeof target === 'function') return 'function target';
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
        if (performance.now() - t0 > timeout) {
          return reject(new Error((el ? 'element is not visible: ' : 'element not found: ') + describe(target) +
            ' (waited ' + Math.round(timeout / 1000) + ' s)'));
        }
        setTimeout(poll, 60);
      })();
    });
  };

  /** Wait until an element exists and is visible (e.g. after navigation or an API call). */
  P.waitFor = function (target, o) {
    return this._step('waitFor', arguments, function () { return this._resolve(target, o && o.timeout); });
  };

  OneTake.resolveAll = resolveAll;
  OneTake.query = queryTarget;
  OneTake.findByText = function (text, root) { try { return textMatches(root || document, norm(text), 'exact')[0] || null; } catch (e) { return null; } };
  OneTake.findByLabel = function (text, root) { return labelMatches(root || document, norm(text))[0] || null; };

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
      hideNativeCursor: true,   // hide the real mouse pointer while the demo runs
      cursorIdle: 0,            // ms without movement before the cursor fades out (0 = never)
      cursorBlur: true          // a touch of motion blur on fast moves
    },
    css: function (o) {
      return '.ot-cursor{position:absolute;left:0;top:0;z-index:4;width:' + o.cursorSize + 'px;height:' + o.cursorSize + 'px;opacity:0;transition:opacity .25s ease;will-change:transform;filter:drop-shadow(0 2px 3px rgba(0,0,0,.35));}' +
        '.ot-cursor.ot-visible{opacity:1;}' +
        '.ot-cursor.ot-visible.ot-idle{opacity:0;transition:opacity .6s ease;}' +
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
    var prev = this.pos, now = performance.now();
    this.pos = { x: x, y: y };
    if (!this._cursor) return;
    var v = this._toVisual(x, y), z = this._visScale();
    var h = HOTSPOT[this._kind], k = this.opts.cursorSize / 24;
    this._cursor.style.transformOrigin = (h[0] * k) + 'px ' + (h[1] * k) + 'px';
    this._cursor.style.transform = 'translate3d(' + (v.x - h[0] * k) + 'px,' + (v.y - h[1] * k) + 'px,0)' +
      (z !== 1 ? ' scale(' + z.toFixed(4) + ')' : '');
    if (prev && (prev.x !== x || prev.y !== y)) this._cursorMoved(prev, now);
  };

  /** Motion blur on fast moves, and the idle fade-out. */
  P._cursorMoved = function (prev, now) {
    var o = this.opts, c = this._cursor;
    if (o.cursorBlur) {
      var dt = Math.max(1, now - (this._lastMoveAt || now - 16));
      var speed = Math.hypot(this.pos.x - prev.x, this.pos.y - prev.y) / dt;   // px per ms
      var blur = clamp((speed - 1.1) * 0.55, 0, 1.6);
      c.style.filter = 'drop-shadow(0 2px 3px rgba(0,0,0,.35))' + (blur > 0.05 ? ' blur(' + blur.toFixed(2) + 'px)' : '');
    }
    this._lastMoveAt = now;
    if (o.cursorIdle > 0) {
      c.classList.remove('ot-idle');
      clearTimeout(this._idleTimer);
      this._idleTimer = setTimeout(function () { c.style.filter = ''; c.classList.add('ot-idle'); }, o.cursorIdle);
    }
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
  P._hit = function (x, y) { var v = this._toVisual(x, y); return hitTest(v.x, v.y); };

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
  /** Dispatch a synthetic pointer/mouse event; coordinates are converted for elements inside iframes. */
  function fire(el, type, init) {
    if (!el) return true;
    var w = winOf(el);
    if (el.ownerDocument !== document) {
      var off = frameOffset(el);
      init = assign({}, init, { view: w, clientX: init.clientX - off.x, clientY: init.clientY - off.y });
    }
    var Ctor = /^pointer/.test(type) && w.PointerEvent ? w.PointerEvent : w.MouseEvent;
    return el.dispatchEvent(new Ctor(type, init));
  }

  /** True when the recorder drives the real mouse and keyboard (trusted input). */
  P._real = function () { return this.opts.realInput !== false && typeof window.__otInput === 'function'; };
  P._input = function (msg) { return window.__otInput(msg); };

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
    if (this._real()) {                                     // the real mouse hovers natively
      if (move) this._input({ type: 'move', x: x, y: y });
      if (hit !== this._hoverSet[0]) { this._hoverSet = hit ? [hit] : []; this._setKind(this._kindFor(hit)); }
      return hit;
    }
    var chain = [];
    for (var n = hit; n && n.nodeType === 1; n = n.parentElement || (n.parentNode && n.parentNode.host)) chain.push(n);
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
    if (move && hit) { var mi = mouseInit(x, y, this._dragHeld ? { buttons: 1 } : null); fire(hit, 'pointermove', mi); fire(hit, 'mousemove', mi); }
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
    var r = rectOf(el), p;
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

  function parentOf(n) { return n.parentElement || (n.parentNode && n.parentNode.host) || null; }

  /** Every container that scrolls `el` into view: its scrollable ancestors, through shadow roots and iframes. */
  function scrollersOf(el) {
    var list = [];
    for (var cur = el; cur; cur = frameOf(cur)) {
      var doc = cur.ownerDocument, se = doc.scrollingElement || doc.documentElement;
      for (var n = parentOf(cur); n; n = parentOf(n)) {
        if (n === se || n === doc.body || n.nodeType !== 1) continue;
        var cs = winOf(n).getComputedStyle(n);
        if (/(auto|scroll|overlay)/.test(cs.overflowY + ' ' + cs.overflowX) &&
            (n.scrollHeight > n.clientHeight || n.scrollWidth > n.clientWidth)) list.push(n);
      }
      list.push(se);
    }
    return list;
  }
  function scrollPositions(boxes) { return boxes.map(function (b) { return [b.scrollLeft, b.scrollTop]; }); }
  function easeInOutCubic(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

  P._ensureInView = function (el, o) {
    var r = rectOf(el), m = 40;
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

  /* ---- src/55-actionable.js ---- */
  /* ==================================================================
   * Actionability: before a click, type, check, select, drag or upload,
   * wait until the element is
   *   visible · enabled · not moving · the thing actually under the cursor point
   * (not covered by a modal, toast or overlay). If it never gets there, fail with
   * the reason, e.g. "covered by <div.modal-backdrop>". `force: true` skips the checks.
   * ================================================================== */

  function isDisabled(el) {
    if (el.matches && el.matches(':disabled')) return true;           // includes controls in a disabled <fieldset>
    return !!(el.closest && el.closest('[aria-disabled="true"]'));
  }

  /** The element (or something inside it, or its label) is what receives events at this point. */
  function receives(el, hit) {
    if (!hit) return false;
    if (hit === el || deepContains(el, hit)) return true;
    if (el.labels) for (var i = 0; i < el.labels.length; i++) if (el.labels[i] === hit || deepContains(el.labels[i], hit)) return true;
    if (hit.tagName === 'LABEL' && hit.control === el) return true;
    return false;
  }

  /** A point (top-level visual coords) on the element that really receives events, or why there isn't one. */
  P._pickPoint = function (el, o) {
    var r = rectOf(el), pts = [];
    if (o && o.position && typeof o.position === 'object') pts.push([r.left + r.width * o.position.x, r.top + r.height * o.position.y]);
    else {
      var jx = r.width > 40 ? rand(-0.18, 0.18) * r.width : 0;
      var jy = r.height > 30 ? rand(-0.15, 0.15) * r.height : 0;
      if (el.matches && el.matches(TEXTY) && r.width > 120) jx = rand(-0.3, -0.1) * r.width;
      pts.push([r.left + r.width / 2 + jx, r.top + r.height / 2 + jy]);
    }
    pts.push([r.left + r.width / 2, r.top + r.height / 2],
      [r.left + r.width * 0.25, r.top + r.height / 2], [r.left + r.width * 0.75, r.top + r.height / 2],
      [r.left + r.width / 2, r.top + r.height * 0.25], [r.left + r.width / 2, r.top + r.height * 0.75]);
    var firstHit = null;
    for (var i = 0; i < pts.length; i++) {
      var x = clamp(pts[i][0], 1, innerWidth - 1), y = clamp(pts[i][1], 1, innerHeight - 1);
      var hit = hitTest(x, y);
      if (receives(el, hit)) return { ok: true, x: x, y: y };
      if (!firstHit) firstHit = hit;
    }
    return { ok: false, hit: firstHit };
  };

  /** Wait until `el` can be acted on; resolves with a layout point to move the cursor to. */
  P._waitActionable = function (el, o) {
    o = o || {};
    var self = this, t0 = performance.now(), last = null;
    var timeout = o.timeout != null ? o.timeout : this.opts.waitTimeout;
    var verb = o.verb || 'click';
    return new Promise(function (resolve, reject) {
      (function poll() {
        if (self._aborted) return reject(new Error('OneTake: stopped'));
        var reason;
        if (!el.isConnected) return reject(new Error('cannot ' + verb + ' ' + describeEl(el) + ': it was removed from the page'));
        if (!isVisible(el)) reason = 'it is not visible';
        else if (o.enabled !== false && isDisabled(el)) reason = 'it is disabled';
        else {
          var r = rectOf(el), key = [r.left, r.top, r.width, r.height].map(Math.round).join(',');
          if (key !== last) { last = key; reason = 'it is still moving'; }
          else {
            var pt = self._pickPoint(el, o);
            if (pt.ok) { var l = self._toLayout(pt.x, pt.y); return resolve({ x: l.x, y: l.y }); }
            reason = 'it is covered by ' + describeEl(pt.hit);
          }
        }
        if (performance.now() - t0 > timeout) {
          return reject(new Error('cannot ' + verb + ' ' + describeEl(el) + ': ' + reason + ' (waited ' + Math.round(timeout / 1000) + ' s)'));
        }
        requestAnimationFrame(poll);
      })();
    });
  };

  /**
   * Resolve + bring into view + (for actions) wait until actionable + move the cursor onto it.
   * Re-checks after the move, because hover effects can shift layouts. Resolves with the element.
   */
  P._approach = function (target, o) {
    var self = this;
    o = o || {};
    return this._resolve(target, o.timeout).then(function (el) {
      return self._ensureInView(el).then(function () {
        if (!o.actionable || o.force) {
          var p = self._pointIn(el, o);
          return self._moveToPoint(p.x, p.y, o).then(function () { return el; });
        }
        var tries = 0;
        return (function attempt() {
          return self._waitActionable(el, o).then(function (pt) {
            return self._moveToPoint(pt.x, pt.y, o).then(function () {
              var v = self._toVisual(self.pos.x, self.pos.y);
              if (receives(el, hitTest(v.x, v.y)) || ++tries >= 3) return el;
              return attempt();                               // something moved under the cursor: aim again
            });
          });
        })();
      });
    });
  };

  /* ---- src/57-settle.js ---- */
  /* ==================================================================
   * Settle: after an action (click, type, select, check, Enter, drag, upload)
   * wait until the app is idle: no fetch / XHR in flight and no DOM changes for
   * `settleQuiet` ms (capped at `settleTimeout`). This replaces guessed sleeps for
   * Livewire, React, Vue, htmx, … apps. Pages that never stop changing the DOM
   * (tickers, carousels) are detected and only network activity is awaited.
   * ================================================================== */

  feature({
    defaults: {
      settle: true,             // wait for the app to go idle after actions
      settleQuiet: 200,         // ms without network or DOM activity that counts as idle
      settleTimeout: 4000       // never wait longer than this (then carry on)
    },
    mount: function () { if (this.opts.settle) track(window); }
  });

  var ACTIVITY = { pending: 0, last: 0, dom: 0, installed: false };

  function track(win) {
    if (ACTIVITY.installed) return;
    ACTIVITY.installed = true;
    var now = function () { return performance.now(); };
    var begin = function () { ACTIVITY.pending++; ACTIVITY.last = now(); };
    var end = function () { ACTIVITY.pending = Math.max(0, ACTIVITY.pending - 1); ACTIVITY.last = now(); };

    if (win.fetch) {
      var realFetch = win.fetch;
      win.fetch = function () {
        begin();
        var p;
        try { p = realFetch.apply(this, arguments); } catch (e) { end(); throw e; }
        return p.then(function (r) { end(); return r; }, function (e) { end(); throw e; });
      };
    }
    var XHR = win.XMLHttpRequest && win.XMLHttpRequest.prototype;
    if (XHR) {
      var send = XHR.send;
      XHR.send = function () {
        begin();
        var done = false, self = this;
        this.addEventListener('loadend', function () { if (!done) { done = true; end(); } });
        try { return send.apply(self, arguments); } catch (e) { if (!done) { done = true; end(); } throw e; }
      };
    }
    if (win.MutationObserver) {
      var strip = function (v) { return String(v || '').replace(/\bot-[\w-]+/g, '').replace(/\s+/g, ' ').trim(); };
      new win.MutationObserver(function (records) {
        for (var i = 0; i < records.length; i++) {
          var r = records[i], t = r.target.nodeType === 1 ? r.target : r.target.parentElement;
          if (t && t.closest && t.closest('.ot-layer')) continue;                       // our own overlay
          if (r.type === 'attributes' && r.attributeName === 'class' &&
              strip(r.oldValue) === strip(t && t.getAttribute('class'))) continue;       // our hover classes
          if (r.type === 'attributes' && r.attributeName === 'style' && t === document.body) continue; // live camera
          ACTIVITY.dom = now();
          return;
        }
      }).observe(win.document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true, attributeOldValue: true });
    }
  }

  /** Wait until the app is idle (see above). Resolves with the ms waited. */
  P._settle = function (o) {
    var opts = this.opts, self = this;
    if (!opts.settle || (o && o.settle === false)) return Promise.resolve(0);
    track(window);
    var quiet = Math.max(60, (o && o.settleQuiet) || opts.settleQuiet), timeout = (o && o.settleTimeout) || opts.settleTimeout;
    var t0 = performance.now();
    return sleep(40).then(function () {
      return new Promise(function (resolve) {
        (function poll() {
          var now = performance.now();
          var lastActivity = Math.max(ACTIVITY.last, self._domNoisy >= 2 ? 0 : ACTIVITY.dom);
          if (self._aborted || (ACTIVITY.pending === 0 && now - lastActivity >= quiet)) return resolve(now - t0);
          if (now - t0 >= timeout) {
            if (ACTIVITY.pending === 0) self._domNoisy = (self._domNoisy || 0) + 1;        // only the DOM kept changing
            if (self._domNoisy === 2) console.warn('[OneTake] this page keeps changing its DOM; settling now waits for network only');
            return resolve(now - t0);
          }
          setTimeout(poll, 40);
        })();
      });
    });
  };

  OneTake.activity = ACTIVITY;

  /* ---- src/58-expect.js ---- */
  /* ==================================================================
   * Assertions and waits, so a broken take fails loudly instead of
   * rendering the wrong video:
   *   take.expect('text=Inquiry created')                       visible (default)
   *   take.expect('#total', { text: '£4,000' })                 text contains (or a RegExp)
   *   take.expect('label=Email', { value: 'a@b.co' })           input value (or a RegExp)
   *   take.expect('.toast', { visible: false })                 gone / hidden
   *   take.expect('tbody tr', { count: 3 })                     number of visible matches
   *   take.expect('#n-weekly', { checked: true }) · { enabled: false }
   *   take.expectUrl(/\/inquiries\/\w+$/) · take.waitForUrl('/dashboard')
   *   take.scrollUntil('text=Row 250', { container: '.grid' })  virtualised / long lists
   * ================================================================== */

  function matchesText(actual, wanted) {
    if (wanted instanceof RegExp) return wanted.test(actual);
    return norm(actual).indexOf(norm(wanted)) !== -1;
  }
  function matchesValue(actual, wanted) {
    if (wanted instanceof RegExp) return wanted.test(actual);
    return String(actual) === String(wanted);
  }
  function show(v) { return v instanceof RegExp ? String(v) : JSON.stringify(v); }

  /** One evaluation of an expectation: { ok, why }. */
  function evaluateExpect(target, a) {
    var list;
    try { list = resolveAll(target); } catch (e) { return { ok: false, why: e.message }; }
    var visible = list.filter(isVisible);
    if (a.count != null) {
      return visible.length === a.count ? { ok: true } : { ok: false, why: 'found ' + visible.length + ' visible (of ' + list.length + ')' };
    }
    if (a.visible === false) return visible.length ? { ok: false, why: 'it is still visible: ' + describeEl(visible[0]) } : { ok: true };
    if (!visible.length) return { ok: false, why: list.length ? 'it exists but is hidden' : 'it is not on the page' };
    var last = null;
    for (var i = 0; i < visible.length; i++) {
      var el = visible[i], why = null;
      if (a.text != null && !matchesText(textOf(el), a.text)) why = 'its text is ' + JSON.stringify(norm(textOf(el)).slice(0, 80));
      else if (a.value != null && !matchesValue(el.value, a.value)) why = 'its value is ' + JSON.stringify(el.value);
      else if (a.checked != null && !!el.checked !== !!a.checked) why = 'it is ' + (el.checked ? '' : 'not ') + 'checked';
      else if (a.enabled != null && isDisabled(el) === !!a.enabled) why = 'it is ' + (isDisabled(el) ? 'disabled' : 'enabled');
      if (!why) return { ok: true };
      last = why;
    }
    return { ok: false, why: last };
  }

  function describeExpect(target, a) {
    var parts = [];
    if (a.count != null) parts.push('match ' + a.count + ' visible element' + (a.count === 1 ? '' : 's'));
    else if (a.visible === false) parts.push('be hidden or gone');
    else {
      parts.push('be visible');
      if (a.text != null) parts.push('contain text ' + show(a.text));
      if (a.value != null) parts.push('have value ' + show(a.value));
      if (a.checked != null) parts.push(a.checked ? 'be checked' : 'not be checked');
      if (a.enabled != null) parts.push(a.enabled ? 'be enabled' : 'be disabled');
    }
    return 'expected ' + describe(target) + ' to ' + parts.join(' and ');
  }

  function poll(self, check, timeout, fail) {
    var t0 = performance.now();
    return new Promise(function (resolve, reject) {
      (function again() {
        if (self._aborted) return reject(new Error('OneTake: stopped'));
        var r = check();
        if (r.ok) return resolve();
        if (performance.now() - t0 > timeout) return reject(new Error(fail(r.why)));
        setTimeout(again, 60);
      })();
    });
  }

  P.expect = function (target, a) {
    a = a || {};
    return this._step('expect', arguments, function () {
      var timeout = a.timeout != null ? a.timeout : this.opts.waitTimeout;
      return poll(this, function () { return evaluateExpect(target, a); }, timeout, function (why) {
        return describeExpect(target, a) + ', but ' + why + ' (waited ' + Math.round(timeout / 1000) + ' s)';
      });
    });
  };

  function urlStep(name) {
    return function (pattern, o) {
      return this._step(name, arguments, function () {
        var timeout = (o && o.timeout) != null ? o.timeout : this.opts.waitTimeout;
        var test = pattern instanceof RegExp ? function (u) { return pattern.test(u); } : function (u) { return u.indexOf(String(pattern)) !== -1; };
        return poll(this, function () { return { ok: test(location.href), why: 'it is ' + location.href }; }, timeout, function (why) {
          return 'expected the URL to ' + (pattern instanceof RegExp ? 'match ' : 'contain ') + show(pattern) + ', but ' + why;
        });
      });
    };
  }
  P.expectUrl = urlStep('expectUrl');
  P.waitForUrl = urlStep('waitForUrl');

  /** Scroll a container (default: the page) step by step until the target appears. For long or virtualised lists. */
  P.scrollUntil = function (target, o) {
    o = o || {};
    return this._step('scrollUntil', arguments, function () {
      var self = this, max = o.maxScrolls || 40, n = 0;
      function found() { try { var el = queryTarget(target); return el && isVisible(el) ? el : null; } catch (e) { return null; } }
      return (function step() {
        var el = found();
        if (el) return self._ensureInView(el, { force: true });
        var box = o.container ? queryTarget(o.container) : (document.scrollingElement || document.documentElement);
        if (!box) throw new Error('scroll container not found: ' + describe(o.container));
        var maxTop = box.scrollHeight - box.clientHeight;
        if (box.scrollTop >= maxTop - 1 || n++ >= max) throw new Error('scrolled to the end but never found ' + describe(target));
        var dy = o.step || box.clientHeight * 0.8;
        return self._animateScroll([box], [[box.scrollLeft, clamp(box.scrollTop + dy, 0, maxTop)]], { duration: o.duration || 500 })
          .then(function () { return sleep(120 / self.opts.speed); }).then(step);
      })();
    });
  };

  /* ---- src/60-click.js ---- */
  /* ==================================================================
   * Click: a press animation and ripple, and either the real mouse (when the
   * recorder drives the browser: trusted events, native hover, focus, dropdowns)
   * or a faithful synthetic pointer/mouse sequence on live pages.
   * Actions wait for the element to be actionable and for the app to settle.
   * ================================================================== */

  feature({
    defaults: {
      clickColor: 'rgba(59,130,246,0.45)',
      realInput: true           // use trusted mouse/keyboard input when the recorder offers it
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

  /** Press and release at the cursor's current position. o: { double, button, real: false } */
  P._clickAt = function (el, o) {
    o = o || {};
    var self = this, sp = this.opts.speed;
    var vis = this._toVisual(this.pos.x, this.pos.y), x = vis.x, y = vis.y;
    var real = this._real() && o.real !== false;
    var hit = real ? null : this._hit(this.pos.x, this.pos.y);
    if (!real && (!hit || (el && !receives(el, hit)))) hit = el;
    var count = o.double ? 2 : 1;
    var auto = this._autoZoomTo ? this._autoZoomTo(this.pos) : Promise.resolve();

    function pressVisual() { self._cursor.classList.add('ot-pressed'); self._sound('click'); report('click', { x: x, y: y }); self._ripple(x, y); }
    function releaseVisual() { self._cursor.classList.remove('ot-pressed'); }

    function once(i) {
      if (o.visualOnly) {
        pressVisual();
        return sleep(rand(80, 120) / sp).then(releaseVisual);
      }
      if (real) {
        pressVisual();
        return self._input({ type: 'click', x: x, y: y, button: o.button || 'left', clickCount: i + 1 })
          .then(function () { return sleep(rand(60, 100) / sp); }).then(releaseVisual);
      }
      var down = mouseInit(x, y, { buttons: 1, detail: i + 1 });
      pressVisual();
      fire(hit, 'pointerdown', down);
      var proceed = fire(hit, 'mousedown', down);
      if (proceed) {
        // Real mouse clicks focus form fields but don't show focus rings on links/buttons.
        var f = hit.closest && hit.closest(TEXTY + ',select');
        var active = hit.ownerDocument.activeElement;
        if (f && f !== active) f.focus({ preventScroll: true });
        else if (!f && active && active !== hit.ownerDocument.body && !active.contains(hit)) active.blur();
      }
      self._hoverSet.forEach(function (e) { e.classList.add('ot-active'); });
      return sleep(rand(70, 120) / sp).then(function () {
        var up = mouseInit(x, y, { detail: i + 1 });
        fire(hit, 'pointerup', up);
        fire(hit, 'mouseup', up);
        self._hoverSet.forEach(function (e) { e.classList.remove('ot-active'); });
        releaseVisual();
        fire(hit, 'click', up); // synthetic click runs activation behaviour (links, checkboxes, submit)
        if (i === 1) fire(hit, 'dblclick', mouseInit(x, y, { detail: 2 }));
      });
    }
    return auto.then(function () {
      var p = once(0);
      if (count === 2) p = p.then(function () { return sleep(rand(60, 90) / sp); }).then(function () { return once(1); });
      return p.then(function () { return sleep(rand(90, 160) / sp); });
    });
  };

  /** Move to and click an element. o: { double, position: {x, y}, force, timeout, settle } */
  P.click = function (target, o) {
    o = assign({ actionable: true, verb: 'click' }, o);
    return this._step(o.double ? 'doubleClick' : 'click', arguments, function () {
      var self = this;
      return this._approach(target, o).then(function (el) {
        return sleep(rand(80, 160) / self.opts.speed)
          .then(function () { return self._clickAt(el, o); })
          .then(function () { return self._settle(o); });
      });
    });
  };

  P.doubleClick = function (target, o) { return this.click(target, assign({}, o, { double: true })); };

  /** Make sure a checkbox / radio / switch is in the given state (default checked). */
  P.check = function (target, state, o) {
    if (state == null) state = true;
    if (typeof state === 'object') { o = state; state = true; }
    o = assign({ actionable: true, verb: 'check' }, o);
    return this._step('check', arguments, function () {
      var self = this;
      return this._resolve(target, o.timeout).then(function (el) {
        var input = el.matches('input') ? el : (el.control || el.querySelector('input[type=checkbox],input[type=radio]'));
        var current = input ? input.checked : el.getAttribute('aria-checked') === 'true';
        if (current === state) return self._approach(el, assign({}, o, { actionable: false }));
        return self._approach(el, o).then(function () { return self._clickAt(el, o); }).then(function () { return self._settle(o); });
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
    var w = winOf(el);                                          // iframes have their own prototypes
    var proto = el instanceof w.HTMLTextAreaElement ? w.HTMLTextAreaElement.prototype :
      el instanceof w.HTMLSelectElement ? w.HTMLSelectElement.prototype : w.HTMLInputElement.prototype;
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
      el.ownerDocument.execCommand(inputType === 'deleteContentBackward' ? 'delete' : 'insertText', false, text);
      return;
    }
    var v = el.value, s = el.selectionStart, e = el.selectionEnd;
    if (s == null) { s = e = v.length; } // email/number inputs have no selection API
    var nv, caret;
    if (inputType === 'deleteContentBackward') {
      if (s === e) s = Math.max(0, s - 1);
      nv = v.slice(0, s) + v.slice(e); caret = s;
    } else { nv = v.slice(0, s) + text + v.slice(e); caret = s + text.length; }
    var IE = winOf(el).InputEvent;
    el.dispatchEvent(new IE('beforeinput', { bubbles: true, cancelable: true, inputType: inputType, data: text || null }));
    nativeSetter(el, 'value')(nv); // works with React/Vue controlled inputs
    try { el.setSelectionRange(caret, caret); } catch (err) { /* not supported */ }
    el.dispatchEvent(new IE('input', { bubbles: true, inputType: inputType, data: text || null }));
  };

  P._key = function (el, key, char) {
    this._sound('key');
    report('key', { key: key });
    if (this._real()) {                                       // trusted keystrokes from the recorder
      return char != null && key.length === 1 ? this._input({ type: 'type', text: char }) : this._input({ type: 'press', key: key });
    }
    var KE = winOf(el).KeyboardEvent;
    var ok = el.dispatchEvent(new KE('keydown', keyInit(key)));
    if (ok && char != null) {
      el.dispatchEvent(new KE('keypress', keyInit(key)));
      this._insertText(el, char, 'insertText');
    } else if (ok && key === 'Backspace') {
      this._insertText(el, '', 'deleteContentBackward');
    }
    el.dispatchEvent(new KE('keyup', keyInit(key)));
    return Promise.resolve(ok);
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
        p = p.then(function () { return self._key(el, wrong, wrong); })
             .then(function () { return sleep(delay(wrong) + rand(120, 260) / self.opts.speed); })
             .then(function () { return self._key(el, 'Backspace'); })
             .then(function () { return sleep(delay(ch)); });
      }
      return p.then(function () {
        if (ch === '\n') {
          if (self._real()) return self._key(el, 'Enter');
          if (el.tagName === 'TEXTAREA' || el.isContentEditable) return self._key(el, 'Enter', '\n');
          return self._pressKey(el, 'Enter');
        }
        return self._key(el, ch, ch);
      }).then(function () { return sleep(delay(ch)); }).then(step);
    }
    return step().then(function () {
      if (!el.isContentEditable && !self._real()) el.dispatchEvent(new (winOf(el).Event)('change', { bubbles: true }));
    });
  };

  P._pressKey = function (el, key) {
    if (this._real()) return this._input({ type: 'press', key: key });
    el = el || document.activeElement || document.body;
    var KE = winOf(el).KeyboardEvent;
    var ok = el.dispatchEvent(new KE('keydown', keyInit(key)));
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
    el.dispatchEvent(new KE('keyup', keyInit(key)));
    return Promise.resolve();
  };

  /** Empty a focused field: select-all + delete (real keys when available). */
  P._clearField = function (f) {
    if (this._real()) {
      var self = this;
      return this._input({ type: 'press', key: 'ControlOrMeta+A' }).then(function () { return self._input({ type: 'press', key: 'Backspace' }); });
    }
    if (f.select) f.select();
    this._insertText(f, '', 'deleteContentBackward');
    return Promise.resolve();
  };

  /** The element that actually takes the typing: the field itself, or the text field inside a wrapper. */
  function typingTarget(el) {
    if (el.matches(FOCUSABLE)) return el;
    return el.querySelector(TEXTY) || (el.shadowRoot && el.shadowRoot.querySelector(TEXTY)) || el;
  }

  /**
   * Click into a field and type text like a person.
   * o: { clear: true, delay, typos, click: true, enter: false }
   */
  P.type = function (target, text, o) {
    o = assign({ actionable: o == null || o.click !== false, verb: 'type into' }, o);
    return this._step('type', arguments, function () {
      var self = this;
      return this._approach(target, o).then(function (el) {
        var ready = o.click === false ? Promise.resolve() : self._clickAt(el, o);
        return ready.then(function () {
          var f = typingTarget(el);
          if (f.ownerDocument.activeElement !== f && !(f.getRootNode().activeElement === f)) f.focus({ preventScroll: true });
          if (o.clear !== false && !f.isContentEditable && f.value) {
            return self._clearField(f).then(function () { return sleep(120 / self.opts.speed); }).then(function () { return f; });
          }
          return f;
        }).then(function (f) {
          return self._typeInto(f, text, o).then(function () {
            if (o.enter) return Promise.resolve(self._pressKey(f, 'Enter')).then(function () { return sleep(150 / self.opts.speed); });
          }).then(function () { return self._settle(o); });
        });
      });
    });
  };

  /** Clear a text field (visible select-all + delete). */
  P.clear = function (target, o) {
    o = assign({ actionable: true, verb: 'clear' }, o);
    return this._step('clear', arguments, function () {
      var self = this;
      return this._approach(target, o).then(function (el) {
        return self._clickAt(el, o).then(function () {
          var f = typingTarget(el);
          return self._clearField(f).then(function () {
            if (!self._real()) f.dispatchEvent(new (winOf(f).Event)('change', { bubbles: true }));
          });
        }).then(function () { return self._settle(o); });
      });
    });
  };

  /** Press a key on the focused element: 'Enter', 'Tab', 'Escape', 'Backspace', ... */
  P.press = function (key, o) {
    return this._step('press', arguments, function () {
      var self = this, times = (o && o.times) || 1, i = 0;
      return (function again() {
        if (i++ >= times) return self._settle(o);
        self._sound('key');
        report('key', { key: key });
        return Promise.resolve(self._pressKey(deepActive(), key)).then(function () { return sleep(rand(90, 150) / self.opts.speed); }).then(again);
      })();
    });
  };

  /** Choose an option of a native <select> by value or visible text. */
  P.select = function (target, valueOrText, o) {
    o = assign({ actionable: true, verb: 'select from' }, o);
    return this._step('select', arguments, function () {
      var self = this;
      // A synthetic (visual) click: a real click would open the OS dropdown, which isn't part of the page.
      return this._approach(target, o).then(function (el) {
        return self._clickAt(el, assign({}, o, { real: false })).then(function () { return sleep(rand(350, 550) / self.opts.speed); }).then(function () {
          if (el.tagName !== 'SELECT') throw new Error('OneTake.select: target is not a <select>; use click() for custom dropdowns');
          var want = norm(valueOrText), opt = null;
          for (var i = 0; i < el.options.length; i++) {
            var op = el.options[i];
            if (op.value === String(valueOrText) || norm(op.text) === want) { opt = op; break; }
          }
          if (!opt) throw new Error('OneTake.select: no option "' + valueOrText + '"');
          nativeSetter(el, 'value')(opt.value);
          var E = winOf(el).Event;
          el.dispatchEvent(new E('input', { bubbles: true }));
          el.dispatchEvent(new E('change', { bubbles: true }));
          el.blur();
        }).then(function () { return self._settle(o); });
      });
    });
  };

  /** The focused element, looking inside shadow roots and same-origin iframes. */
  function deepActive() {
    var a = document.activeElement;
    for (var i = 0; i < 8 && a; i++) {
      if (a.shadowRoot && a.shadowRoot.activeElement) { a = a.shadowRoot.activeElement; continue; }
      if (a.tagName === 'IFRAME') { try { if (a.contentDocument && a.contentDocument.activeElement) { a = a.contentDocument.activeElement; continue; } } catch (e) { /* cross-origin */ } }
      break;
    }
    return a || document.body;
  }

  /* ---- src/75-drag-upload.js ---- */
  /* ==================================================================
   * Drag and upload.
   *   take.drag('#card-3', '#done-column')          pointer drag; HTML5 drag-and-drop too
   *   take.upload('text=Attach file', 'invoice.pdf')  file inputs, their buttons/labels, or drop zones
   * With the recorder, drags use the real mouse and files are read from disk (paths are
   * relative to the tour script). On live pages files can be URLs or { name, content, type }.
   * ================================================================== */

  P.drag = function (source, target, o) {
    o = assign({ actionable: true, verb: 'drag' }, o);
    return this._step('drag', arguments, function () {
      var self = this, sp = this.opts.speed, src;
      return this._approach(source, o).then(function (el) {
        src = el;
        return self._resolve(target, o.timeout);
      }).then(function (dst) {
        var to = self._pointIn(dst, o.to || {});
        self._cursor.classList.add('ot-pressed');
        var run = self._real() ? realDrag(self, to, sp) : synthDrag(self, src, to, sp);
        return run.then(function () { self._cursor.classList.remove('ot-pressed'); });
      }).then(function () { return self._settle(o); });
    });
  };

  function realDrag(self, to, sp) {
    var v = self._toVisual(self.pos.x, self.pos.y);
    return self._input({ type: 'down', x: v.x, y: v.y })
      .then(function () { return sleep(160 / sp); })
      .then(function () { return self._moveToPoint(to.x, to.y, { overshoot: false, speed: 0.75 }); })
      .then(function () { return sleep(120 / sp); })
      .then(function () { var t = self._toVisual(to.x, to.y); return self._input({ type: 'up', x: t.x, y: t.y }); });
  }

  function dragEvent(el, type, dt, x, y) {
    var w = winOf(el), off = frameOffset(el);
    var Ctor = w.DragEvent || w.MouseEvent;
    var ev = new Ctor(type, { bubbles: true, cancelable: true, composed: true, clientX: x - off.x, clientY: y - off.y, dataTransfer: dt });
    if (!ev.dataTransfer && dt) Object.defineProperty(ev, 'dataTransfer', { value: dt });
    return el.dispatchEvent(ev);
  }

  /** Synthetic drag: pointer/mouse events with the button held, plus HTML5 drag events for draggable sources. */
  function synthDrag(self, src, to, sp) {
    var v0 = self._toVisual(self.pos.x, self.pos.y);
    var html5 = src.draggable === true || src.getAttribute('draggable') === 'true';
    var dt = html5 ? new (winOf(src).DataTransfer)() : null;
    var over = null, moving = true;
    fire(src, 'pointerdown', mouseInit(v0.x, v0.y, { buttons: 1 }));
    fire(src, 'mousedown', mouseInit(v0.x, v0.y, { buttons: 1 }));
    if (html5) dragEvent(src, 'dragstart', dt, v0.x, v0.y);
    self._dragHeld = true;
    (function frame() {
      if (!moving) return;
      var v = self._toVisual(self.pos.x, self.pos.y), el = hitTest(v.x, v.y);
      if (el) {
        if (html5) {
          if (el !== over) { if (over) dragEvent(over, 'dragleave', dt, v.x, v.y); dragEvent(el, 'dragenter', dt, v.x, v.y); over = el; }
          dragEvent(el, 'dragover', dt, v.x, v.y);
        }
      }
      requestAnimationFrame(frame);
    })();
    return sleep(160 / sp)
      .then(function () { return self._moveToPoint(to.x, to.y, { overshoot: false, speed: 0.75 }); })
      .then(function () { return sleep(120 / sp); })
      .then(function () {
        moving = false;
        self._dragHeld = false;
        var v = self._toVisual(to.x, to.y), el = hitTest(v.x, v.y) || over;
        if (html5) {
          if (el) { dragEvent(el, 'dragover', dt, v.x, v.y); dragEvent(el, 'drop', dt, v.x, v.y); }
          dragEvent(src, 'dragend', dt, v.x, v.y);
        }
        if (el) { fire(el, 'pointerup', mouseInit(v.x, v.y)); fire(el, 'mouseup', mouseInit(v.x, v.y)); }
      });
  }

  /** The file input an element stands for: itself, its label's control, or one nearby. */
  function fileInputFor(el) {
    if (el.matches('input[type=file]')) return el;
    if (el.control && el.control.type === 'file') return el.control;
    var n = el;
    for (var i = 0; i < 5 && n; i++, n = n.parentElement) {
      var inp = n.querySelector && n.querySelector('input[type=file]');
      if (inp) return inp;
    }
    return null;
  }

  function loadFile(self, spec) {
    if (spec && typeof spec === 'object' && !(spec instanceof Blob)) {
      return Promise.resolve(new File([spec.content == null ? '' : spec.content], spec.name || 'file.txt', { type: spec.type || 'text/plain' }));
    }
    if (typeof window.__otInput === 'function') {
      return self._input({ type: 'file', path: String(spec) }).then(function (f) {
        var bin = atob(f.base64), bytes = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return new File([bytes], f.name, { type: f.type });
      });
    }
    return fetch(String(spec)).then(function (r) {
      if (!r.ok) throw new Error('could not fetch ' + spec + ' (' + r.status + ')');
      return r.blob();
    }).then(function (b) { return new File([b], String(spec).split('/').pop().split('?')[0] || 'file', { type: b.type }); });
  }

  P.upload = function (target, files, o) {
    files = [].concat(files);
    o = assign({ actionable: true, verb: 'upload to' }, o);
    return this._step('upload', arguments, function () {
      var self = this;
      return this._approach(target, o).then(function (el) {
        var input = fileInputFor(el);
        return self._clickAt(el, assign({}, o, { visualOnly: true }))      // no OS file dialog
          .then(function () { return Promise.all(files.map(function (f) { return loadFile(self, f); })); })
          .then(function (list) {
            var dt = new (winOf(el).DataTransfer)();
            list.forEach(function (f) { dt.items.add(f); });
            if (input && !o.drop) {
              input.files = dt.files;
              var E = winOf(input).Event;
              input.dispatchEvent(new E('input', { bubbles: true }));
              input.dispatchEvent(new E('change', { bubbles: true }));
            } else {                                                        // a drop zone
              var v = self._toVisual(self.pos.x, self.pos.y);
              dragEvent(el, 'dragenter', dt, v.x, v.y);
              dragEvent(el, 'dragover', dt, v.x, v.y);
              dragEvent(el, 'drop', dt, v.x, v.y);
            }
          });
      }).then(function () { return self._settle(o); });
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
        var r = rectOf(el), rnd = seeded(Math.floor(Math.random() * 1e9));
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
      var r = rectOf(h.el), pad = h.pad;
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

  /* ---- src/92-captions.js ---- */
  /* ==================================================================
   * Captions: subtitle-style narration at the bottom (or top) of the screen.
   * ================================================================== */

  feature({
    css: function () {
      return '.ot-caption{position:absolute;z-index:3;left:50%;bottom:7%;max-width:min(80vw,820px);padding:12px 22px;border-radius:12px;background:rgba(17,24,39,.88);color:#fff;font:500 20px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;text-align:center;opacity:0;transform:translate(-50%,10px);transition:opacity .35s ease,transform .35s ease;box-shadow:0 10px 30px rgba(0,0,0,.3);}' +
        '.ot-caption.ot-top{bottom:auto;top:6%;}' +
        '.ot-caption.ot-in{opacity:1;transform:translate(-50%,0);}';
    },
    stop: function () { this._setCaption(null); }
  });

  P._setCaption = function (text, o) {
    if (!this._mounted) return;
    var c = this._part('_caption', 'div', 'ot-caption');
    clearTimeout(this._captionTimer);
    if (text == null) { if (c.classList.contains('ot-in')) report('captionHide', {}); c.classList.remove('ot-in'); return; }
    report('caption', { text: String(text), duration: o && o.duration ? o.duration / this.opts.speed : null });
    var self = this;
    var show = function () {
      c.textContent = text;
      c.classList.toggle('ot-top', !!(o && o.position === 'top'));
      c.classList.add('ot-in');
      if (o && o.duration) self._captionTimer = setTimeout(function () { c.classList.remove('ot-in'); report('captionHide', {}); }, o.duration / self.opts.speed);
    };
    if (c.classList.contains('ot-in')) { c.classList.remove('ot-in'); this._captionTimer = setTimeout(show, 280); }
    else show();
  };

  /** Show a subtitle-style caption. o: { duration (auto-hide ms), position: 'bottom' | 'top', wait } */
  P.caption = function (text, o) {
    return this._step('caption', arguments, function () {
      this._setCaption(text, o);
      return sleep(((o && o.wait) || 350) / this.opts.speed);
    });
  };
  P.hideCaption = function () {
    return this._step('hideCaption', arguments, function () { this._setCaption(null); return sleep(300 / this.opts.speed); });
  };

  /* ---- src/95-camera.js ---- */
  /* ==================================================================
   * Camera: smooth Screen Studio-style zoom and pan.
   *
   * The camera looks at a rectangle of the page centred on (cx, cy) at scale
   * e^ls. It moves on a critically-damped spring, so zooms ease in and out
   * and pans follow the cursor like a camera operator would.
   *
   * Rendering:
   *  - external (set by tools/record.js): the page is untouched; the recorder
   *    captures window.__otCamera's rectangle at full resolution (crisp text).
   *  - in-page: a CSS transform on <body>, for live screen recording.
   * ================================================================== */

  feature({
    defaults: {
      zoomScale: 2,             // default max zoom for zoom()
      zoomSmoothness: 6.5,      // camera spring stiffness (higher = snappier)
      autoZoom: false           // true or { scale: 1.6, hold: 2200 }: zoom toward every click automatically
    },
    stop: function () { this._camReset(); },
    destroy: function () { this._camReset(); }
  });

  P._camGet = function () {
    if (!this._cam) {
      var W = innerWidth, H = innerHeight;
      this._cam = {
        cx: W / 2, cy: H / 2, ls: 0, vx: 0, vy: 0, vls: 0,
        tx: W / 2, ty: H / 2, tls: 0,
        el: null, follow: true, running: false, timer: null, applied: null,
        external: window.__OT_CAMERA === 'external'
      };
    }
    return this._cam;
  };

  P._camInPage = function () { return this._cam && !this._cam.external && this._cam.applied; };
  P._visScale = function () { return this._camInPage() ? Math.exp(this._cam.ls) : 1; };

  /** layout (un-zoomed) viewport coords → on-screen coords */
  P._toVisual = function (x, y) {
    if (!this._camInPage()) return { x: x, y: y };
    var c = this._cam, s = Math.exp(c.ls);
    return { x: innerWidth / 2 + s * (x - c.cx), y: innerHeight / 2 + s * (y - c.cy) };
  };
  /** on-screen coords → layout coords */
  P._toLayout = function (x, y) {
    if (!this._camInPage()) return { x: x, y: y };
    var c = this._cam, s = Math.exp(c.ls);
    return { x: c.cx + (x - innerWidth / 2) / s, y: c.cy + (y - innerHeight / 2) / s };
  };
  P._layoutRect = function (el) {
    var r = rectOf(el), a = this._toLayout(r.left, r.top), b = this._toLayout(r.right, r.bottom);
    return { left: a.x, top: a.y, right: b.x, bottom: b.y, width: b.x - a.x, height: b.y - a.y };
  };

  /** Point the camera at an element or {x, y} point, or pass null to zoom back out. */
  P._camSet = function (el, o) {
    var c = this._camGet(), W = innerWidth, H = innerHeight;
    o = o || {};
    clearTimeout(c.timer);
    if (!o.auto) clearTimeout(c.autoTimer);
    c.auto = !!(el && o.auto);
    c.manual = !!(el && !o.auto);
    if (!el) {
      c.el = null; c.tls = 0; c.tx = W / 2; c.ty = H / 2;
    } else {
      var maxScale = o.scale || this.opts.zoomScale, pad = o.padding != null ? o.padding : 40;
      var r = el.nodeType ? this._layoutRect(el) : { left: el.x, top: el.y, width: 0, height: 0 };
      var fit = Math.min((W - pad * 2) / Math.max(r.width, 1), (H - pad * 2) / Math.max(r.height, 1));
      var scale = o.scale ? o.scale : clamp(fit, 1.15, maxScale);
      c.el = el.nodeType ? el : null;
      c.tls = Math.log(scale);
      c.tx = r.left + r.width / 2; c.ty = r.top + r.height / 2;
    }
    c.follow = o.follow !== false;
    c.restPos = this.pos ? { x: this.pos.x, y: this.pos.y } : null; // only follow once the cursor moves
    c.stiff = o.smoothness || null;
    c.settled = false;
    this._camLoop();
  };

  P._camTargets = function () {
    var c = this._cam, W = innerWidth, H = innerHeight, s = Math.exp(c.tls), r = null;
    if (c.el && c.el.isConnected) {
      r = this._layoutRect(c.el);
      c.tx = r.left + r.width / 2; c.ty = r.top + r.height / 2;
    }
    var tx = c.tx, ty = c.ty, hw = W / (2 * s), hh = H / (2 * s);
    if (c.restPos && this.pos && Math.hypot(this.pos.x - c.restPos.x, this.pos.y - c.restPos.y) > 3) c.restPos = null;
    // Follow where the cursor is heading (not where it is), and only when that's outside the component.
    var p = this._moveDest || this.pos;
    var inside = r && p && p.x >= r.left - 8 && p.x <= r.right + 8 && p.y >= r.top - 8 && p.y <= r.bottom + 8;
    if (c.follow && s > 1.01 && p && !c.restPos && !inside) {
      var mx = hw * 0.15, my = hh * 0.15;
      if (p.x < tx - hw + mx) tx = p.x + hw - mx; else if (p.x > tx + hw - mx) tx = p.x - hw + mx;
      if (p.y < ty - hh + my) ty = p.y + hh - my; else if (p.y > ty + hh - my) ty = p.y - hh + my;
    }
    return { x: clamp(tx, hw, W - hw), y: clamp(ty, hh, H - hh), ls: c.tls };
  };

  P._camLoop = function () {
    var c = this._cam, self = this;
    if (c.running) return;
    c.running = true;
    var last = performance.now();
    (function loop() {
      if (!self._cam) return;
      var now = performance.now(), dt = Math.min(0.1, Math.max(0, (now - last) / 1000)); last = now;
      var t = self._camTargets(), w = c.stiff || self.opts.zoomSmoothness;
      var n = Math.max(1, Math.ceil(dt / 0.004)), h = dt / n;
      for (var i = 0; i < n; i++) { // critically damped spring
        c.vx += (-w * w * (c.cx - t.x) - 2 * w * c.vx) * h; c.cx += c.vx * h;
        c.vy += (-w * w * (c.cy - t.y) - 2 * w * c.vy) * h; c.cy += c.vy * h;
        c.vls += (-w * w * (c.ls - t.ls) - 2 * w * c.vls) * h; c.ls += c.vls * h;
      }
      c.settled = Math.abs(c.cx - t.x) < 0.5 && Math.abs(c.cy - t.y) < 0.5 && Math.abs(c.ls - t.ls) < 0.002 &&
        Math.abs(c.vx) + Math.abs(c.vy) < 2 && Math.abs(c.vls) < 0.01;
      var home = c.settled && t.ls === 0;
      if (home) { c.cx = t.x; c.cy = t.y; c.ls = 0; c.vx = c.vy = c.vls = 0; }
      self._camApply(home);
      if (home) { c.running = false; return; }
      requestAnimationFrame(loop);
    })();
  };

  P._camApply = function (home) {
    var c = this._cam, W = innerWidth, H = innerHeight, s = Math.exp(c.ls);
    if (c.external) {
      window.__otCamera = home ? null : { x: c.cx - W / (2 * s), y: c.cy - H / (2 * s), width: W / s, height: H / s, scale: s };
      return;
    }
    var body = document.body;
    if (home) {
      if (c.applied) {
        body.style.transform = c.applied.transform; body.style.transformOrigin = c.applied.origin;
        document.documentElement.style.overflowX = c.applied.overflowX;
        c.applied = null;
      }
    } else {
      if (!c.applied) {
        var br = body.getBoundingClientRect();
        c.applied = { transform: body.style.transform, origin: body.style.transformOrigin,
          overflowX: document.documentElement.style.overflowX, bx: br.left, by: br.top, sy: scrollY, sx: scrollX };
        document.documentElement.style.overflowX = 'hidden';
      }
      // body box position in viewport coords (adjusted for scrolling since we started)
      var bx = c.applied.bx - (scrollX - c.applied.sx), by = c.applied.by - (scrollY - c.applied.sy);
      var tx = W / 2 - s * c.cx, ty = H / 2 - s * c.cy;
      body.style.transformOrigin = (-bx) + 'px ' + (-by) + 'px';
      body.style.transform = 'translate(' + tx.toFixed(2) + 'px,' + ty.toFixed(2) + 'px) scale(' + s.toFixed(4) + ')';
    }
    if (this.pos) this._setPos(this.pos.x, this.pos.y);
    this._updateHighlights();
  };

  P._camReset = function () {
    if (!this._cam) return;
    var c = this._cam;
    clearTimeout(c.timer);
    c.el = null; c.cx = c.tx = innerWidth / 2; c.cy = c.ty = innerHeight / 2; c.ls = c.tls = 0; c.vx = c.vy = c.vls = 0;
    this._camApply(true);
  };

  /** Auto-zoom (opts.autoZoom): ease toward the click point, hold, then ease back out. Skipped while zoom() is active. */
  P._autoZoomTo = function (pos) {
    var az = this.opts.autoZoom;
    if (!az || !pos) return Promise.resolve();
    var c = this._camGet();
    if (c.manual) return Promise.resolve();
    var cfg = az === true ? {} : az, self = this;
    var already = c.auto && c.tls > 0;
    this._camSet({ x: pos.x, y: pos.y }, { scale: cfg.scale || 1.6, auto: true, follow: true });
    clearTimeout(c.autoTimer);
    c.autoTimer = setTimeout(function () { if (c.auto) self._camSet(null); }, (cfg.hold != null ? cfg.hold : 2200) / this.opts.speed);
    return already ? Promise.resolve() : sleep(420 / this.opts.speed);
  };

  P._camSettle = function (maxMs) {
    var self = this, t0 = performance.now();
    return new Promise(function (resolve) {
      (function poll() {
        var c = self._cam;
        if (!c || !c.running || c.settled || performance.now() - t0 > maxMs || self._aborted) return resolve();
        requestAnimationFrame(poll);
      })();
    });
  };

  /**
   * Smoothly zoom the camera onto an element.
   *   take.zoom('#form', 15)            zoom in, keep it for 15 s, then zoom out
   *   take.zoom('#form')                stay zoomed until zoomOut() or the next zoom()
   *   take.zoom(8)                      zoom around the cursor for 8 s
   *   take.zoom('#chart', 6, { scale: 2.5, follow: false, block: true })
   * The chain continues as soon as the zoom-in has settled, so the next steps happen
   * while zoomed. opts: { scale, padding, follow, block, smoothness }
   */
  P.zoom = function (target, seconds, o) {
    if (typeof target === 'number') { o = seconds; seconds = target; target = null; }
    if (seconds && typeof seconds === 'object') { o = seconds; seconds = o.duration != null ? o.duration / 1000 : o.seconds; }
    o = o || {};
    return this._step('zoom', arguments, function () {
      var self = this;
      var ready = target == null
        ? Promise.resolve(this.pos ? { x: this.pos.x, y: this.pos.y } : { x: innerWidth / 2, y: innerHeight / 2 })
        : this._resolve(target, o.timeout).then(function (el) { return self._ensureInView(el).then(function () { return el; }); });
      return ready.then(function (el) {
        if (target == null && !o.scale) o = assign({}, o, { scale: self.opts.zoomScale });
        self._camSet(el, o);
        var c = self._cam;
        if (seconds) {
          c.timer = setTimeout(function () { self._camSet(null); }, seconds * 1000 / self.opts.speed);
        }
        return self._camSettle(2500).then(function () {
          if (o.block && seconds) {
            return new Promise(function (r) {
              (function wait() { if (c.tls === 0) return r(self._camSettle(2500)); setTimeout(wait, 50); })();
            });
          }
        });
      });
    });
  };

  /** Smoothly zoom back out to the full page. */
  P.zoomOut = function () {
    return this._step('zoomOut', arguments, function () {
      this._camSet(null);
      return this._camSettle(2500);
    });
  };

  OneTake.version = '1.0.0';
  return OneTake;
});
//# sourceURL=onetake.js
