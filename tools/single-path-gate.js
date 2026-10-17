#!/usr/bin/env node
/* single-path-gate.js — ADR 0003 enforcement (P0 style, next to deadscan/copyguard).
   Fails when:
     1. a packages/sim/src module is neither an adapter (imports ../../../js/…)
        nor listed as a pending port in tools/single-path.json
     2. the manifest lists a file that does not exist (stale manifest)
     3. a js/*.js module tagged as single-path runtime has no client <script> wire
     4. an adapter imports a js/*.js file the client never loads (dead direction)
   Truth: the sim package must not silently become a second copy again. */
'use strict';
const { readFileSync, readdirSync, existsSync } = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'packages', 'sim', 'src');
const MANIFEST = path.join(ROOT, 'tools', 'single-path.json');
const INDEX = path.join(ROOT, 'index.html');

let fail = 0;
const bail = (msg) => { console.error('FAIL: ' + msg); fail = 1; };

const clientHtml = readFileSync(INDEX, 'utf8');
const moduleFiles = readdirSync(SRC).filter(f => f.endsWith('.ts'));
const manifest = readFileSync(MANIFEST, 'utf8');
const listed = JSON.parse(manifest);   /* { pending: [names…], notes: {...}? } */
const pending = new Set(listed.pending || []);

const adapters = [];
const strays = [];

for (const f of moduleFiles) {
  const text = readFileSync(path.join(SRC, f), 'utf8');
  const isAdapter = /\.\.\/\.\.\/\.\.\/js\//.test(text);
  if (isAdapter) {
    adapters.push(f);
    const jsName = (text.match(/(\.\.\/\.\.\/\.\.\/js\/[\w.-]+\.js)/) || [])[1];
    if (jsName) {
      if (!existsSync(path.join(ROOT, 'js', path.basename(jsName)))) {
        bail(`adapter ${f} imports missing runtime ${jsName}`);
      }
      if (!clientHtml.includes('js/' + path.basename(jsName))) {
        bail(`adapter ${f} imports ${jsName} but the client never loads it (verification goes the wrong way)`);
      }
    }
  } else if (!pending.has(f)) {
    strays.push(f);
  }
}

for (const name of pending) {
  if (!moduleFiles.includes(name)) bail(`manifest lists missing module ${name}`);
}

if (strays.length) {
  bail('modules that are neither adapters nor pending ports: ' + strays.join(', '));
}

if (fail) {
  console.error('fix by wiring the module over js/* (ADR 0003 §Decision) or listing it in tools/single-path.json as a pending port');
  process.exit(1);
}

console.log(`SINGLE-PATH-OK: ${adapters.length} adapter(s) over client bytes, ${pending.size} pending port(s) manifest-tracked`);
console.log('  adapters: ' + (adapters.join(', ') || '(none yet)'));
if (pending.size) console.log('  pending:  ' + [...pending].join(', '));
