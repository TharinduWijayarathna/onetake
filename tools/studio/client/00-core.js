  /* Studio client core: talks to tools/studio.js and holds the latest session state.
   * The client files are concatenated (in name order) into one script that the studio
   * injects into every page; they share this scope. */

  var S = {
    state: { steps: [], recording: false },
    caps: {},
    mode: 'idle',              // 'idle' | 'mark'
    host: null,                // the studio's shadow-DOM host element
    listeners: []
  };

  function call(msg) {
    return window.__otStudio(msg).then(function (res) {
      if (res && Array.isArray(res.steps)) {
        S.state = res;
        S.listeners.forEach(function (fn) { try { fn(res); } catch (e) { console.error('[OneTake Studio]', e); } });
      }
      return res;
    });
  }
  function onState(fn) { S.listeners.push(fn); }
  function recording() { return !!(S.state && S.state.recording); }
  function addStep(step) { return call({ op: 'add', step: step }); }

  function inStudio(e) { return !!S.host && e.composedPath().indexOf(S.host) !== -1; }
  function whenReady(fn) {
    if (document.body) fn();
    else document.addEventListener('DOMContentLoaded', fn, { once: true });
  }
  function clean(t) { return String(t == null ? '' : t).replace(/\s+/g, ' ').trim(); }
  function shortText(el) {
    return clean(el.innerText || el.value || el.getAttribute('aria-label') || el.getAttribute('placeholder') || '').slice(0, 40);
  }
