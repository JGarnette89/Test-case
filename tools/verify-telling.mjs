/* Stage 2 of the rebuild: a driver is their ratings, and you can tell.
 *
 * REBUILD.md section 6 sets this stage one test and it is a test for a
 * person: two candidates on the same course, visibly different, and you
 * can say which is which by watching. Nothing here can answer that -- it
 * is the maintainer's eyes at #/candidates.
 *
 * What a check CAN do is establish the things that have to be true for
 * that test to be worth running at all. If the same course is not really
 * the same course, or a weak axis moves three observables at once, or the
 * difference is a centimetre, then a person watching cannot attribute
 * what they see and the answer they give is worthless whatever it is.
 *
 * THE SHAPE OF EVERY SECTION BELOW IS THE PROJECT'S OWN CONTROLLED
 * COMPARISON. Same seed, same traffic, same legs in the same order, one
 * rating moved. What separates is the rating.
 */
import {
  seedCrossing, step, poseOf, overlapping, DT, ALL_WAY, TWO_WAY, CAR,
} from "../src/sim/crossing.js";
import { poseAt } from "../src/sim/intersection.js";
import { PROFILES, profileOf, withCandidates, keepDriving } from "../src/sim/candidate.js";
import { AXES } from "../src/engine/ratings.js";
import fs from "node:fs";

let problems = 0;
const ok = (s) => console.log(`  ok   ${s}`);
const fail = (s) => { problems++; console.log(`  FAIL: ${s}`); };

console.log("\n" + "=".repeat(70));
console.log("SIM STAGE 2: two candidates, one course, and whether it is the driver");
console.log("=".repeat(70));

/* BELOW CAPACITY, DELIBERATELY. A busy two-way stop starves the side
   street -- p90 waits of 110s, measured in verify-crossing section 8 --
   and a candidate that spends twelve minutes at one line completes one
   trip and shows almost nothing. That is a true fact about a busy
   two-way stop and a useless place to measure a driver from: at
   `every: 2.5` the sound candidate got round ONCE, so three of the five
   axes had no chance to express and the check read a starved approach as
   an inert model.

   The question this file asks is whether a weakness SHOWS when the
   driver gets to drive. Whether they get to drive is section 8 of
   verify-crossing's business. */
/* EIGHT SEEDS, NOT ONE, and the reason is a failure rather than caution.
   One ten-minute drive is about fourteen crossings, and which manoeuvres
   a candidate happens to draw across fourteen swings the result more
   than the driver does: on one seed a hesitant driver waited 1.17x a
   sound one, and on eight the same code gives 2.3x. The single-seed
   version had been GREEN, which is worse than having been red -- it was
   measuring the draw and reporting it as the driver. */
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const LIMIT = 60, EVERY = 5.0, MINUTES = 10;
const TICKS = Math.round((MINUTES * 60) / DT);

/* Drive one profile round the same course and record everything anybody
   could watch for. Nothing measured here is a new quantity -- each is
   read off the driver or off the pose the screen draws. */
function drive(profile, control = TWO_WAY, seeds = SEEDS) {
  const all = seeds.map((seed) => driveOne(profile, control, seed));
  const it = { profile, legs: all[0].legs, peaks: [], eases: [] };
  for (const key of ["trips", "onRoad", "waiting", "marked", "overlaps", "restedAt", "rolledPast"]) {
    it[key] = all.reduce((t, x) => t + x[key], 0);
  }
  for (const key of ["hardest", "off", "top"]) it[key] = Math.max(...all.map((x) => x[key]));
  for (const x of all) { it.peaks.push(...x.peaks); it.eases.push(...x.eases); }
  it.perTrip = it.waiting / Math.max(1, it.trips);
  const mid = (xs) => (xs.length ? xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)] : 0);
  it.brakes = mid(it.peaks);
  /* HOW FAR OUT THEY START EASING OFF, which is what the braking axis
     actually sets. A bigger `b` means a smaller desired gap, so they
     close in further before doing anything about it -- "leaves it late"
     is the behaviour, and how hard they eventually pressed the pedal is
     a consequence of it tangled up with whatever else was on the road.

     Smaller is later. Confounded with SPEED across profiles -- a bold
     driver arrives faster and needs more room, so they start sooner --
     which is fine here because every profile is only ever compared with
     sound on its own observable, and heavy differs from sound on the
     braking axis alone. */
  it.easesAt = mid(it.eases);
  return it;
}

