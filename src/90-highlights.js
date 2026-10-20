  /* ==================================================================
   * Highlights: hand-drawn circle, box, underline and arrow strokes that
   * draw themselves like a pen, with optional callout labels. Shapes are a
   * small registry (SHAPES), so new ones can be added.
   * ================================================================== */

  var SVGNS = 'http://www.w3.org/2000/svg';

  function seeded(seed) { // tiny deterministic PRNG so redrawn shapes keep their wobble
    var s = seed % 2147483647; if (s <= 0) s += 2147483646;
    return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  }

  function circlePath(w, h, pad, rnd) {
    var cx = w / 2, cy = h / 2;
    var rx = w / 2 + pad + Math.min(w * 0.1, 40), ry = h / 2 + pad + Math.min(h * 0.22, 30);
    var start = -Math.PI * (0.55 + rnd() * 0.2); // begin near the top-left, like a pen stroke
    var sweep = Math.PI * 2 + 0.35 + rnd() * 0.25;
    var ph = rnd() * 6.28, steps = 96, d = '';
    for (var i = 0; i <= steps; i++) {
      var t = i / steps, a = start + sweep * t;
      var wob = 1 + 0.025 * Math.sin(a * 3 + ph) + 0.06 * t; // spirals out slightly for the overlap
      var x = cx + Math.cos(a) * rx * wob, y = cy + Math.sin(a) * ry * wob;
      d += (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
    }
    return d;
  }

  function boxPath(w, h, pad, rnd) {
    var x0 = -pad, y0 = -pad, x1 = w + pad, y1 = h + pad, j = function () { return (rnd() - 0.5) * 4; };
    var r = Math.min(10, (h + pad * 2) / 3);
    return 'M' + (x0 + r) + ' ' + (y0 + j()) +
      'L' + (x1 - r) + ' ' + (y0 + j()) + 'Q' + x1 + ' ' + y0 + ' ' + (x1 + j() * 0.3) + ' ' + (y0 + r) +
      'L' + (x1 + j()) + ' ' + (y1 - r) + 'Q' + x1 + ' ' + y1 + ' ' + (x1 - r) + ' ' + (y1 + j() * 0.3) +
      'L' + (x0 + r) + ' ' + (y1 + j()) + 'Q' + x0 + ' ' + y1 + ' ' + (x0 + j() * 0.3) + ' ' + (y1 - r) +
      'L' + (x0 + j()) + ' ' + (y0 + r) + 'Q' + x0 + ' ' + y0 + ' ' + (x0 + r + 8) + ' ' + (y0 - 1);
  }

  function underlinePath(w, h, pad, rnd) {
    var y = h + Math.max(4, pad * 0.6), d = 'M' + (-4) + ' ' + y, n = 6;
    for (var i = 1; i <= n; i++) {
      var x = -4 + (w + 8) * i / n;
      d += 'Q' + (x - (w + 8) / n / 2) + ' ' + (y + (rnd() - 0.5) * 7) + ' ' + x + ' ' + (y + (rnd() - 0.5) * 2);
    }
    return d;
  }

  function arrowPaths(w, h, from, rnd) {
    var dirs = { 'top-left': [-1, -1], 'top-right': [1, -1], 'bottom-left': [-1, 1], 'bottom-right': [1, 1],
      left: [-1, 0], right: [1, 0], top: [0, -1], bottom: [0, 1] };
    var v = dirs[from] || dirs['top-left'];
    var ex = w / 2 + v[0] * (w / 2 + 10), ey = h / 2 + v[1] * (h / 2 + 10);
    var len = 110;
    var sx = ex + v[0] * len + (v[0] === 0 ? 60 : 0), sy = ey + v[1] * len * 0.75 + (v[1] === 0 ? -50 : 0);
    var mx = (sx + ex) / 2 + (rnd() - 0.5) * 50 + v[1] * 25, my = (sy + ey) / 2 - (rnd() - 0.5) * 50 - v[0] * 25;
    var ang = Math.atan2(ey - my, ex - mx), hl = 16;
    var head = 'M' + (ex - hl * Math.cos(ang - 0.45)) + ' ' + (ey - hl * Math.sin(ang - 0.45)) +
      'L' + ex + ' ' + ey + 'L' + (ex - hl * Math.cos(ang + 0.45)) + ' ' + (ey - hl * Math.sin(ang + 0.45));
    return ['M' + sx + ' ' + sy + 'Q' + mx + ' ' + my + ' ' + ex + ' ' + ey, head];
  }

  /** Pen-stroke shapes: return SVG path(s) in the element's local coordinates. */
  function strokeShape(makePaths) {
    return function (self, h, r, o, rnd, drawMs) {
      var g = document.createElementNS(SVGNS, 'g');
      g.setAttribute('class', 'ot-fade');
      self._part('_svg', 'svg', 'ot-svg').appendChild(g);
      h.nodes.push(g); h.group = g;
      var promises = [], t = 0;
      makePaths(r, o, rnd).forEach(function (pd, i) {
        var dur = i === 0 ? drawMs : drawMs * 0.35;
        promises.push(self._drawStroke(g, pd, o, t, dur));
        t += dur;
      });
      return Promise.all(promises);
    };
  }

  var SHAPES = {
    circle: strokeShape(function (r, o, rnd) { return [circlePath(r.width, r.height, o.padding, rnd)]; }),
    box: strokeShape(function (r, o, rnd) { return [boxPath(r.width, r.height, o.padding, rnd)]; }),
    underline: strokeShape(function (r, o, rnd) { return [underlinePath(r.width, r.height, o.padding, rnd)]; }),
    arrow: strokeShape(function (r, o, rnd) { return arrowPaths(r.width, r.height, o.from, rnd); })
  };
  SHAPES.rect = SHAPES.box;

  feature({
    defaults: {
      highlightColor: '#ef4444'
    },
    css: function () {
      return '.ot-svg{position:absolute;inset:0;z-index:1;width:100%;height:100%;overflow:visible;}' +
        '.ot-svg path{fill:none;stroke-linecap:round;stroke-linejoin:round;}' +
        '.ot-fade{transition:opacity .35s ease;}' +
        '.ot-fx{position:absolute;inset:0;z-index:2;}' +
        '.ot-label{position:absolute;max-width:280px;padding:7px 12px;border-radius:9px;color:#fff;font:600 14px/1.35 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.25);opacity:0;transform:translateY(6px);transition:opacity .3s ease,transform .3s ease;white-space:normal;}' +
        '.ot-label.ot-in{opacity:1;transform:none;}';
    },
    init: function () { this._highlights = []; },
    mount: function () {
      var self = this;
      this._onResize = function () { self._updateHighlights(); };
      window.addEventListener('resize', this._onResize);
    },
    stop: function () { this._clearHighlights(true); },
    destroy: function () { window.removeEventListener('resize', this._onResize); }
  });

  P._drawStroke = function (group, d, o, delay, duration) {
    var p = document.createElementNS(SVGNS, 'path');
    p.setAttribute('d', d);
    p.setAttribute('stroke', o.color);
    p.setAttribute('stroke-width', o.strokeWidth);
    if (o.glow !== false) p.style.filter = 'drop-shadow(0 1px 2px rgba(0,0,0,.25))';
    group.appendChild(p);
    var len = p.getTotalLength();
    p.style.strokeDasharray = len + ' ' + len;
    p.style.strokeDashoffset = len;
    var anim = p.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }],
      { duration: duration, delay: delay, easing: 'cubic-bezier(.55,.1,.35,1)', fill: 'forwards' });
    return anim.finished.catch(function () {});
  };

  P._highlight = function (target, o) {
    var self = this;
    o = assign({
      shape: 'circle', color: this.opts.highlightColor, padding: 10, strokeWidth: 4,
      drawDuration: 750, duration: 2600, block: true, label: null, labelPosition: 'auto', from: 'top-left'
    }, o);
    var shape = SHAPES[o.shape];
    if (!shape) return Promise.reject(new Error('OneTake.highlight: unknown shape "' + o.shape + '"'));
    var sp = this.opts.speed;
    return this._resolve(target, o.timeout).then(function (el) {
      return self._ensureInView(el).then(function () {
        var r = el.getBoundingClientRect(), rnd = seeded(Math.floor(Math.random() * 1e9));
        var h = { el: el, nodes: [], w: r.width, h: r.height, pad: o.padding, shape: o.shape };
        var drawMs = o.drawDuration / sp;
        var drawn = shape(self, h, r, o, rnd, drawMs);

        if (o.label) {
          var lab = document.createElement('div');
          lab.className = 'ot-label';
          lab.style.background = o.labelColor || o.color;
          lab.textContent = o.label;
          self._part('_fx', 'div', 'ot-fx').appendChild(lab);
          h.nodes.push(lab); h.label = lab; h.labelPosition = o.labelPosition;
          setTimeout(function () { lab.classList.add('ot-in'); }, drawMs * 0.6);
        }

        self._highlights.push(h);
        self._updateHighlights();
        self._startTracking();

        var removeAfter = o.duration && isFinite(o.duration) ? o.duration / sp : null;
        if (removeAfter) setTimeout(function () { self._removeHighlight(h); }, removeAfter);
        if (o.block && removeAfter) return sleep(removeAfter);
        return drawn.then(function () { return sleep(o.hold != null ? o.hold / sp : 0); });
      });
    });
  };

  /** Keep every highlight glued to its element (scrolling, resizing, camera zoom). */
  P._updateHighlights = function () {
    this._highlights.forEach(function (h) {
      if (!h.el.isConnected) return;
      var r = h.el.getBoundingClientRect(), pad = h.pad;
      if (h.group) h.group.setAttribute('transform', 'translate(' + r.left + ' ' + r.top + ')' +
        (h.w > 0 && Math.abs(r.width / h.w - 1) > 0.001 ? ' scale(' + (r.width / h.w) + ')' : ''));
      if (h.box) {
        h.box.style.left = (r.left - pad) + 'px'; h.box.style.top = (r.top - pad) + 'px';
        h.box.style.width = (r.width + pad * 2) + 'px'; h.box.style.height = (r.height + pad * 2) + 'px';
      }
      if (h.label) {
        var lw = h.label.offsetWidth, lh = h.label.offsetHeight, gap = pad + (h.shape === 'circle' ? 26 : 14);
        var pos = h.labelPosition;
        if (pos === 'auto') pos = r.top - gap - lh > 8 ? 'top' : 'bottom';
        var x = clamp(r.left + r.width / 2 - lw / 2, 8, innerWidth - lw - 8);
        var y = pos === 'top' ? r.top - gap - lh : pos === 'bottom' ? r.bottom + gap : r.top + r.height / 2 - lh / 2;
        if (pos === 'right') x = Math.min(r.right + gap, innerWidth - lw - 8);
        if (pos === 'left') x = Math.max(r.left - gap - lw, 8);
        h.label.style.left = x + 'px'; h.label.style.top = y + 'px';
      }
    });
  };

  P._startTracking = function () {
    if (this._tracking) return;
    var self = this;
    this._tracking = true;
    (function loop() {
      if (!self._highlights.length) { self._tracking = false; return; }
      self._updateHighlights();
      requestAnimationFrame(loop);
    })();
  };

  P._removeHighlight = function (h, instant) {
    var i = this._highlights.indexOf(h);
    if (i === -1) return;
    this._highlights.splice(i, 1);
    h.nodes.forEach(function (n) {
      if (instant) return n.remove();
      n.style.transition = 'opacity .35s ease';
      n.style.opacity = '0';
      if (n.classList) n.classList.remove('ot-in');
      setTimeout(function () { n.remove(); }, 400);
    });
  };

  P._clearHighlights = function (instant) {
    var self = this;
    this._highlights.slice().forEach(function (h) { self._removeHighlight(h, instant); });
  };

  /**
   * Draw attention to an element.
   * shape: 'circle' | 'box' | 'underline' | 'arrow' (+ 'spotlight' | 'pulse')
   * o: { color, padding, strokeWidth, drawDuration, duration (0 = until clearHighlights),
   *      block (wait for duration before next step), hold, label, labelPosition, from (arrow) }
   */
  P.highlight = function (target, o) {
    if (typeof o === 'string') o = { shape: o };
    return this._step('highlight', arguments, function () { return this._highlight(target, o); });
  };
  P.circle = function (target, o) { return this.highlight(target, assign({}, o, { shape: 'circle' })); };
  P.box = function (target, o) { return this.highlight(target, assign({}, o, { shape: 'box' })); };
  P.underline = function (target, o) { return this.highlight(target, assign({}, o, { shape: 'underline' })); };
  P.arrow = function (target, o) { return this.highlight(target, assign({}, o, { shape: 'arrow' })); };

  P.clearHighlights = function () {
    return this._step('clearHighlights', arguments, function () { this._clearHighlights(); return sleep(380 / this.opts.speed); });
  };

  OneTake.shapes = SHAPES;
