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
  lockLandscape: boolean;
  tutorialSeen: boolean;
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
  setLockLandscape: (enabled: boolean) => void;
  setTutorialSeen: (s: boolean) => void;
}

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
      lockLandscape: false,
      tutorialSeen: false,
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
      setLockLandscape: (lockLandscape) => set({ lockLandscape }),
      setTutorialSeen: (tutorialSeen) => set({ tutorialSeen }),
    }),
    {
      name: "neon-serpent",
      version: 3,
      storage: createJSONStorage(() => gameStorage),
      skipHydration: true,
      // Old saved skins may lack newer fields (hat/back/wings...): fill them from defaults.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<GameState>;
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
        };
      },
      migrate: (persisted) => {
        const p = (persisted ?? {}) as Partial<GameState>;
        return { ...p, quality: p.quality ?? "auto", batterySaver: p.batterySaver ?? false };
      },
    },
  ),
);
