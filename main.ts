// The world — 24 November 2026.
// A one-page newspaper front page drawn entirely in code: stdlib only,
// no network, no clock, no randomness. Deterministic: the same bytes
// come out of every run.
// Entry point: node main.ts  ->  writes /output/entry.png (1024x1024).

import * as fs from "node:fs";
import * as zlib from "node:zlib";
import * as crypto from "node:crypto";

const W = 1024;
const H = 1024;

// ---- palette (newsprint) ----
type RGB = [number, number, number];
const PAPER: RGB = [247, 242, 231];
const CARD: RGB = [255, 253, 247];
const INK: RGB = [26, 26, 26];
const GRAY: RGB = [96, 96, 90];
const GOLD: RGB = [166, 124, 0];
const RED: RGB = [179, 38, 30];
const NAVY: RGB = [31, 58, 95];
const SKY: RGB = [70, 110, 150];
const ORANGE: RGB = [214, 96, 20];
const STEEL: RGB = [120, 130, 140];
const DARK: RGB = [51, 51, 51];
const BROWN: RGB = [122, 82, 42];
const PINK: RGB = [243, 217, 215];
const HULL: RGB = [207, 214, 221];

// ---- framebuffer (RGB, 8 bit) ----
const px = new Uint8Array(W * H * 3);
function setPixel(x: number, y: number, c: RGB): void {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  px[i] = c[0];
  px[i + 1] = c[1];
  px[i + 2] = c[2];
}
function fillRect(x: number, y: number, w: number, h: number, c: RGB): void {
  const x0 = Math.max(0, x);
  const y0 = Math.max(0, y);
  const x1 = Math.min(W, x + w);
  const y1 = Math.min(H, y + h);
  for (let yy = y0; yy < y1; yy++) {
    for (let xx = x0; xx < x1; xx++) {
      const i = (yy * W + xx) * 3;
      px[i] = c[0];
      px[i + 1] = c[1];
      px[i + 2] = c[2];
    }
  }
}
function hline(x: number, y: number, w: number, c: RGB): void {
  fillRect(x, y, w, 1, c);
}
function vline(x: number, y: number, h: number, c: RGB): void {
  fillRect(x, y, 1, h, c);
}
function rectOutline(x: number, y: number, w: number, h: number, t: number, c: RGB): void {
  fillRect(x, y, w, t, c);
  fillRect(x, y + h - t, w, t, c);
  fillRect(x, y, t, h, c);
  fillRect(x + w - t, y, t, h, c);
}
function drawLine(x0: number, y0: number, x1: number, y1: number, c: RGB): void {
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let x = x0;
  let y = y0;
  for (let guard = 0; guard < 4096; guard++) {
    setPixel(x, y, c);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }
}
function fillCircle(cx: number, cy: number, r: number, c: RGB): void {
  for (let y = -r; y <= r; y++) {
    const half = Math.floor(Math.sqrt(r * r - y * y));
    for (let x = -half; x <= half; x++) setPixel(cx + x, cy + y, c);
  }
}
function circleOutline(cx: number, cy: number, r: number, c: RGB): void {
  for (let a = 0; a < 360; a += 2) {
    const rad = (a * Math.PI) / 180;
    setPixel(Math.round(cx + r * Math.cos(rad)), Math.round(cy + r * Math.sin(rad)), c);
  }
}
function fillTriangle(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, c: RGB): void {
  const minY = Math.min(y0, y1, y2);
  const maxY = Math.max(y0, y1, y2);
  const edges: Array<[number, number, number, number]> = [
    [x0, y0, x1, y1],
    [x1, y1, x2, y2],
    [x2, y2, x0, y0],
  ];
  for (let y = minY; y <= maxY; y++) {
    const xs: number[] = [];
    for (const [ax, ay, bx, by] of edges) {
      if ((ay <= y && by > y) || (by <= y && ay > y)) {
        xs.push(ax + ((y - ay) * (bx - ax)) / (by - ay));
      }
    }
    if (xs.length >= 2) {
      const lo = Math.floor(Math.min(xs[0], xs[1]));
      const hi = Math.ceil(Math.max(xs[0], xs[1]));
      for (let x = lo; x <= hi; x++) setPixel(x, y, c);
    }
  }
}

