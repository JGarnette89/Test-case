/* =====================================================================
   PERCEPTION LAG, MEASURED BEFORE IT IS SWITCHED ON FOR ANYBODY.

   The observation axis as a live input (crossing.js, `seenBy`): a driver
   decides from the world as it was `lag` seconds ago, the lag derived
   from the observation rating with the old engine's own registration
   constants. It is OFF by default because it moves every trace, and
   because the honest questions have to be answered first:

     1. does ordinary traffic still keep off itself with everybody a
        reaction floor behind and the poor observers up to two seconds
        behind -- or is the observation axis's expression contact, which
        the game cannot yet respond to (DECISIONS.md 5.12)?
     2. what does a poor observer actually do that a good one does not:
        the gap they take (true against perceived), the following gap
        they close to, how hard they end up braking?
     3. and the control: with perception on but every lag at the floor,
        how far does the world move from perception off?

   `node tools/measure/lag.mjs [seconds]`. Not a check.
   ===================================================================== */
import {
  seedCourse, step, overlapping, TWO_WAY, DT, layoutOf, PERCEIVE, seenBy, CAR, whatStops,
} from "../../src/sim/crossing.js";
import { withCandidates, keepDriving, PROFILES } from "../../src/sim/candidate.js";
import { timeToCover, HARSH_AT } from "../../src/sim/traffic.js";
import { OPPOSITE } from "../../src/sim/course.js";

const SECONDS = Number(process.argv[2] ?? 300);
const SEEDS = [4, 5, 6];
const f = (x, n = 2) => (Number.isFinite(x) ? x.toFixed(n) : "-");
const sound = PROFILES.find((p) => p.id === "sound").ratings;

console.log(`\n1. TRAFFIC WITH EVERYBODY PERCEIVING LATE (${SECONDS}s x ${SEEDS.length} seeds, two-way stops, bends on)`);
console.log(`   floor ${PERCEIVE.floor}s for a perfect observer, up to ${f(PERCEIVE.floor + PERCEIVE.span * (1 + PERCEIVE.jitter))}s for the worst\n`);
for (const perceive of [false, true]) {
  let hits = 0, pairs = new Set(), harsh = 0, ticks = 0, lags = [], cars = 0, minGap = Infinity;
  for (const seed of SEEDS) {
    let w = seedCourse(seed, 60, { every: 3.0, control: TWO_WAY, cols: 3, rows: 2, bends: 1, perceive });
    for (let i = 0; i < Math.round(SECONDS / DT); i++) {
      w = step(w);
      ticks++;
      cars = Math.max(cars, w.actors.length);
      for (const o of overlapping(w)) { hits++; pairs.add(`${seed}:${o.a}|${o.b}`); }
      for (const a of w.actors) {
        if ((a.a ?? 0) < -HARSH_AT) harsh++;
        if (perceive && !lags.includes(a.lag)) lags.push(a.lag);
        /* The true gap to whoever is actually in front, while moving. */
        if (a.v > 3) { const v = whatStops({ ...a, lag: 0 }, w); if (v.leader && v.gap < minGap) minGap = v.gap; }
      }
    }
  }
  lags.sort((x, y) => x - y);
  const q = (k) => lags.length ? lags[Math.min(lags.length - 1, Math.floor(k * lags.length))] : NaN;
  console.log(`   perceive=${perceive}: up to ${cars} cars; overlapping car-ticks ${hits} (${pairs.size} distinct pairs); harsh-braking ticks ${harsh}; closest true following gap while moving ${f(minGap)}m` +
    (perceive ? `; lags min ${f(q(0))} median ${f(q(0.5))} p90 ${f(q(0.9))} max ${f(q(1))}s over ${lags.length} drivers` : ""));
}

console.log(`\n2. THE CANDIDATE, BY OBSERVATION RATING (${SECONDS}s x ${SEEDS.length} seeds): the gap they take, true against perceived, and how they follow`);
const stops = (layout, path) => layout.place.control[path.from] === "stop";
function margins(world, me, actors) {
  const layout = layoutOf(world, me);
  const mine = layout.paths[me.route];
  const out = [];
  for (const them of actors) {
    if (them.id === me.id || (them.k ?? 0) !== (me.k ?? 0)) continue;
    const meet = layout.conflicts[them.route + "|" + me.route];
    if (!meet) continue;
    const theirs = layout.paths[them.route];
    if (them.going || them.s >= theirs.stopAt || them.s > meet.a) continue;
    const judged = (stops(layout, mine) && !stops(layout, theirs))
      || (!stops(layout, mine) && !stops(layout, theirs) && mine.intent === "left"
          && theirs.from === OPPOSITE[mine.from] && theirs.intent !== "left");
    if (!judged) continue;
    out.push((meet.a - them.s) / Math.max(them.v, 0.5) - timeToCover(me.v, meet.clearOf - me.s, me.v0));
  }
  return out;
}
console.log("   observation  lag(s)  | judged gaps: tightest TRUE margin, tightest PERCEIVED | true margins under 2s | closest follow gap | harsh ticks | overlaps with the candidate");
for (const observation of [0.9, 0.5, 0.15]) {
  let lag = null, taken = [], seen = [], under = 0, minGap = Infinity, harsh = 0, hits = 0;
  for (const seed of SEEDS) {
    let w = withCandidates(
      seedCourse(seed, 60, { every: 3.0, control: TWO_WAY, cols: 3, rows: 2, bends: 1, perceive: true }),
      [{ id: "X", profile: "sound", planned: true, ratings: { ...sound, observation } }],
    );
    for (let i = 0; i < Math.round(SECONDS / DT); i++) {
      const before = w.actors.find((x) => x.candidate === "X");
      w = keepDriving(step(w));
      const a = w.actors.find((x) => x.candidate === "X");
      if (!a) continue;
      lag = a.lag;
      if ((a.a ?? 0) < -HARSH_AT) harsh++;
      for (const o of overlapping(w)) if (o.a === a.id || o.b === a.id) hits++;
      if (a.v > 3) { const v = whatStops({ ...a, lag: 0 }, w); if (v.leader && v.gap < minGap) minGap = v.gap; }
      if (!before || before.id !== a.id) continue;
      const path = layoutOf(w, a).paths[a.route];
      const committed = (a.going && !before.going) || (before.s < path.stopAt && a.s >= path.stopAt && !a.going);
      if (!committed) continue;
      /* The world they judged (their lag ago) against the world as it was. */
      const wasTrue = margins(w, before, w.past?.[0] ?? w.actors);
      const wasSeen = margins(w, before, seenBy(w, before));
      if (wasTrue.length) { const t = Math.min(...wasTrue); taken.push(t); if (t < 2) under++; }
      if (wasSeen.length) seen.push(Math.min(...wasSeen));
    }
  }
  console.log(`   ${f(observation, 2).padStart(9)}    ${f(lag).padStart(5)}  | ${String(taken.length).padStart(3)} gaps: ${f(Math.min(...taken), 1).padStart(6)}s, ${f(Math.min(...seen), 1).padStart(6)}s | ${String(under).padStart(3)} | ${f(minGap).padStart(8)}m | ${String(harsh).padStart(5)} | ${hits}`);
}
console.log();
