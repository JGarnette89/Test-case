/* How a drive ends: contact, and taking the wheel.
 *
 * This exists because a collision was a state the game could not
 * represent. Two cars drove through each other and play carried on, and
 * the generator's accept test was refusing contact to stand in for the
 * gap. Meanwhile the lab went black every time two cars touched -- not
 * because of the contact, but because touching is what makes one car
 * occlude another, which is what rendered a component that did not exist.
 *
 * So the properties here are the ones that would have to be true of any
 * correct implementation of the maintainer's ruling, and the one that
 * matters most is an ASYMMETRY rather than a number: a candidate is never
 * penalised for the examiner's nerves.
 */
import { simulate, poseAt, conflicts, spanOf, STEP, M } from "../src/engine/index.js";
import {
  OUTCOME, INTERVENTION, ON, contactIn, judgeIntervention, wasPreventable,
  outcomeOf, describeOutcome,
  contactsAcross, driveOutcome, describeDrive, judgeGrab, graspHorizon,
} from "../src/engine/outcome.js";
import { faultsIn } from "../src/engine/faults.js";
import { planDrive, composeForTile, CHARACTER } from "../src/engine/tiles.js";
import { composeCandidate } from "../src/engine/candidate.js";
import { composeDriver } from "../src/engine/ratings.js";
import { sectionSheet } from "../src/engine/detect.js";
import { instructionWindow, runInFor } from "../src/engine/directions.js";
import { approachDecel } from "../src/engine/paths.js";
import { SCENARIOS } from "../src/engine/scenarios.js";

let problems = 0;
const ok = (s) => console.log(`  ok   ${s}`);
const fail = (s) => { problems++; console.log(`  FAIL: ${s}`); };
const APPROACH = M(11.5) / approachDecel(M(11.5));

console.log("\n" + "=".repeat(70));
console.log("OUTCOME: how a drive ends, and who it lands on");
console.log("=".repeat(70));

/* Collect real colliding intersections out of the generator, since contact is
   a reachable state now rather than a hypothetical one. */
const legs = [], colliding = [];
for (let seed = 1; seed <= 40; seed++) {
  const cand = { ...composeCandidate(seed * 7 + 3), ...composeDriver(seed * 11) };
  const plan = planDrive({ seed, length: 6, candidate: cand });
  let since = 0;
  for (let i = 0; i < plan.length; i++) {
    const tile = plan[i].tile;
    const legTime = tile.runway / CHARACTER[tile.character].speed + 4;
    const { scn } = composeForTile(tile, since, (seed * 7919 + i * 104729) >>> 0, {
      legTime, candidate: cand, at: { from: plan[i].entry, intent: plan[i].intent },
    });
    if (!scn) continue;
    const sim = simulate(scn);
    since = faultsIn(scn).length ? 0 : since + legTime;
    legs.push({ scn, sim });
    if (contactIn(sim)) colliding.push({ scn, sim });
  }
}

console.log("\n1. CONTACT IS A STATE THE GAME CAN NOW REPRESENT");
{
  colliding.length > 0
    ? ok(`${colliding.length} of ${legs.length} generated intersections end in contact -- reachable, not hypothetical`)
    : fail("no generated intersection collides, so nothing here is being exercised");

  /* Independently re-derived rather than trusting contactIn against
     itself: the same predicate the conflict engine uses, walked by hand. */
  let agree = 0;
  for (const { sim } of colliding) {
    const ego = sim.ego;
    let found = false;
    for (let t = ego.departAt ?? 0; t < (ego.departAt ?? 0) + spanOf(ego) + 2 && !found; t += STEP) {
      const mine = poseAt(ego, t);
      if (mine.gone) break;
      for (const a of sim.actors) {
        const th = poseAt(a, t);
        if (th.gone || th.hidden) continue;
        if (conflicts(ego, mine, a, th, 0, 0, 0, "crash")) { found = true; break; }
      }
    }
    if (found) agree++;
  }
  agree === colliding.length
    ? ok(`and every one is confirmed by walking the conflict predicate directly (${agree}/${colliding.length})`)
    : fail(`${colliding.length - agree} reported contact that an independent walk cannot find`);

  const o = outcomeOf(colliding[0]?.sim ?? legs[0].sim);
  const clean = legs.find((l) => !contactIn(l.sim));
  outcomeOf(clean.sim).kind === OUTCOME.COMPLETED
    ? ok("a drive that hits nobody completes rather than reporting an outcome it did not have")
    : fail("a clean drive reports a terminal outcome");
  o.kind === OUTCOME.COLLISION && o.ends && o.at != null
    ? ok(`a collision ends the drive and records when and who (${describeOutcome(o)})`)
    : fail("a collision does not produce a terminal outcome");
}

