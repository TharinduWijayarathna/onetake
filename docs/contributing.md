# Contributing

```bash
git clone https://github.com/TharinduWijayarathna/one-take && cd one-take
npm install
npx playwright install chromium
npm test
```

## Layout

| Path | |
|---|---|
| `src/NN-*.js` | Library modules, one per feature. Edit these, never `dist/` by hand. |
| `scripts/build.js` | `npm run build`: `src/` → `dist/onetake.js`. Commit the rebuilt `dist/` with your change. |
| `tools/` | The recorder, the CLI and the renderer ([Architecture](architecture.md)). |
| `types/onetake.d.ts` | Public types. Update them with the API. |
| `test/unit/` | `node:test` tests: config, render helpers, audio, and in-browser tests of targets, steps, actionability, settling, `expect`, the clock and the camera. |
| `test/fixtures/` | Small apps for the compatibility suite, each with a `.tour.js` and a `window.__verify()`. |
| `test/compat.js` | Plays every fixture with trusted and with synthetic input, and checks the result. |
| `test/record.js` | Renders with the CLI and checks the files, identical takes, `--aspect`, realtime and check. |
| `test/visual.js` | Compares rendered frames with `test/golden/` (SSIM). |
| `test/smoke.js` | Plays `examples/demo.html` end to end in live mode. |
| `docs/` | This documentation. |
| `examples/` | The demo CRM and its tour. |
| `templates/demo-kit/` | The starter kit for a project. |
| `AGENTS.md`, `llms.txt`, `skills/` | Guides for AI agents. Keep them in step with the docs. |

## Tests

| | | |
|---|---|---|
| `npm test` | build, unit tests, smoke test | ~20 s |
| `npm run test:compat` | 12 fixtures × 2 input modes | ~1 min |
| `npm run test:record` | recorder and renderer end to end | ~2 min |
| `npm run test:visual` | golden frames | ~30 s |
| `npx -p typescript tsc -p test/types` | the types | |

CI runs all of them on Node 18 and 22. The visual test only reports (fonts differ between
machines). After an intended visual change, refresh the goldens with
`node test/visual.js --update` and look at the new images before you commit them.

## Adding a feature

1. Put it in the module it belongs to, or a new `src/NN-name.js` (pick `NN` so it loads
   after what it uses).
2. Public steps go through `this._step('name', arguments, fn)`. Actions approach their
   element with `this._approach(target, { actionable: true, verb })` and finish with
   `this._settle(o)`.
3. Anything that needs the recorder goes through `report()` or `this._input()`, and must
   still work without them (live mode).
4. Add a unit test. If it touches real UI patterns, add a fixture to the compatibility suite.
5. Update `types/`, the matching page in `docs/`, `AGENTS.md`/`llms.txt`, and the skill if
   agents should use it.

## Adding a fixture

`test/fixtures/<name>.html` is a page served over HTTP, and `<name>.tour.js` is its tour.
The page defines `window.__verify = () => ({ ok, detail })`, which checks that the tour
really did the job. Add the name to `ALL` in `test/compat.js`. Fixtures can load libraries
from `/node_modules/…` (add them as devDependencies).

## Commits

Small, one feature or fix per commit: `feat(targets): …`, `fix(recorder): …`, `docs: …`,
`test: …`. Don't commit videos, renders, `auth.json` or `test/.output/` (they're ignored).
