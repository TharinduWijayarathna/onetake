  /* ==================================================================
   * Settle: after an action (click, type, select, check, Enter, drag, upload)
   * wait until the app is idle: no fetch / XHR in flight and no DOM changes for
   * `settleQuiet` ms (capped at `settleTimeout`). This replaces guessed sleeps for
   * Livewire, React, Vue, htmx, … apps. Pages that never stop changing the DOM
   * (tickers, carousels) are detected and only network activity is awaited.
   * ================================================================== */

  feature({
    defaults: {
      settle: true,             // wait for the app to go idle after actions
      settleQuiet: 200,         // ms without network or DOM activity that counts as idle
      settleTimeout: 4000       // never wait longer than this (then carry on)
    },
    mount: function () { if (this.opts.settle) track(window); }
  });

  var ACTIVITY = { pending: 0, last: 0, dom: 0, installed: false };

  function track(win) {
    if (ACTIVITY.installed) return;
    ACTIVITY.installed = true;
    var now = function () { return performance.now(); };
    var begin = function () { ACTIVITY.pending++; ACTIVITY.last = now(); };
    var end = function () { ACTIVITY.pending = Math.max(0, ACTIVITY.pending - 1); ACTIVITY.last = now(); };

    if (win.fetch) {
      var realFetch = win.fetch;
      win.fetch = function () {
        begin();
        var p;
        try { p = realFetch.apply(this, arguments); } catch (e) { end(); throw e; }
        return p.then(function (r) { end(); return r; }, function (e) { end(); throw e; });
      };
    }
    var XHR = win.XMLHttpRequest && win.XMLHttpRequest.prototype;
    if (XHR) {
      var send = XHR.send;
      XHR.send = function () {
        begin();
        var done = false, self = this;
        this.addEventListener('loadend', function () { if (!done) { done = true; end(); } });
        try { return send.apply(self, arguments); } catch (e) { if (!done) { done = true; end(); } throw e; }
      };
    }
    if (win.MutationObserver) {
      var strip = function (v) { return String(v || '').replace(/\bot-[\w-]+/g, '').replace(/\s+/g, ' ').trim(); };
      new win.MutationObserver(function (records) {
        for (var i = 0; i < records.length; i++) {
          var r = records[i], t = r.target.nodeType === 1 ? r.target : r.target.parentElement;
          if (t && t.closest && t.closest('.ot-layer')) continue;                       // our own overlay
          if (r.type === 'attributes' && r.attributeName === 'class' &&
              strip(r.oldValue) === strip(t && t.getAttribute('class'))) continue;       // our hover classes
          if (r.type === 'attributes' && r.attributeName === 'style' && t === document.body) continue; // live camera
          ACTIVITY.dom = now();
          return;
        }
      }).observe(win.document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true, attributeOldValue: true });
    }
  }

  /** Wait until the app is idle (see above). Resolves with the ms waited. */
  P._settle = function (o) {
    var opts = this.opts, self = this;
    if (!opts.settle || (o && o.settle === false)) return Promise.resolve(0);
    track(window);
    var quiet = Math.max(60, (o && o.settleQuiet) || opts.settleQuiet), timeout = (o && o.settleTimeout) || opts.settleTimeout;
    var t0 = performance.now();
    return sleep(40).then(function () {
      return new Promise(function (resolve) {
        (function poll() {
          var now = performance.now();
          var lastActivity = Math.max(ACTIVITY.last, self._domNoisy >= 2 ? 0 : ACTIVITY.dom);
          if (self._aborted || (ACTIVITY.pending === 0 && now - lastActivity >= quiet)) return resolve(now - t0);
          if (now - t0 >= timeout) {
            if (ACTIVITY.pending === 0) self._domNoisy = (self._domNoisy || 0) + 1;        // only the DOM kept changing
            if (self._domNoisy === 2) console.warn('[OneTake] this page keeps changing its DOM; settling now waits for network only');
            return resolve(now - t0);
          }
          setTimeout(poll, 40);
        })();
      });
    });
  };

  OneTake.activity = ACTIVITY;
