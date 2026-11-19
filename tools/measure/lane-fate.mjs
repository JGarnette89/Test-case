/* WHAT BECAME OF THE CARS IN THE FIFTH LANE AT A SEAM (DECISIONS 10.143): which lane each car on hw-5000 is in, where it left it, whether it was still there at the far end. With an acceleration lane declared with no feeding road the result is IDENTICAL to the road as built, which is how the lane-drop probe was shown to have measured nothing. Usage: node tools/measure/lane-fate.mjs cars mins L seed (L 0 = as built) */
import { TEST_MAPS } from "../../src/map/samples.js";
import { worldFor } from "../../src/sim/scene.js";
import { step } from "../../src/sim/crossing.js";
import { DT } from "../../src/sim/traffic.js";
const cars = Number(process.argv[2] ?? 260), mins = Number(process.argv[3] ?? 8), L = Number(process.argv[4] ?? 600), seed = Number(process.argv[5] ?? 1);
const raw = TEST_MAPS.find((m) => m.id === "test-highway-gen-wide").build();
const span = raw.roads.find((r) => r.id === "hw-5000"); if (L) span.accel = { start: { length: L } };
let { world: w } = worldFor(seed, 50, 2.0, false, cars, raw, null, false);
const laneOf = (a) => { const m = String(a.route).match(/hw-5000\|(?:start|end)#(\d+)/g); return m ? m : null; };
const fate = new Map(); let maxS = 0; const cur = {};
for (let i = 0; i < (mins * 60) / DT; i++) {
  w = step(w);
  for (const a of w.actors) {
    if (a.parked || a.player) continue; const r = String(a.route);
    const m = r.match(/^hw-5000\|start#(\d+)\//) || r.match(/(?:^|\/)hw-5000\|start#(\d+)/); const onSpan = /(^|\/)hw-5000\|/.test(r) ? r.split("/").find((x) => x.startsWith("hw-5000|")) : null;
    if (!onSpan) continue; const lane = Number(onSpan.split("#")[1]);
    let f = fate.get(a.id); if (!f) { f = { enter: lane, enterS: a.s, lanes: [lane], last: lane }; fate.set(a.id, f); }
    if (lane !== f.last) { f.lanes.push(lane); f.last = lane; f.leftAt ??= { lane: f.last, s: a.s }; }
    f.maxS = Math.max(f.maxS ?? 0, a.s); f.minV = Math.min(f.minV ?? 99, a.v ?? 0);
  }
}
const all = [...fate.values()], inL = all.filter((f) => f.enter === 4);
console.log(`${L ? `lane ends over ${L} m` : "as built"}, ${cars} cars, ${mins} min: ${all.length} cars crossed hw-5000's seam; entered in the 5th lane (index 4): ${inL.length}`);
const stayed = inL.filter((f) => f.last === 4), moved = inL.filter((f) => f.last !== 4);
console.log(`  of those: moved to another lane ${moved.length} (at s: ${moved.map((f) => Math.round(f.leftAt?.s ?? -1)).sort((a, b) => a - b).slice(0, 12).join(", ")}); still in lane index 4 when last seen ${stayed.length} (max s ${Math.round(Math.max(0, ...stayed.map((f) => f.maxS)))}), slowest speed seen in lane ${Math.min(...inL.map((f) => f.minV)).toFixed(1)} m/s`);
