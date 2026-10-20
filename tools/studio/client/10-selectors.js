  /* Stable selectors for recorded elements, most robust first:
   *   test ids (data-testid, data-test, data-cy, data-qa, dusk) → #id → label=… (form fields)
   *   → tag[name=…] → text=… (buttons, links, options) → [aria-label=…] → shortest unique CSS path.
   * Every candidate is verified to match exactly this element on the current page. */

  var TESTID_ATTRS = ['data-testid', 'data-test', 'data-cy', 'data-qa', 'dusk'];

  function attrSel(name, value) { return '[' + name + '="' + String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"]'; }

  function uniqueCss(sel, el) {
    try { var m = document.querySelectorAll(sel); return m.length === 1 && m[0] === el; } catch (e) { return false; }
  }

  function stableId(id) {
    return !!id && /^[A-Za-z][\w-]*$/.test(id) && !/\d{4,}|[0-9a-f]{8,}/i.test(id) &&
      !/^(ember|react|radix|headlessui|mui|rc-|ui-id|:r)/i.test(id);
  }

  /** The element a click really targets (the button, not the icon inside it). */
  function actionable(el) {
    return (el.closest && el.closest('a[href],button,[role=button],[role=tab],[role=menuitem],[role=option],[role=link],' +
      '[role=checkbox],[role=radio],[role=switch],summary,label,select,textarea,input,[onclick],[tabindex]:not([tabindex="-1"]),li')) || el;
  }

  /** A label's own text, without the text of controls nested inside it (e.g. a select's options). */
  function labelText(label) {
    var copy = label.cloneNode(true);
    Array.prototype.forEach.call(copy.querySelectorAll('select,input,textarea,button,option'), function (n) { n.remove(); });
    return clean(copy.textContent);
  }

  function selectorFor(el) {
    var i, s, v;
    for (i = 0; i < TESTID_ATTRS.length; i++) {
      v = el.getAttribute(TESTID_ATTRS[i]);
      if (v) { s = attrSel(TESTID_ATTRS[i], v); if (uniqueCss(s, el)) return s; }
    }
    if (stableId(el.id)) { s = '#' + CSS.escape(el.id); if (uniqueCss(s, el)) return s; }

    var tag = el.tagName.toLowerCase();
    var isControl = /^(input|select|textarea)$/.test(tag);
    var OT = window.OneTake;
    if (isControl && OT) {
      var names = [el.labels && el.labels[0] ? labelText(el.labels[0]) : null,
        el.getAttribute('aria-label'), el.getAttribute('placeholder')];
      for (i = 0; i < names.length; i++) {
        var t = clean(names[i]);
        if (t && t.length <= 40 && OT.findByLabel(t) === el) return 'label=' + t;
      }
    }
    var name = el.getAttribute('name');
    if (name) {
      s = tag + attrSel('name', name);
      if ((el.type === 'radio' || el.type === 'checkbox') && el.value) s += attrSel('value', el.value);
      if (uniqueCss(s, el)) return s;
    }
    if (!isControl && OT) {
      var text = clean(el.innerText);
      if (text && text.length <= 40 && OT.findByText(text) === el) return 'text=' + text;
    }
    v = el.getAttribute('aria-label');
    if (v) { s = tag + attrSel('aria-label', v); if (uniqueCss(s, el)) return s; }
    return cssPath(el);
  }

  /** Shortest unique `a > b:nth-of-type(n) > c` path, anchored at a stable ancestor when there is one. */
  function cssPath(el) {
    var parts = [];
    for (var n = el; n && n.nodeType === 1 && n !== document.documentElement; n = n.parentElement) {
      if (n !== el) {
        for (var i = 0; i < TESTID_ATTRS.length; i++) {
          var v = n.getAttribute(TESTID_ATTRS[i]);
          if (v && uniqueCss(attrSel(TESTID_ATTRS[i], v), n)) return [attrSel(TESTID_ATTRS[i], v)].concat(parts).join(' > ');
        }
        if (stableId(n.id) && uniqueCss('#' + CSS.escape(n.id), n)) return ['#' + CSS.escape(n.id)].concat(parts).join(' > ');
      }
      var part = n.tagName.toLowerCase();
      if (n.parentElement) {
        var same = Array.prototype.filter.call(n.parentElement.children, function (c) { return c.tagName === n.tagName; });
        if (same.length > 1) part += ':nth-of-type(' + (same.indexOf(n) + 1) + ')';
      }
      parts.unshift(part);
      var sel = parts.join(' > ');
      if (uniqueCss(sel, el)) return sel;
    }
    return parts.join(' > ');
  }

  /** Find the element a recorded target points at on the current page (for timeline previews). */
  function resolveTarget(target) {
    var OT = window.OneTake;
    try {
      if (/^text=/.test(target)) return OT && OT.findByText(target.slice(5));
      if (/^label=/.test(target)) return OT && OT.findByLabel(target.slice(6));
      return document.querySelector(target);
    } catch (e) { return null; }
  }
