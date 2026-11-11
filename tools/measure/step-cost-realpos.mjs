/* WHAT THE REAL POSITION COSTS A STEP AT 180 CARS (DECISIONS 10.68 G4, 10.70). The page's per-tick work, split
   into the player's own step (stepDriver + withDriver), the world's step, and contact -- with `world.realPos` off
   and on, ALTERNATING in one process so drift in the machine falls on both.
   Case 1 (default): the car drives on its lane. The two worlds should be IDENTICAL tick for tick (G5), so the
   difference is the overhead and nothing else; the end-state hash says whether they were.
   Case 2 (CASE=2): the car stands on NO lane, across a road, with stand-ins every tick (switch on only). The worlds
   differ -- the traffic queues behind a stand-in -- so it is a bound on the cost WITH stand-ins, not an A/B of
   identical work, and is reported as that.
   Usage: [CASE=2] node tools/measure/step-cost-realpos.mjs [cars=180] [warm=600] [ticks=600] [repeats=6] */
import { worldFor, playerContact } from "../../src/sim/scene.js";
import { afterContact } from "../../src/sim/contact.js";
import { step, DT } from "../../src/sim/crossing.js";
import { stepDriver, withDriver, playerAt } from "../../src/sim/drive.js";
import { holdAt } from "../../src/sim/player.js";
import { poseOnGraph } from "../../src/sim/graph.js";
import { testCityReady } from "../../src/map/samples.js";

const [carsArg = "180", warmArg = "600", ticksArg = "600", repsArg = "6"] = process.argv.slice(2);
const CASE = process.env.CASE === "2" ? 2 : 1, cars = Number(carsArg), warm = Number(warmArg), ticks = Number(ticksArg), reps = Number(repsArg);

function run(on) {
  const { world: w0, me: m0 } = worldFor(1, 50, 1.1, true, cars, null, null, false);
  let w = { ...w0, realPos: on }, me = m0;
  if (CASE === 2) {
    /* On no lane, across the road, standing: the car's route latched where it was, the pose put 90 degrees to it. */
    const g = poseOnGraph(w.course, me.k, me.route, Math.min(me.s + 60, w.course.at[me.k].layout.paths[me.route].length - 5));
    me = { ...me, s: Math.min(me.s + 60, w.course.at[me.k].layout.paths[me.route].length - 5), v: 0, going: true, accepted: true, noLane: true, lost: true, at: { x: g.x, y: g.y, z: g.z ?? 0, heading: g.rot + 90 } };
  }
  w = withDriver(w, me);
  const me0 = m0;
  let tDrv = 0, tStep = 0, tCon = 0, n = 0, shadowTicks = 0, noLaneTicks = 0, standIns = 0, cpu0 = null;
  for (let i = 0; i < warm + ticks; i++) {
    const timed = i >= warm;
    if (i === warm) cpu0 = process.cpuUsage();
    const input = CASE === 2 ? { steer: 0, slider: -0.4, assist: 0 } : { steer: 0, slider: holdAt(12, me.grade ?? 0), assist: 1 };
    let a = performance.now();
    me = stepDriver(me, input, w, DT);
    w = withDriver(w, me);
    let b = performance.now();
    w = step(w);
    let c = performance.now();
    const k = playerContact(w, me); w = k.world; me = afterContact(me, k, w).me; w = withDriver(w, me);
    let d = performance.now();
    if (CASE === 1 && me.atEdge) { me = { ...me0 }; w = withDriver(w, me); }
    if (timed) { tDrv += b - a; tStep += c - b; tCon += d - c; n++; if (me.shadows) shadowTicks++; if (me.noLane) noLaneTicks++; standIns += w.actors.filter((x) => x.shadow).length; }
  }
  const hash = w.actors.filter((x) => !x.player).reduce((h, x) => h + x.s * ((x.k ?? 0) + 1), 0).toFixed(6) + "/" + w.actors.filter((x) => x.crash).length;
  const cpu = process.cpuUsage(cpu0);
  return { cpuUser: cpu.user / 1000 / n, cpuSys: cpu.system / 1000 / n, drv: tDrv / n, step: tStep / n, con: tCon / n, total: (tDrv + tStep + tCon) / n, hash, shadowTicks, noLaneTicks, standIns: standIns / n, cars: w.actors.length };
}

