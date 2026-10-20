/*
 * Render from the studio: saves the studio browser's login (so the recorder starts
 * signed in, like you were), regenerates the scripts and runs tools/record.js.
 * Progress is kept in `status` for the toolbar to poll.
 */
const path = require('path');
const { spawn } = require('child_process');
const { generate } = require('./generate');

function createRenderer(session, context, outDir) {
  const status = { running: false, message: '', video: null, error: null };

  async function render(opts) {
    if (status.running) return status;
    opts = opts || {};
    const { files } = generate(session, outDir);
    const auth = path.join(outDir, 'auth.json');
    await context.storageState({ path: auth });              // your studio login, for the recorder
    const vp = session.data.viewport || { width: 1440, height: 900 };
    const args = [path.join(__dirname, '..', 'record.js'), '--url', session.data.url, '--storage', auth,
      ...files.flatMap(f => ['--script', path.join(outDir, f)]),
      '--width', String(vp.width), '--height', String(vp.height),
      '--scale', String(opts.scale || 2), '--fps', String(opts.fps || 60), '--seed', '7',
      '--out', path.join(outDir, 'videos'), '--name', opts.name || 'demo'];
    if (opts.max) args.push('--max', String(opts.max));
    Object.assign(status, { running: true, message: 'Starting render…', video: null, error: null });

    const child = spawn(process.execPath, args, { env: process.env });
    const onLine = buf => String(buf).split('\n').map(l => l.trim()).filter(Boolean).forEach(l => {
      const m = l.match(/… ([\d.]+)s of video/);
      if (m) status.message = `Rendering… ${m[1]} s of video`;
      const saved = l.match(/✔ saved (\S+\.mp4)/);
      if (saved) status.video = saved[1];
      if (/✖/.test(l)) status.error = l.replace(/^✖\s*/, '');
      process.stdout.write('  [render] ' + l + '\n');
    });
    child.stdout.on('data', onLine);
    child.stderr.on('data', onLine);
    child.on('close', code => {
      status.running = false;
      if (code === 0 && status.video) status.message = 'Saved ' + path.relative(process.cwd(), status.video);
      else status.message = 'Render failed: ' + (status.error || 'exit code ' + code);
    });
    return status;
  }

  return { render, status };
}

module.exports = { createRenderer };
