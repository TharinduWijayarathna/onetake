# API reference

```js
const take = new OneTake(options);   // in a recorder tour, `take` already exists
```

Every step returns `take`, so steps chain. They run in order, and the chain is awaitable.
In the tables below, `target` is anything from [Targets](targets.md).

- [Cursor and movement](#cursor-and-movement)
- [Actions](#actions)
- [Scrolling](#scrolling)
- [Waiting and assertions](#waiting-and-assertions)
- [Storytelling](#storytelling)
- [Control](#control)
- [Static functions](#static-functions)
- [Options](#options)
- [Errors](#errors)

## Cursor and movement

| Step | |
|---|---|
| `moveTo(target \| {x, y}, o?)` | Move along a curved, eased, human-like path. Long moves sometimes overshoot slightly and correct. |
| `hover(target, { duration })` | Move there and rest (default 800 ms). Hover styles and menus react. |
| `showCursor()` / `hideCursor()` | Fade the cursor in or out. |

Movement options (also accepted by actions): `duration` (ms, default from the distance),
`position: { x, y }` (where inside the element, as fractions, `{ x: 0.5, y: 0.5 }` = centre),
`overshoot` (boolean), `curve` (how much the path bends).

## Actions

| Step | |
|---|---|
| `click(target, o?)` | Press-and-release with a ripple. `o.button`: `'left'` (default), `'right'`, `'middle'` (with the recorder's trusted input). |
| `doubleClick(target, o?)` | |
| `type(target, text, o?)` | Click into the field, select and delete what's there, then type with a natural rhythm. `\n` presses Enter. |
| `clear(target)` | Empty a field the way a person does (select all, delete). |
| `press(key, { times })` | A key on the focused element: `'Enter'`, `'Tab'`, `'Escape'`, `'Backspace'`, `'ArrowDown'`… With the recorder, combinations also work: `'ControlOrMeta+K'`, `'Shift+Tab'`. |
| `select(target, valueOrText)` | Choose an option of a native `<select>` by value or visible text. For custom dropdowns, click the trigger, then the option. |
| `check(target, state = true)` / `uncheck(target)` | Checkbox, radio, switch or its label. Clicks only when the state needs to change. |
| `drag(source, target, { to })` | Press on `source`, move, release over `target`. `to: { x, y }` is the drop point inside the target, as fractions. Works with pointer-based drag (sliders, sortable lists) and HTML5 drag and drop. |
| `upload(target, files, { drop })` | Put files into a file input: the input itself, its label or button, or a drop zone (`drop: true`). `files` is a path or an array of paths. With the recorder, paths are relative to the tour script. On live pages they're URLs. Inline files work everywhere: `{ name: 'notes.md', content: '# Hi', type: 'text/markdown' }`. No OS file dialog appears. |

`type` options:

| | Default | |
|---|---|---|
| `clear` | `true` | Empty the field first. |
| `click` | `true` | Click into the field first. `false` types into whatever has focus. |
| `enter` | `false` | Press Enter at the end. |
| `delay` | `typingDelay` | Average ms per character for this field. |
| `typos` | `typos` | Chance per letter of a typo that gets corrected. |

Every action also takes `timeout` (ms), `force` (skip the
[actionability checks](waiting-and-assertions.md#actionability-every-action-waits-for-its-element))
and `settle` (`false` to skip [waiting for the app](waiting-and-assertions.md#settling-waiting-for-the-app-after-an-action)).

**Real and synthetic input.** With the recorder, clicks, typing, key presses and drags are
real browser input (trusted events). Native hover, focus, `:active`, text selection and
browser shortcuts all behave exactly as they do for a person. In live mode (the library on
its own) OneTake dispatches a faithful sequence of synthetic pointer, mouse, keyboard and
input events, and emulates `:hover` and `:active` styles. Turn trusted input off with the
`realInput: false` option or `--no-real-input`.

## Scrolling

| Step | |
|---|---|
| `scrollTo(target \| y, { block, duration })` | Smoothly scroll an element into view (`block`: `'center'` by default, or `'start'`, `'end'`, `'nearest'`), or the page to a y position. |
| `scrollBy(dy, { container, duration })` | Scroll the page or a container by `dy` px, like a mouse wheel. |
| `scrollUntil(target, { container, step, maxScrolls })` | Scroll until the target shows up. Use it for long and virtualised lists. |

Actions scroll their target into view on their own, through every scrolling container
around it.

## Waiting and assertions

| Step | |
|---|---|
| `wait(ms)` | A pause, scaled by `speed`. Use it for pacing, not for waiting on the app. |
| `waitFor(target, { timeout })` | Until the element exists and is visible. |
| `expect(target, o?)` | Until the condition holds; fails the tour otherwise. `o`: `text`, `value` (string or RegExp), `visible` (`false` = hidden or gone), `count`, `checked`, `enabled`, `timeout`. |
| `expectUrl(pattern, { timeout })` | Until the URL contains the string, or matches the RegExp. |
| `waitForUrl(pattern, { timeout })` | Same as `expectUrl`. |

See [Waiting and assertions](waiting-and-assertions.md).

## Storytelling

| Step | |
|---|---|
| `zoom(target, seconds?, o?)` | Glide the camera in on an element. With `seconds`, zoom back out after that long. Without, stay until `zoomOut()` or the next `zoom()`. `zoom(seconds)` zooms around the cursor. The chain continues once the zoom-in settles. |
| `zoomOut()` | Glide back to the full page. |
| `highlight(target, o?)` | Draw a hand-drawn shape around an element (`o.shape`). |
| `circle`, `box`, `underline`, `arrow`, `spotlight`, `pulse` `(target, o?)` | Shortcuts for the shapes. |
| `clearHighlights()` | Remove the highlights that are still showing. |
| `caption(text, { duration, position, wait })` | A subtitle-style caption. `position`: `'bottom'` (default) or `'top'`. It doesn't block the next steps. |
| `hideCaption()` | |
| `chapter(title)` | Start a chapter: markers in the MP4 and a YouTube chapter list ([Output](output.md#chapters)). |
| `thumbnail()` | Use this moment as the video's thumbnail. |

Options for zoom, highlights and captions: [Camera, highlights and captions](camera-and-highlights.md).

## Control

| | |
|---|---|
| `run(fn)` | Run your own code as a step. `fn(take)` may return a promise. Don't queue steps inside it. |
| `set(options)` | Change options from here on, e.g. `.set({ speed: 2 })`. |
| `use(fn, ...args)` | Inline a group of steps: `fn(take, ...args)`. |
| `then()` / `catch()` / `await take` | Wait for the queue to finish (or fail). |
| `stop()` | Abort: pending steps are discarded. |
| `destroy()` | Remove everything OneTake added to the page. |

## Static functions

| | |
|---|---|
| `OneTake.define(name, fn)` | Add a chainable step made of other steps: `OneTake.define('signIn', (take, email) => take.type('label=Email', email)…)`. See [Reusable steps](writing-tours.md#reusable-steps). |
| `OneTake.query(target)` | The single element for a target, `null`, or an "ambiguous" error. |
| `OneTake.resolveAll(target)` | Every element a target matches. |
| `OneTake.findByText(text)`, `OneTake.findByLabel(text)` | |
| `OneTake.defaults` | The default options. Change them before creating an instance. |
| `OneTake.shapes` | The highlight shapes by name. Advanced: add your own drawing function (see `src/library/90-highlights.js` for the signature). |
| `OneTake.version` | |

## Options

```js
new OneTake({ speed: 1, autoZoom: true })
```

In a recorder tour, set them with `options` in `onetake.config.js`, or with `take.set()`.

| Option | Default | |
|---|---|---|
| `speed` | `1` | Multiplier for every movement, pause and keystroke. |
| `waitTimeout` | `8000` | ms to wait for a target. |
| `startPosition` | `null` | `{x, y}` for the cursor. The default is near the centre. |
| `realInput` | `true` | Use trusted input when the recorder offers it. |
| `settle` / `settleQuiet` / `settleTimeout` | `true` / `200` / `4000` | [Settling](waiting-and-assertions.md#settling-waiting-for-the-app-after-an-action). |
| `typingDelay` | `75` | Average ms per character. |
| `typingVariance` | `0.55` | 0–1, how uneven the rhythm is. |
| `typos` | `0` | Chance per letter of a corrected typo, e.g. `0.02`. |
| `overshoot` | `true` | Long moves sometimes overshoot and correct. |
| `cursorSize` | `28` | px. |
| `cursorColor` / `cursorOutline` | `#111827` / `#ffffff` | |
| `cursorIdle` | `0` | ms without movement before the cursor fades out (0 = never). |
| `cursorBlur` | `true` | A touch of motion blur on fast moves. |
| `hideNativeCursor` | `true` | Hide the real mouse pointer during live tours. |
| `emulateHover` | `true` | Live mode: copy `:hover`/`:active` rules so they react to the cursor. |
| `clickColor` | `rgba(59,130,246,.45)` | The click ripple. |
| `highlightColor` | `#ef4444` | Default colour of shapes and labels. |
| `zoomScale` | `2` | Largest automatic zoom level. |
| `zoomSmoothness` | `6.5` | Camera spring stiffness. Lower is floatier. |
| `autoZoom` | `false` | `true` or `{ scale, hold }`: zoom toward every click. |
| `scrollBehavior` | `'smooth'` | `'smooth'` (animated by OneTake, frame-exact), `'native'` or `'instant'`. |
| `sound` | `false` | Live mode: soft click and key sounds. The recorder's `--sound` makes its own. |
| `zIndex` | `2147483000` | Of the overlay. |
| `onStep(name, args, info)` | | Called before each step. `info`: `{ index, name, site, arg }`. |
| `onError(error, name, info)` | | Called when a step fails (instead of logging it). |

## Errors

A failed step rejects the chain with an error whose message says which step failed, on
which line, and why:

```
step 7 click("text=Save") at tour.js:14: cannot click <button.btn> "Save": it is covered by <div.modal-backdrop> (waited 8 s)
```

The error also has `error.step` (`{ index, name, site, arg }`). Step numbers count from 1,
the same way `onetake check` lists them. All messages are in
[Troubleshooting](troubleshooting.md).
