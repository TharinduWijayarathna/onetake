# Recording

The recorder plays your tour in Chromium (through Playwright) and renders the video. You
drive it with the `onetake` command (`node bin/onetake.js` in a clone of the repo).

```bash
onetake init                    # onetake.config.js + tour.js
onetake check                   # dry run, fast, no video
onetake record                  # the video
onetake login --url http://localhost:3000/login --until /dashboard --out auth.json
onetake mcp                     # MCP server for AI agents (see MCP server)
onetake help
```

## The config file

`onetake.config.js` (or `.cjs`, or `.json`) in the current folder is picked up
automatically. Use `--config path` for another one. Paths inside it are relative to the
file. Flags on the command line override it.

```js
/** @type {import('onetake').Config} */
module.exports = {
  url: 'http://localhost:3000/clients',   // first page (or a local .html file)
  tour: 'tour.js',                        // one script can span several pages
  include: ['steps.js'],                  // shared steps loaded before the tour
  storage: 'auth.json',                   // start signed in
  viewport: { width: 1440, height: 900 },
  scale: 2,                               // 2880×1800 video, crisp text
  fps: 60,
  now: '2026-11-02T09:00',                // the app's clock (dates on screen never change)
  seed: 7,
  out: 'videos',
  name: 'clients-demo',
  options: { autoZoom: true },            // OneTake options for the page
  frame: { background: 'ocean', title: 'Acme CRM' },
  intro: { title: 'Acme CRM', subtitle: 'Managing clients' },
  outro: 'Try it free|acme.example',
  sound: true,
  formats: ['mp4', 'gif']
};
```

## All options

