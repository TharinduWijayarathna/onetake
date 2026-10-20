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
