#!/usr/bin/env node
/**
 * Builds the documentation website from docs/*.md: a page per doc, with a
 * sidebar, search, "on this page" contents, highlighted code and light/dark themes.
 *
 *   node scripts/build-site.js              → site/: one folder per page (site/mcp/index.html …), md/, llms.txt
 *                                             (GitHub Pages; see .github/workflows/pages.yml)
 *   node scripts/build-site.js --fragment   → site/fragment.html: every page in one file, for previews
 *
 * No dependencies: the Markdown subset used in docs/ (headings, paragraphs, lists, tables,
 * fenced code, quotes, inline code, bold, italics, links) is converted here.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DOCS = path.join(ROOT, 'docs');
const OUT = path.join(ROOT, 'site');
const pkg = require(path.join(ROOT, 'package.json'));
const REPO = 'https://github.com/TharinduWijayarathna/onetake';
const SITE = 'https://tharinduwijayarathna.github.io/onetake/';
const fragment = process.argv.includes('--fragment');

/* ---------- navigation ---------- */

const NAV = [
  ['Prologue', [['introduction', 'Introduction']]],
  ['Getting started', [['getting-started', 'Installation & first video'], ['writing-tours', 'Writing tours']]],
  ['The basics', [['targets', 'Targets'], ['waiting-and-assertions', 'Waiting & assertions'], ['camera-and-highlights', 'Camera, highlights & captions']]],
  ['The recorder', [['recording', 'Recording'], ['output', 'Output']]],
  ['Guides', [['recipes', 'Recipes'], ['ai-agents', 'AI agents'], ['mcp', 'MCP server'], ['troubleshooting', 'Troubleshooting']]],
  ['Reference', [['api', 'API reference'], ['architecture', 'Architecture'], ['contributing', 'Contributing']]]
];

/* ---------- helpers ---------- */

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const slug = h => h.toLowerCase().replace(/<[^>]+>/g, '').replace(/[`*_]/g, '').replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/\s/g, '-');

/** A docs link → a site link: other pages become #page or #page.section; repo files go to GitHub. */
function href(url, page) {
  if (/^(https?:|mailto:)/.test(url)) return url;
  if (url.startsWith('#')) return '#' + page + '.' + url.slice(1);
  const [file, anchor] = url.split('#');
  const name = path.basename(file, '.md');
  if (file.endsWith('.md') && path.dirname(path.normalize(path.join('docs', file))) === 'docs') {
    const id = name === 'README' ? 'introduction' : name;
    return '#' + id + (anchor ? '.' + anchor : '');
  }
  const repoPath = path.normalize(path.join('docs', file)).replace(/\\/g, '/');
  return `${REPO}/blob/main/${repoPath}${anchor ? '#' + anchor : ''}`;
}

/* ---------- syntax highlighting (build time) ---------- */

const JS_KW = new Set('const let var function return if else for while of in new await async true false null undefined this typeof import export from require module exports class extends try catch throw switch case break continue default'.split(' '));

function highlight(code, lang) {
  lang = (lang || '').toLowerCase();
  if (['js', 'javascript', 'ts', 'typescript', 'json'].includes(lang)) return hlJs(code);
  if (['bash', 'sh', 'shell', 'zsh'].includes(lang)) return hlBash(code);
  if (['html', 'xml'].includes(lang)) return hlHtml(code);
  if (['yaml', 'yml'].includes(lang)) return hlYaml(code);
  return esc(code);
}
const span = (cls, s) => `<span class="t-${cls}">${esc(s)}</span>`;

function hlJs(src) {
  let out = '', i = 0;
  const re = /(\/\*[\s\S]*?\*\/|\/\/[^\n]*)|('(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`(?:\\.|[^`\\])*`)|(\/(?![*/])(?:\\.|\[(?:\\.|[^\]])*\]|[^/\\\n])+\/[gimsuy]*)(?=\s*[,);.\]]|\s*$)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)(\s*\()?|([\s\S])/gm;
  let m;
  while ((m = re.exec(src))) {
    if (m[1]) out += span('com', m[1]);
    else if (m[2]) out += span('str', m[2]);
    else if (m[3]) out += span('str', m[3]);
    else if (m[4]) out += span('num', m[4]);
    else if (m[5]) {
      if (JS_KW.has(m[5])) out += span('kw', m[5]);
      else if (m[6]) out += span('fn', m[5]);
      else out += esc(m[5]);
      if (m[6]) out += esc(m[6]);
    } else out += esc(m[7]);
    i = re.lastIndex;
  }
  return out;
}

