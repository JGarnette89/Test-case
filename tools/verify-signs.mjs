/* =====================================================================
   SIGNS AS OBJECTS (the signs design, SIMULATOR.md): what has to hold.

     1. A sign IS the rule at its approach. A map that says "stop" as the
        road end's shorthand and the same map with a stop sign standing
        there load to the same controls, and the traffic on them is
        identical, tick for tick -- converting changes where the rule is
        written, never what it is.
     2. Disagreements are said, never guessed: sign against shorthand (the
        sign wins), a sign on a signal's approach (the signal wins), a sign
        at no road, a no-right-on-red plate with no signal.
     3. A sign stays at its road END through a split at a T.
     4. A sign stands where the map puts it: level with the line by
        default, `back` metres before it when set back.
     5. The editor writes signs, not shorthand, and keeps them at their end
        through its own splits and deletions.
     6. A driver learns a rule in one place (sim/reading.js), and only
        there.
   ===================================================================== */
import fs from "node:fs";
import { loadMap } from "../src/map/load.js";
import { TEST_MAPS } from "../src/map/samples.js";
import { emptyMap, road } from "../src/map/format.js";
import { graphOf, junctionsOf } from "../src/sim/graph.js";
import { seedGraph, step } from "../src/sim/crossing.js";
import { newDraft, addRoad, addPoint, setRoadControl, setSignBack, splitRoad, deleteRoad, controlAt } from "../src/editor/model.js";

let failed = 0;
const check = (ok, msg) => { console.log(`  ${ok ? "ok  " : "FAIL:"} ${msg}`); if (!ok) failed++; };
const P = (x, y) => ({ x, y, z: 0 });
const codes = (l) => l.warnings.map((w) => w.code);

/* The same map with every stop and yield written as a sign standing there
   instead of as the road end's shorthand. */
const asSigns = (m) => {
  const signs = [];
  const roads = m.roads.map((r) => {
    const control = { ...r.control };
    for (const e of ["start", "end"]) if (control[e] === "stop" || control[e] === "yield") { signs.push({ id: `s-${r.id}-${e}`, kind: control[e], road: r.id, end: e }); control[e] = "none"; }
    return { ...r, control };
  });
  return { ...m, roads, signs };
};

console.log("\n1. A SIGN IS THE RULE AT ITS APPROACH");
for (const t of TEST_MAPS) {
  const m = t.build(), s = asSigns(m);
  const a = loadMap(m), b = loadMap(s);
  const ctl = (l) => JSON.stringify(l.roads.map((r) => [r.id, r.control]));
  const legs = (l) => JSON.stringify(graphOf(l, { conflicts: false }).at.map((q) => q.layout.place.control));
  check(s.signs.length > 0 && ctl(a) === ctl(b) && legs(a) === legs(b), `${t.name}: ${s.signs.length} stop and yield signs in place of the shorthand, the same control on every road end and every leg`);
  let wa = seedGraph(2, 50, a, { target: 100, posted: true }), wb = seedGraph(2, 50, b, { target: 100, posted: true });
  let same = JSON.stringify(wa.actors) === JSON.stringify(wb.actors);
  for (let i = 0; i < 1200 && same; i++) { wa = step(wa); wb = step(wb); same = JSON.stringify(wa.actors) === JSON.stringify(wb.actors); }
  check(same, `${t.name}: and the traffic is identical, tick for tick, for a minute`);
}

console.log("\n2. DISAGREEMENTS ARE SAID");
{
  const base = () => { const m = emptyMap("d"); m.roads.push(road({ id: "a", points: [P(0, 0), P(200, 0)], control: { start: "none", end: "stop" } }), road({ id: "b", points: [P(200, 0), P(400, 0)] }), road({ id: "c", points: [P(200, 0), P(200, 200)] })); return m; };
  const m1 = base(); m1.signs = [{ id: "y", kind: "yield", road: "a", end: "end" }];
  const l1 = loadMap(m1);
  check(l1.roads.find((r) => r.id === "a").control.end === "yield" && codes(l1).includes("control-vs-sign"), "shorthand says stop, a yield sign stands there: warned, and the sign governs");
  const m2 = base(); m2.roads[0].control.end = "signal"; m2.signs = [{ id: "s", kind: "stop", road: "a", end: "end" }];
  const l2 = loadMap(m2);
  check(l2.roads.find((r) => r.id === "a").control.end === "signal" && codes(l2).includes("sign-at-signal"), "a stop sign on a signal's approach: warned, and the signal governs");
  const m3 = base(); m3.signs = [{ id: "x", kind: "stop", road: "nowhere", end: "end" }, { id: "k", kind: "slow down", road: "a", end: "end" }];
  const l3 = loadMap(m3);
  check(codes(l3).includes("sign-no-road") && codes(l3).includes("unknown-sign") && l3.signs.length === 1, "a sign at no road and a sign of no known kind are dropped, each warned");
  const m4 = base(); m4.signs = [{ id: "p", kind: "no-right-on-red", road: "a", end: "end" }];
  const l4 = loadMap(m4);
  const m5 = base(); m5.roads[0].control.end = "signal"; m5.signs = [{ id: "p", kind: "no-right-on-red", road: "a", end: "end" }];
  const l5 = loadMap(m5);
  check(codes(l4).includes("plate-without-signal") && l5.roads.find((r) => r.id === "a").control.end === "signal-no-right-on-red", "the no-right-on-red plate: warned on a stop approach, and on a signal it makes the signal no-right-on-red");
}

