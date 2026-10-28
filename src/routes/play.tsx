import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useGameStore } from "@/lib/store";
import {
  CFG,
  createGame,
  DT,
  TICK_RATE,
  update,
  type Difficulty,
  type GameState,
  type PlayerInput,
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
} from "@/game/render/renderGame";
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
  setKeepAwake,
  setLandscapeLock,
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
import { OnlineLobby, normalizeRoomCode } from "@/components/game/OnlineLobby";
import { MockConnection } from "@/game/net/MockConnection";
import { WebSocketConnection } from "@/game/net/WebSocketConnection";
import { getSelectedServer, waitForServer } from "@/lib/serverConfig";
import { interpolate, type TimedSnapshot } from "@/game/net/interpolate";
import type { ConnectionStatus, GameConnection, RegionId } from "@/game/net/types";
import { profileDevice } from "@/lib/deviceProfile";
import { autoTuneStep, profileFor, type AutoTier, type DeviceProfile } from "@/lib/qualityProfile";
import {
  initialPauseState,
  reducePauseState,
  type PauseAction,
  type PauseState,
} from "@/lib/pauseState";
import { clearPlayFlow, currentStorage, readPlayFlow, writePlayFlow } from "@/lib/appPersistence";
import {
  reducePlayFlow,
  restorePlayFlow,
  parsePlayMode,
  type PlayMode,
} from "@/game/flow/playFlow";

type Mode = PlayMode;

