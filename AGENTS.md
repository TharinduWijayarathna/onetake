# AGENTS.md: making a demo video of a project with OneTake

This file is for AI coding agents (Claude, Codex, Cursor, Copilot, Gemini, …). It explains how
to turn a running web app into a polished product demo video. A human-looking cursor drives
the real UI, the camera zooms in on what matters, hand-drawn highlights and captions guide
the viewer, and the recorder renders it frame by frame to a 60 fps MP4 with a window frame,
title cards, sound, subtitles and chapters.

If you only read two sections, read **The workflow** and **Gotchas**. The full documentation
is in [`docs/`](docs/README.md).

---

## What you produce

A **demo kit**: a folder that sits **next to** the target project, never inside its repo.
Start it from `templates/demo-kit/`:

```
<project>-demo/
├── onetake.config.js   # url, viewport, output: frame, intro/outro, sound…
├── tour.js             # the tour: one script, any number of page loads
├── steps.js            # reusable steps (OneTake.define) shared by tours
├── record.sh           # one command: sign in if needed, check, render
├── README.md           # what the demo shows, what data it creates, how to render it
├── auth.json           # saved login (created by record.sh; private, never commit)
└── videos/demo.mp4     # + demo.srt/.vtt, demo.chapters.txt, demo.jpg
```

## The workflow

### 1. Understand the project and pick a scenario

- Find the app's **existing browser / end-to-end tests**. They are the best map of real user
  flows, of selectors that work, and of how custom widgets behave: Laravel Dusk
  `tests/Browser/`, Playwright `tests/` or `e2e/`, Cypress `cypress/e2e/`, Capybara
  `spec/system/`, Selenium, and so on. Read their helpers and page objects too.
- Pick **one scenario that tells a story** in 45–90 seconds: a core task a new user would do
  first ("create a client → create an inquiry → see the result"). If the user didn't choose,
  pick it yourself and say which one you picked and why.
- Read the routes and the templates for the pages involved.

### 2. Reach the app and sign in

- The app must be reachable from the machine that renders the video (usually the user's:
  `http://localhost…`). Check with `curl`.
- Sign-in: **never guess or type real passwords**. In order of preference:
  1. a saved session: `onetake login --url <login page> --until <after-login regex> --out auth.json`.
     A browser window opens and **the user** signs in once. `record.sh` does this when
     `LOGIN_PATH` is set.
  2. a demo account that the project itself documents for local development (seeders,
     fixtures, `.env.example`), on a local host only;
  3. ask the user.
- If pages render unstyled, the asset pipeline isn't serving (for example, Laravel
  `public/hot` points at a Vite dev server that isn't running). Use built assets or start the
  dev server. Ask before changing anything in the project.

### 3. Map the live DOM

For every control the scenario touches, note:
- the best **target**, in this order: `role=button[name="Save"]`, `text=Save`,
  `label=Email`, test ids (`[data-testid=…]`, `[dusk=…]`), then CSS;
- how custom widgets work (comboboxes, date pickers, rich text, uploads). Copy the approach
  from the project's browser tests;
- the **components** worth zooming on (a form, a card, a table);
- where page loads happen. They're fine, just know where they are.

`OneTake.query('…')` in the browser console tells you whether a target is unique.

### 4. Write the tour

`tour.js` is plain JavaScript with a ready `take` in scope. One script covers the whole
scenario, even across page loads: after a load, the recorder re-injects OneTake and carries
on with the next step.

```js
take
  .chapter('New client')
  .caption('Let’s add a client and send them an inquiry.', { duration: 2600 })
  .click('role=link[name="Clients"]')
  .click('text=New client')
  .expect('role=heading[name="New client"]')
  .zoom('form', 14)                                    // the component you work in
  .type('label=Name', 'Emma Clarke')
  .type('label=Email', 'emma@clarke.example')
  .click('label=Country').click('role=option[name="United Kingdom"]')   // custom dropdown
  .box('role=button[name="Save"]', { label: 'Save', duration: 1400 })
  .click('role=button[name="Save"]')                   // page load: fine
  .expect('text=Client created')                       // fail loudly
  .chapter('Inquiry')
  .click('text=New inquiry')
  // …
  .circle('text=INQ-0042', { label: 'Your new inquiry' })
  .thumbnail()
  .wait(1200);
```

