import type { Difficulty } from "@/game/core";

export type PlayMode = "ai" | "online";
type PlayPhase =
  "select" | "lobby" | "connecting" | "loading" | "playing" | "paused" | "dead" | "interrupted";

interface PlayRunStats {
  killedBy: string | null;
  finalScore: number;
  bestScore: number;
  seconds: number;
  kills: number;
}

export interface PlayFlowState {
  mode: PlayMode;
  phase: PlayPhase;
  difficulty: Difficulty;
  death: PlayRunStats | null;
  lastKnownScore: number | null;
  room: string;
}

export interface PersistedPlayFlow {
  version: 1;
  savedAt: number;
  state: PlayFlowState;
}

export function parsePlayMode(value: unknown, hasRoom: boolean): PlayMode | null {
  if (value !== undefined && value !== "ai" && value !== "online") return null;
  if (hasRoom || value === "online") return "online";
  return "ai";
}

export type PlayFlowAction =
  | { type: "restore"; mode: PlayMode; room: string; persisted: PersistedPlayFlow | null }
  | { type: "choose-difficulty"; difficulty: Difficulty }
  | { type: "set-room"; room: string }
  | { type: "connecting" }
  | { type: "start" }
  | { type: "loaded" }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "score"; score: number }
  | { type: "die"; stats: PlayRunStats }
  | { type: "play-again" }
  | { type: "return-to-lobby" };

export const initialPlayFlow = (mode: PlayMode, room = ""): PlayFlowState => ({
  mode,
  phase: mode === "online" ? "lobby" : "select",
  difficulty: "normal",
  death: null,
  lastKnownScore: null,
  room,
});

export function restorePlayFlow(
  mode: PlayMode,
  room: string,
  persisted: PersistedPlayFlow | null,
): PlayFlowState {
  const initial = initialPlayFlow(mode, room);
  if (!persisted || persisted.state.mode !== mode) return initial;

  const previous = persisted.state;
  const restored: PlayFlowState = {
    ...previous,
    room: room || previous.room,
    lastKnownScore: previous.lastKnownScore,
  };

  if (mode === "online") {
    return previous.phase === "dead" && previous.death
      ? { ...restored, phase: "dead" }
      : { ...restored, phase: "lobby" };
  }

  if (previous.phase === "dead" && previous.death) return { ...restored, phase: "dead" };
  if (
    previous.phase === "select" ||
    previous.phase === "lobby" ||
    previous.phase === "connecting"
  ) {
    return { ...restored, phase: "select" };
  }
  if (previous.phase === "interrupted") return { ...restored, phase: "interrupted", death: null };
  if (previous.phase === "loading") return { ...restored, phase: "select", death: null };
  return { ...restored, phase: "interrupted", death: null };
}

export function reducePlayFlow(state: PlayFlowState, action: PlayFlowAction): PlayFlowState {
  switch (action.type) {
    case "restore":
      return restorePlayFlow(action.mode, action.room, action.persisted);
    case "choose-difficulty":
      return state.mode === "ai" && state.phase === "select"
        ? { ...state, difficulty: action.difficulty }
        : state;
    case "set-room":
      return state.mode === "online" ? { ...state, room: action.room } : state;
    case "connecting":
      return state.mode === "online" && state.phase === "lobby"
        ? { ...state, phase: "connecting" }
        : state;
    case "start":
      return (state.mode === "ai" && state.phase === "select") ||
        (state.mode === "online" && (state.phase === "lobby" || state.phase === "connecting"))
        ? { ...state, phase: "loading", death: null, lastKnownScore: null }
        : state;
    case "loaded":
      return state.phase === "loading" ? { ...state, phase: "playing" } : state;
    case "pause":
      return state.mode === "ai" && state.phase === "playing"
        ? { ...state, phase: "paused" }
        : state;
    case "resume":
      return state.mode === "ai" && state.phase === "paused"
        ? { ...state, phase: "playing" }
        : state;
    case "score": {
      if (state.phase !== "playing" && state.phase !== "paused") return state;
      const score = Math.max(0, Math.floor(action.score));
      return state.lastKnownScore === score ? state : { ...state, lastKnownScore: score };
    }
    case "die":
      return state.phase === "playing"
        ? { ...state, phase: "dead", death: action.stats, lastKnownScore: action.stats.finalScore }
        : state;
    case "play-again":
      return state.mode === "ai"
        ? { ...state, phase: "select", death: null, lastKnownScore: null }
        : { ...state, phase: "lobby", death: null, lastKnownScore: null };
    case "return-to-lobby":
      return state.mode === "online" ? { ...state, phase: "lobby", lastKnownScore: null } : state;
  }
}

export function isPersistedPlayFlow(value: unknown): value is PersistedPlayFlow {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PersistedPlayFlow>;
  const state = candidate.state;
  if (
    candidate.version !== 1 ||
    typeof candidate.savedAt !== "number" ||
    !Number.isFinite(candidate.savedAt) ||
    !state ||
    (state.mode !== "ai" && state.mode !== "online") ||
    ![
      "select",
      "lobby",
      "connecting",
      "loading",
      "playing",
      "paused",
      "dead",
      "interrupted",
    ].includes(state.phase) ||
    !["easy", "normal", "hard"].includes(state.difficulty) ||
    (state.death !== null && !isRunStats(state.death)) ||
    (state.lastKnownScore !== null &&
      (typeof state.lastKnownScore !== "number" || !Number.isFinite(state.lastKnownScore))) ||
    typeof state.room !== "string"
  ) {
    return false;
  }
  return true;
}

function isRunStats(value: unknown): value is PlayRunStats {
  if (!value || typeof value !== "object") return false;
  const stats = value as Partial<PlayRunStats>;
  return (
    (stats.killedBy === null || typeof stats.killedBy === "string") &&
    typeof stats.finalScore === "number" &&
    Number.isFinite(stats.finalScore) &&
    typeof stats.bestScore === "number" &&
    Number.isFinite(stats.bestScore) &&
    typeof stats.seconds === "number" &&
    Number.isFinite(stats.seconds) &&
    typeof stats.kills === "number" &&
    Number.isFinite(stats.kills)
  );
}
