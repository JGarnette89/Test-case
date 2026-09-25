/* =====================================================================
   LOADING A MAP: normalise, warn, and produce a graph -- or refuse.

   SIMULATOR.md 3.2, in that order. Everything a badly drawn map can
   contain is handled here so that nothing downstream has to: points on
   top of each other, a road shorter than a car, a bend no car could
   take at the posted speed, a crest no road has, an end drawn a metre
   short of the road it was meant to join, two roads drawn across each
   other by accident. Each becomes a normalisation with a warning, and
   only an empty map, or one with no drivable road, is refused.

   The output roads are the shape the isometric renderer and the
   player's car already consume (iso/road.js: `pts`, `at`, `left`,
   `right`, `length`, `width`, `step`), so a loaded map draws and
   drives with no change to either. The graph -- nodes with legs at
   real bearings -- is what the intersection refactor (2.4) will build
   its paths and conflicts from; here it is only assembled.

   Pure. No React, no canvas, no colour.
   ===================================================================== */
import { KINDS, CHUNK, LANE, SAMPLE, CONTROLS } from "./format.js";
import { ribbonOf } from "../iso/road.js";
import { hasBays, baySurfaceOf, baysAt } from "./bays.js";

/* A road's ribbon and, for more than one lane each way, the lines
   between lanes: the centreline offset a whole lane, two lanes, each
   side -- the same offsets the sim drives its lanes between. */
function surfaceOf(pts, width, lanes) {
  const out = { ...ribbonOf(pts, width), laneLines: [] };
  for (let k = 1; k < lanes; k++) {
    const { left, right } = ribbonOf(pts, 2 * k * LANE);
    out.laneLines.push(left, right);
  }
  return out;
}
/* A road's surface from the road itself: the plain ribbon, or -- where an
   end carries turn bays -- the widening one (map/bays.js). A road with no
   bays goes the old way, byte for byte. */
const surfaceFor = (r) => (hasBays(r) ? baySurfaceOf(r) : surfaceOf(r.pts, r.width, r.lanes));
import { radiusFor, LATERAL } from "../sim/course.js";

export const THIN = 0.5;                 // m: points closer than this are one point
export const MIN_ROAD = 4.5;             // m: a road shorter than a car is not a road
export const MAX_GRADE = 0.25;           // rise over run. Stage 0's hill is 0.23 at its steepest and was judged by eye (SIMULATOR.md stage 0); a real street rarely passes 0.15
export const SNAP = LANE;                // m: a road end this close to another road joins it
export const CLEARANCE_MIN = 4.5;        // m: roads that cross without a node need at least this between them, or it is a warning

/* ---- geometry helpers ------------------------------------------------ */
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const lerp = (a, b, f) => ({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, z: (a.z ?? 0) + ((b.z ?? 0) - (a.z ?? 0)) * f });
const headingOf = (a, b) => (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
const wrap = (d) => ((d + 540) % 360) - 180;

/* Nearest point on a polyline to `p`: the segment index, the fraction
   along it, the point, and the distance. */
function nearestOn(pts, p) {
  let best = { d: Infinity, i: 0, f: 0, at: pts[0] };
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], b = pts[i + 1];
    const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy || 1;
    const f = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2));
    const q = lerp(a, b, f);
    const d = dist(p, q);
    if (d < best.d) best = { d, i, f, at: q };
  }
  return best;
}

/* Where two segments cross in plan, if they do: the fractions along each. */
function crossing(a, b, c, d) {
  const r = { x: b.x - a.x, y: b.y - a.y }, s = { x: d.x - c.x, y: d.y - c.y };
  const den = r.x * s.y - r.y * s.x;
  if (Math.abs(den) < 1e-9) return null;
  const qp = { x: c.x - a.x, y: c.y - a.y };
  const t = (qp.x * s.y - qp.y * s.x) / den, u = (qp.x * r.y - qp.y * r.x) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { t, u };
}

/* ---- the steps -------------------------------------------------------- */
/* 1. Dedupe and thin. */
function thin(points) {
  const out = [];
  for (const p of points) {
    const q = { x: Number(p.x) || 0, y: Number(p.y) || 0, z: Number(p.z) || 0 };
    if (!out.length || dist(out[out.length - 1], q) >= THIN) out.push(q);
  }
  return out;
}

