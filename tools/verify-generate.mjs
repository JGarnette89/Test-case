/* =====================================================================
   STAGE 5, FIRST PIECE: STREETS GENERATED INSIDE A DISTRICT
   (src/map/generate.js). Properties any correct version must have:

     1. deterministic, and generating again REPLACES rather than adds;
     2. the result is a street network the sim accepts -- it loads, the
        graph raises no authoring error, and traffic runs on it without
        anybody driving through anybody;
     3. no street dangles: a loose end is the edge of the world to the
        loader, and a spawn point in the middle of a city is a lie;
     4. streets stay in their district, and one that cannot reach a road
        is dropped, not left as an island;
     5. controls follow the established rules: the minor street stops
        where it meets a bigger road, a T's stem stops and its through
        street runs, a crossroads of two local streets is an all-way
        stop -- and no road the maintainer drew has its control changed;
     6. two junctions are never generated closer than the graph can hold,
        and the graph says so, by name, when a person draws them closer
        by hand -- rather than throwing, which it used to;
     7. a map with no open end at all does not take the sim down.
   ===================================================================== */
import { loadMap } from "../src/map/load.js";
import { testCity0 } from "../src/map/samples.js";
import { emptyMap, road } from "../src/map/format.js";
import { fillZone, clearZone, BLOCKS, SNAP, alignWithin, fillLots, clearLots, LOTS } from "../src/map/generate.js";
import { standsOn } from "../src/map/load.js";
import { graphOf } from "../src/sim/graph.js";
import { seedGraph, step, overlapping, districtStreetsOf, districtShare, whatStops, pathOf } from "../src/sim/crossing.js";
import { testMap1 } from "../src/map/samples.js";
import { composeDriver, AXES, WEAK_AXES, WEAK_RANGE, SOUND_RANGE, WEAK_DEVIATION, SOUND_DEVIATION, CONFIDENT_ENOUGH, lackingIn } from "../src/core/driver.js";
import { rng } from "../src/core/rng.js";
import { TOWNS, townOf } from "../src/sim/towns.js";
import { parkingOf, parkedPoses, contactWith, PARK_CLEAR, SLOT } from "../src/sim/parking.js";
import { touching } from "../src/sim/player.js";
import { PARK_W, LANE } from "../src/map/format.js";
import { poseOf } from "../src/sim/crossing.js";
import { TEST_MAPS } from "../src/map/samples.js";
import { carsFor, carsMaxFor, DENSITY } from "../src/map/cars.js";
import { DT } from "../src/sim/traffic.js";
import { playerOn } from "../src/sim/drive.js";
import { poseAt, cornersOf, boxesOverlap } from "../src/sim/intersection.js";
import { CAR } from "../src/sim/traffic.js";
import { CHARACTERS } from "../src/map/format.js";

let failed = 0;
const check = (ok, msg) => { console.log(`  ${ok ? "ok  " : "FAIL:"} ${msg}`); if (!ok) failed++; };
const P = (x, y) => ({ x, y, z: 0 });
const both = (m) => fillZone(fillZone(m, "west").map, "east").map;

console.log("\n0. THE FASTER CONFLICT TABLE IS THE SAME TABLE -- checked before anything drives on it");
{
  /* The scan as it was before its samples were cached and its pairs
     boxed (28 September), restated here from its source, so the new one
     is held to an independent copy rather than to itself. */
  const reference = (a, b, pad) => {
    const step = 0.4, far = Math.hypot(CAR.length, CAR.width) + 2 * pad;
    const opens = (q) => Math.max(0, q.stopAt - 2 * CAR.length), shuts = (q) => Math.min(q.length, q.clearAt + CAR.length);
    let first = null, lastB = -Infinity;
    const bs = [];
    for (let sb = opens(b); sb <= shuts(b); sb += step) bs.push([sb, poseAt(b, sb)]);
    for (let sa = opens(a); sa <= shuts(a); sa += step) {
      const pa = poseAt(a, sa);
      for (const [sb, pb] of bs) {
        if (Math.hypot(pa.x - pb.x, pa.y - pb.y) >= far) continue;
        if (!boxesOverlap(cornersOf(pa, pad), cornersOf(pb, pad))) continue;
        if (first === null || sa < first.a) first = { a: sa, b: sb };
        if (sb > lastB) lastB = sb;
      }
    }
    return first === null ? null : { ...first, clearOf: lastB };
  };
  let pairs = 0, differ = 0;
  for (const t of TEST_MAPS) {
    const g = graphOf(loadMap(t.build()));
    const pad = (3.6 - CAR.width) / 4;   // weaveRoom(lane), as graphOf passes it
    for (const spot of g.at) {
      if (spot.through) continue;
      const P = spot.layout.paths, keys = Object.keys(P);
      for (const ka of keys) for (const kb of keys) {
        if (ka === kb || P[ka].from === P[kb].from) continue;
        pairs++;
        const want = reference(P[ka], P[kb], pad), got = spot.layout.conflicts[`${ka}|${kb}`] ?? null;
        if (JSON.stringify(want) !== JSON.stringify(got)) differ++;
      }
    }
  }
  check(pairs > 5000 && differ === 0, `${pairs} path pairs across both test maps, every entry identical to the scan as it was (${differ} differ)`);
}

