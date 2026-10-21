# Writing tours

A tour is a JavaScript file that calls steps on `take`, a ready `OneTake` instance:

```js
take
  .caption('Inviting a teammate')
  .click('text=Settings')
  .click('role=tab[name="Members"]')
  .type('label=Email', 'grace@example.com')
  .click('role=button[name="Send invite"]')
  .expect('text=Invitation sent');
```

The recorder runs it inside the page, so the tour can read the DOM, use `window`, and call
your app's own functions from a `run()` step.

## How steps run

Every method adds a step to a queue and returns `take`, so calls chain. Steps run one after
another. The chain is also a promise:

```js
await take.click('#save');                 // inside run() or an async helper
take.then(() => console.log('tour done'));
```

Calling methods doesn't do anything immediately. They queue, and the queue starts on its
own. That's why plain JavaScript around the chain runs *before* the steps:

```js
const name = document.querySelector('h1').textContent;  // runs first, on page load
take.click('text=Edit');                               // runs later
```

To read the page at a point in the tour, use `run()`:

```js
take
  .click('text=Generate invoice')
  .run(async take => {
    const n = document.querySelector('.invoice-number').textContent;
    console.log('created', n);
  });
```

Don't queue new steps inside `run()`. They would be added to the end of the queue, not run
in place. To act on something you only know at run time, use a function target:
`.click(() => rows[rows.length - 1])`.

## Tours that span pages

A click that loads a new page is fine. The recorder reloads OneTake on the new page and
carries on from the next step, with the cursor where it was and the caption still showing:

```js
take
  .type('label=Email', 'ada@example.com')
  .click('text=Continue')                  // full page load (classic form post, link, redirect)
  .expect('text=Choose a plan')            // runs on the next page
  .click('text=Pro');
```

How it works: each page load re-runs the same script with steps that already happened
skipped. A step that already clicked or typed isn't repeated. A step that was cut short
before it acted (such as a `wait()`) runs again on the new page. Single-page apps don't
reload at all, so none of this applies to them.

Consequences:

- Code outside the chain runs again on every page. Keep it side-effect free, or put it in a
  `run()` step.
- `take.set({...})` options carry over, even when the step that set them is skipped.
- You can also split a tour into files: `--script a.js --script b.js`. Each file runs on
  the page the previous one left.

## Telling a story

Demo videos that feel professional follow a few rules:

- **One scenario, 45–90 seconds.** A real task a new user would do first ("create a client →
  send an invoice → see it paid"), not a feature tour.
- **Zoom on the section you're working in.** `zoom('#billing-form', 12)` before filling it,
  then let it glide out before you move elsewhere. Or turn on `autoZoom` (see
  [Camera](camera-and-highlights.md#auto-zoom)).
- **Captions for narration.** One short sentence, a handful per video, never one per step.
- **One highlight per idea.** Circle a result, box the button before you click it, draw an
  arrow to the next step.
- **Chapters for long tours.** `take.chapter('Billing')` adds chapter markers to the MP4 and a
  list you can paste into a YouTube description.
- **Realistic data.** Names, emails and amounts that fit the product, and never real customer
  data.
- **End on the result.** Show the record that was created, then hold for a second
  (`.wait(1200)`). Mark the best frame with `.thumbnail()`.
- **Fail loudly.** Add an `expect()` after every step that should change something. A tour
  that silently does the wrong thing renders a wrong video, and you only notice after
  watching it.

## Reusable steps

Define your own steps once and use them like built-ins:

```js
// steps.js
OneTake.define('signIn', (take, email) => {
  take
    .type('label=Email', email)
    .type('label=Password', 'demo-password')
    .click('role=button[name="Sign in"]')
    .expect('text=Dashboard');
});

OneTake.define('addContact', (take, name, email) => {
  take
    .click('text=New contact')
    .type('label=Name', name)
    .type('label=Email', email)
    .click('text=Save');
});
```

```js
// tour.js
take.signIn('ada@example.com').addContact('Grace Hopper', 'grace@example.com');
```

Load the helper file with `include` in `onetake.config.js` (or `--include steps.js`).
Includes run as ordinary scripts before the tour, so their functions and definitions are
visible to it. They run again on every page load too.

For a one-off group of steps, `use()` inlines a function:

```js
function fillAddress(take, city) { take.type('label=Street', '1 Main St').type('label=City', city); }
take.use(fillAddress, 'Berlin');
```

When a step from a helper fails, the error names both lines: `steps.js:4 ← tour.js:12`.

## Options in a tour

Change options for the rest of the tour with `set()`:

```js
take
  .set({ typingDelay: 40 })       // type faster for the long text
  .type('label=Notes', '...')
  .set({ typingDelay: 75 });
```

Options for the whole tour go in `options` in `onetake.config.js`:
`options: { autoZoom: true, highlightColor: '#6366f1' }`. All options are in the
[API reference](api.md#options).

## Speed

Leave `speed` at 1 for the final video. Use `onetake check --speed 4` while you're writing.
Waits for the app (actionability, settling, `expect`) are not sped up, so a fast check still
waits for your API.

## Editor support

The package ships TypeScript types. For hints in a plain `.js` tour, add this at the top:

```js
/// <reference types="onetake" />
```

You get completion for every step and option, and for `onetake.config.js`:

```js
/** @type {import('onetake').Config} */
module.exports = { url: 'http://localhost:3000', tour: 'tour.js' };
```
