// OneTake settings for this demo. Every key can also be a command-line flag (onetake help).
// Docs: https://github.com/TharinduWijayarathna/onetake/blob/main/docs/recording.md
/** @type {import('onetake').Config} */
module.exports = {
  url: 'http://localhost:3000/',          // the page the tour starts on
  tour: 'tour.js',                        // one script, any number of page loads
  include: ['steps.js'],                  // reusable steps (OneTake.define)
  // storage: 'auth.json',                // signed-in session: record.sh creates it when LOGIN_PATH is set

  viewport: { width: 1440, height: 900 },
  scale: 2,                               // 2880x1800, crisp text (use --scale 1 for quick previews)
  fps: 60,
  seed: 7,                                // identical takes
  now: '2026-11-02T09:00',                // the app's clock: dates on screen never change

  name: 'demo',
  out: 'videos',
  frame: { background: 'gradient', title: 'My App' },
  intro: { title: 'My App', subtitle: 'Creating your first project' },
  outro: { title: 'Try My App', subtitle: 'myapp.example' },
  sound: true,

  options: { autoZoom: false }            // OneTake options in the page
};
