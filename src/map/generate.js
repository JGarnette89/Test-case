/* =====================================================================
   STAGE 5: DETAIL GENERATED INSIDE THE MAINTAINER'S SHAPES (SIMULATOR.md
   decision 4, stage 5). First piece: LOCAL STREETS FILLING A DISTRICT.

   He sketches the blockout -- the big roads and the district polygons --
   and this fills a district with the streets a place like that has,
   joined to the roads around it. What it produces is ordinary roads in
   the map, tagged with the zone they came from (`gen`), so the result is
   FIXED -- the city is learnable, decision 2 -- and his to edit by hand,
   regenerate, or undo like anything else he drew. Deterministic: the
   same zone and the same roads give the same streets.

   THE LAYOUT. A grid aligned to the district's longest edge -- the
   direction a real subdivision is usually laid against -- at a block
   size set by the district's kind and density, clipped to the polygon.
   Then three rules that make it a street network rather than lines:

     - a street that reaches the district's edge ends ON the road there,
       if there is one close enough (SNAP): a T onto the boundary road;
     - one that reaches the edge with no road is trimmed back to its last
       junction, never left dangling -- a dangling end is the EDGE OF THE
       WORLD to the loader, where traffic spawns (map/edges.js), and a
       spawn point in the middle of a city is a lie about the map;
     - a group of streets that touches no existing road is dropped: it
       would be an island nobody could drive into.

   A road already running through the district is crossed properly: the
   street ends on it from both sides, and the loader makes the node.

   CONTROLS, per street end:
     - where a local street meets a road that is not generated here: stop
       on the local street, and the road it meets runs (the established T
       rule, "a stop on the minor leg only");
     - a T between two local streets: the stem stops, the through street
       runs -- the same rule;
     - a crossroads of two local streets: an ALL-WAY STOP. A map-design
       default rather than a rule of the road, flagged for the maintainer.

   Pure. No React, no DOM.
   ===================================================================== */
import { road as makeRoad, LANE, KINDS } from "./format.js";
import { LINE_SETBACK } from "../sim/intersection.js";
import { CAR } from "../sim/traffic.js";

/* Block size by district kind: `across` between streets parallel to the
   long edge (two lots back to back and the street), `along` between the
   cross streets. Residential is the North American suburban block,
   roughly 110 m by 220 m; the others are larger. A kind with no entry
   gets no streets -- a park or a lake is not subdivided. */
export const BLOCKS = {
  residential: { across: 110, along: 220 },
  commercial: { across: 150, along: 200 },
  industrial: { across: 200, along: 300 },
};
export const SNAP = 25;          // metres: how far a street's end may be from a road and still end on it
export const STREET_KIND = "residential";

/* HOW CLOSE TWO JUNCTIONS ON ONE ROAD MAY BE. The graph refuses two
   intersections whose road between them cannot hold both stop lines and
   a car (graph.js, "junctions-too-close"), each stop line being the box
   -- a lane per lane of the widest road there -- plus the setback, and
   up to twice the box where the legs meet at a skew. So a street that
   would land closer than that to a junction already on the road lands ON
   it instead: two T's from either side become one crossroads, which is
   what a planner would draw. The skew allowance is the graph's own cap,
   so anything aligned here passes there. */
export const alignWithin = (lanes) => 2 * (2 * LANE * lanes + LINE_SETBACK) + CAR.length;
const lanesOfRoad = (r) => Math.max(1, Math.round(r.lanes ?? KINDS[r.kind]?.lanes ?? 1));

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/* Where segment p-q meets segment r-s, as { t, u } along each, or null. */
function meet(p, q, r, s) {
  const d = (q.x - p.x) * (s.y - r.y) - (q.y - p.y) * (s.x - r.x);
  if (Math.abs(d) < 1e-9) return null;
  const t = ((r.x - p.x) * (s.y - r.y) - (r.y - p.y) * (s.x - r.x)) / d;
  const u = ((r.x - p.x) * (q.y - p.y) - (r.y - p.y) * (q.x - p.x)) / d;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? { t, u } : null;
}

/* The nearest point on any of `roads` to `p` within `within`, or null. */
function nearestRoadPoint(roads, p, within) {
  let best = null;
  for (const r of roads) {
    for (let i = 0; i + 1 < r.points.length; i++) {
      const a = r.points[i], b = r.points[i + 1];
      const L2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
      const f = L2 ? Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / L2)) : 0;
      const at = { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, z: (a.z ?? 0) + ((b.z ?? 0) - (a.z ?? 0)) * f };
      const d = dist(p, at);
      if (d <= within && (!best || d < best.d)) best = { d, at, road: r.id };
    }
  }
  return best;
}

/* The polygon's longest edge, as an angle. */
function grainOf(poly) {
  let best = 0, ang = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], d = dist(a, b);
    if (d > best) { best = d; ang = Math.atan2(b.y - a.y, b.x - a.x); }
  }
  return ang;
}

/* The inside intervals of the infinite line through `o` along `dir`,
   clipped to `poly`, as [t0, t1] pairs of distance along the line. */
