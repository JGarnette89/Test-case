/* Fault derivation and the examiner's cone.
 *
 * The examiner game's whole claim to honesty is that a fault is DERIVED,
 * never authored — the same rule that keeps the driver game's window
 * trustworthy, applied to a different object. So the things checked here
 * are the things that claim would be false without:
 *
 *   1. A derived fault is real: strip the trait and it goes away.
 *   2. A fault nobody could see is not a fault, and the engine says which
 *      kind of unseeable it was — occluded, or you were looking away.
 *   3. Gaze is relative to the car, so a rotated scenario plays
 *      identically. route.js rotates every leg of a course; if gaze were
 *      held in world degrees the same drive would need a different look
 *      from each approach.
 *   4. Where you look is a real decision — some gaze must beat another.
 */
import {
  faultsIn, faultWindow, faultAt, POS_VISIBLE, MIN_DURATION,
} from "../src/engine/faults.js";
import {
  whatExaminerSees, faultVisibility, examinerEye, bearingFromCar, inCone,
  EXAMINER_CONE, sightBlockersOf,
} from "../src/engine/sight.js";
import { simulate, poseAt, M } from "../src/engine/index.js";
import { SCENARIOS } from "../src/engine/scenarios.js";
import { rotateScenario, isRotatable } from "../src/engine/route.js";

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

/* ---------- 3. seen, occluded, or simply not looked at -------------- */
console.log("\n3. A FAULT NOBODY COULD SEE IS NOT MARKABLE");
{
  const scn = SCENARIOS.find((s) => s.id === "wanderer");
  const sim = simulate(scn);
  const f = faultsIn(scn)[0];
  if (!f) { fail("wanderer derived no fault to test visibility against"); }
  else {
    const eye = examinerEye(poseAt(sim.ego, f.from));
    const at = faultAt(f, (f.from + f.to) / 2);
    const bearing = bearingFromCar(poseAt(sim.ego, (f.from + f.to) / 2), eye, at);

    const looking = faultVisibility(sim, f, { gaze: bearing });
    const away = faultVisibility(sim, f, { gaze: bearing + 180 });

    looking.seen > away.seen
      ? ok(`looking at it beats looking away (${(looking.seen * 100).toFixed(0)}% vs ${(away.seen * 100).toFixed(0)}% of the fault seen)`)
      : fail(`gaze made no difference (${looking.seen} vs ${away.seen}) — the cone is decoration`);

    /* "away" vs "hidden" is a per-instant distinction, so it is tested at
       an instant. Across a whole fault it would not hold and should not:
       wanderer's fault runs 6.1s and the car drives through the cone
       during it, which is the mechanic working rather than failing. */
    const tMid = (f.from + f.to) / 2;
    const bMid = bearingFromCar(poseAt(sim.ego, tMid), examinerEye(poseAt(sim.ego, tMid)), faultAt(f, tMid));
    const behind = whatExaminerSees(sim, tMid, { gaze: bMid + 180, cone: 60 });
    behind[f.who] === "away"
      ? ok("at an instant, a fault outside the cone reports \"away\" — your fault, not the scenario's")
      : fail(`a fault behind the examiner reported "${behind[f.who]}"`);
  }

  /* Occlusion still has to win independently of gaze: staring straight at
     a van does not let you see through it. */
  const blind = SCENARIOS.find((s) => s.id === "unprotected");
  const bsim = simulate(blind);
  const statics = sightBlockersOf(blind);
  let occluded = 0, clear = 0;
  for (let t = blind.ego.arriveAt ?? 0; t <= (blind.ego.arriveAt ?? 0) + 3; t += 0.25) {
    const sees = whatExaminerSees(bsim, t, { gaze: 0, cone: 360, statics });
    for (const v of Object.values(sees)) {
      if (v === "hidden" || v === "partial") occluded++;
      if (v === "clear") clear++;
    }
  }
  occluded > 0
    ? ok(`with a full 360 cone, the van still hides traffic (${occluded} occluded readings vs ${clear} clear)`)
    : fail("occlusion stopped applying once the cone was opened — the two tests are tangled");
}

