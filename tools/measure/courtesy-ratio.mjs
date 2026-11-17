/* IS THE COURTESY BAR'S MOVE WITH RIVALS A FINDING ABOUT RIVALS, OR NOISE IN A THIN STATISTIC? (backlog item 3, 17 Nov 2026.) verify-merge's courtesy line asserts, over the waits of 20 s or more
   WITHOUT courtesy (the player stopped at the taper, signalling, 150 cars), that the total wait WITH courtesy is at most 0.7 of the total without. Its own comment says the ratio is about 0.7 and sixteen seeds cannot place it
   (7 long waits, courtesy helped 4: 0.67); in the played world it reads 0.93-0.95 with rivals on (12-13 waits) and passes with them off. Here the SAME trial (tools/measure/stranded.mjs) on `blocks` blocks of sixteen seeds,
   rivals on and off (brake reaction and walkers off in both, as in the arms that separated them), so the spread BETWEEN blocks of one arm says how much of the 0.67-to-0.94 move is the dice and how much is the rivals.
   Prediction stated before it ran: if it is noise, the blocks of one arm span about as wide as the arms differ (the ratio's own spread over blocks is 0.15 or more); if it is the rivals, the rivals-on blocks all sit well above the
   rivals-off blocks with little overlap. Usage: node tools/measure/courtesy-ratio.mjs [blocks=3] */
import { loadMap } from "../../src/map/load.js";
import { TEST_MAPS } from "../../src/map/samples.js";
import { seedGraph, step } from "../../src/sim/crossing.js";
import { strandTrial } from "./stranded.mjs";
const BLOCKS = Number(process.argv[2] ?? 3), loaded = loadMap(TEST_MAPS.find((m) => m.id === "test-loop").build());
const block = (rivals, b) => {
  const on = [], off = [];
  for (let seed = 1 + 16 * b; seed <= 16 * (b + 1); seed++) {
    let base = seedGraph(seed, 50, loaded, { target: 150, posted: true, brakeReaction: false, walkers: false, rivals });
    for (const at of [120, 165]) {
      while (base.t < at) base = step(base);
      for (let k = 0; k < base.course.at.length; k++) { const L = base.course.at[k].layout; for (const [r, p] of Object.entries(L.paths)) { if (!L.legs[p.to]?.accel || !L.legs[p.from]?.road?.startsWith("on-")) continue; on.push(strandTrial(base, k, r, true)); off.push(strandTrial(base, k, r, false)); } }
    }
  }
  const tail = off.map((o, i) => [isFinite(o) ? o : 120, isFinite(on[i]) ? on[i] : 120]).filter(([o]) => o >= 20);
  const ratio = tail.reduce((t, [, w]) => t + w, 0) / Math.max(1, tail.reduce((t, [o]) => t + o, 0));
  return { n: tail.length, ratio, trials: on.length, rivalsOn: rivals };
};
for (const rivals of [false, true]) { const rows = Array.from({ length: BLOCKS }, (_, b) => block(rivals, b)); console.log(`rivals ${rivals ? "ON " : "OFF"}: blocks of 16 seeds -> long waits / ratio: ${rows.map((r) => `${r.n} / ${r.ratio.toFixed(2)}`).join("   ")}  (the bar is 0.7)`); }
