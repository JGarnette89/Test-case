/* Fault derivation, and what occlusion still hides.
 *
 * The examiner game's whole claim to honesty is that a fault is DERIVED,
 * never authored — the same rule that keeps the driver game's window
 * trustworthy, applied to a different object. So:
 *
 *   1. A derived fault is real: strip the trait and it goes away.
 *   2. The candidate's own car faults like any other participant.
 *   3. Occlusion still gates detection, from ONE oracle the renderer is
 *      obliged to draw from — because the scorer must never know
 *      something the screen did not show.
 *
 * The view cone is gone. What constrains attention is the viewport, and
 * that is verify-camera.mjs's business now.
 */
import {
  faultsIn, faultWindow, faultAt, POS_VISIBLE, MIN_DURATION,
} from "../src/engine/faults.js";
import {
  whatEgoSees, faultSeenAt, faultShownFor, sightBlockersOf,
} from "../src/engine/sight.js";
import { SHOWN_ENOUGH } from "../src/engine/detect.js";
import { simulate, poseAt, M } from "../src/engine/index.js";
import { SCENARIOS } from "../src/engine/scenarios.js";

const m = (px) => Math.round((px / 20) * 100) / 100;
let problems = 0;
const ok = (s) => console.log(`  ok   ${s}`);
const fail = (s) => { problems++; console.log(`  FAIL: ${s}`); };

/* ---------- 1. faults are derived, and they are real ---------------- */
console.log("1. EVERY DERIVED FAULT IS A REAL ONE");
{
  const all = [];
  for (const scn of SCENARIOS) for (const f of faultsIn(scn)) all.push({ scn, f });

  all.length
    ? ok(`${all.length} fault(s) derived across ${SCENARIOS.length} situations, none authored`)
    : fail("no faults derived at all — the whole mechanism is inert");

  /* The control: with the trait gone the same query must find nothing.
     This is what separates "derived" from "asserted" — if a fault
     survives its own cause being removed, it was never derived from it. */
  let ghosts = 0;
  for (const { scn, f } of all) {
    const stripped = f.who === "ego"
      ? { ...scn, ego: { ...scn.ego, traits: (scn.ego.traits || []).filter((t) => t !== f.trait) } }
      : { ...scn, actors: scn.actors.map((a) => a.id === f.who
        ? { ...a, traits: (a.traits || []).filter((t) => t !== f.trait) } : a) };
    if (faultWindow(stripped, f.who, f.trait)) { ghosts++; fail(`${scn.id}/${f.who}/${f.trait}: survives its own trait being removed`); }
  }
  ghosts === 0 ? ok("removing the trait removes the fault, every time") : null;

  let short = 0;
  for (const { scn, f } of all) {
    if (f.duration < MIN_DURATION) { short++; fail(`${scn.id}/${f.trait}: ${f.duration}s is below the callable floor`); }
    if (faultAt(f, f.from) == null) fail(`${scn.id}/${f.trait}: faultAt is null at its own start`);
    if (faultAt(f, f.to + 1) != null) fail(`${scn.id}/${f.trait}: faultAt reports a position after it ended`);
  }
  short === 0 ? ok(`every fault lasts at least the ${MIN_DURATION}s callable floor and locates itself in time`) : null;

  console.log("\n   situation    driver  trait          from    for     peak      channel");
  console.log("   " + "-".repeat(70));
  for (const { scn, f } of all) {
    console.log(
      `   ${scn.id.padEnd(12)} ${String(f.who).padEnd(7)} ${f.trait.padEnd(14)} ` +
      `${f.from.toFixed(2).padStart(5)}s ${f.duration.toFixed(2).padStart(6)}s ` +
      `${(f.channel === "signal" ? "-" : m(f.peakPos) + "m").padStart(8)}   ${f.channel}`
    );
  }
}

/* ---------- 2. the candidate's own car can fault -------------------- */
console.log("\n2. THE CANDIDATE FAULTS LIKE ANYONE ELSE");
{
  /* The flip's load-bearing fact: schedule() applies traits to every
     participant, the ego included, so the car being examined needs no
     special case anywhere. */
  const base = SCENARIOS.find((s) => s.id === "gap");
  const traits = ["wander", "creep", "overshoot", "slowStart", "wideTurn", "cutsCorner"];
  let derived = 0;
  for (const t of traits) {
    const scn = { ...base, ego: { ...base.ego, traits: [t] } };
    const found = faultsIn(scn).filter((f) => f.who === "ego" && f.trait === t);
    if (found.length === 1) derived++;
    else fail(`${t} on the candidate derived ${found.length} fault(s), expected 1`);
  }
  derived === traits.length
    ? ok(`all ${traits.length} path traits derive a fault on the candidate's own car`)
    : null;

  const clean = faultsIn(base).filter((f) => f.who === "ego");
  clean.length === 0
    ? ok("a candidate with no traits commits no faults — no false positives")
    : fail(`a clean candidate derived ${clean.length} fault(s)`);
}

/* ---------- 3. occlusion still gates, and honestly ------------------ */
console.log("\n3. A FAULT BEHIND SOMETHING IS NOT ONE YOU MISSED");
{
  /* The view cone is gone: nothing about WHERE the player looks within
     the screen gates detection any more. Occlusion stays, because being
     hidden behind a van is core to the game -- and it is fair only under
     one constraint, which is what this section exists to guard:

       the scorer must never know something the screen did not show.

     So the check is that the value the SCORER uses is the same value a
     renderer would draw from. One oracle, consumed by both. */
  const blind = SCENARIOS.find((x) => x.id === "unprotected");
  const bsim = simulate(blind);
  const statics = sightBlockersOf(blind);

  let hid = 0, showed = 0;
  for (let t = 0; t <= 6; t += 0.1) {
    const sees = whatEgoSees(bsim, t, 0, statics);
    for (const v of Object.values(sees)) (v === "hidden" ? hid++ : showed++);
  }
  hid > 0
    ? ok(`the van still hides traffic (${hid} hidden readings against ${showed} visible)`)
    : fail("nothing was ever hidden -- occlusion stopped applying");

  /* Nothing can occlude your own car, so the candidate own faults are
     always available to someone sitting in it. */
  const own = { ...SCENARIOS.find((x) => x.id === "gap") };
  own.ego = { ...own.ego, traits: ["wander"] };
  const osim = simulate(own);
  const of_ = faultsIn(own).find((f) => f.who === "ego");
  faultSeenAt(osim, of_, (of_.from + of_.to) / 2, []) === "clear"
    ? ok("the candidate own line is never occluded -- you are sitting in it")
    : fail("something occluded the candidate own car");

  /* And the gate is a DURATION, not a share of the fault life -- a share
     is the cone bug in new clothes. */
  const shown = faultShownFor(osim, of_, []);
  shown >= SHOWN_ENOUGH
    ? ok(`an unobstructed fault is shown for ${shown.toFixed(2)}s, past the ${SHOWN_ENOUGH}s floor`)
    : fail(`an unobstructed fault was only shown ${shown}s`);
}

/* Sections 4 and 5 moved to verify-camera.mjs when the cone was removed.
   Rotation invariance is now a property of FRAMING rather than of gaze,
   and "no single view holds everything" is the camera mechanic itself. */

console.log("\n" + "=".repeat(70));
console.log(problems === 0 ? "OK: faults derive, and occlusion decides honestly what was markable." : `${problems} PROBLEM(S) FOUND.`);
process.exit(problems === 0 ? 0 : 1);
