type PauseStatus = "running" | "paused" | "countdown";

export interface PauseState {
  status: PauseStatus;
  countdown: 3 | 2 | 1 | null;
}

export type PauseAction =
  | { type: "pause" }
  | { type: "background" }
  | { type: "resume" }
  | { type: "countdown-tick" }
  | { type: "cancel-countdown" }
  | { type: "reset" };

export const initialPauseState: PauseState = { status: "running", countdown: null };

export function reducePauseState(
  state: PauseState,
  action: PauseAction,
  mode: "ai" | "online",
): PauseState {
  if (mode === "online" && action.type !== "reset") return state;

  switch (action.type) {
    case "pause":
    case "background":
      return state.status === "running" || state.status === "countdown"
        ? { status: "paused", countdown: null }
        : state;
    case "resume":
      return state.status === "paused" ? { status: "countdown", countdown: 3 } : state;
    case "countdown-tick":
      if (state.status !== "countdown" || state.countdown === null) return state;
      return state.countdown === 1
        ? initialPauseState
        : { status: "countdown", countdown: (state.countdown - 1) as 2 | 1 };
    case "cancel-countdown":
      return state.status === "countdown" ? { status: "paused", countdown: null } : state;
    case "reset":
      return initialPauseState;
  }
}
