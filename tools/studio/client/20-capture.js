  /* Capture: turns what you do in the app into steps while recording.
   *   clicks (on the actionable element), typing (one step per field, value at the end),
   *   native selects, checkboxes / radios (as check steps), Enter to submit.
   * Password fields are never recorded. Page loads are reported by the boot code. */

  var TEXT_FIELD = 'textarea,[contenteditable=""],[contenteditable="true"],input:not([type]),input[type=text],' +
    'input[type=email],input[type=search],input[type=url],input[type=tel],input[type=number],input[type=password],' +
    'input[type=date],input[type=time],input[type=datetime-local],input[type=month],input[type=week]';

  var pendingType = null;      // { el, target } for the field being typed into

  function isTextField(el) { return !!(el && el.matches && el.matches(TEXT_FIELD)); }
  function isVisible(el) {
    var r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    return r.width > 2 && r.height > 2 && cs.visibility !== 'hidden' && parseFloat(cs.opacity) > 0.05;
  }

  function flushType(enter) {
    if (!pendingType) return;
    var el = pendingType.el, target = pendingType.target;
    pendingType = null;
    if (el.type === 'password') {
      addStep({ type: 'note', text: 'Password typed into ' + target + ' was not recorded. Render signed in instead (Render does this for you).' });
      return;
    }
    addStep({ type: 'type', target: target, value: el.isContentEditable ? el.innerText : el.value, enter: !!enter });
  }

  document.addEventListener('input', function (e) {
    if (!recording() || inStudio(e) || !isTextField(e.target)) return;
    if (!pendingType || pendingType.el !== e.target) {
      flushType();
      pendingType = { el: e.target, target: selectorFor(e.target) };
    }
  }, true);

  document.addEventListener('focusout', function (e) {
    if (pendingType && e.target === pendingType.el) flushType();
  }, true);

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && pendingType && e.target === pendingType.el && e.target.tagName !== 'TEXTAREA') flushType(true);
  }, true);

  window.addEventListener('pagehide', function () { flushType(); });

  document.addEventListener('change', function (e) {
    if (!recording() || inStudio(e)) return;
    var el = e.target;
    if (el.tagName === 'SELECT') {
      flushType();
      var opt = el.selectedOptions && el.selectedOptions[0];
      addStep({ type: 'select', target: selectorFor(el), value: opt ? clean(opt.text) || opt.value : el.value });
    } else if (el.type === 'checkbox' || el.type === 'radio') {
      flushType();
      var visibleTarget = isVisible(el) ? el : (el.labels && el.labels[0]) || el.closest('label') || el;
      addStep({ type: 'check', target: selectorFor(visibleTarget), state: el.checked });
    }
  }, true);

  document.addEventListener('click', function (e) {
    if (S.mode === 'mark' || inStudio(e) || !recording() || !e.isTrusted) return;
    var el = actionable(e.target);
    if (isTextField(el) || el.tagName === 'SELECT' || el.tagName === 'OPTION') return;   // typing / select steps cover these
    if (el.matches('input[type=checkbox],input[type=radio]')) return;                    // the change event records it
    if (el.tagName === 'LABEL') {
      var c = el.control;
      if (c && (c.type === 'checkbox' || c.type === 'radio' || isTextField(c) || c.tagName === 'SELECT')) return;
    }
    flushType();
    addStep({ type: 'click', target: selectorFor(el), text: shortText(el) });
  }, true);
