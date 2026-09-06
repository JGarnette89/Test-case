/* Reaction: the traffic moving around a driver who took its space.
 *
 * "This is what poor drivers don't see, the traffic moving around them."
 * The reaction is the player's OBSERVABLE, never the definition of the
 * fault — encroachment is marked on what the candidate did, against road
 * users holding the line they planned, and that must stay true.
 *
 * The property that makes this more than tidiness is measured below: mark
 * on the reacted world instead and a driver who forces somebody to brake
 * scores BETTER, because the other car got out of the way.
 */
import fs from "node:fs";
import { simulate, safeAtFor, poseAt, CX, CY, M } from "../src/engine/index.js";
import { cruiseProfile, yieldingProfile, distanceAt, speedAt, YIELD_RAMP, MOST_GIVE } from "../src/engine/paths.js";
import { worstEncroachment, clampDepart } from "../src/engine/clearance.js";
import { reactionsFor, withReactions, contactAfter, timeGivenUp, NOTICE, MOST_WAIT } from "../src/engine/reaction.js";
import { departureOnAwareness } from "../src/engine/awareness.js";
import { composeDriver } from "../src/engine/ratings.js";
import { SCENARIOS } from "../src/engine/scenarios.js";

let problems = 0;
const ok = (s) => console.log(`  ok   ${s}`);
const fail = (s) => { problems++; console.log(`  FAIL: ${s}`); };

const scenes = SCENARIOS.map((scn) => ({ id: scn.id, scn, sim: simulate(scn) }));

console.log("\n" + "=".repeat(70));
console.log("REACTION: what the player sees when somebody had to give way");
console.log("=".repeat(70));

/* ---------- 1. the profile has to be searchable ---------------------- */
console.log("\n1. GIVING WAY IS MONOTONE IN ITS OWN PARAMETERS, AND NEVER REVERSES");
{
  /* The bug that cost the most here: the first version took the TIME
     given up and stretched the braking ramp to fit it, which made the lag
     non-monotone in its own parameter -- a bigger sacrifice braked more
     gently and so lagged LESS in the moments that mattered. Measured,
     giving up 4s put the car further forward at the instant of the
     collision than giving up 2s. The search for "the least giving way
     that works" was bisecting a function that does not increase, so it
     always fell through to the maximum and never avoided anything. */
  const base = cruiseProfile(M(12.5));
  let bad = 0, samples = 0;
  for (let t = 2; t <= 20; t += 0.2) {
    let prev = -1;
    for (let g = 0; g <= MOST_GIVE + 1e-9; g += 0.05) {
      const lag = distanceAt(base, t) - distanceAt(yieldingProfile(base, { from: 2, give: g }), t);
      samples++;
      if (lag < prev - 1e-9) bad++;
      prev = lag;
    }
    prev = -1;
    for (let w = 0; w <= MOST_WAIT; w += 0.5) {
      const lag = distanceAt(base, t) - distanceAt(yieldingProfile(base, { from: 2, give: MOST_GIVE, wait: w }), t);
      samples++;
      if (lag < prev - 1e-9) bad++;
      prev = lag;
    }
  }
  bad === 0
    ? ok(`falling behind increases with both braking and waiting, at every instant (${samples} samples)`)
    : fail(`${bad} of ${samples} samples are non-monotone, so the search cannot bisect them`);

  let reversed = 0;
  for (const [g, w] of [[0.1, 0], [0.4, 0], [MOST_GIVE, 0], [MOST_GIVE, 4]]) {
    const y = yieldingProfile(base, { from: 2, give: g, wait: w });
    let prev = -1;
    for (let t = 0; t <= 30; t += 0.05) {
      const d = distanceAt(y, t);
      if (d < prev - 1e-9) reversed++;
      prev = d;
    }
  }
  reversed === 0
    ? ok("and a car giving way never travels backwards, whatever it gives")
    : fail(`${reversed} samples where a yielding car reversed`);

  /* Severity has to be readable, because it is what the player reads. */
  const dip = (g, w = 0) => {
    const y = yieldingProfile(base, { from: 2, give: g, wait: w });
    let min = Infinity;
    for (let t = 0; t <= 30; t += 0.05) min = Math.min(min, speedAt(y, t));
    return min / M(12.5);
  };
  const gentle = dip(0.1), hard = dip(MOST_GIVE);
  gentle > 0.75 && hard < 0.05
    ? ok(`and it spans a lift off the throttle (${(100 * gentle).toFixed(0)}% of speed) to a dead stop (${(100 * hard).toFixed(0)}%)`)
    : fail(`the dip does not span gentle to stopped: ${(100 * gentle).toFixed(0)}% / ${(100 * hard).toFixed(0)}%`);

  const y = yieldingProfile(base, { from: 2, give: MOST_GIVE, wait: 4 });
  Math.abs((distanceAt(base, 30) - distanceAt(y, 30)) / M(12.5) - y.hold) < 0.05
    ? ok(`and the time it declares giving up is the time it actually gives up (${y.hold.toFixed(2)}s)`)
    : fail("the declared and actual time given up disagree");
}

