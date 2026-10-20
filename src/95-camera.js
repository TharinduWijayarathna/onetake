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
      zoomSmoothness: 6.5       // camera spring stiffness (higher = snappier)
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
    var r = el.getBoundingClientRect(), a = this._toLayout(r.left, r.top), b = this._toLayout(r.right, r.bottom);
    return { left: a.x, top: a.y, right: b.x, bottom: b.y, width: b.x - a.x, height: b.y - a.y };
  };

  /** Point the camera at an element or {x, y} point, or pass null to zoom back out. */
  P._camSet = function (el, o) {
    var c = this._camGet(), W = innerWidth, H = innerHeight;
    o = o || {};
    clearTimeout(c.timer);
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
