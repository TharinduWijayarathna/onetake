  /* ==================================================================
   * Spotlight & pulse: dim everything except one element, or ring it with
   * a pulsing outline. Registered as highlight shapes.
   * ================================================================== */

  function boxShape(className, fadeMs) {
    return function (self, h, r, o) {
      var d = document.createElement('div');
      d.className = className;
      d.style.color = o.color;
      if (o.radius != null) d.style.borderRadius = o.radius + 'px';
      var fx = self._part('_fx', 'div', 'ot-fx');
      fx.insertBefore(d, fx.firstChild);
      h.nodes.push(d); h.box = d;
      if (fadeMs) requestAnimationFrame(function () { d.style.opacity = '1'; });
      return sleep(fadeMs / self.opts.speed);
    };
  }

  SHAPES.spotlight = boxShape('ot-spot', 420);
  SHAPES.pulse = boxShape('ot-pulse', 0);

  feature({
    css: function () {
      return '.ot-spot{position:absolute;border-radius:12px;box-shadow:0 0 0 200vmax rgba(15,23,42,.6);opacity:0;transition:opacity .4s ease;}' +
        '.ot-pulse{position:absolute;border-radius:12px;border:3px solid currentColor;animation:ot-pulse 1.2s ease-out infinite;}' +
        '@keyframes ot-pulse{0%{transform:scale(.96);opacity:.95}100%{transform:scale(1.18);opacity:0}}';
    }
  });

  P.spotlight = function (target, o) { return this.highlight(target, assign({}, o, { shape: 'spotlight' })); };
  P.pulse = function (target, o) { return this.highlight(target, assign({}, o, { shape: 'pulse' })); };
