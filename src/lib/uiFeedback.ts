import {
  playUiClick,
  setMuted as setAudioMuted,
  setVolume as setAudioVolume,
  unlockAudio,
} from "@/game/audio";
import { vibrateTap } from "@/lib/platform";

let lastFeedbackAt = 0;
interface TapPreferences {
  vibrationEnabled: boolean;
  muted: boolean;
  volume: number;
}

export function provideTapFeedback(target: EventTarget | null, preferences: TapPreferences) {
  if (
    !(target instanceof Element) ||
    !target.closest("button, a, input, select, [role='button'], [role='switch'], [role='tab']")
  )
    return;
  const now = performance.now();
  if (now - lastFeedbackAt < 55) return;
  lastFeedbackAt = now;
  setAudioMuted(preferences.muted);
  setAudioVolume(preferences.volume);
  unlockAudio();
  playUiClick();
  if (preferences.vibrationEnabled) void vibrateTap().catch(console.error);
}
