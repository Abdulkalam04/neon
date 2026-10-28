import { CFG, snakeRadius, type GameState, type Orb, type Snake, type Vec } from "@/game/core";
import { drawSnake, type SkinPattern, type SnakeSkin, DEFAULT_SKIN } from "./drawSnake";
import { QUALITY_PRESETS, type QualityProfile } from "@/lib/qualityProfile";

// Reusable scratch buffer for downsampled body points — avoids a new array allocation
// every frame per visible snake. Cleared and refilled in renderGame().
const ptsBuffer: Vec[] = [];
const orderedSnakes: Snake[] = [];
const snakeVariants = new WeakMap<
  SnakeSkin,
  { low: SnakeSkin; medium: SnakeSkin; simplified: SnakeSkin }
>();

export interface Camera {
  x: number;
  y: number;
  zoom: number;
  baseZoom: number;
}

export interface View {
  w: number;
  h: number;
}

export function createCamera(): Camera {
  return { x: 0, y: 0, zoom: 1, baseZoom: 1 };
}

/** Follows the player's head and zooms out as it grows. */
export function updateCamera(cam: Camera, state: GameState, view: View, dt: number) {
  const p = state.snakes.find((s) => s.id === state.playerId);
  if (p) {
    const h = p.body[0]!;
    const k = 1 - Math.exp(-dt * 10);
    cam.x += (h.x - cam.x) * k;
    cam.y += (h.y - cam.y) * k;
    const base = Math.max(0.78, Math.min(1.12, Math.min(view.w, view.h) / 680));
    cam.baseZoom = base;
    // Zoom out as the snake gets thicker so a big snake still sees enough of the arena.
    const size = Math.max(
      0.4,
      Math.pow(snakeRadius(CFG.startLength) / snakeRadius(p.length), 0.55),
    );
    cam.zoom += (base * size - cam.zoom) * (1 - Math.exp(-dt * 2));
  }
}

/** Compensates for camera zoom while keeping the starting-size rendering unchanged. */
export function orbScreenScale(zoom: number, refZoom = 1): number {
  if (!Number.isFinite(zoom) || zoom <= 0 || !Number.isFinite(refZoom) || refZoom <= 0) return 1;
  return Math.max(1, Math.min(2.6, refZoom / zoom));
}

export const worldToScreen = (cam: Camera, view: View, p: Vec): Vec => ({
  x: (p.x - cam.x) * cam.zoom + view.w / 2,
  y: (p.y - cam.y) * cam.zoom + view.h / 2,
});
export const screenToWorld = (cam: Camera, view: View, p: Vec): Vec => ({
  x: (p.x - view.w / 2) / cam.zoom + cam.x,
  y: (p.y - view.h / 2) / cam.zoom + cam.y,
});

const PATTERNS: SkinPattern[] = ["solid", "stripes", "gradient", "dots", "checker", "zebra"];
const botSkinCache = new Map<number, SnakeSkin>();
function botSkin(s: Snake): SnakeSkin {
  let skin = botSkinCache.get(s.id);
  if (!skin) {
    skin = {
      ...DEFAULT_SKIN,
      primary: hslToHex(s.hue, 95, 58),
      secondary: hslToHex((s.hue + 40 + (s.skinIndex % 5) * 30) % 360, 90, 50),
      pattern: PATTERNS[s.skinIndex % PATTERNS.length]!,
      eyes: {
        ...DEFAULT_SKIN.eyes,
        shape: (["round", "oval", "angry", "cute"] as const)[s.skinIndex % 4]!,
        followMouse: false,
      },
      glow: 0.25,
    };
    if (botSkinCache.size > 500) botSkinCache.clear();
    botSkinCache.set(s.id, skin);
  }
  return skin;
}

export interface RenderOptions {
  time: number;
  playerSkin: SnakeSkin;
  mouseWorld: Vec | null;
  quality?: "high" | "medium" | "low";
  profile?: QualityProfile;
  /** 0..1 screen shake strength. */
  shake?: number;
  floaters?: Floater[];
}

export interface Floater {
  x: number;
  y: number;
  text: string;
  born: number;
}

