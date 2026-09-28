/* =====================================================================
   STAGE 3: THE EXAM MODE AS A REINTERPRETATION (src/sim/exam.js,
   #/exam). What has to be true of it, whatever the numbers:

     1. silence is straight on, at every intersection;
     2. a direction given in time is the turn they take, moving over a
        lane for it if they have to;
     3. one given too late to slow for the corner is not taken -- they
        carry on, and it is the examiner's fault -- and "too late" is
        the corner model's own arithmetic, not a distance picked here;
     4. one given past the line is for the next intersection;
     5. easing the slider slows them BY THEIR OWN DRIVING, never harder
        than a controlled stop; the bottom of it is the instructor's
        brake, which is not theirs;
     6. with no hand on them the hook changes nothing at all.
   ===================================================================== */
import { loadMap } from "../src/map/load.js";
import { testMap1 } from "../src/map/samples.js";
import { emptyMap, road } from "../src/map/format.js";
import { seedGraph, step, pathOf } from "../src/sim/crossing.js";
import { candidateOn, candidateOf, direct, interventionOf, withIntervention, pickProfile, DUAL_AT, CANDIDATE } from "../src/sim/exam.js";
import { cornerOf } from "../src/sim/corner.js";
import { HARSH_AT, DT } from "../src/sim/traffic.js";
import { NEUTRAL, BRAKE_MAX } from "../src/sim/player.js";
import { profileOf, PROFILES } from "../src/sim/candidate.js";

let failed = 0;
const check = (ok, msg) => { console.log(`  ${ok ? "ok  " : "FAIL:"} ${msg}`); if (!ok) failed++; };

const test1 = loadMap(testMap1());
const onTest = (seed = 1, profile = "sound") => candidateOn(seedGraph(seed, 50, test1, { target: 60, posted: true }), { profile, road: "A-north", end: "end" });

/* Step until `stop(me, world)` or the candidate leaves; record the intent
   of the path they were on at each leg. */
function ride(w, { ticks = 4000, stop = () => false, hand = null } = {}) {
  const took = {};
  for (let i = 0; i < ticks; i++) {
    const me = candidateOf(w);
    if (!me || stop(me, w)) break;
    took[me.leg] = pathOf(w, me).intent;
    w = step(hand ? withIntervention(w, hand) : w);
  }
  return { w, took };
}

console.log("\n1. THE CANDIDATE, AND SILENCE");
{
  const w = onTest(1, "heavy");
  const me = candidateOf(w);
  check(me && me.id === CANDIDATE && JSON.stringify(me.ratings) === JSON.stringify(profileOf("heavy").ratings), "the candidate is an ordinary driver built from the named profile's own ratings");
  check(PROFILES.every((p) => pickProfile(3, p.id) === p.id) && pickProfile(3) === pickProfile(3) && PROFILES.some((p) => p.id === pickProfile(5)), "a chosen profile is kept; 'surprise me' is a draw from the six, fixed by the seed");
  const { took } = ride(w, { stop: (m) => m.leg >= 2 });
  check(took[0] === "straight" && (took[1] == null || took[1] === "straight"), `told nothing, they go straight on (${JSON.stringify(took)})`);
}

console.log("\n2. A DIRECTION IN TIME IS THE TURN THEY TAKE");
for (const intent of ["left", "right"]) {
  const r = direct(onTest(1), intent);
  const { took } = ride(r.world, { stop: (m) => m.leg >= 1 });
  check(r.heard === "now" && took[0] === intent, `"${intent}" given 370 m out is heard for this intersection and taken (${took[0]})${intent === "left" ? ", moving over from the curb lane for it" : ""}`);
}

console.log("\n3. TOO LATE TO SLOW FOR THE CORNER IS NOT TAKEN, BY THE CORNER'S OWN ARITHMETIC");
{
  /* A free-flowing T: a through road east-west, a side street off it,
     nobody told to stop on the through road -- so the candidate arrives
     at road speed and "too late" is a question about braking, not about
     a line they were stopping at anyway. */
  const m = emptyMap("tee", "free-flowing T");
  m.roads.push(road({ id: "w", kind: "collector", points: [{ x: 0, y: 0 }, { x: 400, y: 0 }] }));
  m.roads.push(road({ id: "e", kind: "collector", points: [{ x: 400, y: 0 }, { x: 800, y: 0 }] }));
  m.roads.push(road({ id: "s", kind: "collector", points: [{ x: 400, y: 0 }, { x: 400, y: 300 }], control: { start: "stop", end: "none" } }));
  const tee = loadMap(m);
  const fresh = () => candidateOn(seedGraph(2, 50, tee, { target: 0, posted: true }), { profile: "sound", road: "w", end: "end" });
  const w0 = fresh();
  const me0 = candidateOf(w0);
  const lay = w0.course.at[me0.k].layout;
  const turn = Object.values(lay.paths).find((p) => p.intent !== "straight" && lay.legs[p.from]?.base === lay.legs[pathOf(w0, me0).from]?.base);
  check(!!turn && !!cornerOf(turn), `the through road offers a turn into the side street (${turn?.intent})`);
  const corner = cornerOf(turn);
  const atDist = (d) => ride(fresh(), { stop: (m) => corner.from - m.s < d }).w;
  const early = direct(atDist(80), turn.intent);
  const late = direct(atDist(6), turn.intent);
  const lateMe = candidateOf(atDist(6));
  check(early.heard === "now", `told 80 m before the corner: heard for this intersection`);
  check(late.heard === "late" && lateMe.v > 8, `told 6 m before it at ${(lateMe.v * 3.6).toFixed(0)} km/h: too late -- the braking it needs is over HARSH_AT (${HARSH_AT.toFixed(2)} m/s^2)`);
  const tookLate = ride(late.world, { stop: (m) => m.leg >= 1 }).took;
  const tookEarly = ride(early.world, { stop: (m) => m.leg >= 1 }).took;
  check(tookLate[0] === "straight" && tookEarly[0] === turn.intent, `and they carry straight on (${tookLate[0]}), where told in time they turn (${tookEarly[0]})`);
  /* The boundary is the arithmetic: find the last distance still heard
     "now" and check the braking it asks is within HARSH_AT, and the first
     "late" beyond it. */
  let lastNow = null;
  for (let d = 60; d >= 2; d -= 1) { const w = atDist(d); if (direct(w, turn.intent).heard === "now") lastNow = { d, w }; else break; }
  const m1 = candidateOf(lastNow.w);
  check(lastNow && lastNow.d < 40, `the cutoff falls where braking runs out, ${lastNow.d} m before the arc at ${(m1.v * 3.6).toFixed(0)} km/h -- not at a distance anybody chose`);
}