/* 2. Resample evenly along the polyline. */
function resample(points, step = SAMPLE) {
  const cum = [0];
  for (let i = 1; i < points.length; i++) cum.push(cum[i - 1] + dist(points[i], points[i - 1]));
  const length = cum[cum.length - 1];
  const n = Math.max(2, Math.ceil(length / step));
  const pts = [], at = [];
  let j = 1;
  for (let i = 0; i <= n; i++) {
    const s = (length * i) / n;
    while (j < cum.length - 1 && cum[j] < s) j++;
    const f = (s - cum[j - 1]) / (cum[j] - cum[j - 1] || 1);
    pts.push(lerp(points[j - 1], points[j], f));
    at.push(s);
  }
  return { pts, at, length, step: length / n };
}

/* 3. The tightest bend, and the speed it allows. Curvature from the
   heading change between neighbouring samples; the radius the posted
   speed needs is the side-friction rule the sim's bends already use. */
function tightestBend(pts, at) {
  let worst = { radius: Infinity, s: 0 };
  for (let i = 1; i + 1 < pts.length; i++) {
    const d = wrap(headingOf(pts[i], pts[i + 1]) - headingOf(pts[i - 1], pts[i]));
    const ds = (at[i + 1] - at[i - 1]) / 2;
    const kappa = Math.abs((d * Math.PI) / 180) / (ds || 1);
    if (kappa > 1e-6 && 1 / kappa < worst.radius) worst = { radius: 1 / kappa, s: at[i] };
  }
  return worst;
}
const speedForRadius = (r) => Math.floor((Math.sqrt(r * LATERAL) * 3.6) / 5) * 5;   // radiusFor(v) = v^2 / LATERAL, inverted, to the 5 km/h below

/* 4. Grade clamp: smooth z until no segment is steeper than MAX_GRADE.
   Diffusion, applied only where a segment is too steep: an offending
   interior point moves toward the mean of its neighbours, which brings
   a crest down from its top and a dip up from its bottom, and stops the
   moment every grade is legal. (A first version averaged each steep
   PAIR toward its own midpoint, which preserves the pair's mean and so
   pushes a crest's shoulders UP: it could not converge, and a 40% ramp
   came out with its peak higher than it went in.) The ends are held,
   since they are where the road meets the world. Returns how far any
   point moved. */
function clampGrade(pts, at) {
  const z0 = pts.map((p) => p.z);
  const steep = (i) => Math.abs(pts[i + 1].z - pts[i].z) / (at[i + 1] - at[i] || 1) > MAX_GRADE + 1e-9;
  for (let pass = 0; pass < 20000; pass++) {
    let fixed = 0;
    for (let i = 1; i + 1 < pts.length; i++) {
      if (!steep(i - 1) && !steep(i)) continue;
      pts[i].z = (pts[i - 1].z + pts[i].z + pts[i + 1].z) / 3;
      fixed++;
    }
    if (!fixed) break;
  }
  return Math.max(0, ...pts.map((p, i) => Math.abs(p.z - z0[i])));
}