console.log("\n2. THE THREE INTERVENTION OUTCOMES, DERIVED RATHER THAN AUTHORED");
{
  /* CORRECT: the danger was real. Grabbing the wheel before a collision
     that was actually coming. */
  const danger = colliding[0];
  const before = Math.max(0, contactIn(danger.sim).at - 1.0);
  const correct = judgeIntervention(danger.sim, before);
  correct.verdict === INTERVENTION.CORRECT && correct.on === ON.CANDIDATE
    ? ok(`taking the wheel before a real collision is CORRECT, and it lands on the candidate (${before.toFixed(1)}s)`)
    : fail(`a justified intervention was judged ${correct.verdict}, landing on ${correct.on}`);

  /* HASTY: nothing was going to happen. */
  const quiet = legs.find((l) => !wasPreventable(l.sim));
  const hasty = judgeIntervention(quiet.sim, quiet.sim.legalAt ?? 0);
  hasty.verdict === INTERVENTION.HASTY
    ? ok("taking the wheel when nothing was coming is HASTY -- derived by asking the world, not written down")
    : fail(`an unjustified intervention was judged ${hasty.verdict}`);

  /* THE ASYMMETRY, and it is the property this whole file exists to
     protect: a candidate is NEVER penalised for the examiner's nerves. */
  const o = outcomeOf(quiet.sim, { intervenedAt: quiet.sim.legalAt ?? 0 });
  !o.candidateFailed && !o.ends && o.on === ON.EXAMINER
    ? ok("a HASTY intervention fails nobody, ends nothing, and costs the EXAMINER -- the asymmetry the ruling turns on")
    : fail(
        "a hasty intervention was charged to the candidate or ended the drive.\n" +
        "        The maintainer's ruling: an early intervention is dismissed from the\n" +
        "        scoresheet at the examiner's discretion, the candidate is NOT failed, and\n" +
        "        the drive continues. The cost falls ENTIRELY on the player. Anything that\n" +
        "        quietly moves it onto the candidate has broken the rule, not tuned it.\n" +
        "        See DECISIONS.md section 5.10."
      );

  const right = outcomeOf(danger.sim, { intervenedAt: before });
  right.candidateFailed && right.ends
    ? ok("and a CORRECT one is an automatic fail for the candidate, as it is in life")
    : fail("a correct intervention did not fail the candidate");

  /* MISSED: contact with nobody at the wheel. */
  const missed = outcomeOf(danger.sim);
  missed.verdict === INTERVENTION.MISSED && missed.on === ON.EXAMINER
    ? ok("contact that nobody prevented is a MISSED intervention, and it counts against the player")
    : fail(`unprevented contact was recorded as ${missed.verdict} on ${missed.on}`);

  /* And a quiet drive cannot be a failure to intervene. */
  !wasPreventable(quiet.sim) && outcomeOf(quiet.sim).kind === OUTCOME.COMPLETED
    ? ok("a drive that was never going to hurt anybody cannot be a failure to intervene")
    : fail("a quiet drive was charged with a missed intervention");
}

console.log("\n3. THE LOOP SURVIVES A COLLISION");
{
  /* The blank-screen bug was not the collision, but the collision is what
     revealed it -- so a section containing one has to grade without
     throwing, all the way through the sheet the player is shown. */
  let threw = null;
  for (const { scn, sim } of colliding.slice(0, 6)) {
    try {
      const faults = faultsIn(scn);
      const window = instructionWindow(sim, { legStartsAt: -runInFor(sim, { floor: APPROACH }) });
      const hit = contactIn(sim);
      const sheet = sectionSheet({
        legs: [{ faults, window, intent: scn.ego.intent }],
        marks: [{ at: hit.at, intersection: 0 }],
        given: { 0: { at: window.deadline - 0.3, intent: scn.ego.intent } },
        shownFor: (f) => f.duration,
        from: 0,
      });
      describeOutcome(outcomeOf(sim));
      if (typeof sheet.result.score !== "number") throw new Error("sheet produced no score");
    } catch (e) { threw = e.message; break; }
  }
  threw === null
    ? ok(`a section containing a collision grades to a sheet without throwing (${Math.min(6, colliding.length)} checked)`)
    : fail(`grading a colliding section threw: ${threw}`);

  /* And on the hand-authored set too, which never passes through the
     generator's accept test at all. */
  let bad = 0;
  for (const scn of SCENARIOS) {
    try { outcomeOf(simulate(scn)); } catch { bad++; }
  }
  bad === 0
    ? ok(`and every one of the ${SCENARIOS.length} shipped situations produces an outcome without throwing`)
    : fail(`${bad} shipped situation(s) threw while working out how they end`);
}

