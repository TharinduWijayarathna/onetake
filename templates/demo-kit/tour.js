// The tour. `take` is a ready OneTake instance; one script can cross page loads.
// Rehearse:  npx onetake check --speed 4      Render:  bash record.sh
// API: https://github.com/TharinduWijayarathna/one-take/blob/main/docs/api.md

take
  .chapter('Create a project')
  .caption('Let’s create a project in under a minute.', { duration: 2600 })
  .wait(600)
  .click('text=New project')
  .expect('role=heading[name="New project"]')        // fail loudly if we're not where we think

  .zoom('form', 14)                                  // frame the component you're working in
  .fill({ 'Project name': 'Apollo launch', 'Description': 'Marketing site for the Q4 launch' })
  .choose('Template', 'Marketing site')
  .check('label=Notify the team')
  .box('role=button[name="Create project"]', { label: 'Create it', duration: 1400 })
  .click('role=button[name="Create project"]')       // a page load is fine: the tour continues

  .chapter('The result')
  .expect('text=Apollo launch')
  .caption('Your project is ready.', { duration: 2400 })
  .circle('text=Apollo launch', { label: 'Your new project' })
  .thumbnail()
  .wait(1200);
