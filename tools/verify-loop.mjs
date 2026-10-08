/* =====================================================================
   ONE-WAY ROADS, AND THE ENDLESS HIGHWAY (8 October).

   1. A one-way road is driven one way. Until today the format, the loader
      and the renderer carried `oneWay` and the graph built both directions
      on every road anyway -- a one-way street the editor could draw was
      driven two-way in a carriageway one direction wide (CLAUDE.md item 6).
      Its lanes all run start to end, centred on the road; nobody comes in
      along it at its start; nobody spawns on it where it leaves the map;
      and the player's left edge is the road's own.
   2. The endless highway (samples.js testLoop): a one-way loop with no
      open end, fed and drained only by its ramps; every section drivable,
      the player starting on a slip road; traffic clean for five minutes.
   3. It does not go stale: at fifteen minutes the speeds are still spread,
      cars still overtake, and most of the loop's population has turned
      over since minute five -- against the same loop with its exits
      removed, where almost nobody is new (tools/measure/loop.mjs).
   ===================================================================== */
import { loadMap } from "../src/map/load.js";
import { emptyMap, road } from "../src/map/format.js";
import { testLoop } from "../src/map/samples.js";
import { graphOf, edgesOfGraph } from "../src/sim/graph.js";
import { seedGraph, step, pathOf, overlapping } from "../src/sim/crossing.js";
import { playerOn } from "../src/sim/drive.js";
import { DT } from "../src/sim/traffic.js";

let failed = 0;
const check = (ok, msg) => { console.log(`  ${ok ? "ok  " : "FAIL:"} ${msg}`); if (!ok) failed++; };
const P = (x, y) => ({ x, y, z: 0 });

console.log("\n1. A ONE-WAY ROAD IS DRIVEN ONE WAY");
{
  /* A crossroads whose east arm is one-way AWAY from it (start at the node) and whose north arm is one-way TOWARD it. */
  const m = emptyMap("ow");
  m.bounds = { x: 0, y: 0, w: 800, h: 800 };
  m.roads.push(
    road({ id: "w", points: [P(0, 400), P(400, 400)] }),
    road({ id: "e", oneWay: true, lanes: 2, points: [P(400, 400), P(800, 400)] }),
    road({ id: "n", oneWay: true, lanes: 2, points: [P(400, 0), P(400, 400)] }),
    road({ id: "s", points: [P(400, 400), P(400, 800)] }),
  );
  const L = loadMap(m), g = graphOf(L);
  check(L.ok && g.errors.length === 0, `a crossroads with two one-way arms loads and builds (${g.errors.map((e) => e.code).join(",") || "no errors"})`);
  const lanes = Object.keys(g.lanes).filter((id) => id.startsWith("e:") || id.startsWith("n:"));
  check(lanes.length === 4 && lanes.every((id) => id.includes(":fwd#")), `their lanes run one way only: ${lanes.join(", ")}`);
  const e0 = g.lanes["e:fwd#0"], e1 = g.lanes["e:fwd#1"];
  check(Math.abs(e0.pts[5].y - 398.2) < 0.01 && Math.abs(e1.pts[5].y - 401.8) < 0.01, `centred on the road, lane 0 to the left of travel: y ${e0.pts[5].y.toFixed(2)} and ${e1.pts[5].y.toFixed(2)} about the centre line at 400`);
  const paths = Object.values(g.at[0].layout.paths);
  const fromE = paths.filter((p) => p.from.startsWith("e|")), intoN = paths.filter((p) => p.to.startsWith("n|"));
  check(fromE.length === 0 && intoN.length === 0, `nobody comes in along the one-way road leaving, nor leaves up the one coming in (${fromE.length}, ${intoN.length} paths)`);
  check(paths.some((p) => p.to.startsWith("e|")) && paths.some((p) => p.from.startsWith("n|")), "and both are driven the way they run");
  const edges = edgesOfGraph(g);
  check(!edges.some((x) => x.side.startsWith("e|")) && edges.some((x) => x.side.startsWith("n|")), "traffic arrives down the one-way road toward the node, and never up the one leaving the map");
  const me = playerOn(g, "n", "end");
  check(!!me, "the player can start on it");
  let w = seedGraph(1, 50, L, { target: 60 });
  let wrong = 0, over = 0;
  for (let i = 0; i < 120 / DT; i++) {
    w = step(w);
    for (const a of w.actors) { const p = pathOf(w, a); if (p.from.startsWith("e|") || p.to.startsWith("n|")) wrong++; }
    if (i % 20 === 0) over += overlapping(w).length;
  }
  check(wrong === 0 && over === 0 && (w.crashes ?? []).length === 0, `two minutes at 60 cars: nobody against the flow (${wrong}), no overlap (${over}), no crash`);
}

