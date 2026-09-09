/* Detection scoring: grading the examiner.
 *
 * Property-based on purpose. Restating the formula back at itself would
 * prove nothing, so what is checked here is the behaviour the design
 * claims — the things that would have to be true of ANY correct
 * implementation of "precision and recall with a clock on it":
 *
 *   - marking everything must lose, or the game is a button-masher
 *   - marking nothing must lose, or watching is optional
 *   - a fault you could not see must not count against you
 *   - more correct calls must never score worse
 *   - prompt must beat late, and late must beat silent
 */
import {
  scoreDetection, promptness, callWindow, summarise,
  SHOWN_ENOUGH, CALL_GRACE, FALSE_COST, LATE_CREDIT,
} from "../src/engine/detect.js";
import { faultsIn, MIN_DURATION } from "../src/engine/faults.js";
import { REACTION_FLOOR } from "../src/engine/score.js";
import { sectionSheet } from "../src/engine/detect.js";
import {
  instructionWindow, runInFor, FOLLOW_LAG, pressureOf, loadCandidate, severityUnder,
} from "../src/engine/directions.js";
import { composeCandidate } from "../src/engine/candidate.js";
import { composeDriver } from "../src/engine/ratings.js";
import { planDrive, composeForTile, CHARACTER } from "../src/engine/tiles.js";
import { simulate, M } from "../src/engine/index.js";
import { approachDecel } from "../src/engine/paths.js";
import { SCENARIOS } from "../src/engine/scenarios.js";
import { readFileSync } from "node:fs";

let problems = 0;
const ok = (s) => console.log(`  ok   ${s}`);
const fail = (s) => { problems++; console.log(`  FAIL: ${s}`); };

/* A drive with real, derived faults on it to grade against. */
const base = SCENARIOS.find((s) => s.id === "creeper");
const faults = faultsIn(base);
const allShown = (f) => f.duration;
const mid = (f) => (f.from + f.to) / 2;

console.log(`Grading against ${faults.length} derived fault(s) in "${base.id}".`);

/* ---------- 1. the two ways to be a bad examiner -------------------- */
console.log("\n1. THE TWO WAYS TO GET IT WRONG BOTH LOSE");
{
  const perfect = scoreDetection({ faults, marks: faults.map((f) => ({ at: mid(f) })), shownFor: allShown });
  perfect.score === 100 && perfect.missed.length === 0 && perfect.invented.length === 0
    ? ok(`catching everything, promptly, scores ${perfect.score}`)
    : fail(`a perfect drive scored ${perfect.score} (${summarise(perfect)})`);

  const silent = scoreDetection({ faults, marks: [], shownFor: allShown });
  silent.score === 0 && silent.recall === 0
    ? ok("marking nothing scores 0 — watching is not optional")
    : fail(`marking nothing scored ${silent.score}`);

  /* The one that matters most: spraying marks must be worse than playing
     properly, or the dominant strategy is to hold the button down. */
  const spray = scoreDetection({
    faults,
    marks: Array.from({ length: 40 }, (_, i) => ({ at: i * 0.3 })),
    shownFor: allShown,
  });
  spray.score < perfect.score
    ? ok(`spraying 40 marks scores ${spray.score}, well under a real drive's ${perfect.score}`)
    : fail(`spraying scored ${spray.score} vs ${perfect.score} — marking everything is viable`);
  spray.precision < 0.5
    ? ok(`and it shows in precision (${spray.precision}), which is the number that exposes it`)
    : fail(`spraying kept precision at ${spray.precision}`);

  /* A single fault cannot be farmed by marking it repeatedly. */
  const f0 = faults[0];
  const farm = scoreDetection({
    faults: [f0],
    marks: [0, 0.1, 0.2, 0.3].map((d) => ({ at: mid(f0) + d })),
    shownFor: allShown,
  });
  farm.hits.length === 1 && farm.invented.length === 3
    ? ok("one fault pays once; the other three calls are recorded as invented")
    : fail(`repeat-marking one fault produced ${farm.hits.length} hits`);
}

