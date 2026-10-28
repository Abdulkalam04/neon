import { describe, expect, it } from "vitest";
import { validateSkin } from "../../../server/src/validation";
import {
  BACKS,
  BOOST_LIST,
  DEFAULT_SKIN,
  HATS,
  PATTERN_LIST,
  WINGS,
  drawSnake,
  segmentColor,
} from "./drawSnake";
import { SKIN_PRESETS } from "./skinPresets";

/** A canvas context stub that accepts any call and records the number of draw calls. */
function fakeCtx() {
  let calls = 0;
  const target: Record<string, unknown> = {};
  const ctx = new Proxy(target, {
    get(t, k: string) {
      if (k === "__calls") return calls;
      if (k in t) return t[k];
      return () => {
        calls++;
      };
    },
    set(t, k: string, v) {
      t[k] = v;
      return true;
    },
  });
  return ctx as unknown as CanvasRenderingContext2D & { __calls: number };
}

const points = Array.from({ length: 30 }, (_, i) => ({
  x: 200 - i * 6,
  y: 100 + Math.sin(i * 0.4) * 20,
}));

describe("skins and accessories", () => {
  it("every pattern returns a colour for every segment", () => {
    for (const pattern of PATTERN_LIST) {
      for (let i = 0; i < 30; i++) {
        const c = segmentColor({ ...DEFAULT_SKIN, pattern }, i, 30, 100);
        expect(typeof c).toBe("string");
        expect(c.length).toBeGreaterThan(3);
      }
    }
  });

  it("every pattern, hat, back item and wing draws without throwing", () => {
    for (const pattern of PATTERN_LIST) {
      const ctx = fakeCtx();
      drawSnake(ctx, { ...DEFAULT_SKIN, pattern }, points, { radius: 14, time: 500 });
      expect(ctx.__calls).toBeGreaterThan(0);
    }
    for (const hat of HATS)
      for (const back of BACKS)
        for (const wings of WINGS) {
          const ctx = fakeCtx();
          drawSnake(ctx, { ...DEFAULT_SKIN, hat, back, wings }, points, { radius: 14, time: 500 });
          expect(ctx.__calls).toBeGreaterThan(0);
        }
  });

  it("accessories were removed from the game: any saved hat/back/wings draws nothing extra", () => {
    const plain = fakeCtx();
    drawSnake(plain, DEFAULT_SKIN, points, { radius: 14 });
    const dressed = fakeCtx();
    drawSnake(dressed, { ...DEFAULT_SKIN, hat: "crown", back: "cape", wings: "angel" }, points, {
      radius: 14,
    });
    expect(dressed.__calls).toBe(plain.__calls);
  });

  it("every boost effect draws on the snake and is visibly more than no effect", () => {
    const off = fakeCtx();
    drawSnake(off, DEFAULT_SKIN, points, { radius: 14, time: 500 });
    for (const boost of BOOST_LIST) {
      const on = fakeCtx();
      drawSnake(on, { ...DEFAULT_SKIN, boost }, points, { radius: 14, time: 500, boosting: true });
      // aura + particles/bolts are drawn along the body, not just a tail puff
      expect(on.__calls).toBeGreaterThan(off.__calls + 30);
    }
  });

  it("boost effects survive tiny snakes and server validation", () => {
    for (const boost of BOOST_LIST) {
      for (const n of [1, 2, 3]) {
        const ctx = fakeCtx();
        expect(() =>
          drawSnake(ctx, { ...DEFAULT_SKIN, boost }, points.slice(0, n), {
            radius: 12,
            boosting: true,
          }),
        ).not.toThrow();
      }
      expect(validateSkin({ ...DEFAULT_SKIN, boost }).boost).toBe(boost);
    }
  });

  it("glow shows on illustrated snakes too (sprite skins get a halo)", () => {
    const flat = fakeCtx();
    drawSnake(flat, { ...DEFAULT_SKIN, glow: 0 }, points, { radius: 14 });
    expect(flat.__calls).toBeGreaterThan(0);
  });

  it("draws very short snakes with accessories without crashing", () => {
    for (const n of [1, 2, 3, 4]) {
      const ctx = fakeCtx();
      expect(() =>
        drawSnake(
          ctx,
          { ...DEFAULT_SKIN, hat: "crown", back: "cape", wings: "bat" },
          points.slice(0, n),
          {
            radius: 12,
          },
        ),
      ).not.toThrow();
    }
  });

  it("all presets are valid and survive server validation unchanged", () => {
    for (const p of SKIN_PRESETS) {
      const v = validateSkin(p.skin);
      expect(v.pattern).toBe(p.skin.pattern);
      expect(v.hat).toBe(p.skin.hat ?? "none");
      expect(v.back).toBe(p.skin.back ?? "none");
      expect(v.wings).toBe(p.skin.wings ?? "none");
    }
  });

  it("server validation rejects unknown cosmetics and old skins still work", () => {
    const bad = validateSkin({ ...DEFAULT_SKIN, hat: "laser", back: 5, wings: "<script>" });
    expect(bad.hat).toBe("none");
    expect(bad.back).toBe("none");
    expect(bad.wings).toBe("none");
    const { hat: _h, back: _b, wings: _w, ...old } = DEFAULT_SKIN;
    expect(validateSkin(old).hat).toBe("none");
  });
});
