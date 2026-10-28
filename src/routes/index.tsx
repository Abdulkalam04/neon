import { createFileRoute, Link } from "@tanstack/react-router";
import { ArenaBackground } from "@/components/ArenaBackground";
import { useGameStore } from "@/lib/store";

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

  return (
    <div className="bg-arena relative flex min-h-screen flex-col overflow-hidden">
      <ArenaBackground />
      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-5 py-12">
        <h1 className="text-glow animate-pulse-glow animate-float-in text-center font-display text-5xl leading-none sm:text-7xl md:text-8xl">
          NEON
          <br className="sm:hidden" /> SERPENT
        </h1>
        <p className="mt-4 animate-float-in text-center text-sm tracking-[0.35em] text-muted-foreground uppercase [animation-delay:120ms]">
          Slither · Grow · Dominate
        </p>

        <div className="glass mt-10 w-full max-w-md animate-float-in rounded-2xl p-6 sm:p-8 [animation-delay:220ms]">
          <label
            htmlFor="nick"
            className="mb-2 block text-xs font-semibold tracking-widest text-muted-foreground uppercase"
          >
            Nickname
          </label>
          <input
            id="nick"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="Enter your name"
            maxLength={16}
            className="w-full rounded-xl border border-input bg-background/60 px-4 py-3 text-lg font-semibold outline-none transition focus:border-ring focus:shadow-[0_0_20px_-4px_var(--neon-cyan)]"
          />

          <div className="mt-6 flex flex-col gap-3">
            <Link
              to="/play"
              search={{ mode: "ai" }}
              className="neon-btn glow-cyan px-6 py-4 text-center font-display text-lg"
            >
              Play vs AI
            </Link>
            <Link
              to="/play"
              search={{ mode: "online" }}
              className="neon-btn glow-magenta px-6 py-4 text-center font-display text-lg"
            >
              Play Online
            </Link>
            <Link
              to="/customize"
              search={{ tab: "snakes" }}
              className="neon-btn glow-lime px-6 py-4 text-center font-display text-lg"
            >
              Customize Snake
            </Link>
          </div>
        </div>
      </main>

      <footer className="relative z-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 px-4 pb-6 text-xs text-muted-foreground">
        <span>
          <Kbd>Mouse</Kbd> steer
        </span>
        <span>
          <Kbd>Click</Kbd> / <Kbd>Space</Kbd> boost
        </span>
        <span className="sm:hidden">
          <Kbd>Touch</Kbd> drag to steer
        </span>
      </footer>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="glass mx-1 rounded-md px-2 py-0.5 font-sans text-foreground">{children}</kbd>
  );
}
