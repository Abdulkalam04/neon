export type Difficulty = "easy" | "normal" | "hard";

export interface Vec {
  x: number;
  y: number;
}

export interface BotBrain {
  targetAngle: number;
  boost: boolean;
}

export interface Snake {
  id: number;
  name: string;
  isPlayer: boolean;
  /** Base hue (0-360) used for death orbs and bot skins. */
  hue: number;
  /** Skin variant for bots (render decides what it means). */
  skinIndex: number;
  alive: boolean;
  angle: number;
  /** Head first. */
  body: Vec[];
  /** Target length in segments (float, grows with food). */
  length: number;
  /** Food already eaten but not yet added to `length` (paid out smoothly each tick). */
  growth: number;
  boosting: boolean;
  boostAcc: number;
  kills: number;
  ai: BotBrain | null;
}

export interface Orb {
  id: number;
  x: number;
  y: number;
  r: number;
  value: number;
  hue: number;
  /** "death" = big drop from a dead snake. Absent/"food" = ordinary food. */
  kind?: "food" | "death" | undefined;
  /** Simulation tick the orb was created (drives pop-in / fade-out animations). */
  born?: number | undefined;
}

export type GameEvent =
  | {
      type: "death";
      snakeId: number;
      killerId: number | null;
      killerName: string | null;
      isPlayer: boolean;
    }
  | { type: "eat"; snakeId: number; x: number; y: number; value: number }
  | { type: "kill"; snakeId: number; victimId: number };

export interface GameState {
  tick: number;
  seed: number;
  worldRadius: number;
  difficulty: Difficulty;
  snakes: Snake[];
  orbs: Orb[];
  nextId: number;
  playerId: number;
  /** Events produced by the most recent update() call. */
  events: GameEvent[];
  /** Ticks at which a replacement bot should spawn. */
  respawnAt: number[];
  /** Optional minimum total snakes to maintain in multiplayer arenas. */
  minTotalSnakes?: number | undefined;
}

export interface PlayerInput {
  /** Desired heading in radians, or null to keep going straight. */
  angle: number | null;
  boost: boolean;
}

export type Inputs = Record<number, PlayerInput>;
