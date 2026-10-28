import type { Difficulty } from "./types";

export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;

export const CFG = {
  worldRadius: 3000, // 6000 x 6000 world
  orbTarget: 1400,
  startLength: 20,
  minBoostLength: 14,
  speed: 190, // px/s
  boostSpeed: 380,
  turnRate: 5, // rad/s
  boostCost: 5, // segments per second
  boostDropEvery: 1.6, // segments spent per dropped orb
  boostOrbValue: 0.9,
  /** Magnetic food: orbs drift toward a head that comes within (reach + magnetRange). */
  magnetRange: 70, // px beyond the normal eat radius
  magnetSpeed: 320, // px/s pull when an orb is right at the edge of eating range
  deathOrbShare: 0.7, // fraction of a dead snake's length that becomes food
  /** Death drops: a visible cluster of big, valuable orbs (see killSnake). */
  deathOrbMin: 8,
  deathOrbMax: 60, // cap so huge snakes do not flood the network/renderer
  deathOrbBaseRadius: 11, // normal food is 3..8 px, so drops are >= ~2x larger
  deathOrbMaxRadius: 26,
  deathOrbLifeTicks: 60 * 75, // uncollected drops fade away after 75 s
  /** Growth is paid out over time so the snake swells smoothly instead of popping. */
  growBase: 4, // segments/s always available while growth is pending
  growEase: 5, // plus this fraction (per second) of the pending amount
  maxSegments: 3000,
  gridCell: 120,
  respawnDelayTicks: 180,
};

export interface DifficultyProfile {
  bots: number;
  turn: number;
  /** Ticks between bot decisions (lower = sharper). */
  think: number;
  aggression: number;
  huntRange: number;
  /** Look-ahead distance in body radii. */
  look: number;
  boost: boolean;
}

export const DIFFICULTY: Record<Difficulty, DifficultyProfile> = {
  easy: { bots: 15, turn: 0.7, think: 18, aggression: 0.05, huntRange: 400, look: 5, boost: false },
  normal: { bots: 20, turn: 0.9, think: 10, aggression: 0.2, huntRange: 650, look: 7, boost: true },
  hard: { bots: 25, turn: 1.05, think: 5, aggression: 0.45, huntRange: 950, look: 9, boost: true },
};

/**
 * Body radius for a given length. Starts at ~11.6 px (same as before for a new
 * snake) and then grows as a power curve, so a long snake is visibly *thicker*
 * and heavier, not just longer: ~24 px at 100, ~48 px at 500, ~84 px at 1500.
 */
export const snakeRadius = (length: number) =>
  Math.min(90, 11.6 + 0.9 * Math.pow(Math.max(length - 20, 0), 0.6));
export const segmentSpacing = (radius: number) => radius * 0.45;