function clip(o, dir, poly) {
  const ts = [];
  const far = 1e5;
  const p = { x: o.x - dir.x * far, y: o.y - dir.y * far }, q = { x: o.x + dir.x * far, y: o.y + dir.y * far };
  for (let i = 0; i < poly.length; i++) {
    const m = meet(p, q, poly[i], poly[(i + 1) % poly.length]);
    if (m) ts.push(m.t * 2 * far - far);
  }
  ts.sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i + 1 < ts.length; i += 2) if (ts[i + 1] - ts[i] > 1) out.push([ts[i], ts[i + 1]]);
  return out;
}

/* THE STREETS FOR ONE ZONE: `{ map, report }`, with any streets this
   zone generated before replaced. `report` counts what was made and
   what was dropped, for the editor to say. */
export function fillZone(map, zoneId, { seed = 1 } = {}) {
  void seed;   // reserved: the layout is fully determined by the shapes today
  const zone = (map.zones ?? []).find((z) => z.id === zoneId);
  const kept = map.roads.filter((r) => r.gen !== zoneId);
  const report = { streets: 0, roads: 0, dropped: 0, reason: null };
  if (!zone || (zone.polygon ?? []).length < 3) return { map: { ...map, roads: kept }, report: { ...report, reason: "the zone has no area" } };
  const block = BLOCKS[zone.kind];
  if (!block) return { map: { ...map, roads: kept }, report: { ...report, reason: `a ${zone.kind} zone is not subdivided` } };
  const k = 1.3 - 0.6 * Math.max(0, Math.min(1, zone.density ?? 0.5));   // denser, smaller blocks
  const across = block.across * k, along = block.along * k;

  const poly = zone.polygon;
  const ang = grainOf(poly);
  const ux = { x: Math.cos(ang), y: Math.sin(ang) }, vy = { x: -Math.sin(ang), y: Math.cos(ang) };
  const toUV = (p) => ({ u: p.x * ux.x + p.y * ux.y, v: p.x * vy.x + p.y * vy.y });
  const fromUV = (u, v) => ({ x: u * ux.x + v * vy.x, y: u * ux.y + v * vy.y });
  const uv = poly.map(toUV);
  const [u0, u1] = [Math.min(...uv.map((p) => p.u)), Math.max(...uv.map((p) => p.u))];
  const [v0, v1] = [Math.min(...uv.map((p) => p.v)), Math.max(...uv.map((p) => p.v))];

  /* The candidate streets: lines along the grain, lines across it, each
     clipped to the polygon. Offset half a block from the bounding box so
     no line runs along the district's own edge, where the boundary road
     already is. */
  const lines = [];
  const place = (from, to, step) => { const n = Math.floor((to - from) / step); const pad = (to - from - n * step) / 2; return Array.from({ length: n }, (_, i) => from + pad + step * (i + 0.5)); };
  for (const v of place(v0, v1, across)) for (const [a, b] of clip(fromUV(0, v), ux, poly)) lines.push({ dir: ux, o: fromUV(0, v), a, b, grain: true });
  for (const u of place(u0, u1, along)) for (const [a, b] of clip(fromUV(u, 0), vy, poly)) lines.push({ dir: vy, o: fromUV(u, 0), a, b, grain: false });
  const at = (L, t) => ({ x: L.o.x + L.dir.x * t, y: L.o.y + L.dir.y * t });

  /* Breakpoints along each line: where it crosses another line, where it
     crosses a road already on the map, and its two ends. */
  const others = kept;
  for (const L of lines) L.cuts = [];
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      const A = lines[i], B = lines[j];
      const m = meet(at(A, A.a), at(A, A.b), at(B, B.a), at(B, B.b));
      if (!m) continue;
      const tA = A.a + m.t * (A.b - A.a), tB = B.a + m.u * (B.b - B.a);
      const key = `x${i}-${j}`;
      A.cuts.push({ t: tA, kind: "street", key, other: j });
      B.cuts.push({ t: tB, kind: "street", key, other: i });
    }
    const A = lines[i];
    for (const r of others) {
      for (let s = 0; s + 1 < r.points.length; s++) {
        const m = meet(at(A, A.a), at(A, A.b), r.points[s], r.points[s + 1]);
        if (m) A.cuts.push({ t: A.a + m.t * (A.b - A.a), kind: "road", road: r.id, z: (r.points[s].z ?? 0) + ((r.points[s + 1].z ?? 0) - (r.points[s].z ?? 0)) * m.u });
      }
    }
  }

  /* THE JUNCTIONS ALREADY ON EACH ROAD: every road end lying on it, which
     is every T already made there. Streets placed below add theirs, so
     two streets from this district align with each other too. */
  const onLine = (r, p) => nearestRoadPoint([r], p, 1) != null;
  const joints = others.flatMap((r) => [r.points[0], r.points[r.points.length - 1]]);
  const align = (roadId, p) => {
    const r = others.find((x) => x.id === roadId);
    const within = alignWithin(lanesOfRoad(r));
    let best = null;
    for (const j of joints) { const d = dist(j, p); if (d > 0.01 && d < within && onLine(r, j) && (!best || d < best.d)) best = { d, j }; }
    const at = best ? { x: best.j.x, y: best.j.y, z: best.j.z ?? p.z ?? 0 } : p;
    joints.push(at);
    return at;
  };
  for (const L of lines) for (const c of L.cuts) if (c.kind === "road") { const p = align(c.road, { ...at(L, c.t), z: c.z }); c.fixed = p; }

  /* THE ENDS. Snapped onto a road within SNAP, or trimmed back to the
     last breakpoint inside. */
  for (const L of lines) {
    L.cuts.sort((p, q) => p.t - q.t);
    for (const side of ["a", "b"]) {
      const t = L[side], p = at(L, t);
      const near = nearestRoadPoint(others, p, SNAP);
      const inner = side === "a" ? L.cuts[0] : L.cuts[L.cuts.length - 1];
      if (near && !(inner && inner.kind === "road" && Math.abs(inner.t - t) < SNAP)) {
        L[side + "End"] = { kind: "road", road: near.road, at: align(near.road, near.at) };
      } else {
        L[side + "End"] = null;
      }
    }
  }

  /* Each line as its run of points from its first kept end to its last:
     the snapped ends, and every breakpoint between. An end not snapped
     is trimmed to the breakpoint nearest it. */
  const runs = [];
  for (const [li, L] of lines.entries()) {
    const pts = [];
    if (L.aEnd) pts.push({ ...L.aEnd.at, kind: "road", road: L.aEnd.road });
    for (const c of L.cuts) pts.push({ ...(c.fixed ?? at(L, c.t)), z: c.z ?? 0, kind: c.kind, key: c.key, road: c.road, other: c.other });
    if (L.bEnd) pts.push({ ...L.bEnd.at, kind: "road", road: L.bEnd.road });
    /* A breakpoint within a few metres of a snapped end is the same
       junction twice; keep the end. */
    const clean = pts.filter((p, i) => !(p.kind !== "road" && pts.some((q, j) => j !== i && q.kind === "road" && dist(p, q) < 8)));
    if (clean.length >= 2) runs.push({ li, pts: clean, grain: L.grain });
  }

  /* ISLANDS: streets connected to each other but never to a road already
     on the map are dropped. */
  const parent = runs.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const byLine = new Map(runs.map((r, i) => [r.li, i]));
  runs.forEach((r, i) => r.pts.forEach((p) => { if (p.kind === "street" && byLine.has(p.other)) parent[find(i)] = find(byLine.get(p.other)); }));
  const anchored = new Set();
  runs.forEach((r, i) => { if (r.pts.some((p) => p.kind === "road")) anchored.add(find(i)); });
  const live = runs.filter((_, i) => anchored.has(find(i)));
  report.dropped = runs.length - live.length;

  /* How many live streets pass THROUGH each street crossing (rather than
     end at it): two is a crossroads, one a T whose stem is the other. */
  const through = new Map();
  for (const r of live) r.pts.forEach((p, i) => {
    if (p.kind !== "street") return;
    const inner = i > 0 && i < r.pts.length - 1;
    const e = through.get(p.key) ?? { through: 0, ending: 0 };
    if (inner) e.through++; else e.ending++;
    through.set(p.key, e);
  });
  /* A crossing only one live street reaches is not a junction at all. */
  const isJunction = (p) => p.kind === "road" || ((through.get(p.key)?.through ?? 0) + (through.get(p.key)?.ending ?? 0) >= 2);

  const controlAt = (p, ending) => {
    if (p.kind === "road") return "stop";
    const e = through.get(p.key);
    if (e.through >= 2) return "stop";                  // a crossroads of local streets: all-way
    return ending ? "stop" : "none";                    // a T: the stem stops, the through street runs
  };

  const roads = [];
  for (const r of live) {
    const pts = r.pts.filter((p, i) => i === 0 || i === r.pts.length - 1 || isJunction(p));
    for (let i = 0; i + 1 < pts.length; i++) {
      const p = pts[i], q = pts[i + 1];
      if (dist(p, q) < 1) continue;
      const startEnds = i === 0, endEnds = i + 1 === pts.length - 1;
      roads.push({
        ...makeRoad({
          id: `${zoneId}~${r.li}.${i}`,
          kind: STREET_KIND,
          points: [{ x: p.x, y: p.y, z: p.z ?? 0 }, { x: q.x, y: q.y, z: q.z ?? 0 }],
          control: { start: controlAt(p, startEnds), end: controlAt(q, endEnds) },
        }),
        gen: zoneId,
      });
    }
  }
  report.streets = live.length;
  report.roads = roads.length;
  return { map: { ...map, roads: [...kept, ...roads] }, report };
}

/* The streets a zone generated, gone. */
export function clearZone(map, zoneId) {
  return { ...map, roads: map.roads.filter((r) => r.gen !== zoneId) };
}
