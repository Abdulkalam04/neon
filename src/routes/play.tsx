import { createFileRoute, redirect } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { normalizeRoomCode } from "@/game/net/roomCode";
import { parsePlayMode, type PlayMode } from "@/game/flow/playFlow";

const PlayScreen = lazy(() =>
  import("@/pages/PlayScreen").then((module) => ({ default: module.PlayScreen })),
);

export const Route = createFileRoute("/play")({
  validateSearch: (search: Record<string, unknown>): { mode: PlayMode; room?: string } => {
    const room = typeof search["room"] === "string" ? normalizeRoomCode(search["room"]) : "";
    const mode = parsePlayMode(search["mode"], room.length === 5);
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
    return { mode, ...(room.length === 5 ? { room } : {}) };
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
  component: PlayRoute,
});

function PlayRoute() {
  const { mode, room } = Route.useSearch();
  return (
    <Suspense
      fallback={
        <main className="game-screen flex items-center justify-center bg-background" role="status">
          <p className="font-display text-lg text-primary">Loading arena…</p>
        </main>
      }
    >
      <PlayScreen mode={mode} {...(room ? { room } : {})} />
    </Suspense>
  );
}
