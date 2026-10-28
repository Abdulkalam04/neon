import type { ReactNode } from "react";
import type { GraphicsQuality } from "@/lib/store";
import type { AutoTier } from "@/lib/qualityProfile";

export interface HudData {
  rows: { id: number; name: string; score: number; me: boolean }[];
  score: number;
  rank: number;
  total: number;
  kills: number;
  boosting: boolean;
  /** 0..1 how much boost fuel (length above the minimum) is left. */
  fuel: number;
  canBoost: boolean;
}

export interface DeathStats {
  killedBy: string | null;
  finalScore: number;
  bestScore: number;
  seconds: number;
  kills: number;
}

export function ScorePanel({
  data,
  muted,
  onToggleMute,
}: {
  data: HudData;
  muted: boolean;
  onToggleMute: () => void;
}) {
  return (
    <div className="glass pointer-events-auto rounded-xl px-4 py-3">
      <div className="flex items-start justify-between gap-6">
        <div>
          <p className="text-[10px] tracking-widest text-muted-foreground uppercase">Length</p>
          <p className="font-display text-3xl leading-tight text-primary tabular-nums">
            {data.score}
          </p>
        </div>
        <button
          onClick={onToggleMute}
          aria-label={muted ? "Unmute sound" : "Mute sound"}
          className="rounded-lg border border-border px-2 py-1 text-sm transition hover:border-primary"
        >
          {muted ? "🔇" : "🔊"}
        </button>
      </div>
      <p className="text-sm text-foreground/90">
        Rank <span className="font-bold text-primary">{data.rank || "–"}</span> of {data.total}
      </p>
      <p className="text-xs text-muted-foreground">{data.kills} kills</p>
    </div>
  );
}

