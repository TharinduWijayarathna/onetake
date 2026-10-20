---
name: onetake-demo-video
description: Create a polished product demo video of a web app with OneTake (scripted human-like cursor, real UI actions, camera zoom, highlights, 60 fps render). Use when asked to make a demo, walkthrough or product video of a project.
---

# Make a demo video of a web app with OneTake

OneTake (https://github.com/TharinduWijayarathna/one-take) drives a real web app with a human-looking
cursor, zooms the camera on what matters, draws highlights and captions, and renders the result
frame by frame to a 60 fps MP4. You write small JavaScript "page scripts"; the recorder does the rest.

The deliverable is a **demo kit** next to (never inside) the project, plus the rendered video:
`<project>-demo/{record.sh, 1-*.js, 2-*.js, …, README.md, videos/<name>.mp4}`.

## 1. Get OneTake

Use an existing clone if there is one (look next to the project, e.g. `../one-take`), otherwise
`git clone https://github.com/TharinduWijayarathna/one-take.git`. Inside it: `npm install && npx playwright install chromium`.
Read its `AGENTS.md` for the full API and recorder flags. Copy `templates/demo-kit/` to `<project>-demo/`.

## 2. Pick the scenario from the project's own browser tests

- Find end-to-end tests (Laravel Dusk `tests/Browser`, Playwright `tests|e2e`, Cypress `cypress/e2e`,
  Rails `spec/system`, …) and their page objects / helpers. List the flows they cover.
- Choose one flow that tells a story in 45–90 s (a core first task: create X → do Y → see the result).
  If the user didn't choose, pick it and say why. Read the routes and templates of those pages.

## 3. Reach the app and sign in

- The app must be reachable from where the recorder runs (usually the user's machine). `curl` it.
- Never guess passwords. Use `node <one-take>/tools/save-login.js --url <login> --out <kit>/auth.json`
  (the user signs in once in the window it opens), or a test account the project documents for local
  dev (seeders, `.env.example`) on a local host only, or ask the user.
- Unstyled pages mean the asset pipeline isn't serving (e.g. Laravel `public/hot` → stopped Vite).
  Use built assets or start the dev server; ask before changing the project.
- If your sandbox can't reach the user's localhost, rehearse in a browser that can (if you have one),
  then hand the user `bash record.sh`; never claim a render you couldn't run.

## 4. Map the live DOM

For every control in the flow, note a stable selector (`#id`, `[name]`, `[data-testid]`, `[dusk]`,
`label=Field`, `text=Button`), how custom widgets behave (copy the test helpers' approach), the form
**sections** (zoom targets) and every page load (each one ends a script).

## 5. Write one script per page load

Shortcut when a person can click through the flow: `node <one-take>/tools/studio.js --url <start> --out <kit>`
(● Record, ✎ Mark zooms/highlights, Generate). Then polish the generated scripts as below.


`take` (a OneTake instance) is in scope. Pattern:

```js
const section = label => () => [...document.querySelector('form').children]
  .find(el => (el.innerText || '').trim().startsWith(label));

take
  .caption('Short narration for this part.')
  .zoom(section('Contact details'))            // zoom on the section you work in
  .type('label=Name', 'Emma Clarke')
  .click(() => document.querySelector('[role=combobox]'))            // custom dropdown: trigger…
  .type('input[placeholder="Search…"]', 'United King', { click: false })
  .click(() => [...document.querySelectorAll('[role=option]')].find(o => /United Kingdom/.test(o.innerText)))
  .zoom(section('Budget'))
  .circle('select[name=currency]', { label: 'Picked automatically', duration: 1800 })
  .type('#budget_from', '1500')
  .zoomOut()
  .box('button[type=submit]', { label: 'Save', duration: 1400 })
  .click('button[type=submit]');               // navigates → next script continues
```

Key API: `click`, `type(t, text, {click:false, clear, enter})`, `select` (native only), `check`,
`press`, `scrollTo`, `wait`, `waitFor`, `run(async take => …)`, `zoom(target, seconds?, {scale})`,
`zoom(seconds)` around the cursor, `zoomOut`, `circle|box|underline|arrow|spotlight|pulse(target, {label, duration, color})`,
`caption(text, {duration})`, `hideCaption`. Targets: selector, `text=…`, `label=…`, element, or function.

Make it look professional: zoom per section and out between pages; a few one-sentence captions;
one highlight per idea (box before the key click, circle the result, arrow to the next step);
realistic fake data; end on the created result.

## 6. Rehearse, render, check

1. Rehearse on the real app at `new OneTake({ speed: 3, onError })`: load `dist/onetake.js` into the page and
   run each script; fix selectors until every step passes.
2. Edit the CONFIG block of `record.sh` (APP_URL, START_PATH, LOGIN_PATH, SCRIPTS, NAME) and run
   `bash record.sh` (or `node tools/record.js --url … --script 1.js --script 2.js --storage auth.json --width 1440 --height 900 --scale 2 --seed 7`).
3. Look at a few extracted frames (`ffmpeg -ss 10 -i v.mp4 -frames:v 1 f.png`) before calling it done.
4. Tell the user which records each run creates in their app.

## Gotchas

- Live (non-recorder) zoom is a CSS transform: zoom out before opening date pickers/dropdowns
  (`if (window.__OT_CAMERA !== 'external') take.zoomOut();`). Not needed in the recorder.
- `text=` matches partially (e.g. `text=INQ` hits a nav link "Inquiries"): use exact function targets.
- Hidden inputs behind custom selects can't be clicked: drive the visible trigger and option.
- Date pickers: use a future month, page with the next button inside `run()`, click range end inputs
  separately, close with a `mousedown` on `document.body`.
- Masked inputs reformat values (`1500` → `1,500`); unique constraints can break re-runs.
- Keep the project repo clean: the kit lives outside it; only use gitignored folders if you must serve files.
