  /* Mark mode: hover to pick an element (↑ parent, ↓ back to child), click to open the menu:
   * Zoom (for N seconds, or until "Zoom out"), Circle, Box, Underline, Arrow, Spotlight, Pulse,
   * with an optional label. Clicks are swallowed so the app doesn't react while marking. */

  var MARK_CSS = [
    '.pick{position:fixed;border:2px solid #6366f1;background:rgba(99,102,241,.12);border-radius:6px;pointer-events:none;z-index:2}',
    '.pick b{position:absolute;left:-2px;top:-24px;padding:3px 7px;border-radius:6px;background:#6366f1;color:#fff;font:600 11px system-ui,sans-serif;white-space:nowrap}',
    '.menu{padding:10px;width:300px;display:grid;gap:8px}',
    '.menu .t{font-size:11px;color:#9ca3af;word-break:break-all;font-family:ui-monospace,Menlo,monospace}',
    '.menu .row{display:flex;gap:6px;align-items:center;flex-wrap:wrap}',
    '.menu .row input{flex:1;min-width:0}',
    '.menu .z input{width:74px;flex:none}'
  ].join('\n');

  var pick = { base: null, depth: 0, current: null, frozen: false };

  function mountMarks() {
    UI.root.appendChild(el('style', null, MARK_CSS));
    UI.pick = el('div', { class: 'pick', hidden: '' }, '<b></b>');
    UI.root.appendChild(UI.pick);
    UI.menu = el('div', { class: 'pop menu', hidden: '' },
      '<div class="t"></div>' +
      '<div class="row z"><button data-mark="zoom" class="go">Zoom</button><input type="number" min="0.5" step="0.5" placeholder="sec" title="Seconds (empty = until Zoom out)"><span style="font-size:11px;color:#9ca3af">empty = until “Zoom out”</span></div>' +
      '<div class="row"><button data-mark="circle">◯ Circle</button><button data-mark="box">▭ Box</button><button data-mark="underline">＿ Underline</button>' +
      '<button data-mark="arrow">➜ Arrow</button><button data-mark="spotlight">◐ Spotlight</button><button data-mark="pulse">◎ Pulse</button></div>' +
      '<div class="row"><input class="label" placeholder="Label (optional), e.g. “Your pipeline at a glance”" maxlength="80"></div>' +
      '<div class="row" style="justify-content:space-between"><span style="font-size:11px;color:#9ca3af">↑ / ↓ before clicking: parent / child</span><button data-mark="cancel">Cancel</button></div>');
    UI.root.appendChild(UI.menu);
    UI.menu.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-mark]');
      if (b) chooseMark(b.dataset.mark);
    });
    UI.menu.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') setMode('idle');
      if (e.key === 'Enter' && e.target.classList.contains('label')) chooseMark('circle');
      e.stopPropagation();
    });
  }

  function setMode(mode) {
    S.mode = mode;
    if (mode === 'mark' && UI.root.activeElement) UI.root.activeElement.blur();   // so ↑ / ↓ reach the picker
    pick.frozen = false;
    UI.menu.hidden = true;
    UI.pick.hidden = mode !== 'mark';
    UI.hint.hidden = mode !== 'mark';
    UI.hint.textContent = 'Mark: hover an element, ↑ / ↓ for parent / child, click to choose. Esc to cancel.';
    renderBar(S.state);
  }

  function underPointer(x, y) {
    var list = document.elementsFromPoint(x, y);
    for (var i = 0; i < list.length; i++) if (list[i] !== S.host && list[i] !== document.documentElement) return list[i];
    return null;
  }

  function currentTarget() {
    var n = pick.base;
    for (var i = 0; i < pick.depth && n && n.parentElement && n.parentElement !== document.documentElement; i++) n = n.parentElement;
    return n;
  }

  function drawPick() {
    var n = pick.current = currentTarget();
    if (!n) { UI.pick.hidden = true; return; }
    var r = n.getBoundingClientRect();
    UI.pick.hidden = false;
    UI.pick.style.left = r.left - 2 + 'px'; UI.pick.style.top = r.top - 2 + 'px';
    UI.pick.style.width = r.width + 4 + 'px'; UI.pick.style.height = r.height + 4 + 'px';
    UI.pick.querySelector('b').textContent = n.tagName.toLowerCase() + (n.id ? '#' + n.id : '') + '  ' + Math.round(r.width) + '×' + Math.round(r.height);
  }

  function openMenu(px, py) {
    pick.frozen = true;
    UI.hint.hidden = true;
    var n = pick.current;
    UI.menu.querySelector('.t').textContent = selectorFor(n);
    UI.menu.querySelector('.label').value = '';
    UI.menu.querySelector('.z input').value = '';
    UI.menu.hidden = false;
    // next to the pointer, inside the viewport and clear of the toolbar
    var mw = UI.menu.offsetWidth || 300, mh = UI.menu.offsetHeight || 200;
    var barBottom = UI.bar.getBoundingClientRect().bottom + 8;
    var left = Math.min(Math.max(8, px + 14), innerWidth - mw - 8);
    var top = py + 14 + mh < innerHeight ? py + 14 : py - mh - 14;
    top = Math.min(Math.max(barBottom, top), innerHeight - mh - 8);
    UI.menu.style.left = left + 'px'; UI.menu.style.top = top + 'px';
    UI.menu.querySelector('.label').focus();
  }

  function chooseMark(kind) {
    var n = pick.current;
    if (kind === 'cancel' || !n) return setMode('idle');
    var target = selectorFor(n);
    var label = clean(UI.menu.querySelector('.label').value) || null;
    var step = kind === 'zoom'
      ? { type: 'zoom', target: target, seconds: parseFloat(UI.menu.querySelector('.z input').value) || null }
      : { type: 'highlight', shape: kind, target: target, label: label };
    setMode('idle');
    addStep(step).then(function () { toast((kind === 'zoom' ? 'Zoom' : kind[0].toUpperCase() + kind.slice(1)) + ' added'); });
  }

  function swallow(e) {
    if (S.mode !== 'mark' || inStudio(e)) return false;
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    return true;
  }

  ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'dblclick', 'contextmenu'].forEach(function (type) {
    window.addEventListener(type, swallow, true);
  });
  window.addEventListener('click', function (e) {
    if (!swallow(e)) return;
    var n = underPointer(e.clientX, e.clientY);          // a click elsewhere while the menu is open re-picks
    if (pick.frozen && n !== pick.base) { pick.frozen = false; pick.base = n; pick.depth = 0; }
    else if (!pick.frozen) pick.base = n || pick.base;
    pick.frozen = false;
    drawPick();
    if (pick.current) openMenu(e.clientX, e.clientY);
  }, true);
  window.addEventListener('mousemove', function (e) {
    if (S.mode !== 'mark' || pick.frozen || inStudio(e)) return;
    var n = underPointer(e.clientX, e.clientY);
    if (n && n !== pick.base) { pick.base = n; pick.depth = 0; }
    drawPick();
  }, true);
  window.addEventListener('keydown', function (e) {
    if (S.mode !== 'mark') return;
    if (inStudio(e) && (pick.frozen || /^(INPUT|TEXTAREA)$/.test((e.composedPath()[0] || {}).tagName))) return;
    if (e.key === 'Escape') { setMode('idle'); e.preventDefault(); }
    if (pick.frozen) return;
    if (e.key === 'ArrowUp') { pick.depth++; drawPick(); e.preventDefault(); }
    if (e.key === 'ArrowDown') { pick.depth = Math.max(0, pick.depth - 1); drawPick(); e.preventDefault(); }
  }, true);
  window.addEventListener('scroll', function () { if (S.mode === 'mark') drawPick(); }, true);
