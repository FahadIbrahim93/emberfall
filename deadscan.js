#!/usr/bin/env node
/* deadscan.js — repo-wide dead-code scanner for EMBERFALL.

   Corpora, each scanned independently (a symbol is dead when its whole-corpus
   word-boundary reference count is 1 — i.e. only its own declaration):
     client — every inline <script> payload in index.html + every js/*.js module
     server — server.js
     shell  — smoke.sh + check.sh POSIX functions (name() { ... })

   CSS classes declared in index.html's <style> count as dead when they appear
   nowhere in markup, JS or modules.

   String-indirection safe: DOM ids/classes, eval-ish use and same-corpus names
   all count as references. We prefer false negatives over false positives,
   because --check fails CI.

   CI mode: `node deadscan.js --check` exits 1 when true-positive dead code
   exists. Known false positives live on the allowlists below, each with its
   reason and review date. */
const fs = require('fs');

/* reviewed 2026-09-17: not dead — '$'/'$$' are the DOM helpers and the regex
   cannot match a bare sigil with \b */
const JS_ALLOW = new Set(['$', '$$']);
/* CSS "dead classes" that are font-provider URL fragments, never findings */
const CSS_NOISE = new Set(['com', 'googleapis', 'gstatic', 'media', 'org', 'w3']);

const dead = [];
const counts = {};
let m;

function scanJS(corpus, srcs) {
  const script = srcs.join('\n');
  const declRe = /(?:^|\n)((?:async\s+)?function\s+([A-Za-z_$][\w$]*)|(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=)/g;
  const decls = new Map();                    // name -> kind
  while ((m = declRe.exec(script))) {
    const name = m[2] || m[3];
    if (!decls.has(name)) decls.set(name, m[2] ? 'fn' : 'var');
  }
  counts[corpus] = decls.size;
  for (const [name, kind] of decls) {
    if (JS_ALLOW.has(name)) continue;
    const n = (script.match(new RegExp('\\b' + name.replace(/\$/g, '\\$') + '\\b', 'g')) || []).length;
    if (n <= 1) dead.push({ corpus, name, kind });
  }
}

/* ── client ── */
const html = fs.readFileSync('index.html', 'utf8');
const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(x => x[1]).filter(s => s.trim());
const modSrcs = fs.existsSync('js')
  ? fs.readdirSync('js').filter(f => f.endsWith('.js')).map(f => fs.readFileSync('js/' + f, 'utf8'))
  : [];
scanJS('client', inline.concat(modSrcs));

/* ── server ── */
scanJS('server', [fs.readFileSync('server.js', 'utf8')]);

/* ── shell: POSIX function definitions name() { ── */
const shellFiles = ['smoke.sh', 'check.sh'].filter(f => fs.existsSync(f));
const shellSrc = shellFiles.map(f => fs.readFileSync(f, 'utf8')).join('\n');
const shellFns = new Set();
const fnRe = /(?:^|\n)[ \t]*([A-Za-z_][\w-]*)\s*\(\)\s*\{/g;
while ((m = fnRe.exec(shellSrc))) shellFns.add(m[1]);
counts.shell = shellFns.size;
for (const name of shellFns) {
  const n = (shellSrc.match(new RegExp('\\b' + name + '\\b', 'g')) || []).length;
  if (n <= 1) dead.push({ corpus: 'shell', name, kind: 'fn' });
}

/* ── CSS ── */
const classRe = /\.([a-zA-Z][\w-]*)/g;
const cssBlock = html.slice(0, html.indexOf('</style>'));
const cssClasses = new Set();
while ((m = classRe.exec(cssBlock))) cssClasses.add(m[1]);
// searchable body = markup+JS after the style block plus module sources, so
// class names living in CSS don't self-count and module renderers do count
const body = html.slice(html.indexOf('</style>') + 8) + '\n' + modSrcs.join('\n');
counts.css = cssClasses.size;
const deadCSS = [...cssClasses].filter(c => !new RegExp('\\b' + c + '\\b').test(body));

/* report */
const order = { client: 0, server: 1, shell: 2 };
dead.sort((a, b) => order[a.corpus] - order[b.corpus] || (a.name < b.name ? -1 : 1));
console.log('── corpus sizes: ' + counts.client + ' client symbols, ' +
  counts.server + ' server symbols, ' + counts.shell + ' shell fns, ' +
  counts.css + ' css classes ──');
if (dead.length) {
  console.log('── dead symbols ──');
  dead.forEach(d => console.log('  ' + d.corpus.padEnd(7) + d.kind.padEnd(4) + d.name));
}
if (deadCSS.length) console.log('── dead CSS classes: ' + deadCSS.sort().join(', '));

if (process.argv.includes('--check')) {
  const names = dead.map(d => d.corpus + ':' + d.name).concat(deadCSSReal().map(c => 'css:' + c));
  if (names.length) {
    console.error('DEAD CODE: ' + names.join(', '));
    process.exit(1);
  }
  console.log('deadscan --check: clean (' + counts.client + ' client, ' +
    counts.server + ' server, ' + counts.shell + ' shell, ' + counts.css + ' css)');
}

function deadCSSReal() { return deadCSS.filter(c => !CSS_NOISE.has(c)); }
