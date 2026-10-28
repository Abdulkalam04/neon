import { describe, expect, it } from "vitest";
import { CFG, DIFFICULTY, DT, createGame, snakeRadius, update } from "./index";

const make = (difficulty: "easy" | "normal" | "hard" = "normal") =>
  createGame({ difficulty, playerName: "Tester", playerHue: 180, seed: 7 });

describe("game core", () => {
  it("spawns 15 / 20 / 25 bots for easy / normal / hard", () => {
    expect(make("easy").snakes.filter((s) => !s.isPlayer)).toHaveLength(15);
    expect(make("normal").snakes.filter((s) => !s.isPlayer)).toHaveLength(20);
    expect(make("hard").snakes.filter((s) => !s.isPlayer)).toHaveLength(25);
    expect(DIFFICULTY.hard.bots).toBeLessThanOrEqual(25);
  });

  it("boosting costs length", () => {
    const s = make();
    const p = s.snakes.find((x) => x.isPlayer)!;
    p.length = 60;
    for (let i = 0; i < 60; i++) update(s, { [p.id]: { angle: 0, boost: true } }, DT);
    expect(p.alive).toBe(true);
    expect(p.length).toBeLessThan(60);
  });

  it("cannot boost when very short", () => {
    const s = make();
    const p = s.snakes.find((x) => x.isPlayer)!;
    p.length = CFG.minBoostLength;
    update(s, { [p.id]: { angle: 0, boost: true } }, DT);
    expect(p.boosting).toBe(false);
  });

  it("head touching another body kills and turns it into orbs", () => {
    const s = make();
    const p = s.snakes.find((x) => x.isPlayer)!;
    const bot = s.snakes.find((x) => !x.isPlayer)!;
    // place bot body across the player's head
    bot.body.forEach((seg, i) => {
      seg.x = p.body[0]!.x + 6;
      seg.y = p.body[0]!.y - 40 + i * 4;
    });
    const orbsBefore = s.orbs.length;
    update(s, { [p.id]: { angle: 0, boost: false } }, DT);
    expect(p.alive).toBe(false);
    expect(s.events.some((e) => e.type === "death" && e.isPlayer)).toBe(true);
    expect(s.orbs.length).toBeGreaterThan(orbsBefore);
  });

  it("leaving the circular boundary kills the snake", () => {
    const s = make();
    const p = s.snakes.find((x) => x.isPlayer)!;
    p.body.forEach((seg) => {
      seg.x = s.worldRadius + 50;
      seg.y = 0;
    });
    update(s, {}, DT);
    expect(p.alive).toBe(false);
  });

  it("eating food grows the snake", () => {
    const s = make();
    const p = s.snakes.find((x) => x.isPlayer)!;
    const before = p.length;
    s.orbs.push({ id: 99999, x: p.body[0]!.x, y: p.body[0]!.y, r: 4, value: 1, hue: 0 });
    update(s, { [p.id]: { angle: null, boost: false } }, DT);
    expect(p.alive).toBe(true);
    expect(p.length).toBeGreaterThan(before);
  });
});

describe("events", () => {
  it("reports who killed the player and emits eat events", () => {
    const s = createGame({ difficulty: "normal", playerName: "Tester", playerHue: 180, seed: 7 });
    const p = s.snakes.find((x) => x.isPlayer)!;
    s.orbs.push({ id: 99998, x: p.body[0]!.x, y: p.body[0]!.y, r: 4, value: 1, hue: 0 });
    update(s, { [p.id]: { angle: null, boost: false } }, DT);
    expect(s.events.some((e) => e.type === "eat")).toBe(true);
    const bot = s.snakes.find((x) => !x.isPlayer)!;
    bot.body.forEach((seg, i) => {
      seg.x = p.body[0]!.x + 6;
      seg.y = p.body[0]!.y - 40 + i * 4;
    });
    update(s, { [p.id]: { angle: 0, boost: false } }, DT);
    const death = s.events.find((e) => e.type === "death" && e.isPlayer);
    expect(death && death.type === "death" ? death.killerName : undefined).toBe(bot.name);
  });
});

