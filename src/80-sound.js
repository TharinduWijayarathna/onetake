  /* ==================================================================
   * Sound: optional soft click and key sounds (WebAudio, no files),
   * for videos captured with a screen recorder.
   * ================================================================== */

  feature({
    defaults: {
      sound: false              // soft click / key sounds
    }
  });

  var audioCtx = null;
  function tick(kind) {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      var len = kind === 'key' ? 0.025 : 0.04;
      var buf = audioCtx.createBuffer(1, Math.floor(audioCtx.sampleRate * len), audioCtx.sampleRate);
      var data = buf.getChannelData(0);
      for (var i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 4);
      var src = audioCtx.createBufferSource(); src.buffer = buf;
      var f = audioCtx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = kind === 'key' ? 3200 : 1800;
      var g = audioCtx.createGain(); g.gain.value = kind === 'key' ? 0.18 : 0.35;
      src.connect(f); f.connect(g); g.connect(audioCtx.destination); src.start();
    } catch (e) { /* audio is best-effort */ }
  }

  P._sound = function (kind) { if (this.opts.sound) tick(kind); };
