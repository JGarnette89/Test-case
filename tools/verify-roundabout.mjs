/* =====================================================================
   ROUNDABOUT VERIFICATION
   Run:  node tools/verify-roundabout.mjs

   A roundabout that looks right and circulates the wrong way is entirely
   plausible on screen, so the direction of travel gets checked as a number
   before anything is drawn.

   Ontario drives on the right: traffic goes round counterclockwise, and a
   vehicle entering yields to whoever is already circulating — who reaches
   it from the left. Entering never outranks circulating.
   ===================================================================== */
import {
  simulate, poseAt, conflicts, spanOf, raPath, movementOf,
  CX, CY, RA_LANE, RA_OUTER, RA_ISLAND, RA_SPEED, STEP, M,
} from "../src/engine/index.js";
import { timeToCover } from "../src/engine/paths.js";
import { SCENARIOS } from "../src/engine/scenarios.js";

/* When a car reaches a given distance along its own path. Was
   `distance / RA_SPEED`, which only held while everything moved at a
   constant speed from the first instant. A car now accelerates away from
   the give-way line, so it reaches any given point LATER than that
   division claimed — and a test that looked at the wrong moment reported
   the exit tell missing when it was simply not there yet. */
const timeAtDistance = (p, d) => timeToCover(movementOf(p).traverse.profile, d);

const r2 = (n) => Math.round(n * 100) / 100;
let problems = 0;
const fail = (m) => { problems++; console.log(`  FAIL: ${m}`); };
const ok = (m) => console.log(`  ok   ${m}`);

const scn = SCENARIOS.find((s) => s.id === "circle");
if (!scn) { console.log("no roundabout scenario found"); process.exit(1); }
const sim = simulate(scn);

/* ---------- 1. which way does it go ---------- */
console.log("\n1. DIRECTION OF TRAVEL");
{
  const car = sim.actors[0];
  const samples = [];
  for (let t = car.departAt + 0.3; t < car.departAt + spanOf(car) - 0.3; t += 0.2) {
    const q = poseAt(car, t);
    const r = Math.hypot(q.x - CX, q.y - CY);
    if (Math.abs(r - RA_LANE) > M(0.8)) continue; // only while actually circulating
    samples.push(Math.atan2(q.y - CY, q.x - CX));
  }
  if (samples.length < 4) fail("too few circulating samples to judge direction");
  else {
    // Unwrap and check the angle consistently decreases (counterclockwise
    // on a y-down screen).
    let decreasing = 0, increasing = 0;
    for (let i = 1; i < samples.length; i++) {
      let d = samples[i] - samples[i - 1];
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      if (d < 0) decreasing++; else if (d > 0) increasing++;
    }
    decreasing > 0 && increasing === 0
      ? ok(`circulates counterclockwise throughout (${decreasing} samples, none reversed)`)
      : fail(`direction is not consistent: ${decreasing} counterclockwise, ${increasing} clockwise`);
  }
}

/* ---------- 2. nobody drives over the island ---------- */
console.log("\n2. THE ISLAND IS SOLID");
{
  let worst = Infinity, at = null;
  for (const p of [sim.ego, ...sim.actors]) {
    for (let t = p.departAt; t < p.departAt + spanOf(p); t += 0.05) {
      const q = poseAt(p, t);
      const r = Math.hypot(q.x - CX, q.y - CY);
      if (r < worst) { worst = r; at = p.id; }
    }
  }
  worst >= RA_ISLAND
    ? ok(`closest approach to the island centre is ${r2(worst / 20)}m, island radius ${r2(RA_ISLAND / 20)}m (${at})`)
    : fail(`${at} cuts across the island: ${r2(worst / 20)}m from centre, island is ${r2(RA_ISLAND / 20)}m`);
}

/* ---------- 3. speed round the circle ----------
   A car pulling away from the give-way line accelerates, so the whole
   path is NOT one speed and should not be — that was the old fixed-time
   model, where a stopped car appeared in the circle already doing 25
   km/h. What still has to hold is that the CIRCULATING stretch is
   uniform: forwardClaim reads speed to size a claim, so a path that
   secretly sped up or slowed through the arc would claim road it has no
   business claiming. Checked from the moment the car is up to speed. */
