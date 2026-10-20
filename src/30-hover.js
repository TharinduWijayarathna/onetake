  /* ==================================================================
   * Hover: pointer/mouse enter, leave, over, out and move events under the
   * cursor, and :hover / :active emulation (synthetic events can't trigger
   * CSS :hover, so the rules are copied to .ot-hover / .ot-active classes).
   * ================================================================== */

  function buildHoverCSS() {
    var out = [];
    function walk(rules, wrapOpen, wrapClose) {
      for (var i = 0; i < rules.length; i++) {
        var r = rules[i];
        if (r.selectorText && /:hover|:active/.test(r.selectorText)) {
          var sel = r.selectorText.replace(/:hover/g, '.ot-hover').replace(/:active/g, '.ot-active');
          out.push(wrapOpen + sel + '{' + r.style.cssText + '}' + wrapClose);
        } else if (r.cssRules && r.conditionText != null) {
          var kw = r.constructor && /Supports/.test(r.constructor.name) ? '@supports ' : '@media ';
          walk(r.cssRules, wrapOpen + kw + r.conditionText + '{', '}' + wrapClose);
        }
      }
    }
    for (var s = 0; s < document.styleSheets.length; s++) {
      var sheet = document.styleSheets[s];
      if (sheet.ownerNode && sheet.ownerNode.hasAttribute && sheet.ownerNode.hasAttribute('data-ot')) continue;
      var rules;
      try { rules = sheet.cssRules; } catch (e) { continue; } // cross-origin sheet
      if (rules) walk(rules, '', '');
    }
    return out.join('\n');
  }

  function mouseInit(x, y, extra) {
    return assign({ bubbles: true, cancelable: true, composed: true, view: window,
      clientX: x, clientY: y, screenX: x + (window.screenX || 0), screenY: y + (window.screenY || 0),
      button: 0, buttons: 0, pointerId: 1, pointerType: 'mouse', isPrimary: true }, extra);
  }
  function fire(el, type, init) {
    if (!el) return true;
    var Ctor = /^pointer/.test(type) && window.PointerEvent ? PointerEvent : MouseEvent;
    return el.dispatchEvent(new Ctor(type, init));
  }

  feature({
    defaults: {
      emulateHover: true        // make CSS :hover / :active rules react to the fake cursor
    },
    init: function () { this._hoverSet = []; this._sheetCount = -1; },
    mount: function () {
      if (!this.opts.emulateHover) return;
      this._hoverStyle = document.createElement('style');
      this._hoverStyle.setAttribute('data-ot', '');
      document.head.appendChild(this._hoverStyle);
      this._refreshHoverCSS();
    },
    step: function () {
      if (this.opts.emulateHover && document.styleSheets.length !== this._sheetCount) this._refreshHoverCSS();
    },
    destroy: function () {
      this._setHover([]);
      if (this._hoverStyle) this._hoverStyle.remove();
    }
  });

  P._refreshHoverCSS = function () {
    this._sheetCount = document.styleSheets.length;
    if (this._hoverStyle) this._hoverStyle.textContent = buildHoverCSS();
  };

  /** Update hover state (classes + enter/leave/over/out events) for a layout point. */
  P._hoverAt = function (lx, ly, move) {
    var hit = this._hit(lx, ly);
    var vis = this._toVisual(lx, ly), x = vis.x, y = vis.y; // events carry on-screen coordinates
    var chain = [];
    for (var n = hit; n && n.nodeType === 1; n = n.parentElement) chain.push(n);
    var prevTop = this._hoverSet[0];
    if (hit !== prevTop) {
      var init = mouseInit(x, y);
      if (prevTop) { fire(prevTop, 'pointerout', init); fire(prevTop, 'mouseout', init); }
      var left = this._hoverSet.filter(function (e) { return chain.indexOf(e) === -1; });
      var entered = chain.filter(function (e) { return this._hoverSet.indexOf(e) === -1; }, this);
      var leaveInit = assign({}, init, { bubbles: false });
      left.forEach(function (e) { fire(e, 'pointerleave', leaveInit); fire(e, 'mouseleave', leaveInit); });
      if (hit) { fire(hit, 'pointerover', init); fire(hit, 'mouseover', init); }
      entered.reverse().forEach(function (e) { fire(e, 'pointerenter', leaveInit); fire(e, 'mouseenter', leaveInit); });
      this._setHover(chain);
      this._setKind(this._kindFor(hit));
    }
    if (move && hit) { var mi = mouseInit(x, y); fire(hit, 'pointermove', mi); fire(hit, 'mousemove', mi); }
    return hit;
  };

  P._setHover = function (chain) {
    if (this.opts.emulateHover) {
      this._hoverSet.forEach(function (e) { if (chain.indexOf(e) === -1) e.classList.remove('ot-hover'); });
      chain.forEach(function (e) { e.classList.add('ot-hover'); });
    }
    this._hoverSet = chain;
  };
