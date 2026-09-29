/* =====================================================================
   THE FREE CAMERA (the maintainer, 28 September: "a free roam camera ...
   being able to scroll the map would improve the editor and testing").
   Pan, zoom about a point, pinch -- on the isometric view, at any
   rotation, so looking around from the chase camera does not jump.

   Pure, like editor/gesture.js, so it can be checked where it cannot be
   watched (CLAUDE.md item 7). A camera is `{ x, y, z, k, rot }`: the world
   point at the view's anchor, pixels per metre, and the view's rotation.
   The inverse is taken on the camera's own level (z), which is where the
   ground under the fingers is to within the map's gentle grades.

   THE ZOOM RANGE IS THE WHOLE CITY TO A KERB: at FREE_K.min a 400 px
   phone holds a 2.8 km square -- the eight square kilometres the
   maintainer is to draw -- which on this view is a diamond as wide as its
   width and height together; max is close enough to read a lane arrow. Zooming out is not capped for speed: what is drawn is culled to
   the view (iso/draw.js), and the cost at the widest was measured
   (tools/measure/freecam-perf.mjs).
   ===================================================================== */


export const FREE_K = { min: 0.06, max: 40 };
export const CENTRE_Y = 0.55;   // where the anchor sits on the canvas, as viewOf has it
const clampK = (k) => Math.max(FREE_K.min, Math.min(FREE_K.max, k));

/* The world point on the camera's level under canvas pixel (px, py). */
export function groundAt(cam, canvas, px, py) {
  const k = cam.k, a = ((cam.rot ?? 0) * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  /* viewOf: sx = w/2 + (u - v) k, sy = h*CENTRE_Y + z*LIFT*k + ((u + v)/2 - z*LIFT) k
     so on the camera's own level (u + v)/2 = (sy - h*CENTRE_Y) / k. */
  const du = (px - canvas.w / 2) / k, sum = (2 * (py - canvas.h * CENTRE_Y)) / k;
  const u = (sum + du) / 2, v = (sum - du) / 2;
  /* (u, v) is the turned offset; turn it back. */
  return { x: cam.x + u * c + v * s, y: cam.y - u * s + v * c };
}

/* Drag: the ground under the finger stays under the finger. */
export function panFree(cam, canvas, from, to) {
  const a = groundAt(cam, canvas, from.x, from.y), b = groundAt(cam, canvas, to.x, to.y);
  return { ...cam, x: cam.x + (a.x - b.x), y: cam.y + (a.y - b.y) };
}

/* Zoom by `factor` about canvas pixel (px, py): that ground point stays put. */
export function zoomFree(cam, canvas, px, py, factor) {
  const w = groundAt(cam, canvas, px, py);
  const next = { ...cam, k: clampK(cam.k * factor) };
  const moved = groundAt(next, canvas, px, py);
  return { ...next, x: next.x + (w.x - moved.x), y: next.y + (w.y - moved.y) };
}

/* Two fingers: spreading zooms about them, moving both pans -- one gesture.
   `start` is the camera and the two fingers when the second landed. */
export function pinchFree(start, canvas, a, b) {
  const d0 = Math.hypot(start.a.x - start.b.x, start.a.y - start.b.y) || 1;
  const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
  const mid0 = { x: (start.a.x + start.b.x) / 2, y: (start.a.y + start.b.y) / 2 };
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const anchor = groundAt(start.cam, canvas, mid0.x, mid0.y);
  const next = { ...start.cam, k: clampK(start.cam.k * (d / d0)) };
  const now = groundAt(next, canvas, mid.x, mid.y);
  return { ...next, x: next.x + (anchor.x - now.x), y: next.y + (anchor.y - now.y) };
}

/* The zoom that fits a rectangle of the world (bounds) in the canvas. */
export function fitK(bounds, canvas) {
  /* A w x h rectangle spans (w + h) on screen across and (w + h)/2 down. */
  const across = (bounds.w + bounds.h) || 1;
  return clampK(Math.min(canvas.w / across, canvas.h / (across / 2)) * 0.95);
}

/* The world a map actually covers: its roads and buildings, not its
   declared bounds (a generated map keeps the format's default chunk). */
export function extentOf(loaded) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (p) => { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); };
  for (const r of loaded.roads ?? []) for (const p of r.pts ?? r.points ?? []) add(p);
  for (const q of loaded.props ?? []) add(q.at);
  if (!Number.isFinite(x0)) return loaded.bounds ?? { x: 0, y: 0, w: 256, h: 256 };
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