function hlBash(src) {
  return src.split('\n').map(line => {
    let out = '', first = true;
    const re = /(#.*$)|('[^']*'|"(?:\\.|[^"\\])*")|(--?[\w-]+(?:=\S*)?)|(\$\{?[\w@]+\}?)|(\S+)|(\s+)/g;
    let m;
    while ((m = re.exec(line))) {
      if (m[1] && (first || /\s$/.test(out) || out === '')) out += span('com', m[1]);
      else if (m[2]) out += span('str', m[2]);
      else if (m[3]) out += span('flag', m[3]);
      else if (m[4]) out += span('var', m[4]);
      else if (m[5]) { out += first && !/^[|&;()]/.test(m[5]) ? span('fn', m[5]) : esc(m[5]); first = /^(&&|\|\||\||;)$/.test(m[5]); }
      else if (m[6]) out += m[6];
      else if (m[1]) out += esc(m[1]);
    }
    return out;
  }).join('\n');
}

function hlHtml(src) {
  return src.replace(/(<!--[\s\S]*?-->)|(<script\b[^>]*>)([\s\S]*?)(<\/script>)|(<\/?[\w-]+)([^>]*?)(\/?>)|([^<]+)/g,
    (all, com, so, body, sc, tag, attrs, close, text) => {
      if (com) return span('com', com);
      if (so) return hlHtml(so) + hlJs(body) + hlHtml(sc);
      if (tag) return span('kw', tag) + esc(attrs).replace(/([\w-]+)(=)(&quot;.*?&quot;|'[^']*')/g, '<span class="t-fn">$1</span>$2<span class="t-str">$3</span>') + span('kw', close);
      return esc(text);
    });
}

function hlYaml(src) {
  return src.split('\n').map(l => {
    const c = l.match(/^(\s*)(#.*)$/);
    if (c) return c[1] + span('com', c[2]);
    const m = l.match(/^(\s*-?\s*)([\w.-]+)(:)(.*)$/);
    if (m) return esc(m[1]) + span('fn', m[2]) + m[3] + esc(m[4]).replace(/(\$\{\{.*?\}\})/g, '<span class="t-var">$1</span>');
    return esc(l);
  }).join('\n');
}

/* ---------- Markdown → HTML ---------- */

function inline(s, page) {
  const codes = [];
  s = s.replace(/`([^`]+)`/g, (m, c) => { codes.push(`<code>${esc(c)}</code>`); return `\u0000${codes.length - 1}\u0000`; });
  s = esc(s);
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, t, u) => {
    const h = href(u.replace(/&amp;/g, '&'), page);
    const ext = /^https?:/.test(h) ? ' target="_blank" rel="noopener"' : '';
    return `<a href="${esc(h)}"${ext}>${t}</a>`;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/(^|[^\w*])\*([^*\s][^*]*)\*(?!\w)/g, '$1<em>$2</em>');
  return s.replace(/\u0000(\d+)\u0000/g, (m, i) => codes[+i]);
}

function convert(md, page) {
  const lines = md.replace(/\r/g, '').split('\n');
  const out = [], toc = [];
  let title = null, i = 0;

  const isBlockStart = l => /^(#{1,6}\s|```|\||>|\s*[-*]\s|\s*\d+\.\s|---\s*$)/.test(l);

  function list(start) {
    // Collect an indented list block and render it recursively.
    const ordered = /^\s*\d+\.\s/.test(lines[start]);
    const base = lines[start].match(/^\s*/)[0].length;
    const items = [];
    let j = start;
    while (j < lines.length) {
      const l = lines[j];
      const ind = l.match(/^\s*/)[0].length;
      const m = l.match(/^\s*(?:[-*]|\d+\.)\s+(.*)$/);
      if (m && ind === base) { items.push([m[1]]); j++; continue; }
      if (l.trim() === '') {
        const next = lines[j + 1] || '';
        if (next.match(/^\s*/)[0].length > base && next.trim()) { items[items.length - 1].push(''); j++; continue; }
        break;
      }
      if (ind > base && items.length) { items[items.length - 1].push(l.slice(Math.min(ind, base + 2))); j++; continue; }
      break;
    }
    const html = items.map(it => {
      const [first, ...rest] = it;
      const body = rest.length ? convert(rest.join('\n'), page).html : '';
      return `<li>${inline(first, page)}${body}</li>`;
    }).join('');
    return { html: ordered ? `<ol>${html}</ol>` : `<ul>${html}</ul>`, next: j };
  }

  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) { i++; continue; }
    if (/^\s*</.test(l) && !/^\s*<\w+@/.test(l)) { i++; continue; }              // raw HTML (README header): skip
    let m;
    if ((m = l.match(/^```(\w*)/))) {
      const lang = m[1], buf = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) buf.push(lines[i++]);
      i++;
      const code = buf.join('\n');
      out.push(`<div class="code"><div class="code-bar"><span>${esc(lang || 'text')}</span><button class="copy" type="button" aria-label="Copy code">Copy</button></div><pre><code>${highlight(code, lang)}</code></pre></div>`);
      continue;
    }
    if ((m = l.match(/^(#{1,6})\s+(.*)$/))) {
      const level = m[1].length, text = m[2].trim();
      if (level === 1 && !title) { title = text; i++; continue; }
      const id = page + '.' + slug(text);
      if (level <= 3) toc.push({ level, text: inline(text, page).replace(/<[^>]+>/g, ''), id });
      out.push(`<h${level} id="${esc(id)}"><a class="anchor" href="#${esc(id)}" aria-label="Link to this section">#</a>${inline(text, page)}</h${level}>`);
      i++;
      continue;
    }
    if (/^---\s*$/.test(l)) { out.push('<hr>'); i++; continue; }
    if (l.startsWith('|')) {
      const rows = [];
      while (i < lines.length && lines[i].startsWith('|')) rows.push(lines[i++]);
      const cells = r => r.replace(/^\||\|\s*$/g, '').split(/(?<!\\)\|/).map(c => c.trim().replace(/\\\|/g, '|'));
      const head = cells(rows[0]), body = rows.slice(2).map(cells);
      const empty = head.every(h => !h);
      out.push(`<div class="table"><table>${empty ? '' : `<thead><tr>${head.map(h => `<th>${inline(h, page)}</th>`).join('')}</tr></thead>`}<tbody>${body.map(r => `<tr>${r.map(c => `<td>${inline(c, page)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
      continue;
    }
    if (l.startsWith('>')) {
      const buf = [];
      while (i < lines.length && lines[i].startsWith('>')) buf.push(lines[i++].replace(/^>\s?/, ''));
      out.push(`<aside class="note">${convert(buf.join('\n'), page).html}</aside>`);
      continue;
    }
    if (/^\s*([-*]|\d+\.)\s/.test(l)) { const r = list(i); out.push(r.html); i = r.next; continue; }
    const buf = [];
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) buf.push(lines[i++].trim());
    if (!buf.length) { buf.push(lines[i++].trim()); }
    out.push(`<p>${inline(buf.join(' '), page)}</p>`);
  }
  return { html: out.join('\n'), toc, title };
}

/* ---------- pages ---------- */

function readPage(id) {
  if (id === 'introduction') {
    // The README's pitch, example and "why", without the repo-only parts.
    let md = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
    md = md.replace(/^[\s\S]*?\n---\n/, '');                       // logo header
    md = md.replace(/\n## Documentation[\s\S]*?(?=\n## )/, '\n');  // the docs table (the sidebar has it)
    md = md.replace(/\n## (Project layout|Development|License)[\s\S]*?(?=\n## |$)/g, '');
    md = md.replace(/\]\((docs\/)/g, '](').replace(/\]\(\.\.\//g, '](');
    return '# Introduction\n\n' + md.replace(/\]\(([\w-]+\.md)/g, ']($1');
  }
  return fs.readFileSync(path.join(DOCS, id + '.md'), 'utf8');
}

function build() {
  const pages = [];
  for (const [group, items] of NAV) for (const [id, label] of items) {
    const md = readPage(id);
    const { html, toc, title } = convert(md, id);
    pages.push({ id, label, group, title: title || label, html, toc, md });
  }
  // README links point at docs/*.md from the repo root; inside the intro they're page links.
  pages[0].html = pages[0].html.replace(/href="https:\/\/github\.com\/TharinduWijayarathna\/onetake\/blob\/main\/docs\/([\w-]+)\.md(?:#([\w-]+))?"/g,
    (m, p, a) => `href="#${p}${a ? '.' + a : ''}"`);

  const search = [];
  for (const p of pages) {
    search.push({ t: p.title, id: p.id, g: p.group });
    for (const h of p.toc) search.push({ t: h.text, id: h.id, g: p.title });
  }
  const icon = fs.readFileSync(path.join(ROOT, 'assets', 'icon.svg'), 'utf8').replace(/<\?xml[^>]*>/, '').replace(/<title>.*?<\/title>/, '')
    .replace(/width="64" height="64"/, 'width="28" height="28"').replace(/id="ot-g"/, 'id="ot-site-g"').replace(/url\(#ot-g\)/, 'url(#ot-site-g)');

  /* Links are written as "#page" / "#page.section"; the multi-page site turns them into real paths. */
  const multi = !fragment;
  const pathFor = (from, target) => {
    if (!multi) return '#' + target;
    const [pg, ...rest] = target.split('.');
    const sec = rest.join('.');
    const up = from === 'introduction' ? '' : '../';
    if (pg === from) return '#' + (sec || 'top');
    return (up + (pg === 'introduction' ? '' : pg + '/') || './') + (sec ? '#' + sec : '');
  };
  const localize = (html, from) => !multi ? html : html
    .replace(/href="#([\w-]+(?:\.[^"]*)?)"/g, (m, t) => `href="${esc(pathFor(from, t))}"`)
    .replace(/id="([\w-]+)\.([^"]+)"/g, (m, pg, sec) => (pg === from ? `id="${sec}"` : m));

  const nav = from => NAV.map(([group, items]) => `<div class="nav-group"><h4>${esc(group)}</h4><ul>${items.map(([id, label]) =>
    `<li><a href="${esc(multi ? pathFor(from, id) : '#' + id)}" data-page="${id}"${multi && id === from ? ' class="active" aria-current="page"' : ''}>${esc(label)}</a></li>`).join('')}</ul></div>`).join('');

  const article = (p, n, from) => {
    const prev = pages[n - 1], next = pages[n + 1];
    const toc = p.toc.filter(h => h.level === 2 || h.level === 3);
    return localize(`<article class="page" id="page-${p.id}" data-page="${p.id}"${multi ? '' : ' hidden'}>
  <p class="eyebrow">${esc(p.group)}</p>
  <h1>${inline(p.title, p.id)}</h1>
  ${p.html}
  <nav class="pager" aria-label="Pages">
    ${prev ? `<a class="prev" href="#${prev.id}"><small>Previous</small>${esc(prev.label)}</a>` : '<span></span>'}
    ${next ? `<a class="next" href="#${next.id}"><small>Next</small>${esc(next.label)}</a>` : '<span></span>'}
  </nav>
  <p class="edit"><a href="${REPO}/edit/main/${p.id === 'introduction' ? 'README.md' : 'docs/' + p.id + '.md'}" target="_blank" rel="noopener">Edit this page on GitHub</a></p>
  <template class="toc">${toc.map(h => `<li class="l${h.level}"><a href="#${esc(h.id)}">${esc(h.text)}</a></li>`).join('')}</template>
</article>`, from);
  };

  const shell = (from, main) => `
<div class="topbar"><div class="topbar-inner">
  <button class="menu" type="button" aria-label="Open the menu" aria-expanded="false" aria-controls="sidebar"><span></span><span></span><span></span></button>
  <a class="brand" href="${esc(multi ? pathFor(from, 'introduction') : '#introduction')}">${icon}<span>One<b>Take</b></span></a>
  <span class="version">v${esc(pkg.version)}</span>
  <button class="search-open" type="button" aria-label="Search the documentation"><svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M13 13l4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><span>Search the docs</span><kbd>/</kbd></button>
  <nav class="top-links" aria-label="Links">
    <a href="${esc(multi ? pathFor(from, 'api') : '#api')}">API</a>
    <a href="${esc(multi ? pathFor(from, 'mcp') : '#mcp')}">MCP</a>
    <a href="${REPO}" target="_blank" rel="noopener">GitHub</a>
    <button class="theme" type="button" aria-label="Switch between light and dark"><svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M10 3a7 7 0 1 0 7 7 5.5 5.5 0 0 1-7-7z" fill="currentColor"/></svg></button>
  </nav>
</div></div>
<div class="layout">
  <aside class="sidebar" id="sidebar" aria-label="Documentation">${nav(from)}</aside>
  <main class="content" id="content">${main}</main>
  <aside class="onpage" aria-label="On this page"><h4>On this page</h4><ul id="onpage"></ul></aside>
</div>
<div class="search" id="search" hidden>
  <div class="search-box" role="dialog" aria-modal="true" aria-label="Search">
    <input id="search-input" type="search" placeholder="Search: zoom, upload, --aspect, expect…" autocomplete="off" spellcheck="false">
    <ul id="search-results"></ul>
    <p class="search-hint"><kbd>↑</kbd><kbd>↓</kbd> to move · <kbd>Enter</kbd> to open · <kbd>Esc</kbd> to close</p>
  </div>
</div>
<script>window.__SEARCH = ${JSON.stringify(search)}; window.__MULTI = ${multi}; window.__PAGE = ${JSON.stringify(from)}; window.__BASE = ${JSON.stringify(from === 'introduction' ? '' : '../')};</script>
<script>${CLIENT_JS}</script>`;

  const head = title => `<title>${esc(title)}</title>
<meta name="claude:viewport-fit-sides" content="cover">
<meta name="description" content="OneTake documentation: script product demo videos with a human-like cursor, camera zoom, highlights and a 60 fps recorder.">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap">
<style>${CSS}</style>`;

  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  if (fragment) {
    fs.writeFileSync(path.join(OUT, 'fragment.html'), head('OneTake Docs') + shell('introduction', pages.map((p, n) => article(p, n, p.id)).join('\n')));
    console.log('built site/fragment.html');
    return;
  }
  const favicon = 'data:image/svg+xml;base64,' + Buffer.from(fs.readFileSync(path.join(ROOT, 'assets', 'icon.svg'))).toString('base64');
  const doc = (title, from, main, canonical) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<link rel="icon" href="${favicon}">
<link rel="canonical" href="${SITE}${canonical}">
${head(title)}
</head>
<body id="top">${shell(from, main)}
</body>
</html>
`;
  pages.forEach((p, n) => {
    const dir = p.id === 'introduction' ? OUT : path.join(OUT, p.id);
    fs.mkdirSync(dir, { recursive: true });
    const title = p.id === 'introduction' ? 'OneTake Docs' : `${p.title} · OneTake Docs`;
    fs.writeFileSync(path.join(dir, 'index.html'), doc(title, p.id, article(p, n, p.id), p.id === 'introduction' ? '' : p.id + '/'));
  });

  /* Plain-text copies for agents and tools: every page as Markdown, llms.txt and llms-full.txt. */
  const mdDir = path.join(OUT, 'md');
  fs.mkdirSync(mdDir, { recursive: true });
  for (const p of pages) fs.writeFileSync(path.join(mdDir, p.id + '.md'), p.md);
  fs.writeFileSync(path.join(OUT, 'llms.txt'), [
    '# OneTake', '',
    '> Script product demo videos for web apps: a human-like cursor drives the real UI, a smooth camera zooms on what matters, highlights and captions guide the viewer, and a frame-by-frame recorder renders a 60 fps MP4. `onetake mcp` is an MCP server for agents.', '',
    '## Docs', '',
    ...pages.map(p => `- [${p.title}](${SITE}md/${p.id}.md): ${p.group}`), '',
    `Everything in one file: ${SITE}llms-full.txt`, `Source: ${REPO}`, ''
  ].join('\n'));
  fs.writeFileSync(path.join(OUT, 'llms-full.txt'), pages.map(p => p.md.trim()).join('\n\n---\n\n') + '\n');
  fs.writeFileSync(path.join(OUT, '404.html'), doc('Not found · OneTake Docs', 'introduction',
    '<article class="page"><p class="eyebrow">404</p><h1>Page not found</h1><p>That page doesn’t exist. <a href="' + SITE + '">Go to the introduction</a> or press <kbd>/</kbd> to search.</p></article>', '404.html')
    .replace(/(href|src)="(?!https?:|#|data:)([^"]*)"/g, (m, a, u) => `${a}="${SITE}${u.replace(/^\.\//, '')}"`).replace('window.__BASE = ""', 'window.__BASE = ' + JSON.stringify(SITE)));
  fs.writeFileSync(path.join(OUT, '.nojekyll'), '');
  console.log(`built site/ (${pages.length} pages, md/, llms.txt, llms-full.txt)`);
}

/* ---------- styles ---------- */

const CSS = `
/* Layout: Laravel-docs style — sticky top bar, sidebar of grouped pages, reading column, "on this page" rail. */
:root {
  --bg: #fbfbfe; --surface: #ffffff; --sunken: #f3f3f9; --line: #e4e4ee; --line-strong: #d3d3e2;
  --fg: #1b1b2b; --muted: #5d5d78; --faint: #8a8aa3;
  --accent: #4f46e5; --accent-soft: #eef0ff; --accent-ink: #3730a3;
  --code-bg: #15152a; --code-fg: #e7e7f5; --code-bar: #1d1d36;
  --t-kw: #c4b5fd; --t-str: #86efac; --t-com: #8285a8; --t-num: #fda4af; --t-fn: #93c5fd; --t-flag: #fcd34d; --t-var: #f9a8d4;
  --note-bg: #f4f3ff; --note-line: #c7c2ff;
  --font-body: "Figtree", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  --top: 60px;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  --bg: #0e0e19; --surface: #14142a; --sunken: #1a1a33; --line: #26264a; --line-strong: #34345e;
  --fg: #e9e9f6; --muted: #a6a6c6; --faint: #75759a;
  --accent: #a5b4fc; --accent-soft: #1f1f45; --accent-ink: #c7d2fe;
  --code-bg: #0a0a16; --code-bar: #12122a; --note-bg: #17173a; --note-line: #3f3f8a; color-scheme: dark } }
:root[data-theme="dark"] {
  --bg: #0e0e19; --surface: #14142a; --sunken: #1a1a33; --line: #26264a; --line-strong: #34345e;
  --fg: #e9e9f6; --muted: #a6a6c6; --faint: #75759a;
  --accent: #a5b4fc; --accent-soft: #1f1f45; --accent-ink: #c7d2fe;
  --code-bg: #0a0a16; --code-bar: #12122a; --note-bg: #17173a; --note-line: #3f3f8a; color-scheme: dark }
:root[data-theme="light"] { color-scheme: light }

* { box-sizing: border-box; }
html { scroll-padding-top: calc(var(--top) + 24px); }
body { margin: 0; background: var(--bg); color: var(--fg); font: 16px/1.7 var(--font-body); -webkit-font-smoothing: antialiased; }
body::before { content: ""; position: fixed; inset: 0 0 auto; height: env(safe-area-inset-top, 0px); z-index: 30; background: var(--surface); }
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; text-underline-offset: 3px; }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 4px; }
kbd { font: 500 11px/1 var(--font-mono); padding: 3px 6px; border: 1px solid var(--line-strong); border-bottom-width: 2px; border-radius: 5px; color: var(--muted); background: var(--surface); }

/* top bar */
.topbar { position: sticky; top: env(safe-area-inset-top, 0px); z-index: 20; height: var(--top);
  background: color-mix(in srgb, var(--surface) 88%, transparent); backdrop-filter: saturate(1.4) blur(10px); border-bottom: 1px solid var(--line); }
.topbar-inner { max-width: 1440px; height: 100%; margin: 0 auto; display: flex; align-items: center; gap: 16px;
  padding-left: max(24px, env(safe-area-inset-left, 0px)); padding-right: max(20px, env(safe-area-inset-right, 0px)); }
.brand { display: flex; align-items: center; gap: 10px; color: var(--fg); font-weight: 800; font-size: 19px; letter-spacing: -.02em; }
.brand:hover { text-decoration: none; }
.brand b { color: var(--accent); font-weight: 800; }
.version { font: 500 12px var(--font-mono); color: var(--muted); padding: 2px 8px; border: 1px solid var(--line); border-radius: 999px; }
.search-open { margin-left: auto; display: flex; align-items: center; gap: 10px; min-width: 0; width: min(340px, 40vw); padding: 7px 10px 7px 12px;
  font: inherit; font-size: 14px; color: var(--faint); background: var(--sunken); border: 1px solid var(--line); border-radius: 10px; cursor: pointer; }
.search-open span { flex: 1; text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.search-open:hover { border-color: var(--line-strong); }
.top-links { display: flex; align-items: center; gap: 18px; font-weight: 600; font-size: 14px; }
.top-links a { color: var(--muted); }
.top-links a:hover { color: var(--fg); text-decoration: none; }
.theme { display: grid; place-items: center; width: 34px; height: 34px; border: 1px solid var(--line); border-radius: 9px; background: var(--surface); color: var(--muted); cursor: pointer; }
.menu { display: none; flex-direction: column; gap: 4px; padding: 8px; background: none; border: 0; cursor: pointer; }
.menu span { width: 18px; height: 2px; background: var(--fg); border-radius: 2px; }

/* three columns */
.layout { display: grid; grid-template-columns: 270px minmax(0, 1fr) 230px; max-width: 1440px; margin: 0 auto; }
.sidebar { position: sticky; top: calc(var(--top) + env(safe-area-inset-top, 0px)); align-self: start; height: calc(100vh - var(--top)); overflow-y: auto;
  padding: 28px 20px 40px max(24px, env(safe-area-inset-left, 0px)); border-right: 1px solid var(--line); }
.sidebar, .onpage { scrollbar-width: thin; scrollbar-color: var(--line-strong) transparent; }
.sidebar::-webkit-scrollbar, .onpage::-webkit-scrollbar { width: 6px; }
.sidebar::-webkit-scrollbar-thumb, .onpage::-webkit-scrollbar-thumb { background: var(--line-strong); border-radius: 6px; }
.nav-group + .nav-group { margin-top: 26px; }
.nav-group h4 { margin: 0 0 8px; font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--fg); }
.nav-group ul { list-style: none; margin: 0; padding: 0; border-left: 1px solid var(--line); }
.nav-group a { display: block; margin-left: -1px; padding: 5px 0 5px 14px; font-size: 14.5px; color: var(--muted); border-left: 2px solid transparent; }
.nav-group a:hover { color: var(--fg); text-decoration: none; border-left-color: var(--line-strong); }
.nav-group a.active { color: var(--accent); font-weight: 600; border-left-color: var(--accent); }

.content { min-width: 0; padding: 40px clamp(20px, 4vw, 64px) 80px; }
.page { max-width: 780px; margin: 0 auto; }
.onpage { position: sticky; top: calc(var(--top) + env(safe-area-inset-top, 0px)); align-self: start; max-height: calc(100vh - var(--top)); overflow-y: auto;
  padding: 36px max(20px, env(safe-area-inset-right, 0px)) 40px 8px; font-size: 13.5px; }
.onpage h4 { margin: 0 0 10px; font-size: 12px; letter-spacing: .08em; text-transform: uppercase; color: var(--faint); }
.onpage ul { list-style: none; margin: 0; padding: 0; }
.onpage li { margin: 0; }
.onpage li.l3 { padding-left: 12px; }
.onpage a { display: block; padding: 4px 0; color: var(--muted); line-height: 1.4; }
.onpage a.active { color: var(--accent); font-weight: 600; }

/* article typography */
.eyebrow { margin: 0 0 6px; font-size: 13px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--accent); }
.page h1 { margin: 0 0 22px; font-size: clamp(30px, 4.4vw, 40px); line-height: 1.15; letter-spacing: -.025em; font-weight: 800; text-wrap: balance; }
.page h2 { margin: 52px 0 14px; padding-top: 30px; border-top: 1px solid var(--line); font-size: 25px; line-height: 1.25; letter-spacing: -.015em; font-weight: 700; text-wrap: balance; }
.page h3 { margin: 34px 0 10px; font-size: 19px; line-height: 1.3; font-weight: 700; }
.page h4 { margin: 26px 0 8px; font-size: 16px; }
.page h2, .page h3, .page h4 { position: relative; }
.anchor { position: absolute; left: -1.1em; width: 1em; color: var(--faint); opacity: 0; font-weight: 500; }
:is(h2, h3, h4):hover .anchor, .anchor:focus { opacity: 1; text-decoration: none; }
.page p, .page li { color: var(--fg); }
.page p { margin: 0 0 16px; }
.page ul, .page ol { margin: 0 0 18px; padding-left: 22px; }
.page li { margin: 5px 0; }
.page li > ul, .page li > ol { margin: 6px 0; }
.page li::marker { color: var(--faint); }
.page strong { font-weight: 700; }
.page hr { border: 0; border-top: 1px solid var(--line); margin: 36px 0; }
.page :not(pre) > code { font: 500 .86em var(--font-mono); padding: .12em .38em; border-radius: 6px; background: var(--sunken); border: 1px solid var(--line); color: var(--accent-ink); overflow-wrap: anywhere; }
.page a code { color: inherit; }

.code { margin: 0 0 22px; border-radius: 12px; overflow: hidden; background: var(--code-bg); border: 1px solid color-mix(in srgb, var(--code-bg) 70%, var(--line)); }
.code-bar { display: flex; justify-content: space-between; align-items: center; padding: 6px 8px 6px 16px; background: var(--code-bar);
  font: 500 11px var(--font-mono); letter-spacing: .06em; text-transform: uppercase; color: #8b8bb0; }
.copy { font: 600 11.5px var(--font-body); letter-spacing: .02em; text-transform: none; color: #c9c9e6; background: transparent; border: 1px solid #34345a; border-radius: 7px; padding: 4px 10px; cursor: pointer; }
.copy:hover { color: #fff; border-color: #55558a; }
.code pre { margin: 0; padding: 16px 18px; overflow-x: auto; font: 13.5px/1.65 var(--font-mono); color: var(--code-fg); tab-size: 2; }
.t-kw { color: var(--t-kw); } .t-str { color: var(--t-str); } .t-com { color: var(--t-com); font-style: italic; } .t-num { color: var(--t-num); }
.t-fn { color: var(--t-fn); } .t-flag { color: var(--t-flag); } .t-var { color: var(--t-var); }

.table { margin: 0 0 22px; overflow-x: auto; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); }
.table table { width: 100%; border-collapse: collapse; font-size: 14.5px; line-height: 1.55; }
.table th { text-align: left; font-size: 12.5px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: var(--muted); background: var(--sunken); }
.table th, .table td { padding: 10px 14px; border-bottom: 1px solid var(--line); vertical-align: top; }
.table tr:last-child td { border-bottom: 0; }
.table td code { white-space: nowrap; }
.table td:first-child { min-width: 9em; }

.note { margin: 0 0 22px; padding: 14px 18px; border-radius: 12px; background: var(--note-bg); border: 1px solid var(--note-line); }
.note p:last-child { margin: 0; }

.pager { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 56px; }
.pager a { display: flex; flex-direction: column; padding: 14px 18px; border: 1px solid var(--line); border-radius: 12px; color: var(--fg); font-weight: 700; background: var(--surface); }
.pager a:hover { border-color: var(--accent); text-decoration: none; }
.pager small { font-weight: 600; font-size: 12px; color: var(--faint); text-transform: uppercase; letter-spacing: .06em; }
.pager .next { text-align: right; }
.edit { margin-top: 18px; font-size: 14px; }
.edit a { color: var(--muted); }

/* search */
.search { position: fixed; inset: 0; z-index: 50; display: grid; justify-items: center; align-items: start; padding: 12vh max(16px, env(safe-area-inset-right, 0px)) 16px max(16px, env(safe-area-inset-left, 0px));
  background: color-mix(in srgb, var(--fg) 30%, transparent); }
.search-box { width: min(620px, 100%); background: var(--surface); border: 1px solid var(--line-strong); border-radius: 16px; box-shadow: 0 30px 80px rgba(20, 20, 60, .3); overflow: hidden; }
.search-box input { width: 100%; padding: 18px 20px; font: 500 17px var(--font-body); color: var(--fg); background: transparent; border: 0; border-bottom: 1px solid var(--line); outline: none; }
[hidden] { display: none !important; }
#search-results { list-style: none; margin: 0; padding: 8px; max-height: 52vh; overflow-y: auto; }
#search-results li a { display: block; padding: 10px 12px; border-radius: 10px; color: var(--fg); }
#search-results li a small { display: block; color: var(--faint); font-size: 12.5px; }
#search-results li a:hover, #search-results li a[aria-selected="true"] { background: var(--accent-soft); text-decoration: none; }
#search-results .empty { padding: 18px 12px; color: var(--muted); }
.search-hint { margin: 0; padding: 10px 16px; border-top: 1px solid var(--line); font-size: 12px; color: var(--faint); display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }

/* responsive */
@media (max-width: 1180px) { .layout { grid-template-columns: 250px minmax(0, 1fr); } .onpage { display: none; } }
@media (max-width: 860px) {
  .layout { grid-template-columns: minmax(0, 1fr); }
  .menu { display: flex; }
  .sidebar { position: fixed; top: calc(var(--top) + env(safe-area-inset-top, 0px)); left: 0; bottom: 0; z-index: 15; width: min(300px, 86vw); height: auto;
    background: var(--surface); transform: translateX(-100%); transition: transform .2s ease; box-shadow: 0 20px 50px rgba(0, 0, 0, .2); }
  body.nav-open .sidebar { transform: none; }
  .search-open span, .search-open kbd, .top-links a { display: none; }
  .search-open { width: auto; margin-left: auto; }
  .version { display: none; }
  .topbar-inner { padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }
  .content { padding: 28px max(16px, env(safe-area-inset-right, 0px)) 64px max(16px, env(safe-area-inset-left, 0px)); }
  .anchor { display: none; }
  .table table { min-width: 620px; }
}
.table code { overflow-wrap: normal; word-break: normal; }
@media (prefers-reduced-motion: reduce) { * { transition: none !important; scroll-behavior: auto !important; } }
`;

/* ---------- client script ---------- */

const CLIENT_JS = `
(function () {
  var MULTI = !!window.__MULTI, BASE = window.__BASE || '', HERE = window.__PAGE;
  var pages = [].slice.call(document.querySelectorAll('.page'));
  /** "page.section" → a link: a real path on the site, a hash in the one-file preview. */
  function urlFor(id) {
    if (!MULTI) return '#' + id;
    var pg = id.split('.')[0], sec = id.slice(pg.length + 1);
    if (pg === HERE) return '#' + (sec || 'top');
    return (BASE + (pg === 'introduction' ? '' : pg + '/') || './') + (sec ? '#' + sec : '');
  }
  // Old one-page links (…/onetake/#mcp, #api.options) still work: send them to the page.
  if (MULTI && HERE === 'introduction' && location.hash) {
    var old = location.hash.slice(1), pg = old.split('.')[0];
    if (pg !== 'introduction' && window.__SEARCH.some(function (x) { return x.id === pg; })) location.replace(urlFor(old));
  }
  var navLinks = [].slice.call(document.querySelectorAll('.sidebar a'));
  var onpage = document.getElementById('onpage');
  var current = null;

  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
  var saved = store('ot-theme');
  if (saved) document.documentElement.setAttribute('data-theme', saved);
  document.querySelector('.theme').addEventListener('click', function () {
    var dark = document.documentElement.getAttribute('data-theme') === 'dark' ||
      (!document.documentElement.getAttribute('data-theme') && matchMedia('(prefers-color-scheme: dark)').matches);
    var next = dark ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    store('ot-theme', next);
  });

  function show(hash) {
    if (MULTI) {                                            // one page per file: just the contents rail and the hash target
      current = pages[0];
      var tpl = current && current.querySelector('template.toc');
      onpage.innerHTML = tpl ? tpl.innerHTML : '';
      document.body.classList.remove('nav-open');
      spy();
      return;
    }
    var target = (hash || '').replace(/^#/, '') || 'introduction';
    var pageId = target.split('.')[0];
    var page = document.getElementById('page-' + pageId) || document.getElementById('page-introduction');
    if (page !== current) {
      pages.forEach(function (p) { p.hidden = p !== page; });
      current = page;
      navLinks.forEach(function (a) { a.classList.toggle('active', a.getAttribute('data-page') === page.getAttribute('data-page')); });
      onpage.innerHTML = page.querySelector('template.toc').innerHTML;
      document.title = page.querySelector('h1').textContent + ' · OneTake Docs';
    }
    document.body.classList.remove('nav-open');
    var el = target.indexOf('.') !== -1 ? document.getElementById(target) : null;
    if (el) el.scrollIntoView(); else window.scrollTo(0, 0);
    spy();
  }

  function spy() {
    if (!current) return;
    var heads = [].slice.call(current.querySelectorAll('h2[id], h3[id]')), active = null;
    for (var i = 0; i < heads.length; i++) if (heads[i].getBoundingClientRect().top < 120) active = heads[i].id;
    [].forEach.call(onpage.querySelectorAll('a'), function (a) { a.classList.toggle('active', a.getAttribute('href') === '#' + active); });
  }
  addEventListener('scroll', spy, { passive: true });
  addEventListener('hashchange', function () { show(location.hash); });
  show(location.hash);

  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href^="#"]');
    if (a && !MULTI) {                                               // in-page links work even where the address bar doesn't follow
      e.preventDefault();
      var h = a.getAttribute('href');
      try { history.pushState(null, '', h); } catch (err) { /* sandboxed */ }
      show(h);
      closeSearch();
    }
    if (MULTI && e.target.closest && e.target.closest('#search-results a')) closeSearch();
    var copy = e.target.closest && e.target.closest('.copy');
    if (copy) {
      var text = copy.closest('.code').querySelector('code').innerText;
      var done = function () { copy.textContent = 'Copied'; setTimeout(function () { copy.textContent = 'Copy'; }, 1400); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () { select(copy); });
      else select(copy);
    }
  });
  function select(btn) {
    var r = document.createRange(); r.selectNodeContents(btn.closest('.code').querySelector('code'));
    var s = getSelection(); s.removeAllRanges(); s.addRange(r); btn.textContent = 'Press ⌘C';
  }

  var menu = document.querySelector('.menu');
  menu.addEventListener('click', function () {
    var open = document.body.classList.toggle('nav-open');
    menu.setAttribute('aria-expanded', String(open));
  });

  /* search */
  var box = document.getElementById('search'), input = document.getElementById('search-input'), results = document.getElementById('search-results'), sel = 0;
  function openSearch() { box.hidden = false; input.value = ''; render(); input.focus(); }
  function closeSearch() { box.hidden = true; }
  document.querySelector('.search-open').addEventListener('click', openSearch);
  box.addEventListener('click', function (e) { if (e.target === box) closeSearch(); });
  addEventListener('keydown', function (e) {
    if (box.hidden && (e.key === '/' || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k')) && !/input|textarea/i.test((document.activeElement || {}).tagName)) { e.preventDefault(); openSearch(); }
    else if (!box.hidden && e.key === 'Escape') closeSearch();
  });
  function render() {
    var q = input.value.trim().toLowerCase(), list = window.__SEARCH;
    var hits = !q ? list.filter(function (x) { return x.id.indexOf('.') === -1; }) : list.map(function (x) {
      var t = x.t.toLowerCase(), i = t.indexOf(q);
      return i === -1 ? null : { x: x, s: (i === 0 ? 0 : 1) + (x.id.indexOf('.') === -1 ? 0 : 2) + t.length / 200 };
    }).filter(Boolean).sort(function (a, b) { return a.s - b.s; }).map(function (h) { return h.x; });
    hits = hits.slice(0, 40); sel = 0;
    results.innerHTML = hits.length ? hits.map(function (x, i) {
      return '<li><a href="' + urlFor(x.id) + '"' + (i === 0 ? ' aria-selected="true"' : '') + '>' + escapeHtml(x.t) + '<small>' + escapeHtml(x.g) + '</small></a></li>';
    }).join('') : '<li class="empty">Nothing found for “' + escapeHtml(input.value) + '”</li>';
  }
  function escapeHtml(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  input.addEventListener('input', render);
  input.addEventListener('keydown', function (e) {
    var items = results.querySelectorAll('a');
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!items.length) return;
      items[sel].removeAttribute('aria-selected');
      sel = (sel + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length;
      items[sel].setAttribute('aria-selected', 'true');
      items[sel].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter' && items[sel]) { e.preventDefault(); items[sel].click(); }
  });
})();
`;

build();
