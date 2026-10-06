/* =====================================================================
   A MAP BUILT TO TEST SOMETHING (1 October, the maintainer's request).
   He would rather start from a generated map and change it than draw
   one, and he wants maps generated WITH INTENT: "a map with three
   signalled intersections and a long arterial", "a downtown with heavy
   pedestrian traffic and tight blocks", "a map where every intersection
   type appears once". The best findings here came from maps shaped around
   what was being tested; this makes that deliberate.

   A BRIEF is a small vocabulary, every term of which is MEASURED in the
   map that comes out -- the rule composition has always lived under: a
   word nothing can check does not belong. The generator builds the major
   roads from it, sets each intersection, grows the districts with the
   existing generator (generate.js `fillZone`, `fillLots`), then loads
   the result and counts what is really there. What it was asked for and
   what it got are both on the map (`report`), and anything short is
   said, never claimed.

   And every map points at its own subject: one section per feature the
   brief asked for -- the first signal, the long arterial, downtown, a
   bay stop -- so on #/tests the thing to judge is one tap away.

   Pure. No React, no DOM.
   ===================================================================== */
import { emptyMap, road, KINDS, CHARACTERS } from "./format.js";
import { fillZone, fillLots } from "./generate.js";
import { loadMap } from "./load.js";
import { setRoadControl, setLeftArrow, addCrossing, addStop, setStopKind, splitRoad, nearestOnRoad, RANK } from "../editor/model.js";

/* THE VOCABULARY, with what each word does. */
export const BRIEF = {
  size: { small: { cols: 2, rows: 2 }, medium: { cols: 3, rows: 2 }, large: { cols: 4, rows: 3 } },
  arterials: ["loop", "long", "cross", "grid", "none"],
};
export const DEFAULT_BRIEF = { size: "medium", arterials: "loop", signals: null, everyType: false, downtown: false, buses: false, drivers: "ordinary" };

/* How far apart the major roads run, and how far they carry on past the
   edge of the city so traffic has somewhere to come from. */
const CELL = 500, OUT = 250;
const TYPES = ["signal", "signal-arrow", "all-stop", "minor-stop", "minor-yield", "none"];
const NAMES = {
  signal: "a signalled intersection", "signal-arrow": "signals with a protected left arrow", "all-stop": "an all-way stop",
  "minor-stop": "a stop on the minor road", "minor-yield": "a yield on the minor road", none: "an uncontrolled intersection",
};
const JUDGE = {
  signal: "Who goes on the green, who waits on the red, and left turns finding a gap in the oncoming traffic.",
  "signal-arrow": "Lefts go on their protected arrow, from the left lane; the oncoming traffic is held while they do.",
  "all-stop": "Everybody stops; whoever stopped first goes first. Do drivers take their turn, or roll it?",
  "minor-stop": "The minor road stops and waits for a real gap in the major road's traffic, which does not stop at all.",
  "minor-yield": "The minor road slows, gives way to the major road, and only stops if it has to.",
  none: "No signs: whoever gets there first goes, simultaneous arrivals to the right, and nobody locks up.",
};

/* A MAP FROM A BRIEF. `{ ...map, sections, report }`. Deterministic: the
   same brief and seed make the same map. */
