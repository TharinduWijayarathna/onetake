  /* ==================================================================
   * Drag and upload.
   *   take.drag('#card-3', '#done-column')          pointer drag; HTML5 drag-and-drop too
   *   take.upload('text=Attach file', 'invoice.pdf')  file inputs, their buttons/labels, or drop zones
   * With the recorder, drags use the real mouse and files are read from disk (paths are
   * relative to the tour script). On live pages files can be URLs or { name, content, type }.
   * ================================================================== */

  P.drag = function (source, target, o) {
    o = assign({ actionable: true, verb: 'drag' }, o);
    return this._step('drag', arguments, function () {
      var self = this, sp = this.opts.speed, src;
      return this._approach(source, o).then(function (el) {
        src = el;
        return self._resolve(target, o.timeout);
      }).then(function (dst) {
        var to = self._pointIn(dst, o.to || {});
        self._cursor.classList.add('ot-pressed');
        var run = self._real() ? realDrag(self, to, sp) : synthDrag(self, src, to, sp);
        return run.then(function () { self._cursor.classList.remove('ot-pressed'); });
      }).then(function () { return self._settle(o); });
    });
  };

  function realDrag(self, to, sp) {
    var v = self._toVisual(self.pos.x, self.pos.y);
    return self._input({ type: 'down', x: v.x, y: v.y })
      .then(function () { return sleep(160 / sp); })
      .then(function () { return self._moveToPoint(to.x, to.y, { overshoot: false, speed: 0.75 }); })
      .then(function () { return sleep(120 / sp); })
      .then(function () { var t = self._toVisual(to.x, to.y); return self._input({ type: 'up', x: t.x, y: t.y }); });
  }

  function dragEvent(el, type, dt, x, y) {
    var w = winOf(el), off = frameOffset(el);
    var Ctor = w.DragEvent || w.MouseEvent;
    var ev = new Ctor(type, { bubbles: true, cancelable: true, composed: true, clientX: x - off.x, clientY: y - off.y, dataTransfer: dt });
    if (!ev.dataTransfer && dt) Object.defineProperty(ev, 'dataTransfer', { value: dt });
    return el.dispatchEvent(ev);
  }

  /** Synthetic drag: pointer/mouse events with the button held, plus HTML5 drag events for draggable sources. */
  function synthDrag(self, src, to, sp) {
    var v0 = self._toVisual(self.pos.x, self.pos.y);
    var html5 = src.draggable === true || src.getAttribute('draggable') === 'true';
    var dt = html5 ? new (winOf(src).DataTransfer)() : null;
    var over = null, moving = true;
    fire(src, 'pointerdown', mouseInit(v0.x, v0.y, { buttons: 1 }));
    fire(src, 'mousedown', mouseInit(v0.x, v0.y, { buttons: 1 }));
    if (html5) dragEvent(src, 'dragstart', dt, v0.x, v0.y);
    self._dragHeld = true;
    (function frame() {
      if (!moving) return;
      var v = self._toVisual(self.pos.x, self.pos.y), el = hitTest(v.x, v.y);
      if (el) {
        if (html5) {
          if (el !== over) { if (over) dragEvent(over, 'dragleave', dt, v.x, v.y); dragEvent(el, 'dragenter', dt, v.x, v.y); over = el; }
          dragEvent(el, 'dragover', dt, v.x, v.y);
        }
      }
      requestAnimationFrame(frame);
    })();
    return sleep(160 / sp)
      .then(function () { return self._moveToPoint(to.x, to.y, { overshoot: false, speed: 0.75 }); })
      .then(function () { return sleep(120 / sp); })
      .then(function () {
        moving = false;
        self._dragHeld = false;
        var v = self._toVisual(to.x, to.y), el = hitTest(v.x, v.y) || over;
        if (html5) {
          if (el) { dragEvent(el, 'dragover', dt, v.x, v.y); dragEvent(el, 'drop', dt, v.x, v.y); }
          dragEvent(src, 'dragend', dt, v.x, v.y);
        }
        if (el) { fire(el, 'pointerup', mouseInit(v.x, v.y)); fire(el, 'mouseup', mouseInit(v.x, v.y)); }
      });
  }

  /** The file input an element stands for: itself, its label's control, or one nearby. */
  function fileInputFor(el) {
    if (el.matches('input[type=file]')) return el;
    if (el.control && el.control.type === 'file') return el.control;
    var n = el;
    for (var i = 0; i < 5 && n; i++, n = n.parentElement) {
      var inp = n.querySelector && n.querySelector('input[type=file]');
      if (inp) return inp;
    }
    return null;
  }

  function loadFile(self, spec) {
    if (spec && typeof spec === 'object' && !(spec instanceof Blob)) {
      return Promise.resolve(new File([spec.content == null ? '' : spec.content], spec.name || 'file.txt', { type: spec.type || 'text/plain' }));
    }
    if (typeof window.__otInput === 'function') {
      return self._input({ type: 'file', path: String(spec) }).then(function (f) {
        var bin = atob(f.base64), bytes = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return new File([bytes], f.name, { type: f.type });
      });
    }
    return fetch(String(spec)).then(function (r) {
      if (!r.ok) throw new Error('could not fetch ' + spec + ' (' + r.status + ')');
      return r.blob();
    }).then(function (b) { return new File([b], String(spec).split('/').pop().split('?')[0] || 'file', { type: b.type }); });
  }

  P.upload = function (target, files, o) {
    files = [].concat(files);
    o = assign({ actionable: true, verb: 'upload to' }, o);
    return this._step('upload', arguments, function () {
      var self = this;
      return this._approach(target, o).then(function (el) {
        var input = fileInputFor(el);
        return self._clickAt(el, assign({}, o, { visualOnly: true }))      // no OS file dialog
          .then(function () { return Promise.all(files.map(function (f) { return loadFile(self, f); })); })
          .then(function (list) {
            var dt = new (winOf(el).DataTransfer)();
            list.forEach(function (f) { dt.items.add(f); });
            if (input && !o.drop) {
              input.files = dt.files;
              var E = winOf(input).Event;
              input.dispatchEvent(new E('input', { bubbles: true }));
              input.dispatchEvent(new E('change', { bubbles: true }));
            } else {                                                        // a drop zone
              var v = self._toVisual(self.pos.x, self.pos.y);
              dragEvent(el, 'dragenter', dt, v.x, v.y);
              dragEvent(el, 'dragover', dt, v.x, v.y);
              dragEvent(el, 'drop', dt, v.x, v.y);
            }
          });
      }).then(function () { return self._settle(o); });
    });
  };
