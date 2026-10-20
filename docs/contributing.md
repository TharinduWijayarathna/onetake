# Contributing

```bash
git clone https://github.com/TharinduWijayarathna/one-take && cd one-take
npm install
npx playwright install chromium
npm test
```

## Layout

```
bin/onetake.js        the `onetake` command
src/library/          the in-page library, one module per feature → bundled into dist/onetake.js
src/recorder/         the CLI, recorder, virtual clock and renderer (Node)
dist/onetake.js       the built library (committed, so it works without a build step)
types/                TypeScript types
scripts/build.js      src/library/ → dist/onetake.js
docs/                 documentation
templates/demo-kit/   the starter kit for a project
skills/               the Claude skill (with AGENTS.md, CLAUDE.md and llms.txt at the root)
test/unit/            node:test unit tests
test/e2e/             compatibility, recorder and visual tests
test/fixtures/        small apps the tests drive · test/golden/ reference frames · test/helpers/
assets/               logo, icon, social preview, brand guide
```

- Edit `src/library/`, never `dist/` by hand, then `npm run build`. Commit the rebuilt `dist/` with your change.
- Keep `types/`, `docs/`, `AGENTS.md`, `llms.txt` and `skills/` in step with the code.
- Each fixture is a folder in `test/fixtures/` with an `index.html` (defining `window.__verify()`) and a `tour.js`.

## Tests

| | | |
|---|---|---|
| `npm test` | build + unit tests | ~15 s |
| `npm run test:compat` | 12 fixtures × 2 input modes | ~1 min |
| `npm run test:record` | recorder and renderer end to end | ~2 min |
| `npm run test:visual` | golden frames | ~30 s |
| `npx -p typescript tsc -p test/types` | the types | |

CI runs all of them on Node 18 and 22. The visual test only reports (fonts differ between
machines). After an intended visual change, refresh the goldens with
`node test/e2e/visual.js --update` and look at the new images before you commit them.

## Adding a feature

1. Put it in the module it belongs to, or a new `src/library/NN-name.js` (pick `NN` so it loads
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

`test/fixtures/<name>/index.html` is a page served over HTTP, and `tour.js` next to it is its tour.
The page defines `window.__verify = () => ({ ok, detail })`, which checks that the tour
really did the job. Add the name to `ALL` in `test/e2e/compat.js`. Fixtures can load libraries
from `/node_modules/…` (add them as devDependencies).

## Commits

Small, one feature or fix per commit: `feat(targets): …`, `fix(recorder): …`, `docs: …`,
`test: …`. Don't commit videos, renders, `auth.json` or `test/.output/` (they're ignored).
