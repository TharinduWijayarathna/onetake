take
  .scrollUntil('text=Customer 140', { container: '#list' })
  .click('text=Customer 140')
  .expect('text=Selected Customer 140');
