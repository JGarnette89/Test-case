/* =====================================================================
   THE MAP FORMAT AND ITS LOADER: bad input normalised, never thrown.

   SIMULATOR.md 3: a map is data, and nothing a badly drawn one contains
   can throw the simulation. So this feeds the loader what an editor
   will produce -- points on top of each other, a road shorter than a
   car, a bend too tight for its speed, a crest no road has, an end
   drawn short of the road it was meant to join, roads drawn across
   each other -- and checks each becomes a normalisation with a warning
   at a location. And the format's first test: it can carry the world
   that already exists. Loading stage 0 as a map must reproduce, to the
   centimetre, the roads iso/road.js builds by hand.
   ===================================================================== */
import { loadMap, MAX_GRADE, SNAP, CLEARANCE_MIN, MIN_ROAD, THIN } from "../src/map/load.js";
import { stage0Map, emptyMap, road, KINDS, CHUNK, LANE, SAMPLE } from "../src/map/format.js";
import { valleyRoad, bridgeRoad, poseAt } from "../src/iso/road.js";
import { radiusFor } from "../src/sim/course.js";

let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? " ok " : "FAIL"} ${msg}`); if (!ok) failed++; };
const codes = (l) => l.warnings.map((w) => w.code);
const line = (x0, y0, x1, y1, n = 20, z = 0) => Array.from({ length: n + 1 }, (_, i) => ({ x: x0 + ((x1 - x0) * i) / n, y: y0 + ((y1 - y0) * i) / n, z }));

/* 1. Stage 0 as the first map. */
{
  const l = loadMap(stage0Map());
  check(l.ok && l.roads.length === 2, `stage 0 loads as two roads (${l.roads.map((r) => r.id).join(", ")})`);
  check(l.warnings.length === 0, `with no warnings (${codes(l).join(", ") || "none"})`);
  const worst = { pos: 0, z: 0, len: 0 };
  for (const [id, built] of [["valley", valleyRoad()], ["bridge", bridgeRoad()]]) {
    const r = l.roads.find((x) => x.id === id);
    worst.len = Math.max(worst.len, Math.abs(r.length - built.length));
    for (let s = 0; s <= built.length; s += 7.3) {
      const a = poseAt(r, s), b = poseAt(built, s);
      worst.pos = Math.max(worst.pos, Math.hypot(a.x - b.x, a.y - b.y));
      worst.z = Math.max(worst.z, Math.abs(a.z - b.z));
    }
  }
  check(worst.pos < 0.02 && worst.z < 0.02 && worst.len < 0.1, `the loaded roads reproduce the hand-built ones: position within ${worst.pos.toFixed(3)} m, height within ${worst.z.toFixed(3)} m, length within ${worst.len.toFixed(3)} m`);
  check(l.nodes.length === 0 && l.crossings.length === 1 && l.crossings[0].gap > CLEARANCE_MIN, `the two roads cross once with no node and ${l.crossings[0]?.gap.toFixed(1)} m of clearance: an overpass, not a warning`);
  check(l.roads.every((r) => r.edge.start && r.edge.end), "every end joins nothing, so every end is a spawn and despawn edge");
  check(l.roads.every((r) => r.width === 2 * LANE && r.speed === 60), "one lane each way, 60 km/h, as stage 0 has them");
  const v = l.roads.find((r) => r.id === "valley");
  check(v.chunks.length >= 3 && v.chunks.every((k) => l.chunks.get(k).roads.has("valley")), `the valley road spans ${v.chunks.length} chunks and each of them lists it`);
  const again = loadMap(stage0Map());
  check(JSON.stringify(again.roads) === JSON.stringify(l.roads), "loading twice gives the same roads, byte for byte");
}

/* 2. A T drawn short still connects: the end snaps, the crossed road splits, the node has three legs at real bearings. */
{
  const m = emptyMap("t");
  m.roads.push(road({ id: "main", kind: "collector", points: line(0, 100, 300, 100) }));
  m.roads.push(road({ id: "side", kind: "residential", points: line(150, 250, 150, 100 + 2.0) }));   // ends 2 m short of main
  const l = loadMap(m);
  check(l.ok && l.nodes.length === 1 && l.nodes[0].legs.length === 3, `a side road ending ${2.0} m short of the main road makes one node with three legs (${l.nodes.length} node, ${l.nodes[0]?.legs.length} legs)`);
  check(l.roads.length === 3 && l.roads.some((r) => r.id === "main#a") && l.roads.some((r) => r.id === "main#b"), `the main road is split in two (${l.roads.map((r) => r.id).join(", ")})`);
  const bearings = l.nodes[0].legs.map((x) => Math.round(x.bearing)).sort((a, b) => a - b);
  check(bearings.join(",") === "-180,0,90" || bearings.join(",") === "0,90,180", `the legs leave the node at real bearings: ${bearings.join(", ")} (west, east and south, y down)`);
  check(codes(l).includes("snapped-split"), `and the join is a warning with a location (${codes(l).join(", ")})`);
  const side = l.roads.find((r) => r.id === "side");
  const endPt = side.pts[side.pts.length - 1];
  check(Math.hypot(endPt.x - l.nodes[0].at.x, endPt.y - l.nodes[0].at.y) < 0.01, "the side road's end now sits on the node");
  check(side.edge.start && !side.edge.end, "its far end is an edge, its joined end is not");
  const far = emptyMap("far");
  far.roads.push(road({ id: "main", points: line(0, 100, 300, 100) }));
  far.roads.push(road({ id: "side", points: line(150, 250, 150, 100 + SNAP + 1) }));
  const lf = loadMap(far);
  check(lf.nodes.length === 0 && lf.roads.length === 2, `an end ${(SNAP + 1).toFixed(1)} m away, past the snap distance, does not join`);
}

/* 3. A bend too tight for its speed lowers the posted speed; a crest too steep is flattened. Both warn. */
{
  const m = emptyMap("bend");
  const R = 40;   // a 40 m radius: fine at 30 km/h, not at 60
  const arc = Array.from({ length: 41 }, (_, i) => ({ x: 100 + R * Math.cos((Math.PI * i) / 40), y: 100 + R * Math.sin((Math.PI * i) / 40), z: 0 }));
  m.roads.push(road({ id: "arc", kind: "arterial", speed: 60, points: arc }));
  const l = loadMap(m);
  const r = l.roads[0];
  const w = l.warnings.find((x) => x.code === "bend-too-tight");
  check(w && r.speed < 60 && radiusFor(r.speed / 3.6) <= R + 1, `a ${R} m bend posted at 60 is lowered to ${r.speed} km/h, which the bend allows (needs ${radiusFor(r.speed / 3.6).toFixed(0)} m)`);
  check(w && w.at && Math.abs(Math.hypot(w.at.x - 100, w.at.y - 100) - R) < 6, "and the warning points at the bend");
  const steep = emptyMap("steep");
  const ramp = line(0, 0, 100, 0, 20).map((p, i) => ({ ...p, z: i <= 10 ? i * 2 : 40 - (i - 10) * 2 }));   // 40% up, 40% down
  steep.roads.push(road({ id: "ramp", points: ramp }));
  const ls = loadMap(steep);
  const rr = ls.roads[0];
  let maxGrade = 0;
  for (let i = 0; i + 1 < rr.pts.length; i++) maxGrade = Math.max(maxGrade, Math.abs(rr.pts[i + 1].z - rr.pts[i].z) / (rr.at[i + 1] - rr.at[i]));
  check(maxGrade <= MAX_GRADE + 1e-6 && codes(ls).includes("grade-clamped"), `a 40% crest is flattened to ${Math.round(maxGrade * 100)}%, under the ${Math.round(MAX_GRADE * 100)}% clamp, and warned`);
  check(rr.pts[10].z < 20 && rr.pts[10].z > 5, `the crest is lowered from its top rather than lopped (peak ${rr.pts[10].z.toFixed(1)} m of 20)`);
}

/* 4. Roads that cross without meeting: a warning at the same height, an overpass with clearance. */
{
  const flat = emptyMap("x");
  flat.roads.push(road({ id: "ew", points: line(0, 100, 200, 100) }));
  flat.roads.push(road({ id: "ns", points: line(100, 0, 100, 200) }));
  const l = loadMap(flat);
  const w = l.warnings.find((x) => x.code === "cross-no-node");
  check(w && Math.abs(w.at.x - 100) < 0.01 && Math.abs(w.at.y - 100) < 0.01 && l.nodes.length === 0, "two roads drawn across each other at one height, with no node: a warning at the crossing, not an intersection");
  const over = emptyMap("over");
  over.roads.push(road({ id: "ew", points: line(0, 100, 200, 100) }));
  over.roads.push(road({ id: "ns", points: line(100, 0, 100, 200, 20, CLEARANCE_MIN + 2) }));
  const lo = loadMap(over);
  check(!codes(lo).includes("cross-no-node") && lo.crossings.length === 1, `the same two roads ${CLEARANCE_MIN + 2} m apart in height are an overpass: no warning`);
  const met = emptyMap("met");
  met.roads.push(road({ id: "ew", points: line(0, 100, 200, 100) }));
  met.roads.push(road({ id: "ns", points: line(100, 0, 100, 200) }));
  met.nodes.push({ id: "x", at: { x: 100, y: 100, z: 0 }, legs: [] });
  const lm = loadMap(met);
  check(!codes(lm).includes("cross-no-node"), "and with an explicit node at the crossing there is no warning either");
}

/* 5. Bad input: thinned, dropped, refused -- each with a reason. */
{
  const m = emptyMap("bad");
  const pile = [{ x: 0, y: 0 }, { x: 0.1, y: 0 }, { x: 0.2, y: 0.1 }, { x: 0.3, y: 0 }, { x: 50, y: 0 }, { x: 50.2, y: 0 }, { x: 100, y: 0 }];
  m.roads.push(road({ id: "pile", points: pile }));
  m.roads.push(road({ id: "stub", points: [{ x: 0, y: 50 }, { x: 3, y: 50 }] }));
  m.roads.push(road({ id: "dot", points: [{ x: 0, y: 80 }, { x: 0.1, y: 80 }] }));
  m.roads.push({ id: "odd", kind: "boulevard", points: line(0, 200, 100, 200) });
  m.roads.push(road({ id: "pile", points: line(0, 300, 100, 300) }));
  const l = loadMap(m);
  check(l.ok && l.roads.length === 3, `a road of piled-up points survives, a ${3} m stub and a two-point dot are dropped, an unknown kind is kept as a collector (${l.roads.length} roads)`);
  check(codes(l).includes("too-short") && codes(l).includes("degenerate") && codes(l).includes("unknown-kind") && codes(l).includes("duplicate-id"), `each with its own warning (${[...new Set(codes(l))].join(", ")})`);
  const pileRoad = l.roads.find((r) => r.id === "pile");
  check(pileRoad.pts.every((p, i) => i === 0 || Math.hypot(p.x - pileRoad.pts[i - 1].x, p.y - pileRoad.pts[i - 1].y) > THIN), `the piled-up road is resampled evenly (${pileRoad.pts.length} samples, ${pileRoad.step.toFixed(2)} m apart)`);
  check(!loadMap(emptyMap("nothing")).ok && /no drivable road/.test(loadMap(emptyMap("nothing")).error), "an empty map is refused with a reason");
  check(!loadMap({ roads: [road({ id: "s", points: [{ x: 0, y: 0 }, { x: 2, y: 0 }] })] }).ok, "a map whose only road is shorter than a car is refused");
  check(!loadMap(null).ok && !loadMap({}).ok, "and so is something that is not a map, without throwing");
}

/* 6. Chunks index what is where. */
{
  const m = emptyMap("city");
  for (let i = 0; i < 8; i++) m.roads.push(road({ id: `ew${i}`, points: line(0, i * 300, 2000, i * 300, 40) }));
  for (let i = 0; i < 8; i++) m.roads.push(road({ id: `ns${i}`, points: line(i * 300, 0, i * 300, 2000, 40) }));
  m.props.push({ kind: "house", at: { x: 700, y: 900 }, heading: 0 });
  const l = loadMap(m);
  const expected = Math.ceil(2100 / CHUNK) ** 2;   // the roads reach 2100 m on both axes
  check(l.ok && l.chunks.size >= expected - 4 && l.chunks.size <= expected, `a 2 km grid of roads indexes into about ${expected} chunks (${l.chunks.size})`);
  check(l.chunks.get(`${Math.floor(700 / CHUNK)},${Math.floor(900 / CHUNK)}`).props.length === 1, "a prop is in its chunk");
  const every = [...l.chunks.values()].every((c) => c.samples.every((s) => l.roads.find((r) => r.id === s.road)?.pts[s.i]));
  check(every, "every sample a chunk lists exists on its road");
  const midRoad = codes(l).filter((c) => c === "cross-no-node").length;
  /* 36: the 6 x 6 interior crossings of roads that reach 2000 m; the pair at 2100 m lies beyond the others' ends. */
  check(l.nodes.length >= 10 && l.nodes.length <= 16 && midRoad === 36, `ends that landed on a road became nodes and mid-road crossings became warnings, never intersections (${l.nodes.length} nodes, ${midRoad} crossings without a node)`);
}

if (failed) { console.log(`\n${failed} FAILED`); process.exit(1); }
console.log("\nOK: a map loads normalised and warned, never thrown; stage 0 is the first map and it reproduces the hand-built roads.");
