/* =====================================================================
   THE SIM ON A ROAD NETWORK: the rules unchanged, their coordinates
   not.

   SIMULATOR.md 2.4. The compass intersection had four legs at N/E/S/W;
   a map has nodes at any bearings with any number of legs. The claim
   is that crossing.js keeps every rule -- path conflict, the right-hand
   rule, left yields to oncoming, gap acceptance, following across a
   seam -- and only asks the layout what "on my right" and "oncoming"
   mean. So the first thing checked is EQUIVALENCE: the bearing rules
   asked of the compass layout must give the table's answers, and a
   crossroads built from four map strokes must be the compass
   crossroads -- the same paths, the same conflict table, to the metre.
   Then the shapes the compass could never express: a T, a skewed
   five-way, a loop through nodes joined by a bend and a hill, an
   overpass -- with traffic run through them and nobody driving through
   anybody.
   ===================================================================== */
import { layoutFor, rightOf, OPPOSITE, SIDES, INTENTS, exitFor } from "../src/sim/intersection.js";
import { onRightOf, oncoming, intentOf, graphOf, laneSpanOnGraph, laneForTurn, postedAt, ONCOMING_TOL } from "../src/sim/graph.js";
import { seedGraph, step, overlapping, delayed, poseOf, edgesOf } from "../src/sim/crossing.js";
import { laneSpan } from "../src/sim/course.js";
import { CAR, DT } from "../src/sim/traffic.js";
import { loadMap } from "../src/map/load.js";
import { emptyMap, road, stage0Map } from "../src/map/format.js";
import { testMap1 } from "../src/map/samples.js";
import { poseAt } from "../src/sim/intersection.js";

let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? " ok " : "FAIL"} ${msg}`); if (!ok) failed++; };
const line = (a, b, n = 30) => Array.from({ length: n + 1 }, (_, i) => ({ x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n, z: 0 }));
const crossroads = (reach = 300, lanes = 1) => {
  const m = emptyMap("x");
  const c = { x: 500, y: 500 };
  m.roads.push(road({ id: "N", lanes, points: line({ x: c.x, y: c.y - reach }, c) }));
  m.roads.push(road({ id: "S", lanes, points: line({ x: c.x, y: c.y + reach }, c) }));
  m.roads.push(road({ id: "E", lanes, points: line({ x: c.x + reach, y: c.y }, c) }));
  m.roads.push(road({ id: "W", lanes, points: line({ x: c.x - reach, y: c.y }, c) }));
  return loadMap(m);
};
const runFor = (w, seconds, hook) => { let overlaps = 0; for (let i = 0; i < seconds * 20; i++) { w = step(w); overlaps += overlapping(w).length; if (hook) hook(w); } return { w, overlaps }; };

/* 1. The bearing rules, asked of the compass layout, give the table's answers. */
{
  const lay = layoutFor({ reach: 60 });
  let same = 0, total = 0, intents = 0;
  for (const a of SIDES) for (const b of SIDES) {
    if (a === b) continue;
    total++;
    if (onRightOf(lay, a, b) === (rightOf(a) === b) && oncoming(lay, a, b) === (OPPOSITE[a] === b)) same++;
  }
  for (const a of SIDES) for (const i of INTENTS) if (intentOf(lay, a, exitFor(a, i)) === i) intents++;
  check(same === total, `on-my-right and oncoming, in bearings, agree with the compass table on every pair (${same} of ${total})`);
  check(intents === SIDES.length * INTENTS.length, `and a turn's kind derived from bearings agrees with the intent the compass named it by (${intents} of ${SIDES.length * INTENTS.length})`);
  check(lay.legs && lay.routesFrom("N").join(",") === "N/straight,N/right,N/left", "the compass layout carries legs and offers routes in INTENTS order, so the old draws are the old draws");
}

