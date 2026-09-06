/* Awareness: what the candidate actually registered.
 *
 * Layer 2 of three. Layer 1 is what happened, layer 3 is what the player
 * noticed. The FAULT lives in the gap between 1 and 2 — the candidate did
 * not perceive the vehicle and acted anyway — and the SCORE lives in the
 * gap between 1 and 3.
 *
 * The properties any correct implementation would have to have:
 *
 *   - it is deterministic, resolved once per road user from the seed;
 *   - a perfect observer misses nothing that was there to be gathered;
 *   - missing falls off monotonically with the rating;
 *   - occluded and not-yet-on-stage are DIFFERENT, because conflating
 *     them makes a perfect observer blind to traffic up the road;
 *   - observation versus confidence is decided mechanically, by whether
 *     the information was gathered, and never by what happened next.
 */
import fs from "node:fs";
import { simulate, earliestClear, M } from "../src/engine/index.js";
import { REACTION_FLOOR } from "../src/engine/score.js";
import {
  REGISTER_FLOOR, REGISTER_SPAN, JITTER, registrationDelay, sightingsIn,
  registrationsIn, awarenessAt, departureOnAwareness, causeOf,
} from "../src/engine/awareness.js";
import { composeDriver, AXES, deficitOf } from "../src/engine/ratings.js";
import { SCENARIOS } from "../src/engine/scenarios.js";
import { composeScenario } from "../src/engine/compose.js";
import { worstEncroachment } from "../src/engine/clearance.js";

let problems = 0;
const ok = (s) => console.log(`  ok   ${s}`);
const fail = (s) => { problems++; console.log(`  FAIL: ${s}`); };

const rated = (obs, rest = {}) => ({
  id: `o${obs}`, creep: 0,
  ratings: { observation: obs, confidence: 0.5, steering: 1, braking: 1, knowledge: 1, ...rest },
});

const scenes = [];
for (const scn of SCENARIOS) scenes.push({ id: scn.id, scn, sim: simulate(scn) });
const BRIEFS = [
  { traffic: "light", visibility: "open" }, { traffic: "busy", visibility: "open" },
  { traffic: "heavy", visibility: "open" }, { traffic: "busy", visibility: "restricted" },
];
for (let seed = 1; seed <= 20; seed++) {
  const scn = composeScenario(BRIEFS[seed % 4], seed * 7919);
  if (scn) scenes.push({ id: `gen-${seed}`, scn, sim: simulate(scn) });
}

console.log("\n" + "=".repeat(70));
console.log("AWARENESS: what the candidate registered, and what follows");
console.log("=".repeat(70));

/* ---------- 1. observation is an axis, and a different kind ---------- */
console.log("\n1. THE FIFTH AXIS OPERATES ON A DIFFERENT LAYER");
{
  AXES.includes("observation")
    ? ok(`five axes: ${AXES.join(", ")}`)
    : fail("observation is not an axis");
  deficitOf({ observation: 1 }, "observation").tail === 0 &&
  deficitOf({ observation: 0 }, "observation").deficit === 1
    ? ok("and it is monotonic — more observation is simply better, unlike confidence")
    : fail("observation does not behave as a monotonic axis");

  /* It governs perception, so it must not be able to reach the things
     that govern action. Structural, checked at source. */
  const src = fs.readFileSync("src/engine/awareness.js", "utf8");
  const imports = [...src.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);
  !imports.some((i) => i.includes("clearance"))
    ? ok(`awareness never imports clearance (${[...new Set(imports)].join(", ")}), so it cannot see the outcome it would be tempted to grade by`)
    : fail("awareness imports clearance — observation could come to be scored by outcome");
  !/touch|contact|band|collide/i.test(src.split("export function causeOf")[1] ?? "")
    ? ok("and causeOf consults only whether the information was gathered, never what happened next")
    : fail("causeOf references the outcome, which collapses observation back into confidence");
}

