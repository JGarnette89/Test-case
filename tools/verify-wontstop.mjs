/* =====================================================================
   WONTSTOP VERIFICATION
   Run:  node tools/verify-wontstop.mjs

   "wontstop" is the first scenario where the road is legally the ego's
   the moment it arrives, and going anyway still meets a car. The other
   driver has no right of way — turning left across oncoming straight
   traffic yields, always — but it never planned to stop for its sign at
   all, so being legally correct is not enough.

   That is only fair to ask if the player has something to actually
   read, the same bar every other tell in this game has to clear
   (compare verify-roundabout.mjs's exit tell): readable before the
   decision, and worth real seconds if you read it. Checked here, not
   asserted. And checked separately: that safeAt — the field this
   scenario is the reason for — changes nothing anywhere else, and that
   the extended window it grants is actually safe across the whole
   stretch the scorer will call good, at every depth of PULL UP too.
   ===================================================================== */
import { simulate, poseAt, conflicts, spanOf, safeAtFor, STEP } from "../src/engine/index.js";
import { SCENARIOS } from "../src/engine/scenarios.js";
import { GRACE } from "../src/engine/score.js";
import { PULL_STEP } from "../src/engine/sight.js";

const r2 = (n) => Math.round(n * 100) / 100;
let problems = 0;
const fail = (m) => { problems++; console.log(`  FAIL: ${m}`); };
const ok = (m) => console.log(`  ok   ${m}`);

const scn = SCENARIOS.find((s) => s.id === "wontstop");
if (!scn) { console.log("FAIL: wontstop is not in SCENARIOS"); process.exit(1); }
const sim = simulate(scn);
const legalAt = sim.legalAt;
const safeAt = safeAtFor(sim);
const offender = sim.actors[0];

/* ---------- 1. safeAt changes nothing anywhere else -----------------
   Two rulings, not bugs: sleeper and creeper each carry a PRIOR that
   dawdles (slowStart, and creeper's creep+overshoot on top of it) —
   already accounted for in legalAt itself. What safeAt adds on top is
   creep, which legalAt never considered at all: the ego creeping
   forward can reach into where that slow prior is still lingering, by
   exactly one STEP (0.05s) in both cases. Genuine, small, and correctly
   caught — not something wontstop should be blamed for by being the
   only scenario checked here. */
console.log("\n1. SAFEAT IS A NO-OP EVERYWHERE ELSE");
{
  const KNOWN = { sleeper: 2.9, creeper: 3.0 };
  let diffs = 0;
  for (const s of SCENARIOS) {
    if (s.id === "wontstop") continue;
    const ssim = simulate(s);
    const ssafe = safeAtFor(ssim);
    if (s.id in KNOWN) {
      ssafe === KNOWN[s.id]
        ? ok(`${s.id}: safeAt ${ssafe} — known, a slow prior plus creep, not this scenario's doing`)
        : fail(`${s.id}: expected the known safeAt of ${KNOWN[s.id]}, got ${ssafe} — investigate before trusting this`);
      continue;
    }
    if (ssafe !== ssim.legalAt) {
      diffs++;
      fail(`${s.id}: safeAt (${ssafe}) diverged from legalAt (${ssim.legalAt}) with no reason to`);
    }
  }
  diffs === 0
    ? ok(`safeAt equals legalAt for the remaining ${SCENARIOS.length - 1 - Object.keys(KNOWN).length} scenarios`)
    : null;
}

/* ---------- 2. the tell is readable before the decision ------------
   The player's naive decision point is legalAt: the road reads as
   legally theirs then, and nothing about the SIGN says otherwise. What
   has to be readable by then is that this car is not slowing down —
   compared against a twin that obeys its sign, built from the same
   scenario with only `stops` flipped, so the comparison is apples to
   apples and not two different cars. */
console.log("\n2. THE TELL IS READABLE BEFORE THE DECISION");
{
  const control = { ...scn, actors: [{ ...scn.actors[0], stops: true }] };
  const csim = simulate(control);
  const cOffender = csim.actors[0];

  const speedAt = (p, t, dt = 0.05) => {
    const a = poseAt(p, t), b = poseAt(p, t + dt);
    return Math.hypot(b.x - a.x, b.y - a.y) / dt / 20; // m/s
  };

  // Constant speed the whole approach, not just at the very end — this
  // car was never going to brake, and that has to be visible for as
  // long as it is visible, not sprung at the last instant.
  const samples = [];
  for (let t = 0.1; t <= legalAt; t += 0.2) samples.push(speedAt(offender, t));
  const spread = Math.max(...samples) - Math.min(...samples);
  spread < 0.5
    ? ok(`speed holds within ${r2(spread)} m/s across the whole approach up to legalAt — no braking curve to miss`)
    : fail(`speed varies by ${r2(spread)} m/s before legalAt — the tell is not steady`);

  // And it has to actually differ from a car that IS braking, at a point
  // well before the decision — not just in the final instant.
  const readAt = legalAt - 0.5;
  const gap = speedAt(offender, readAt) - speedAt(cOffender, readAt);
  gap > 3
    ? ok(`at ${r2(legalAt - readAt)}s before the decision, the non-yielder is ${r2(gap)} m/s faster than a braking twin at the same point`)
    : fail(`speed gap at ${readAt} is only ${r2(gap)} m/s — too subtle to read in time`);
}

