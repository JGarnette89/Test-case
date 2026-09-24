/* =====================================================================
   LANES HAVE TO LAND: permitted movements are the network's, and a map
   whose lanes have nowhere to go is refused when it is written.

   The maintainer's rulings (24 September): left from the lane beside the
   centre line and right from the furthest right "in general", "unless
   it's a double left turn intersection" -- the intersection and the
   connecting roads make the final determination -- and a middle lane at
   a T "should be able to turn left or right, and these will always need
   to be connected to roads that can accommodate these turns, or the
   lanes need to converge ahead of the intersection". So:

     the general rule is the default, lane by lane, and a middle lane at a
       T turns either way;
     a map can override it per lane (a double left, a right-turn-only curb
       lane), and the override is what the sim then does;
     the lanes making a movement land in the destination in order from
       their own side, and a lane with NOWHERE to land is an authoring
       error NAMING THE LANE AND THE INTERSECTION -- in the shape of the
       tile runway check: caught when the map is written, not when a car
       drives into a wall;
     the test map carries none, and takes them back if its right-turn-only
       markings are removed;
     and in traffic, a double left fills both its lanes with nobody
       through anybody.
   ===================================================================== */
import { loadMap } from "../src/map/load.js";
import { emptyMap, road } from "../src/map/format.js";
import { testMap1 } from "../src/map/samples.js";
import { graphOf } from "../src/sim/graph.js";
import { defaultTurns, receive } from "../src/sim/lanes.js";
import { seedGraph, step, overlapping } from "../src/sim/crossing.js";

let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? " ok " : "FAIL"} ${msg}`); if (!ok) failed++; };
const line = (a, b, n = 40) => Array.from({ length: n + 1 }, (_, i) => ({ x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n, z: 0 }));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* A node at (500,500) with arms: [id, far point, lanes, turns at the node end]. */
function node(arms, control = "stop") {
  const m = emptyMap("c", "connect");
  m.bounds = { x: 0, y: 0, w: 1000, h: 1000 };
  const c = { x: 500, y: 500 };
  for (const [id, far, lanes, turns] of arms) m.roads.push(road({ id, kind: "collector", lanes, points: line(far, c), control: { start: "none", end: control }, ...(turns ? { turns: { end: turns } } : {}) }));
  const loaded = loadMap(m);
  return { loaded, g: graphOf(loaded, { lane: 3.6 }) };
}
const N = { x: 500, y: 100 }, S = { x: 500, y: 900 }, E = { x: 900, y: 500 }, W = { x: 100, y: 500 };

/* 1. The general rule, as the maintainer states it. */
{
  const all = new Set(["left", "straight", "right"]), tee = new Set(["left", "right"]);
  check(same(defaultTurns(1, all), [["left", "straight", "right"]]), "a one-lane approach may do everything the intersection offers");
  check(same(defaultTurns(2, all), [["left", "straight"], ["straight", "right"]]), "two lanes: left from the lane beside the centre line, right from the curb lane, straight from either");
  check(same(defaultTurns(3, all), [["left", "straight"], ["straight"], ["straight", "right"]]), "three lanes: the middle lane goes straight on");
  check(same(defaultTurns(3, tee), [["left"], ["left", "right"], ["right"]]), "three lanes at a T, with no straight on: the middle lane may turn left or right (the maintainer)");
}

/* 2. Pairing: lanes land in order from their own side. */
{
  check(same(receive([["left"], ["left"], ["straight", "right"]], "left", 3).map, { 0: 0, 1: 1 }), "a double left lands in the two lanes beside the centre line, in order");
  check(same(receive([["straight"], ["right"], ["right"]], "right", 3).map, { 2: 2, 1: 1 }), "a double right lands in the two curb lanes, the curb lane in the curb lane");
  check(same(receive([["left"], ["straight"], ["straight"]], "straight", 2).map, { 1: 0, 2: 1 }), "straight lanes land in order from the centre line, so a left-only lane does not push the through lanes out of line");
  check(same(receive([["straight"], ["straight"], ["straight"]], "straight", 2).excess, [2]), "three lanes straight into two leaves the curb lane with nowhere to go");
}

/* 3. AUTHORING ERRORS: named by lane and intersection. */
{
  const three = node([["N", N, 3], ["S", S, 2], ["E", E, 2], ["W", W, 2]]);
  const e = three.g.errors.find((x) => x.code === "unreceived-lane");
  check(e && e.lane === "N|end#2" && e.move === "straight" && /n\w*/.test(e.node) && e.message.includes("N|end#2") && e.message.includes(e.node),
    `three lanes straight into two is refused at the lane and intersection: "${e?.message}"`);
  check(e && /converge the lanes before the intersection/.test(e.message) && /more lanes/.test(e.message), "and the message says what the author can do about it");
  const paths = Object.values(three.g.at[0].layout.paths).filter((p) => p.from === "N|end#2" && p.intent === "straight");
  check(paths.length === 0, "and the sim does not offer the movement it refused: no straight path from that lane, so no car is sent into a wall");

  const teeNarrow = node([["N", N, 3], ["E", E, 1], ["W", W, 1]]);
  const te = teeNarrow.g.errors.filter((x) => x.code === "unreceived-lane");
  check(te.length === 2 && te.every((x) => x.lane === "N|end#1"), `a three-lane approach into a T of one-lane roads: the middle lane's left and its right both have nowhere to land (${te.map((x) => `${x.lane} ${x.move}`).join(", ")})`);
  const teeWide = node([["N", N, 3], ["E", E, 2], ["W", W, 2]]);
  check(teeWide.g.errors.length === 0, "the same T with two-lane roads to receive them: the middle lane turns either way, as the maintainer ruled");

  const dbl = [["left"], ["left"], ["straight", "right"]];
  const dblOk = node([["N", N, 3, dbl], ["S", S, 3], ["E", E, 2], ["W", W, 2]]);   /* W two lanes: three going straight into E's two would itself be refused */
  const lefts = Object.values(dblOk.g.at[0].layout.paths).filter((p) => p.from.startsWith("N|") && p.intent === "left");
  check(dblOk.g.errors.length === 0 && lefts.length === 2 && same(lefts.map((p) => p.to).sort(), ["E|end#0", "E|end#1"]),
    `a double left, written as an override on the map, into a two-lane road: two left paths, into its two lanes (${lefts.map((p) => `${p.from}->${p.to}`).join(", ")})`);
  const dblBad = node([["N", N, 3, dbl], ["S", S, 3], ["E", E, 1], ["W", W, 1]]);
  check(dblBad.g.errors.some((x) => x.code === "unreceived-lane" && x.lane === "N|end#1" && x.move === "left"), "the same double left into a one-lane road is refused at its second lane");

  const badCount = node([["N", N, 2, [["left", "straight"]]], ["S", S, 2], ["E", E, 2], ["W", W, 2]]);
  check(badCount.g.errors.some((x) => x.code === "bad-turns" && x.lane === "N|end"), "turns that do not list every lane are refused, and the general rule used meanwhile");
  const badMove = node([["N", N, 2, [["left", "straight"], ["straight", "right"]]], ["E", E, 2], ["W", W, 2]]);
  check(badMove.g.errors.some((x) => x.code === "bad-turns" && /straight/.test(x.message)), "so are turns naming a movement the intersection does not offer (straight on, at a T)");
  const nowhere = node([["N", N, 2, [["left"], []]], ["S", S, 2], ["E", E, 2], ["W", W, 2]]);
  check(nowhere.g.errors.some((x) => x.code === "lane-goes-nowhere" && x.lane === "N|end#1"), "and a lane permitted nothing at all");
}

