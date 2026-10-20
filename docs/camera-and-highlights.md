# Camera, highlights and captions

## Zoom

```js
take.zoom('#contact-form', 15)   // glide in, keep it framed for 15 s, glide back out
take.zoom('#chart')              // stay zoomed until zoomOut() or the next zoom()
take.zoom(8)                     // zoom in around the cursor for 8 s
take.zoomOut()
take.zoom('#table', 6, { scale: 2.5, follow: false, block: true })
```

- The camera moves on a critically damped spring, the way Screen Studio does: no linear
  motion and no wobble. It frames the element with some padding.
- **The chain continues as soon as the zoom-in settles**, so the steps that follow (typing,
  clicking) happen while zoomed in.
- While zoomed, the camera holds still as long as the cursor works inside the frame. If the
  cursor heads somewhere else, the camera pans ahead of it, the way a camera operator would.
- With the recorder, the zoom is rendered by re-capturing that part of the page at a higher
  resolution, so text stays sharp instead of being enlarged pixels. The page itself is never
  transformed, so pop-ups, sticky headers and date pickers stay where they belong.
- In live mode (the library on its own), the zoom is a CSS transform on `<body>`.

| Option | Default | |
|---|---|---|
| `scale` | fits the element, at most `zoomScale` (2) | Zoom level, e.g. `1.8`. |
| `padding` | `40` | px kept around the element. |
| `follow` | `true` | Pan to keep the cursor in frame. |
| `block` | `false` | With a duration: wait for the whole zoom (and the zoom-out) before the next step. |
| `smoothness` | `zoomSmoothness` (6.5) | Spring stiffness. Lower is floatier, higher is snappier. |

### Auto-zoom

```js
options: { autoZoom: true }                       // in onetake.config.js
// or: new OneTake({ autoZoom: { scale: 1.6, hold: 2200 } })
// or: onetake record --auto-zoom
```

Every click (and the typing that follows it) gets a gentle zoom toward the cursor, held for
`hold` ms after the last click, then the camera glides back out. An explicit `zoom()` always
wins over auto-zoom while it's active. Auto-zoom suits form-heavy tours. For overview shots,
turn it off around them with `.set({ autoZoom: false })`.

### Composition tips

- Zoom on the **component** you're about to work in (a form, a card, a table), not on a
  single field. The camera already follows the cursor inside it.
- Let a timed zoom end before a big move across the page, or call `zoomOut()` first.
- `2×` is a lot. `1.5–1.8×` usually looks best at 1440×900. At 1920×1080, you can go a bit
  further.

## Highlights

```js
take
  .circle('#revenue', { label: 'Up 24% this month' })
  .box('role=button[name="Publish"]', { label: 'Publish when ready', duration: 1600 })
  .underline('text=Total due')
  .arrow('#next-step', { from: 'left', label: 'Then this' })
  .spotlight('#chart')                       // dims everything else
  .pulse('#notifications');                  // a soft pulsing ring
```

Shapes are drawn like a pen stroke, slightly imperfect. The recorder seeds the randomness
(`--seed`, 7 by default), so every take draws them the same way. They follow their element while the page scrolls,
resizes or zooms.

| Option | Default | |
|---|---|---|
| `color` | `highlightColor` (`#ef4444`) | Stroke and label colour. |
| `label` | none | Callout text next to the shape. |
| `labelColor` | `color` | |
| `labelPosition` | `'auto'` | `'top'`, `'bottom'`, `'left'`, `'right'`. |
| `padding` | `10` | px between the element and the shape. |
| `strokeWidth` | `4` | |
| `drawDuration` | `750` | ms to draw it. |
| `duration` | `2600` | ms it stays. `0` keeps it until `clearHighlights()`. |
| `block` | `true` | Wait for `duration` before the next step. Set `false` to keep acting while it shows. |
| `hold` | `0` | With `block: false`: ms to wait after it's drawn. |
| `from` | `'top-left'` | Arrows: where the arrow comes from: `left`, `right`, `top`, `bottom`, `top-right`… |

One highlight per idea. Two shapes at once compete for attention.

## Captions

```js
take
  .caption('Invoices are created from the client page')        // stays until replaced or hidden
  .caption('Approve it with one click', { duration: 2500 })     // hides itself
  .caption('Settings live up here', { position: 'top' })
  .hideCaption();
```

- Captions don't block the next steps (they wait 350 ms after appearing, `wait` changes that).
- A new caption cross-fades from the previous one.
- With the recorder, captions stay inside the picture at a constant size when the camera
  zooms or an `--aspect` crop is used, and they carry over page loads.
- Captions become the video's subtitles (`.srt`, `.vtt`, and a soft subtitle track in the MP4).
  See [Output](output.md#subtitles).

Keep them short: one sentence, a few per video.

## The cursor

The cursor is drawn by OneTake in a top-layer overlay that never takes clicks
(`pointer-events: none`). It follows a curved Bézier path with a minimum-jerk speed profile:
slow start, fast middle, gentle landing, the way human hand movements go. Longer distances
take longer. The cursor lands near an element's centre, not exactly on it, and changes shape
on its own: an arrow, a hand over clickable things, an I-beam over text.

| Option | Default | |
|---|---|---|
| `cursorSize` | `28` | px. |
| `cursorColor` / `cursorOutline` | `#111827` / `#fff` | |
| `cursorIdle` | `0` | Fade out after this many ms without movement (0 = never). Handy for long reading pauses. |
| `cursorBlur` | `true` | A touch of motion blur on fast moves. |
| `overshoot` | `true` | Long moves sometimes overshoot and correct. |
| `clickColor` | `rgba(59,130,246,.45)` | The click ripple. |
| `startPosition` | near the centre | `{ x, y }`. |

`hideCursor()` and `showCursor()` fade it out and in, for example over an intro shot.
