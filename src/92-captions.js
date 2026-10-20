  /* ==================================================================
   * Captions: subtitle-style narration at the bottom (or top) of the screen.
   * ================================================================== */

  feature({
    css: function () {
      return '.ot-caption{position:absolute;z-index:3;left:50%;bottom:7%;max-width:min(80vw,820px);padding:12px 22px;border-radius:12px;background:rgba(17,24,39,.88);color:#fff;font:500 20px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;text-align:center;opacity:0;transform:translate(-50%,10px);transition:opacity .35s ease,transform .35s ease;box-shadow:0 10px 30px rgba(0,0,0,.3);}' +
        '.ot-caption.ot-top{bottom:auto;top:6%;}' +
        '.ot-caption.ot-in{opacity:1;transform:translate(-50%,0);}';
    },
    stop: function () { this._setCaption(null); }
  });

  P._setCaption = function (text, o) {
    if (!this._mounted) return;
    var c = this._part('_caption', 'div', 'ot-caption');
    clearTimeout(this._captionTimer);
    if (text == null) { if (c.classList.contains('ot-in')) report('captionHide', {}); c.classList.remove('ot-in'); return; }
    report('caption', { text: String(text), duration: o && o.duration ? o.duration / this.opts.speed : null });
    var self = this;
    var show = function () {
      c.textContent = text;
      c.classList.toggle('ot-top', !!(o && o.position === 'top'));
      c.classList.add('ot-in');
      if (o && o.duration) self._captionTimer = setTimeout(function () { c.classList.remove('ot-in'); report('captionHide', {}); }, o.duration / self.opts.speed);
    };
    if (c.classList.contains('ot-in')) { c.classList.remove('ot-in'); this._captionTimer = setTimeout(show, 280); }
    else show();
  };

  /** Show a subtitle-style caption. o: { duration (auto-hide ms), position: 'bottom' | 'top', wait } */
  P.caption = function (text, o) {
    return this._step('caption', arguments, function () {
      this._setCaption(text, o);
      return sleep(((o && o.wait) || 350) / this.opts.speed);
    });
  };
  P.hideCaption = function () {
    return this._step('hideCaption', arguments, function () { this._setCaption(null); return sleep(300 / this.opts.speed); });
  };
