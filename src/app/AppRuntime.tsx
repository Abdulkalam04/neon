import { useEffect } from "react";
import { useRef, useState } from "react";
import { useRouter, useRouterState } from "@tanstack/react-router";

import {
  addBackButtonListener,
  exitApp,
  hideSplashScreen,
  lockLandscape,
  setStatusBarHidden,
} from "../lib/platform";
import { installAppErrorReporter } from "../lib/app-error-reporter";
import { resumeAudio, unlockAudio } from "../game/audio";
import { clearPlayFlow, currentStorage } from "../lib/appPersistence";

export function AppRuntime() {
  const router = useRouter();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const pathnameRef = useRef(pathname);
  const [showBackHint, setShowBackHint] = useState(false);
  pathnameRef.current = pathname;

  useEffect(() => {
    const removeErrorReporter = installAppErrorReporter();
    void lockLandscape()
      .catch(console.error)
      .then(() => hideSplashScreen())
      .catch(console.error);
    void setStatusBarHidden(false).catch(console.error);

    const unlock = () => unlockAudio();
    const resume = () => {
      if (!document.hidden) resumeAudio();
    };
    document.addEventListener("pointerdown", unlock, { passive: true });
    document.addEventListener("touchstart", unlock, { passive: true });
    document.addEventListener("visibilitychange", resume);
    return () => {
      document.removeEventListener("pointerdown", unlock);
      document.removeEventListener("touchstart", unlock);
      document.removeEventListener("visibilitychange", resume);
      removeErrorReporter();
    };
  }, []);

  useEffect(() => {
    let active = true;
    let lastBackAt = 0;
    let hintTimer: ReturnType<typeof setTimeout> | null = null;
    let removeListener: () => void | Promise<void> = () => undefined;

    void addBackButtonListener(() => {
      if (pathnameRef.current === "/play") {
        const event = new Event("neon-android-back", { cancelable: true });
        window.dispatchEvent(event);
        if (event.defaultPrevented) return;
      }
      if (pathnameRef.current !== "/") {
        if (pathnameRef.current === "/play") {
          const storage = currentStorage();
          if (storage) clearPlayFlow(storage);
        }
        void router.navigate({ to: "/", replace: true });
        return;
      }

      const now = Date.now();
      if (now - lastBackAt < 2000) {
        void exitApp().catch(console.error);
        return;
      }
      lastBackAt = now;
      setShowBackHint(true);
      if (hintTimer) clearTimeout(hintTimer);
      hintTimer = setTimeout(() => setShowBackHint(false), 2000);
    })
      .then((remove) => {
        if (active) removeListener = remove;
        else void remove();
      })
      .catch(console.error);

    return () => {
      active = false;
      void removeListener();
      if (hintTimer) clearTimeout(hintTimer);
    };
  }, [router]);

  useEffect(() => {
    if (pathname !== "/play") void setStatusBarHidden(false).catch(console.error);
  }, [pathname]);

  return showBackHint ? (
    <div
      role="status"
      className="fixed inset-x-0 z-[100] mx-auto w-fit rounded-full border border-border bg-background/90 px-5 py-3 text-sm text-foreground shadow-xl"
      style={{ bottom: "max(2rem, env(safe-area-inset-bottom))" }}
    >
      Press back again to exit
    </div>
  ) : null;
}
