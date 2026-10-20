# Recipes

- [Apps behind a login](#apps-behind-a-login)
- [Custom dropdowns](#custom-dropdowns)
- [Comboboxes and search-as-you-type](#comboboxes-and-search-as-you-type)
- [Date pickers](#date-pickers)
- [Modals, toasts and cookie banners](#modals-toasts-and-cookie-banners)
- [File uploads](#file-uploads)
- [Drag and drop, sliders, sortable lists](#drag-and-drop-sliders-sortable-lists)
- [Tables and long lists](#tables-and-long-lists)
- [Rich text editors](#rich-text-editors)
- [Keyboard shortcuts and command palettes](#keyboard-shortcuts-and-command-palettes)
- [Seeding demo data](#seeding-demo-data)
- [Dates that never change](#dates-that-never-change)
- [Re-running tours that create records](#re-running-tours-that-create-records)
- [Several languages](#several-languages)
- [Several videos from one project](#several-videos-from-one-project)
- [Render the video in CI](#render-the-video-in-ci)

## Apps behind a login

```bash
onetake login --url http://localhost:3000/login --until /dashboard --out auth.json
```

```js
// onetake.config.js
module.exports = { url: 'http://localhost:3000/dashboard', storage: 'auth.json', tour: 'tour.js' };
```

Sessions expire. In a script, check before recording:

```bash
onetake login --check http://localhost:3000/dashboard --login /login --out auth.json \
  || onetake login --url http://localhost:3000/login --until /dashboard --out auth.json
onetake record
```

For a local demo account that the project documents (seeders, fixtures), signing in inside
the tour also works, and the sign-in becomes part of the video:
`OneTake.define('signIn', …)` in an include ([Reusable steps](writing-tours.md#reusable-steps)).

## Custom dropdowns

Libraries such as Select2, Headless UI, Radix, MUI and Choices.js render their own lists,
and keep the value in a hidden input. Click what a person would click:

```js
take
  .click('label=Country')                          // the visible trigger
  .click('role=option[name="United Kingdom"]');    // the option in the list
```

If the trigger isn't connected to a label, scope it: `'#country-field >> role=combobox'`.

## Comboboxes and search-as-you-type

```js
take
  .type('label=City', 'ber')                // settling waits for the search request
  .click('role=option[name="Berlin"]');     // waits for the option to appear
```

For a widget whose search box only appears after a click:
`.click('label=Assignee').type('role=combobox >> nth=-1', 'Grace', { click: false })`.

## Date pickers

```js
take
  .click('label=Due date')
  .click('.datepicker.active >> text=15');     // scope to the open calendar
```

- Use `--now` so the calendar opens on the same month in every take, and past dates stay
  the same ones ([Dates that never change](#dates-that-never-change)).
- To move to the next month: `.click('.datepicker.active >> role=button[name="Next month"]')`.
- Range pickers usually need the start day, then the end day, in the same calendar.
- Many pickers close on `mousedown` outside. With the recorder, that just works. In live
  mode, press Escape: `.press('Escape')`.
- Typing works too, if the input accepts it: `.type('label=Due date', '2026-11-15').press('Enter')`.

## Modals, toasts and cookie banners

Nothing special to do. Actions wait until their element stops moving and isn't covered, so
a dialog that's sliding in, or a toast over the button, just delays the click. A cookie
banner that never goes away has to be dismissed in the tour:
`.click('role=button[name="Accept"]')`. Or dismiss it before the video with a cookie in
`auth.json` (sign in once with `onetake login` and accept the banner).

## File uploads

```js
take
  .upload('text=Attach invoice', 'files/invoice.pdf')          // relative to the tour script
  .upload('#dropzone', ['a.png', 'b.png'], { drop: true })      // a drop zone
  .upload('label=Notes', { name: 'notes.md', content: '# Notes', type: 'text/markdown' });
```

The cursor clicks the button, but no OS file dialog appears: the files go straight into the
input, or are dropped on the zone, with the usual `input`/`change` (or `drop`) events. Keep
demo files next to the tour.

## Drag and drop, sliders, sortable lists

```js
take
  .drag('text=Record the demo', '#done-column')                    // kanban card
  .drag('#volume-knob', '#volume-track', { to: { x: 0.75, y: 0.5 } }) // slider at 75 %
  .drag('role=listitem[name="Step 3"]', 'role=listitem[name="Step 1"]', { to: { x: 0.5, y: 0.1 } });
```

With the recorder, the drag is a real mouse drag, so every drag library works
(SortableJS, dnd-kit, react-beautiful-dnd, native HTML5). In live mode, OneTake sends
pointer and mouse events with the button held, plus HTML5 drag events for `draggable`
elements.

## Tables and long lists

```js
take.click('tbody tr >> nth=2 >> role=button[name="Edit"]');   // third row
take.click(() => [...document.querySelectorAll('tbody tr')].find(r => r.textContent.includes('INV-0042')));
take.scrollUntil('text=Customer 140', { container: '#customers' }).click('text=Customer 140');
```

## Rich text editors

ProseMirror, TipTap, Lexical, Quill and Slate are contenteditable, and `type` works on
them. Target the editable element: `.type('[contenteditable=true]', 'Hello', { clear: false })`.
With the recorder, the keystrokes are real, so editor shortcuts work too:
`.press('ControlOrMeta+B')`.

## Keyboard shortcuts and command palettes

```js
take
  .press('ControlOrMeta+K')                 // ⌘K on macOS, Ctrl+K elsewhere
  .type('role=combobox', 'invite', { click: false })
  .press('Enter');
```

Combinations need the recorder's trusted input.

## Seeding demo data

Make every take start from the same state. Either use a fixture account with known data,
or reset it at the start of the tour through your API:

```js
take.run(async () => {
  await fetch('/api/demo/reset', { method: 'POST' });   // your own endpoint
  location.reload();                                    // the tour carries on after the reload
});
```

A `run()` step that reloads the page counts as done, so the tour resumes after it.

## Dates that never change

```bash
onetake record --now 2026-11-02T09:00
```

The page's clock (`Date`, `Date.now()`, `performance.now()`) starts at that moment and
moves forward with the video, across page loads. "Today", "3 minutes ago" and calendars
look the same in every take. It doesn't change your server's clock: dates the server
renders stay real.

## Re-running tours that create records

Tours perform real actions. Rendering twice creates two records, and unique fields (emails,
slugs) can clash. The best fix is to reset the data ([Seeding demo data](#seeding-demo-data))
or delete the record at the end of the tour, so every take is identical.

If you need a value that differs between takes, don't use `Math.random()` or `Date.now()`.
The recorder seeds and freezes those, so they're the same in every take. Use
`crypto.getRandomValues`, and keep the value out of the shot where you can:

```js
// sessionStorage keeps the value when the tour continues on another page
var suffix = sessionStorage.demoSuffix ||
  (sessionStorage.demoSuffix = crypto.getRandomValues(new Uint32Array(1))[0].toString(36).slice(0, 4));
take.type('label=Email', 'grace+' + suffix + '@example.com');
```

## Several languages

Put the words in an include per language. Use `var` (or `window.`), because `let` and
`const` don't leave an included file:

```js
// text.de.js
var T = { welcome: 'Willkommen bei Acme', invite: 'Teammitglied einladen' };
```

```js
// tour.js
take.caption(T.welcome).click('text=' + T.invite);
```

```bash
onetake record --include text.en.js --name demo-en
onetake record --include text.de.js --name demo-de
```

## Several videos from one project

One config, a tour per video:

```bash
onetake record tours/onboarding.js --name onboarding
onetake record tours/billing.js --name billing --frame sunset
```

## Render the video in CI

```yaml
# .github/workflows/demo-video.yml
name: Demo video
on: workflow_dispatch
jobs:
  video:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npm run dev & npx wait-on http://localhost:3000   # start your app
      - run: npx onetake check && npx onetake record --frame --sound
      - uses: actions/upload-artifact@v4
        with: { name: demo-video, path: videos/ }
```

`onetake check` in a PR pipeline also works as a smoke test: if the UI changes and the
tour breaks, the check fails before anyone films a broken demo.
