import {
  BACKS,
  HATS,
  PATTERN_LIST,
  WINGS,
  type BackId,
  type HatId,
  type WingId,
  type EyeShape,
  type BoostEffect,
  type SkinPattern,
  type SnakeSkin,
} from "../../src/game/render/drawSnake";

const VALID_PATTERNS: Set<SkinPattern> = new Set(PATTERN_LIST);

const VALID_EYE_SHAPES: Set<EyeShape> = new Set([
  "round",
  "oval",
  "angry",
  "cute",
  "sleepy",
  "cyclops",
  "heart",
]);

const VALID_BOOSTS: Set<BoostEffect> = new Set([
  "flame",
  "electric",
  "bubbles",
  "rainbow",
  "stardust",
]);

const VALID_HATS = new Set<string>(HATS);
const VALID_BACKS = new Set<string>(BACKS);
const VALID_WINGS = new Set<string>(WINGS);

const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;

export function sanitizeName(raw: unknown): string {
  if (typeof raw !== "string") return "Player";
  // Strip control characters (ASCII 0-31 and 127-159)
  let cleaned = "";
  for (let i = 0; i < raw.length; i++) {
    const code = raw.charCodeAt(i);
    if ((code >= 32 && code <= 126) || code >= 160) {
      cleaned += raw[i];
    }
  }
  cleaned = cleaned.trim();
  if (!cleaned) return "Player";
  return cleaned.slice(0, 16);
}

export function validateSkin(raw: unknown): SnakeSkin {
  const fallback: SnakeSkin = {
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

  if (!raw || typeof raw !== "object") return fallback;
  const s = raw as Partial<SnakeSkin>;

  const primary =
    typeof s.primary === "string" && HEX_COLOR_REGEX.test(s.primary) ? s.primary : fallback.primary;

  const secondary =
    typeof s.secondary === "string" && HEX_COLOR_REGEX.test(s.secondary)
      ? s.secondary
      : fallback.secondary;

  const pattern = s.pattern && VALID_PATTERNS.has(s.pattern) ? s.pattern : fallback.pattern;

  const rawEyes = s.eyes && typeof s.eyes === "object" ? s.eyes : fallback.eyes;
  const eyeShape =
    rawEyes.shape && VALID_EYE_SHAPES.has(rawEyes.shape) ? rawEyes.shape : fallback.eyes.shape;
  const eyeColor =
    typeof rawEyes.color === "string" && HEX_COLOR_REGEX.test(rawEyes.color)
      ? rawEyes.color
      : fallback.eyes.color;
  const pupilSize =
    typeof rawEyes.pupilSize === "number" && Number.isFinite(rawEyes.pupilSize)
      ? Math.max(0.1, Math.min(1.0, rawEyes.pupilSize))
      : fallback.eyes.pupilSize;
  const followMouse = Boolean(rawEyes.followMouse);

  const glow =
    typeof s.glow === "number" && Number.isFinite(s.glow)
      ? Math.max(0, Math.min(1.0, s.glow))
      : fallback.glow;

  const outline =
    typeof s.outline === "number" && Number.isFinite(s.outline)
      ? Math.max(0, Math.min(6.0, s.outline))
      : fallback.outline;

  const sparkle = Boolean(s.sparkle);

  const boost = s.boost && VALID_BOOSTS.has(s.boost) ? s.boost : fallback.boost;

  // Cosmetics: only accept known ids, anything else becomes "none".
  const hat = (typeof s.hat === "string" && VALID_HATS.has(s.hat) ? s.hat : "none") as HatId;
  const back = (typeof s.back === "string" && VALID_BACKS.has(s.back) ? s.back : "none") as BackId;
  const wings = (
    typeof s.wings === "string" && VALID_WINGS.has(s.wings) ? s.wings : "none"
  ) as WingId;

  const shading: SnakeSkin["shading"] = s.shading === "bead" ? "bead" : "flat";

  return {
    primary,
    secondary,
    pattern,
    eyes: {
      shape: eyeShape,
      color: eyeColor,
      pupilSize,
      followMouse,
    },
    glow,
    outline,
    sparkle,
    boost,
    hat,
    back,
    wings,
    shading,
  };
}

export function clampAngle(angle: unknown): number | null {
  if (typeof angle !== "number" || !Number.isFinite(angle)) {
    return null;
  }
  const tau = Math.PI * 2;
  return ((angle % tau) + tau) % tau;
}

export function hexToHue(hex: string): number {
  if (!HEX_COLOR_REGEX.test(hex)) return 180;
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;
  let hue = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  hue *= 60;
  return (hue + 360) % 360;
}
