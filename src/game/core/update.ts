import { thinkBots, type WorldGrids } from "./ai";
import { CFG, DIFFICULTY, segmentSpacing, snakeRadius } from "./config";
import { clearGrid, createGrid, gridInsert, gridQuery } from "./grid";
import { rand } from "./rng";
import { addOrb, spawnBot, spawnFood } from "./state";
import type { GameState, Inputs, Snake } from "./types";

const TAU = Math.PI * 2;
interface UpdateScratch {
  grids: WorldGrids;
  eatenOrbs: Set<number>;
  doomedSnakes: Set<number>;
  deadSnakes: [Snake, Snake | null][];
  aliveSnakes: Snake[];
  aliveSnakeIndices: number[];
}

const updateScratchByState = new WeakMap<GameState, UpdateScratch>();

function getUpdateScratch(state: GameState): UpdateScratch {
  let scratch = updateScratchByState.get(state);
  if (!scratch) {
    scratch = {
      grids: {
        bodies: createGrid(CFG.gridCell, state.worldRadius),
        orbs: createGrid(CFG.gridCell, state.worldRadius),
      },
      eatenOrbs: new Set(),
      doomedSnakes: new Set(),
      deadSnakes: [],
      aliveSnakes: [],
      aliveSnakeIndices: [],
    };
    updateScratchByState.set(state, scratch);
  }
  return scratch;
}

const angDiff = (a: number, b: number) => {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
};

/**
 * Advances the simulation by dt seconds and returns the state.
 * For performance the state object is updated in place; callers should treat
 * the returned value as the new state. No React, DOM or canvas access here.
 */
export function update(state: GameState, inputs: Inputs, dt: number): GameState {
  const scratch = getUpdateScratch(state);
  state.tick++;
  state.events.length = 0;

  for (const s of state.snakes) if (s.alive) moveSnake(state, s, inputs, dt);

  const grids = buildGrids(state, scratch.grids);
  attractFood(state, grids, dt);
  eatFood(state, grids, scratch.eatenOrbs);
  for (const s of state.snakes) if (s.alive) applyGrowth(s, dt);
  const dead = findCollisions(state, grids, scratch);
  for (const [victim, killer] of dead) killSnake(state, victim, killer);

  thinkBots(state, grids);

  // Remove dead bots, schedule replacements, refill food.
  let writeSnake = 0;
  let humanCount = 0;
  let currentBots = 0;
  for (let i = 0; i < state.snakes.length; i++) {
    const snake = state.snakes[i]!;
    if (!snake.alive && !snake.isPlayer) continue;
    state.snakes[writeSnake++] = snake;
    if (snake.isPlayer && snake.alive) humanCount++;
    else if (!snake.isPlayer) currentBots++;
  }
  state.snakes.length = writeSnake;

  let writeRespawn = 0;
  for (let i = 0; i < state.respawnAt.length; i++) {
    const tick = state.respawnAt[i]!;
    if (tick > state.tick) state.respawnAt[writeRespawn++] = tick;
    else spawnBot(state);
  }
  state.respawnAt.length = writeRespawn;
  const targetBots =
    state.minTotalSnakes !== undefined
      ? Math.max(0, state.minTotalSnakes - humanCount)
      : DIFFICULTY[state.difficulty].bots;
  const missingBots = Math.max(0, targetBots - currentBots - state.respawnAt.length);
  for (let i = 0; i < missingBots; i++) state.respawnAt.push(state.tick + CFG.respawnDelayTicks);
  // Death drops do not count towards the ambient food target, otherwise a big
  // kill would starve the arena of ordinary food until the drops are eaten.
  expireDeathOrbs(state);
  let ambient = 0;
  for (const o of state.orbs) if (o.kind !== "death") ambient++;
  for (let i = 0; i < 6 && ambient < CFG.orbTarget; i++, ambient++) spawnFood(state);

  return state;
}