/* ---- the load --------------------------------------------------------- */
export function loadMap(map) {
  const warnings = [];
  const warn = (code, message, at = null, extra = {}) => warnings.push({ code, message, at, ...extra });
  if (!map || !Array.isArray(map.roads)) return { ok: false, error: "not a map: no roads array", warnings };

  /* Roads: fill from the kind, thin, drop the short, resample, clamp. */
  let roads = [];
  const seen = new Set();
  for (const r of map.roads) {
    const kind = KINDS[r.kind] ? r.kind : "collector";
    if (!KINDS[r.kind]) warn("unknown-kind", `road ${r.id}: kind "${r.kind}" is not one of ${Object.keys(KINDS).join(", ")}; treated as collector`);
    let id = String(r.id ?? `road${roads.length}`);
    if (seen.has(id)) { warn("duplicate-id", `road id "${id}" appears twice; the second is renamed`); id = `${id}~${roads.length}`; }
    seen.add(id);
    const points = thin(r.points ?? []);
    if (points.length < 2) { warn("degenerate", `road ${id}: fewer than two distinct points; dropped`); continue; }
    const raw = resample(points);
    if (raw.length < MIN_ROAD) { warn("too-short", `road ${id}: ${raw.length.toFixed(1)} m is shorter than a car; dropped`, raw.pts[0]); continue; }
    const lanes = Math.max(1, Math.min(4, Math.round(r.lanes ?? KINDS[kind].lanes)));
    const oneWay = !!r.oneWay;
    const width = lanes * LANE * (oneWay ? 1 : 2);
    let speed = Number(r.speed) > 0 ? Number(r.speed) : KINDS[kind].speed;
    const bend = tightestBend(raw.pts, raw.at);
    const allowed = radiusFor(speed / 3.6);
    if (bend.radius < allowed) {
      const posted = Math.max(10, speedForRadius(bend.radius));
      warn("bend-too-tight", `road ${id}: a bend of radius ${bend.radius.toFixed(0)} m at ${bend.s.toFixed(0)} m needs ${allowed.toFixed(0)} m at ${speed} km/h; posted speed lowered to ${posted}`, raw.pts[Math.round(bend.s / raw.step)], { from: speed, to: posted });
      speed = posted;
    }
    const moved = clampGrade(raw.pts, raw.at);
    if (moved > 0.01) warn("grade-clamped", `road ${id}: a slope steeper than ${Math.round(MAX_GRADE * 100)}% was flattened by up to ${moved.toFixed(2)} m`);
    const control = { start: CONTROLS.includes(r.control?.start) ? r.control.start : "none", end: CONTROLS.includes(r.control?.end) ? r.control.end : "none" };
    /* Per-lane permitted movements, passed through for the graph to check
       against the node it arrives at (sim/lanes.js) -- only the graph
       knows what movements an end offers. */
    const turns = r.turns && typeof r.turns === "object" ? { start: r.turns.start ?? null, end: r.turns.end ?? null } : null;
    /* Turn bays and left arrows, per road end (map/bays.js). A one-way
       road has no median to open a bay into and no oncoming to protect a
       left from; both are dropped with a warning rather than half-built. */
    let bays = r.bays && typeof r.bays === "object" ? { start: r.bays.start ?? null, end: r.bays.end ?? null } : null;
    if (bays && oneWay) { warn("bays-one-way", `road ${id}: turn bays on a one-way road are not supported; dropped`); bays = null; }
    const leftArrow = r.leftArrow && typeof r.leftArrow === "object" ? { start: !!r.leftArrow.start, end: !!r.leftArrow.end } : null;
    const built = { id, kind, lanes, oneWay, width, speed, parking: r.parking ?? KINDS[kind].parking, control, ...(turns ? { turns } : {}), ...(bays ? { bays } : {}), ...(leftArrow ? { leftArrow } : {}), ...raw };
    /* A bay longer than its road cannot open: it and its taper must fit. */
    for (const end of ["start", "end"]) {
      const b = baysAt(built, end);
      if (b && b.length + b.taper > raw.length) warn("bay-too-long", `road ${id}: the ${end} bay needs ${(b.length + b.taper).toFixed(0)} m (storage and taper) on a ${raw.length.toFixed(0)} m road`);
    }
    roads.push({ ...built, ...surfaceFor(built) });
  }
  if (!roads.length) return { ok: false, error: "no drivable road", warnings };

  /* 5. Snap road ends. Explicit nodes first, then ends near a road. A
     snapped end splits the road it lands on into two, which keeps every
     road a simple curve between two nodes or edges. */
  const nodes = [];
  const byId = () => Object.fromEntries(roads.map((r) => [r.id, r]));
  for (const n of map.nodes ?? []) {
    const at = { x: Number(n.at?.x) || 0, y: Number(n.at?.y) || 0, z: Number(n.at?.z) || 0 };
    const legs = [];
    for (const leg of n.legs ?? []) {
      const r = byId()[leg.road];
      if (!r) { warn("node-leg-missing", `node ${n.id}: leg names road "${leg.road}", which does not exist`, at); continue; }
      const end = leg.end === "start" ? "start" : "end";
      const p = end === "start" ? r.pts[0] : r.pts[r.pts.length - 1];
      if (dist(p, at) > SNAP) { warn("node-leg-far", `node ${n.id}: road ${r.id}'s ${end} is ${dist(p, at).toFixed(1)} m from the node; not joined`, at); continue; }
      legs.push({ road: r.id, end });
    }
    nodes.push({ id: String(n.id ?? `node${nodes.length}`), at, legs, explicit: true });
  }
  const joinedEnds = new Set(nodes.flatMap((n) => n.legs.map((l) => `${l.road}|${l.end}`)));
  for (const r of roads.slice()) {
    if (!roads.includes(r)) continue;   // split by an earlier end; its halves are handled as themselves
    for (const end of ["start", "end"]) {
      if (joinedEnds.has(`${r.id}|${end}`)) continue;
      const p = end === "start" ? r.pts[0] : r.pts[r.pts.length - 1];
      /* An existing node within reach takes the end. */
      const near = nodes.find((n) => dist(n.at, p) <= SNAP);
      if (near) { near.legs.push({ road: r.id, end }); joinedEnds.add(`${r.id}|${end}`); continue; }
      /* Otherwise the nearest other road, if it is within a lane width. */
      let hit = null;
      for (const o of roads) {
        if (o === r) continue;
        const q = nearestOn(o.pts, p);
        if (q.d <= SNAP && (!hit || q.d < hit.q.d)) hit = { o, q };
      }
      if (!hit) continue;
      const { o, q } = hit;
      const atEnd = q.i === 0 && q.f < 0.01 ? "start" : q.i === o.pts.length - 2 && q.f > 0.99 ? "end" : null;
      const node = { id: `n${nodes.length}`, at: { ...q.at }, legs: [{ road: r.id, end }], explicit: false };
      if (atEnd) {
        /* Landed on the other road's own end: a plain join, no split. */
        node.legs.push({ road: o.id, end: atEnd });
        joinedEnds.add(`${o.id}|${atEnd}`);
      } else {
        /* Split the other road at the landing point. */
        const cut = q.i + 1;
        const aPts = [...o.pts.slice(0, cut), { ...q.at }], bPts = [{ ...q.at }, ...o.pts.slice(cut)];
        /* Each half keeps its own original end's control and turns; the
           new ends, at the node this split makes, get the general rule. */
        /* Bays and arrows likewise stay with the end that carried them. */
        const mk = (suffix, pts, controlStart, controlEnd, turnsStart, turnsEnd, which) => {
          const rs = resample(pts);
          const keep = (f) => (o[f] ? { [f]: { start: which === "a" ? o[f].start : null, end: which === "b" ? o[f].end : null } } : {});
          const half = { ...o, id: `${o.id}${suffix}`, control: { start: controlStart, end: controlEnd }, turns: { start: turnsStart, end: turnsEnd }, ...keep("bays"), ...keep("leftArrow"), ...rs };
          return { ...half, ...surfaceFor(half) };
        };
        const a = mk("#a", aPts, o.control.start, "none", o.turns?.start ?? null, null, "a"), b = mk("#b", bPts, "none", o.control.end, null, o.turns?.end ?? null, "b");
        roads.splice(roads.indexOf(o), 1, a, b);
        for (const n of nodes) for (const l of n.legs) if (l.road === o.id) l.road = l.end === "start" ? a.id : b.id;
        for (const k of [...joinedEnds]) if (k.startsWith(`${o.id}|`)) { joinedEnds.delete(k); joinedEnds.add(k.replace(`${o.id}|`, k.endsWith("|start") ? `${a.id}|` : `${b.id}|`)); }
        node.legs.push({ road: a.id, end: "end" }, { road: b.id, end: "start" });
        joinedEnds.add(`${a.id}|end`); joinedEnds.add(`${b.id}|start`);
        warn("snapped-split", `road ${r.id}'s ${end} joined road ${o.id} ${q.d.toFixed(2)} m away; ${o.id} is split there`, q.at);
      }
      /* Move the snapped end onto the node. */
      const pts = r.pts.slice();
      pts[end === "start" ? 0 : pts.length - 1] = { ...q.at };
      const rs = resample(pts);
      Object.assign(r, rs);
      Object.assign(r, surfaceFor(r));
      joinedEnds.add(`${r.id}|${end}`);
      nodes.push(node);
      if (atEnd) warn("snapped-join", `road ${r.id}'s ${end} joined road ${o.id}'s ${atEnd} ${q.d.toFixed(2)} m away`, q.at);
    }
  }

  /* Legs get bearings -- the direction the road leaves the node in --
     and every end that joined nothing is an edge: a spawn and despawn. */
  const roadOf = byId();
  for (const n of nodes) {
    for (const l of n.legs) {
      const r = roadOf[l.road];
      if (!r) continue;
      const a = l.end === "start" ? r.pts[0] : r.pts[r.pts.length - 1];
      const b = l.end === "start" ? r.pts[1] : r.pts[r.pts.length - 2];
      l.id = `${l.road}|${l.end}`;
      l.bearing = Math.round(headingOf(a, b) * 10) / 10;
      l.control = r.control[l.end];
    }
    n.legs.sort((p, q) => p.bearing - q.bearing);
    if (n.legs.length < 2) warn("node-one-leg", `node ${n.id} has ${n.legs.length} leg${n.legs.length === 1 ? "" : "s"}`, n.at);
  }
  for (const r of roads) {
    r.edge = { start: !joinedEnds.has(`${r.id}|start`), end: !joinedEnds.has(`${r.id}|end`) };
    /* A bay opens for an intersection; at an edge there is none, so the
       road would widen toward nothing. Dropped, with a warning. */
    if (r.bays) {
      let changed = false;
      for (const end of ["start", "end"]) if (r.bays[end] && r.edge[end]) { warn("bay-at-edge", `road ${r.id}: turn bays at its ${end}, which meets no intersection; dropped`); r.bays = { ...r.bays, [end]: null }; changed = true; }
      if (changed) Object.assign(r, { centre: undefined }, surfaceFor(r));
    }
  }

  /* 7. Roads that cross in plan without meeting: an overpass if there
     is clearance, a warning if there is not. Bounding boxes first. */
  const box = (r) => r.pts.reduce((b, p) => ({ x0: Math.min(b.x0, p.x), y0: Math.min(b.y0, p.y), x1: Math.max(b.x1, p.x), y1: Math.max(b.y1, p.y) }), { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity });
  const boxes = roads.map(box);
  const crossings = [];
  for (let i = 0; i < roads.length; i++) {
    for (let j = i + 1; j < roads.length; j++) {
      const A = boxes[i], B = boxes[j];
      if (A.x1 < B.x0 || B.x1 < A.x0 || A.y1 < B.y0 || B.y1 < A.y0) continue;
      const p = roads[i].pts, q = roads[j].pts;
      for (let a = 0; a + 1 < p.length; a++) {
        for (let b = 0; b + 1 < q.length; b++) {
          const x = crossing(p[a], p[a + 1], q[b], q[b + 1]);
          if (!x) continue;
          const at = lerp(p[a], p[a + 1], x.t), zq = lerp(q[b], q[b + 1], x.u).z;
          if (nodes.some((n) => dist(n.at, at) <= SNAP)) continue;   // they meet there
          /* A crossing on a sample point is found by every segment that
             shares it; it is one crossing. */
          if (crossings.some((c) => c.roads[0] === roads[i].id && c.roads[1] === roads[j].id && dist(c.at, at) < 1)) continue;
          const gap = Math.abs(at.z - zq);
          crossings.push({ roads: [roads[i].id, roads[j].id], at, gap, over: at.z >= zq ? roads[i].id : roads[j].id });
          if (gap < CLEARANCE_MIN) warn("cross-no-node", `roads ${roads[i].id} and ${roads[j].id} cross at (${at.x.toFixed(0)}, ${at.y.toFixed(0)}) with no intersection there and only ${gap.toFixed(1)} m between them`, at);
        }
      }
    }
  }

  /* WHICH ROAD IS BRIDGING, AND OVER HOW MUCH OF ITS LENGTH. The upper
     road at a crossing is not sitting on the land there, and it cannot
     have come down to the land any faster than its own steepest
     allowed grade -- so `gap / MAX_GRADE` either side of the crossing
     is span it cannot have been on the ground for. Derived from the
     clearance rather than chosen, and it is what lets a renderer tell a
     road CLIMBING a hill (the land rises with it) from one SPANNING
     another (the land stays under it) without guessing from height,
     which is what the renderer used to do. */
  for (const r of roads) for (const p of r.pts) p.bridge = false;
  for (const c of crossings) {
    const r = roads.find((x) => x.id === c.over);
    if (!r) continue;
    const span = c.gap / MAX_GRADE;
    for (const p of r.pts) if (dist(p, c.at) <= span) p.bridge = true;
  }

  /* The chunk index: every road sample knows its chunk. */
  const chunks = new Map();
  const keyOf = (x, y) => `${Math.floor(x / CHUNK)},${Math.floor(y / CHUNK)}`;
  for (const r of roads) {
    const mine = new Set();
    r.pts.forEach((p, i) => {
      const k = keyOf(p.x, p.y);
      mine.add(k);
      if (!chunks.has(k)) chunks.set(k, { roads: new Set(), samples: [], props: [] });
      const c = chunks.get(k);
      c.roads.add(r.id); c.samples.push({ road: r.id, i });
    });
    r.chunks = [...mine];
  }
  for (const pr of map.props ?? []) {
    const k = keyOf(Number(pr.at?.x) || 0, Number(pr.at?.y) || 0);
    if (!chunks.has(k)) chunks.set(k, { roads: new Set(), samples: [], props: [] });
    chunks.get(k).props.push(pr);
  }

  const bounds = map.bounds ?? { x: Math.min(...boxes.map((b) => b.x0)), y: Math.min(...boxes.map((b) => b.y0)), w: 0, h: 0 };
  return { ok: true, id: map.id, name: map.name, bounds, roads, nodes, crossings, chunks, warnings };
}

