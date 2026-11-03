import fs from 'fs';
import { Script } from 'vm';

const src = fs.readFileSync(new URL('./audio.js', import.meta.url), 'utf8');

/* Minimal AudioContext mock — just enough construction surface for js/audio.js
   to load and expose its contract; nothing actually renders. */
function AudioContext() {
  this.state = 'running';
  this.currentTime = 0;
  this.sampleRate = 48000;
  this.destination = {};
  this.resume = () => Promise.resolve();
  this.createGain = () => ({ gain: { value: 0 }, connect() { return this; } });
  this.createOscillator = () => ({
    type: '',
    frequency: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} },
    connect() { return this; },
    start() {},
    stop() {},
  });
  this.createBufferSource = () => ({ buffer: null, connect() { return this; }, start() {}, stop() {} });
  this.createBuffer = (ch, len, rate) => ({ getChannelData: () => new Float32Array(len) });
}

const ctx = {
  window: {
    AU: undefined,
    MUSIC: undefined,
    addEventListener: () => {},
    AudioContext,
  },
  console,
  setTimeout,
  clearTimeout,
  document: undefined,
  performance,
  AudioContext,
};
try {
  const exposed = `\n;window.__AU_EXPOSED = (typeof AU !== 'undefined') ? AU : undefined;\nwindow.__MUSIC_EXPOSED = (typeof MUSIC !== 'undefined') ? MUSIC : undefined;`;
  new Script(src + exposed).runInNewContext(ctx);
} catch (e) {
  console.log('audio load error', e?.message?.slice(0, 120));
}
console.log('AU shape', typeof ctx.window.__AU_EXPOSED);
console.log('MUSIC shape', typeof ctx.window.__MUSIC_EXPOSED);

/* js/audio.js exports via classic-script lexical globals (const AU/const MUSIC),
   not window.* — the shim above reaches them the same way index.html's inline
   core does. */
const AU = ctx.window.__AU_EXPOSED;
const MUSIC = ctx.window.__MUSIC_EXPOSED;

const ok =
  typeof AU === 'object' &&
  typeof MUSIC === 'object' &&
  typeof AU.ui === 'function' &&
  typeof AU.gameOver === 'function' &&
  typeof AU.mute === 'function' &&
  typeof AU.unmute === 'function' &&
  typeof AU.onOff === 'function' &&
  typeof AU.applyVolumes === 'function' &&
  typeof AU.ready === 'boolean' &&
  typeof AU.ctx === 'object' &&
  typeof MUSIC.set === 'function' &&
  typeof MUSIC.start === 'function' &&
  typeof MUSIC.startDrone === 'function' &&
  typeof MUSIC.stopDrone === 'function';

console.log(ok ? 'AUDIO CONTRACT OK' : 'AUDIO CONTRACT MISSING');
if (!ok) process.exitCode = 1;
