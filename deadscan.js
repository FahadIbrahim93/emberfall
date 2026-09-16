#!/usr/bin/env node
/* deadscan.js — anti-bloat scanner for EMBERFALL's single-file codebase.
   Extracts the <script> payload from index.html, finds declarations whose
   name has no other reference (word-boundary, whole-file), and lists CSS
   classes that appear nowhere in markup or JS. String-indirection safe:
   DOM ids/classes and eval-ish use still count as references.

   CI mode: `node deadscan.js --check` exits 1 when TRUE-positive dead
   symbols exist. Known false positives ($/$$ single-char identifiers the
   word-boundary regex cannot tokenize, and font-provider URL fragments in
   CSS) live on an allowlist so the battery stays green by default. */
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
const script = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));

/* reviewed 2026-09-17: not dead — '$'/'$$' are the DOM helpers and the
   regex cannot match a bare sigil with \b; every other past finding was
   either deleted or is allowlisted here with its reason */
const JS_ALLOW = new Set(['$', '$$']);

/* ── JS symbols ── */
const declRe = /(?:^|\n)((?:async\s+)?function\s+([A-Za-z_$][\w$]*)|(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=)/g;
const decls = new Map();                       // name -> first decl line
const lines = script.split('\n');
let m;
while ((m = declRe.exec(script))) {
  const name = m[2] || m[3];
  const lineNo = script.slice(0, m.index).split('\n').length;
  if (!decls.has(name)) decls.set(name, { line: lineNo, kind: m[2] ? 'fn' : 'var' });
}
// declared-but-never-referenced-elsewhere: word-boundary count === 1
const deadJS = [];
for (const [name, info] of decls) {
  if (JS_ALLOW.has(name)) continue;
  const n = (script.match(new RegExp('\\b' + name.replace(/\$/g, '\\$') + '\\b', 'g')) || []).length;
  if (n <= 1) deadJS.push({ name, n, ...info });
}

/* ── CSS classes ── */
const classRe = /\.([a-zA-Z][\w-]*)/g;
const cssBlock = html.slice(0, html.indexOf('</style>'));
const cssClasses = new Set();
while ((m = classRe.exec(cssBlock))) cssClasses.add(m[1]);
// strip <style> from the searchable body so class names in CSS don't self-count
const body = html.slice(html.indexOf('</style>') + 8);
const deadCSS = [...cssClasses].filter(c => !new RegExp('\\b' + c + '\\b').test(body));

console.log('── dead JS symbols (' + deadJS.length + ' of ' + decls.size + ' scanned) ──');
deadJS.sort((a, b) => a.line - b.line).forEach(d =>
  console.log(String(d.line).padStart(5) + '  ' + d.kind.padEnd(3) + ' ' + d.name));
console.log('── dead CSS classes (' + deadCSS.length + ' of ' + cssClasses.size + ') ──');
console.log(deadCSS.sort().join(', '));

/* CSS "dead classes" include font-provider URL fragments (googleapis,
   gstatic, w3, org, com, media) — never treat them as findings */
const CSS_NOISE = new Set(['com', 'googleapis', 'gstatic', 'media', 'org', 'w3']);
const deadCSSReal = deadCSS.filter(c => !CSS_NOISE.has(c));

if (process.argv.includes('--check')) {
  if (deadJS.length || deadCSSReal.length) {
    console.error('DEAD CODE: ' + deadJS.map(d => d.name).concat(deadCSSReal).join(', '));
    process.exit(1);
  }
  console.log('deadscan --check: clean (' + decls.size + ' symbols, ' + cssClasses.size + ' classes)');
}
