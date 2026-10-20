<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/logo-dark.svg">
    <img src="assets/logo.svg" alt="OneTake" height="64">
  </picture>
</p>

<p align="center"><b>Script your product demo once. Get a perfect video every take.</b></p>
<p align="center">Human-like cursor · camera zoom · hand-drawn highlights · 60 fps render</p>

---

A small, dependency-free JavaScript library for **scripted product demo videos**.
It drives your real UI (clicks, typing, selects, checkboxes, tabs, scrolling) while
showing a **realistic animated cursor**, **hand-drawn highlights** (circles, boxes,
underlines, arrows, spotlights, pulses), **smooth camera zooms** like Screen Studio, and
subtitle-style captions. The included recorder renders it all to a **60 fps MP4**, frame by frame.

```js
const take = new OneTake();

take
  .caption('Let’s add a new contact')
  .circle('#pipeline-card', { label: 'Your pipeline at a glance' })
  .click('text=Contacts')
  .click('#new-contact')
  .zoom('#contact-form', 15)            // glide in on the form for 15 s
  .type('label=Full name', 'Priya Raman')
  .type('label=Email', 'priya@lumen.dev')
  .select('label=Role', 'Decision maker')
  .check('text=Subscribe to newsletter')
  .box('#save', { label: 'Save when ready' })
  .click('#save');
```

Open `examples/demo.html` in a browser and press **▶ Play demo** to see it, or render it
to a video with `npm run example`.

---

## Project layout

| Path | What it is |
|---|---|
| `dist/onetake.js` | The library, bundled (no dependencies, UMD: works as a `<script>`, CommonJS or AMD). |
| `src/` | The library source, one file per feature (core, targets, cursor, hover, movement, scroll, click, input, sound, highlights, spotlight, captions, camera). |
| `scripts/build.js` | Bundles `src/*.js` into `dist/onetake.js` (`npm run build`). |
| `tools/record.js` | Renders a script in Chromium to a **60 fps MP4**, frame by frame (no screen recorder needed). |
| `tools/virtual-time.js` | The virtual clock the recorder injects, so every frame renders at the exact moment it belongs to. |
| `examples/demo.html` | A sample CRM app with sections, tabs, a modal form, and a scripted tour. |
| `examples/tour.js` | The same tour as a standalone script for the recorder. |
| `test/smoke.js` | Plays the example end to end and checks the app was really driven (`npm test`). |
| `tools/studio.js`, `tools/studio/` | **OneTake Studio**: make a demo by clicking through your app, marking zooms and highlights, then Generate / Render. |
| `tools/save-login.js` | Saves a signed-in session (Playwright storageState) for recording apps behind a login. |
| `templates/demo-kit/` | Starter kit to copy next to a project: `record.sh` (one-command render) + a page-script skeleton. |
| `assets/` | The logo, icon and social preview, plus the brand guide ([`assets/BRAND.md`](assets/BRAND.md)). |
| `AGENTS.md`, `skills/`, `llms.txt` | Guides for AI agents: how to make a demo video of any project with OneTake. |

---

## Three ways to use it

### 1. Add it to your app (dev / staging builds)
```html
<script src="dist/onetake.js"></script>
<script>
  // e.g. start on a hotkey so you can set up your screen recorder first
  addEventListener('keydown', e => { if (e.key === 'F9') runTour(); });
  function runTour() { new OneTake().click('text=Projects').type('label=Name', 'Q4 launch'); }
</script>
```

### 2. Paste it into any page (no code changes)
In Chrome DevTools → **Sources → Snippets**, create one snippet holding the contents of
`dist/onetake.js` followed by your script. Start your screen recorder, then run the snippet
(Ctrl/Cmd + Enter). This works on any app you can open, including production.

### 3. Render a video automatically (frame by frame, 60 fps)
```bash
npm install                      # Playwright + a bundled ffmpeg
npx playwright install chromium
node tools/record.js --url http://localhost:3000 --script my-tour.js --out recordings
# or try the example:
npm run example
```

**How it works.** The recorder freezes the page's clock and advances it exactly one frame
(1/60 s) at a time. That covers timers, `requestAnimationFrame`, `Date`, `performance.now()`,
CSS transitions and animations, and Web Animations. After each step it takes a screenshot and
streams it into ffmpeg. Because of this:

