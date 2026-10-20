take
  .drag('text=Record the demo', '#done')
  .expect('#done >> text=Record the demo')
  .drag('#knob', '#track', { to: { x: 0.75, y: 0.5 } })
  .expect('#vol', { text: /^7\d|^80$/ });
