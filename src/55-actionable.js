  /* ==================================================================
   * Actionability: before a click, type, check, select, drag or upload,
   * wait until the element is
   *   visible · enabled · not moving · the thing actually under the cursor point
   * (not covered by a modal, toast or overlay). If it never gets there, fail with
   * the reason, e.g. "covered by <div.modal-backdrop>". `force: true` skips the checks.
   * ================================================================== */

  function isDisabled(el) {
    if (el.matches && el.matches(':disabled')) return true;           // includes controls in a disabled <fieldset>
    return !!(el.closest && el.closest('[aria-disabled="true"]'));
  }

  /** The element (or something inside it, or its label) is what receives events at this point. */
  function receives(el, hit) {
    if (!hit) return false;
    if (hit === el || deepContains(el, hit)) return true;
    if (el.labels) for (var i = 0; i < el.labels.length; i++) if (el.labels[i] === hit || deepContains(el.labels[i], hit)) return true;
    if (hit.tagName === 'LABEL' && hit.control === el) return true;
    return false;
  }

  /** A point (top-level visual coords) on the element that really receives events, or why there isn't one. */
  P._pickPoint = function (el, o) {
    var r = rectOf(el), pts = [];
    if (o && o.position && typeof o.position === 'object') pts.push([r.left + r.width * o.position.x, r.top + r.height * o.position.y]);
    else {
      var jx = r.width > 40 ? rand(-0.18, 0.18) * r.width : 0;
      var jy = r.height > 30 ? rand(-0.15, 0.15) * r.height : 0;
      if (el.matches && el.matches(TEXTY) && r.width > 120) jx = rand(-0.3, -0.1) * r.width;
      pts.push([r.left + r.width / 2 + jx, r.top + r.height / 2 + jy]);
    }
    pts.push([r.left + r.width / 2, r.top + r.height / 2],
      [r.left + r.width * 0.25, r.top + r.height / 2], [r.left + r.width * 0.75, r.top + r.height / 2],
      [r.left + r.width / 2, r.top + r.height * 0.25], [r.left + r.width / 2, r.top + r.height * 0.75]);
    var firstHit = null;
    for (var i = 0; i < pts.length; i++) {
      var x = clamp(pts[i][0], 1, innerWidth - 1), y = clamp(pts[i][1], 1, innerHeight - 1);
      var hit = hitTest(x, y);
      if (receives(el, hit)) return { ok: true, x: x, y: y };
      if (!firstHit) firstHit = hit;
    }
    return { ok: false, hit: firstHit };
  };

  /** Wait until `el` can be acted on; resolves with a layout point to move the cursor to. */
  P._waitActionable = function (el, o) {
    o = o || {};
    var self = this, t0 = performance.now(), last = null;
    var timeout = o.timeout != null ? o.timeout : this.opts.waitTimeout;
    var verb = o.verb || 'click';
    return new Promise(function (resolve, reject) {
      (function poll() {
        if (self._aborted) return reject(new Error('OneTake: stopped'));
        var reason;
        if (!el.isConnected) return reject(new Error('cannot ' + verb + ' ' + describeEl(el) + ': it was removed from the page'));
        if (!isVisible(el)) reason = 'it is not visible';
        else if (o.enabled !== false && isDisabled(el)) reason = 'it is disabled';
        else {
          var r = rectOf(el), key = [r.left, r.top, r.width, r.height].map(Math.round).join(',');
          if (key !== last) { last = key; reason = 'it is still moving'; }
          else {
            var pt = self._pickPoint(el, o);
            if (pt.ok) { var l = self._toLayout(pt.x, pt.y); return resolve({ x: l.x, y: l.y }); }
            reason = 'it is covered by ' + describeEl(pt.hit);
          }
        }
        if (performance.now() - t0 > timeout) {
          return reject(new Error('cannot ' + verb + ' ' + describeEl(el) + ': ' + reason + ' (waited ' + Math.round(timeout / 1000) + ' s)'));
        }
        requestAnimationFrame(poll);
      })();
    });
  };

  /**
   * Resolve + bring into view + (for actions) wait until actionable + move the cursor onto it.
   * Re-checks after the move, because hover effects can shift layouts. Resolves with the element.
   */
  P._approach = function (target, o) {
    var self = this;
    o = o || {};
    return this._resolve(target, o.timeout).then(function (el) {
      return self._ensureInView(el).then(function () {
        if (!o.actionable || o.force) {
          var p = self._pointIn(el, o);
          return self._moveToPoint(p.x, p.y, o).then(function () { return el; });
        }
        var tries = 0;
        return (function attempt() {
          return self._waitActionable(el, o).then(function (pt) {
            return self._moveToPoint(pt.x, pt.y, o).then(function () {
              var v = self._toVisual(self.pos.x, self.pos.y);
              if (receives(el, hitTest(v.x, v.y)) || ++tries >= 3) return el;
              return attempt();                               // something moved under the cursor: aim again
            });
          });
        })();
      });
    });
  };
