// One script across three pages: list → form → confirmation.
take
  .chapter('List')
  .caption('Creating an inquiry')
  .expect('#today', { text: '2026-11-02' })
  .click('text=New inquiry')
  .chapter('Form')
  .type('label=Client name', 'Priya Raman')
  .type('label=Email', 'priya@lumen.dev')
  .select('label=Type', 'Quote')
  .type('label=Message', 'Two seats, please.')
  .click('role=button[name="Send inquiry"]')
  .chapter('Done')
  .expect('text*=Thanks, Priya')
  .expect('#when', { text: '2026-11-02' })
  .hideCaption()
  .thumbnail()
  .wait(300);