console.log("\n1. DETERMINISTIC, AND AGAIN REPLACES");
{
  const base = testCity0();
  const a = both(base), b = both(base);
  check(JSON.stringify(a) === JSON.stringify(b), "the same shapes give the same streets");
  const west = fillZone(base, "west").map;
  check(JSON.stringify(fillZone(west, "west").map) === JSON.stringify(west), "generating a district again with nothing around it changed changes nothing: it replaces, never adds");
  /* Regenerating the west AFTER the east exists is not "nothing changed":
     the east's streets are new junctions on the collector they share,
     and the west lines up with them -- which is the point. What must
     hold is that the result is still a network the sim accepts. */
  const again = fillZone(a, "west").map;
  check(again.roads.filter((r) => r.gen === "west").length > 0 && graphOf(loadMap(again), { conflicts: false }).errors.length === 0, "regenerated after its neighbour, a district lines up with the neighbour's streets and the city still has no authoring error");
  const cleared = clearZone(clearZone(a, "west"), "east");
  check(JSON.stringify(cleared.roads) === JSON.stringify(base.roads), "clearing both districts gives back exactly the blockout");
  const gen = a.roads.filter((r) => r.gen);
  check(gen.length > 40 && gen.every((r) => r.kind === "residential" && (r.gen === "west" || r.gen === "east")), `${gen.length} road pieces, all local streets, each tagged with its district`);
  const denser = fillZone(testCity0(), "west").map, sparser = fillZone({ ...testCity0(), zones: testCity0().zones.map((z) => (z.id === "west" ? { ...z, density: 0.1 } : z)) }, "west").map;
  check(denser.roads.length > sparser.roads.length, `a denser district gets smaller blocks (${denser.roads.length} roads at 0.5, ${sparser.roads.length} at 0.1)`);
}

console.log("\n2. A NETWORK THE SIM ACCEPTS");
const city = both(testCity0());
const L = loadMap(city);
{
  check(L.ok, `the stand-in city loads (${L.nodes.length} intersections, ${L.roads.length} road pieces)`);
  const G = graphOf(L);
  check(G.errors.length === 0, `the graph raises no authoring error (${G.errors.map((e) => e.code).join(", ") || "none"})`);
  let w = seedGraph(1, 60, L, { target: 200, posted: true });
  let over = 0, launchedHeld = 0;
  for (let i = 0; i < 2400; i++) {
    const before = w;
    w = step(w);
    if (i % 10 === 0) over += overlapping(w).length;
    /* HELD BY TRAFFIC, NOBODY LAUNCHES. Measured here, on the open city,
       because this is where it happened: a rolling stopper yielding at an
       arterial T was counted as launched at 2.0 m/s while still held, and
       the oncoming car hit it. The closed city below never produces that
       turn in two minutes, so a check there passed with the fix removed. */
    const was = new Map(before.actors.map((x) => [x.id, x]));
    for (const x of w.actors) { const p = was.get(x.id); if (p && !p.going && x.going && !x.accepted && x.k === p.k && whatStops(p, before).held) launchedHeld++; }
  }
  check(w.actors.length > 150 && over === 0, `two minutes at 200 cars: ${w.actors.length} on the map, ${over} overlaps`);
  check(launchedHeld === 0, `no driver counted as launched while traffic held them (${launchedHeld}) -- the rolling-stop rule`);
}

console.log("\n3. NO STREET DANGLES");
{
  const loose = L.roads.filter((r) => (r.edge?.start || r.edge?.end) && !r.id.startsWith("out-"));
  check(loose.length === 0, `the only open ends are the roads leaving the city (${L.roads.filter((r) => r.edge?.start || r.edge?.end).length}, all out-*)`);
}

console.log("\n4. STREETS STAY IN THEIR DISTRICT; ISLANDS ARE DROPPED");
{
  const inside = (poly, p, pad) => {
    const xs = poly.map((q) => q.x), ys = poly.map((q) => q.y);
    return p.x >= Math.min(...xs) - pad && p.x <= Math.max(...xs) + pad && p.y >= Math.min(...ys) - pad && p.y <= Math.max(...ys) + pad;
  };
  const zones = Object.fromEntries(city.zones.map((z) => [z.id, z]));
  check(city.roads.filter((r) => r.gen).every((r) => r.points.every((p) => inside(zones[r.gen].polygon, p, SNAP))), "every generated point is inside its district, or on the road at its edge");
  const lonely = emptyMap("lonely");
  lonely.roads.push(road({ id: "far", kind: "collector", points: [P(2000, 0), P(2400, 0)] }));
  lonely.zones.push({ id: "z", kind: "residential", density: 0.5, polygon: [P(0, 0), P(500, 0), P(500, 500), P(0, 500)] });
  const r = fillZone(lonely, "z");
  check(r.map.roads.length === 1 && r.report.dropped > 0, `a district with no road near it gets nothing: ${r.report.dropped} streets dropped as an island`);
  const park = fillZone({ ...testCity0(), zones: [{ id: "p", kind: "park", polygon: [P(0, 0), P(700, 0), P(700, 900), P(0, 900)] }] }, "p");
  check(park.map.roads.every((x) => !x.gen) && /not subdivided/.test(park.report.reason) && !BLOCKS.park, "a park is not subdivided, and says so");
}

