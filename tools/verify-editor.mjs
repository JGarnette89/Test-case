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
  nearestOnRoad, splitRoad, joinCrossing, setRoadRamp, setRoadHump, controlAt,
  deletePoint, subdivideRoad, smoothRoad,
  addProp, setPropProps, deleteProp, propAt, footprintOf, headingToRoad,
} from "../src/editor/model.js";
import { validateDraft } from "../src/editor/validate.js";
import { CLEARANCE_MIN } from "../src/map/load.js";
import { listMaps, saveMap, openMap, deleteMap, prunedList } from "../src/editor/library.js";
import { zoomAbout, pinchView, panView, isTap, toWorld as viewToWorld, MIN_SCALE, MAX_SCALE, dragIntent, fitView } from "../src/editor/gesture.js";
import { graphOf } from "../src/sim/graph.js";
import { overlapping } from "../src/sim/crossing.js";
import { testMap1 } from "../src/map/samples.js";
import { loadMap } from "../src/map/load.js";
import { LANE, CONTROLS, emptyMap, road, stage0Map } from "../src/map/format.js";
import { seedGraph, step } from "../src/sim/crossing.js";
import { playerOn, withDriver, driverPose, stepDriver } from "../src/sim/drive.js";
import { DT } from "../src/sim/traffic.js";
import { firstEdge } from "../src/map/edges.js";
import { emptyHistory, record, undo as undoStep, redo as redoStep, changeKey, COALESCE_MS, HISTORY_MAX } from "../src/editor/history.js";

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
  m = setRoadBays(m, a, "end", { left: 1, right: 0, length: 40 });
  m = setRoadTurns(m, a, "end", [["left"], ["straight"], ["right"]]);
  m = setLeftArrow(m, a, "end", true);
  check(m.roads[0].turns.end.length === 3 && m.roads[0].bays.end.left === 1 && m.roads[0].leftArrow.end === true && m.roads[0].turns.start == null, "turns, bays and left-arrow are per end and independent of each other");
  check(setRoadBays(m, a, "end", { left: 1, right: 0, length: 60 }).roads[0].turns.end.length === 3, "a bay change that leaves the lanes at the line alone keeps the turns override");
  check(setRoadBays(m, a, "end", null).roads[0].turns.end == null, "one that changes how many lanes are at the line drops it, rather than leave a wrong-length list for the graph to refuse");

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

  /* A single closed loop: its two ends meet each other and no node, so
     the loader marks both open and graphOf builds it as a through road
     -- which is a start now, not the refusal it used to be. The
     refusal that must stay clean is the empty map: nothing at all,
     `null`, never a throw, since Editor.jsx disables "Drive it" on
     exactly that. */
  const loop = emptyMap("loop", "closed loop");
  const ring = [];
  for (let a = 0; a <= 360; a += 30) ring.push({ x: 50 + 40 * Math.cos((a * Math.PI) / 180), y: 50 + 40 * Math.sin((a * Math.PI) / 180) });
  loop.roads.push(road({ id: "ring", kind: "collector", points: ring }));
  const loopLoaded = loadMap(loop);
  check(loopLoaded.ok, "a closed loop still loads on its own");
  check(firstEdge(loopLoaded)?.through === true, "and it has a start, as a through road");
  check(firstEdge(loadMap(emptyMap("none", "nothing"))) === null, "an empty map has nowhere to start -- null, not a throw");

  /* A road that meets nothing -- the first thing anybody draws, and
     stage0Map()'s own shape (two roads, neither meeting the other) --
     is a through spot with no node. "Drive it" has to work on it, so
     firstEdge falls back to one, asked for by name (`through`), and
     only when no road meets a node: on the test map above the start
     is still the approach into an intersection. Driven the whole way:
     the car reaches the far end and stops there, which is what every
     open end does. Sabotaged: without the fallback this is null. */
  check(!start.through, "on a map with an intersection the start is still an approach into it, never a through road");
  for (const [name, raw] of [["one road drawn", (() => { let d, id; ({ map: d, id } = addRoad(newDraft())); d = addPoint(d, id, { x: 0, y: 0 }); return addPoint(d, id, { x: 300, y: 50 }); })()], ["stage0Map()", stage0Map()]]) {
    const L = loadMap(raw);
    const st = firstEdge(L);
    let w = seedGraph(3, 50, L, { target: 10, posted: true });
    const p0 = st && playerOn(w.course, st.road, st.end, { through: !!st.through });
    check(!!st?.through && !!p0, `${name}: no intersection anywhere, and there is still somewhere to start (${st && `${st.road}|${st.end}, through`})`);
    if (!p0) continue;
    const len = L.roads.find((r) => r.id === st.road).length;
    w = withDriver(w, p0); let q = p0;
    for (let i = 0; i < 1200; i++) {
      q = stepDriver({ ...q, signal: null }, { steer: 0, slider: 1 }, w, DT);
      w = withDriver(w, q); w = step(w);
      q = w.actors.find((a) => a.player) ?? q;
    }
    check(q.s > 0.5 * len && w.actors.every((a) => a), `${name}: a minute of full throttle drives it (${q.s.toFixed(0)} m of ${len.toFixed(0)}), nothing null in the world`);
  }
}

