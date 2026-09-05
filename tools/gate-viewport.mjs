/* THE STAGE 2 GATE: is the viewport actually scarce?
 *
 * Deliberately NOT one of the verify-* checks and not part of the suite.
 * It is a measurement, and as of 2 Sep 2026 it REPORTS A FAILURE: on the
 * current single-junction content the camera cannot be the constraint,
 * because everything worth watching is closer together than any usable
 * frame is wide. See EXAMINER-REDESIGN.md, section 6.
 *
 * Re-run it when the continuous drivable world exists. The design needs
 * this to pass before stages 3 to 5 are worth building.
 */
import { simulate, poseAt, W, CX, CY, M } from "../src/engine/index.js";
const MW = M, W_ = W;
import { specOf } from "../src/engine/road.js";
import { SCENARIOS } from "../src/engine/scenarios.js";
import { faultsIn } from "../src/engine/faults.js";
import { chaseFor, frameAround } from "../src/frame.js";
import { driveThrough, candidateAt } from "../src/engine/world.js";
import { runwayNeeded } from "../src/engine/directions.js";

const m = (px) => Math.round((px / 20) * 10) / 10;

/* Is a world point inside the (rotated) chase frame? */
function inFrame(view, p) {
  const half = (view.scale * W) / 2;
  const r = (-view.rotate * Math.PI) / 180;
  const dx = p.x - view.cx, dy = p.y - view.cy;
  const x = dx * Math.cos(r) - dy * Math.sin(r);
  const y = dx * Math.sin(r) + dy * Math.cos(r);
  return Math.abs(x) <= half && Math.abs(y) <= half;
}

function build(id, trait) {
  const raw = SCENARIOS.find((s) => s.id === id);
  const withT = trait ? { ...raw, ego: { ...raw.ego, traits: [...(raw.ego.traits || []), trait] } } : raw;
  const timed = { ...withT, ego: { ...withT.ego, departAt: simulate(raw).legalAt } };
  return { scn: timed, sim: simulate(timed), spec: specOf(timed), faults: faultsIn(timed) };
}

for (const lookAhead of [10, 6, 4, 3]) {
  let situations = 0, everOff = 0, faultSamples = 0, offSamples = 0;
  const offenders = [];
  for (const id of SCENARIOS.filter((s) => s.layout !== "roundabout").map((s) => s.id)) {
    for (const trait of [null, "wander", "wideTurn", "slowStart"]) {
      const { scn, sim, spec, faults } = build(id, trait);
      if (!faults.length) continue;
      situations++;
      let anyOff = false;
      for (const f of faults) {
        for (const s of f.samples) {
          const view = chaseFor(spec, sim, s.t, scn.camera, { lookAhead });
          faultSamples++;
          if (!inFrame(view, s)) { offSamples++; anyOff = true; }
        }
      }
      if (anyOff) { everOff++; offenders.push(`${id}${trait ? "/" + trait : ""}`); }
    }
  }
  const pct = faultSamples ? (offSamples / faultSamples) * 100 : 0;
  console.log(
    `look-ahead ${String(lookAhead).padStart(2)}s   ` +
    `${String(everOff).padStart(3)}/${String(situations).padEnd(3)} situations have a fault leave frame   ` +
    `${pct.toFixed(1)}% of fault-time off screen`
  );
  if (offenders.length && lookAhead === 4) console.log(`             e.g. ${offenders.slice(0, 6).join(", ")}`);
}

/* How far apart do faults get? If two faults are never far apart, no
   framing can separate them however tight it is. */
console.log("\nWidest separation between two simultaneous faults, per situation:");
let bestSep = 0, bestWho = "-";
for (const id of SCENARIOS.filter((s) => s.layout !== "roundabout").map((s) => s.id)) {
  const { sim, faults } = build(id, "wander");
  if (faults.length < 2) continue;
  let worst = 0;
  for (let t = 0; t <= 14; t += 0.1) {
    const live = faults.filter((f) => t >= f.from && t <= f.to);
    for (let i = 0; i < live.length; i++) {
      for (let j = i + 1; j < live.length; j++) {
        const a = live[i].samples.find((s) => Math.abs(s.t - t) < 0.06);
        const b = live[j].samples.find((s) => Math.abs(s.t - t) < 0.06);
        if (a && b) worst = Math.max(worst, Math.hypot(a.x - b.x, a.y - b.y));
      }
    }
  }
  if (worst) console.log(`  ${id.padEnd(12)} ${m(worst)}m apart at their widest`);
  if (worst > bestSep) { bestSep = worst; bestWho = id; }
}
console.log(`\nWidest anywhere: ${m(bestSep)}m (${bestWho}).`);
console.log(`A 4s look-ahead frames about ${m(chaseFor(specOf(SCENARIOS[0]), simulate(SCENARIOS[0]), 2, undefined, { lookAhead: 4 }).scale * W)}m across.`);

/* If faults cannot be separated, can the two JOBS be? The design's real
   scarcity is "read the junction ahead" vs "watch the car" — different
   places on the map. How far apart are they today? */
