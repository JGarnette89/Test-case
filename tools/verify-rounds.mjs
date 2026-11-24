/* =====================================================================
   THE SHORT GAME'S OWN CHECK (WORK-game-slice1 section 7; GAME.md).

   1. EVERY ROUND BUILDS: the map loads ok, the player is placed, and a path
      from the start leg at the round's own intersection has the round's task
      as its intent. Preconditions: a failure here says the round is broken,
      not the detector.
   2. THE GOOD DRIVER PASSES EVERY ROUND, and the round's case arises: it ends
      through, made the task, 3 stars, no faults -- and the property the round
      exists to show held, on its own line.
   3. EACH DETECTOR FIRES ON THE DRIVING IT IS ABOUT, AND NOT ON THE DRIVING IT
      IS NOT ABOUT: the same round and seed, the good driver with ONE thing
      changed. Every negative carries its own exposure line.
   4. DETERMINISTIC: the same scripted inputs twice, the same end and verdict.
   5. THE VERDICT TABLE, on stated inputs: stars, counts, the fault that is no
      fault's.

   The good driver waits by `whatStops`, as written. Nothing here makes it wait
   by `openTo` (that would compare the detector with itself, CLAUDE.md item 3).
   ===================================================================== */
import { isDeepStrictEqual } from "node:util";
import { ROUNDS, HELD_FOR } from "../src/game/rounds.js";
import { roundWorld, startRound, roundTick, verdictOf, CLEAR_BY, TIME_CAP } from "../src/game/round.js";
import { driveRound, routesOfTask } from "./lib/round-drive.mjs";
import { measureRun, AT_SPAN } from "./measure/round-seeds.mjs";
import { loadMap } from "../src/map/load.js";
import { openTo, AT_REST, DT } from "../src/sim/crossing.js";
import { END_WORDS, WORDS } from "../src/game/words.js";

let failed = 0;
const check = (ok, msg) => { console.log(`  ${ok ? "ok  " : "FAIL:"} ${msg}`); if (!ok) failed++; };
const byId = Object.fromEntries(ROUNDS.map((r) => [r.id, r]));
const ids = (v) => v.faults.map((f) => f.id);
const pathOf = (rs) => rs.world.course.at[rs.me.k].layout.paths[rs.me.route];

/* A run with one thing changed, recording what the crossing tick looked like: the speed, whether the car had stopped,
   and whether a sound driver in its place had an opening in the world before the move (crossing.js openTo). */
function run(def, edit = null) {
  let cross = null;
  const r = driveRound(def, {
    edit,
    onTick: (before, inp, after) => {
      if (cross == null && before.crossedAt == null && after.crossedAt != null) cross = { v: before.me.v, stopped: before.me.stoppedAt != null, open: openTo({ ...before.me, caution: 1 }, before.world, 1), t: after.world.t - after.t0 };
    },
  });
  return { ...r, cross };
}

console.log("\n1. EVERY ROUND BUILDS");
for (const def of ROUNDS) {
  const l = loadMap(def.map());
  check(l.ok === true, `${def.id}: the map loads ok`);
  /* The loader says "snapped-join" once for any intersection of roads that end at one point: information, and the only kind of warning a crossroads made of roads ending at its middle can have. */
  const odd = (l.warnings ?? []).filter((w) => w.code !== "snapped-join");
  check(odd.length === 0, `${def.id}: no warning but the loader's note that roads end at the intersection (${(l.warnings ?? []).length} of them, ${odd.length} other)`);
  let w = null, err = null;
  try { w = roundWorld(def); } catch (e) { err = e; }
  check(w && w.me && Number.isInteger(w.me.k) && !err, `${def.id}: the player is placed${err ? ` (${err.message})` : ""}`);
  if (!w) continue;
  const rs = startRound(def, w);
  const intents = routesOfTask(def, rs);
  check(intents.includes(def.task), `${def.id}: a path from the start leg at k=${rs.targetK} has the task "${def.task}" as its intent (${intents.join(", ")})`);
  check(w.world.actors.length >= 2, `${def.id}: there is traffic (${w.world.actors.length - 1} others beside the player, from ${def.cars} asked for)`);
}

console.log("\n2. THE GOOD DRIVER PASSES EVERY ROUND, AND THE CASE ARISES");
for (const def of ROUNDS) {
  const m = measureRun(def);
  const v = m.verdict;
  check(m.rs.end?.why === "through", `${def.id}: ends through (ended ${m.rs.end?.why})`);
  check(v.made === def.task, `${def.id}: made the task (${v.made} of ${def.task})`);
  check(v.stars === 3 && v.faults.length === 0, `${def.id}: 3 stars and no faults (${v.stars}, [${ids(v)}])`);
  if (def.expose === "cameToRest") check(m.rested, `${def.id}: EXPOSURE cameToRest -- it came to rest at its line before crossing`);
  else check(m.held >= HELD_FOR, `${def.id}: EXPOSURE heldByRight -- standing at its line, a sound driver's way was shut for ${m.held.toFixed(2)} s, at least ${HELD_FOR} s [M]`);
  console.log(`        time to through ${m.t.toFixed(1)} s [M, this run, seed ${def.seed}, ${def.cars} cars]`);
}

