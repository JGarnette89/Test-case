/* A CAR COMES OUT FROM BEHIND A TRUCK (4 November; SIMULATOR IN FLIGHT 40, DECISIONS
   10.39 and 10.40; the predictions were committed before this was written). An
   uncontrolled crossroads. The subject comes straight through in the inner lane of a
   two-lane approach, past a line of TRUCKS standing in the curb lane beside them, which
   hides the road to their right until they clear it. A real car comes along that road
   with the right of way by the right-hand rule, the same in every world, because it does
   not slow for what it cannot see (caution 0): only the subject changes. Its arrival is
   a grid. WHY THIS STAGING, each of the earlier ones failing the mechanism check and never
   judged on outcomes. One truck at the corner: this world has no buildings, so across open
   ground a driver sees everything, and it barely covers a car on a converging course
   (blocked 0% of the approach, in view from 167 m, every subject identical). Trucks queued
   on the cross road: hidden until 24.5 m, but blockedBy treats a truck on a conflicting
   path as somebody to wait for, parked or not, so every subject stopped for good. In the
   curb lane beside the subject they go the same way and conflict with nobody.
   Comparisons between subjects on the same trials: NOT a rate of anything in the world.
   Usage: node tools/measure/sight-emerge.mjs [offsets=21] [drivers=10] [trucks=9] [run-up=90]
   THE RUN-UP MATTERS: from further back the subject sees the car across open ground before the trucks hide it, and a driver's memory carries it forward (crossing.js MEMORY), so nothing comes as a surprise. Trials where it was seen first are excluded from every summary and counted. */
