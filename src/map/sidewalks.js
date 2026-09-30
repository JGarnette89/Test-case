/* =====================================================================
   SIDEWALKS, DERIVED FROM THE ROAD (SIMULATOR.md, "Ambient pedestrians:
   the plan", step 1). A strip along each side of a road, just beyond its
   outer edge -- the curb, or the parking strip where the road has one --
   `SIDEWALK_W` wide. Never drawn by hand: it follows the road the way the
   parking strip does, so an edited road carries its sidewalks with it.

   It is taken from the road's DRAWN edge (the ribbon's `left`/`right`,
   which the loader built), not from a width, so where turn bays widen a
   road the sidewalk steps out with the curb rather than lying on the bay.

   WHERE IT STOPS. At an intersection a sidewalk runs until it would lie on
   another road's surface, and stops at that road's edge -- found per side,
   to the centimetre, by bisecting the step it crosses on. Stopped there,
   two roads' sidewalks meet at the corner and between them cover it, at a
   right angle or not. It is left off a deck (a bridge carries none here),
   and a highway or a service lane has none.

   AND WHERE THE GROUND WOULD BURY IT. The ground is a 20 m grid pinned
   by road heights (load.js `groundFor`), so beside an overpass ramp it
   stands metres above the street passing under -- a cutting the grid
   cannot draw. A sidewalk there would be painted under the grass and
   somebody on it would stand inside the hill (verify-paint, 30
   September: a walker 2.4 m under the ground beside test map 1's
   overpass). So a sidewalk is not laid where the drawn ground stands
   more than BURIED above it; it returns when the ground can express a
   retaining wall.

   Pure. No React, no DOM, no colour.
   ===================================================================== */
import { groundFor } from "./load.js";
/* 1.8 m: a common municipal sidewalk in Ontario (the accessible minimum
   is 1.5). A design constant, flagged; nothing is derived from it but the
   strip's own width. */
export const SIDEWALK_W = 1.8;
/* The kinds of road people walk beside. */
export const WALKED = new Set(["residential", "collector", "arterial"]);
const BURIED = 1.0;

const cache = new WeakMap();

const cross = (ax, ay, bx, by) => ax * by - ay * bx;
/* Inside a quad given in order, either winding. */
function inQuad(p, a, b, c, d) {
  const q = [a, b, c, d];
  let pos = 0, neg = 0;
  for (let i = 0; i < 4; i++) {
    const u = q[i], v = q[(i + 1) % 4];
    const z = cross(v.x - u.x, v.y - u.y, p.x - u.x, p.y - u.y);
    if (z > 1e-9) pos++; else if (z < -1e-9) neg++;
  }
  return !(pos && neg);
}
/* On road `r`'s drawn surface -- one of its ribbon's quads -- looking only
   at the stretch within `near` of `at`. */
function onSurface(r, p, at, near = 60) {
  const { pts, left, right } = r;
  for (let i = 0; i + 1 < pts.length; i++) {
    if (Math.hypot(pts[i].x - at.x, pts[i].y - at.y) > near && Math.hypot(pts[i + 1].x - at.x, pts[i + 1].y - at.y) > near) continue;
    if (inQuad(p, left[i], left[i + 1], right[i + 1], right[i])) return true;
  }
  return false;
}

/* Every sidewalk on a loaded map: `{ id, road, side, pts, inner, outer,
   at, length }`, `pts` its centre line (where somebody walks), `inner`
   the curb edge and `outer` the far edge, all with z. A road's side can
   come out as more than one piece where a deck interrupts it. */
