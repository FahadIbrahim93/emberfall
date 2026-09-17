#!/usr/bin/env node
/* genicons.js — generates icons/ and manifest.webmanifest for EMBERFALL's PWA.
   Zero dependencies: PNGs are hand-encoded (RGBA8, filter 0, node:zlib deflate)
   from a supersampled software rasterizer, so `node tools/genicons.js` is the
   whole asset pipeline. Re-run after changing the emblem. */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

/* ── minimal PNG encoder ── */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePNG(w, h, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;   // filter: none
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([sig, chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

/* ── software rasterizer: ember glow + ship silhouette, 4x4 supersampled ── */
const VOID = [3, 5, 11], EMBER = [255, 138, 43], HULL = [15, 20, 34], LIT = [255, 180, 84];
/* the vesper outline in 74-unit icon space (mirrors HULL_ART.vesper's hull) */
const SHIP = [
  [0, -26], [7, -10], [22, 14], [22, 22], [9, 16], [4, 22], [-4, 22], [-9, 16], [-22, 22], [-22, 14], [-7, -10]
];
function pointInShip(x, y) {
  let inside = false;
  for (let i = 0, j = SHIP.length - 1; i < SHIP.length; j = i++) {
    const [xi, yi] = SHIP[i], [xj, yj] = SHIP[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function renderIcon(size) {
  const px = Buffer.alloc(size * size * 4);
  const S = 4;   // supersample
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
        const fx = (x + (sx + .5) / S) / size * 74, fy = (y + (sy + .5) / S) / size * 74;
        let c;
        if (pointInShip(fx - 37, fy - 37)) c = HULL;
        else {
          const d = Math.hypot(fx - 37, fy - 41);
          const glow = Math.max(0, 1 - d / 46);
          c = [VOID[0] + (EMBER[0] - VOID[0]) * glow * .6,
               VOID[1] + (EMBER[1] - VOID[1]) * glow * .55,
               VOID[2] + (EMBER[2] - VOID[2]) * glow * .5];
          // wing edge lights
          const ed = Math.min(Math.hypot(Math.abs(fx - 37) - 22, fy - 37 - 18), 3);
          if (ed < 1.4 && glow > .2) c = LIT;
        }
        r += c[0]; g += c[1]; b += c[2]; a += 255;
      }
      const n = S * S, o = (y * size + x) * 4;
      px[o] = Math.round(r / n); px[o + 1] = Math.round(g / n); px[o + 2] = Math.round(b / n); px[o + 3] = Math.round(a / n);
    }
  }
  return encodePNG(size, size, px);
}

/* ── emit ── */
const outDir = path.join(__dirname, '..', 'icons');
fs.mkdirSync(outDir, { recursive: true });
for (const size of [192, 512]) {
  fs.writeFileSync(path.join(outDir, 'icon-' + size + '.png'), renderIcon(size));
  console.log('icons/icon-' + size + '.png');
}
const manifest = {
  name: 'EMBERFALL', short_name: 'EMBERFALL',
  description: 'An orbital intercept shooter. Hold the last corridor. Plays offline, on anything.',
  start_url: './index.html', scope: './', display: 'fullscreen', orientation: 'any',
  background_color: '#03050b', theme_color: '#03050b',
  icons: [
    { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
  ]
};
fs.writeFileSync(path.join(outDir, '..', 'manifest.webmanifest'),
  JSON.stringify(manifest, null, 2) + '\n');
console.log('manifest.webmanifest');
