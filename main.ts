// news-image-20261123 — ROUND 2 resubmission: sums up Tuesday 24 November 2026
// world news in one image. Written fresh in this session (24 Nov 2026).
// Node 22, standard library only, no network. Draws a 1024x1024 PNG.
// Deterministic: no clock, no randomness, fixed palette — two runs write identical bytes.
import * as fs from "node:fs";
import * as path from "node:path";
import * as zlib from "node:zlib";

const W = 1024;
const H = 1024;

// ---------- palette ----------
type RGB = [number, number, number];
const PAPER: RGB = [247, 243, 234];
const WHITE: RGB = [255, 255, 255];
const INK: RGB = [26, 26, 26];
const NAVY: RGB = [16, 35, 63];
const GOLD: RGB = [201, 162, 39];
const BRONZE: RGB = [122, 84, 20];
const CARD_BORDER: RGB = [216, 210, 196];
const MUTED: RGB = [110, 104, 90];
const SKY: RGB = [127, 179, 213];
const LEAF: RGB = [46, 139, 87];
const RED: RGB = [179, 64, 42];
const DARKRED: RGB = [122, 31, 43];
const BLUE: RGB = [29, 78, 158];
const UKRBLUE: RGB = [43, 94, 167];
const UKRYELLOW: RGB = [232, 180, 0];
const ORANGE: RGB = [217, 93, 30];
const FLAME: RGB = [232, 106, 28];
const FLAMEY: RGB = [242, 194, 0];
const STEEL: RGB = [138, 141, 145];
const SLATE: RGB = [74, 74, 82];
const RUBBLE: RGB = [150, 148, 140];
const BARREL: RGB = [52, 58, 64];
const BARREL_TOP: RGB = [88, 96, 104];
const WOOD: RGB = [96, 64, 32];

// ---------- PNG encoder ----------
const CRC_TABLE: number[] = (() => {
  const t: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}

function encodePng(rgb: Buffer, width: number, height: number): Buffer {
  const raw = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 3)] = 0; // filter: none
    rgb.copy(raw, y * (1 + width * 3) + 1, y * width * 3, (y + 1) * width * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------- canvas ----------
class Canvas {
  data: Buffer;
  w: number;
  h: number;
  constructor(w: number, h: number, bg: RGB) {
    this.w = w;
    this.h = h;
    this.data = Buffer.alloc(w * h * 3);
    this.fillRect(0, 0, w, h, bg);
  }
  set(x: number, y: number, c: RGB): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 3;
    this.data[i] = c[0];
    this.data[i + 1] = c[1];
    this.data[i + 2] = c[2];
  }
  fillRect(x: number, y: number, w: number, h: number, c: RGB): void {
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(this.w, Math.ceil(x + w));
    const y1 = Math.min(this.h, Math.ceil(y + h));
    for (let yy = y0; yy < y1; yy++) {
      for (let xx = x0; xx < x1; xx++) this.set(xx, yy, c);
    }
  }
  strokeRect(x: number, y: number, w: number, h: number, t: number, c: RGB): void {
    this.fillRect(x, y, w, t, c);
    this.fillRect(x, y + h - t, w, t, c);
    this.fillRect(x, y, t, h, c);
    this.fillRect(x + w - t, y, t, h, c);
  }
  fillCircle(cx: number, cy: number, r: number, c: RGB): void {
    for (let dy = -r; dy <= r; dy++) {
      const half = Math.floor(Math.sqrt(r * r - dy * dy));
      this.fillRect(cx - half, cy + dy, half * 2 + 1, 1, c);
    }
  }
  circle(cx: number, cy: number, r: number, t: number, c: RGB): void {
    for (let dy = -r - t; dy <= r + t; dy++) {
      const outer = Math.sqrt(Math.max(0, (r + t) * (r + t) - dy * dy));
      const inner = Math.sqrt(Math.max(0, r * r - dy * dy));
      const x0 = Math.floor(cx - outer);
      const x1 = Math.ceil(cx + outer);
      for (let xx = x0; xx <= x1; xx++) {
        const d = Math.abs(xx - cx);
        if (d >= inner - 0.5 && d <= outer + 0.5) this.set(xx, cy + dy, c);
      }
    }
  }
  line(x0: number, y0: number, x1: number, y1: number, w: number, c: RGB): void {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const steps = Math.max(Math.abs(dx), Math.abs(dy), 1);
    const half = Math.floor(w / 2);
    for (let i = 0; i <= steps; i++) {
      const x = Math.round(x0 + (dx * i) / steps);
      const y = Math.round(y0 + (dy * i) / steps);
      this.fillRect(x - half, y - half, w, w, c);
    }
  }
  fillTriangle(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, c: RGB): void {
    const minY = Math.min(y0, y1, y2);
    const maxY = Math.max(y0, y1, y2);
    for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
      const xs: number[] = [];
      const edges: [number, number, number, number][] = [
        [x0, y0, x1, y1],
        [x1, y1, x2, y2],
        [x2, y2, x0, y0],
      ];
      for (const [ax, ay, bx, by] of edges) {
        if ((ay <= y && by > y) || (by <= y && ay > y)) {
          xs.push(ax + ((y - ay) * (bx - ax)) / (by - ay));
        }
      }
      if (xs.length >= 2) {
        const a = Math.min(...xs);
        const b = Math.max(...xs);
        this.fillRect(Math.floor(a), y, Math.ceil(b) - Math.floor(a) + 1, 1, c);
      }
    }
  }
}

