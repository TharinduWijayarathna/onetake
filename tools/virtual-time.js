/*
 * OneTake virtual clock — injected into the page by tools/record.js in frame-by-frame mode.
 *
 * Time in the page stops moving on its own. The recorder calls
 *   await window.__otClock.tick(1000 / fps)
 * before every captured frame, which advances exactly one frame of "page time":
 *   - setTimeout / setInterval callbacks that fall inside the frame run, in order
 *   - requestAnimationFrame callbacks run once with the frame's timestamp
 *   - Date, Date.now() and performance.now() report virtual time
 *   - CSS transitions, CSS animations and Web Animations (element.animate) are paused
 *     and positioned on the virtual timeline, then finished (firing their end events)
 *
 * So every frame is rendered exactly where it belongs, however slowly screenshots
 * are taken. Network requests still happen in real time.
 */
(function () {
  if (window.__otClock) return;

  var RealDate = Date;
  var realSetTimeout = window.setTimeout.bind(window);
  var base = RealDate.now();
  var now = 0;                     // virtual ms since the page started
  var timers = new Map(), nextTimerId = 1;
  var rafs = new Map(), nextRafId = 1;
  var adopted = new WeakMap();

  /* ---- macrotask yield (lets promise chains settle between timers) ---- */
  var channel = new MessageChannel(), waiters = [];
  channel.port1.onmessage = function () { var w = waiters.shift(); if (w) w(); };
  function yieldTask() { return new Promise(function (r) { waiters.push(r); channel.port2.postMessage(0); }); }

  function report(e) { realSetTimeout(function () { throw e; }, 0); }

  /* ---- timers ---- */
  function addTimer(fn, delay, args, repeat) {
    var id = nextTimerId++;
    delay = Math.max(0, +delay || 0);
    timers.set(id, {
      id: id,
      time: now + delay,
      fn: typeof fn === 'function' ? fn : new Function(String(fn)),
      args: args,
      interval: repeat ? Math.max(1, delay) : null
    });
    return id;
  }
  window.setTimeout = function (fn, delay) { return addTimer(fn, delay, [].slice.call(arguments, 2), false); };
  window.setInterval = function (fn, delay) { return addTimer(fn, delay, [].slice.call(arguments, 2), true); };
  window.clearTimeout = window.clearInterval = function (id) { timers.delete(id); };

  window.requestAnimationFrame = function (cb) { var id = nextRafId++; rafs.set(id, cb); return id; };
  window.cancelAnimationFrame = function (id) { rafs.delete(id); };

  /* ---- clocks ---- */
  var VDate = new Proxy(RealDate, {
    construct: function (Target, args) {
      return args.length ? new (Function.prototype.bind.apply(Target, [null].concat(args)))() : new Target(base + now);
    },
    apply: function () { return new RealDate(base + now).toString(); },
    get: function (Target, key) {
      if (key === 'now') return function () { return Math.floor(base + now); };
      return Target[key];
    }
  });
  window.Date = VDate;
  try { Object.defineProperty(performance, 'now', { value: function () { return now; }, configurable: true }); }
  catch (e) { /* ignore */ }

  /* ---- optional fixed random seed (identical takes) ---- */
  if (window.__OT_SEED != null) {
    var s = (+window.__OT_SEED >>> 0) || 1;
    Math.random = function () { // mulberry32
      s = (s + 0x6D2B79F5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---- CSS / Web Animations ---- */
  function syncAnimations() {
    if (!document.getAnimations) return;
    var list = document.getAnimations();
    for (var i = 0; i < list.length; i++) {
      var a = list[i], rec = adopted.get(a);
      if (!rec) {
        if (a.playState !== 'running') continue;   // respect animations the app paused itself
        rec = { start: now, done: false };
        adopted.set(a, rec);
        try { a.pause(); } catch (e) { continue; }
      }
      if (rec.done) continue;
      var rate = a.playbackRate || 1;
      var t = (now - rec.start) * rate;
      var end = a.effect ? a.effect.getComputedTiming().endTime : Infinity;
      try {
        if (isFinite(end) && t >= end) { rec.done = true; a.finish(); }
        else a.currentTime = t;
      } catch (e) { rec.done = true; }
    }
  }

  function nextDue(limit) {
    var best = null;
    timers.forEach(function (t) {
      if (t.time <= limit && (!best || t.time < best.time || (t.time === best.time && t.id < best.id))) best = t;
    });
    return best;
  }

  async function tick(dt) {
    var target = now + dt, guard = 0;
    for (;;) {
      var t = nextDue(target);
      if (!t || ++guard > 5000) break;
      now = Math.max(now, t.time);
      if (t.interval != null) t.time = now + t.interval; else timers.delete(t.id);
      try { t.fn.apply(window, t.args); } catch (e) { report(e); }
      await yieldTask();
    }
    now = target;
    var cbs = Array.from(rafs.values());
    rafs.clear();
    for (var i = 0; i < cbs.length; i++) { try { cbs[i](now); } catch (e) { report(e); } }
    await yieldTask();
    syncAnimations();
    return now;
  }

  window.__otClock = { tick: tick, get now() { return now; } };
})();
