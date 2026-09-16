/* =====================================================================
   DENSITY, MEASURED BEFORE THE COURSE IS MADE BUSIER.

   Three of the five axes read at the box -- confidence both ways,
   observation, and knowledge where the road is free -- and every
   measurement of them on the course came back thin for one reason: at
   `every: 3.0` spread over ten edges, the through road offers a car every
   fifteen seconds or so, so nobody is ever pressed to judge a gap. The
   crossing where undue delay was derived ran four edges at 1.1s.

   This script drives the same course at several spawn intervals and
   reports what each buys and costs: cars on the road, what share of the
   candidate's commitments had anybody to judge a gap against, the
   tightest margins taken, undue-delay showings for the hesitant driver,
   overlaps (which must stay zero), and the tick cost -- so that the
   interval a course uses is a content decision made against numbers
   rather than a feeling.

   `node tools/measure/density.mjs [seconds]`. Not a check.
   ===================================================================== */
import { seedCourse, step, overlapping, TWO_WAY, DT, layoutOf, edgesOf } from "../../src/sim/crossing.js";
import { withCandidates, keepDriving } from "../../src/sim/candidate.js";
import { noticing } from "../../src/sim/marking.js";
import { timeToCover } from "../../src/sim/traffic.js";
import { OPPOSITE } from "../../src/sim/course.js";

const SECONDS = Number(process.argv[2] ?? 300);
const f = (x, n = 2) => (Number.isFinite(x) ? x.toFixed(n) : "-");

const stops = (layout, path) => layout.place.control[path.from] === "stop";
function margins(world, me) {
  const layout = layoutOf(world, me), mine = layout.paths[me.route];
  const out = [];
  for (const them of world.actors) {
    if (them.id === me.id || (them.k ?? 0) !== (me.k ?? 0)) continue;
    const meet = layout.conflicts[them.route + "|" + me.route];
    if (!meet) continue;
    const theirs = layout.paths[them.route];
    if (them.going || them.s >= theirs.stopAt || them.s > meet.a) continue;
    if (!((stops(layout, mine) && !stops(layout, theirs))
      || (!stops(layout, mine) && !stops(layout, theirs) && mine.intent === "left" && theirs.from === OPPOSITE[mine.from] && theirs.intent !== "left"))) continue;
    out.push((meet.a - them.s) / Math.max(them.v, 0.5) - timeToCover(me.v, meet.clearOf - me.s, me.v0));
  }
  return out;
}

const edges = edgesOf(seedCourse(1, 60, { every: 3.0, control: TWO_WAY, cols: 3, rows: 2 }).course);
const weight = edges.reduce((t, e) => t + e.weight, 0);
console.log(`\nDENSITY ON THE 3x2 COURSE (${SECONDS}s per profile, two-way stops, bends on): ${edges.length} edges, weight ${weight}, through-road ends weigh 2`);
console.log("   every   ~s per through end | cars | bold: commits, judged, tightest, <2s | timid: commits, judged, undue-delay showings, waited | overlaps | ms per sim-second\n");
for (const every of [3.0, 2.0, 1.2, 0.8, 0.5]) {
  const row = { every, perEnd: every * weight / 2 };
  let cars = 0, hits = 0, ms = 0;
  for (const profile of ["bold", "timid"]) {
    let w = withCandidates(
      seedCourse(4, 60, { every, control: TWO_WAY, cols: 3, rows: 2, bends: 1 }),
      [{ id: "X", profile, planned: true }],
    );
    let commits = 0, judged = 0, tightest = Infinity, under = 0, waited = 0;
    const t0 = Date.now();
    for (let i = 0; i < Math.round(SECONDS / DT); i++) {
      const before = w.actors.find((x) => x.candidate === "X");
      w = noticing(keepDriving(step(w)));
      cars = Math.max(cars, w.actors.length);
      hits += overlapping(w).length;
      const a = w.actors.find((x) => x.candidate === "X");
      if (!a) continue;
      if (a.stoppedAt != null && !a.going) waited += DT;
      if (!before || before.id !== a.id) continue;
      const path = layoutOf(w, a).paths[a.route];
      if (!((a.going && !before.going) || (before.s < path.stopAt && a.s >= path.stopAt && !a.going))) continue;
      commits++;
      const m = margins(w, before);
      if (m.length) { judged++; const t = Math.min(...m); tightest = Math.min(tightest, t); if (t < 2) under++; }
    }
    ms += Date.now() - t0;
    const showings = (w.faults ?? []).filter((x) => x.trait === "undueDelay").length;
    row[profile] = { commits, judged, tightest, under, waited, showings };
  }
  const b = row.bold, t = row.timid;
  console.log(`   ${f(every, 1).padStart(5)}   ${f(row.perEnd, 1).padStart(6)}s            | ${String(cars).padStart(4)} | ${String(b.commits).padStart(3)}, ${String(b.judged).padStart(3)}, ${f(b.tightest, 1).padStart(5)}s, ${String(b.under).padStart(2)} | ${String(t.commits).padStart(3)}, ${String(t.judged).padStart(3)}, ${String(t.showings).padStart(2)}, ${f(t.waited, 0).padStart(4)}s | ${String(hits).padStart(4)} | ${f(ms / (2 * SECONDS), 1)}`);
}
console.log();
