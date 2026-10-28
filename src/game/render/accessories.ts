import type { Point } from "./drawSnake";

export const HATS = [
  "none",
  "crown",
  "tophat",
  "party",
  "cowboy",
  "santa",
  "halo",
  "horns",
  "bunny",
] as const;
export const BACKS = ["none", "cape", "shield", "sword", "flag"] as const;
export const WINGS = ["none", "angel", "bat", "butterfly", "flame"] as const;

export type HatId = (typeof HATS)[number];
export type BackId = (typeof BACKS)[number];
export type WingId = (typeof WINGS)[number];

export function headingAt(points: Point[], i: number): number {
  const a = points[Math.max(0, i - 1)]!;
  const b = points[Math.min(points.length - 1, i + 1)]!;
  if (a.x === b.x && a.y === b.y) return 0;
  return Math.atan2(a.y - b.y, a.x - b.x);
}
