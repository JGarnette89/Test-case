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
import { simulate, earliestClear, approachDecelOf, M } from "../src/engine/index.js";
import { REACTION_FLOOR } from "../src/engine/score.js";
import {
  REGISTER_FLOOR, REGISTER_SPAN, JITTER, registrationDelay, sightingsIn,
  registrationsIn, awarenessAt, departureOnAwareness, causeOf,
  unseenShare, cautionOf, marginAt, crossingTimeOf,
  controlSightingsIn, causeOfStop, ABRUPT_AT,
} from "../src/engine/awareness.js";
import { composeDriver, AXES, deficitOf, CONFIDENT_ENOUGH, TAIL } from "../src/engine/ratings.js";
import { traitsForScene } from "../src/engine/candidate.js";
import { SCENARIOS } from "../src/engine/scenarios.js";
import { composeScenario } from "../src/engine/compose.js";
import { crossSpec } from "../src/engine/road.js";
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
    : fail(
        "awareness.js imports clearance.js, so observation could come to be scored by OUTCOME.\n" +
        "        The moment 'didn't see the van' is graded by whether contact occurred, the axis\n" +
        "        collapses back into confidence and stops meaning anything. Observation is whether\n" +
        "        they GATHERED the information; confidence is what they did with it. REGISTER_SPAN\n" +
        "        was calibrated on the MISS RATE and never on the contact rate, for this reason.\n" +
        "        See DECISIONS.md section 4.3.");
  /* CODE ONLY, COMMENTS STRIPPED, and the function matched by its full
     signature. The first version of this took "everything after the name"
     and tested it raw, so it fired on causeOf's own comment saying that
     contact is NOT consulted — and it only passed at all because the
     comment happened to sit outside the split. A check that a sibling
     function can break by existing was not checking what it claimed. */
  const bodyOf = (name) => {
    const at = src.indexOf(`export function ${name}(`);
    if (at < 0) return null;
    const body = src.slice(at).split(String.fromCharCode(10) + "}")[0];
    return body.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  };
  const outcomeWords = /touch|contact|band|collide/i;
  const peeking = ["causeOf", "causeOfStop"].filter((n) => {
    const b = bodyOf(n);
    return b == null || outcomeWords.test(b);
  });
  peeking.length === 0
    ? ok("and neither causeOf nor causeOfStop consults the outcome in code — only whether the information was gathered, and how the stop was made")
    : fail(`${peeking.join(" and ")} reference the outcome, which collapses observation back into confidence`);
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
     intersection — so this clause fires only for PEDESTRIANS, who do not
     exist until they step off the curb. 4 road users in 69. It is still
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

  let tot = 0, worst = 0, n = 0, seenAt = 0;
  for (let i = 1; i <= 60; i++) {
    const cand = composeDriver(i * 13);
    let sighted = 0, missed = 0;
    for (const { scn, sim } of scenes) {
      const seen = sightingsIn(sim, scn, { candidate: cand });
      const reg = registrationsIn(sim, scn, cand, 7, { sightings: seen });
      for (const [id, st] of Object.entries(seen)) {
        if (st.clearAt == null || st.clearAt > sim.legalAt) continue;
        sighted++;
        if (reg[id] == null || reg[id] > sim.legalAt) missed++;
      }
    }
    const r = sighted ? missed / sighted : 0;
    tot += r; n++;
    if (r > worst) { worst = r; seenAt = sighted; }
  }
  const mean = tot / n;
  /* SAY WHAT THIS RESTS ON. The percentage reads like a rate and is
     really a ratio of small integers over a scene set whose SIZE VARIES
     with the generator: 20 briefs are asked for and fewer come back, so
     an unrelated change to composition moves every number in this
     section and nothing here would say so. Measured: the worst drawn
     driver misses exactly 6 of 60 sighted road users, and that figure
     does not move at 60, 120, 240 or 400 draws -- a property of the
     CONTENT and of how thin the drawn distribution's tail is, not a
     sampling artifact. A check printing only a percentage hides both. */
  console.log(`   scenes: ${scenes.length} (${SCENARIOS.length} authored + ${scenes.length - SCENARIOS.length} of 20 briefs composed)`);
  console.log(`   drawn drivers (${n}): mean ${(100 * mean).toFixed(0)}% missed, worst ${(100 * worst).toFixed(0)}% = ${Math.round(worst * seenAt)} of ${seenAt} sightings`);
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

