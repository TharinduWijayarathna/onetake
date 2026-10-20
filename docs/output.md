# Output

`onetake record` writes, into `out/` (default `recordings/`):

| File | When |
|---|---|
| `<name>.mp4` | Always. H.264, plus an AAC track with `--sound`/`--music`, a soft subtitle track from captions, and chapter markers. |
| `<name>.srt`, `<name>.vtt` | When the tour has captions (`--no-subtitles` to skip). |
| `<name>.chapters.txt` | When the tour has `chapter()`s: a list ready to paste into a YouTube description. |
| `<name>.jpg` | A thumbnail (`--no-thumbnail` to skip). |
| `<name>.webm`, `<name>.gif` | With `formats: ['mp4', 'webm', 'gif']` or `--formats webm,gif`. |
| `<name>.timeline.json` | With `--timeline`. |
| `<name>.failure.png/.html` | When a step fails: the page at that moment. The video is still saved up to the error. |

## Window frame and background

```bash
onetake record --frame                       # default gradient background, macOS-style window
onetake record --frame ocean --title "Acme CRM"
```

```js
frame: {
  background: 'gradient',   // gradient | ocean | sunset | forest | dark | light | any CSS colour or gradient | an image file
  padding: 72,              // px around the window (at scale 1)
  radius: 14,               // window corner radius
  shadow: true,
  chrome: 'mac',            // 'mac' (title bar with traffic lights) | 'none'
  title: 'Acme CRM'         // text in the title bar
}
```

The video keeps its size: the page is scaled down into the window. Render at `scale: 2`
so the framed result stays crisp.

## Intro and outro cards

```bash
onetake record --intro "Acme CRM|Managing clients" --outro "Try it free|acme.example"
```

```js
intro: { title: 'Acme CRM', subtitle: 'Managing clients', duration: 2.5, logo: 'logo.svg' },
outro: { title: 'Try it free', subtitle: 'acme.example', duration: 3, background: 'dark' }
```

Cards cross-fade into and out of the video (0.5 s). They use the frame's background unless
they set their own. `color` sets the text colour. Subtitles, chapters and sounds shift to
match.

## Sound and music

```bash
onetake record --sound                                     # soft mouse clicks and key taps
onetake record --sound --music bed.mp3 --music-volume 0.15
```

- `sound`: the click and key sounds are synthesised (no sample files) and placed at the
  exact frame of every click and keystroke. Each one varies slightly, but the same seed
  gives the same sounds.
- `music`: any audio file ffmpeg reads. It loops if it's shorter than the video, fades in
  over 1.2 s, and fades out over the last 2.5 s. `musicVolume` defaults to `0.18`.

## Subtitles

Every `caption()` becomes a cue. A caption that stays on screen across a page load is one
cue, and cues end when the caption is hidden or replaced, or when its `duration` runs out.
You get `.srt` and `.vtt` files, and a soft (switchable) subtitle track inside the MP4.
Captions are also burned into the picture, because they're part of the page. For a video
that relies on the subtitle track instead (translations, say), leave the captions out and
add your own `.srt`.

## Chapters

```js
take.chapter('Create a client') /* … */ .chapter('Send an invoice') /* … */
```

- MP4 chapter markers, which QuickTime, VLC and most players show.
- `<name>.chapters.txt`, for a YouTube description:
  ```
  0:00 Create a client
  0:41 Send an invoice
  ```
  The first chapter is moved to `0:00` (YouTube needs that). If it starts well into the video, a
  `Start` (or `Intro`, after an intro card) chapter is added in front of it.

## Thumbnail

`take.thumbnail()` marks the frame. Without one, OneTake takes the moment just after the
first highlight is drawn, or a third of the way into the video.

## Formats

- `webm`: VP9 + Opus, for the web.
- `gif`: 15 fps, at most 960 px wide, with an optimised palette. Good for READMEs and docs.
  Keep these short.

## Vertical and square video: `--aspect`

```bash
onetake record --aspect 9:16      # 1080×1920 from a 1920×1080 viewport (Reels, Shorts, TikTok)
onetake record --aspect 1:1       # 1080×1080
onetake record --aspect 4:5
```

The recorder captures a window of that shape that follows the cursor through the page,
with a dead zone and a soft spring, the way a camera operator would. It re-renders the
window at full resolution rather than cropping and upscaling. Captions move inside the
window. It works with `zoom()` too: the window then moves inside the zoomed view.
Desktop layouts are wide, so for vertical video, zoom on the components you're working in,
or use a narrower viewport (`--width 1080 --height 1350`).
`--aspect` needs frame-by-frame mode.

## Quality and size

| | |
|---|---|
| `--scale 2` | The biggest quality improvement: text is rendered at twice the density. |
| `--crf 12` | Higher quality, bigger files (the default is 16). |
| `--format png` | Lossless frame capture. Slower; it only matters for very fine gradients. |
| `--fps 30` | Half the frames, half the render time. |

Without a frame, cards, sound or music (and in frame-by-frame mode), the captured stream
goes into the MP4 untouched.
Otherwise, it's captured at near-lossless quality and encoded once more at `crf` in the
finishing pass.