console.log("\n3. SPEED IS HONEST");
{
  const car = sim.actors[0];
  const upToSpeed = car.departAt + timeAtDistance(car, 0) + RA_SPEED / (M(2.4)); // v/a
  const speeds = [];
  for (let t = upToSpeed + 0.2; t < car.departAt + spanOf(car) - 0.2; t += 0.1) {
    const a = poseAt(car, t), b = poseAt(car, t + 0.05);
    speeds.push(Math.hypot(b.x - a.x, b.y - a.y) / 0.05);
  }
  const min = Math.min(...speeds), max = Math.max(...speeds);
  const drift = (max - min) / RA_SPEED;
  drift < 0.12
    ? ok(`once up to speed it holds within ${Math.round(drift * 100)}% of ${r2(RA_SPEED / 20)} m/s round the circle`)
    : fail(`speed varies by ${Math.round(drift * 100)}% (${r2(min / 20)}-${r2(max / 20)} m/s) — forwardClaim would lie`);

  // And the ramp itself is real: it must start from a standstill.
  const offLine = poseAt(car, car.departAt + 0.02), soon = poseAt(car, car.departAt + 0.07);
  const v0 = Math.hypot(soon.x - offLine.x, soon.y - offLine.y) / 0.05;
  v0 < RA_SPEED * 0.35
    ? ok(`it leaves the give-way line from rest (${r2(v0 / 20)} m/s just after departing, not ${r2(RA_SPEED / 20)})`)
    : fail(`it is already doing ${r2(v0 / 20)} m/s the instant it departs — that is not a standing start`);
}

/* ---------- 4. exits land on the right leg ---------- */
console.log("\n4. EXITS");
{
  const sideOf = (q) => {
    const dx = q.x - CX, dy = q.y - CY;
    if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? "E" : "W";
    return dy > 0 ? "S" : "N";
  };
  // From the south: first exit east, second north, third west.
  const want = { right: "E", straight: "N", left: "W" };
  for (const intent of ["right", "straight", "left"]) {
    const probe = { from: "S", intent, arriveAt: 0, departAt: 0, stops: true, kind: "car", layout: "roundabout" };
    const end = poseAt(probe, spanOf(probe) + 0.5);
    const got = sideOf(end);
    got === want[intent]
      ? ok(`from the south, ${intent.padEnd(8)} leaves to the ${want[intent]}`)
      : fail(`from the south, ${intent} left to the ${got}, expected ${want[intent]}`);
  }
}

/* ---------- 5. the rule: circulating outranks entering ---------- */
console.log("\n5. PRIORITY");
{
  const inCircle = sim.priors.some((a) => a.id === "w");
  inCircle
    ? ok("the circulating car outranks the ego waiting to enter")
    : fail("the car already going round did not take priority over the ego");

  const think = r2(sim.legalAt - scn.ego.arriveAt);
  console.log(`  ego arrives ${scn.ego.arriveAt}, window opens ${sim.legalAt} (waits ${think}s)`);
  think > 0
    ? ok("the ego actually has to give way")
    : fail("the ego never had to yield — the scenario teaches nothing");

  // And the window it derives has to be safe to take.
  const ego = { ...sim.ego, departAt: sim.legalAt };
  let crash = false;
  for (let t = sim.legalAt; t < sim.legalAt + spanOf(ego); t += STEP) {
    const mine = poseAt(ego, t);
    if (mine.gone) break;
    for (const a of sim.actors) {
      const theirs = poseAt(a, t);
      if (theirs.gone || theirs.hidden) continue;
      if (conflicts(ego, mine, a, theirs, 0, 0, 0, "crash")) crash = true;
    }
  }
  crash ? fail("departing on the derived window collides") : ok("departing on the window does not collide");

  // Going the instant you arrive must be wrong, or there is no lesson.
  const early = { ...sim.ego, departAt: scn.ego.arriveAt };
  let earlyCrash = false;
  for (let t = scn.ego.arriveAt; t < scn.ego.arriveAt + spanOf(early); t += STEP) {
    const mine = poseAt(early, t);
    if (mine.gone) break;
    for (const a of sim.actors) {
      const theirs = poseAt(a, t);
      if (theirs.gone || theirs.hidden) continue;
      if (conflicts(early, mine, a, theirs, 0, 0, 0, "crash")) earlyCrash = true;
    }
  }
  earlyCrash
    ? ok("entering on arrival would have hit the circulating car")
    : console.log("  note: entering on arrival does not collide, only breaches the yield envelope");
}

/* ---------- 6. the exit tell ----------
   Signalling out of a roundabout is best practice, not common practice, so
   the line has to carry the information instead. A car about to leave must
   be distinguishable from one staying in, by position alone, before the
   player has to commit. If it is not, the scenario is a coin toss.        */