console.log("\n5. CONTROLS BY THE ESTABLISHED RULES");
{
  const base = testCity0();
  const drawn = Object.fromEntries(base.roads.map((r) => [r.id, r.control]));
  check(city.roads.filter((r) => !r.gen).every((r) => JSON.stringify(r.control) === JSON.stringify(drawn[r.id])), "no road the maintainer drew has its control changed");
  let tees = 0, crosses = 0, bigger = 0, bad = [];
  for (const n of L.nodes) {
    const legs = n.legs;
    const gen = legs.filter((l) => city.roads.find((r) => r.id === l.road.split("#")[0])?.gen);
    const drawnLegs = legs.length - gen.length;
    const stops = legs.filter((l) => l.control === "stop");
    if (drawnLegs > 0 && gen.length > 0) { bigger++; if (!gen.every((l) => l.control === "stop")) bad.push(`${n.id}: a street meets a bigger road without stopping`); }
    if (drawnLegs === 0 && legs.length === 4) { crosses++; if (stops.length !== 4) bad.push(`${n.id}: a local crossroads with ${stops.length} stops`); }
    if (drawnLegs === 0 && legs.length === 3) { tees++; if (stops.length !== 1) bad.push(`${n.id}: a local T with ${stops.length} stops`); }
  }
  check(bad.length === 0 && bigger > 0 && crosses > 0, `${bigger} streets onto a bigger road (stop), ${crosses} local crossroads (all-way), ${tees} local T's (stem stops)${bad.length ? `: ${bad.slice(0, 3).join("; ")}` : ""}`);
}

{
  /* The stand-in's districts are rectangles bounded by roads on every
     side, which makes crossroads and no T's -- so the T rule above could
     pass having never been asked. A district with one edge that has no
     road forces them: streets reaching it are trimmed back to their last
     crossing, and that crossing is a T. */
  const m = emptyMap("open-edge");
  m.roads.push(road({ id: "n", kind: "collector", points: [P(0, 0), P(700, 0)] }), road({ id: "e", kind: "collector", points: [P(700, 0), P(700, 900)] }), road({ id: "s", kind: "collector", points: [P(700, 900), P(0, 900)] }));
  m.zones.push({ id: "z", kind: "residential", density: 0.5, polygon: [P(0, 0), P(700, 0), P(700, 900), P(0, 900)] });
  const g = fillZone(m, "z").map, lo = loadMap(g);
  const genIds = new Set(g.roads.filter((r) => r.gen).map((r) => r.id));
  const tees = lo.nodes.filter((n) => n.legs.length === 3 && n.legs.every((l) => genIds.has(l.road.split("#")[0])));
  check(tees.length > 0 && tees.every((n) => n.legs.filter((l) => l.control === "stop").length === 1) && graphOf(lo, { conflicts: false }).errors.length === 0,
    `a district with an edge that has no road: ${tees.length} local T's, each with exactly its stem stopping, and no authoring error`);
  check(lo.roads.filter((r) => genIds.has(r.id.split("#")[0]) && (r.edge?.start || r.edge?.end)).length === 0, "and the streets that reached the open edge were trimmed back rather than left dangling");
}

console.log("\n6. JUNCTIONS NEVER TOO CLOSE, AND SAID SO WHEN DRAWN THAT WAY");
{
  /* The two districts meet the collector from both sides at different
     block spacings: unaligned, T's land 10 m apart on it. */
  const col = L.roads.filter((r) => r.id.startsWith("col"));
  check(col.every((r) => r.length >= alignWithin(2) / 2) && graphOf(L, { conflicts: false }).errors.every((e) => e.code !== "junctions-too-close"),
    `every piece of the collector between junctions is long enough (shortest ${Math.min(...col.map((r) => r.length)).toFixed(0)} m)`);
  /* Drawn by hand: two T's onto one road, 10 m apart. It used to throw
     inside the graph (a turn whose lane lines never cross); it must be
     an authoring error naming both. */
  const m = emptyMap("jog");
  m.roads.push(road({ id: "main", kind: "collector", points: [P(0, 0), P(400, 0)] }));
  m.roads.push(road({ id: "n", kind: "residential", points: [P(200, -150), P(200, 0)], control: { start: "none", end: "stop" } }));
  m.roads.push(road({ id: "s", kind: "residential", points: [P(210, 150), P(210, 0)], control: { start: "none", end: "stop" } }));
  const lj = loadMap(m);
  let g = null, threw = null;
  try { g = graphOf(lj); } catch (e) { threw = e.message; }
  const close = g?.errors.find((e) => e.code === "junctions-too-close");
  check(!threw && !!close && close.node && close.other, `two T's drawn 10 m apart: no throw, and an authoring error naming both -- "${close?.message ?? threw}"`);
}

