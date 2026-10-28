import { describe, expect, it } from "vitest";
import { DT, createGame, update } from "@/game/core";
import { orbScreenScale } from "./renderGame";

describe("orb rendering scale", () => {
  it("keeps starting zoom unchanged and compensates larger zoom-outs up to the cap", () => {
    expect(orbScreenScale(1)).toBe(1);
    expect(orbScreenScale(0.5)).toBeGreaterThan(1);
    expect(orbScreenScale(0.2)).toBe(2.6);
  });

  it("uses the current screen's base zoom as the reference", () => {
    expect(orbScreenScale(0.6, 0.9)).toBe(1.5);
    expect(orbScreenScale(0.9, 0.9)).toBe(1);
  });
});

describe("death orb lifetime", () => {
  it("retains a bot's death orbs after 1, 5 and 30 seconds if none are collected", () => {
    const state = createGame({
      difficulty: "easy",
      seed: 19,
      noPlayer: true,
      minTotalSnakes: 1,
    });
    const bot = state.snakes[0]!;
    state.minTotalSnakes = 0;
    state.orbs = [];
    bot.angle = 0;
    bot.ai!.targetAngle = 0;
    bot.body.forEach((point, index) => {
      point.x = state.worldRadius + 50 - index * 5;
      point.y = 0;
    });

    const advanceWithoutAmbientFood = () => {
      update(state, {}, DT);
      state.orbs = state.orbs.filter((orb) => orb.kind === "death");
    };
    advanceWithoutAmbientFood();
    expect(bot.alive).toBe(false);
    const deathOrbCount = () => state.orbs.filter((orb) => orb.kind === "death").length;
    const dropsAtDeath = deathOrbCount();
    expect(dropsAtDeath).toBeGreaterThan(0);

    for (let tick = state.tick; tick < 60; tick++) advanceWithoutAmbientFood();
    expect(deathOrbCount()).toBe(dropsAtDeath);

    for (let tick = state.tick; tick < 300; tick++) advanceWithoutAmbientFood();
    expect(deathOrbCount()).toBe(dropsAtDeath);

    for (let tick = state.tick; tick < 1800; tick++) advanceWithoutAmbientFood();
    expect(deathOrbCount()).toBe(dropsAtDeath);
  });
});