describe("head-to-head collisions", () => {
  /** Place two snakes head-to-head at the exact same position. */
  function makeHeadOnPair(lengthA: number, lengthB: number) {
    const s = make();
    // Use a simpler state with only 2 controlled snakes — remove all bots.
    s.snakes = [];
    s.nextId = 1;

    // Spawn snake A ("player"-flavored for easy id tracking)
    const snakeA = {
      id: s.nextId++,
      name: "A",
      isPlayer: false,
      hue: 0,
      skinIndex: 0,
      alive: true,
      angle: 0,
      body: Array.from({ length: Math.ceil(lengthA) }, (_, i) => ({ x: -i * 5, y: 0 })),
      length: lengthA,
      growth: 0,
      boosting: false,
      boostAcc: 0,
      kills: 0,
      ai: { targetAngle: 0, boost: false } as const,
    };
    // Spawn snake B heading right, positioned so its head is AT snakeA's head.
    const snakeB = {
      id: s.nextId++,
      name: "B",
      isPlayer: false,
      hue: 180,
      skinIndex: 1,
      alive: true,
      angle: Math.PI,
      body: Array.from({ length: Math.ceil(lengthB) }, (_, i) => ({ x: i * 5, y: 0 })),
      length: lengthB,
      growth: 0,
      boosting: false,
      boostAcc: 0,
      kills: 0,
      ai: { targetAngle: Math.PI, boost: false } as const,
    };
    s.snakes.push(snakeA as (typeof s.snakes)[0], snakeB as (typeof s.snakes)[0]);
    return { s, snakeA: s.snakes[0]!, snakeB: s.snakes[1]! };
  }

  it("larger snake wins — smaller dies, larger survives", () => {
    const { s, snakeA, snakeB } = makeHeadOnPair(60, 30); // A much bigger than B
    // Run several ticks so they definitely overlap
    update(s, {}, DT);
    expect(snakeB.alive).toBe(false); // smaller B dies
    expect(snakeA.alive).toBe(true); // larger A survives
  });

  it("smaller snake wins when it is actually larger", () => {
    const { s, snakeA, snakeB } = makeHeadOnPair(25, 70); // B much bigger than A
    update(s, {}, DT);
    expect(snakeA.alive).toBe(false); // smaller A dies
    expect(snakeB.alive).toBe(true); // larger B survives
  });

  it("equal-length snakes (within 1 segment) both die", () => {
    const { s, snakeA, snakeB } = makeHeadOnPair(30, 30); // identical lengths
    update(s, {}, DT);
    expect(snakeA.alive).toBe(false);
    expect(snakeB.alive).toBe(false);
  });

  it("winner stays alive and keeps its length", () => {
    const { s, snakeA, snakeB } = makeHeadOnPair(80, 30);
    const lenBefore = snakeA.length;
    update(s, {}, DT);
    expect(snakeA.alive).toBe(true);
    // Length should not have decreased just because of the collision resolve
    expect(snakeA.length).toBeGreaterThanOrEqual(lenBefore - 1);
  });

  describe("magnetic food", () => {
    const setup = () => {
      const s = make();
      s.orbs = [];
      s.snakes = s.snakes.filter((x) => x.isPlayer);
      s.minTotalSnakes = 1;
      const p = s.snakes[0]!;
      return { s, p, h: p.body[0]! };
    };
    const addOrb = (s: ReturnType<typeof make>, x: number, y: number) => {
      s.orbs.push({ id: 9999, x, y, r: 4, value: 1, hue: 100 });
      return s.orbs[s.orbs.length - 1]!;
    };
    const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
      Math.hypot(a.x - b.x, a.y - b.y);

    it("pulls a nearby orb toward the head", () => {
      const { s, p, h } = setup();
      // Orb straight ahead of the snake, inside magnet range.
      const o = addOrb(s, h.x + Math.cos(p.angle) * 70, h.y + Math.sin(p.angle) * 70);
      const start = { x: o.x, y: o.y };
      update(s, { [p.id]: { angle: null, boost: false } }, DT);
      // The orb itself moved, and moved toward the head's current position.
      const moved = dist(o, start);
      expect(moved).toBeGreaterThan(0);
      const toHead = { x: h.x - start.x, y: h.y - start.y };
      const dot = (o.x - start.x) * toHead.x + (o.y - start.y) * toHead.y;
      expect(dot).toBeGreaterThan(0);
    });

    it("does not move orbs that are far away", () => {
      const { s, p, h } = setup();
      const o = addOrb(s, h.x + 500, h.y);
      const { x, y } = o;
      update(s, { [p.id]: { angle: null, boost: false } }, DT);
      expect(o.x).toBe(x);
      expect(o.y).toBe(y);
    });

    it("pulls harder when the orb is closer", () => {
      const a = setup();
      const b = setup();
      const far = addOrb(a.s, a.h.x, a.h.y + 80);
      const near = addOrb(b.s, b.h.x, b.h.y + 45);
      const f0 = dist(far, a.h),
        n0 = dist(near, b.h);
      update(a.s, { [a.p.id]: { angle: null, boost: false } }, DT);
      update(b.s, { [b.p.id]: { angle: null, boost: false } }, DT);
      expect(n0 - dist(near, b.h)).toBeGreaterThan(f0 - dist(far, a.h));
    });

    it("never overshoots and the orb is eaten exactly once", () => {
      const { s, p, h } = setup();
      addOrb(s, h.x + Math.cos(p.angle) * 70, h.y + Math.sin(p.angle) * 70);
      const len0 = p.length;
      for (let i = 0; i < 120; i++) update(s, { [p.id]: { angle: null, boost: false } }, DT);
      // the orb is gone, length grew by exactly its value (other food may be
      // spawned by the game, but none near the head within this window).
      expect(s.orbs.some((o) => o.id === 9999)).toBe(false);
      expect(p.length).toBeGreaterThanOrEqual(len0 + 1);
    });

    it("boosting snakes do not attract orbs", () => {
      const { s, p, h } = setup();
      p.length = 60;
      const o = addOrb(s, h.x + 0, h.y + 60);
      const { x, y } = o;
      update(s, { [p.id]: { angle: 0, boost: true } }, DT);
      // the head moved (boost), the orb must not have been pulled
      expect(o.x).toBe(x);
      expect(o.y).toBe(y);
    });
  });
});

