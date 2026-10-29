import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { DEFAULT_SKIN, type SnakeSkin } from "@/game/render/drawSnake";
import { gameStorage } from "@/lib/platform";
import type { QualityChoice } from "@/lib/qualityProfile";

export type { SnakeSkin };
export type GraphicsQuality = QualityChoice;

interface GameState {
  nickname: string;
  customServerUrl: string;
  vibrationEnabled: boolean;
  musicVolume: number;
  skin: SnakeSkin;
  muted: boolean;
  volume: number;
  showFps: boolean;
  quality: GraphicsQuality;
  batterySaver: boolean;
  tutorialSeen: boolean;
  reduceMotion: boolean;
  controlScale: number;
  joystickSize: JoystickSize;
  joystickOpacity: number;
  /** Ids of favourited skin presets ("skin:tiger"). */
  favorites: string[];
  /** The snake last chosen on the Snakes tab; the Style tab's "Default" design restores it. */
  basePresetId: string;
  setBasePresetId: (id: string) => void;
  toggleFavorite: (id: string) => void;
  setNickname: (n: string) => void;
  setCustomServerUrl: (url: string) => void;
  setVibrationEnabled: (enabled: boolean) => void;
  setMusicVolume: (volume: number) => void;
  setSkin: (s: Partial<SnakeSkin>) => void;
  setEyes: (e: Partial<SnakeSkin["eyes"]>) => void;
  replaceSkin: (s: SnakeSkin) => void;
  setMuted: (m: boolean) => void;
  setVolume: (v: number) => void;
  setShowFps: (s: boolean) => void;
  setQuality: (q: GraphicsQuality) => void;
  setBatterySaver: (enabled: boolean) => void;
  setTutorialSeen: (s: boolean) => void;
  setReduceMotion: (enabled: boolean) => void;
  setControlScale: (scale: number) => void;
  setJoystickSize: (size: JoystickSize) => void;
  setJoystickOpacity: (opacity: number) => void;
}

export type JoystickSize = "S" | "M" | "L";

export const JOYSTICK_SIZE_SCALES: Record<JoystickSize, number> = {
  S: 0.85,
  M: 1.0,
  L: 1.2,
};

/** Accessories were removed from the game: never keep one, even from an old saved skin. */
const noAccessories = (skin: SnakeSkin): SnakeSkin => ({
  ...skin,
  hat: "none",
  back: "none",
  wings: "none",
});

export const useGameStore = create<GameState>()(
  persist(
    (set) => ({
      nickname: "",
      customServerUrl: "",
      vibrationEnabled: true,
      musicVolume: 0.8,
      skin: DEFAULT_SKIN,
      muted: false,
      volume: 0.8,
      showFps: false,
      quality: "auto",
      batterySaver: false,
      tutorialSeen: false,
      reduceMotion: false,
      controlScale: 1,
      joystickSize: "M",
      joystickOpacity: 0.8,
      favorites: [],
      basePresetId: "neon",
      setBasePresetId: (basePresetId) => set({ basePresetId }),
      toggleFavorite: (id) =>
        set((st) => ({
          favorites: st.favorites.includes(id)
            ? st.favorites.filter((f) => f !== id)
            : [...st.favorites, id],
        })),
      setNickname: (nickname) => set({ nickname: nickname.slice(0, 16) }),
      setCustomServerUrl: (customServerUrl) =>
        set({ customServerUrl: customServerUrl.slice(0, 256) }),
      setVibrationEnabled: (vibrationEnabled) => set({ vibrationEnabled }),
      setMusicVolume: (musicVolume) => set({ musicVolume: Math.max(0, Math.min(1, musicVolume)) }),
      setSkin: (s) => set((st) => ({ skin: noAccessories({ ...st.skin, ...s }) })),
      setEyes: (e) => set((st) => ({ skin: { ...st.skin, eyes: { ...st.skin.eyes, ...e } } })),
      replaceSkin: (skin) => set({ skin: noAccessories(skin) }),
      setMuted: (muted) => set({ muted }),
      setVolume: (volume) => set({ volume: Math.max(0, Math.min(1, volume)) }),
      setShowFps: (showFps) => set({ showFps }),
      setQuality: (quality) => set({ quality }),
      setBatterySaver: (batterySaver) => set({ batterySaver }),
      setTutorialSeen: (tutorialSeen) => set({ tutorialSeen }),
      setReduceMotion: (reduceMotion) => set({ reduceMotion }),
      setControlScale: (controlScale) => {
        const clamped = Math.max(0.8, Math.min(1.3, controlScale));
        const size: JoystickSize = clamped < 0.92 ? "S" : clamped > 1.1 ? "L" : "M";
        set({ controlScale: clamped, joystickSize: size });
      },
      setJoystickSize: (joystickSize) =>
        set({
          joystickSize,
          controlScale: JOYSTICK_SIZE_SCALES[joystickSize] ?? 1.0,
        }),
      setJoystickOpacity: (joystickOpacity) =>
        set({ joystickOpacity: Math.max(0.2, Math.min(1, joystickOpacity)) }),
    }),
    {
      name: "neon-serpent",
      version: 3,
      storage: createJSONStorage(() => gameStorage),
      skipHydration: true,
      // Old saved skins may lack newer fields (hat/back/wings...): fill them from defaults.
      merge: (persisted, current) => {
        const p = { ...((persisted ?? {}) as Partial<GameState> & { lockLandscape?: boolean }) };
        delete p.lockLandscape;
        const skin = noAccessories({ ...DEFAULT_SKIN, ...(p.skin ?? {}) });
        skin.eyes = { ...DEFAULT_SKIN.eyes, ...(p.skin?.eyes ?? {}) };
        return {
          ...current,
          ...p,
          skin,
          customServerUrl:
            typeof p.customServerUrl === "string" ? p.customServerUrl.slice(0, 256) : "",
          vibrationEnabled: typeof p.vibrationEnabled === "boolean" ? p.vibrationEnabled : true,
          musicVolume:
            typeof p.musicVolume === "number" ? Math.max(0, Math.min(1, p.musicVolume)) : 0.8,
          favorites: Array.isArray(p.favorites) ? p.favorites : [],
          basePresetId: typeof p.basePresetId === "string" ? p.basePresetId : "neon",
          quality:
            p.quality === "high" ||
            p.quality === "medium" ||
            p.quality === "low" ||
            p.quality === "auto"
              ? p.quality
              : "auto",
          batterySaver: typeof p.batterySaver === "boolean" ? p.batterySaver : false,
          reduceMotion: typeof p.reduceMotion === "boolean" ? p.reduceMotion : false,
          controlScale:
            typeof p.controlScale === "number" ? Math.max(0.8, Math.min(1.3, p.controlScale)) : 1,
          joystickSize:
            p.joystickSize === "S" || p.joystickSize === "M" || p.joystickSize === "L"
              ? p.joystickSize
              : p.controlScale
                ? p.controlScale < 0.92
                  ? "S"
                  : p.controlScale > 1.1
                    ? "L"
                    : "M"
                : "M",
          joystickOpacity:
            typeof p.joystickOpacity === "number"
              ? Math.max(0.2, Math.min(1, p.joystickOpacity))
              : 0.8,
        };
      },
      migrate: (persisted) => {
        const p = (persisted ?? {}) as Partial<GameState>;
        return { ...p, quality: p.quality ?? "auto", batterySaver: p.batterySaver ?? false };
      },
    },
  ),
);
