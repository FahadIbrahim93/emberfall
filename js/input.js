/* ══════════════════════════════════════════════════════════════════════
   INPUT — four schemes, one contract: either set a follow point (pointer,
   touch) or a movement vector (keyboard, gamepad). Extracted from the
   core (d63a471). Load-time pure: this module only DECLARES; the core
   calls initInput() once the DOM exists to bind every listener.
   Core reads: getMove(), dashDirection(), pollGamepad(), resolveFiring(),
   INPUT.* state. Core symbols used from handlers: cv, $, AU, GAME, P, W, H,
   TOUCH, note, resize, finishBoot, startRun, pauseRun, resumeRun,
   closeSettings, saveCallsign, tryDash, tryBomb, hyp, clamp.
   ══════════════════════════════════════════════════════════════════════ */
const INPUT = {
  aimX: 0, aimY: 0, firing: false, mode: 'kb',
  keys: Object.create(null),
  mx: 0, my: 0, mouseDown: false,
  touchId: null, touchOX: 0, touchOY: 0, shipOX: 0, shipOY: 0,
  padIndex: null, padMoveX: 0, padMoveY: 0, padFire: false,
  moveOut: { active: false, x: 0, y: 0 }
};
let padPrev = {};
let wakeLock = null;

function isTouchDevice() {
  return matchMedia('(pointer:coarse)').matches || 'ontouchstart' in window;
}

/* one reusable movement-vector slot, written per poll */
function getMove() {
  const m = INPUT.moveOut;
  m.active = false; m.x = 0; m.y = 0;
  if (INPUT.mode === 'pad') {
    const l = hyp(INPUT.padMoveX, INPUT.padMoveY);
    if (l > .16) {
      m.active = true;
      const s = Math.min(1, l);
      m.x = INPUT.padMoveX / l * s;
      m.y = INPUT.padMoveY / l * s;
    }
    return m;
  }
  if (INPUT.mode === 'kb') {
    let dx = 0, dy = 0;
    const k = INPUT.keys;
    if (k.KeyA || k.ArrowLeft) dx -= 1;
    if (k.KeyD || k.ArrowRight) dx += 1;
    if (k.KeyW || k.ArrowUp) dy -= 1;
    if (k.KeyS || k.ArrowDown) dy += 1;
    if (dx || dy) {
      const l = hyp(dx, dy) || 1;
      m.active = true; m.x = dx / l; m.y = dy / l;
    }
    return m;
  }
  return m; // mouse / touch drive the follow point instead
}

function dashDirection() {
  const m = getMove();
  if (m.active) return [m.x, m.y];
  if (INPUT.mode === 'touch' || INPUT.mode === 'mouse') {
    const dx = INPUT.aimX - P.x, dy = INPUT.aimY - P.y;
    if (hyp(dx, dy) > 8) return [dx, dy];
  }
  return [0, -1];
}

/* ── keyboard ── */
function onKeyDown(e) {
  if (e.target && e.target.tagName === 'INPUT') {
    if (e.code === 'Enter') saveCallsign();
    return;
  }
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) {
    if (e.code !== 'Tab') e.preventDefault();
  }
  INPUT.keys[e.code] = true;
  if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) INPUT.mode = 'kb';
  if (e.repeat) return;
  AU.init(); AU.resume();

  if (GAME.state === 'boot') { finishBoot(); return; }
  if (e.code === 'KeyM') { AU.muted = !AU.muted; AU.applyVolumes(); note(AU.muted ? 'Audio muted' : 'Audio on'); }
  if (e.code === 'KeyF') toggleFullscreen();
  if (e.code === 'KeyP' || e.code === 'Escape') {
    if (GAME.state === 'playing') {
      if ($('s-set').classList.contains('on')) closeSettings();
      else GAME.paused ? resumeRun() : pauseRun();
    } else if ($('s-set').classList.contains('on')) closeSettings();
    else if (GAME.state === 'hangar') toTitle();
  }
  if (e.code === 'Tab' && (GAME.paused || GAME.state === 'over')) {
    trapTab(e, GAME.paused ? $('s-pause') : $('s-over'));
    return;
  }
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
    if (GAME.state === 'playing' && !GAME.paused) { const [dx, dy] = dashDirection(); tryDash(dx, dy); }
  }
  if (e.code === 'KeyE' || e.code === 'KeyQ') {
    if (GAME.state === 'playing' && !GAME.paused) tryBomb();
  }
  if (e.code === 'KeyB' && GAME.state === 'title') startRun('rush');
  if (e.code === 'Enter') {
    if (GAME.state === 'title') startRun('endless');
    else if (GAME.state === 'over') {
      if (!$('entryRow').classList.contains('hidden')) saveCallsign();
      else startRun(GAME.mode);
    }
  }
}
function onKeyUp(e) { INPUT.keys[e.code] = false; }

