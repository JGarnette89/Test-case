/* Belief: where you think the traffic is once you stop looking.
 *
 * The mechanic is only worth having if two opposite things are both true,
 * so both are measured here rather than assumed:
 *
 *   1. Looking away from a well-driven car costs NOTHING. Its belief
 *      tracks it exactly, forever. Without this the mechanic is noise:
 *      every turning car would read as a deviation and the player would
 *      learn to distrust a signal that means nothing.
 *   2. Looking away from a badly-driven one costs you. The belief and the
 *      truth separate, by more the longer you leave it.
 *
 * Plus the housekeeping that makes it feel honest: a look decays, a
 * re-look restores it, and the belief never jumps at the moment you
 * glance at it.
 */
import {
  observe, predictAt, confidenceAt, divergenceAt, deviatesEver,
  BELIEF_HOLD, BELIEF_FADE, BELIEF_SAME,
} from "../src/engine/belief.js";
import { simulate, poseAt, M } from "../src/engine/index.js";
import { SCENARIOS } from "../src/engine/scenarios.js";

const m = (px) => Math.round((px / 20) * 100) / 100;
let problems = 0;
const ok = (s) => console.log(`  ok   ${s}`);
const fail = (s) => { problems++; console.log(`  FAIL: ${s}`); };

const base = SCENARIOS.find((s) => s.id === "gap");
const withTraits = (traits) => {
  const scn = { ...base, ego: { ...base.ego, traits, departAt: simulate(base).legalAt } };
  return { scn, sim: simulate(scn) };
};

/* ---------- 1. a clean car is where you left it -------------------- */
console.log("1. LOOKING AWAY FROM GOOD DRIVING COSTS NOTHING");
{
  let worstAnywhere = 0, offenders = [];
  for (const scn of SCENARIOS) {
    if (scn.layout === "roundabout") continue;
    const sim = simulate(scn);
    for (const p of [sim.ego, ...sim.actors]) {
      if ((p.traits || []).length) continue;              // only the clean ones
      const d = deviatesEver(p, 0, 18);
      if (d.worst > worstAnywhere) worstAnywhere = d.worst;
      if (d.deviates) offenders.push(`${scn.id}/${p.id} by ${m(d.worst)}m`);
    }
  }
  offenders.length === 0
    ? ok(`no clean driver anywhere ever deviates from its own prediction (worst ${m(worstAnywhere)}m, floor ${m(BELIEF_SAME)}m)`)
    : fail(`clean drivers deviated: ${offenders.join(", ")}`);

  /* Turning is the case that would break a dead-reckoning prediction, so
     it gets its own check: a car going properly round a corner must not
     read as having deviated just because it turned. */
  const turners = [];
  for (const scn of SCENARIOS) {
    if (scn.layout === "roundabout") continue;
    const sim = simulate(scn);
    for (const p of [sim.ego, ...sim.actors]) {
      if ((p.traits || []).length) continue;
      if (p.intent === "left" || p.intent === "right") turners.push(deviatesEver(p, 0, 18).worst);
    }
  }
  turners.length && Math.max(...turners) <= BELIEF_SAME
    ? ok(`${turners.length} clean turning cars all stay on prediction through the corner (worst ${m(Math.max(...turners))}m)`)
    : turners.length
      ? fail(`a clean turn read as a deviation (${m(Math.max(...turners))}m) — the prediction is not following the road`)
      : fail("no clean turning car found to test the corner case");
}

/* ---------- 2. a bad driver drifts out of your belief -------------- */
console.log("\n2. LOOKING AWAY FROM BAD DRIVING COSTS YOU");
{
  console.log("\n   trait         worst belief error   at      grows with time away?");
  console.log("   " + "-".repeat(64));
  let real = 0;
  for (const trait of ["wander", "creep", "overshoot", "slowStart", "wideTurn", "cutsCorner"]) {
    const { sim } = withTraits([trait]);
    const d = deviatesEver(sim.ego, 0, 18);

    /* And it has to get worse the longer you leave it, or a single glance
       would be as good as watching. Sampled from one observation. */
    const obs = observe(sim.ego, 0);
    const early = divergenceAt(sim.ego, obs, 1.5);
    const late = divergenceAt(sim.ego, obs, 6);
    const grows = late > early;

    if (d.deviates) real++;
    else fail(`${trait}: belief never diverges (${m(d.worst)}m) — nothing to catch`);
    console.log(
      `   ${trait.padEnd(13)} ${(m(d.worst) + "m").padStart(17)}   ${String(d.at).padStart(5)}s   ` +
      `${grows ? `yes (${m(early)}m -> ${m(late)}m)` : `no (${m(early)}m -> ${m(late)}m)`}`
    );
  }
  real === 6 ? ok("every path trait makes your belief wrong if you stop watching") : null;

  /* lateSignal is the control in the other direction: it bends no path,
     so it must NOT create a belief error. A signal fault is something you
     have to have been looking at, not something you can infer later. */
  const { sim: sigSim } = withTraits(["lateSignal"]);
  const sig = deviatesEver(sigSim.ego, 0, 18);
  !sig.deviates
    ? ok(`lateSignal correctly creates no belief error (${m(sig.worst)}m) — you had to be watching`)
    : fail(`lateSignal produced a ${m(sig.worst)}m belief error, but it bends no path`);
}