/* 2. EQUIVALENCE: a crossroads from four map strokes IS the compass crossroads. */
{
  const reach = 300;
  const compass = layoutFor({ reach });
  const map = crossroads(reach);
  const g = graphOf(map);
  const lay = g.at[0].layout;
  const legOf = { N: "N|end#0", S: "S|end#0", E: "E|end#0", W: "W|end#0" };
  const routeOf = (r) => { const [from, intent] = r.split("/"); return `${legOf[from]}/${legOf[exitFor(from, intent)]}`; };
  check(Object.keys(lay.paths).length === 12 && Object.keys(lay.legs).length === 4, `the map crossroads has four legs and twelve paths`);
  let worstLen = 0, worstStop = 0, worstClear = 0;
  for (const r of Object.keys(compass.paths)) {
    const a = compass.paths[r], b = lay.paths[routeOf(r)];
    worstLen = Math.max(worstLen, Math.abs(a.length - b.length));
    worstStop = Math.max(worstStop, Math.abs(a.stopAt - b.stopAt));
    worstClear = Math.max(worstClear, Math.abs(a.clearAt - b.clearAt));
    if (a.intent !== b.intent) worstLen = Infinity;
  }
  check(worstLen < 0.05 && worstStop < 0.05 && worstClear < 0.5, `every path has its compass twin's length, stop line and box exit (worst ${worstLen.toFixed(3)} / ${worstStop.toFixed(3)} / ${worstClear.toFixed(3)} m)`);
  const cKeys = Object.keys(compass.conflicts).map((k) => k.split("|").map(routeOf).join("|")).sort();
  const gKeys = Object.keys(lay.conflicts).sort();
  const missing = cKeys.filter((k) => !gKeys.includes(k)), extra = gKeys.filter((k) => !cKeys.includes(k));
  check(missing.length === 0 && extra.length === 0, `the conflict table is the compass table, pair for pair (${gKeys.length} conflicts; ${missing.length} missing, ${extra.length} extra)`);
  let worstA = 0, worstC = 0;
  for (const k of Object.keys(compass.conflicts)) {
    const a = compass.conflicts[k], b = lay.conflicts[k.split("|").map(routeOf).join("|")];
    if (!b) continue;
    worstA = Math.max(worstA, Math.abs(a.a - b.a)); worstC = Math.max(worstC, Math.abs(a.clearOf - b.clearOf));
  }
  check(worstA < 0.5 && worstC < 0.5, `and each conflict begins and clears where the compass says, within half a metre (worst ${worstA.toFixed(2)} / ${worstC.toFixed(2)} m)`);
}

/* 3. Traffic through the map crossroads: an all-way and a two-way stop, four minutes each, nobody through anybody. */
{
  const map = crossroads(300);
  const all = runFor(seedGraph(3, 50, map, { control: { "*": "stop" } }), 240);
  check(all.overlaps === 0 && all.w.spawned > 200, `all-way stop on a map crossroads, four minutes: ${all.w.spawned} cars, ${all.overlaps} overlapping car-ticks`);
  const two = runFor(seedGraph(5, 50, map, { control: { "N|end": "stop", "S|end": "stop", "E|end": "none", "W|end": "none" } }), 240);
  /* Control overrides are by road end; every lane of the leg takes it. */
  check(Object.values(two.w.course.at[0].layout.legs).every((l) => l.control === (l.base.startsWith("N|") || l.base.startsWith("S|") ? "stop" : "none")), "a control override by road end applies to every lane of that end");
  check(two.overlaps === 0 && two.w.spawned > 200, `two-way stop, four minutes: ${two.w.spawned} cars, ${two.overlaps} overlapping car-ticks`);
  /* THE THROUGH ROAD RUNS UNINTERRUPTED: cars going straight on it are
     almost never at rest at their line, where the stopping legs' cars
     always are. (A left-turner on the through road does wait, for the
     oncoming traffic, which is the law and not a stop sign.) */
  let throughRest = 0, minorRest = 0;
  runFor(two.w, 120, (w) => {
    for (const a of w.actors) {
      const p = w.course.at[a.k].layout.paths[a.route];
      const atLine = Math.abs(a.s - (p.stopAt - CAR.length / 2)) < 2.5 && a.v < 0.3;   // a car comes to rest up to AT_LINE short of the line
      if (!atLine) continue;
      if (a.route.startsWith("N|") || a.route.startsWith("S|")) minorRest++;
      else if (p.intent === "straight") throughRest++;
    }
  });
  check(minorRest > 200 && throughRest < minorRest * 0.05, `the stopping legs' cars rest at their line (${minorRest} car-ticks in two minutes); straight-through cars on the through road almost never do (${throughRest})`);
}

