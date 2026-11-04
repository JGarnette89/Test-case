/* verify-courtesy section 7 as a FUNNEL, run by run, over more moments than the
   check takes: where do trials go -- no level car, no offer, an offer not taken,
   taken and noticed? Written 4 November to decide whether the check's 2 of 2 and
   0 of 2 on cross-node-gap are too few trials or a world that broke. `run` is the
   check's own, verbatim but for what it returns.
   node tools/measure/courtesy-taken.mjs [moments, default 180,240,120,150,210,270,300] */
import { loadMap } from "../../src/map/load.js";
import { testLoop } from "../../src/map/samples.js";
import { seedGraph, step } from "../../src/sim/crossing.js";
import { playerOn, withDriver, stepDriver } from "../../src/sim/drive.js";
import { DT } from "../../src/sim/traffic.js";
import { courteous } from "../../src/sim/courtesy.js";
import { gapBeside } from "./courtesy-trial.mjs";
import { sliderFor } from "../../src/sim/player.js";
import { detect, newEventState } from "../../src/sim/events.js";

const moments = (process.argv[2] ?? "180,240,120,150,210,270,300").split(",").map(Number).sort((a, b) => a - b);
const loop = loadMap(testLoop());
const LANE = 3.6;
const run = (base, i, on) => {
  let w = { ...base, courtesy: on };
  const at0 = playerOn(w.course, `loop-${(i % 4) * 2}`, "end");
  const layout = w.course.at[at0.k].layout;
  const base0 = layout.legs[layout.paths[at0.route].from].base;
  const curb = layout.legAt(base0, 2), mid = layout.legAt(base0, 1);
  const route = Object.keys(layout.paths).find((r) => layout.paths[r].from === curb);
  const cp = layout.paths[route];
  const level = w.actors.filter((a) => (a.k ?? 0) === at0.k && layout.paths[a.route]?.from === mid && a.s > 60 && a.s < layout.paths[a.route].stopAt - 200 && !a.lc && a.kind !== "truck" && a.kind !== "bus" && courteous(a));
  if (!level.length) return null;
  const c = level[0], sc = (a) => a.s * (cp.stopAt / layout.paths[a.route].stopAt);
  let pl = { ...at0, route, s: sc(c) + 0.5, v: c.v, off: 0, psi: 0 };
  w = { ...w, actors: w.actors.filter((a) => a.id === c.id || (a.k ?? 0) !== pl.k || Math.abs(sc(a) - pl.s) > 60 || ![curb, mid].includes(layout.paths[a.route]?.from)) };
  let st = newEventState(), offered = false, moving = false, said = false, moved = false, gapAt = null, movedAt = null, steps = 0;
  for (let n = 0; n < (on ? 30 : 90) / DT; n++) {
    steps = n;
    const signal = n * DT >= 1 ? "left" : null;
    if (w.actors.some((a) => a.courtesy?.forPlayer && !a.courtesy.done)) offered = true;
    if (signal && gapBeside(w, pl)) { if (!moving) gapAt = n * DT; moving = true; }
    const want = on ? c.v : c.v - 2;
    const input = { steer: -(pl.off - (moving ? -LANE : 0)) * 0.25 - pl.psi * 2.5, slider: sliderFor((want - pl.v) * 0.6, pl.v, 0), assist: 0 };
    const prev = { me: pl, world: w };
    pl = stepDriver({ ...pl, signal }, input, w, DT);
    w = step(withDriver(w, pl));
    const r = detect(prev, { me: pl, world: w }, st);
    st = r.state;
    if (r.events.some((e) => e.id === "letIn")) said = true;
    if (w.course.at[pl.k].layout.paths[pl.route].from === mid) { if (!moved) movedAt = n * DT; moved = true; }
    if (moved && n * DT > 8) break;
  }
  return { offered, moved, said, gapAt, movedAt, level: level.length, left: w.actors.length, endK: pl.k };
};

const rows = [];
for (const seed of [1, 2, 3, 4, 5, 6]) {
  let w = seedGraph(seed, 50, loop, { target: 200, posted: true });
  for (const at of moments) {
    while (w.t < at) w = step(w);
    for (let i = 0; i < 4; i++) for (const on of [true, false]) {
      const r = run(w, i, on);
      rows.push({ seed, at, i, on, ...(r ?? { none: true }) });
    }
  }
  console.error(`seed ${seed} done`);
}
const report = (label, ms) => {
  const R = rows.filter((r) => ms.includes(r.at)), on = R.filter((r) => r.on), off = R.filter((r) => !r.on);
  const q = on.filter((r) => !r.none), of = q.filter((r) => r.offered), tk = of.filter((r) => r.moved), qo = off.filter((r) => !r.none), al = qo.filter((r) => r.moved);
  console.log(`${label} [${ms.join(",")}]`);
  console.log(`  COURTESY ON : stretches ${on.length}, a level car ${q.length}, offered ${of.length}, offered and moved ${tk.length}, of those said ${tk.filter((r) => r.said).length}; moved without an offer ${q.filter((r) => !r.offered && r.moved).length}, said without moving ${q.filter((r) => !r.moved && r.said).length}`);
  console.log(`  COURTESY OFF: stretches ${off.length}, a level car ${qo.length}, moved ${al.length}, of those said ${al.filter((r) => r.said).length}; never found a gap ${qo.filter((r) => r.gapAt == null).length}`);
};
report("THE CHECK'S OWN MOMENTS", moments.filter((m) => m === 180 || m === 240));
report("ALL MOMENTS", moments);
console.log("RUNS (on) offered and not moved:");
for (const r of rows.filter((x) => x.on && !x.none && x.offered && !x.moved)) console.log(`  seed ${r.seed} t ${r.at} stretch ${r.i}: gapAt ${r.gapAt}`);
console.log("RUNS (off) moved:");
for (const r of rows.filter((x) => !x.on && !x.none && x.moved)) console.log(`  seed ${r.seed} t ${r.at} stretch ${r.i}: gapAt ${r.gapAt}, movedAt ${r.movedAt?.toFixed(1)}, said ${r.said}`);
