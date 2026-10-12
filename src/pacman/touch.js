// Adapted from Jevman, Copyright (c) 2026 Johnny Chadda. AGPL-3.0-or-later.
// https://github.com/opper-ai/jevman-benchmark/tree/b202e2cefd3dcf62b99835b319450b687960f40a
// Ported to static browser ESM; local endpoint integration and strict inference handling.
export function swipeDir(x0, y0, x1, y1, min = 18) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < min)
    return null;
  return Math.abs(dx) > Math.abs(dy) ? dx > 0 ? "right" : "left" : dy > 0 ? "down" : "up";
}
export function attachTouch(surface, steer, steering) {
  let start = null;
  surface.addEventListener("touchstart", (e) => {
    if (!steering() || e.target instanceof Element && e.target.closest("#overlay"))
      return void (start = null);
    const t = e.touches[0];
    start = { x: t.clientX, y: t.clientY };
  }, { passive: true });
  surface.addEventListener("touchmove", (e) => {
    if (!start)
      return;
    const t = e.touches[0];
    const dir = swipeDir(start.x, start.y, t.clientX, t.clientY);
    if (!dir)
      return;
    steer(dir);
    start = { x: t.clientX, y: t.clientY };
    e.preventDefault();
  }, { passive: false });
  surface.addEventListener("touchend", () => start = null, { passive: true });
}

