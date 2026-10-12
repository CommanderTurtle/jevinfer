// Adapted from Jevman, Copyright (c) 2026 Johnny Chadda. AGPL-3.0-or-later.
// https://github.com/opper-ai/jevman-benchmark/tree/b202e2cefd3dcf62b99835b319450b687960f40a
// Ported to static browser ESM; local endpoint integration and strict inference handling.
import { CLASSIC_LAYOUT, FRUIT_TILE, GHOST_DOOR_EXIT, HOUSE_TILES, PACMAN_START } from "./layout.js";
import { DIR_VEC, Maze, REVERSE } from "./maze.js";
import { GHOST_IDS, sameTile } from "./types.js";
export const SPEED = { pacman: 7.5, ghost: 7, frightened: 4.5, eaten: 14 };
export const READY_SECONDS = 1.5;
export const DYING_SECONDS = 1.5;
export const LEVELCLEAR_SECONDS = 2;
export const FRUIT_SECONDS = 9.5;
export const FRUIT_THRESHOLDS = [70, 170];
const RELEASE_AT = { blinky: 0, pinky: 1, inky: 4, clyde: 7 };
const MODE_SCHEDULE = [
  ["scatter", 7],
  ["chase", 20],
  ["scatter", 7],
  ["chase", 20],
  ["scatter", 5],
  ["chase", 20],
  ["scatter", 5],
  ["chase", 1 / 0]
];
const FRUITS = [
  [1, "cherry", 100],
  [2, "strawberry", 300],
  [4, "orange", 500],
  [6, "apple", 700],
  [8, "melon", 1000],
  [10, "galaxian", 2000],
  [12, "bell", 3000],
  [1 / 0, "key", 5000]
];
const SUBSTEP = 1 / 60;
const COLLISION_DISTANCE = 0.6;
const CORRIDOR_LIMIT = 40;
const EPSILON = 0.000000001;
export function modeAt(seconds) {
  let t = seconds;
  for (const [mode, length] of MODE_SCHEDULE) {
    if (t < length)
      return mode;
    t -= length;
  }
  return "chase";
}
export const frightSeconds = (level) => Math.max(2, 7 - level);
export function fruitForLevel(level) {
  const [, kind, points] = FRUITS.find(([maxLevel]) => level <= maxLevel);
  return { kind, points };
}
export function createGame(opts = {}) {
  const base = { tile: { x: 0, y: 0 }, dir: "left", progress: 0, waiting: false, epoch: 0 };
  const ghosts = Object.fromEntries(GHOST_IDS.map((id) => [id, { ...base, id, state: "house", releaseAt: 0 }]));
  const state = {
    layout: CLASSIC_LAYOUT,
    maze: new Maze(CLASSIC_LAYOUT),
    pacman: { ...base, id: "pacman" },
    ghosts,
    pacmanControl: opts.pacmanControl ?? "jev",
    ghostsByAI: opts.ghostsByAI ?? (opts.pacmanControl ?? "jev") === "keyboard",
    keyDir: null,
    status: "ready",
    statusTimer: READY_SECONDS,
    mode: "scatter",
    modeTime: 0,
    frightLeft: 0,
    frightChain: 0,
    score: 0,
    lives: 3,
    level: 1,
    pelletsEaten: 0,
    fruit: null,
    fruitsSpawned: 0,
    lifeTime: 0,
    popups: [],
    caughtBy: null
  };
  resetPositions(state);
  return state;
}
export function resetPositions(state) {
  const p = state.pacman;
  p.tile = { ...PACMAN_START };
  p.dir = "left";
  p.progress = 0;
  p.waiting = false;
  p.epoch += 1;
  for (const id of GHOST_IDS) {
    const g = state.ghosts[id];
    g.tile = { ...HOUSE_TILES[id] };
    g.dir = id === "blinky" ? "left" : "up";
    g.progress = 0;
    g.waiting = false;
    g.epoch += 1;
    g.state = id === "blinky" ? "normal" : "house";
    g.releaseAt = RELEASE_AT[id];
  }
  state.status = "ready";
  state.statusTimer = READY_SECONDS;
  state.mode = "scatter";
  state.modeTime = 0;
  state.frightLeft = 0;
  state.frightChain = 0;
  state.lifeTime = 0;
  state.keyDir = null;
  state.caughtBy = null;
}
export const actorOf = (state, id) => id === "pacman" ? state.pacman : state.ghosts[id];
const ghostList = (state) => GHOST_IDS.map((id) => state.ghosts[id]);
export function jevActors(state) {
  return [...state.pacmanControl === "jev" ? ["pacman"] : [], ...state.ghostsByAI ? GHOST_IDS : []];
}
export function isJevDriven(state, id) {
  if (id === "pacman")
    return state.pacmanControl === "jev";
  const s = state.ghosts[id].state;
  return s === "normal" || s === "frightened";
}
export function actorPosition(a) {
  const v = DIR_VEC[a.dir];
  return { x: a.tile.x + v.x * a.progress, y: a.tile.y + v.y * a.progress };
}
export function occupiedTile(state, a) {
  return a.progress >= 0.5 ? state.maze.neighbor(a.tile, a.dir) : a.tile;
}
function forcedDir(state, tile, heading) {
  const open = state.maze.openDirs(tile);
  const ahead = open.filter((d) => d !== REVERSE[heading]);
  if (ahead.length === 1)
    return ahead[0];
  if (ahead.length === 0)
    return open[0] ?? null;
  return null;
}
export function optionsAt(state, id, tile, heading) {
  const open = state.maze.openDirs(tile);
  return id === "pacman" ? open : open.filter((d) => d !== REVERSE[heading]);
}
export function decisionKey(state, id, tile, heading) {
  const mood = id === "pacman" ? state.frightLeft > 0 ? "hunt" : "eat" : state.ghosts[id].state;
  const mode = id === "pacman" ? "" : `:${state.mode}`;
  return `${id}@${tile.x},${tile.y}>${heading}#${actorOf(state, id).epoch}:${mood}${mode}`;
}
export function decisionPointAt(state, id, tile, heading) {
  if (forcedDir(state, tile, heading) !== null)
    return null;
  return {
    actor: id,
    tile: { ...tile },
    heading,
    options: optionsAt(state, id, tile, heading),
    key: decisionKey(state, id, tile, heading),
    distance: 0
  };
}
export function nextDecisionPoint(state, id) {
  if (!isJevDriven(state, id))
    return null;
  const a = actorOf(state, id);
  if (a.waiting)
    return decisionPointAt(state, id, a.tile, a.dir);
  let tile = state.maze.neighbor(a.tile, a.dir);
  let heading = a.dir;
  for (let i = 0;i < state.maze.width * state.maze.height; i++) {
    const point = decisionPointAt(state, id, tile, heading);
    if (point)
      return { ...point, distance: i + 1 };
    heading = forcedDir(state, tile, heading);
    tile = state.maze.neighbor(tile, heading);
  }
  return null;
}
export function escapePoint(state) {
  const a = state.pacman;
  if (state.status !== "playing" || state.pacmanControl !== "jev" || a.waiting || !canTurnBack(state, a))
    return null;
  const ahead = [];
  let tile = state.maze.neighbor(a.tile, a.dir);
  let heading = a.dir;
  for (let i = 0;i < CORRIDOR_LIMIT; i++) {
    ahead.push(tile);
    const next = forcedDir(state, tile, heading);
    if (next === null)
      break;
    heading = next;
    tile = state.maze.neighbor(tile, heading);
  }
  const junction = ahead[ahead.length - 1];
  const toJunction = state.maze.distances(junction, a.tile);
  const threats = GHOST_IDS.filter((id) => {
    const g = state.ghosts[id];
    if (g.state !== "normal")
      return false;
    const at = occupiedTile(state, g);
    const d = toJunction[state.maze.key(at)];
    return ahead.some((t) => sameTile(t, at)) || d >= 0 && d <= ahead.length;
  });
  if (!threats.length)
    return null;
  const mood = state.frightLeft > 0 ? "hunt" : "eat";
  return {
    actor: "pacman",
    tile: { ...a.tile },
    heading: a.dir,
    options: [a.dir, REVERSE[a.dir]],
    key: `pacman~${junction.x},${junction.y}#${a.epoch}:${mood}:${threats.join("+")}`,
    distance: 0,
    escape: true,
    threats
  };
}
export function decisionPoints(state, id) {
  const escape = id === "pacman" ? escapePoint(state) : null;
  const junction = nextDecisionPoint(state, id);
  return [escape, junction].filter((p) => p !== null);
}
export function step(state, dt, ctl) {
  state.popups = state.popups.filter((p) => (p.ttl -= dt) > 0);
  if (state.status === "gameover")
    return;
  if (state.status !== "playing") {
    state.statusTimer -= dt;
    if (state.statusTimer > EPSILON)
      return;
    if (state.status === "ready") {
      state.status = "playing";
    } else if (state.status === "dying") {
      state.lives -= 1;
      if (state.lives <= 0)
        state.status = "gameover";
      else
        resetPositions(state);
    } else if (state.status === "levelclear") {
      state.level += 1;
      state.maze = new Maze(state.layout);
      state.pelletsEaten = 0;
      state.fruit = null;
      state.fruitsSpawned = 0;
      resetPositions(state);
    }
    return;
  }
  for (let left = dt;left > EPSILON && state.status === "playing"; left -= SUBSTEP) {
    tick(state, Math.min(left, SUBSTEP), ctl);
  }
}
function tick(state, h, ctl) {
  state.lifeTime += h;
  if (state.frightLeft > 0) {
    state.frightLeft = Math.max(0, state.frightLeft - h);
    if (state.frightLeft === 0) {
      for (const g of ghostList(state))
        if (g.state === "frightened")
          g.state = "normal";
    }
  } else {
    state.modeTime += h;
    state.mode = modeAt(state.modeTime);
  }
  if (state.fruit) {
    state.fruit.secondsLeft -= h;
    if (state.fruit.secondsLeft <= 0)
      state.fruit = null;
  }
  for (const g of ghostList(state))
    if (g.state === "house" && state.lifeTime >= g.releaseAt)
      release(g);
  moveActor(state, state.pacman, h, ctl);
  if (state.status !== "playing")
    return;
  for (const g of ghostList(state))
    if (g.state !== "house")
      moveActor(state, g, h, ctl);
  checkCollisions(state);
}
function release(g) {
  g.state = "normal";
  g.tile = { ...GHOST_DOOR_EXIT };
  g.dir = "left";
  g.progress = 0;
  g.waiting = false;
  g.epoch += 1;
}
function speedOf(a) {
  if (a.id === "pacman")
    return SPEED.pacman;
  const s = a.state;
  return s === "eaten" ? SPEED.eaten : s === "frightened" ? SPEED.frightened : SPEED.ghost;
}
function canTurnBack(state, a) {
  return a.progress > 0 || state.maze.isWalkable(state.maze.neighbor(a.tile, REVERSE[a.dir]));
}
function turnBack(state, a) {
  if (!canTurnBack(state, a))
    return;
  if (a.progress > 0) {
    a.tile = state.maze.neighbor(a.tile, a.dir);
    a.progress = 1 - a.progress;
  }
  a.dir = REVERSE[a.dir];
}
function moveActor(state, a, h, ctl) {
  if (a.waiting && !chooseAt(state, a, ctl))
    return;
  if (a.id === "pacman" && state.pacmanControl === "keyboard" && state.keyDir === REVERSE[a.dir] && a.progress > 0) {
    turnBack(state, a);
  }
  if (a.id === "pacman" && state.pacmanControl === "jev") {
    const escape = escapePoint(state);
    if (escape && ctl.decide(escape, state) === REVERSE[a.dir])
      turnBack(state, a);
  }
  a.progress += speedOf(a) * h;
  while (a.progress >= 1) {
    a.tile = state.maze.neighbor(a.tile, a.dir);
    a.progress -= 1;
    onArrive(state, a);
    if (!chooseAt(state, a, ctl)) {
      a.progress = 0;
      return;
    }
  }
}
function chooseAt(state, a, ctl) {
  const dir = nextDir(state, a, ctl);
  if (dir === null) {
    a.waiting = true;
    return false;
  }
  a.dir = dir;
  a.waiting = false;
  return true;
}
function nextDir(state, a, ctl) {
  const { maze } = state;
  if (a.id === "pacman" && state.pacmanControl === "keyboard") {
    const open = maze.openDirs(a.tile);
    if (state.keyDir && open.includes(state.keyDir))
      return state.keyDir;
    return open.includes(a.dir) ? a.dir : null;
  }
  if (a.id !== "pacman" && a.state === "eaten") {
    const home = maze.distanceMap(GHOST_DOOR_EXIT);
    const dist = (d) => home[maze.key(maze.neighbor(a.tile, d))];
    return maze.openDirs(a.tile).reduce((best, d) => dist(d) < dist(best) ? d : best);
  }
  const forced = forcedDir(state, a.tile, a.dir);
  if (forced)
    return forced;
  const point = decisionPointAt(state, a.id, a.tile, a.dir);
  const choice = ctl.decide(point, state);
  return choice && point.options.includes(choice) ? choice : null;
}
function onArrive(state, a) {
  if (a.id === "pacman") {
    eatAt(state, a.tile);
    return;
  }
  const g = a;
  if (g.state === "eaten" && sameTile(g.tile, GHOST_DOOR_EXIT)) {
    g.state = "normal";
    g.epoch += 1;
  }
}
function eatAt(state, tile) {
  const { maze } = state;
  const k = maze.key(tile);
  if (maze.pellets.delete(k)) {
    state.score += 10;
    pelletEaten(state);
  } else if (maze.powerPellets.delete(k)) {
    state.score += 50;
    pelletEaten(state);
    state.frightLeft = frightSeconds(state.level);
    state.frightChain = 0;
    for (const g of ghostList(state))
      if (g.state === "normal")
        g.state = "frightened";
  }
  if (state.fruit && sameTile(tile, state.fruit.tile)) {
    state.score += state.fruit.points;
    state.popups.push({ tile: { ...tile }, text: String(state.fruit.points), ttl: 1.5 });
    state.fruit = null;
  }
  if (maze.pellets.size + maze.powerPellets.size === 0) {
    state.status = "levelclear";
    state.statusTimer = LEVELCLEAR_SECONDS;
  }
}
function pelletEaten(state) {
  state.pelletsEaten += 1;
  if (state.pelletsEaten === FRUIT_THRESHOLDS[state.fruitsSpawned]) {
    state.fruit = { ...fruitForLevel(state.level), tile: { ...FRUIT_TILE }, secondsLeft: FRUIT_SECONDS };
    state.fruitsSpawned += 1;
  }
}
function checkCollisions(state) {
  const p = actorPosition(state.pacman);
  for (const g of ghostList(state)) {
    if (g.state === "house" || g.state === "eaten")
      continue;
    const q = actorPosition(g);
    const adx = Math.abs(p.x - q.x);
    const dx = Math.min(adx, state.maze.width - adx);
    const dy = p.y - q.y;
    if (dx * dx + dy * dy >= COLLISION_DISTANCE ** 2)
      continue;
    if (g.state === "frightened") {
      const points = 200 * 2 ** state.frightChain;
      state.frightChain += 1;
      state.score += points;
      g.state = "eaten";
      state.popups.push({ tile: occupiedTile(state, g), text: String(points), ttl: 1.5 });
    } else {
      state.status = "dying";
      state.statusTimer = DYING_SECONDS;
      state.caughtBy = g.id;
      return;
    }
  }
}

