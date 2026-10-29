import { useNavigate } from "@tanstack/react-router";
import { lazy, memo, Suspense, useCallback, useEffect, useReducer, useRef, useState } from "react";
import { useGameStore } from "@/lib/store";
import {
  CFG,
  createGame,
  DT,
  TICK_RATE,
  update,
  type Difficulty,
  type GameState,
  type Inputs,
  type PlayerInput,
  type Snake,
} from "@/game/core";
import {
  createCamera,
  hexToHue,
  renderGame,
  clearRenderCaches,
  screenToWorld,
  updateCamera,
  worldToScreen,
  type Floater,
  type RenderOptions,
} from "@/game/render/renderGame";
import { releaseSprites } from "@/game/render/spriteSkins";
import {
  playDeath,
  playEat,
  setBoostSound,
  setMuted as setAudioMuted,
  setVolume as setAudioVolume,
  unlockAudio,
  resumeAudio,
  suspendAudio,
} from "@/game/audio";
import {
  addAppStateListener,
  gameStorage,
  setKeepAwake,
  setStatusBarHidden,
  vibrate,
} from "@/lib/platform";
import { Joystick } from "@/components/Joystick";
import {
  BoostMeter,
  DeathScreen,
  Leaderboard,
  Overlay,
  PauseMenu,
  PingBadge,
  ReconnectingBanner,
  ScorePanel,
  type DeathStats,
  type HudData,
} from "@/components/game/Hud";
const OnlineLobby = lazy(() =>
  import("@/components/game/OnlineLobby").then((module) => ({ default: module.OnlineLobby })),
);
import { normalizeRoomCode } from "@/game/net/roomCode";
import { MockConnection } from "@/game/net/MockConnection";
import { WebSocketConnection } from "@/game/net/WebSocketConnection";
import { getSelectedServer, waitForServer } from "@/lib/serverConfig";
import { interpolate, type TimedSnapshot } from "@/game/net/interpolate";
import type { ConnectionStatus, GameConnection, RegionId } from "@/game/net/types";
import { profileDevice } from "@/lib/deviceProfile";
import { provideTapFeedback } from "@/lib/uiFeedback";
import {
  autoTuneStep,
  profileFor,
  type AutoTier,
  type DeviceProfile,
  type QualityProfile,
} from "@/lib/qualityProfile";
import {
  initialPauseState,
  reducePauseState,
  type PauseAction,
  type PauseState,
} from "@/lib/pauseState";
import { clearPlayFlow, currentStorage, readPlayFlow, writePlayFlow } from "@/lib/appPersistence";
import { reducePlayFlow, restorePlayFlow, type PlayMode } from "@/game/flow/playFlow";

type Mode = PlayMode;

const INTERP_DELAY_MS = 100;

interface PerformanceRuntime {
  autoTier: AutoTier;
  profile: QualityProfile;
  batterySaverActive: boolean;
}

const DIFFS: { id: Difficulty; label: string; desc: string; glow: string }[] = [
  { id: "easy", label: "Easy", desc: "15 relaxed bots", glow: "glow-lime" },
  { id: "normal", label: "Normal", desc: "20 bots that fight back", glow: "glow-cyan" },
  { id: "hard", label: "Hard", desc: "25 ruthless hunters", glow: "glow-magenta" },
];

const score = (len: number) => Math.floor(len * 10);
function findSnakeById<T extends { id: number }>(snakes: readonly T[], id: number) {
  for (const snake of snakes) if (snake.id === id) return snake;
  return undefined;
}

interface HudScratch {
  topSnakes: Snake[];
  rows: HudData["rows"];
  rowPool: HudData["rows"];
}

function createHudScratch(): HudScratch {
  const rowPool: HudData["rows"] = [];
  for (let i = 0; i < 10; i++) rowPool.push({ id: 0, name: "", score: 0, me: false });
  return { topSnakes: [], rows: [], rowPool };
}

function updateHudSnapshot(
  state: GameState,
  player: Snake,
  hudRef: { current: HudData | null },
  scratch: HudScratch,
) {
  const { topSnakes, rows, rowPool } = scratch;
  topSnakes.length = 0;
  rows.length = 0;

  let total = 0;
  let rank = 1;
  let passedPlayer = false;
  for (const snake of state.snakes) {
    if (!snake.alive) continue;
    total++;

    if (snake === player) passedPlayer = true;
    else if (passedPlayer ? snake.length > player.length : snake.length >= player.length) rank++;

    let insertAt = 0;
    while (insertAt < topSnakes.length && topSnakes[insertAt]!.length >= snake.length) {
      insertAt++;
    }
    if (insertAt >= 10) continue;
    const nextLength = Math.min(topSnakes.length + 1, 10);
    topSnakes.length = nextLength;
    for (let i = nextLength - 1; i > insertAt; i--) topSnakes[i] = topSnakes[i - 1]!;
    topSnakes[insertAt] = snake;
  }

  rows.length = topSnakes.length;
  for (let i = 0; i < topSnakes.length; i++) {
    const snake = topSnakes[i]!;
    const row = rowPool[i]!;
    row.id = snake.id;
    row.name = snake.name;
    row.score = score(snake.length);
    row.me = snake.isPlayer;
    rows[i] = row;
  }

  const hud = hudRef.current ?? {
    rows,
    score: 0,
    rank: 0,
    total: 0,
    kills: 0,
    boosting: false,
    canBoost: false,
    fuel: 0,
  };
  hud.rows = rows;
  hud.score = score(player.length);
  hud.rank = rank;
  hud.total = total;
  hud.kills = player.kills;
  hud.boosting = player.boosting;
  hud.canBoost = player.length > CFG.minBoostLength;
  hud.fuel = Math.max(0, Math.min(1, (player.length - CFG.minBoostLength) / 60));
  hudRef.current = hud;
}

const floaterPool: Floater[] = [];

function acquireFloater(x: number, y: number, value: string, born: number): Floater {
  const floater = floaterPool.pop() ?? { x: 0, y: 0, text: "", born: 0 };
  floater.x = x;
  floater.y = y;
  floater.text = value;
  floater.born = born;
  return floater;
}

function trimFloaters(floaters: Floater[], now: number) {
  let write = 0;
  for (const floater of floaters) {
    if (now - floater.born < 800) {
      floaters[write++] = floater;
    } else if (floaterPool.length < 40) {
      floaterPool.push(floater);
    }
  }
  if (write > 40) {
    const first = write - 40;
    for (let i = 0; i < first && floaterPool.length < 40; i++) floaterPool.push(floaters[i]!);
    for (let i = 0; i < 40; i++) floaters[i] = floaters[first + i]!;
  }
  floaters.length = Math.min(write, 40);
}

function releaseFloaters(floaters: Floater[]) {
  for (const floater of floaters) if (floaterPool.length < 40) floaterPool.push(floater);
  floaters.length = 0;
}

interface BatteryLike extends EventTarget {
  level: number;
  charging: boolean;
}

