<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/logo-dark.svg">
    <img src="assets/logo.svg" alt="OneTake" height="64">
  </picture>
</p>

<p align="center"><b>Script your product demo once. Get a perfect video every take.</b></p>
<p align="center">Human-like cursor · camera zoom · hand-drawn highlights · 60 fps render</p>

---

OneTake makes **product demo videos from a script**. A realistic cursor drives your real
UI: clicks, typing, dropdowns, drag and drop, uploads, across page loads. The camera glides
in on what matters, the way Screen Studio does, while hand-drawn highlights and captions
guide the viewer. The recorder renders it all **frame by frame at 60 fps**, in a window
frame with title cards, click sounds, subtitles and chapters.

```js
take
  .chapter('Add a contact')
  .caption('Let’s add a new contact')
  .circle('#pipeline-card', { label: 'Your pipeline at a glance' })
  .click('role=link[name="Contacts"]')
  .click('text=New contact')
  .zoom('#contact-form', 15)                     // glide in on the form for 15 s
  .type('label=Full name', 'Priya Raman')
  .type('label=Email', 'priya@lumen.dev')
  .select('label=Role', 'Decision maker')
  .check('text=Subscribe to newsletter')
  .box('role=button[name="Save"]', { label: 'Save when ready' })
  .click('role=button[name="Save"]')
  .expect('text=Priya Raman')                     // fail loudly if it didn't work
  .thumbnail();
```

```bash
npx onetake check      # dry run in seconds: every step, with the line that broke
npx onetake record --frame --intro "Northwind CRM|Adding a contact" --sound
```

## Why OneTake

- **It looks human.** Curved, eased cursor paths with a natural rhythm. The cursor changes
  shape over links and fields, typing has pauses, long moves overshoot a little.
- **It's reliable.** Strict `text=` / `label=` / `role=` targets. Every action waits until
  its element is visible, enabled, still and uncovered, and then for the app to settle.
  `expect()` checks the result. When something breaks, the error says which line and why.
- **It's real.** Trusted mouse and keyboard input through Playwright, so every framework
  and widget behaves exactly as it does for a person. Tested against React, Vue, Alpine, web
  components, iframes, date pickers, comboboxes, modals, uploads, drag and drop, and virtual
  lists.
- **Every take is identical.** A virtual clock steps the page exactly one frame at a time,
  the randomness is seeded, and even page loads land on the same frame. Change one line, and
  the video changes only there.
- **It's ready to publish.** Window frame and backgrounds, intro and outro cards,
  synthesised click and key sounds, background music, `.srt`/`.vtt` subtitles, chapter
  markers plus a YouTube chapter list, a thumbnail, WebM and GIF, and vertical `9:16` crops
  that follow the cursor.
- **Agents can use it.** `AGENTS.md`, a Claude skill and `llms.txt` teach any coding agent
  to make a video of your project, from your browser tests to the final render.

## Get started

```bash
npm install --save-dev github:TharinduWijayarathna/one-take
npx playwright install chromium
npx onetake init          # onetake.config.js + tour.js
npx onetake check         # try the tour
npx onetake record        # → recordings/demo.mp4
```

Or try the example in this repo: `npm install && npm run example`. The tour is
[`examples/tour.js`](examples/tour.js), and you can open
[`examples/demo.html`](examples/demo.html) in a browser and press ▶ to watch it live.

## Documentation

| | |
|---|---|
| [Getting started](docs/getting-started.md) | Install and make your first video |
| [Writing tours](docs/writing-tours.md) | How tours run, multi-page flows, storytelling, reusable steps |
| [Targets](docs/targets.md) | `text=`, `label=`, `role=`, chaining, iframes, shadow DOM |
| [Waiting and assertions](docs/waiting-and-assertions.md) | Actionability, settling, `expect()` |
| [API](docs/api.md) | Every step and option |
| [Camera, highlights and captions](docs/camera-and-highlights.md) | `zoom()`, auto-zoom, shapes, captions, the cursor |
| [Recording](docs/recording.md) | The CLI, `onetake.config.js`, capture modes, logins |
| [Output](docs/output.md) | Frame, cards, sound, subtitles, chapters, thumbnails, GIF, vertical video |
| [Recipes](docs/recipes.md) | Dropdowns, date pickers, uploads, drag and drop, demo data, CI |
| [AI agents](docs/ai-agents.md) | Let an agent make the video |
| [Troubleshooting](docs/troubleshooting.md) | Every error message, and what to do |
| [Migrating from v1](docs/migrating-from-v1.md) · [Architecture](docs/architecture.md) · [Contributing](docs/contributing.md) | |

## Three ways to run a tour

1. **Render it with the recorder** (`onetake record`): frame-by-frame at 60 fps, with
   trusted input, multi-page tours and all the finishing.
2. **Add it to your app** in dev or staging builds, and start it on a hotkey while you
   record the screen with another tool:
   ```html
   <script src="/node_modules/onetake/dist/onetake.js"></script>
   <script>addEventListener('keydown', e => { if (e.key === 'F9') new OneTake().click('text=Projects'); });</script>
   ```
3. **Paste it into any page.** Make a DevTools snippet (Sources → Snippets) with
   `dist/onetake.js` followed by your tour, and run it.

## Project layout

| Path | |
|---|---|
| `dist/onetake.js` | The library: one file, no dependencies, UMD. |
| `src/` | Library source, one module per feature. |
| `tools/` | The `onetake` CLI, the recorder (`lib/session`, `frames`, `realtime`), the renderer (`render`, `audio`), the virtual clock, and `save-login`. |
| `types/` | TypeScript types for the library, tours and `onetake.config.js`. |
| `docs/` | Documentation. |
| `examples/` | A sample CRM and its tour. |
| `templates/demo-kit/` | Starter kit to copy next to a project. |
| `test/` | Unit, compatibility, recorder and visual tests, and their fixtures. |
| `AGENTS.md`, `CLAUDE.md`, `llms.txt`, `skills/` | Guides for AI agents. |
| `assets/` | Logo, icon, social preview and the [brand guide](assets/BRAND.md). |

## Development

```bash
npm install && npx playwright install chromium
npm run build          # src/ → dist/onetake.js
npm test               # build, unit tests, smoke test
npm run test:compat    # frameworks and widgets, trusted and synthetic input
npm run test:record    # the recorder and renderer end to end
```

See [Contributing](docs/contributing.md).

## License

MIT
