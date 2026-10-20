take
  .type('label=Your email', 'ada@example.com')
  .click('text=Subscribe')
  .expect('text=Subscribed ada@example.com');
