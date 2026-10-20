  /* Timeline: the recorded steps, grouped by page. Edit values, labels, seconds and selectors,
   * reorder with ↑ / ↓, delete with ✕. Hovering a step outlines its element on the page. */

  var TIMELINE_CSS = [
    '.panel{position:fixed;top:64px;right:12px;bottom:12px;width:min(380px,92vw);display:flex;flex-direction:column;pointer-events:auto;',
    '  background:rgba(17,24,39,.96);color:#f9fafb;border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.4);font-size:13px;z-index:4}',
    '.panel header{display:flex;align-items:center;gap:8px;padding:12px 12px 8px;font-weight:700}',
    '.panel header span{flex:1}',
    '.panel .list{overflow:auto;padding:0 8px 12px;flex:1}',
    '.page{margin:10px 4px 4px;font-size:11px;font-weight:700;color:#a5b4fc;text-transform:uppercase;letter-spacing:.4px;word-break:break-all}',
    '.page small{display:block;font-weight:400;text-transform:none;letter-spacing:0;color:#9ca3af}',
    '.step{display:grid;grid-template-columns:22px 1fr auto;gap:6px;align-items:start;padding:7px 6px;border-radius:9px}',
    '.step:hover{background:rgba(255,255,255,.06)}',
    '.step .i{font-size:14px;line-height:22px;text-align:center}',
    '.step .f{display:grid;gap:4px;min-width:0}',
    '.step .f .k{font-weight:600}',
    '.step .f input,.step .f select{width:100%}',
    '.step .f .sel{font-family:ui-monospace,Menlo,monospace;font-size:11px;color:#9ca3af}',
    '.step .c{display:flex;gap:2px}',
    '.step .c button{padding:3px 6px;background:none;color:#9ca3af}',
    '.step .c button:hover{color:#fff;background:#374151}',
    '.empty{padding:20px 10px;color:#9ca3af;line-height:1.5}',
    '.flash{position:fixed;border:2px dashed #f59e0b;border-radius:6px;pointer-events:none;z-index:2}'
  ].join('\n');

  var ICONS = { click: '👆', type: '⌨️', select: '▾', check: '☑️', zoom: '🔍', zoomOut: '⤢', highlight: '✏️', caption: '💬', wait: '⏱', note: 'ℹ️' };
  var SHAPE_NAMES = ['circle', 'box', 'underline', 'arrow', 'spotlight', 'pulse'];

  function mountTimeline() {
    UI.root.appendChild(el('style', null, TIMELINE_CSS));
    UI.panel = el('div', { class: 'panel', hidden: '' },
      '<header><span>Steps</span><button data-t="clear" title="Delete all steps">Clear</button><button data-t="close">✕</button></header>' +
      '<div class="list"></div>');
    UI.flash = el('div', { class: 'flash', hidden: '' });
    UI.root.appendChild(UI.panel);
    UI.root.appendChild(UI.flash);
    UI.list = UI.panel.querySelector('.list');

    UI.panel.querySelector('header').addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.t === 'close') toggleTimeline(false);
      if (b.dataset.t === 'clear') {
        if (b.dataset.armed) { call({ op: 'clear' }); delete b.dataset.armed; b.textContent = 'Clear'; }
        else { b.dataset.armed = '1'; b.textContent = 'Click again to clear'; setTimeout(function () { delete b.dataset.armed; b.textContent = 'Clear'; }, 3000); }
      }
    });
    UI.list.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-op]');
      if (!b) return;
      var id = +b.closest('.step').dataset.id;
      if (b.dataset.op === 'up') call({ op: 'move', id: id, dir: -1 });
      if (b.dataset.op === 'down') call({ op: 'move', id: id, dir: 1 });
      if (b.dataset.op === 'del') call({ op: 'remove', id: id });
    });
    UI.list.addEventListener('change', function (e) {
      var f = e.target.closest('[data-field]');
      if (!f) return;
      var id = +f.closest('.step').dataset.id, field = f.dataset.field, v = f.type === 'checkbox' ? f.checked : f.value;
      if (field === 'seconds') v = parseFloat(v) || null;
      if (field === 'duration') v = Math.round((parseFloat(v) || 3) * 1000);
      if (field === 'ms') v = Math.round((parseFloat(v) || 1) * 1000);
      var patch = {}; patch[field] = v;
      call({ op: 'update', id: id, patch: patch });
    });
    UI.list.addEventListener('keydown', function (e) { e.stopPropagation(); });
    UI.list.addEventListener('mouseover', function (e) {
      var row = e.target.closest('.step');
      var step = row && S.state.steps.find(function (s) { return s.id === +row.dataset.id; });
      var n = step && step.target && resolveTarget(step.target);
      if (!n) { UI.flash.hidden = true; return; }
      var r = n.getBoundingClientRect();
      Object.assign(UI.flash.style, { left: r.left - 3 + 'px', top: r.top - 3 + 'px', width: r.width + 6 + 'px', height: r.height + 6 + 'px' });
      UI.flash.hidden = false;
    });
    UI.list.addEventListener('mouseleave', function () { UI.flash.hidden = true; });
    onState(function () { if (!UI.panel.hidden) renderTimeline(); });
  }

  function toggleTimeline(show) {
    UI.panel.hidden = show === undefined ? !UI.panel.hidden : !show;
    UI.bar.querySelector('[data-act=steps]').classList.toggle('on', !UI.panel.hidden);
    if (!UI.panel.hidden) renderTimeline();
  }

  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function input(field, value, attrs) { return '<input data-field="' + field + '" value="' + esc(value) + '" ' + (attrs || '') + '>'; }

  function stepFields(s) {
    var sel = s.target ? input('target', s.target, 'class="sel" title="Selector"') : '';
    switch (s.type) {
      case 'click': return '<div class="k">Click ' + esc(s.text ? '“' + s.text + '”' : '') + '</div>' + sel;
      case 'type': return '<div class="k">Type' + (s.enter ? ' + Enter' : '') + '</div>' + input('value', s.value) + sel;
      case 'select': return '<div class="k">Choose</div>' + input('value', s.value) + sel;
      case 'check': return '<div class="k">' + (s.state === false ? 'Uncheck' : 'Check') + '</div>' + sel;
      case 'zoom': return '<div class="k">Zoom' + (s.seconds ? ' for ' + esc(s.seconds) + ' s' : ' until “Zoom out”') + '</div>' + input('seconds', s.seconds || '', 'type="number" min="0.5" step="0.5" placeholder="seconds (empty = until Zoom out)"') + sel;
      case 'zoomOut': return '<div class="k">Zoom out</div>';
      case 'highlight':
        return '<div class="k">Highlight</div><select data-field="shape">' + SHAPE_NAMES.map(function (n) {
          return '<option' + (n === s.shape ? ' selected' : '') + '>' + n + '</option>';
        }).join('') + '</select>' + input('label', s.label || '', 'placeholder="label (optional)"') + sel;
      case 'caption': return '<div class="k">Caption</div>' + input('text', s.text) +
        input('duration', (s.duration || 3000) / 1000, 'type="number" min="1" step="0.5" title="seconds on screen"');
      case 'wait': return '<div class="k">Wait (seconds)</div>' + input('ms', (s.ms || 1000) / 1000, 'type="number" min="0.1" step="0.1"');
      case 'note': return '<div class="k">Note</div><div class="sel">' + esc(s.text) + '</div>';
      default: return '<div class="k">' + esc(s.type) + '</div>';
    }
  }

  function renderTimeline() {
    var st = S.state, html = [], pageNo = 1;
    if (st.url) html.push('<div class="page">Page 1<small>' + esc(st.url) + '</small></div>');
    st.steps.forEach(function (s) {
      if (s.type === 'page') {
        pageNo++;
        html.push('<div class="page">Page ' + pageNo + (s.direct ? ' (opened directly)' : '') + '<small>' + esc(s.url) + '</small></div>');
        return;
      }
      html.push('<div class="step" data-id="' + s.id + '"><div class="i">' + (ICONS[s.type] || '•') + '</div><div class="f">' + stepFields(s) +
        '</div><div class="c"><button data-op="up" title="Move up">↑</button><button data-op="down" title="Move down">↓</button><button data-op="del" title="Delete">✕</button></div></div>');
    });
    if (!st.steps.length) {
      html.push('<div class="empty">' + (st.recording
        ? 'Recording. Use your app: clicks, typing, selects and page changes appear here.<br><br>Use ✎ Mark to zoom on or highlight an element, 💬 Caption for narration.'
        : 'Press ● Record, then use your app as you normally would.') + '</div>');
    }
    UI.list.innerHTML = html.join('');
  }
