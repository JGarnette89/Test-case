/* =====================================================================
   THE EDITOR'S VIEW GEOMETRY: pan, zoom about a point, pinch.

   Pure, so it can be checked headlessly (tools/verify-editor.mjs) --
   the editor is drawn on a canvas in an environment that delivers no
   animation frames and no screenshots (CLAUDE.md item 7, Conventions),
   so the only way to know a pinch does what a thumb expects is to
   compute it. A view is `{ x0, y0, scale }`: the world point (metres)
   at the canvas's top-left corner, and pixels per metre.
   ===================================================================== */
export const MIN_SCALE = 0.3, MAX_SCALE = 20;
const clampScale = (s) => Math.max(MIN_SCALE, Math.min(MAX_SCALE, s));

export const toWorld = (v, px, py) => ({ x: v.x0 + px / v.scale, y: v.y0 + py / v.scale });

/* Zoom by `factor`, keeping the world point under screen (px, py)
   under it -- the cursor for a wheel, the canvas centre for a button. */
export function zoomAbout(v, px, py, factor) {
  const before = toWorld(v, px, py);
  const scale = clampScale(v.scale * factor);
  return { x0: before.x - px / scale, y0: before.y - py / scale, scale };
}

/* A two-finger pinch. `start` is the view and the two fingers when the
   second one landed; `a`, `b` where they are now. The world point that
   was under the fingers' first midpoint stays under their current one,
   at the scale their spread asks for -- so spreading zooms in about the
   fingers, and moving both together pans, in one gesture. */
export function pinchView(start, a, b) {
  const d0 = Math.hypot(start.a.x - start.b.x, start.a.y - start.b.y) || 1;
  const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
  const mid0 = { x: (start.a.x + start.b.x) / 2, y: (start.a.y + start.b.y) / 2 };
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const anchor = toWorld(start.view, mid0.x, mid0.y);
  const scale = clampScale(start.view.scale * (d / d0));
  return { x0: anchor.x - mid.x / scale, y0: anchor.y - mid.y / scale, scale };
}

/* A one-finger drag pans: the world moves with the finger. */
export function panView(start, from, to) {
  return { ...start, x0: start.x0 - (to.x - from.x) / start.scale, y0: start.y0 - (to.y - from.y) / start.scale };
}

/* Is a press still a tap? A finger always wanders a little; past
   `tapPx` it has become a drag. */
export const TAP_PX = 8;
export const isTap = (from, to, tapPx = TAP_PX) => Math.hypot(to.x - from.x, to.y - from.y) <= tapPx;