export function PlayScreen({ mode, room }: { mode: Mode; room?: string }) {
  const navigate = useNavigate();
  const nickname = useGameStore((s) => s.nickname);
  const skin = useGameStore((s) => s.skin);
  const customServerUrl = useGameStore((s) => s.customServerUrl);
  const vibrationEnabled = useGameStore((s) => s.vibrationEnabled);
  const muted = useGameStore((s) => s.muted);
  const volume = useGameStore((s) => s.volume);
  const showFps = useGameStore((s) => s.showFps);
  const quality = useGameStore((s) => s.quality);
  const batterySaver = useGameStore((s) => s.batterySaver);
  const tutorialSeen = useGameStore((s) => s.tutorialSeen);
  const setMuted = useGameStore((s) => s.setMuted);
  const setVolume = useGameStore((s) => s.setVolume);
  const setShowFps = useGameStore((s) => s.setShowFps);
  const setQuality = useGameStore((s) => s.setQuality);
  const setTutorialSeen = useGameStore((s) => s.setTutorialSeen);
  const setCustomServerUrl = useGameStore((s) => s.setCustomServerUrl);
  const setNickname = useGameStore((s) => s.setNickname);
  const setVibrationEnabled = useGameStore((s) => s.setVibrationEnabled);
  const controlScale = useGameStore((s) => s.controlScale);
  const setControlScale = useGameStore((s) => s.setControlScale);
  const joystickSize = useGameStore((s) => s.joystickSize);
  const setJoystickSize = useGameStore((s) => s.setJoystickSize);
  const joystickOpacity = useGameStore((s) => s.joystickOpacity);
  const setJoystickOpacity = useGameStore((s) => s.setJoystickOpacity);
  const reduceMotion = useGameStore((s) => s.reduceMotion);
  const setReduceMotion = useGameStore((s) => s.setReduceMotion);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [flow, dispatchFlow] = useReducer(
    reducePlayFlow,
    { mode, room: room ?? "" },
    ({ mode: initialMode, room: initialRoom }) => {
      const storage = currentStorage();
      return restorePlayFlow(
        initialMode,
        initialRoom,
        storage ? readPlayFlow(storage, initialMode) : null,
      );
    },
  );
  const { phase, difficulty, death } = flow;
  const gameActive = phase === "playing" || (mode === "ai" && phase === "paused");
  const [runId, setRunId] = useState(0);
  const hudRef = useRef<HudData | null>(null);
  const [pauseState, dispatchPause] = useReducer(
    (state: PauseState, action: PauseAction) => reducePauseState(state, action, mode),
    initialPauseState,
  );
  const paused = mode === "ai" && (flow.phase === "paused" || pauseState.status !== "running");
  const [onlineMenuOpen, setOnlineMenuOpen] = useState(false);
  const [onlineBackgroundWarning, setOnlineBackgroundWarning] = useState(false);
  const [touch, setTouch] = useState(false);
  const [region, setRegion] = useState<RegionId>("asia");
  const [finding, setFinding] = useState(false);
  const [isWakingUp, setIsWakingUp] = useState(false);
  const [wakeElapsedMs, setWakeElapsedMs] = useState(0);
  const [serverError, setServerError] = useState<string | null>(null);
  const netStatusRef = useRef<ConnectionStatus>("disconnected");
  const pingRef = useRef(0);
  const fpsRef = useRef(0);
  const autoTierRef = useRef<AutoTier>(2);
  const tuningStepRef = useRef(0);
  const lowBatteryRef = useRef(false);
  const batterySaverActive = batterySaver || lowBatteryRef.current;
  const profile = profileFor(
    quality,
    autoTierRef.current,
    quality === "auto" ? tuningStepRef.current : 0,
  );
  const showTutorial =
    mode === "ai"
      ? phase === "playing" && !tutorialSeen && !paused
      : phase === "lobby" && !tutorialSeen;
  const deviceProfile = useRef<DeviceProfile | null>(null);
  const phaseRef = useRef(phase);
  const modeRef = useRef(mode);
  const pauseStateRef = useRef(pauseState);
  const onlineBackgrounded = useRef(false);
  const onlineWarningTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  phaseRef.current = phase;
  modeRef.current = mode;
  pauseStateRef.current = pauseState;
  const loadingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deathTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (flow.mode !== mode) {
      const storage = currentStorage();
      dispatchFlow({
        type: "restore",
        mode,
        room: room ?? "",
        persisted: storage ? readPlayFlow(storage, mode) : null,
      });
      setRunId(0);
      return;
    }
    if (mode === "online" && flow.room !== (room ?? "")) {
      dispatchFlow({ type: "set-room", room: room ?? "" });
    }
  }, [flow.mode, flow.room, mode, room]);

  useEffect(() => {
    const storage = currentStorage();
    if (storage && flow.mode === mode) writePlayFlow(storage, flow);
  }, [flow, mode]);
  useEffect(
    () => () => {
      if (loadingTimer.current) clearTimeout(loadingTimer.current);
      if (deathTimer.current) clearTimeout(deathTimer.current);
    },
    [],
  );
  const connRef = useRef<GameConnection | null>(null);
  const connectionAttemptRef = useRef(0);
  const connectionAbortRef = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      connectionAttemptRef.current++;
      connectionAbortRef.current?.abort();
      connectionAbortRef.current = null;
      connRef.current?.disconnect();
      connRef.current = null;
      setBoostSound(false);
      suspendAudio();
    },
    [],
  );

  const inputRef = useRef<
    PlayerInput & { mouse: { x: number; y: number } | null; joyAngle: number | null }
  >({
    angle: null,
    boost: false,
    mouse: null,
    joyAngle: null,
  });
  const resetInput = useCallback(() => {
    inputRef.current.boost = false;
    inputRef.current.angle = null;
    inputRef.current.joyAngle = null;
    inputRef.current.mouse = null;
    window.dispatchEvent(new Event("neon-reset-input"));
  }, []);
  const requestPause = useCallback(
    (action: "pause" | "background" = "pause") => {
      const currentPhase = phaseRef.current;
      if (
        mode !== "ai" ||
        (currentPhase !== "playing" && !(action === "background" && currentPhase === "paused"))
      )
        return;
      resetInput();
      live.current.paused = true;
      setBoostSound(false);
      suspendAudio();
      dispatchFlow({ type: "pause" });
      dispatchPause({ type: action });
    },
    [mode, resetInput],
  );
  const requestResume = useCallback(() => {
    if (mode !== "ai") return;
    resetInput();
    resumeAudio();
    dispatchPause({ type: "resume" });
  }, [mode, resetInput]);
  const cancelResume = useCallback(() => {
    if (mode !== "ai") return;
    resetInput();
    setBoostSound(false);
    suspendAudio();
    dispatchPause({ type: "cancel-countdown" });
  }, [mode, resetInput]);
  const live = useRef({
    nickname,
    difficulty,
    skin,
    quality,
    profile,
    autoTier: autoTierRef.current,
    batterySaverSetting: batterySaver,
    batterySaverActive,
    appActive: true,
    vibrationEnabled,
    reduceMotion,
    paused: false,
  });
  live.current.nickname = nickname;
  live.current.difficulty = difficulty;
  live.current.skin = skin;
  live.current.quality = quality;
  live.current.profile = profile;
  live.current.autoTier = autoTierRef.current;
  live.current.batterySaverSetting = batterySaver;
  live.current.batterySaverActive = batterySaverActive;
  live.current.vibrationEnabled = vibrationEnabled;
  live.current.reduceMotion = reduceMotion;

  const applyTuningStep = useCallback((next: number) => {
    if (next === tuningStepRef.current) return;
    tuningStepRef.current = next;
    const activeQuality = live.current["quality"];
    live.current.profile = profileFor(
      activeQuality,
      live.current.autoTier,
      activeQuality === "auto" ? next : 0,
    );
    const root = canvasRef.current?.parentElement;
    if (root) {
      root.dataset["quality"] =
        activeQuality === "auto" ? `tier-${live.current.autoTier}` : activeQuality;
    }
  }, []);

  useEffect(
    () => () => {
      clearRenderCaches();
      releaseSprites();
    },
    [],
  );
  live.current.paused = mode === "ai" && (paused || showTutorial);

  useEffect(() => setTouch(window.matchMedia("(pointer: coarse)").matches), []);
  useEffect(() => {
    let active = true;
    const savedTier = Promise.resolve(gameStorage.getItem("neon-auto-tier")).catch(
      (error: unknown) => {
        console.error("Saved graphics tier could not be loaded", error);
        return null;
      },
    );
    void Promise.all([profileDevice(), savedTier])
      .then(([result, saved]) => {
        if (!active) return;
        deviceProfile.current = result;
        const parsedTier = saved === null ? NaN : Number(saved);
        const tier =
          Number.isInteger(parsedTier) && parsedTier >= 0 && parsedTier <= 3
            ? (parsedTier as AutoTier)
            : result.tier;
        autoTierRef.current = tier;
        live.current.autoTier = tier;
        live.current.profile = profileFor(
          live.current["quality"],
          tier,
          live.current["quality"] === "auto" ? tuningStepRef.current : 0,
        );
        const root = canvasRef.current?.parentElement;
        if (root) {
          root.dataset["quality"] =
            live.current["quality"] === "auto" ? `tier-${tier}` : live.current["quality"];
        }
        if (saved === null || tier !== parsedTier) {
          void Promise.resolve(gameStorage.setItem("neon-auto-tier", String(tier))).catch(
            (error: unknown) => console.error("Saved graphics tier could not be updated", error),
          );
        }
      })
      .catch((error: unknown) => console.error("Device graphics profiling failed", error));
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    clearRenderCaches();
  }, [quality]);
  useEffect(() => {
    let battery: BatteryLike | null = null;
    const updateBattery = () => {
      if (!battery) return;
      lowBatteryRef.current = !battery.charging && battery.level < 0.2;
      live.current.batterySaverActive = live.current.batterySaverSetting || lowBatteryRef.current;
    };
    const nav = navigator as Navigator & { getBattery?: () => Promise<BatteryLike> };
    if (!nav.getBattery) return;
    let active = true;
    void nav
      .getBattery()
      .then((result) => {
        if (!active) return;
        battery = result;
        updateBattery();
        battery.addEventListener("levelchange", updateBattery);
        battery.addEventListener("chargingchange", updateBattery);
      })
      .catch((error: unknown) => console.error("Battery status lookup failed", error));
    return () => {
      active = false;
      battery?.removeEventListener("levelchange", updateBattery);
      battery?.removeEventListener("chargingchange", updateBattery);
    };
  }, []);
  useEffect(() => setAudioMuted(muted), [muted]);
  useEffect(() => setAudioVolume(volume), [volume]);
  useEffect(() => {
    if (mode === "ai" && showTutorial) {
      resetInput();
      setBoostSound(false);
      suspendAudio();
    }
  }, [mode, resetInput, showTutorial]);

  useEffect(() => {
    if (pauseState.status !== "countdown" || mode !== "ai") return;
    const timer = setInterval(() => dispatchPause({ type: "countdown-tick" }), 1000);
    return () => clearInterval(timer);
  }, [mode, pauseState.status]);

  useEffect(() => {
    if (mode === "ai" && flow.phase === "paused" && pauseState.status === "running") {
      dispatchFlow({ type: "resume" });
    }
  }, [flow.phase, mode, pauseState.status]);

  useEffect(() => {
    if (mode === "online") {
      dispatchPause({ type: "reset" });
    }
  }, [mode]);

  useEffect(() => {
    let active = true;
    let removeAppStateListener: () => void | Promise<void> = () => undefined;

    const setAppActive = (isActive: boolean) => {
      live.current.appActive = isActive;
      window.dispatchEvent(new CustomEvent("neon-app-state", { detail: isActive }));
      if (!isActive) {
        releaseSprites();
        onlineBackgrounded.current = modeRef.current === "online" && phaseRef.current === "playing";
        if (modeRef.current === "ai") {
          requestPause("background");
        } else {
          resetInput();
          setBoostSound(false);
          suspendAudio();
        }
        return;
      }

      if (modeRef.current === "online") {
        resumeAudio();
        if (onlineBackgrounded.current && phaseRef.current === "playing") {
          setOnlineBackgroundWarning(true);
          if (onlineWarningTimer.current) clearTimeout(onlineWarningTimer.current);
          onlineWarningTimer.current = setTimeout(() => setOnlineBackgroundWarning(false), 7000);
        }
      }
      onlineBackgrounded.current = false;
    };
    const onVisibilityChange = () => setAppActive(!document.hidden);
    const onPageHide = () => setAppActive(false);
    const onPageShow = () => {
      if (!document.hidden) setAppActive(true);
    };
    const onOrientationChange = () => {
      resetInput();
      setBoostSound(false);
      if (modeRef.current === "ai") {
        requestPause("background");
      }
    };

    void addAppStateListener(setAppActive)
      .then((remove) => {
        if (active) removeAppStateListener = remove;
        else void remove();
      })
      .catch(console.error);

    document.addEventListener("visibilitychange", onVisibilityChange);
    const onAndroidBack = (event: Event) => {
      if (modeRef.current === "online") {
        if (phaseRef.current !== "playing") return;
        event.preventDefault();
        resetInput();
        setOnlineMenuOpen((open) => !open);
      } else {
        if (phaseRef.current !== "playing" && phaseRef.current !== "paused") return;
        event.preventDefault();
        if (pauseStateRef.current.status === "running") requestPause();
        else requestResume();
      }
    };
    window.addEventListener("neon-android-back", onAndroidBack);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("orientationchange", onOrientationChange);

    return () => {
      active = false;
      void removeAppStateListener();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("neon-android-back", onAndroidBack);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("orientationchange", onOrientationChange);
      if (onlineWarningTimer.current) clearTimeout(onlineWarningTimer.current);
    };
  }, [navigate, requestPause, requestResume, resetInput]);

  useEffect(() => {
    const inGame = phase === "playing";
    void setStatusBarHidden(inGame).catch(console.error);
    void setKeepAwake(inGame).catch(console.error);
    return () => {
      void setKeepAwake(false).catch(console.error);
      void setStatusBarHidden(false).catch(console.error);
    };
  }, [phase]);

  // Esc is an AI-only pause shortcut; online worlds always remain live.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || (phase !== "playing" && phase !== "paused") || mode !== "ai")
        return;
      e.preventDefault();
      if (pauseState.status === "running") requestPause();
      else if (pauseState.status === "paused") requestResume();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, phase, pauseState.status, requestPause, requestResume]);

  useEffect(() => {
    if (runId === 0 || mode === "online" || !gameActive) return;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const state: GameState = createGame({
      difficulty: live.current.difficulty,
      playerName: live.current.nickname.trim() || "Player",
      playerHue: hexToHue(live.current.skin.primary),
      seed: Date.now() & 0x7fffffff || 1,
    });
    const simulationInput: PlayerInput = { angle: null, boost: false };
    const simulationInputs: Inputs = { [state.playerId]: simulationInput };
    const cam = createCamera();
    const view = { w: 0, h: 0 };
    const headScreen = { x: 0, y: 0 };
    const mouseWorld = { x: 0, y: 0 };
    let backingScale = 1;
    let resizeProfileScale = -1;
    let resizeTier = -1;
    const resize = () => {
      view.w = canvas.clientWidth;
      view.h = canvas.clientHeight;
      const profile = live.current.profile;
      resizeProfileScale = profile.resolutionScale;
      resizeTier = live.current.autoTier;
      const dprCap = live.current.autoTier <= 1 ? 1.5 : 2;
      backingScale = Math.min(
        Math.min(window.devicePixelRatio || 1, dprCap) * profile.resolutionScale,
        (live.current.autoTier <= 1 ? 2048 : 4096) / Math.max(view.w, view.h, 1),
      );
      const width = Math.max(1, Math.round(view.w * backingScale));
      const height = Math.max(1, Math.round(view.h * backingScale));
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
    };
    resize();
    window.addEventListener("resize", resize);

    const inp = inputRef.current;
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "mouse") {
        if (inp.mouse) {
          inp.mouse.x = e.clientX;
          inp.mouse.y = e.clientY;
        } else {
          inp.mouse = { x: e.clientX, y: e.clientY };
        }
      }
    };
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button === 0 && !live.current.paused) inp.boost = true;
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerType === "mouse") inp.boost = false;
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        inp.boost = e.type === "keydown" && !live.current.paused;
      }
    };
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    // Reset boost if the page is hidden or the window loses focus (stuck-boost safety).
    const resetBoost = () => {
      inp.boost = false;
    };
    window.addEventListener("blur", resetBoost);
    document.addEventListener("visibilitychange", resetBoost);

    let appActive = live.current.appActive;
    const floaters: Floater[] = [];
    const renderOptions: RenderOptions = {
      time: 0,
      playerSkin: live.current.skin,
      mouseWorld: null,
      profile: live.current.profile,
      shake: 0,
      floaters,
    };
    let shake = 0;
    let best = 0;
    let aliveTicks = 0;
    let dead = false;
    let raf = 0,
      acc = 0,
      last = performance.now(),
      gameTime = 0,
      frame = 0;
    let fpsFrames = 0,
      fpsStart = last;
    let slowSince = 0,
      fastSince = 0,
      lastTuneAt = -Infinity,
      lastDraw = 0,
      averageFrameMs = 16.67;
    let previousBoost = false;
    const hudScratch = createHudScratch();

    const loop = (now: number) => {
      if (document.hidden || !appActive) {
        raf = 0;
        return;
      }
      const frameMs = now - last;
      const elapsed = Math.min(0.1, frameMs / 1000);
      last = now;
      averageFrameMs = averageFrameMs * 0.9 + frameMs * 0.1;
      if (live.current.quality === "auto" && !live.current.batterySaverActive) {
        if (averageFrameMs > 20) {
          slowSince ||= now;
          fastSince = 0;
          if (now - slowSince >= 800 && now - lastTuneAt >= 2500) {
            const next = autoTuneStep(tuningStepRef.current, "down", true);
            applyTuningStep(next);
            lastTuneAt = now;
            slowSince = now;
          }
        } else if (averageFrameMs < 14) {
          fastSince ||= now;
          slowSince = 0;
          if (now - fastSince >= 8000 && now - lastTuneAt >= 6000) {
            const next = autoTuneStep(tuningStepRef.current, "up", true);
            applyTuningStep(next);
            lastTuneAt = now;
            fastSince = now;
          }
        } else {
          slowSince = 0;
          fastSince = 0;
        }
      }
      const player = findSnakeById(state.snakes, state.playerId)!;

      if (inp.joyAngle !== null) inp.angle = inp.joyAngle;
      else if (inp.mouse) {
        const hs = worldToScreen(cam, view, player.body[0]!, headScreen);
        inp.angle = Math.atan2(inp.mouse.y - hs.y, inp.mouse.x - hs.x);
      }

      if (!live.current.paused) {
        acc = Math.min(acc + elapsed, DT * 3);
        gameTime += elapsed * 1000;
        let catchUpSteps = 0;
        while (acc >= DT && catchUpSteps < 3) {
          if (live.current.vibrationEnabled && inp.boost && !previousBoost)
            void vibrate("boost").catch(console.error);
          previousBoost = inp.boost;
          simulationInput.angle = inp.angle;
          simulationInput.boost = inp.boost;
          update(state, simulationInputs, DT);
          acc -= DT;
          catchUpSteps++;
          if (player.alive) {
            aliveTicks++;
            best = Math.max(best, player.length);
          }
          for (const e of state.events) {
            if (e.type === "eat") {
              floaters.push(
                acquireFloater(e.x, e.y, `+${Math.max(1, Math.round(e.value * 10))}`, gameTime),
              );
              if (live.current.appActive) playEat();
              if (e.value >= 5 && e.snakeId === state.playerId) {
                if (live.current.vibrationEnabled) void vibrate("big-eat").catch(console.error);
              }
            } else if (e.type === "death" && e.isPlayer && !dead) {
              dead = true;
              inp.boost = false; // reset boost on death
              shake = 1;
              if (live.current.appActive) playDeath();
              if (live.current.vibrationEnabled) void vibrate("death").catch(console.error);
              const stats: DeathStats = {
                killedBy: e.killerName,
                finalScore: score(player.length),
                rank: hudRef.current?.rank ?? 0,
                bestScore: score(best),
                seconds: aliveTicks / TICK_RATE,
                kills: player.kills,
              };
              if (deathTimer.current) clearTimeout(deathTimer.current);
              deathTimer.current = setTimeout(() => {
                dispatchFlow({ type: "die", stats });
              }, 1100);
            }
          }
        }
      } else {
        acc = 0;
        previousBoost = false;
      }

      setBoostSound(player.alive && player.boosting && !live.current.paused);
      trimFloaters(floaters, gameTime);
      if (!live.current.paused) shake = Math.max(0, shake - elapsed * 1.8);

      if (!live.current.paused) updateCamera(cam, state, view, 1 / 60);
      if (live.current.batterySaverActive && now - lastDraw < 1000 / 30) {
        raf = requestAnimationFrame(loop);
        return;
      }
      if (
        resizeProfileScale !== live.current.profile.resolutionScale ||
        resizeTier !== live.current.autoTier
      ) {
        resize();
      }
      if (!view.w || !view.h) {
        raf = requestAnimationFrame(loop);
        return;
      }
      lastDraw = now;
      fpsFrames++;
      if (now - fpsStart >= 500) {
        fpsRef.current = Math.round((fpsFrames * 1000) / (now - fpsStart));
        fpsFrames = 0;
        fpsStart = now;
      }
      ctx.setTransform(canvas.width / view.w, 0, 0, canvas.height / view.h, 0, 0);
      renderOptions.time = gameTime;
      renderOptions.playerSkin = live.current.skin;
      renderOptions.mouseWorld = inp.mouse ? screenToWorld(cam, view, inp.mouse, mouseWorld) : null;
      renderOptions.profile = live.current.profile;
      renderOptions.shake = live.current.profile.shake && !live.current.reduceMotion ? shake : 0;
      renderGame(ctx, state, cam, view, renderOptions);

      if (frame++ % 12 === 0) updateHudSnapshot(state, player, hudRef, hudScratch);
      raf = requestAnimationFrame(loop);
    };
    const handleActivity = (isActive: boolean) => {
      appActive = isActive;
      live.current.appActive = isActive;
      resetBoost();
      if (!isActive) {
        releaseSprites();
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        setBoostSound(false);
        suspendAudio();
        clearRenderCaches();
      } else {
        last = performance.now();
        lastDraw = 0;
        fpsFrames = 0;
        fpsStart = last;
        averageFrameMs = 16.67;
        slowSince = 0;
        fastSince = 0;
        lastTuneAt = last;
        if (!raf) raf = requestAnimationFrame(loop);
      }
    };
    const onVisibilityChange = () => handleActivity(!document.hidden);
    const onAppState = (event: Event) => {
      if (event instanceof CustomEvent && typeof event.detail === "boolean") {
        handleActivity(event.detail);
      }
    };
    const onContextLost = (event: Event) => {
      event.preventDefault();
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      clearRenderCaches();
    };
    const onContextRestored = () => {
      clearRenderCaches();
      if (!document.hidden && appActive && !raf) raf = requestAnimationFrame(loop);
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("neon-app-state", onAppState);
    window.addEventListener("pagehide", clearRenderCaches);
    canvas.addEventListener("contextlost", onContextLost);
    canvas.addEventListener("contextrestored", onContextRestored);
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      releaseFloaters(floaters);
      setBoostSound(false);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
      window.removeEventListener("blur", resetBoost);
      document.removeEventListener("visibilitychange", resetBoost);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("neon-app-state", onAppState);
      window.removeEventListener("pagehide", clearRenderCaches);
      canvas.removeEventListener("contextlost", onContextLost);
      canvas.removeEventListener("contextrestored", onContextRestored);
      inp.boost = false;
      inp.angle = null;
      inp.joyAngle = null;
    };
  }, [applyTuningStep, gameActive, mode, runId]);

  // Online: render snapshots from the connection, interpolated INTERP_DELAY_MS behind.
  useEffect(() => {
    if (runId === 0 || mode !== "online" || phase !== "playing") return;
    const conn = connRef.current;
    if (!conn) return;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const cam = createCamera();
    const view = { w: 0, h: 0 };
    const headScreen = { x: 0, y: 0 };
    const mouseWorld = { x: 0, y: 0 };
    let backingScale = 1;
    let resizeProfileScale = -1;
    let resizeTier = -1;
    const resize = () => {
      view.w = canvas.clientWidth;
      view.h = canvas.clientHeight;
      const profile = live.current.profile;
      resizeProfileScale = profile.resolutionScale;
      resizeTier = live.current.autoTier;
      const dprCap = live.current.autoTier <= 1 ? 1.5 : 2;
      backingScale = Math.min(
        Math.min(window.devicePixelRatio || 1, dprCap) * profile.resolutionScale,
        (live.current.autoTier <= 1 ? 2048 : 4096) / Math.max(view.w, view.h, 1),
      );
      const width = Math.max(1, Math.round(view.w * backingScale));
      const height = Math.max(1, Math.round(view.h * backingScale));
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
    };
    resize();
    window.addEventListener("resize", resize);

    const inp = inputRef.current;
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "mouse") {
        if (inp.mouse) {
          inp.mouse.x = e.clientX;
          inp.mouse.y = e.clientY;
        } else {
          inp.mouse = { x: e.clientX, y: e.clientY };
        }
      }
    };
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button === 0) inp.boost = true;
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerType === "mouse") inp.boost = false;
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        inp.boost = e.type === "keydown";
      }
    };
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    // Stuck-boost safety: clear boost if the page hides or window loses focus.
    const resetBoost = () => {
      inp.boost = false;
    };
    window.addEventListener("blur", resetBoost);
    document.addEventListener("visibilitychange", resetBoost);

    let appActive = live.current.appActive;
    const buffer: TimedSnapshot[] = [];
    const floaters: Floater[] = [];
    const renderOptions: RenderOptions = {
      time: 0,
      playerSkin: live.current.skin,
      mouseWorld: null,
      profile: live.current.profile,
      shake: 0,
      floaters,
    };
    let shake = 0,
      best = 0,
      dead = false,
      raf = 0,
      frame = 0;
    const startedAt = performance.now();
    let last = startedAt;
    let fpsFrames = 0,
      fpsStart = startedAt;
    let slowSince = 0,
      fastSince = 0,
      lastTuneAt = -Infinity,
      lastDraw = 0,
      averageFrameMs = 16.67;
    let previousBoost = false;
    const hudScratch = createHudScratch();

    conn.onState((snap) => {
      const now = performance.now();
      buffer.push({ snap, at: now });
      if (buffer.length > 30) buffer.splice(0, buffer.length - 30);
      const me = findSnakeById(snap.snakes, snap.youId);
      if (me?.alive) best = Math.max(best, me.length);
      for (const e of snap.events) {
        if (e.type === "eat" && e.snakeId === snap.youId) {
          floaters.push(acquireFloater(e.x, e.y, `+${Math.max(1, Math.round(e.value * 10))}`, now));
          if (live.current.appActive) playEat();
          if (live.current.vibrationEnabled && e.value >= 5)
            void vibrate("big-eat").catch(console.error);
        } else if (e.type === "death" && e.snakeId === snap.youId && !dead) {
          dead = true;
          inp.boost = false; // reset boost on death
          shake = 1;
          if (live.current.appActive) playDeath();
          if (live.current.vibrationEnabled) void vibrate("death").catch(console.error);
          const stats: DeathStats = {
            killedBy: e.killerName,
            finalScore: score(me?.length ?? 0),
            rank: hudRef.current?.rank ?? 0,
            bestScore: score(best),
            seconds: (now - startedAt) / 1000,
            kills: me?.kills ?? 0,
          };
          if (deathTimer.current) clearTimeout(deathTimer.current);
          deathTimer.current = setTimeout(() => {
            conn.disconnect();
            connRef.current = null;
            dispatchFlow({ type: "die", stats });
          }, 1100);
        }
      }
    });

    const loop = (now: number) => {
      if (document.hidden || !appActive) {
        raf = 0;
        return;
      }
      const frameMs = now - last;
      const elapsed = Math.min(0.1, frameMs / 1000);
      last = now;
      averageFrameMs = averageFrameMs * 0.9 + frameMs * 0.1;
      if (live.current.quality === "auto" && !live.current.batterySaverActive) {
        if (averageFrameMs > 20) {
          slowSince ||= now;
          fastSince = 0;
          if (now - slowSince >= 800 && now - lastTuneAt >= 2500) {
            const next = autoTuneStep(tuningStepRef.current, "down", true);
            applyTuningStep(next);
            lastTuneAt = now;
            slowSince = now;
          }
        } else if (averageFrameMs < 14) {
          fastSince ||= now;
          slowSince = 0;
          if (now - fastSince >= 8000 && now - lastTuneAt >= 6000) {
            const next = autoTuneStep(tuningStepRef.current, "up", true);
            applyTuningStep(next);
            lastTuneAt = now;
            fastSince = now;
          }
        } else {
          slowSince = 0;
          fastSince = 0;
        }
      }
      const state = interpolate(buffer, now - INTERP_DELAY_MS);
      if (live.current.vibrationEnabled && inp.boost && !previousBoost)
        void vibrate("boost").catch(console.error);
      previousBoost = inp.boost;
      if (state) {
        const player = findSnakeById(state.snakes, state.playerId);
        if (player) {
          if (inp.joyAngle !== null) inp.angle = inp.joyAngle;
          else if (inp.mouse) {
            const hs = worldToScreen(cam, view, player.body[0]!, headScreen);
            inp.angle = Math.atan2(inp.mouse.y - hs.y, inp.mouse.x - hs.x);
          }
          conn.sendInput(inp.angle, inp.boost);
          setBoostSound(player.alive && player.boosting);
        }
        trimFloaters(floaters, now);
        shake = Math.max(0, shake - elapsed * 1.8);
        updateCamera(cam, state, view, 1 / 60);
        if (live.current.batterySaverActive && now - lastDraw < 1000 / 30) {
          raf = requestAnimationFrame(loop);
          return;
        }
        if (
          resizeProfileScale !== live.current.profile.resolutionScale ||
          resizeTier !== live.current.autoTier
        ) {
          resize();
        }
        if (!view.w || !view.h) {
          raf = requestAnimationFrame(loop);
          return;
        }
        lastDraw = now;
        fpsFrames++;
        if (now - fpsStart >= 500) {
          fpsRef.current = Math.round((fpsFrames * 1000) / (now - fpsStart));
          fpsFrames = 0;
          fpsStart = now;
        }
        ctx.setTransform(canvas.width / view.w, 0, 0, canvas.height / view.h, 0, 0);
        renderOptions.time = now;
        renderOptions.playerSkin = live.current.skin;
        renderOptions.mouseWorld = inp.mouse
          ? screenToWorld(cam, view, inp.mouse, mouseWorld)
          : null;
        renderOptions.profile = live.current.profile;
        renderOptions.shake = live.current.profile.shake && !live.current.reduceMotion ? shake : 0;
        renderGame(ctx, state, cam, view, renderOptions);
        if (player && frame++ % 12 === 0) updateHudSnapshot(state, player, hudRef, hudScratch);
      }
      raf = requestAnimationFrame(loop);
    };
    const handleActivity = (isActive: boolean) => {
      appActive = isActive;
      live.current.appActive = isActive;
      resetBoost();
      if (!isActive) {
        releaseSprites();
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        setBoostSound(false);
        suspendAudio();
        clearRenderCaches();
      } else {
        last = performance.now();
        lastDraw = 0;
        fpsFrames = 0;
        fpsStart = last;
        averageFrameMs = 16.67;
        slowSince = 0;
        fastSince = 0;
        lastTuneAt = last;
        resumeAudio();
        if (!raf) raf = requestAnimationFrame(loop);
      }
    };
    const onVisibilityChange = () => handleActivity(!document.hidden);
    const onAppState = (event: Event) => {
      if (event instanceof CustomEvent && typeof event.detail === "boolean") {
        handleActivity(event.detail);
      }
    };
    const onContextLost = (event: Event) => {
      event.preventDefault();
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      clearRenderCaches();
    };
    const onContextRestored = () => {
      clearRenderCaches();
      if (!document.hidden && appActive && !raf) raf = requestAnimationFrame(loop);
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("neon-app-state", onAppState);
    window.addEventListener("pagehide", clearRenderCaches);
    canvas.addEventListener("contextlost", onContextLost);
    canvas.addEventListener("contextrestored", onContextRestored);
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      releaseFloaters(floaters);
      setBoostSound(false);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
      window.removeEventListener("blur", resetBoost);
      document.removeEventListener("visibilitychange", resetBoost);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("neon-app-state", onAppState);
      window.removeEventListener("pagehide", clearRenderCaches);
      canvas.removeEventListener("contextlost", onContextLost);
      canvas.removeEventListener("contextrestored", onContextRestored);
      inp.boost = false;
      inp.angle = null;
      inp.joyAngle = null;
    };
  }, [applyTuningStep, mode, phase, runId]);

  const playVsAi = () => {
    connectionAttemptRef.current++;
    connectionAbortRef.current?.abort();
    connectionAbortRef.current = null;
    resetInput();
    dispatchPause({ type: "reset" });
    dispatchFlow({ type: "restore", mode: "ai", room: "", persisted: null });
    const storage = currentStorage();
    if (storage) clearPlayFlow(storage, "online");
    setOnlineMenuOpen(false);
    connRef.current?.disconnect();
    connRef.current = null;
    setServerError(null);
    setIsWakingUp(false);
    setWakeElapsedMs(0);
    setFinding(false);
    navigate({ to: "/play", search: { mode: "ai" }, replace: true });
  };

  const startOnline = async () => {
    const attempt = ++connectionAttemptRef.current;
    connectionAbortRef.current?.abort();
    const abortController = new AbortController();
    connectionAbortRef.current = abortController;
    if (flow.phase !== "lobby") dispatchFlow({ type: "return-to-lobby" });
    dispatchFlow({ type: "connecting" });
    unlockAudio();
    setAudioMuted(muted);
    connRef.current?.disconnect();
    hudRef.current = null;
    dispatchPause({ type: "reset" });
    setOnlineMenuOpen(false);
    setFinding(true);
    setServerError(null);
    setIsWakingUp(true);
    setWakeElapsedMs(0);

    try {
      const server = getSelectedServer(customServerUrl);
      await waitForServer(
        server,
        (elapsedMs) => {
          setIsWakingUp(true);
          setWakeElapsedMs(elapsedMs);
        },
        60_000,
        abortController.signal,
      );
      if (connectionAttemptRef.current !== attempt) return;

      const conn = new WebSocketConnection(region, server.wsUrl);
      connRef.current = conn;
      conn.onStatus((status, ping) => {
        pingRef.current = ping;
        if (netStatusRef.current !== status) {
          netStatusRef.current = status;
        }
      });
      await conn.connect(nickname.trim() || "Player", skin, room || flow.room);
      setIsWakingUp(false);
      if (connRef.current !== conn) return;
      setFinding(false);
      beginLoading();
    } catch (error) {
      if (connectionAttemptRef.current !== attempt) return;
      connRef.current?.disconnect();
      connRef.current = null;
      setIsWakingUp(false);
      setFinding(false);
      setServerError(
        error instanceof Error
          ? error.message
          : "The multiplayer server is unreachable. Please try again.",
      );
    } finally {
      if (connectionAbortRef.current === abortController) connectionAbortRef.current = null;
    }
  };

  const beginLoading = () => {
    dispatchFlow({ type: "start" });
    setRunId((r) => r + 1);
    if (loadingTimer.current) clearTimeout(loadingTimer.current);
    loadingTimer.current = setTimeout(() => dispatchFlow({ type: "loaded" }), 650);
  };

  const start = () => {
    if (mode === "online") {
      void startOnline();
      return;
    }
    unlockAudio();
    setAudioMuted(muted);
    setAudioVolume(volume);
    hudRef.current = null;
    resetInput();
    dispatchPause({ type: "reset" });
    setOnlineMenuOpen(false);
    beginLoading();
  };

  const restartToDifficulty = () => {
    if (mode !== "ai") return;
    connectionAttemptRef.current++;
    connectionAbortRef.current?.abort();
    connectionAbortRef.current = null;
    resetInput();
    dispatchPause({ type: "reset" });
    setRunId(0);
    hudRef.current = null;
    if (deathTimer.current) clearTimeout(deathTimer.current);
    if (loadingTimer.current) clearTimeout(loadingTimer.current);
    dispatchFlow({ type: "play-again" });
  };

  const playAgain = () => {
    if (deathTimer.current) clearTimeout(deathTimer.current);
    if (loadingTimer.current) clearTimeout(loadingTimer.current);
    setRunId(0);
    hudRef.current = null;
    if (mode === "ai") {
      resetInput();
      dispatchPause({ type: "reset" });
      setRunId(0);
      dispatchFlow({ type: "play-again" });
      beginLoading();
      return;
    }
    connRef.current?.disconnect();
    connRef.current = null;
    dispatchFlow({ type: "play-again" });
    void startOnline();
  };

  const returnToMainMenu = () => {
    connectionAttemptRef.current++;
    connectionAbortRef.current?.abort();
    connectionAbortRef.current = null;
    resetInput();
    connRef.current?.disconnect();
    connRef.current = null;
    dispatchPause({ type: "reset" });
    const storage = currentStorage();
    if (storage) clearPlayFlow(storage);
    navigate({ to: "/", replace: true });
  };

  const leaveGame = () => {
    const message =
      mode === "ai"
        ? "Your current game will be lost. Return to the main menu?"
        : "You will leave the match and your snake will die. Leave match?";
    if (!window.confirm(message)) return;
    resetInput();
    connRef.current?.disconnect();
    connRef.current = null;
    dispatchPause({ type: "reset" });
    returnToMainMenu();
  };

  const toggleMute = useCallback(() => setMuted(!muted), [muted, setMuted]);
  const openGameMenu = useCallback(() => {
    if (mode === "ai") requestPause();
    else {
      resetInput();
      setOnlineMenuOpen(true);
    }
  }, [mode, requestPause, resetInput]);
  const showHud = phase === "playing";

  return (
    <div
      className="game-screen screen-enter relative w-screen overflow-hidden bg-background select-none"
      data-reduce-motion={reduceMotion}
      data-quality={quality === "auto" ? `tier-${autoTierRef.current}` : quality}
      onClickCapture={(event) =>
        provideTapFeedback(event.target, { vibrationEnabled, muted, volume })
      }
    >
      <canvas ref={canvasRef} className="h-full w-full touch-none cursor-crosshair" />

      <LiveGameHud
        hudRef={hudRef}
        fpsRef={fpsRef}
        pingRef={pingRef}
        netStatusRef={netStatusRef}
        mode={mode}
        muted={muted}
        onToggleMute={toggleMute}
        onOpenMenu={openGameMenu}
        showHud={showHud}
        showPerformance={phase === "playing" || (mode === "ai" && paused)}
        showFps={showFps}
        runtimeRef={live}
      />
      <ConnectionStatusOverlay
        mode={mode}
        showHud={showHud}
        statusRef={netStatusRef}
        onReconnect={() => {
          dispatchFlow({ type: "return-to-lobby" });
          void startOnline();
        }}
        onPlayOffline={playVsAi}
      />
      {mode === "online" && phase === "playing" && onlineBackgroundWarning && (
        <div
          role="status"
          className="glass pointer-events-none absolute inset-safe-top left-1/2 z-20 mt-16 -translate-x-1/2 rounded-full px-4 py-2 text-center text-xs text-amber-200"
        >
          You were vulnerable while away. Reconnecting to the live match…
        </div>
      )}

      {phase === "loading" && (
        <Overlay dim>
          <div
            className="h-12 w-12 animate-spin rounded-full border-4 border-neon-cyan/20 border-t-neon-cyan"
            role="status"
          />
          <h2 className="text-glow mt-5 font-display text-2xl sm:text-3xl">Entering arena...</h2>
          <p className="mt-2 text-xs text-muted-foreground">Warming up the neon grid</p>
        </Overlay>
      )}

      {showTutorial && (
        <Overlay dim>
          <p className="text-xs tracking-[0.4em] text-muted-foreground uppercase">How to play</p>
          <h2 className="text-glow mt-3 text-center font-display text-3xl sm:text-4xl">
            Welcome to the arena
          </h2>
          <div className="mt-8 grid w-full gap-3 text-sm">
            <div className="glass flex items-center gap-3 rounded-xl px-4 py-3">
              <span className="text-xl">🖱️</span>
              <p>
                <span className="font-semibold text-primary">Steer</span> —{" "}
                {touch
                  ? "touch and drag on the left side to steer"
                  : "your snake follows the mouse"}
              </p>
            </div>
            <div className="glass flex items-center gap-3 rounded-xl px-4 py-3">
              <span className="text-xl">⚡</span>
              <p>
                <span className="font-semibold text-accent">Boost</span> —{" "}
                {touch ? "hold the boost button" : "hold click or Space"} to speed up, but it burns
                length
              </p>
            </div>
            <div className="glass flex items-center gap-3 rounded-xl px-4 py-3">
              <span className="text-xl">🏆</span>
              <p>
                <span className="font-semibold text-neon-lime">Goal</span> — eat orbs to grow, cut
                off rivals to make them crash, and don't hit anyone's body or the wall
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              resetInput();
              setTutorialSeen(true);
              if (mode === "ai") resumeAudio();
            }}
            className="neon-btn glow-lime mt-8 px-10 py-3 font-display text-lg"
          >
            Let's go
          </button>
          <p className="mt-3 text-xs text-muted-foreground">Shown only once</p>
        </Overlay>
      )}

      {mode === "online" && (phase === "lobby" || phase === "connecting") && !showTutorial && (
        <Overlay>
          <Suspense fallback={<p role="status">Preparing multiplayer lobby…</p>}>
            <OnlineLobby
              region={region}
              onRegion={setRegion}
              room={room || flow.room}
              onRoom={(code) => {
                dispatchFlow({ type: "set-room", room: code ?? "" });
                void navigate({
                  to: "/play",
                  search: { mode: "online", ...(code ? { room: code } : {}) },
                  replace: true,
                });
              }}
              finding={finding}
              isWakingUp={isWakingUp}
              wakeElapsedMs={wakeElapsedMs}
              customServerUrl={customServerUrl}
              onCustomServerUrl={setCustomServerUrl}
              onPlay={start}
            />
          </Suspense>
        </Overlay>
      )}

      {serverError && (
        <Overlay dim>
          <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-neon-magenta/40 bg-neon-magenta/10 text-2xl">
            ⚠️
          </div>
          <h2 className="text-glow mt-4 font-display text-2xl sm:text-3xl">Server Unreachable</h2>
          <p className="mt-2 max-w-sm text-center text-sm text-muted-foreground">{serverError}</p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <button
              onClick={() => {
                setServerError(null);
                void startOnline();
              }}
              className="neon-btn glow-cyan px-6 py-2.5 text-sm font-semibold"
            >
              Retry
            </button>
            <button
              onClick={playVsAi}
              className="neon-btn glow-lime px-6 py-2.5 text-sm font-semibold"
            >
              Play offline vs AI
            </button>
          </div>
        </Overlay>
      )}

      {touch &&
        phase === "playing" &&
        !paused &&
        !showTutorial &&
        !(mode === "online" && onlineMenuOpen) && (
          <Joystick
            controlScale={controlScale}
            opacity={joystickOpacity}
            onAngle={(a) => (inputRef.current.joyAngle = a)}
            onBoost={(b) => (inputRef.current.boost = b)}
          />
        )}

      {((mode === "ai" && phase === "paused" && paused) ||
        (mode === "online" && phase === "playing" && onlineMenuOpen)) && (
        <PauseMenu
          mode={mode}
          countdown={mode === "ai" ? pauseState.countdown : null}
          muted={muted}
          volume={volume}
          vibrationEnabled={vibrationEnabled}
          showFps={showFps}
          quality={quality}
          autoTier={autoTierRef.current}
          controlScale={controlScale}
          joystickSize={joystickSize}
          joystickOpacity={joystickOpacity}
          onJoystickSize={setJoystickSize}
          onJoystickOpacity={setJoystickOpacity}
          reduceMotion={reduceMotion}
          onResume={requestResume}
          onCancelCountdown={cancelResume}
          onRestart={() => {
            if (window.confirm("Restart this run and return to difficulty select?")) {
              restartToDifficulty();
            }
          }}
          onQuit={leaveGame}
          onClose={() => {
            setOnlineMenuOpen(false);
          }}
          onMuted={setMuted}
          onVolume={setVolume}
          onVibrationEnabled={setVibrationEnabled}
          onShowFps={setShowFps}
          onQuality={(nextQuality) => {
            setQuality(nextQuality);
            if (nextQuality === "auto") {
              tuningStepRef.current = 0;
            }
          }}
          onControlScale={setControlScale}
          onReduceMotion={setReduceMotion}
        />
      )}

      {mode === "ai" && phase === "select" && (
        <Overlay>
          <h1 className="text-glow text-center font-display text-4xl sm:text-5xl">
            Choose difficulty
          </h1>
          <div className="mt-8 grid w-full gap-3 sm:grid-cols-3">
            {DIFFS.map((d) => (
              <button
                key={d.id}
                onClick={() => dispatchFlow({ type: "choose-difficulty", difficulty: d.id })}
                aria-pressed={difficulty === d.id}
                className={`neon-btn ${d.glow} flex flex-col items-center gap-1 px-4 py-5 ${difficulty === d.id ? "" : "bg-background text-foreground"}`}
              >
                <span className="font-display text-xl">{d.label}</span>
                <span className="text-xs text-muted-foreground">{d.desc}</span>
              </button>
            ))}
          </div>
          <button
            onClick={start}
            className="neon-btn glow-lime mt-8 px-12 py-4 font-display text-xl"
          >
            Start
          </button>
          <p className="mt-6 text-center text-xs text-muted-foreground">
            {touch
              ? "Left stick to steer · Boost button to speed up"
              : "Mouse to steer · Hold click or Space to boost · Esc to pause"}
          </p>
        </Overlay>
      )}

      {phase === "interrupted" && mode === "ai" && (
        <Overlay dim>
          <p className="text-xs tracking-[0.4em] text-muted-foreground uppercase">
            Run interrupted
          </p>
          <h2 className="mt-3 text-center font-display text-3xl text-accent sm:text-4xl">
            Interrupted game
          </h2>
          <p className="mt-3 text-center text-sm text-muted-foreground">
            Your previous simulation could not be restored.
          </p>
          <div className="glass mt-6 rounded-xl px-8 py-4 text-center">
            <p className="text-xs tracking-widest text-muted-foreground uppercase">Last score</p>
            <p className="font-display text-3xl text-primary tabular-nums">
              {flow.lastKnownScore ?? 0}
            </p>
          </div>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <button
              onClick={restartToDifficulty}
              className="neon-btn glow-lime min-h-12 px-8 py-3 font-display text-lg"
            >
              Play Again
            </button>
            <button
              onClick={returnToMainMenu}
              className="neon-btn glow-cyan min-h-12 px-8 py-3 font-display text-lg"
            >
              Main Menu
            </button>
          </div>
        </Overlay>
      )}
      {phase === "dead" && death && (
        <DeathScreen stats={death} onPlayAgain={playAgain} onMainMenu={returnToMainMenu} />
      )}
    </div>
  );
}