console.log("\n6. THE EXIT TELL IS READABLE WITHOUT AN INDICATOR");
{
  /* From the north the west leg is the exit before the ego's. A car taking
     it is gone before it ever reaches the ego; one staying in comes all the
     way round and across the entry. At the moment it matters both are in
     the same place — only the line differs, which is exactly the test. */
  const mk = (intent) => ({
    from: "N", intent, arriveAt: 0, departAt: 0, stops: true,
    kind: "car", layout: "roundabout", signal: null,
  });
  const leaving = mk("right"); // gone at the west exit
  const staying = mk("left");  // all the way round to the ego's leg

  const radiusAt = (p, t) => {
    const q = poseAt(p, t);
    return Math.hypot(q.x - CX, q.y - CY);
  };

  // Walk the stretch where both are still circulating and compare lines.
  const peel = timeAtDistance(leaving, raPath(leaving).peelDist);
  // The tell is worthless if it appears after the player has had to commit.
  const decideAt = SCENARIOS.find((s) => s.id === "circle-leaving").ego.arriveAt;
  let separated = 0, samples = 0, maxGap = 0, firstTellAt = null;
  for (let t = 0.4; t < peel; t += 0.05) {
    const a = radiusAt(leaving, t), b = radiusAt(staying, t);
    // Only the circulating arc. M(3) was loose enough to admit the
    // entry curve, which sits outside the carriageway by design —
    // harmless while a constant speed put t=0.4 past it, wrong now
    // that a car accelerating from the give-way line is still on it.
    if (Math.abs(a - RA_LANE) > M(1.5) || Math.abs(b - RA_LANE) > M(1.5)) continue;
    samples++;
    const gap = a - b;
    if (gap > maxGap) maxGap = gap;
    if (gap > M(0.25)) {
      separated++;
      if (firstTellAt == null) firstTellAt = t;
    }
  }

  console.log(`  peel-off at ${r2(peel)}s; lines differ on ${separated} of ${samples} circulating samples`);
  console.log(`  widest separation ${r2(maxGap / 20)}m, first readable at ${firstTellAt == null ? "never" : r2(firstTellAt) + "s"}`);

  if (maxGap <= M(0.25)) fail("a leaving car and a staying car take the same line — nothing to read");
  else if (firstTellAt == null) fail("the drift never becomes readable");
  else {
    const warning = peel - firstTellAt;
    warning >= 0.6
      ? ok(`the drift is readable ${r2(warning)}s before it peels off`)
      : fail(`only ${r2(warning)}s of warning — not enough to act on`);

    // Readable in the scenario, not just in principle: the drift has to be
    // on screen before the ego reaches its give-way line and must decide.
    const offset = SCENARIOS.find((s) => s.id === "circle-leaving").actors[0].arriveAt;
    const tellShowsAt = offset + firstTellAt;
    tellShowsAt <= decideAt
      ? ok(`in circle-leaving the drift shows at ${r2(tellShowsAt)}s, ${r2(decideAt - tellShowsAt)}s before the ego must decide`)
      : fail(`the drift shows at ${r2(tellShowsAt)}s but the ego decides at ${decideAt}s — unreadable in time`);
  }

  // The drift must stay on the carriageway rather than clipping the kerb.
  // Only while circulating: the approach and the exit are outside by design.
  let worstOut = 0;
  for (let t = 0.4; t < peel; t += 0.05) {
    const r = radiusAt(leaving, t);
    if (Math.abs(r - RA_LANE) > M(1.5)) continue;
    worstOut = Math.max(worstOut, r);
  }
  worstOut <= RA_OUTER
    ? ok(`the drift stays inside the carriageway (${r2(worstOut / 20)}m of ${r2(RA_OUTER / 20)}m)`)
    : fail(`drifts outside the roundabout: ${r2(worstOut / 20)}m past a ${r2(RA_OUTER / 20)}m edge`);

  /* And it must change the answer, or it is decoration. Controlled: the
     same scenario, the same arrival times, only the exit differs. */
  const base = SCENARIOS.find((s) => s.id === "circle-leaving");
  const variant = (intent) => simulate({
    ...base,
    ego: { ...base.ego },
    actors: base.actors.map((a) => ({ ...a, intent })),
  }).legalAt;
  const gone = variant("right"); // gone at the west exit
  const stays = variant("left");  // all the way round to the ego's leg
  console.log(`  window when it leaves: ${gone}   when it stays in: ${stays}`);
  const gain = r2(stays - gone);
  gain >= 0.5
    ? ok(`reading the tell is worth ${gain}s`)
    : fail(`reading it gains only ${gain}s — not worth reading`);
}

/* ---------- 7. the cross layout is untouched ---------- */
console.log("\n7. NO REGRESSION IN THE CROSS LAYOUT");
{
  /* Baseline re-derived when traversal stopped being a fixed time per
     manoeuvre and became a real motion profile — cars accelerate away
     from a stop instead of leaving the line at 72 km/h, and a wider road
     now takes longer to cross rather than being driven faster. Every one
     of these moved because every footprint moved; that was the point.
     Update deliberately and only alongside a change meant to move them. */
  const expected = {
    opposite: 4.15, signalled: 1.6, liar: 5.6, silent: 5.8, gap: 4.25,
    walker: 5.35, wanderer: 1.65, sleeper: 3.85, creeper: 3.65, lateflag: 5.7,
  };
  let bad = 0;
  for (const [id, want] of Object.entries(expected)) {
    const s = SCENARIOS.find((x) => x.id === id);
    const got = simulate(s).legalAt;
    if (Math.abs(got - want) > 1e-9) { bad++; fail(`${id}: window moved ${want} -> ${got}`); }
  }
  if (bad === 0) ok("all ten cross-layout windows unchanged");
}

console.log("\n" + "=".repeat(66));
console.log(problems === 0 ? "OK: roundabout verified." : `${problems} PROBLEM(S) FOUND.`);
process.exit(problems === 0 ? 0 : 1);
