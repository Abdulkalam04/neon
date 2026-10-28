import { describe, expect, it } from "vitest";
import { SPRITE_SKINS } from "./spriteSkins";
import { SKIN_PRESETS } from "./skinPresets";

describe("illustrated skin catalog", () => {
  it("retains the eight supplied skins at the front", () => {
    expect(SKIN_PRESETS.slice(0, 8).map((p) => p.skin.sprite)).toEqual([
      "panda",
      "tiger",
      "cow",
      "fox",
      "frog",
      "pig",
      "penguin",
      "pharaoh",
    ]);
  });
  it("adds twelve original illustrated skins", () => {
    expect(SPRITE_SKINS.slice(8).map((s) => s.id)).toEqual([
      "bunny",
      "koala",
      "owl",
      "dino",
      "octopus",
      "ladybug",
      "bee",
      "axolotl",
      "turtle",
      "red-panda",
      "snow-leopard",
      "giraffe",
    ]);
    expect(new Set(SKIN_PRESETS.map((p) => p.id)).size).toBe(SKIN_PRESETS.length);
  });
});
