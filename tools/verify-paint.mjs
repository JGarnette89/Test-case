/* =====================================================================
   THE PAINTER'S ORDER: nothing is ever drawn under the surface it stands
   on, and nothing under a deck is ever drawn over it.

   The maintainer, 22 September: "traffic disappears under the
   intersections and occasionally under the road while traveling." The
   depth sort is one scalar key per drawable (project.js), so it is only
   as right as the keys, and stage 0 proved it by eye at one camera angle
   on one road width. This sweeps what has changed since -- the camera
   rotates, roads are two and three lanes wide, an intersection is one
   large surface -- and asserts the property directly, for every car in
   the frame, at every rotation:

     a car standing on a surface (its plan point inside the surface's
     footprint, at its level) is painted AFTER that surface;
     a car under a deck (inside its footprint, well below it) is painted
     BEFORE the deck.

   Both scenes the renderer serves are swept: the test map with its
   junctions, two-lane roads and overpass (#/map), and stage 0's valley
   with its bridge, whose cars ride `road.cars` (#/iso, #/wheel). The
   cars are the sim's own after a minute of traffic, plus a few placed
   where the report said it happens: in the middle of the crossroads,
   on a road running across the view, on the overpass and under it.
   ===================================================================== */
import { drawFrame } from "../src/iso/draw.js";
import { terrain, groundAt as stage0Ground } from "../src/iso/road.js";
import { seedScene, stepScene, carsOf } from "../src/iso/world.js";
import { loadMap, groundFor } from "../src/map/load.js";
import { testMap1 } from "../src/map/samples.js";
import { junctionsOf } from "../src/sim/graph.js";
import { seedGraph, step, poseOf } from "../src/sim/crossing.js";