console.log("\nDistance from the candidate to the junction it must be directed through:");
for (const id of ["gap", "tee", "arterial", "opposite"]) {
  const { sim } = build(id, null);
  let atStart = null, atDepart = null;
  const p0 = poseAt(sim.ego, 0);
  if (p0 && !p0.hidden) atStart = Math.hypot(p0.x - CX, p0.y - CY);
  const pd = poseAt(sim.ego, sim.legalAt);
  if (pd && !pd.hidden) atDepart = Math.hypot(pd.x - CX, pd.y - CY);
  console.log(`  ${id.padEnd(10)} at t=0: ${m(atStart)}m from the junction, at departure: ${m(atDepart)}m`);
}
console.log("\nFor comparison: a turn needs 5.5s of approach to be directable,");
console.log("which at 41 km/h is about 63m of separation between the two jobs.");

/* =====================================================================
   W1: THE CONTINUOUS WORLD, MEASURED

   Two junctions, 80m apart, a fault at each. The question the whole
   redesign waits on: at the moment the instruction for the SECOND
   junction must be given, can one frame hold both jobs at once?

   Job A — catch faults: watch the candidate and what is around it.
   Job B — give the direction: read the junction being approached.

   The gate PASSES if it cannot. See WORLD-DESIGN.md section 1.
   ===================================================================== */
console.log("\n\n" + "=".repeat(70));
console.log("W1: TWO JUNCTIONS, 80m APART, A FAULT AT EACH");
console.log("=".repeat(70));
{
  const V = MW(11.5);                          // 41 km/h, V_STRAIGHT
  const need = runwayNeeded("left");           // 5.5s, derived
  const gap = need * V;                        // the separation the design targets

  console.log(`\n  A turn needs ${need}s of approach (hear + signal + slow).`);
  console.log(`  At 41 km/h that is ${(gap / 20).toFixed(1)}m before the junction.\n`);

  const faulty = (id, trait) => {
    const raw = SCENARIOS.find((s) => s.id === id);
    return { ...raw, ego: { ...raw.ego, traits: [trait], departAt: simulate(raw).legalAt } };
  };

  for (const spacingM of [65, 75, 80, 85, 90, 100, 120, 140, 160]) {
    const spacing = MW(spacingM);
    /* Leg A is driven straight through, so the candidate travels toward
       junction B; leg B is the turn that has to be directed, which is
       what needs the 5.5s of approach in the first place. */
    const legs = [faulty("opposite", "wander"), faulty("gap", "wideTurn")];
    const drive = driveThrough({ legs, spacing });
    const B = drive.junctions[1];

    /* Walk the drive to the moment the candidate is exactly one approach
       short of junction B — the instruction deadline. */
    let best = null;
    for (let t = 0; t <= 40; t += 0.02) {
      const p = candidateAt(drive, t);
      if (!p || !Number.isFinite(p.x)) continue;
      /* The deadline only exists AFTER the first junction is behind us --
         otherwise the search happily reports a point on the approach to
         junction A and calls it runway for junction B, which is how a
         spacing too tight to be directable would look like a pass. */
      if (p.junction < 1 && p.phase !== "link") continue;
      const d = Math.hypot(B.at.x - p.x, B.at.y - p.y);
      if (best == null || Math.abs(d - gap) < Math.abs(best.d - gap)) best = { t, p, d };
    }
    if (!best) { console.log(`  spacing ${String(spacingM).padStart(3)}m   no runway exists at all -- not directable`); continue; }
    const shortfall = gap - best.d;
    if (shortfall > M(3)) {
      console.log(
        `  spacing ${String(spacingM).padStart(3)}m   best runway only ${(best.d / 20).toFixed(0)}m of the ` +
        `${(gap / 20).toFixed(0)}m needed -- NOT DIRECTABLE`
      );
      continue;
    }

    const view = frameAround(best.p, V, { lookAhead: 4 });
    const half = (view.scale * W_) / 2;
    const inFrame = (q) => {
      const r = (-view.rotate * Math.PI) / 180;
      const dx = q.x - view.cx, dy = q.y - view.cy;
      const x = dx * Math.cos(r) - dy * Math.sin(r);
      const y = dx * Math.sin(r) + dy * Math.cos(r);
      return Math.abs(x) <= half && Math.abs(y) <= half;
    };

    /* Job A: the candidate itself, and the nearest fault to it. */
    const jobA = inFrame({ x: best.p.x, y: best.p.y });
    /* Job B: the junction that must be read and directed. */
    const jobB = inFrame(B.at);

    const verdict = jobA && !jobB ? "PASSES  — the jobs are in different places"
      : jobA && jobB ? "fails   — one frame holds both"
      : "fails   — the candidate is not even in frame";

    console.log(
      `  spacing ${String(spacingM).padStart(3)}m   ` +
      `runway ${(best.d / 20).toFixed(0).padStart(3)}m (${best.p.phase.padEnd(8)})  ` +
      `frame ${(view.scale * W_ / 20).toFixed(0)}m   ` +
      `car ${jobA ? "in" : "OUT"}  junction ${jobB ? "in" : "OUT"}   ${verdict}`
    );
  }

  console.log("\n  The design band is 65 to 140m. Below it a junction cannot be");
  console.log("  directed at all; above it the drive is empty road.");
}
