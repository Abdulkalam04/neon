import { describe, expect, it } from "vitest";
import type { NetSnapshot, NetSnake } from "./types";
import { interpolate, type TimedSnapshot } from "./interpolate";

function createSnapshot(x: number): NetSnapshot {
  const snake: NetSnake = {
    id: 1,
    name: "Player",
    isPlayer: true,
    hue: 120,
    skinIndex: 0,
    alive: true,
    angle: 0,
    body: [{ x, y: 0 }],
    length: 10,
    boosting: false,
    kills: 0,
  };
  return {
    tick: x,
    worldRadius: 1000,
    youId: 1,
    snakes: [snake],
    orbs: [],
    events: [],
  };
}

describe("network snapshot interpolation", () => {
  it("reuses the renderer state and point buffers between frames", () => {
    const buffer: TimedSnapshot[] = [
      { snap: createSnapshot(0), at: 0 },
      { snap: createSnapshot(10), at: 10 },
    ];

    const first = interpolate(buffer, 5)!;
    const point = first.snakes[0]!.body[0]!;
    expect(point.x).toBe(5);

    const second = interpolate(buffer, 8)!;
    expect(second).toBe(first);
    expect(second.snakes[0]!.body[0]).toBe(point);
    expect(point.x).toBe(8);
  });
});