function driveOne(profile, control, seed) {
  let w = withCandidates(seedCrossing(seed, LIMIT, { every: EVERY, control }), [{ id: "them", profile }]);
  const it = {
    profile, trips: 0, onRoad: 0, waiting: 0, marked: 0, overlaps: 0,
    hardest: 0, off: 0, top: 0, restedAt: 0, rolledPast: 0, legs: [], peaks: [], eases: [],
  };
  let seen = null, cameToRest = false, peak = 0, mustStop = false, eased = false;
  for (let i = 0; i < TICKS; i++) {
    w = keepDriving(step(w));
    if (i % 4 === 0) it.overlaps += overlapping(w).length;
    const a = w.actors.find((x) => x.candidate === "them");
    if (!a) continue;
    if (a.id !== seen) {
      /* A new trip. Bank whether the last one involved an actual stop,
         and how hard they braked on it. */
      if (seen !== null) {
        it.trips += 1;
        it.peaks.push(peak);
        /* ONLY A LEG THAT ACTUALLY HAS A STOP SIGN CAN BE ROLLED. Counting
           every trip crossed without coming to rest made a SOUND driver
           look like they rolled 8 of 14, because most of those were the
           through road, where not stopping is the correct thing to do.
           The signal was real and buried under legs where there was
           nothing to obey. */
        if (mustStop) { if (cameToRest) it.restedAt += 1; else it.rolledPast += 1; }
      }
      seen = a.id;
      cameToRest = false;
      peak = 0;
      eased = false;
      mustStop = w.layout.place.control[w.layout.paths[a.route].from] === "stop";
      it.legs.push(a.route);
    }
    it.onRoad += DT;
    if (a.v < 0.3) cameToRest = true;
    if (a.stoppedAt != null && !a.going) it.waiting += DT;
    peak = Math.max(peak, -Math.min(0, a.a ?? 0));
    it.hardest = Math.max(it.hardest, peak);
    if (mustStop && !eased && (a.a ?? 0) < -0.4) {
      const out = (w.layout.paths[a.route].stopAt - CAR.length / 2) - a.s;
      if (out > 0) { it.eases.push(out); eased = true; }
    }
    it.top = Math.max(it.top, a.v);
    const clean = poseAt(w.layout.paths[a.route], a.s);
    const real = poseOf(w, a);
    it.off = Math.max(it.off, Math.hypot(clean.x - real.x, clean.y - real.y));
    if (a.delayed) it.marked = 1;
  }
  return it;
}

/* Driven once and shared, because each of these is ten minutes of
   simulation and the sections below all want the same six. */
const RAN = Object.fromEntries(PROFILES.map((p) => [p.id, drive(p.id)]));

