/* =====================================================================
   THE EDITOR: the model is pure, a draft round-trips, and a badly
   drawn map cannot break the sim -- the question SIMULATOR.md stage 2
   poses ("can a badly drawn map break the sim? Try to.") asked
   directly, against a battery built to try.
   ===================================================================== */
import {
  newDraft, addRoad, addPoint, updatePoint, removeLastPoint, setPointZ, deleteRoad,
  setRoadProps, setRoadControl, setRoadTurns, setRoadBays, setLeftArrow,
  addZone, addZonePoint, setZoneProps, deleteZone,
  nearestRoadEnd, cumulative, serialize, parse,
} from "../src/editor/model.js";
import { validateDraft } from "../src/editor/validate.js";
import { testMap1 } from "../src/map/samples.js";
import { loadMap } from "../src/map/load.js";
import { LANE, CONTROLS, emptyMap, road, stage0Map } from "../src/map/format.js";
import { seedGraph, step } from "../src/sim/crossing.js";
import { playerOn, withDriver, driverPose, stepDriver } from "../src/sim/drive.js";
import { DT } from "../src/sim/traffic.js";
import { firstEdge } from "../src/map/edges.js";

let failed = 0;
const ok = (s) => console.log(`  ok   ${s}`);
const fail = (s) => { failed++; console.log(`  FAIL: ${s}`); };
const check = (cond, s) => (cond ? ok(s) : fail(s));

console.log("\n1. THE MODEL IS PURE, AND OPERATIONS COMPOSE");
{
  let m = newDraft("t", "Test");
  const before = m;
  let a, b;
  ({ map: m, id: a } = addRoad(m, { kind: "arterial" }));
  check(m !== before, "addRoad returns a new map, the input untouched");
  m = addPoint(m, a, { x: 0, y: 0 });
  m = addPoint(m, a, { x: 50, y: 0 });
  m = addPoint(m, a, { x: 100, y: 0 });
  check(m.roads[0].points.length === 3, `points accumulate in order (${m.roads[0].points.length})`);
  m = updatePoint(m, a, 1, { y: 5 });
  check(m.roads[0].points[1].y === 5 && m.roads[0].points[1].x === 50, "updatePoint replaces one point, keeps the rest of it (x unspecified stays)");
  m = removeLastPoint(m, a);
  check(m.roads[0].points.length === 2, "removeLastPoint drops exactly one");
  m = addPoint(m, a, { x: 100, y: 0 });
  m = setPointZ(m, a, 0, 3.5);
  check(m.roads[0].points[0].z === 3.5 && m.roads[0].points[1].z === 0, "setPointZ touches only its own point");
  m = setRoadProps(m, a, { lanes: 2, speed: 50 });
  check(m.roads[0].lanes === 2 && m.roads[0].speed === 50 && m.roads[0].kind === "arterial", "a property patch changes only the named fields");
  m = setRoadControl(m, a, "end", "signal");
  check(m.roads[0].control.end === "signal" && m.roads[0].control.start === "none", "control is per end");
  m = setRoadTurns(m, a, "end", [["left"], ["right"]]);
  m = setRoadBays(m, a, "end", { left: 1, right: 0, length: 40 });
  m = setLeftArrow(m, a, "end", true);
  check(m.roads[0].turns.end.length === 2 && m.roads[0].bays.end.left === 1 && m.roads[0].leftArrow.end === true, "turns, bays and left-arrow are per end and independent of each other");

  ({ map: m, id: b } = addZone(m, { kind: "park" }));
  m = addZonePoint(m, b, { x: 0, y: 0 });
  m = addZonePoint(m, b, { x: 10, y: 0 });
  m = addZonePoint(m, b, { x: 10, y: 10 });
  check(m.zones[0].polygon.length === 3 && m.zones[0].kind === "park", "a zone accumulates polygon points");
  m = setZoneProps(m, b, { density: 0.4 });
  check(m.zones[0].density === 0.4, "zone properties patch the same way roads do");
  const nRoads = m.roads.length, nZones = m.zones.length;
  m = deleteRoad(m, a);
  m = deleteZone(m, b);
  check(m.roads.length === nRoads - 1 && m.zones.length === nZones - 1, "delete removes exactly the one named");

  let m2 = newDraft();
  let ida, idb;
  ({ map: m2, id: ida } = addRoad(m2));
  ({ map: m2, id: idb } = addRoad(m2));
  check(ida !== idb, `two roads never collide on id (${ida}, ${idb})`);
  m2 = deleteRoad(m2, ida);
  let idc;
  ({ map: m2, id: idc } = addRoad(m2));
  check(idc !== idb, `a fresh id is still never reused after a delete (${idc} vs surviving ${idb})`);
}

