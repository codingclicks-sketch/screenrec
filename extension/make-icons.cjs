// Pure-Node PNG icon generator — no native deps.
// Draws a rounded-rect purple gradient with a white record dot.
// Usage: node make-icons.cjs
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

function crc32(buf) {
  let c, crcTable = crc32.table;
  if (!crcTable) {
    crcTable = crc32.table = [];
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePNG(width, height, rgba) {
  // rgba: Buffer of width*height*4
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // color type RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  // raw scanlines with filter byte 0
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Simple supersampled renderer for smooth edges
function render(size) {
  const SS = 4;                 // supersample factor
  const S = size * SS;
  const px = Buffer.alloc(S * S * 4);

  const r = S * 0.22;           // corner radius
  const cx = S / 2, cy = S / 2;
  const dotR = S * 0.26;
  const ringR = S * 0.37;
  const ringW = S * 0.035;

  function set(x, y, rr, gg, bb, aa) {
    const i = (y * S + x) * 4;
    // alpha-over composite onto existing
    const ea = px[i + 3] / 255;
    const na = aa / 255;
    const oa = na + ea * (1 - na);
    if (oa === 0) return;
    px[i]     = Math.round((rr * na + px[i]   * ea * (1 - na)) / oa);
    px[i + 1] = Math.round((gg * na + px[i+1] * ea * (1 - na)) / oa);
    px[i + 2] = Math.round((bb * na + px[i+2] * ea * (1 - na)) / oa);
    px[i + 3] = Math.round(oa * 255);
  }

  function inRoundRect(x, y) {
    // distance to rounded rect (inside = true)
    const minX = r, maxX = S - r, minY = r, maxY = S - r;
    let dx = 0, dy = 0;
    if (x < minX) dx = minX - x; else if (x > maxX) dx = x - maxX;
    if (y < minY) dy = minY - y; else if (y > maxY) dy = y - maxY;
    if (x >= minX && x <= maxX) return y >= 0 && y <= S;
    if (y >= minY && y <= maxY) return x >= 0 && x <= S;
    return Math.sqrt(dx*dx + dy*dy) <= r;
  }

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      if (!inRoundRect(x + 0.5, y + 0.5)) continue;
      // vertical purple gradient #9b7dff -> #6c47ff
      const t = y / S;
      const rr = Math.round(0x9b + (0x6c - 0x9b) * t);
      const gg = Math.round(0x7d + (0x47 - 0x7d) * t);
      const bb = Math.round(0xff + (0xff - 0xff) * t);
      set(x, y, rr, gg, bb, 255);
    }
  }

  // ring (only for >=48)
  if (size >= 48) {
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const d = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
        if (Math.abs(d - ringR) <= ringW / 2) set(x, y, 255, 255, 255, 115);
      }
    }
  }

  // white record dot
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const d = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      if (d <= dotR) {
        // antialias edge
        const a = d > dotR - 1.5 ? Math.max(0, (dotR - d) / 1.5) : 1;
        set(x, y, 255, 255, 255, Math.round(255 * a));
      }
    }
  }

  // downsample SSxSS -> size
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r2 = 0, g2 = 0, b2 = 0, a2 = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const i = ((y * SS + sy) * S + (x * SS + sx)) * 4;
          const a = px[i + 3];
          r2 += px[i] * a; g2 += px[i+1] * a; b2 += px[i+2] * a; a2 += a;
        }
      }
      const o = (y * size + x) * 4;
      if (a2 === 0) { out[o]=out[o+1]=out[o+2]=out[o+3]=0; }
      else {
        out[o]   = Math.round(r2 / a2);
        out[o+1] = Math.round(g2 / a2);
        out[o+2] = Math.round(b2 / a2);
        out[o+3] = Math.round(a2 / (SS * SS));
      }
    }
  }
  return out;
}

[16, 48, 128].forEach(size => {
  const rgba = render(size);
  const png = encodePNG(size, size, rgba);
  fs.writeFileSync(path.join(__dirname, `icon${size}.png`), png);
  console.log(`icon${size}.png (${png.length} bytes)`);
});
// Store listing icon (512) — handy for the Web Store listing graphics
const big = render(512);
fs.writeFileSync(path.join(__dirname, 'store-icon-512.png'), encodePNG(512, 512, big));
console.log('store-icon-512.png');