export function mapFromBrief(input = {}, seed = 1) {
  const b = { ...DEFAULT_BRIEF, ...input };
  const { cols, rows } = BRIEF.size[b.size] ?? BRIEF.size.medium;
  const W = cols * CELL, H = rows * CELL;
  const xs = Array.from({ length: cols + 1 }, (_, i) => i * CELL), ys = Array.from({ length: rows + 1 }, (_, j) => j * CELL);
  const midRow = Math.floor(rows / 2), midCol = Math.floor(cols / 2);

  /* WHICH MAJOR ROADS ARE ARTERIALS. The rest are two-lane collectors --
     one lane each way, so a bus at a curb stop can be passed. */
  const art = (dir, i) => {
    const edge = dir === "h" ? i === 0 || i === rows : i === 0 || i === cols;
    switch (b.arterials) {
      case "loop": return edge;
      case "long": return dir === "h" && i === midRow;
      case "cross": return (dir === "h" && i === midRow) || (dir === "v" && i === midCol);
      case "grid": return true;
      default: return false;
    }
  };
  let m = emptyMap(`brief-${seed}`, briefName(b));
  const P = (x, y) => ({ x, y, z: 0 });
  const kindOf = (dir, i) => (art(dir, i) ? "arterial" : "collector");
  const lanesOf = (k) => (k === "arterial" ? KINDS.arterial.lanes : 1);
  /* Every major line, split at every crossing so ends meet at the nodes,
     and carried OUT past the edge at both ends. */
  for (let j = 0; j <= rows; j++) {
    const k = kindOf("h", j), stops = [-OUT, ...xs, W + OUT];
    for (let i = 0; i + 1 < stops.length; i++) m.roads.push(road({ id: `h${j}-${i}`, kind: k, lanes: lanesOf(k), points: [P(stops[i], ys[j]), P(stops[i + 1], ys[j])] }));
  }
  for (let i = 0; i <= cols; i++) {
    const k = kindOf("v", i), stops = [-OUT, ...ys, H + OUT];
    for (let j = 0; j + 1 < stops.length; j++) m.roads.push(road({ id: `v${i}-${j}`, kind: k, lanes: lanesOf(k), points: [P(xs[i], stops[j]), P(xs[i], stops[j + 1])] }));
  }

  /* THE INTERSECTIONS, each given a control. A crossing's rank is its two
     roads' (editor/model.js RANK); the brief's signals go to the highest,
     nearest the middle first. */
  const nodes = [];
  for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) {
    const kh = kindOf("h", j), kv = kindOf("v", i);
    nodes.push({ i, j, at: P(xs[i], ys[j]), rank: RANK[kh] + RANK[kv], mixed: kh !== kv, ends: [[`h${j}-${i}`, "end", kh], [`h${j}-${i + 1}`, "start", kh], [`v${i}-${j}`, "end", kv], [`v${i}-${j + 1}`, "start", kv]] });
  }
  const centre = { x: W / 2, y: H / 2 };
  const byRank = nodes.slice().sort((p, q) => q.rank - p.rank || Math.hypot(p.at.x - centre.x, p.at.y - centre.y) - Math.hypot(q.at.x - centre.x, q.at.y - centre.y));
  const wantSignals = b.signals ?? nodes.filter((n) => n.rank >= 2 * RANK.arterial).length;
  const type = new Map();
  byRank.slice(0, Math.min(wantSignals, nodes.length)).forEach((n) => type.set(n, "signal"));
  /* The rest: a minor road stops for a major one, two equal roads stop
     all-way -- and two arterials get signals only where the brief left
     the count to us (asked for none, "0 signals" gave four, 1 October). */
  for (const n of nodes) if (!type.has(n)) type.set(n, n.mixed ? "minor-stop" : n.rank >= 2 * RANK.arterial && b.signals == null ? "signal" : "all-stop");
  /* EVERY TYPE ONCE: the ones still missing go to the crossings that can
     carry them -- a minor road for the minor types -- keeping the signals
     asked for. Short of crossings, the report says so. */
  if (b.everyType) {
    const signals = [...type.values()].filter((t) => t === "signal").length;
    for (const t of TYPES) {
      if ([...type.values()].includes(t)) continue;
      const fits = (n) => (t.startsWith("minor") ? n.mixed : true) && (t === "signal-arrow" ? type.get(n) === "signal" : type.get(n) !== "signal" || signals > wantSignals);
      const used = new Set(TYPES.filter((u) => [...type.values()].filter((v) => v === u).length === 1).flatMap((u) => [...type.entries()].filter(([, v]) => v === u).map(([n]) => n)));
      const n = nodes.find((q) => fits(q) && !used.has(q));
      if (n) type.set(n, t);
    }
  }
  for (const n of nodes) {
    const t = type.get(n);
    const minorRank = Math.min(...n.ends.map((e) => RANK[e[2]]));
    for (const [id, end, k] of n.ends) {
      const c = t === "signal" || t === "signal-arrow" ? "signal" : t === "all-stop" ? "stop" : t === "none" ? "none"
        : RANK[k] === minorRank ? (t === "minor-stop" ? "stop" : "yield") : "none";
      m = setRoadControl(m, id, end, c);
      if (t === "signal-arrow" && k === "arterial") m = setLeftArrow(m, id, end, true);
    }
  }

  /* THE DISTRICTS: one to a cell between the major roads. Downtown, if
     asked, is the middle cell(s): commercial, dense -- tight blocks -- and
     crosswalks at every intersection in it. */
  const dt = (i, j) => b.downtown && Math.abs(i + 0.5 - cols / 2) <= 0.5 && Math.abs(j + 0.5 - rows / 2) <= 0.5;
  const chars = b.drivers === "mixed" ? CHARACTERS : ["ordinary"];
  let ci = 0;
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const down = dt(i, j);
    m.zones.push({ id: `z${i}${j}`, kind: down ? "commercial" : "residential", density: down ? 0.95 : 0.5,
      character: down ? "ordinary" : chars[ci++ % chars.length],
      polygon: [P(xs[i], ys[j]), P(xs[i + 1], ys[j]), P(xs[i + 1], ys[j + 1]), P(xs[i], ys[j + 1])] });
  }
  for (const z of m.zones) m = fillZone(m, z.id, { seed }).map;
  for (const z of m.zones) m = fillLots(m, z.id).map;
  if (b.downtown) {
    /* Where a street meets a road mid-block the drawn road has no END
       there until the loader splits it, so it could carry no crosswalk:
       downtown had them at only half its intersections (1 October). Split
       the drawn roads at every intersection first. */
    for (const n of loadMap(m).nodes) {
      for (const r of m.roads) {
        const on = nearestOnRoad({ roads: [r] }, n.at, { within: 1 });
        if (!on) continue;
        const atEnd = Math.hypot(r.points[0].x - on.at.x, r.points[0].y - on.at.y) < 1 || Math.hypot(r.points.at(-1).x - on.at.x, r.points.at(-1).y - on.at.y) < 1;
        if (!atEnd) m = splitRoad(m, r.id, on.seg, on.at).map;
      }
    }
    const inDown = (p) => m.zones.some((z) => z.kind === "commercial" && p.x >= z.polygon[0].x - 1 && p.x <= z.polygon[1].x + 1 && p.y >= z.polygon[0].y - 1 && p.y <= z.polygon[2].y + 1);
    const ends = new Map();
    for (const r of m.roads) for (const [end, p] of [["start", r.points[0]], ["end", r.points.at(-1)]]) {
      const key = `${Math.round(p.x)},${Math.round(p.y)}`;
      if (!ends.has(key)) ends.set(key, []);
      ends.get(key).push([r.id, end, p]);
    }
    for (const list of ends.values()) if (list.length >= 3 && inDown(list[0][2])) for (const [id, end] of list) m = { ...m, roads: m.roads.map((r) => (r.id === id ? { ...r, crosswalk: { ...(r.crosswalk ?? {}), [end]: true } } : r)) };
  }
  /* A MID-BLOCK CROSSING, for every type -- and for downtown's people. */
  if (b.everyType || b.downtown) {
    const col = m.roads.find((r) => r.kind === "collector" && /^h|^v/.test(r.id) && Math.hypot(r.points[1].x - r.points[0].x, r.points[1].y - r.points[0].y) >= CELL - 1);
    if (col) m = addCrossing(m, col.id, { x: (col.points[0].x + col.points[1].x) / 2 + 60, y: (col.points[0].y + col.points[1].y) / 2 + 60 }).map;
  }
  /* BUS STOPS along the collectors: one each way on every full block,
     curb and bay in turn. */
  if (b.buses) {
    /* Where the streets have joined the collectors (the loader splits them
       there) a bay needs its length and tapers clear: at a fixed fraction
       of the block, every bay landed beside a T and became a curb stop
       (1 October). So each stop goes where the loaded map has room. */
    const joins = loadMap(m).nodes.map((q) => q.at);
    const clear = (p) => joins.every((q) => Math.hypot(q.x - p.x, q.y - p.y) >= 55);
    let n = 0;
    /* DOWNTOWN HAS SPLIT EVERY COLLECTOR at its intersections (above), so
       no piece is a full block or keeps its block's name, and a brief
       asking for downtown AND buses got no stops at all (6 October). With
       downtown, any collector piece inside the city is a candidate; the
       clearance from intersections below still decides where a stop fits.
       Without it the candidates are the full blocks, exactly as before. */
    const inCity = (p) => p.x >= -1 && p.x <= W + 1 && p.y >= -1 && p.y <= H + 1;
    for (const r of m.roads.filter((q) => q.kind === "collector" && (b.downtown ? inCity(q.points[0]) && inCity(q.points.at(-1)) : /^[hv]\d+-\d+$/.test(q.id)))) {
      const [a, z] = [r.points[0], r.points.at(-1)], L = Math.hypot(z.x - a.x, z.y - a.y);
      if (!b.downtown && L < CELL - 1) continue;
      const along = (f) => ({ x: a.x + (z.x - a.x) * f, y: a.y + (z.y - a.y) * f });
      const spots = [];
      for (let f = 0.15; f <= 0.85 && spots.length < 2; f += 0.01) if (clear(along(f)) && (!spots.length || f - spots[0] > 0.2)) spots.push(f);
      for (const [f, side] of spots.map((f, k) => [f, k ? -1 : 1])) {
        const p = along(f);
        const nx = -(z.y - a.y) / L, ny = (z.x - a.x) / L;
        const r1 = addStop(m, { x: p.x + nx * side * 8, y: p.y + ny * side * 8 });
        if (!r1.id) continue;
        m = n++ % 2 ? setStopKind(r1.map, r1.id, "bay") : r1.map;
      }
    }
  }
  m.bounds = { x: -OUT - 50, y: -OUT - 50, w: W + 2 * OUT + 100, h: H + 2 * OUT + 100 };

  /* WHAT CAME OUT, measured from the loaded map -- never from the plan. */
  const L = loadMap(m);
  const report = measure(L, b, wantSignals);
  m.sections = sectionsFor(L, b, report);
  m.report = report;
  return m;
}