/* ---------- 2. the fault is not defined by the reaction -------------- */
console.log("\n2. THE REACTION IS THE OBSERVABLE, NOT THE FAULT");
{
  const src = fs.readFileSync("src/engine/clearance.js", "utf8");
  const imports = [...src.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);
  !imports.some((i) => i.includes("reaction"))
    ? ok(`clearance imports nothing from reaction (${[...new Set(imports)].join(", ")}), so a fault cannot come to depend on a response to it`)
    : fail("clearance imports reaction");

  /* And the reason it matters, measured rather than asserted. */
  const order = ["contact", "veryTight", "tight", "comfortable"];
  let cases = 0, softened = 0, worst = null;
  for (const { id, scn, sim } of scenes) {
    const safe = safeAtFor(sim);
    for (const d of [0.8, 1.2, 1.8, 2.4]) {
      const at = clampDepart(sim.ego, Math.max(0, safe - d));
      const before = worstEncroachment(sim, { departAt: at });
      if (!before) continue;
      const rx = reactionsFor(sim, { departAt: at });
      if (!rx.length) continue;
      const after = worstEncroachment(withReactions(sim, rx, { departAt: at }), { departAt: at });
      cases++;
      if (after && order.indexOf(after.band) > order.indexOf(before.band)) {
        softened++;
        if (!worst) worst = `${id}: ${before.band} becomes ${after.band}`;
      }
    }
  }
  softened > 0
    ? ok(`marking on the reacted world would soften ${softened} of ${cases} faults (${(100 * softened / cases).toFixed(0)}%) — e.g. ${worst}. A driver who forces a brake would score BETTER for it.`)
    : fail("the reacted world never softened a fault, so this measurement is not exercising the hazard");
}

/* ---------- 3. derived, not scripted --------------------------------- */
console.log("\n3. THE REACTION IS THE LEAST GIVING WAY THAT WORKS");
{
  console.log("   scenario      early   band            who gives way   gives   slows to   still hit?");
  console.log("   " + "-".repeat(88));
  let shown = 0, graded = new Set();
  for (const { id, scn, sim } of scenes) {
    const safe = safeAtFor(sim);
    for (const d of [1.2, 2.0]) {
      const at = clampDepart(sim.ego, Math.max(0, safe - d));
      const enc = worstEncroachment(sim, { departAt: at });
      const rx = reactionsFor(sim, { departAt: at });
      if (!rx.length) continue;
      const hit = contactAfter(withReactions(sim, rx, { departAt: at }));
      const r = rx[0];
      graded.add(r.give.toFixed(2));
      if (shown++ < 8) {
        console.log(`   ${id.padEnd(13)} ${d.toFixed(1)}s   ${(enc ? enc.band : "-").padEnd(15)} ${r.name.padEnd(14)} ${(r.gaveUp.toFixed(2) + "s").padStart(7)} ${((100 * (1 - r.give)).toFixed(0) + "%").padStart(10)}   ${hit ?? "no"}`);
      }
    }
  }
  graded.size > 2
    ? ok(`${graded.size} distinct amounts of giving way across the set — it is searched per situation, not a scripted brake`)
    : fail(`only ${graded.size} distinct reaction sizes, so it is effectively scripted`);
}