console.log("\n3. A SIGN STAYS AT ITS END THROUGH A SPLIT");
{
  /* A T lands on the middle of road "long", which the loader splits: the
     sign at long's END must be on the half that has that end. */
  const m = emptyMap("t");
  m.roads.push(road({ id: "long", points: [P(0, 0), P(400, 0)] }), road({ id: "stem", points: [P(200, 200), P(200, 0)] }), road({ id: "far", points: [P(400, 0), P(400, 300)] }), road({ id: "far2", points: [P(400, 0), P(700, 0)] }));
  m.signs = [{ id: "s", kind: "stop", road: "long", end: "end" }, { id: "t", kind: "yield", road: "stem", end: "end" }];
  const l = loadMap(m);
  const s = l.signs.find((q) => q.id === "s");
  check(!!s && s.road.startsWith("long#") && s.end === "end" && l.roads.find((r) => r.id === s.road).control.end === "stop", `the loader split "long" at the T and its end's stop sign is on ${s?.road}, still at its end`);
}

console.log("\n4. A SIGN STANDS WHERE THE MAP PUTS IT");
{
  const t1 = TEST_MAPS.find((t) => t.id === "test-1").build();
  const drawn = (m) => junctionsOf(graphOf(loadMap(m), { conflicts: false })).flatMap((j) => j.signs.map((q) => ({ ...q, node: j.node })));
  const a = drawn(t1), b = drawn(asSigns(t1));
  check(JSON.stringify(a) === JSON.stringify(b), `every sign on test map 1 is drawn exactly where it was before signs were objects (${a.length})`);
  const moved = asSigns(t1);
  const target = moved.signs[0];
  moved.signs = moved.signs.map((q) => (q === target ? { ...q, back: 12 } : q));
  const c = drawn(moved);
  const diff = a.map((q, i) => Math.hypot(q.at.x - c[i].at.x, q.at.y - c[i].at.y)).filter((d) => d > 0.01);
  check(diff.length === 1 && Math.abs(diff[0] - 12) < 0.6, `set back 12 m, one sign moves, ${diff[0]?.toFixed(1)} m along its approach, and nothing else moves`);
}

console.log("\n5. THE EDITOR WRITES SIGNS");
{
  let m = newDraft(); let r;
  ({ map: m, id: r } = addRoad(m)); m = addPoint(m, r, P(0, 0)); m = addPoint(m, r, P(100, 0));
  m = setRoadControl(m, r, "end", "stop");
  check(m.signs?.length === 1 && m.signs[0].kind === "stop" && m.roads[0].control.end === "none" && controlAt(m, m.roads[0], "end") === "stop", "choosing stop puts a stop sign at that end, not shorthand");
  m = setSignBack(m, r, "end", 8);
  check(m.signs[0].back === 8, "and it can be set back from the line");
  const sig = setRoadControl(m, r, "end", "signal");
  check(sig.signs.length === 0 && sig.roads[0].control.end === "signal", "choosing a signal takes the sign away and makes the end a signal");
  const sp = splitRoad(m, r, 0, P(50, 0));
  check(sp.map.signs[0].road === sp.ids[1] && sp.map.signs[0].end === "end", "splitting the road moves the sign at its end to the half that has that end");
  check(deleteRoad(m, r).signs.length === 0, "deleting the road takes its signs with it");
}

console.log("\n6. A DRIVER LEARNS A RULE IN ONE PLACE");
{
  const src = fs.readFileSync(new URL("../src/sim/crossing.js", import.meta.url), "utf8");
  const direct = (src.match(/place\.control\[/g) ?? []).length;
  check(src.includes("knownControl(actor, layout, path)") && src.includes("theirControl(layout, path)") && direct === 1,
    `crossing.js asks sim/reading.js for every driver's rule; the one direct read left is where traffic spawns, which is not a driver's question (${direct})`);
}

console.log(`\n${"=".repeat(70)}`);
console.log(failed ? `${failed} FAILURE(S)` : "OK: a sign is the rule at its approach and the traffic is identical for it, disagreements are said, a sign keeps its end through a split and stands where it is put, the editor writes signs, and a driver learns a rule in one place.");
process.exit(failed ? 1 : 0);
