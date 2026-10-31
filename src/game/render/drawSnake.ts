import { headingAt, type BackId, type HatId, type WingId } from "./accessories";
import { getSprite } from "./spriteSkins";

export { BACKS, HATS, WINGS } from "./accessories";
export type { BackId, HatId, WingId } from "./accessories";

const SINGLE_EYE_SPOT = [0] as const;
const PAIRED_EYE_SPOTS = [-1, 1] as const;

export const PATTERN_LIST = [
  "solid",
  "stripes",
  "dots",
  "gradient",
  "rainbow",
  "checker",
  "zebra",
  "glow-pulse",
  "candy",
  "tiger",
  "leopard",
  "scales",
  "coral",
  "galaxy",
] as const;
export type SkinPattern = (typeof PATTERN_LIST)[number];
export type EyeShape = "round" | "oval" | "angry" | "cute" | "sleepy" | "cyclops" | "heart";
/** "bead" = glossy ball segments with a rim and highlight; "flat" (default) = the original neon look. */
type SkinShading = "flat" | "bead";
export type BoostEffect = "flame" | "electric" | "bubbles" | "rainbow" | "stardust";
export const BOOST_LIST: readonly BoostEffect[] = [
  "flame",
  "electric",
  "bubbles",
  "rainbow",
  "stardust",
];

export interface SnakeSkin {
  primary: string;
  secondary: string;
  pattern: SkinPattern;
  eyes: { shape: EyeShape; color: string; pupilSize: number; followMouse: boolean };
  glow: number; // 0..1
  outline: number; // px 0..6
  sparkle: boolean;
  boost: BoostEffect;
  /** Cosmetics. Optional so older saved skins keep working ("none" when absent). */
  hat?: HatId;
  back?: BackId;
  wings?: WingId;
  shading?: SkinShading;
  /** Id of an image skin (see spriteSkins.ts). When set and loaded it replaces the circle body + eyes. */
  sprite?: string | undefined;
}

export const DEFAULT_SKIN: SnakeSkin = {
  primary: "#22e4ff",
  secondary: "#ff2bd6",
  pattern: "gradient",
  eyes: { shape: "round", color: "#ffffff", pupilSize: 0.5, followMouse: true },
  glow: 0.6,
  outline: 0,
  sparkle: false,
  boost: "electric",
  hat: "none",
  back: "none",
  wings: "none",
};

export interface Point {
  x: number;
  y: number;
}
export interface DrawSnakeOptions {
  /** Body radius in px. */
  radius?: number;
  /** Time in ms, drives animated patterns/effects. */
  time?: number;
  /** World-space point the eyes should look at (used when skin.eyes.followMouse). */
  lookAt?: Point | null;
  boosting?: boolean;
  glow?: boolean;
}

/** Color of segment i (0 = head) for the given skin. */
export function segmentColor(skin: SnakeSkin, i: number, total: number, time = 0): string {
  switch (skin.pattern) {
    case "solid":
    case "dots":
    case "glow-pulse":
      return skin.primary;
    case "stripes":
      return Math.floor(i / 3) % 2 === 0 ? skin.primary : skin.secondary;
    case "checker":
      return i % 2 === 0 ? skin.primary : skin.secondary;
    case "zebra":
      return i % 4 === 3 ? skin.secondary : skin.primary;
    case "rainbow":
      return `hsl(${(i * 18 + time * 0.06) % 360} 100% 60%)`;
    case "gradient": {
      const t = total <= 1 ? 0 : i / (total - 1);
      return mix(skin.primary, skin.secondary, t);
    }
    case "candy":
      // Candy-cane: primary colour with white bands.
      return Math.floor(i / 2) % 2 === 0 ? skin.primary : "#ffffff";
    case "tiger": {
      // Irregular dark stripes: one thick band every 4 segments, sometimes doubled.
      const k = i % 4;
      return k === 2 || (k === 3 && hash(i >> 2) > 0.5) ? skin.secondary : skin.primary;
    }
    case "leopard":
    case "scales":
      return skin.primary;
    case "coral": {
      // Coral-snake rings: wide primary, thin white, medium secondary, thin white.
      const k = i % 8;
      if (k === 3 || k === 7) return "#fff6c8";
      return k < 3 ? skin.primary : skin.secondary;
    }
    case "galaxy": {
      const w = 0.5 + 0.5 * Math.sin(i * 0.22);
      return mix(skin.primary, skin.secondary, w);
    }
  }
}