console.log("\n3. EACH DETECTOR FIRES ON THE DRIVING IT IS ABOUT, AND NOT ON THE DRIVING IT IS NOT ABOUT");
{
  /* ROLLER, at full-stop: the slider held at no less than 0.2 through the line. */
  const def = byId["full-stop"];
  const clean = run(def);
  const r = run(def, (inp) => { inp.slider = Math.max(inp.slider, 0.2); });
  check(r.cross != null && r.cross.v > 1, `roller: EXPOSURE it crossed the line above 1 m/s (${r.cross ? r.cross.v.toFixed(2) : "never crossed"} m/s) [M]`);
  check(ids(r.verdict).includes("rolledStop"), `roller: rolledStop is in the faults [${ids(r.verdict)}]`);
  check(clean.cross?.stopped === true && !ids(clean.verdict).includes("rolledStop"), `roller control: the good driver came to rest at the line (EXPOSURE) and has no rolledStop`);
}
{
  /* EAGER, at who-first, into-gap and across, seeds 1-30: once at rest at the line, full throttle. */
  const rows = [];
  for (const id of ["who-first", "into-gap", "across"]) {
    for (let seed = 1; seed <= 30; seed++) {
      const def = { ...byId[id], seed };
      let go = false;
      const eager = run(def, (inp, { rs }) => {
        const p = pathOf(rs);
        if (!go && rs.me.v < AT_REST && rs.me.s <= p.stopAt && p.stopAt - rs.me.s < AT_SPAN) go = true;
        if (go) inp.slider = 1;
      });
      const good = run(def);
      rows.push({ id, seed, eager, good });
    }
  }
  const crossed = rows.filter((x) => x.eager.cross);
  const closed = crossed.filter((x) => x.eager.cross.open === false), open = crossed.filter((x) => x.eager.cross.open === true);
  check(closed.length >= 3, `eager: EXPOSURE in ${closed.length} of ${crossed.length} runs that crossed (of ${rows.length}) the way was shut to a sound driver on the crossing tick, at least 3 [M]`);
  const missed = closed.filter((x) => !ids(x.eager.verdict).includes("failedToYield"));
  check(closed.length > 0 && missed.length === 0, `eager: failedToYield is in the faults of every such run${missed.length ? ` -- not ${missed.map((x) => `${x.id}#${x.seed}`).join(" ")}` : ` (${closed.length})`}`);
  check(open.length > 0, `eager: EXPOSURE the way was open on the crossing tick in ${open.length} runs, so there is a case for "none where it was true"`);
  const spurious = open.filter((x) => ids(x.eager.verdict).includes("failedToYield"));
  check(open.length > 0 && spurious.length === 0, `eager: failedToYield is in none of the ${open.length} runs where the way was open`);
  /* The unmodified good driver over the SAME seeds. */
  const goodCrossed = rows.filter((x) => x.good.cross);
  const goodFaulted = goodCrossed.filter((x) => ids(x.good.verdict).includes("failedToYield"));
  console.log(`        the unmodified good driver crossed in ${goodCrossed.length} of the same ${rows.length} runs [M]`);
  check(goodCrossed.length > 0 && goodFaulted.length === 0, `eager control: the unmodified good driver has failedToYield in none of ${goodCrossed.length} runs${goodFaulted.length ? ` -- in ${goodFaulted.map((x) => `${x.id}#${x.seed}`).join(" ")} (whatStops let it go where openTo says the way was shut; see the report)` : ""}`);
}
{
  /* SILENT, at who-first: no signal until the tick that crosses the line. A turn with no signal at all is not a turn in this sim (the signal IS the turn commit: no signal is straight on, drive.js routeForSignal), so the signal is held back to the one tick it can no longer be before. */
  const def = byId["who-first"];
  const r = run(def, (inp, { rs }) => {
    const want = inp.signal;
    inp.signal = null;
    /* A trial tick, with no signal: does THIS tick cross the line? (roundTick is pure.) Only then is the signal given. */
    if (want && rs.crossedAt == null && roundTick(rs, inp).rs.crossedAt != null) inp.signal = want;
  });
  check(r.cross != null && r.rs.made === def.task, `silent: EXPOSURE it turned (made ${r.rs.made}, asked ${def.task}) [M]`);
  check(ids(r.verdict).includes("noSignal"), `silent: noSignal is in the faults [${ids(r.verdict)}]`);
  const clean = run(def);
  check(clean.rs.made === def.task && !ids(clean.verdict).includes("noSignal"), `silent control: the good driver turned (EXPOSURE) with its signal and has no noSignal`);
}
{
  /* WRONG WAY, at into-gap: left where right was asked. */
  const def = byId["into-gap"];
  const r = run(def, (inp) => { if (inp.signal === "right") inp.signal = "left"; });
  check(r.cross != null && r.rs.made === "left", `wrong way: EXPOSURE it crossed the line, turning ${r.rs.made} where ${def.task} was asked`);
  check(ids(r.verdict).includes("wrongTurn"), `wrong way: wrongTurn is in the faults [${ids(r.verdict)}]`);
  const clean = run(def);
  check(clean.cross != null && !ids(clean.verdict).includes("wrongTurn"), `wrong way control: the good driver crossed (EXPOSURE) turning ${clean.rs.made} and has no wrongTurn`);
}
{
  /* STATUE, at full-stop: the slider held at -1 throughout. */
  const def = byId["full-stop"];
  const r = run(def, (inp) => { inp.slider = -1; });
  check(r.rs.crossedAt == null, `statue: EXPOSURE it never crossed the line (the round could not be through)`);
  check(r.rs.end?.why === "time" && r.verdict.stars === 0, `statue: the round ends "${r.rs.end?.why}" with ${r.verdict.stars} stars (wanted time, 0)`);
}

