  /* Boot: build the UI once the page has a body, then tell the studio this page loaded. */

  whenReady(function () {
    if (typeof mountUI === 'function') mountUI();
    if (typeof mountMarks === 'function') mountMarks();
    if (typeof mountTimeline === 'function') mountTimeline();
    call({ op: 'hello' }).then(function (st) {
      S.caps = (st && st.caps) || {};
      if (typeof renderBar === 'function') renderBar(S.state);
      return call({ op: 'pageLoaded', url: location.href });
    });
  });
