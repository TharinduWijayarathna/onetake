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
