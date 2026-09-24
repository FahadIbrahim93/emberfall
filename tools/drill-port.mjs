#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   drill-port.mjs — the deck's port contract, executable.

   An ambient PORT env hijacked a --port boot once (a shell exported
   PORT=0, the old chain `Number(env.PORT || flag) || 8123` let env win,
   and a pinned scratch deck silently landed on 8123 — the preview deck's
   port). This drill pins the resolution contract so it can never quietly
   regress:

     1. --port flag beats a POISONED ambient PORT (the original sin)
     2. PORT env is honored when no flag is passed (containers rely on it)
     3. no flag + no PORT → the 8123 default (two-world: free → boot +
        answer; busy → the child must crash trying 8123, never squat
        elsewhere)
     4. falsy PORT=0 with NO flag exits loudly — the old chain silently
        defaulted to 8123, hiding the misconfiguration
     5. --port garbage exits 1 with a loud message — never a silent fallback
     6. PORT=garbage (no flag) exits 1 the same way
     7. the resolved deck actually answers /api/health on the announced port

   Each case boots its OWN scratch deck (scratch EF_DATA_DIR) on a spare
   port, waits for /api/health or a clean exit, proves, tears down. The
   default-port case is two-world: if 8123 is free the deck must boot and
   answer there; if 8123 is busy (CI's gates deck, a local preview deck)
   the child must CRASH trying it — silently surviving on some other port
   would mean the default is broken. CI: one step after the deck is
   stopped. Local: node tools/drill-port.mjs.
   Exit 0 = contract holds · exit 1 = any clause broken.
   ═══════════════════════════════════════════════════════════════════════ */
'use strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const good = m => { pass++; console.log('  ok  -', m); };
const bad  = m => { fail++; console.log('  FAIL-', m); };

/* boot one scratch deck. Ambient-env baseline is deliberately hostile:
   PORT=0 (falsy poison) — unless the caller passes PORT in env or drops
   the variable entirely (default-port cases need a clean slate). */
function boot({ args = [], env = {}, dropPortEnv = false } = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ef-port-'));
  const childEnv = { ...process.env, ...env, EF_DATA_DIR: dataDir };
  if (dropPortEnv) delete childEnv.PORT;
  else if (childEnv.PORT === undefined) childEnv.PORT = '0';
  const child = spawn(process.execPath, ['server.js', ...args], {
    cwd: ROOT,
    env: childEnv,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let out = '';
  child.stdout.on('data', d => { out += d; });
  child.stderr.on('data', d => { out += d; });
  child.dataDir = dataDir;
  child.out = () => out;
  return child;
}

async function healthy(port, ms = 15000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    try {
      const r = await fetch('http://127.0.0.1:' + port + '/api/health');
      if (r.status === 200) return true;
    } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 200));
  }
  return false;
}

const exited = (child, ms = 8000) => new Promise(resolve => {
  const t = setTimeout(() => resolve(null), ms);           // still running
  child.once('exit', async code => {
    clearTimeout(t);
    await new Promise(r => setTimeout(r, 100));            // let stderr flush
    resolve(code);
  });
});

function kill(child) {
  try { child.kill(); } catch { /* gone */ }
  try { fs.rmSync(child.dataDir, { recursive: true, force: true }); } catch { /* temp */ }
}

