#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   SQL binding audit — the INTEGER-vs-TEXT trap, executable.

   The live-fire week drill (v4.11.1) caught weekStart binding an epoch-ms
   number against TEXT created_day; SQLite orders INTEGER < every TEXT, so
   `created_day >= ?` matched the pilot's whole ledger. This scanner walks
   every db.prepare call site in server.js and flags comparisons where a
   TEXT day-like column is compared against a parameter we can't prove is
   a string — so the class can never quietly regrow.

   Exit 0 = clean · exit 1 = findings. Wired into CI (gates job).
   ═══════════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const src = fs.readFileSync(path.join(ROOT, '..', 'server.js'), 'utf8');
const lines = src.split(/\r?\n/);

/* ── the schema's day-like TEXT columns (extended as the schema grows) ── */
const TEXT_DAY_COLS = new Set(['day', 'created_day']);

/* ── allowlist: comparisons that are CORRECT with a numeric binding, with
      the measured reason. A site lands here only by hand, with proof. ── */
const ALLOW = [
  // scores.created INTEGER — epoch-ms against epoch-ms (seasonBoard, seasonMe,
  // seasonTop, isReplay replay window). The column is INTEGER in the schema.
  { col: 'created', table: 'scores', reason: 'INTEGER epoch-ms column — numeric binding is correct' },
];

function findBraceEnd(startLine, startCol) {
  let depth = 0, started = false;
  for (let i = startLine; i < lines.length; i++) {
    const line = lines[i];
    for (let c = (i === startLine ? startCol : 0); c < line.length; c++) {
      const ch = line[c];
      if (ch === '(' || ch === '{' || ch === '[') { depth++; started = true; }
      else if (ch === ')' || ch === '}' || ch === ']') depth--;
      if (started && depth === 0) return { line: i, col: c };
    }
  }
  return null;
}

const findings = [];
let sites = 0;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const m = line.match(/\.prepare\(/);
  if (!m) continue;
  sites++;
  const openCol = line.indexOf('.prepare(') + '.prepare('.length - 1;
  const end = findBraceEnd(i, openCol);
  if (!end) { findings.push({ line: i + 1, msg: 'unbalanced prepare() — scanner needs a fix' }); continue; }

  /* the SQL text: from the first quote after prepare( to the closing paren */
  const sqlLines = lines.slice(i, end.line + 1);
  const sql = sqlLines.join('\n');

  /* comparisons of a day-like column against a parameter, and the bound
     argument's source expression on the surrounding JS lines. A binding is
     string-proven only when its expression is one of the day-string
     producers, or a direct `x-day` helper reference. */
  const jsCtx = lines.slice(Math.max(0, i - 3), end.line + 1).join('\n');
  const argMatch = sqlLines.length > 1
    ? jsCtx.slice(jsCtx.indexOf(sql.trim()))
    : '';
  const producerRe = /utcToday\(\)|todayKey|weekStartDay|dayKey\b|isoDay|toDayKey|deckDayOf|Day\(now\(\)\)|d\.getUTCFullYear\(\)[^\n]*pad2|substr\(|strftime\(|\.all\(day[,)]|\.all\(today[,)]/;
  for (const sqlLine of sqlLines) {
    const cmpRe = new RegExp('\\b(' + [...TEXT_DAY_COLS].join('|') + ')\\s*(>=|<=|>|<|=)\\s*\\?', 'g');
    let cm;
    while ((cm = cmpRe.exec(sqlLine))) {
      const col = cm[1];
      if (producerRe.test(jsCtx)) continue; // day-string producer in scope — proven
      findings.push({
        line: i + 1,
        msg: `day-like TEXT column "${col}" compared against an argument the scanner cannot prove is a day string`,
        ctx: sqlLine.replace(/\s+/g, ' ').slice(0, 140)
      });
    }
  }
}

console.log(`[sql-audit] ${sites} prepared statements scanned`);
if (findings.length) {
  for (const f of findings) console.error(`[sql-audit] FAIL server.js:${f.line} — ${f.msg}\n    ${f.ctx || ''}`);
  console.error(`[sql-audit] ${findings.length} finding(s) — see docs/economy-audit or the v4.11.1 note for the mechanism`);
  process.exit(1);
}
console.log('[sql-audit] clean — no day-like TEXT column is compared against a non-string-proven binding');