/* A name that says what was asked. */
export function briefName(b) {
  const parts = [`${b.size ?? "medium"} city`, `${b.arterials ?? "loop"} arterials`];
  if (b.signals != null) parts.push(`${b.signals} signals`);
  if (b.everyType) parts.push("every intersection type");
  if (b.downtown) parts.push("downtown");
  if (b.buses) parts.push("buses");
  if (b.drivers === "mixed") parts.push("mixed drivers");
  return parts.join(", ");
}

/* WHAT AN INTERSECTION IS, read off the loaded map. */
export function typeOfNode(L, n) {
  const roads = Object.fromEntries(L.roads.map((r) => [r.id, r]));
  const cs = n.legs.map((l) => l.control ?? "none");
  if (cs.some((c) => String(c).startsWith("signal"))) return n.legs.some((l) => roads[l.road]?.leftArrow?.[l.end]) ? "signal-arrow" : "signal";
  if (cs.every((c) => c === "stop")) return "all-stop";
  if (cs.some((c) => c === "stop")) return "minor-stop";
  if (cs.some((c) => c === "yield")) return "minor-yield";
  return n.legs.length >= 3 ? "none" : "bend";
}

function measure(L, b, wantSignals) {
  const types = {};
  const major = L.nodes.filter((n) => n.legs.length >= 3);
  for (const n of major) { const t = typeOfNode(L, n); types[t] = (types[t] ?? 0) + 1; }
  /* The signalled MAJOR crossings: the ones the brief placed. */
  const signals = major.filter((n) => ["signal", "signal-arrow"].includes(typeOfNode(L, n)) && n.legs.every((l) => /^[hv]\d/.test(l.road))).length;
  const arterialKm = L.roads.filter((r) => r.kind === "arterial").reduce((s, r) => s + r.length, 0) / 1000;
  const longest = Math.max(0, ...lines(L).map((x) => x.length));
  const crosswalks = L.roads.reduce((s, r) => s + (r.crosswalk?.start ? 1 : 0) + (r.crosswalk?.end ? 1 : 0), 0);
  const stops = { curb: (L.stops ?? []).filter((s) => s.kind === "curb").length, bay: (L.stops ?? []).filter((s) => s.kind === "bay").length };
  const missing = [];
  if (b.signals != null && signals !== wantSignals) missing.push(`asked for ${wantSignals} signals, got ${signals}`);
  if (b.everyType) for (const t of TYPES) if (!types[t]) missing.push(`no ${NAMES[t]}`);
  if (b.downtown && !crosswalks) missing.push("no crosswalks downtown");
  if (b.buses && !(stops.curb && stops.bay)) missing.push(`bus stops: ${stops.curb} curb, ${stops.bay} bay`);
  return { asked: b, signals, types, arterialKm: Math.round(arterialKm * 10) / 10, longestArterialKm: Math.round(longest / 100) / 10, crosswalks, stops, streets: L.roads.filter((r) => r.kind === "residential").length, missing, warnings: L.warnings.length };
}