console.log("\n8. AN OVERPASS IS AUTHORABLE, AND DISTINGUISHABLE FROM A TIGHT CROSSING");
{
  /* SIMULATOR.md section 1: elevation including overpasses is part of
     what the editor has to be able to draw. Two roads crossing in
     plan with no node -- an overpass is exactly that, at a real
     clearance -- and load.js already carries the whole rule
     (CLAUDE.md, "an approach is deceleration"'s sibling for elevation:
     one quantity, not re-derived at the editor). This is the editor's
     own operations producing both the good case and the one load.js
     is right to refuse, so the canvas (Editor.jsx's own overpass gap,
     drawn from this same `crossings` list) has real data to draw. */
  const crossing = (zLow, zHigh) => {
    let m = newDraft(); let a, b;
    ({ map: m, id: a } = addRoad(m, { kind: "arterial" }));
    m = addPoint(m, a, { x: 0, y: 50 }); m = addPoint(m, a, { x: 100, y: 50 });
    ({ map: m, id: b } = addRoad(m, { kind: "collector" }));
    m = addPoint(m, b, { x: 50, y: 0 }); m = setPointZ(m, b, 0, zHigh);
    m = addPoint(m, b, { x: 50, y: 2 }); m = setPointZ(m, b, 1, zHigh);
    m = addPoint(m, b, { x: 50, y: 100 }); m = setPointZ(m, b, 2, zHigh);
    return validateDraft(m);
  };
  const over = crossing(0, CLEARANCE_MIN + 3);
  check(over.ok && over.warnings.every((w) => w.code !== "cross-no-node") && over.loaded.crossings.length === 1 && over.loaded.crossings[0].gap >= CLEARANCE_MIN,
    `a real overpass (${CLEARANCE_MIN + 3} m clear) loads with no crossing warning, and one crossing is recorded with its gap (${over.loaded?.crossings?.[0]?.gap} m)`);
  const tight = crossing(0, 1);
  check(tight.ok && tight.warnings.some((w) => w.code === "cross-no-node") && tight.loaded.crossings[0].gap < CLEARANCE_MIN,
    `and the identical shape at 1 m of clearance is refused as an overpass -- still loads, but warned, which is what tells the editor not to draw a gap there`);
}

console.log("\n9. THE LIBRARY: MULTIPLE MAPS AS DATA, NOT ONE SCRATCH SLOT");
{
  let d1; ({ map: d1 } = addRoad(newDraft())); d1 = addPoint(d1, d1.roads[0].id, { x: 0, y: 0 }); d1 = addPoint(d1, d1.roads[0].id, { x: 20, y: 0 });
  const saved1 = await saveMap(d1, "First sketch");
  const saved2 = await saveMap(d1, "Second sketch");
  check(saved1.id !== saved2.id, `two saves never collide on id (${saved1.id}, ${saved2.id})`);
  const list = await listMaps();
  check(list.some((e) => e.id === saved1.id && e.name === "First sketch") && list.some((e) => e.id === saved2.id && e.name === "Second sketch"),
    `both are listed, by name (${list.length} in the library)`);
  const reopened = await openMap(saved1.id);
  check(JSON.stringify(reopened) === JSON.stringify(saved1), "opening a saved map returns exactly what was saved");
  const resaved = await saveMap({ ...d1, roads: [] }, "First sketch", saved1.id);
  check(resaved.id === saved1.id, "saving again with the same id overwrites in place rather than creating a second entry");
  const listAfter = await listMaps();
  check(listAfter.filter((e) => e.id === saved1.id).length === 1, "and the library still lists it once, not twice");
  await deleteMap(saved2.id);
  check((await listMaps()).every((e) => e.id !== saved2.id), "delete removes it from the index");
  check((await openMap(saved2.id)) === null, "and opening a deleted map returns null, not a throw");

  /* THE INDEX CAN GO STALE -- sabotaged directly, not by construction:
     an index entry whose map key never existed (or was removed some
     other way) must not surface as an openable map. */
  const before = await listMaps();
  await import("../src/storage.js").then(({ writeJSON }) => writeJSON("row.editor.library.v1", [...before, { id: "ghost-id", name: "a stale entry", savedAt: Date.now() }]));
  const withGhost = await listMaps();
  check(withGhost.some((e) => e.id === "ghost-id"), "the sabotage actually planted a stale entry");
  const pruned = await prunedList();
  check(pruned.every((e) => e.id !== "ghost-id") && (await listMaps()).every((e) => e.id !== "ghost-id"),
    "prunedList removes an entry whose map is gone, and the index it wrote back stays pruned");
}