/* 4. A T and a skewed five-way: shapes the compass could not express. */
{
  const m = emptyMap("t");
  m.roads.push(road({ id: "main", lanes: 1, points: line({ x: 0, y: 300 }, { x: 600, y: 300 }, 60) }));
  m.roads.push(road({ id: "side", lanes: 1, points: line({ x: 300, y: 600 }, { x: 300, y: 300 }), control: { start: "none", end: "stop" } }));
  const t = loadMap(m);
  const g = graphOf(t);
  const node = g.at.find((s) => !s.through);
  const ids = Object.keys(node.layout.legs);
  check(ids.length === 3 && Object.keys(node.layout.paths).length === 6, `a T has three legs and six paths (${ids.length}, ${Object.keys(node.layout.paths).length})`);
  const side = ids.find((i) => i.startsWith("side"));
  const [l, r] = ids.filter((i) => i !== side);
  check(oncoming(node.layout, l, r) && !oncoming(node.layout, side, l) && !oncoming(node.layout, side, r), "the two halves of the through road are oncoming to each other and the side road is oncoming to neither");
  const rt = runFor(seedGraph(9, 50, t), 240);
  check(rt.overlaps === 0 && rt.w.spawned > 150, `four minutes at the T: ${rt.w.spawned} cars, ${rt.overlaps} overlapping car-ticks`);

  const five = emptyMap("five");
  const c = { x: 600, y: 600 };
  for (const [id, deg] of [["a", 0], ["b", 45], ["c", 135], ["d", 180], ["e", 270]]) {
    const far = { x: c.x + 300 * Math.cos((deg * Math.PI) / 180), y: c.y + 300 * Math.sin((deg * Math.PI) / 180) };
    five.roads.push(road({ id, lanes: 1, points: line(far, c), control: { start: "none", end: "stop" } }));
  }
  const f = loadMap(five);
  const gf = graphOf(f);
  const nf = gf.at.find((s) => !s.through).layout;
  const legs = Object.keys(nf.legs);
  check(legs.length === 5 && Object.keys(nf.paths).length === 20, `a five-way has five legs and twenty paths (${legs.length}, ${Object.keys(nf.paths).length})`);
  let total = 0, decided = 0, opposite = 0;
  for (const a of legs) for (const b of legs) {
    if (a >= b) continue;
    total++;
    if (oncoming(nf, a, b)) { opposite++; continue; }
    if (onRightOf(nf, a, b) !== onRightOf(nf, b, a)) decided++;
  }
  check(decided + opposite === total && opposite === 1, `every pair of legs is settled: ${decided} by the right-hand rule, ${opposite} oncoming (only 0/180 is within ${ONCOMING_TOL} degrees of straight across; 45 and 135 face 270 at 135 degrees)`);
  const kinds = Object.values(nf.paths).map((p) => p.intent);
  check(kinds.includes("left") && kinds.includes("right") && kinds.includes("straight"), "its turns are lefts, rights and straights by the angle turned");
  const rf = runFor(seedGraph(13, 40, f), 240);
  check(rf.overlaps === 0 && rf.w.spawned > 150, `four minutes at the five-way, all-way stop: ${rf.w.spawned} cars, ${rf.overlaps} overlapping car-ticks`);
}