/* ---------- 2. you are not marked for what you could not see -------- */
console.log("\n2. A FAULT YOU COULD NOT SEE IS NOT ONE YOU MISSED");
{
  const blind = scoreDetection({ faults, marks: [], shownFor: () => 0 });
  blind.unmarkable.length === faults.length && blind.missed.length === 0
    ? ok(`with everything hidden, all ${faults.length} faults report as unmarkable, none as missed`)
    : fail(`blind drive reported ${blind.missed.length} missed, ${blind.unmarkable.length} unmarkable`);
  blind.score === 100
    ? ok("and a drive where nothing was observable is a clean sheet, not a failure")
    : fail(`a drive with nothing visible scored ${blind.score}`);

  /* The boundary is a real one, not a formality. */
  const just = scoreDetection({ faults, marks: [], shownFor: () => SHOWN_ENOUGH + 0.01 });
  const under = scoreDetection({ faults, marks: [], shownFor: () => SHOWN_ENOUGH - 0.01 });
  just.missed.length > 0 && under.missed.length === 0
    ? ok(`the ${SHOWN_ENOUGH}s on-screen floor decides missed from unmarkable`)
    : fail("the sight threshold does not separate missed from unmarkable");

  /* Half-seen faults still count. Seeing most of something is seeing it. */
  const partial = scoreDetection({
    faults, marks: faults.map((f) => ({ at: mid(f) })), shownFor: () => SHOWN_ENOUGH * 2,
  });
  partial.score === 100
    ? ok("a fault briefly shown and called correctly still scores full")
    : fail(`a briefly-shown fault, called correctly, scored ${partial.score}`);
}

/* ---------- 2b. THE REGRESSION THIS RULE EXISTS FOR ----------------- */
console.log("\n2b. A BRIEF LOOK IS STILL A LOOK");
{
  /* Twice now this has been got wrong the same way: gating markability on
     a SHARE of the fault duration. First it was the share the player had
     in the view cone, which made every correct call an invention for
     anyone who looked around. Now the cone is gone and the temptation is
     to gate on the share of the fault the screen showed, which fails the
     same way: a fault shown for a fifth of its life was shown PLAINLY for
     that fifth, and telling the player they did not see it is the exact
     unfairness the redesign exists to remove.

     The rule is a duration. Was it ever on screen long enough to
     register? */
  const long = faults.find((f) => f.duration > 4) || faults[0];
  const glimpse = scoreDetection({
    faults: [long],
    marks: [{ at: mid(long) }],
    shownFor: () => SHOWN_ENOUGH,       // a fraction of a long fault
  });
  glimpse.hits.length === 1 && glimpse.invented.length === 0
    ? ok(`a ${long.duration}s fault shown for only ${SHOWN_ENOUGH}s is still markable, and calling it lands`)
    : fail(`a briefly shown fault scored ${glimpse.hits.length} hits -- the share rule has crept back`);

  const never = scoreDetection({
    faults: [long], marks: [{ at: mid(long) }], shownFor: () => 0,
  });
  never.hits.length === 0 && never.unmarkable.length === 1 && never.missed.length === 0
    ? ok("a fault the screen never showed is unmarkable, and calling it is not a catch")
    : fail(`a never-shown fault produced ${never.hits.length} hits, ${never.missed.length} missed`);

  /* And nothing anywhere may ask where within the screen the player was
     looking. If that argument comes back, so does the bug. */
  const src = readFileSync(new URL("../src/engine/detect.js", import.meta.url), "utf8");
  // Prose may discuss the cone as history; CODE may not read gaze.
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  /gaze|cone|lastSeenAt|LOOK_MEMORY/i.test(code)
    ? fail("detect.js code still reads gaze -- attention within the screen must not gate scoring")
    : ok("the scorer has no notion of where within the screen you were looking");
}

/* ---------- 3. prompt beats late beats silent ----------------------- */
console.log("\n3. PROMPT BEATS LATE, AND LATE BEATS SILENT");
{
  const f = faults[0];
  const w = callWindow(f);
  const early = promptness(f, w.opens - 0.01);
  const during = promptness(f, mid(f));
  const late = promptness(f, f.to + CALL_GRACE * 0.9);
  const after = promptness(f, w.closes + 0.01);

  early === 0 && after === 0
    ? ok("outside the window a call is worth nothing at either end")
    : fail(`window edges leak (${early} before, ${after} after)`);
  during === 1
    ? ok("calling it while it is happening is worth full marks")
    : fail(`a call during the fault scored ${during}`);
  late > LATE_CREDIT - 0.01 && late < during
    ? ok(`calling it on the way out still earns ${late.toFixed(2)}, down from ${during}`)
    : fail(`late credit is ${late}, expected between ${LATE_CREDIT} and ${during}`);

  const prompt = scoreDetection({ faults: [f], marks: [{ at: mid(f) }], shownFor: allShown });
  const tardy = scoreDetection({ faults: [f], marks: [{ at: f.to + CALL_GRACE * 0.9 }], shownFor: allShown });
  prompt.score > tardy.score && tardy.score > 0
    ? ok(`so a prompt drive beats a late one (${prompt.score} vs ${tardy.score}), and late still beats nothing`)
    : fail(`prompt ${prompt.score}, late ${tardy.score} — the ordering is wrong`);
}

