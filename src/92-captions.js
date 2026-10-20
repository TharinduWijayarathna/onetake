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

  /*
   * The recorder tells the page which part of it is on screen (camera zoom, --aspect crop),
   * so captions stay inside the picture at a constant on-screen size:
   *   OneTake.view({ x, y, width, height })   viewport CSS px, or null for the whole page
   */
  var VIEW = null;
  function placeCaption(c) {
    if (!c) return;
    var st = c.style;
    if (!VIEW) { st.left = st.bottom = st.top = st.maxWidth = st.fontSize = st.padding = st.borderRadius = ''; return; }
    var vw = window.innerWidth, vh = window.innerHeight;
    var k = Math.max(VIEW.width / vw, VIEW.height / vh);
    st.left = (VIEW.x + VIEW.width / 2) + 'px';
    if (c.classList.contains('ot-top')) { st.bottom = 'auto'; st.top = (VIEW.y + VIEW.height * 0.06) + 'px'; }
    else { st.top = 'auto'; st.bottom = (vh - VIEW.y - VIEW.height + VIEW.height * 0.07) + 'px'; }
    st.maxWidth = (VIEW.width * 0.9) + 'px';
    st.fontSize = (20 * k) + 'px';
    st.padding = (12 * k) + 'px ' + (22 * k) + 'px';
    st.borderRadius = (12 * k) + 'px';
  }
  OneTake.view = function (v) {
    VIEW = v && v.width ? v : null;
    var all = document.querySelectorAll('.ot-caption');
    for (var i = 0; i < all.length; i++) placeCaption(all[i]);
  };

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
      placeCaption(c);
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
      return sleep((o && o.wait != null ? o.wait : 350) / this.opts.speed);
    });
  };
  P.hideCaption = function () {
    return this._step('hideCaption', arguments, function () { this._setCaption(null); return sleep(300 / this.opts.speed); });
  };