console.log("\n2. THE ENDLESS HIGHWAY");
const loop = loadMap(testLoop());
{
  const g = graphOf(loop);
  check(loop.ok && g.errors.length === 0 && loop.warnings.every((x) => x.code === "snapped-join"), `it loads clean (${loop.roads.length} roads, ${loop.nodes.length} interchange nodes, warnings only where the pieces join)`);
  const loopRoads = loop.roads.filter((r) => r.id.startsWith("loop-"));
  check(loopRoads.every((r) => r.oneWay && r.lanes === 3 && r.speed === 100), "the loop is one way, three lanes, 100 km/h all round -- no bend lowers it");
  const edges = edgesOfGraph(g);
  check(edges.length === 4 && edges.every((x) => x.side.startsWith("on-")), `traffic enters only up the four on-ramps (${edges.map((x) => x.side.split("|")[0]).join(", ")})`);
  check(loop.sections.every((sec) => sec.start.road.startsWith("on-") && playerOn(g, sec.start.road, sec.start.end)), "every section starts the player on a slip road, standing, to merge");
  let w = seedGraph(1, 50, loop, { target: 200, posted: true });
  let over = 0;
  for (let i = 0; i < 300 / DT; i++) { w = step(w); if (i % 20 === 0) over += overlapping(w).length; }
  check(over === 0 && (w.crashes ?? []).filter((c) => !String(c.a).startsWith("ped-")).length === 0, `five minutes at 200 cars: no overlap (${over}), no crash`);
}

console.log("\n3. IT DOES NOT GO STALE: minute 5 against minute 15, ramps open and exits removed");
{
  const onLoop = (w, a) => { const p = pathOf(w, a), L = w.course.at[a.k ?? 0].layout; return /^loop-/.test(L.legs[p.from]?.road ?? "") && /^loop-/.test(L.legs[p.to]?.road ?? ""); };
  const measure = (loaded) => {
    let w = seedGraph(1, 50, loaded, { target: 200, posted: true });
    while (w.t < 300) w = step(w);
    const at5 = new Set(w.actors.filter((a) => onLoop(w, a)).map((a) => a.id));
    while (w.t < 840) w = step(w);
    const speeds = [];
    let overtakes = 0, last = null;
    for (let i = 0; i < 60 / DT; i++) {
      w = step(w);
      if (i % 20) continue;
      const order = new Map();
      for (const a of w.actors) {
        if (!onLoop(w, a)) continue;
        speeds.push(a.v * 3.6);
        const key = `${a.k}|${pathOf(w, a).from.split("#")[0]}`;
        (order.get(key) ?? order.set(key, []).get(key)).push(a);
      }
      const rank = new Map();
      for (const [key, list] of order) { list.sort((x, y) => x.s - y.s); list.forEach((a, j) => rank.set(a.id, { key, j })); }
      if (last) for (const [key, list] of order) {
        const ids = list.map((a) => a.id).filter((id) => last.get(id)?.key === key);
        for (let x = 0; x < ids.length; x++) for (let y = x + 1; y < ids.length; y++) if (last.get(ids[x]).j > last.get(ids[y]).j) overtakes++;
      }
      last = rank;
    }
    const now = w.actors.filter((a) => onLoop(w, a)).map((a) => a.id);
    const mean = speeds.reduce((a, b) => a + b, 0) / speeds.length;
    const sd = Math.sqrt(speeds.reduce((s, v) => s + (v - mean) ** 2, 0) / speeds.length);
    return { cars: now.length, fresh: now.filter((id) => !at5.has(id)).length / Math.max(1, now.length), sd, overtakes };
  };
  const open = measure(loop);
  const closedRaw = testLoop(); closedRaw.roads = closedRaw.roads.filter((r) => !r.id.startsWith("off-"));
  const closed = measure(loadMap(closedRaw));
  check(open.fresh >= 0.4, `with the ramps, ${(100 * open.fresh).toFixed(0)}% of the ${open.cars} cars on the loop at minute 15 were not on it at minute 5`);
  check(closed.fresh < 0.15 && open.fresh > 3 * closed.fresh, `with the exits removed, ${(100 * closed.fresh).toFixed(0)}% -- the people stop changing, which is what the ramps are for`);
  check(open.sd >= 10 && open.overtakes >= 60, `and at minute 15 the speeds are still spread (sd ${open.sd.toFixed(1)} km/h) and cars still overtake (${open.overtakes} in the minute); closed: sd ${closed.sd.toFixed(1)}, ${closed.overtakes} -- three lanes and lane changing keep even a closed loop from queueing in fifteen minutes, unlike stage 0's single-lane ring`);
}

console.log(failed ? `\n${failed} FAILURE(S)` : "\nall passed");
process.exit(failed ? 1 : 0);
