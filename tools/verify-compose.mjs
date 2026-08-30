/* =====================================================================
   COMPOSITION VERIFICATION
   Run:  node tools/verify-compose.mjs

   The claim being checked is not "a scene was produced" — it is that the
   scene MATCHES THE BRIEF, measured rather than asserted. Placing a van
   and declaring the result low-visibility would be authoring the answer;
   the engine has to confirm the driver genuinely cannot see.

   Also checked: that asking twice gives the same scene, that asking for
   different things gives different scenes, and that a long run does not
   quietly start repeating itself.
   ===================================================================== */
import { composeScenario, measure, meetsBrief, signatureOf, TRAFFIC, VISIBILITY } from "../src/engine/compose.js";
import { simulate, poseAt, spanOf, conflicts, STEP } from "../src/engine/index.js";
import { specOf, validateRoad } from "../src/engine/road.js";
import { GRACE } from "../src/engine/score.js";
import { PULL_STEP } from "../src/engine/sight.js";

let problems = 0;
const fail = (m) => { problems++; console.log("  FAIL: " + m); };
const ok = (m) => console.log("  ok   " + m);
const avg = (xs) => Math.round((xs.reduce((a, x) => a + x, 0) / xs.length) * 100) / 100;

const BRIEFS = [
  { traffic: "light", visibility: "open" },
  { traffic: "busy", visibility: "open" },
  { traffic: "heavy", visibility: "open" },
  { traffic: "busy", visibility: "restricted" },
  { traffic: "heavy", visibility: "restricted" },
];
const N = 40;

console.log("");
console.log("1. WHAT WAS ASKED FOR IS WHAT WAS BUILT");
const byBrief = new Map();
for (const b of BRIEFS) {
  const made = [];
  for (let s = 1; s <= N; s++) {
    const scn = composeScenario(b, s);
    if (scn) made.push(scn);
  }
  byBrief.set(JSON.stringify(b), made);
  const label = (b.traffic + "/" + b.visibility).padEnd(18);

  if (made.length < N * 0.8) { fail(label + "only produced " + made.length + " of " + N); continue; }

  let mismatched = 0;
  for (const scn of made) {
    const v = meetsBrief(b, measure(scn));
    if (!v.ok) { mismatched++; if (mismatched === 1) fail(label + "does not match: " + v.why.join("; ")); }
  }
  if (mismatched === 0) {
    ok(label + made.length + "/" + N + " built, every one matches when re-measured");
  }
}

console.log("");
console.log("2. THE VOCABULARY MEANS SOMETHING");
{
  const priorsOf = (b) => avg(byBrief.get(JSON.stringify(b)).map((s) => s.measured.priors));
  const light = priorsOf(BRIEFS[0]), busy = priorsOf(BRIEFS[1]), heavy = priorsOf(BRIEFS[2]);
  console.log("  road users with priority:  light " + light + "   busy " + busy + "   heavy " + heavy);
  light < busy && busy < heavy
    ? ok("heavier briefs really do put more traffic in your way")
    : fail("traffic levels do not separate: " + light + " / " + busy + " / " + heavy);

  const blindOpen = avg(byBrief.get(JSON.stringify(BRIEFS[1])).map((s) => s.measured.blindness));
  const blindShut = avg(byBrief.get(JSON.stringify(BRIEFS[3])).map((s) => s.measured.blindness));
  console.log("  share of traffic not clearly visible:  open " + blindOpen + "   restricted " + blindShut);
  blindShut > blindOpen + 0.15
    ? ok("a restricted brief genuinely restricts the view, measured from the driver's eye")
    : fail("restricted visibility is not measurably different from open");
}

console.log("");
console.log("3. VARIETY");
for (const b of BRIEFS) {
  const made = byBrief.get(JSON.stringify(b));
  const sigs = new Set(made.map(signatureOf));
  const label = (b.traffic + "/" + b.visibility).padEnd(18);
  const ratio = sigs.size / made.length;
  ratio >= 0.7
    ? ok(label + sigs.size + " distinct shapes from " + made.length + " draws")
    : fail(label + "only " + sigs.size + " distinct shapes from " + made.length + " — repeating itself");
}
{
  const junctions = new Set();
  for (const made of byBrief.values()) for (const s of made) junctions.add(s.conditions.junction);
  junctions.size >= 3
    ? ok("all junction kinds appear: " + [...junctions].join(", "))
    : fail("only produced: " + [...junctions].join(", "));
}