// ---------- 5x7 bitmap font (uppercase, digits, punctuation) ----------
const FONT: Record<string, string[]> = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01110", "10001", "10000", "10111", "10001", "10001", "01111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["01110", "00100", "00100", "00100", "00100", "00100", "01110"],
  J: ["00111", "00010", "00010", "00010", "00010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "11011", "10001"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11111", "00010", "00100", "00010", "00001", "10001", "01110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  "6": ["01110", "10000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00001", "01110"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  "-": ["00000", "00000", "00000", "01110", "00000", "00000", "00000"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
  ",": ["00000", "00000", "00000", "00000", "01100", "00100", "01000"],
  ":": ["00000", "01100", "01100", "00000", "01100", "01100", "00000"],
  "'": ["00100", "00100", "01000", "00000", "00000", "00000", "00000"],
  "(": ["00010", "00100", "01000", "01000", "01000", "00100", "00010"],
  ")": ["01000", "00100", "00010", "00010", "00010", "00100", "01000"],
  "/": ["00001", "00010", "00010", "00100", "01000", "01000", "10000"],
  "%": ["11001", "11010", "00010", "00100", "01000", "01011", "10011"],
  "+": ["00000", "00100", "00100", "11111", "00100", "00100", "00000"],
  "$": ["00100", "01111", "10100", "01110", "00101", "11110", "00100"],
};

function textWidth(s: string, scale: number): number {
  return s.length * 6 * scale - scale;
}

function drawText(cv: Canvas, s: string, x: number, y: number, scale: number, c: RGB): void {
  let cx = x;
  for (const ch of s) {
    const g = FONT[ch] || FONT[" "];
    for (let r = 0; r < 7; r++) {
      for (let col = 0; col < 5; col++) {
        if (g[r][col] === "1") cv.fillRect(cx + col * scale, y + r * scale, scale, scale, c);
      }
    }
    cx += 6 * scale;
  }
}

function drawTextCentered(cv: Canvas, s: string, cx: number, y: number, scale: number, c: RGB): void {
  drawText(cv, s, cx - Math.floor(textWidth(s, scale) / 2), y, scale, c);
}

function drawTextRight(cv: Canvas, s: string, right: number, y: number, scale: number, c: RGB): void {
  drawText(cv, s, right - textWidth(s, scale), y, scale, c);
}

