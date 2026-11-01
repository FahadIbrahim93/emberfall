#!/usr/bin/env node
'use strict';

const fs = require('fs');

const source = fs.readFileSync('tools/stubguard.js', 'utf8');
const start = source.indexOf('const INCIDENT = `');
const end = source.indexOf('`;\n\nconst s =', start);
if (start < 0 || end < 0) {
  throw new Error('stubguard INCIDENT template was not found');
}

const incident = source.slice(start, end);
const forbidden = [
  /\b(?:git|gh|npm|node|curl|wget|bash|sh)\s+[-\w./<>'"$]/i,
  /https?:\/\//i,
  /[|;&]\s*(?:git|gh|npm|node|curl|wget|bash|sh)\b/i,
];

for (const pattern of forbidden) {
  if (pattern.test(incident)) {
    throw new Error(`stubguard INCIDENT contains executable-looking content: ${pattern}`);
  }
}

if (!incident.includes('reviewed, known-good revision')) {
  throw new Error('stubguard INCIDENT lost its recovery guidance');
}

console.log('stubguard-output: diagnostic is descriptive and non-executable');
