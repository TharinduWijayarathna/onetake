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