// ---------- story icons (centered on cx, cy) ----------
function iconOil(cv: Canvas, cx: number, cy: number): void {
  // oil barrel, left
  const bx = cx - 88;
  const by = cy - 46;
  cv.fillRect(bx, by, 78, 92, BARREL);
  cv.strokeRect(bx, by, 78, 92, 3, INK);
  cv.fillRect(bx, by, 78, 12, BARREL_TOP);
  cv.fillRect(bx, by + 30, 78, 4, INK);
  cv.fillRect(bx, by + 58, 78, 4, INK);
  drawTextCentered(cv, "OIL", bx + 39, by + 40, 2, WHITE);
  // big red down arrow, right
  const ax = cx + 52;
  cv.fillRect(ax - 7, cy - 56, 14, 72, RED);
  cv.fillTriangle(ax - 22, cy + 16, ax + 22, cy + 16, ax, cy + 58, RED);
  cv.line(ax - 7, cy - 56, ax - 7, cy + 16, 2, DARKRED);
  cv.line(ax + 7, cy - 56, ax + 7, cy + 16, 2, DARKRED);
}

function iconAwacs(cv: Canvas, cx: number, cy: number): void {
  // tail fin
  cv.fillTriangle(cx - 104, cy - 6, cx - 104, cy - 50, cx - 72, cy - 6, WHITE);
  cv.line(cx - 104, cy - 6, cx - 104, cy - 50, 3, INK);
  cv.line(cx - 104, cy - 50, cx - 72, cy - 6, 3, INK);
  // radar dome on top
  cv.fillCircle(cx - 8, cy - 26, 19, WHITE);
  cv.circle(cx - 8, cy - 26, 19, 3, INK);
  cv.fillRect(cx - 16, cy - 12, 16, 8, STEEL);
  // fuselage
  cv.fillRect(cx - 104, cy - 6, 196, 26, WHITE);
  cv.strokeRect(cx - 104, cy - 6, 196, 26, 3, INK);
  // nose
  cv.fillTriangle(cx + 92, cy - 6, cx + 118, cy + 7, cx + 92, cy + 20, WHITE);
  cv.line(cx + 92, cy - 6, cx + 118, cy + 7, 3, INK);
  cv.line(cx + 118, cy + 7, cx + 92, cy + 20, 3, INK);
  // windows
  for (let i = 0; i < 5; i++) {
    cv.fillRect(cx - 78 + i * 20, cy + 2, 9, 9, BLUE);
  }
  // swept wing below
  cv.fillTriangle(cx - 34, cy + 20, cx + 8, cy + 20, cx - 12, cy + 56, WHITE);
  cv.line(cx - 34, cy + 20, cx - 12, cy + 56, 3, INK);
  cv.line(cx + 8, cy + 20, cx - 12, cy + 56, 3, INK);
  // radar waves above the dome
  cv.line(cx - 40, cy - 52, cx - 30, cy - 62, 3, GOLD);
  cv.line(cx - 30, cy - 62, cx - 20, cy - 52, 3, GOLD);
  cv.line(cx + 6, cy - 56, cx + 16, cy - 66, 3, GOLD);
  cv.line(cx + 16, cy - 66, cx + 26, cy - 56, 3, GOLD);
}