console.log("\n10. THE VIEW DOES WHAT A THUMB EXPECTS -- COMPUTED, SINCE IT CANNOT BE WATCHED HERE");
{
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  const v = { x0: 100, y0: 50, scale: 4 };
  const under = viewToWorld(v, 120, 80);
  const z = zoomAbout(v, 120, 80, 1.5);
  const after = viewToWorld(z, 120, 80);
  check(near(z.scale, 6) && near(under.x, after.x) && near(under.y, after.y), "zooming keeps the world point under the cursor exactly where it was");
  check(zoomAbout(v, 0, 0, 1000).scale === MAX_SCALE && zoomAbout(v, 0, 0, 1e-6).scale === MIN_SCALE, "and the scale is clamped at both ends");
  /* THE WHOLE WORLD FITS A PHONE (28 September): eight square kilometres
     is about 2.8 km a side, and at the widest zoom a 400 px screen holds it. */
  check(400 / MIN_SCALE >= 2830, `zoomed right out a 400 px phone shows ${(400 / MIN_SCALE / 1000).toFixed(1)} km across -- the eight square kilometres is 2.8 km a side`);
  const fit = fitView({ x: 100, y: -50, w: 2800, h: 1900 }, { w: 400, h: 700 });
  const tl = viewToWorld(fit, 0, 0), br = viewToWorld(fit, 400, 700);
  check(tl.x <= 100 && tl.y <= -50 && br.x >= 2900 && br.y >= 1850, "\"Whole map\" puts every corner of the map on the screen");
  /* THE GESTURE RULE: a drag pans unless it starts on the thing already
     selected. Taps are unchanged (they draw and select). */
  const pt = { road: "r1", index: 3 };
  check(dragIntent({ tool: "select", point: pt, prop: null, selected: null }) === "pan"
    && dragIntent({ tool: "select", point: pt, prop: null, selected: { type: "road", id: "r2" } }) === "pan"
    && dragIntent({ tool: "select", point: pt, prop: null, selected: { type: "road", id: "r1" } }) === "point"
    && dragIntent({ tool: "building", point: null, prop: "b7", selected: null }) === "pan"
    && dragIntent({ tool: "building", point: null, prop: "b7", selected: { type: "prop", id: "b7" } }) === "prop"
    && dragIntent({ tool: "pan", point: pt, prop: null, selected: { type: "road", id: "r1" } }) === "pan",
    "a drag pans -- on any road point, on any building -- unless it starts on the road or building already selected, which it moves");

  /* A pinch: two fingers spreading to twice their distance about the
     same midpoint doubles the scale and keeps the world under that
     midpoint still; the same fingers both moving 30 px right, apart
     unchanged, pan by 30 px of world and do not zoom at all. */
  const start = { a: { x: 100, y: 100 }, b: { x: 200, y: 100 }, view: v };
  const mid = viewToWorld(v, 150, 100);
  const spread = pinchView(start, { x: 50, y: 100 }, { x: 250, y: 100 });
  const midAfter = viewToWorld(spread, 150, 100);
  check(near(spread.scale, 8) && near(mid.x, midAfter.x) && near(mid.y, midAfter.y), "a pinch spreading 2x doubles the zoom about the fingers, the world under them unmoved");
  const slide = pinchView(start, { x: 130, y: 100 }, { x: 230, y: 100 });
  check(near(slide.scale, 4) && near(viewToWorld(slide, 180, 100).x, mid.x), "two fingers sliding together pan without zooming, the world following the fingers");

  const panned = panView(v, { x: 10, y: 10 }, { x: 50, y: 30 });
  check(near(viewToWorld(panned, 50, 30).x, viewToWorld(v, 10, 10).x) && near(viewToWorld(panned, 50, 30).y, viewToWorld(v, 10, 10).y), "a one-finger drag carries the world point under the finger with it");
  check(isTap({ x: 0, y: 0 }, { x: 5, y: 5 }) && !isTap({ x: 0, y: 0 }, { x: 9, y: 0 }), "a finger that wanders a few pixels still taps; one that travels is a drag, and places nothing");
}