export function renderGame(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  cam: Camera,
  view: View,
  opts: RenderOptions,
) {
  const { w, h } = view;
  const R = state.worldRadius;
  const profile = opts.profile ?? QUALITY_PRESETS[opts.quality ?? "high"];
  ctx.fillStyle = "#03040a";
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  const shake = opts.shake ?? 0;
  ctx.translate(
    w / 2 + Math.sin(opts.time * 0.031) * shake * 10,
    h / 2 + Math.cos(opts.time * 0.037) * shake * 10,
  );
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-cam.x, -cam.y);

  const halfW = w / 2 / cam.zoom,
    halfH = h / 2 / cam.zoom;
  const left = cam.x - halfW,
    right = cam.x + halfW,
    top = cam.y - halfH,
    bottom = cam.y + halfH;

  // Arena floor + grid (clipped to the circle)
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, Math.PI * 2);
  ctx.fillStyle = getArenaGradients(ctx, R).floor;
  ctx.fill();
  ctx.clip();
  ctx.strokeStyle = "rgba(34,228,255,0.055)";
  ctx.lineWidth = 1 / cam.zoom;
  const step = 80;
  ctx.beginPath();
  for (let x = Math.floor(left / step) * step; x < right; x += step) {
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
  }
  for (let y = Math.floor(top / step) * step; y < bottom; y += step) {
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
  }
  ctx.stroke();
  if (profile.nebula) {
    ctx.fillStyle = "rgba(255,255,255,0.16)";
    for (let x = Math.floor(left / 120) * 120; x < right; x += 120)
      for (let y = Math.floor(top / 120) * 120; y < bottom; y += 120) {
        ctx.beginPath();
        ctx.arc(x + 40, y + 24, 1, 0, Math.PI * 2);
        ctx.fill();
      }
  }
  if (profile.ambientDust) {
    ctx.fillStyle = "rgba(130,210,255,0.2)";
    const parallax = profile.parallax ? 0.18 : 0;
    for (let i = 0; i < Math.min(24, profile.maxParticles); i++) {
      const x = cam.x * parallax + cam.x + (((i * 127) % view.w) - view.w / 2) / cam.zoom;
      const y = cam.y * parallax + cam.y + (((i * 83) % view.h) - view.h / 2) / cam.zoom;
      ctx.beginPath();
      ctx.arc(x, y, 0.8 / cam.zoom, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();

  // Boundary ring and the final danger band.
  ctx.save();
  ctx.fillStyle = getArenaGradients(ctx, R).danger;
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,43,214,0.8)";
  ctx.lineWidth = 5;
  ctx.setLineDash([18, 14]);
  ctx.lineDashOffset = -opts.time * 0.025;
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  // Orbs (cached glow sprites, culled to the viewport)
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const t = opts.time;
  const low = !profile.glow;
  const orbScale = orbScreenScale(cam.zoom, cam.baseZoom);
  let visibleDeathOrbs = 0;
  for (let i = 0; i < state.orbs.length; i++) {
    const o = state.orbs[i]!;
    if (
      o.kind === "death" &&
      o.x >= left - o.r * 4 &&
      o.x <= right + o.r * 4 &&
      o.y >= top - o.r * 4 &&
      o.y <= bottom + o.r * 4
    ) {
      visibleDeathOrbs++;
    }
  }
  const deathBudget = Math.min(120, visibleDeathOrbs, Math.max(24, profile.maxParticles >> 2));
  const normalBudget = Math.max(0, profile.maxParticles - deathBudget);
  let normalParticles = 0;
  for (const o of state.orbs) {
    if (o.kind === "death") continue; // drawn in the dedicated pass below
    if (o.x < left - 20 || o.x > right + 20 || o.y < top - 20 || o.y > bottom + 20) continue;
    if (normalParticles++ >= normalBudget) break;
    const pulse = profile.foodTwinkle ? 0.85 + 0.15 * Math.sin(t / 300 + o.id) : 1;
    if (low) {
      ctx.fillStyle = `hsl(${o.hue} 100% 66%)`;
      ctx.beginPath();
      ctx.arc(o.x, o.y, o.r * orbScale * pulse, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const s = o.r * 5.2 * orbScale * pulse;
      ctx.drawImage(orbSprite(o.hue), o.x - s / 2, o.y - s / 2, s, s);
    }
  }
  // Death drops: bigger, brighter, golden-ringed and beaconing so a fresh kill is
  // recognisable from across the screen (and on the minimap).
  let deathParticles = 0;
  for (const o of state.orbs) {
    if (o.kind !== "death") continue;
    const margin = o.r * 4;
    if (o.x < left - margin || o.x > right + margin || o.y < top - margin || o.y > bottom + margin)
      continue;
    if (deathParticles++ >= deathBudget) break;
    drawDeathOrb(ctx, o, state.tick, t, low, orbScale, cam.zoom);
  }
  ctx.restore();

  // Snakes (player last so it's on top).
  orderedSnakes.length = 0;
  for (const snake of state.snakes) if (snake.alive) orderedSnakes.push(snake);
  orderedSnakes.sort((a, b) => Number(a.isPlayer) - Number(b.isPlayer));
  const ordered = orderedSnakes;
  for (const s of ordered) {
    const head = s.body[0]!;
    const r = snakeRadius(s.length);
    const reach = s.body.length * r * 0.5 + 50;
    if (
      head.x < left - reach ||
      head.x > right + reach ||
      head.y < top - reach ||
      head.y > bottom + reach
    )
      continue;
    // Reuse the module-level ptsBuffer instead of allocating a new Vec[] each frame.
    ptsBuffer.length = 0;
    const pointStep = Math.max(2, Math.round(2 / profile.trailLength));
    for (let i = 0; i < s.body.length; i += pointStep) ptsBuffer.push(s.body[i]!);
    const sk = s.isPlayer ? opts.playerSkin : botSkin(s);
    let variants = snakeVariants.get(sk);
    if (!variants) {
      variants = {
        low: {
          ...sk,
          pattern: "solid",
          eyes: { ...sk.eyes, shape: "round" },
          glow: 0,
          sparkle: false,
          shading: "flat",
        },
        medium: { ...sk, glow: sk.glow * 0.5 },
        simplified: {
          ...sk,
          pattern: "solid",
          eyes: { ...sk.eyes, shape: "round" },
          sparkle: false,
          shading: "flat",
        },
      };
      snakeVariants.set(sk, variants);
    }
    const fullSnakeDetail = profile.snakeScales && profile.snakeShine && profile.eyeDetail;
    const renderSkin = low
      ? variants.low
      : !fullSnakeDetail
        ? variants.simplified
        : profile.shadows
          ? sk
          : variants.medium;
    drawSnake(ctx, renderSkin, ptsBuffer, {
      radius: r,
      time: t,
      lookAt: s.isPlayer ? opts.mouseWorld : null,
      boosting: s.boosting,
    });
  }
  const boostingPlayer = profile.speedLines
    ? state.snakes.find((snake) => snake.id === state.playerId && snake.alive && snake.boosting)
    : undefined;
  if (boostingPlayer) {
    const head = boostingPlayer.body[0]!;
    ctx.save();
    ctx.strokeStyle = "rgba(120,235,255,0.22)";
    ctx.lineWidth = 1 / cam.zoom;
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2 + t * 0.0006;
      const length = 28 + (i % 3) * 12;
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      ctx.beginPath();
      ctx.moveTo(head.x - dx * length, head.y - dy * length);
      ctx.lineTo(head.x - dx * (length + 18), head.y - dy * (length + 18));
      ctx.stroke();
    }
    ctx.restore();
  }

  // Names
  ctx.textAlign = "center";
  ctx.font = `600 ${Math.round(13 / Math.max(cam.zoom, 0.6))}px 'Chakra Petch', sans-serif`;
  for (const s of ordered) {
    const hd = s.body[0]!;
    if (hd.x < left || hd.x > right || hd.y < top || hd.y > bottom) continue;
    const label = s.name;
    if (profile.nameTagDetail) {
      const width = ctx.measureText(label).width + 12 / Math.max(cam.zoom, 0.6);
      ctx.fillStyle = "rgba(3,6,16,0.72)";
      ctx.fillRect(
        hd.x - width / 2,
        hd.y - snakeRadius(s.length) - 25 / Math.max(cam.zoom, 0.6),
        width,
        18 / Math.max(cam.zoom, 0.6),
      );
    }
    ctx.fillStyle = s.isPlayer ? "rgba(255,255,255,0.98)" : "rgba(220,230,255,0.82)";
    ctx.strokeStyle = "rgba(0,0,0,0.9)";
    ctx.lineWidth = 2 / Math.max(cam.zoom, 0.6);
    ctx.strokeText(label, hd.x, hd.y - snakeRadius(s.length) - 12);
    ctx.fillText(label, hd.x, hd.y - snakeRadius(s.length) - 12);
  }

  // Floating "+N" text
  if (opts.floaters?.length) {
    ctx.font = `700 ${Math.round(16 / Math.max(cam.zoom, 0.6))}px 'Audiowide', sans-serif`;
    for (const f of opts.floaters) {
      const age = (t - f.born) / 800;
      if (age < 0 || age > 1) continue;
      if (f.x < left - 60 || f.x > right + 60 || f.y < top - 60 || f.y > bottom + 60) continue;
      ctx.globalAlpha = 1 - age;
      ctx.fillStyle = "#9dff3a";
      ctx.shadowColor = "#9dff3a";
      ctx.shadowBlur = profile.glow ? 10 : 0;
      ctx.fillText(f.text, f.x, f.y - age * 40);
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }
  ctx.restore();

  if (profile.glow && opts.quality !== "low" && cam.zoom < cam.baseZoom * 0.8) {
    drawDeathOrbIndicators(ctx, state, cam, view);
  }

  const player = state.snakes.find((s) => s.id === state.playerId);
  if (profile.vignette && player?.alive) {
    const distance = R - Math.hypot(player.body[0]!.x, player.body[0]!.y);
    if (distance < 250) {
      const dangerAlpha = Math.min(0.24, (250 - distance) / 850);
      ctx.fillStyle = getVignetteGradient(ctx, w, h);
      ctx.globalAlpha = dangerAlpha / 0.24;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#ff789c";
      ctx.font = "700 12px 'Chakra Petch', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("DANGER ZONE", w / 2, h - 24);
    }
  }

  if (opts.time - minimapCache.updatedAt >= profile.minimapIntervalMs) {
    updateMinimapCache(state, cam, view);
    minimapCache.updatedAt = opts.time;
  }
  if (minimapCache.canvas) ctx.drawImage(minimapCache.canvas, 0, 0, w, h);
  else drawMinimap(ctx, state, cam, view);
}

interface ArenaGradients {
  radius: number;
  floor: CanvasGradient;
  danger: CanvasGradient;
}

let arenaGradientCache = new WeakMap<CanvasRenderingContext2D, ArenaGradients>();
let vignetteCache = new WeakMap<
  CanvasRenderingContext2D,
  { width: number; height: number; gradient: CanvasGradient }
>();
function getArenaGradients(ctx: CanvasRenderingContext2D, radius: number): ArenaGradients {
  const existing = arenaGradientCache.get(ctx);
  if (existing?.radius === radius) return existing;
  const floor = ctx.createRadialGradient(0, 0, radius * 0.08, 0, 0, radius * 1.08);
  floor.addColorStop(0, "#17264a");
  floor.addColorStop(0.55, "#0b132b");
  floor.addColorStop(1, "#040611");
  const danger = ctx.createRadialGradient(0, 0, Math.max(0, radius - 300), 0, 0, radius);
  danger.addColorStop(0, "rgba(255,30,110,0)");
  danger.addColorStop(0.86, "rgba(255,30,110,0)");
  danger.addColorStop(1, "rgba(255,30,110,0.28)");
  const gradients = { radius, floor, danger };
  arenaGradientCache.set(ctx, gradients);
  return gradients;
}

function getVignetteGradient(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const cached = vignetteCache.get(ctx);
  if (cached?.width === width && cached.height === height) return cached.gradient;
  const gradient = ctx.createRadialGradient(
    width / 2,
    height / 2,
    Math.min(width, height) * 0.22,
    width / 2,
    height / 2,
    Math.max(width, height) * 0.72,
  );
  gradient.addColorStop(0.65, "rgba(255,24,90,0)");
  gradient.addColorStop(1, "rgba(255,24,90,0.24)");
  vignetteCache.set(ctx, { width, height, gradient });
  return gradient;
}

const minimapCache: { canvas: HTMLCanvasElement | null; updatedAt: number } = {
  canvas: null,
  updatedAt: -Infinity,
};

function updateMinimapCache(state: GameState, cam: Camera, view: View) {
  if (typeof document === "undefined") return;
  const canvas = (minimapCache.canvas ??= document.createElement("canvas"));
  const width = Math.min(2048, Math.max(1, Math.round(view.w)));
  const height = Math.min(2048, Math.max(1, Math.round(view.h)));
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(canvas.width / view.w, 0, 0, canvas.height / view.h, 0, 0);
  drawMinimap(ctx, state, cam, view);
}

export function clearRenderCaches() {
  for (const canvas of orbSpriteCache.values()) canvas.width = canvas.height = 1;
  orbSpriteCache.clear();
  botSkinCache.clear();
  arenaGradientCache = new WeakMap();
  vignetteCache = new WeakMap();
  if (minimapCache.canvas) {
    minimapCache.canvas.width = minimapCache.canvas.height = 1;
    minimapCache.canvas = null;
  }
  minimapCache.updatedAt = -Infinity;
}

const TICKS_PER_SEC = 60;
const easeOutBack = (x: number) => {
  const c1 = 1.70158,
    c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};

/**
 * One death-drop orb. Layers (all additive): wide soft beacon, hue-tinted glow
 * sprite, white-hot core, pulsing golden ring and a slowly spinning sparkle.
 * Pops in with an overshoot when it spawns and flickers out before it expires.
 */
function drawDeathOrb(
  ctx: CanvasRenderingContext2D,
  o: Orb,
  tick: number,
  t: number,
  low: boolean,
  orbScale: number,
  zoom: number,
) {
  const age = (tick - (o.born ?? tick)) / TICKS_PER_SEC;
  const pop = age < 0.45 ? Math.max(0, easeOutBack(age / 0.45)) : 1;
  const left = (CFG.deathOrbLifeTicks - (tick - (o.born ?? tick))) / TICKS_PER_SEC;
  const fade = left < 8 ? (Math.sin(t / 90) > -0.2 ? Math.max(0.15, left / 8) : 0.25) : 1;
  const pulse = 1 + 0.12 * Math.sin(t / 260 + o.id * 0.7);
  const screenRadius = Math.min(14, o.r * orbScale * zoom * pop * pulse);
  const r = Math.max(7, screenRadius) / zoom;
  if (r <= 0) return;
  ctx.globalAlpha = fade;

  // Wide, faint beacon so clusters read as a glowing patch from far away.
  const b = Math.min(r * 7, 42 / zoom);
  ctx.globalAlpha = fade * 0.55;
  ctx.drawImage(orbSprite(o.hue), o.x - b / 2, o.y - b / 2, b, b);
  // Body glow
  ctx.globalAlpha = fade;
  const g = Math.min(r * 3.2, 28 / zoom);
  ctx.drawImage(orbSprite(o.hue), o.x - g / 2, o.y - g / 2, g, g);
  // White-hot core
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(o.x, o.y, r * 0.42, 0, Math.PI * 2);
  ctx.fill();
  // Pulsing golden ring (expands and fades on a 1.2 s loop, offset per orb)
  const ph = (((t / 1200 + o.id * 0.137) % 1) + 1) % 1;
  ctx.strokeStyle = "#ffd23a";
  ctx.lineWidth = Math.max(1.5, r * 0.14);
  ctx.globalAlpha = fade * (1 - ph) * 0.9;
  ctx.beginPath();
  ctx.arc(o.x, o.y, r * (0.7 + ph * 1.1), 0, Math.PI * 2);
  ctx.stroke();
  if (!low) {
    // Slowly spinning four-point sparkle
    ctx.globalAlpha = fade * 0.85;
    ctx.fillStyle = "#fff6c8";
    const a = t / 900 + o.id;
    const L = r * 1.5,
      w = r * 0.14;
    for (let k = 0; k < 2; k++) {
      const ang = a + (k * Math.PI) / 2;
      const c = Math.cos(ang),
        s = Math.sin(ang);
      ctx.beginPath();
      ctx.moveTo(o.x + c * L, o.y + s * L);
      ctx.lineTo(o.x - s * w, o.y + c * w);
      ctx.lineTo(o.x - c * L, o.y - s * L);
      ctx.lineTo(o.x + s * w, o.y - c * w);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

const deathArrowCandidates = [
  { x: 0, y: 0, distanceSq: Infinity, angle: 0 },
  { x: 0, y: 0, distanceSq: Infinity, angle: 0 },
  { x: 0, y: 0, distanceSq: Infinity, angle: 0 },
];

function drawDeathOrbIndicators(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  cam: Camera,
  view: View,
) {
  for (let i = 0; i < deathArrowCandidates.length; i++)
    deathArrowCandidates[i]!.distanceSq = Infinity;
  const maxDistanceSq = 1500 * 1500;
  const halfW = view.w / 2;
  const halfH = view.h / 2;

  for (let i = 0; i < state.orbs.length; i++) {
    const orb = state.orbs[i]!;
    if (orb.kind !== "death") continue;
    const dx = orb.x - cam.x;
    const dy = orb.y - cam.y;
    const distanceSq = dx * dx + dy * dy;
    if (distanceSq > maxDistanceSq) continue;
    const screenX = halfW + dx * cam.zoom;
    const screenY = halfH + dy * cam.zoom;
    if (screenX >= 24 && screenX <= view.w - 24 && screenY >= 24 && screenY <= view.h - 24)
      continue;

    const angle = Math.atan2(dy, dx);
    let duplicate = false;
    for (let i = 0; i < deathArrowCandidates.length; i++) {
      const candidate = deathArrowCandidates[i]!;
      if (candidate.distanceSq === Infinity) continue;
      let angleDelta = Math.abs(angle - candidate.angle);
      if (angleDelta > Math.PI) angleDelta = Math.PI * 2 - angleDelta;
      if (angleDelta < 0.18) {
        duplicate = true;
        if (distanceSq < candidate.distanceSq) {
          candidate.x = dx;
          candidate.y = dy;
          candidate.distanceSq = distanceSq;
          candidate.angle = angle;
        }
        break;
      }
    }
    if (duplicate) continue;

    let insertAt = -1;
    for (let i = 0; i < deathArrowCandidates.length; i++) {
      if (distanceSq < deathArrowCandidates[i]!.distanceSq) {
        insertAt = i;
        break;
      }
    }
    if (insertAt < 0) continue;
    for (let i = deathArrowCandidates.length - 1; i > insertAt; i--) {
      const from = deathArrowCandidates[i - 1]!;
      const to = deathArrowCandidates[i]!;
      to.x = from.x;
      to.y = from.y;
      to.distanceSq = from.distanceSq;
      to.angle = from.angle;
    }
    const candidate = deathArrowCandidates[insertAt]!;
    candidate.x = dx;
    candidate.y = dy;
    candidate.distanceSq = distanceSq;
    candidate.angle = angle;
  }

  ctx.save();
  ctx.fillStyle = "#ffd23a";
  ctx.strokeStyle = "#fff3a0";
  ctx.lineWidth = 1.5;
  ctx.shadowColor = "#ffd23a";
  ctx.shadowBlur = 12;
  for (let i = 0; i < deathArrowCandidates.length; i++) {
    const candidate = deathArrowCandidates[i]!;
    if (candidate.distanceSq === Infinity) continue;
    const dx = candidate.x;
    const dy = candidate.y;
    const rayScale = Math.min(
      (halfW - 20) / Math.max(1, Math.abs(dx)),
      (halfH - 20) / Math.max(1, Math.abs(dy)),
    );
    const x = halfW + dx * rayScale;
    const y = halfH + dy * rayScale;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(candidate.angle);
    ctx.beginPath();
    ctx.moveTo(11, 0);
    ctx.lineTo(-7, -6);
    ctx.lineTo(-4, 0);
    ctx.lineTo(-7, 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

// Pre-rendered orb glow sprites, one per quantized hue, so we blit instead of
// drawing radial gradients for every orb every frame.
const orbSpriteCache = new Map<number, HTMLCanvasElement>();
function orbSprite(hue: number): HTMLCanvasElement {
  const key = (((Math.round(hue / 12) * 12) % 360) + 360) % 360;
  let c = orbSpriteCache.get(key);
  if (!c) {
    c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d")!;
    const grad = g.createRadialGradient(32, 32, 1, 32, 32, 32);
    grad.addColorStop(0, `hsla(${key} 100% 72% / 1)`);
    grad.addColorStop(0.3, `hsl(${key} 100% 66%)`);
    grad.addColorStop(0.45, `hsla(${key} 100% 60% / 0.35)`);
    grad.addColorStop(1, `hsla(${key} 100% 60% / 0)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    if (orbSpriteCache.size >= 24) {
      const oldest = orbSpriteCache.keys().next().value;
      if (oldest !== undefined) {
        const old = orbSpriteCache.get(oldest);
        if (old) old.width = old.height = 1;
        orbSpriteCache.delete(oldest);
      }
    }
    orbSpriteCache.set(key, c);
  }
  return c;
}

function drawMinimap(ctx: CanvasRenderingContext2D, state: GameState, cam: Camera, view: View) {
  const size = Math.min(view.w >= 700 ? 164 : 112, view.w * 0.24);
  const cx = view.w - size / 2 - 14,
    cy = size / 2 + 14;
  const k = size / 2 / state.worldRadius;
  ctx.save();
  ctx.fillStyle = "rgba(10,14,32,0.7)";
  ctx.strokeStyle = "rgba(255,43,214,0.6)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  const me = state.snakes.find((s) => s.id === state.playerId);
  const mh = me?.body[0] ?? { x: cam.x, y: cam.y };
  // Death-drop beacons: pulsing gold dots so a fresh kill is visible at a glance.
  const mt = performance.now();
  ctx.fillStyle = "#ffd23a";
  ctx.shadowColor = "#ffd23a";
  ctx.shadowBlur = 6;
  ctx.globalAlpha = 0.55 + 0.45 * Math.sin(mt / 250);
  for (const o of state.orbs) {
    if (o.kind !== "death") continue;
    ctx.fillRect(cx + o.x * k - 1.7, cy + o.y * k - 1.7, 3.4, 3.4);
  }
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
  for (const s of state.snakes) {
    if (!s.alive) continue;
    const hd = s.body[0]!;
    if (!s.isPlayer && Math.hypot(hd.x - mh.x, hd.y - mh.y) > 1600) continue;
    ctx.fillStyle = s.isPlayer ? "#ffffff" : `hsl(${s.hue} 90% 60%)`;
    ctx.beginPath();
    ctx.arc(
      cx + hd.x * k,
      cy + hd.y * k,
      s.isPlayer ? 3.5 : 1.8 + Math.min(3, s.length / 150),
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  ctx.strokeStyle = "rgba(34,228,255,0.5)";
  ctx.strokeRect(
    cx + (cam.x - view.w / 2 / cam.zoom) * k,
    cy + (cam.y - view.h / 2 / cam.zoom) * k,
    (view.w / cam.zoom) * k,
    (view.h / cam.zoom) * k,
  );
  ctx.restore();
}

function hslToHex(h: number, s: number, l: number) {
  s /= 100;
  l /= 100;
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

export function hexToHue(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255,
    g = ((n >> 8) & 255) / 255,
    b = (n & 255) / 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    d = max - min;
  if (d === 0) return 0;
  let hue = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  hue *= 60;
  return (hue + 360) % 360;
}