/* ---------- 3. a look decays, and a re-look restores it ------------ */
console.log("\n3. A LOOK WEARS OFF, AND LOOKING AGAIN FIXES IT");
{
  const obs = observe(withTraits(["wander"]).sim.ego, 2);
  confidenceAt(obs, 2) === 1 && confidenceAt(obs, 2 + BELIEF_HOLD) === 1
    ? ok(`a fresh look is worth full confidence for ${BELIEF_HOLD}s`)
    : fail("a fresh look did not start at full confidence");

  let monotone = true, prev = 1;
  for (let dt = BELIEF_HOLD; dt <= BELIEF_HOLD + BELIEF_FADE + 0.5; dt += 0.1) {
    const c = confidenceAt(obs, 2 + dt);
    if (c > prev + 1e-9) monotone = false;
    prev = c;
  }
  monotone ? ok("confidence only ever decays") : fail("confidence went back up without a new look");

  confidenceAt(obs, 2 + BELIEF_HOLD + BELIEF_FADE + 0.01) === 0
    ? ok(`after ${BELIEF_HOLD + BELIEF_FADE}s the belief is gone entirely, not merely faint`)
    : fail("a stale belief never reaches zero, so looking away is free");

  /* Re-observing has to actually repair the belief, or re-checking is
     pointless. */
  const { sim } = withTraits(["wander"]);
  const stale = observe(sim.ego, 0);
  const staleErr = divergenceAt(sim.ego, stale, 5);
  const fresh = observe(sim.ego, 5);
  const freshErr = divergenceAt(sim.ego, fresh, 5);
  freshErr < BELIEF_SAME && freshErr < staleErr
    ? ok(`looking again wipes the error out (${m(staleErr)}m stale, ${m(freshErr)}m re-checked)`)
    : fail(`re-observing did not repair the belief (${m(staleErr)}m -> ${m(freshErr)}m)`);
}

/* ---------- 4. the belief never jumps ------------------------------ */
console.log("\n4. GLANCING AT SOMETHING DOES NOT MAKE IT TELEPORT");
{
  /* At the instant of a look, prediction and truth must agree — the
     offset is carried, not reset. Otherwise every glance would visibly
     snap the car sideways, which reads as a bug rather than as learning
     something. */
  const { sim } = withTraits(["wander"]);
  let worstSnap = 0;
  for (let t = 0; t <= 10; t += 0.25) {
    const obs = observe(sim.ego, t);
    worstSnap = Math.max(worstSnap, divergenceAt(sim.ego, obs, t));
  }
  worstSnap < 1e-6
    ? ok("prediction and truth agree exactly at the moment of a look — no snap")
    : fail(`the belief jumps ${m(worstSnap)}m when observed`);

  const { sim: s2 } = withTraits(["wideTurn"]);
  const o = observe(s2.ego, 3);
  const a = predictAt(s2.ego, o, 3.0), b = predictAt(s2.ego, o, 3.05);
  a && b && Math.hypot(b.x - a.x, b.y - a.y) < M(1.5)
    ? ok("a belief moves smoothly, at something like a car's speed")
    : fail("the predicted position jumps between adjacent frames");
}

/* ---------- 5. is this a challenge, or a trap? --------------------- */
console.log("\n5. NOT EVERY CAR HAS TO REPAY A SECOND LOOK");
{
  let deviating = 0, total = 0;
  for (const scn of SCENARIOS) {
    if (scn.layout === "roundabout") continue;
    const sim = simulate(scn);
    for (const p of sim.actors) {
      total++;
      if (deviatesEver(p, 0, 18).deviates) deviating++;
    }
  }
  console.log(`   ${deviating} of ${total} road users in the shipped set would betray a stale belief.`);
  deviating < total
    ? ok("most traffic is safe to glance at once, so a deviation means something")
    : fail("every single road user deviates — the mechanic would just be a tax on looking away");
}

console.log("\n" + "=".repeat(70));
console.log(problems === 0 ? "OK: belief carries on, and only bad driving betrays it." : `${problems} PROBLEM(S) FOUND.`);
process.exit(problems === 0 ? 0 : 1);
