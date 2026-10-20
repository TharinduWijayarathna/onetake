take
  .click('text=Delete project')                       // waits until the cookie banner is gone
  .click('role=dialog >> role=button[name="Delete"]') // waits for the dialog to stop moving
  .expect('text=0 projects');
