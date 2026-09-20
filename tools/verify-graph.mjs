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
import { onRightOf, oncoming, intentOf, graphOf, laneSpanOnGraph, laneForTurn, ONCOMING_TOL } from "../src/sim/graph.js";
import { seedGraph, step, overlapping, delayed, poseOf, edgesOf } from "../src/sim/crossing.js";
import { laneSpan } from "../src/sim/course.js";
import { CAR, DT } from "../src/sim/traffic.js";
import { loadMap } from "../src/map/load.js";
import { emptyMap, road, stage0Map } from "../src/map/format.js";
import { testMap1 } from "../src/map/samples.js";

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
  check(spawnedAtEdges && edgesOf(two.w.course).length === 16, `traffic enters only at dangling ends, lane by lane: ${edgesOf(two.w.course).length} of them (five two-lane roads and two one-lane roads to the edge, the overpass's four lanes)`);
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

if (failed) { console.log(`\n${failed} FAILED`); process.exit(1); }
console.log("\nOK: the map's crossroads is the compass crossroads; a T, a five-way, a loop, a bend, a hill and an overpass run the same rules, and nobody drives through anybody.");