// ---- CRC32 + PNG encoder ----
const CRC_TABLE: number[] = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE.push(c >>> 0);
}
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function pngChunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), data])), 8 + data.length);
  return out;
}
function encodePNG(): Buffer {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 3)] = 0;
    Buffer.from(px.buffer, y * W * 3, W * 3).copy(raw, y * (1 + W * 3) + 1);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, pngChunk("IHDR", ihdr), pngChunk("IDAT", idat), pngChunk("IEND", Buffer.alloc(0))]);
}

// ---- 5x7 bitmap font (each glyph: 7 rows, bit 4 = leftmost pixel) ----
const FONT: Record<string, number[]> = {
  A: [14, 17, 17, 31, 17, 17, 17],
  B: [30, 17, 17, 30, 17, 17, 30],
  C: [14, 17, 16, 16, 16, 17, 14],
  D: [30, 17, 17, 17, 17, 17, 30],
  E: [31, 16, 16, 30, 16, 16, 31],
  F: [31, 16, 16, 30, 16, 16, 16],
  G: [14, 17, 16, 23, 17, 17, 15],
  H: [17, 17, 17, 31, 17, 17, 17],
  I: [14, 4, 4, 4, 4, 4, 14],
  J: [7, 2, 2, 2, 2, 18, 12],
  K: [17, 18, 20, 24, 20, 18, 17],
  L: [16, 16, 16, 16, 16, 16, 31],
  M: [17, 27, 21, 21, 17, 17, 17],
  N: [17, 25, 21, 19, 17, 17, 17],
  O: [14, 17, 17, 17, 17, 17, 14],
  P: [30, 17, 17, 30, 16, 16, 16],
  Q: [14, 17, 17, 17, 21, 18, 13],
  R: [30, 17, 17, 30, 20, 18, 17],
  S: [15, 16, 16, 14, 1, 1, 30],
  T: [31, 4, 4, 4, 4, 4, 4],
  U: [17, 17, 17, 17, 17, 17, 14],
  V: [17, 17, 17, 17, 17, 10, 4],
  W: [17, 17, 17, 21, 21, 27, 17],
  X: [17, 17, 10, 4, 10, 17, 17],
  Y: [17, 17, 10, 4, 4, 4, 4],
  Z: [31, 1, 2, 4, 8, 16, 31],
  "0": [14, 17, 19, 21, 25, 17, 14],
  "1": [4, 12, 4, 4, 4, 4, 14],
  "2": [14, 17, 1, 2, 4, 8, 31],
  "3": [30, 1, 1, 14, 1, 1, 30],
  "4": [2, 6, 10, 18, 31, 2, 2],
  "5": [31, 16, 30, 1, 1, 17, 14],
  "6": [14, 16, 16, 30, 17, 17, 14],
  "7": [31, 1, 2, 4, 8, 8, 8],
  "8": [14, 17, 17, 14, 17, 17, 14],
  "9": [14, 17, 17, 15, 1, 1, 14],
  " ": [0, 0, 0, 0, 0, 0, 0],
  ".": [0, 0, 0, 0, 0, 12, 12],
  ",": [0, 0, 0, 0, 12, 4, 8],
  ":": [0, 12, 12, 0, 12, 12, 0],
  ";": [0, 12, 12, 0, 12, 4, 8],
  "'": [4, 4, 8, 0, 0, 0, 0],
  "-": [0, 0, 0, 14, 0, 0, 0],
  "/": [1, 2, 2, 4, 8, 8, 16],
  "%": [25, 26, 2, 4, 8, 11, 19],
  "(": [2, 4, 8, 8, 8, 4, 2],
  ")": [8, 4, 2, 2, 2, 4, 8],
  $: [4, 15, 20, 14, 5, 30, 4],
  "&": [12, 18, 20, 8, 21, 18, 13],
  "!": [4, 4, 4, 4, 4, 0, 4],
  "?": [14, 17, 1, 2, 4, 0, 4],
  "+": [0, 4, 4, 14, 4, 4, 0],
  "=": [0, 0, 31, 0, 31, 0, 0],
};
function drawGlyph(ch: string, x: number, y: number, s: number, c: RGB): void {
  const g = FONT[ch] || FONT["?"];
  for (let r = 0; r < 7; r++) {
    for (let col = 0; col < 5; col++) {
      if ((g[r] >> (4 - col)) & 1) fillRect(x + col * s, y + r * s, s, s, c);
    }
  }
}
function textWidth(s: string, scale: number): number {
  if (s.length === 0) return 0;
  return s.length * 6 * scale - scale;
}
function drawText(s: string, x: number, y: number, scale: number, c: RGB): void {
  for (let i = 0; i < s.length; i++) drawGlyph(s[i], x + i * 6 * scale, y, scale, c);
}
function drawTextCentered(s: string, cx: number, y: number, scale: number, c: RGB): void {
  drawText(s, cx - Math.floor(textWidth(s, scale) / 2), y, scale, c);
}
function drawTextRight(s: string, xRight: number, y: number, scale: number, c: RGB): void {
  drawText(s, xRight - textWidth(s, scale), y, scale, c);
}
function wrapText(s: string, maxW: number, scale: number): string[] {
  const words = s.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur === "" ? w : cur + " " + w;
    if (textWidth(next, scale) <= maxW) {
      cur = next;
    } else {
      if (cur !== "") lines.push(cur);
      cur = w;
    }
  }
  if (cur !== "") lines.push(cur);
  return lines;
}