console.log("\n11. A BIG ARTERIAL DRAWN ENTIRELY THROUGH THE EDITOR'S OWN APPROACH CONTROLS");
{
  /* Node E was hand-authored in map/samples.js; the editor now has the
     same three controls per approach -- a signal, turn bays, a protected
     left arrow -- so the same intersection can be DRAWN. This builds one
     from nothing but those operations and asks the sim what it made. */
  let m = newDraft("art", "arterial");
  const C = { x: 500, y: 500 };
  const arms = [["n", { x: 500, y: 80 }], ["s", { x: 500, y: 920 }], ["e", { x: 920, y: 500 }], ["w", { x: 80, y: 500 }]];
  for (const [, far] of arms) {
    let id; ({ map: m, id } = addRoad(m, { kind: "arterial" }));
    for (let i = 0; i <= 20; i++) m = addPoint(m, id, { x: far.x + ((C.x - far.x) * i) / 20, y: far.y + ((C.y - far.y) * i) / 20 });
    m = setRoadControl(m, id, "end", "signal");
    m = setRoadBays(m, id, "end", { left: 1, right: 1 });
    m = setLeftArrow(m, id, "end", true);
  }
  const v = validateDraft(m);
  check(v.ok && v.errors.length === 0, `it loads, and every lane lands (${v.errors.length} connectivity errors)`);
  const g = graphOf(v.loaded);
  const node = g.at.find((spot) => !spot.through);
  const bays = Object.values(node.layout.legs).filter((l) => l.bay);
  check(bays.length === 8, `it has the bays that were asked for: ${bays.length} (a left and a right on each of four approaches)`);
  check(node.layout.signal && Object.values(node.layout.signal.arrows).every(Boolean) && node.layout.signal.lead.every((x) => x > 0),
    "and its signal runs a protected left on every approach, from the arrows ticked");
  const lefts = Object.values(node.layout.paths).filter((p) => p.intent === "left");
  check(lefts.length > 0 && lefts.every((p) => node.layout.legs[p.from].bay === "left"), `every left is made from a left bay (${lefts.length} paths)`);
  let w = seedGraph(3, 60, v.loaded, { target: 60, posted: true });
  let overlaps = 0;
  for (let i = 0; i < 20 * 60; i++) { w = step(w); if (i % 5 === 0) overlaps += overlapping(w).length; }
  check(overlaps === 0, `a minute of traffic through it at 60 cars: ${overlaps} overlapping car-ticks`);
}

console.log("\n12. JOINING ROADS THE WAY A PERSON MEANS, AND A WHOLE ROAD'S HEIGHT FROM TWO NUMBERS");
{
  /* A T: a road ending 2.5 m off the MIDDLE of another -- a fingertip's
     error on a phone, just inside the loader's own 3.6 m -- snapped onto
     the line by the editor, so the join is certain. */
  let m = newDraft(); let a, b, c;
  ({ map: m, id: a } = addRoad(m)); for (let i = 0; i <= 10; i++) m = addPoint(m, a, { x: i * 20, y: 100 });
  ({ map: m, id: b } = addRoad(m)); m = addPoint(m, b, { x: 103, y: 0 });
  const snap = nearestOnRoad(m, { x: 103, y: 97.5 }, { within: 6, excludeRoad: b });
  check(snap && snap.road === a && Math.abs(snap.at.y - 100) < 1e-9, `a point beside the middle of a road snaps onto its line (${snap?.d.toFixed(1)} m off)`);
  m = addPoint(m, b, snap.at);
  const t = validateDraft(m);
  check(t.ok && t.loaded.nodes.length === 1 && t.loaded.nodes[0].legs.length === 3, `and the loader makes a T of it: one node, ${t.loaded.nodes[0]?.legs.length} legs`);

  /* A crossroads: a road drawn straight across both, at the same height
     -- the loader warns, rightly, since it cannot know an overpass was
     not meant. joinCrossing is the fix that warning offers. */
  ({ map: m, id: c } = addRoad(m)); for (let i = 0; i <= 10; i++) m = addPoint(m, c, { x: 150, y: i * 20 });
  const before = validateDraft(m);
  const cr = before.loaded.crossings.find((x) => x.gap < CLEARANCE_MIN);
  check(before.warnings.some((w) => w.code === "cross-no-node") && cr, "a road drawn across another at one height is warned, and the crossing recorded");
  const draftIds = cr.roads.map((id) => id.split("#")[0]);
  check(draftIds.includes(a) && draftIds.includes(c), `the crossing's roads map back to the draft's own ids (${cr.roads.join(", ")} -> ${draftIds.join(", ")})`);
  const joined = joinCrossing(m, draftIds[0], draftIds[1], cr.at);
  const after = validateDraft(joined);
  const legs = after.loaded.nodes.map((n) => n.legs.length).sort();
  check(after.ok && after.warnings.every((w) => w.code !== "cross-no-node") && after.errors.length === 0 && legs.includes(4),
    `joined: the warning is gone, a four-legged node is there (node legs ${legs.join(", ")}), and every lane lands`);

  /* splitRoad keeps each end's own fields on the half that has that end. */
  let s1 = newDraft(); let r;
  ({ map: s1, id: r } = addRoad(s1)); s1 = addPoint(s1, r, { x: 0, y: 0 }); s1 = addPoint(s1, r, { x: 100, y: 0 });
  s1 = setRoadControl(s1, r, "start", "stop"); s1 = setRoadControl(s1, r, "end", "signal"); s1 = setLeftArrow(s1, r, "end", true);
  const sp = splitRoad(s1, r, 0, { x: 40, y: 0 });
  const [h1, h2] = sp.ids.map((id) => sp.map.roads.find((x) => x.id === id));
  /* A stop is a SIGN standing at its road end now (model.js `controlAt`
     reads it), so the rule at each end is read where it lives. */
  check(sp.ids[0] !== sp.ids[1] && controlAt(sp.map, h1, "start") === "stop" && controlAt(sp.map, h1, "end") === "none" && controlAt(sp.map, h2, "start") === "none" && controlAt(sp.map, h2, "end") === "signal" && h2.leftArrow.end === true && !h1.leftArrow.end,
    "a split keeps the start's control on the first half and the end's control and arrow on the second, with a fresh id");

  /* Elevation from two numbers. */
  let e = newDraft(); let q;
  ({ map: e, id: q } = addRoad(e)); for (let i = 0; i <= 10; i++) e = addPoint(e, q, { x: i * 10, y: 0 });
  const ramp = setRoadRamp(e, q, 0, 8).roads[0].points.map((p) => p.z);
  check(ramp[0] === 0 && ramp[10] === 8 && Math.abs(ramp[5] - 4) < 1e-9, `a ramp runs straight from start to end by distance (0, ${ramp[5]}, ${ramp[10]})`);
  const hump = setRoadHump(e, q, 7).roads[0].points.map((p) => p.z);
  check(hump[0] === 0 && Math.abs(hump[10]) < 1e-9 && Math.abs(hump[5] - 7) < 1e-9, `a hump rises by its peak in the middle and meets the ground at both ends (${hump[5]})`);
  const bridge = (() => {
    let mm = newDraft(); let lo, hi;
    ({ map: mm, id: lo } = addRoad(mm)); mm = addPoint(mm, lo, { x: 0, y: 50 }); mm = addPoint(mm, lo, { x: 100, y: 50 });
    ({ map: mm, id: hi } = addRoad(mm)); for (let i = 0; i <= 10; i++) mm = addPoint(mm, hi, { x: 50, y: i * 20 - 50 });
    return validateDraft(setRoadHump(mm, hi, 7));
  })();
  check(bridge.ok && bridge.warnings.every((w) => w.code !== "cross-no-node") && bridge.loaded.crossings[0]?.gap >= CLEARANCE_MIN,
    `and a hump over another road IS an overpass: one number turns a flat crossing into ${bridge.loaded.crossings[0]?.gap.toFixed(1)} m of clearance, no warning`);
}