console.log("\n7. A MAP WITH NO OPEN END");
{
  const m = emptyMap("closed");
  m.roads.push(road({ id: "a", points: [P(0, 0), P(300, 0)] }), road({ id: "b", points: [P(300, 0), P(300, 300)] }), road({ id: "c", points: [P(300, 300), P(0, 300)] }), road({ id: "d", points: [P(0, 300), P(0, 0)] }));
  const lc = loadMap(m);
  let w = null, threw = null;
  try { w = seedGraph(1, 50, lc, { target: 50, posted: true }); for (let i = 0; i < 200; i++) w = step(w); } catch (e) { threw = e.message; }
  check(!threw && w.actors.length === 0, `a closed square of roads: no throw, and nobody arrives, since there is nowhere to arrive from (${threw ?? `${w.actors.length} cars`})`);
}

console.log("\n8. BUILDINGS ALONG THE FRONTAGES");
{
  let m = city;
  const reports = {};
  for (const z of ["west", "east"]) { const r = fillLots(m, z); m = r.map; reports[z] = r.report; }
  const gen = m.props.filter((p) => p.gen);
  const lm = loadMap(m);
  check(gen.length > 300 && lm.props.length === m.props.length && !lm.warnings.some((w) => w.code === "prop-on-road"),
    `${gen.length} buildings (${reports.west.buildings} houses, ${reports.east.buildings} shops), and the loader keeps every one: the generator asks the loader's own off-the-road test`);
  const foot = lm.props.map((p) => ({ at: p.at, heading: p.heading, l: p.l, w: p.w }));
  const corners = (f) => { const t = (f.heading * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t); return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => ({ x: f.at.x + (u * f.l / 2) * c - (v * f.w / 2) * s, y: f.at.y + (u * f.l / 2) * s + (v * f.w / 2) * c })); };
  const sep = (A, B) => { for (const poly of [A, B]) for (let i = 0; i < 4; i++) { const p = poly[i], q = poly[(i + 1) % 4], n = { x: q.y - p.y, y: p.x - q.x }; const pa = A.map((v) => v.x * n.x + v.y * n.y), pb = B.map((v) => v.x * n.x + v.y * n.y); if (Math.max(...pa) <= Math.min(...pb) + 1e-6 || Math.max(...pb) <= Math.min(...pa) + 1e-6) return true; } return false; };
  let hits = 0; const cs = foot.map(corners);
  for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) if (Math.hypot(foot[i].at.x - foot[j].at.x, foot[i].at.y - foot[j].at.y) < 60 && !sep(cs[i], cs[j])) hits++;
  check(hits === 0, `no two buildings overlap (${hits} pairs)`);
  const zones = Object.fromEntries(m.zones.map((z) => [z.id, z]));
  const kinds = gen.every((p) => p.kind === LOTS[zones[p.gen].kind].kind);
  check(kinds, "houses in the residential district, shops in the commercial one");
  /* FACING ITS STREET: the long side runs along a road it stands exactly
     a front yard back from. Not "the nearest road" -- a corner house can
     be nearer the cross street, and a house backing onto an arterial
     nearer the arterial, and both are right. */
  let facing = 0;
  const zoneOfId = Object.fromEntries(gen.map((p) => [p.id, p.gen]));
  for (const p of lm.props.filter((q) => zoneOfId[q.id])) {
    const lot = LOTS[zones[zoneOfId[p.id]].kind];
    const fronts = lm.roads.some((r) => {
      if (lot.backs.includes(r.kind)) return false;
      const want = (r.outer ?? r.width) / 2 + lot.yard + p.w / 2;   // from the drawn edge: behind the parking strip where there is one
      for (let i = 0; i + 1 < r.pts.length; i++) {
        const a = r.pts[i], b = r.pts[i + 1], L2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
        const f = Math.max(0, Math.min(1, ((p.at.x - a.x) * (b.x - a.x) + (p.at.y - a.y) * (b.y - a.y)) / L2));
        const d = Math.hypot(p.at.x - a.x - (b.x - a.x) * f, p.at.y - a.y - (b.y - a.y) * f);
        const h = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI, diff = Math.abs(((p.heading - h) % 180 + 540) % 180);
        if (Math.abs(d - want) < 0.5 && Math.min(diff, 180 - diff) < 1) return true;
      }
      return false;
    });
    if (fronts) facing++;
  }
  check(facing === gen.length, `every building faces a street it fronts, a front yard back from it (${facing} of ${gen.length})`);
  const noHouseOnArterial = lm.props.filter((p) => p.kind === "house").every((p) => !lm.roads.filter((r) => r.kind === "arterial").some((r) => standsOn({ ...p, l: p.l, w: p.w + 2 * (LOTS.residential.yard + 1) }, r)));
  check(noHouseOnArterial, "no house fronts an arterial -- a residential lot backs onto one");
  const once = fillLots(city, "west").map;
  check(JSON.stringify(fillLots(once, "west").map) === JSON.stringify(once) && JSON.stringify(clearLots(clearLots(m, "west"), "east").props) === JSON.stringify(city.props ?? []),
    "placing a district's buildings again with nothing around it changed changes nothing, and clearing gives back exactly what was there");
  let w = seedGraph(1, 60, lm, { target: 200, posted: true }), over = 0;
  for (let i = 0; i < 1200; i++) { w = step(w); if (i % 10 === 0) over += overlapping(w).length; }
  check(over === 0 && w.actors.length > 150, `and the city with its buildings still drives: a minute at 200 cars, ${over} overlaps`);
}

