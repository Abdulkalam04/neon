import {
  isPersistedPlayFlow,
  type PersistedPlayFlow,
  type PlayFlowState,
  type PlayMode,
} from "@/game/flow/playFlow";

export const LAST_SCREEN_KEY = "neon-serpent:last-screen";
export const PLAY_FLOW_KEY = "neon-serpent:play-flow";
export const LAST_SCREEN_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

type LastScreenPath = "/" | "/play" | "/customize";

export interface LastScreen {
  path: LastScreenPath;
  search: { mode?: PlayMode; room?: string; tab?: "snakes" | "style" };
  scrollY: number;
  savedAt: number;
}

function isLastScreen(value: unknown): value is LastScreen {
  if (!value || typeof value !== "object") return false;
  const screen = value as Partial<LastScreen>;
  if (
    (screen.path !== "/" && screen.path !== "/play" && screen.path !== "/customize") ||
    !screen.search ||
    typeof screen.search !== "object" ||
    typeof screen.scrollY !== "number" ||
    !Number.isFinite(screen.scrollY) ||
    typeof screen.savedAt !== "number" ||
    !Number.isFinite(screen.savedAt)
  ) {
    return false;
  }
  if (screen.path === "/play") {
    return (
      (screen.search.mode === "ai" || screen.search.mode === "online") &&
      (screen.search.room === undefined || typeof screen.search.room === "string")
    );
  }
  if (screen.path === "/customize") {
    return (
      screen.search.tab === undefined ||
      screen.search.tab === "snakes" ||
      screen.search.tab === "style"
    );
  }
  return true;
}

export function readLastScreen(storage: StorageLike, now = Date.now()): LastScreen | null {
  const raw = storage.getItem(LAST_SCREEN_KEY);
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      !isLastScreen(parsed) ||
      parsed.savedAt > now ||
      now - parsed.savedAt > LAST_SCREEN_MAX_AGE_MS
    ) {
      storage.removeItem(LAST_SCREEN_KEY);
      return null;
    }
    return parsed;
  } catch {
    storage.removeItem(LAST_SCREEN_KEY);
    return null;
  }
}

export function writeLastScreen(
  storage: StorageLike,
  screen: Omit<LastScreen, "savedAt">,
  now = Date.now(),
) {
  storage.setItem(LAST_SCREEN_KEY, JSON.stringify({ ...screen, savedAt: now }));
}

export function readPlayFlow(storage: StorageLike, mode: PlayMode): PersistedPlayFlow | null {
  const key = `${PLAY_FLOW_KEY}:${mode}`;
  const raw = storage.getItem(key);
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isPersistedPlayFlow(parsed) || parsed.state.mode !== mode) {
      storage.removeItem(key);
      return null;
    }
    return parsed;
  } catch {
    storage.removeItem(key);
    return null;
  }
}

export function writePlayFlow(storage: StorageLike, state: PlayFlowState, now = Date.now()) {
  const value: PersistedPlayFlow = { version: 1, savedAt: now, state };
  storage.setItem(`${PLAY_FLOW_KEY}:${state.mode}`, JSON.stringify(value));
}

export function clearPlayFlow(storage: StorageLike, mode?: PlayMode) {
  if (mode) {
    storage.removeItem(`${PLAY_FLOW_KEY}:${mode}`);
    return;
  }
  storage.removeItem(`${PLAY_FLOW_KEY}:ai`);
  storage.removeItem(`${PLAY_FLOW_KEY}:online`);
}

export function currentStorage(): StorageLike | null {
  return typeof localStorage === "undefined" ? null : localStorage;
}
