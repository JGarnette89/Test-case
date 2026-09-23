/* =====================================================================
   THE GAP A DRIVER TOOK, IN SECONDS, MEASURED BEFORE ANY FAULT IS BUILT
   ON IT.

   Confidence's risky tail has no markable expression anywhere in the
   project (CLAUDE.md: "confidence has no risky-tail error at all"), and
   the twin measurement (REBUILD.md stage 4) says why the controlled
   comparison will not supply one: the bold driver differs from their twin
   by a standing pace and by a time difference that appears at the box --
   6 to 22 seconds -- which is a consequence, not a place.

   The place is the moment of commitment, and the quantity is the one
   `hasGap` already computes there: the time until the other car reaches
   the conflict region at the speed it is visibly doing, less the time the
   driver needs to be clear of it. Post-encroachment time, planned rather
   than reacted (DECISIONS.md 6, 7): what the driver left the other car,
   on the other car's own line, whatever the other car then did.

   This script records that margin at every commitment a candidate makes,
   per profile, and against the old engine's entitled gap (`ENTITLED`,
   clearance.js) -- so that whether the bold driver is separable from the
   sound one by it, and whether the sound one ever falls inside the
   entitled gap, are measured before either is asserted.

   `node tools/measure/gaps.mjs [seconds] [seed]`. Not a check.
   ===================================================================== */
import { seedCourse, step, TWO_WAY, DT, layoutOf } from "../../src/sim/crossing.js";
import { withCandidates, keepDriving, PROFILES } from "../../src/sim/candidate.js";
import { timeToCover } from "../../src/sim/traffic.js";
import { ENTITLED } from "../../src/engine/clearance.js";
import { OPPOSITE } from "../../src/sim/course.js";

const SECONDS = Number(process.argv[2] ?? 600);
const SEEDS = [Number(process.argv[3] ?? 4), 5, 6];
const f = (x, n = 2) => (Number.isFinite(x) ? x.toFixed(n) : "-");

/* The margin left to every car this one's path conflicts with, at this
   tick, on their visible speed and its own path. The smallest is the gap
   it took. */
function marginsOf(world, me) {
  const layout = layoutOf(world, me);
  const mine = layout.paths[me.route];
  const stops = (path) => layout.place.control[path.from] === "stop";
  const out = [];
  for (const them of world.actors) {
    if (them.id === me.id || (them.k ?? 0) !== (me.k ?? 0)) continue;
    const meet = layout.conflicts[them.route + "|" + me.route];
    if (!meet) continue;
    const theirs = layout.paths[them.route];
    /* Only the cars this driver had to JUDGE A GAP against. A car already
       committed is one they yield to unconditionally, so if they went
       anyway it was not this tick's decision; two stopping cars settle by
       arrival order, and no gap is judged. What is left is the through
       road from a stop line, and the oncoming for a left turn. */
    if (them.going || them.s >= theirs.stopAt) continue;
    if (them.s > meet.a) continue;
    const judged = (stops(mine) && !stops(theirs))
      || (!stops(mine) && !stops(theirs) && mine.intent === "left"
          && theirs.from === OPPOSITE[mine.from] && theirs.intent !== "left");
    if (!judged) continue;
    const reach = (meet.a - them.s) / Math.max(them.v, 0.5);
    const clear = timeToCover(me.v, meet.clearOf - me.s, me.v0);
    out.push({ them: them.id, margin: reach - clear, reach, clear });
  }
  return out;
}

console.log(`\nTHE GAP TAKEN AT COMMITMENT, per profile, ${SECONDS}s x ${SEEDS.length} seeds, two-way stops, bends on`);
console.log(`   entitled gap (clearance.js ENTITLED): ${ENTITLED}s; the old engine's bands: encroached below it, inside the reaction envelope below half of it\n`);
console.log("   profile      commits  gaps taken (s): min   p10   median   p90 | inside entitled  inside half | never had to yield");
for (const p of PROFILES) {
  const taken = [];
  let commits = 0, free = 0;
  for (const seed of SEEDS) {
    let w = withCandidates(seedCourse(seed, 60, { every: 3.0, control: TWO_WAY, cols: 3, rows: 2, bends: 1 }), [{ id: "X", profile: p.id, planned: true }]);
    let was = null;
    for (let i = 0; i < Math.round(SECONDS / DT); i++) {
      const before = w.actors.find((x) => x.candidate === "X");
      w = keepDriving(step(w));
      const a = w.actors.find((x) => x.candidate === "X");
      if (!a || !before || a.id !== before.id) { was = null; continue; }
      /* Commitment: the tick they start going from a stop, or -- on a leg
         that never stops -- the tick they cross the line. */
      const path = layoutOf(w, a).paths[a.route];
      const committed = (a.going && !before.going) || (before.s < path.stopAt && a.s >= path.stopAt && !a.going);
      if (!committed) continue;
      commits++;
      const m = marginsOf(w, before);
      if (!m.length) { free++; continue; }
      taken.push(Math.min(...m.map((x) => x.margin)));
    }
  }
  taken.sort((a, b) => a - b);
  const q = (k) => taken.length ? taken[Math.min(taken.length - 1, Math.floor(k * taken.length))] : NaN;
  const inside = taken.filter((x) => x < ENTITLED).length, half = taken.filter((x) => x < ENTITLED / 2).length;
  console.log(`   ${p.id.padEnd(11)} ${String(commits).padStart(6)}   ${String(taken.length).padStart(4)} gaps:   ${f(q(0), 1).padStart(5)} ${f(q(0.1), 1).padStart(5)} ${f(q(0.5), 1).padStart(8)} ${f(q(0.9), 1).padStart(5)} | ${String(inside).padStart(15)}  ${String(half).padStart(11)} | ${free}`);
}
console.log();
