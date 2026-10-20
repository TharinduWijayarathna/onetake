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
