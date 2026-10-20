/* Run the CLI as a child process, like a user would (async: the fixture server lives in this process). */
const { spawn } = require('child_process');
const path = require('path');
const CLI = path.join(__dirname, '..', '..', 'tools', 'cli.js');
module.exports = function run(args) {
  return new Promise(resolve => {
    const p = spawn(process.execPath, [CLI, ...args]);
    let out = '';
    p.stdout.on('data', d => { out += d; });
    p.stderr.on('data', d => { out += d; });
    p.on('close', code => resolve({ code, out }));
  });
};
