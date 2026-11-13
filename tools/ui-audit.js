#!/usr/bin/env node
/* tools/ui-audit.js — the UI system's static gate.

   The overhaul in css/ui.css makes five promises that a reviewer cannot
   check by eye across a 10,000-line index.html. This gate checks them:

     1. every custom property the shell uses is declared (or is one of the
        handful the renderer sets at runtime), so a token cannot silently
        resolve to nothing the way --good did in the tour wall;
     2. the system layer hardcodes no ember: the four visual styles must
        reach the menus through the palette channels, not just the canvas;
     3. no informational text in the system layer sits below 11px;
     4. !important appears only in the reduced-motion override;
     5. every modal surface is registered in the single focus-trap stack in
        js/input.js, and the system layer loads after the shell styles.

   It is a static audit by design: it does not need a browser, so it runs in
   check.sh in a second. Pixel-level promises (44px targets, computed
   contrast, overflow) are asserted in tests/ui-system.spec.js instead. */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

let fail = 0;
const bad = message => { console.error('UI-AUDIT FAIL — ' + message); fail++; };

const html = read('index.html');
const SYSTEM = ['css/ui.css'];
const systemCss = SYSTEM.map(read).join('\n');

/* custom properties written by the renderer or inline style attributes */
const RUNTIME = new Set([
  'sat', 'sab', 'sal', 'sar',              /* safe-area insets (env()) */
  'tbtn', 'tstick', 'tknob',                /* touch-control geometry (JS) */
  'btn-scale', 'btn-opacity', 'btn-spacing',/* js applyTouchBtnCfg() */
  'f', 'ic',                                /* cooldown ring, icon mask */
  'pv-a', 'pv-b'                            /* palette swatch pairs */
]);

const declared = new Set();
for (const match of (systemCss + html).matchAll(/--([a-z][a-z0-9-]*)\s*:/g)) declared.add(match[1]);

const used = new Set();
for (const match of (html + systemCss).matchAll(/var\(\s*--([a-z][a-z0-9-]*)/g)) used.add(match[1]);

const undefinedVars = [...used].filter(name => !declared.has(name) && !RUNTIME.has(name)).sort();
if (undefinedVars.length) bad('undefined custom properties: ' + undefinedVars.join(', '));

/* the palette must be able to repaint the chrome */
for (const file of SYSTEM) {
  read(file).split('\n').forEach((line, index) => {
    if (/^\s*\/\*/.test(line)) return;
    if (/palette-preview/.test(line)) return;   /* the swatch previews the palette itself */
    if (/255\s*,\s*138\s*,\s*43|#ff8a2b/i.test(line)) {
      bad(file + ':' + (index + 1) + ' hardcodes ember; use a palette-derived token');
    }
  });
}

/* the readable-type floor */
for (const file of SYSTEM) {
  read(file).split('\n').forEach((line, index) => {
    const match = line.match(/font-size:\s*([\d.]+)(rem|px)/);
    if (!match) return;
    const px = match[2] === 'rem' ? parseFloat(match[1]) * 16 : parseFloat(match[1]);
    if (px > 0 && px < 11 - 1e-6) bad(file + ':' + (index + 1) + ' text at ' + px + 'px (floor is 11px)');
  });
}

/* !important is reserved for the reduced-motion override */
const withoutMotion = systemCss.replace(/html\.reduce-motion[\s\S]*?\n\}/g, '');
if (/!important/.test(withoutMotion)) bad('!important outside the reduced-motion block');

/* one focus-trap stack, one registration */
const input = read('js/input.js');
const dialogs = [...html.matchAll(/<section id="(s-[a-z-]+)"[^>]*role="dialog"/g)].map(match => match[1]);
const registered = (input.match(/const MODAL_IDS = \[([^\]]*)\]/) || [, ''])[1];
for (const id of dialogs) {
  if (!registered.includes("'" + id + "'")) bad('modal surface not in the focus-trap stack: #' + id);
}

/* the touch target floor is a token, not a habit */
if (!/--target:\s*44px/.test(systemCss)) bad('--target must stay 44px');

/* ── settings wiring ───────────────────────────────────────────────────
   The settings screen is hand-written markup with 24 controls. These checks
   catch the failures that would otherwise need a browser: a control bound in
   the core but absent from the DOM, a duplicated id from moved markup, a
   switch without switch semantics, a segment without radio semantics. */
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
const duplicates = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
if (duplicates.length) bad('duplicate element ids: ' + duplicates.join(', '));

for (const match of html.matchAll(/bind(?:Switch|Range|Segment)\('([A-Za-z0-9_-]+)'/g)) {
  if (!ids.includes(match[1])) bad('bound control missing from the markup: #' + match[1]);
}

for (const match of html.matchAll(/<button class="sw" id="([^"]+)"([^>]*)>/g)) {
  const attrs = match[2];
  if (!/role="switch"/.test(attrs)) bad('switch without role=switch: #' + match[1]);
  if (!/aria-checked="(?:true|false)"/.test(attrs)) bad('switch without aria-checked: #' + match[1]);
  if (!/aria-labelledby="[^"]+"/.test(attrs)) bad('switch without an accessible label: #' + match[1]);
}

for (const match of html.matchAll(/<div class="seg" id="([^"]+)"([^>]*)>([\s\S]*?)<\/div>/g)) {
  const [, id, attrs, body] = match;
  if (!/role="radiogroup"/.test(attrs)) bad('segment without role=radiogroup: #' + id);
  if (!/aria-labelledby="[^"]+"/.test(attrs)) bad('segment without an accessible label: #' + id);
  const options = (body.match(/role="radio"/g) || []).length;
  const values = (body.match(/data-v="[^"]+"/g) || []).length;
  if (options !== values || options < 2) bad('segment #' + id + ' has ' + values + ' values but ' + options + ' radios');
}

for (const match of html.matchAll(/<output[^>]*\bid="([^"]+)"[^>]*for="([^"]+)"/g)) {
  if (!ids.includes(match[2])) bad('output #' + match[1] + ' points at a missing control #' + match[2]);
}

/* cascade order: the system layer must be able to win */
const styleEnd = html.indexOf('</style>');
const linkAt = html.indexOf('href="css/ui.css"');
if (styleEnd < 0 || linkAt < styleEnd) bad('css/ui.css must load after the inline shell styles');

if (fail) {
  console.error('\nui-audit: ' + fail + ' problem(s)');
  process.exit(1);
}
console.log('UI-AUDIT OK — ' + dialogs.length + ' modal surfaces in one trap, tokens resolve, type floor and target size hold');
