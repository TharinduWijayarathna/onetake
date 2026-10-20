take
  .expect('role=button[name="Add task"]', { enabled: false })
  .type('label=New task', 'Ship the demo')
  .check('label=Priority')
  .click('text=Add task')
  .expect('#list li', { count: 2 })
  .expect('label=New task', { value: '' });
