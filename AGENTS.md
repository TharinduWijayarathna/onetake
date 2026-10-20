# AGENTS.md — making a demo video for a project with OneTake

This file is for AI coding agents (Claude, Codex, Cursor, Copilot, Gemini, …). It explains how to turn
a running web app into a polished product-demo video: a human-looking cursor drives the real UI, the
camera zooms in on what matters, hand-drawn highlights and captions guide the viewer, and the
recorder renders it frame by frame to a 60 fps MP4.

If you only read one section, read **The workflow** and **Gotchas**.

---

## What you produce

A **demo kit**: a folder that sits **next to** the target project (never inside its repo):

```
<project>-demo/
├── record.sh          # one command that renders the video (copied from templates/demo-kit/)
├── 1-<page>.js        # one OneTake script per page load, in order
├── 2-<page>.js
├── 3-<page>.js
├── README.md          # what the demo shows and how to render it
├── auth.json          # saved login (created by record.sh, private, never commit)
└── videos/<name>.mp4  # the output
```

## The workflow

### 1. Understand the project and pick a scenario

- Find the app's **existing browser / end-to-end tests**. They are the best map of real user flows, the
  selectors that work, and the quirks of custom widgets:
  Laravel Dusk `tests/Browser/`, Playwright `tests/` or `e2e/`, Cypress `cypress/e2e/`, Capybara
  `spec/system/`, Selenium, etc. Read their helpers / page objects too.
- List the flows they cover and pick **one scenario that tells a story** in 45–90 seconds: a core
  task a new user would do first (e.g. "create a client → create an inquiry → see the result").
  If the user didn't choose, pick it yourself and say which one you picked and why.
- Read the routes and the templates for the pages involved.

### 2. Make sure you can reach the app and sign in