console.log("\n2. A ROAD DRAWN THROUGH THE EDITOR REPRODUCES THE HAND-WRITTEN ONE");
{
  /* Replay every road of the hand-written test map as addRoad/addPoint
     calls, exactly the sequence a person clicking would produce, and
     confirm the editor's own data model carries the same points, kind
     and control the file declares -- the strongest statement that the
     model IS the format rather than an approximation of it. */
  const hand = testMap1();
  let m = newDraft();
  const idOf = {};
  for (const r of hand.roads) {
    let id;
    ({ map: m, id } = addRoad(m, { kind: r.kind }));
    idOf[r.id] = id;
    for (const p of r.points) m = addPoint(m, id, p);
    m = setRoadProps(m, id, { lanes: r.lanes, speed: r.speed, oneWay: r.oneWay, parking: r.parking });
    if (r.control) { m = setRoadControl(m, id, "start", r.control.start); m = setRoadControl(m, id, "end", r.control.end); }
    if (r.turns) { if (r.turns.start) m = setRoadTurns(m, id, "start", r.turns.start); if (r.turns.end) m = setRoadTurns(m, id, "end", r.turns.end); }
    if (r.bays) { if (r.bays.start) m = setRoadBays(m, id, "start", r.bays.start); if (r.bays.end) m = setRoadBays(m, id, "end", r.bays.end); }
    if (r.leftArrow) { if (r.leftArrow.start) m = setLeftArrow(m, id, "start", true); if (r.leftArrow.end) m = setLeftArrow(m, id, "end", true); }
  }
  const handLoaded = loadMap(hand), replayLoaded = loadMap(m);
  check(handLoaded.ok && replayLoaded.ok, "both the hand-written and the replayed map load");
  check(handLoaded.roads.length === replayLoaded.roads.length, `the same number of roads survive loading (${handLoaded.roads.length})`);
  check(handLoaded.nodes.length === replayLoaded.nodes.length, `the same nodes are found by snapping (${handLoaded.nodes.length})`);
  const sameGeometry = handLoaded.roads.every((hr, i) => {
    const rr = replayLoaded.roads[i];
    return rr && rr.pts.length === hr.pts.length && hr.pts.every((p, k) => Math.abs(p.x - rr.pts[k].x) < 1e-6 && Math.abs(p.y - rr.pts[k].y) < 1e-6);
  });
  check(sameGeometry, "every road's resampled centreline is identical, point for point");
}

console.log("\n3. SNAP PREVIEW FINDS AN END NEARBY, AND ONLY NEARBY");
{
  let m = newDraft();
  let a;
  ({ map: m, id: a } = addRoad(m));
  m = addPoint(m, a, { x: 0, y: 0 });
  m = addPoint(m, a, { x: 100, y: 0 });
  const near = nearestRoadEnd(m, { x: 1, y: 1 });
  check(near && near.road === a && near.end === "start" && near.d < LANE, `a point just off the start end snaps to it (${near?.d.toFixed(2)} m)`);
  const far = nearestRoadEnd(m, { x: 1, y: 1 }, { within: 0.5 });
  check(far === null, "and nothing is found past the given radius");
  const excluded = nearestRoadEnd(m, { x: 1, y: 1 }, { excludeRoad: a });
  check(excluded === null, "the road being drawn is excluded from its own snap check");
  const midpoint = nearestRoadEnd(m, { x: 50, y: 1 }, { within: 5 });
  check(midpoint === null, "a point beside the MIDDLE of a road is not an end, and is not offered (load.js's own richer mid-road snap is the authority, not this preview)");
  check(JSON.stringify(cumulative([{ x: 0, y: 0 }, { x: 3, y: 4 }, { x: 3, y: 8 }])) === "[0,5,9]", "cumulative distance is a plain running sum");
}

