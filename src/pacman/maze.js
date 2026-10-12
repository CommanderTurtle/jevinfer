// Adapted from Jevman, Copyright (c) 2026 Johnny Chadda. AGPL-3.0-or-later.
// https://github.com/opper-ai/jevman-benchmark/tree/b202e2cefd3dcf62b99835b319450b687960f40a
// Ported to static browser ESM; local endpoint integration and strict inference handling.
import { DIRS } from "./types.js";
export const DIR_VEC = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 }
};
export const REVERSE = { up: "down", down: "up", left: "right", right: "left" };

export class Maze {
  width;
  height;
  pellets = new Set;
  powerPellets = new Set;
  walls = [];
  distanceCache = new Map;
  constructor(rows) {
    this.height = rows.length;
    this.width = rows[0]?.length ?? 0;
    if (rows.some((row) => row.length !== this.width))
      throw new Error("ragged layout");
    rows.forEach((row, y) => [...row].forEach((c, x) => {
      this.walls.push(c === "#" || c === "-" || c === "_");
      if (c === ".")
        this.pellets.add(y * this.width + x);
      if (c === "o")
        this.powerPellets.add(y * this.width + x);
    }));
  }
  key(t) {
    return t.y * this.width + t.x;
  }
  fromKey(k) {
    return { x: k % this.width, y: Math.floor(k / this.width) };
  }
  isWalkable(t) {
    if (t.y < 0 || t.y >= this.height)
      return false;
    const x = (t.x % this.width + this.width) % this.width;
    return !this.walls[t.y * this.width + x];
  }
  neighbor(t, d) {
    const v = DIR_VEC[d];
    return { x: (t.x + v.x + this.width) % this.width, y: t.y + v.y };
  }
  openDirs(t) {
    return DIRS.filter((d) => this.isWalkable(this.neighbor(t, d)));
  }
  distances(from, blocked) {
    const dist = new Int16Array(this.width * this.height).fill(-1);
    if (!this.isWalkable(from))
      return dist;
    const blockedKey = blocked ? this.key(blocked) : -1;
    const queue = [this.key(from)];
    dist[queue[0]] = 0;
    for (let i = 0;i < queue.length; i++) {
      const tile = this.fromKey(queue[i]);
      for (const d of DIRS) {
        const n = this.neighbor(tile, d);
        if (!this.isWalkable(n))
          continue;
        const k = this.key(n);
        if (k === blockedKey || dist[k] !== -1)
          continue;
        dist[k] = dist[queue[i]] + 1;
        queue.push(k);
      }
    }
    return dist;
  }
  distanceMap(to) {
    const k = this.key(to);
    let map = this.distanceCache.get(k);
    if (!map) {
      map = this.distances(to);
      this.distanceCache.set(k, map);
    }
    return map;
  }
  nearestWalkable(t) {
    const c = {
      x: Math.min(this.width - 1, Math.max(0, t.x)),
      y: Math.min(this.height - 1, Math.max(0, t.y))
    };
    if (this.isWalkable(c))
      return c;
    for (let r = 1;r < this.width + this.height; r++) {
      for (let dx = -r;dx <= r; dx++) {
        const dy = r - Math.abs(dx);
        for (const n of [{ x: c.x + dx, y: c.y + dy }, { x: c.x + dx, y: c.y - dy }]) {
          if (n.x >= 0 && n.x < this.width && this.isWalkable(n))
            return n;
        }
      }
    }
    return c;
  }
}