// ---- icons (each drawn around a center point, ~190 wide, ~90 tall) ----
function drawIconOil(cx: number, cy: number): void {
  // oil barrel, navy, with two pale bands
  fillRect(cx - 78, cy - 38, 56, 76, NAVY);
  rectOutline(cx - 78, cy - 38, 56, 76, 2, INK);
  fillRect(cx - 78, cy - 20, 56, 6, SKY);
  fillRect(cx - 78, cy + 8, 56, 6, SKY);
  hline(cx - 78, cy - 38, 56, INK);
  // red down arrow beside it
  fillRect(cx + 24, cy - 30, 12, 44, RED);
  fillTriangle(cx + 16, cy + 14, cx + 44, cy + 14, cx + 30, cy + 40, RED);
}
function drawIconAwacs(cx: number, cy: number): void {
  // radar dome on a stalk above the fuselage
  fillRect(cx - 8, cy - 16, 6, 10, INK);
  fillCircle(cx - 5, cy - 27, 14, CARD);
  circleOutline(cx - 5, cy - 27, 14, INK);
  // tail fin
  fillTriangle(cx - 85, cy - 8, cx - 68, cy - 8, cx - 85, cy - 34, NAVY);
  // fuselage
  fillRect(cx - 85, cy - 8, 150, 20, HULL);
  rectOutline(cx - 85, cy - 8, 150, 20, 2, INK);
  // nose cone
  fillTriangle(cx + 65, cy - 8, cx + 65, cy + 12, cx + 88, cy + 2, HULL);
  drawLine(cx + 65, cy - 8, cx + 88, cy + 2, INK);
  drawLine(cx + 65, cy + 12, cx + 88, cy + 2, INK);
  // wing below
  fillTriangle(cx - 20, cy + 12, cx + 12, cy + 12, cx - 4, cy + 34, STEEL);
  // cockpit windows
  fillRect(cx + 28, cy - 2, 5, 5, NAVY);
  fillRect(cx + 40, cy - 2, 5, 5, NAVY);
  fillRect(cx + 52, cy - 2, 5, 5, NAVY);
}
function drawIconShip(cx: number, cy: number): void {
  // burning warship: dark hull, deck, mast, flames, smoke
  fillRect(cx - 80, cy - 6, 140, 24, DARK);
  fillTriangle(cx + 60, cy - 6, cx + 60, cy + 18, cx + 86, cy + 6, DARK);
  fillRect(cx - 70, cy - 14, 110, 8, GRAY);
  vline(cx - 40, cy - 34, 20, INK);
  fillRect(cx - 40, cy - 34, 16, 10, RED);
  fillTriangle(cx - 12, cy - 14, cx + 2, cy - 14, cx - 5, cy - 44, ORANGE);
  fillTriangle(cx + 10, cy - 14, cx + 22, cy - 14, cx + 16, cy - 38, RED);
  fillTriangle(cx + 28, cy - 14, cx + 38, cy - 14, cx + 33, cy - 32, ORANGE);
  fillCircle(cx - 5, cy - 50, 6, STEEL);
  fillCircle(cx + 16, cy - 54, 5, STEEL);
}
function drawIconHeart(cx: number, cy: number): void {
  // cracked heart over rubble (Kyiv)
  fillCircle(cx - 18, cy - 16, 16, PINK);
  fillCircle(cx + 18, cy - 16, 16, PINK);
  fillTriangle(cx - 34, cy - 12, cx + 34, cy - 12, cx, cy + 26, PINK);
  circleOutline(cx - 18, cy - 16, 16, RED);
  circleOutline(cx + 18, cy - 16, 16, RED);
  drawLine(cx, cy - 30, cx - 6, cy - 12, RED);
  drawLine(cx - 6, cy - 12, cx + 4, cy + 2, RED);
  drawLine(cx + 4, cy + 2, cx - 4, cy + 16, RED);
  drawLine(cx + 1, cy - 30, cx - 5, cy - 12, RED);
  drawLine(cx - 5, cy - 12, cx + 5, cy + 2, RED);
  drawLine(cx + 5, cy + 2, cx - 3, cy + 16, RED);
  // rubble blocks at the base
  fillRect(cx - 52, cy + 28, 30, 12, STEEL);
  fillRect(cx - 14, cy + 32, 34, 10, GRAY);
  fillRect(cx + 26, cy + 28, 26, 12, STEEL);
}
function drawIconFactory(cx: number, cy: number): void {
  // factory with sawtooth roof, chimney and smoke, small flame
  fillRect(cx - 70, cy - 6, 120, 44, GRAY);
  rectOutline(cx - 70, cy - 6, 120, 44, 2, INK);
  for (let i = 0; i < 3; i++) {
    fillTriangle(cx - 70 + i * 40, cy - 6, cx - 30 + i * 40, cy - 6, cx - 50 + i * 40, cy - 26, DARK);
  }
  fillRect(cx + 58, cy - 44, 16, 82, DARK);
  fillCircle(cx + 66, cy - 52, 8, STEEL);
  fillCircle(cx + 76, cy - 60, 6, STEEL);
  for (let i = 0; i < 3; i++) {
    fillRect(cx - 56 + i * 30, cy + 10, 14, 16, GOLD);
  }
  fillTriangle(cx + 40, cy + 38, cx + 56, cy + 38, cx + 48, cy + 18, ORANGE);
}
function drawIconSummit(cx: number, cy: number): void {
  // three flags over a summit table with three delegates
  vline(cx - 50, cy - 34, 42, INK);
  vline(cx, cy - 34, 42, INK);
  vline(cx + 50, cy - 34, 42, INK);
  fillRect(cx - 50, cy - 34, 24, 14, RED);
  fillRect(cx, cy - 34, 24, 14, GOLD);
  fillRect(cx + 50, cy - 34, 24, 14, NAVY);
  fillCircle(cx - 50, cy - 2, 9, INK);
  fillCircle(cx, cy - 2, 9, INK);
  fillCircle(cx + 50, cy - 2, 9, INK);
  fillRect(cx - 80, cy + 8, 160, 14, BROWN);
  fillRect(cx - 72, cy + 22, 8, 18, BROWN);
  fillRect(cx + 64, cy + 22, 8, 18, BROWN);
}
function drawIcon(kind: number, cx: number, cy: number): void {
  if (kind === 0) drawIconOil(cx, cy);
  else if (kind === 1) drawIconAwacs(cx, cy);
  else if (kind === 2) drawIconShip(cx, cy);
  else if (kind === 3) drawIconHeart(cx, cy);
  else if (kind === 4) drawIconFactory(cx, cy);
  else drawIconSummit(cx, cy);
}