console.log("\n9. TRAFFIC FROM INSIDE THE CITY: PULLING OUT, PULLING IN");
{
  /* The stand-in city with its roads out of town removed: a closed
     network, so every car on it has to come from its districts. */
  const closed = { ...city, roads: city.roads.filter((r) => !r.id.startsWith("out-")) };
  const lc = loadMap(closed);
  /* Seeded at 100 and asked for 150 on the clock, so there are fifty
     pull-outs to watch: the warm-up now fills a world before its first
     frame, and one seeded at 150 opened full and offered only the
     turnover (28 on this seed). */
  let w = { ...seedGraph(1, 60, lc, { target: 100, posted: true }), target: 150 };
  check(districtStreetsOf(w.course).length > 50 && districtShare(w.course) === 1, `a closed city: ${districtStreetsOf(w.course).length} curb lanes on district streets, and every arrival comes from them`);
  let over = 0, appeared = 0, badAppear = 0, pulledIn = 0, vanishedMoving = 0, launchedHeld = 0;
  let prev = new Map(w.actors.map((a) => [a.id, a]));
  for (let i = 0; i < 2400; i++) {
    const before = w;
    w = step(w);
    const now = new Map(w.actors.map((a) => [a.id, a]));
    for (const [id, a] of now) {
      if (!prev.has(id)) { appeared++; if (!(a.fromCurb && a.v === 0)) badAppear++; }
      const was = prev.get(id);
      /* The rule the fix restored: held by traffic, nobody launches. */
      if (was && !was.going && a.going && !a.accepted && whatStops(was, before).held) launchedHeld++;
    }
    /* Read on the last tick it was seen, one tick BEFORE it went: the sim
       removes a car in the tick its speed falls under 0.3 m/s, so the last
       state seen is still settling. Within a metre a second of rest, and
       at the spot it chose, is "pulled in"; anything else is vanishing. */
    for (const [id, a] of prev) if (!now.has(id)) { if (a.leaveAt != null && a.v < 1 && Math.abs(a.s - a.leaveAt) < 8) pulledIn++; else vanishedMoving++; }
    if (i % 10 === 0) over += overlapping(w).length;
    prev = now;
  }
  check(w.actors.length > 120, `the closed city fills with traffic: ${w.actors.length} cars after two minutes (asked for 150)`);
  check(appeared > 50 && badAppear === 0, `${appeared} cars pulled out, every one from the curb and from rest`);
  check(pulledIn > 20 && vanishedMoving === 0, `${pulledIn} pulled in at the end of their trip, every one at rest where it meant to stop -- none vanished moving`);
  check(over === 0, `and nobody drove through anybody (${over} overlaps)`);

  /* A map with no districts is untouched by any of it. */
  const t1 = seedGraph(1, 50, loadMap(testMap1()), { target: 60, posted: true });
  check(districtStreetsOf(t1.course).length === 0 && districtShare(t1.course) === 0, "the test map has no districts, so nobody pulls out or in there");
}