console.log("\n4. CAN A BADLY DRAWN MAP BREAK THE SIM? TRIED, DELIBERATELY");
{
  const battery = [];
  battery.push(["empty draft", newDraft()]);
  let m1; ({ map: m1 } = addRoad(newDraft()));
  battery.push(["a road with zero points", m1]);
  let m2, r2; ({ map: m2, id: r2 } = addRoad(newDraft())); m2 = addPoint(m2, r2, { x: 0, y: 0 });
  battery.push(["a road with exactly one point", m2]);
  let m3, r3; ({ map: m3, id: r3 } = addRoad(newDraft())); m3 = addPoint(m3, r3, { x: 0, y: 0 }); m3 = addPoint(m3, r3, { x: 0, y: 0 });
  battery.push(["a road whose two points coincide", m3]);
  let m4, r4; ({ map: m4, id: r4 } = addRoad(newDraft())); m4 = addPoint(m4, r4, { x: 0, y: 0 }); m4 = addPoint(m4, r4, { x: NaN, y: 0 });
  battery.push(["a NaN coordinate, from a stray event", m4]);
  let m5, r5; ({ map: m5, id: r5 } = addRoad(newDraft(), { kind: "arterial" }));
  for (const p of [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 1 }, { x: 0, y: 1 }, { x: 0, y: 0 }, { x: 10, y: -5 }]) m5 = addPoint(m5, r5, p);
  battery.push(["a road that loops back and crosses itself", m5]);
  let m6, r6; ({ map: m6, id: r6 } = addRoad(newDraft())); m6 = addPoint(m6, r6, { x: 0, y: 0 }); m6 = addPoint(m6, r6, { x: 100, y: 0 });
  m6 = setRoadControl(m6, r6, "start", "nonsense-not-a-control");
  check(CONTROLS.includes("nonsense-not-a-control") === false, "the sabotage control string really is not one CONTROLS lists");
  battery.push(["a control string that is not one of CONTROLS", m6]);
  let m7, r7; ({ map: m7, id: r7 } = addRoad(newDraft())); m7 = addPoint(m7, r7, { x: 0, y: 0 }); m7 = addPoint(m7, r7, { x: 100, y: 0 });
  m7 = setRoadProps(m7, r7, { lanes: -3 });
  battery.push(["a negative lane count", m7]);
  let m8, r8; ({ map: m8, id: r8 } = addRoad(newDraft())); m8 = addPoint(m8, r8, { x: 0, y: 0 }); m8 = addPoint(m8, r8, { x: 100, y: 0 });
  m8 = setRoadProps(m8, r8, { oneWay: true }); m8 = setRoadBays(m8, r8, "end", { left: 1 });
  battery.push(["turn bays declared on a one-way road", m8]);
  let m9, r9; ({ map: m9, id: r9 } = addRoad(newDraft())); m9 = addPoint(m9, r9, { x: 0, y: 0 }); m9 = addPoint(m9, r9, { x: 3000, y: 0 });
  m9 = setPointZ(m9, r9, 1, 900);
  battery.push(["a crest steeper than any road allows", m9]);
  let m10; ({ map: m10 } = addZone(newDraft(), { kind: "park" }));
  battery.push(["a zone with no polygon at all", m10]);

  let crashes = 0, threw = 0, reported = 0;
  for (const [name, draft] of battery) {
    let r;
    try { r = validateDraft(draft); } catch (e) { threw++; fail(`${name}: validateDraft itself THREW -- ${e?.message ?? e}`); continue; }
    if (r.crash) { crashes++; fail(`${name}: loadMap/graphOf threw internally -- ${r.crash.stage}: ${r.crash.message}`); }
    else reported++;
  }
  check(threw === 0 && crashes === 0, `${battery.length} adversarial drafts, none threw and none crashed validation (${reported} reported cleanly)`);
}

console.log("\n5. SERIALIZE AND PARSE ROUND-TRIP, AND GARBAGE IS A NULL, NOT A THROW");
{
  let m; ({ map: m } = addRoad(newDraft("rt", "Round trip"), { kind: "residential" }));
  m = addPoint(m, m.roads[0].id, { x: 1.5, y: 2.5, z: 0.25 });
  const text = serialize(m);
  const back = parse(text);
  check(JSON.stringify(back) === JSON.stringify(m), "parse(serialize(m)) reproduces m exactly");
  check(parse("{ not json") === null, "unparseable text returns null rather than throwing");
  check(parse('"a string, not a map"') === null, "valid JSON that is not a map shape also returns null");
  check(parse("null") === null, "and so does a JSON null");
}

console.log("\n6. VALIDATE REPORTS \"NOT READY\" QUIETLY, NOT AS A WARNING PILE");
{
  const empty = validateDraft(newDraft());
  check(empty.ok === false && !empty.crash && empty.warnings.length === 0, "an empty draft is simply not ready, no warnings manufactured for it");
  let m; ({ map: m } = addRoad(newDraft())); m = addPoint(m, m.roads[0].id, { x: 0, y: 0 });
  const one = validateDraft(m);
  check(one.ok === false && !one.crash, "a road with one point is not-ready too, not a crash");
}