const ConnectionStatusOverlay = memo(function ConnectionStatusOverlay({
  mode,
  showHud,
  statusRef,
  onReconnect,
  onPlayOffline,
}: {
  mode: Mode;
  showHud: boolean;
  statusRef: { current: ConnectionStatus };
  onReconnect: () => void;
  onPlayOffline: () => void;
}) {
  const [status, setStatus] = useState(statusRef.current);

  useEffect(() => {
    const syncStatus = () => {
      setStatus((current) => (current === statusRef.current ? current : statusRef.current));
    };
    if (mode !== "online" || !showHud) {
      syncStatus();
      return;
    }
    syncStatus();
    const timer = window.setInterval(syncStatus, 250);
    return () => window.clearInterval(timer);
  }, [mode, showHud, statusRef]);

  if (mode !== "online" || !showHud) return null;
  if (status === "reconnecting") return <ReconnectingBanner />;
  if (status !== "disconnected") return null;

  return (
    <Overlay dim>
      <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-neon-magenta/40 bg-neon-magenta/10 text-2xl">
        ⚠️
      </div>
      <h2 className="text-glow mt-4 font-display text-2xl sm:text-3xl">Connection Lost</h2>
      <p className="mt-2 max-w-sm text-center text-sm text-muted-foreground">
        Disconnected from the multiplayer server.
      </p>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <button
          onClick={onReconnect}
          className="neon-btn glow-cyan px-6 py-2.5 text-sm font-semibold"
        >
          Reconnect
        </button>
        <button
          onClick={onPlayOffline}
          className="neon-btn glow-lime px-6 py-2.5 text-sm font-semibold"
        >
          Play offline vs AI
        </button>
      </div>
    </Overlay>
  );
});