export function Leaderboard({ rows }: { rows: HudData["rows"] }) {
  return (
    <div className="glass w-44 rounded-xl p-3 sm:w-56">
      <p className="mb-1.5 text-[10px] tracking-widest text-muted-foreground uppercase">
        Leaderboard
      </p>
      <ol className="space-y-0.5 text-xs sm:text-sm">
        {rows.map((r, i) => (
          <li
            key={r.id}
            className={`flex justify-between gap-2 rounded px-1.5 ${r.me ? "bg-primary/15 font-bold text-primary" : "text-foreground/80"}`}
          >
            <span className="truncate">
              <span className="text-muted-foreground">{i + 1}.</span> {r.name}
            </span>
            <span className="tabular-nums">{r.score}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function BoostMeter({ data }: { data: HudData }) {
  return (
    <div className="glass w-44 rounded-xl px-4 py-3">
      <div className="mb-1.5 flex items-center justify-between text-[10px] tracking-widest uppercase">
        <span className={data.boosting ? "text-accent" : "text-muted-foreground"}>
          {data.boosting ? "Boosting" : "Boost"}
        </span>
        <span className={data.canBoost ? "text-neon-lime" : "text-destructive"}>
          {data.canBoost ? "Ready" : "Too short"}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full transition-[width] duration-200 ${
            data.boosting ? "bg-accent shadow-[0_0_12px_var(--neon-magenta)]" : "bg-neon-lime"
          }`}
          style={{ width: `${Math.round(data.fuel * 100)}%` }}
        />
      </div>
    </div>
  );
}

export function Overlay({ children, dim = false }: { children: ReactNode; dim?: boolean }) {
  return (
    <div
      className={`absolute inset-0 z-20 flex items-center justify-center overflow-y-auto p-4 animate-float-in safe-top safe-bottom safe-left safe-right sm:p-5 ${dim ? "bg-background/85 backdrop-blur-md" : "bg-background/55 backdrop-blur-sm"}`}
    >
      <div className="glass m-auto flex max-h-full w-full max-w-xl flex-col items-center overflow-y-auto rounded-3xl px-5 py-8 sm:px-6 sm:py-10">
        {children}
      </div>
    </div>
  );
}

export function PauseMenu(props: {
  mode: "ai" | "online";
  countdown: 3 | 2 | 1 | null;
  muted: boolean;
  volume: number;
  vibrationEnabled: boolean;
  showFps: boolean;
  quality: GraphicsQuality;
  autoTier: AutoTier;
  onResume: () => void;
  onCancelCountdown: () => void;
  onRestart: () => void;
  onQuit: () => void;
  onClose: () => void;
  onMuted: (m: boolean) => void;
  onVolume: (v: number) => void;
  onVibrationEnabled: (enabled: boolean) => void;
  onShowFps: (s: boolean) => void;
  onQuality: (q: GraphicsQuality) => void;
}) {
  return (
    <div
      className="pause-overlay absolute inset-0 z-50 flex items-center justify-center overflow-y-auto p-3 safe-top safe-bottom safe-left safe-right sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pause-menu-title"
    >
      <div className="glass pause-panel m-auto flex max-h-full w-full max-w-lg flex-col gap-5 overflow-y-auto overscroll-contain rounded-3xl p-4 sm:p-6">
        <h2
          id="pause-menu-title"
          className="text-glow text-center font-display text-3xl sm:text-4xl"
        >
          {props.mode === "ai" ? "Paused" : "Match menu"}
        </h2>
        {props.mode === "online" && (
          <p className="glass mx-auto rounded-full px-3 py-1 text-xs text-neon-lime">
            Game is live · the match continues
          </p>
        )}
        {props.mode === "online" && (
          <h3 className="text-center font-display text-sm tracking-widest text-muted-foreground uppercase">
            Settings
          </h3>
        )}
        {props.mode === "ai" &&
          (props.countdown ? (
            <div className="flex w-full flex-col items-center gap-2">
              <button
                disabled
                className="neon-btn glow-lime min-h-14 w-full cursor-default px-6 py-3 font-display text-xl opacity-80"
              >
                Resuming in {props.countdown}
              </button>
              <button
                onClick={props.onCancelCountdown}
                className="min-h-11 px-5 text-sm text-muted-foreground underline underline-offset-4"
              >
                Stay paused
              </button>
            </div>
          ) : (
            <button
              onClick={props.onResume}
              className="neon-btn glow-lime min-h-14 w-full px-6 py-3 font-display text-xl"
            >
              Resume
            </button>
          ))}
        <div className="flex w-full flex-col gap-4">
          <Setting label="Graphics">
            <Seg
              options={["Auto", "High", "Medium", "Low"]}
              value={props.quality[0]!.toUpperCase() + props.quality.slice(1)}
              onPick={(value) => props.onQuality(value.toLowerCase() as GraphicsQuality)}
            />
          </Setting>
          <Setting label="Show FPS">
            <Seg
              options={["On", "Off"]}
              value={props.showFps ? "On" : "Off"}
              onPick={(value) => props.onShowFps(value === "On")}
            />
          </Setting>
          {props.quality === "auto" && (
            <p className="-mt-3 text-right text-xs text-muted-foreground">
              Adaptive · Tier {props.autoTier} (0 low — 3 high)
            </p>
          )}
          <Setting label="Sound">
            <Seg
              options={["On", "Off"]}
              value={props.muted ? "Off" : "On"}
              onPick={(value) => props.onMuted(value === "Off")}
            />
          </Setting>
          <Setting label="Volume">
            <div className="flex min-h-11 items-center gap-2">
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={Math.round(props.volume * 100)}
                aria-label="Volume"
                onChange={(event) => props.onVolume(Number(event.target.value) / 100)}
                className="w-28 accent-primary"
              />
              <span className="w-9 text-right text-xs font-semibold text-primary tabular-nums">
                {Math.round(props.volume * 100)}%
              </span>
            </div>
          </Setting>
          <Setting label="Vibration">
            <Seg
              options={["On", "Off"]}
              value={props.vibrationEnabled ? "On" : "Off"}
              onPick={(value) => props.onVibrationEnabled(value === "On")}
            />
          </Setting>
        </div>
        {props.mode === "ai" ? (
          <div className="grid w-full gap-3 sm:grid-cols-2">
            <button
              onClick={props.onRestart}
              className="neon-btn glow-cyan min-h-12 px-5 py-3 font-display"
            >
              Restart
            </button>
            <button
              onClick={props.onQuit}
              className="neon-btn glow-magenta min-h-12 px-5 py-3 font-display"
            >
              Main Menu
            </button>
          </div>
        ) : (
          <div className="grid w-full gap-3 sm:grid-cols-2">
            <button
              onClick={props.onClose}
              className="neon-btn glow-lime min-h-12 px-5 py-3 font-display"
            >
              Close menu
            </button>
            <button
              onClick={props.onQuit}
              className="neon-btn glow-magenta min-h-12 px-5 py-3 font-display"
            >
              Leave match
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Setting({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm font-semibold tracking-wider uppercase">{label}</span>
      {children}
    </div>
  );
}

function Seg({
  options,
  value,
  onPick,
}: {
  options: string[];
  value: string;
  onPick: (v: string) => void;
}) {
  return (
    <div className="flex rounded-xl bg-background/60 p-1">
      {options.map((o) => (
        <button
          key={o}
          onClick={() => onPick(o)}
          aria-pressed={value === o}
          className={`min-h-11 min-w-11 flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold transition sm:px-3 sm:text-sm ${value === o ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

export function DeathScreen({
  stats,
  onPlayAgain,
  onMainMenu,
}: {
  stats: DeathStats;
  onPlayAgain: () => void;
  onMainMenu: () => void;
}) {
  const mm = Math.floor(stats.seconds / 60),
    ss = String(Math.floor(stats.seconds % 60)).padStart(2, "0");
  return (
    <Overlay dim>
      <p className="text-xs tracking-[0.4em] text-muted-foreground uppercase">Game over</p>
      <h2 className="mt-3 text-center font-display text-3xl text-accent drop-shadow-[0_0_22px_var(--neon-magenta)] sm:text-4xl">
        {stats.killedBy ? <>You were eaten by {stats.killedBy}</> : <>You hit the arena wall</>}
      </h2>
      <div className="mt-8 grid w-full grid-cols-2 gap-3">
        <Stat label="Final length" value={stats.finalScore} />
        <Stat label="Longest length" value={stats.bestScore} />
        <Stat label="Survival time" value={`${mm}:${ss}`} />
        <Stat label="Kills" value={stats.kills} />
      </div>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <button
          onClick={onPlayAgain}
          className="neon-btn glow-lime min-h-12 px-8 py-3 font-display text-lg"
        >
          Play Again
        </button>
        <button
          onClick={onMainMenu}
          className="neon-btn glow-cyan min-h-12 px-8 py-3 font-display text-lg"
        >
          Main Menu
        </button>
      </div>
    </Overlay>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-background/40 px-4 py-3 text-center">
      <p className="text-[10px] tracking-widest text-muted-foreground uppercase">{label}</p>
      <p className="font-display text-2xl text-primary tabular-nums">{value}</p>
    </div>
  );
}

export function PingBadge({ ping, status }: { ping: number; status: string }) {
  const tone =
    status !== "connected"
      ? "bg-destructive"
      : ping < 80
        ? "bg-neon-lime"
        : ping < 160
          ? "bg-amber-400"
          : "bg-accent";
  return (
    <div
      className="glass flex w-fit items-center gap-2 rounded-full px-3 py-1 text-xs tabular-nums"
      aria-label={
        status === "connected"
          ? `Online, ping ${ping} milliseconds${ping > 250 ? ", high latency" : ""}`
          : status
      }
      title={status === "connected" && ping > 250 ? "High latency may affect play" : undefined}
    >
      <span className={`h-2 w-2 rounded-full ${tone}`} />
      {status === "connected"
        ? `Online · ${ping} ms`
        : status === "disconnected"
          ? "Offline"
          : status}
      {status === "connected" && ping > 250 && <span className="text-amber-300">High ping</span>}
    </div>
  );
}

export function ReconnectingBanner() {
  return (
    <div
      role="status"
      className="glass pointer-events-none absolute top-16 left-1/2 z-30 -translate-x-1/2 animate-pulse rounded-full px-5 py-2 font-display text-sm text-glow"
    >
      Reconnecting...
    </div>
  );
}