function moveSnake(state: GameState, s: Snake, inputs: Inputs, dt: number) {
  let target: number | null;
  let wantBoost: boolean;
  if (s.isPlayer) {
    const inp = inputs[s.id];
    target = inp?.angle ?? null;
    wantBoost = !!inp?.boost;
  } else {
    target = s.ai!.targetAngle;
    wantBoost = s.ai!.boost;
  }
  const diff = DIFFICULTY[state.difficulty];
  const base = s.isPlayer ? CFG.turnRate : CFG.turnRate * diff.turn;
  const turn = base / (1 + Math.max(0, s.length - CFG.startLength) / 700);
  if (target !== null) {
    const d = angDiff(target, s.angle);
    const m = turn * dt;
    s.angle += Math.max(-m, Math.min(m, d));
  }

  s.boosting = wantBoost && s.length > CFG.minBoostLength;
  if (s.boosting) {
    const cost = CFG.boostCost * dt;
    s.length = Math.max(CFG.minBoostLength, s.length - cost);
    s.boostAcc += cost;
    if (s.boostAcc >= CFG.boostDropEvery) {
      s.boostAcc -= CFG.boostDropEvery;
      const t = s.body[s.body.length - 1]!;
      addOrb(
        state,
        t.x + (rand(state) - 0.5) * 10,
        t.y + (rand(state) - 0.5) * 10,
        CFG.boostOrbValue * 0.6,
        s.hue,
      );
    }
  }

  const speed = s.boosting ? CFG.boostSpeed : CFG.speed;
  const head = s.body[0]!;
  head.x += Math.cos(s.angle) * speed * dt;
  head.y += Math.sin(s.angle) * speed * dt;

  // Chain constraint: each segment follows the previous one at fixed spacing.
  const sp = segmentSpacing(snakeRadius(s.length));
  for (let i = 1; i < s.body.length; i++) {
    const prev = s.body[i - 1]!,
      cur = s.body[i]!;
    const dx = prev.x - cur.x,
      dy = prev.y - cur.y;
    const d = Math.hypot(dx, dy);
    if (d > sp) {
      const k = (d - sp) / d;
      cur.x += dx * k;
      cur.y += dy * k;
    }
  }

  const n = Math.min(CFG.maxSegments, Math.max(2, Math.floor(s.length)));
  while (s.body.length < n) {
    const t = s.body[s.body.length - 1]!;
    s.body.push({ x: t.x, y: t.y });
  }
  if (s.body.length > n) s.body.length = n;
}

function buildGrids(state: GameState, grids: WorldGrids): WorldGrids {
  clearGrid(grids.bodies);
  clearGrid(grids.orbs);
  for (let si = 0; si < state.snakes.length; si++) {
    const snake = state.snakes[si]!;
    if (!snake.alive) continue;
    for (let i = 0; i < snake.body.length; i++)
      gridInsert(grids.bodies, snake.body[i]!.x, snake.body[i]!.y, si * 4096 + i);
  }
  for (let i = 0; i < state.orbs.length; i++) {
    const orb = state.orbs[i]!;
    gridInsert(grids.orbs, orb.x, orb.y, i);
  }
  return grids;
}

/**
 * Magnetic food: orbs near a snake's head drift toward it so collecting feels
 * smooth. The pull grows as the orb gets closer (quadratic falloff), never
 * overshoots the head, and is scaled by dt so it is frame-rate independent.
 * Boosting snakes do not attract, otherwise they would instantly re-eat the
 * orbs their boost just dropped.
 */
function attractFood(state: GameState, grids: WorldGrids, dt: number) {
  for (const s of state.snakes) {
    if (!s.alive || s.boosting) continue;
    const h = s.body[0]!;
    const reach = snakeRadius(s.length) + 10;
    const range = reach + CFG.magnetRange;
    gridQuery(grids.orbs, h.x, h.y, range, (oi) => {
      const o = state.orbs[oi]!;
      const dx = h.x - o.x,
        dy = h.y - o.y;
      const d = Math.hypot(dx, dy);
      if (d >= range || d < 1e-6) return;
      const k = 1 - d / range;
      const step = Math.min(d, CFG.magnetSpeed * k * k * dt);
      o.x += (dx / d) * step;
      o.y += (dy / d) * step;
    });
  }
}