/* 4. The test map: clean, and the right-turn-only markings are why. */
{
  const tm = testMap1();
  const g = graphOf(loadMap(tm), { lane: 3.6 });
  check(g.errors.length === 0, `the test map has no authoring errors (${g.errors.length})`);
  for (const r of tm.roads) delete r.turns;
  const bare = graphOf(loadMap(tm), { lane: 3.6 });
  const found = bare.errors.filter((x) => x.code === "unreceived-lane").map((x) => x.lane).sort();
  check(same(found, ["C-A|start#1", "C-D|start#1"]), `and without its two right-turn-only markings it is refused at exactly those lanes: ${found.join(", ")} -- two-lane collectors going straight into one-lane streets, which merged inside the box before this check existed`);
}

/* 5. In traffic: the double left is used, both lanes, nobody through anybody. */
{
  const dbl = [["left"], ["left"], ["straight", "right"]];
  const { loaded } = node([["N", N, 3, dbl], ["S", S, 3], ["E", E, 2], ["W", W, 2]], "stop");
  let w = seedGraph(5, 50, loaded, { target: 60 });
  const usedLanes = new Set();
  let ov = 0;
  for (let i = 0; i < 20 * 180; i++) {
    w = step(w);
    if (i % 5 === 0) ov += overlapping(w).length;
    for (const a of w.actors) { const p = w.course.at[a.k].layout.paths[a.route]; if (p.from.startsWith("N|") && p.intent === "left" && a.s > p.stopAt) usedLanes.add(p.from); }
  }
  check(usedLanes.size === 2 && ov === 0, `a double left in traffic: cars turned left from ${[...usedLanes].sort().join(" and ")}, with ${ov} overlapping car-ticks in three minutes`);
}

if (failed) { console.log(`\n${failed} FAILED`); process.exit(1); }
console.log("\nOK: permitted movements are the network's, lanes land in order from their own side, and a lane with nowhere to go is refused at the lane and intersection when the map is written.");
