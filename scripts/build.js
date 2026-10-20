#!/usr/bin/env node
/**
 * Bundles src/library/*.js (in file-name order) into a single dependency-free UMD file: dist/onetake.js
 *   node scripts/build.js
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const pkg = require(path.join(root, 'package.json'));
const srcDir = path.join(root, 'src', 'library');
const parts = fs.readdirSync(srcDir).filter(f => f.endsWith('.js')).sort();

const header = `/*!
 * OneTake v${pkg.version}
 * Scripted, human-looking cursor, UI automation, highlights and camera zoom
 * for recording product demo videos in one take.
 * ${pkg.homepage || ''}
 * MIT License. Built from src/library/ by scripts/build.js — edit the sources, not this file.
 */
(function (global, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else if (typeof define === 'function' && define.amd) define(factory);
  else global.OneTake = factory();
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';
`;

const body = parts.map(f => `\n  /* ---- src/library/${f} ---- */\n` + fs.readFileSync(path.join(srcDir, f), 'utf8').replace(/\s+$/, '') + '\n').join('');

const footer = `
  OneTake.version = '${pkg.version}';
  return OneTake;
});
//# sourceURL=onetake.js
`;

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist', 'onetake.js'), header + body + footer);
console.log(`built dist/onetake.js from ${parts.length} module(s): ${parts.join(', ')}`);
