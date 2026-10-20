take
  .click('text=Change status')
  .click('role=menuitem[name="Published"]')
  .expect('#status', { text: 'Published' })
  .expect('role=menu', { visible: false });
