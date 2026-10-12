// Adapted from Jevman, Copyright (c) 2026 Johnny Chadda. AGPL-3.0-or-later.
// https://github.com/opper-ai/jevman-benchmark/tree/b202e2cefd3dcf62b99835b319450b687960f40a
// Ported to static browser ESM; local endpoint integration and strict inference handling.
import { DIR_VEC } from "./maze.js";
import { GHOST_COLORS, TILE } from "./render.js";
export const SHOW_MS = 1600;
const COLOR = { pacman: "#ffd800", ...GHOST_COLORS };
export function arrowsFor(d) {
  return d.options.map((dir) => ({
    dir,
    p: d.probabilities[dir] ?? (dir === d.choice ? 1 : 0),
    chosen: dir === d.choice
  }));
}

export class Thinking {
  shown = new Map;
  add(d, now) {
    if (d.source !== "jev" || !Object.keys(d.probabilities).length)
      return;
    this.shown.set(d.actor, { d, at: now });
  }
  clear() {
    this.shown.clear();
  }
  draw(ctx, now) {
    for (const [actor, { d, at }] of this.shown) {
      const age = now - at;
      if (age > SHOW_MS) {
        this.shown.delete(actor);
        continue;
      }
      const alpha = age < SHOW_MS * 0.6 ? 1 : 1 - (age - SHOW_MS * 0.6) / (SHOW_MS * 0.4);
      const cx = (d.tile.x + 0.5) * TILE;
      const cy = (d.tile.y + 0.5) * TILE;
      ctx.save();
      ctx.globalAlpha = alpha;
      for (const a of arrowsFor(d)) {
        const v = DIR_VEC[a.dir];
        const len = 8 + a.p * 26;
        const color = COLOR[actor];
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.globalAlpha = alpha * (a.chosen ? 1 : 0.4 + a.p * 0.5);
        ctx.lineWidth = a.chosen ? 4 : 2.5;
        ctx.lineCap = "round";
        const x0 = cx + v.x * 12;
        const y0 = cy + v.y * 12;
        const x1 = cx + v.x * (12 + len);
        const y1 = cy + v.y * (12 + len);
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
        const hx = -v.y;
        const hy = v.x;
        ctx.beginPath();
        ctx.moveTo(x1 + v.x * 7, y1 + v.y * 7);
        ctx.lineTo(x1 + hx * 5.5, y1 + hy * 5.5);
        ctx.lineTo(x1 - hx * 5.5, y1 - hy * 5.5);
        ctx.closePath();
        ctx.fill();
        if (a.chosen) {
          ctx.globalAlpha = alpha;
          ctx.font = "bold 12px ui-monospace, monospace";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          const tx = x1 + v.x * 20 + (v.x === 0 ? 18 : 0);
          const ty = y1 + v.y * 18 + (v.y === 0 ? -12 : 0);
          const label = `${Math.round(a.p * 100)}%`;
          ctx.fillStyle = "rgba(0,0,0,0.8)";
          ctx.beginPath();
          ctx.roundRect(tx - 17, ty - 8, 34, 16, 4);
          ctx.fill();
          ctx.fillStyle = color;
          ctx.fillText(label, tx, ty);
        }
      }
      ctx.restore();
    }
  }
}

