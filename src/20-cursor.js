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
