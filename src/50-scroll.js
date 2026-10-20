  /* ==================================================================
   * Scroll: bring targets into view with a JS-driven smooth scroll. It is
   * frame-exact, so it also renders correctly in frame-by-frame recording,
   * and it handles nested scroll containers.
   * ================================================================== */

  feature({
    defaults: {
      scrollBehavior: 'smooth'  // 'smooth' (animated by OneTake, frame-exact) | 'native' | 'instant'
    }
  });

  function scrollersOf(el) {
    var list = [], se = document.scrollingElement || document.documentElement;
    for (var n = el.parentElement; n; n = n.parentElement) {
      if (n === se || n === document.body) continue;
      var cs = getComputedStyle(n);
      if (/(auto|scroll|overlay)/.test(cs.overflowY + ' ' + cs.overflowX) &&
          (n.scrollHeight > n.clientHeight || n.scrollWidth > n.clientWidth)) list.push(n);
    }
    list.push(se);
    return list;
  }
  function scrollPositions(boxes) { return boxes.map(function (b) { return [b.scrollLeft, b.scrollTop]; }); }
  function easeInOutCubic(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

  P._ensureInView = function (el, o) {
    var r = el.getBoundingClientRect(), m = 40;
    var inView = r.top >= m && r.bottom <= innerHeight - m && r.left >= 0 && r.right <= innerWidth;
    if (inView && !(o && o.force)) return Promise.resolve();
    var block = (o && o.block) || 'center';
    if (this.opts.scrollBehavior === 'native') {
      el.scrollIntoView({ behavior: 'smooth', block: block, inline: 'nearest' });
      return this._waitScrollSettle(el);
    }
    // Work out where every scroll container needs to end up, put them back, then animate there ourselves.
    var boxes = scrollersOf(el), from = scrollPositions(boxes);
    el.scrollIntoView({ behavior: 'instant', block: block, inline: 'nearest' });
    var to = scrollPositions(boxes);
    boxes.forEach(function (b, i) { b.scrollTo({ left: from[i][0], top: from[i][1], behavior: 'instant' }); });
    return this._animateScroll(boxes, to, o);
  };

  P._animateScroll = function (boxes, to, o) {
    var self = this, from = scrollPositions(boxes), dist = 0;
    boxes.forEach(function (b, i) {
      dist = Math.max(dist, Math.abs(to[i][0] - from[i][0]), Math.abs(to[i][1] - from[i][1]));
    });
    if (dist < 1) return Promise.resolve();
    function apply(e) {
      boxes.forEach(function (b, i) {
        b.scrollTo({ left: from[i][0] + (to[i][0] - from[i][0]) * e, top: from[i][1] + (to[i][1] - from[i][1]) * e, behavior: 'instant' });
      });
      self._updateHighlights();
    }
    if (this.opts.scrollBehavior === 'instant') { apply(1); return Promise.resolve(); }
    var duration = ((o && o.duration) || clamp(320 + dist * 0.45, 380, 1400)) / this.opts.speed;
    var start = performance.now(), frame = 0;
    return new Promise(function (resolve) {
      (function loop() {
        var t = clamp((performance.now() - start) / duration, 0, 1);
        apply(easeInOutCubic(t));
        if (self.pos && (frame++ % 3 === 0 || t === 1)) self._hoverAt(self.pos.x, self.pos.y, true);
        if (t < 1 && !self._aborted) requestAnimationFrame(loop);
        else resolve(sleep(60 / self.opts.speed));
      })();
    });
  };

  /** For scrollBehavior: 'native' — wait until the browser's smooth scroll has stopped. */
  P._waitScrollSettle = function (el) {
    var last = null, stable = 0, t0 = performance.now(), self = this;
    return new Promise(function (resolve) {
      (function loop() {
        var r = el.getBoundingClientRect();
        var key = Math.round(r.top) + ',' + Math.round(r.left);
        stable = key === last ? stable + 1 : 0; last = key;
        self._updateHighlights();
        if (stable >= 6 || performance.now() - t0 > 2500) resolve(sleep(80 / self.opts.speed));
        else requestAnimationFrame(loop);
      })();
    });
  };

  /** Smoothly scroll an element into view (block: 'center' | 'start' ...) or to a y position. */
  P.scrollTo = function (target, o) {
    return this._step('scrollTo', arguments, function () {
      var self = this;
      if (typeof target === 'number') {
        var se = document.scrollingElement || document.documentElement;
        var max = se.scrollHeight - se.clientHeight;
        return this._animateScroll([se], [[se.scrollLeft, clamp(target, 0, max)]], o);
      }
      return this._resolve(target).then(function (el) { return self._ensureInView(el, assign({ force: true }, o)); });
    });
  };

  /** Scroll the page (or a scroll container) by dy pixels, like a mouse wheel. */
  P.scrollBy = function (dy, o) {
    o = o || {};
    return this._step('scrollBy', arguments, function () {
      var box = o.container ? queryTarget(o.container) : (document.scrollingElement || document.documentElement);
      if (!box) throw new Error('OneTake.scrollBy: container not found');
      var max = box.scrollHeight - box.clientHeight;
      return this._animateScroll([box], [[box.scrollLeft, clamp(box.scrollTop + dy, 0, max)]], o);
    });
  };