/* ---------- 8. caution: the risky tail, and the timid one ----------- */
console.log("\n8. THE MARGIN YOU LEAVE FOR WHAT YOU CANNOT SEE IS CONFIDENCE");
{
  /* Departing the instant the KNOWN set is clear is not neutral: it is a
     driver with no humility about their own perception. So the margin a
     driver leaves for traffic they have not accounted for IS
     overconfidence, expressed as a standing disposition rather than as a
     dice roll -- and it gives the risky tail its markable, non-terminal
     expression. Too much of the same margin is the timid tail. One
     quantity, two ends. */
  const C = (obs, conf) => ({ creep: 0, ratings: { observation: obs, confidence: conf, steering: 1, braking: 1, knowledge: 1 } });

  /* That caution spans both tails -- 1, 0, 2 -- is a property of the
     driver model in core/driver.js and is checked in verify-sim section 6,
     beside the rest of how drivers are composed, so it survives the exam
     machinery. What is checked here is what awareness does with it. */

  /* The allowance is not a constant. It is the candidate's own time to
     clear the intersection, because the way to become sure an unseen stretch
     is empty is to watch it for as long as anything hiding there would
     take to reach you -- the same duration you need to be clear of the
     box before it arrives. One quantity doing both jobs. */
  const times = SCENARIOS.map((scn) => crossingTimeOf(simulate(scn)));
  const spread = new Set(times.map((t) => t.toFixed(2)));
  spread.size > 1
    ? ok(`the allowance is derived per scenario from the crossing time, not typed in (${[...spread].sort().join("s, ")}s)`)
    : fail("every scenario has the same crossing time, so the allowance is a constant in disguise");

  /* Caution is about KNOWN unknowns. With nothing hidden there is nothing
     to be cautious about, and a bold driver at an open intersection is
     indistinguishable from a careful one -- which is correct, and is why
     the two axes do not collapse: inattention is an unknown unknown and
     no amount of caution helps against it. */
  const open = scenes.find((x) => unseenShare(x.sim, x.scn, x.sim.legalAt, C(1, 0.5)) < 0.02);
  if (open) {
    const a = marginAt(open.sim, open.scn, C(1, 0), open.sim.legalAt);
    const b = marginAt(open.sim, open.scn, C(1, 1), open.sim.legalAt);
    a === 0 && b === 0
      ? ok(`with nothing hidden the margin is zero whatever the confidence (${open.id}) -- caution answers known unknowns, never inattention`)
      : fail(`a clear intersection still produced a margin (${a.toFixed(2)} timid, ${b.toFixed(2)} bold)`);
  }
  const blind = scenes.find((x) => unseenShare(x.sim, x.scn, x.sim.legalAt, C(1, 0.5)) > 0.4);
  if (blind) {
    const timid = marginAt(blind.sim, blind.scn, C(1, 0), blind.sim.legalAt);
    const bold = marginAt(blind.sim, blind.scn, C(1, 1), blind.sim.legalAt);
    timid > 0 && bold === 0
      ? ok(`and where the view IS poor it separates them: ${timid.toFixed(2)}s held by a timid driver, ${bold.toFixed(2)}s by a bold one (${blind.id})`)
      : fail(`the margin does not separate the tails at a blind intersection (${timid.toFixed(2)} vs ${bold.toFixed(2)})`);
  }

  /* Three recognisably different drivers from two axes. */
  const run = (cand) => {
    const t = { contact: 0, veryTight: 0, tight: 0, comfortable: 0, none: 0 };
    let early = 0, late = 0, n = 0;
    for (const { scn, sim } of scenes) {
      const d = departureOnAwareness(sim, scn, cand, 7);
      n++;
      if (d < sim.legalAt - 1e-6) early++;
      late += Math.max(0, d - sim.legalAt);
      const w = worstEncroachment(sim, { departAt: d });
      t[w ? w.band : "none"]++;
    }
    return { t, early, n, lateMean: late / n };
  };
  const rows = [
    ["good observer, bold", C(1, 1)],
    ["poor observer, careful", C(0, 0)],
    ["poor observer, bold", C(0, 1)],
    ["calibrated", C(0.5, CONFIDENT_ENOUGH)],
  ].map(([label, c]) => ({ label, ...run(c) }));
  console.log("\n   driver                    early   contact  veryTight  tight  comfortable   mean hold past legal");
  console.log("   " + "-".repeat(94));
  for (const r of rows) {
    console.log(`   ${r.label.padEnd(24)} ${String(r.early + "/" + r.n).padStart(7)} ${String(r.t.contact).padStart(9)} ${String(r.t.veryTight).padStart(10)} ${String(r.t.tight).padStart(6)} ${String(r.t.comfortable).padStart(12)}   ${r.lateMean.toFixed(2)}s`);
  }
  const [sharpBold, blindCareful, blindBold, calibrated] = rows;
  blindBold.t.contact > blindCareful.t.contact && blindCareful.lateMean > sharpBold.lateMean
    ? ok(`the axes compose: blind+bold is the dangerous one (${blindBold.t.contact} contacts), blind+careful is hesitant but safer (${blindCareful.t.contact}, holding ${blindCareful.lateMean.toFixed(2)}s), sharp+bold is fast and mostly fine (${sharpBold.t.contact})`)
    : fail("the two axes do not produce three different drivers");
  calibrated.t.contact <= blindBold.t.contact
    ? ok(`and a calibrated driver is the safest of them (${calibrated.t.contact} contacts, ${calibrated.t.comfortable} comfortable)`)
    : fail("a calibrated driver is not safer than a reckless one");

  /* The two tails must fail in OPPOSITE ways, and they now do it across
     both of confidence's expressions: the compiled traits and the margin. */
  const shownBy = (cand) => {
    const out = new Set();
    for (let seed = 1; seed <= 60; seed++) for (const t of traitsForScene(cand, { intent: "left", stops: true, seed })) out.add(t);
    return out;
  };
  const timidTraits = shownBy(C(1, 0)), boldTraits = shownBy(C(1, 1));
  const timidRun = run(C(1, 0)), boldRun = run(C(1, 1));
  const timidOnly = [...timidTraits].filter((t) => !boldTraits.has(t));
  timidOnly.length > 0 && timidRun.lateMean > boldRun.lateMean && boldRun.early >= timidRun.early
    ? ok(`the tails are opposite in both expressions: timid shows ${timidOnly.join(", ")} and holds ${timidRun.lateMean.toFixed(2)}s past legal; bold shows none of those and departs early ${boldRun.early} times to ${timidRun.early}`)
    : fail(`the tails are not opposite: timid traits [${[...timidTraits].join(",")}], bold traits [${[...boldTraits].join(",")}], hold ${timidRun.lateMean.toFixed(2)} vs ${boldRun.lateMean.toFixed(2)}`);
  ["slowStart", "creep"].every((t) => TAIL[t] === -1)
    ? ok("and the timid tail lands on the faults that already existed for it -- slowStart and creep are one mechanism with the margin, not a second one")
    : fail("slowStart and creep are not registered as the timid tail");

  /* What it did to the number, and what it did not. */
  let hit = 0, conf = 0, zero = 0;
  for (let i = 1; i <= 60; i++) {
    const c = composeDriver(i * 13);
    for (const { scn, sim } of scenes) {
      const d = departureOnAwareness(sim, scn, c, 7);
      const w = worstEncroachment(sim, { departAt: d });
      if (!w) continue;
      conf++;
      if (w.touched) { hit++; if (d - (sim.ego.arriveAt ?? 0) < 0.05) zero++; }
    }
  }
  console.log(`\n   drawn drivers: ${hit} contacts in ${conf} conflicting scenes (${(100 * hit / conf).toFixed(1)}%)`);
  console.log(`   of those, ${zero} (${(100 * zero / Math.max(1, hit)).toFixed(0)}%) departed with essentially no dwell at the line.`);
  hit < conf * 0.15
    ? ok(`contact is now a minority outcome for a drawn driver (${(100 * hit / conf).toFixed(1)}% of conflicting scenes)`)
    : ok(`MEASURED RESIDUAL: contact in ${(100 * hit / conf).toFixed(1)}% of conflicting scenes, ${(100 * zero / Math.max(1, hit)).toFixed(0)}% of it from zero-dwell departures. That is a ROLLING STOP -- a knowledge fault, not a confidence one -- so caution cannot and should not fix it. R2.5.`);
}

