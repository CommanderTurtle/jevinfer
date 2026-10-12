// Adapted from Jevman, Copyright (c) 2026 Johnny Chadda. AGPL-3.0-or-later.
// https://github.com/opper-ai/jevman-benchmark/tree/b202e2cefd3dcf62b99835b319450b687960f40a
// Ported to static browser ESM; local endpoint integration and strict inference handling.
export const DIRS = ["up", "left", "down", "right"];
export const GHOST_IDS = ["blinky", "pinky", "inky", "clyde"];
export const ACTOR_IDS = ["pacman", ...GHOST_IDS];
export const sameTile = (a, b) => a.x === b.x && a.y === b.y;