/* ---------- 4. more right answers never score worse ----------------- */
console.log("\n4. CATCHING MORE IS NEVER WORSE");
{
  let monotone = true;
  const scores = [];
  for (let n = 0; n <= faults.length; n++) {
    const r = scoreDetection({
      faults, marks: faults.slice(0, n).map((f) => ({ at: mid(f) })), shownFor: allShown,
    });
    scores.push(r.score);
    if (n && r.score < scores[n - 1]) monotone = false;
  }
  monotone
    ? ok(`score rises with every extra fault caught: ${scores.join(" -> ")}`)
    : fail(`score went down when more faults were caught: ${scores.join(" -> ")}`);

  /* And an invented call always costs, whatever else you did. */
  const clean = scoreDetection({ faults, marks: faults.map((f) => ({ at: mid(f) })), shownFor: allShown });
  const plusOne = scoreDetection({
    faults, marks: [...faults.map((f) => ({ at: mid(f) })), { at: 13.7 }], shownFor: allShown,
  });
  plusOne.score < clean.score && plusOne.invented.length === 1
    ? ok(`one invented call on a perfect drive costs ${clean.score - plusOne.score} marks`)
    : fail(`inventing a fault cost ${clean.score - plusOne.score}`);
}

/* ---------- 5. categorised calls, if that is the design ------------- */
console.log("\n5. NAMING THE FAULT IS OPTIONAL, AND SCORED IF GIVEN");
{
  const f = faults[0];
  const right = scoreDetection({ faults: [f], marks: [{ at: mid(f), what: f.trait }], shownFor: allShown });
  const wrong = scoreDetection({ faults: [f], marks: [{ at: mid(f), what: "notAThing" }], shownFor: allShown });
  const untyped = scoreDetection({ faults: [f], marks: [{ at: mid(f) }], shownFor: allShown });

  right.hits.length === 1 && untyped.hits.length === 1
    ? ok("a call counts whether or not it names the fault")
    : fail("an uncategorised call did not register");
  wrong.hits.length === 0 && wrong.invented.length === 1
    ? ok("naming the wrong fault is an invented call, not a free hit")
    : fail(`a miscategorised call produced ${wrong.hits.length} hits`);
}

/* ---------- 6. it works on the situations that exist ---------------- */
console.log("\n6. ACROSS THE SHIPPED SET");
{
  let graded = 0, broke = 0;
  for (const scn of SCENARIOS) {
    if (scn.layout === "roundabout") continue;
    const fs = faultsIn(scn);
    const r = scoreDetection({ faults: fs, marks: fs.map((f) => ({ at: mid(f) })), shownFor: allShown });
    graded++;
    if (!(r.score >= 0 && r.score <= 100) || Number.isNaN(r.score)) { broke++; fail(`${scn.id}: score ${r.score}`); }
  }
  broke === 0 ? ok(`${graded} situations grade cleanly, faults or none`) : null;

  const empty = scoreDetection({ faults: [], marks: [], shownFor: allShown });
  empty.score === 100
    ? ok("a faultless drive, correctly left unmarked, is a clean sheet")
    : fail(`a drive with no faults scored ${empty.score}`);
}