export function sidewalksOf(loaded) {
  if (!loaded?.roads) return [];
  if (cache.has(loaded)) return cache.get(loaded);
  /* The ground the scene draws (MapRoad `sceneFor`: the same cell). */
  const ground = groundFor(loaded, { cell: 20 });
  const byId = Object.fromEntries(loaded.roads.map((r) => [r.id, r]));
  /* The other roads at each end of a road: what its sidewalk must not lie on. */
  const others = new Map();
  for (const n of loaded.nodes ?? []) {
    for (const l of n.legs) {
      const list = n.legs.filter((m) => !(m.road === l.road && m.end === l.end)).map((m) => byId[m.road]).filter(Boolean);
      others.set(`${l.road}|${l.end}`, { at: n.at, roads: list });
    }
  }
  const out = [];
  for (const r of loaded.roads) {
    if (!WALKED.has(r.kind) || !r.left || !r.right) continue;
    const ends = [others.get(`${r.id}|start`), others.get(`${r.id}|end`)].filter(Boolean);
    for (const side of ["left", "right"]) {
      const edge = r[side];
      /* The strip across at point i, or at a fraction between i and i+1. */
      const across = (i, f = 0) => {
        const j = Math.min(r.pts.length - 1, i + 1);
        const lerp = (a, b) => ({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, z: (a.z ?? 0) + ((b.z ?? 0) - (a.z ?? 0)) * f });
        const c = lerp(r.pts[i], r.pts[j]), e = lerp(edge[i], edge[j]);
        let nx = e.x - c.x, ny = e.y - c.y;
        const nl = Math.hypot(nx, ny) || 1;
        nx /= nl; ny /= nl;
        return {
          inner: e,
          mid: { x: e.x + (nx * SIDEWALK_W) / 2, y: e.y + (ny * SIDEWALK_W) / 2, z: e.z },
          outer: { x: e.x + nx * SIDEWALK_W, y: e.y + ny * SIDEWALK_W, z: e.z },
        };
      };
      const buried = (q) => ground(q.x, q.y) - (q.z ?? 0) > BURIED;
      const clear = (x) => !buried(x.inner) && !buried(x.mid) && !buried(x.outer) && !ends.some((n) => n.roads.some((o) => onSurface(o, x.inner, n.at) || onSurface(o, x.outer, n.at) || onSurface(o, x.mid, n.at)));
      const ok = r.pts.map((p, i) => !p.bridge && clear(across(i)));
      /* Runs of clear points, each end refined to where it stops being clear. */
      let i = 0;
      let piece = 0;
      while (i < r.pts.length) {
        if (!ok[i]) { i++; continue; }
        let j = i;
        while (j + 1 < r.pts.length && ok[j + 1]) j++;
        const cuts = [];
        const edgeAt = (a, b) => {
          /* Between a clear point a and a blocked one b (adjacent): the last clear fraction. */
          if (r.pts[Math.min(a, b)].bridge || r.pts[Math.max(a, b)].bridge) return null;
          let lo = 0, hi = 1;
          for (let k = 0; k < 14; k++) {
            const m = (lo + hi) / 2;
            const x = across(Math.min(a, b), a < b ? m : 1 - m);
            if (clear(x)) lo = m; else hi = m;
          }
          return across(Math.min(a, b), a < b ? lo : 1 - lo);
        };
        const head = i > 0 ? edgeAt(i, i - 1) : null;
        const tail = j + 1 < r.pts.length ? edgeAt(j, j + 1) : null;
        if (head) cuts.push(head);
        for (let k = i; k <= j; k++) cuts.push(across(k));
        if (tail) cuts.push(tail);
        if (cuts.length >= 2) {
          const pts = cuts.map((x) => x.mid), at = [0];
          for (let k = 1; k < pts.length; k++) at.push(at[k - 1] + Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y));
          if (at[at.length - 1] > 0.5) {
            out.push({ id: `${r.id}:${side}#${piece++}`, road: r.id, side, pts, inner: cuts.map((x) => x.inner), outer: cuts.map((x) => x.outer), at, length: at[at.length - 1] });
          }
        }
        i = j + 1;
      }
    }
  }
  cache.set(loaded, out);
  return out;
}

/* Whether a point lies on a sidewalk: for checks, and for anything that
   must keep off one. */
export function onSidewalk(walks, p) {
  for (const w of walks) {
    for (let i = 0; i + 1 < w.pts.length; i++) {
      if (inQuad(p, w.inner[i], w.inner[i + 1], w.outer[i + 1], w.outer[i])) return w;
    }
  }
  return null;
}

/* Exposed for checks: whether a point is on a road's drawn surface
   anywhere along it. */
export const onRoadSurface = (r, p) => onSurface(r, p, p, Infinity);