// ---- stories (24 November 2026, verified this morning) ----
type Story = { color: RGB; headline: string; sub: string; source: string; icon: number };
const STORIES: Story[] = [
  { color: NAVY, headline: "OIL SINKS TO 3-MONTH LOW", sub: "WTI -3.9% TO $80.17", source: "WSJ", icon: 0 },
  { color: NAVY, headline: "NATO SENDS AWACS TO POLAND", sub: "AFTER MISSILES LAND IN POLAND", source: "REUTERS", icon: 1 },
  { color: RED, headline: "TWO RUSSIAN SHIPS HIT", sub: "MERKURY BURNS, SPARTA II AFIRE", source: "NAVAL NEWS", icon: 2 },
  { color: RED, headline: "KYIV REGION HIT AGAIN", sub: "HOMES HIT, SEVERAL MISSING", source: "TOI", icon: 3 },
  { color: ORANGE, headline: "JAVA FACTORY FIRE", sub: "24 DEAD, DOZENS MISSING", source: "TOI", icon: 4 },
  { color: GOLD, headline: "TRUMP, XI, PUTIN MEET", sub: "FIRST TRILATERAL SUMMIT", source: "WSJ", icon: 5 },
];

// ---- panel + page ----
function drawPanel(x: number, y: number, w: number, h: number, st: Story): void {
  fillRect(x, y, w, h, CARD);
  rectOutline(x, y, w, h, 2, INK);
  fillRect(x, y, w, 6, st.color);
  const cx = x + Math.floor(w / 2);
  drawIcon(st.icon, cx, y + 58);
  const lines = wrapText(st.headline, w - 28, 3);
  let ly = y + 116;
  for (const ln of lines) {
    drawTextCentered(ln, cx, ly, 3, INK);
    ly += 25;
  }
  drawTextCentered(st.sub, cx, y + 172, 2, GRAY);
  drawTextRight(st.source, x + w - 14, y + 208, 2, st.color);
}
function main(): void {
  fillRect(0, 0, W, H, PAPER);
  // masthead
  fillRect(24, 24, 976, 3, INK);
  drawTextCentered("THE WORLD", 512, 44, 9, INK);
  drawTextCentered("TUESDAY 24 NOVEMBER 2026", 512, 122, 3, GOLD);
  drawTextCentered("THE DAY'S WORLD NEWS IN ONE IMAGE", 512, 146, 2, GRAY);
  fillRect(24, 168, 976, 3, INK);
  fillRect(24, 174, 976, 1, INK);
  // 2x3 grid of stories
  const gx = 24;
  const gy = 190;
  const pw = 480;
  const ph = 242;
  const gut = 16;
  for (let i = 0; i < 6; i++) {
    const col = i % 2;
    const row = Math.floor(i / 2);
    drawPanel(gx + col * (pw + gut), gy + row * (ph + gut), pw, ph, STORIES[i]);
  }
  // footer
  fillRect(24, 952, 976, 2, INK);
  drawTextCentered("SOURCES: WSJ - BARRON'S - REUTERS - NAVAL NEWS - TIMES OF INDIA - LE MONDE", 512, 966, 2, GRAY);
  drawTextCentered("FRONT PAGE - TUESDAY 24 NOVEMBER 2026 - THE WORLD", 512, 988, 2, GRAY);
  fs.mkdirSync("/output", { recursive: true });
  const png = encodePNG();
  fs.writeFileSync("/output/entry.png", png);
  const sum = crypto.createHash("sha256").update(png).digest("hex");
  console.log("ENTRY_SHA256=" + sum);
  console.log("ENTRY_BYTES=" + png.length);
}
main();