console.log("\n10. A DISTRICT'S CHARACTER: WHO DRIVES THERE");
{
  /* The draw before towns existed, re-implemented here from its own
     description rather than imported, so "an ordinary place is unchanged"
     is checked against an independent statement of the old rule. */
  const oldDraw = (seed) => {
    const r = rng(seed), bag = [...AXES], weak = new Set();
    const n = WEAK_AXES[0] + Math.floor(r() * (WEAK_AXES[1] - WEAK_AXES[0] + 1));
    for (let i = 0; i < n && bag.length; i++) weak.add(bag.splice(Math.floor(r() * bag.length) % bag.length, 1)[0]);
    const span = ([lo, hi]) => lo + r() * (hi - lo), ratings = {};
    for (const a of AXES) {
      if (a === "confidence") { const side = r() < 0.5 ? -1 : 1; const dev = span(weak.has(a) ? WEAK_DEVIATION : SOUND_DEVIATION); const half = side < 0 ? CONFIDENT_ENOUGH : 1 - CONFIDENT_ENOUGH; ratings[a] = Math.max(0, Math.min(1, CONFIDENT_ENOUGH + side * dev * half)); }
      else ratings[a] = Math.max(0, Math.min(1, span(weak.has(a) ? WEAK_RANGE : SOUND_RANGE)));
    }
    return ratings;
  };
  let same = 0;
  for (let seed = 1; seed <= 2000; seed++) if (JSON.stringify(composeDriver(seed).ratings) === JSON.stringify(oldDraw(seed)) && JSON.stringify(composeDriver(seed, townOf("ordinary")).ratings) === JSON.stringify(oldDraw(seed))) same++;
  check(same === 2000, `an ordinary place draws exactly the drivers it always did (${same} of 2000 identical to the old rule)`);

  const target = { tailgaters: "confidence", "rolling-stops": "knowledge", wanderers: "steering", "late-brakers": "braking", hesitant: "confidence" };
  const shareWeak = (town, axis) => { let k = 0; for (let s = 1; s <= 2000; s++) if (composeDriver(s * 31 + 7, town).weakOn.includes(axis)) k++; return k / 2000; };
  const rows = Object.entries(target).map(([c, axis]) => ({ c, axis, here: shareWeak(townOf(c), axis), ordinary: shareWeak(null, axis) }));
  check(rows.every((r) => r.here >= 0.6 && r.ordinary < 0.45) && CHARACTERS.every((c) => c in TOWNS),
    `each character makes its axis the weak one for most of its people: ${rows.map((r) => `${r.c} ${Math.round(r.here * 100)}% (ordinary ${Math.round(r.ordinary * 100)}%)`).join(", ")}`);
  const sideOf = (town) => { let bold = 0, weak = 0; for (let s = 1; s <= 2000; s++) { const d = composeDriver(s * 17 + 3, town); if (d.weakOn.includes("confidence")) { weak++; if (d.ratings.confidence > CONFIDENT_ENOUGH) bold++; } } return bold / weak; };
  const tg = sideOf(townOf("tailgaters")), hs = sideOf(townOf("hesitant"));
  check(tg > 0.8 && hs < 0.2, `tailgaters are bold (${Math.round(tg * 100)}% of the weak-confidence drivers on the bold side), the hesitant timid (${Math.round(hs * 100)}%)`);

  /* And it reaches the road: the closed stand-in city with a rolling-stop
     neighbourhood to the west and a tailgating one to the east. Measured
     on the dispositions the sim acts on -- who rolls stops, what gap they
     keep -- for the cars that pulled out of each. */
  const closed = { ...city, roads: city.roads.filter((r) => !r.id.startsWith("out-")), zones: city.zones.map((z) => ({ ...z, character: z.id === "west" ? "rolling-stops" : "tailgaters" })) };
  let w = seedGraph(2, 60, loadMap(closed), { target: 150, posted: true });
  const seen = new Map();
  for (let i = 0; i < 2400; i++) { w = step(w); for (const a of w.actors) if (a.home && !seen.has(a.id)) seen.set(a.id, a); }
  const from = (z) => [...seen.values()].filter((a) => a.home === z);
  const W = from("west"), E = from("east");
  const rolls = (xs) => xs.filter((a) => a.rollsStops).length / Math.max(1, xs.length);
  const gap = (xs) => xs.reduce((s, a) => s + a.headway, 0) / Math.max(1, xs.length);
  check(W.length > 20 && E.length > 20 && rolls(W) > 2 * rolls(E), `people from the rolling-stop west roll their stops: ${Math.round(rolls(W) * 100)}% of ${W.length}, against ${Math.round(rolls(E) * 100)}% of ${E.length} from the east`);
  check(gap(E) < 0.85 * gap(W), `people from the tailgating east follow closer: mean headway ${gap(E).toFixed(2)} s against ${gap(W).toFixed(2)} s from the west`);

  const bad = loadMap({ ...testCity0(), zones: [{ id: "z", kind: "residential", polygon: [P(0, 0), P(100, 0), P(100, 100)], character: "polite" }] });
  check(bad.zones[0].character === "ordinary" && bad.warnings.some((x) => x.code === "unknown-character"), "a character the model does not know is warned and treated as ordinary");
}

console.log("\n11. THE NEIGHBOUR INDEX CHANGES NOTHING BUT THE COST");
{
  /* Each car asks only the cars at its own intersection and the ones
     joined to it (crossing.js `nearNode`). The rules say nobody else can
     matter; this holds them to it: the same world stepped with the index
     and without, from the same state, must stay identical, tick for tick,
     on the city and on the test map (signals, bays, a five-way, an
     overpass). */
  const same = (loaded, cars, ticks) => {
    const w0 = seedGraph(3, 60, loaded, { target: cars, posted: true });
    let a = w0, b = { ...w0, noIndex: true };
    for (let i = 0; i < ticks; i++) {
      a = step(a); b = step(b);
      if (JSON.stringify(a.actors) !== JSON.stringify(b.actors)) return { ok: false, at: i, cars: a.actors.length };
    }
    return { ok: true, cars: a.actors.length };
  };
  const c = same(L, 250, 1200), t = same(loadMap(testMap1()), 150, 1200);
  check(c.ok && t.ok, `a minute of the city at ${c.cars} cars and of the test map at ${t.cars}: identical with the index and without${c.ok && t.ok ? "" : ` -- diverged at tick ${c.ok ? t.at : c.at}`}`);
  const time = (loaded, cars, noIndex) => { let w = { ...seedGraph(3, 60, loaded, { target: cars, posted: true }), noIndex }; const t0 = performance.now(); for (let i = 0; i < 200; i++) w = step(w); return (performance.now() - t0) / 200; };
  const slow = time(L, 300, true), fast = time(L, 300, false);
  check(fast < slow / 3, `and it is what makes a city affordable: ${fast.toFixed(2)} ms a step at 300 cars against ${slow.toFixed(2)} ms scanning everybody`);
}

