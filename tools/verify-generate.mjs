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

let failed = 0;
const check = (ok, msg) => { console.log(`  ${ok ? "ok  " : "FAIL:"} ${msg}`); if (!ok) failed++; };
const P = (x, y) => ({ x, y, z: 0 });
const both = (m) => fillZone(fillZone(m, "west").map, "east").map;

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
      const want = r.width / 2 + lot.yard + p.w / 2;
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
  let w = seedGraph(1, 60, lc, { target: 150, posted: true });
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

console.log(`\n${"=".repeat(70)}`);
console.log(failed ? `${failed} FAILURE(S)` : "OK: streets fill a district deterministically, join the roads around it, never dangle or strand, follow the established controls, keep junctions far enough apart for the graph, and a closed map no longer takes the sim down.");
process.exit(failed ? 1 : 0);
