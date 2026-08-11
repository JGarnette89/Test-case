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
  simulate, poseAt, conflicts, spanOf, raPath,
  CX, CY, RA_LANE, RA_OUTER, RA_ISLAND, RA_SPEED, STEP, M,
} from "../src/engine/index.js";
import { SCENARIOS } from "../src/engine/scenarios.js";

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

/* ---------- 3. constant speed round the circle ---------- */
console.log("\n3. SPEED IS HONEST");
{
  const car = sim.actors[0];
  const speeds = [];
  for (let t = car.departAt + 0.2; t < car.departAt + spanOf(car) - 0.2; t += 0.1) {
    const a = poseAt(car, t), b = poseAt(car, t + 0.05);
    speeds.push(Math.hypot(b.x - a.x, b.y - a.y) / 0.05);
  }
  const min = Math.min(...speeds), max = Math.max(...speeds);
  const drift = (max - min) / RA_SPEED;
  drift < 0.12
    ? ok(`speed holds within ${Math.round(drift * 100)}% of ${r2(RA_SPEED / 20)} m/s along the whole path`)
    : fail(`speed varies by ${Math.round(drift * 100)}% (${r2(min / 20)}-${r2(max / 20)} m/s) — forwardClaim would lie`);
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

/* ---------- 6. the cross layout is untouched ---------- */
console.log("\n6. NO REGRESSION IN THE CROSS LAYOUT");
{
  const expected = {
    opposite: 2.4, signalled: 1.6, liar: 2.55, silent: 2.75, gap: 5.4,
    walker: 4.05, wanderer: 2.2, sleeper: 2.9, creeper: 3, lateflag: 2.65,
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
