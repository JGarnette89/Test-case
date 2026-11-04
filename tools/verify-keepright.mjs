/* =====================================================================
   KEEP RIGHT: THE KNOWLEDGE AXIS ON THE LINK.

   Split from verify-lanes.mjs on 14 October (CLAUDE.md, item 8): as one
   file it ran past twenty minutes under the full suite's load, and its
   sections are independent, so the runner runs them side by side.
   Section 7 of the old file, unchanged.
   ===================================================================== */
import { cpus } from "node:os";
import { RETURN_AFTER } from "../src/sim/lanechange.js";
import { runAll } from "./lib/keepright-runs.mjs";

let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? " ok " : "FAIL"} ${msg}`); if (!ok) failed++; };

/* 7. KEEP RIGHT: THE KNOWLEDGE AXIS ON THE LINK. The maintainer's ruling:
   "a measure of law adherence, since in Ontario drivers should be moving
   into the driving (curb) lane unless there's something in the way or
   they are making an upcoming left turn" (SIMULATOR.md 1.1.17).

   The properties, not the formula:
     - THE EXCEPTIONS ARE THE RULE. Every time the model says a driver is
       out of the curb lane with no reason, a restatement written here
       from the ruling -- not imported -- must agree that no exception
       held: no turn the lane to the right cannot make, nobody beside or
       just behind (a pass not finished), no slower car ahead there, a gap
       a competent driver would take. Judged on the driver's own decision
       tick, against the world they decided from. And it must be
       EXERCISED: the rule has to have found hundreds of such moments.
     - KNOWLEDGE DECIDES IT, and it is a comparison: weak-on-knowledge
       drivers are marked on far more of their occasions than sound ones.
     - THE RETURN IS NOT A SNAP: no driver moves back sooner after the
       reason passed than RETURN_AFTER.
     - THE LEFT LANE CLEARS: cruising out of the curb lane with no reason
       falls against the same seeds with the rule off. The margin (25
       September, the big arterial) recalibrated from 0.75 to 0.85 --
       see the threshold's own comment for why, and
       `tools/measure/keepright.mjs --byNode` for the number reproduced.
     - IT IS MARKABLE, AND THE MARK IS KNOWLEDGE'S: every driver watched,
       the sheet carries keepRight faults; strip knowledge from every
       driver and they (nearly) vanish.

   Sample: three seeds, 150 s each, 200 cars -- about 70 occasions for
   the weak quarter and 150 for the sound half. The mark rates are
   comparisons across that many occasions, not one drive's
   (CLAUDE.md, cold start 3). */
{
  /* THE RUNS ARE IN tools/lib/keepright-runs.mjs (4 November): nine independent runs were the whole of this check's time, and they go side by side. Measured near alone on 16 threads: 327 s as one process, 123 s at 3 workers, 69 s at 9, the output identical line for line each way (an external report's 811 s to about 300 s started from a loaded run). At most 6, a quarter of the machine, as verify-compliance: the runner already runs up to three-quarters of it at once. `KR_WORKERS` overrides. */
  const WORKERS = Number(process.env.KR_WORKERS) || Math.max(2, Math.min(6, Math.floor(cpus().length / 4)));
  const { on, off, stripped: bare } = await runAll(["on", "off", "stripped"], WORKERS);
  /* A run lost must fail, not shrink the sample: the floors below would pass on two seeds of three. */
  check(on.runs === 3 && off.runs === 3 && bare.runs === 3, `every run came back: ${on.runs + off.runs + bare.runs} of 9`);
  const disagreements = Object.values(on.disagree).reduce((s, x) => s + x, 0);
  check(on.flagged >= 500 && disagreements === 0,
    `the exceptions are the rule: of ${on.flagged} decisions the model judged out of the curb lane with no reason, a restatement from the ruling found an exception holding in ${disagreements} ${JSON.stringify(on.disagree)}`);
  const rate = (b) => (b.n ? b.marked / b.n : NaN);
  check(on.occ.weak.n >= 40 && on.occ.sound.n >= 80 && rate(on.occ.weak) > 4 * rate(on.occ.sound) && rate(on.occ.sound) < 0.05,
    `knowledge and compliance decide it: drivers who do not know the rule or do not bother (lax over 0.5) were marked on ${(100 * rate(on.occ.weak)).toFixed(0)}% of ${on.occ.weak.n} occasions out of the curb lane with no reason, sound ones (under 0.2) on ${(100 * rate(on.occ.sound)).toFixed(0)}% of ${on.occ.sound.n}`);
  /* WHAT THIS TIMES (4 November): only returns on the approach carry a delay (lanechange.js). A return on the exit stretch has its own clock, the lane change's RETURN_AFTER, and no delay to read, so it is counted and not timed. Those sorted to the end as undefined, the line printed "median undefined" over a count that included them, and the assertion, reading only the smallest, never saw them. */
  const sorted = on.delays.filter((d) => d != null).sort((a, b) => a - b), untimed = on.delays.length - sorted.length;
  check(sorted.length >= 50 && sorted[0] >= RETURN_AFTER - 1e-9,
    `the return is not a snap: ${sorted.length} returns timed on the approach (${untimed} more on the exit stretch, not timed), the soonest ${sorted[0]?.toFixed(1)} s after the reason passed (median ${sorted[sorted.length >> 1]?.toFixed(1)} s), against RETURN_AFTER ${RETURN_AFTER.toFixed(1)} s`);
  const share = (r) => r.noReason / r.cruising;
  /* THE BOUND, RECALIBRATED 25 SEPTEMBER, THE BIG ARTERIAL, AND THE
     REASONING RATHER THAN JUST THE NUMBER. This was 0.75 against a map
     whose busiest node was a two-lane five-way. Node E -- three lanes,
     turn bays, about a third of the map's cruising volume -- weakens
     the AGGREGATE margin from 0.68 (measured with E excluded) to 0.79,
     not because the rule is broken at E but because it is a genuinely
     harder place for it to show: three lanes wide, a momentary open
     gap in the lane to the right is common even while the node overall
     is busy, and every "reason" tick resets the return clock. E's OWN
     ratio is still 0.875 -- a real 12.5% reduction, just a weaker one.
     Before loosening this, `reasonToStayOut` and this section's own
     `exceptionHolds` were compared directly on identical state at E:
     0 disagreements in 1770 samples, so the mechanism is not at fault
     -- see `tools/measure/keepright.mjs --byNode` for the per-node
     numbers this was derived from. 0.85 clears the measured 0.79 with
     margin while still refusing a vacuous or reversed result. */
  check(share(on) < 0.85 * share(off),
    `the left lane clears: cruising out of the curb lane with no reason ${(100 * share(on)).toFixed(1)}% of the time with the rule, ${(100 * share(off)).toFixed(1)}% without it, same seeds`);
  const markedOn = on.marks.sound + on.marks.weak + on.marks.other, markedBare = bare.marks.sound + bare.marks.weak + bare.marks.other;
  check(markedOn >= 20 && on.marks.weak > 4 * on.marks.sound && markedBare <= 0.15 * markedOn,
    `markable, and knowledge's or compliance's: every driver watched, the sheet carried ${markedOn} keepRight faults (${on.marks.weak} on lax drivers, ${on.marks.sound} on sound); with every driver knowing the rule and keeping it, ${markedBare}`);
}

if (failed) { console.log(`\n${failed} FAILED`); process.exit(1); }
console.log("\nOK: knowledge and compliance keep drivers right, the exceptions are the ruling's, and failing is markable.");
