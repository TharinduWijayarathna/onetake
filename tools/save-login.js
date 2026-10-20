#!/usr/bin/env node
/**
 * Save a logged-in browser session for the recorder (Playwright storageState).
 *
 * Sign in by hand once:
 *   node tools/save-login.js --url http://localhost/login --until /dashboard --out demo/auth.json
 *
 * Check whether a saved session still works (exit 0 = logged in, 1 = not):
 *   node tools/save-login.js --check http://localhost/dashboard --login /login --out demo/auth.json
 *
 * Then record with:  node tools/record.js ... --storage demo/auth.json
 *
 * Options
 *   --url <url>        login page to open (sign-in mode)
 *   --until <regex>    URL pattern that means "signed in" (default: anything that isn't the login page)
 *   --out <file>       where to save the session (default ./auth.json). Keep it private.
 *   --check <url>      check mode: open this page with the saved session
 *   --login <regex>    check mode: being sent to a URL matching this means "not logged in" (default /login)
 *   --width/--height   window size (default 1440 x 900)
 */
const fs = require('fs');
const path = require('path');
const { fail, loadPlaywright } = require('./lib/common');

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const k = process.argv[i];
  if (k.startsWith('--')) args[k.slice(2)] = process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[++i] : true;
}
const out = path.resolve(args.out || 'auth.json');
const { chromium } = loadPlaywright();
const launch = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};

(async () => {
  if (args.check) {
    if (!fs.existsSync(out)) process.exit(1);
    const browser = await chromium.launch(launch);
    const page = await (await browser.newContext({ storageState: out })).newPage();
    await page.goto(args.check, { waitUntil: 'domcontentloaded' });
    const loggedOut = new RegExp(args.login || '/login').test(page.url());
    await browser.close();
    process.exit(loggedOut ? 1 : 0);
  }

  if (!args.url) fail('Usage: node tools/save-login.js --url <login page> [--until <regex>] [--out auth.json]');
  const browser = await chromium.launch({ ...launch, headless: false });
  const context = await browser.newContext({ viewport: { width: +(args.width || 1440), height: +(args.height || 900) } });
  const page = await context.newPage();
  await page.goto(args.url);
  const loginPath = new URL(page.url()).pathname;
  const done = args.until ? new RegExp(args.until) : null;
  console.log('Sign in in the browser window. Waiting…');
  await page.waitForURL(u => (done ? done.test(u.href) : u.pathname !== loginPath), { timeout: 10 * 60 * 1000 });
  await page.waitForLoadState('load');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await context.storageState({ path: out });
  console.log('✔ saved ' + out);
  await browser.close();
})().catch(e => fail(e.message));