export const Route = createFileRoute("/play")({
  validateSearch: (s: Record<string, unknown>): { mode: Mode; room?: string } => {
    const room = typeof s["room"] === "string" ? normalizeRoomCode(s["room"]) : "";
    const mode = parsePlayMode(s["mode"], room.length === 5);
    if (!mode) {
      if (typeof window !== "undefined") {
        try {
          sessionStorage.setItem("neon-serpent:skip-screen-restore", "1");
        } catch (error) {
          console.error("Could not suppress screen restore for an invalid game URL", error);
        }
      }
      throw redirect({ to: "/" });
    }
    return {
      mode,
      ...(room.length === 5 ? { room } : {}),
    };
  },
  head: () => ({
    meta: [
      { title: "Arena — Neon Serpent" },
      {
        name: "description",
        content: "Enter the neon arena, outsmart AI snakes and grow the longest serpent.",
      },
      { property: "og:title", content: "Arena — Neon Serpent" },
      {
        property: "og:description",
        content: "Enter the neon arena, outsmart AI snakes and grow the longest serpent.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Play,
});

const INTERP_DELAY_MS = 100;

const DIFFS: { id: Difficulty; label: string; desc: string; glow: string }[] = [
  { id: "easy", label: "Easy", desc: "15 relaxed bots", glow: "glow-lime" },
  { id: "normal", label: "Normal", desc: "20 bots that fight back", glow: "glow-cyan" },
  { id: "hard", label: "Hard", desc: "25 ruthless hunters", glow: "glow-magenta" },
];

const score = (len: number) => Math.floor(len * 10);
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

function Play() {
  const { mode, room } = Route.useSearch();
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
  const lockLandscape = useGameStore((s) => s.lockLandscape);
  const tutorialSeen = useGameStore((s) => s.tutorialSeen);
  const setMuted = useGameStore((s) => s.setMuted);
  const setVolume = useGameStore((s) => s.setVolume);
  const setShowFps = useGameStore((s) => s.setShowFps);
  const setQuality = useGameStore((s) => s.setQuality);
  const setTutorialSeen = useGameStore((s) => s.setTutorialSeen);
  const setCustomServerUrl = useGameStore((s) => s.setCustomServerUrl);
  const setNickname = useGameStore((s) => s.setNickname);
  const setVibrationEnabled = useGameStore((s) => s.setVibrationEnabled);

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
  const [hud, setHud] = useState<HudData | null>(null);
  const [pauseState, dispatchPause] = useReducer(
    (state: PauseState, action: PauseAction) => reducePauseState(state, action, mode),
    initialPauseState,
  );
  const paused = mode === "ai" && (flow.phase === "paused" || pauseState.status !== "running");
  const [onlineMenuOpen, setOnlineMenuOpen] = useState(false);
  const [onlineBackgroundWarning, setOnlineBackgroundWarning] = useState(false);
  const [touch, setTouch] = useState(false);
  const [joystickMode, setJoystickMode] = useState<"floating" | "fixed">("floating");
  const [region, setRegion] = useState<RegionId>("asia");
  const [finding, setFinding] = useState(false);
  const [isWakingUp, setIsWakingUp] = useState(false);
  const [wakeElapsedMs, setWakeElapsedMs] = useState(0);
  const [serverError, setServerError] = useState<string | null>(null);
  const [net, setNet] = useState<{ status: ConnectionStatus; ping: number }>({
    status: "disconnected",
    ping: 0,
  });
  const [fps, setFps] = useState(0);
  const [autoTier, setAutoTier] = useState<AutoTier>(2);
  const [tuningStep, setTuningStep] = useState(0);
  const [lowBattery, setLowBattery] = useState(false);
  const batterySaverActive = batterySaver || lowBattery;
  const profile = useMemo(
    () => profileFor(quality, autoTier, quality === "auto" ? tuningStep : 0),
    [autoTier, quality, tuningStep],
  );
  const showTutorial =
    mode === "ai"
      ? phase === "playing" && !tutorialSeen && !paused
      : phase === "lobby" && !tutorialSeen;
  const deviceProfile = useRef<DeviceProfile | null>(null);
  const tuningStepRef = useRef(tuningStep);
  tuningStepRef.current = tuningStep;
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
    autoTier,
    batterySaverActive,
    appActive: true,
    vibrationEnabled,
    paused: false,
  });
  live.current.nickname = nickname;
  live.current.difficulty = difficulty;
  live.current.skin = skin;
  live.current.quality = quality;
  live.current.profile = profile;
  live.current.autoTier = autoTier;
  live.current.batterySaverActive = batterySaverActive;
  live.current.vibrationEnabled = vibrationEnabled;
  live.current.paused = mode === "ai" && (paused || showTutorial);

  useEffect(() => setTouch(window.matchMedia("(pointer: coarse)").matches), []);
  useEffect(() => {
    let active = true;
    void profileDevice()
      .then((result) => {
        if (!active) return;
        deviceProfile.current = result;
        setAutoTier(result.tier);
      })
      .catch((error: unknown) => console.error("Device graphics profiling failed", error));
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    clearRenderCaches();
  }, [profile]);
  useEffect(() => {
    let battery: BatteryLike | null = null;
    const updateBattery = () => {
      if (battery) setLowBattery(!battery.charging && battery.level < 0.2);
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

  useEffect(() => {
    void setLandscapeLock(phase === "playing" && lockLandscape).catch(console.error);
    return () => {
      void setLandscapeLock(false).catch(console.error);
    };
  }, [lockLandscape, phase]);

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
    const cam = createCamera();
    const view = { w: 0, h: 0 };
    let backingScale = 1;
    const resize = () => {
      view.w = canvas.clientWidth;
      view.h = canvas.clientHeight;
      const profile = live.current.profile;
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
      if (e.pointerType === "mouse") inp.mouse = { x: e.clientX, y: e.clientY };
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
          if (now - slowSince >= 2000 && now - lastTuneAt >= 10000) {
            const next = autoTuneStep(tuningStepRef.current, "down", true);
            if (next !== tuningStepRef.current) {
              tuningStepRef.current = next;
              setTuningStep(next);
            }
            lastTuneAt = now;
            slowSince = now;
          }
        } else if (averageFrameMs < 14) {
          fastSince ||= now;
          slowSince = 0;
          if (now - fastSince >= 10000 && now - lastTuneAt >= 10000) {
            const next = autoTuneStep(tuningStepRef.current, "up", true);
            if (next !== tuningStepRef.current) {
              tuningStepRef.current = next;
              setTuningStep(next);
            }
            lastTuneAt = now;
            fastSince = now;
          }
        } else {
          slowSince = 0;
          fastSince = 0;
        }
      }
      const player = state.snakes.find((s) => s.id === state.playerId)!;

      if (inp.joyAngle !== null) inp.angle = inp.joyAngle;
      else if (inp.mouse) {
        const hs = worldToScreen(cam, view, player.body[0]!);
        inp.angle = Math.atan2(inp.mouse.y - hs.y, inp.mouse.x - hs.x);
      }

      if (!live.current.paused) {
        acc += elapsed;
        gameTime += elapsed * 1000;
        while (acc >= DT) {
          if (live.current.vibrationEnabled && inp.boost && !previousBoost)
            void vibrate("boost").catch(console.error);
          previousBoost = inp.boost;
          update(state, { [state.playerId]: { angle: inp.angle, boost: inp.boost } }, DT);
          acc -= DT;
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
      resize();
      if (!view.w || !view.h) {
        raf = requestAnimationFrame(loop);
        return;
      }
      lastDraw = now;
      fpsFrames++;
      if (now - fpsStart >= 500) {
        setFps(Math.round((fpsFrames * 1000) / (now - fpsStart)));
        fpsFrames = 0;
        fpsStart = now;
      }
      ctx.setTransform(canvas.width / view.w, 0, 0, canvas.height / view.h, 0, 0);
      renderGame(ctx, state, cam, view, {
        time: gameTime,
        playerSkin: live.current.skin,
        mouseWorld: inp.mouse ? screenToWorld(cam, view, inp.mouse) : null,
        profile: live.current.profile,
        shake: live.current.profile.shake ? shake : 0,
        floaters,
      });

      if (frame++ % 6 === 0) {
        const alive = state.snakes.filter((s) => s.alive).sort((a, b) => b.length - a.length);
        setHud({
          rows: alive
            .slice(0, 10)
            .map((s) => ({ id: s.id, name: s.name, score: score(s.length), me: s.isPlayer })),
          score: score(player.length),
          rank: alive.findIndex((s) => s.isPlayer) + 1,
          total: alive.length,
          kills: player.kills,
          boosting: player.boosting,
          canBoost: player.length > CFG.minBoostLength,
          fuel: Math.max(0, Math.min(1, (player.length - CFG.minBoostLength) / 60)),
        });
        dispatchFlow({ type: "score", score: score(player.length) });
      }
      raf = requestAnimationFrame(loop);
    };
    const handleActivity = (isActive: boolean) => {
      appActive = isActive;
      live.current.appActive = isActive;
      resetBoost();
      if (!isActive) {
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
  }, [gameActive, mode, runId]);

  // Online: render snapshots from the connection, interpolated INTERP_DELAY_MS behind.
  useEffect(() => {
    if (runId === 0 || mode !== "online" || phase !== "playing") return;
    const conn = connRef.current;
    if (!conn) return;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const cam = createCamera();
    const view = { w: 0, h: 0 };
    let backingScale = 1;
    const resize = () => {
      view.w = canvas.clientWidth;
      view.h = canvas.clientHeight;
      const profile = live.current.profile;
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
      if (e.pointerType === "mouse") inp.mouse = { x: e.clientX, y: e.clientY };
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

    conn.onState((snap) => {
      const now = performance.now();
      buffer.push({ snap, at: now });
      if (buffer.length > 30) buffer.splice(0, buffer.length - 30);
      const me = snap.snakes.find((s) => s.id === snap.youId);
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
          if (now - slowSince >= 2000 && now - lastTuneAt >= 10000) {
            const next = autoTuneStep(tuningStepRef.current, "down", true);
            if (next !== tuningStepRef.current) {
              tuningStepRef.current = next;
              setTuningStep(next);
            }
            lastTuneAt = now;
            slowSince = now;
          }
        } else if (averageFrameMs < 14) {
          fastSince ||= now;
          slowSince = 0;
          if (now - fastSince >= 10000 && now - lastTuneAt >= 10000) {
            const next = autoTuneStep(tuningStepRef.current, "up", true);
            if (next !== tuningStepRef.current) {
              tuningStepRef.current = next;
              setTuningStep(next);
            }
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
        const player = state.snakes.find((s) => s.id === state.playerId);
        if (player) {
          if (inp.joyAngle !== null) inp.angle = inp.joyAngle;
          else if (inp.mouse) {
            const hs = worldToScreen(cam, view, player.body[0]!);
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
        resize();
        if (!view.w || !view.h) {
          raf = requestAnimationFrame(loop);
          return;
        }
        lastDraw = now;
        fpsFrames++;
        if (now - fpsStart >= 500) {
          setFps(Math.round((fpsFrames * 1000) / (now - fpsStart)));
          fpsFrames = 0;
          fpsStart = now;
        }
        ctx.setTransform(canvas.width / view.w, 0, 0, canvas.height / view.h, 0, 0);
        renderGame(ctx, state, cam, view, {
          time: now,
          playerSkin: live.current.skin,
          mouseWorld: inp.mouse ? screenToWorld(cam, view, inp.mouse) : null,
          profile: live.current.profile,
          shake: live.current.profile.shake ? shake : 0,
          floaters,
        });
        if (player && frame++ % 6 === 0) {
          const alive = state.snakes.filter((s) => s.alive).sort((a, b) => b.length - a.length);
          setHud({
            rows: alive
              .slice(0, 10)
              .map((s) => ({ id: s.id, name: s.name, score: score(s.length), me: s.isPlayer })),
            score: score(player.length),
            rank: alive.findIndex((s) => s.isPlayer) + 1,
            total: alive.length,
            kills: player.kills,
            boosting: player.boosting,
            canBoost: player.length > CFG.minBoostLength,
            fuel: Math.max(0, Math.min(1, (player.length - CFG.minBoostLength) / 60)),
          });
          dispatchFlow({ type: "score", score: score(player.length) });
        }
      }
      raf = requestAnimationFrame(loop);
    };
    const handleActivity = (isActive: boolean) => {
      appActive = isActive;
      live.current.appActive = isActive;
      resetBoost();
      if (!isActive) {
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
  }, [mode, phase, runId]);

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
    setHud(null);
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
      conn.onStatus((status, ping) => setNet({ status, ping }));
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
    setHud(null);
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
    setHud(null);
    if (deathTimer.current) clearTimeout(deathTimer.current);
    if (loadingTimer.current) clearTimeout(loadingTimer.current);
    dispatchFlow({ type: "play-again" });
  };

  const playAgain = () => {
    if (deathTimer.current) clearTimeout(deathTimer.current);
    if (loadingTimer.current) clearTimeout(loadingTimer.current);
    setRunId(0);
    setHud(null);
    if (mode === "ai") {
      restartToDifficulty();
      return;
    }
    connRef.current?.disconnect();
    connRef.current = null;
    dispatchFlow({ type: "play-again" });
    navigate({
      to: "/play",
      search: { mode: "online", ...(flow.room ? { room: flow.room } : {}) },
      replace: true,
    });
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

  const showHud = hud && phase === "playing";

  return (
    <div className="game-screen relative w-screen overflow-hidden bg-background select-none">
      <canvas ref={canvasRef} className="h-full w-full touch-none cursor-crosshair" />

      {showHud && (
        <>
          {/* Top-left: score and network status — safe-area inset clears notches. */}
          <div className="pointer-events-none absolute inset-safe-top inset-safe-left flex flex-col gap-2">
            <ScorePanel data={hud} muted={muted} onToggleMute={() => setMuted(!muted)} />
            {mode === "online" && <PingBadge ping={net.ping} status={net.status} />}
          </div>
          <button
            type="button"
            aria-label={mode === "ai" ? "Pause game" : "Open match menu"}
            onClick={() => {
              if (mode === "ai") requestPause();
              else {
                resetInput();
                setOnlineMenuOpen(true);
              }
            }}
            className="neon-btn glow-cyan pointer-events-auto absolute inset-safe-top inset-safe-right z-30 grid size-12 min-h-12 min-w-12 place-items-center rounded-xl text-sm font-bold"
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
          {/* Top-right: leaderboard */}
          <div className="pointer-events-none absolute inset-safe-top inset-safe-right mt-28 sm:mt-32">
            <Leaderboard rows={hud.rows} />
          </div>
          {/* Boost meter — above the joystick on touch, near bottom on desktop */}
          <div
            className={`pointer-events-none absolute inset-safe-left ${touch ? "bottom-56" : "inset-safe-bottom"}`}
          >
            <BoostMeter data={hud} />
          </div>
        </>
      )}

      {hud && showFps && (phase === "playing" || (mode === "ai" && paused)) && (
        <div
          className="glass pointer-events-none absolute inset-safe-top left-1/2 z-[60] -translate-x-1/2 rounded-full px-3 py-1 text-xs font-semibold text-primary tabular-nums"
          aria-label={`${fps} frames per second; tier ${autoTier}; resolution scale ${profile.resolutionScale.toFixed(2)}`}
        >
          {fps} FPS · T{autoTier} · {profile.resolutionScale.toFixed(2)}×
          {batterySaverActive && " · 30 FPS"}
        </div>
      )}

      {mode === "online" && phase === "playing" && net.status === "reconnecting" && (
        <ReconnectingBanner />
      )}
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
                {touch ? "drag the left stick to turn your snake" : "your snake follows the mouse"}
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

      {mode === "online" && phase === "playing" && net.status === "disconnected" && (
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
              onClick={() => {
                dispatchFlow({ type: "return-to-lobby" });
                void startOnline();
              }}
              className="neon-btn glow-cyan px-6 py-2.5 text-sm font-semibold"
            >
              Reconnect
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
            mode={joystickMode}
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
          autoTier={autoTier}
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
              setTuningStep(0);
            }
          }}
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
                className={`neon-btn ${d.glow} flex flex-col items-center gap-1 px-4 py-5 ${difficulty === d.id ? "" : "opacity-50"}`}
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