function mix(a: string, b: string, t: number) {
  const pa = parseInt(a.slice(1), 16),
    pb = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

function shade(hex: string, f: number) {
  return hex.startsWith("#") ? mix(hex, "#000000", f) : "rgba(0,0,0,0.6)";
}

const snakeGlowSprites = new Map<number, HTMLCanvasElement | null>();

function glowSprite(color: string): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  let hue = colorHueCache.get(color);
  if (hue === undefined) {
    hue = colorHue(color);
    if (colorHueCache.size >= 256) colorHueCache.clear();
    colorHueCache.set(color, hue);
  }
  const key = ((Math.round(hue / 30) % 12) + 12) % 12 || 0;
  if (snakeGlowSprites.has(key)) return snakeGlowSprites.get(key) ?? null;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    snakeGlowSprites.set(key, null);
    return null;
  }
  const gradient = ctx.createRadialGradient(32, 32, 1, 32, 32, 32);
  gradient.addColorStop(0, `hsla(${key * 30} 100% 65% / 0.55)`);
  gradient.addColorStop(0.35, `hsla(${key * 30} 100% 60% / 0.24)`);
  gradient.addColorStop(1, `hsla(${key * 30} 100% 55% / 0)`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  snakeGlowSprites.set(key, canvas);
  return canvas;
}

function colorHue(color: string): number {
  if (color.startsWith("hsl")) {
    let end = 4;
    while (end < color.length && color.charCodeAt(end) >= 48 && color.charCodeAt(end) <= 57) end++;
    return Number(color.slice(4, end)) || 0;
  }
  let r = 0,
    g = 0,
    b = 0;
  if (color.charCodeAt(0) === 35) {
    const hex = parseInt(color.slice(1), 16);
    r = (hex >> 16) & 255;
    g = (hex >> 8) & 255;
    b = hex & 255;
  } else {
    const first = color.indexOf("(") + 1;
    const comma = color.indexOf(",", first);
    const secondComma = color.indexOf(",", comma + 1);
    r = Number(color.slice(first, comma));
    g = Number(color.slice(comma + 1, secondComma));
    b = Number(color.slice(secondComma + 1).replace(/[^0-9.]/g, ""));
  }
  if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) return 0;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const delta = max - min;
  const hue =
    max === r
      ? (g - b) / delta + (g < b ? 6 : 0)
      : max === g
        ? (b - r) / delta + 2
        : (r - g) / delta + 4;
  return hue * 60;
}

const colorHueCache = new Map<string, number>();
let segmentPaletteCache = new WeakMap<
  SnakeSkin,
  { total: number; animationBucket: number; colors: string[] }
>();

export function clearDrawSnakeCaches() {
  for (const canvas of snakeGlowSprites.values()) {
    if (canvas) canvas.width = canvas.height = 1;
  }
  snakeGlowSprites.clear();
  colorHueCache.clear();
  segmentPaletteCache = new WeakMap();
}

function segmentPalette(skin: SnakeSkin, total: number, time: number): string[] {
  const animationBucket = skin.pattern === "rainbow" ? Math.floor(((time * 0.06) % 360) / 15) : 0;
  let palette = segmentPaletteCache.get(skin);
  if (!palette) {
    palette = { total: 0, animationBucket: -1, colors: [] };
    segmentPaletteCache.set(skin, palette);
  }
  if (palette.total !== total || palette.animationBucket !== animationBucket) {
    palette.total = total;
    palette.animationBucket = animationBucket;
    palette.colors.length = total;
    const paletteTime = skin.pattern === "rainbow" ? (animationBucket * 15) / 0.06 : 0;
    for (let i = 0; i < total; i++) palette.colors[i] = segmentColor(skin, i, total, paletteTime);
  }
  return palette.colors;
}

