import { describe, expect, it } from "vitest";
import { initialPauseState, reducePauseState } from "./pauseState";

describe("pause state", () => {
  it("allows pausing in AI mode and rejects pause actions online", () => {
    expect(reducePauseState(initialPauseState, { type: "pause" }, "ai").status).toBe("paused");
    expect(reducePauseState(initialPauseState, { type: "pause" }, "online")).toBe(
      initialPauseState,
    );
    expect(reducePauseState(initialPauseState, { type: "background" }, "online")).toBe(
      initialPauseState,
    );
    expect(reducePauseState(initialPauseState, { type: "resume" }, "online")).toBe(
      initialPauseState,
    );
  });

  it("auto-pauses AI when the app backgrounds", () => {
    expect(reducePauseState(initialPauseState, { type: "background" }, "ai")).toEqual({
      status: "paused",
      countdown: null,
    });
  });

  it("resumes only after the 3-2-1 countdown", () => {
    const paused = reducePauseState(initialPauseState, { type: "pause" }, "ai");
    const countdown = reducePauseState(paused, { type: "resume" }, "ai");
    expect(countdown).toEqual({ status: "countdown", countdown: 3 });
    const two = reducePauseState(countdown, { type: "countdown-tick" }, "ai");
    expect(two.countdown).toBe(2);
    const one = reducePauseState(two, { type: "countdown-tick" }, "ai");
    expect(one.countdown).toBe(1);
    expect(reducePauseState(one, { type: "countdown-tick" }, "ai")).toEqual(initialPauseState);
  });

  it("cancels a pending resume if the app backgrounds during the countdown", () => {
    const countdown = reducePauseState(
      reducePauseState(initialPauseState, { type: "pause" }, "ai"),
      { type: "resume" },
      "ai",
    );
    expect(reducePauseState(countdown, { type: "background" }, "ai")).toEqual({
      status: "paused",
      countdown: null,
    });
  });

  it("can cancel a pending resume and reset after leaving a game", () => {
    const countdown = reducePauseState(
      reducePauseState(initialPauseState, { type: "pause" }, "ai"),
      { type: "resume" },
      "ai",
    );
    expect(reducePauseState(countdown, { type: "cancel-countdown" }, "ai").status).toBe("paused");
    expect(reducePauseState(countdown, { type: "reset" }, "ai")).toEqual(initialPauseState);
  });
});