console.log("\n12. PARKED CARS: A STRIP, SLOTS, AND THE SAME PEOPLE ALL DAY");
{
  let m = city;
  for (const z of ["west", "east"]) m = fillLots(m, z).map;
  const closed = { ...m, roads: m.roads.filter((r) => !r.id.startsWith("out-")) };
  const lc = loadMap(closed);
  let w = seedGraph(4, 60, lc, { target: 120, posted: true });
  const P0 = parkingOf(w.course);
  const lanes = w.course.lanes;
  /* Where the slots are: beside the curb lane, on the drawn surface, off
     every lane, clear of both ends. */
  const off = (sl) => { const L = lanes[sl.lane]; let best = Infinity; for (let i = 0; i + 1 < L.pts.length; i++) { const a = L.pts[i], b = L.pts[i + 1], L2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2, f = Math.max(0, Math.min(1, ((sl.x - a.x) * (b.x - a.x) + (sl.y - a.y) * (b.y - a.y)) / L2)); best = Math.min(best, Math.hypot(sl.x - a.x - (b.x - a.x) * f, sl.y - a.y - (b.y - a.y) * f)); } return best; };
  const want = LANE / 2 + PARK_W / 2;
  check(P0.slots.length > 200 && P0.slots.every((sl) => Math.abs(off(sl) - want) < 0.3) && P0.slots.every((sl) => sl.along >= PARK_CLEAR && sl.along <= lanes[sl.lane].length - PARK_CLEAR),
    `${P0.slots.length} slots, every one ${want.toFixed(1)} m out from its curb lane's centre -- in the strip, off the lane -- and ${PARK_CLEAR} m clear of each end`);
  const box = (f, l, wd) => { const t = (f.heading * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t); return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => ({ x: f.x + (u * l / 2) * c - (v * wd / 2) * s, y: f.y + (u * l / 2) * s + (v * wd / 2) * c })); };
  const sep = (A, B) => { for (const poly of [A, B]) for (let i = 0; i < 4; i++) { const p = poly[i], q = poly[(i + 1) % 4], n = { x: q.y - p.y, y: p.x - q.x }; const pa = A.map((v) => v.x * n.x + v.y * n.y), pb = B.map((v) => v.x * n.x + v.y * n.y); if (Math.max(...pa) <= Math.min(...pb) || Math.max(...pb) <= Math.min(...pa)) return true; } return false; };
  let onBuilding = 0;
  for (const sl of P0.slots) for (const b of lc.props) if (Math.hypot(b.at.x - sl.x, b.at.y - sl.y) < 40 && !sep(box(sl, SLOT, PARK_W), box({ x: b.at.x, y: b.at.y, heading: b.heading }, b.l, b.w))) onBuilding++;
  check(onBuilding === 0, `and no building stands on one (${onBuilding})`);

  /* The closed city for two minutes: the same people all day. */
  const people = (x) => x.actors.length + Object.keys(x.parked ?? {}).length;
  const start = people(w);
  let drift = 0, into = 0, outOf = 0, intoTaken = 0, outOfEmpty = 0, over = 0;
  for (let i = 0; i < 2400; i++) {
    const before = w;
    w = step(w);
    if (people(w) !== start) drift++;
    const ids = new Set(w.actors.map((a) => a.id));
    for (const a of before.actors) if (!ids.has(a.id) && a.parkSlot) { into++; if (before.parked?.[a.parkSlot]) intoTaken++; }
    for (const a of w.actors) if (a.fromSlot && !before.actors.some((b) => b.id === a.id)) { outOf++; if (!before.parked?.[a.fromSlot] || w.parked?.[a.fromSlot]) outOfEmpty++; }
    if (i % 10 === 0) {
      const parked = parkedPoses(w.course, w.parked);
      for (const a of w.actors) { const p = poseOf(w, a); const me = { x: p.x, y: p.y, z: p.z ?? 0, heading: p.rot }; if (parked.some((q) => Math.abs(q.x - me.x) < 8 && Math.abs(q.y - me.y) < 8 && touching(me, q))) over++; }
    }
  }
  check(drift === 0, `cars driving plus cars parked stays ${start} for two minutes on a closed city (${drift} ticks it did not)`);
  check(into > 20 && intoTaken === 0, `${into} cars pulled into a slot, every one free when they took it`);
  check(outOf > 20 && outOfEmpty === 0, `${outOf} pulled out of a slot, every one full before and empty after`);
  check(over === 0, `and no moving car ever touched a parked one (${over})`);

  /* A map with parking and no districts: the parked cars sit there and the
     traffic is exactly what it was without them. */
  const t1 = loadMap(testMap1());
  let a = seedGraph(1, 50, t1, { target: 80, posted: true }), b = { ...a, parked: undefined };
  let same = true;
  for (let i = 0; i < 1200 && same; i++) { a = step(a); b = step(b); same = JSON.stringify(a.actors) === JSON.stringify(b.actors); }
  check(same && Object.keys(a.parked ?? {}).length > 0, `on the test map (${Object.keys(a.parked ?? {}).length} parked, no districts) the traffic is identical with the parked cars and without`);

  /* The player can hit one; the lane beside it is clear. */
  const sl = parkedPoses(w.course, w.parked)[0], L = lanes[P0.byKey.get(sl.id.slice("parked-".length)).lane];
  const onIt = { x: sl.x, y: sl.y, z: sl.z, heading: sl.heading };
  const inLane = (() => { let best = null, bd = Infinity; for (const q of L.pts) { const d = Math.hypot(q.x - sl.x, q.y - sl.y); if (d < bd) { bd = d; best = q; } } return { x: best.x, y: best.y, z: best.z ?? 0, heading: sl.heading }; })();
  check(!!contactWith(w.course, w.parked, onIt, touching) && !contactWith(w.course, w.parked, inLane, touching), "a car on a parked car's spot touches it; a car in the lane beside it does not");
}

