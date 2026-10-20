// OneTake page script, page 1. `take` is a ready OneTake instance.
// One script per page load: the click that navigates is the last step; the next script
// (2-page.js, …) continues on the new page. Rehearse quickly in a browser console with
//   new OneTake({ speed: 3 })… before rendering.

// ── Helpers you'll often need (delete what you don't use) ───────────────────────────────
const live = window.__OT_CAMERA !== 'external';           // false when tools/record.js renders the camera
const byText = (selector, text) => () =>                 // exact-text match inside a selector
  [...document.querySelectorAll(selector)].find(el => el.innerText.trim() === text);
const section = (formSelector, startsWith) => () =>       // a form's direct child that starts with a label
  [...document.querySelector(formSelector).children].find(el => (el.innerText || '').trim().startsWith(startsWith));

// ── The tour ────────────────────────────────────────────────────────────────────────────
take
  .caption('What this part of the demo shows, in one short sentence.')
  .wait(800)
  .zoom('form')                                           // frame the component you're about to work in
  .type('label=Name', 'Jane Doe')
  .type('label=Email', 'jane@example.com')
  .select('label=Plan', 'Pro')
  .check('text=I agree to the terms')
  .zoomOut()
  .box('button[type=submit]', { label: 'Save', duration: 1400, padding: 6 })
  .click('button[type=submit]');                         // navigates → next script

// Custom dropdowns and pop-ups (date pickers, comboboxes) render outside the zoomed element.
// On live pages, zoom out before opening one:   if (live) take.zoomOut();
