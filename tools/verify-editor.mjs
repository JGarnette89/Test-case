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
import { CLEARANCE_MIN } from "../src/map/load.js";
import { listMaps, saveMap, openMap, deleteMap, prunedList } from "../src/editor/library.js";
import { zoomAbout, pinchView, panView, isTap, toWorld as viewToWorld } from "../src/editor/gesture.js";
import { graphOf } from "../src/sim/graph.js";
import { overlapping } from "../src/sim/crossing.js";
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
  check(zoomAbout(v, 0, 0, 1000).scale === 20 && zoomAbout(v, 0, 0, 1e-6).scale === 0.3, "and the scale is clamped at both ends");

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

console.log("\n" + "=".repeat(70));
console.log(failed ? `${failed} FAILURE(S)` : "OK: the model is pure, a hand-written map round-trips through it exactly, and nothing drawn -- however badly -- can throw validation.");
process.exit(failed ? 1 : 0);