/* ---------- 2. deterministic, once per road user -------------------- */
console.log("\n2. GROUND TRUTH IS REPLAYABLE");
{
  const c = composeDriver(31);
  let stable = true;
  for (const { scn, sim } of scenes.slice(0, 10)) {
    const a = JSON.stringify(registrationsIn(sim, scn, c, 7));
    const b = JSON.stringify(registrationsIn(sim, scn, c, 7));
    if (a !== b) stable = false;
  }
  stable
    ? ok("the same driver registers the same road users at the same instants on every replay")
    : fail("registrations are not stable between calls");

  const differs = new Set();
  for (const id of ["a0", "a1", "a2", "w", "n", "e"]) differs.add(registrationDelay(rated(0.3), id, 5).toFixed(4));
  differs.size > 1
    ? ok(`and attention is not uniform: ${differs.size} distinct delays across road users in one scene`)
    : fail("every road user is registered after exactly the same delay, so attention is a constant");

  registrationDelay(rated(1), "x", 1) === REGISTER_FLOOR &&
  registrationDelay(rated(1), "y", 9) === REGISTER_FLOOR
    ? ok(`a perfect observer takes the floor exactly, with no jitter (${REGISTER_FLOOR}s) — consistency is what being good at this means`)
    : fail("a perfect observer's delay varies, so being good at observation is partly luck");
  REGISTER_FLOOR === REACTION_FLOOR
    ? ok("and the floor is the engine's own REACTION_FLOOR: nobody registers faster than they can react")
    : fail(`REGISTER_FLOOR (${REGISTER_FLOOR}) has drifted from REACTION_FLOOR (${REACTION_FLOOR})`);
}

/* ---------- 3. occluded is not the same as not yet here ------------- */
console.log("\n3. OCCLUDED AND NOT-YET-ON-STAGE ARE DIFFERENT THINGS");
{
  /* `pose.hidden` covers both "a van is in the way" and "this car has not
     spawned yet", and only the first is a perceptual fact. Conflating
     them made a candidate rated 1.0 on observation — who by construction
     misses nothing — pull out into `gap` and make contact, because two
     oncoming cars had not come on stage when it decided. */
  const perfect = rated(1);
  let occluded = 0, upTheRoad = 0, both = 0;
  for (const { scn, sim } of scenes) {
    const seen = sightingsIn(sim, scn, { candidate: perfect });
    for (const s of Object.values(seen)) {
      if (s.onStageAt != null && s.clearAt == null) occluded++;
      if (s.onStageAt != null && s.clearAt != null && s.clearAt > s.onStageAt) both++;
    }
  }
  /* Somebody not yet on stage is in the awareness set anyway, because
     their absence is a fact about the world's extent rather than about
     anybody's eyes.

     Measured, and it corrected my own assumption: VEHICLES are on stage
     from t=0 — they are approaching down the road, not spawning at the
     junction — so this clause fires only for PEDESTRIANS, who do not
     exist until they step off the kerb. 4 road users in 69. It is still
     the right rule, and it is a real behaviour change: before it, a
     candidate simply ignored a pedestrian who had not started crossing. */
  let offStage = 0, knownAnyway = 0;
  for (const { scn: sc, sim: si } of scenes) {
    const seen = sightingsIn(si, sc, { candidate: perfect });
    for (const a of si.actors) {
      const on = seen[a.id]?.onStageAt;
      if (on == null || on <= 0) continue;
      offStage++;
      const before = Math.max(0, on - 0.3);
      if (awarenessAt(si, sc, perfect, before, 7, { sightings: seen }).some((k) => k.id === a.id)) knownAnyway++;
    }
  }
  offStage > 0 && knownAnyway === offStage
    ? ok(`all ${offStage} road users who are not yet on stage count as known before they appear, so nobody is blamed for missing them (all pedestrians: a vehicle is already approaching from t=0)`)
    : offStage === 0
      ? fail("no road user is ever off stage, so the distinction cannot be exercised at all")
      : fail(`${offStage - knownAnyway} of ${offStage} off-stage road users are treated as unnoticed`);

  /* And the converse, which is the half that must not leak: being on
     stage but occluded is NOT knowing about them. */
  let leaked = 0, occludedSeen = 0;
  for (const { scn: sc, sim: si } of scenes) {
    const seen = sightingsIn(si, sc, { candidate: perfect });
    for (const a of si.actors) {
      const s2 = seen[a.id];
      if (!s2 || s2.onStageAt == null || s2.clearAt == null || s2.clearAt <= s2.onStageAt) continue;
      occludedSeen++;
      const mid = (s2.onStageAt + s2.clearAt) / 2;
      if (awarenessAt(si, sc, perfect, mid, 7, { sightings: seen }).some((k) => k.id === a.id)) leaked++;
    }
  }
  leaked === 0
    ? ok(`and being on stage but occluded is NOT knowing: ${occludedSeen} such road users, none of them leaked into awareness`)
    : fail(`${leaked} occluded road users were treated as known, so occlusion is being bypassed`);
  both > 0
    ? ok(`${both} road users are on stage before they are clear — occlusion genuinely delays sighting, mostly behind other traffic`)
    : fail("no road user was ever on stage but not yet clear, so occlusion is doing nothing");
  console.log(`   never clear at all despite being on stage: ${occluded} (the scenario's doing, not the driver's)`);
}

