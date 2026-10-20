// Demo tour for examples/demo.html. `take` is a ready OneTake instance.
//   npm run example                                   render it (recordings/example.mp4)
//   node tools/cli.js check examples/tour.js --url examples/demo.html --speed 4   dry run
//   npm run example -- --frame --sound --intro "Northwind CRM|Adding a contact"  the polished cut
//
// Zoom forms used below:
//   .zoom('#el', 15)          zoom on an element for 15 seconds, steps continue while zoomed
//   .zoom('#el')              stay zoomed until .zoomOut() or the next .zoom()
//   .zoom(4)                  zoom around the cursor for 4 seconds
//   .zoom('#el', 3, { scale: 1.6, block: true })   options: scale, padding, follow, block

take
  .chapter('Dashboard')
  .caption('Welcome to Northwind CRM — let’s add a new contact.')
  .wait(700)

  // 1) zoom(target, seconds): glide in on one card for 3.5 s, highlight it while zoomed
  .zoom('#revenue-card', 3.5, { scale: 1.5 })
  .circle('#revenue-card', { label: 'Your pipeline at a glance', duration: 2200 })
  .wait(800)                                     // let the 3.5 s zoom glide back out

  .chapter('Add a contact')
  .click('text=Contacts')
  .hideCaption()
  .click('#new-contact')
  .wait(300)

  // 2) zoom(target, seconds) on a component while we work inside it: 15 s on the form
  .zoom('#contact-form', 15)
  .type('label=Full name', 'Priya Raman')
  .type('label=Email', 'priya@lumen.dev')
  .type('label=Company', 'Lumen Labs')
  .select('label=Role', 'Decision maker')
  .check('input[value="Pro"]')
  .type('label=Notes', 'Met at DevConf. Interested in the analytics add-on.')
  .check('text=Subscribe to product newsletter')
  .box('#save', { label: 'Save when ready', duration: 1400, padding: 6 })
  .click('#save')
  .zoomOut()                                     // 3) zoomOut(): back to the full page right away
  .expect('#contact-table tbody tr:first-child', { text: 'Priya Raman' })   // fail loudly if saving didn't work

  // 4) zoom on the new row for 3 s and underline it while zoomed
  .zoom('#contact-table tbody tr:first-child', 3, { scale: 1.5 })
  .underline('#contact-table tbody tr:first-child', { duration: 2000, padding: 4 })
  .wait(1300)

  .chapter('Settings')
  .caption('Now let’s turn on the weekly summary.', { duration: 2600 })
  .click('text=Settings')
  .click('text=Notifications')

  // 5) zoom(target) with no time: stays zoomed until the next zoom() or zoomOut()
  .zoom('[data-panel="notifications"]')
  .spotlight('[data-panel="notifications"]', { duration: 1800, padding: 8 })
  .check('#n-weekly')
  .expect('#n-weekly', { checked: true })
  .arrow('#n-weekly', { from: 'left', label: 'Enabled!', duration: 1800, color: '#16a34a' })
  .thumbnail()
  .zoomOut()

  // 6) zoom(seconds): zoom in around wherever the cursor is
  .click('text=Billing')
  .zoom(4)
  .pulse('#manage-billing', { duration: 1600, padding: 6 })
  .wait(2600)

  .caption('That’s it — recorded without touching the mouse.', { duration: 2500 })
  .wait(2600);
