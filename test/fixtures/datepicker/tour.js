take
  .click('label=Date')
  .click('.datepicker.active >> .datepicker-cell:not(.prev):not(.next) >> text=15')
  .expect('label=Date', { value: /-15$/ });
