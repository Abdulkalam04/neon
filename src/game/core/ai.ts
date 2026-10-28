import { CFG, DIFFICULTY, snakeRadius } from "./config";
import { gridQuery, type Grid } from "./grid";
import { rand } from "./rng";
import type { GameState, Snake, Vec } from "./types";

export interface WorldGrids {
  bodies: Grid; // payload: snakeIndex * 4096 + segmentIndex
  orbs: Grid; // payload: orb index
}

/** Updates each bot's targetAngle / boost. Runs every `think` ticks per bot (staggered). */
export function thinkBots(state: GameState, grids: WorldGrids) {
  const diff = DIFFICULTY[state.difficulty];

  state.snakes.forEach((s, idx) => {
    if (!s.alive || !s.ai) return;
    if ((state.tick + s.id) % diff.think !== 0) return;
    const brain = s.ai;
    const h = s.body[0]!;
    const r = snakeRadius(s.length);
    brain.boost = false;

    let goal: Vec | null = null;
    if (Math.hypot(h.x, h.y) > state.worldRadius * 0.82) {
      goal = { x: 0, y: 0 };
    }

    // Cut off the nearest human player: aim ahead of their head.
    if (!goal && rand(state) < diff.aggression) {
      let player: Snake | null = null;
      let minPDist = Infinity;
      for (const other of state.snakes) {
        if (other.isPlayer && other.alive) {
          const d = Math.hypot(other.body[0]!.x - h.x, other.body[0]!.y - h.y);
          if (d < minPDist) {
            minPDist = d;
            player = other;
          }
        }
      }
      if (player && minPDist < diff.huntRange && s.length > player.length * 0.6) {
        const ph = player.body[0]!;
        const lead = snakeRadius(player.length) * 10 + minPDist * 0.3;
        goal = { x: ph.x + Math.cos(player.angle) * lead, y: ph.y + Math.sin(player.angle) * lead };
        brain.boost = diff.boost && minPDist < 380 && s.length > CFG.minBoostLength * 2;
      }
    }

    // Chase a smaller snake.
    if (!goal && rand(state) < diff.aggression * 0.6) {
      let best: Snake | null = null,
        bestD = 500;
      for (const o of state.snakes) {
        if (o === s || !o.alive || o.length > s.length * 0.7) continue;
        const oh = o.body[0]!;
        const d = Math.hypot(oh.x - h.x, oh.y - h.y);
        if (d < bestD) {
          bestD = d;
          best = o;
        }
      }
      if (best) {
        const bh = best.body[0]!;
        const lead = snakeRadius(best.length) * 8;
        goal = { x: bh.x + Math.cos(best.angle) * lead, y: bh.y + Math.sin(best.angle) * lead };
      }
    }

    // Hunt food.
    if (!goal) {
      let bestScore = 0;
      gridQuery(grids.orbs, h.x, h.y, 340, (oi) => {
        const o = state.orbs[oi];
        if (!o) return;
        const dx = o.x - h.x,
          dy = o.y - h.y;
        const d = Math.hypot(dx, dy);
        const facing = (dx * Math.cos(s.angle) + dy * Math.sin(s.angle)) / (d || 1);
        const score = (o.value / (d + 30)) * (1.4 + facing);
        if (score > bestScore) {
          bestScore = score;
          goal = { x: o.x, y: o.y };
        }
      });
    }

    let desired = goal
      ? Math.atan2(goal.y - h.y, goal.x - h.x)
      : s.angle + (rand(state) - 0.5) * 0.8;

    // Avoid walls and bodies.
    const look = r * diff.look;
    const danger = (a: number) => {
      for (const k of [0.35, 0.7, 1]) {
        const px = h.x + Math.cos(a) * look * k,
          py = h.y + Math.sin(a) * look * k;
        if (Math.hypot(px, py) > state.worldRadius - r * 2) return true;
        let hit = false;
        gridQuery(grids.bodies, px, py, r * 2.2, (v) => {
          const si = Math.floor(v / 4096),
            seg = v % 4096;
          if (si === idx && seg < 25) return false;
          const o = state.snakes[si];
          if (!o || !o.alive) return false;
          const p = o.body[seg];
          if (!p) return false;
          const rr = r + snakeRadius(o.length);
          if ((p.x - px) ** 2 + (p.y - py) ** 2 < rr * rr) {
            hit = true;
            return true;
          }
          return false;
        });
        if (hit) return true;
      }
      return false;
    };

    if (danger(desired)) {
      brain.boost = false;
      for (const off of [0.6, -0.6, 1.2, -1.2, 1.8, -1.8, 2.6, -2.6, Math.PI]) {
        if (!danger(desired + off)) {
          desired += off;
          break;
        }
      }
    }
    brain.targetAngle = desired;
  });
}
