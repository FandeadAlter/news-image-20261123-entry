// news-image-20261123 — sums up Monday 23 November 2026 world news in one image.
// Node 22, standard library only, no network. Draws a 1024x1024 PNG to /output/entry.png.
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
const RUBBLE: RGB = [150, 148, 140];

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

// ---------- story icons (centered on cx, cy) ----------
function iconCop31(cv: Canvas, cx: number, cy: number): void {
  // globe
  cv.fillCircle(cx - 42, cy, 56, SKY);
  cv.circle(cx - 42, cy, 56, 3, INK);
  cv.fillCircle(cx - 62, cy - 18, 15, LEAF);
  cv.fillCircle(cx - 28, cy + 12, 18, LEAF);
  cv.fillCircle(cx - 48, cy + 30, 11, LEAF);
  // meridian lines
  cv.line(cx - 42, cy - 56, cx - 42, cy + 56, 2, INK);
  cv.line(cx - 98, cy, cx + 14, cy, 2, INK);
  // thermometer, rising heat
  cv.fillRect(cx + 52, cy - 52, 16, 78, WHITE);
  cv.strokeRect(cx + 52, cy - 52, 16, 78, 3, INK);
  cv.fillRect(cx + 55, cy - 18, 10, 41, RED);
  cv.fillCircle(cx + 60, cy + 32, 13, RED);
  cv.circle(cx + 60, cy + 32, 13, 3, INK);
  // red up arrow above the globe
  cv.line(cx + 92, cy - 20, cx + 92, cy - 58, 5, RED);
  cv.fillTriangle(cx + 80, cy - 52, cx + 104, cy - 52, cx + 92, cy - 72, RED);
}

function iconHormuz(cv: Canvas, cx: number, cy: number): void {
  // explosion burst above the ship
  cv.fillCircle(cx + 78, cy - 52, 15, FLAMEY);
  cv.fillTriangle(cx + 78, cy - 78, cx + 66, cy - 52, cx + 90, cy - 52, ORANGE);
  cv.fillTriangle(cx + 78, cy - 26, cx + 66, cy - 52, cx + 90, cy - 52, ORANGE);
  cv.fillTriangle(cx + 52, cy - 52, cx + 78, cy - 64, cx + 78, cy - 40, ORANGE);
  cv.fillTriangle(cx + 104, cy - 52, cx + 78, cy - 64, cx + 78, cy - 40, ORANGE);
  // funnel
  cv.fillRect(cx - 58, cy - 34, 28, 40, INK);
  // bridge tower
  cv.fillRect(cx + 18, cy - 38, 44, 44, WHITE);
  cv.strokeRect(cx + 18, cy - 38, 44, 44, 3, INK);
  cv.fillRect(cx + 26, cy - 30, 10, 8, BLUE);
  cv.fillRect(cx + 42, cy - 30, 10, 8, BLUE);
  // hull
  cv.fillRect(cx - 108, cy + 6, 196, 34, RED);
  cv.fillTriangle(cx + 88, cy + 6, cx + 118, cy + 6, cx + 88, cy + 40, RED);
  cv.fillRect(cx - 108, cy + 6, 196, 5, DARKRED);
  // waves
  for (let i = 0; i < 3; i++) {
    const wy = cy + 52 + i * 12;
    for (let x = cx - 116; x < cx + 116; x += 16) {
      cv.line(x, wy, x + 8, wy - 5, 3, BLUE);
      cv.line(x + 8, wy - 5, x + 16, wy, 3, BLUE);
    }
  }
}

function iconMarkets(cv: Canvas, cx: number, cy: number): void {
  // axes
  cv.line(cx - 108, cy - 62, cx - 108, cy + 62, 3, INK);
  cv.line(cx - 108, cy + 62, cx + 112, cy + 62, 3, INK);
  // falling candles
  const candles: [number, number, number][] = [
    [-88, -44, 62],
    [-28, -18, 44],
    [32, 8, 30],
  ];
  for (const [ox, top, hgt] of candles) {
    cv.line(cx + ox + 15, top - 14 + cy, cx + ox + 15, top + hgt + 12 + cy, 3, INK);
    cv.fillRect(cx + ox, cy + top, 30, hgt, DARKRED);
    cv.strokeRect(cx + ox, cy + top, 30, hgt, 2, INK);
  }
  // big down arrow
  cv.line(cx - 96, cy - 58, cx + 96, cy + 34, 7, RED);
  cv.fillTriangle(cx + 96, cy + 34, cx + 66, cy + 14, cx + 92, cy + 52, RED);
}