- The app must be running and reachable from the browser that will render the video (usually the
  user's own machine: `http://localhost…`). Check with `curl`.
- Sign-in: **never guess or type real passwords**. Prefer, in order:
  1. a saved session: `node tools/save-login.js --url <login page> --out <kit>/auth.json` opens a window
     and the **user** signs in once (this is what `record.sh` does automatically);
  2. a test account the project itself documents for local development (seeders, fixtures, `.env.example`),
     only on a local development host;
  3. ask the user.
- If pages render unstyled, the asset pipeline isn't serving (e.g. Laravel `public/hot` pointing at a Vite
  dev server that isn't running). Use built assets (`npm run build`) or start the dev server. Ask before
  changing anything in the project.

### 3. Map the live DOM before writing the script

Open each page of the scenario and record, for every control you'll touch:
- a **stable selector**: `#id`, `[name=…]`, `[data-testid=…]`, `[dusk=…]`, `label=Field label`, or `text=Button text`;
- how custom widgets work (comboboxes, date pickers, rich text, uploads). Copy the approach from the
  project's browser tests: they already solved it;
- the **sections** of each form (good zoom targets) and where page loads happen (each one ends a script).

### 4. Write one script per page load

> If a person is available to click through the flow, **OneTake Studio** can write these scripts for you:
> `node tools/studio.js --url <start page> --out <kit>`. They press ● Record, use the app, mark zooms and
> highlights, then Generate. You can then polish the generated scripts (captions, timing, function targets
> for anything fragile, such as date-picker cells recorded as CSS paths).


Each script is plain JavaScript with a ready `take` (a `OneTake` instance) in scope. Template:
`templates/demo-kit/1-page.js`. A good page script:

```js
take
  .caption('One sentence that tells the viewer what is happening.')
  .zoom('form', 12)                  // zoom on the component you'll work in, for 12 s
  .type('label=Client name', 'Emma Clarke')
  .select('label=Country', 'United Kingdom')
  .check('text=Subscribe to newsletter')
  .zoomOut()
  .box('button[type=submit]', { label: 'Save', duration: 1400 })
  .click('button[type=submit]');     // navigates → the next script continues on the new page
```

Storytelling rules that make demos look professional:
- **Zoom on the section you're working in**, then move to the next section; zoom out between pages.
- Use **captions** for narration (1 short sentence, a few per video), not for every step.
- Use **one highlight per idea**: circle a result, box the button before clicking it, arrow to the next step.
- Use **realistic data** (names, emails, amounts) that fits the product. Never real customer data.
- End on the result (the record that was created) and point at the next step in the product.

### 5. Rehearse fast, then render

1. **Rehearse** in a browser on the real app: load `dist/onetake.js` into the page, then run the script with
   `new OneTake({ speed: 3 })`, and check every step ran (`onStep` / `onError` options). Fix selectors.
2. **Render**: `bash record.sh` in the demo kit (or call `tools/record.js` directly, see below).
   The recorder runs the page on a virtual clock, steps it 1/60 s per frame and screenshots each frame,
   so the video is perfectly smooth. Expect render time of ~2–3× the video length at 1440×900 @1×,
   ~3–6× at @2×.
3. **Check the video**: extract a few frames (`ffmpeg -ss 10 -i video.mp4 -frames:v 1 f.png`) and look at
   them: zoom framing, highlights, captions, final state.

Each run performs real actions in the app (creates records). Tell the user what data it creates.

---

## API cheat sheet

Targets: CSS selector · `text=Visible text` (exact match first, then the shortest element containing it) ·
`label=Field label` (also matches `aria-label`, `placeholder`, `name`) · an element · a function returning one.
Every action waits up to `waitTimeout` (8 s) for its target to exist and be visible, and scrolls it into view.

| Method | Notes |
|---|---|
| `moveTo(target \| {x,y})`, `hover(target, {duration})` | human-like curved movement |
| `click(target)`, `doubleClick(target)` | real pointer/mouse events, ripple |
| `type(target, text, {clear, delay, typos, enter, click})` | `click: false` to type into an already-focused field |
| `clear(target)`, `press(key, {times})` | Enter submits, Tab moves focus |
| `select(target, valueOrText)` | native `<select>` only; custom dropdowns: `click` the trigger, then the option |
| `check(target, state=true)`, `uncheck(target)` | checkbox / radio / its label; clicks only if needed |
| `scrollTo(target \| y)`, `scrollBy(dy, {container})` | |
| `zoom(target, seconds?, {scale, padding, follow, block})` | `zoom(8)` zooms around the cursor; no seconds = until `zoomOut()` |
| `zoomOut()` | |
| `circle / box / underline / arrow / spotlight / pulse(target, opts)` | `label`, `color`, `duration` (0 = until `clearHighlights()`), `block`, `padding`, `from` (arrow) |
| `caption(text, {duration, position})`, `hideCaption()` | non-blocking |
| `wait(ms)`, `waitFor(target)` | |
| `run(fn)` | custom code as a step; `fn(take)` may be async; don't call chain methods inside it (use `take._approach(el)` + `take._clickAt(el)` for a click inside a loop) |
| `set(opts)`, `showCursor()`, `hideCursor()`, `stop()`, `destroy()` | |

Options: `new OneTake({ speed, typingDelay, typos, zoomScale, highlightColor, cursorSize, sound, waitTimeout, onStep, onError })`.

## Studio

`node tools/studio.js --url <url> [--out dir] [--storage auth.json] [--width 1440 --height 900] [--new] [--headless]`
opens a recording browser with the OneTake toolbar. Steps live in `<out>/studio.json` (resumable); Generate writes
`NN-<page>.js` + `render.sh`; Render runs the recorder with the studio's login. `startStudio(opts)` is exported for
automation (see `test/studio.js`). Recorded selectors prefer test ids → `#id` → `label=` → `name` → `text=` → CSS path.

## Recorder

```bash
node tools/record.js --url <first page> --script 1.js --script 2.js --script 3.js \
  [--storage auth.json] [--width 1440 --height 900] [--scale 2] [--fps 60] [--seed 7] \
  [--out dir] [--name file] [--realtime] [--headed] [--max 900]
```
- `--script` repeated = one script per page load; the cursor position carries over.
- `--seed` makes cursor paths and typing rhythm identical between takes.
- `--storage` = Playwright storageState from `tools/save-login.js`.
- `--realtime` = fast 25 fps preview without the virtual clock.
- In frame mode `window.__OT_CAMERA === 'external'`: zoom is rendered by the recorder (sharp), not by CSS.

---

## Gotchas (learned the hard way)

- **Pop-ups inside a live zoom.** In live (non-recorder) mode, zoom is a CSS transform on `<body>`, so date
  pickers / dropdowns positioned with `position: fixed/absolute` can land in the wrong place. Before opening
  one, `if (window.__OT_CAMERA !== 'external') take.zoomOut();`. In the recorder this isn't needed.
- **`text=` is a partial match.** `text=INQ` will happily match a sidebar link "Inquiries". Use an exact
  function target for anything ambiguous: `() => [...document.querySelectorAll('h2')].find(e => /^INQ\d+$/.test(e.textContent.trim()))`.
- **Hidden inputs** (custom selects keep the value in `<input type=hidden>`) can't be clicked: target the
  visible trigger, type in its search box with `{ click: false }`, then click the option element.
- **Date pickers**: pick dates in a future month (past days are often disabled); page the calendar with its
  next button in a `run()` loop; range pickers usually need the end input clicked separately; close the
  picker afterwards (many listen for `mousedown` on `document`, not `click`).
- **Re-runs**: scripts create real records. Check unique constraints (emails, slugs) before relying on fixed
  values, or generate a suffix.
- **Numbers get formatted** by masked inputs (`1500` → `1,500`). Assert on what the app shows, not what you typed.
- **One script per page load.** Anything after a navigating click is lost; put it in the next script.
- **Keep the target project clean.** Put the kit outside the repo; if you must serve files from the app
  (e.g. to rehearse in its pages), use an already-gitignored folder and say so. Don't change dependencies.
- **Browsers that can reach the app**: the recorder runs where `node` runs. If the app is on the user's
  `localhost` and you work in a sandbox that can't reach it, hand the user `bash record.sh` instead of
  pretending to render.

## Working on OneTake itself

`src/NN-*.js` are the library modules (bundled to `dist/onetake.js` by `npm run build`); `tools/` is the
recorder; `npm test` builds and plays the example end to end. Edit `src/`, never `dist/` by hand.