/** Draws a snake. `points` are ordered head first. */
export function drawSnake(
  ctx: CanvasRenderingContext2D,
  skin: SnakeSkin,
  points: Point[],
  options: DrawSnakeOptions = {},
) {
  const n = points.length;
  if (n === 0) return;
  const r = options.radius ?? 12;
  const t = options.time ?? 0;
  const glowEnabled = options.glow !== false;
  ctx.save();

  // Effects wrap the whole body: an aura behind it, particles in front of it.
  if (options.boosting && glowEnabled) drawBoostBack(ctx, skin.boost, points, r, t);

  const sprite = n >= 2 ? getSprite(skin.sprite) : null;
  if (sprite) {
    // Illustrated skins have no per-segment glow, so give them one soft halo.
    const g = glowEnabled ? Math.min(1, skin.glow + (options.boosting ? 0.35 : 0)) : 0;
    if (g > 0.05) drawAura(ctx, points, r * (1.5 + g * 0.6), skin.primary, 0.14 + g * 0.3);
    drawSpriteBody(ctx, sprite.body, points, r);
  }
  if (!sprite && n >= 2) {
    const step = Math.max(1, Math.ceil(n / 80));
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = shade(skin.primary, 0.62);
    ctx.lineWidth = r * 2.16;
    ctx.beginPath();
    ctx.moveTo(points[n - 1]!.x, points[n - 1]!.y);
    for (let i = n - 1 - step; i >= 0; i -= step) ctx.lineTo(points[i]!.x, points[i]!.y);
    ctx.stroke();
    ctx.strokeStyle = skin.primary;
    ctx.globalAlpha = 0.34;
    ctx.lineWidth = r * 0.34;
    ctx.beginPath();
    ctx.moveTo(points[n - 1]!.x - r * 0.1, points[n - 1]!.y - r * 0.15);
    for (let i = n - 1 - step; i >= 0; i -= step) {
      ctx.lineTo(points[i]!.x - r * 0.1, points[i]!.y - r * 0.15);
    }
    ctx.stroke();
    ctx.restore();
  }
  const colors = segmentPalette(skin, n, t);
  const batchSolidBody =
    !sprite &&
    !glowEnabled &&
    !options.boosting &&
    !skin.sparkle &&
    skin.pattern === "solid" &&
    skin.outline <= 0 &&
    skin.shading === "flat";
  if (batchSolidBody) {
    ctx.fillStyle = skin.primary;
    ctx.beginPath();
    for (let i = n - 1; i >= 0; i--) {
      const p = points[i]!;
      const taper = r * (1 - (i / n) * 0.55) * (i === 0 ? 1.14 : 1);
      ctx.moveTo(p.x + taper, p.y);
      ctx.arc(p.x, p.y, taper, 0, Math.PI * 2);
    }
    ctx.fill();
  } else {
    for (let i = sprite ? -1 : n - 1; i >= 0; i--) {
      const p = points[i]!;
      const col = i < 0 ? skin.primary : colors[i]!;
      const taper = r * (1 - (i / n) * 0.55) * (i === 0 ? 1.14 : 1);
      let glow = skin.glow;
      if (skin.pattern === "glow-pulse")
        glow *= 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t / 220 - i * 0.45));
      if (options.boosting) glow = Math.min(1, glow + 0.35);
      if (glowEnabled && glow > 0.05) {
        const sprite = glowSprite(col);
        if (sprite) {
          const extent = taper * 2.8;
          ctx.globalAlpha = glow * 0.8;
          ctx.drawImage(sprite, p.x - extent, p.y - extent, extent * 2, extent * 2);
          ctx.globalAlpha = 1;
        }
      }
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(p.x, p.y, taper, 0, Math.PI * 2);
      ctx.fill();
      if (skin.outline > 0) {
        ctx.lineWidth = skin.outline;
        ctx.strokeStyle = shade(skin.primary, 0.65);
        ctx.stroke();
      }
      if (skin.pattern === "dots" && i % 3 === 1) {
        ctx.fillStyle = skin.secondary;
        ctx.beginPath();
        ctx.arc(p.x, p.y, taper * 0.38, 0, Math.PI * 2);
        ctx.fill();
      }
      drawPatternOverlay(ctx, skin, points, i, taper);
      if (skin.shading === "bead") drawBead(ctx, p, taper);
    }
  }
  if (options.boosting && glowEnabled) drawBoostFront(ctx, skin.boost, points, r, t);
  if (skin.sparkle && glowEnabled) drawSparkles(ctx, skin, points, r, t);
  if (sprite) drawSpriteHead(ctx, sprite.head, points, r);
  else drawEyes(ctx, skin, points, r, options.lookAt ?? null, options.boosting, t);
  ctx.restore();
}

