import { createFileRoute, Link } from "@tanstack/react-router";
import { Settings2, X } from "lucide-react";
import { useState } from "react";
import { ArenaBackground } from "@/components/ArenaBackground";
import { useGameStore } from "@/lib/store";
import { provideTapFeedback } from "@/lib/uiFeedback";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Neon Serpent — Snake Arena" },
      {
        name: "description",
        content: "Slither, grow and outsmart rivals in a glowing neon snake arena.",
      },
      { property: "og:title", content: "Neon Serpent — Snake Arena" },
      {
        property: "og:description",
        content: "Slither, grow and outsmart rivals in a glowing neon snake arena.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const nickname = useGameStore((s) => s.nickname);
  const setNickname = useGameStore((s) => s.setNickname);
  const muted = useGameStore((s) => s.muted);
  const setMuted = useGameStore((s) => s.setMuted);
  const volume = useGameStore((s) => s.volume);
  const setVolume = useGameStore((s) => s.setVolume);
  const vibrationEnabled = useGameStore((s) => s.vibrationEnabled);
  const setVibrationEnabled = useGameStore((s) => s.setVibrationEnabled);
  const reduceMotion = useGameStore((s) => s.reduceMotion);
  const setReduceMotion = useGameStore((s) => s.setReduceMotion);
  const controlScale = useGameStore((s) => s.controlScale);
  const setControlScale = useGameStore((s) => s.setControlScale);
  const joystickSize = useGameStore((s) => s.joystickSize);
  const setJoystickSize = useGameStore((s) => s.setJoystickSize);
  const joystickOpacity = useGameStore((s) => s.joystickOpacity);
  const setJoystickOpacity = useGameStore((s) => s.setJoystickOpacity);
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div
      className="home-screen screen-enter bg-arena relative flex h-dvh min-h-0 flex-col overflow-hidden"
      data-reduce-motion={reduceMotion}
      onClickCapture={(event) =>
        provideTapFeedback(event.target, { vibrationEnabled, muted, volume })
      }
    >
      <ArenaBackground />
      <button
        type="button"
        aria-label="Open settings"
        onClick={() => setSettingsOpen(true)}
        className="neon-btn glow-cyan absolute inset-safe-top inset-safe-right z-20 grid size-12 min-h-12 min-w-12 place-items-center rounded-xl"
      >
        <Settings2 className="size-5" aria-hidden />
      </button>
      <main className="home-content relative z-10 flex min-h-0 flex-1 items-center justify-between gap-6 px-5 py-6 sm:px-10">
        <section className="home-brand text-left">
          <p className="mb-3 text-xs font-semibold tracking-[0.28em] text-neon-cyan uppercase">
            Snake arena · mobile
          </p>
          <h1 className="home-title text-glow font-display text-5xl leading-[0.92] sm:text-7xl">
            NEON
            <br />
            SERPENT
          </h1>
          <p className="home-tagline mt-4 text-base tracking-widest text-foreground/90 uppercase">
            Slither. Grow. Dominate.
          </p>
          <label
            htmlFor="nick"
            className="mt-7 block max-w-sm text-xs font-semibold tracking-widest text-foreground/90 uppercase"
          >
            Your callsign
          </label>
          <input
            id="nick"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="Enter your name"
            maxLength={16}
            className="mt-2 min-h-12 w-full max-w-sm rounded-xl border border-input bg-background/80 px-4 text-base font-semibold outline-none transition focus:border-ring"
          />
        </section>

        <nav aria-label="Main menu" className="home-actions flex w-full max-w-sm flex-col gap-3">
          <Link
            to="/play"
            search={{ mode: "ai" }}
            className="neon-btn glow-lime home-play-button inline-flex min-h-16 flex-col items-center justify-center px-8 py-4 text-center font-display text-2xl"
          >
            PLAY
            <span className="mt-1 font-sans text-xs font-semibold tracking-widest text-foreground uppercase">
              Solo vs AI
            </span>
          </Link>
          <Link
            to="/play"
            search={{ mode: "online" }}
            className="neon-btn glow-cyan inline-flex min-h-12 items-center justify-center px-6 py-3 text-center font-display text-base"
          >
            PLAY ONLINE
          </Link>
          <Link
            to="/customize"
            search={{ tab: "snakes" }}
            className="neon-btn glow-magenta inline-flex min-h-12 items-center justify-center px-6 py-3 text-center font-display text-base"
          >
            CUSTOMIZE
          </Link>
        </nav>
      </main>

      <footer className="home-footer relative z-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 px-4 pb-3 text-xs text-foreground/90">
        <span>
          <Kbd>Touch</Kbd> drag to steer
        </span>
        <span>
          <Kbd>Hold</Kbd> boost · <Kbd>Esc</Kbd> pause
        </span>
      </footer>
      {settingsOpen && (
        <div
          className="home-settings-backdrop modal-backdrop absolute inset-0 z-30 flex items-center justify-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="home-settings-title"
        >
          <section className="glass settings-panel screen-enter w-full max-w-md rounded-2xl p-5">
            <header className="flex items-center justify-between">
              <h2 id="home-settings-title" className="font-display text-xl text-primary">
                SETTINGS
              </h2>
              <button
                type="button"
                aria-label="Close settings"
                onClick={() => setSettingsOpen(false)}
                className="neon-btn grid size-11 min-h-11 min-w-11 place-items-center rounded-lg"
              >
                <X className="size-5" aria-hidden />
              </button>
            </header>
            <div className="mt-5 grid gap-4">
              <Setting label="Sound">
                <Toggle value={!muted} onChange={(enabled) => setMuted(!enabled)} />
              </Setting>
              <label className="flex items-center justify-between gap-4 text-sm font-semibold">
                <span>Volume</span>
                <input
                  aria-label="Sound volume"
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={Math.round(volume * 100)}
                  onChange={(event) => setVolume(Number(event.target.value) / 100)}
                  className="w-40 accent-primary"
                />
              </label>
              <Setting label="Haptics">
                <Toggle value={vibrationEnabled} onChange={setVibrationEnabled} />
              </Setting>
              <Setting label="Reduce motion">
                <Toggle value={reduceMotion} onChange={setReduceMotion} />
              </Setting>
              <Setting label="Joystick size">
                <div className="flex rounded-xl bg-background/60 p-1">
                  {(["S", "M", "L"] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setJoystickSize(s)}
                      aria-pressed={joystickSize === s}
                      className={`min-h-9 min-w-9 rounded-lg px-3 py-1 text-xs font-semibold transition ${
                        joystickSize === s
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </Setting>
              <label className="flex items-center justify-between gap-4 text-sm font-semibold">
                <span>Joystick opacity</span>
                <div className="flex items-center gap-2">
                  <input
                    aria-label="Joystick opacity"
                    type="range"
                    min="20"
                    max="100"
                    step="5"
                    value={Math.round(joystickOpacity * 100)}
                    onChange={(event) => setJoystickOpacity(Number(event.target.value) / 100)}
                    className="w-28 accent-primary"
                  />
                  <span className="w-10 text-right text-xs font-semibold text-muted-foreground tabular-nums">
                    {Math.round(joystickOpacity * 100)}%
                  </span>
                </div>
              </label>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function Setting({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm font-semibold">
      {label}
      {children}
    </div>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (value: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      className={`min-h-11 min-w-20 rounded-lg border px-3 font-semibold ${value ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-foreground"}`}
    >
      {value ? "On" : "Off"}
    </button>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="glass mx-1 rounded-md px-2 py-0.5 font-sans text-foreground">{children}</kbd>
  );
}