/* 4b. LANES. Two lanes each way: a lane is its own polyline with its own following; a right turn is
       made from the curb lane, a left from beside the centre line, straight on stays in lane; the lane a
       car leaves a node in is the lane it arrives at the next in; and traffic in both lanes runs clean. */
{
  const map = crossroads(300, 2);
  const g = graphOf(map);
  const lay = g.at[0].layout;
  const legs = Object.values(lay.legs);
  check(legs.length === 8 && legs.filter((x) => x.curb).length === 4 && legs.filter((x) => x.inner).length === 4, `a two-lane crossroads has eight lane-legs, four curb and four inner (${legs.length})`);
  const paths = Object.values(lay.paths);
  const rights = paths.filter((p) => p.intent === "right"), lefts = paths.filter((p) => p.intent === "left"), straights = paths.filter((p) => p.intent === "straight");
  check(rights.length === 4 && rights.every((p) => lay.legs[p.from].curb && lay.legs[p.to].curb), `every right turn is from the curb lane into the curb lane (${rights.length})`);
  check(lefts.length === 4 && lefts.every((p) => lay.legs[p.from].inner && lay.legs[p.to].inner), `every left turn is from beside the centre line into the lane beside it (${lefts.length})`);
  check(straights.length === 8 && straights.every((p) => lay.legs[p.from].lane === lay.legs[p.to].lane), `straight on stays in its lane (${straights.length} straights)`);
  check(laneForTurn("right", { curb: false, inner: true, lane: 0 }, 2) === null && laneForTurn("left", { curb: true, inner: false, lane: 1 }, 2) === null, "a right from the inner lane and a left from the curb lane have no route");
  const outerStraight = straights.find((p) => lay.legs[p.from].curb), innerStraight = straights.find((p) => lay.legs[p.from].inner && lay.legs[p.from].base === lay.legs[outerStraight.from].base);
  check(!lay.conflicts[`${outerStraight.from}/${outerStraight.to}|${innerStraight.from}/${innerStraight.to}`], "two straights side by side in the same direction do not conflict");
  check(lay.place.boxHalf === 7.2, `the box is as wide as the widest road meeting there: half-width ${lay.place.boxHalf} m for two lanes each way`);
  /* The seam: lane 1 leaves node A and arrives at node B in lane 1. */
  const m2 = emptyMap("two");
  m2.roads.push(road({ id: "AB", lanes: 2, points: line({ x: 0, y: 0 }, { x: 600, y: 0 }, 60) }));
  m2.roads.push(road({ id: "An", lanes: 2, points: line({ x: 0, y: -300 }, { x: 0, y: 0 }) }));
  m2.roads.push(road({ id: "Bn", lanes: 2, points: line({ x: 600, y: -300 }, { x: 600, y: 0 }) }));
  const g2 = graphOf(loadMap(m2));
  const kA = g2.at.findIndex((s) => s.layout.legs["AB|start#1"]), kB = g2.at.findIndex((s) => s.layout.legs["AB|end#1"]);
  check(kA >= 0 && kB >= 0 && g2.joins[`${kA}|AB|start#1`]?.side === "AB|end#1" && g2.joins[`${kB}|AB|end#0`]?.side === "AB|start#0", "each lane of a road between two nodes joins to the same lane at the other end");
  const two = runFor(seedGraph(21, 50, map, { control: { "*": "stop" } }), 180);
  const lanesUsed = new Set(two.w.actors.map((a) => two.w.course.at[a.k].layout.legs[two.w.course.at[a.k].layout.paths[a.route].from].lane));
  check(two.overlaps === 0 && two.w.spawned > 150 && lanesUsed.size === 2, `three minutes of traffic in both lanes at an all-way stop: ${two.w.spawned} cars, ${two.overlaps} overlapping car-ticks, lanes in use ${[...lanesUsed].sort().join(" and ")}`);
}

