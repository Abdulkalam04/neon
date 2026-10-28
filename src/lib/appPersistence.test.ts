import { describe, expect, it } from "vitest";
import {
  clearPlayFlow,
  LAST_SCREEN_KEY,
  LAST_SCREEN_MAX_AGE_MS,
  PLAY_FLOW_KEY,
  readLastScreen,
  readPlayFlow,
  writePlayFlow,
  writeLastScreen,
  type StorageLike,
} from "./appPersistence";
import { initialPlayFlow, reducePlayFlow } from "@/game/flow/playFlow";

function memoryStorage(): StorageLike {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

describe("last screen persistence", () => {
  it("round-trips a valid route and search state", () => {
    const storage = memoryStorage();
    writeLastScreen(
      storage,
      { path: "/customize", search: { tab: "style" }, scrollY: 420 },
      10_000,
    );
    expect(readLastScreen(storage, 10_001)).toEqual({
      path: "/customize",
      search: { tab: "style" },
      scrollY: 420,
      savedAt: 10_000,
    });
  });

  it("ignores and removes a stale route", () => {
    const storage = memoryStorage();
    writeLastScreen(storage, { path: "/", search: {}, scrollY: 0 }, 1_000);
    expect(readLastScreen(storage, 1_000 + LAST_SCREEN_MAX_AGE_MS + 1)).toBeNull();
    expect(storage.getItem(LAST_SCREEN_KEY)).toBeNull();
  });

  it("ignores and removes corrupted JSON", () => {
    const storage = memoryStorage();
    storage.setItem(LAST_SCREEN_KEY, "{not json");
    expect(readLastScreen(storage)).toBeNull();
    expect(storage.getItem(LAST_SCREEN_KEY)).toBeNull();
  });

  it("round-trips persisted game flow and removes corrupted flow data", () => {
    const storage = memoryStorage();
    const flow = reducePlayFlow(initialPlayFlow("ai"), {
      type: "choose-difficulty",
      difficulty: "hard",
    });
    writePlayFlow(storage, flow, 123);
    expect(readPlayFlow(storage, "ai")?.state).toEqual(flow);
    storage.setItem(`${PLAY_FLOW_KEY}:online`, "{broken");
    expect(readPlayFlow(storage, "online")).toBeNull();
    clearPlayFlow(storage);
    expect(storage.getItem(`${PLAY_FLOW_KEY}:ai`)).toBeNull();
  });
});
