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
