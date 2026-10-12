// Adapted from Jevman, Copyright (c) 2026 Johnny Chadda. AGPL-3.0-or-later.
// https://github.com/opper-ai/jevman-benchmark/tree/b202e2cefd3dcf62b99835b319450b687960f40a
// Ported to static browser ESM; local endpoint integration and strict inference handling.
const GHOST_POINTS = new Set(["200", "400", "800", "1600"]);
export const snapshot = (s) => ({
  status: s.status,
  pelletsEaten: s.pelletsEaten,
  frightLeft: s.frightLeft,
  popups: new Set(s.popups),
  level: s.level
});
export function cuesBetween(before, after) {
  const cues = [];
  if (after.frightLeft > before.frightLeft + 0.5)
    cues.push("power");
  else if (after.pelletsEaten > before.pelletsEaten)
    cues.push("pellet");
  for (const p of after.popups) {
    if (before.popups.has(p))
      continue;
    cues.push(GHOST_POINTS.has(p.text) ? "ghost" : "fruit");
  }
  if (before.status === "playing" && after.status === "dying")
    cues.push("death");
  if (before.status === "playing" && after.status === "levelclear")
    cues.push("levelclear");
  return cues;
}
const STORAGE_KEY = "jev-infer.pacman.sound";

export class Sound {
  ctx = null;
  waka = false;
  lastPellet = 0;
  enabled;
  constructor() {
    let stored = null;
    try {
      stored = localStorage.getItem(STORAGE_KEY);
    } catch {}
    this.enabled = stored !== "off";
  }
  unlock() {
    if (this.ctx)
      return void this.ctx.resume().catch(() => {});
    const Ctx = window.AudioContext ?? window.webkitAudioContext;
    if (!Ctx)
      return;
    this.ctx = new Ctx;
  }
  toggle() {
    this.enabled = !this.enabled;
    try {
      localStorage.setItem(STORAGE_KEY, this.enabled ? "on" : "off");
    } catch {}
    return this.enabled;
  }
  stop() {
    const ctx = this.ctx;
    this.ctx = null;
    this.lastPellet = 0;
    if (ctx) void ctx.close().catch(() => {});
  }
  play(cue) {
    if (!this.enabled || !this.ctx || this.ctx.state !== "running")
      return;
    const now = this.ctx.currentTime;
    switch (cue) {
      case "pellet": {
        if (now - this.lastPellet < 0.09)
          return;
        this.lastPellet = now;
        this.waka = !this.waka;
        return this.sweep(this.waka ? 260 : 520, this.waka ? 520 : 260, 0.09, "triangle", 0.18);
      }
      case "power":
        return this.sweep(180, 90, 0.35, "sawtooth", 0.12);
      case "ghost":
        return this.sweep(300, 1400, 0.22, "square", 0.1);
      case "fruit":
        return this.notes([880, 1175, 1568], 0.07, "triangle", 0.16);
      case "death":
        return this.sweep(700, 80, 1.1, "square", 0.1);
      case "levelclear":
        return this.notes([523, 659, 784, 1047, 784, 1047], 0.1, "triangle", 0.16);
      case "start":
        return this.notes([494, 988, 740, 622, 988, 740, 622], 0.11, "square", 0.08);
    }
  }
  sweep(from, to, seconds, type, volume, at = 0) {
    const ctx = this.ctx;
    const t = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + seconds);
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + seconds + 0.02);
  }
  notes(freqs, each, type, volume) {
    freqs.forEach((f, i) => this.sweep(f, f, each * 0.95, type, volume, i * each));
  }
}

