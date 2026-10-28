import { DEFAULT_SKIN, type SnakeSkin } from "./drawSnake";
import { SPRITE_SKINS } from "./spriteSkins";

export type SkinTag = "classic" | "animals" | "fantasy" | "festive";
export const SKIN_TAGS: { id: SkinTag; label: string }[] = [
  { id: "classic", label: "Classic" },
  { id: "animals", label: "Animals" },
  { id: "fantasy", label: "Fantasy" },
  { id: "festive", label: "Festive" },
];

export interface SkinPreset {
  id: string;
  name: string;
  tag: SkinTag;
  /** One-line flavour text shown in the customizer's info bar. */
  desc: string;
  skin: SnakeSkin;
}

const make = (
  id: string,
  name: string,
  tag: SkinTag,
  desc: string,
  over: Partial<SnakeSkin>,
): SkinPreset => ({
  id,
  name,
  tag,
  desc,
  skin: {
    ...DEFAULT_SKIN,
    glow: 0.35,
    outline: 1,
    sparkle: false,
    ...over,
    eyes: { ...DEFAULT_SKIN.eyes, ...(over.eyes ?? {}) },
    // Accessories were removed from the game: presets never carry any.
    hat: "none",
    back: "none",
    wings: "none",
  },
});

/** Ready-made looks (original designs) shown in the customizer's "Skins" tab. */
export const SKIN_PRESETS: SkinPreset[] = [
  ...SPRITE_SKINS.map((d) =>
    make(`sprite-${d.id}`, d.name, d.tag, d.desc, {
      sprite: d.id,
      primary: d.color,
      secondary: d.color,
      pattern: "solid",
      glow: 0,
      outline: 0,
    }),
  ),
  make("neon", "Neon", "classic", "The original glowing neon serpent. Born in the arena.", {
    ...DEFAULT_SKIN,
    glow: 0.6,
    outline: 0,
  }),
  make("tiger", "Tiger", "animals", "Bold stripes and a fierce stare. King of the jungle floor.", {
    primary: "#ff9a1a",
    secondary: "#2a1200",
    pattern: "tiger",
    eyes: { shape: "angry", color: "#fff3a0", pupilSize: 0.45, followMouse: true },
  }),
  make("leopard", "Leopard", "animals", "Spotted, silent and fast. Strikes from the shadows.", {
    primary: "#f2c76a",
    secondary: "#4a2a0a",
    pattern: "leopard",
    eyes: { shape: "oval", color: "#d8ff6a", pupilSize: 0.4, followMouse: true },
  }),
  make(
    "candy",
    "Candy Cane",
    "festive",
    "Sweet to look at, sticky to chase. Comes with a Santa hat.",
    {
      primary: "#ff2b4a",
      secondary: "#ffffff",
      pattern: "candy",
      eyes: { shape: "cute", color: "#ffffff", pupilSize: 0.6, followMouse: true },
      hat: "santa",
    },
  ),
  make("galaxy", "Galaxy", "fantasy", "A swirl of stars and stardust, with butterfly wings.", {
    primary: "#3a1bff",
    secondary: "#ff2bd6",
    pattern: "galaxy",
    glow: 0.7,
    sparkle: true,
    wings: "butterfly",
  }),
  make("coral", "Coral", "animals", "Red, black and bright. Rings that warn: do not bite me!", {
    primary: "#e8283a",
    secondary: "#15151c",
    pattern: "coral",
    eyes: { shape: "round", color: "#ffffff", pupilSize: 0.5, followMouse: true },
  }),
  make("dragon", "Dragon", "fantasy", "Armoured scales, bat wings and horns. Handle with care.", {
    primary: "#2fd36b",
    secondary: "#0b5a2a",
    pattern: "scales",
    eyes: { shape: "angry", color: "#ffd23a", pupilSize: 0.35, followMouse: true },
    wings: "bat",
    hat: "horns",
  }),
  make("angel", "Angel", "fantasy", "Soft glow, a halo and feathery wings. Pure and speedy.", {
    primary: "#f4f8ff",
    secondary: "#9fb4d6",
    pattern: "gradient",
    eyes: { shape: "cute", color: "#ffffff", pupilSize: 0.6, followMouse: true },
    glow: 0.55,
    hat: "halo",
    wings: "angel",
  }),
  make("king", "King", "classic", "Golden stripes, a crown and a flowing cape. Bow down!", {
    primary: "#ffd23a",
    secondary: "#a86a00",
    pattern: "stripes",
    glow: 0.5,
    hat: "crown",
    back: "cape",
  }),
  make("knight", "Knight", "classic", "Steel scales and a trusty shield. Ready for battle.", {
    primary: "#9fb4d6",
    secondary: "#4a5a78",
    pattern: "scales",
    eyes: { shape: "angry", color: "#ffffff", pupilSize: 0.5, followMouse: true },
    back: "shield",
  }),
  make("bunny", "Bunny", "festive", "Fluffy ears and pink polka dots. Hop-hop-hooray!", {
    primary: "#ffd6ec",
    secondary: "#ff7ad9",
    pattern: "dots",
    eyes: { shape: "cute", color: "#ffffff", pupilSize: 0.65, followMouse: true },
    hat: "bunny",
  }),
  make("party", "Party", "festive", "Rainbow stripes and a party hat. Every day is a party.", {
    primary: "#ff7ad9",
    secondary: "#7af0ff",
    pattern: "rainbow",
    eyes: { shape: "cute", color: "#ffffff", pupilSize: 0.6, followMouse: true },
    sparkle: true,
    hat: "party",
  }),
  make("cowboy", "Cowboy", "animals", "Striped like a zebra, dressed like a cowboy. Yeehaw!", {
    primary: "#c98a4a",
    secondary: "#6a421d",
    pattern: "zebra",
    hat: "cowboy",
    back: "flag",
  }),
  make(
    "magician",
    "Magician",
    "fantasy",
    "A top hat, a magic sword and a few tricks up its sleeve.",
    {
      primary: "#6a3bff",
      secondary: "#ffd23a",
      pattern: "checker",
      glow: 0.5,
      sparkle: true,
      hat: "tophat",
      back: "sword",
    },
  ),
  make("phoenix", "Phoenix", "fantasy", "Reborn in fire. Leaves a blazing trail when it boosts.", {
    primary: "#ff3a1a",
    secondary: "#ffb01a",
    pattern: "gradient",
    glow: 0.8,
    boost: "flame",
    wings: "flame",
  }),

  // ---- Glossy ball snakes (the "classic" arcade look) -------------------------
  make(
    "sweetheart",
    "Sweetheart",
    "classic",
    "Minty beads and heart-shaped eyes. Spreads the love.",
    {
      primary: "#19d98e",
      secondary: "#0b8f5d",
      pattern: "solid",
      shading: "bead",
      glow: 0,
      eyes: { shape: "heart", color: "#e8283a", pupilSize: 0.5, followMouse: false },
    },
  ),
  make("grape", "Grape", "classic", "Juicy purple beads with big, curious eyes.", {
    primary: "#a23be0",
    secondary: "#6a1a9a",
    pattern: "solid",
    shading: "bead",
    glow: 0,
    eyes: { shape: "cute", color: "#fff27a", pupilSize: 0.6, followMouse: true },
  }),
  make("cherry", "Cherry", "classic", "Shiny red and a little bit grumpy.", {
    primary: "#e0202a",
    secondary: "#8f0a14",
    pattern: "solid",
    shading: "bead",
    glow: 0,
    eyes: { shape: "angry", color: "#ffffff", pupilSize: 0.5, followMouse: true },
  }),
  make("pearl", "Pearl", "classic", "Smooth, pale and polished like a string of pearls.", {
    primary: "#f2f4f8",
    secondary: "#b9c2d4",
    pattern: "solid",
    shading: "bead",
    glow: 0,
    eyes: { shape: "round", color: "#ffffff", pupilSize: 0.7, followMouse: true },
  }),
  make("lemon", "Lemon", "classic", "Zesty yellow beads. Sunny side up!", {
    primary: "#ffd21a",
    secondary: "#d49a00",
    pattern: "solid",
    shading: "bead",
    glow: 0,
    eyes: { shape: "cute", color: "#ffffff", pupilSize: 0.55, followMouse: true },
  }),
  make("slate", "Slate", "classic", "Dark, quiet and watchful. Glowing eyes in the gloom.", {
    primary: "#3a3d4a",
    secondary: "#1d1f28",
    pattern: "solid",
    shading: "bead",
    glow: 0,
    eyes: { shape: "round", color: "#ffe14a", pupilSize: 0.4, followMouse: true },
  }),
  make("aqua", "Aqua", "classic", "Cool turquoise beads with a splash of attitude.", {
    primary: "#27c6e8",
    secondary: "#0b7fa0",
    pattern: "solid",
    shading: "bead",
    glow: 0,
    eyes: { shape: "angry", color: "#ffffff", pupilSize: 0.45, followMouse: true },
  }),
  make("lime", "Lime", "classic", "Zippy green beads. Fresh and full of energy.", {
    primary: "#a6e22e",
    secondary: "#5f9a00",
    pattern: "solid",
    shading: "bead",
    glow: 0,
    eyes: { shape: "round", color: "#ffffff", pupilSize: 0.5, followMouse: true },
  }),
  make("bubblegum", "Bubblegum", "classic", "Pop! Pink, stretchy and super sweet.", {
    primary: "#ff3fb0",
    secondary: "#c0187f",
    pattern: "solid",
    shading: "bead",
    glow: 0,
    eyes: { shape: "cute", color: "#ffffff", pupilSize: 0.6, followMouse: true },
  }),
  make("rainbow", "Rainbow Beads", "festive", "Every colour of the rainbow, one bead at a time.", {
    primary: "#ff3a3a",
    secondary: "#3a8aff",
    pattern: "rainbow",
    shading: "bead",
    glow: 0,
    eyes: { shape: "cute", color: "#ffffff", pupilSize: 0.6, followMouse: true },
  }),
];
