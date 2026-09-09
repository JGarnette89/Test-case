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
import { worstEncroachment } from "../src/engine/clearance.js";

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
  const intersections = new Set();
  for (const made of byBrief.values()) for (const s of made) intersections.add(s.conditions.intersection);
  intersections.size >= 3
    ? ok("all intersection kinds appear: " + [...intersections].join(", "))
    : fail("only produced: " + [...intersections].join(", "));
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
/* WHAT THIS SECTION USED TO CHECK, AND WHY IT NO LONGER DOES.

   Four assertions here enforced `windowIsSafe`: departing on the derived
   window never collides, nor at any depth of creep, nor anywhere across
   the grace the scorer still calls good. They were the driver game's
   safety net -- the player presses GO, so the window handed to them had
   to be one they could survive taking -- and they were among the most
   valuable checks this project ever had (1142 unsafe drafts in 4000).

   The maintainer has ruled the examiner game the only priority. In it the
   CANDIDATE drives, and a candidate taking a gap that was not theirs is
   the content rather than a defect: the gate was suppressing HALF the
   supply, 0.47 encroachments per drive against 0.88 ungated. So
   `windowIsSafe` is gone, and these four are RETIRED DELIBERATELY rather
   than left to fail confusingly against a generator that no longer
   promises what they assert.

   `safeAtFor` in index.js states the same idea and is still live and
   still checked -- verify-clearance, verify-events, verify-playthrough,
   verify-stages and verify-wontstop all use it, because a hand-authored
   situation still has to be measured against something.

   What survives here is what was never about the driver game: a scene has
   to be built out of legs its intersection actually has, it must not end in
   contact, and enough of it has to be tight enough to mark. */
{
  let bad = 0;
  const all = [...byBrief.values()].flat();

  let illegal = 0, firstBad = null;
  for (const scn of all) {
    const found = validateRoad(specOf(scn), [{ ...scn.ego, id: "ego" }, ...scn.actors]);
    if (found.length) { illegal++; firstBad = firstBad ?? found[0]; }
    const sim = simulate(scn);
    if (!(sim.legalAt >= scn.ego.arriveAt)) bad++;
  }
  bad === 0 ? ok("every window opens at or after the ego arrives") : fail(bad + " impossible windows");
  illegal === 0
    ? ok(`every road user uses a leg its intersection actually has (${all.length} scenes)`)
    : fail(`${illegal} scene(s) use a leg that is not there: ${firstBad}`);

  /* WHAT THE ACCEPT TEST PROMISES NOW. Not a safe window -- a gradeable
     one. No contact, because intervention is not built and a collision is
     a state the game cannot answer; and enough tight ones that the
     encroachment fault has something to describe. */
  let contact = 0, tight = 0;
  const band = {};
  for (const scn of all) {
    const w = worstEncroachment(simulate(scn), scn);
    if (!w) continue;
    band[w.band] = (band[w.band] ?? 0) + 1;
    if (w.band === "contact") contact++;
    if (w.band === "tight" || w.band === "veryTight") tight++;
  }
  console.log(`  clearance    ${Object.entries(band).map(([k, v]) => `${k} ${v}`).join(" - ")}`);
  contact === 0
    ? ok("no composed scene ends in contact, the one thing the accept test still refuses")
    : fail(`${contact} scene(s) end with the candidate hitting somebody, which this game has no answer to yet`);
  tight > 0
    ? ok(`and ${tight} of ${all.length} are tight enough to mark, the supply the old gate threw away`)
    : fail("no composed scene is tight enough to carry an encroachment, so the examiner has nothing to catch");
}

/* ---------- 6. pedestrians turn up in Endless too --------------------
   Ported from generate.js, which used to be the only place this rule
   ever appeared. Mirrors that file's own checks: a workable rate, more
   than one leg, and a real (not universal, not absent) effect on the
   window — over every scene composed above, not a fresh batch, so this
   is checking the exact same draws already proven playable. */
console.log("");
console.log("6. PEDESTRIANS TURN UP IN ENDLESS TOO");
{
  const all = [...byBrief.values()].flat();
  const withPed = all.filter((s) => s.actors.some((a) => a.kind === "ped"));
  const share = withPed.length / all.length;
  console.log(`  pedestrians  ${withPed.length} of ${all.length} (${Math.round(share * 100)}%)`);
  share < 0.05
    ? fail("pedestrians almost never composed — the crossing rule stays untaught in Endless")
    : ok("pedestrians appear at a workable rate");

  const legsSeen = new Set(withPed.flatMap((s) => s.actors.filter((a) => a.kind === "ped").map((a) => a.from)));
  legsSeen.size >= 2
    ? ok(`crossings composed on ${legsSeen.size} different legs (${[...legsSeen].join(", ")})`)
    : fail(`crossings only ever appear on ${[...legsSeen].join(", ") || "no"} leg`);

  const blocking = withPed.filter((s) => {
    const withThem = simulate(s).legalAt;
    const without = simulate({ ...s, actors: s.actors.filter((a) => a.kind !== "ped") }).legalAt;
    return withThem - without > 1e-9;
  });
  const rate = withPed.length ? blocking.length / withPed.length : 0;
  console.log(`  of those, ${blocking.length} move the window (${Math.round(rate * 100)}%)`);
  rate > 0.05 && rate < 0.98
    ? ok("pedestrians sometimes hold you up and sometimes do not in Endless too")
    : fail("pedestrians in Endless are either always or never in the way — not something to read");
}

console.log("");
console.log("=".repeat(66));
console.log(problems === 0 ? "OK: composition verified." : problems + " PROBLEM(S) FOUND.");
process.exit(problems === 0 ? 0 : 1);
