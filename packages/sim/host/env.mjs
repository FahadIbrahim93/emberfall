/* parity/env.mjs — a headless browser stub for the SHIPPED game.

   The game is nine classic scripts (the inline core is now js/sim.js). This
   module evaluates exactly those bytes, in exactly that order, inside a Node
   `vm` context with a stub DOM/audio/storage environment. No bundler, no
   transcription: if the inline core cannot run here, the loader fails loudly
   rather than silently testing a copy.

   Used by tools/parity/digest.mjs. Not shipped: nothing here is in the
   service-worker precache, the release payload or the portal build. */
'use strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.join(HERE, '..', '..', '..');

/* ── a deterministic Math.random so an "endless" run is reproducible ── */
export function fixedRandom(seed = 0x5eed1234) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ── DOM stubs ─────────────────────────────────────────────────────────
   A canvas 2D context answers every method with a no-op, and every getter
   with a sensible primitive, so renderer code runs without assertions. */
function makeCtx(canvas) {
  const gradient = () => ({ addColorStop() { } });
  const target = {
    canvas,
    save() { }, restore() { }, beginPath() { }, closePath() { }, moveTo() { }, lineTo() { },
    arc() { }, arcTo() { }, rect() { }, fill() { }, stroke() { }, clip() { }, translate() { },
    rotate() { }, scale() { }, setTransform() { }, resetTransform() { }, transform() { },
    fillRect() { }, strokeRect() { }, clearRect() { }, drawImage() { }, fillText() { },
    strokeText() { }, setLineDash() { }, quadraticCurveTo() { }, bezierCurveTo() { },
    ellipse() { }, roundRect() { }, createLinearGradient: gradient, createRadialGradient: gradient,
    createPattern: () => null, createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
    getImageData: (x, y, w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
    putImageData() { }, measureText: () => ({ width: 10, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 }),
    getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
    isPointInPath: () => false, isPointInStroke: () => false,
  };
  return new Proxy(target, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'globalAlpha' || k === 'lineWidth' || k === 'font' || k === 'textAlign' ||
        k === 'textBaseline' || k === 'fillStyle' || k === 'strokeStyle' || k === 'shadowBlur' ||
        k === 'shadowColor' || k === 'globalCompositeOperation' || k === 'lineCap' ||
        k === 'lineJoin' || k === 'filter' || k === 'imageSmoothingEnabled' || k === 'miterLimit') return 0;
      return () => { };
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}

function makeStyle() {
  return new Proxy({
    setProperty() { }, getPropertyValue: () => '', removeProperty() { }, item: () => '',
  }, {
    get: (t, k) => (k in t ? t[k] : ''),
    set: (t, k, v) => { t[k] = v; return true; },
  });
}

function makeElement(tag = 'div', id = '') {
  const el = {
    tagName: String(tag).toUpperCase(),
    id,
    width: 540, height: 960,
    clientWidth: 540, clientHeight: 960,
    offsetWidth: 540, offsetHeight: 960,
    textContent: '', value: '', checked: false, disabled: false,
    dataset: {}, children: [], style: makeStyle(), parentNode: null,
    classList: {
      _s: new Set(),
      add(...c) { c.forEach(x => this._s.add(x)); },
      remove(...c) { c.forEach(x => this._s.delete(x)); },
      toggle(c, on) { const v = on === undefined ? !this._s.has(c) : !!on; v ? this._s.add(c) : this._s.delete(c); return v; },
      contains(c) { return this._s.has(c); },
    },
    appendChild(c) { this.children.push(c); c.parentNode = this; return c; },
    removeChild(c) { this.children = this.children.filter(x => x !== c); return c; },
    insertBefore(c) { this.children.push(c); c.parentNode = this; return c; },
    replaceChildren(...c) { this.children = c; },
    addEventListener() { }, removeEventListener() { }, dispatchEvent() { return true; },
    setAttribute() { }, removeAttribute() { }, getAttribute() { return null; }, hasAttribute() { return false; },
    querySelector() { return null; }, querySelectorAll() { return []; },
    closest() { return null; }, focus() { }, blur() { }, click() { }, scrollIntoView() { },
    remove() { if (this.parentNode) this.parentNode.removeChild(this); },
    getBoundingClientRect() { return { top: 0, left: 0, width: 540, height: 960, right: 540, bottom: 960 }; },
    getContext() { return this._ctx || (this._ctx = makeCtx(this)); },
    toDataURL() { return 'data:,'; }, animate() { return { cancel() { } }; },
    set innerHTML(v) { this._html = v; }, get innerHTML() { return this._html || ''; },
  };
  return el;
}

function makeEnvironment(randomSeed) {
  const elements = new Map();
  const bySelector = new Map();
  const listeners = new Map();
  const store = new Map();

  const element = (id) => {
    if (!elements.has(id)) elements.set(id, makeElement('div', id));
    return elements.get(id);
  };

  const document = {
    /* scripts load while the document is still "loading", exactly as in a
       browser: cloud.js defers its boot to DOMContentLoaded instead of
       touching NET, which has not been defined yet. */
    readyState: 'loading',
    documentElement: element('html'),
    head: element('head'),
    body: element('body'),
    activeElement: null,
    createElement: (tag) => makeElement(tag),
    createElementNS: (_ns, tag) => makeElement(tag),
    createTextNode: (t) => ({ nodeValue: t, textContent: t }),
    getElementById: (id) => element(id),
    querySelector: (sel) => {
      if (!bySelector.has(sel)) bySelector.set(sel, makeElement('div'));
      return bySelector.get(sel);
    },
    querySelectorAll: () => [],
    getElementsByTagName: () => [],
    getElementsByClassName: () => [],
    addEventListener: (type, fn) => { listeners.set(type, fn); },
    removeEventListener() { },
    dispatchEvent: () => true,
    execCommand: () => false,
    fonts: { ready: Promise.resolve(), add() { }, load: () => Promise.resolve() },
  };
  document.documentElement.style = makeStyle();
  document.body.style = makeStyle();

  const media = (q) => ({ matches: false, media: q, addEventListener() { }, removeEventListener() { }, addListener() { }, removeListener() { } });

  const storage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
    clear: () => store.clear(),
    key: (i) => Array.from(store.keys())[i] ?? null,
    get length() { return store.size; },
  };

  const audioNode = () => new Proxy({}, {
    get: (t, k) => (k in t ? t[k] : (k === 'gain' || k === 'frequency' || k === 'Q' || k === 'pan'
      ? { value: 0, setValueAtTime() { }, linearRampToValueAtTime() { }, exponentialRampToValueAtTime() { }, cancelScheduledValues() { } }
      : k === 'numberOfInputs' || k === 'numberOfOutputs' ? 1 : () => audioNode())),
    set: (t, k, v) => { t[k] = v; return true; },
  });

  class AudioContextStub {
    constructor() {
      this.state = 'running'; this.currentTime = 0; this.sampleRate = 48000;
      this.destination = audioNode();
      this.listener = { positionX: { value: 0 }, positionY: { value: 0 }, positionZ: { value: 0 } };
    }
    createGain() { return audioNode(); }
    createOscillator() { return audioNode(); }
    createBiquadFilter() { return audioNode(); }
    createBuffer() { return { getChannelData: () => new Float32Array(256), duration: 1, length: 256, numberOfChannels: 1, sampleRate: 48000 }; }
    createBufferSource() { return audioNode(); }
    createDynamicsCompressor() { return audioNode(); }
    createStereoPanner() { return audioNode(); }
    createConvolver() { return audioNode(); }
    createDelay() { return audioNode(); }
    createWaveShaper() { return audioNode(); }
    createAnalyser() { return { fftSize: 32, frequencyBinCount: 16, getByteFrequencyData() { }, getByteTimeDomainData() { }, connect() { } }; }
    resume() { return Promise.resolve(); }
    suspend() { return Promise.resolve(); }
    close() { return Promise.resolve(); }
  }

  /* timers must never hold the process open: the shipped core schedules
     note() removals and background tickers that only matter in a browser. */
  const safeTimeout = (fn, ms) => { const t = setTimeout(fn, ms); if (t && t.unref) t.unref(); return t; };
  const safeInterval = (fn, ms) => { const t = setInterval(fn, ms); if (t && t.unref) t.unref(); return t; };

  let now = 0;
  let uuid = 0;
  const crypto = {
    randomUUID: () => `00000000-0000-4000-8000-${String(++uuid).padStart(12, '0')}`,
    getRandomValues: (arr) => { for (let i = 0; i < arr.length; i++) arr[i] = (i * 37 + 11) & 255; return arr; },
  };

  const location = {
    href: 'http://localhost/', origin: 'http://localhost', protocol: 'http:',
    host: 'localhost', hostname: 'localhost', port: '', pathname: '/', search: '', hash: '',
  };

  const navigator = {
    userAgent: 'emberfall-parity',
    language: 'en-US',
    onLine: true,
    vibrate: () => true,
    clipboard: { writeText: () => Promise.resolve() },
    serviceWorker: { register: () => Promise.resolve(), addEventListener() { }, controller: null },
    getGamepads: () => [],
  };

  const win = {
    innerWidth: 1440, innerHeight: 900, devicePixelRatio: 1,
    addEventListener: (type, fn) => { listeners.set(type, fn); },
    removeEventListener() { },
    matchMedia: media,
    requestAnimationFrame: () => 0,
    cancelAnimationFrame() { },
    setTimeout: safeTimeout,
    clearTimeout: (id) => globalThis.clearTimeout(id),
    setInterval: safeInterval,
    clearInterval: (id) => globalThis.clearInterval(id),
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    visualViewport: { addEventListener() { }, width: 1440, height: 900 },
    location, navigator, document,
    localStorage: storage, sessionStorage: storage,
    crypto,
    performance: { now: () => now, mark() { }, measure() { }, getEntriesByName: () => [] },
    fetch: () => Promise.reject(new Error('parity: network disabled')),
    AudioContext: AudioContextStub,
    webkitAudioContext: AudioContextStub,
    Blob, URL, TextEncoder, TextDecoder,
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    screen: { width: 1440, height: 900, orientation: { type: 'landscape-primary', addEventListener() { } } },
    Image: class { set src(_v) { } },
    OffscreenCanvas: class { constructor(w, h) { this.width = w; this.height = h; } getContext() { return makeCtx({ width: this.width, height: this.height }); } },
  };
  win.window = win;
  win.self = win;
  win.globalThis = win;
  win.top = win;
  win.parent = win;

  const sandbox = { ...win, window: win, self: win, top: win, parent: win, console };
  sandbox.document = document;
  sandbox.location = location;
  sandbox.navigator = navigator;
  sandbox.localStorage = storage;
  sandbox.performance = win.performance;
  sandbox.crypto = crypto;
  sandbox.Math = Object.create(Math);
  sandbox.Math.random = fixedRandom(randomSeed);
  sandbox.setTimeout = safeTimeout;
  sandbox.clearTimeout = win.clearTimeout;
  sandbox.setInterval = safeInterval;
  sandbox.clearInterval = win.clearInterval;

  return { sandbox, document, listeners, store, win };
}