function iconShips(cv: Canvas, cx: number, cy: number): void {
  // smoke puffs
  cv.fillCircle(cx + 18, cy - 58, 11, STEEL);
  cv.fillCircle(cx + 82, cy - 62, 9, RUBBLE);
  cv.fillCircle(cx + 52, cy - 68, 8, STEEL);
  // explosion burst above the deck
  cv.fillCircle(cx + 58, cy - 42, 14, FLAMEY);
  cv.fillTriangle(cx + 58, cy - 66, cx + 46, cy - 42, cx + 70, cy - 42, ORANGE);
  cv.fillTriangle(cx + 58, cy - 18, cx + 46, cy - 42, cx + 70, cy - 42, ORANGE);
  cv.fillTriangle(cx + 34, cy - 42, cx + 58, cy - 54, cx + 58, cy - 30, ORANGE);
  cv.fillTriangle(cx + 82, cy - 42, cx + 58, cy - 54, cx + 58, cy - 30, ORANGE);
  // mast
  cv.line(cx - 28, cy - 16, cx - 28, cy - 50, 3, INK);
  cv.fillRect(cx - 36, cy - 50, 16, 6, INK);
  // superstructure
  cv.fillRect(cx - 62, cy - 16, 72, 26, [150, 155, 160]);
  cv.strokeRect(cx - 62, cy - 16, 72, 26, 3, INK);
  cv.fillRect(cx - 52, cy - 8, 10, 8, NAVY);
  cv.fillRect(cx - 34, cy - 8, 10, 8, NAVY);
  // deck flames
  cv.fillTriangle(cx - 44, cy + 10, cx - 20, cy + 10, cx - 32, cy - 14, FLAME);
  cv.fillTriangle(cx + 2, cy + 10, cx + 26, cy + 10, cx + 14, cy - 18, ORANGE);
  cv.fillCircle(cx - 32, cy - 2, 7, FLAMEY);
  cv.fillCircle(cx + 14, cy - 4, 8, FLAMEY);
  // hull
  cv.fillRect(cx - 102, cy + 10, 190, 30, SLATE);
  cv.fillTriangle(cx + 88, cy + 10, cx + 116, cy + 10, cx + 88, cy + 40, SLATE);
  cv.fillRect(cx - 102, cy + 10, 190, 5, DARKRED);
  // waves
  for (let i = 0; i < 3; i++) {
    const wy = cy + 52 + i * 12;
    for (let x = cx - 112; x < cx + 112; x += 16) {
      cv.line(x, wy, x + 8, wy - 5, 3, BLUE);
      cv.line(x + 8, wy - 5, x + 16, wy, 3, BLUE);
    }
  }
}

function iconUkraine(cv: Canvas, cx: number, cy: number): void {
  // heart above the rubble, circles pulled together so it reads as one heart
  cv.fillCircle(cx - 18, cy - 52, 17, UKRYELLOW);
  cv.fillCircle(cx + 18, cy - 52, 17, UKRYELLOW);
  cv.fillTriangle(cx - 35, cy - 48, cx + 35, cy - 48, cx, cy - 2, UKRYELLOW);
  cv.circle(cx - 18, cy - 52, 17, 3, UKRBLUE);
  cv.circle(cx + 18, cy - 52, 17, 3, UKRBLUE);
  // cracked building blocks
  cv.fillRect(cx - 96, cy + 14, 58, 46, RUBBLE);
  cv.strokeRect(cx - 96, cy + 14, 58, 46, 3, INK);
  cv.fillRect(cx - 30, cy + 2, 62, 58, STEEL);
  cv.strokeRect(cx - 30, cy + 2, 62, 58, 3, INK);
  cv.fillRect(cx + 38, cy + 22, 58, 38, RUBBLE);
  cv.strokeRect(cx + 38, cy + 22, 58, 38, 3, INK);
  // crack zigzag
  cv.line(cx - 30, cy + 2, cx - 12, cy + 22, 3, INK);
  cv.line(cx - 12, cy + 22, cx - 26, cy + 40, 3, INK);
  cv.line(cx - 26, cy + 40, cx - 8, cy + 60, 3, INK);
  // small windows
  cv.fillRect(cx - 84, cy + 26, 12, 12, NAVY);
  cv.fillRect(cx - 16, cy + 14, 12, 12, NAVY);
  cv.fillRect(cx + 52, cy + 32, 12, 12, NAVY);
}