import { emptyMap, road } from "../../src/map/format.js";
import { loadMap } from "../../src/map/load.js";
import { seedGraph, step, whatStops, poseOf, carFor, blockedSightline, conflictOf, waitAt, blockedBy } from "../../src/sim/crossing.js";
import { driver, DT, PERSONAL, vehicleOf } from "../../src/sim/traffic.js";
import { blocked, boxOf, eyeOf } from "../../src/sim/sight.js";
import { cautionOf, reads } from "../../src/core/driver.js";
const [OFFS = 21, DRIVERS = 10, TRUCKS = 9, RUNUP = 90] = process.argv.slice(2).map(Number);
const P = (x, y) => ({ x, y, z: 0 });
const m = emptyMap("emerge");
m.bounds = { x: 0, y: 0, w: 800, h: 800 };
m.roads.push(road({ id: "w", kind: "collector", lanes: 2, points: [P(0, 400), P(400, 400)] }), road({ id: "e", kind: "collector", lanes: 2, points: [P(400, 400), P(800, 400)] }), road({ id: "n", kind: "collector", lanes: 1, points: [P(400, 0), P(400, 400)] }), road({ id: "s", kind: "collector", lanes: 1, points: [P(400, 800), P(400, 400)] }));
const loaded = loadMap(m);
const base = seedGraph(1, 50, loaded, { every: 1e9, target: 0, posted: true, trucks: 0, laneChanges: false, keepRight: false });
const L = base.course.at[0].layout;
const straight = (id) => Object.keys(L.paths).filter((r) => L.legs[L.paths[r].from]?.road === id && L.paths[r].intent === "straight");
const west = straight("w").sort((a, b) => L.legs[L.paths[a].from].lane - L.legs[L.paths[b].from].lane);
if (west.length < 2) throw new Error("the approach needs two lanes");
const inner = west[0], curbLeg = L.paths[west[west.length - 1]].from;
/* The curb lane's RIGHT TURN: on the curb lane's straight path the trucks cross the real car's, and it waited on them (blockedBy does not ask whether anybody is parked), so nothing ever came out. */
const queueRoute = Object.keys(L.paths).find((r) => L.paths[r].from === curbLeg && L.paths[r].intent === "right");
if (!queueRoute) throw new Error("no right turn from the curb lane");
/* East on a y-down map, the road to the south is on the driver's right. */
const crossRoute = straight("s")[0];
if (conflictOf(L, queueRoute, inner) || conflictOf(L, queueRoute, crossRoute)) throw new Error("the trucks' path conflicts with somebody's");
const meet = conflictOf(L, crossRoute, inner);
if (!meet) throw new Error("no crossing");
const sound = { observation: 1, confidence: 0.5, steering: 1, braking: 1, knowledge: 1, compliance: 1 };
const SUBJECTS = { sound, "knowledge-poor": { ...sound, knowledge: 0 }, "observation-poor": { ...sound, observation: 0.2 }, bold: { ...sound, confidence: 0.8 }, "max bold": { ...sound, confidence: 1 } };
const WORLDS = { "old rule": {}, amber: { marginCanStop: true }, caution: { marginCanStop: true, sightCaution: true }, "caution, no truck": { marginCanStop: true, sightCaution: true, noTruck: true } };
const posted = { ...base.road, speed: 50 / 3.6, kmh: 50, kind: "collector" };
const person = (w, n, id, route, ratings) => {
  const who = driver(posted, 1, n, ratings, null, "car"), out = { ...carFor(w, n, 0, route, null, "car"), id, n };
  for (const k of PERSONAL) out[k] = who[k];
  return out;
};
function trial(flags, ratings, n, offset) {
  const { noTruck, ...fl } = flags;
  let w = { ...base, ...fl, actors: [], crashes: [] };
  const pi = L.paths[inner], pq = L.paths[queueRoute];
  const me = person(w, n, "subject", inner, ratings);
  const S0 = pi.stopAt - RUNUP;
  me.s = S0; me.v = me.v0;
  const T = (meet.b - S0) / me.v;
  const x = person(w, n + 1000, "cross", crossRoute, sound);
  x.caution = 0; x.v = x.v0;
  x.s = meet.a - x.v0 * (T + offset);
  if (x.s < 0) throw new Error(`the cross road is too short for offset ${offset}: s ${x.s.toFixed(0)}`);
  const actors = [me, x];
  if (!noTruck) for (let i = 0; i < TRUCKS; i++) {
    const tr = carFor(w, n + 2000 + i, 0, queueRoute, null, "truck"), len = vehicleOf(tr).length;
    actors.push({ ...tr, id: `truck${i}`, s: pq.stopAt - len / 2 - 1 - i * (len + 2), v: 0, v0: 1e-4, parked: true });   // parked: they hide and claim nothing; standing at the line, they held the right of way themselves and every subject waited on them. A wanted speed of exactly 0 is removed by the step.
  }
  w = { ...w, actors };
  const stand = actors.slice(2).map((a) => a.s);
  w = { ...w, tall: actors.slice(2).map((a) => boxOf(poseOf(w, a), a.id)) };
  const r = { hit: false, line: null, first: me.v, seenV: null, seenRoom: null, wasHidden: false, seenFirst: false, peak: 0, over: false, tS: null, tC: null, minV: me.v, blockedAsked: 0, blockedYes: 0, truckMoved: false, slowedAtRoom: null };
  const line = waitAt(pi, me);
  let held = false;
  for (let i = 0; i < 30 / DT; i++) {
    const was = w.actors.find((a) => a.id === "subject");
    if (was && was.s < line) { const v = whatStops(was, w); if (process.env.EM_TRACE && i % 40 === 0) { const L2 = w.course.at[0].layout; console.log("t", w.t.toFixed(1), "s", was.s.toFixed(0), "v", was.v.toFixed(1), "toLine", (line - was.s).toFixed(0), "held", v.held, "leader", v.leader?.id, "gap", v.gap?.toFixed(0), "byHidden", !!v.byHidden, "cover", v.cover ? v.cover.vc.toFixed(1) : "-", "blockers", w.actors.filter((q) => q.id !== "subject" && blockedBy(was, q, L2, was.caution, w.t, null)).map((q) => q.id).join(",")); } held = v.held && v.leader?.id === "line"; r.blockedAsked++; if (blockedSightline(w, was)) r.blockedYes++; }
    const n0 = (w.crashes ?? []).length;
    w = step(w);
    const a = w.actors.find((c) => c.id === "subject"), c = w.actors.find((q) => q.id === "cross");
    if ((w.crashes ?? []).slice(n0).some((k) => k.a === "subject" || k.b === "subject")) { r.hit = true; }
    if (!a) break;
    /* A TRUCK GONE IS A TRUCK MOVED: the first version only asked of trucks still there, and passed with none. */
    if (stand.length && (w.actors.filter((q) => String(q.id).startsWith("truck")).length !== stand.length || w.actors.some((q) => String(q.id).startsWith("truck") && Math.abs(q.s - stand[Number(String(q.id).slice(5))]) > 0.5))) r.truckMoved = true;
    r.minV = Math.min(r.minV, a.v);
    if (r.line == null && a.s >= line) { r.line = a.v; if (held && a.v > 0.5) r.over = true; }
    /* IN VIEW FOR GOOD: the last time the car comes out from behind the trucks, and the hardest braking from then on. */
    if (c && a.s < meet.b && c.s < meet.a) {
      const seen = noTruck || !blocked(eyeOf(poseOf(w, a), a), poseOf(w, c), w.tall ?? []);
      if (!seen) { if (r.seenV != null && !noTruck) r.seenFirst = true; r.wasHidden = true; r.seenV = null; r.seenRoom = null; r.peak = 0; }
      else if (r.seenV == null) { r.seenV = a.v; r.seenRoom = meet.b - a.s; }
    }
    if (r.seenV != null) r.peak = Math.max(r.peak, -(a.a ?? 0));
    if (r.tS == null && a.s >= meet.b) r.tS = w.t;
    if (c && r.tC == null && c.s >= meet.a) r.tC = w.t;
    if (r.hit || (r.tS != null && r.tC != null)) break;
  }
  const pet = r.tS != null && r.tC != null ? Math.abs(r.tS - r.tC) : null;
  r.outcome = r.hit ? "hit" : pet == null ? "unfinished" : pet < 0.45 ? "tight" : r.tC < r.tS ? "gave way" : "went first";
  r.cut = r.line == null ? null : 1 - r.line / r.first;
  return r;
}
const mean = (a) => a.reduce((p, q) => p + q, 0) / Math.max(1, a.length), med = (a) => { const q = [...a].sort((x, y) => x - y); return q[q.length >> 1] ?? 0; };
const offsets = Array.from({ length: OFFS }, (_, i) => -2.5 + (5 * i) / Math.max(1, OFFS - 1));
const summary = (rows) => {
  const count = (k) => rows.filter((r) => r.outcome === k).length, cuts = rows.filter((r) => r.cut != null).map((r) => r.cut);
  return `${String(rows.length).padStart(4)} | hit ${String(count("hit")).padStart(3)} tight ${String(count("tight")).padStart(3)} gave way ${String(count("gave way")).padStart(3)} went first ${String(count("went first")).padStart(3)} unfin ${String(count("unfinished")).padStart(2)} | cut mean ${(100 * mean(cuts)).toFixed(0).padStart(3)}% slowed10+ ${(100 * cuts.filter((x) => x >= 0.1).length / Math.max(1, cuts.length)).toFixed(0).padStart(3)}% | seen at v ${mean(rows.filter((r) => r.seenV != null).map((r) => r.seenV)).toFixed(1).padStart(4)} | peak brake med ${med(rows.map((r) => r.peak)).toFixed(1).padStart(4)}, over 5.4: ${String(rows.filter((r) => r.peak > 5.4).length).padStart(3)} | overshoot ${String(rows.filter((r) => r.over).length).padStart(3)}`;
};
const all = {};
for (const [wn, flags] of Object.entries(WORLDS)) {
  console.log(`\n${wn}`);
  for (const [sn, ratings] of Object.entries(SUBJECTS)) {
    const rows = [];
    let excluded = 0;
    for (const off of offsets) for (let n = 1; n <= DRIVERS; n++) { const r = trial(flags, ratings, n, off); r.off = off; if (r.seenFirst) excluded++; else rows.push(r); }
    all[`${wn}|${sn}`] = rows;
    if (excluded) console.log(`    (${excluded} seen before the trucks hid it, excluded)`);
    console.log(`  ${sn.padEnd(17)} ${summary(rows)}`);
  }
}
{
  const c = all["caution|sound"];
  console.log(`\nTHE MECHANISM, caution, sound: sightline query true on ${(100 * mean(c.map((r) => r.blockedYes / Math.max(1, r.blockedAsked)))).toFixed(0)}% of approach ticks; the car first in view with the subject a median ${med(c.filter((r) => r.seenRoom != null).map((r) => r.seenRoom)).toFixed(1)} m from the meeting point (no truck: ${med(all["caution, no truck|sound"].filter((r) => r.seenRoom != null).map((r) => r.seenRoom)).toFixed(1)} m); hidden at some point on ${c.filter((r) => r.wasHidden).length} of ${c.length} trials; seen before the trucks hid it on ${c.filter((r) => r.seenFirst).length}; the car reached the meeting point on ${c.filter((r) => r.tC != null).length} of ${c.length} and the subject on ${c.filter((r) => r.tS != null).length}; trucks moved on ${c.filter((r) => r.truckMoved).length}; caution values ${Object.entries(SUBJECTS).map(([k, v]) => `${k} ${cautionOf(v).toFixed(2)}`).join(", ")}; knowledge-poor reads the rule: ${reads({ ratings: SUBJECTS["knowledge-poor"], stuck: {} }, "blocked-sightline")}`);
  console.log("\nOBSERVATION-POOR, CAUTION, SPLIT BY WHETHER THEY SLOWED ON THAT TRIAL (10%+)");
  const o = all["caution|observation-poor"];
  console.log(`  slowed            ${summary(o.filter((r) => (r.cut ?? 0) >= 0.1))}`);
  console.log(`  did not           ${summary(o.filter((r) => (r.cut ?? 0) < 0.1))}`);
  console.log(`  compare sound     ${summary(c)}`);
  console.log(`  compare knowledge ${summary(all["caution|knowledge-poor"])}`);
  console.log("\nOF THE TRIALS WHERE THE CAR REALLY WAS A THREAT: those where the subject did not go clear first");
  for (const wn of ["amber", "caution"]) for (const sn of Object.keys(SUBJECTS)) { const q = all[`${wn}|${sn}`].filter((r) => r.outcome !== "went first"); console.log(`  ${wn.padEnd(8)} ${sn.padEnd(17)} ${summary(q)}`); }
  console.log("\nSAME TRIALS, BY OFFSET, HITS UNDER CAUTION (each row 10 trials a subject)");
  for (const off of offsets) console.log(`  ${off.toFixed(2).padStart(6)}  ${Object.keys(SUBJECTS).map((s) => `${s.slice(0, 6)} ${String(all[`caution|${s}`].filter((r) => Math.abs(r.off - off) < 1e-9 && r.hit).length).padStart(2)}`).join("  ")}`);
}