/* 5. The test map: a loop through four nodes joined by a bend and a hill, and an overpass. */
{
  const l = loadMap(testMap1());
  check(l.ok && l.nodes.length === 4 && l.crossings.length === 1 && l.crossings[0].gap > 4.5, `test map 1 loads: ${l.nodes.length} nodes, one crossing with ${l.crossings[0]?.gap.toFixed(1)} m of clearance (the overpass), ${l.warnings.length} warnings`);
  const g = graphOf(l);
  check(g.links.length === 4 && g.at.filter((s) => s.through).length === 4, `four roads join nodes to nodes (the loop), and the overpass is lanes with nothing on them, two each way (${g.links.length} links, ${g.at.filter((s) => s.through).length} through lanes)`);
  let legsMax = 0, seamJumps = 0, minSeamGap = Infinity, levelsCrossed = 0;
  const last = new Map();
  const two = runFor(seedGraph(7, 50, l), 300, (w) => {
    for (const a of w.actors) {
      legsMax = Math.max(legsMax, a.leg ?? 0);
      const p = poseOf(w, a), prev = last.get(a.id);
      /* A car that changed hands moved no further than it drives in a
         tick: no teleport at the seam. */
      if (prev && prev.leg !== (a.leg ?? 0)) { if (Math.hypot(p.x - prev.x, p.y - prev.y) > Math.max(prev.v, a.v) * DT + 0.6) seamJumps++; }
      last.set(a.id, { x: p.x, y: p.y, leg: a.leg ?? 0, v: a.v });
    }
    /* Following across a seam: two cars on one lane, filed under
       different nodes, keep a gap. */
    for (const a of w.actors) for (const b of w.actors) {
      if (a.id === b.id || (a.k ?? 0) === (b.k ?? 0)) continue;
      const sa = laneSpan(w.course, a.k ?? 0, a.route, a.s), sb = laneSpan(w.course, b.k ?? 0, b.route, b.s);
      for (const x of sa) for (const y of sb) if (x.lane === y.lane) { const d = y.along - x.along - CAR.length; if (d > -CAR.length / 2 && d < minSeamGap) minSeamGap = d; }
    }
    /* Two cars within a car of each other in plan on different levels: the overpass doing its job. */
    for (const a of w.actors) for (const b of w.actors) {
      if (a.id >= b.id) continue;
      const p = poseOf(w, a), q = poseOf(w, b);
      if (Math.hypot(p.x - q.x, p.y - q.y) < CAR.length && Math.abs((p.z ?? 0) - (q.z ?? 0)) > 2) levelsCrossed++;
    }
  });
  check(two.overlaps === 0 && two.w.spawned > 250, `five minutes of traffic: ${two.w.spawned} cars, ${two.overlaps} overlapping car-ticks`);
  check(legsMax >= 3, `cars go round the loop: one went through ${legsMax} nodes`);
  check(seamJumps === 0, `no car jumped at a seam (${seamJumps} handoffs moved further than a tick's travel)`);
  check(minSeamGap > 1.0, `the closest two cars on one lane across a seam came was ${minSeamGap.toFixed(2)} m of gap`);
  check(levelsCrossed > 0, `${levelsCrossed} car-ticks had two cars within a car's length in plan on different levels -- the overpass, and they are not overlaps`);
  const spawnedAtEdges = edgesOf(two.w.course).every((e) => !two.w.course.joins[`${e.k}|${e.side}`]);
  /* How many there should be, from the map rather than a literal: one
     inbound lane per lane of every road end that meets no node. The
     literal this replaced went stale the day the map gained an
     arterial, which is what a literal about a map is for. */
  const nodeAt = (p) => l.nodes.some((n) => Math.hypot(n.at.x - p.x, n.at.y - p.y) <= 4);
  const dangling = l.roads.flatMap((r) => [r.pts[0], r.pts[r.pts.length - 1]].filter((p) => !nodeAt(p)).map(() => r.lanes));
  const expected = dangling.reduce((s, n) => s + n, 0);
  check(spawnedAtEdges && edgesOf(two.w.course).length === expected, `traffic enters only at dangling ends, lane by lane: ${edgesOf(two.w.course).length} of them, one per lane of the ${dangling.length} road ends that meet no node (${expected} expected)`);
}

