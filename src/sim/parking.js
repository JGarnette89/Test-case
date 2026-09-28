/* =====================================================================
   PARKED CARS (SIMULATOR.md stage 5). A residential street is marked for
   parallel parking in the map format (KINDS), and until now nothing used
   it: a car ending its trip stopped in the travel lane and vanished. Now
   the street has a parking strip beside each curb lane (the loader draws
   it, map/load.js `outer`), laid out in SLOTS, some of them full; a car
   at the end of its trip stops beside a free slot and takes it, and a car
   starting one leaves from a full slot, which then empties. On a closed
   map the cars driving plus the cars parked are the same people all day.

   A slot is pinned to its CURB LANE at a distance along it -- the same
   coordinate a car's position on that lane is measured in (graph.js
   `laneSpanOnGraph`: the path's `laneIn.at0` plus how far along it is),
   so matching a car to the slot beside it is arithmetic, not a search.

   A parked car is part of the world a person can hit: `contactWith`
   below is what the player is tested against. The traffic never needs
   it, because it keeps to its lanes and the strip is outside all of them.

   Pure. No React, no DOM.
   ===================================================================== */
import { PARK_W, LANE } from "../map/format.js";
import { rng } from "../core/rng.js";

export const SLOT = 6.5;     // metres of curb a parallel-parked car takes, room to get in and out included
/* HOW CLOSE TO AN INTERSECTION A CAR MAY PARK: no slot within this of
   either end of the lane, measured from the intersection's centre. The
   maintainer confirmed it (28 September): Ontario's usual 9 m by-law
   distance plus room for the box and the stop line at a wide one. */
export const PARK_CLEAR = 15;

const cache = new WeakMap();

/* Every slot on the course, each lane's slots in order, and by key. Only
   two-way roads whose `parking` is "parallel", without turn bays, and
   only beside their CURB lane. */
export function parkingOf(course) {
  if (cache.has(course)) return cache.get(course);
  const slots = [], byLane = new Map(), byKey = new Map();
  if (course?.graph) {
    const roads = Object.fromEntries((course.map?.roads ?? []).map((r) => [r.id, r]));
    for (const [id, L] of Object.entries(course.lanes ?? {})) {
      const m = /^(.*):(fwd|rev)#(\d+)$/.exec(id);
      if (!m) continue;
      const r = roads[m[1]];
      if (!r || !hasParking(r) || Number(m[3]) !== (r.lanes ?? 1) - 1) continue;
      const list = [];
      for (let a = PARK_CLEAR + SLOT / 2, j = 0; a + SLOT / 2 <= L.length - PARK_CLEAR; a += SLOT, j++) {
        const p = poseAlong(L, a);
        /* Outward: away from the road's own centre line, which is the curb
           side of a curb lane whichever way it runs. */
        const c = nearestOn(r.pts, p);
        let nx = p.x - c.x, ny = p.y - c.y;
        const nl = Math.hypot(nx, ny) || 1;
        nx /= nl; ny /= nl;
        const off = LANE / 2 + PARK_W / 2;
        const slot = { key: `${id}@${j}`, lane: id, along: a, x: p.x + nx * off, y: p.y + ny * off, z: p.z ?? 0, heading: p.heading };
        list.push(slot); slots.push(slot); byKey.set(slot.key, slot);
      }
      if (list.length) byLane.set(id, list);
    }
  }
  const out = { slots, byLane, byKey };
  cache.set(course, out);
  return out;
}

/* Whether a loaded road has a parking strip: the loader's own rule, one
   place (map/load.js reads it through `outer`). */
export const hasParking = (r) => r.parking === "parallel" && !r.oneWay && !r.bays;

/* The slots full when the world begins: in a district by its density,
   elsewhere four in ten. From their own stream, so nothing else's draws
   move. Parked cars are numbered from 20000, apart from the traffic. */
export function initialParked(course, seed = 1) {
  const { slots } = parkingOf(course);
  const zones = course.map?.zones ?? [];
  const r = rng(seed * 2654435 + 11);
  const parked = {};
  slots.forEach((s, i) => {
    const z = zones.find((q) => inPoly(q.polygon, s));
    const fill = z ? 0.3 + 0.5 * (z.density ?? 0.5) : 0.4;
    if (r() < fill) parked[s.key] = { n: 20000 + i };
  });
  return parked;
}

/* Parked cars as poses, for the renderer and the contact test. */
export function parkedPoses(course, parked) {
  const { byKey } = parkingOf(course);
  const out = [];
  for (const [key, car] of Object.entries(parked ?? {})) {
    const s = byKey.get(key);
    if (s) out.push({ id: `parked-${key}`, n: car.n, x: s.x, y: s.y, z: s.z, heading: s.heading, parked: true });
  }
  return out;
}

/* The parked car a pose is touching, or null -- `touching` is the
   player's own contact test (player.js), passed in so this module does not
   decide what contact is. */
export function contactWith(course, parked, pose, touching) {
  for (const p of parkedPoses(course, parked)) {
    if (Math.abs(p.x - pose.x) > 8 || Math.abs(p.y - pose.y) > 8) continue;
    if (touching(pose, p)) return p;
  }
  return null;
}

function poseAlong(L, a) {
  const at = L.at, pts = L.pts;
  let i = 0;
  while (i < at.length - 2 && at[i + 1] < a) i++;
  const f = Math.max(0, Math.min(1, (a - at[i]) / Math.max(1e-9, at[i + 1] - at[i])));
  const p = pts[i], q = pts[i + 1];
  return { x: p.x + (q.x - p.x) * f, y: p.y + (q.y - p.y) * f, z: (p.z ?? 0) + ((q.z ?? 0) - (p.z ?? 0)) * f, heading: (Math.atan2(q.y - p.y, q.x - p.x) * 180) / Math.PI };
}
function nearestOn(pts, p) {
  let best = null, bd = Infinity;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], b = pts[i + 1], L2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
    const f = L2 ? Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / L2)) : 0;
    const q = { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f }, d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d < bd) { bd = d; best = q; }
  }
  return best ?? pts[0];
}
function inPoly(poly, p) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