/* THE LAND, WHERE THE MAP GIVES NONE.

   A map is roads; the format carries no terrain, and terrain is the
   editor's business (SIMULATOR.md 4). So until it does, THE LAND IS
   WHAT THE ROADS SAY IT IS: it meets every road that is on it, and
   between them it is the smoothest surface that does -- a Laplace
   solve on a coarse grid, the roads pinned, everything else the
   average of its neighbours. A bridging point (above) is left out, so
   the land stays under an overpass and rises with a road that climbs.

   The grid is as coarse as the ground mesh drawn from it, so a mesh
   corner lands on a grid node and takes a road's own height exactly.
   Returned as a sampler; built once per map. */
export function groundFor(loaded, { cell = 20 } = {}) {
  const b = loaded.bounds;
  const nx = Math.max(2, Math.ceil(b.w / cell) + 1), ny = Math.max(2, Math.ceil(b.h / cell) + 1);
  const sum = new Float64Array(nx * ny), hits = new Float64Array(nx * ny);
  for (const r of loaded.roads) for (const p of r.pts) {
    if (p.bridge) continue;
    const i = Math.round((p.x - b.x) / cell), j = Math.round((p.y - b.y) / cell);
    if (i < 0 || j < 0 || i >= nx || j >= ny) continue;
    sum[j * nx + i] += p.z ?? 0; hits[j * nx + i] += 1;
  }
  let h = new Float64Array(nx * ny), next = new Float64Array(nx * ny);
  const pinned = new Uint8Array(nx * ny);
  for (let k = 0; k < h.length; k++) if (hits[k]) { h[k] = sum[k] / hits[k]; pinned[k] = 1; }
  /* Enough passes for a road's height to reach the far corner: the
     value spreads one cell a pass, and twice the grid settles it. */
  const passes = 2 * Math.max(nx, ny);
  for (let pass = 0; pass < passes; pass++) {
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      if (pinned[k]) { next[k] = h[k]; continue; }
      let s = 0, c = 0;
      if (i > 0) { s += h[k - 1]; c++; }
      if (i + 1 < nx) { s += h[k + 1]; c++; }
      if (j > 0) { s += h[k - nx]; c++; }
      if (j + 1 < ny) { s += h[k + nx]; c++; }
      next[k] = c ? s / c : h[k];
    }
    const t = h; h = next; next = t;
  }
  const at = (i, j) => h[Math.min(ny - 1, Math.max(0, j)) * nx + Math.min(nx - 1, Math.max(0, i))];
  return (x, y) => {
    const u = (x - b.x) / cell, v = (y - b.y) / cell;
    const i = Math.floor(u), j = Math.floor(v), fx = u - i, fy = v - j;
    return (at(i, j) * (1 - fx) + at(i + 1, j) * fx) * (1 - fy) + (at(i, j + 1) * (1 - fx) + at(i + 1, j + 1) * fx) * fy;
  };
}

/* One road by id, for callers holding a name rather than an object. */
export const roadById = (loaded, id) => loaded.roads.find((r) => r.id === id) ?? null;
