  /* ==================================================================
   * Movement: curved, eased, human-like cursor paths (cubic Bézier with a
   * random bend, minimum-jerk speed profile, occasional overshoot).
   * ================================================================== */

  function minJerk(t) { return t * t * t * (10 - 15 * t + 6 * t * t); }
  function bezier(p0, p1, p2, p3, t) {
    var u = 1 - t;
    return {
      x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
      y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y
    };
  }

  feature({
    defaults: {
      overshoot: true           // occasionally overshoot long moves and correct
    }
  });

  P._animatePath = function (pts, duration) {
    var self = this, start = performance.now(), frame = 0;
    return new Promise(function (resolve) {
      function loop(now) {
        if (self._aborted) return resolve();
        var t = clamp((now - start) / duration, 0, 1);
        var p = bezier(pts[0], pts[1], pts[2], pts[3], minJerk(t));
        self._setPos(p.x, p.y);
        if ((frame++ & 1) === 0 || t === 1) self._hoverAt(p.x, p.y, true);
        if (t < 1) requestAnimationFrame(loop); else resolve();
      }
      requestAnimationFrame(loop);
    });
  };

  P._moveToPoint = function (x, y, o) {
    o = o || {};
    var from = this.pos, dx = x - from.x, dy = y - from.y, dist = Math.hypot(dx, dy);
    this._moveDest = { x: x, y: y };
    if (dist < 1) { this._hoverAt(x, y, true); return Promise.resolve(); }
    var speed = (o.speed || 1) * this.opts.speed;
    var duration = o.duration != null ? o.duration : clamp(260 + dist * 0.55 + rand(-40, 70), 280, 1400);
    duration /= speed;
    var nx = -dy / dist, ny = dx / dist;
    var bend = clamp(rand(-0.16, 0.16) * dist, -140, 140) * (o.curve != null ? o.curve : 1);
    var overshoot = this.opts.overshoot && o.overshoot !== false && dist > 320 && Math.random() < 0.55;
    var end = { x: x, y: y };
    if (overshoot) {
      var k = rand(7, 15) / dist;
      end = { x: x + dx * k + nx * rand(-4, 4), y: y + dy * k + ny * rand(-4, 4) };
    }
    var pts = [
      from,
      { x: from.x + dx * 0.28 + nx * bend, y: from.y + dy * 0.28 + ny * bend },
      { x: from.x + dx * 0.78 + nx * bend * 0.55, y: from.y + dy * 0.78 + ny * bend * 0.55 },
      end
    ];
    var self = this;
    return this._animatePath(pts, duration).then(function () {
      if (!overshoot || self._aborted) return;
      var p = self.pos;
      return self._animatePath([p, p, { x: x, y: y }, { x: x, y: y }], rand(120, 190) / speed);
    });
  };

  /** Pick a natural point inside an element (not dead-centre), in layout coordinates. */
  P._pointIn = function (el, o) {
    var r = el.getBoundingClientRect(), p;
    if (o && o.position && typeof o.position === 'object') {
      p = { x: r.left + r.width * o.position.x, y: r.top + r.height * o.position.y };
    } else {
      var jx = r.width > 40 ? rand(-0.18, 0.18) * r.width : 0;
      var jy = r.height > 30 ? rand(-0.15, 0.15) * r.height : 0;
      if (el.matches && el.matches(TEXTY) && r.width > 120) jx = rand(-0.3, -0.1) * r.width;
      p = { x: r.left + r.width / 2 + jx, y: r.top + r.height / 2 + jy };
    }
    return this._toLayout(p.x, p.y);
  };

  /** Make sure an element is visible before acting on it (the scroll module animates this). */
  P._ensureInView = function () { return Promise.resolve(); };

  /** Resolve + bring into view + move the cursor onto the element. Resolves with the element. */
  P._approach = function (target, o) {
    var self = this;
    return this._resolve(target, o && o.timeout).then(function (el) {
      return self._ensureInView(el).then(function () {
        var pt = self._pointIn(el, o);
        return self._moveToPoint(pt.x, pt.y, o).then(function () { return el; });
      });
    });
  };

  /** Move the cursor to an element, or to {x, y} viewport coordinates. */
  P.moveTo = function (target, o) {
    return this._step('moveTo', arguments, function () {
      if (target && typeof target.x === 'number' && target.nodeType == null) return this._moveToPoint(target.x, target.y, o);
      return this._approach(target, o);
    });
  };

  /** Hover over an element for `o.duration` ms (default 800). */
  P.hover = function (target, o) {
    return this._step('hover', arguments, function () {
      var self = this;
      return this._approach(target, o).then(function () { return sleep(((o && o.duration) || 800) / self.opts.speed); });
    });
  };