console.log(`\n1. THE COURSE IS THE SAME COURSE, OR NOTHING BELOW MEANS ANYTHING`);
{
  const runs = PROFILES.map((p) => RAN[p.id]);
  const first = runs[0];
  const shortest = Math.min(...runs.map((r) => r.legs.length));
  const same = runs.every((r) =>
    r.legs.slice(0, shortest).every((leg, i) => leg === first.legs[i]));
  console.log(`   ${shortest} trips in common, starting ${first.legs.slice(0, 5).join(", ")}`);
  same && shortest >= 2
    ? ok(`every profile takes the same legs in the same order — ${shortest} of them, leg for leg and turn for turn`)
    : fail("two profiles drove different courses, so any difference between them is partly the course and cannot be attributed");

  /* AND EVERYBODY GETS COMPARABLE TIME ON IT. The first version of this
     did not: a fast candidate could not get past the queue at the
     entrance, so it completed 3 trips where a slow one completed 13 and
     the difference read as a fact about the driver. It was a fact about
     the spawn gate. */
  const road = runs.map((r) => r.onRoad);
  const spread = (Math.max(...road) - Math.min(...road)) / Math.max(...road);
  spread < 0.1
    ? ok(`and each of them is actually on the road for the same stretch: ${Math.min(...road).toFixed(0)}-${Math.max(...road).toFixed(0)}s of ${(MINUTES * 60 * SEEDS.length)}s available, ${(spread * 100).toFixed(0)}% apart`)
    : fail(`time on the road varies ${(spread * 100).toFixed(0)}% between profiles (${Math.min(...road).toFixed(0)}s to ${Math.max(...road).toFixed(0)}s), so they are not being compared on equal terms`);

  runs.every((r) => r.overlaps === 0)
    ? ok("and nobody drives through anybody, with a named driver in the traffic")
    : fail(`${runs.reduce((t, r) => t + r.overlaps, 0)} overlaps with a candidate on the road`);
}


console.log(`\n2. A WEAK AXIS SHOWS, AND SHOWS AS ITSELF`);
{
  /* WHAT EACH AXIS IS SUPPOSED TO LOOK LIKE, as a quantity anybody
     watching could read off the screen. This is the one table here, and
     it is a statement of the DESIGN rather than of the implementation:
     if an axis stops producing its own observable, that is the finding. */
  const SHOWS = {
    timid: ["waiting at the line, per trip", (r) => r.perTrip, "s"],
    bold: ["trips completed", (r) => r.trips, ""],
    ragged: ["furthest off their own line", (r) => r.off, "m"],
    heavy: ["how far out they start easing off", (r) => r.easesAt, "m"],
    unschooled: ["stop signs crossed without coming to rest", (r) => r.rolledPast, ""],
  };
  const base = RAN.sound;
  const runs = RAN;

  console.log(`   sound: ${base.trips} trips over ${SEEDS.length} seeds, ${base.perTrip.toFixed(1)}s waiting each, ` +
    `${base.off.toFixed(2)}m off line, eases off ${base.easesAt.toFixed(0)}m out and peaks at ` +
    `${base.brakes.toFixed(2)} m/s2, ${base.rolledPast} of ${base.rolledPast + base.restedAt} stop signs rolled`);
  for (const [id, [what, read, unit]] of Object.entries(SHOWS)) {
    const mine = read(runs[id]), theirs = read(base);
    console.log(`   ${profileOf(id).name.padEnd(13)} ${what}: ${mine.toFixed(2)}${unit} against sound's ${theirs.toFixed(2)}${unit}`);
  }

  /* Each weakness has to move ITS OWN observable, and the direction is
     not a matter of taste: hesitation is more waiting, boldness is more
     trips, ragged is further off line, heavy is harder braking, and
     unschooled is more crossings made without stopping. */
  const moved = [
    ["a hesitant driver waits longer than a sound one", runs.timid.perTrip > base.perTrip * 1.5],
    ["a pushy one gets round more often", runs.bold.trips > base.trips],
    ["a ragged one strays further off its line", runs.ragged.off > base.off * 3],
    ["a heavy-footed one leaves the braking later", runs.heavy.easesAt < base.easesAt * 0.95],
    ["and an unschooled one crosses without stopping where a sound driver stops", runs.unschooled.rolledPast > base.rolledPast],
  ];
  const missing = moved.filter(([, held]) => !held);
  missing.length === 0
    ? ok("each weak axis moves its own observable, in the direction it should: " + moved.map(([w]) => w.replace(/^(a|and an|and a) /, "")).join("; "))
    : fail(`${missing.length} axis produced no visible consequence: ${missing.map(([w]) => w).join("; ")} — an axis that changes nothing is not a rating, it is a label`);

  /* AND IT MUST NOT MOVE ANYBODY ELSE'S, or the player can see that
     something is wrong and never work out what. This is the property
     that makes a drive readable rather than merely varied. */
  const CLEAN = { ragged: "off", heavy: "easesAt", unschooled: "rolledPast" };
  const bled = [];
  for (const [id, own] of Object.entries(CLEAN)) {
    for (const other of ["off", "easesAt", "rolledPast"]) {
      if (other === own) continue;
      const mine = runs[id][other], theirs = base[other];
      if (Math.abs(mine - theirs) > Math.max(0.02, Math.abs(theirs) * 0.06)) {
        bled.push(`${profileOf(id).name} moved ${other} (${theirs.toFixed(2)} -> ${mine.toFixed(2)})`);
      }
    }
  }
  bled.length === 0
    ? ok("and moves nothing else: steering, braking and knowledge each change their own observable and leave the other two where they were")
    : fail(`a weakness on one axis moved another axis's observable — ${bled.join("; ")} — so a player watching could not attribute what they saw`);
}