/* 6. Stage 0's map through the graph: four lanes with nothing on them, driven end to end. */
{
  const l = loadMap(stage0Map());
  const g = graphOf(l);
  check(g.at.length === 4 && g.at.every((s) => s.through) && g.links.length === 0, "stage 0 is four through lanes (one each way on two roads) and no intersection");
  const r = runFor(seedGraph(2, 60, l), 120);
  const stopped = r.w.actors.filter((a) => a.v < 0.5).length;
  check(r.overlaps === 0 && r.w.spawned > 60 && stopped === 0, `two minutes: ${r.w.spawned} cars, ${r.overlaps} overlapping car-ticks, nobody stopped on a road with no line`);
  const span = laneSpanOnGraph(g, 0, Object.keys(g.at[0].layout.paths)[0], 100);
  check(span[0].lane === span[1].lane && Math.abs(span[0].along - 100) < 1e-9, "on a through lane a car's position along the lane is its position along the path");
}

/* 7. PER-ROAD POSTED SPEEDS: a residential street is not an arterial.

   The loader has derived a speed per road since the format existed --
   the kind's default, the road's override, lowered where a bend cannot
   be taken at it -- and the sim threw it away and drove the whole map
   at one number, which is the last relic of the fixed road
   (SIMULATOR.md 1.1.1, "per-road posted speeds in the sim"). The
   properties any correct version has to have, rather than a restatement
   of the formula:

     - OFF BY DEFAULT NOTHING MOVES. Every existing caller passes a kmh
       and must get the world it always got, to the bit.
     - THE LIMIT MOVES AND THE DRIVER DOES NOT. A car on a 40 road wants
       less than the same car on a 50; the spread of boldness within a
       road is untouched, because `caution` is the person.
     - IT IS THE ROAD THEY ARE ON, not the road they started on: a car
       that turns off a 50 onto a 40 slows.
     - AND THE GEOMETRY CANNOT SHRINK. `road.speed` sizes the approach,
       so under posted speeds it is the FASTEST road, never an average.

   The comparison is controlled: one seed, one map, one tick count, the
   only difference the flag. */
{
  const l = loadMap(testMap1());
  const speeds = Object.fromEntries(l.roads.map((r) => [r.id, r.speed]));
  check(new Set(Object.values(speeds)).size === 3 && speeds["A-west"] === 60 && speeds["C-southeast"] === 40 && speeds["C-A"] === 40,
    `the test map posts three speeds: the arterial at 60, collectors at 50, the residential streets at 40, and C-A lowered to 40 by its own bend (${[...new Set(Object.values(speeds))].sort().join(", ")})`);

  /* Every leg of every node carries its road's speed, so nothing
     downstream has to look a road up by name. */
  const g = graphOf(l);
  const legs = g.at.flatMap((s) => Object.values(s.layout.legs));
  check(legs.length > 0 && legs.every((L) => Math.abs(L.speed - speeds[L.road] / 3.6) < 1e-9),
    `every one of ${legs.length} legs carries its own road's posted speed in m/s`);
  check(postedAt(g, 0, Object.keys(g.at[0].layout.paths)[0]) > 0 && postedAt(g, 0, "nope/nope") === null,
    "postedAt gives the speed of the road a route comes in on, and null where the course cannot say (a grid course keeps the world's one limit)");

  /* The one limit the "off" world is told is the FASTEST road's, so
     both worlds size their geometry identically and the flag is the
     only difference. (When the fastest road was 50 this was 50; the map
     gained a 60 arterial, and comparing against 50 then moved the
     geometry too, which is not a controlled comparison.) */
  const fastest = Math.max(...Object.values(speeds));
  const drive = (posted) => {
    let w = seedGraph(3, fastest, l, { every: 1.1, posted });
    for (let i = 0; i < 1200; i++) w = step(w);
    const by = {};
    for (const a of w.actors) {
      const L = w.course.at[a.k].layout.legs[w.course.at[a.k].layout.paths[a.route].from];
      (by[L.road] ??= []).push(a.v0 * 3.6);
    }
    return { w, by };
  };
  const off = drive(false), on = drive(true);

  check(off.w.road.kmh === fastest && on.w.road.kmh === fastest && Math.abs(on.w.road.speed - off.w.road.speed) < 1e-9,
    `the geometry speed is the fastest road (${(on.w.road.speed * 3.6).toFixed(0)} km/h), so an approach sized under posted speeds is never shorter than it was`);

  /* Off, a car on the 40 roads wants the 50 the world was told; on, it
     wants the 40 the sign says. Measured as the mean over the cars
     actually there, which is what a driver on that street meets. */
  const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const slowRoads = Object.keys(speeds).filter((r) => speeds[r] < fastest);
  const fastRoads = Object.keys(speeds).filter((r) => speeds[r] === fastest);
  const movedDown = slowRoads.filter((r) => on.by[r] && off.by[r] && mean(on.by[r]) < mean(off.by[r]) - 3);
  check(movedDown.length >= 4, `cars on every road posted below ${fastest} want less than they did at one limit: ${movedDown.map((r) => `${r} ${mean(off.by[r]).toFixed(0)}->${mean(on.by[r]).toFixed(0)}`).join(", ")}`);
  const unmoved = fastRoads.filter((r) => on.by[r] && off.by[r] && Math.abs(mean(on.by[r]) - mean(off.by[r])) < 0.5);
  check(unmoved.length >= fastRoads.filter((r) => on.by[r] && off.by[r]).length - 1,
    `and the posted-${fastest} roads are where they were -- ${unmoved.length} of ${fastRoads.filter((r) => on.by[r] && off.by[r]).length} unchanged, which is the partition that says the change is confined to the roads whose sign differs`);

  /* THE DRIVER IS UNTOUCHED: only the limit moved, so the spread of
     boldness within one road is the same shape. `wantedSpeed` is
     linear in the limit, so the ratio of v0 to the road's own speed is
     the driver, and its spread must not narrow. */
  /* Boldness is relative to the limit IN FORCE: the one limit in the
     "off" world, the road's own sign in the "on" one. Dividing both by
     the posted sign was only harmless while nearly every road posted
     the one limit; with an arterial on the map it mixed three limits
     into the "off" spread and measured the map, not the driver. */
  const ratio = (d, posted) => Object.entries(d.by).flatMap(([r, vs]) => vs.map((v) => v / (posted ? speeds[r] : fastest)));
  const spread = (xs) => { const m = mean(xs); return Math.sqrt(mean(xs.map((x) => (x - m) ** 2))); };
  check(Math.abs(spread(ratio(on, true)) - spread(ratio(off, false))) < 0.06,
    `the driver is the driver: boldness relative to the limit in force spreads ${spread(ratio(off, false)).toFixed(3)} at one limit and ${spread(ratio(on, true)).toFixed(3)} at posted speeds -- the LIMIT moved, not the person`);

  /* A car that goes round the loop meets more than one limit, so the
     speed has to follow it rather than being set once at spawn. */
  const travelled = on.w.actors.filter((a) => (a.leg ?? 0) >= 2);
  const onSlow = travelled.filter((a) => {
    const L = on.w.course.at[a.k].layout.legs[on.w.course.at[a.k].layout.paths[a.route].from];
    return speeds[L.road] === 40;
  });
  check(travelled.length > 0 && onSlow.every((a) => a.v0 * 3.6 < 40 * 1.35 + 0.01),
    `and it follows them along the way: ${travelled.length} cars had been through two or more nodes, and every one of them now on a 40 road wants a 40 road's speed, not the one it spawned with`);

  /* SABOTAGE. If the flag did nothing, the two drives would be the same
     drive -- which is exactly how a check like this passes for the
     wrong reason (CLAUDE.md, cold start 3). */
  const same = Object.keys(on.by).every((r) => off.by[r] && Math.abs(mean(on.by[r]) - mean(off.by[r])) < 0.5);
  check(!same, "and the flag is load-bearing: with posted speeds off the same seed drives a measurably different world");
}

