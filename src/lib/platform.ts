import type { StateStorage } from "zustand/middleware";

type CapacitorWindow = Window & {
  androidBridge?: unknown;
  Capacitor?: {
    isNativePlatform: () => boolean;
    getPlatform: () => string;
  };
  webkit?: {
    messageHandlers?: {
      bridge?: unknown;
    };
  };
};

function isNative(): boolean {
  if (typeof window === "undefined") return false;
  const nativeWindow = window as CapacitorWindow;
  return (
    nativeWindow.Capacitor?.isNativePlatform() === true ||
    nativeWindow.androidBridge !== undefined ||
    nativeWindow.webkit?.messageHandlers?.bridge !== undefined
  );
}

export async function addAppStateListener(callback: (isActive: boolean) => void) {
  if (!isNative()) return () => undefined;
  const { App } = await import("@capacitor/app");
  const listener = await App.addListener("appStateChange", ({ isActive }) => callback(isActive));
  return () => listener.remove();
}

export async function addBackButtonListener(callback: () => void) {
  if (!isNative()) return () => undefined;
  const { App } = await import("@capacitor/app");
  const listener = await App.addListener("backButton", callback);
  return () => listener.remove();
}

export async function exitApp() {
  if (!isNative()) return;
  const { App } = await import("@capacitor/app");
  await App.exitApp();
}

export async function addNetworkStatusListener(callback: (connected: boolean) => void) {
  if (typeof window !== "undefined") {
    const handleOnline = () => callback(true);
    const handleOffline = () => callback(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    if (!isNative()) {
      return () => {
        window.removeEventListener("online", handleOnline);
        window.removeEventListener("offline", handleOffline);
      };
    }

    const { Network } = await import("@capacitor/network");
    const listener = await Network.addListener("networkStatusChange", ({ connected }) =>
      callback(connected),
    );
    const status = await Network.getStatus();
    callback(status.connected);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      void listener.remove();
    };
  }
  return () => undefined;
}

export async function shareText(title: string, text: string) {
  if (isNative()) {
    const { Share } = await import("@capacitor/share");
    await Share.share({ title, text, dialogTitle: title });
    return;
  }
  if (typeof navigator !== "undefined" && navigator.share) {
    await navigator.share({ title, text });
    return;
  }
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    await navigator.clipboard.writeText(text);
  }
}

export async function setStatusBarHidden(hidden: boolean) {
  if (!isNative()) return;
  const { StatusBar, Style } = await import("@capacitor/status-bar");
  await StatusBar.setOverlaysWebView({ overlay: true });
  await StatusBar.setStyle({ style: Style.Light });
  if (hidden) {
    await StatusBar.hide();
  } else {
    await StatusBar.show();
  }
}

export async function hideSplashScreen() {
  if (!isNative()) return;
  const { SplashScreen } = await import("@capacitor/splash-screen");
  await SplashScreen.hide();
}

export async function vibrate(kind: "boost" | "big-eat" | "death") {
  if (isNative()) {
    const { Haptics, ImpactStyle, NotificationType } = await import("@capacitor/haptics");
    if (kind === "death") {
      await Haptics.notification({ type: NotificationType.Error });
    } else {
      await Haptics.impact({
        style: kind === "boost" ? ImpactStyle.Light : ImpactStyle.Heavy,
      });
    }
    return;
  }

  if (typeof navigator === "undefined" || !navigator.vibrate) return;
  const pattern = kind === "death" ? [80, 40, 120] : kind === "big-eat" ? 45 : 18;
  navigator.vibrate(pattern);
}

export async function vibrateTap() {
  if (isNative()) {
    const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
    await Haptics.impact({ style: ImpactStyle.Light });
    return;
  }
  if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10);
}

let landscapeLock: Promise<void> | undefined;

export function lockLandscape() {
  if (!isNative()) return Promise.resolve();
  if (!landscapeLock) {
    landscapeLock = import("@capacitor/screen-orientation").then(({ ScreenOrientation }) =>
      ScreenOrientation.lock({ orientation: "landscape" }),
    );
  }
  return landscapeLock;
}

export async function setKeepAwake(enabled: boolean) {
  if (!isNative()) return;
  const { KeepAwake } = await import("@capacitor-community/keep-awake");
  if (enabled) {
    await KeepAwake.keepAwake();
  } else {
    await KeepAwake.allowSleep();
  }
}

async function getPreference(key: string) {
  if (!isNative()) {
    return typeof localStorage === "undefined" ? null : localStorage.getItem(key);
  }
  const { Preferences } = await import("@capacitor/preferences");
  const { value } = await Preferences.get({ key });
  if (value !== null) return value;
  const legacyValue = localStorage.getItem(key);
  if (legacyValue !== null) await Preferences.set({ key, value: legacyValue });
  return legacyValue;
}

async function setPreference(key: string, value: string) {
  if (!isNative()) {
    localStorage.setItem(key, value);
    return;
  }
  const { Preferences } = await import("@capacitor/preferences");
  await Preferences.set({ key, value });
}

async function removePreference(key: string) {
  if (!isNative()) {
    localStorage.removeItem(key);
    return;
  }
  const { Preferences } = await import("@capacitor/preferences");
  await Preferences.remove({ key });
}

export const gameStorage: StateStorage = {
  getItem: getPreference,
  setItem: setPreference,
  removeItem: removePreference,
};
