import type { GameState, Snake, Vec } from "@/game/core/types";
import type { NetSnapshot } from "./types";

export interface TimedSnapshot {
  snap: NetSnapshot;
  at: number;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
function lerpAngle(a: number, b: number, t: number) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

/** Builds a renderer-compatible GameState between two buffered snapshots at renderTime. */
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
  const span = b.at - a.at;
  const t = span > 0 ? Math.max(0, Math.min(1, (renderTime - a.at) / span)) : 1;
  const prev = new Map(a.snap.snakes.map((s) => [s.id, s]));

  const snakes: Snake[] = b.snap.snakes.map((n) => {
    const p = prev.get(n.id);
    let body: Vec[] = n.body;
    if (p && p.alive && n.alive) {
      body = n.body.map((pt, i) => {
        const q = p.body[Math.min(i, p.body.length - 1)];
        return q ? { x: lerp(q.x, pt.x, t), y: lerp(q.y, pt.y, t) } : pt;
      });
    }
    return {
      ...n,
      body,
      angle: p ? lerpAngle(p.angle, n.angle, t) : n.angle,
      length: p ? lerp(p.length, n.length, t) : n.length,
      isPlayer: n.id === b.snap.youId,
      boostAcc: 0,
      growth: 0,
      ai: null,
    };
  });

  return {
    tick: b.snap.tick,
    seed: 0,
    worldRadius: b.snap.worldRadius,
    difficulty: "normal",
    snakes,
    orbs: b.snap.orbs,
    nextId: 0,
    playerId: b.snap.youId,
    events: [],
    respawnAt: [],
  };
}
