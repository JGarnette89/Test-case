/* =====================================================================
   A ROAD AS A FREE CURVE WITH ELEVATION, AND THE STAGE 0 TEST WORLD.

   SIMULATOR.md decision 9: roads are free curves drawn from a path, not
   tiles. Here a road is a 3D centreline sampled every few metres with
   cumulative distance -- the same shape the stepped sim already drives
   along (`s` metres from the start) -- plus its two edges offset in
   PLAN before projection, so a bend's edges are true curves and never
   sheared.

   Nothing in here knows about pixels or colour. It is geometry: the
   valley road with its hill, the bridge road that crosses it seven
   metres up, and the ground under both.
   ===================================================================== */

/* Sample a plan curve given as a function of t in [0, 1] into a
   polyline `step` metres apart, with z from a height function of the
   plan point or of the distance along. */
export function sampleRoad({ plan, height, width, step = 5, samples = 400 }) {
  /* First pass: walk t finely to get arc length, then resample evenly. */
  const fine = [];
  for (let i = 0; i <= samples; i++) fine.push(plan(i / samples));
  const cum = [0];
  for (let i = 1; i < fine.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(fine[i].x - fine[i - 1].x, fine[i].y - fine[i - 1].y));
  }
  const length = cum[cum.length - 1];
  const n = Math.max(2, Math.ceil(length / step));
  const pts = [], at = [];
  let j = 1;
  for (let i = 0; i <= n; i++) {
    const s = (length * i) / n;
    while (j < cum.length - 1 && cum[j] < s) j++;
    const f = (s - cum[j - 1]) / (cum[j] - cum[j - 1] || 1);
    const p = { x: fine[j - 1].x + (fine[j].x - fine[j - 1].x) * f, y: fine[j - 1].y + (fine[j].y - fine[j - 1].y) * f };
    pts.push({ ...p, z: height(p, s) });
    at.push(s);
  }
  return { pts, at, ...ribbonOf(pts, width), length, width, step: length / n };
}

/* THE RIBBON: a road's two edges from its centreline samples. Offset
   each sample perpendicular to the local tangent in plan, at the
   sample's own height. With y down, the right of travel is (-dy, dx)
   -- the same expression the sim uses for which side of the road a car
   is on. One implementation, used by the hand-built stage 0 roads and
   by every road a map loader produces (map/load.js). */
export function ribbonOf(pts, width) {
  const left = [], right = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1;
    const nx = -dy / L, ny = dx / L;
    right.push({ x: pts[i].x + nx * width / 2, y: pts[i].y + ny * width / 2, z: pts[i].z });
    left.push({ x: pts[i].x - nx * width / 2, y: pts[i].y - ny * width / 2, z: pts[i].z });
  }
  return { left, right };
}

/* Position, heading (degrees, in plan, y down so clockwise positive)
   and grade at `s` metres along. Clamped to the road. */
export function poseAt(road, s) {
  const { pts, at } = road;
  const n = pts.length - 1;
  const t = Math.max(0, Math.min(road.length, s));
  let i = Math.min(n - 1, Math.floor(t / road.step));
  while (i < n - 1 && at[i + 1] < t) i++;
  const a = pts[i], b = pts[i + 1];
  const f = (t - at[i]) / (at[i + 1] - at[i] || 1);
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  return {
    x: a.x + dx * f, y: a.y + dy * f, z: a.z + dz * f,
    heading: (Math.atan2(dy, dx) * 180) / Math.PI,
    grade: dz / (Math.hypot(dx, dy) || 1),
  };
}

/* =====================================================================
   THE STAGE 0 WORLD: a valley road with a hill in it, a bridge road
   crossing it on an embankment, and the ground.

   Numbers here are picked to LOOK like a road and a hill, on purpose:
   SIMULATOR.md section 0 -- gameplay over fidelity, and stage 0's job
   is to be judged by eye. The bridge clears the valley road by the
   height a real overpass clears a road, because that one number decides
   whether a car goes under it on screen.
   ===================================================================== */
export const LANE = 3.6;

/* The hill: a raised-cosine bump on the ground. */
/* Centred ON the valley road's line, so the road goes over the crest
   rather than along the flank. */
const HILL = { x: 470, y: 166, radius: 110, height: 16 };
const bump = (x, y) => {
  const d = Math.hypot(x - HILL.x, y - HILL.y);
  return d >= HILL.radius ? 0 : (HILL.height * (1 + Math.cos((Math.PI * d) / HILL.radius))) / 2;
};

/* The bridge road runs north-south at x = 140 and crosses the valley
   road where the valley road passes y ~ 257. Its profile climbs an
   embankment, runs level over the crossing, and comes down. */
const BRIDGE_X = 140;
const CLEARANCE = 6.5;
const bridgeProfile = (s) => {
  const up = (a, b) => (s <= a ? 0 : s >= b ? 1 : (1 - Math.cos((Math.PI * (s - a)) / (b - a))) / 2);
  return CLEARANCE * (up(150, 270) - up(345, 465));
};
const SPAN = { from: 275, to: 340 };   // the part of the bridge road that is deck, not embankment