/* the shipped script list, in the order index.html loads it.
   After Gate 3 extraction the inline core is js/sim.js, so there are nine
   classic scripts and zero inline blocks. */
export function scriptSources() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const srcs = [...html.matchAll(/<script src="(js\/[^"]+)"><\/script>/g)].map(m => m[1]);
  const inlines = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
    .map(m => m[1]).filter(s => s.trim());
  if (!srcs.length) throw new Error('parity: could not find the shipped scripts in index.html');
  if (inlines.length) throw new Error('parity: index.html still has an inline <script> block; the core must live in js/sim.js');
  return { srcs, inlines };
}

export function loadShippedCore(opts = {}) {
  const { sandbox } = makeEnvironment(opts.randomSeed);
  const context = vm.createContext(sandbox, {
    microtaskMode: 'afterEvaluate',
    codeGeneration: { strings: true, wasm: false },
  });
  const { srcs, inlines } = scriptSources();

  for (const src of srcs) {
    const file = path.join(ROOT, src);
    const code = fs.readFileSync(file, 'utf8');
    try {
      new vm.Script(code, { filename: file }).runInContext(context);
    } catch (e) {
      throw new Error(`parity: ${src} failed to load — ${e && e.message || e}`);
    }
  }

  inlines.forEach((code, i) => {
    try {
      new vm.Script(code, { filename: path.join(ROOT, 'index.html') }).runInContext(context);
    } catch (e) {
      throw new Error(`parity: inline payload ${i + 1} failed to load — ${e && e.message || e}`);
    }
  });

  return {
    context,
    /** evaluate an expression and return its value */
    run(code, filename = 'parity:probe') { return vm.runInContext(code, context, { filename }); },
  };
}
