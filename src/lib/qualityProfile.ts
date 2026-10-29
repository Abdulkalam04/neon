export type AutoTier = 0 | 1 | 2 | 3;
export type QualityChoice = "auto" | "high" | "medium" | "low";

export interface QualityProfile {
  resolutionScale: number;
  maxParticles: number;
  glow: boolean;
  shadows: boolean;
  nebula: boolean;
  parallax: boolean;
  ambientDust: boolean;
  speedLines: boolean;
  trailLength: number;
  snakeScales: boolean;
  snakeShine: boolean;
  eyeDetail: boolean;
  shake: boolean;
  vignette: boolean;
  foodTwinkle: boolean;
  minimapIntervalMs: number;
  nameTagDetail: boolean;
}

const profiles: QualityProfile[] = [
  {
    resolutionScale: 0.42,
    maxParticles: 8,
    glow: false,
    shadows: false,
    nebula: false,
    parallax: false,
    ambientDust: false,
    speedLines: false,
    trailLength: 0.25,
    snakeScales: false,
    snakeShine: false,
    eyeDetail: false,
    shake: false,
    vignette: false,
    foodTwinkle: false,
    minimapIntervalMs: 320,
    nameTagDetail: false,
  },
  {
    resolutionScale: 0.54,
    maxParticles: 20,
    glow: false,
    shadows: false,
    nebula: false,
    parallax: false,
    ambientDust: true,
    speedLines: false,
    trailLength: 0.4,
    snakeScales: false,
    snakeShine: false,
    eyeDetail: false,
    shake: false,
    vignette: false,
    foodTwinkle: false,
    minimapIntervalMs: 240,
    nameTagDetail: false,
  },
  {
    resolutionScale: 0.86,
    maxParticles: 80,
    glow: true,
    shadows: false,
    nebula: true,
    parallax: false,
    ambientDust: true,
    speedLines: false,
    trailLength: 0.8,
    snakeScales: true,
    snakeShine: true,
    eyeDetail: true,
    shake: true,
    vignette: false,
    foodTwinkle: true,
    minimapIntervalMs: 100,
    nameTagDetail: true,
  },
  {
    resolutionScale: 1,
    maxParticles: 160,
    glow: true,
    shadows: true,
    nebula: true,
    parallax: true,
    ambientDust: true,
    speedLines: true,
    trailLength: 1,
    snakeScales: true,
    snakeShine: true,
    eyeDetail: true,
    shake: true,
    vignette: true,
    foodTwinkle: true,
    minimapIntervalMs: 50,
    nameTagDetail: true,
  },
];

export const QUALITY_PRESETS: Record<Exclude<QualityChoice, "auto">, QualityProfile> = {
  low: profiles[0]!,
  medium: profiles[2]!,
  high: profiles[3]!,
};

export interface DeviceSignals {
  memoryGb?: number;
  hardwareConcurrency?: number;
  devicePixelRatio?: number;
  screenWidth?: number;
  screenHeight?: number;
  benchmarkScore?: number;
  renderer?: string;
}

export interface DeviceProfile extends DeviceSignals {
  tier: AutoTier;
  benchmarkScore: number;
}

export function mapDeviceToTier(signals: DeviceSignals): AutoTier {
  let score = 2;
  const memory = signals.memoryGb;
  if (typeof memory === "number") {
    score = memory <= 2 ? 0 : memory <= 3 ? 1 : memory <= 4 ? 2 : 3;
  }

  const cores = signals.hardwareConcurrency;
  if (typeof cores === "number") {
    if (cores <= 4) score = Math.max(0, score - 1);
    else if (cores >= 8) score = Math.min(3, score + 1);
  }
  const pixels = (signals.screenWidth ?? 0) * (signals.screenHeight ?? 0);
  if (pixels > 3_000_000) score = Math.max(0, score - 1);
  if (signals.devicePixelRatio && signals.devicePixelRatio > 2.5) score = Math.max(0, score - 1);

  const renderer = signals.renderer?.toLowerCase() ?? "";
  if (/swiftshader|llvmpipe|software|basic render/.test(renderer)) score = Math.max(0, score - 2);
  else if (/apple|adreno 7|mali-g7|immortalis|mali-g78|mali-g77/.test(renderer)) {
    score = Math.min(3, score + 1);
  }

  const benchmark = signals.benchmarkScore;
  if (typeof benchmark === "number") {
    if (benchmark < 25_000) score = Math.max(0, score - 2);
    else if (benchmark < 60_000) score = Math.max(0, score - 1);
    else if (benchmark >= 180_000) score = Math.min(3, score + 1);
  }
  return Math.max(0, Math.min(3, score)) as AutoTier;
}

export function profileFor(choice: QualityChoice, tier: AutoTier, step = 0): QualityProfile {
  const base = choice === "auto" ? profiles[tier]! : QUALITY_PRESETS[choice];
  const profile = { ...base };
  for (let i = 0; i < Math.max(0, step); i++) {
    switch (i % 6) {
      case 0:
        profile.resolutionScale = Math.max(0.32, profile.resolutionScale - 0.12);
        break;
      case 1:
        profile.maxParticles = Math.max(8, Math.floor(profile.maxParticles * 0.65));
        break;
      case 2:
        profile.glow = false;
        profile.shadows = false;
        break;
      case 3:
        profile.nebula = false;
        profile.parallax = false;
        profile.ambientDust = false;
        profile.speedLines = false;
        break;
      case 4:
        profile.trailLength = Math.max(0.35, profile.trailLength - 0.15);
        break;
      case 5:
        profile.snakeScales = false;
        profile.snakeShine = false;
        profile.eyeDetail = false;
        profile.nameTagDetail = false;
        profile.vignette = false;
        profile.foodTwinkle = false;
        profile.shake = false;
        profile.minimapIntervalMs = Math.max(200, profile.minimapIntervalMs);
        break;
    }
  }
  return profile;
}

export function autoTuneStep(
  currentStep: number,
  direction: "down" | "up",
  cooldownReady: boolean,
): number {
  if (!cooldownReady) return currentStep;
  return direction === "down" ? Math.min(6, currentStep + 1) : Math.max(0, currentStep - 1);
}
