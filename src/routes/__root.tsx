import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { useGameStore } from "../lib/store";
import { AppRuntime } from "../app/AppRuntime";
import {
  clearPlayFlow,
  currentStorage,
  readLastScreen,
  writeLastScreen,
  type LastScreen,
} from "../lib/appPersistence";

function NotFoundComponent() {
  return (
    <div className="error-screen flex min-h-dvh items-center justify-center bg-background">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    if (import.meta.env["VITE_TARGET"] !== "app") {
      reportLovableError(error, { boundary: "tanstack_root_error_component" });
    }
  }, [error]);

  return (
    <div className="error-screen flex min-h-dvh items-center justify-center bg-background">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content:
          "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover",
      },
      { title: "Neon Serpent — Snake Arena" },
      { name: "description", content: "A polished neon multiplayer snake arena." },
      { property: "og:type", content: "website" },
      { property: "og:image", content: "/favicon-512.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: "/favicon-512.png" },
      { name: "theme-color", content: "#020923" },
    ],
    links: [
      ...(import.meta.env["VITE_TARGET"] === "app"
        ? []
        : [
            { rel: "preconnect", href: "https://fonts.googleapis.com" },
            {
              rel: "preconnect",
              href: "https://fonts.gstatic.com",
              crossOrigin: "anonymous" as const,
            },
            {
              rel: "stylesheet",
              href: "https://fonts.googleapis.com/css2?family=Audiowide&family=Chakra+Petch:wght@400;500;600;700&display=swap",
            },
          ]),
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "icon", href: "/favicon.png", type: "image/png", sizes: "32x32" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png", sizes: "180x180" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const search = useRouterState({ select: (state) => state.location.search });
  const [hydrated, setHydrated] = useState(useGameStore.persist.hasHydrated());
  const [startupComplete, setStartupComplete] = useState(false);
  const [startupError, setStartupError] = useState(false);
  const started = useRef(false);
  const skipLocationWrite = useRef(false);

  useEffect(() => {
    let active = true;
    const unsubscribe = useGameStore.persist.onFinishHydration(() => {
      if (active) setHydrated(true);
    });
    void Promise.resolve(useGameStore.persist.rehydrate())
      .then(() => {
        if (active) setHydrated(true);
      })
      .catch((error: unknown) => {
        console.error("Settings could not be restored", error);
        if (active) {
          setStartupError(true);
          setHydrated(true);
        }
      });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!hydrated || started.current) return;
    started.current = true;

    const storage = currentStorage();
    if (!storage) {
      setStartupComplete(true);
      return;
    }

    const restore = async () => {
      try {
        let ignoreRestore = false;
        try {
          ignoreRestore = sessionStorage.getItem("neon-serpent:skip-screen-restore") === "1";
          sessionStorage.removeItem("neon-serpent:skip-screen-restore");
        } catch (error) {
          console.error("Could not inspect startup restore state", error);
        }
        if (ignoreRestore) {
          clearPlayFlow(storage);
          setStartupComplete(true);
          return;
        }
        const saved = readLastScreen(storage);
        if (pathname === "/" && saved) {
          skipLocationWrite.current = true;
          await navigateSavedScreen(router, saved);
        } else if (pathname === "/") {
          clearPlayFlow(storage);
        }
        setStartupComplete(true);
      } catch (error) {
        console.error("Last screen could not be restored", error);
        setStartupComplete(true);
      }
    };
    void restore();
  }, [hydrated, pathname, router]);

  useEffect(() => {
    if (!startupComplete) return;
    if (skipLocationWrite.current) {
      skipLocationWrite.current = false;
      return;
    }

    const storage = currentStorage();
    if (!storage) return;
    const screen = toLastScreen(pathname, search, window.scrollY);
    if (!screen) return;
    writeLastScreen(storage, screen);
    if (pathname === "/") clearPlayFlow(storage);
  }, [pathname, search, startupComplete]);

  useEffect(() => {
    if (!startupComplete) return;
    const storage = currentStorage();
    if (!storage) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const saveScroll = () => {
      const screen = toLastScreen(pathname, search, window.scrollY);
      if (screen) writeLastScreen(storage, screen);
    };
    const onScroll = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(saveScroll, 250);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pagehide", saveScroll);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pagehide", saveScroll);
    };
  }, [pathname, search, startupComplete]);

  return (
    <QueryClientProvider client={queryClient}>
      <AppRuntime />
      {startupComplete ? (
        <Outlet />
      ) : (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-background text-xs text-muted-foreground"
          role="status"
          aria-label="Restoring Neon Serpent"
        >
          Loading…
          {startupError && <span className="sr-only">Some settings could not be restored.</span>}
        </div>
      )}
    </QueryClientProvider>
  );
}

function toLastScreen(
  pathname: string,
  search: Record<string, unknown>,
  scrollY: number,
): Omit<LastScreen, "savedAt"> | null {
  if (pathname === "/") return { path: "/", search: {}, scrollY };
  if (pathname === "/customize") {
    return {
      path: "/customize",
      search: {
        ...(search["tab"] === "style" ? { tab: "style" as const } : { tab: "snakes" as const }),
      },
      scrollY,
    };
  }
  if (pathname === "/play" && (search["mode"] === "ai" || search["mode"] === "online")) {
    return {
      path: "/play",
      search: {
        mode: search["mode"],
        ...(typeof search["room"] === "string" ? { room: search["room"] } : {}),
      },
      scrollY,
    };
  }
  return null;
}

async function navigateSavedScreen(
  router: ReturnType<typeof useRouter>,
  screen: LastScreen,
): Promise<void> {
  if (screen.path === "/customize") {
    await router.navigate({
      to: "/customize",
      search: screen.search.tab === "style" ? { tab: "style" } : { tab: "snakes" },
      replace: true,
    });
  } else if (screen.path === "/play") {
    await router.navigate({
      to: "/play",
      search: {
        mode: screen.search.mode === "online" ? "online" : "ai",
        ...(screen.search.room ? { room: screen.search.room } : {}),
      },
      replace: true,
    });
  } else {
    await router.navigate({ to: "/", replace: true });
  }
}