- The video is perfectly smooth, with no dropped frames, however slow the machine is.
- The video plays at true speed even though rendering takes longer. Expect about 2–3× real time
  at 1280×760 and 3–5× at 1080p.
- `zoom()` is rendered by the camera itself: Chrome re-renders the zoomed area at full
  resolution, so text stays sharp instead of being enlarged pixels.

Useful flags:

- `--width 1920 --height 1080`: the viewport (default 1920×1080).
- `--scale 2`: 2× pixel density. A 1920×1080 layout comes out as a sharp 3840×2160 (4K) video.
- `--fps 60`: also 30, 120, …
- `--seed 42`: fixes the "random" cursor paths and typing rhythm, so every take is identical.
- `--script a.js --script b.js`: for flows that load a **new page**. Each script runs after the next page load, and the cursor carries over.
- `--storage auth.json`: start already logged in, using a Playwright `storageState` file.
- `--speed 1.5`: play the whole tour faster.
- `--format png`: lossless frame capture (slower). `--crf 12` raises the video quality.
- `--realtime`: Playwright's live 25 fps capture instead of frame-by-frame (faster to make, less smooth).
- `--headed`: watch the browser while it renders.

A script file is plain JS with a ready `take` variable in scope:
```js
// my-tour.js
take.caption('Creating an invoice').click('text=New invoice').type('label=Amount', '120');
```

### OneTake Studio: record by clicking
```bash
npm run studio -- --url http://localhost:3000 --out my-demo
```
A browser opens on your app with the OneTake toolbar on top:

| | |
|---|---|
| **● Record** | Use your app normally. Clicks, typing, selects, checkboxes and page loads become steps, each with the most stable selector available (test ids → `#id` → `label=` → `name` → `text=` → CSS path). Password fields are never recorded. |
| **✎ Mark** | Hover an element (↑ / ↓ for parent / child) and click it: **Zoom** (for N seconds, or until *Zoom out*), **Circle**, **Box**, **Underline**, **Arrow**, **Spotlight** or **Pulse**, with an optional label. |
| **💬 Caption · ⤢ Zoom out · ⏱ Wait** | Add narration, zoom back out, or pause. |
| **☰ Steps** | The timeline, grouped by page: edit typed values, labels, seconds and selectors; reorder; delete. Hover a step to see its element. |
| **Generate** | Writes one plain OneTake script per page load (`1-….js`, `2-….js`) plus `render.sh` into `--out`. Edit them by hand or with an AI. |
| **▶ Render** | Renders `videos/demo.mp4` (frame by frame, 60 fps) in a separate browser that starts signed in as you were. |

The session is saved to `<out>/studio.json` after every change, so you can close the studio and run the same
command later to carry on (`--new` starts over). Shortcuts: **Alt+R** record/pause, **Alt+M** mark, **Esc** cancel.
Rendering replays your steps in the app, so it creates the same records again.

### Apps behind a login
```bash
node tools/save-login.js --url http://localhost/login --until /dashboard --out demo/auth.json   # sign in once
node tools/record.js --url http://localhost/clients/create --storage demo/auth.json --script 1.js --script 2.js
```
For a ready-made setup, copy `templates/demo-kit/` next to your project, edit the CONFIG block of
`record.sh` and run `bash record.sh`.

### Let an AI make the video
Point any coding agent at this repo and your project and ask for a demo video. [`AGENTS.md`](AGENTS.md)
(also loaded as `CLAUDE.md` and summarised in `llms.txt`) walks it through picking a scenario from your
browser tests, signing in, mapping the DOM, writing the page scripts, rehearsing and rendering.
For Claude there's a ready skill in [`skills/onetake-demo-video/SKILL.md`](skills/onetake-demo-video/SKILL.md).

---

## Targeting elements

Every action takes a **target**:

| Form | Example | Finds |
|---|---|---|
| CSS selector | `'#save'`, `'.tabs button:nth-child(2)'` | `document.querySelector` |
| `text=` | `'text=Billing'` | Visible button/link/tab/label/heading whose text matches (exact first, then contains) |
| `label=` | `'label=Email'` | The form control for a `<label>`, `aria-label`, `placeholder` or `name` |
| Element | `document.getElementById('x')` | That element |
| Function | `() => rows[rows.length - 1]` | Whatever it returns |