console.log("\n13. VALIDATING A TAP IS FAST, AND LOSES NOTHING BY IT");
{
  /* validate.js builds its graph WITHOUT the conflict table (graph.js
     `conflicts: false`), which is ~99% of graphOf's cost. That is only
     honest if the authoring errors come out the same -- so compare them
     on a map that HAS errors: the test map with its turn overrides left
     out, which strands two collectors' curb lanes at the five-way. */
  const hand = testMap1();
  let m = newDraft();
  for (const r of hand.roads) {
    let id; ({ map: m, id } = addRoad(m, { kind: r.kind }));
    for (const p of r.points) m = addPoint(m, id, p);
    m = setRoadProps(m, id, { lanes: r.lanes, speed: r.speed, oneWay: r.oneWay });
  }
  const loaded = loadMap(m);
  const full = graphOf(loaded), lite = graphOf(loaded, { conflicts: false });
  check(full.errors.length > 0 && JSON.stringify(full.errors) === JSON.stringify(lite.errors),
    `the same ${full.errors.length} authoring errors with and without the conflict table`);
  check(lite.conflictsSkipped === true && !full.conflictsSkipped && Object.keys(full.at.find((s) => !s.through).layout.conflicts).length > 0,
    "and the lite graph says so of itself, while the full one -- what Drive it and #/map build -- still has its conflicts");
  const v = validateDraft(m);
  check(JSON.stringify(v.errors) === JSON.stringify(full.errors), "validateDraft reports exactly those errors");
  const t = [];
  for (let i = 0; i < 5; i++) { const a = performance.now(); validateDraft(m); t.push(performance.now() - a); }
  t.sort((a, b) => a - b);
  check(t[2] < 60, `and it takes ${t[2].toFixed(1)} ms for ${m.roads.length} roads on this machine (a phone is 3-5x slower; the full graph took ~600)`);
}

