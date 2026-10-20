take
  .type('#pay >> label=Name on card', 'Ada Lovelace')
  .click('#pay >> text=Pay $40')
  .expect('text=Paid by Ada Lovelace');