let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? " ok " : "FAIL"} ${msg}`); if (!ok) failed++; };

/* A canvas context that draws nothing and minds nothing. */
const stub = new Proxy({}, { get: (t, p) => (p === "canvas" ? { width: 1, height: 1 } : () => {}), set: () => true });

const inside = (poly, x, y) => {
  let on = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) on = !on;
  }
  return on;
};
const levelOf = (poly) => poly.reduce((s, p) => s + (p.z ?? 0), 0) / poly.length;

/* Audit one frame: every car against every surface whose footprint it
   is inside. Returns the violations. */
function audit(scene, canvas, rot) {
  const out = drawFrame(stub, canvas, { ...scene, rot }, { audit: true });
  const order = out.order;
  const bad = [];
  const cars = order.map((t, i) => ({ ...t, i })).filter((t) => t.kind === "car");
  const surfaces = order.map((t, i) => ({ ...t, i })).filter((t) => t.poly);
  for (const c of cars) {
    for (const s of surfaces) {
      if (!inside(s.poly, c.at.x, c.at.y)) continue;
      const dz = c.at.z - levelOf(s.poly);
      if (Math.abs(dz) < 1.5) { if (c.i < s.i) bad.push({ car: c.id, on: `${s.kind} ${s.id ?? ""}`.trim(), rot, why: "drawn before the surface it stands on" }); }
      else if (dz < -1.5) { if (c.i > s.i) bad.push({ car: c.id, on: `${s.kind} ${s.id ?? ""}`.trim(), rot, why: "drawn over the deck it is under" }); }
    }
  }
  return { bad, cars: cars.length, surfaces: surfaces.length, items: out.items };
}

const ROTS = Array.from({ length: 24 }, (_, i) => i * 15);
const summarise = (name, scene, canvas, cams) => {
  let bad = [], frames = 0, carsSeen = 0;
  for (const cam of cams) for (const rot of ROTS) {
    const r = audit({ ...scene, cam }, canvas, rot);
    bad = bad.concat(r.bad); frames++; carsSeen += r.cars;
  }
  const kinds = {};
  for (const b of bad) kinds[`${b.why} (${b.on.split(" ")[0]})`] = (kinds[`${b.why} (${b.on.split(" ")[0]})`] ?? 0) + 1;
  return { bad, frames, carsSeen, kinds };
};

/* 1. The test map: junctions, two-lane roads, the overpass. */
{
  const loaded = loadMap(testMap1());
  let world = seedGraph(3, 50, loaded, { every: 1.2 });
  for (let i = 0; i < 20 * 60; i++) world = step(world);
  const actors = world.actors.map((a) => { const p = poseOf(world, a); return { id: a.n, x: p.x, y: p.y, z: p.z ?? 0, heading: p.rot, n: a.n }; });
  /* Placed where the report said: the middle of the crossroads, across
     the view on each road, on the overpass, and under it. */
  const placed = [
    { id: "box-centre", x: 400, y: 400, z: 0, heading: 90 }, { id: "box-edge", x: 407, y: 396, z: 0, heading: 0 },
    { id: "five-way", x: 400, y: 800, z: 0, heading: 45 }, { id: "tee", x: 800, y: 402, z: 0, heading: 180 },
    { id: "a-north", x: 405.4, y: 300, z: 0, heading: 90 }, { id: "a-west", x: 300, y: 394.6, z: 0, heading: 0 },
    /* On the hill: the road climbs 6 m and the land climbs with it, so this is NOT a deck and must not draw like one. */
    ...(() => { const ab = loadMap(testMap1()).roads.find((r) => r.id === "A-B"); const top = ab.pts.reduce((m, q) => (q.z > m.z ? q : m), ab.pts[0]); return [{ id: "hilltop", x: top.x, y: top.y, z: top.z, heading: 0 }]; })(),
    { id: "on-deck", x: 601.8, y: 775, z: 7, heading: 90 }, { id: "under-deck", x: 600, y: 801.8, z: 0, heading: 0 },
    { id: "deck-edge", x: 598.2, y: 700, z: 7 * Math.sin((Math.PI * 100) / 350) ** 2, heading: -90 },
  ];
  const b = loaded.bounds;
  /* The land the map implies, which is what the screen draws: it rises
     with the hill road and stays under the overpass. */
  const ground = groundFor(loaded, { cell: 20 });
  const scene = {
    roads: loaded.roads.map((road) => ({ road, cars: [] })),
    terrain: terrain({ x0: b.x, y0: b.y, x1: b.x + b.w, y1: b.y + b.h, cell: 20, ground }),
    junctions: junctionsOf(world.course),
    groundAt: ground, k: 5, tilt: false, actors: [...actors, ...placed],
  };
  const canvas = { w: 1600, h: 1200 };
  const cams = [{ x: 400, y: 400, z: 0 }, { x: 600, y: 780, z: 3 }, { x: 800, y: 600, z: 0 }, { x: 400, y: 800, z: 0 }];
  const fixed = cams.reduce((n, cam) => n + audit({ ...scene, cam }, canvas, 0).bad.length, 0);
  const r = summarise("map", scene, canvas, cams);
  console.log(`   at the fixed view alone: ${fixed} misdrawn across the 4 cameras`);
  console.log(`   test map: ${r.frames} frames, ${(r.carsSeen / r.frames).toFixed(0)} cars a frame, ${r.bad.length} misdrawn -- ${Object.entries(r.kinds).map(([k, n]) => `${n} ${k}`).join(", ") || "none"}`);
  const byCar = {};
  for (const x of r.bad) byCar[x.car] = (byCar[x.car] ?? 0) + 1;
  const worst = Object.entries(byCar).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([c, n]) => `${c} x${n}`).join(", ");
  check(r.bad.length === 0, `on the test map no car is ever drawn under the surface it stands on or over a deck it is under, at any of 24 rotations from 4 cameras${r.bad.length ? ` (${worst})` : ""}`);
  const atJunctions = r.bad.filter((x) => x.on.startsWith("junction")).length, onRoads = r.bad.filter((x) => x.on.startsWith("road")).length, decks = r.bad.filter((x) => x.on.startsWith("deck")).length;
  console.log(`   of which at junctions ${atJunctions}, on roads ${onRoads}, decks ${decks}`);
}

/* 2. Stage 0: the valley road and its bridge, cars on `road.cars`. */
{
  let scene = seedScene(2, 60);
  const road = scene.valley;
  scene = stepScene(scene, 20 * 40);
  const canvas = { w: 1600, h: 1200 };
  const cams = [{ x: 0, y: 0, z: 0 }, ...[80, 160, 240].map((s) => { const p = road.pts[Math.min(road.pts.length - 1, Math.round(s / 5))]; return { x: p.x, y: p.y, z: p.z }; })];
  const r = summarise("stage0", { roads: carsOf(scene), terrain: scene.terrain, props: scene.props, groundAt: stage0Ground, k: 5, tilt: true }, canvas, cams);
  console.log(`   stage 0: ${r.frames} frames, ${(r.carsSeen / r.frames).toFixed(0)} cars a frame, ${r.bad.length} misdrawn -- ${Object.entries(r.kinds).map(([k, n]) => `${n} ${k}`).join(", ") || "none"}`);
  check(r.bad.length === 0, "on stage 0's valley and bridge the same holds");
}

if (failed) { console.log(`\n${failed} FAILED`); process.exit(1); }
console.log("\nOK: nothing is drawn under the surface it stands on, and nothing under a deck is drawn over it, at every rotation.");