console.log("\n13. THE TEST MAPS: EVERY SECTION OPENS, TO WATCH AND TO DRIVE");
{
  /* The Test maps screen only lists; what a tap does is #/map's scene on
     the chosen section, which no SSR render reaches (CLAUDE.md item 4). So
     every section is opened here the way the screen opens it: the map
     built and loaded, the section found by id among the loaded ones for
     Watch, and for Drive a world seeded and a player put on its start. */
  let sections = 0, drives = 0, bad = [];
  for (const t of TEST_MAPS) {
    const lm = loadMap(t.build());
    if (!lm.ok) { bad.push(`${t.id}: does not load`); continue; }
    const w = seedGraph(1, 50, lm, { every: 2, target: 40, posted: true });
    const b = lm.roads.flatMap((r) => r.pts);
    const [x0, x1, y0, y1] = [Math.min(...b.map((q) => q.x)), Math.max(...b.map((q) => q.x)), Math.min(...b.map((q) => q.y)), Math.max(...b.map((q) => q.y))];
    for (const sec of lm.sections) {
      sections++;
      if (!(sec.look.x >= x0 && sec.look.x <= x1 && sec.look.y >= y0 && sec.look.y <= y1)) bad.push(`${t.id}/${sec.id}: looks at nothing on the map`);
      if (!sec.judge) bad.push(`${t.id}/${sec.id}: says nothing to judge`);
      if (sec.start) { drives++; if (!playerOn(w.course, sec.start.road, sec.start.end, { through: !!sec.start.through })) bad.push(`${t.id}/${sec.id}: its start cannot be driven from`); }
    }
    if (lm.warnings.some((x) => x.code.startsWith("section"))) bad.push(`${t.id}: a section was dropped or lost its start`);
  }
  check(bad.length === 0 && sections >= 10 && drives >= 4, `${TEST_MAPS.length} test maps, ${sections} sections, every one somewhere on its map with something to judge, and all ${drives} starts drivable${bad.length ? `: ${bad.join("; ")}` : ""}`);
  const t1 = loadMap(TEST_MAPS.find((t) => t.id === "test-1").build());
  check(["crossroads", "tee", "fiveway", "arterial", "overpass", "hill"].every((id) => t1.sections.some((q) => q.id === id)), "test map 1 carries the six places #/map used to hard-code, under the same names");
}

console.log("\n15. HOW MANY CARS A MAP GETS: ITS OWN ROAD, AT ONE DENSITY");
{
  /* The maintainer found the city nearly empty: 120 moving cars, the count
     chosen for test map 1, over 2.5 times the road. */
  const t1 = loadMap(TEST_MAPS.find((t) => t.id === "test-1").build());
  const cy = loadMap(TEST_MAPS.find((t) => t.id === "city").build());
  check(carsFor(t1) === 120, `test map 1 keeps the 120 it always had (${t1.laneKm.toFixed(1)} lane-km)`);
  const per = (l) => carsFor(l) / l.laneKm;
  check(carsFor(cy) >= 280 && Math.abs(per(cy) - per(t1)) / per(t1) < 0.05, `the city gets ${carsFor(cy)} over its ${cy.laneKm.toFixed(1)} lane-km -- the same density, ${per(cy).toFixed(1)} against ${per(t1).toFixed(1)} per lane-km`);
  check(carsMaxFor(cy) > carsFor(cy) && carsMaxFor(t1) >= 300, `and the dial goes above the default on both (city up to ${carsMaxFor(cy)}, test map 1 up to ${carsMaxFor(t1)})`);
  /* Asking is not getting: the city has to actually fill to it. */
  let w = seedGraph(1, 50, cy, { every: 2, target: carsFor(cy), posted: true });
  let low = Infinity;
  for (let i = 0; i < 60 / DT; i++) { w = step(w); if (i > 20 / DT) low = Math.min(low, w.actors.length); }
  check(low >= 0.95 * carsFor(cy), `and it fills: after twenty seconds the city never has fewer than ${low} moving cars of ${carsFor(cy)}`);
}

console.log(`\n${"=".repeat(70)}`);
console.log(failed ? `${failed} FAILURE(S)` : "OK: streets fill a district deterministically, join the roads around it, never dangle or strand, follow the established controls, keep junctions far enough apart for the graph, and a closed map no longer takes the sim down.");
process.exit(failed ? 1 : 0);