/* 8. HOW MANY CARS: a population the maintainer sets, rather than a rate
   whose result nobody chose. The map is topped up to the target at its
   edges; lowering the target stops arrivals and lets the map drain
   through its exits rather than deleting anybody; and at the default
   the map carries five times what the old rate put on it. */
{
  const loaded = loadMap(testMap1());
  const held = (w, secs) => { let sum = 0, n = 0, lo = Infinity; for (let i = 0; i < secs * 20; i++) { w = step(w); if (i > 20) { sum += w.actors.length; n++; lo = Math.min(lo, w.actors.length); } } return { w, mean: sum / n, lo }; };
  const at120 = held(seedGraph(3, 50, loaded, { target: 120 }), 60);
  check(at120.w.actors.length >= 114 && at120.lo >= 108 && at120.mean <= 121, `a target of 120 holds 120: ${at120.mean.toFixed(1)} on average over a minute, never below ${at120.lo}`);
  const old = held(seedGraph(3, 50, loaded, { every: 2.0 }), 60);
  check(old.mean < 40, `and it is the target doing it: the rate the screen used to run carries ${old.mean.toFixed(0)}`);
  let w = { ...at120.w, target: 40 };
  let arrivedWhileOver = 0, drained = null;
  for (let i = 0; i < 20 * 120; i++) {
    const over = w.actors.length > 40, before = w.spawned;   /* at exactly 40 a car leaving this tick is rightly replaced */
    w = step(w);
    if (over && w.spawned > before) arrivedWhileOver++;
    if (drained == null && w.actors.length <= 40) drained = w.t;
  }
  check(arrivedWhileOver === 0 && drained != null && Math.abs(w.actors.length - 40) <= 3,
    `lowered to 40, nobody new arrives while the map is over it, it drains through its exits in ${(drained - at120.w.t)?.toFixed(0)}s with no car removed by hand, and then holds 40 (${w.actors.length})`);
  let up = { ...w, target: 200 };
  for (let i = 0; i < 20 * 60; i++) up = step(up);
  check(up.actors.length >= 180, `and raised to 200 it tops up at the edges within a minute (${up.actors.length})`);
  check(overlapping(up).length === 0, "with nobody driving through anybody at 200");
}