/* CHILD MODE: one configuration in a fresh process, printed as JSON. The parent alternates them, so memory never
   accumulates across worlds (a six-world process died of out-of-memory on a machine with 660 MB free) and a crash
   takes one run and not all of them. */
if (process.env.ONE) { console.log(JSON.stringify(run(process.env.ONE === "on"))); process.exit(0); }

import { spawnSync } from "node:child_process";
import { freemem } from "node:os";
const med = (xs) => [...xs].sort((p, q) => p - q)[Math.floor(xs.length / 2)];
const fmt = (xs) => xs.map((x) => x.toFixed(3)).join(" ");
const spread = (xs) => ((Math.max(...xs) - Math.min(...xs)) / med(xs)) * 100;
const once = (on) => {
  const free0 = Math.round(freemem() / 1048576);
  const r = spawnSync(process.execPath, [process.argv[1], carsArg, warmArg, ticksArg, repsArg], { env: { ...process.env, ONE: on ? "on" : "off" }, encoding: "utf8", maxBuffer: 1e7 });
  if (r.status !== 0) { console.log(`  a child (${on ? "on" : "off"}) failed: status ${r.status} ${(r.stderr || "").split(String.fromCharCode(10))[0].slice(0, 120)}`); return null; }
  return { ...JSON.parse(r.stdout.trim().split(String.fromCharCode(10)).pop()), free0 };
};
const R = { off: [], on: [] };
for (let r = 0; r < reps; r++) {
  const order = r % 2 === 0 ? [false, true] : [true, false];   // alternate which goes first
  for (const on of order) { if (CASE === 2 && !on) continue; const x = once(on); if (x) R[on ? "on" : "off"].push(x); }
}
console.log(`CASE ${CASE}, ${cars} cars, ${warm} warm + ${ticks} timed ticks, ${reps} alternating child processes each; ms per tick`);
for (const k of CASE === 1 ? ["off", "on"] : ["on"]) {
  const u = R[k].map((x) => x.cpuUser), w = R[k].map((x) => x.total);
  console.log(`  switch ${k.padEnd(3)} (${R[k].length} runs): USER CPU min ${Math.min(...u).toFixed(3)} median ${med(u).toFixed(3)} spread ${spread(u).toFixed(1)}% (${fmt(u)}) | wall min ${Math.min(...w).toFixed(3)} median ${med(w).toFixed(3)} spread ${spread(w).toFixed(1)}% | free memory at start ${Math.min(...R[k].map((x) => x.free0))}-${Math.max(...R[k].map((x) => x.free0))} MB | no-lane ticks ${R[k][0]?.noLaneTicks}, ticks with stand-ins ${R[k][0]?.shadowTicks}, mean stand-ins ${R[k][0]?.standIns.toFixed(2)}`);
}
if (CASE === 1 && R.off.length && R.on.length) {
  const same = R.off.every((x) => x.hash === R.off[0].hash) && R.on.every((x) => x.hash === R.off[0].hash);
  const uo = R.off.map((x) => x.cpuUser), un = R.on.map((x) => x.cpuUser), wo = R.off.map((x) => x.total), wn = R.on.map((x) => x.total);
  const pct = (a, b) => (((a - b) / b) * 100).toFixed(2);
  console.log(`  worlds identical at the end, every run (the overhead is the only difference): ${same} (${R.off[0].hash})`);
  console.log(`  on vs off, USER CPU: min ${pct(Math.min(...un), Math.min(...uo))}% (${Math.min(...uo).toFixed(3)} -> ${Math.min(...un).toFixed(3)} ms), median ${pct(med(un), med(uo))}%; wall: min ${pct(Math.min(...wn), Math.min(...wo))}%, median ${pct(med(wn), med(wo))}%`);
  console.log(`  a difference under the spread (off ${spread(uo).toFixed(1)}%, on ${spread(un).toFixed(1)}% in user CPU) cannot be resolved`);
}