console.log("\n14. RESHAPING: A TAPPED ZIGZAG BECOMES A ROAD A CAR CAN TAKE AT SPEED");
{
  let m = newDraft(); let r;
  ({ map: m, id: r } = addRoad(m, { kind: "arterial" }));
  for (const p of [{ x: 0, y: 0 }, { x: 60, y: 0 }, { x: 60, y: 60 }, { x: 120, y: 60 }, { x: 120, y: 120 }]) m = addPoint(m, r, p);
  const pts = (mm) => mm.roads[0].points;

  let two; ({ map: two } = addRoad(newDraft())); two = addPoint(two, two.roads[0].id, { x: 0, y: 0 }); two = addPoint(two, two.roads[0].id, { x: 10, y: 0 });
  check(pts(deletePoint(two, two.roads[0].id, 0)).length === 2, "deleting a point from a two-point road is refused -- a road keeps two");
  check(pts(deletePoint(m, r, 2)).length === 4 && pts(deletePoint(m, r, 2)).every((q) => !(q.x === 60 && q.y === 60)), "and from a longer one it removes exactly that point");
  const sub = pts(subdivideRoad(m, r));
  check(sub.length === 9 && sub[1].x === 30 && sub[1].y === 0, `subdividing puts a point in the middle of every segment (${sub.length} points)`);

  let sm = m;
  for (let i = 0; i < 3; i++) sm = smoothRoad(sm, r);
  const a = pts(m), b = pts(sm);
  check(b[0].x === a[0].x && b[0].y === a[0].y && b.at(-1).x === a.at(-1).x && b.at(-1).y === a.at(-1).y, "smoothing keeps both ends exactly where they were, so a junction stays joined");

  /* What it is FOR, measured by the loader's own bend rule: a road drawn
     as right angles has its posted speed cut to what the corner allows;
     smoothed, the corners open and the road keeps more of its speed. */
  const raw = loadMap(m).roads[0], smooth = loadMap(sm).roads[0];
  check(smooth.speed > raw.speed, `the loader posts the smoothed road faster: ${raw.speed} km/h as tapped, ${smooth.speed} km/h after three passes (arterial default 60)`);
}

console.log("\n15. LANE ARROWS: THE PANEL SHOWS WHAT THE SIM WILL DO, AND WRITES THE FORMAT'S OWN OVERRIDE");
{
  /* A crossroads of two-lane roads, drawn and joined through the
     editor's own operations. */
  let m = newDraft(); let a, b;
  ({ map: m, id: a } = addRoad(m, { kind: "arterial" })); m = addPoint(m, a, { x: 0, y: 100 }); m = addPoint(m, a, { x: 200, y: 100 });
  ({ map: m, id: b } = addRoad(m, { kind: "arterial" })); m = addPoint(m, b, { x: 100, y: 0 }); m = addPoint(m, b, { x: 100, y: 200 });
  m = setRoadProps(m, a, { lanes: 2 }); m = setRoadProps(m, b, { lanes: 2 });
  const cr = validateDraft(m).loaded.crossings[0];
  m = joinCrossing(m, a, b, cr.at);
  const v = validateDraft(m);
  const keys = Object.keys(v.approaches ?? {}).sort();
  check(v.ok && keys.length === 4 && keys.every((k) => !k.includes("#")), `every approach into the node is keyed by a DRAFT road end (${keys.join(", ")})`);
  const k0 = keys[0], [r0, e0] = k0.split("|");
  const rule = v.approaches[k0];
  check(!rule.given && JSON.stringify(rule.turns) === JSON.stringify([["left", "straight"], ["straight", "right"]]) && rule.offered.length === 3,
    `untouched, it shows the general rule: ${JSON.stringify(rule.turns)}`);

  /* A left-only centre lane, set through the model the toggles call. */
  const want = [["left"], ["straight", "right"]];
  const m2 = setRoadTurns(m, r0, e0, want);
  const v2 = validateDraft(m2);
  check(v2.approaches[k0].given && JSON.stringify(v2.approaches[k0].turns) === JSON.stringify(want) && v2.errors.length === 0,
    "an override is what the graph then uses, with no authoring error");
  const full = graphOf(v2.loaded);
  const legs = full.at.flatMap((s) => Object.values(s.layout.legs)).filter((l) => l.road.split("#")[0] === r0 && l.end === e0);
  check(legs.length === 2 && legs.every((l) => JSON.stringify(l.turns) === JSON.stringify(want[l.pos])), "and the FULL graph -- the one Drive it builds -- gives each lane exactly that");
  check(!validateDraft(setRoadTurns(m2, r0, e0, null)).approaches[k0].given, "Reset to rule clears it");
  check(setRoadProps(m2, r0, { lanes: 3 }).roads.find((r) => r.id === r0).turns[e0] == null, "changing the lane count drops an override that would now be the wrong length");

  /* A T made by the loader's own split: the approaches at the node the
     split made are not draft road ends, and are not offered. */
  let t = newDraft(); let c, d;
  ({ map: t, id: c } = addRoad(t)); t = addPoint(t, c, { x: 0, y: 0 }); t = addPoint(t, c, { x: 200, y: 0 });
  ({ map: t, id: d } = addRoad(t)); t = addPoint(t, d, { x: 100, y: 100 }); t = addPoint(t, d, { x: 100, y: 1.5 });
  const vt = validateDraft(t);
  check(vt.ok && Object.keys(vt.approaches).join() === `${d}|end`, `at a T the loader split, only the stem's own end is offered (${Object.keys(vt.approaches).join(", ")})`);
}

