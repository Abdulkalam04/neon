import { describe, expect, it } from "vitest";
import {
  initialPlayFlow,
  parsePlayMode,
  reducePlayFlow,
  restorePlayFlow,
  type PersistedPlayFlow,
} from "./playFlow";

const death = { killedBy: "Bot", finalScore: 120, bestScore: 150, seconds: 18, kills: 2 };

function saved(
  mode: "ai" | "online",
  phase: PersistedPlayFlow["state"]["phase"],
  overrides: Partial<PersistedPlayFlow["state"]> = {},
): PersistedPlayFlow {
  return {
    version: 1,
    savedAt: 1,
    state: {
      ...initialPlayFlow(mode, "ABCDE"),
      phase,
      death: phase === "dead" ? death : null,
      ...overrides,
    },
  };
}

describe("play flow state machine", () => {
  it("validates the mode query and treats room URLs as online", () => {
    expect(parsePlayMode("ai", false)).toBe("ai");
    expect(parsePlayMode("online", false)).toBe("online");
    expect(parsePlayMode("ai", true)).toBe("online");
    expect(parsePlayMode("unexpected", false)).toBeNull();
  });

  it("transitions AI difficulty, loading, playing, pause, resume, and game over", () => {
    let state = initialPlayFlow("ai");
    state = reducePlayFlow(state, { type: "choose-difficulty", difficulty: "hard" });
    state = reducePlayFlow(state, { type: "start" });
    expect(state.phase).toBe("loading");
    state = reducePlayFlow(state, { type: "loaded" });
    state = reducePlayFlow(state, { type: "pause" });
    expect(state.phase).toBe("paused");
    state = reducePlayFlow(state, { type: "resume" });
    state = reducePlayFlow(state, { type: "die", stats: death });
    expect(state).toMatchObject({ phase: "dead", difficulty: "hard", death });
    expect(reducePlayFlow(state, { type: "play-again" })).toMatchObject({
      phase: "select",
      difficulty: "hard",
      death: null,
    });
  });

  it("rejects online pause and routes online Play Again to lobby", () => {
    let state = initialPlayFlow("online", "ABCDE");
    state = reducePlayFlow(state, { type: "connecting" });
    expect(state.phase).toBe("connecting");
    state = reducePlayFlow(state, { type: "start" });
    state = reducePlayFlow(state, { type: "loaded" });
    expect(reducePlayFlow(state, { type: "pause" })).toBe(state);
    state = reducePlayFlow(state, { type: "die", stats: death });
    expect(reducePlayFlow(state, { type: "play-again" })).toMatchObject({
      mode: "online",
      phase: "lobby",
      room: "ABCDE",
    });
  });

  it.each([
    ["select", "select"],
    ["lobby", "select"],
    ["connecting", "select"],
    ["loading", "select"],
    ["playing", "interrupted"],
    ["paused", "interrupted"],
    ["interrupted", "interrupted"],
    ["dead", "dead"],
  ] as const)("restores AI %s as %s", (savedPhase, expectedPhase) => {
    const restored = restorePlayFlow("ai", "", saved("ai", savedPhase, { difficulty: "hard" }));
    expect(restored.phase).toBe(expectedPhase);
    expect(restored.difficulty).toBe("hard");
    if (expectedPhase === "dead") expect(restored.death).toEqual(death);
  });

  it("restores online sessions to their last game over or lobby with room code", () => {
    expect(restorePlayFlow("online", "", saved("online", "dead"))).toMatchObject({
      phase: "dead",
      room: "ABCDE",
      death,
    });
    for (const phase of [
      "select",
      "lobby",
      "connecting",
      "loading",
      "playing",
      "paused",
      "interrupted",
    ] as const) {
      expect(restorePlayFlow("online", "", saved("online", phase))).toMatchObject({
        phase: "lobby",
        room: "ABCDE",
      });
    }
  });
});
