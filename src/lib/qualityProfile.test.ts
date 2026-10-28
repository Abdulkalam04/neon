import { describe, expect, it } from "vitest";
import { autoTuneStep, mapDeviceToTier, profileFor } from "./qualityProfile";

describe("adaptive graphics profile logic", () => {
  it("uses a mid-range tier when device memory and renderer signals are unavailable", () => {
    expect(mapDeviceToTier({})).toBe(2);
  });

  it("maps weak hardware and strong hardware to distinct tiers", () => {
    expect(
      mapDeviceToTier({
        memoryGb: 2,
        hardwareConcurrency: 4,
        benchmarkScore: 15_000,
      }),
    ).toBe(0);
    expect(
      mapDeviceToTier({
        memoryGb: 8,
        hardwareConcurrency: 8,
        benchmarkScore: 250_000,
        renderer: "Apple GPU",
      }),
    ).toBe(3);
  });

  it("steps quality down one knob at a time and respects cooldown", () => {
    expect(autoTuneStep(0, "down", true)).toBe(1);
    const base = profileFor("auto", 3, 0);
    const firstStep = profileFor("auto", 3, 1);
    const secondStep = profileFor("auto", 3, 2);
    expect(firstStep.resolutionScale).toBeLessThan(base.resolutionScale);
    expect(secondStep.maxParticles).toBeLessThan(firstStep.maxParticles);
    expect(profileFor("auto", 3, 3).glow).toBe(false);
    expect(profileFor("auto", 3, 4).nebula).toBe(false);
    expect(profileFor("auto", 3, 5).trailLength).toBeLessThan(base.trailLength);
    expect(profileFor("auto", 3, 6).eyeDetail).toBe(false);
    expect(autoTuneStep(2, "down", false)).toBe(2);
  });

  it("steps quality up gradually and never exceeds profile step bounds", () => {
    expect(autoTuneStep(3, "up", true)).toBe(2);
    expect(autoTuneStep(0, "up", true)).toBe(0);
    expect(autoTuneStep(6, "down", true)).toBe(6);
  });
});
