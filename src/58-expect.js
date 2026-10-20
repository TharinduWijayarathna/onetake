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
        if (box.scrollTop >= maxTop - 1) throw new Error('scrolled to the end but never found ' + describe(target));
        if (n++ >= max) throw new Error('scrolled ' + max + ' times without finding ' + describe(target) + ' (raise maxScrolls, or use a smaller step for virtual lists)');
        var dy = o.step || box.clientHeight * 0.8;
        return self._animateScroll([box], [[box.scrollLeft, clamp(box.scrollTop + dy, 0, maxTop)]], { duration: o.duration || 500 })
          .then(function () { return sleep(120 / self.opts.speed); }).then(step);
      })();
    });
  };
