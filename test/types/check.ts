// Compile-only check of the public types: npx -p typescript tsc --noEmit -p test/types
import OneTake = require('onetake');

const t = new OneTake({ speed: 1.5, autoZoom: { scale: 1.6 } });
t.click('text=Save', { force: true })
  .type('label=Email', 'a@b.co', { clear: true })
  .expect('#total', { text: /£4,000/ })
  .zoom('#form', 6, { scale: 1.8 })
  .zoom(3)
  .drag('#card', '#done', { to: { x: 0.5, y: 0.2 } })
  .upload('text=Attach', ['a.pdf', { name: 'n.md', content: '# hi' }])
  .use((take, name: string) => { take.caption(name); }, 'Priya')
  .chapter('Billing')
  .thumbnail();
OneTake.define('signIn', (take, email: string) => { take.type('label=Email', email); });
const el: Element | null = OneTake.query('role=button[name="Go"]');
take.wait(100).then(() => console.log(el));
const cfg: OneTake.Config = { url: 'http://localhost:3000', tour: 'tour.js', frame: { background: 'ocean' }, formats: ['mp4', 'gif'] };
void cfg;