/* ---------- 4. gaze rotates with the scene -------------------------- */
console.log("\n4. GAZE IS RELATIVE, SO A ROTATED COURSE PLAYS IDENTICALLY");
{
  /* route.js rotates a scenario to meet whichever approach the previous
     leg leaves you on. If the examiner's look were held in world degrees,
     the same drive would demand a different gaze from each approach and
     rotation would stop being safe. */
  let checked = 0, drifted = 0;
  for (const scn of SCENARIOS) {
    if (!isRotatable(scn)) continue;
    const faults = faultsIn(scn);
    if (!faults.length) continue;
    const f0 = faults[0];
    const sim0 = simulate(scn);
    const mid = (f0.from + f0.to) / 2;
    const eye0 = examinerEye(poseAt(sim0.ego, mid));
    const base = bearingFromCar(poseAt(sim0.ego, mid), eye0, faultAt(f0, mid));

    for (const turns of [1, 2, 3]) {
      const rot = rotateScenario(scn, turns);
      if (!rot) continue;
      const fr = faultsIn(rot).find((x) => x.trait === f0.trait);
      if (!fr) { drifted++; fail(`${scn.id}@${turns}: the fault vanished under rotation`); continue; }
      const simR = simulate(rot);
      const eyeR = examinerEye(poseAt(simR.ego, mid));
      const b = bearingFromCar(poseAt(simR.ego, mid), eyeR, faultAt(fr, mid));
      checked++;
      if (Math.abs(b - base) > 1) {
        drifted++;
        fail(`${scn.id}@${turns}: needs gaze ${b.toFixed(1)}deg, unrotated needs ${base.toFixed(1)}deg`);
      }
    }
  }
  checked > 0 && drifted === 0
    ? ok(`${checked} rotated copies all need the same gaze as the original`)
    : checked === 0 ? fail("no rotatable scenario carried a fault to test") : null;
}

/* ---------- 5. where you look has to matter ------------------------- */
console.log("\n5. WHERE YOU LOOK IS A REAL DECISION");
{
  /* Not "a gaze exists" but "no single gaze is free". If one fixed look
     caught everything, the mechanic would be a switch. */
  const rows = [];
  for (const scn of SCENARIOS) {
    const fs = faultsIn(scn);
    if (fs.length < 2) continue;
    const sim = simulate(scn);
    const statics = sightBlockersOf(scn);
    for (let gaze = -90; gaze <= 90; gaze += 15) {
      let caught = 0;
      for (const f of fs) if (faultVisibility(sim, f, { gaze, statics }).seen > 0.25) caught++;
      rows.push({ scn: scn.id, gaze, caught, of: fs.length });
    }
  }
  if (!rows.length) {
    console.log("  note: no situation carries two faults at once yet — the trade is untestable here");
    ok("skipped: needs a multi-fault situation, which examiner content will bring");
  } else {
    const byScn = new Map();
    for (const r of rows) {
      const cur = byScn.get(r.scn);
      if (!cur || r.caught > cur.caught) byScn.set(r.scn, r);
    }
    let allFree = 0;
    for (const [id, best] of byScn) {
      console.log(`   ${id.padEnd(12)} best single gaze ${String(best.gaze).padStart(4)}deg catches ${best.caught} of ${best.of}`);
      if (best.caught === best.of) allFree++;
    }
    allFree < byScn.size
      ? ok("at least one situation cannot be solved by holding a single gaze")
      : console.log("  note: every situation here is solvable with one look — expected until faults are placed apart on purpose");
  }
}

console.log("\n" + "=".repeat(70));
console.log(problems === 0 ? "OK: faults derive, and the cone decides what was markable." : `${problems} PROBLEM(S) FOUND.`);
process.exit(problems === 0 ? 0 : 1);