console.log("\n16. BUILDINGS: PLACED BY HAND, FACING THEIR STREET, AND NEVER ON THE ROAD");
{
  /* An arterial along y = 0 at 20 degrees, so "facing the road" is not
     accidentally the default heading of 0. Its surface reaches 7.2 m
     either side (two lanes each way). */
  const ang = 20, rad = (ang * Math.PI) / 180, along = (d, off) => ({ x: d * Math.cos(rad) - off * Math.sin(rad), y: d * Math.sin(rad) + off * Math.cos(rad) });
  let m = newDraft(); let r;
  ({ map: m, id: r } = addRoad(m, { kind: "arterial" })); m = addPoint(m, r, along(0, 0)); m = addPoint(m, r, along(300, 0));
  m = setRoadProps(m, r, { lanes: 2 });
  let b1, b2, b3;
  ({ map: m, id: b1 } = addProp(m, { kind: "house", at: along(100, 7.2 + 4.5 + 3) }));    // 3 m back from the curb
  ({ map: m, id: b2 } = addProp(m, { kind: "shop", at: along(200, 7.2 + 8 - 2) }));       // 2 m over the curb
  ({ map: m, id: b3 } = addProp(m, { kind: "apartment", at: { x: 1000, y: 1000 } }));    // nowhere near a road
  const hd = m.props.map((p) => p.heading);
  check(Math.abs(hd[0] - ang) < 1e-6 && Math.abs(hd[1] - ang) < 1e-6 && hd[2] === 0, `a building faces the nearest road (${hd[0].toFixed(1)}°, ${hd[1].toFixed(1)}°), and one with none near sits square (${hd[2]}°)`);
  check(propAt(m, along(100, 7.2 + 4.5 + 3)) === b1 && propAt(m, along(100, 7.2 + 4.5 + 3 + 4)) === b1 && propAt(m, along(100, 7.2 + 4.5 + 3 + 5)) === null,
    "a tap hits a building inside its footprint and not a metre past its back wall (9 m deep)");

  const v = validateDraft(m);
  const kept = v.loaded.props.map((p) => p.id).sort();
  check(v.ok && kept.join() === [b1, b3].sort().join() && v.warnings.some((w) => w.code === "prop-on-road" && w.message.includes(b2)),
    `loaded: the two off the road are kept (${kept.join(", ")}), the one 2 m over the curb is dropped with a warning at the spot`);
  const lp = v.loaded.props.find((p) => p.id === b1);
  const fp = footprintOf(m.props[0]);
  check(lp.l === fp.l && lp.w === fp.w && lp.h === fp.h, `the editor's footprint is the loader's (${fp.l} x ${fp.w} x ${fp.h} m)`);
  const moved = setPropProps(m, b2, { at: along(200, 7.2 + 8 + 1) });
  check(validateDraft(moved).loaded.props.length === 3, "moved a metre back from the curb, it is kept");
  check(validateDraft(setPropProps(m, b2, { w: 3 })).loaded.props.length === 3, "or made shallower, since the rule is the footprint and not the centre");
  check(deleteProp(m, b1).props.length === 2 && JSON.stringify(parse(serialize(m)).props) === JSON.stringify(m.props), "delete removes one, and buildings round-trip through save");

  /* And Drive it hands them to the renderer with the road still drivable. */
  const L = loadMap(m);
  let w = seedGraph(3, 50, L, { target: 10, posted: true });
  const st = firstEdge(L), p0 = playerOn(w.course, st.road, st.end, { through: !!st.through });
  check(!!p0 && L.props.length === 2, "a map with buildings still drives");
}

