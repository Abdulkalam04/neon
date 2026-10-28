import type { GameEvent, Orb, Snake } from "@/game/core/types";
import type { SnakeSkin } from "@/game/render/drawSnake";

export type { SnakeSkin };

export type ConnectionStatus = "connecting" | "connected" | "reconnecting" | "disconnected";

/** Network view of a snake: same fields the renderer reads, minus server-only AI state. */
export type NetSnake = Pick<
  Snake,
  | "id"
  | "name"
  | "isPlayer"
  | "hue"
  | "skinIndex"
  | "alive"
  | "angle"
  | "body"
  | "length"
  | "boosting"
  | "kills"
>;

export interface LeaderboardEntry {
  name: string;
  score: number;
}

export interface NetSnapshot {
  /** Server simulation tick this snapshot was taken at. */
  tick: number;
  worldRadius: number;
  /** Id of the snake controlled by this client. */
  youId: number;
  snakes: NetSnake[];
  orbs: Orb[];
  /** Events that happened since the previous snapshot. */
  events: GameEvent[];
  /** Top 10 scores in the room. */
  leaderboard?: LeaderboardEntry[] | undefined;
}

export interface GameConnection {
  connect(name: string, skin: SnakeSkin, roomCode?: string | undefined): Promise<void>;
  sendInput(angle: number | null, boost: boolean): void;
  onState(cb: (snapshot: NetSnapshot) => void): void;
  onStatus(cb: (status: ConnectionStatus, pingMs: number) => void): void;
  disconnect(): void;
}

export const REGIONS = [
  { id: "eu", label: "Europe", basePing: 38 },
  { id: "us-east", label: "US East", basePing: 72 },
  { id: "us-west", label: "US West", basePing: 110 },
  { id: "asia", label: "Asia", basePing: 64 },
] as const;
export type RegionId = (typeof REGIONS)[number]["id"];
