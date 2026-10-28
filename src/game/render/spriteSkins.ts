/**
 * Image ("sprite") skins: a head picture + a repeating body tile, both drawn
 * facing +x (to the right) and rotated along the snake's path by drawSnake.
 *
 * To add a skin: drop `<id>-head.png` and `<id>-body.png` into /public/skins and
 * add one line to SPRITE_SKINS. It then appears in the customizer automatically.
 * Art must be your own / licensed (do not copy art from other games).
 */
export interface SpriteSkinDef {
  id: string;
  name: string;
  tag: "animals" | "fantasy" | "classic" | "festive";
  desc: string;
  /** Used for minimap / fallback while images load / leaderboard dots. */
  color: string;
}

export const SPRITE_SKINS: SpriteSkinDef[] = [
  {
    id: "panda",
    name: "Panda",
    tag: "animals",
    desc: "Black and white and cuddly all over.",
    color: "#f4f4f6",
  },
  {
    id: "tiger",
    name: "Tiger Cub",
    tag: "animals",
    desc: "Orange fur, bold stripes and a hungry grin.",
    color: "#f6962a",
  },
  {
    id: "cow",
    name: "Cow",
    tag: "animals",
    desc: "Moo! Spotted, sweet and surprisingly fast.",
    color: "#fafafa",
  },
  {
    id: "fox",
    name: "Fox",
    tag: "animals",
    desc: "Clever, quick and always one step ahead.",
    color: "#f06e1e",
  },
  {
    id: "frog",
    name: "Frog",
    tag: "animals",
    desc: "Big bulgy eyes and a very wide smile.",
    color: "#46b446",
  },
  {
    id: "pig",
    name: "Piggy",
    tag: "animals",
    desc: "Pink, round and ready for a snack.",
    color: "#ffafc3",
  },
  {
    id: "penguin",
    name: "Penguin",
    tag: "animals",
    desc: "Dressed for a party on the ice.",
    color: "#232d46",
  },
  {
    id: "pharaoh",
    name: "Pharaoh",
    tag: "fantasy",
    desc: "Gold and blue stripes from an ancient tomb.",
    color: "#ebc85a",
  },
  {
    id: "bunny",
    name: "Bunny",
    tag: "animals",
    desc: "A cotton-soft hop with rosy polka dots.",
    color: "#fff4f5",
  },
  {
    id: "koala",
    name: "Koala",
    tag: "animals",
    desc: "Silver spots and a eucalyptus-day smile.",
    color: "#adb0bc",
  },
  {
    id: "owl",
    name: "Owl",
    tag: "animals",
    desc: "Golden feather chevrons and bright curious eyes.",
    color: "#b77e50",
  },
  {
    id: "dino",
    name: "Dino",
    tag: "animals",
    desc: "Apple-green scales from a friendly little fossil.",
    color: "#8fd348",
  },
  {
    id: "octopus",
    name: "Octopus",
    tag: "animals",
    desc: "Turquoise suckers and eight reasons to smile.",
    color: "#22bfc8",
  },
  {
    id: "ladybug",
    name: "Ladybug",
    tag: "animals",
    desc: "Cherry red with lucky midnight spots.",
    color: "#f82f4c",
  },
  {
    id: "bee",
    name: "Honey Bee",
    tag: "animals",
    desc: "Sunny honey stripes and a cheerful buzz.",
    color: "#ffd44d",
  },
  {
    id: "axolotl",
    name: "Axolotl",
    tag: "animals",
    desc: "Bubble-blue dots with candy-pink gills.",
    color: "#85d4f9",
  },
  {
    id: "turtle",
    name: "Sea Turtle",
    tag: "animals",
    desc: "Ocean-green scales for a steady little explorer.",
    color: "#46d9be",
  },
  {
    id: "red-panda",
    name: "Red Panda",
    tag: "animals",
    desc: "Tangerine stripes and a mischievous grin.",
    color: "#ff812d",
  },
  {
    id: "snow-leopard",
    name: "Snow Leopard",
    tag: "animals",
    desc: "Frosty rosettes on a softly smiling snow cat.",
    color: "#c8dbea",
  },
  {
    id: "giraffe",
    name: "Giraffe",
    tag: "animals",
    desc: "Honey-gold patches, tiny horns and a big heart.",
    color: "#ffc75b",
  },
];

const SPRITE_IDS = SPRITE_SKINS.map((s) => s.id);

const cache = new Map<string, HTMLImageElement>();
const listeners = new Set<() => void>();

/** Called whenever any sprite finishes loading (so static thumbnails can repaint). */
export function onSpriteLoaded(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function load(url: string): HTMLImageElement | null {
  if (typeof Image === "undefined") return null;
  let img = cache.get(url);
  if (!img) {
    img = new Image();
    img.decoding = "async";
    img.onload = () => listeners.forEach((cb) => cb());
    img.src = url;
    cache.set(url, img);
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
}

export interface LoadedSprite {
  head: HTMLImageElement;
  body: HTMLImageElement;
}

/** Returns both images once loaded, otherwise null (callers fall back to circles). */
export function getSprite(id: string | undefined): LoadedSprite | null {
  if (!id || !SPRITE_IDS.includes(id)) return null;
  const head = load(`/skins/${id}-head.png`);
  const body = load(`/skins/${id}-body.png`);
  return head && body ? { head, body } : null;
}

/** Start downloading every sprite (called once when the customizer/game mounts). */
export function preloadSprites() {
  for (const s of SPRITE_SKINS) getSprite(s.id);
}