function iconIndonesia(cv: Canvas, cx: number, cy: number): void {
  // chimney
  cv.fillRect(cx + 66, cy - 58, 26, 62, STEEL);
  cv.strokeRect(cx + 66, cy - 58, 26, 62, 3, INK);
  // flames above the roof
  cv.fillTriangle(cx - 62, cy - 8, cx - 34, cy - 8, cx - 48, cy - 52, FLAME);
  cv.fillTriangle(cx - 14, cy - 8, cx + 14, cy - 8, cx, cy - 62, ORANGE);
  cv.fillTriangle(cx + 26, cy - 8, cx + 54, cy - 8, cx + 40, cy - 46, FLAME);
  cv.fillCircle(cx - 48, cy - 22, 9, FLAMEY);
  cv.fillCircle(cx, cy - 30, 10, FLAMEY);
  cv.fillCircle(cx + 40, cy - 20, 8, FLAMEY);
  // factory body with sawtooth roof
  cv.fillRect(cx - 104, cy - 8, 200, 66, WHITE);
  cv.strokeRect(cx - 104, cy - 8, 200, 66, 3, INK);
  cv.fillTriangle(cx - 104, cy - 8, cx - 54, cy - 8, cx - 79, cy - 34, STEEL);
  cv.fillTriangle(cx - 54, cy - 8, cx - 4, cy - 8, cx - 29, cy - 34, STEEL);
  cv.fillTriangle(cx - 4, cy - 8, cx + 46, cy - 8, cx + 21, cy - 34, STEEL);
  cv.fillTriangle(cx + 46, cy - 8, cx + 96, cy - 8, cx + 71, cy - 34, STEEL);
  // doors and windows
  cv.fillRect(cx - 88, cy + 22, 26, 36, NAVY);
  cv.fillRect(cx - 44, cy + 10, 20, 16, BLUE);
  cv.fillRect(cx - 8, cy + 10, 20, 16, BLUE);
  cv.fillRect(cx + 28, cy + 10, 20, 16, BLUE);
}

function iconSummit(cv: Canvas, cx: number, cy: number): void {
  // three flag poles
  const poles = [cx - 78, cx, cx + 78];
  for (const px of poles) {
    cv.line(px, cy - 58, px, cy + 12, 3, INK);
  }
  // US flag (stripes + blue canton), left
  const ux = cx - 78;
  for (let i = 0; i < 4; i++) {
    cv.fillRect(ux, cy - 58 + i * 7, 46, 7, i % 2 === 0 ? RED : WHITE);
  }
  cv.fillRect(ux, cy - 58, 19, 14, BLUE);
  cv.fillRect(ux + 4, cy - 54, 3, 3, WHITE);
  cv.fillRect(ux + 11, cy - 54, 3, 3, WHITE);
  cv.fillRect(ux + 4, cy - 48, 3, 3, WHITE);
  cv.fillRect(ux + 11, cy - 48, 3, 3, WHITE);
  // China flag (red + yellow star), middle
  const mx = cx;
  cv.fillRect(mx, cy - 58, 46, 28, RED);
  cv.fillCircle(mx + 11, cy - 44, 6, FLAMEY);
  cv.fillRect(mx + 28, cy - 52, 3, 3, FLAMEY);
  cv.fillRect(mx + 34, cy - 46, 3, 3, FLAMEY);
  cv.fillRect(mx + 28, cy - 40, 3, 3, FLAMEY);
  // Russia flag (white-blue-red tricolour), right
  const rx = cx + 78;
  cv.fillRect(rx, cy - 58, 46, 10, WHITE);
  cv.fillRect(rx, cy - 48, 46, 9, BLUE);
  cv.fillRect(rx, cy - 39, 46, 9, RED);
  cv.strokeRect(rx, cy - 58, 46, 28, 2, INK);
  // round table, dark wood
  cv.fillRect(cx - 96, cy + 12, 192, 14, WOOD);
  cv.fillRect(cx - 96, cy + 12, 192, 4, GOLD);
  cv.fillRect(cx - 60, cy + 26, 10, 26, WOOD);
  cv.fillRect(cx + 50, cy + 26, 10, 26, WOOD);
  // gold centrepiece on the table
  cv.fillCircle(cx, cy + 4, 7, GOLD);
  cv.circle(cx, cy + 4, 7, 2, INK);
}

