// Adapted from Jevman, Copyright (c) 2026 Johnny Chadda. AGPL-3.0-or-later.
// https://github.com/opper-ai/jevman-benchmark/tree/b202e2cefd3dcf62b99835b319450b687960f40a
// Ported to static browser ESM; local endpoint integration and strict inference handling.
import { fruitRoute, goalFor, greedyChoice, isTrap, NEARBY_STEPS, optionFeatures } from "./features.js";
import { occupiedTile } from "./sim.js";
import { GHOST_IDS } from "./types.js";
export const ACTOR_NAMES = {
  pacman: "Pac-Man",
  blinky: "Blinky",
  pinky: "Pinky",
  inky: "Inky",
  clyde: "Clyde"
};
const LETTERS = { blinky: "B", pinky: "K", inky: "I", clyde: "C" };
const PERSONA = {
  blinky: "You are Blinky, the red ghost. You are relentless: always close the distance to Pac-Man directly.",
  pinky: "You are Pinky, the pink ghost. You ambush: head for the spot about 4 tiles ahead of Pac-Man to cut him off.",
  inky: "You are Inky, the cyan ghost. You flank: approach Pac-Man from the side opposite Blinky to trap him between you.",
  clyde: "You are Clyde, the orange ghost. You chase Pac-Man while he is far away, but within 8 tiles you lose your nerve and retreat to your home corner (bottom-left)."
};
export const questionName = (point) => point.escape ? `${point.actor}_escape` : point.actor;
const round1 = (n) => Math.round(n * 10) / 10;
export function summarizeState(state) {
  const { maze } = state;
  const grid = state.layout.map((row, y) => [...row].map((c, x) => {
    const k = maze.key({ x, y });
    if (c === ".")
      return maze.pellets.has(k) ? "." : " ";
    if (c === "o")
      return maze.powerPellets.has(k) ? "o" : " ";
    return c === "_" ? "#" : c;
  }));
  const put = (t, ch) => {
    grid[t.y][t.x] = ch;
  };
  if (state.fruit)
    put(state.fruit.tile, "F");
  for (const id of GHOST_IDS) {
    const g = state.ghosts[id];
    if (g.state === "house")
      continue;
    put(occupiedTile(state, g), g.state === "normal" ? LETTERS[id] : g.state === "frightened" ? LETTERS[id].toLowerCase() : "e");
  }
  const pac = occupiedTile(state, state.pacman);
  put(pac, "P");
  return {
    maze: grid.map((r) => r.join("")),
    legend: "# wall, - ghost-house door, . pellet, o power pellet, F fruit, P Pac-Man, B Blinky, K Pinky, I Inky, C Clyde (lowercase = frightened, edible), e eyes of an eaten ghost",
    mode: state.mode,
    frightened_seconds_left: round1(state.frightLeft),
    pacman: { x: pac.x, y: pac.y, dir: state.pacman.dir },
    ghosts: Object.fromEntries(GHOST_IDS.map((id) => {
      const g = state.ghosts[id];
      const t = occupiedTile(state, g);
      return [id, { x: t.x, y: t.y, dir: g.dir, state: g.state }];
    })),
    pellets_left: maze.pellets.size + maze.powerPellets.size,
    lives: state.lives,
    level: state.level,
    score: state.score,
    fruit: state.fruit ? { kind: state.fruit.kind, points: state.fruit.points, x: state.fruit.tile.x, y: state.fruit.tile.y, seconds_left: round1(state.fruit.secondsLeft) } : null
  };
}
export function instructionsFor(state, point, feats = optionFeatures(state, point)) {
  const back = point.options.find((d) => d !== point.heading);
  const at = point.escape ? `You are running ${point.heading} through a corridor and ${(point.threats ?? []).map((id) => ACTOR_NAMES[id]).join(" and ")} ${point.threats?.length === 1 ? "is" : "are"} in the corridor ahead or can block the junction at its end before you get there. Keep going ${point.heading}, or turn back ${back} right now?` : `You are approaching junction (${point.tile.x},${point.tile.y}) heading ${point.heading}. Pick the direction to take there.`;
  if (point.actor === "pacman") {
    const f = state.fruit;
    const marked = f && fruitRoute(state, point, feats);
    const fruit = !f ? "" : marked ? `A ${f.kind} worth ${f.points} points (as much as ${f.points / 10} pellets) is on the board and will disappear soon. One route is marked FRUIT: it is the fastest way to it that looks safe. ${state.frightLeft > 0 ? "Hunt a frightened ghost you can reach first; otherwise take the FRUIT route." : "Take the FRUIT route."} ` : point.escape ? "" : `A ${f.kind} worth ${f.points} points is on the board but cannot be reached safely in time; ignore it. `;
    return state.frightLeft > 0 ? `You are Pac-Man. A power pellet is active for ${round1(state.frightLeft)} more seconds: frightened ghosts (lowercase letters) are worth 200, 400, 800 and 1600 points in a row. Hunt the nearest frightened ghost if you can reach it in time, but never run into a normal ghost. ${fruit}${at}` : `You are Pac-Man. Clear the maze by eating every pellet while staying away from the ghosts; touching a non-frightened ghost costs a life. Power pellets (o) make ghosts frightened and edible, so take one when ghosts are closing in. Never pick a route marked DANGER or TRAP unless every route is; prefer routes where ghosts are moving away. ${fruit}${at}`;
  }
  const ghost = state.ghosts[point.actor];
  if (ghost.state === "frightened") {
    return `You are ${ACTOR_NAMES[point.actor]}, a ghost. You are frightened for ${round1(state.frightLeft)} more seconds and Pac-Man can eat you. Flee: pick the route that keeps you farthest from Pac-Man. ${at}`;
  }
  if (state.mode === "scatter") {
    return `${PERSONA[point.actor]} Right now it is scatter time: head back to your home corner instead of chasing. ${at}`;
  }
  return `${PERSONA[point.actor]} ${at}`;
}
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const steps = (n, what) => n === null ? `${what} not reachable this way` : `${what} ${plural(n, "step")} away`;
export function criteriaFor(state, point, feats) {
  const goal = goalFor(state, point.actor);
  const fruit = point.actor === "pacman" ? fruitRoute(state, point, feats) : null;
  const names = (ids) => ids.map((id) => ACTOR_NAMES[id]).join(" and ");
  return Object.fromEntries(feats.map((f) => {
    const parts = [];
    if (point.actor === "pacman") {
      parts.push(steps(f.nearestPellet, "nearest pellet"));
      parts.push(`${plural(f.corridorPellets, "pellet")} in the next corridor`);
      parts.push(f.nearestDangerGhost === null ? "no dangerous ghost reachable this way" : `${steps(f.nearestDangerGhost, "nearest dangerous ghost")}, ${f.dangerApproaching ? "coming toward you" : "moving away"}`);
      if (f.dangerNearby >= 2)
        parts.push(`${f.dangerNearby} dangerous ghosts within ${NEARBY_STEPS} steps`);
      if (f.dangerInCorridor.length)
        parts.push(`DANGER: ${names(f.dangerInCorridor)} in this corridor`);
      if (f.junctionGhost && isTrap(f)) {
        parts.push(`TRAP: ${ACTOR_NAMES[f.junctionGhost.id]} can reach the next junction in ${plural(f.junctionGhost.steps, "step")}, you need ${f.junctionSteps}`);
      } else if (f.junctionGhost) {
        parts.push(`you reach the next junction in ${plural(f.junctionSteps, "step")}, ${plural(f.junctionGhost.steps - f.junctionSteps, "step")} before any ghost`);
      }
      if (state.frightLeft === 0 && f.nearestPowerPellet !== null)
        parts.push(steps(f.nearestPowerPellet, "power pellet"));
      if (state.frightLeft > 0 && f.nearestFrightenedGhost !== null)
        parts.push(steps(f.nearestFrightenedGhost, "frightened ghost"));
      if (state.fruit && f.dir === fruit) {
        parts.unshift(`FRUIT — fastest safe-looking way to the ${state.fruit.kind} (${plural(f.fruitDistance, "step")}, worth ${state.fruit.points} points)`);
      }
    } else if (goal.kind === "flee") {
      parts.push(`${steps(f.pacmanDistance, "Pac-Man")} via this route (farther is safer)`);
    } else {
      parts.push(`${steps(f.goalDistance, goal.label)} via this route`);
      if (goal.kind !== "pacman")
        parts.push(steps(f.pacmanDistance, "Pac-Man"));
      if (f.dangerInCorridor.length)
        parts.push(`passes ${names(f.dangerInCorridor)}`);
    }
    return [f.dir, `Go ${f.dir}: ${parts.join("; ")}`];
  }));
}
export function buildRequest(state, batch) {
  return {
    state: summarizeState(state),
    questions: Object.fromEntries(batch.map(({ point, features }) => [
      questionName(point),
      { type: "choice", instructions: instructionsFor(state, point, features), criteria: criteriaFor(state, point, features) }
    ]))
  };
}
export function parseAnswer(answer, q) {
  if (!answer || typeof answer !== "object")
    return null;
  const a = answer;
  if (a.type !== "choice" || typeof a.choice !== "string")
    return null;
  const choice = a.choice;
  if (!q.point.options.includes(choice))
    return null;
  const raw = a.probabilities && typeof a.probabilities === "object" ? a.probabilities : {};
  const probabilities = {};
  for (const d of q.point.options)
    if (typeof raw[d] === "number")
      probabilities[d] = raw[d];
  return {
    actor: q.point.actor,
    key: q.point.key,
    tile: q.point.tile,
    choice,
    options: q.point.options,
    probabilities,
    confidence: typeof a.confidence === "number" ? a.confidence : null,
    source: "jev",
    ...q.point.escape ? { escape: true } : {}
  };
}
export function fallbackDecision(state, q, reason) {
  return {
    actor: q.point.actor,
    key: q.point.key,
    tile: q.point.tile,
    choice: greedyChoice(state, q.point, q.features),
    options: q.point.options,
    probabilities: {},
    confidence: null,
    source: "fallback",
    reason,
    ...q.point.escape ? { escape: true } : {}
  };
}