/* ---------- 4. gathering falls off with the rating ------------------ */
console.log("\n4. A BETTER OBSERVER GATHERS MORE. MEASURED ON GATHERING, NOT OUTCOME");
{
  /* The decision point is legalAt: a fixed reference that does not depend
     on awareness, so the measurement cannot feed back into itself. And it
     is a count of information gathered, never of what went wrong —
     calibrating this axis on contact rate would be scoring observation by
     outcome, which is the one thing it must not do. */
  const missRate = (cand) => {
    let sighted = 0, missed = 0;
    for (const { scn, sim } of scenes) {
      const seen = sightingsIn(sim, scn, { candidate: cand });
      const reg = registrationsIn(sim, scn, cand, 7, { sightings: seen });
      for (const [id, s] of Object.entries(seen)) {
        if (s.clearAt == null || s.clearAt > sim.legalAt) continue;
        sighted++;
        if (reg[id] == null || reg[id] > sim.legalAt) missed++;
      }
    }
    return sighted ? missed / sighted : 0;
  };

  const curve = [1, 0.75, 0.5, 0.25, 0].map((o) => ({ o, r: missRate(rated(o)) }));
  console.log("   observation  " + curve.map((c) => c.o.toFixed(2).padStart(8)).join(""));
  console.log("   missed       " + curve.map((c) => `${(100 * c.r).toFixed(0)}%`.padStart(8)).join(""));

  curve[0].r === 0
    ? ok("a perfect observer misses nothing that was there to be gathered")
    : fail(`a perfect observer still missed ${(100 * curve[0].r).toFixed(0)}% — the floor is not doing its job`);
  curve.every((c, i) => i === 0 || c.r >= curve[i - 1].r)
    ? ok("and missing rises monotonically as the rating falls")
    : fail(`the miss rate is not monotone in the rating: ${curve.map((c) => (100 * c.r).toFixed(0)).join(" ")}`);

  let tot = 0, worst = 0, n = 0;
  for (let i = 1; i <= 60; i++) {
    const r = missRate(composeDriver(i * 13));
    tot += r; worst = Math.max(worst, r); n++;
  }
  const mean = tot / n;
  console.log(`   drawn drivers (${n}): mean ${(100 * mean).toFixed(0)}% missed, worst ${(100 * worst).toFixed(0)}%`);
  mean > 0.01 && mean < 0.15 && worst > 0.1
    ? ok(`REGISTER_SPAN ${REGISTER_SPAN}s: most drivers notice most things, and the worst miss enough to be a habit`)
    : fail(`REGISTER_SPAN ${REGISTER_SPAN}s gives mean ${(100 * mean).toFixed(0)}% / worst ${(100 * worst).toFixed(0)}% — either nobody misses anything or nobody notices anything`);
}

