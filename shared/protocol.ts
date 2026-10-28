import type { GameEvent, Orb } from "../src/game/core/types";
import type { LeaderboardEntry, NetSnapshot, NetSnake, SnakeSkin } from "../src/game/net/types";

export type ClientMessage =
  | {
      t: "join";
      name: string;
      skin: SnakeSkin;
      room?: string | undefined;
      region?: string | undefined;
    }
  | { t: "input"; angle: number | null; boost: boolean }
  | { t: "ping"; ts: number };

export type ServerMessage =
  | { t: "welcome"; youId: number; worldRadius: number }
  | ({ t: "state" } & NetSnapshot)
  | { t: "pong"; ts: number }
  | { t: "error"; message: string };

export type { GameEvent, LeaderboardEntry, NetSnapshot, NetSnake, Orb, SnakeSkin };