function eatFood(state: GameState, grids: WorldGrids, eaten: Set<number>) {
  eaten.clear();
  for (const s of state.snakes) {
    if (!s.alive) continue;
    const h = s.body[0]!;
    const reach = snakeRadius(s.length) + 10;
    gridQuery(grids.orbs, h.x, h.y, reach + 10, (oi) => {
      if (eaten.has(oi)) return;
      const o = state.orbs[oi]!;
      const rr = reach + o.r;
      if ((o.x - h.x) ** 2 + (o.y - h.y) ** 2 < rr * rr) {
        eaten.add(oi);
        // Queue the food; applyGrowth() pays it out over the next few ticks so
        // both length and thickness swell smoothly instead of popping.
        s.growth += o.value;
        if (s.isPlayer)
          state.events.push({ type: "eat", snakeId: s.id, x: o.x, y: o.y, value: o.value });
      }
    });
  }
  if (eaten.size) {
    let write = 0;
    for (let i = 0; i < state.orbs.length; i++) {
      if (eaten.has(i)) continue;
      state.orbs[write++] = state.orbs[i]!;
    }
    state.orbs.length = write;
  }
}

/**
 * Moves pending food into `length` at a rate that scales with how much is
 * pending: small bites are near-instant, a huge death-drop feast is spread over
 * a fraction of a second. Because radius is a function of length this also
 * animates the thickness smoothly. Deterministic (depends only on dt).
 */
function applyGrowth(s: Snake, dt: number) {
  if (s.growth <= 0) return;
  const room = CFG.maxSegments - s.length;
  if (room <= 0) {
    s.growth = 0;
    return;
  }
  const step = Math.min(s.growth, room, (CFG.growBase + s.growth * CFG.growEase) * dt);
  s.length += step;
  s.growth -= step;
}

function expireDeathOrbs(state: GameState) {
  if (state.tick % 30 !== 0) return;
  let any = false;
  for (const o of state.orbs) {
    if (o.kind === "death" && o.born !== undefined && state.tick - o.born > CFG.deathOrbLifeTicks) {
      any = true;
      break;
    }
  }
  if (!any) return;
  let write = 0;
  for (let i = 0; i < state.orbs.length; i++) {
    const orb = state.orbs[i]!;
    if (
      orb.kind === "death" &&
      orb.born !== undefined &&
      state.tick - orb.born > CFG.deathOrbLifeTicks
    ) {
      continue;
    }
    state.orbs[write++] = orb;
  }
  state.orbs.length = write;
}

/**
 * Returns [victim, killer|null] pairs.
 *
 * Head-to-head rule:
 *   - Larger snake (by length) survives; smaller dies with the larger as killer.
 *   - If lengths are within 1 segment of each other both die (no killer).
 *   - A head hitting a body segment still kills the snake whose head hit.
 *   - Each death is processed once; already-doomed snakes skip further checks.
 */
