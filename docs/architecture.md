# Architecture

```
bin/onetake.js        the `onetake` command
src/library/          the in-page library, one module per feature → bundled into dist/onetake.js
src/recorder/         the CLI, recorder, virtual clock and renderer (Node)
dist/onetake.js       the built library (committed, so it works without a build step)
types/                TypeScript types
scripts/build.js      src/library/ → dist/onetake.js
docs/                 documentation
examples/             a sample CRM and its tour
templates/demo-kit/   the starter kit for a project
skills/               the Claude skill (with AGENTS.md, CLAUDE.md and llms.txt at the root)
test/unit/            node:test unit tests
test/e2e/             smoke, compatibility, recorder and visual tests
test/fixtures/        small apps the tests drive · test/golden/ reference frames · test/helpers/
assets/               logo, icon, social preview, brand guide
```

```
tour.js ──► library in the page (dist/onetake.js) ──► step reports, input requests
                 ▲                                         │
                 │ virtual clock, view, resume             ▼
            recorder (src/recorder/session.js + frames.js / realtime.js) ──► raw video + timeline
                                                                         │
                                                       render (render.js, audio.js) ──► mp4, srt, vtt, chapters, jpg, webm, gif
```

## The library (`src/library/` → `dist/onetake.js`)

A dependency-free UMD bundle. `scripts/build.js` concatenates `src/library/NN-*.js` in name order
inside one closure, so a module can use anything defined in an earlier one, and adds
`//# sourceURL=onetake.js` so stack traces can tell library frames from tour frames.

| Module | |
|---|---|
| `00-core` | Options, helpers, the **step queue** (`_step`), call sites, `resumeFrom`, reports to the recorder, `run`/`set`/`wait`/`chapter`/`thumbnail`, `define`/`use`, the overlay layer, the `feature()` registry. |
| `10-targets` | The target engine: `text=`, `text*=`, `label=`, `role=`, CSS, `>>`, `nth=`, shadow roots, iframes, strict matching, `rectOf`/`hitTest` in top-level coordinates. |
| `20-cursor` | The drawn cursor: shapes, idle fade, motion blur. |
| `30-hover` | Hover: trusted mouse moves through the recorder, or synthetic events plus `:hover` emulation. |
| `40-movement` | Bézier paths with a minimum-jerk profile, overshoot, `moveTo`, `hover`. |
| `50-scroll` | Frame-exact smooth scrolling through nested scroll containers. |
| `55-actionable` | Visible / enabled / stable / receives-events checks, re-aiming, re-resolving re-rendered elements. |
| `57-settle` | Tracks fetch, XHR and DOM mutations to wait for the app to go idle. |
| `58-expect` | `expect`, `expectUrl`, `waitForUrl`, `scrollUntil`. |
| `60-click` | Clicks: trusted, or a synthetic pointer/mouse sequence; the ripple; `check`. |
| `70-input` | Typing, keys, `clear`, `select`; native value setters, so framework inputs update. |
| `75-drag-upload` | `drag` (pointer and HTML5) and `upload`. |
| `80-sound` | Live-mode click and key sounds (WebAudio). |
| `90-highlights`, `91-spotlight` | Hand-drawn SVG shapes and labels that track their element. |
| `92-captions` | Captions, and `OneTake.view()` to keep them inside the recorded view. |
| `95-camera` | The spring camera: CSS transform in live mode, or `window.__otCamera` for the recorder; auto-zoom. |

A module plugs in with `feature({ defaults, css, init, mount, step, stop, destroy })` and
adds methods to `P` (the prototype). Every public step goes through
`P._step(name, args, fn)`. That gives it its index, its call site, error decoration,
`onStep`/`onError`, the resume-skip and the reports.

### The bridge to the recorder

The page talks to the recorder through two functions that the recorder exposes, and the
library works without them:

- `window.__otReport(event)`: `step`, `stepDone`, `error`, `click`, `key`, `caption`,
  `captionHide`, `chapter`, `thumbnail`. These become the timeline: subtitles, chapters,
  sound and thumbnail come from it, and so does the resume point after a page load.
- `window.__otInput(msg)`: trusted input: `move`, `click`, `down`, `up`, `type`, `press`,
  and `file` (read a file next to the tour). It returns a promise.

And the recorder sets globals before page scripts run: `__OT_SEED`, `__OT_NOW`,
`__OT_CAMERA = 'external'` and `__otStatus()`.

## The virtual clock (`src/recorder/clock.js`)

Injected before any page script in frame mode. It replaces timers, `requestAnimationFrame`,
`requestIdleCallback`, `Date` and `performance.now`, pauses CSS and Web Animations and
positions them on its timeline, and steps playing `<video>` elements. Only
`__otClock.tick(ms)` moves time. Reads creep forward by microseconds, so code that
busy-waits on the clock still ends. The current time is kept in `sessionStorage`, so it
carries over page loads.

## The recorder (`src/recorder/`)

`bin/onetake.js` is the command; it calls `cli.js`.

| File | |
|---|---|
| `cli.js` | `onetake` commands, watch mode, output summary. |
| `config.js` | Defaults ← `onetake.config.js` ← flags. |
| `session.js` | Opens the page, exposes the bridge, runs the tour, and **resumes it after page loads** (re-inject the library, run the same script with `resumeFrom`; a step that already clicked or typed isn't repeated). It serialises trusted input, collects the timeline, holds the clock while a navigation is in flight, and carries the caption over. |
| `frames.js` | The frame driver: wait for pending input and navigations, `tick(1/fps)`, read the status, capture (with the camera or `--aspect` clip), pipe to ffmpeg. |
| `realtime.js` | The realtime driver (Playwright screencast), and `check`. |
| `render.js` | One ffmpeg pass: frame (Chromium-rendered background and mask, alphamerge, overlay), cards (xfade), audio (amix), subtitles (mov_text), chapters (FFMETADATA); then the thumbnail, WebM and GIF. Without frame, cards, sound or music (frames mode), the captured stream is copied as is. |
| `audio.js` | Synthesised click and key sounds, mixed in Node into a WAV. |
| `clock.js` | The virtual clock (above). |
| `login.js` | `onetake login`. |
| `util.js` | Finding Playwright, ffmpeg and the built library. |

### Why identical takes

- `Math.random` is seeded, so cursor paths, typing rhythm and shapes repeat.
- Time only moves per frame, so animations and timers land on the same frame.
- Trusted input is awaited before each tick, so it lands on the same frame.
- A navigation in flight holds the clock, so server latency doesn't add frames.

The recorder test renders the same tour twice and compares the timelines.