| Config key | Flag | Default | |
|---|---|---|---|
| `url` | `--url` | | First page: an `http(s)://` URL or a local file. |
| `tour` | positional, `--tour`, `--script` | | Tour script(s). Several files run one after another, each continuing on the page the previous one left. |
| `include` | `--include` | | Scripts loaded before the tour, on every page: helpers, `OneTake.define()`. |
| `storage` | `--storage` | | A Playwright storageState file to start signed in (see [Logins](#logins)). |
| `viewport` | `--width`, `--height` | 1920 × 1080 | The browser window in CSS px. |
| `scale` | `--scale` | `1` | Pixel density. `2` turns a 1920×1080 layout into a 3840×2160 video. |
| `fps` | `--fps` | `60` | Frames per second (frame-by-frame mode). |
| `mode` | `--realtime` | `'frames'` | `'frames'` or `'realtime'` (see [Capture modes](#capture-modes)). |
| `speed` | `--speed` | `1` | Tour speed. |
| `seed` | `--seed` | `7` | Fixes `Math.random` (in every mode): cursor paths, typing rhythm and shapes repeat exactly. |
| `now` | `--now` | real time | The page's date and time, e.g. `2026-11-02T09:00`. |
| `realInput` | `--no-real-input` | `true` | Trusted mouse and keyboard input. Turn it off to use synthetic events. |
| `options` | `--auto-zoom` | `{}` | OneTake options for the page ([API](api.md#options)). |
| `out` | `--out` | `recordings` | Output folder. |
| `name` | `--name` | `demo-<time>` | Output file name, without an extension. |
| `lead`, `tail` | `--lead`, `--tail` | `800`, `1200` | ms of still video before and after the tour. |
| `max` | `--max` | `900` | Safety limit on the video length (s). |
| `captureFormat` | `--format` | `'jpeg'` | Frame capture: `jpeg` (quality 95) or `png` (lossless, slower). |
| `crf` | `--crf` | `16` | x264 quality. Lower is better and bigger. |
| `headed` | `--headed` | `false` | Show the browser while it works. |
| `timeline` | `--timeline` | `false` | Also write `<name>.timeline.json`: every step, click, key and caption with its time. |
| `frame`, `intro`, `outro`, `sound`, `music`, `subtitles`, `chapters`, `thumbnail`, `formats`, `aspect` | | | See [Output](output.md). |

`--no-<flag>` turns a boolean off (`--no-subtitles`). `--watch` re-runs `check` or `record`
whenever the tour, an include or the config file changes.

## `onetake check`

```bash
onetake check --speed 4
```

`check` plays the tour without recording anything, with trusted input and real time, and
lists every step with the line it came from:

```
▶ checking tour.js on http://localhost:3000/clients
    1  chapter("Clients")  tour.js:2
    2  click("text=New client")  tour.js:3
    3  type("label=Name")  tour.js:4
    …
✔ all 24 steps passed in 9.8s
```

When a step fails, it stops, prints the reason, and saves `<out>/check.failure.png` and
`check.failure.html` (a screenshot and the page's HTML at that moment). A failed
`record` saves `<out>/<name>.failure.png` and `.html` the same way. The exit code is 1,
so `check` also works as a test in CI.

## Capture modes

### Frame by frame (default)

The page runs on a **virtual clock**. Time doesn't move on its own. Before each frame, the
recorder advances it by exactly 1/fps:

- `setTimeout` and `setInterval` callbacks that fall inside the frame run, in order;
- `requestAnimationFrame` and `requestIdleCallback` callbacks run once per frame;
- `Date`, `Date.now()` and `performance.now()` report virtual time (`--now` sets the
  starting point, which carries over page loads);
- CSS transitions, CSS animations and Web Animations are positioned on the virtual timeline;
- playing `<video>` elements are stepped frame by frame.

Then it screenshots the frame and streams it into ffmpeg. The result:

- **Perfectly smooth video**, with no dropped frames however slow the machine is. Rendering
  takes longer than real time, about 1–3× at 1440×900 and 3–6× at 2× scale.
- **Identical takes.** With the same seed, two renders have the same timing to the frame.
  The recorder even pauses the clock while a page load is on its way, so server speed doesn't
  show up in the video.
- **Sharp zoom.** `zoom()` captures the zoomed rectangle at full resolution.

Not controlled by the clock: Web Workers, WebSockets and server-side timing, audio, and
media other than `<video>`. Network requests take the time they take (with the clock
paused, they don't show in the video). Actions wait for their elements, so tours don't need
to account for any of this.

### Realtime (`--realtime`)

Playwright's live screencast, about 25 fps, converted to 30 fps MP4. Use it when you need a
rough cut fast, or for apps that misbehave on a virtual clock. `--aspect` needs frame mode.

### Live mode

The library also runs on its own in any page (a `<script>` tag or a DevTools snippet),
while you record the screen with another tool. Compared with the recorder:

- input is synthetic (`isTrusted === false`) and `:hover` is emulated;
- a tour stops when the page reloads;
- zoom is a CSS transform on `<body>`, so `position: fixed` pop-ups can shift while zoomed;
- there's no frame, no cards and no subtitles. Use `sound: true` for click sounds.

## Logins

Never put real passwords in a tour. Sign in once by hand and save the session:

```bash
onetake login --url http://localhost:3000/login --until /dashboard --out auth.json
```

A browser window opens. Sign in, and the session (cookies and localStorage) is saved to
`auth.json` once the URL matches `--until`. Then record with `storage: 'auth.json'`.
`auth.json` is a credential: keep it out of git (`onetake init` adds it to `.gitignore`).

Check whether a saved session still works (exit code 0 = signed in):

```bash
onetake login --check http://localhost:3000/dashboard --login /login --out auth.json
```

## Multi-page tours

One script can cross any number of page loads. See
[Writing tours](writing-tours.md#tours-that-span-pages). In the log, you'll see:

```
  ↻ page loaded, continuing from step 11
```

## Rendering on a server or in CI

Everything is headless, so the recorder runs on any Linux box with Node:

```bash
npx playwright install --with-deps chromium
onetake record --frame --sound
```

See [Recipes → Render in CI](recipes.md#render-the-video-in-ci).

## Environment variables

| | |
|---|---|
| `CHROMIUM_PATH` | Use this Chromium instead of Playwright's. |
| `FFMPEG_PATH` | Use this ffmpeg instead of `ffmpeg-static` or the one on the `PATH`. |