/* 9. A WAITING CAR IS OUT OF EVERY OTHER PATH'S WAY. The general form of
   the flaw lane changing exposed on 24 September: a left turn from a
   set-back line swept a 25 m arc through the spot where the opposite
   traffic waits at its red. Right of way cannot fix that -- a car
   standing inside somebody's path is hit by them whoever has the green
   -- so it is a property of the geometry, checked at every node of the
   test map: no path from another road comes within half a car of a car
   waiting at any lane's line. The editor will draw junctions nobody has
   looked at, which is why it is checked as a property and not as the
   one case that was found. */
{
  const g = graphOf(loadMap(testMap1()), { lane: 3.6 });
  let worst = { d: Infinity }, checked = 0;
  for (const spot of g.at) {
    if (spot.through) continue;
    const L = spot.layout;
    for (const legId of Object.keys(L.legs)) {
      const mine = Object.values(L.paths).find((p) => p.from === legId);
      if (!mine) continue;
      const c = poseAt(mine, mine.stopAt - CAR.length / 2), h = (c.rot * Math.PI) / 180, ux = Math.cos(h), uy = Math.sin(h);
      for (const p of Object.values(L.paths)) {
        if (L.legs[p.from].base === L.legs[legId].base) continue;
        for (let s = 0; s <= p.length; s += 0.5) {
          const q = poseAt(p, s), dx = q.x - c.x, dy = q.y - c.y;
          const along = Math.abs(dx * ux + dy * uy) - CAR.length / 2, across = Math.abs(-dx * uy + dy * ux) - CAR.width / 2;
          const d = Math.hypot(Math.max(0, along), Math.max(0, across));
          if (d < worst.d) worst = { d, node: spot.node, leg: legId, path: `${p.from}->${p.to}` };
        }
        checked++;
      }
    }
  }
  check(worst.d >= CAR.width / 2, `no path comes within half a car of a car waiting at another road's line, at any of the test map's nodes (${checked} leg-path pairs; closest ${worst.d.toFixed(2)} m, ${worst.path} past ${worst.leg} at ${worst.node})`);
}

if (failed) { console.log(`\n${failed} FAILED`); process.exit(1); }
console.log("\nOK: the map's crossroads is the compass crossroads; a T, a five-way, a loop, a bend, a hill and an overpass run the same rules, nobody drives through anybody, and a road is driven at the speed it posts.");
