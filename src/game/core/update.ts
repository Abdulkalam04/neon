import { thinkBots, type WorldGrids } from "./ai";
import { CFG, DIFFICULTY, segmentSpacing, snakeRadius } from "./config";
import { createGrid, gridInsert, gridQuery } from "./grid";
import { rand } from "./rng";
import { addOrb, spawnBot, spawnFood } from "./state";
import type { GameState, Inputs, Snake } from "./types";

const TAU = Math.PI * 2;
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
  state.tick++;
  state.events = [];

  for (const s of state.snakes) if (s.alive) moveSnake(state, s, inputs, dt);

  const grids = buildGrids(state);
  attractFood(state, grids, dt);
  eatFood(state, grids);
  for (const s of state.snakes) if (s.alive) applyGrowth(s, dt);
  const dead = findCollisions(state, grids);
  for (const [victim, killer] of dead) killSnake(state, victim, killer);

  thinkBots(state, grids);

  // Remove dead bots, schedule replacements, refill food.
  state.snakes = state.snakes.filter((s) => s.alive || s.isPlayer);
  state.respawnAt = state.respawnAt.filter((t) => {
    if (t > state.tick) return true;
    spawnBot(state);
    return false;
  });
  const humanCount = state.snakes.filter((s) => s.isPlayer && s.alive).length;
  const currentBots = state.snakes.filter((s) => !s.isPlayer).length;
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

function buildGrids(state: GameState): WorldGrids {
  const bodies = createGrid(CFG.gridCell, state.worldRadius);
  const orbs = createGrid(CFG.gridCell, state.worldRadius);
  state.snakes.forEach((s, si) => {
    if (!s.alive) return;
    for (let i = 0; i < s.body.length; i++)
      gridInsert(bodies, s.body[i]!.x, s.body[i]!.y, si * 4096 + i);
  });
  state.orbs.forEach((o, i) => gridInsert(orbs, o.x, o.y, i));
  return { bodies, orbs };
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

function eatFood(state: GameState, grids: WorldGrids) {
  const eaten = new Set<number>();
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
  if (eaten.size) state.orbs = state.orbs.filter((_, i) => !eaten.has(i));
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
  state.orbs = state.orbs.filter(
    (o) =>
      !(o.kind === "death" && o.born !== undefined && state.tick - o.born > CFG.deathOrbLifeTicks),
  );
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
function findCollisions(state: GameState, grids: WorldGrids): [Snake, Snake | null][] {
  // Use a Set to avoid scheduling the same snake for death twice.
  const doomed = new Set<number>();
  const out: [Snake, Snake | null][] = [];

  const push = (victim: Snake, killer: Snake | null) => {
    if (doomed.has(victim.id)) return;
    doomed.add(victim.id);
    out.push([victim, killer]);
  };

  // First pass: boundary kills (no killer).
  state.snakes.forEach((s) => {
    if (!s.alive) return;
    const h = s.body[0]!;
    const hr = snakeRadius(s.length);
    if (Math.hypot(h.x, h.y) > state.worldRadius - hr) push(s, null);
  });

  // Second pass: head-to-head and head-to-body.
  // We only look at pairs once (si < oi) for head-to-head so the rule applies
  // symmetrically regardless of snake order in the array.
  const alive = state.snakes
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => s.alive && !doomed.has(s.id));

  // Resolve head-to-head pairs first; outcomes are committed before head-to-body
  // so an already-doomed snake's body doesn't cause a second kill.
  for (let a = 0; a < alive.length; a++) {
    const { s: sa, i: sia } = alive[a]!;
    const ha = sa.body[0]!;
    const hra = snakeRadius(sa.length);
    for (let b = a + 1; b < alive.length; b++) {
      const { s: sb, i: sib } = alive[b]!;
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
          push(sa, null);
          push(sb, null);
        } else if (lenA > lenB) {
          // A wins.
          push(sb, sa);
        } else {
          // B wins.
          push(sa, sb);
        }
      }
    }
  }

  // Head-to-body pass (skip snakes already doomed).
  state.snakes.forEach((s, si) => {
    if (!s.alive || doomed.has(s.id)) return;
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
    if (killer) push(s, killer);
  });

  return out;
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
