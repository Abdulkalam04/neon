/** Tiny synthesized sound effects (Web Audio). Call unlock() from a user gesture first. */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let boostGain: GainNode | null = null;
let muted = false;
let volume = 0.8;
let lastEat = 0;
let lastUiCue = 0;
let boostSoundRequested = false;
let boostGainTarget: number | null = null;

export function unlockAudio() {
  if (typeof window === "undefined") return;
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5 * volume;
    master.connect(ctx.destination);

    // Looping filtered noise for boost
    const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 900;
    filter.Q.value = 0.8;
    boostGain = ctx.createGain();
    boostGain.gain.value = 0;
    boostGainTarget = 0;
    src.connect(filter).connect(boostGain).connect(master);
    src.start();
    syncBoostSound();
  }
  resumeAudio();
}

export function resumeAudio() {
  if (ctx?.state === "suspended") void ctx.resume();
}

export function suspendAudio() {
  setBoostSound(false);
  if (ctx?.state === "running") void ctx.suspend();
}

export function setMuted(m: boolean) {
  muted = m;
  if (master && ctx) master.gain.setTargetAtTime(m ? 0 : 0.5 * volume, ctx.currentTime, 0.02);
  syncBoostSound();
}

export function setVolume(v: number) {
  volume = Math.max(0, Math.min(1, v));
  if (master && ctx && !muted) master.gain.setTargetAtTime(0.5 * volume, ctx.currentTime, 0.02);
}

function tone(freq: number, endFreq: number, dur: number, type: OscillatorType, vol: number) {
  if (!ctx || !master || muted) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

export function playEat() {
  const now = performance.now();
  if (now - lastEat < 45) return;
  lastEat = now;
  const f = 700 + Math.random() * 500;
  tone(f, f * 1.6, 0.08, "sine", 0.12);
}

export function playUiClick() {
  const now = performance.now();
  if (now - lastUiCue < 55) return;
  lastUiCue = now;
  tone(680, 520, 0.045, "sine", 0.045);
}

export function setBoostSound(on: boolean) {
  boostSoundRequested = on;
  syncBoostSound();
}

function syncBoostSound() {
  if (!ctx || !boostGain) return;
  const target = boostSoundRequested && !muted ? 0.08 : 0;
  if (target === boostGainTarget) return;
  boostGainTarget = target;
  boostGain.gain.setTargetAtTime(target, ctx.currentTime, 0.06);
}

export function playDeath() {
  tone(420, 50, 0.9, "sawtooth", 0.18);
  tone(220, 30, 1.1, "square", 0.08);
}