console.log(`\n3. THE DIFFERENCE IS BIG ENOUGH TO SEE`);
{
  /* A difference the model can measure and an eye cannot read is not a
     difference the player has.

     MEASURED AGAINST THE CAR, NOT AGAINST THE SCREEN, and the first
     version of this got that wrong. It converted the weave to pixels at
     one assumed zoom and called 2.6px invisible -- but a swing is judged
     against the thing swinging, and 2.6px on a 6px car is a car visibly
     moving about. Pixels are the wrong instrument because they change
     with a decision the sim does not make; the ratio does not.

     What the pixel figure DOES say, and it is worth keeping: at
     intersection scale everything is small, so a top-down view of a
     whole intersection is a poor place to read lane-keeping from
     whatever the amplitude. That is an argument for the chase camera at
     stage 3 rather than for a bigger weave. */
  const base = RAN.sound, ragged = RAN.ragged, timid = RAN.timid;

  const swing = (ragged.off - base.off) * 2;          // side to side, not from centre
  const share = swing / CAR.width;
  console.log(`   a ragged driver swings ${swing.toFixed(2)}m side to side, which is ${(share * 100).toFixed(0)}% of the car's own width`);
  share > 0.25
    ? ok(`the weave reads against the car itself: ${(share * 100).toFixed(0)}% of a car's width of swing, so a car you can see at all is visibly not holding its line`)
    : fail(`${(share * 100).toFixed(0)}% of a car's width is too little swing to read as anything but noise`);

  /* And it must still be bounded by the room that exists, or the fault
     being claimed is leaving the lane rather than wandering in it. */
  const room = (3.6 - CAR.width) / 2;
  ragged.off <= room + 0.01
    ? ok(`and stays inside the lane: ${ragged.off.toFixed(2)}m off centre against ${room.toFixed(2)}m of room, so the tell is lane-keeping rather than leaving the road`)
    : fail(`${ragged.off.toFixed(2)}m off centre exceeds the ${room.toFixed(2)}m a lane offers, which is a different and much worse fault`);

  const apart = timid.perTrip - base.perTrip;
  apart > 3
    ? ok(`and hesitation is legible at any scale: ${apart.toFixed(1)}s more per trip at the line, which is a wait a person notices rather than a number`)
    : fail(`a hesitant driver waits only ${apart.toFixed(1)}s longer per trip, which nobody would see`);
}