async function main() {
  /* 1 — the original sin: a poisoned ambient PORT must never beat --port */
  console.log('── flag beats poisoned ambient PORT');
  {
    const c = boot({ args: ['--port', '8171'], env: { PORT: '0' } });
    try {
      const up = await healthy(8171);
      if (up) good('PORT=0 ambient + --port 8171 → deck answers on 8171');
      else bad('--port 8171 did not come up (env may have hijacked the flag): ' + c.out().slice(0, 200));
    } finally { kill(c); }
  }

  /* 2 — PORT env is honored when no flag is passed */
  console.log('── PORT env honored without a flag');
  {
    const c = boot({ env: { PORT: '8173' } });
    try {
      const up = await healthy(8173);
      up ? good('PORT=8173 env boot answers on 8173')
         : bad('PORT env boot never came up: ' + c.out().slice(0, 200));
    } finally { kill(c); }
  }

  /* 3 — no flag + no PORT (clean slate) → 8123 default. Two-world:
         free 8123 → boot + answer + announce; busy 8123 → the child must
         die on EADDRINUSE, never resolve elsewhere. */
  console.log('── default port 8123');
  {
    let busy = false;
    try { busy = !!(await (await fetch('http://127.0.0.1:8123/api/health')).json()); } catch { /* free */ }
    const c = boot({ dropPortEnv: true });
    try {
      if (busy) {
        const code = await exited(c);
        code !== null && /EADDRINUSE/i.test(c.out())
          ? good('8123 busy → child died on EADDRINUSE (it tried the default, nothing else)')
          : bad('8123 busy but child neither crashed on the default nor proved it (exit ' + code + '): ' + c.out().slice(0, 200));
      } else {
        const up = await healthy(8123);
        const line = (c.out().match(/localhost:(\d+)/) || [])[1];
        up && line === '8123'
          ? good('no flag + no PORT → deck answers on the 8123 default')
          : bad('default boot: up=' + up + ', announced=' + line + ': ' + c.out().slice(0, 200));
      }
    } finally { kill(c); }
  }

  /* 4 — falsy PORT=0 with no flag: the old chain silently defaulted to
         8123; the hardened deck must exit loudly instead. */
  console.log('── falsy PORT=0 without a flag exits loudly');
  {
    const c = boot({});
    try {
      const code = await exited(c);
      if (code === 1 && /bad port/.test(c.out())) good('PORT=0 ambient, no flag → exit 1 "bad port" (was: silent 8123)');
      else bad('PORT=0 no-flag → exit ' + code + ', output: ' + c.out().slice(0, 200));
    } finally { kill(c); }
  }

  /* 5 — --port garbage exits loudly, never a silent fallback */
  console.log('── invalid --port exits loudly');
  {
    const c = boot({ args: ['--port', 'not-a-port'] });
    try {
      const code = await exited(c);
      if (code === 1 && /bad port/.test(c.out())) good('--port not-a-port → exit 1 with "bad port" message');
      else bad('--port not-a-port → exit ' + code + ', output: ' + c.out().slice(0, 200));
    } finally { kill(c); }
  }

  /* 6 — PORT=garbage (no flag) exits the same way */
  console.log('── invalid PORT env exits loudly');
  {
    const c = boot({ env: { PORT: 'abc' } });
    try {
      const code = await exited(c);
      if (code === 1 && /bad port/.test(c.out())) good('PORT=abc → exit 1 with "bad port" message');
      else bad('PORT=abc → exit ' + code + ', output: ' + c.out().slice(0, 200));
    } finally { kill(c); }
  }

  /* 7 — the loud boot line names the port it actually took */
  console.log('── boot log names the resolved port');
  {
    const c = boot({ args: ['--port', '8175'] });
    try {
      const up = await healthy(8175);
      const line = (c.out().match(/\[cmd-deck\] EMBERFALL backend on http:\/\/localhost:(\d+)/) || [])[1];
      up && line === '8175'
        ? good('boot log announces http://localhost:8175 — what it says is what it is')
        : bad('boot log/port mismatch (up=' + up + ', announced=' + line + '): ' + c.out().slice(0, 200));
    } finally { kill(c); }
  }

  console.log(`── verdict: pass=${pass} fail=${fail}`);
  if (fail === 0) console.log('DRILL-PORT: ALL GREEN');
  else console.log('DRILL-PORT: FAILURES ABOVE');
}

main()
  .catch(e => { console.error('drill crashed:', e.message); fail++; })
  .finally(() => process.exit(fail === 0 ? 0 : 1));
