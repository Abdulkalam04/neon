import { describe, expect, it } from "vitest";
import { DEFAULT_SKIN, segmentColor } from "./drawSnake";

const skin = { ...DEFAULT_SKIN, primary: "#ff0000", secondary: "#0000ff" };

describe("segmentColor", () => {
  it("stripes repeat every 3 segments", () => {
    const s = { ...skin, pattern: "stripes" as const };
    expect([0, 2, 3, 5, 6].map((i) => segmentColor(s, i, 25))).toEqual([
      "#ff0000",
      "#ff0000",
      "#0000ff",
      "#0000ff",
      "#ff0000",
    ]);
  });
  it("checker alternates every segment", () => {
    const s = { ...skin, pattern: "checker" as const };
    expect(segmentColor(s, 0, 25)).toBe("#ff0000");
    expect(segmentColor(s, 1, 25)).toBe("#0000ff");
  });
  it("gradient runs primary at head to secondary at tail", () => {
    const s = { ...skin, pattern: "gradient" as const };
    expect(segmentColor(s, 0, 25)).toBe("rgb(255,0,0)");
    expect(segmentColor(s, 24, 25)).toBe("rgb(0,0,255)");
  });
});
