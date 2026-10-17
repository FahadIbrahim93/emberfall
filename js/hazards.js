// Emberfall world hazards — the stage as an opponent.
// Single-path module (ADR 0003): this file IS the live path — the client
// loads it as a classic script and the sim package adapts it, so tests and
// goldens run the same bytes the player executes.
// Load-time pure: declares only. The core creates one instance via HZ.make(host).
(function () {
  'use strict';

  const G = (typeof window !== 'undefined') ? window : globalThis;

  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

  const defs = {
    gravity: {
      name: 'Gravity well',
      tip: 'A mass below pulls everything — shots curve, ships drift. Lead your shots; dash against the pull.',
      wells: (st, host) => [{ x: host.W() / 2, y: host.H() + 140, k: 52000 * st.hazK }],
      dashMul: () => 1
    },
    storm: {
      name: 'Ion storm',
      tip: 'Charge builds in columns, then strikes. The shimmering lane is your warning — leave it.',
      strikeEvery: (st) => 2.7 / st.hazK,
      dashMul: () => 1.18
    },
    frost: {
      name: 'Cryofield',
      tip: 'Deep cold dulls your capacitor — dash charges rebuild far slower. Spend them like alloy.',
      dashMul: () => 1.9
    },
    haze: {
      name: 'Ring haze',
      tip: 'Ring dust scatters guidance — seeker rounds and sniper sights track at a fraction. Drift with the slow tide.',
      seekMul: (st) => st.hazK,
      dashMul: () => 1.12
    },
    flare: {
      name: 'Solar flare',
      tip: 'The sun exhales. Rising heat tides scorch the low field — read the glow climbing under you.',
      dashMul: () => 1.15
    },
    cloudbank: {
      name: 'Sulfur cloudbank',
      tip: 'Dense cloud shrouds hostiles until they commit. Watch the leading edge of the bank.',
      dashMul: () => 1.1
    }
  };

  G.HZ = {
    defs,

    make(host) {
      return {
        active: null, k: 0, wl: null, t: 0, strikeT: 0, strikeFlash: 0, strikeX: 0, nextStrike: 3,
        flares: [], clouds: [],

        begin() {
          const st = host.STAGE();
          const on = st && st.haz && host.mode() !== 'rush' && !host.school();
          this.active = on ? defs[st.haz] : null;
          this.k = on ? (st.hazK || 1) : 0;
          this.wl = on && this.active.wells ? this.active.wells(st, host) : null;
          this.t = 0; this.nextStrike = 2.4; this.strikeT = 0; this.strikeFlash = 0;
          this.flares.length = 0; this.clouds.length = 0;
          if (!this.active) return;
          if (st.haz === 'flare') for (let i = 0; i < 2; i++) this.flares.push(this.mkFlare(i * 4.2));
          if (st.haz === 'cloudbank') for (let i = 0; i < 3; i++)
            this.clouds.push({ x: host.rnd(0, host.W()), y: host.rnd(-30, 70), vx: host.rnd(60, 120) * (i % 2 ? 1 : -1), w: host.rnd(170, 340), a: host.rnd(.16, .28) });
          host.showCodex('haz_' + st.haz, this.active.name, this.active.tip);
        },

        mkFlare(off) {
          return { x: host.rnd(host.W() * .1, host.W() * .9), t: -off, life: 2.6, warn: 1.05, w: host.rnd(46, 92), y: host.H() + 40 };
        },

        stop() {
          this.active = null; this.k = 0; this.wl = null;
          this.flares.length = 0; this.clouds.length = 0; this.strikeT = 0; this.strikeFlash = 0;
        },

        update(dt) {
          if (!this.active) return;
          this.t += dt;
          if (this.active.strikeEvery) {
            this.nextStrike -= dt;
            if (this.nextStrike <= 0 && this.strikeT <= 0) {
              this.nextStrike = this.active.strikeEvery(host.STAGE()) * host.rnd(.8, 1.25);
              this.strikeX = host.rnd(60, host.W() - 60);
              this.strikeT = .8;                       /* telegraph, then bite */
            }
          }
          if (this.strikeT > 0) {
            this.strikeT -= dt;
            if (this.strikeT <= 0) {
              this.strikeFlash = .14;
              if (host.canHit() && Math.abs(host.pX() - this.strikeX) < 46)
                host.hurtPlayer({ x: this.strikeX, y: host.pY(), r: 8 });
            }
          }
          if (this.strikeFlash > 0) this.strikeFlash -= dt;
          for (let i = this.flares.length - 1; i >= 0; i--) {
            const f = this.flares[i];
            f.t += dt;
            f.y = host.H() + 30 - (host.H() + 160) * clamp(f.t / f.life, 0, 1);   /* bottom → past top */
            if (f.t > f.warn && f.t < f.life - .4 && host.canHit() &&
                Math.abs(host.pY() - f.y) < 26)
              host.hurtPlayer({ x: host.pX(), y: host.pY(), r: 6 });
            if (f.t > f.life) this.flares[i] = this.mkFlare(host.rnd(1.6, 4.4));
          }
          for (const c of this.clouds) {            /* REDUCE: banks hold their posts */
            if (!host.REDUCE()) c.x += c.vx * dt;
            if (c.x > host.W() + c.w) c.x = -c.w;
            if (c.x < -c.w) c.x = host.W() + c.w;
          }
        },

        /* inverse-falloff pull — inverse-SQUARE is far too violent at screen scale.
           Writes into `out` (one shared scratch) so per-bullet calls never allocate. */
        pull(x, y, out) {
          if (!this.wl) return null;
          const o = out || { ax: 0, ay: 0 };
          o.ax = 0; o.ay = 0;
          for (const w of this.wl) {
            const dx = w.x - x, dy = w.y - y;
            const d = Math.max(90, Math.sqrt(dx * dx + dy * dy));
            const f = w.k / d;
            o.ax += dx / d * f; o.ay += dy / d * f;
          }
          return o;
        },

        seekMul() { return this.active && this.active.seekMul ? this.active.seekMul(host.STAGE()) : 1; },
        dashMul() { return this.active ? this.active.dashMul() : 1; },

        drawBack() {
          const con = host.ctx();
          if (!this.active || !con) return;
          const t = host.now();
          if (this.strikeT > 0) {
            con.save();
            con.globalAlpha = host.REDUCE() ? .22 : .15 + .1 * Math.sin(t * 30);
            con.strokeStyle = host.PAL_tech();
            con.setLineDash([4, 10]);
            con.lineWidth = 2;
            con.beginPath(); con.moveTo(this.strikeX, 0); con.lineTo(this.strikeX, host.H()); con.stroke();
            con.restore();
          }
          for (const c of this.clouds) {
            con.save();
            con.globalAlpha = c.a;
            const g = con.createRadialGradient(c.x, c.y, 0, c.x, c.y, c.w);
            g.addColorStop(0, '#c8a34a'); g.addColorStop(1, 'rgba(200,163,74,0)');
            con.fillStyle = g;
            con.fillRect(c.x - c.w, c.y - c.w * .5, c.w * 2, c.w);
            con.restore();
          }
        },

        drawFront() {
          const con = host.ctx();
          if (!this.active || !con) return;
          if (this.strikeFlash > 0) {                    /* the bite: a jagged bolt */
            con.save();
            con.globalAlpha = Math.min(1, this.strikeFlash * 7);
            con.strokeStyle = '#ffffff';
            con.lineWidth = 3.4;
            con.beginPath(); con.moveTo(this.strikeX, 0);
            let y = 0, x = this.strikeX;
            while (y < host.H()) { y += 34; x += host.rnd(-13, 13); con.lineTo(x, y); }
            con.stroke();
            con.restore();
          }
          for (const f of this.flares) {
            if (f.t <= 0 || f.t > f.life) continue;
            const a = .2 * (f.t < f.warn ? f.t / f.warn : clamp(1 - (f.t - f.life * .55) / (f.life * .45), .25, 1));
            const g = con.createLinearGradient(0, f.y - 26, 0, f.y + 26);
            g.addColorStop(0, 'rgba(255,150,60,0)');
            g.addColorStop(.5, 'rgba(255,150,60,' + a.toFixed(3) + ')');
            g.addColorStop(1, 'rgba(255,150,60,0)');
            con.fillStyle = g;
            con.fillRect(0, f.y - 26, host.W(), 52);
          }
        }
      };
    },

    makeScratch() { return { ax: 0, ay: 0 }; }
  };
})();