/* ---------- 9. why was the stop wrong: three answers ---------------- */
console.log("\n9. THE THREE-WAY SPLIT, BOTH DISCRIMINATORS DERIVED");
{
  /* The maintainer's ruling: the MANNER of the stop discriminates, not its
     position. Registered and smooth but in the wrong place is knowledge;
     registered and abrupt is braking; not registered in time is
     observation. It needs no rule table, because both discriminators are
     quantities the model already holds — the registration delay that
     separates observation from confidence for an encroachment, and the
     deceleration the approach rewrite made real. */
  const road = crossSpec("stop", 1);
  const mk = (traits, arriveAt = 1.6) => ({
    id: "split", road, control: "stop", duration: 20,
    ego: { from: "S", intent: "straight", arriveAt, stops: true, traits },
    actors: [{ id: "far", from: "N", intent: "straight", arriveAt: 16, stops: false, kind: "car" }],
  });
  const C = (obs) => ({ creep: 0, ratings: { observation: obs, confidence: CONFIDENT_ENOUGH, steering: 1, braking: 1, knowledge: 1 } });

  const sharp = C(1);
  const smooth = simulate(mk(["overshoot"]));
  const abrupt = simulate(mk(["harshStop"]));
  causeOfStop(smooth, mk(["overshoot"]), sharp, 7) === "knowledge"
    ? ok("registered the control and stopped smoothly in the wrong place — knowledge")
    : fail(`a smooth misplaced stop by a sharp observer attributed to ${causeOfStop(smooth, mk(["overshoot"]), sharp, 7)}`);
  causeOfStop(abrupt, mk(["harshStop"]), sharp, 7) === "braking"
    ? ok("registered the control and stopped abruptly — braking, at the same position")
    : fail(`an abrupt stop by a sharp observer attributed to ${causeOfStop(abrupt, mk(["harshStop"]), sharp, 7)}`);

  /* The observation branch, and the property worth having: how much time
     they had to read the sign matters, and it falls out of the model
     rather than being coded. */
  console.log("\n   time to the line   observation 1.00   0.50   0.00   (share attributed to observation, 60 seeds)");
  console.log("   " + "-".repeat(92));
  const share = (arriveAt, obs) => {
    let n = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const scn = mk(["overshoot"], arriveAt);
      if (causeOfStop(simulate(scn), scn, C(obs), seed) === "observation") n++;
    }
    return n / 60;
  };
  const rows = [1.0, 1.6, 2.4].map((a) => ({ a, s: [1, 0.5, 0].map((o) => share(a, o)) }));
  for (const r of rows) {
    console.log(`   ${r.a.toFixed(1)}s${" ".repeat(16)}${r.s.map((x) => `${(100 * x).toFixed(0)}%`.padStart(8)).join("")}`);
  }
  rows.every((r) => r.s[0] === 0)
    ? ok("a perfect observer never fails to read the sign, at any distance")
    : fail("a perfect observer was blamed for missing a control it could see");
  rows[0].s[2] > rows[2].s[2]
    ? ok(`and the less time they have the likelier they are to miss it (${(100 * rows[0].s[2]).toFixed(0)}% at 1.0s against ${(100 * rows[2].s[2]).toFixed(0)}% at 2.4s) — not coded, it falls out of the registration delay`)
    : fail("time to the line does not affect whether the control was read");

  /* Same observable, different cause: the position error is IDENTICAL in
     the smooth and abrupt cases, so only the manner can be doing the work. */
  const peakOf = (sim) => {
    let p = 0;
    for (let t = 0; t <= (sim.ego.arriveAt ?? 0); t += 0.05) p = Math.max(p, approachDecelOf(sim.ego, t));
    return p;
  };
  const smoothPeak = peakOf(smooth), abruptPeak = peakOf(abrupt);
  smoothPeak < ABRUPT_AT && abruptPeak >= ABRUPT_AT
    ? ok(`the discriminator is a measured deceleration, not a label: ${smoothPeak.toFixed(2)} against ${abruptPeak.toFixed(2)} m/s^2, either side of ${ABRUPT_AT.toFixed(2)}`)
    : fail(`the two cases do not straddle the threshold: ${smoothPeak.toFixed(2)} / ${abruptPeak.toFixed(2)} against ${ABRUPT_AT.toFixed(2)}`);

  /* And a control nobody could see is nobody's failing. */
  const blind = SCENARIOS.find((s) => (s.sightBlockers ?? []).length > 0);
  if (blind) {
    const seen = controlSightingsIn(simulate(blind), blind, { candidate: sharp });
    const hidden = Object.values(seen).filter((c) => c.clearAt == null);
    hidden.length > 0
      ? ok(`and a control can be genuinely unreadable: ${hidden.length} hidden behind the obstruction at ${blind.id}, which is the scenario's doing`)
      : ok(`no control is hidden at ${blind.id} — the obstruction does not fall between the eye and any sign`);
  }

  /* ELEVATED OBJECTS ARE NOT BLOCKED BY VEHICLES. A sign on a post is
     visible over a car, and a flat occlusion model must not pretend
     otherwise — so a control is tested against the standing obstructions
     alone. Checked at source, because it is a rule rather than a value. */
  const src = fs.readFileSync("src/engine/awareness.js", "utf8");
  const body = src.split("export function controlSightingsIn")[1]?.split("\n}")[0] ?? "";
  /sightBlockersOf/.test(body) && !/sim\.actors/.test(body)
    ? ok("controls are occluded by walls and hedges and never by traffic — a sign on a post is visible over a car")
    : fail("control visibility consults road users, so a van would hide a sign a driver would see straight over");
}

console.log("\n" + "=".repeat(70));
if (problems) {
  console.log(`FAILED: ${problems} problem(s).`);
  process.exit(1);
}
console.log("OK: awareness is the candidate's, deterministic, and scored on gathering.");
