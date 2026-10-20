#!/usr/bin/env node
/**
 * v1-compatible entry point: same as `onetake record` (see tools/cli.js and docs/recording.md).
 *
 *   node tools/record.js --url http://localhost:3000 --script my-tour.js [--script page2.js] [options]
 */
require('./cli').main(['record', ...process.argv.slice(2)]).catch(e => { console.error('✖ ' + e.message); process.exit(1); });