console.log("\n4. DETERMINISTIC");
{
  const def = byId["who-first"];
  const script = [];
  driveRound(def, { onTick: (b, inp) => script.push({ ...inp }) });
  const replay = () => {
    let rs = startRound(def, roundWorld(def));
    for (const inp of script) { ({ rs } = roundTick(rs, inp)); if (rs.end) break; }
    return { t: rs.world.t, verdict: verdictOf(rs), end: rs.end, me: rs.me };
  };
  const a = replay(), b = replay();
  check(script.length > 100 && a.end != null, `a scripted drive of ${script.length} ticks ends (${a.end?.why}) -- the replay arose`);
  check(a.t === b.t && isDeepStrictEqual(a.verdict, b.verdict) && isDeepStrictEqual(a.me, b.me), `the same inputs twice: the same world.t (${a.t.toFixed(2)} and ${b.t.toFixed(2)}), verdict and car`);
}

console.log("\n5. THE VERDICT TABLE, ON STATED INPUTS");
{
  const def = byId["full-stop"];
  const ev = (id, severity, extra = {}) => ({ id, t: 1, severity, praise: false, ...extra });
  const rs = (events, { made = def.task, end = { why: "through" } } = {}) => ({ def, events, made, end });
  const stars = (events, o) => verdictOf(rs(events, o)).stars;
  check(stars([]) === 3, "no event, through: 3 stars");
  check(stars([ev("underLimit", 1)]) === 2 && stars([ev("stoppedShort", 2)]) === 2, "worst fault severity 1 or 2: 2 stars");
  check(stars([ev("harshBraking", 3)]) === 1 && stars([ev("rolledStop", 4)]) === 1, "worst fault severity 3 or 4: 1 star");
  check(stars([ev("failedToYield", 5)]) === 0 && stars([ev("collision", 5), ev("underLimit", 1)]) === 0, "any fault of severity 5: 0 stars, whatever else");
  check(stars([], { end: { why: "time" } }) === 0 && stars([], { end: { why: "contact" } }) === 0 && stars([], { end: { why: "edge" } }) === 0, "a round that did not end through: 0 stars, with no fault at all");
  check(stars([ev("underLimit", 1)], { made: "left" }) === 2 && verdictOf(rs([], { made: "left" })).faults.some((f) => f.id === "wrongTurn" && f.severity === 2), "another turn than the task adds wrongTurn at severity 2");
  const two = verdictOf(rs([ev("harshBraking", 3), ev("harshBraking", 3), ev("underLimit", 1)]));
  check(two.faults.length === 2 && two.faults.find((f) => f.id === "harshBraking").count === 2, "each id once, with a count (two harshBraking is one entry of 2)");
  const by = verdictOf(rs([{ id: "struckBy", t: 1, severity: 4, praise: false, noFault: true }]));
  check(by.faults.length === 0 && by.stars === 3 && by.notes.length === 1, "being struck through no fault is no fault: 3 stars, said as a note");
  const pr = verdictOf(rs([{ id: "letIn", t: 1, severity: 1, praise: true }, { id: "streak", t: 1, severity: 2, praise: true }]));
  check(pr.praise.length === 1 && pr.praise[0].words === WORDS.letIn, "praise with words is shown, praise with none is not");
  check(Object.keys(END_WORDS).sort().join() === "contact,edge,time", "the three not-finished reasons have words");
}

console.log(`\n${failed === 0 ? "ALL PASSED" : `${failed} FAILED`}`);
process.exit(failed ? 1 : 0);
void CLEAR_BY; void TIME_CAP; void DT;
