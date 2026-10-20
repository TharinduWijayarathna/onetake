  /* Toolbar: a floating, draggable bar in a shadow root, so it never inherits or leaks styles.
   *   ● Record / Pause · ✎ Mark · 💬 Caption · ⤢ Zoom out · ⏱ Wait · ☰ Steps · Generate · ▶ Render
   * Shortcuts: Alt+R record, Alt+M mark, Esc cancel. */

  var STUDIO_CSS = [
    ':host{all:initial}',
    '*{box-sizing:border-box;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}',
    '.bar{position:fixed;top:12px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:4px;padding:6px;border-radius:14px;',
    '  background:rgba(17,24,39,.94);color:#f9fafb;box-shadow:0 10px 30px rgba(0,0,0,.35);pointer-events:auto;font-size:13px;user-select:none;z-index:6}',
    '.brand{display:flex;align-items:center;gap:7px;padding:0 8px 0 2px;font-weight:800;letter-spacing:-.2px;cursor:grab;color:#f9fafb;font-size:14px}',
    '.brand svg{width:22px;height:22px;display:block;flex:none}',
    '.brand em{font-style:normal;color:#a5b4fc}',
    '.bar button{all:unset;cursor:pointer;padding:7px 10px;border-radius:9px;color:#e5e7eb;white-space:nowrap;line-height:1}',
    '.bar button:hover{background:rgba(255,255,255,.1)}',
    '.bar button[disabled]{opacity:.35;cursor:default;background:none}',
    '.bar button.on{background:#4f46e5;color:#fff}',
    '.bar button.primary{background:#16a34a;color:#fff}',
    '.bar button.primary:hover{background:#15803d}',
    '.rec i{display:inline-block;width:9px;height:9px;border-radius:50%;background:#ef4444;margin-right:6px;vertical-align:0}',
    '.rec.on{background:#7f1d1d!important}',
    '.rec.on i{animation:blink 1s steps(2) infinite}',
    '@keyframes blink{50%{opacity:.25}}',
    '.count{display:inline-block;min-width:18px;padding:2px 5px;margin-left:4px;border-radius:9px;background:rgba(255,255,255,.15);font-size:11px;text-align:center}',
    '.sep{width:1px;height:20px;background:rgba(255,255,255,.15);margin:0 4px}',
    '.pop{position:fixed;pointer-events:auto;background:#111827;color:#f9fafb;border-radius:12px;box-shadow:0 12px 32px rgba(0,0,0,.4);font-size:13px;z-index:4}',
    '.pop input,.pop select,.panel input,.panel select{all:unset;box-sizing:border-box;background:#1f2937;color:#f9fafb;border:1px solid #374151;border-radius:7px;padding:6px 8px;font-size:12px}',
    '.pop input:focus,.panel input:focus{border-color:#6366f1}',
    '.pop button,.panel button{all:unset;cursor:pointer;padding:6px 9px;border-radius:7px;background:#374151;color:#f9fafb;font-size:12px}',
    '.pop button:hover,.panel button:hover{background:#4b5563}',
    '.pop button.go{background:#4f46e5}',
    '.captionbox{top:62px;left:50%;transform:translateX(-50%);display:flex;gap:6px;padding:8px;width:min(560px,90vw)}',
    '.captionbox input{flex:1}',
    '.toast{position:fixed;bottom:18px;left:50%;transform:translateX(-50%);max-width:80vw;padding:9px 14px;border-radius:10px;background:#111827;color:#f9fafb;',
    '  font-size:13px;box-shadow:0 10px 30px rgba(0,0,0,.35);opacity:0;transition:opacity .2s;pointer-events:none;z-index:5}',
    '.toast.show{opacity:1}',
    '.hint{position:fixed;top:62px;left:50%;transform:translateX(-50%);padding:6px 12px;border-radius:9px;background:#4f46e5;color:#fff;font-size:12px;pointer-events:none;z-index:3}',
    '[hidden]{display:none!important}'
  ].join('\n');

  /** The OneTake mark (assets/icon.svg), inlined so the toolbar needs no network. */
  var BRAND_MARK = '<svg viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="ots-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6366f1"/><stop offset="1" stop-color="#4338ca"/></linearGradient></defs><rect width="64" height="64" rx="15" fill="url(#ots-g)"/><path d="M13 23L13 13L23 13" fill="none" stroke="#fff" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round" opacity=".95"/><path d="M41 13L51 13L51 23" fill="none" stroke="#fff" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round" opacity=".95"/><path d="M51 41L51 51L41 51" fill="none" stroke="#fff" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round" opacity=".95"/><path d="M23 51L13 51L13 41" fill="none" stroke="#fff" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round" opacity=".95"/><path d="M24 20L24 43.5L30.2 37.6L34.4 46.6L38.6 44.8L34.5 35.9L42.6 35.6Z" fill="#fff" stroke="#1e1b4b" stroke-opacity=".18" stroke-width="1" stroke-linejoin="round"/><circle cx="42.5" cy="21.5" r="4" fill="#ef4444" stroke="#fff" stroke-width="1.8"/></svg>';

  var UI = {};

  function el(tag, attrs, html) {
    var n = document.createElement(tag);
    for (var k in attrs || {}) n.setAttribute(k, attrs[k]);
    if (html != null) n.innerHTML = html;
    return n;
  }

  function toast(msg, ms) {
    UI.toast.textContent = msg;
    UI.toast.classList.add('show');
    clearTimeout(UI.toastTimer);
    UI.toastTimer = setTimeout(function () { UI.toast.classList.remove('show'); }, ms || 2600);
  }

  function mountUI() {
    if (S.host) return;
    var host = S.host = el('div', { 'data-ot-studio': '' });
    host.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483646;';
    var root = UI.root = host.attachShadow({ mode: 'open' });
    root.appendChild(el('style', null, STUDIO_CSS));

    UI.bar = el('div', { class: 'bar', role: 'toolbar' },
      '<span class="brand" title="OneTake Studio (drag to move)">' + BRAND_MARK + '<span>One<em>Take</em></span></span>' +
      '<button data-act="record" class="rec" title="Alt+R"><i></i><span>Record</span></button>' +
      '<button data-act="mark" title="Pick an element to zoom on or highlight (Alt+M)">✎ Mark</button>' +
      '<button data-act="caption" title="Add a line of narration">💬 Caption</button>' +
      '<button data-act="zoomOut" title="Zoom back out to the full page">⤢ Zoom out</button>' +
      '<button data-act="wait" title="Pause for a second">⏱ Wait</button>' +
      '<span class="sep"></span>' +
      '<button data-act="steps" title="Show and edit the steps">☰ Steps<span class="count">0</span></button>' +
      '<button data-act="generate" title="Write the OneTake scripts">Generate</button>' +
      '<button data-act="render" class="primary" title="Render the video">▶ Render</button>');
    root.appendChild(UI.bar);

    UI.captionBox = el('div', { class: 'pop captionbox', hidden: '' },
      '<input placeholder="Narration, e.g. “Let’s add a new client.”" maxlength="160">' +
      '<input class="secs" type="number" min="1" max="30" step="0.5" value="3" title="Seconds on screen" style="width:64px">' +
      '<button class="go">Add caption</button>');
    root.appendChild(UI.captionBox);
    UI.hint = el('div', { class: 'hint', hidden: '' });
    root.appendChild(UI.hint);
    UI.toast = el('div', { class: 'toast' });
    root.appendChild(UI.toast);
    document.documentElement.appendChild(host);

    UI.bar.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (b && !b.disabled) ACTIONS[b.dataset.act]();
    });
    var input = UI.captionBox.querySelector('input'), secs = UI.captionBox.querySelector('.secs');
    function addCaption() {
      var text = clean(input.value);
      if (!text) return;
      addStep({ type: 'caption', text: text, duration: Math.round((+secs.value || 3) * 1000) });
      input.value = '';
      UI.captionBox.hidden = true;
      toast('Caption added');
    }
    UI.captionBox.querySelector('.go').addEventListener('click', addCaption);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') addCaption();
      if (e.key === 'Escape') UI.captionBox.hidden = true;
      e.stopPropagation();
    });
    dragBar();
    onState(renderBar);
    renderBar(S.state);
  }

  function dragBar() {
    var brand = UI.bar.querySelector('.brand'), sx, sy, ox, oy;
    try {
      var saved = JSON.parse(localStorage.getItem('ot-studio-bar') || 'null');
      if (saved) { UI.bar.style.left = saved.x + 'px'; UI.bar.style.top = saved.y + 'px'; UI.bar.style.transform = 'none'; }
    } catch (e) { /* storage unavailable */ }
    brand.addEventListener('mousedown', function (e) {
      var r = UI.bar.getBoundingClientRect();
      sx = e.clientX; sy = e.clientY; ox = r.left; oy = r.top;
      function move(ev) {
        UI.bar.style.transform = 'none';
        UI.bar.style.left = Math.max(0, ox + ev.clientX - sx) + 'px';
        UI.bar.style.top = Math.max(0, oy + ev.clientY - sy) + 'px';
      }
      function up() {
        document.removeEventListener('mousemove', move, true);
        document.removeEventListener('mouseup', up, true);
        try { localStorage.setItem('ot-studio-bar', JSON.stringify({ x: parseInt(UI.bar.style.left, 10), y: parseInt(UI.bar.style.top, 10) })); } catch (err) { /* ignore */ }
      }
      document.addEventListener('mousemove', move, true);
      document.addEventListener('mouseup', up, true);
      e.preventDefault();
    });
  }

  function renderBar(st) {
    if (!UI.bar) return;
    var rec = UI.bar.querySelector('[data-act=record]');
    rec.classList.toggle('on', !!st.recording);
    rec.querySelector('span').textContent = st.recording ? 'Recording' : (st.steps.length ? 'Resume' : 'Record');
    ['mark', 'caption', 'zoomOut', 'wait'].forEach(function (a) { UI.bar.querySelector('[data-act=' + a + ']').disabled = !st.recording; });
    UI.bar.querySelector('[data-act=mark]').classList.toggle('on', S.mode === 'mark');
    UI.bar.querySelector('.count').textContent = st.steps.filter(function (s) { return s.type !== 'page'; }).length;
    UI.bar.querySelector('[data-act=generate]').disabled = !S.caps.generate || !st.url;
    UI.bar.querySelector('[data-act=render]').disabled = !S.caps.render || !st.url;
  }

  var ACTIONS = {
    record: function () {
      var on = !recording();
      call({ op: 'setRecording', on: on }).then(function () {
        toast(on ? 'Recording: use your app. Clicks, typing and page changes are saved.' : 'Paused');
      });
    },
    mark: function () { if (typeof setMode === 'function') setMode(S.mode === 'mark' ? 'idle' : 'mark'); },
    caption: function () {
      UI.captionBox.hidden = !UI.captionBox.hidden;
      if (!UI.captionBox.hidden) UI.captionBox.querySelector('input').focus();
    },
    zoomOut: function () { addStep({ type: 'zoomOut' }).then(function () { toast('Zoom out added'); }); },
    wait: function () { addStep({ type: 'wait', ms: 1000 }).then(function () { toast('Wait 1 s added'); }); },
    steps: function () { if (typeof toggleTimeline === 'function') toggleTimeline(); },
    generate: function () {
      call({ op: 'generate' }).then(function (r) {
        if (r.error) return toast('✖ ' + r.error, 4000);
        toast('Wrote ' + r.result.files.join(', ') + ' + render.sh', 4500);
      });
    },
    render: function () {
      if (recording()) call({ op: 'setRecording', on: false });
      call({ op: 'render' }).then(function (r) {
        if (r.error) return toast('✖ ' + r.error, 4000);
        toast('Rendering in a separate browser: it replays your steps, so expect your app to do them again.', 5000);
        pollRender();
      });
    }
  };

  function pollRender() {
    call({ op: 'renderStatus' }).then(function (r) {
      var st = r.status || {};
      if (st.message) toast(st.message, 4000);
      if (st.running) setTimeout(pollRender, 1000);
    });
  }

  document.addEventListener('keydown', function (e) {
    if (inStudio(e)) return;
    if (e.altKey && (e.key === 'r' || e.key === 'R' || e.code === 'KeyR')) { e.preventDefault(); ACTIONS.record(); }
    if (e.altKey && (e.key === 'm' || e.key === 'M' || e.code === 'KeyM') && recording()) { e.preventDefault(); ACTIONS.mark(); }
  }, true);
