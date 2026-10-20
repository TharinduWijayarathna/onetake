take
  .clear('label=Seats')
  .type('label=Seats', '12')
  .select('label=Plan', 'Pro')
  .expect('#total', { text: '$324' })
  .expect('text=Volume discount applied');