OneTake **waits** for the target to exist and be visible (default up to 8 s), so it works
with SPA route changes, modals and data loaded from APIs. It also scrolls the target into
view smoothly before acting on it.

---

## API

All methods chain and run in order. The chain is also awaitable:
`await take.click('#a').type('#b', 'hi')`.

### Cursor & interaction
| Method | Notes |
|---|---|
| `moveTo(target \| {x, y}, opts?)` | Curved, eased, human-like path; long moves sometimes overshoot slightly, then correct. |
| `hover(target, { duration })` | Moves there and rests (triggers `mouseenter`/`over` and emulated `:hover`). |
| `click(target, opts?)` | Fires `pointerdown → mousedown → focus → pointerup → mouseup → click`, with a press animation and ripple. |
| `doubleClick(target)` | |
| `type(target, text, opts?)` | Clicks into the field, then types with variable rhythm. `opts`: `clear` (default true), `delay`, `typos`, `enter` (press Enter at the end). `\n` in the text presses Enter. |
| `clear(target)` | Empties a field. |
| `press(key, { times })` | `'Enter'` (submits the form), `'Tab'` (moves focus), `'Escape'`, `'Backspace'`, ... |
| `select(target, valueOrText)` | Native `<select>`. For custom dropdowns, use two `click()`s. |
| `check(target, state = true)` / `uncheck(target)` | Checkbox, radio or its label. Clicks only if the state needs to change. |
| `scrollTo(target \| y, { block })` / `scrollBy(dy, { container })` | Smooth scrolling. |
| `waitFor(target)` / `wait(ms)` | |
| `run(fn)` | Run your own code as a step (it may return a promise). Don't call chain methods inside it. |
| `showCursor()` / `hideCursor()` | |
| `set(opts)` | Change options mid-tour, e.g. `.set({ speed: 2 })`. |
| `stop()` / `destroy()` | Abort the tour / remove everything OneTake added. |

### Highlights
`highlight(target, { shape, ... })`, or the shortcuts:
`circle`, `box`, `underline`, `arrow`, `spotlight`, `pulse`.
Custom shapes can be registered on `OneTake.shapes`.

| Option | Default | |
|---|---|---|
| `color` | `#ef4444` | Stroke / label colour. |
| `label` | none | Callout text shown with the highlight. |
| `labelPosition` | `'auto'` | `'top' \| 'bottom' \| 'left' \| 'right'`. |
| `padding` | `10` | Space between the element and the shape. |
| `strokeWidth` | `4` | |
| `drawDuration` | `750` | How long the "pen stroke" takes to draw. |
| `duration` | `2600` | How long it stays. `0` keeps it until `clearHighlights()`. |
| `block` | `true` | Wait for `duration` before the next step. Set `false` to keep acting while it shows. |
| `from` | `'top-left'` | Arrow direction: `left`, `right`, `top`, `bottom`, `top-right`, ... |

Highlights follow their element while the page scrolls or resizes.

### Captions
`caption(text, { duration, position: 'bottom' | 'top' })` and `hideCaption()`.
Captions don't block: actions continue while one is visible.

### Camera zoom (Screen Studio style)
```js
take.zoom('#contact-form', 15)   // glide in, keep it framed for 15 s, glide back out
take.zoom('#chart')              // stay zoomed until zoomOut() or the next zoom()
take.zoom(8)                     // zoom in around the cursor for 8 s
take.zoomOut()                   // glide back to the full page
take.zoom('#table', 6, { scale: 2.5, follow: false, block: true })
```
- The zoom eases in on a spring (no linear or robotic motion) and frames the component with some padding.
- The **chain continues as soon as the zoom settles**, so the steps after it (typing, clicking) happen while zoomed in.
- While zoomed, the camera holds still as long as the cursor works inside the component.
  If the cursor heads somewhere else, the camera pans ahead of it so it stays in frame, the way a camera operator would.

| Option | Default | |
|---|---|---|
| `scale` | auto (fits the component, capped at `zoomScale` = 2) | Zoom level, e.g. `1.8`. |
| `padding` | `40` | Space (px) kept around the component. |
| `follow` | `true` | Pan to keep the cursor in frame. |
| `block` | `false` | Wait the whole duration (and the zoom-out) before the next step. |
| `smoothness` | `6.5` | Spring stiffness. Lower is floatier, higher is snappier. |