console.log("");
console.log("4. DETERMINISM");
{
  const a = JSON.stringify(composeScenario(BRIEFS[2], 12345));
  const b = JSON.stringify(composeScenario(BRIEFS[2], 12345));
  a === b ? ok("same brief and seed give the identical scene") : fail("composition is not deterministic");
  const c = JSON.stringify(composeScenario(BRIEFS[2], 12346));
  a !== c ? ok("the next seed gives a different one") : fail("consecutive seeds are identical");
}

console.log("");
console.log("5. EVERY COMPOSED SCENE IS ACTUALLY PLAYABLE");
{
  let bad = 0, unsafe = 0, illegal = 0, unsafeInGrace = 0, unsafeCreeping = 0;
  const collidesDepartingAt = (sim, T, creepSteps = 0) => {
    const ego = { ...sim.ego, departAt: T, stopBias: (sim.ego.stopBias || 0) + creepSteps * PULL_STEP };
    for (let t = T; t < T + spanOf(ego); t += STEP) {
      const mine = poseAt(ego, t);
      if (mine.gone) break;
      for (const a of sim.actors) {
        const theirs = poseAt(a, t);
        if (theirs.gone || theirs.hidden) continue;
        if (conflicts(ego, mine, a, theirs, 0, 0, 0, "crash")) return true;
      }
    }
    return false;
  };
  for (const made of byBrief.values()) {
    for (const scn of made) {
      const found = validateRoad(specOf(scn), [{ ...scn.ego, id: "ego" }, ...scn.actors]);
      if (found.length) { illegal++; if (illegal === 1) fail("uses a leg that is not there: " + found[0]); }

      const sim = simulate(scn);
      if (!(sim.legalAt >= scn.ego.arriveAt)) { bad++; continue; }

      // Departing on the derived window must not collide...
      if (collidesDepartingAt(sim, sim.legalAt)) unsafe++;

      /* ...and neither must departing anywhere later the scorer still
         calls "good" — a road user who does not outrank the ego can be
         mid-arrival when the window opens, scheduled on the assumption
         the ego leaves promptly. Taking the grace the scorer offers can
         walk straight into that; windowIsSafe in compose.js now rejects
         it, and this is the batch-scale check that it actually does. */
      for (let d = sim.legalAt; d <= sim.legalAt + GRACE; d += STEP * 2) {
        if (collidesDepartingAt(sim, d)) { unsafeInGrace++; break; }
      }

      /* ...nor at any depth of PULL UP — encroaches() only watches
         priors, so creeping toward a road user who does not outrank the
         ego draws no fault at all before the hit. */
      outer:
      for (let steps = 0; steps <= 8; steps++) {
        for (let d = sim.legalAt; d <= sim.legalAt + GRACE; d += STEP * 2) {
          if (collidesDepartingAt(sim, d, steps)) { unsafeCreeping++; break outer; }
        }
      }
    }
  }
  bad === 0 ? ok("every window opens at or after the ego arrives") : fail(bad + " impossible windows");
  illegal === 0 ? ok("every road user uses a leg its junction actually has") : null;
  unsafe === 0
    ? ok("departing on the derived window never collides, across every composed scene")
    : fail(unsafe + " scene(s) collide when departing exactly on the window");
  unsafeCreeping === 0
    ? ok("every composed window stays safe through 8 presses of PULL UP too")
    : fail(`${unsafeCreeping} scene(s) collide after creeping, with no fault ever flagged first`);
  unsafeInGrace === 0
    ? ok(`every composed window stays safe for the full ${GRACE}s the scorer still calls good`)
    : fail(`${unsafeInGrace} scene(s) collide somewhere the scorer still calls good, after legalAt`);
}

console.log("");
console.log("=".repeat(66));
console.log(problems === 0 ? "OK: composition verified." : problems + " PROBLEM(S) FOUND.");
process.exit(problems === 0 ? 0 : 1);