export function valleyRoad() {
  return sampleRoad({
    width: 2 * LANE,
    plan: (t) => ({ x: -20 + 740 * t, y: 200 + 60 * Math.sin(2 * Math.PI * t * 0.9) }),
    height: (p) => bump(p.x, p.y),
  });
}

export function bridgeRoad() {
  return sampleRoad({
    width: 2 * LANE,
    plan: (t) => ({ x: BRIDGE_X, y: -60 + 560 * t }),
    height: (p, s) => bridgeProfile(s) + bump(p.x, p.y),
  });
}

/* Where the ground is, under and around everything: the hill, plus the
   embankment carrying the bridge road's ramps -- but NOT under the deck,
   which is what makes it a bridge rather than a hill with a road on it. */
export function groundAt(x, y) {
  let z = bump(x, y);
  const s = y + 60;                                       // the bridge road's own distance along
  const lateral = Math.abs(x - BRIDGE_X);
  if (lateral < 14 && !(s > SPAN.from && s < SPAN.to)) {
    const fall = lateral <= 6 ? 1 : 1 - (lateral - 6) / 8;   // the embankment's side slopes
    z = Math.max(z, bridgeProfile(s) * fall);
  }
  return z;
}

/* The ground as a grid of cells, each with its four corner heights, for
   a renderer to fill. Coarse on purpose. */
/* THE GROUND AS A GRID OF HEIGHTS, NOT A MILLION OBJECTS (18 Nov 2026; Jay's phone, a stall of about 100 ms about once a minute: measured on the desk, every frame over 40 ms fell within 10 ms of a MAJOR garbage collection of 73 to 84 ms, which has to mark the live heap, and 149 of its
   205 MB was this array: 329,208 cells of the generated road, each an array of four point objects, 473 bytes a cell, 1.6 million objects). A cell is only ever read as the heights at its four corners, so what is kept is the grid: the x of each column, the y of each row, and the ground height at each
   vertex (float64, so every value is exactly what the corner objects held), about 2.7 MB; `cellAt` builds a cell's four corners when a frame wants one, which is about a hundred cells a frame. The array interface the draw and its checks use is kept: `length`, `grid`, `cellAt(i)`, iteration, `slice()`.
   The heights are evaluated once per VERTEX, not once per corner of every cell (4x fewer calls of the ground function, which is also the world build's cost). */
class GridTerrain {
  constructor(xs, ys, zs, cell, x0, y0) {
    const nx = Math.max(0, xs.length - 1), ny = Math.max(0, ys.length - 1);
    let zMin = Infinity, zMax = -Infinity;
    for (let k = 0; k < zs.length; k++) { const z = zs[k]; if (z < zMin) zMin = z; if (z > zMax) zMax = z; }
    this.xs = xs; this.ys = ys; this.zs = zs; this.length = nx * ny;
    this.grid = nx * ny ? { x0, y0, cell, nx, ny, zMin, zMax } : null;
  }
  /* The four corners of cell `idx` (row-major), the order and the values the old array held: (x, y), (x + cell, y), (x + cell, y + cell), (x, y + cell). */
  cellAt(idx) {
    const nx = this.xs.length - 1, j = Math.floor(idx / nx), i = idx - j * nx, w = nx + 1, xs = this.xs, ys = this.ys, zs = this.zs;
    return [{ x: xs[i], y: ys[j], z: zs[j * w + i] }, { x: xs[i + 1], y: ys[j], z: zs[j * w + i + 1] }, { x: xs[i + 1], y: ys[j + 1], z: zs[(j + 1) * w + i + 1] }, { x: xs[i], y: ys[j + 1], z: zs[(j + 1) * w + i] }];
  }
  *[Symbol.iterator]() { for (let k = 0; k < this.length; k++) yield this.cellAt(k); }
  /* Every cell as a plain array: for checks that compare against the old representation, never for a frame. */
  slice() { const out = new Array(this.length); for (let k = 0; k < this.length; k++) out[k] = this.cellAt(k); return out; }
}
export function terrain({ x0 = -80, y0 = -90, x1 = 760, y1 = 520, cell = 10, ground = groundAt } = {}) {
  /* The columns and rows by the loop the cells were always made by (`x += cell`), so the coordinates are the same numbers to the last bit. */
  const xv = [], yv = [];
  for (let x = x0; x < x1; x += cell) xv.push(x);
  for (let y = y0; y < y1; y += cell) yv.push(y);
  if (xv.length) xv.push(xv[xv.length - 1] + cell);
  if (yv.length) yv.push(yv[yv.length - 1] + cell);
  const xs = Float64Array.from(xv), ys = Float64Array.from(yv), w = xs.length, zs = new Float64Array(w * ys.length);
  if (xs.length > 1 && ys.length > 1) for (let j = 0; j < ys.length; j++) for (let i = 0; i < w; i++) zs[j * w + i] = ground(xs[i], ys[j]);
  return new GridTerrain(xs, ys, zs, cell, x0, y0);
}

/* Which samples of the bridge road are deck rather than embankment --
   where the ground falls away beneath it and the slab and piers show. */
export const isDeck = (road, i) => road.pts[i].z - groundAt(road.pts[i].x, road.pts[i].y) > 1.0;