/* ---------- 3. the tell is worth reading ---------- */
console.log("\n3. THE TELL IS WORTH READING");
{
  legalAt < safeAt
    ? ok(`legally yours at ${legalAt}s, actually safe at ${safeAt}s — a real gap, not a rounding artefact`)
    : fail("legalAt and safeAt do not differ — there is nothing here to read");

  const collidesAt = (T) => {
    const ego = { ...sim.ego, departAt: T };
    for (let t = T; t <= T + spanOf(ego) + 0.35; t += STEP) {
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
  // Somewhere in the gap, not necessarily at legalAt itself — the danger
  // zone can start a little after the window opens, once the offender
  // has actually closed in.
  let hitsSomewhere = false;
  for (let d = legalAt; d < safeAt; d = r2(d + STEP)) {
    if (collidesAt(d)) { hitsSomewhere = true; break; }
  }
  hitsSomewhere
    ? ok("something inside [legalAt, safeAt) genuinely collides — reading only the sign is not enough")
    : fail("nothing between legalAt and safeAt collides — the scenario is not testing what it claims to");
  !collidesAt(safeAt)
    ? ok("departing on safeAt does not")
    : fail("safeAt is not actually safe");

  /* Checked, and worth recording rather than assuming: a twin that DOES
     stop for its sign does NOT collapse this gap back to zero (its own
     safeAt lands later still, at 3.4s here) — a queued car's schedule is
     built assuming the ego leaves at legalAt too, so a merely dawdling
     ego can still meet a perfectly law-abiding driver. That is real, and
     it is why sleeper and creeper have their own small gaps above.
     What stops:false is actually for is fairness, not causing the gap:
     a car that behaves like this without ever slowing is the only
     version a player has any chance of reading in time — a twin that
     obeys its sign right up until it doesn't would be indistinguishable
     from every other car on the board, which is a trap, not a lesson. */
  const control = { ...scn, actors: [{ ...scn.actors[0], stops: true }] };
  const csafe = safeAtFor(simulate(control));
  csafe >= safeAt
    ? ok(`a stopping twin's own safeAt (${csafe}) is no smaller than wontstop's (${safeAt}) — the gap here is not manufactured by the failure to yield alone`)
    : fail(`a stopping twin needs LESS caution (${csafe}) than the non-yielder (${safeAt}) — that would be backwards`);
}

/* ---------- 4. the extended window is actually safe -----------------
   Same bar as generate.js and compose.js hold generated content to:
   safe for the whole GRACE stretch, and at every depth of PULL UP,
   because encroaches() only ever watches priors and this car is not
   one. Checked at finer resolution than the engine's own STEP, for the
   same reason earliestSafe itself does — see its comment in index.js. */
console.log("\n4. THE EXTENDED WINDOW IS ACTUALLY SAFE");
{
  const collidesCreeping = (T, steps) => {
    const ego = { ...sim.ego, departAt: T, stopBias: (sim.ego.stopBias || 0) + steps * PULL_STEP };
    for (let t = T; t <= T + spanOf(ego) + 0.35; t += STEP / 2) {
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
  let unsafe = 0;
  for (let steps = 0; steps <= 8; steps++) {
    for (let d = safeAt; d <= safeAt + GRACE + 1e-9; d += STEP) {
      if (collidesCreeping(d, steps)) { unsafe++; fail(`steps=${steps} depart=${r2(d)}: collides inside the graded window`); }
    }
  }
  unsafe === 0
    ? ok(`safe across [safeAt, safeAt+${GRACE}] at every creep depth from 0 to 8, checked at ${STEP / 2}s resolution`)
    : null;
}

console.log("\n" + "=".repeat(66));
console.log(problems === 0 ? "OK: wontstop verified." : `${problems} PROBLEM(S) FOUND.`);
process.exit(problems === 0 ? 0 : 1);