/* ---------- 10. the loop: a section produces a sheet ---------------- */
console.log("\n10. THE LOOP: A DRIVE, A SECTION, AND A SHEET");
{
  /* The playable loop's core, out of the component so it can be checked
     at all — a React component is the one place in this project nothing
     could reach, which is how the examiner screen threw on mount for
     twenty increments. */
function driveFor(seed) {
  const PER_SECTION = 3;
  const APPROACH = M(11.5) / approachDecel(M(11.5));
  const cand = { ...composeCandidate(seed * 7 + 3), ...composeDriver(seed * 11) };
  const plan = planDrive({ seed, length: 6, candidate: cand });
  const legs = [], drawn = [];
  let since = 0;
  for (let i = 0; i < plan.length; i++) {
    const tile = plan[i].tile;
    const legTime = tile.runway / CHARACTER[tile.character].speed + 4;
    const { scn } = composeForTile(tile, since, (seed * 7919 + i * 104729) >>> 0, {
      legTime, candidate: cand, at: { from: plan[i].entry, intent: plan[i].intent },
    });
    if (!scn) continue;
    const sim = simulate(scn);
    drawn.push(scn);
    legs.push({
      faults: faultsIn(scn),
      window: instructionWindow(sim, { legStartsAt: -runInFor(sim, { floor: APPROACH }) }),
      intent: plan[i].intent,
    });
    since = faultsIn(scn).length ? 0 : since + legTime;
  }
  return { cand, legs, drawn, PER_SECTION };
}

/* A seed whose first section actually has something to mark. SEARCHED,
   not assumed: which scenes compose for a given seed moves whenever
   generation changes, and hardcoding one made this whole section a
   hostage to a draw nobody chose. */
const markableSeed = (() => {
  for (let s = 1; s <= 40; s++) {
    const d = driveFor(s);
    if (d.legs.slice(0, 3).some((l) => l.faults.some((f) => f.duration >= MIN_DURATION))) return s;
  }
  return 3;
})();

  const PER_SECTION = 3;
  const APPROACH = M(11.5) / approachDecel(M(11.5));
  const seed = markableSeed;
  const cand = { ...composeCandidate(seed * 7 + 3), ...composeDriver(seed * 11) };
  const plan = planDrive({ seed, length: 6, candidate: cand });
  const legs = [], drawn = [];
  let since = 0;
  for (let i = 0; i < plan.length; i++) {
    const tile = plan[i].tile;
    const legTime = tile.runway / CHARACTER[tile.character].speed + 4;
    const { scn } = composeForTile(tile, since, (seed * 7919 + i * 104729) >>> 0, {
      legTime, candidate: cand, at: { from: plan[i].entry, intent: plan[i].intent },
    });
    if (!scn) continue;
    const sim = simulate(scn);
    /* Each leg starts early enough for its OWN instruction. A fixed
       run-in cannot work: measured over 48 intersections the deadline runs
       from 4.50s before the line to 8.20s after, so one number leaves the
       demanding legs undirectable and makes the rest a wait. */
    drawn.push(scn);
    legs.push({
      faults: faultsIn(scn),
      window: instructionWindow(sim, { legStartsAt: -runInFor(sim, { floor: APPROACH }) }),
      intent: plan[i].intent,
    });
    since = faultsIn(scn).length ? 0 : since + legTime;
  }
  legs.length >= PER_SECTION
    ? ok(`a drive composes ${legs.length} intersections for one candidate, weak on ${cand.weakOn.join(" and ")}`)
    : fail(`only ${legs.length} intersections composed, not enough for a section`);

  /* EVERY INSTRUCTION HAS TO BE GIVEABLE. A window that never opens is a
     intersection the player is asked to direct and cannot — measured before
     the run-in existed, the window was 1.1s from a standing start, which
     is not a decision anybody can make. */
  /* The floor is FOLLOW_LAG rather than a number: if the candidate needs
     a second to act on an instruction, the examiner needs at least as
     long to decide on one. */
  const spanOf = (l) => l.window.deadline - l.window.opensAt;
  const tight = legs.filter((l) => !l.window.viable || spanOf(l) < FOLLOW_LAG);
  tight.length === 0
    ? ok(`every intersection gives at least FOLLOW_LAG (${FOLLOW_LAG}s) to direct — shortest ${Math.min(...legs.map(spanOf)).toFixed(1)}s, longest ${Math.max(...legs.map(spanOf)).toFixed(1)}s`)
    : fail(`${tight.length} intersection(s) cannot be directed in the time the leg gives`);

  const section = legs.slice(0, PER_SECTION);
  const shown = (f) => f.duration;               // a player who watched everything

  /* Marking nothing, marking everything, and marking well. The middle one
     must lose — that is the false-positive penalty doing its job, and it
     is what makes the sheet worth anything. */
  const perfect = [];
  section.forEach((leg, i) => {
    for (const f of leg.faults) {
      /* Marked as soon as anybody COULD: callWindow opens at
         REACTION_FLOOR, because nobody reacts to a visual cue faster.
         Calling at +0.1 scored zero on every fault and the "perfect"
         player only ever hit by accident. */
      if (f.duration >= MIN_DURATION) perfect.push({ at: f.from + REACTION_FLOOR + 0.05, intersection: i });
    }
  });
  const spray = [];
  for (let i = 0; i < PER_SECTION; i++) for (let k = 0; k < 12; k++) spray.push({ at: k * 0.8, intersection: i });

  const given = {};
  section.forEach((leg, i) => { given[i] = { at: leg.window.deadline - 0.3, intent: leg.intent }; });

  const sheetOf = (marks, g = given) => sectionSheet({ legs: section, marks, given: g, shownFor: shown });
  const good = sheetOf(perfect), none = sheetOf([]), all = sheetOf(spray);
  console.log(`\n   marking well ${good.result.score} · marking nothing ${none.result.score} · marking everything ${all.result.score}`);
  /* Only meaningful where there was something to mark. A section that
     produced nothing is a clean sheet whatever you do, which is a
     different property and is checked on its own below. Asserting this
     one over an empty section made it a hostage to which scenes happened
     to compose, and it duly broke the moment the generator changed. */
  perfect.length > 0 && good.result.score > none.result.score && good.result.score > all.result.score
    ? ok(`marking well beats marking nothing and marking everything (${perfect.length} markable) -- the sheet is worth filling in honestly`)
    : perfect.length === 0
      ? fail("this section produced nothing markable, so the sheet cannot be tested on it")
      : fail(`the sheet does not reward honest marking: ${good.result.score} / ${none.result.score} / ${all.result.score}`);

  /* Directions are graded against the EXAMINER. */
  const late = {};
  section.forEach((leg, i) => { late[i] = { at: leg.window.deadline + 0.5, intent: leg.intent }; });
  const onTime = sheetOf(perfect, given), tooLate = sheetOf(perfect, late), silent = sheetOf(perfect, {});
  onTime.directionsOnYou === 0
    ? ok("directions given inside the window are nobody's fault")
    : fail(`${onTime.directionsOnYou} in-window directions were blamed on somebody`);
  tooLate.directionsOnYou === PER_SECTION && silent.directionsOnYou === PER_SECTION
    ? ok(`and a late one is the EXAMINER's (${tooLate.directionsOnYou}/${PER_SECTION}), as is never saying anything — the interlock the design rests on`)
    : fail(`late and absent directions were not attributed to the examiner (${tooLate.directionsOnYou}, ${silent.directionsOnYou})`);
  const wrong = {};
  section.forEach((leg, i) => {
    const other = leg.intent === "left" ? "right" : "left";
    wrong[i] = { at: leg.window.deadline - 0.3, intent: other };
  });
  sheetOf(perfect, wrong).calls.every((c) => c.wrongTurn)
    ? ok("and naming the wrong turn is a different failure from naming it late")
    : fail("a wrong turn given in time was not distinguished from a late one");

  /* ================================================================
     CAN THE PLAYER ACTUALLY STACK? The trade is the whole reason the
     four systems are one game rather than four scoreboards, and it was
     UNREACHABLE in the first build of the loop: the buttons only ever
     wrote given[at], while held counts intersections BEYOND at, so held was
     0 by construction — no load, no cost, no meter movement, and the
     "stacked" verdict could never fire. Checked here as the arithmetic
     the screen actually performs, because a React component is the one
     place nothing else in this suite can reach.
     ================================================================ */
  const AHEAD = [0, 1, 2];

  /* Held at leg k is what was SPOKEN BEFORE leg k began and is still
     outstanding — so the model needs which leg each instruction was
     given during, not merely which intersection it was about. Collapsing
     those two is how the first version of this check passed while
     measuring nothing: a fully populated map of calls looks identical
     whenever they were actually said. */
  const heldWhen = (issuedDuring, k) =>
    Object.keys(issuedDuring).filter((j) => Number(j) > k && issuedDuring[j] < k).length;
  const spokenAt = (ahead) => {
    const m = {};
    section.forEach((_, j) => { m[j] = Math.max(0, j - ahead); });
    return m;
  };
  const loads = (ahead) => Math.max(...section.map((_, k) => heldWhen(spokenAt(ahead), k)));
  const loadNow = loads(0), loadOne = loads(1), loadTwo = loads(2);
  loadNow === 0 && loadOne === 0 && loadTwo > 0 && Math.max(...AHEAD) >= 2
    ? ok(`stacking is reachable and only at a distance of two: ${loadNow} in the air taking them as they come, ${loadOne} calling one ahead — that one is discharged on arrival — and ${loadTwo} calling two`)
    : fail(`the load model is wrong: ${loadNow} / ${loadOne} / ${loadTwo} in the air at distances 0, 1, 2 — the trade the design rests on is inert or free`);

  /* And it has to be a TRADE, both halves measured. Early is never late. */
  const calledAhead = {};
  section.forEach((leg, i) => {
    calledAhead[i] = i === 0
      ? { at: leg.window.deadline - 0.3, intent: leg.intent }
      : { at: leg.window.opensAt - 5, intent: leg.intent, ahead: true };
  });
  const aheadSheet = sheetOf(perfect, calledAhead);
  aheadSheet.directionsOnYou === 0 && aheadSheet.calls.filter((c) => c.verdict === "stacked").length === PER_SECTION - 1
    ? ok("an instruction called ahead is stacked, not late — nobody's fault, which is what makes it worth doing")
    : fail(`calling ahead was penalised: ${aheadSheet.directionsOnYou} blamed, ${aheadSheet.calls.filter((c) => c.verdict === "stacked").length} stacked`);

  /* The cost lands on the candidate, and it is measured through the same
     fault derivation the examiner marks — peakPos, the metres of
     deviation a fault actually reaches, not a meter reading. */
  const deviation = (scn) => faultsIn(scn).reduce((a, f) => a + (f.peakPos ?? 0), 0);
  const worstUnder = drawn.map((scn) => ({
    free: deviation(scn),
    loaded: deviation(loadCandidate(scn, { held: loadTwo })),
  })).filter((d) => d.free > 0);
  /* Never BETTER under load is the property; every one bigger is not.
     An encroachment is situational rather than a trait, so severity does
     not scale it -- a intersection whose only fault is one stays put, which
     is correct and made this assertion a hostage to the draw. */
  const shrank = worstUnder.filter((d) => d.loaded < d.free - 1e-9).length;
  const grew = worstUnder.filter((d) => d.loaded > d.free + 1e-9).length;
  const ratio = worstUnder.length
    ? worstUnder.reduce((a, d) => a + d.loaded, 0) / worstUnder.reduce((a, d) => a + d.free, 0)
    : 1;
  pressureOf(loadTwo) > 0 && shrank === 0 && grew > 0 && ratio > 1
    ? ok(`and it costs them, on the same derivation the examiner marks: ${(100 * pressureOf(loadTwo)).toFixed(0)}% pressure widens ${grew} of ${worstUnder.length} intersections carrying a fault and improves none, ${ratio.toFixed(2)}x the deviation`)
    : fail(`stacking does not measurably worsen the candidate: ${grew} grew and ${shrank} SHRANK of ${worstUnder.length}, ${ratio.toFixed(3)}x deviation at ${(100 * pressureOf(loadTwo)).toFixed(0)}% pressure`);

  /* A fault the screen never showed must not count against the player —
     the same rule occlusion lives under everywhere else. */
  /* A MARK BELONGS TO THE INTERSECTION IT WAS MADE AT. Every leg's clock
     starts near zero, so a call at 0.4s on one intersection looks exactly
     like a call at 0.4s on another. Before scoreDetection compared them,
     a player who correctly marked every fault in a section scored ZERO:
     marks were credited against faults from intersections they never saw,
     the real fault read as missed and the mark itself as invented. */
  const spread = new Set(perfect.map((m) => m.intersection)).size > 1;
  const misplaced = sheetOf(perfect.map((m) => ({ ...m, intersection: (m.intersection + 1) % PER_SECTION })));
  !spread || misplaced.result.score < good.result.score
    ? ok(`marking the right fault at the wrong intersection does not score: ${misplaced.result.score} against ${good.result.score} for the same calls placed correctly`)
    : fail(`a mark is credited regardless of which intersection it was made at (${misplaced.result.score} vs ${good.result.score})`);

  const blind = sectionSheet({ legs: section, marks: [], given, shownFor: () => 0 });
  blind.result.recall === 1 || blind.result.missed.length === 0
    ? ok("a section where nothing was ever on screen is a clean sheet, not a failure")
    : fail(`${blind.result.missed.length} faults counted as missed though the screen never showed them`);
}

console.log("\n" + "=".repeat(70));
console.log(problems === 0 ? "OK: the examiner is graded on what they caught and what they invented." : `${problems} PROBLEM(S) FOUND.`);
process.exit(problems === 0 ? 0 : 1);