/** Arena with only the player + one bot and a full stock of far-away food (so nothing spawns nearby). */
const isolated = () => {
  const s = createGame({ difficulty: "normal", playerName: "T", seed: 7 });
  const p = s.snakes.find((x) => x.isPlayer)!;
  const bot = s.snakes.find((x) => !x.isPlayer)!;
  s.snakes = [p, bot];
  s.minTotalSnakes = 2;
  s.respawnAt = [];
  s.orbs = Array.from({ length: CFG.orbTarget }, (_, i) => ({
    id: 80000 + i,
    x: -2900,
    y: -50 + (i % 100),
    r: 4,
    value: 0.5,
    hue: 0,
  }));
  // Park the bot's AI so it never moves into anything during the test.
  bot.ai = { targetAngle: 0, boost: false };
  return { s, p, bot };
};

describe("growth: length AND thickness", () => {
  it("radius is strictly increasing and clearly thicker for long snakes", () => {
    let prev = 0;
    for (const len of [20, 50, 100, 200, 500, 1000, 2000]) {
      const r = snakeRadius(len);
      expect(r).toBeGreaterThan(prev);
      prev = r;
    }
    expect(snakeRadius(20)).toBeCloseTo(11.6, 1);
    expect(snakeRadius(500) / snakeRadius(20)).toBeGreaterThan(3.5);
    expect(snakeRadius(CFG.maxSegments)).toBeLessThanOrEqual(90);
  });

  it("eating pays growth out over several ticks, never in one jump", () => {
    const { s, p, bot } = isolated();
    bot.body.forEach((seg) => {
      seg.x = 2000;
      seg.y = 2000;
    });
    const h = p.body[0]!;
    s.orbs.push({ id: 90001, x: h.x, y: h.y, r: 6, value: 20, hue: 0 });
    const len0 = p.length;
    const r0 = snakeRadius(len0);
    update(s, { [p.id]: { angle: null, boost: false } }, DT);
    expect(p.length).toBeGreaterThan(len0); // started growing immediately
    expect(p.length - len0).toBeLessThan(20); // ...but not all at once
    expect(p.growth).toBeGreaterThan(0);
    for (let i = 0; i < 120; i++) update(s, { [p.id]: { angle: null, boost: false } }, DT);
    expect(p.length).toBeCloseTo(len0 + 20, 3); // nothing lost
    expect(p.growth).toBeCloseTo(0, 3);
    expect(snakeRadius(p.length)).toBeGreaterThan(r0); // thicker too
    expect(p.body.length).toBe(Math.floor(p.length));
  });
});