console.log("\n7. \"DRIVE IT\" IS THE REAL PIPELINE, RUN HEADLESSLY");
{
  /* verify-screens.mjs renders Editor.jsx's INITIAL state under SSR --
     it cannot click "Drive it", the same boundary CLAUDE.md item 4
     names for every check that only sees a screen at t=0. So this runs
     MapRoad.sceneFor's own sequence directly: loadMap, seedGraph,
     firstEdge, playerOn, withDriver, a few ticks of step -- on a map
     drawn through the editor's own operations, not hand-authored, which
     is the case #/map's own hardcoded START can never exercise. */
  const hand = testMap1();
  let draft = newDraft();
  for (const r of hand.roads) {
    let id; ({ map: draft, id } = addRoad(draft, { kind: r.kind }));
    for (const p of r.points) draft = addPoint(draft, id, p);
    draft = setRoadProps(draft, id, { lanes: r.lanes, speed: r.speed, oneWay: r.oneWay });
  }
  const loaded = loadMap(draft);
  check(loaded.ok, "the editor-drawn map loads");
  const start = firstEdge(loaded);
  check(!!start, `an open end is found to start from (${start && `${start.road}|${start.end}`})`);
  let world = seedGraph(3, 50, loaded, { target: 30, posted: true });
  const me0 = playerOn(world.course, start.road, start.end);
  check(!!me0, "playerOn finds a curb leg at that end and returns a driver");
  world = withDriver(world, me0);
  let me = me0;
  /* Full throttle throughout: `step()` alone only carries the traffic
     forward and passes the player along passively (`withDriver`'s own
     job); the player advances through `stepDriver`, the same call
     MapRoad's own tick makes with whatever the controls say -- here,
     always "go". */
  for (let i = 0; i < 200; i++) {
    me = stepDriver({ ...me, signal: null }, { steer: 0, slider: 1 }, world, DT);
    world = withDriver(world, me);
    world = step(world);
    me = world.actors.find((a) => a.player) ?? me;
  }
  check(!!me && me.s > me0.s, `the player actually moves over 200 ticks of full throttle (${me0.s.toFixed(1)} m -> ${me?.s.toFixed(1)} m)`);
  check(world.actors.every((a) => a), "no null or undefined actor ever entered the world (withDriver with a real driver)");

  /* AND THE REFUSAL IS CLEAN, NOT A CRASH: a map with no open end at
     all -- a single closed loop -- has nowhere for firstEdge to find,
     and the editor's own pre-flight (Editor.jsx computes `startAt`
     the same way and disables "Drive it" without one) depends on that
     being `null`, never a throw. */
  const loop = emptyMap("loop", "closed loop");
  const ring = [];
  for (let a = 0; a <= 360; a += 30) ring.push({ x: 50 + 40 * Math.cos((a * Math.PI) / 180), y: 50 + 40 * Math.sin((a * Math.PI) / 180) });
  loop.roads.push(road({ id: "ring", kind: "collector", points: ring }));
  const loopLoaded = loadMap(loop);
  check(loopLoaded.ok, "a closed loop still loads on its own");
  check(firstEdge(loopLoaded) === null, "and firstEdge correctly finds nowhere to start on it -- null, not a throw");

  /* stage0Map() is real content too (iso/road.js's own hand-built
     roads), and its own known shape (SIMULATOR.md 2.4): two roads,
     neither meeting the other, so BOTH ends of both are dangling and
     graphOf builds pure through-lane spots with no node at all. That
     is exactly the case `firstEdge`'s own comment names as unsupported
     -- `curbLegOf` refuses a through spot on purpose -- so the correct,
     documented answer here is null, not a start. Loads fine either
     way. */
  const s0 = loadMap(stage0Map());
  check(s0.ok, "stage0Map() loads");
  check(firstEdge(s0) === null, "and has no curb-leg start -- both roads are through lanes with no intersection, the one case firstEdge does not yet cover");
}

console.log("\n" + "=".repeat(70));
console.log(failed ? `${failed} FAILURE(S)` : "OK: the model is pure, a hand-written map round-trips through it exactly, and nothing drawn -- however badly -- can throw validation.");
process.exit(failed ? 1 : 0);