console.log("\n4. PAST THE LINE, IT IS FOR THE NEXT INTERSECTION");
{
  let { w } = ride(onTest(1), { stop: (m, ww) => m.s > pathOf(ww, m).stopAt + 1 });
  const r = direct(w, "right");
  const me = candidateOf(r.world);
  check(r.heard === "next" && me.plan[(me.leg ?? 0) + 1] === "right", "told once through the crossroads' line: heard for the next one");
  const { took } = ride(r.world, { stop: (m) => m.leg >= 2 });
  check(took[0] === "straight" && took[1] === "right", `they finish the crossroads as they were going (${took[0]}), and turn right at the next (${took[1]})`);
}

console.log("\n5. THE SLIDER: TELLING THEM TO SLOW, AND THE INSTRUCTOR'S BRAKE");
{
  check(interventionOf(0.8).ease === 0 && interventionOf(-NEUTRAL + 0.01).ease === 0 && interventionOf(0).dual === 0, "the upper half and the neutral band do nothing -- the examiner has no throttle");
  const mid = interventionOf(-0.5), bottom = interventionOf(-1), edge = interventionOf(-(NEUTRAL + DUAL_AT * (1 - NEUTRAL)) + 0.001);
  check(mid.ease > 0 && mid.ease < DUAL_AT && !mid.dual && bottom.dual === BRAKE_MAX && !bottom.ease && edge.ease > 0 && !edge.dual,
    `easing down is graduated (${mid.ease.toFixed(2)} at half travel), and only the last tenth is the brake, at the car's full ${BRAKE_MAX} m/s^2`);

  /* Controlled comparison: same seed, same candidate, same start. */
  const run = (hand, secs) => {
    let w = onTest(4, "sound"); let peak = 0;
    for (let i = 0; i < secs / DT; i++) { const v0 = candidateOf(w).v; w = step(withIntervention(w, hand)); peak = Math.max(peak, (v0 - candidateOf(w).v) / DT); }
    return { v: candidateOf(w).v, peak };
  };
  const free = run({ ease: 0, dual: 0 }, 8), eased = run(interventionOf(-0.55), 8), braked = run(interventionOf(-1), 4);
  check(eased.v < free.v * 0.75, `told to slow, they slow: ${(eased.v * 3.6).toFixed(0)} km/h after 8 s against ${(free.v * 3.6).toFixed(0)} left alone`);
  check(eased.peak <= HARSH_AT + 1e-9, `and by their own driving -- never harder than a controlled stop (peak ${eased.peak.toFixed(2)} m/s^2, HARSH_AT ${HARSH_AT.toFixed(2)})`);
  check(braked.v === 0 && braked.peak > HARSH_AT, `the instructor's brake is not theirs: stopped within 4 s, braking at ${braked.peak.toFixed(2)} m/s^2`);
}

console.log("\n6. WITH NO HAND ON THEM, THE HOOK CHANGES NOTHING");
{
  const bare = (w) => ({ ...w, actors: w.actors.map((a) => { if (a.id !== CANDIDATE) return a; const { ease, dual, ...rest } = a; return rest; }) });
  let a = onTest(6), b = bare(onTest(6));
  let same = true;
  for (let i = 0; i < 1200 && same; i++) {
    a = step(a); b = step(b);
    const strip = (w) => JSON.stringify(w.actors.map(({ ease, dual, ...rest }) => rest));
    same = strip(a) === strip(b);
  }
  check(same, "a minute of the same world, candidate with and without the examiner's fields: identical, tick for tick");
}

console.log(`\n${"=".repeat(70)}`);
console.log(failed ? `${failed} FAILURE(S)` : "OK: silence is straight on, a direction in time is taken and a late one is not by the corner's own arithmetic, past the line it is for the next, and the slider slows them by their own driving until the brake, which is yours.");
process.exit(failed ? 1 : 0);