function trapTab(e, root) {
  const f = Array.from(root.querySelectorAll('button,input,[tabindex]:not([tabindex="-1"])'))
    .filter(el => el.offsetParent !== null && !el.disabled);
  if (!f.length) return;
  const i = f.indexOf(document.activeElement);
  if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
  else if (!e.shiftKey && (i === f.length - 1 || i === -1)) { e.preventDefault(); f[0].focus(); }
}

/* ── pointer (mouse) ── */
function onMouseMove(e) {
  if (e.pointerType === 'touch') return;
  INPUT.mx = e.clientX; INPUT.my = e.clientY;
  if (GAME.state === 'playing') {
    INPUT.mode = 'mouse';
    INPUT.aimX = e.clientX; INPUT.aimY = e.clientY;
  }
}
function onCanvasPointerDown(e) {
  AU.init(); AU.resume(); MUSIC.start(); AU.unlockiOS();
  if (GAME.state === 'boot') { finishBoot(); return; }
  if (e.pointerType === 'touch') { onTouchStart(e); return; }
  INPUT.mode = 'mouse';
  INPUT.aimX = e.clientX; INPUT.aimY = e.clientY;
  if (e.button === 2) {
    if (GAME.state === 'playing' && !GAME.paused) { const [dx, dy] = dashDirection(); tryDash(dx, dy); }
    return;
  }
  if (e.button === 1) { if (GAME.state === 'playing' && !GAME.paused) tryBomb(); return; }
  INPUT.mouseDown = true;
}
function onPointerUp(e) {
  if (e.pointerType === 'touch') { onTouchEnd(e); return; }
  INPUT.mouseDown = false;
}
function onPointerCancel(e) {
  if (e.pointerType === 'touch') onTouchEnd(e);
  INPUT.mouseDown = false;
}

/* ── touch: relative drag, which beats absolute follow on a small screen ── */
function onTouchStart(e) {
  if (INPUT.touchId !== null) return;
  INPUT.touchId = e.pointerId;
  INPUT.mode = 'touch';
  INPUT.touchOX = e.clientX; INPUT.touchOY = e.clientY;
  INPUT.shipOX = P.x; INPUT.shipOY = P.y;
  INPUT.aimX = P.x; INPUT.aimY = P.y;
  const s = $('stick');
  s.style.left = (e.clientX - TOUCH.stick / 2) + 'px';
  s.style.top = (e.clientY - TOUCH.stick / 2) + 'px';
  s.classList.add('on');
  try { cv.setPointerCapture(e.pointerId); } catch (err) { }
}
function onTouchMove(e) {
  if (e.pointerType !== 'touch' || e.pointerId !== INPUT.touchId) return;
  const dx = e.clientX - INPUT.touchOX, dy = e.clientY - INPUT.touchOY;
  INPUT.aimX = clamp(INPUT.shipOX + dx * 1.45, 16, W - 16);
  INPUT.aimY = clamp(INPUT.shipOY + dy * 1.45, 40, H - 20);
  const knob = $('stick').firstElementChild;
  const l = hyp(dx, dy), cap = TOUCH.knob;
  const kx = l > cap ? dx / l * cap : dx, ky = l > cap ? dy / l * cap : dy;
  knob.style.transform = 'translate(' + kx + 'px,' + ky + 'px)';
}
function onTouchEnd(e) {
  if (e.pointerId !== INPUT.touchId) return;
  INPUT.touchId = null;
  $('stick').classList.remove('on');
  const knob = $('stick').firstElementChild;
  if (knob) knob.style.transform = '';
}
function bindTouchButton(id, onDown) {
  const el = $(id);
  if (!el) return;
  el.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); onDown(); }, { passive: false });
}

