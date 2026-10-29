import type { GameState, Snake, Vec } from "@/game/core/types";
import type { NetSnapshot, NetSnake } from "./types";

export interface TimedSnapshot {
  snap: NetSnapshot;
  at: number;
}

interface InterpolationScratch {
  state: GameState;
  snakes: Snake[];
}

const scratchByBuffer = new WeakMap<TimedSnapshot[], InterpolationScratch>();
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
function lerpAngle(a: number, b: number, t: number) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function createInterpolatedSnake(source: NetSnake): Snake {
  return {
    id: source.id,
    name: source.name,
    isPlayer: source.isPlayer,
    hue: source.hue,
    skinIndex: source.skinIndex,
    alive: source.alive,
    angle: source.angle,
    body: [],
    length: source.length,
    growth: 0,
    boosting: source.boosting,
    boostAcc: 0,
    kills: source.kills,
    ai: null,
  };
}

function createScratch(): InterpolationScratch {
  const snakes: Snake[] = [];
  return {
    snakes,
    state: {
      tick: 0,
      seed: 0,
      worldRadius: 0,
      difficulty: "normal",
      snakes,
      orbs: [],
      playerId: 0,
      events: [],
      respawnAt: [],
      nextId: 0,
    },
  };
}

/** Reuses its renderer state and point buffers for each supplied snapshot buffer. */
export function interpolate(buffer: TimedSnapshot[], renderTime: number): GameState | null {
  if (buffer.length === 0) return null;
  let a = buffer[0]!;
  let b = buffer[buffer.length - 1]!;
  for (let i = 0; i < buffer.length - 1; i++) {
    if (buffer[i]!.at <= renderTime && buffer[i + 1]!.at >= renderTime) {
      a = buffer[i]!;
      b = buffer[i + 1]!;
      break;
    }
  }
  let scratch = scratchByBuffer.get(buffer);
  if (!scratch) {
    scratch = createScratch();
    scratchByBuffer.set(buffer, scratch);
  }

  const span = b.at - a.at;
  const t = span > 0 ? Math.max(0, Math.min(1, (renderTime - a.at) / span)) : 1;
  const previous = a.snap.snakes;
  const current = b.snap.snakes;
  const snakes = scratch.snakes;

  for (let i = 0; i < current.length; i++) {
    const source = current[i]!;
    let target = snakes[i];
    if (!target) {
      target = createInterpolatedSnake(source);
      snakes[i] = target;
    }
    let prior: NetSnake | undefined;
    for (let j = 0; j < previous.length; j++) {
      if (previous[j]!.id === source.id) {
        prior = previous[j]!;
        break;
      }
    }

    target.id = source.id;
    target.name = source.name;
    target.isPlayer = source.id === b.snap.youId;
    target.hue = source.hue;
    target.skinIndex = source.skinIndex;
    target.alive = source.alive;
    target.angle = prior ? lerpAngle(prior.angle, source.angle, t) : source.angle;
    target.length = prior ? lerp(prior.length, source.length, t) : source.length;
    target.growth = 0;
    target.boosting = source.boosting;
    target.boostAcc = 0;
    target.kills = source.kills;
    target.ai = null;

    const body = target.body;
    const sourceBody = source.body;
    const priorBody = prior?.alive && source.alive ? prior.body : null;
    for (let j = 0; j < sourceBody.length; j++) {
      const point = body[j] ?? (body[j] = { x: 0, y: 0 });
      const sourcePoint = sourceBody[j]!;
      const priorPoint = priorBody?.[Math.min(j, priorBody.length - 1)];
      point.x = priorPoint ? lerp(priorPoint.x, sourcePoint.x, t) : sourcePoint.x;
      point.y = priorPoint ? lerp(priorPoint.y, sourcePoint.y, t) : sourcePoint.y;
    }
    body.length = sourceBody.length;
  }
  snakes.length = current.length;

  const state = scratch.state;
  state.tick = b.snap.tick;
  state.worldRadius = b.snap.worldRadius;
  state.snakes = snakes;
  state.orbs = b.snap.orbs;
  state.playerId = b.snap.youId;
  state.events = b.snap.events;
  return state;
}
