/* =====================================================================
   THE EDITOR'S VIEW GEOMETRY: pan, zoom about a point, pinch.

   Pure, so it can be checked headlessly (tools/verify-editor.mjs) --
   the editor is drawn on a canvas in an environment that delivers no
   animation frames and no screenshots (CLAUDE.md item 7, Conventions),
   so the only way to know a pinch does what a thumb expects is to
   compute it. A view is `{ x0, y0, scale }`: the world point (metres)
   at the canvas's top-left corner, and pixels per metre.
   ===================================================================== */
/* From the whole world to a kerb: 0.08 px/m shows three kilometres across
   a 400 px phone -- the eight square kilometres the maintainer is to draw
   (28 September: "being able to scroll the map would improve the editor"). */
export const MIN_SCALE = 0.08, MAX_SCALE = 20;
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

/* WHAT A ONE-FINGER DRAG DOES, decided when it starts (28 September). Taps
   draw and select; a drag PANS -- always, unless it starts on a handle of
   the thing ALREADY selected, which it then moves. Before this, a drag on
   any building moved it and a drag on any road's point moved the point;
   on a city covered in buildings, with a road point every few metres,
   most attempts to pan grabbed something. So: tap it to select it, then
   drag it. Two fingers always pan and zoom, whatever they land on.
   `point` is a road point under the finger ({ road, index }) or null,
   `prop` a building id or null, `selected` the editor's selection. */
export function dragIntent({ tool, point, prop, selected }) {
  if (tool === "pan") return "pan";
  if (point && selected?.type === "road" && selected.id === point.road) return "point";
  if (prop && selected?.type === "prop" && selected.id === prop) return "prop";
  return "pan";
}

/* The view that shows all of a world rectangle `ext` ({ x, y, w, h }, metres)
   on a canvas `box` ({ w, h }, pixels), centred, with a margin. */
export function fitView(ext, box) {
  const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, 0.9 * Math.min(box.w / Math.max(1, ext.w), box.h / Math.max(1, ext.h))));
  return { x0: ext.x + ext.w / 2 - box.w / 2 / scale, y0: ext.y + ext.h / 2 - box.h / 2 / scale, scale };
}
