import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

const CustomizeScreen = lazy(() =>
  import("@/pages/CustomizeScreen").then((module) => ({ default: module.CustomizeScreen })),
);

export const Route = createFileRoute("/customize")({
  validateSearch: (search: Record<string, unknown>): { tab: "snakes" | "style" } => ({
    tab: search["tab"] === "style" ? "style" : "snakes",
  }),
  head: () => ({
    meta: [
      { title: "Customize Snake — Neon Serpent" },
      {
        property: "og:description",
        content: "Design your snake: pick a skin, a unique design, colors, eyes and boost effects.",
      },
      { property: "og:title", content: "Customize Snake — Neon Serpent" },
      {
        name: "description",
        content: "Design your snake: pick a skin, a unique design, colors, eyes and boost effects.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CustomizeRoute,
});

function CustomizeRoute() {
  const { tab } = Route.useSearch();
  return (
    <Suspense
      fallback={
        <main className="customize-screen flex items-center justify-center bg-arena" role="status">
          <p className="font-display text-lg text-primary">Loading customizer…</p>
        </main>
      }
    >
      <CustomizeScreen tab={tab} />
    </Suspense>
  );
}
