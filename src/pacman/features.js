// Adapted from Jevman, Copyright (c) 2026 Johnny Chadda. AGPL-3.0-or-later.
// https://github.com/opper-ai/jevman-benchmark/tree/b202e2cefd3dcf62b99835b319450b687960f40a
// Ported to static browser ESM; local endpoint integration and strict inference handling.
import { SCATTER_CORNERS } from "./layout.js";
import { DIR_VEC, REVERSE } from "./maze.js";
import { occupiedTile, optionsAt, SPEED } from "./sim.js";
import { GHOST_IDS, sameTile } from "./types.js";
const CORRIDOR_LIMIT = 40;
const CLYDE_SHY_DISTANCE = 8;
export const NEARBY_STEPS = 8;
export const isTrap = (f) => f.junctionGhost !== null && f.junctionGhost.steps <= f.junctionSteps;
export function goalFor(state, id) {
  if (id === "pacman") {
    return state.frightLeft > 0 ? { kind: "hunt", label: "frightened ghost", target: null } : { kind: "eat", label: "pellet", target: null };
  }
  const { maze } = state;
  const ghost = state.ghosts[id];
  const pac = occupiedTile(state, state.pacman);
  if (ghost.state === "frightened")
    return { kind: "flee", label: "Pac-Man", target: pac };
  const corner = { kind: "corner", label: "home corner", target: SCATTER_CORNERS[id] };
  if (state.mode === "scatter")
    return corner;
  const ahead = (n) => {
    const v = DIR_VEC[state.pacman.dir];
    return { x: pac.x + v.x * n, y: pac.y + v.y * n };
  };
  switch (id) {
    case "blinky":
      return { kind: "pacman", label: "Pac-Man", target: pac };
    case "pinky":
      return { kind: "ambush", label: "ambush point ahead of Pac-Man", target: maze.nearestWalkable(ahead(4)) };
    case "inky": {
      const pivot = ahead(2);
      const b = occupiedTile(state, state.ghosts.blinky);
      return {
        kind: "flank",
        label: "flanking point",
        target: maze.nearestWalkable({ x: 2 * pivot.x - b.x, y: 2 * pivot.y - b.y })
      };
    }
    case "clyde": {
      const d = maze.distances(occupiedTile(state, ghost))[maze.key(pac)];
      return d >= 0 && d <= CLYDE_SHY_DISTANCE ? corner : { kind: "pacman", label: "Pac-Man", target: pac };
    }
  }
}
export function optionFeatures(state, point) {
  const { maze } = state;
  const goal = goalFor(state, point.actor);
  const pac = occupiedTile(state, state.pacman);
  const others = GHOST_IDS.filter((id) => id !== point.actor).map((id) => state.ghosts[id]);
  const danger = others.filter((g) => g.state === "normal");
  const frightened = others.filter((g) => g.state === "frightened");
  const pelletTiles = [...maze.pellets, ...maze.powerPellets].map((k) => maze.fromKey(k));
  const powerTiles = [...maze.powerPellets].map((k) => maze.fromKey(k));
  return point.options.map((dir) => {
    const { start, origin } = routeOf(state, point, dir);
    const dist = maze.distances(start, origin);
    const steps = (t) => {
      const v = dist[maze.key(t)];
      return v < 0 ? null : v + 1;
    };
    const nearest = (tiles) => {
      let best = null;
      for (const t of tiles) {
        const s = steps(t);
        if (s !== null && (best === null || s < best))
          best = s;
      }
      return best;
    };
    const corridor = corridorFrom(state, start, dir);
    const junction = corridor[corridor.length - 1];
    const toJunction = maze.distanceMap(junction);
    let junctionGhost = null;
    for (const g of danger) {
      const d = toJunction[maze.key(occupiedTile(state, g))];
      if (d >= 0 && (junctionGhost === null || d < junctionGhost.steps))
        junctionGhost = { id: g.id, steps: d };
    }
    const dangerSteps = danger.map((g) => ({ g, steps: steps(occupiedTile(state, g)) })).filter((x) => x.steps !== null).sort((a, b) => a.steps - b.steps);
    const closest = dangerSteps[0];
    const nearestPellet = nearest(pelletTiles);
    const frightenedGhostSteps = frightened.map((g) => steps(occupiedTile(state, g))).filter((d) => d !== null).sort((a, b) => a - b);
    const nearestFrightenedGhost = frightenedGhostSteps[0] ?? null;
    const goalDistance = goal.target ? steps(goal.target) : goal.kind === "hunt" ? nearestFrightenedGhost ?? nearestPellet : nearestPellet;
    return {
      dir,
      goalDistance,
      pacmanDistance: point.actor === "pacman" ? null : steps(pac),
      nearestPellet,
      corridorPellets: corridor.filter((t) => maze.pellets.has(maze.key(t)) || maze.powerPellets.has(maze.key(t))).length,
      nearestDangerGhost: nearest(danger.map((g) => occupiedTile(state, g))),
      dangerInCorridor: danger.filter((g) => corridor.some((t) => sameTile(t, occupiedTile(state, g)))).map((g) => g.id),
      nearestFrightenedGhost,
      frightenedGhostSteps,
      fruitDistance: state.fruit ? steps(state.fruit.tile) : null,
      nearestPowerPellet: nearest(powerTiles),
      dangerApproaching: closest !== undefined && movingToward(state, closest.g, origin),
      dangerNearby: dangerSteps.filter((x) => x.steps <= NEARBY_STEPS).length,
      junctionSteps: point.distance + corridor.length,
      junctionGhost
    };
  });
}
function movingToward(state, g, to) {
  const { maze } = state;
  const dist = maze.distanceMap(to);
  const here = dist[maze.key(g.tile)];
  const moves = g.waiting ? optionsAt(state, g.id, g.tile, g.dir) : [g.dir];
  return moves.some((d) => {
    const next = dist[maze.key(maze.neighbor(g.tile, d))];
    return next >= 0 && next < here;
  });
}
function routeOf(state, point, dir) {
  if (point.escape && dir !== point.heading && state.pacman.progress > 0) {
    return { start: point.tile, origin: state.maze.neighbor(point.tile, point.heading) };
  }
  return { start: state.maze.neighbor(point.tile, dir), origin: point.tile };
}
function corridorFrom(state, start, heading) {
  const tiles = [];
  let tile = start;
  let dir = heading;
  for (let i = 0;i < CORRIDOR_LIMIT; i++) {
    tiles.push(tile);
    const ahead = state.maze.openDirs(tile).filter((d) => d !== REVERSE[dir]);
    if (ahead.length !== 1)
      break;
    dir = ahead[0];
    tile = state.maze.neighbor(tile, dir);
  }
  return tiles;
}
const PACMAN_STEPS_PER_SECOND = SPEED.pacman;
const frightReach = (state, point) => Math.floor(state.frightLeft * PACMAN_STEPS_PER_SECOND) - point.distance;
export function fruitRoute(state, point, feats) {
  if (!state.fruit)
    return null;
  const reach = Math.floor(state.fruit.secondsLeft * PACMAN_STEPS_PER_SECOND);
  const soonDangerous = (f) => f.frightenedGhostSteps.some((d) => d <= f.fruitDistance && d > frightReach(state, point));
  const ok = feats.filter((f) => f.fruitDistance !== null && point.distance + f.fruitDistance <= reach && f.dangerInCorridor.length === 0 && (f.nearestDangerGhost ?? 999) > 2 && !isTrap(f) && !soonDangerous(f));
  return ok.length ? ok.reduce((best, f) => f.fruitDistance < best.fruitDistance ? f : best).dir : null;
}
export function greedyChoice(state, point, feats) {
  const lowest = (pool, score) => pool.reduce((best, f) => score(f) < score(best) ? f : best).dir;
  const or = (v, missing) => v ?? missing;
  if (point.actor !== "pacman") {
    return goalFor(state, point.actor).kind === "flee" ? lowest(feats, (f) => -or(f.pacmanDistance, 999)) : lowest(feats, (f) => or(f.goalDistance, 999));
  }
  const safe = feats.filter((f) => f.dangerInCorridor.length === 0 && or(f.nearestDangerGhost, 999) > 2 && !isTrap(f));
  const pool = safe.length ? safe : feats;
  const huntReach = frightReach(state, point);
  const huntable = pool.filter((f) => f.nearestFrightenedGhost !== null && f.nearestFrightenedGhost <= huntReach);
  if (huntable.length)
    return lowest(huntable, (f) => or(f.nearestFrightenedGhost, 999));
  const fruit = fruitRoute(state, point, pool);
  if (fruit)
    return fruit;
  return lowest(pool, (f) => or(f.nearestPellet, 999));
}