function iconDemocrats(cv: Canvas, cx: number, cy: number): void {
  // capitol dome, taller so it reads as a dome above the colonnade
  cv.fillCircle(cx - 30, cy + 2, 60, BLUE);
  cv.fillRect(cx - 90, cy + 2, 120, 8, BLUE);
  cv.fillRect(cx - 96, cy + 16, 132, 26, WHITE);
  cv.strokeRect(cx - 96, cy + 16, 132, 26, 3, INK);
  for (let i = 0; i < 4; i++) {
    cv.fillRect(cx - 84 + i * 32, cy + 18, 10, 22, BLUE);
  }
  cv.fillRect(cx + 36, cy + 16, 60, 26, WHITE);
  cv.strokeRect(cx + 36, cy + 16, 60, 26, 3, INK);
  // flag pole + flag
  cv.line(cx - 30, cy - 58, cx - 30, cy - 88, 3, INK);
  cv.fillTriangle(cx - 30, cy - 88, cx - 30, cy - 70, cx - 2, cy - 79, RED);
  // ballot check circle
  cv.fillCircle(cx + 92, cy - 42, 24, LEAF);
  cv.circle(cx + 92, cy - 42, 24, 3, INK);
  cv.line(cx + 80, cy - 42, cx + 89, cy - 33, 5, WHITE);
  cv.line(cx + 89, cy - 33, cx + 106, cy - 54, 5, WHITE);
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

// ---------- layout ----------
interface Panel {
  kicker: string;
  color: RGB;
  line1: string;
  line2: string;
  icon: (cv: Canvas, cx: number, cy: number) => void;
}

const PANELS: Panel[] = [
  { kicker: "CLIMATE", color: [30, 122, 90], line1: "COP31 TALKS COLLAPSE", line2: "NO CLIMATE DEAL", icon: iconCop31 },
  { kicker: "MIDDLE EAST", color: RED, line1: "TANKERS HIT IN HORMUZ", line2: "TRUMP WARNS IRAN", icon: iconHormuz },
  { kicker: "MARKETS", color: DARKRED, line1: "AI FEARS SINK MARKETS", line2: "KOSPI -5%", icon: iconMarkets },
  { kicker: "UNITED STATES", color: BLUE, line1: "DEMOCRATS WIN HOUSE", line2: "BIGGEST SINCE 1992", icon: iconDemocrats },
  { kicker: "UKRAINE", color: UKRBLUE, line1: "BOY, 7, PULLED ALIVE", line2: "FROM THE RUBBLE", icon: iconUkraine },
  { kicker: "INDONESIA", color: ORANGE, line1: "JAVA FACTORY FIRE", line2: "24 DEAD, DOZENS MISSING", icon: iconIndonesia },
];

function draw(): Canvas {
  const cv = new Canvas(W, H, PAPER);
  // header band
  cv.fillRect(0, 0, W, 148, NAVY);
  drawTextCentered(cv, "MONDAY 23 NOVEMBER 2026", W / 2, 40, 5, WHITE);
  drawTextCentered(cv, "THE WORLD IN ONE IMAGE", W / 2, 96, 3, GOLD);
  cv.fillRect(0, 148, W, 6, GOLD);
  // grid of panels
  const px = [16, 518];
  const py = [166, 448, 730];
  const pw = 490;
  const ph = 270;
  for (let i = 0; i < 6; i++) {
    const x = px[i % 2];
    const y = py[Math.floor(i / 2)];
    const p = PANELS[i];
    cv.fillRect(x, y, pw, ph, WHITE);
    cv.strokeRect(x, y, pw, ph, 2, CARD_BORDER);
    cv.fillRect(x, y, pw, 36, p.color);
    drawText(cv, p.kicker, x + 14, y + 11, 2, WHITE);
    p.icon(cv, x + pw / 2, y + 113);
    drawText(cv, p.line1, x + 14, y + 202, 3, INK);
    drawText(cv, p.line2, x + 14, y + 230, 3, INK);
  }
  // footer
  drawTextCentered(cv, "DRAWN FROM THE DAY'S REPORTS - BBC - REUTERS - AL JAZEERA", W / 2, 1006, 2, MUTED);
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
