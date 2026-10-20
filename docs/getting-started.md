# Getting started

## What you need

- Node.js 18 or newer
- Your web app running somewhere the browser can reach (`http://localhost:3000`, a staging URL, or a local `.html` file)

## Install

In your project, or in a separate folder next to it:

```bash
npm install --save-dev github:TharinduWijayarathna/one-take
npx playwright install chromium       # the browser the recorder drives
```

`npm install` also fetches a bundled ffmpeg (`ffmpeg-static`). If that isn't available on
your platform, install ffmpeg yourself (`brew install ffmpeg`, `apt install ffmpeg`) or point
`FFMPEG_PATH` at one.

> Working from a clone of the repo? Replace `npx onetake` with `node tools/cli.js` below.

## Your first video

```bash
npx onetake init
```

This creates `onetake.config.js`, a starter `tour.js`, and `.gitignore` lines for videos
and saved logins. Open `onetake.config.js` and set `url` to the page your tour starts on:

```js
module.exports = {
  url: 'http://localhost:3000',
  tour: 'tour.js',
  viewport: { width: 1440, height: 900 },
  scale: 2,
  name: 'demo',
  out: 'videos',
  frame: { background: 'gradient', title: 'My App' },
  intro: { title: 'My App', subtitle: 'A two-minute tour' },
  sound: true
};
```

Now write the tour. A tour is plain JavaScript with a ready `take` in scope:

```js
// tour.js
take
  .chapter('Create a project')
  .caption('Let’s create our first project', { duration: 2500 })
  .click('text=New project')
  .expect('role=dialog[name="New project"]')
  .zoom('role=dialog', 8)                       // glide in on the form for 8 s
  .type('label=Project name', 'Apollo')
  .select('label=Template', 'Marketing site')
  .click('role=button[name="Create"]')
  .expect('text=Apollo')                        // fail loudly if it didn't work
  .circle('text=Apollo', { label: 'Your new project' })
  .thumbnail();
```

Try it quickly, without making a video:

```bash
npx onetake check --speed 4
```

`check` plays the tour in a real browser as fast as the app allows and lists each step. If a
step fails, it stops there, saves a screenshot and the page's HTML, and tells you which line
of `tour.js` broke and why. When it passes, render the video:

```bash
npx onetake record
```

You get `videos/demo.mp4`, a 60 fps video at 2880×1800 with the window frame, the intro
card and click sounds. Alongside it you get `demo.srt` and `demo.vtt` from your captions,
`demo.chapters.txt` (ready to paste into a YouTube description), and `demo.jpg` as a
thumbnail.

## Iterating

- `npx onetake check --watch` re-runs the tour every time you save it.
- `npx onetake record --scale 1` renders about four times faster while you're tuning things.
- Every take is identical (the randomness is seeded and the clock is virtual), so a new
  render only differs where you changed something.

## Without the recorder

The library is a single file with no dependencies. You can also run a tour live in any
page, for example while screen-recording with another tool:

```html
<script src="/node_modules/onetake/dist/onetake.js"></script>
<script>
  addEventListener('keydown', e => {
    if (e.key === 'F9') new OneTake().click('text=Projects').type('label=Name', 'Q4 launch');
  });
</script>
```

Or paste `dist/onetake.js` and your tour into a DevTools snippet (Sources → Snippets). In
live mode, events are synthetic, a tour stops at a page load, and zoom uses a CSS transform.
The recorder has none of these limits. See [Recording](recording.md#live-mode).

## Next

- [Writing tours](writing-tours.md): pages, storytelling, reusable steps
- [Targets](targets.md): how to point at things reliably
- [Output](output.md): frames, cards, sound, vertical video