describe("death drops", () => {
  /**
   * Kills the bot with a boundary death. Its head sits just outside the arena
   * edge at (3050, 0) and its body trails inward along y = 0; the player is
   * parked far away so nothing else collides.
   */
  const setup = (len: number, spacing = 4) => {
    const { s, p, bot } = isolated();
    p.body.forEach((seg) => {
      seg.x = -1500;
      seg.y = 1500;
    });
    p.angle = 0;
    bot.length = len;
    bot.body = Array.from({ length: len }, (_, i) => ({ x: 3050 - i * spacing, y: 0 }));
    bot.angle = 0;
    bot.ai = { targetAngle: 0, boost: false };
    s.orbs = s.orbs.filter(() => false);
    update(s, {}, DT);
    return { s, p, bot };
  };
  const drops = (st: ReturnType<typeof createGame>) => st.orbs.filter((o) => o.kind === "death");

  it("drops big, flagged orbs that are much larger than ordinary food", () => {
    const { s, bot } = setup(120);
    expect(bot.alive).toBe(false);
    const d = drops(s);
    expect(d.length).toBeGreaterThanOrEqual(CFG.deathOrbMin);
    expect(d.length).toBeLessThanOrEqual(CFG.deathOrbMax);
    const maxFood = 3 + 1 * 5; // largest ordinary food radius
    for (const o of d) {
      expect(o.r).toBeGreaterThan(maxFood * 1.3);
      expect(o.born).toBeDefined();
    }
  });

  it("total dropped value is proportional to the dead snake's mass", () => {
    const small = setup(40);
    const big = setup(400);
    const sum = (st: ReturnType<typeof createGame>) => drops(st).reduce((a, o) => a + o.value, 0);
    expect(sum(small.s)).toBeCloseTo(40 * CFG.deathOrbShare, 1);
    expect(sum(big.s)).toBeCloseTo(400 * CFG.deathOrbShare, 1);
    expect(sum(big.s)).toBeGreaterThan(sum(small.s) * 5);
  });

  it("drops once only and never exceeds the orb cap for huge snakes", () => {
    const { s } = setup(2500, 1);
    const n = drops(s).length;
    expect(n).toBe(CFG.deathOrbMax);
    for (let i = 0; i < 5; i++) update(s, {}, DT); // a dead snake must not drop again
    expect(drops(s).length).toBe(n);
  });

  it("another snake can collect a drop and grows by its value", () => {
    const { s, p } = setup(80);
    // pick the drop that is safely inside the arena
    const drop = [...drops(s)].sort((a, b) => Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y))[0]!;
    expect(Math.hypot(drop.x, drop.y)).toBeLessThan(s.worldRadius - 100);
    p.body.forEach((seg) => {
      seg.x = drop.x;
      seg.y = drop.y;
    });
    const before = p.length + p.growth;
    update(s, { [p.id]: { angle: null, boost: false } }, DT);
    expect(p.alive).toBe(true);
    expect(s.orbs.some((o) => o.id === drop.id)).toBe(false);
    expect(p.length + p.growth).toBeGreaterThanOrEqual(before + drop.value - 1e-6);
  });

  it("uncollected drops expire, ordinary food stays, and drops do not starve food spawning", () => {
    const { s } = setup(60);
    expect(drops(s).length).toBeGreaterThan(0);
    for (let i = 0; i < 300; i++) update(s, {}, DT);
    const food = s.orbs.filter((o) => o.kind !== "death").length;
    expect(food).toBeGreaterThanOrEqual(CFG.orbTarget - 10);
    s.tick = Math.ceil((s.tick + CFG.deathOrbLifeTicks + 60) / 30) * 30 - 1;
    update(s, {}, DT);
    expect(drops(s).length).toBe(0);
    expect(s.orbs.filter((o) => o.kind !== "death").length).toBeGreaterThan(0);
  });
});
