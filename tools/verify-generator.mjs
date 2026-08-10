/* =====================================================================
   GENERATOR VERIFICATION
   Run:  node tools/verify-generator.mjs [count]

   A generator that authors timings is exactly what CLAUDE.md says must be
   checked numerically. The properties that matter:

   1. Deterministic. The same seed is the same situation, or a daily
      challenge is not the same challenge for two people.
   2. The promised window is safe. Departing at legalAt must never collide.
      This is the generator auditing the engine's own answer.
   3. The window means something. Where the engine says to wait, going the
      instant you arrive must actually be wrong.
   4. Inside its stated bounds, and playable within the clock.
   5. The spread is worth playing — not all trivial, not all brutal, and
      not rejecting so many draws that tuning is broken.
   ===================================================================== */
import { simulate, poseAt, conflicts, CROSS, STEP } from "../src/engine/index.js";
import { grade, EARLY_TOLERANCE } from "../src/engine/score.js";
import {
  drawScenario, generateScenario, generateBatch, dailyScenario, dayIndex, ACCEPT,
} from "../src/engine/generate.js";

const N = Number(process.argv[2] || 400);
const r2 = (n) => Math.round(n * 100) / 100;
let problems = 0;
const fail = (m) => { problems++; console.log(`  FAIL: ${m}`); };
const ok = (m) => console.log(`  ok   ${m}`);

function collidesAt(sim, T) {
  const ego = { ...sim.ego, departAt: T };
  for (let t = T; t <= T + CROSS[ego.intent] + 0.3; t += STEP) {
    const mine = poseAt(ego, t);
    if (mine.gone) break;
    for (const a of sim.actors) {
      const theirs = poseAt(a, t);
      if (theirs.gone || theirs.hidden) continue;
      if (conflicts(ego, mine, a, theirs, 0, 0, 0, "crash")) return true;
    }
  }
  return false;
}

/* ---------- 1. determinism ---------- */
console.log("\n1. DETERMINISM");
{
  const a = JSON.stringify(generateScenario(12345));
  const b = JSON.stringify(generateScenario(12345));
  a === b ? ok("same seed, identical scenario") : fail("same seed produced different scenarios");

  const c = JSON.stringify(generateScenario(12346));
  a !== c ? ok("neighbouring seeds differ") : fail("consecutive seeds produced the same scenario");

  const fixed = Date.UTC(2026, 5, 12, 9, 30);
  const d1 = JSON.stringify(dailyScenario(fixed));
  const d2 = JSON.stringify(dailyScenario(fixed + 3600_000));
  d1 === d2 ? ok(`the daily is stable across a day (day ${dayIndex(fixed)})`) : fail("the daily changed within the same day");
  const d3 = JSON.stringify(dailyScenario(fixed + 86400_000));
  d1 !== d3 ? ok("the next day is a different situation") : fail("consecutive days are identical");
}

/* ---------- 2..4 properties over a large batch ---------- */
console.log(`\n2. PROPERTIES OVER ${N} GENERATED SCENARIOS`);
const batch = generateBatch(1, N);
if (batch.length < N) fail(`only ${batch.length}/${N} seeds produced a scenario`);

let unsafeWindow = 0, freeRide = 0, outOfBounds = 0, shortClock = 0, noDescription = 0;
const thinks = [], diffs = { 1: 0, 2: 0, 3: 0, 4: 0 };
let naiveFails = 0, withTraits = 0;

for (const scn of batch) {
  const sim = simulate(scn);

  // The window the engine derived must be safe to take.
  if (collidesAt(sim, sim.legalAt)) { unsafeWindow++; continue; }

  // Where it says wait, going immediately must actually be a fault. The
  // threshold is the scorer's own tolerance: below that, "waiting" is not
  // something the game can either perceive or punish.
  const think = sim.legalAt - scn.ego.arriveAt;
  if (think > EARLY_TOLERANCE) {
    const naive = grade({ legalAt: sim.legalAt, pressedAt: scn.ego.arriveAt });
    if (naive.verdict === "early") naiveFails++;
    else freeRide++;
  }

  if (think > ACCEPT.maxThink + 1e-9 || sim.legalAt > ACCEPT.maxLegalAt + 1e-9) outOfBounds++;
  if (scn.duration < sim.legalAt + 1.0) shortClock++;
  if (!scn.brief || !scn.lesson) noDescription++;

  thinks.push(think);
  diffs[scn.difficulty] = (diffs[scn.difficulty] || 0) + 1;
  if (scn.derived.traits.length) withTraits++;
}

unsafeWindow === 0
  ? ok("every derived window is safe to depart on")
  : fail(`${unsafeWindow} scenario(s) collide when departing exactly on the window`);
outOfBounds === 0 ? ok("all inside the stated acceptance bounds") : fail(`${outOfBounds} outside ACCEPT bounds`);
shortClock === 0 ? ok("every scenario has clock left after its window opens") : fail(`${shortClock} would run out of time`);
noDescription === 0 ? ok("every scenario carries a brief and an explanation") : fail(`${noDescription} missing description`);
freeRide === 0
  ? ok("where the engine says wait, going on arrival is always a fault")
  : fail(`${freeRide} scenario(s) say wait but going immediately is not penalised`);

/* ---------- 5. is the spread worth playing ---------- */
console.log("\n3. SPREAD");
thinks.sort((a, b) => a - b);
const q = (p) => r2(thinks[Math.floor(p * (thinks.length - 1))]);
console.log(`  think time   min ${q(0)}  p25 ${q(0.25)}  median ${q(0.5)}  p75 ${q(0.75)}  max ${q(1)}`);
console.log(`  difficulty   1:${diffs[1]}  2:${diffs[2]}  3:${diffs[3]}  4:${diffs[4]}`);
console.log(`  with traits  ${withTraits} of ${batch.length} (${Math.round((withTraits / batch.length) * 100)}%)`);
console.log(`  must wait    ${naiveFails} of ${batch.length} (${Math.round((naiveFails / batch.length) * 100)}%)`);

const immediate = thinks.filter((t) => t <= STEP).length;
const shareImmediate = immediate / thinks.length;
if (shareImmediate > 0.85) fail(`${Math.round(shareImmediate * 100)}% open immediately — barely any judgment required`);
else if (shareImmediate < 0.02) fail("almost nothing opens immediately — the 'do not wait for an empty box' lesson never appears");
else ok(`${Math.round(shareImmediate * 100)}% open the moment you arrive, the rest make you wait`);

const usedDifficulties = Object.values(diffs).filter((c) => c > 0).length;
usedDifficulties >= 3 ? ok(`${usedDifficulties} difficulty bands in use`) : fail(`only ${usedDifficulties} difficulty band(s) produced`);

/* ---------- 6. rejection rate ---------- */
console.log("\n4. REJECTION RATE");
let drawn = 0, kept = 0;
for (let s = 0; s < 600; s++) { drawn++; if (drawScenario((s * 2654435761) >>> 0)) kept++; }
const keepRate = kept / drawn;
console.log(`  ${kept} of ${drawn} raw draws accepted (${Math.round(keepRate * 100)}%)`);
if (keepRate < 0.05) fail("under 5% of draws survive — the sampler and the filters disagree");
else ok("acceptance rate is workable");

console.log("\n" + "=".repeat(66));
console.log(problems === 0 ? "OK: generator verified." : `${problems} PROBLEM(S) FOUND.`);
process.exit(problems === 0 ? 0 : 1);
