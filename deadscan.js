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
/* fragments that appear inside data:/font: URLs and URL fragments, not real
   class names — 'woff2' joined when brand fonts became self-hosted files */
const CSS_NOISE = new Set(['com', 'googleapis', 'gstatic', 'media', 'org', 'w3', 'woff2']);

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
/* window = the <style> block ONLY (head markup can sit before it and must not
   leak in — 'icons/icon-192.png' would read as a fake '.png' class) */
const cssBlock = html.slice(html.indexOf('<style>') + 7, html.indexOf('</style>'))
  .replace(/\/\*[\s\S]*?\*\//g, '');
const cssClasses = new Set();
while ((m = classRe.exec(cssBlock))) cssClasses.add(m[1]);
// searchable body = markup+JS after the style block plus module sources, so
// class names living in CSS don't self-count and module renderers do count
const body = html.slice(html.indexOf('</style>') + 8) + '\n' + modSrcs.join('\n');
counts.css = cssClasses.size;
const deadCSS = [...cssClasses].filter(c => !CSS_NOISE.has(c) && !new RegExp('\\b' + c + '\\b').test(body));

/* ── load-order guard ────────────────────────────────────────────────
   js/*.js modules load BEFORE the inline core (classic scripts, shared
   globals — the file:// contract). A top-level statement in a module
   that isn't a declaration would run before inline-core symbols exist
   and throw at load. Modules may only DECLARE at depth 0; bodies may
   reference anything (deferred execution). Also verifies the script
   tags appear in index.html in module order, before the inline core. */
function stripJs(src) {
  let out = '', i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; continue; }
    if (c === "'" || c === '"') {
      out += c; i++;
      while (i < n && src[i] !== c) { if (src[i] === '\\') i++; if (src[i] === '\n') out += '\n'; i++; }
      out += c; i++; continue;
    }
    if (c === '`') {
      out += '`'; i++;
      let td = 0;
      while (i < n && (src[i] !== '`' || td > 0)) {
        if (src[i] === '\\') { i += 2; continue; }
        if (src[i] === '$' && src[i + 1] === '{') { td++; i += 2; continue; }
        if (td > 0 && src[i] === '}') { td--; i++; continue; }
        if (src[i] === '\n') out += '\n';
        i++;
      }
      out += '`'; i++; continue;
    }
    out += c; i++;
  }
  return out;
}
const loadOrderFails = [];
if (fs.existsSync('js')) {
  /* module order comes from the tags in index.html, not fs.readdir
     (which is alphabetical and would false-fail) */
  const mods = [...html.matchAll(/js\/[\w.-]+\.js/g)].map(m => m[0].slice(3))
    .filter((f, i, a) => a.indexOf(f) === i && fs.existsSync('js/' + f));
  /* symbols the inline core declares — modules load first, so any LIVE
     (outside every function body) reference to one of these is a
     load-order crash: top-level statements AND top-level initializers
     run before the core exists. Function bodies are deferred and safe. */
  const coreDecls = new Set();
  const declRe2 = /(?:^|\n)(?:(?:async\s+)?function\s+([A-Za-z_$][\w$]*)|(?:const|let|var)\s+([A-Za-z_$][\w$]*))/g;
  for (const src of inline) {
    let mm;
    while ((mm = declRe2.exec(src))) coreDecls.add(mm[1] || mm[2]);
  }
  /* context walk over comment/string-stripped source. Brace states:
     'fn' = function body (deferred — core refs allowed), 'blk' = control/
     class block, 'obj' = object literal (keys aren't references). A '('
     right after `function NAME` marks a param list (bindings, not refs).
     A word preceded by '.' is property access, not a global read. */
  const isFnHeader = back => {
    if (/=>\s*$/.test(back)) return true;
    const kw = back.match(/([A-Za-z_$][\w$]*)\s*\([^()]*(?:\([^()]*\)[^()]*)*\)\s*$/);
    return !!kw && !/^(if|for|while|switch|catch|with|return|do|else|typeof|new)$/.test(kw[1]);
  };
  const isObjHeader = back =>
    /[=(,:[&|?+\-*/%!~^]|\b(return|typeof|case|in|of|new|delete|void|instanceof|await)\s*$/.test(back);
  for (const f of mods) {
    const src = stripJs(fs.readFileSync('js/' + f, 'utf8'));
    const braces = [];                  // 'fn' | 'blk' | 'obj'
    const parens = [];                  // true = param list of a function decl
    const wordRe = /[A-Za-z_$][\w$]*/g;
    let last = 0, w;
    const live = () => !braces.includes('fn');
    while ((w = wordRe.exec(src))) {
      for (let i = last; i < w.index; i++) {
        if (src[i] === '(') parens.push(/function\s+[​A-Za-z_$][\w$]*\s*$/.test(src.slice(Math.max(0, i - 60), i)));
        else if (src[i] === ')') parens.pop();
        else if (src[i] === '{') {
          const back = src.slice(Math.max(0, i - 300), i);
          braces.push(isFnHeader(back) ? 'fn' : (isObjHeader(back) ? 'obj' : 'blk'));
        } else if (src[i] === '}') braces.pop();
      }
      last = w.index + w[0].length;
      if (!coreDecls.has(w[0]) || !live() || parens.includes(true)) continue;
      if (src[w.index - 1] === '.') continue;                 // property access
      if (braces[braces.length - 1] === 'obj') {              // object keys & methods
        let j = w.index + w[0].length;
        while (src[j] === ' ') j++;
        if (src[j] === ':' || src[j] === '(') continue;
        /* value inside a lazy arrow body — `key: () => CORE.x.y` defers the
           read to call time, so it is not a load-order hazard */
        const open = src.lastIndexOf('{', w.index);
        if (open >= 0 && src.slice(open, w.index).includes('=>')) continue;
      }
      loadOrderFails.push(f + ': live reference to core symbol ' + w[0]);
    }
  }
  /* tag order: every module must appear in index.html, in load order,
     before the first tag-less <script> (the inline core) */
  let lastPos = -1;
  for (const f of mods) {
    const pos = html.indexOf('js/' + f);
    if (pos < lastPos) loadOrderFails.push('index.html: js/' + f + ' loads out of order');
    lastPos = pos;
  }
  const corePos = html.search(/<script>/);
  if (corePos >= 0 && lastPos > corePos)
    loadOrderFails.push('index.html: a module tag sits after the inline core');
}

/* ── XSS sink audit: dynamic innerHTML must be escaped ───────────────
   Every `.innerHTML =` whose right-hand side involves identifiers must
   either call esc() somewhere in the expression or sit on the allowlist
   below with a reason (mirroring the JS allowlist philosophy: reviewed,
   dated, prefer false negatives). New unescaped sinks fail CI. */
const XSS_ALLOW = [
  /* reviewed 2026-09-21: SHIP_ICON is a repo constant; the count is a clamped
     Math.max/min over GAME.lives — no external string reaches the sink.
     (Keyed on the expression, not the line number: lines drift, intent doesn't.) */
  { re: /SHIP_ICON\.repeat\(/ },
  /* reviewed 2026-09-21 (incl. v3.7 FTUE re-verification): only interpolated
     values are server-computed rank NUMBERS (r.rank, r.seasonMe.rank) and
     static verdict strings; user text (' · gauntlet #') is repo-owned. */
  { re: /gauntlet #'\s*\+ r\.seasonMe\.rank/ },
  { re: /r\.verdict === 'rejected'\s*\n/ },
  /* reviewed 2026-09-21: flight-log header + rows — META config numerics,
     local KIND/DIFF/when/fmt lookups, no server- or user-derived strings */
  { re: /The sky has been quiet/ },
  { re: /grid-template-columns:1fr auto auto/ },
];
function auditSinks(src, file) {
  const re = /\.innerHTML\s*=/g;
  let mm;
  while ((mm = re.exec(src))) {
    const line = src.slice(0, mm.index).split('\n').length;
    const tag = file + ':' + line;
    let i = re.lastIndex, depth = 0, inStr = null, j = i;
    for (; j < src.length && j - i < 4000; j++) {
      const c = src[j];
      if (inStr) { if (c === '\\') { j++; continue; } if (c === inStr) inStr = null; continue; }
      if (c === "'" || c === '"' || c === '`') { inStr = c; continue; }
      if (c === '(' || c === '[' || c === '{') depth++;
      else if (c === ')' || c === ']' || c === '}') { if (depth === 0) break; depth--; }
      else if (c === ';' && depth === 0) break;
    }
    const rhs = src.slice(i, j);
    const rhsNoStr = rhs.replace(/(['"`])(?:\\.|[^\\])*?\1/g, '');
    const dynamic = /[A-Za-z_$][\w$]/.test(rhsNoStr);
    if (dynamic && !/esc\s*\(/.test(rhs) && !XSS_ALLOW.some(a => a.re.test(rhs)))
      xssFails.push(tag + ': dynamic innerHTML without esc()');
  }
}
const xssFails = [];
auditSinks(html, 'index.html');
for (const f of (fs.existsSync('js') ? fs.readdirSync('js').filter(f => f.endsWith('.js')) : []))
  auditSinks(fs.readFileSync('js/' + f, 'utf8'), 'js/' + f);

/* ── static-exposure audit: what the deck must refuse to serve ───────
   The deck's static handler is an ALLOWLIST (STATIC_OK + flat font/icon
   prefix rules); everything else 404s. This gate pins that boundary in CI —
   behaviorally: it extracts the allowlist from server.js and executes the
   union against sensitive probes (must 404) and the game shell (must serve).
   Also pins that server state lives OUTSIDE the served root. */
const srvSrc = fs.readFileSync('server.js', 'utf8');
const exposeFails = [];
const allowRegion = srvSrc.slice(srvSrc.indexOf('const STATIC_OK'), srvSrc.indexOf('function serveStatic'));
const SENSITIVE = ['/data/emberfall.db', '/data/emberfall.db-wal', '/data', '/server.js',
  '/package.json', '/package-lock.json', '/playwright.config.js', '/emberfall.html',
  '/smoke.sh', '/check.sh', '/deadscan.js', '/.git/config', '/.env', '/js',
  '/node_modules/x', '/test-results/x', '/docs/x', '/tools/x', '/tests/x', '/.github/x'];
const SHELL_OK = ['/index.html', '/sw.js', '/manifest.webmanifest', '/js/art.js', '/js/input.js',
  '/js/audio.js', '/js/sky.js', '/js/net.js', '/icons/icon-192.png', '/icons/icon-512.png',
  '/fonts/michroma-400.woff2', '/'];
const setEntries = [...allowRegion.matchAll(/'([^']+)'/g)].map(m => m[1]);
if (!setEntries.length) exposeFails.push('STATIC_OK allowlist not found in server.js');
else {
  const hasFontRule = /woff2\$\/\.test\(name\)/.test(allowRegion);
  const hasIconRule = /\.png\$\/\.test\(name\)/.test(allowRegion);
  if (!hasFontRule || !hasIconRule)
    exposeFails.push('flat font/icon prefix rules missing from staticAllowed');
  const allowed = p => {
    if (p === '/') p = '/index.html';
    if (setEntries.includes(p)) return true;
    if (p.startsWith('/fonts/')) return hasFontRule && /^[\w.-]+\.woff2$/.test(p.slice(7));
    if (p.startsWith('/icons/')) return hasIconRule && /^[\w.-]+\.png$/.test(p.slice(7));
    return false;
  };
  for (const p of SENSITIVE) if (allowed(p)) exposeFails.push('allowlist wrongly permits ' + p);
  for (const p of SHELL_OK) if (!allowed(p)) exposeFails.push('allowlist wrongly blocks ' + p);
}
if (/const DATA_DIR =[^\n]*path\.join\(ROOT,\s*'data'\)/.test(srvSrc))
  exposeFails.push("server state (DATA_DIR) lives inside the served root");

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

if (loadOrderFails.length) console.log('── load-order ──\n  ' + loadOrderFails.join('\n  '));
if (xssFails.length) console.log('── xss sinks ──\n  ' + xssFails.join('\n  '));
if (exposeFails.length) console.log('── static exposure ──\n  ' + exposeFails.join('\n  '));

if (process.argv.includes('--check')) {
  const names = dead.map(d => d.corpus + ':' + d.name).concat(deadCSSReal().map(c => 'css:' + c));
  if (names.length || loadOrderFails.length || xssFails.length || exposeFails.length) {
    if (loadOrderFails.length) console.error('LOAD ORDER: ' + loadOrderFails.join(' | '));
    if (names.length) console.error('DEAD CODE: ' + names.join(', '));
    if (xssFails.length) console.error('XSS SINKS: ' + xssFails.join(' | '));
    if (exposeFails.length) console.error('STATIC EXPOSURE: ' + exposeFails.join(' | '));
    process.exit(1);
  }
  console.log('deadscan --check: clean (' + counts.client + ' client, ' +
    counts.server + ' server, ' + counts.shell + ' shell, ' + counts.css + ' css, xss+exposure audited)');
}

function deadCSSReal() { return deadCSS.filter(c => !CSS_NOISE.has(c)); }
