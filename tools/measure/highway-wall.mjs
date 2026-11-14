/* THE WALL ON THE GENERATED HIGHWAY (Jay, 14 November: "traffic tends to build up into a wall ... maybe the lower speed limit is flattening the range of speeds?").
   Same instrument on test-loop and test-highway-gen, the played world: posted limits, wanted-speed spread (v0), achieved spread, the share of car-seconds spent held
   behind somebody slower (headway under 2 s and speed under 90% of wanted), occupancy and trucks by lane position, interchange spacing.
   Usage: node tools/measure/highway-wall.mjs [mapId,...] [seconds=180] [seed=1] */
import { loadMap } from "../../src/map/load.js";
import { TEST_MAPS } from "../../src/map/samples.js";
import { carsFor } from "../../src/map/cars.js";
import { seedGraph, step } from "../../src/sim/crossing.js";
/* THE PLAYED WORLD, stated here so this script stands on its own: what worldFor (scene.js) turns on. */
const playedGraph = (seed, kmh, loaded, o = {}) => seedGraph(seed, kmh, loaded, { posted: true, walkers: true, rivals: true, brakeReaction: true, ...o });
const [ids = "test-loop,test-highway-gen", secsArg = "180", seedArg = "1"] = process.argv.slice(2);
const kmh = (x) => x * 3.6, stat = (xs) => { const n = xs.length || 1, m = xs.reduce((s, x) => s + x, 0) / n; return { mean: m, sd: Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / n) }; };
const pct = (xs, f) => { const s = xs.slice().sort((a, b) => a - b); return s[Math.floor(f * (s.length - 1))] ?? NaN; };
for (const id of ids.split(",")) {
  const raw = TEST_MAPS.find((m) => m.id === id).build();
  if (process.env.LIMIT) for (const r of raw.roads) if (r.kind === "highway") r.speed = +process.env.LIMIT;   // ARM: every highway carriageway posts one limit
  const loaded = loadMap(raw), cars = carsFor(loaded);
  const hw = raw.roads.filter((r) => r.kind === "highway" && (r.lanes ?? 3) >= 2).map((r) => ({ ...r, speed: r.speed ?? 100 }));
  const len = (r) => r.points.reduce((s, p, i) => (i ? s + Math.hypot(p.x - r.points[i - 1].x, p.y - r.points[i - 1].y) : 0), 0);
  const bySpeed = new Map(); for (const r of hw) bySpeed.set(r.speed, (bySpeed.get(r.speed) ?? 0) + len(r));
  const totalKm = [...bySpeed.values()].reduce((a, b) => a + b, 0) / 1000;
  console.log(`\n== ${id}: ${cars} cars, highway ${totalKm.toFixed(1)} km of road (carriageway-km), posted limits by length: ${[...bySpeed.entries()].sort((a, b) => a[0] - b[0]).map(([s, m]) => `${s}: ${(m / 1000).toFixed(1)} km`).join(", ")}`);
  let w = playedGraph(+seedArg, 50, loaded, { every: 2.0, target: cars, ...(process.env.TRUCKS != null ? { trucks: +process.env.TRUCKS } : {}), ...(process.env.CORNERS === "0" ? { corners: false } : {}), ...(process.env.KEEPRIGHT === "0" ? { keepRight: false } : {}) });
  for (let i = 0; i < 3600; i++) w = step(w);
  const v0s = { car: [], truck: [] }, vs = { car: [], truck: [] }, lane = new Map(), laneKind = new Map(); const heldBy = new Map(), secBy = new Map(), spdBy = new Map(), limOf = new Map(raw.roads.map((r) => [r.id, r.speed ?? 100])); const spanIds = new Map(), thr = { secs: 0, held: 0, byLane: new Map() }; let held = 0, secs = 0, heldTr = 0, secsTr = 0, trucksInNonRight = 0, trucksSecs = 0;
  const N = +secsArg * 20;
  for (let i = 0; i < N; i++) {
    w = step(w);
    if (i % 20) continue;
    for (const a of w.actors) {
      const L = w.course.at[a.k ?? 0].layout, p = L.paths[a.route], leg = L.legs[p?.from];
      if (!leg || (leg.across ?? leg.lanes ?? 1) < 2 || a.s > p.stopAt) continue;
      const toRoad = L.legs[p.to]?.road ?? "", exitBound = /^offb?-/.test(toRoad);
      { const m = spanIds.get(leg.road) ?? spanIds.set(leg.road, new Map()).get(leg.road); if (!m.has(a.id) || exitBound) m.set(a.id, exitBound); }
      const kind = a.kind === "truck" ? "truck" : "car", pos = leg.pos ?? leg.lane ?? 0;   // 0 = INNER (fast) lane, lanes-1 = CURB
      secs++; v0s[kind].push(kmh(a.v0)); vs[kind].push(kmh(a.v));
      lane.set(pos, (lane.get(pos) ?? 0) + 1); const lk = laneKind.get(pos) ?? { car: 0, truck: 0 }; lk[kind]++; laneKind.set(pos, lk);
      const isHeld = a.headway != null && a.v < 0.9 * a.v0 && a.headway / Math.max(a.v, 1) < 2; if (isHeld) held++;
      if (!exitBound) { thr.secs++; if (isHeld) thr.held++; const t = thr.byLane.get(pos) ?? { n: 0, h: 0, v: 0 }; t.n++; t.v += kmh(a.v); if (isHeld) t.h++; thr.byLane.set(pos, t); }
      { const k = `lane ${pos}`, b = `limit ${leg.road ? Math.floor((limOf.get(leg.road) ?? 100) / 10) * 10 : "?"}`; for (const key of [k, b]) { secBy.set(key, (secBy.get(key) ?? 0) + 1); if (isHeld) heldBy.set(key, (heldBy.get(key) ?? 0) + 1); (spdBy.get(key) ?? spdBy.set(key, []).get(key)).push(kmh(a.v)); } }
      if (kind === "truck") { trucksSecs++; if (pos > 0) trucksInNonRight++; }
    }
  }
  for (const k of ["car", "truck"]) if (v0s[k].length) { const d = stat(v0s[k]), v = stat(vs[k]); console.log(`  ${k}: ${v0s[k].length} car-seconds; wanted ${d.mean.toFixed(0)} +/- ${d.sd.toFixed(1)} (p10/90 ${pct(v0s[k], .1).toFixed(0)}/${pct(v0s[k], .9).toFixed(0)}); achieved ${v.mean.toFixed(0)} +/- ${v.sd.toFixed(1)} (p10/90 ${pct(vs[k], .1).toFixed(0)}/${pct(vs[k], .9).toFixed(0)}) km/h`); }
  console.log(`  held behind someone slower (headway < 2 s, under 90% of wanted): ${(100 * held / Math.max(1, secs)).toFixed(1)}% of car-seconds on multi-lane road`);
  console.log(`  held / speed by lane and by posted-limit band: ${[...secBy.keys()].sort().map((k) => `${k}: ${(100 * (heldBy.get(k) ?? 0) / secBy.get(k)).toFixed(0)}% held, ${stat(spdBy.get(k)).mean.toFixed(0)} km/h (${secBy.get(k)})`).join("; ")}`);
  console.log(`  THROUGH TRAFFIC ONLY (not bound for an exit ramp): ${thr.secs} car-seconds (${(100 * thr.secs / secs).toFixed(0)}% of all); held ${(100 * thr.held / Math.max(1, thr.secs)).toFixed(1)}%; by lane ${[...thr.byLane.entries()].sort((a, b) => a[0] - b[0]).map(([p2, t]) => `${p2}: ${(100 * t.h / t.n).toFixed(0)}% held, ${(t.v / t.n).toFixed(0)} km/h`).join("; ")}`);
  const exits = [...spanIds.entries()].map(([r, m]) => [r, m.size, [...m.values()].filter(Boolean).length]).filter(([, , e]) => e > 0).sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }));
  console.log(`  EXIT DEMAND: of the cars that used each span ending at an exit, the share bound for the ramp: ${exits.map(([r, n, e]) => `${r} ${(100 * e / n).toFixed(0)}% (${e}/${n})`).join("; ")}`);
  const ramps = raw.roads.filter((r) => /^offb?-/.test(r.id)).map((r) => [r.id, r.points.reduce((acc, p3, i) => (i ? acc + Math.hypot(p3.x - r.points[i - 1].x, p3.y - r.points[i - 1].y) : 0), 0)]);
  console.log(`  EXIT RAMP LENGTHS (diverge to terminal): ${ramps.map(([id2, m]) => `${id2} ${m.toFixed(0)} m`).join("; ")}`);
  console.log(`  occupancy by lane position (0 = inner, highest = curb): ${[...lane.entries()].sort((a, b) => a[0] - b[0]).map(([p, n]) => `${p}: ${(100 * n / secs).toFixed(0)}% (trucks ${(laneKind.get(p).truck)})`).join(", ")}; trucks NOT in the curb lane ${(100 * (1 - (laneKind.get(Math.max(...lane.keys()))?.truck ?? 0) / Math.max(1, trucksSecs))).toFixed(0)}% of ${trucksSecs} truck-seconds`);
}