function findCollisions(
  state: GameState,
  grids: WorldGrids,
  scratch: UpdateScratch,
): [Snake, Snake | null][] {
  const doomed = scratch.doomedSnakes;
  const out = scratch.deadSnakes;
  const alive = scratch.aliveSnakes;
  const aliveIndices = scratch.aliveSnakeIndices;
  doomed.clear();
  out.length = 0;
  alive.length = 0;
  aliveIndices.length = 0;

  // First pass: boundary kills (no killer).
  for (const s of state.snakes) {
    if (!s.alive) continue;
    const h = s.body[0]!;
    const hr = snakeRadius(s.length);
    if (Math.hypot(h.x, h.y) > state.worldRadius - hr) scheduleCollision(scratch, s, null);
  }

  // Second pass: head-to-head and head-to-body.
  // We only look at pairs once (si < oi) for head-to-head so the rule applies
  // symmetrically regardless of snake order in the array.
  for (let i = 0; i < state.snakes.length; i++) {
    const snake = state.snakes[i]!;
    if (!snake.alive || doomed.has(snake.id)) continue;
    alive.push(snake);
    aliveIndices.push(i);
  }

  // Resolve head-to-head pairs first; outcomes are committed before head-to-body
  // so an already-doomed snake's body doesn't cause a second kill.
  for (let a = 0; a < alive.length; a++) {
    const sa = alive[a]!;
    const sia = aliveIndices[a]!;
    const ha = sa.body[0]!;
    const hra = snakeRadius(sa.length);
    for (let b = a + 1; b < alive.length; b++) {
      const sb = alive[b]!;
      const sib = aliveIndices[b]!;
      if (sib === sia) continue; // shouldn't happen but guard anyway
      const hb = sb.body[0]!;
      const hrb = snakeRadius(sb.length);
      // Check whether the two heads overlap (use index 0 for both heads).
      const rr = hra * 0.8 + hrb * 0.8;
      if ((hb.x - ha.x) ** 2 + (hb.y - ha.y) ** 2 < rr * rr) {
        const lenA = sa.length,
          lenB = sb.length;
        if (Math.abs(lenA - lenB) <= 1) {
          // Equal — both die.
          scheduleCollision(scratch, sa, null);
          scheduleCollision(scratch, sb, null);
        } else if (lenA > lenB) {
          // A wins.
          scheduleCollision(scratch, sb, sa);
        } else {
          // B wins.
          scheduleCollision(scratch, sa, sb);
        }
      }
    }
  }

  // Head-to-body pass (skip snakes already doomed).
  for (let si = 0; si < state.snakes.length; si++) {
    const s = state.snakes[si]!;
    if (!s.alive || doomed.has(s.id)) continue;
    const h = s.body[0]!;
    const hr = snakeRadius(s.length);
    let killer: Snake | null = null;
    gridQuery(grids.bodies, h.x, h.y, hr + 40, (v) => {
      const oi = Math.floor(v / 4096);
      if (oi === si) return false;
      const o = state.snakes[oi]!;
      const segIdx = v % 4096;
      // Skip the opponent's head segment — handled above in head-to-head pass.
      if (segIdx === 0) return false;
      if (!o.alive || doomed.has(o.id)) return false;
      const p = o.body[segIdx]!;
      const rr = hr * 0.8 + snakeRadius(o.length) * 0.8;
      if ((p.x - h.x) ** 2 + (p.y - h.y) ** 2 < rr * rr) {
        killer = o;
        return true;
      }
      return false;
    });
    if (killer) scheduleCollision(scratch, s, killer);
  }

  return out;
}

function scheduleCollision(scratch: UpdateScratch, victim: Snake, killer: Snake | null) {
  if (scratch.doomedSnakes.has(victim.id)) return;
  scratch.doomedSnakes.add(victim.id);
  scratch.deadSnakes.push([victim, killer]);
}

function killSnake(state: GameState, s: Snake, killer: Snake | null) {
  if (!s.alive) return;
  s.alive = false;
  s.boosting = false;

  // Death drop: the snake's accumulated mass (length plus anything it had eaten
  // but not yet digested) becomes a cluster of BIG orbs laid along its body.
  // Fewer, larger orbs than before => easy to spot from a distance; the count is
  // capped so very long snakes concentrate value into the orbs instead of
  // flooding the renderer/network with thousands of entities.
  const mass = (s.length + s.growth) * CFG.deathOrbShare;
  const count = Math.max(CFG.deathOrbMin, Math.min(CFG.deathOrbMax, Math.round(s.body.length / 3)));
  const value = mass / count;
  const bodyR = snakeRadius(s.length);
  const orbR = Math.min(CFG.deathOrbMaxRadius, CFG.deathOrbBaseRadius + Math.sqrt(value) * 4);
  const last = s.body.length - 1;
  for (let i = 0; i < count; i++) {
    const p = s.body[count === 1 ? 0 : Math.round((i * last) / (count - 1))]!;
    addOrb(
      state,
      p.x + (rand(state) - 0.5) * bodyR * 1.8,
      p.y + (rand(state) - 0.5) * bodyR * 1.8,
      value,
      (s.hue + (rand(state) - 0.5) * 40 + 360) % 360,
      orbR * (0.85 + rand(state) * 0.3),
      "death",
    );
  }
  s.growth = 0;
  if (killer) {
    killer.kills++;
    state.events.push({ type: "kill", snakeId: killer.id, victimId: s.id });
  }
  state.events.push({
    type: "death",
    snakeId: s.id,
    killerId: killer?.id ?? null,
    killerName: killer?.name ?? null,
    isPlayer: s.isPlayer,
  });
}