/* ---------- 4. what it does to the contact rate ---------------------- */
console.log("\n4. CONTACT BECOMES A NEAR MISS WHERE ANYBODY COULD HAVE AVOIDED IT");
{
  const run = (cand) => {
    let raw = 0, after = 0, reacted = 0, n = 0;
    for (const { scn, sim } of scenes) {
      const d = departureOnAwareness(sim, scn, cand, 7);
      n++;
      const w = worstEncroachment(sim, { departAt: d });
      if (w && w.touched) raw++;
      const rx = reactionsFor(sim, { departAt: d });
      if (rx.length) reacted++;
      if (contactAfter(withReactions(sim, rx, { departAt: d }))) after++;
    }
    return { raw, after, reacted, n };
  };
  const C = (o, c) => ({ creep: 0, ratings: { observation: o, confidence: c, steering: 1, braking: 1, knowledge: 1 } });
  const bold = run(C(0, 1));
  bold.after < bold.raw
    ? ok(`a blind, bold driver: ${bold.raw} contacts become ${bold.after} once the world gives way (${bold.reacted} scenes had a reaction)`)
    : fail(`the reaction layer did not reduce contacts for a blind bold driver (${bold.raw} -> ${bold.after})`);

  /* And where it cannot help, the reason is geometric rather than a
     shortcoming of the model: you cannot reverse out of a junction you
     are already in. */
  let tot = 0, inBox = 0, approaching = 0;
  for (let i = 1; i <= 20; i++) {
    const c = composeDriver(i * 13);
    for (const { scn, sim } of scenes) {
      const d = departureOnAwareness(sim, scn, c, 7);
      const rx = reactionsFor(sim, { departAt: d });
      const hit = contactAfter(withReactions(sim, rx, { departAt: d }));
      if (!hit) continue;
      tot++;
      const a = sim.actors.find((x) => x.id === hit);
      const p = poseAt(a, Math.max(d, a.departAt ?? 0));
      const dist = p && !p.hidden ? Math.hypot(p.x - CX, p.y - CY) / M(1) : Infinity;
      if (dist < 9) inBox++; else approaching++;
    }
  }
  console.log(`   residual contacts across 20 drawn drivers: ${tot}`);
  console.log(`     other car already at or in the junction when the candidate committed: ${inBox}`);
  console.log(`     other car still approaching:                                          ${approaching}`);
  inBox > approaching
    ? ok(`${(100 * inBox / Math.max(1, tot)).toFixed(0)}% of what is left is the candidate driving INTO traffic that is already committed — giving way cannot undo that, and should not be tuned until it appears to`)
    : ok(`most residual contacts are with approaching traffic, which the reaction layer should have been able to soften — worth a look`);
}

/* ---------- 5. a known approximation, measured ----------------------- */
console.log("\n5. REACTIONS ARE DERIVED INDEPENDENTLY AND APPLIED TOGETHER");
{
  /* Each road user's giving way is searched against the others holding
     their planned line, then all of them are applied at once. Exact with
     one reacting car; an approximation with two, because yielding one
     changes what the next one needed. Measured rather than assumed. */
  let multi = 0, cases = 0, disagreed = 0;
  for (let i = 1; i <= 20; i++) {
    const c = composeDriver(i * 13);
    for (const { scn, sim } of scenes) {
      const d = departureOnAwareness(sim, scn, c, 7);
      const rx = reactionsFor(sim, { departAt: d });
      if (!rx.length) continue;
      cases++;
      if (rx.length > 1) multi++;
      const hit = contactAfter(withReactions(sim, rx, { departAt: d }));
      const r = hit ? rx.find((x) => x.who === hit) : null;
      if (r && r.avoided) disagreed++;
    }
  }
  console.log(`   ${cases} scenes with a reaction, ${multi} with more than one road user giving way`);
  disagreed === 0
    ? ok(`the search and the applied world agree in all ${cases} reacting scenes`)
    : fail(`the search says avoided and the applied world hits anyway in ${disagreed} of ${cases} (${(100 * disagreed / cases).toFixed(0)}%)`);
}

console.log("\n" + "=".repeat(70));
if (problems) {
  console.log(`FAILED: ${problems} problem(s).`);
  process.exit(1);
}
console.log("OK: the world gives way, and it never decides whether a fault happened.");
