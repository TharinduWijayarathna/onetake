# Troubleshooting

Start with `onetake check`. It runs in seconds, prints every step with its line, and saves a
screenshot and the HTML of the page when something fails.

## Error messages

Every failed step reads `step N name("argument") at file:line: reason`.

### `element not found: <target>` / `element is not visible: <target>` (waited 8 s)

Nothing (visible) matched while the step waited.

- Open `check.failure.png`. Is the tour on the page you think it is? A step before it may
  have done something else, so add an `expect()` after it.
- Exact text wins: if a page has both "Save" and "Save changes", `text=Save` is the first.
  When nothing matches exactly, `text=` falls back to "contains". Check the spelling, or use
  `role=button[name*="Save"]`.
- The element may be in a cross-origin iframe (can't be scripted), or in a closed shadow root.
- Slow page? `{ timeout: 20000 }` on the step, or a higher `waitTimeout`.

### `"text=Open" matches 3 elements: …`

`text=`, `label=` and `role=` must be unique (the error lists up to four of the matches). Scope the target (`'#card-3 >> text=Open'`),
pick one (`'text=Open >> nth=0'`), or use `text*=` to take the shortest match.
See [Targets](targets.md#strict-matching).

### `cannot click <x>: it is covered by <y> (waited 8 s)`

Something stays on top of the element: a modal backdrop, a toast, a cookie banner, a sticky
header, a loading overlay. Close it in the tour, wait for it to go
(`.expect('.overlay', { visible: false })`), or scroll differently. `{ force: true }` clicks
anyway, but the click then lands on the covering element.

### `cannot click <x>: it is disabled`

The button is `disabled` or `aria-disabled`. Usually a required field is still empty, or
validation failed. Check the screenshot.

### `cannot click <x>: it is still moving`

The element is animating and never stops (a carousel, a marquee). Use `{ force: true }`, or
pause the animation in a `run()` step.

### `cannot click <x>: it was removed from the page`

The app replaced the element while the cursor was on its way, and OneTake couldn't find a
new one. This happens with element and function targets, which can't be looked up again.
Use a string target.

### `expected … to contain text "…", but its text is "…"`

The app did something different from what the tour expected. The message shows what it
found. Masked inputs format numbers (`1500` → `1,500`), so compare with what the app shows.

### `scrolled to the end but never found …` / `scrolled 40 times without finding …`

For a virtual list, use a smaller `step` than the rendered window, and check the
`container`. For a very long list, raise `maxScrolls`.

### `OneTake.select: target is not a <select>`

Custom dropdown. Click the trigger, then the option. See
[Recipes](recipes.md#custom-dropdowns).

### `upload: file not found: …`

Upload paths are relative to the **tour script**, not the current folder.

### `Unknown option --x`

`onetake help` lists the flags. Config keys are camelCase (`musicVolume`), flags are
kebab-case (`--music-volume`).

### `stopped at the --max limit (900s)`

The tour ran longer than `max` seconds of video. It's usually stuck on something. Check
the timeline (`--timeline`) or run `check`.

## The video

**The video shows the wrong page or a login screen.** The saved session expired. Run
`onetake login` again.

**Pages are unstyled.** The app's assets aren't being served. For example, a Vite dev
server isn't running, or Laravel's `public/hot` points at one. Build the assets, or start the
dev server.

**Fonts look different from my browser.** Headless Chromium uses the fonts installed on the
machine. Install the app's fonts, or load them as web fonts. The recorder waits for
`document.fonts.ready` before it starts.

**Text is blurry.** Render at `--scale 2`. A window frame scales the page down, so it needs
the extra pixels most.

**The cursor moves too fast or too slow.** `speed` changes everything at once. For one
move: `.moveTo('#x', { duration: 1200 })`. For typing: `typingDelay`.

**Something animates in real time while the rest is smooth.** It runs outside the page's
clock: a Web Worker, a cross-origin iframe, a canvas driven by WebSocket data, or audio.
See [Capture modes](recording.md#frame-by-frame-default). `--realtime` records it as it is.

**The app breaks only in frame mode.** A few apps measure real elapsed time, for example to
detect a "slow network". Try `--realtime` to confirm, and tell us about it. Usually setting
`--now` or the seed sorts it out.

**Rendering is slow.** About 1–3× the video length at 1440×900, 3–6× at `--scale 2`.
`--fps 30` halves the frames, `--scale 1` quarters the pixels. Use `check` while you iterate.

**`ffmpeg` not found.** `npm install` normally brings one (`ffmpeg-static`). Otherwise
install it (`brew install ffmpeg`, `apt install ffmpeg`) or set `FFMPEG_PATH`.

**"Chromium for OneTake isn't installed yet" / Chromium won't start.** Run `npx onetake setup`.
It installs the build that matches OneTake's Playwright version. On Linux, add `--with-deps` to
install the system libraries too. Or point `CHROMIUM_PATH` at a Chromium.

## Live mode

**Clicks don't do anything.** The app may check `event.isTrusted`. This is rare, but some
file pickers, clipboard actions and payment widgets need a real user gesture. Use the
recorder, which sends trusted input.

**Hover styles don't show.** Stylesheets from another origin (a CDN) can't be read, so their
`:hover` rules can't be emulated. The recorder uses the real mouse, so this only affects
live mode.

**A pop-up appears in the wrong place while zoomed.** Live zoom is a CSS transform on
`<body>`. Zoom out before opening it:
`if (window.__OT_CAMERA !== 'external') take.zoomOut()`. The recorder isn't affected.

**The tour stops after a page load.** In live mode, a page load ends the script. Use the
recorder, or split the tour by page.