---

## Options

```js
new OneTake({
  speed: 1,               // global multiplier for every movement, pause and keystroke
  cursorSize: 28,
  cursorColor: '#111827', cursorOutline: '#ffffff',
  clickColor: 'rgba(59,130,246,.45)',
  highlightColor: '#ef4444',
  hideNativeCursor: true, // hides your real mouse pointer during the tour
  emulateHover: true,     // CSS :hover/:active rules react to the fake cursor
  sound: false,           // soft click and key sounds (for screen-recorded videos)
  typingDelay: 75, typingVariance: 0.55,
  typos: 0,               // e.g. 0.02 = occasionally mistype a letter and backspace
  overshoot: true,
  waitTimeout: 8000,
  startPosition: null,    // {x, y}
  zoomScale: 2,           // max auto zoom level for zoom()
  zoomSmoothness: 6.5,    // camera spring stiffness
  scrollBehavior: 'smooth', // 'smooth' (animated by OneTake), 'native' or 'instant'
  onStep: (name, args) => {}, onError: (err, step) => {}
});
```

---

## How it stays realistic

- **Movement** follows a cubic Bézier curve with a random bend, and uses a minimum-jerk
  speed profile (slow start, fast middle, gentle landing), the way human hand movements do.
  Longer distances take longer. The cursor lands near an element's centre, not exactly on it.
- **The cursor shape changes** automatically: arrow, hand over clickable things, I-beam over text fields.
- **Hover styles work.** Synthetic events can't trigger CSS `:hover`, so OneTake copies
  your `:hover`/`:active` rules to `.ot-hover`/`.ot-active` classes and applies them under the cursor.
- **Framework-friendly input.** Values are set through the native value setter, followed by
  `beforeinput` / `input` / `change` events, so React, Vue, Angular and Svelte controlled inputs update correctly.
- The overlay uses `pointer-events: none` and sits on the top layer, so it never blocks the real UI.

## Limitations

- In-page scripts stop when the browser loads a **new page**. Single-page apps are fine.
  For multi-page flows, use `tools/record.js` with several `--script` files.
- Native `<select>` menus can't be opened visually by script. The cursor clicks the select and the value changes.
- HTML5 drag-and-drop and cross-origin iframes aren't supported.
- Events are untrusted (`isTrusted === false`). Almost no apps check this, but a few
  (for example, some file pickers or clipboard actions) need a real user gesture.
- `:hover` emulation covers same-origin stylesheets only (CSS loaded from a CDN on another domain is skipped).
- Recorded videos have no audio. Add a voice-over or music in your editor, or use
  approach 1 or 2 with a screen recorder if you want the click sounds.
- Frame-by-frame mode controls everything that runs on the page's clock. Embedded `<video>`
  elements, GIFs and server-side timers still run in real time, and network requests take
  the time they take. Waits for an element to appear (`waitFor`, or any action) handle this.
- Live zoom (approaches 1 and 2) uses a CSS transform on `<body>`. If the page is scrolled,
  `position: fixed` elements such as sticky headers can shift while zoomed. The recorder's
  camera zoom doesn't have this problem.

## Tips for great demo videos

- Render at `--width 1920 --height 1080 --scale 2` for crisp 4K, or at `--scale 1` for faster renders.
- Use `--seed` while you iterate, so each new render differs only in what you changed.
- Zoom in on the component you're about to fill in, and zoom out before switching sections.
- Seed your demo data first, with a `run()` step or a fixture account, so every take looks identical.
- Keep `speed` at 1 when recording, and speed up in post if needed. Use `speed: 4` while you're writing the script.
- Use `caption()` for narration instead of voice-over when you need quick localised versions.

## Development

```bash
npm install
npx playwright install chromium
npm run build      # src/*.js → dist/onetake.js
npm test           # build + play the example end to end
npm run example    # render the example tour to recordings/
```

Each feature lives in its own `src/NN-name.js` file and plugs in through `feature({ defaults, css, init, mount, step, stop, destroy })`
plus methods on the prototype. The files are concatenated in name order, so a module can use anything defined in an earlier one.
Edit `src/`, never `dist/onetake.js`, and run `npm run build`.

## License

MIT
