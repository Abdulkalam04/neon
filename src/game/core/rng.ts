import type { GameState } from "./types";

/** Seeded PRNG (mulberry32) whose state lives in GameState, so updates stay deterministic. */
export function rand(state: GameState): number {
  let t = (state.seed = (state.seed + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export const randRange = (s: GameState, a: number, b: number) => a + rand(s) * (b - a);
export const randPick = <T>(s: GameState, arr: readonly T[]) =>
  arr[Math.floor(rand(s) * arr.length)]!;