Storytelling rules that make demos look professional:
- **Zoom on the component you're working in**, then let the zoom end before moving
  elsewhere. Or set `options: { autoZoom: true }` for form-heavy tours.
- **Captions** for narration: one short sentence, a few per video.
- **One highlight per idea**: circle a result, box the button before clicking it, arrow to
  the next step.
- **Chapters** for each part of the story.
- **`expect()` after every step that should change something.** A tour that silently does
  the wrong thing renders a wrong video.
- **Realistic data** (names, emails, amounts) that fits the product. Never real customer data.
- **End on the result**, hold a second, and mark the thumbnail.

Put repeated sequences in `steps.js` with `OneTake.define('name', (take, …args) => { … })`.

### 5. Check, render, look

1. **Check**: `onetake check --speed 4` (or `CHECK_ONLY=1 bash record.sh`). It plays the tour
   in seconds with step-by-step output. On failure, it names the step and line, says why
   ("covered by <div.modal-backdrop>", "matches 3 elements", "its text is …"), and saves
   `check.failure.png` and `.html`. Fix and repeat until it passes.
2. **Render**: `bash record.sh` (or `onetake record`). Expect 1–3× the video length at
   1440×900, 3–6× at `scale: 2`. For quick previews, use `--scale 1 --fps 30`.
3. **Look at it**: extract a few frames (`ffmpeg -ss 10 -i videos/demo.mp4 -frames:v 1 f.png`)
   and check the zoom framing, highlights, captions and final state. With `--timeline`, the
   JSON shows when every step happened.
4. **Tell the user** what data each run creates in their app.

---

## API cheat sheet

**Targets**: `text=Exact text` (unique, case-insensitive) · `text*=contains` (shortest match) ·
`label=Field` (label, aria-label, placeholder, name) · `role=button[name="Save"]` ·
CSS (first match) · `A >> B` (B inside A, also through iframes) · `>> nth=1` · an element ·
a function. `text=`/`label=`/`role=` fail when they're ambiguous. Open shadow roots are
searched automatically.

**Waiting is built in.** Every action waits (up to `waitTimeout`, 8 s) for its element to be
visible, enabled, still and uncovered, then waits for the app to settle (no requests or DOM
changes for 200 ms). Don't add `wait()` to wait for the app. Use `expect()`.

| Step | Notes |
|---|---|
| `click(t)`, `doubleClick(t)` | trusted clicks with the recorder |
| `type(t, text, {clear, click, enter, delay})` | clears first by default. `click: false` types into the focused element |
| `clear(t)`, `press(key, {times})` | `'Enter'`, `'Tab'`, `'Escape'`, `'ControlOrMeta+K'` |
| `select(t, valueOrText)` | native `<select>` only. Custom dropdowns: click the trigger, then `role=option[name=…]` |
| `check(t, state?)`, `uncheck(t)` | clicks only when needed |
| `drag(src, dst, {to: {x, y}})` | kanban, sortable lists, sliders (`to` = fractions inside dst) |
| `upload(t, 'file.pdf' \| [..] \| {name, content}, {drop})` | paths relative to the tour. No OS dialog |
| `scrollTo(t \| y)`, `scrollBy(dy, {container})`, `scrollUntil(t, {container})` | `scrollUntil` for virtual lists |
| `expect(t, {text, value, visible, count, checked, enabled, timeout})` | waits until true, otherwise fails with what it found |
| `expectUrl(str \| re)`, `waitForUrl(…)`, `waitFor(t)`, `wait(ms)` | |
| `zoom(t, seconds?, {scale, padding, follow, block})`, `zoom(seconds)`, `zoomOut()` | |
| `circle / box / underline / arrow / spotlight / pulse(t, {label, color, duration, block, from})` | `duration: 0` keeps it until `clearHighlights()` |
| `caption(text, {duration, position})`, `hideCaption()` | non-blocking; become subtitles |
| `chapter(title)`, `thumbnail()` | chapter markers and list; thumbnail frame |
| `run(async take => …)` | custom code. Don't queue steps inside it |
| `set(opts)`, `use(fn, …args)`, `OneTake.define(name, fn)` | |