console.log("\n4. A WHOLE DRIVE, NOT ONE SCENE");
{
  /* A drive is intersections and the links between them, each its own
     simulation with its own clock, so "how did this drive end" is not a
     question any single scene can answer. It was not being asked at all:
     outcome.js has known contact ends a drive since it was written and
     ExaminerDrive never consulted it, so two cars drove through each
     other and the candidate carried on to the next intersection.

     These are the properties any correct implementation would have to
     have, and the asymmetry is again the one that matters most. */
  const scenes = legs.slice(0, 40).map((l, i) => ({ id: `s${i}`, sim: l.sim, offset: i * 100 }));
  const all = contactsAcross(scenes);
  all.every((c, i) => i === 0 || all[i - 1].at <= c.at)
    ? ok(`contacts across ${scenes.length} scenes come back in the drive's own clock, in order (${all.length} of them)`)
    : fail("contacts across a drive are not ordered by when they happen");
  all.every((c) => Math.abs(c.at - (c.local + scenes.find((s) => s.id === c.scene).offset)) < 1e-6)
    ? ok("and each one keeps both clocks -- its own and the drive's")
    : fail("a contact's drive time does not agree with its scene's own time plus that scene's offset");

  /* THE HORIZON IS DERIVED, and it is the same quantity the anticipation
     window is built from: reaction plus the time to stop at this road's
     speed. Without one every grab is CORRECT, because a drive that ends
     in contact ends in contact at SOME point after any given instant. */
  const v = M(8.3);
  const h = graspHorizon(v);
  Math.abs(h - (0.35 + v / approachDecel(v))) < 1e-9
    ? ok(`the grasp horizon is reaction plus stopping time, not a number somebody picked (${h.toFixed(2)}s at ${(v / 20).toFixed(1)} m/s)`)
    : fail("graspHorizon is not derived from the road's own stopping physics");
  graspHorizon(M(13.9)) < h
    ? ok("and it shortens on a faster road, because you cannot stop for something as far off")
    : fail("the grasp horizon does not follow the road's speed");

  const two = [{ at: 10, name: "Green car", who: "a" }, { at: 40, name: "Red car", who: "b" }];
  judgeGrab(two, 6, v).verdict === INTERVENTION.CORRECT
    ? ok("taking the wheel inside that horizon of a real collision is CORRECT")
    : fail("a justified grab was not judged correct");
  judgeGrab(two, 1, v).verdict === INTERVENTION.HASTY
    ? ok("and taking it for something you could still have waited out is HASTY")
    : fail("a grab outside the horizon was still judged correct -- the horizon is doing nothing");

  const good = driveOutcome(two, [{ at: 6 }], { speed: v, completedAt: 60 });
  good.kind === OUTCOME.INTERVENTION && good.ends && good.candidateFailed && good.on === ON.CANDIDATE
    ? ok("a correct grab ends the drive and fails the candidate, as it does in life")
    : fail("a correct grab did not end the drive as an automatic fail");

  const quiet = driveOutcome([], [{ at: 1 }], { speed: v, completedAt: 60 });
  !quiet.ends && !quiet.candidateFailed && quiet.kind === OUTCOME.COMPLETED && quiet.hasty.length === 1
    ? ok("a hasty grab ends nothing, fails nobody, and is still recorded against the player")
    : fail(
        "a hasty grab ended the drive or was charged to the candidate.\n" +
        "        The maintainer's ruling: an early intervention is dismissed at the\n" +
        "        examiner's discretion, the candidate is NOT failed, and the drive\n" +
        "        continues. The cost falls ENTIRELY on the player. See DECISIONS.md 5.10."
      );

  const late = driveOutcome(two, [{ at: 1 }], { speed: v, completedAt: 60 });
  late.kind === OUTCOME.COLLISION && late.on === ON.EXAMINER && late.hasty.length === 1
    ? ok("spending a grab early and then missing the real one costs both -- the supply cap doing its work")
    : fail("a wasted grab followed by a real collision did not report both");

  driveOutcome([], [], { speed: v, completedAt: 60 }).kind === OUTCOME.COMPLETED
    ? ok("and a drive that hurt nobody completes")
    : fail("a quiet drive reported an outcome it did not have");

  [good, quiet, late].every((o) => describeDrive(o).length > 0)
    ? ok("every outcome can say what it was without the screen deciding anything")
    : fail("an outcome has no description, so a drive would stop dead with no explanation");
}

console.log("\n" + "=".repeat(70));
if (problems) { console.log(`FAILED: ${problems} problem(s).`); process.exit(1); }
console.log("OK: a drive can end, and it says who it lands on.");