console.log("\n17. UNDO: ONE STEP PER INTENTION, AND NOTHING LOST GOING BACK AND FORTH");
{
  /* Replays edits the way the screen's effect records them: each draft
     against the one before, with a clock. */
  let h = emptyHistory(), t = 0;
  const seq = [newDraft()];
  const apply = (fn, dt) => { const prev = seq.at(-1), now = fn(prev); t += dt; h = record(h, prev, now, t); seq.push(now); return now; };
  let r;
  apply((m) => { const o = addRoad(m, { kind: "collector" }); r = o.id; return o.map; }, 1000);
  for (let i = 0; i < 5; i++) apply((m) => addPoint(m, r, { x: i * 30, y: 0 }), 150);     // five fast taps
  for (const kmh of [6, 60]) apply((m) => setRoadProps(m, r, { speed: kmh }), 120);       // typing "60"
  apply((m) => setRoadProps(m, r, { kind: "arterial" }), 2000);
  check(h.past.length === 8, `five fast taps are five steps, typing "60" is one, a kind change later is one more, after the road itself (${h.past.length} steps in all)`);

  let cur = seq.at(-1), u;
  u = undoStep(h, cur); h = u.history; cur = u.draft;
  check(cur.roads[0].kind === "collector" && cur.roads[0].speed === 60, "undo takes back the kind change alone");
  u = undoStep(h, cur); h = u.history; cur = u.draft;
  check(cur.roads[0].speed !== 60 && cur.roads[0].speed !== 6 && cur.roads[0].points.length === 5, `and then the whole of the typing, back to the speed before it (${cur.roads[0].speed} km/h)`);
  u = undoStep(h, cur); h = u.history; cur = u.draft;
  check(cur.roads[0].points.length === 4, "and then exactly one tapped point");
  for (let i = 0; i < 3; i++) { u = redoStep(h, cur); h = u.history; cur = u.draft; }
  check(cur === seq.at(-1), "redo all the way returns the identical draft, not a copy");
  check(redoStep(h, cur) === null, "and there is nothing past it");

  /* A new edit after an undo drops the redo branch. */
  u = undoStep(h, cur); h = u.history; cur = u.draft;
  const fork = setRoadProps(cur, r, { lanes: 3 }); h = record(h, cur, fork, t += 5000); cur = fork;
  check(h.future.length === 0 && redoStep(h, cur) === null, "an edit after an undo clears redo");
  let all = h; let steps = 0;
  while ((u = undoStep(all, cur))) { all = u.history; cur = u.draft; steps++; }
  check(cur === seq[0] && steps === all.future.length, `and undo all the way reaches the empty draft (${steps} steps)`);

  /* The key is by reference: a move of a point is coalescible, adding
     one never is, and two different objects never merge. */
  const m0 = seq.at(-1);
  check(changeKey(m0, updatePoint(m0, r, 1, { x: 3 })) === `roads:${r}` && changeKey(m0, addPoint(m0, r, { x: 999, y: 0 })) === null, "moving a point can merge; adding one cannot");
  const b = addRoad(m0).map;
  check(changeKey(m0, b) === null && changeKey(b, setRoadProps(setRoadProps(b, r, { speed: 40 }), b.roads[1].id, { speed: 40 })) === null, "a new road, or an edit touching two, stands alone");

  let big = emptyHistory(), prev = newDraft();
  for (let i = 0; i < HISTORY_MAX + 20; i++) { const nx = addRoad(prev).map; big = record(big, prev, nx, i * COALESCE_MS * 2); prev = nx; }
  check(big.past.length === HISTORY_MAX, `history is capped at ${HISTORY_MAX}`);
}

console.log("\n18. A BUILDING MOVED TO ANOTHER STREET CAN BE TURNED TO FACE IT");
{
  /* Two streets at a corner: one east-west, one north-south. A house
     placed on the first faces it; dragged to the second (the screen
     commits a drag as setPropProps({ at })), "Face nearest road" turns
     it to the second. */
  let m = newDraft(); let a, b, h;
  ({ map: m, id: a } = addRoad(m)); m = addPoint(m, a, { x: 0, y: 0 }); m = addPoint(m, a, { x: 200, y: 0 });
  ({ map: m, id: b } = addRoad(m)); m = addPoint(m, b, { x: 200, y: 0 }); m = addPoint(m, b, { x: 200, y: 200 });
  ({ map: m, id: h } = addProp(m, { at: { x: 60, y: 20 } }));
  check(Math.abs(m.props[0].heading) < 1e-9, "placed beside the east-west street, it faces it (0°)");
  m = setPropProps(m, h, { at: { x: 220, y: 120 } });
  const to = headingToRoad(m, m.props[0].at);
  check(Math.abs(to - 90) < 1e-9 && m.props[0].heading === 0, `moved beside the north-south one it keeps its heading until asked, and the nearest road now runs at ${to}°`);
  check(headingToRoad(m, { x: 900, y: 900 }) === null, "with no road within 40 m there is nothing to face");
  check(validateDraft(setPropProps(m, h, { heading: to })).loaded.props.length === 1, "turned, it is still off the road and kept");
}

console.log("\n" + "=".repeat(70));
console.log(failed ? `${failed} FAILURE(S)` : "OK: the model is pure, a hand-written map round-trips through it exactly, and nothing drawn -- however badly -- can throw validation.");
process.exit(failed ? 1 : 0);
