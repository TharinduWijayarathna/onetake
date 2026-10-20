---
name: onetake-demo-video
description: Create a polished product demo video of a web app with OneTake (scripted human-like cursor, real UI actions, camera zoom, highlights, captions, 60 fps render with frame, cards, sound, subtitles and chapters). Use when asked to make a demo, walkthrough, product video or GIF of a project.
---

# Make a demo video of a web app with OneTake

OneTake (https://github.com/TharinduWijayarathna/one-take) drives a real web app with a
human-looking cursor and trusted input, zooms the camera on what matters, draws highlights
and captions, and renders frame by frame to a 60 fps MP4. You write one tour script; the
recorder does the rest, including tours that cross page loads. Every take is identical
(the randomness is seeded and the clock is virtual).

**Deliverable**: a demo kit next to (never inside) the project, plus the rendered video:
`<project>-demo/{onetake.config.js, tour.js, steps.js, record.sh, README.md, videos/demo.mp4}`.

## 1. Get OneTake and the kit

- Use an existing clone if there is one (look next to the project, e.g. `../one-take`), or
  `git clone https://github.com/TharinduWijayarathna/one-take.git`. Inside it, run
  `npm install && npx playwright install chromium`.
- The CLI is `node <one-take>/tools/cli.js` (`onetake` below). `onetake help` lists every flag.
- Copy `<one-take>/templates/demo-kit/` to `<project>-demo/`. For details beyond this skill,
  read `<one-take>/AGENTS.md` and `<one-take>/docs/` (api.md, targets.md, recipes.md,
  troubleshooting.md).

## 2. Pick the scenario from the project's own browser tests

- Find end-to-end tests (Laravel Dusk `tests/Browser`, Playwright `tests|e2e`, Cypress
  `cypress/e2e`, Rails `spec/system`, …) and their page objects and helpers. List the flows
  they cover.
- Choose one flow that tells a story in 45–90 s: a core first task (create X → do Y → see
  the result). If the user didn't choose, pick it and say why. Read the routes and templates
  of those pages.

## 3. Reach the app and sign in

- The app must be reachable from where the recorder runs (usually the user's machine).
  `curl` it.
- **Never guess or type passwords.** Set `LOGIN_PATH` (and `AFTER_LOGIN`) in `record.sh`, so
  the user signs in once in a window it opens (`onetake login`, saved to `auth.json`).
  Alternatively, use a demo account the project documents for local dev (seeders,
  `.env.example`), on a local host only, or ask the user.
- Unstyled pages mean the asset pipeline isn't serving (e.g. Laravel `public/hot` → a
  stopped Vite). Use built assets or start the dev server; ask before changing the project.
- If your sandbox can't reach the user's localhost, prepare the kit, check what you can in a
  browser that can reach it (if you have one), and hand the user `bash record.sh`. Never
  claim a render you couldn't run.

## 4. Map the live DOM

For each control in the flow, pick the best target, in this order:
`role=button[name="Save"]` · `text=Save` (exact, must be unique) · `label=Email` (form fields) ·
test ids (`[data-testid]`, `[dusk]`) · CSS. Scope ambiguous ones: `'#card-3 >> text=Open'`,
`'tbody tr >> nth=2 >> text=Edit'`. Note custom widgets (copy the test helpers' approach),
the components worth zooming on, and where page loads happen. In a browser console,
`OneTake.query('…')` says whether a target is unique.

## 5. Write the tour

Edit `onetake.config.js` (url, viewport, name, frame title, intro/outro text) and `tour.js`.
`take` is in scope, and one script covers the whole flow across page loads:

```js
take
  .chapter('New client')
  .caption('Let’s add a client and send them an inquiry.', { duration: 2600 })
  .click('role=link[name="Clients"]')
  .click('text=New client')
  .expect('role=heading[name="New client"]')          // fail loudly, every time state changes
  .zoom('form', 14)                                   // the component you work in
  .type('label=Name', 'Emma Clarke')
  .type('label=Email', 'emma@clarke.example')
  .click('label=Country').click('role=option[name="United Kingdom"]')   // custom dropdown
  .box('role=button[name="Save"]', { label: 'Save', duration: 1400 })
  .click('role=button[name="Save"]')                  // page load: the tour continues
  .expect('text=Client created')
  .chapter('Result')
  .circle('text=Emma Clarke', { label: 'Your new client' })
  .thumbnail()
  .wait(1200);
```

Key API:
- Actions: `click`, `doubleClick`, `type(t, text, {clear, click, enter})`, `clear`,
  `press('Enter' | 'Tab' | 'ControlOrMeta+K')`, `select` (native only), `check`/`uncheck`,
  `drag(src, dst, {to: {x, y}})`, `upload(t, 'file.pdf' | {name, content}, {drop})`.
- Scrolling: `scrollTo`, `scrollBy`, `scrollUntil(t, {container})` for virtual lists.
- Waiting: `expect(t, {text, value, visible, count, checked, enabled})`, `expectUrl`,
  `waitFor`, `wait(ms)` (pacing only).
- Storytelling: `zoom(t, seconds?, {scale})`, `zoom(seconds)`, `zoomOut`,
  `circle|box|underline|arrow|spotlight|pulse(t, {label, duration, color, from})`,
  `caption(text, {duration, position})`, `hideCaption`, `chapter(title)`, `thumbnail()`.
- Control: `run(async take => …)` (don't queue steps inside it), `set(opts)`, `use(fn, …args)`.
- Reusable steps go in `steps.js`: `OneTake.define('name', (take, …args) => { … })`.

Actions already wait for their element (visible, enabled, not moving, not covered) and for
the app to settle (no requests or DOM changes for 200 ms). Don't add `wait()` to wait for the
app; use `expect()`.

Make it look professional:
- zoom per component, and let it end before moving elsewhere (or `options: { autoZoom: true }`);
- a few one-sentence captions;
- one highlight per idea: box before the key click, circle the result, arrow to the next step;
- chapters for each part;
- realistic fake data, ending on the created result.

## 6. Check, render, look

1. **Check**: `CHECK_ONLY=1 bash record.sh`, or `onetake check --speed 4` in the kit. It
   lists every step. On failure, it gives the step, the line and the reason ("covered by …",
   "matches 3 elements", "its text is …"), plus `videos/check.failure.png` and `.html`. Read
   the screenshot, fix, and repeat until it passes. `--watch` re-runs it on save.
2. **Render**: `bash record.sh`. For a quick preview, add `--scale 1 --fps 30`. Useful flags:
   `--now 2026-11-02T09:00` (stable dates), `--frame <bg> --title …`, `--intro "T|S"`,
   `--outro "T|S"`, `--sound`, `--music file`, `--formats mp4,gif`, `--aspect 9:16`,
   `--auto-zoom`, `--timeline`.
3. **Look** at a few frames before calling it done:
   `ffmpeg -ss 10 -i videos/demo.mp4 -frames:v 1 f.png`. Check the zoom framing,
   highlights, captions and the final state.
4. **Report**: the video and its extra files (`.srt`/`.vtt`, `.chapters.txt`, `.jpg`), and
   which records each run creates in the user's app. Write the kit's `README.md` with how to
   re-render.

## Gotchas

- `text=` is exact and strict. When it matches several elements, scope it or use `nth=`.
  `text*=` is "contains" (the shortest match).
- `label=` is for form fields. For icon buttons with an `aria-label`, use
  `role=button[name="…"]`.
- Custom selects keep the value in a hidden input: click the trigger, then the
  `role=option`.
- Date pickers: use `--now` for a stable calendar, scope the day
  (`'.datepicker.active >> text=15'`), avoid disabled dates.
- Masked inputs reformat values (`1500` → `1,500`). Expect what the app shows.
- Re-runs create records and unique fields can clash. Reset the demo data first, or see
  `docs/recipes.md`. `Math.random` and `Date` are seeded and frozen in the recorder.
- Code outside the chain runs again after every page load. Keep it side-effect free.
- Cross-origin iframes (Stripe, YouTube) can't be scripted. Same-origin ones can:
  `'#frame >> label=Card'`.
- In live mode (the library without the recorder), zoom is a CSS transform: zoom out before
  pop-ups. The recorder doesn't need this.
- Keep the project repo clean: the kit lives outside it, `auth.json` stays private.