console.log(`\n4. IT IS THE SAME DRIVER MODEL, NOT A SECOND ONE`);
{
  /* REBUILD.md 4.1: an NPC is a rated driver and the candidate is the
     rated driver being assessed. The old engine had TWO divergent trait
     pools and neither was the ratings model, which is exactly the drift
     this section exists to prevent. Checked at source, because the
     property is about what the code is allowed to contain. */
  const src = fs.readFileSync(new URL("../src/sim/candidate.js", import.meta.url), "utf8");
  const body = src.replace(/\/\*[\s\S]*?\*\//g, "");

  /* Every profile is ratings and prose. If one ever needs a knob of its
     own, the axis it wanted is missing from the driver model. */
  const onlyRatings = PROFILES.every((p) =>
    Object.keys(p).every((k) => ["id", "name", "blurb", "watch", "ratings"].includes(k))
    && AXES.every((a) => typeof p.ratings[a] === "number"));
  onlyRatings
    ? ok(`all ${PROFILES.length} profiles are nothing but five ratings and the prose that describes them`)
    : fail("a profile carries a field that is not a rating, so the candidate has a parameter the traffic does not");

  const knobs = ["ACCEL", "BRAKE", "HEADWAY", "STANDSTILL", "MOST_BRAKE", "v0 =", "headway ="];
  const smuggled = knobs.filter((k) => body.includes(k));
  smuggled.length === 0
    ? ok("and it sets none of the driving parameters itself — everything it produces comes back through `driver`")
    : fail(`candidate.js touches ${smuggled.join(", ")}, which is a second driver model starting`);

  /* And the profiles really are one axis apart from sound, which is what
     lets section 2 attribute anything. */
  const soundOne = profileOf("sound").ratings;
  const bad = PROFILES.filter((p) => p.id !== "sound")
    .filter((p) => AXES.filter((a) => p.ratings[a] !== soundOne[a]).length !== 1);
  bad.length === 0
    ? ok("and each of them differs from sound on exactly one axis, so what separates them is one thing")
    : fail(`${bad.map((p) => p.name).join(", ")} differ from sound on more than one axis, so nothing they do can be attributed`);
}


console.log(`\n5. AND WHERE AN AXIS CANNOT SHOW, IT DOES NOT`);
{
  /* THE HONEST HALF. At an all-way stop everybody stops, so there is no
     gap for anybody to judge and confidence has almost nothing to say.
     A model that made a hesitant driver look hesitant there anyway would
     be decorating rather than deriving -- and it would teach a player to
     read a tell that is not there.

     This is the same rule the old engine's `chancesAt` lives under:
     where a habit can show is derived, never asserted. */
  const two = { sound: RAN.sound, timid: RAN.timid };
  const all = { sound: drive("sound", ALL_WAY), timid: drive("timid", ALL_WAY) };
  const gapMatters = two.timid.perTrip / Math.max(0.1, two.sound.perTrip);
  const gapDoesNot = all.timid.perTrip / Math.max(0.1, all.sound.perTrip);
  console.log(`   waiting per trip, hesitant against sound: ${gapMatters.toFixed(1)}x at a two-way stop, ${gapDoesNot.toFixed(1)}x at an all-way stop`);
  gapMatters > 2 && gapDoesNot < 1.5
    ? ok("confidence speaks loudly where there is a gap to judge and is quiet where everybody stops anyway — which is correct, and is why the same candidate needs more than one kind of place")
    : fail(`confidence reads ${gapMatters.toFixed(1)}x where a gap matters and ${gapDoesNot.toFixed(1)}x where it does not; if the second is large the tell is decoration, if the first is small the axis is inert`);
}


console.log(`\n6. AND THE SAME SEED REPLAYS`);
{
  const trace = () => {
    let w = withCandidates(seedCrossing(9, LIMIT, { every: EVERY, control: TWO_WAY }), [{ id: "them", profile: "bold" }]);
    for (let i = 0; i < 1200; i++) w = keepDriving(step(w));
    return w.actors.map((a) => `${a.id}:${a.s.toFixed(6)}:${a.v.toFixed(6)}`).join("|");
  };
  trace() === trace()
    ? ok("the same seed and the same candidate replay to the same metre")
    : fail("two runs of one seed diverged, so nothing measured above can be trusted");
}


console.log("\n" + "=".repeat(70));
if (problems) { console.log(`FAILED: ${problems} problem(s).`); process.exit(1); }
console.log("OK: one driver model, one course, and each weakness showing as itself.");
console.log("\n   Stage 2's real test is somebody watching #/candidates and saying");
console.log("   which is which. Nothing here can do that for them.");