/** Stamps the body tile along the path, rotated to follow it (tail first so the head overlaps). */
function drawSpriteBody(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  points: Point[],
  r: number,
) {
  const n = points.length;
  const gap = Math.hypot(points[0]!.x - points[1]!.x, points[0]!.y - points[1]!.y) || r * 0.5;
  const stride = Math.max(1, Math.round((r * 0.9) / gap));
  const len = r * 0.9 * 1.45; // slight overlap hides the seams on curves
  for (let i = n - 1; i >= 1; i -= stride) {
    const p = points[i]!;
    const q = points[Math.max(0, i - 1)]!;
    const ang = Math.atan2(q.y - p.y, q.x - p.x);
    const taper = r * (1 - (i / n) * 0.35);
    ctx.translate(p.x, p.y);
    ctx.rotate(ang);
    ctx.drawImage(img, -len / 2, -taper, len, taper * 2);
    ctx.rotate(-ang);
    ctx.translate(-p.x, -p.y);
  }
}

function drawSpriteHead(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  points: Point[],
  r: number,
) {
  const h = points[0]!;
  const ang = headDir(points);
  const size = r * 3.0;
  ctx.save();
  ctx.translate(h.x, h.y);
  ctx.rotate(ang);
  ctx.drawImage(img, -size * 0.45, -size / 2, size, size);
  ctx.restore();
}

/** Glossy "ball" look: dark rim + soft highlight. Two cheap fills per segment. */
function drawBead(ctx: CanvasRenderingContext2D, p: Point, taper: number) {
  ctx.lineWidth = Math.max(1, taper * 0.12);
  ctx.strokeStyle = "rgba(0,0,0,0.28)";
  ctx.beginPath();
  ctx.arc(p.x, p.y, taper * 0.94, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.3)";
  ctx.beginPath();
  ctx.ellipse(
    p.x - taper * 0.26,
    p.y - taper * 0.32,
    taper * 0.34,
    taper * 0.22,
    -0.6,
    0,
    Math.PI * 2,
  );
  ctx.fill();
}