/* ── gamepad ── */
function pollGamepad() {
  if (!navigator.getGamepads) return;
  let pads;
  try { pads = navigator.getGamepads(); } catch (e) { return; }
  let gp = null;
  for (const p of pads) if (p && p.connected) { gp = p; break; }
  if (!gp) return;
  const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
  const dead = .18;
  const mag = hyp(ax, ay);
  if (mag > dead) {
    INPUT.padMoveX = ax; INPUT.padMoveY = ay;
    INPUT.mode = 'pad';
  } else if (INPUT.mode === 'pad') { INPUT.padMoveX = 0; INPUT.padMoveY = 0; }
  const btn = i => gp.buttons[i] && gp.buttons[i].pressed;
  const edge = (i, fn) => { const now = btn(i); if (now && !padPrev[i]) fn(); padPrev[i] = now; };
  INPUT.padFire = btn(0) || btn(7) || btn(5);
  if (btn(0) || btn(7)) INPUT.mode = 'pad';
  edge(1, () => { if (GAME.state === 'playing' && !GAME.paused) { const [dx, dy] = dashDirection(); tryDash(dx, dy); } });
  edge(6, () => { if (GAME.state === 'playing' && !GAME.paused) { const [dx, dy] = dashDirection(); tryDash(dx, dy); } });
  edge(2, () => { if (GAME.state === 'playing' && !GAME.paused) tryBomb(); });
  edge(9, () => {
    if (GAME.state === 'playing') GAME.paused ? resumeRun() : pauseRun();
    else if (GAME.state === 'title') startRun('endless');
    else if (GAME.state === 'over') startRun(GAME.mode);
  });
}

function resolveFiring() {
  if (GAME.state !== 'playing' || GAME.paused || !P.alive) { INPUT.firing = false; return; }
  if (CFG.autofire) { INPUT.firing = true; return; }
  INPUT.firing =
    !!INPUT.keys.Space ||
    (INPUT.mode === 'mouse' && INPUT.mouseDown) ||
    (INPUT.mode === 'touch' && INPUT.touchId !== null) ||
    INPUT.padFire;
}

/* ── window lifecycle ── */
function toggleFullscreen() {
  try {
    if (!document.fullscreenElement) {
      (document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen || (() => { })).call(document.documentElement);
    } else {
      (document.exitFullscreen || document.webkitExitFullscreen || (() => { })).call(document);
    }
  } catch (e) { }
}
async function keepAwake(on) {
  try {
    if (on && 'wakeLock' in navigator && !wakeLock) wakeLock = await navigator.wakeLock.request('screen');
    else if (!on && wakeLock) { wakeLock.release(); wakeLock = null; }
  } catch (e) { }
}

/* every listener the input scheme owns, bound once by the core at boot */
function initInput() {
  addEventListener('keydown', onKeyDown);
  addEventListener('keyup', onKeyUp);
  addEventListener('pointermove', onMouseMove, { passive: true });
  cv.addEventListener('pointerdown', onCanvasPointerDown);
  addEventListener('pointerup', onPointerUp);
  addEventListener('pointercancel', onPointerCancel);
  cv.addEventListener('contextmenu', e => e.preventDefault());
  cv.addEventListener('pointermove', onTouchMove, { passive: true });
  bindTouchButton('bDash', () => { if (GAME.state === 'playing' && !GAME.paused) { const [dx, dy] = dashDirection(); tryDash(dx, dy); } });
  bindTouchButton('bBomb', () => { if (GAME.state === 'playing' && !GAME.paused) tryBomb(); });
  addEventListener('gamepadconnected', e => {
    INPUT.padIndex = e.gamepad.index;
    note('Controller connected', 'good');
  });
  addEventListener('gamepaddisconnected', () => { INPUT.padIndex = null; });
  addEventListener('resize', () => { resize(); }, { passive: true });
  addEventListener('orientationchange', () => setTimeout(resize, 220));
  addEventListener('blur', () => { if (GAME.state === 'playing' && !GAME.paused) pauseRun(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && GAME.state === 'playing' && !GAME.paused) pauseRun();
    if (!document.hidden) AU.resume();
  });
}