const LiveGameHud = memo(function LiveGameHud({
  hudRef,
  fpsRef,
  pingRef,
  netStatusRef,
  runtimeRef,
  mode,
  muted,
  onToggleMute,
  onOpenMenu,
  showHud,
  showPerformance,
  showFps,
}: {
  hudRef: { current: HudData | null };
  fpsRef: { current: number };
  pingRef: { current: number };
  netStatusRef: { current: ConnectionStatus };
  runtimeRef: { current: PerformanceRuntime };
  mode: Mode;
  muted: boolean;
  onToggleMute: () => void;
  onOpenMenu: () => void;
  showHud: boolean;
  showPerformance: boolean;
  showFps: boolean;
}) {
  const [, refresh] = useState(0);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);

  useEffect(() => {
    if (!showHud && !showPerformance) return;
    const timer = window.setInterval(() => refresh((value) => value + 1), 250);
    return () => window.clearInterval(timer);
  }, [showHud, showPerformance]);

  const hud = hudRef.current;
  const runtime = runtimeRef.current;
  return (
    <>
      {showHud && hud && (
        <>
          <div className="pointer-events-none absolute inset-safe-top inset-safe-left z-30 flex flex-col gap-2">
            <ScorePanel data={hud} muted={muted} onToggleMute={onToggleMute} />
            {mode === "online" && (
              <PingBadge ping={pingRef.current} status={netStatusRef.current} />
            )}
          </div>
          <button
            type="button"
            aria-label={mode === "ai" ? "Pause game" : "Open match menu"}
            onClick={onOpenMenu}
            className="neon-btn glow-cyan pointer-events-auto absolute inset-safe-top left-1/2 z-30 grid size-12 min-h-12 min-w-12 -translate-x-1/2 place-items-center rounded-xl text-sm font-bold"
          >
            {mode === "ai" ? (
              <>
                <svg
                  className="size-5 sm:hidden"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <rect x="6" y="4" width="4" height="16" rx="1" />
                  <rect x="14" y="4" width="4" height="16" rx="1" />
                </svg>
                <span className="hidden sm:inline">Pause</span>
              </>
            ) : (
              "Menu"
            )}
          </button>
          <button
            type="button"
            aria-expanded={leaderboardOpen}
            aria-controls="game-leaderboard"
            onClick={() => setLeaderboardOpen((open) => !open)}
            className="neon-btn glow-cyan pointer-events-auto absolute inset-safe-right z-30 mt-[10.5rem] min-h-11 rounded-xl px-3 text-xs font-semibold"
          >
            {leaderboardOpen ? "Hide ranks" : "Ranks"}
          </button>
          {leaderboardOpen && (
            <div
              id="game-leaderboard"
              className="pointer-events-none absolute inset-safe-right z-20 mt-[13.5rem]"
            >
              <Leaderboard rows={hud.rows} />
            </div>
          )}
          <div className="pointer-events-none absolute inset-safe-right z-10 bottom-[calc(6rem+env(safe-area-inset-bottom))]">
            <BoostMeter data={hud} />
          </div>
        </>
      )}
      {hud && showFps && showPerformance && (
        <div
          className="glass pointer-events-none absolute inset-safe-top left-1/2 z-[60] mt-14 -translate-x-1/2 rounded-full px-3 py-1 text-xs font-semibold text-primary tabular-nums"
          aria-label={`${fpsRef.current} frames per second; tier ${runtime.autoTier}; resolution scale ${runtime.profile.resolutionScale.toFixed(2)}`}
        >
          {fpsRef.current} FPS · T{runtime.autoTier} · {runtime.profile.resolutionScale.toFixed(2)}×
          {runtime.batterySaverActive && " · 30 FPS"}
        </div>
      )}
    </>
  );
});
