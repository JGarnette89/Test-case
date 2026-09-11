/* =====================================================================
   THE RATING-STRIPPED TWIN, MEASURED BEFORE ANYTHING IS BUILT ON IT.

   Stage 4's definition of a fault (REBUILD.md 5.2): run the same seed
   with this driver's weak rating set to the optimum, and diff the
   traces; where they separate by more than a driver could fail to
   notice, that axis produced a visible error there. The old engine did
   this against a trait, at the same INSTANT, and it worked because
   nothing else moved in response. In a stepped world a twin who stops
   half a second longer at a line is eight metres behind for the rest of
   the leg, and everybody behind them is too -- so the question this
   script answers, before a line of derivation is written, is:

     in what domain does the difference between a driver and their twin
     LOCALISE to the place the fault happened, and how large is it?

   Per leg, per profile: the world is forked at the handoff, the
   candidate's disposition is replaced by the sound one in the fork
   (state -- position, speed, plan, where they are in a wait -- is kept),
   and both run to the next handoff. The two traces are compared ALONG
   THE ROAD, at the same metre, rather than at the same instant: how
   fast each was there, how far off the line, and when each got there.

   Section 0 is the point: the sound driver against their own twin must
   differ by exactly nothing, or the fork is not a controlled comparison.

   `node tools/measure/twin.mjs [legs] [seed]`. Not a check.
   ===================================================================== */
import { seedCourse, step, poseOf, TWO_WAY, DT, strayOf } from "../../src/sim/crossing.js";
import { withCandidates, keepDriving, PROFILES } from "../../src/sim/candidate.js";
import { driver } from "../../src/sim/traffic.js";
import { poseOn } from "../../src/sim/course.js";

const LEGS = Number(process.argv[2] ?? 6);
const SEED = Number(process.argv[3] ?? 4);
const f = (x, n = 2) => (Number.isFinite(x) ? x.toFixed(n) : "-");
const sound = PROFILES.find((p) => p.id === "sound").ratings;

/* The disposition fields `driver()` derives, and nothing else: the twin
   keeps every piece of state the original had at the fork. */
const DISPOSITION = ["ratings", "weakOn", "caution", "rollsStops", "brake", "weave", "weavePhase", "v0", "headway"];
function twinOf(world, a) {
  const d = driver(world.road, 4242, a.trip, sound);
  const out = { ...a };
  for (const k of DISPOSITION) out[k] = d[k];
  return out;
}
const forkWith = (world, id) => ({
  ...world,
  actors: world.actors.map((a) => (a.candidate === id ? twinOf(world, a) : a)),
});

/* Run one candidate through one leg, recording their trace along the
   path until the handoff (leg changes) or the trip ends. */
function runLeg(world, id) {
  const start = world.actors.find((a) => a.candidate === id);
  const leg = start.leg ?? 0, trip = start.trip;
  const trace = [];
  let w = world;
  for (let i = 0; i < 4000; i++) {
    const a = w.actors.find((x) => x.candidate === id);
    if (!a || a.trip !== trip || (a.leg ?? 0) !== leg) break;
    const p = poseOf(w, a);
    trace.push({ t: w.t, s: a.s, v: a.v, stray: strayOf(w, a), x: p.x, y: p.y, stopped: a.stoppedAt != null, delayed: a.delayed });
    w = keepDriving(step(w));
  }
  return { world: w, trace, leg, trip, ended: !w.actors.find((x) => x.candidate === id && x.trip === trip) };
}

/* Resample a trace onto whole metres of `s`, by interpolation. */
function onMetres(trace) {
  const out = new Map();
  for (let i = 1; i < trace.length; i++) {
    const a = trace[i - 1], b = trace[i];
    for (let m = Math.ceil(a.s); m <= b.s; m++) {
      const k = b.s === a.s ? 0 : (m - a.s) / (b.s - a.s);
      out.set(m, { t: a.t + (b.t - a.t) * k, v: a.v + (b.v - a.v) * k, stray: a.stray + (b.stray - a.stray) * k });
    }
  }
  return out;
}

console.log(`\nTHE TWIN, seed ${SEED}, ${LEGS} legs per profile, bends on`);
console.log("   per leg: where along the leg (metres before the line, negative past it) the two differ most, and by how much\n");
for (const profile of PROFILES) {
  let w = withCandidates(
    seedCourse(SEED, 60, { every: 3.0, control: TWO_WAY, cols: 3, rows: 2, bends: 1 }),
    [{ id: "X", profile: profile.id, planned: true }],
  );
  const rows = [];
  for (let n = 0; n < LEGS; n++) {
    const a = w.actors.find((x) => x.candidate === "X");
    if (!a) break;
    const layout = w.course.at[a.k ?? 0].layout;
    const path = layout.paths[a.route];
    const mine = runLeg(w, "X");
    const twin = runLeg(forkWith(w, "X"), "X");
    const A = onMetres(mine.trace), B = onMetres(twin.trace);
    let dv = { d: 0, at: null }, ds = { d: 0, at: null }, dt = { d: 0, at: null }, over = 0, common = 0;
    for (const [m, p] of A) {
      const q = B.get(m);
      if (!q) continue;
      common++;
      const where = path.stopAt - m;    // metres BEFORE the line; negative once past it
      if (Math.abs(p.v - q.v) > Math.abs(dv.d)) dv = { d: p.v - q.v, at: where };
      if (Math.abs(p.stray - q.stray) > Math.abs(ds.d)) ds = { d: p.stray - q.stray, at: where };
      if (Math.abs(p.t - q.t) > Math.abs(dt.d)) dt = { d: p.t - q.t, at: where };
      if (Math.abs(p.v - q.v) > 1.0 || Math.abs(p.stray - q.stray) > 0.45) over++;
    }
    const endT = mine.trace.at(-1)?.t - twin.trace.at(-1)?.t;
    rows.push({ leg: mine.leg, route: a.route, len: f(path.length, 0), common, dv, ds, dt, over, endT, ended: mine.ended });
    w = mine.world;
    if (mine.ended) break;
  }
  console.log(`${profile.id.toUpperCase()} (${profile.name ?? ""}) against the sound twin`);
  for (const r of rows) {
    console.log(`   leg ${r.leg} ${r.route.padEnd(11)} ${r.len}m: ` +
      `speed differs most by ${f(r.dv.d)} m/s at ${f(r.dv.at, 0)}m; ` +
      `stray by ${f(r.ds.d, 3)}m at ${f(r.ds.at, 0)}m; ` +
      `time by ${f(r.dt.d, 1)}s at ${f(r.dt.at, 0)}m (${f(r.endT, 1)}s at the end); ` +
      `${r.over}/${r.common}m visibly different` + (r.ended ? " [trip ended]" : ""));
  }
}
console.log();