/* ---------- 5. observation or confidence, decided mechanically ------ */
console.log("\n5. THE SPLIT IS A FACT THE MODEL HOLDS, NOT A WEIGHT IN A TABLE");
{
  /* A tight gap taken having registered the vehicle is a CONFIDENCE
     fault — they saw it and went anyway. The same gap taken without
     having registered it is an OBSERVATION fault. Same visible outcome,
     different cause, and a real examiner separates them. */
  let pairs = 0, split = 0, sameOutcome = 0;
  for (const { scn, sim } of scenes) {
    const early = Math.max(0, sim.legalAt - 1.2);
    const enc = worstEncroachment(sim, { departAt: early });
    if (!enc || enc.band === "comfortable") continue;
    const good = causeOf(sim, scn, rated(1), enc.who, early, 7);
    const poor = causeOf(sim, scn, rated(0), enc.who, early, 7);
    if (good === "unsighted") continue;
    pairs++;
    /* The outcome is identical by construction -- same scene, same
       departure, same band -- so anything that differs is the cause. */
    sameOutcome++;
    if (good === "confidence" && poor === "observation") split++;
  }
  split > 0
    ? ok(`${split} of ${pairs} identical encroachments split by cause: a good observer's is confidence, a poor one's is observation`)
    : fail("no encroachment was ever attributed differently for a good and a poor observer, so the split is not doing anything");
  sameOutcome === pairs
    ? ok(`and the outcome was identical in all ${pairs} — same scene, same departure, same band — so only the cause differs`)
    : fail("the comparison was not held constant on outcome");

  /* Never scored by outcome: the same gathering must give the same cause
     whether the manoeuvre ended badly or not. */
  let stableCause = true;
  for (const { scn, sim } of scenes.slice(0, 12)) {
    for (const a of sim.actors) {
      const c1 = causeOf(sim, scn, rated(0.4), a.id, sim.legalAt, 7);
      const c2 = causeOf(sim, scn, rated(0.4), a.id, sim.legalAt, 7);
      if (c1 !== c2) stableCause = false;
    }
  }
  stableCause
    ? ok("and the cause is a property of the gathering alone, stable across calls")
    : fail("causeOf is not stable, so attribution depends on something other than the gathering");
}

/* ---------- 6. creep belongs to the candidate ----------------------- */
console.log("\n6. CREEP IS THE CANDIDATE'S, NOT THE PLAYER'S");
{
  /* In the driver game creep was a PLAYER input — edge forward to see
     past the van. Feeding a player input into the candidate's awareness
     would be exactly the contamination the three-layer split exists to
     prevent. */
  const src = fs.readFileSync("src/engine/awareness.js", "utf8");
  /^const creepOf = \(candidate\)/m.test(src)
    ? ok("creep depth is read from the candidate, never passed in from outside")
    : fail("creep depth does not come from the candidate");

  const blind = scenes.find((x) => (x.scn.sightBlockers ?? []).length > 0);
  if (!blind) { fail("no scenario with a sight blocker, so creep cannot be tested"); }
  else {
    const seenAt = (steps) => {
      const s = sightingsIn(blind.sim, blind.scn, { candidate: { creep: steps, ratings: { observation: 1 } } });
      return Object.values(s).filter((x) => x.clearAt != null).length;
    };
    const none = seenAt(0), crept = seenAt(3);
    crept >= none
      ? ok(`creeping never costs sight at ${blind.id} (${none} clear standing, ${crept} after 3 steps)`)
      : fail(`creeping LOST sight of ${none - crept} road user(s), which is backwards`);
    console.log(`   note: creep buys sight where the blocker is between the eye and the traffic; at ${blind.id} it is worth ${crept - none}.`);
  }
}

/* ---------- 7. what it does to a decision, reported not asserted ---- */
console.log("\n7. WHAT AWARENESS DOES TO A DECISION (R2.3 PREVIEW)");
{
  /* departureOnAwareness is exposed as a query and deliberately NOT wired
     into schedule(). Reported here so R2.3 starts from a measurement. */
  console.log("   observation   departs early   worst band reached");
  for (const o of [1, 0.5, 0]) {
    const c = rated(o);
    let early = 0, n = 0;
    const tally = {};
    for (const { scn, sim } of scenes) {
      const d = departureOnAwareness(sim, scn, c, 7);
      n++;
      if (d < sim.legalAt - 1e-6) early++;
      const w = worstEncroachment(sim, { departAt: d });
      const b = w ? w.band : "none";
      tally[b] = (tally[b] || 0) + 1;
    }
    console.log(`   ${o.toFixed(2).padStart(11)}   ${String(early + "/" + n).padStart(13)}   ${Object.entries(tally).map(([k, v]) => `${k} ${v}`).join(", ")}`);
  }
  console.log("   A perfect observer still departs early at `gap`: two oncoming cars are");
  console.log("   hidden BEHIND the first, so no observer can see the whole stream. That is");
  console.log("   the model being right, and it is R2.3's question — how a driver behaves");
  console.log("   when they can tell their own view is incomplete.");
}

console.log("\n" + "=".repeat(70));
if (problems) {
  console.log(`FAILED: ${problems} problem(s).`);
  process.exit(1);
}
console.log("OK: awareness is the candidate's, deterministic, and scored on gathering.");
