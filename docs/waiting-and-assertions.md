# Waiting and assertions

Tours break in two ways. A step acts too early, before the app is ready. Or a step "works"
but does the wrong thing, and you only find out after watching the video. OneTake handles
the first one for you, and gives you `expect()` for the second.

## Actionability: every action waits for its element

Before `click`, `doubleClick`, `type`, `clear`, `check`, `select`, `drag` and `upload`,
OneTake waits until the target is:

1. **in the page and visible**: rendered, not `display:none`, with a size;
2. **enabled**: not `:disabled`, and not inside `[aria-disabled=true]` or a disabled `<fieldset>`;
3. **stable**: it's in the same place as on the previous frame, so a dialog that's still animating in won't be clicked mid-slide;
4. **the thing under the cursor**: no modal backdrop, toast, cookie banner or loading overlay on top of it.

It scrolls the element into view first and aims at a point that really receives the click.
If something moves under the cursor while it travels, it aims again. If the app re-renders
the element (React keys, virtual lists), it finds it again.

If the element never gets there within `waitTimeout` (8 s), the step fails and says why:

```
step 7 click("text=Save") at tour.js:14: cannot click <button.btn> "Save": it is covered by <div.modal-backdrop> (waited 8 s)
step 3 type("label=Email") at tour.js:6: cannot type into <input#email>: it is disabled (waited 8 s)
step 9 click("#row-5") at tour.js:20: element not found: #row-5 (waited 8 s)
```

Per step:

```js
take.click('text=Export', { timeout: 30000 })   // a slow report
take.click('#hidden-trigger', { force: true })  // skip the checks (rarely needed)
```

`zoom`, `highlight` and `moveTo` only wait for the element to exist and be visible. They
don't need to click it.

## Settling: waiting for the app after an action

After an action, OneTake waits for the app to go quiet. That means no `fetch` or
`XMLHttpRequest` in flight, and no DOM changes for 200 ms, for up to 4 s. This covers
Livewire, htmx, React Query, form posts that re-render, debounced search boxes and the
like, without guessed `wait(800)`s.

| Option | Default | |
|---|---|---|
| `settle` | `true` | Turn it off globally, or per step: `.click('#x', { settle: false })`. |
| `settleQuiet` | `200` | ms of quiet that counts as settled. |
| `settleTimeout` | `4000` | Carry on after this long even if the app is still busy (the next step's own waiting still applies). |

Pages that never stop changing the DOM (tickers, carousels, clocks) are detected after a
couple of timeouts. From then on, OneTake waits for network requests only.

Settling doesn't see timers. If the app shows a result after a `setTimeout` with no network
request, follow the action with `expect()`.

## `expect()`: make the tour fail loudly

```js
take
  .click('text=Create invoice')
  .expect('text=Invoice created')                         // visible (the default check)
  .expect('#total', { text: '£4,000.00' })                // text contains…
  .expect('#total', { text: /£4,000/ })                   // …or matches a RegExp
  .expect('label=Email', { value: 'ada@example.com' })    // a field's value
  .expect('.toast', { visible: false })                   // hidden or gone
  .expect('tbody tr', { count: 3 })                       // exactly 3 visible matches
  .expect('#notify', { checked: true })
  .expect('role=button[name="Pay"]', { enabled: false });
```

`expect` keeps checking until it passes or `waitTimeout` runs out, so it also works as a
"wait until". When it fails, the message says what it found instead:

```
step 12 expect("#total") at tour.js:25: expected #total to be visible and contain text "£4,000.00", but its text is "£3,000.00" (waited 8 s)
step 4 expect("tbody tr") at tour.js:9: expected tbody tr to match 3 visible elements, but found 2 visible (of 2) (waited 8 s)
```

Use an `expect` after every step that should change something. `onetake check` then
becomes a real end-to-end test of the story you're about to film.

## URLs

```js
take.click('text=Settings').expectUrl('/settings')        // contains
take.expectUrl(/\/invoices\/\d+$/)                         // matches
take.waitForUrl('/dashboard', { timeout: 20000 })          // same, reads as a wait
```

## `waitFor()` and `wait()`

- `waitFor(target)` waits for an element to exist and be visible.
- `wait(ms)` pauses the video, which is useful for pacing ("let the viewer read this"). It's
  scaled by `speed`, so `check --speed 4` gets through pauses quickly. Don't use it to wait
  for the app. That's what settling and `expect` are for.

## Long and virtualised lists

`scrollUntil()` scrolls a container step by step until the target appears. This works with
virtual lists (react-window, TanStack Virtual, AG Grid) that only render the visible rows:

```js
take
  .scrollUntil('text=Customer 140', { container: '#customer-list' })
  .click('text=Customer 140');
```

| Option | Default | |
|---|---|---|
| `container` | the page | The scrolling element. |
| `step` | 80 % of its height | px per scroll. Keep it smaller than the rendered window of a virtual list. |
| `maxScrolls` | `40` | Give up after this many scrolls. |
| `duration` | `500` | ms per scroll animation. |

## Recipes

- **Wait for a spinner to go away:** `.expect('.spinner', { visible: false })`
- **Wait for a list to load:** `.expect('tbody tr', { count: 10 })` or `.waitFor('tbody tr')`
- **Wait for a button to become enabled:** nothing to do. `click` waits for it.
- **Toast covering the next button:** nothing to do. `click` waits until it's gone. If it never goes, add `.click('role=button[name="Dismiss"]')`.
- **Something async after a timer:** `.expect('text=Saved')`.