Options: `speed`, `waitTimeout`, `typingDelay`, `typos`, `autoZoom`, `zoomScale`,
`highlightColor`, `cursorIdle`, `settle`, `onStep`, `onError` ([docs/api.md](docs/api.md#options)).

## Recorder cheat sheet

```bash
onetake init | check | record | login        # node <one-take>/bin/onetake.js … from a clone
onetake record tour.js --url http://localhost:3000 --storage auth.json \
  --width 1440 --height 900 --scale 2 --now 2026-11-02T09:00 \
  --frame ocean --title "Acme" --intro "Acme|Managing clients" --outro "Try Acme|acme.example" \
  --sound --formats mp4,gif --aspect 9:16 --name demo --out videos
```

`onetake.config.js` holds the same keys ([docs/recording.md](docs/recording.md)). The defaults
are identical takes (`seed: 7`), frame-by-frame at 60 fps, 1920×1080 at scale 1, subtitles,
chapters and a thumbnail. `--realtime` gives a fast live screencast. `--watch` re-runs on save.
v1-style `--script a.js --script b.js` (one file per page) still works.

---

## Gotchas (learned the hard way)

- **Ambiguous text.** `text=Open` fails if three cards have an Open button. Scope it:
  `'#card-3 >> text=Open'` or `'role=row[name*="INQ-0042"] >> text=Open'`.
- **Custom selects** keep the value in a hidden input. Drive the visible trigger and the option.
- **Date pickers**: use `--now` so the calendar is the same every take, scope the day to the
  open calendar (`'.datepicker.active >> text=15'`), and use a date that isn't disabled.
- **Masked inputs** reformat values (`1500` → `1,500`). Expect what the app shows.
- **Re-runs create records.** Unique fields (emails, slugs) can clash. Reset the demo data at
  the start, or see [docs/recipes.md](docs/recipes.md#re-running-tours-that-create-records).
  The recorder seeds `Math.random`, and `--now` fixes `Date`.
- **Code outside the chain runs again on every page load.** Keep it side-effect free, or put
  it in `run()`.
- **Cross-origin iframes** (Stripe, YouTube) can't be scripted. Same-origin ones can:
  `'#frame >> label=Card'`.
- **Live zoom** (the library on its own, not the recorder) is a CSS transform. Zoom out
  before opening pop-ups: `if (window.__OT_CAMERA !== 'external') take.zoomOut()`.
- **Keep the target project clean.** Put the kit outside the repo. If you must serve files
  from the app, use an already-gitignored folder and say so. Don't change its dependencies.
- **Where the recorder runs.** It runs where `node` runs. If the app is on the user's
  `localhost` and your sandbox can't reach it, hand the user `bash record.sh` instead of
  pretending to render.

## Working on OneTake itself

`src/library/NN-*.js` are the library modules (bundled to `dist/onetake.js` by `npm run build`).
`src/recorder/` holds the recorder, CLI and renderer (entry: `bin/onetake.js`), and `types/` the TypeScript types. `npm test`
runs the build, the unit tests and the smoke test; `npm run test:compat`,
`npm run test:record` and `npm run test:visual` run the rest. Edit `src/library/`, never `dist/` by
hand. Keep `docs/`, this file, `llms.txt` and `skills/` in step with the code. See
[docs/contributing.md](docs/contributing.md).