// ---------- layout ----------
interface Panel {
  kicker: string;
  color: RGB;
  line1: string;
  line2: string;
  source: string;
  icon: (cv: Canvas, cx: number, cy: number) => void;
}

const PANELS: Panel[] = [
  { kicker: "ENERGY", color: RED, line1: "OIL SINKS TO 3-MONTH LOW", line2: "WTI -3.9% AT $80.17", source: "WSJ", icon: iconOil },
  { kicker: "NATO", color: BLUE, line1: "NATO AWACS FOR POLAND", line2: "AFTER MISSILES LAND", source: "REUTERS", icon: iconAwacs },
  { kicker: "RUSSIA", color: SLATE, line1: "TWO RUSSIAN SHIPS HIT", line2: "CORVETTE, FREIGHTER BURN", source: "NAVAL NEWS", icon: iconShips },
  { kicker: "UKRAINE", color: UKRBLUE, line1: "KYIV REGION HIT AGAIN", line2: "HOMES HIT, PEOPLE MISSING", source: "TOI", icon: iconUkraine },
  { kicker: "INDONESIA", color: ORANGE, line1: "JAVA FIRE RESCUE GOES ON", line2: "24 DEAD, DOZENS MISSING", source: "TOI", icon: iconIndonesia },
  { kicker: "SUMMIT", color: BRONZE, line1: "TRUMP, XI, PUTIN MEET", line2: "FIRST-EVER TRILATERAL", source: "WSJ", icon: iconSummit },
];

function draw(): Canvas {
  const cv = new Canvas(W, H, PAPER);
  // masthead: big nameplate, date, tagline, gold rule
  cv.fillRect(0, 0, W, 154, NAVY);
  drawTextCentered(cv, "THE WORLD", W / 2, 26, 7, WHITE);
  drawTextCentered(cv, "TUESDAY 24 NOVEMBER 2026", W / 2, 90, 4, GOLD);
  drawTextCentered(cv, "THE DAY'S WORLD NEWS IN ONE IMAGE", W / 2, 128, 2, WHITE);
  cv.fillRect(0, 148, W, 6, GOLD);
  // grid of panels
  const px = [16, 518];
  const py = [168, 448, 728];
  const pw = 490;
  const ph = 268;
  for (let i = 0; i < 6; i++) {
    const x = px[i % 2];
    const y = py[Math.floor(i / 2)];
    const p = PANELS[i];
    cv.fillRect(x, y, pw, ph, WHITE);
    cv.strokeRect(x, y, pw, ph, 2, CARD_BORDER);
    cv.fillRect(x, y, pw, 36, p.color);
    cv.fillRect(x, y + 36, pw, 3, GOLD);
    drawText(cv, p.kicker, x + 14, y + 11, 2, WHITE);
    p.icon(cv, x + pw / 2, y + 108);
    drawText(cv, p.line1, x + 14, y + 200, 3, INK);
    drawText(cv, p.line2, x + 14, y + 228, 3, INK);
    drawTextRight(cv, p.source, x + pw - 14, y + 254, 1, MUTED);
  }
  // footer: source credits, clear of the panels
  drawTextCentered(cv, "DRAWN FROM THE DAY'S REPORTS - WSJ - REUTERS - LE MONDE - TOI - NAVAL NEWS", W / 2, 1004, 2, MUTED);
  return cv;
}

function main(): void {
  const outDir = process.env.MAKEFUN_OUTPUT_DIR || "/output";
  fs.mkdirSync(outDir, { recursive: true });
  const cv = draw();
  const png = encodePng(cv.data, W, H);
  fs.writeFileSync(path.join(outDir, "entry.png"), png);
}

main();
