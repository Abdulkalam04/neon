import { CFG, DIFFICULTY, segmentSpacing, snakeRadius } from "./config";
import { rand, randPick, randRange } from "./rng";
import type { Difficulty, GameState, Orb, Snake, Vec } from "./types";

const NAMES = [
  "Viper",
  "NeonFang",
  "Glitch",
  "Byte",
  "Hexa",
  "Zapper",
  "Nova",
  "Pixel",
  "Ronin",
  "Sable",
  "Quark",
  "Echo",
  "Blitz",
  "Mamba",
  "Cobra",
  "Drift",
  "Vortex",
  "Static",
  "Lumen",
  "Kraken",
  "Orbit",
  "Shade",
  "Turbo",
  "Jinx",
  "Ziggy",
  "Pulse",
  "Rogue",
  "Nyx",
  "Comet",
  "Taipan",
  "Fizz",
  "Wraith",
  "Sonic",
  "Ember",
  "Frost",
  "Bolt",
];

export interface CreateGameOptions {
  difficulty: Difficulty;
  playerName?: string | undefined;
  playerHue?: number | undefined;
  seed?: number | undefined;
  minTotalSnakes?: number | undefined;
  noPlayer?: boolean | undefined;
}

export function createGame(opts: CreateGameOptions): GameState {
  const state: GameState = {
    tick: 0,
    seed: opts.seed ?? 12345,
    worldRadius: CFG.worldRadius,
    difficulty: opts.difficulty,
    snakes: [],
    orbs: [],
    nextId: 1,
    playerId: 0,
    events: [],
    respawnAt: [],
    minTotalSnakes: opts.minTotalSnakes,
  };
  for (let i = 0; i < CFG.orbTarget; i++) spawnFood(state);
  if (!opts.noPlayer) {
    const player = spawnSnake(state, {
      name: opts.playerName || "Player",
      isPlayer: true,
      hue: opts.playerHue ?? 180,
      at: { x: 0, y: 0 },
    });
    state.playerId = player.id;
  }
  const initialBots =
    opts.minTotalSnakes !== undefined
      ? Math.max(0, opts.minTotalSnakes - (opts.noPlayer ? 0 : 1))
      : DIFFICULTY[opts.difficulty].bots;
  for (let i = 0; i < initialBots; i++) spawnBot(state);
  return state;
}

export function addPlayerSnake(state: GameState, name: string, hue: number, skinIndex = 0): number {
  const at = randomPointInWorld(state, 0.35);
  const snake = spawnSnake(state, {
    name: name || "Player",
    isPlayer: true,
    hue,
    at,
  });
  snake.skinIndex = skinIndex;
  if (!state.playerId) {
    state.playerId = snake.id;
  }

  // If arena has a target snake count, shrink bot count as humans join
  if (state.minTotalSnakes !== undefined) {
    const aliveHumans = state.snakes.filter((s) => s.isPlayer && s.alive).length;
    const targetBots = Math.max(0, state.minTotalSnakes - aliveHumans);
    const aliveBots = state.snakes.filter((s) => !s.isPlayer && s.alive);
    if (aliveBots.length > targetBots) {
      let furthestBot: Snake | null = null;
      let maxDist = -1;
      for (const bot of aliveBots) {
        const d = Math.hypot(bot.body[0]!.x - at.x, bot.body[0]!.y - at.y);
        if (d > maxDist) {
          maxDist = d;
          furthestBot = bot;
        }
      }
      if (furthestBot) {
        removeSnake(state, furthestBot.id);
      }
    }
  }

  return snake.id;
}

export function removeSnake(state: GameState, id: number): void {
  const idx = state.snakes.findIndex((s) => s.id === id);
  if (idx !== -1) {
    state.snakes.splice(idx, 1);
  }
}

export function randomPointInWorld(state: GameState, maxFrac = 0.92): Vec {
  const a = rand(state) * Math.PI * 2;
  const d = Math.sqrt(rand(state)) * state.worldRadius * maxFrac;
  return { x: Math.cos(a) * d, y: Math.sin(a) * d };
}

export function spawnSnake(
  state: GameState,
  o: { name: string; isPlayer: boolean; hue: number; at: Vec; length?: number },
): Snake {
  const length = o.length ?? CFG.startLength;
  const angle = rand(state) * Math.PI * 2;
  const sp = segmentSpacing(snakeRadius(length));
  const body: Vec[] = [];
  for (let i = 0; i < Math.floor(length); i++) {
    body.push({ x: o.at.x - Math.cos(angle) * sp * i, y: o.at.y - Math.sin(angle) * sp * i });
  }
  const snake: Snake = {
    id: state.nextId++,
    name: o.name,
    isPlayer: o.isPlayer,
    hue: o.hue,
    skinIndex: Math.floor(rand(state) * 1000),
    alive: true,
    angle,
    body,
    length,
    growth: 0,
    boosting: false,
    boostAcc: 0,
    kills: 0,
    ai: o.isPlayer ? null : { targetAngle: angle, boost: false },
  };
  state.snakes.push(snake);
  return snake;
}

export function spawnBot(state: GameState): Snake {
  const player = state.snakes.find((s) => s.isPlayer);
  let at = randomPointInWorld(state, 0.8);
  for (let tries = 0; tries < 10 && player; tries++) {
    const h = player.body[0]!;
    if (Math.hypot(at.x - h.x, at.y - h.y) > 700) break;
    at = randomPointInWorld(state, 0.8);
  }
  const used = new Set(state.snakes.map((s) => s.name));
  let name = randPick(state, NAMES);
  if (used.has(name)) name = `${name}${Math.floor(randRange(state, 2, 99))}`;
  return spawnSnake(state, {
    name,
    isPlayer: false,
    hue: Math.floor(rand(state) * 360),
    at,
    length: CFG.startLength + Math.floor(rand(state) * 60),
  });
}

export function addOrb(
  state: GameState,
  x: number,
  y: number,
  value: number,
  hue: number,
  r?: number,
  kind?: "food" | "death",
): Orb {
  const orb: Orb = { id: state.nextId++, x, y, value, hue, r: r ?? 3 + value * 5 };
  if (kind === "death") {
    orb.kind = "death";
    orb.born = state.tick;
  }
  state.orbs.push(orb);
  return orb;
}

export function spawnFood(state: GameState) {
  const p = randomPointInWorld(state, 0.97);
  const value = randRange(state, 0.2, 1);
  addOrb(state, p.x, p.y, value, Math.floor(rand(state) * 360));
}