/** Extra per-segment detail for patterns that need more than a flat colour. */
function drawPatternOverlay(
  ctx: CanvasRenderingContext2D,
  skin: SnakeSkin,
  points: Point[],
  i: number,
  taper: number,
) {
  const p = points[i]!;
  if (skin.pattern === "leopard" && i % 2 === 1) {
    // Rosettes alternate left/right of the spine.
    const ang = headingAt(points, i) + Math.PI / 2;
    const side = (i >> 1) % 2 === 0 ? 1 : -1;
    const x = p.x + Math.cos(ang) * side * taper * 0.35;
    const y = p.y + Math.sin(ang) * side * taper * 0.35;
    ctx.fillStyle = skin.secondary;
    ctx.beginPath();
    ctx.arc(x, y, taper * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = skin.primary;
    ctx.beginPath();
    ctx.arc(x, y, taper * 0.2, 0, Math.PI * 2);
    ctx.fill();
  } else if (skin.pattern === "scales") {
    // A lighter crescent on the front edge of each segment looks like overlapping scales.
    const ang = headingAt(points, i);
    ctx.strokeStyle = skin.secondary;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = Math.max(1, taper * 0.22);
    ctx.beginPath();
    ctx.arc(p.x, p.y, taper * 0.72, ang - 1.1, ang + 1.1);
    ctx.stroke();
    ctx.globalAlpha = 1;
  } else if (skin.pattern === "galaxy" && i % 2 === 0) {
    const a = hash(i * 3.7) * Math.PI * 2;
    const d = taper * 0.5 * hash(i * 1.3 + 2);
    ctx.fillStyle = "#ffffff";
    ctx.globalAlpha = 0.5 + 0.5 * hash(i + 9);
    ctx.beginPath();
    ctx.arc(
      p.x + Math.cos(a) * d,
      p.y + Math.sin(a) * d,
      Math.max(0.8, taper * 0.12),
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

function headDir(points: Point[]) {
  const a = points[0]!,
    b = points[Math.min(2, points.length - 1)]!;
  const ang = a.x === b.x && a.y === b.y ? 0 : Math.atan2(a.y - b.y, a.x - b.x);
  return ang;
}

function drawEyes(
  ctx: CanvasRenderingContext2D,
  skin: SnakeSkin,
  points: Point[],
  r: number,
  lookAt: Point | null,
  boosting = false,
  time = 0,
) {
  const h = points[0]!;
  const ang = headDir(points);
  const fx = Math.cos(ang),
    fy = Math.sin(ang);
  const px = -fy,
    py = fx; // perpendicular
  const e = skin.eyes;
  const look = e.followMouse && lookAt ? Math.atan2(lookAt.y - h.y, lookAt.x - h.x) : ang;
  const cyclops = e.shape === "cyclops";
  const er = r * (cyclops ? 0.62 : e.shape === "cute" ? 0.48 : 0.4);
  const spots = cyclops ? SINGLE_EYE_SPOT : PAIRED_EYE_SPOTS;

  for (const side of spots) {
    const cx = h.x + fx * r * 0.35 + px * side * r * 0.5;
    const cy = h.y + fy * r * 0.35 + py * side * r * 0.5;
    ctx.save();
    ctx.translate(cx, cy);
    if (e.shape === "heart") {
      // Solid heart in the eye colour (no pupil), tilted with the head.
      const hs = er * 1.45;
      ctx.rotate(ang + Math.PI / 2);
      const blink = Math.sin(time / 1700 + 1.7) > 0.985;
      ctx.fillStyle = e.color;
      ctx.beginPath();
      ctx.moveTo(0, hs * 0.85);
      ctx.bezierCurveTo(-hs * 1.35, -hs * 0.1, -hs * 0.6, -hs * 1.0, 0, -hs * 0.35);
      ctx.bezierCurveTo(hs * 0.6, -hs * 1.0, hs * 1.35, -hs * 0.1, 0, hs * 0.85);
      if (blink) {
        ctx.lineWidth = Math.max(1.5, er * 0.25);
        ctx.strokeStyle = e.color;
        ctx.beginPath();
        ctx.moveTo(-er, 0);
        ctx.quadraticCurveTo(0, er * 0.35, er, 0);
        ctx.stroke();
      } else {
        ctx.fill();
      }
      ctx.restore();
      continue;
    }

    ctx.fillStyle = e.color;
    ctx.beginPath();
    if (e.shape === "oval") ctx.ellipse(0, 0, er * 1.25, er * 0.8, ang, 0, Math.PI * 2);
    else ctx.arc(0, 0, er, 0, Math.PI * 2);
    ctx.fill();

    const pr = er * (0.2 + e.pupilSize * 0.6);
    const off = er - pr - er * 0.08;
    ctx.fillStyle = "#070a14";
    ctx.beginPath();
    ctx.arc(Math.cos(look) * off, Math.sin(look) * off, pr, 0, Math.PI * 2);
    ctx.fill();

    if (e.shape === "cute") {
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(
        Math.cos(look) * off - pr * 0.35,
        Math.sin(look) * off - pr * 0.35,
        pr * 0.35,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
    if (e.shape === "sleepy") {
      ctx.fillStyle = skin.primary;
      ctx.beginPath();
      const up = cyclops ? ang - Math.PI / 2 : Math.atan2(py * side, px * side);
      ctx.arc(0, 0, er + 0.5, up - Math.PI / 2, up + Math.PI / 2);
      ctx.fill();
    }
    if (e.shape === "angry") {
      // slanted brow toward the snout
      ctx.strokeStyle = "#070a14";
      ctx.lineWidth = Math.max(2, er * 0.35);
      ctx.lineCap = "round";
      ctx.beginPath();
      const s = cyclops ? 0 : side;
      ctx.moveTo(px * s * er * 1.1 - fx * er * 0.6, py * s * er * 1.1 - fy * er * 0.6);
      ctx.lineTo(fx * er * 0.8 + px * s * er * 0.2, fy * er * 0.8 + py * s * er * 0.2);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function hash(n: number) {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

function drawSparkles(
  ctx: CanvasRenderingContext2D,
  skin: SnakeSkin,
  points: Point[],
  r: number,
  t: number,
) {
  const n = points.length;
  ctx.fillStyle = "#ffffff";
  for (let k = 0; k < 16; k++) {
    ctx.fillStyle = k % 2 ? "#ffffff" : "#ffe27a";
    const phase = (t / 900 + hash(k)) % 1;
    const i = Math.floor(n * 0.4 + hash(k + 3) * n * 0.6) % n;
    const p = points[i]!;
    const a = hash(k + 7) * Math.PI * 2;
    const d = r * (0.8 + phase * 1.6);
    const s = (1 - phase) * r * 0.34;
    ctx.globalAlpha = 1 - phase;
    star(ctx, p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, s);
  }
  ctx.globalAlpha = 1;
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  ctx.beginPath();
  ctx.moveTo(x, y - s * 2);
  ctx.quadraticCurveTo(x, y, x + s * 2, y);
  ctx.quadraticCurveTo(x, y, x, y + s * 2);
  ctx.quadraticCurveTo(x, y, x - s * 2, y);
  ctx.quadraticCurveTo(x, y, x, y - s * 2);
  ctx.fill();
}

const FX_COLOR: Record<BoostEffect, string> = {
  flame: "#ff7a1a",
  electric: "#22e4ff",
  bubbles: "#7fd8ff",
  rainbow: "#ff5ad9",
  stardust: "#ffe27a",
};

/** One soft translucent stroke along the whole body (cheap: a single path). */
function drawAura(
  ctx: CanvasRenderingContext2D,
  points: Point[],
  width: number,
  color: string,
  alpha: number,
) {
  const n = points.length;
  if (n < 2) return;
  const step = Math.max(1, Math.ceil(n / 70));
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = color;
  ctx.globalAlpha = alpha;
  ctx.lineWidth = width * 2;
  ctx.beginPath();
  ctx.moveTo(points[0]!.x, points[0]!.y);
  for (let i = step; i < n; i += step) ctx.lineTo(points[i]!.x, points[i]!.y);
  ctx.lineTo(points[n - 1]!.x, points[n - 1]!.y);
  ctx.stroke();
  ctx.restore();
}

/** Behind the body: a coloured aura around the whole snake plus a tail trail. */
function drawBoostBack(
  ctx: CanvasRenderingContext2D,
  fx: BoostEffect,
  points: Point[],
  r: number,
  t: number,
) {
  const n = points.length;
  if (n < 2) return;
  const pulse = 0.78 + 0.22 * Math.sin(t / 110);
  ctx.save();
  if (fx === "rainbow") {
    // Colour-shifting aura: short coloured chunks along the body.
    const step = Math.max(1, Math.ceil(n / 60));
    ctx.lineCap = "round";
    ctx.lineWidth = r * 3.2;
    ctx.globalAlpha = 0.42 * pulse;
    for (let i = 0; i + step < n; i += step) {
      const c = `hsl(${(i * 7 - t * 0.28) % 360} 100% 60%)`;
      ctx.strokeStyle = c;
      ctx.beginPath();
      ctx.moveTo(points[i]!.x, points[i]!.y);
      ctx.lineTo(points[i + step]!.x, points[i + step]!.y);
      ctx.stroke();
    }
  } else {
    drawAura(ctx, points, r * 1.55, FX_COLOR[fx], 0.34 * pulse);
    drawAura(ctx, points, r * 1.15, FX_COLOR[fx], 0.2 * pulse);
  }
  ctx.restore();

  // Trail streaming off the tail.
  const tail = points[n - 1]!,
    prev = points[Math.max(0, n - 4)]!;
  const back = Math.atan2(tail.y - prev.y, tail.x - prev.x);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const count = fx === "flame" ? 22 : fx === "rainbow" ? 16 : fx === "stardust" ? 12 : 0;
  for (let k = 0; k < count; k++) {
    const ph = (t / (fx === "flame" ? 360 : 700) + hash(k)) % 1;
    const d = ph * r * (fx === "flame" ? 6 : 7);
    const spread = (hash(k + 1) - 0.5) * r * 1.8 * ph;
    const x = tail.x + Math.cos(back) * d - Math.sin(back) * spread;
    const y = tail.y + Math.sin(back) * d + Math.cos(back) * spread;
    ctx.globalAlpha = (1 - ph) * 0.95;
    if (fx === "flame") ctx.fillStyle = ph < 0.3 ? "#fff3a0" : ph < 0.65 ? "#ff9a2a" : "#ff3a2a";
    else if (fx === "rainbow") ctx.fillStyle = `hsl(${(k * 24 + t * 0.2) % 360} 100% 62%)`;
    else ctx.fillStyle = k % 2 ? "#fff2b0" : "#ffd23a";
    ctx.beginPath();
    ctx.arc(x, y, r * (fx === "flame" ? 0.85 : 0.5) * (1 - ph * 0.65), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** In front of the body: particles / bolts that visibly sit ON the snake. */
function drawBoostFront(
  ctx: CanvasRenderingContext2D,
  fx: BoostEffect,
  points: Point[],
  r: number,
  t: number,
) {
  const n = points.length;
  if (n < 2) return;
  ctx.save();
  const m = Math.min(40, Math.max(14, Math.floor(n / 2.5)));

  if (fx === "electric") {
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const step = Math.max(2, Math.floor(n / 22));
    const frame = Math.floor(t / 70);
    for (let b = 0; b < 3; b++) {
      ctx.beginPath();
      for (let i = 0; i < n; i += step) {
        const p = points[i]!;
        const a = headingAt(points, i) + Math.PI / 2;
        const j = (hash(i + frame * 13 + b * 101) - 0.5) * r * 2.4;
        const x = p.x + Math.cos(a) * j,
          y = p.y + Math.sin(a) * j;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = "#22e4ff";
      ctx.lineWidth = 3.2;
      ctx.globalAlpha = 0.9;
      ctx.stroke();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
    ctx.fillStyle = "#ffffff";
    for (let k = 0; k < 8; k++) {
      const p = points[Math.floor(hash(k + frame * 5) * n)]!;
      ctx.globalAlpha = hash(k + frame);
      ctx.beginPath();
      ctx.arc(p.x + (hash(k + 2) - 0.5) * r * 3, p.y + (hash(k + 4) - 0.5) * r * 3, 1.8, 0, 6.3);
      ctx.fill();
    }
  } else {
    if (fx !== "bubbles") ctx.globalCompositeOperation = "lighter";
    for (let k = 0; k < m; k++) {
      const idx = Math.floor(hash(k * 7 + 1) * n);
      const p = points[idx]!;
      const a = headingAt(points, idx) + Math.PI / 2;
      const side = hash(k + 3) > 0.5 ? 1 : -1;
      if (fx === "flame") {
        const ph = (t / 430 + hash(k)) % 1;
        const off = r * (0.5 + ph * 1.5) * side;
        ctx.globalAlpha = (1 - ph) * 0.95;
        ctx.fillStyle = ph < 0.25 ? "#fff3a0" : ph < 0.6 ? "#ff9a2a" : "#ff3a2a";
        ctx.beginPath();
        ctx.arc(
          p.x + Math.cos(a) * off,
          p.y + Math.sin(a) * off - ph * r * 0.8,
          r * (0.62 * (1 - ph) + 0.1),
          0,
          Math.PI * 2,
        );
        ctx.fill();
      } else if (fx === "bubbles") {
        const ph = (t / 1700 + hash(k)) % 1;
        const off = r * (0.8 + hash(k + 2) * 0.9) * side;
        const x = p.x + Math.cos(a) * off + Math.sin(t / 500 + k) * r * 0.2;
        const y = p.y + Math.sin(a) * off - ph * r * 2.6;
        const br = r * (0.28 + hash(k + 4) * 0.36);
        ctx.globalAlpha = Math.sin(Math.PI * ph);
        ctx.fillStyle = "rgba(160,225,255,0.28)";
        ctx.strokeStyle = "rgba(255,255,255,0.95)";
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.arc(x, y, br, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(x - br * 0.35, y - br * 0.35, br * 0.22, 0, Math.PI * 2);
        ctx.fill();
      } else if (fx === "rainbow") {
        const ph = (t / 900 + hash(k)) % 1;
        const off = r * (0.4 + ph * 1.6) * side;
        ctx.globalAlpha = (1 - ph) * 0.95;
        ctx.fillStyle = `hsl(${(idx * 9 + t * 0.2) % 360} 100% 62%)`;
        ctx.beginPath();
        ctx.arc(p.x + Math.cos(a) * off, p.y + Math.sin(a) * off, r * 0.3 * (1 - ph * 0.5), 0, 6.3);
        ctx.fill();
      } else {
        // stardust: twinkling four-point stars sitting on the body
        const tw = 0.5 + 0.5 * Math.sin(t / 130 + k * 2.1);
        const off = r * (hash(k + 6) * 1.1) * side;
        ctx.globalAlpha = 0.35 + 0.65 * tw;
        ctx.fillStyle = k % 3 === 0 ? "#ffffff" : k % 3 === 1 ? "#ffe27a" : "#ffb3f0";
        star(
          ctx,
          p.x + Math.cos(a) * off,
          p.y + Math.sin(a) * off,
          r * (0.16 + hash(k + 8) * 0.22) * (0.5 + tw),
        );
      }
    }
  }
  ctx.restore();
}
