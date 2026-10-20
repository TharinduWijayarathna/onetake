# Migrating from v1

Version 2 keeps v1 tours working. Most changes make tours more reliable without any edits.
A few make them stricter, and those surface as clear errors.

## What you might need to change

**`text=` is strict now.** In v1, `text=INQ` happily matched a sidebar link called
"Inquiries". Now `text=` is an exact match (case and spacing don't matter), it must be
unique, and it fails right away if several elements match. The error tells you how to
narrow it. For the old "contains" behaviour, use `text*=`.

**Actions wait until the element can really be acted on.** A click waits for the element to
be enabled, to stop moving, and to be uncovered. A v1 tour that clicked a disabled button,
or one hidden under an overlay, now fails with a reason instead of doing nothing. That's
usually a bug in the tour, so fix the step before it.

**The recorder uses trusted input.** Clicks and typing are real browser input, so apps that
ignore synthetic events now respond. If a tour depended on synthetic behaviour (rare), use
`--no-real-input`.

**`select()` and `upload()` don't open OS dialogs.** Same as before for `select`. `upload` is new.

## One script instead of one per page

v1 needed one `--script` per page load. In v2, a single script continues across page loads:

```bash
# v1
node tools/record.js --url http://localhost:3000 --script 1-list.js --script 2-form.js --script 3-done.js
# v2 (both still work)
onetake record tour.js --url http://localhost:3000
```

To merge v1 scripts, paste them into one file in order. Any `wait()` that was only there
for the next page to load can go: navigation and actionability handle it.

## The `onetake` command

`node tools/record.js …` still works with every v1 flag. It's now a thin wrapper around
`onetake record`. New:

- `onetake check`: a fast dry run with step-by-step output and failure screenshots
- `onetake init`, `onetake login`
- `onetake.config.js` instead of long command lines
- `--watch`

## Changed defaults

| | v1 | v2 |
|---|---|---|
| Seed | none (random) | `7`: identical takes by default. `--seed` with another number to change it. |
| Settling after actions | no | yes (`settle: false` turns it off) |
| Subtitles, chapters, thumbnail files | no | yes, when the tour has captions, chapters (`--no-subtitles`, `--no-chapters`, `--no-thumbnail`) |

## New in v2

- Targets: `role=`, `text*=`, `>>` chaining, `nth=`, open shadow DOM, same-origin iframes
- `expect()`, `expectUrl()`, `waitForUrl()`, `scrollUntil()`, `drag()`, `upload()`
- `chapter()`, `thumbnail()`, `OneTake.define()`, `use()`, includes
- `autoZoom`, `cursorIdle`, `cursorBlur`
- Errors with step numbers and script lines; `onError` receives them
- `--now`, idle callbacks and `<video>` in the virtual clock; identical timing across page loads
- Window frame, intro/outro cards, sound, music, subtitles, chapters, thumbnails, WebM/GIF, `--aspect`
- TypeScript types
- Test suites: unit, compatibility (React, Vue, Alpine, web components, iframes, …), recorder, visual