/* Straight arterial lines end to end (the long arterial). */
function lines(L) {
  const out = [];
  for (const dir of ["h", "v"]) {
    const groups = {};
    for (const r of L.roads.filter((q) => q.kind === "arterial" && q.id.startsWith(dir))) {
      const k = r.id.split("-")[0].split("#")[0];
      groups[k] = (groups[k] ?? 0) + r.length;
    }
    for (const length of Object.values(groups)) out.push({ length });
  }
  return out;
}

/* ONE SECTION PER THING ASKED FOR, chosen from the map as built. */
function sectionsFor(L, b, report) {
  const roads = Object.fromEntries(L.roads.map((r) => [r.id, r]));
  const out = [];
  /* Into a node along its most major leg that is long enough to drive in on. */
  const startInto = (n) => {
    const legs = n.legs.filter((l) => (roads[l.road]?.length ?? 0) >= 80).sort((p, q) => (RANK[roads[q.road]?.kind] ?? 0) - (RANK[roads[p.road]?.kind] ?? 0));
    return legs[0] ? { road: legs[0].road, end: legs[0].end } : undefined;
  };
  const nodes = L.nodes.filter((n) => n.legs.length >= 3 && n.legs.every((l) => /^[hv]\d/.test(l.road)));
  const seenTypes = new Set();
  for (const n of nodes) {
    const t = typeOfNode(L, n);
    if (seenTypes.has(t) || !NAMES[t]) continue;
    if (!b.everyType && !(t.startsWith("signal") && (b.signals ?? 0) > 0) && seenTypes.size >= 2) continue;
    seenTypes.add(t);
    out.push({ id: t, name: NAMES[t][0].toUpperCase() + NAMES[t].slice(1), look: n.at, start: startInto(n), judge: JUDGE[t] });
  }
  if (b.arterials === "long") {
    const mid = L.roads.filter((r) => r.kind === "arterial" && r.id.startsWith("h"));
    const first = mid.find((r) => r.id.endsWith("-0")) ?? mid[0];
    const centre = mid[Math.floor(mid.length / 2)];
    if (first && centre) out.push({ id: "long-arterial", name: "The long arterial", look: centre.pts[Math.floor(centre.pts.length / 2)], start: { road: first.id, end: "end" }, judge: `${report.longestArterialKm} km of arterial straight across the city: lane changes, keeping right, and the signals along it.` });
  }
  if (b.downtown) {
    const z = L.zones.find((q) => q.kind === "commercial");
    if (z) {
      const c = { x: z.polygon.reduce((s, q) => s + q.x, 0) / z.polygon.length, y: z.polygon.reduce((s, q) => s + q.y, 0) / z.polygon.length };
      const street = L.roads.filter((r) => r.id.startsWith(`${z.id}~`)).sort((p, q) => Math.hypot(p.pts[0].x - c.x, p.pts[0].y - c.y) - Math.hypot(q.pts[0].x - c.x, q.pts[0].y - c.y))[0];
      out.push({ id: "downtown", name: "Downtown", look: c, ...(street ? { start: { road: street.id, end: "end" } } : {}), judge: `Tight blocks, crosswalks at every intersection (${report.crosswalks} crosswalk ends) and people on every sidewalk: who steps off, and does the traffic give way?` });
    }
  }
  if (b.buses) for (const kind of ["curb", "bay"]) {
    const st = (L.stops ?? []).find((s) => s.kind === kind);
    if (!st) continue;
    const r = roads[st.road];
    out.push({ id: `bus-${kind}`, name: kind === "curb" ? "A curb bus stop" : "A bus bay", look: st.at, start: { road: r.id, end: st.dir === "fwd" ? "end" : "start" },
      judge: kind === "curb" ? "A bus stands in the lane at the post; on this broken centre line traffic behind waits or goes round when the oncoming gap allows." : "A bus pulls into the bay; drivers who know the rule let it back out when it signals." });
  }
  if (b.everyType || b.downtown) {
    const mid = L.nodes.find((n) => n.legs.length === 2 && n.legs.every((l) => l.control === "stop"));
    if (mid) out.push({ id: "midblock", name: "A mid-block crossing", look: mid.at, start: startInto(mid), judge: "A stop each way with no side street, only a crosswalk: everybody stops, and waits while somebody is crossing their half." });
  }
  out.push({ id: "whole", name: "The whole map", look: { x: (L.bounds.x + L.bounds.w / 2), y: (L.bounds.y + L.bounds.h / 2) }, judge: report.missing.length ? `Asked for and not got: ${report.missing.join("; ")}.` : "Everything the brief asked for is here." });
  return out;
}
