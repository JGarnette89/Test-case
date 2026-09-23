/* Stage 3 of the rebuild, first increment: more than one intersection,
 * and the road between them.
 *
 * The thing being established is narrow and it is structural: a car that
 * leaves one intersection ARRIVES AT THE NEXT ONE AS THE SAME CAR. Until
 * now every arrival was created at the far end of an approach and
 * destroyed at the far end of its exit, so "the traffic" was a different
 * set of cars at every intersection and a candidate's course was the same
 * person being put back on a fresh leg.
 *
 * THE LINK IS NOT NEW GEOMETRY, which is what makes this cheap and is the
 * property worth checking hardest. The exit of one intersection and the
 * approach of the next are the same piece of road, so if the two are
 * placed `reach + reach` apart the paths meet exactly -- same metre, same
 * lane, same heading -- and nothing has to be stitched. A seam that is
 * even slightly out would show as a car teleporting, and a check that
 * only watched throughput would never see it.
 */
import {
  courseOf, seamsOf, laneIn, laneOut, joinedTo, poseOn, planRoute, walkRoute,
  roadsOf, alongDir, dirOut, radiusFor, OPPOSITE,
} from "../src/sim/course.js";
import { exitFor, tightestOf, intersectionFor } from "../src/sim/intersection.js";
import { POS_VISIBLE } from "../src/engine/faults.js";
import {
  withCandidates, keepDriving, toTell, tell, stillTellable, PROFILES,
} from "../src/sim/candidate.js";
import { noticing, mark, sheetFor, sectionDone, SECTION } from "../src/sim/marking.js";
import { REACTION_FLOOR } from "../src/engine/score.js";
import fs from "node:fs";
import {
  seedCourse, step, overlapping, whatStops, poseOf, reachFor, edgesOf, gapNeeded,
  strayOf, wideAt, seenBy, PERCEIVE, layoutOf, DT, CAR, ALL_WAY, TWO_WAY,
} from "../src/sim/crossing.js";
import {
  decide, wantedGap, PX_PER_M, underLoad, heldBy, weaveRoom, HARSH_AT, lagFor, timeToCover,
} from "../src/sim/traffic.js";
import { rng } from "../src/engine/index.js";
import { pressureOf, skillUnderPressure } from "../src/engine/directions.js";
import { severityOf } from "../src/engine/index.js";

let problems = 0;
const ok = (s) => console.log(`  ok   ${s}`);
const fail = (s) => { problems++; console.log(`  FAIL: ${s}`); };

console.log("\n" + "=".repeat(70));
console.log("SIM STAGE 3: two intersections, and the road between them");
console.log("=".repeat(70));

const LIMIT = 60, EVERY = 2.0, MINUTES = 6;
const TICKS = Math.round((MINUTES * 60) / DT);

console.log("\n1. THE ROADS ACTUALLY JOIN");
{
  for (const n of [2, 3]) {
    const course = courseOf({ n, kmh: LIMIT, control: TWO_WAY, reachFor });
    const seams = seamsOf(course);
    const worst = Math.max(...seams.map((x) => x.apart));
    const bent = Math.max(...seams.map((x) => x.turned));
    console.log(`   ${n} intersections at x = ${course.at.map((a) => a.at.x).join(", ")}` +
      ` — ${seams.length} seams, worst ${worst.toFixed(4)}m apart and ${bent.toFixed(2)} degrees out`);
    worst < 0.001 && bent < 0.01
      ? ok(`the end of one path is the start of the next, to the millimetre, in all ${seams.length} directions`)
      : fail(`a seam is ${worst.toFixed(3)}m and ${bent.toFixed(1)} degrees out, so a car crossing it teleports`);
  }

  /* AND THE LANE IS ONE LANE, which is what following across the boundary
     rests on. Two paths that share a piece of road have to agree they
     share it, or the car behind cannot see the car in front. */
  const course = courseOf({ n: 2, kmh: LIMIT, control: TWO_WAY, reachFor });
  const joined = laneOut(course, 0, "E") === laneIn(course, 1, "W")
    && laneOut(course, 1, "W") === laneIn(course, 0, "E")
    && laneOut(course, 0, "E") !== laneOut(course, 1, "W");
  joined
    ? ok("and the two of them name it the same lane, one identity each way")
    : fail("the exit of one and the approach of the next are not the same lane, so nobody follows anybody across the boundary");

  const edges = edgesOf(course);
  const inner = edges.filter((e) => joinedTo(course, e.k, e.side));
  console.log(`   traffic enters at ${edges.length} edge legs: ${edges.map((e) => e.k + e.side).join(", ")}`);
  inner.length === 0 && edges.length === 2 * 4 - 2
    ? ok("and traffic enters only where the course stops — never in the middle of a street between two intersections")
    : fail(`${inner.length} of ${edges.length} arrival legs have another intersection on the end of them, so cars are being conjured into the middle of a road`);
}


console.log("\n2. AND TRAFFIC ACTUALLY FLOWS ALONG THEM");
{
  const crossed = new Map();          // id -> how many boundaries they took
  let born = 0, gone = 0, goneInside = 0, overlaps = 0, worstPair = null;
  let jumped = 0, worstJump = 0;
  const seeds = [1, 2, 3];

  for (const seed of seeds) {
    let w = seedCourse(seed, LIMIT, { every: EVERY, control: TWO_WAY, n: 2 });
    const seen = new Map(w.actors.map((a) => [a.id, a]));
    for (let i = 0; i < TICKS; i++) {
      const was = new Map(w.actors.map((a) => [a.id, a]));
      const wasPose = new Map(w.actors.map((a) => [a.id, poseOn(w.course, a.k, a.route, a.s)]));
      w = step(w);
      if (i % 4 === 0) {
        const bad = overlapping(w);
        overlaps += bad.length;
        if (bad.length && !worstPair) worstPair = { seed, t: w.t, ...bad[0] };
      }
      for (const a of w.actors) {
        if (!seen.has(a.id)) born += 1;
        seen.set(a.id, a);
        const before = was.get(a.id);
        if (!before) continue;
        /* A HANDOFF MUST NOT MOVE THE CAR. It changes which intersection
           they are filed under and nothing else -- if the pose jumps, the
           seam is wrong and every number here is worthless. */
        if (before.k !== a.k) {
          crossed.set(a.id, (crossed.get(a.id) ?? 0) + 1);
          const now = poseOn(w.course, a.k, a.route, a.s);
          const then = wasPose.get(a.id);
          const moved = Math.hypot(now.x - then.x, now.y - then.y);
          /* One tick of travel is the honest allowance: they moved
             because time passed, not because they changed hands. */
          const travelled = a.v * DT + 0.05;
          if (moved > travelled) { jumped += 1; worstJump = Math.max(worstJump, moved - travelled); }
        }
      }
      for (const [id, a] of was) {
        if (w.actors.some((x) => x.id === id)) continue;
        gone += 1;
        /* Leaving is only allowed off the end of the world. */
        const path = w.course.at[a.k].layout.paths[a.route];
        if (joinedTo(w.course, a.k, path.to)) goneInside += 1;
      }
    }
  }

  const took = [...crossed.values()];
  console.log(`   ${born} cars joined, ${gone} left, ${took.length} of them crossed the boundary between the two`);
  console.log(`   ${took.filter((x) => x > 1).length} crossed more than once`);

  took.length > 20
    ? ok(`traffic flows from one intersection to the next as the same traffic: ${took.length} cars carried over, keeping their speed and their place in the queue`)
    : fail(`only ${took.length} cars crossed the boundary in ${seeds.length * MINUTES} intersection-minutes, so the two are not really joined`);

  jumped === 0
    ? ok("and a handoff moves nobody: crossing the boundary changes which intersection a car is filed under and nothing else")
    : fail(`${jumped} handoffs moved the car by up to ${worstJump.toFixed(2)}m more than it had time to travel — the seam is out and cars are teleporting across it`);

  goneInside === 0
    ? ok("and nobody vanishes mid-course: every car that left did so off the end of the world")
    : fail(`${goneInside} cars disappeared at a leg that has another intersection on the end of it, which is the old spawn-and-destroy model still running`);

  overlaps === 0
    ? ok(`nobody shares tarmac with anybody, across ${seeds.length * MINUTES} intersection-minutes of two joined intersections`)
    : fail(`${worstPair.a} and ${worstPair.b} are inside each other (seed ${worstPair.seed}, t ${worstPair.t.toFixed(1)}s). If it is at the boundary, following is not crossing it.`);
}


console.log("\n3. FOLLOWING CROSSES THE BOUNDARY, WHICH IS THE HARD PART");
{
  /* The failure this exists to catch is specific and silent: a car filed
     at one intersection cannot see the car in front of it filed at the
     next, so it closes the gap into nothing at exactly the moment the
     leader changes hands.

     THIS SECTION USED TO BE STATISTICAL AND IT PROVED NOTHING. It ran
     ordinary traffic and measured the closest any two cars came near the
     seam, which sounds reasonable and is not: with the cross-boundary
     rule DELETED ENTIRELY the same run still passed, because the seam
     sits in the middle of a 558m block where nothing queues, so the rule
     was never the binding constraint and its absence changed the worst
     gap from 10.04m to 8.46m. A check that passes with the mechanism
     removed is decoration. CLAUDE.md's own instruction: when a check
     passes on something you suspect, try to make it fail on purpose.

     So the situation is BUILT rather than waited for. Two cars, straddling
     the boundary, at a distance a driver would have to do something
     about -- and the question asked directly: does the one behind see the
     one in front at all? */
  const w = seedCourse(1, LIMIT, { every: EVERY, control: TWO_WAY, n: 2 });
  const reach = w.course.at[0].layout.place.reach;
  const seam = reach;                       // where the two roads meet, in x

  /* Eastbound: the follower is still finishing intersection 0's exit and
     the leader has already been handed to intersection 1. Both on the
     same lane, which is the whole point. */
  const put = (k, route, s, v) => ({
    id: `probe-${k}-${route}`, k, route, s, v, v0: LIMIT / 3.6, a: 0,
    caution: 1, headway: 0.7, brake: 2.7, weave: 0, weavePhase: 0,
    stoppedAt: null, going: false, accepted: false, n: 0,
  });

  for (const [name, back, front, dir] of [
    ["eastbound", put(0, "W/straight", 2 * reach - 2, 16), put(1, "W/straight", 10.5, 0), 1],
    ["westbound", put(1, "E/straight", 2 * reach - 2, 16), put(0, "E/straight", 10.5, 0), -1],
  ]) {
    const world = { ...w, actors: [back, front] };
    const seen = whatStops(back, world);
    const backAt = poseOf(world, back), frontAt = poseOf(world, front);
    const truly = Math.abs(frontAt.x - backAt.x) - CAR.length;
    console.log(`   ${name}: the one behind is at x=${backAt.x.toFixed(1)} filed at intersection ${back.k},` +
      ` the one in front at x=${frontAt.x.toFixed(1)} filed at ${front.k}` +
      ` — ${truly.toFixed(2)}m nose to tail across the seam at x=${seam}`);

    seen.leader && seen.leader.id === front.id
      ? ok(`${name}: the car behind sees the car in front even though they are filed at different intersections`)
      : fail(`${name}: the car behind sees ${seen.leader ? seen.leader.id : "nobody"} — it cannot see across the boundary, so it will drive into whoever crossed it`);

    Math.abs(seen.gap - truly) < 0.05
      ? ok(`${name}: and reads the gap as the real one, ${seen.gap.toFixed(2)}m against ${truly.toFixed(2)}m measured off the two poses`)
      : fail(`${name}: it reads the gap as ${seen.gap.toFixed(2)}m where the two cars are really ${truly.toFixed(2)}m apart`);

    /* And it has to ACT on it: a car doing 16 m/s two seconds behind
       something stationary brakes, and brakes hard. */
    const braking = decide(back, seen);
    braking < -2
      ? ok(`${name}: and brakes for it, at ${(-braking).toFixed(1)} m/s2 — the rule is load-bearing rather than merely present`)
      : fail(`${name}: it responds with ${braking.toFixed(2)} m/s2, so seeing the leader is not changing what it does`);
  }

  /* AND IT HAS TO BE THE BINDING CONSTRAINT SOMEWHERE, or it is correct
     and inert. Measured across four demands, it is inert at a TWO-WAY
     stop at every density tried -- 0.23% to 2.23% of car-ticks find a
     leader across the boundary and not one of them is inside the gap
     that driver wanted. The reason is the link length: a two-way
     approach is 279m because it has to hold the biggest gap anybody
     could ask for, so the block between boxes is 558m and a queue never
     reaches the seam.

     At an ALL-WAY stop the approach is 100m, the block is 200m, and the
     queues from the stop lines do reach across it -- so that is where
     the rule is asked to do something, and where this check watches. */
  let live = seedCourse(11, LIMIT, { every: 0.9, control: ALL_WAY, n: 2 });
  let sawAcross = 0, bound = 0, closest = Infinity;
  for (let i = 0; i < TICKS; i++) {
    live = step(live);
    if (i % 5) continue;
    for (const a of live.actors) {
      const view = whatStops(a, live);
      if (!view.leader || view.leader.id === "line") continue;
      if ((view.leader.k ?? 0) === (a.k ?? 0)) continue;
      sawAcross += 1;
      closest = Math.min(closest, view.gap);
      if (view.gap < wantedGap(a, view.leader)) bound += 1;
    }
  }
  console.log(`   under all-way traffic the rule finds a leader across the boundary ${sawAcross} times,` +
    ` and is the binding constraint on ${bound} of them; closest ${closest === Infinity ? "never" : closest.toFixed(1) + "m"}`);
  sawAcross > 0 && closest > 0
    ? ok(`it fires in real traffic without inventing anybody: ${sawAcross} sightings, never closer than ${closest.toFixed(1)}m`)
    : fail(sawAcross === 0
        ? "the rule never fired at all under ordinary traffic, so nothing here exercises it in the round"
        : `it reported a leader ${closest.toFixed(1)}m away, which is inside the car in front`);
  bound > 0
    ? ok(`and it is load-bearing rather than decorative: on ${bound} occasions the car across the boundary was the thing actually holding somebody back`)
    : fail("the rule never once decided anybody's speed, so it is correct and inert — find a case where it binds or stop claiming it matters");
}


console.log("\n4. AND EVERYBODY KEEPS RIGHT, THE WHOLE LENGTH OF THE COURSE");
{
  /* A cheap property with a wide net. Lane discipline over a course is
     the first thing a placement mistake breaks -- an intersection put
     down at the wrong offset, or a leg joined to the wrong side, shows
     up here long before it shows up as a collision.

     MEASURED FROM THE INTERSECTION THE LEG BELONGS TO rather than from
     the origin, which is a trap worth naming: a southbound lane at the
     intersection 558m along sits at x = 558 - 1.8, and comparing that
     against -1.8 reports every car in the course as being on the wrong
     side. The first version of this said 47,443 cars were, and all of
     them were fine. */
  let w = seedCourse(1, LIMIT, { every: EVERY, control: TWO_WAY, n: 3 });
  const wrong = [];
  let checked = 0;
  for (let i = 0; i < TICKS; i++) {
    w = step(w);
    for (const a of w.actors) {
      const p = poseOf(w, a);
      const home = w.course.at[a.k].at;
      const dx = p.x - home.x, dy = p.y - home.y;
      /* Clear of every box, because a car mid-turn is legitimately
         between lanes and nothing about it is a fault. */
      if (Math.abs(dx) < 12 && Math.abs(dy) < 12) continue;
      const rot = p.rot;
      const want =
        Math.abs(rot) < 1 ? ["y", dy, 1.8, "east"] :
        Math.abs(Math.abs(rot) - 180) < 1 ? ["y", dy, -1.8, "west"] :
        Math.abs(rot - 90) < 1 ? ["x", dx, -1.8, "south"] :
        Math.abs(rot + 90) < 1 ? ["x", dx, 1.8, "north"] : null;
      if (!want) continue;
      checked += 1;
      if (Math.abs(want[1] - want[2]) > 0.6) {
        wrong.push(`${a.id} ${a.route} at intersection ${a.k} heading ${want[3]} is ${want[1].toFixed(2)}m off the centre line, wanting ${want[2]}m`);
      }
    }
  }
  console.log(`   ${checked.toLocaleString()} readings on straight road across three intersections`);
  wrong.length === 0
    ? ok(`everybody keeps right, everywhere: ${checked.toLocaleString()} readings and not one car on the wrong side of a centre line`)
    : fail(`${wrong.length} readings have a car on the wrong side — ${wrong[0]}`);
}


console.log("\n5. AND THE APPROACH IS LONG ENOUGH THAT THE BOUNDARY DOES NOT MATTER");
{
  /* WHY IT IS SAFE TO FILE A CAR UNDER ONE INTERSECTION AT A TIME.

     `blockedBy` returns false for two cars at different intersections,
     which sounds like a hole: a driver waiting at intersection 1 has to
     yield to traffic coming from intersection 0, and that traffic is
     filed at 0 until it crosses the boundary.

     It is not a hole, and the reason is the approach length. An approach
     is sized to hold the longest gap anybody could need (DECISIONS.md
     5.13.12), so a car AT the boundary is already the full approach away
     from the next box -- and anything still filed at the previous
     intersection is further away than that. Traffic beyond the approach
     cannot change a gap decision, so ignoring it loses nothing.

     RE-DERIVED HERE RATHER THAN COMPARED WITH ITSELF. The first version
     of this section set the horizon to `reach` and then checked `reach`
     against it, which is a check that cannot fail -- worse than no check,
     because it reads like verification. The horizon below is built from
     `gapNeeded` and the geometry, the way a waiting driver arrives at it,
     and `reachFor` is not consulted. */
  const course = courseOf({ n: 2, kmh: LIMIT, control: TWO_WAY, reachFor });
  const speed = LIMIT / 3.6;
  const layout = course.at[1].layout;

  /* The most any driver could ask for: the slowest and most timid one,
     crossing the longest conflict region, against the fastest car that
     could be coming. `1.35 - 0.35 * caution` is the driver model's own
     wanted speed, read at both ends of the confidence axis. */
  const slowest = { v: 0, v0: speed * (1.35 - 0.35 * 2), caution: 2 };
  let worstRun = 0;
  for (const [key, path] of Object.entries(layout.paths)) {
    if (layout.place.control[path.from] !== "stop") continue;
    for (const [other, theirs] of Object.entries(layout.paths)) {
      if (layout.place.control[theirs.from] === "stop") continue;
      const meet = layout.conflicts[other + "|" + key];
      if (!meet) continue;
      worstRun = Math.max(worstRun, meet.clearOf - (path.stopAt - CAR.length / 2));
    }
  }
  const seconds = gapNeeded(slowest, worstRun);
  const horizon = seconds * speed * 1.35;             // metres of oncoming road
  const reach = layout.place.reach;
  console.log(`   the longest crossing anybody waits for is ${worstRun.toFixed(1)}m, which is ${seconds.toFixed(1)}s for the most timid driver`);
  console.log(`   that is ${horizon.toFixed(0)}m of oncoming road; the approach is ${reach}m (${(reach / speed).toFixed(1)}s at the limit)`);

  reach >= horizon - 1
    ? ok(`the approach covers the whole gap horizon, so nothing filed at the previous intersection is ever inside anybody's decision — ${reach}m against ${horizon.toFixed(0)}m needed`)
    : fail(`the approach is ${reach}m against a ${horizon.toFixed(0)}m gap horizon, so a driver at the next intersection is deciding without seeing traffic that matters to them. Filing cars by intersection is only safe while this holds.`);
}


console.log("\n6. AND THE SAME SEED REPLAYS");
{
  const trace = (n) => {
    let w = seedCourse(5, LIMIT, { every: EVERY, control: TWO_WAY, n: 2 });
    for (let i = 0; i < n; i++) w = step(w);
    return w.actors.slice().sort((a, b) => (a.id < b.id ? -1 : 1))
      .map((a) => `${a.id}@${a.k}:${a.route}:${a.s.toFixed(6)}:${a.v.toFixed(6)}`).join("|");
  };
  trace(1500) === trace(1500)
    ? ok("the same seed replays to the same metre, across the boundary and back")
    : fail("two runs of one seed diverged, so nothing measured here can be trusted");
}


console.log("\n7. A GRID, AND A CANDIDATE WHO DRIVES THE ROUTE THEY WERE GIVEN");
{
  /* WHY A GRID AT ALL. On a row every turn leaves the world, so the only
     route expressible is a straight line -- which is not a course, it is
     a corridor, and no instruction given on it could ever be wrong. A
     course you cannot be given directions through is not a course. */
  const course = courseOf({ cols: 3, rows: 2, kmh: LIMIT, control: TWO_WAY, reachFor });
  const seams = seamsOf(course);
  const worst = Math.max(...seams.map((x) => x.apart));
  const bent = Math.max(...seams.map((x) => x.turned));
  console.log(`   ${course.cols}x${course.rows} at ${course.at.map((a) => `(${a.at.x},${a.at.y})`).join(" ")}`);
  console.log(`   ${course.links.length} links, ${seams.length} seams, worst ${worst.toFixed(4)}m apart and ${bent.toFixed(2)} degrees out`);
  worst < 0.001 && bent < 0.01
    ? ok(`the same placement rule works in both axes: ${seams.length} seams across a grid, none of them out`)
    : fail(`a north-south seam is ${worst.toFixed(3)}m and ${bent.toFixed(1)} degrees out — the vertical placement does not match the horizontal one`);

  /* AND THE TWO AXES ARE DIFFERENT LANES. Naming a link's two directions
     by which intersection has the lower index would give the east-west
     and north-south links the same names, because the western neighbour
     and the northern one both have the lower index. */
  const mixed = laneOut(course, 0, "E") === laneOut(course, 0, "S")
    || laneIn(course, 0, "E") === laneIn(course, 0, "S");
  !mixed && laneOut(course, 0, "S") === laneIn(course, 3, "N")
    ? ok("and a north-south lane is its own lane, shared with the intersection below and with nobody else")
    : fail("the two axes are naming the same lane, so cars on one road would follow cars on the other");

  /* --- a plan is only ever offered turns the geometry has --- */
  let asked = 0, impossible = 0;
  for (let seed = 1; seed <= 40; seed++) {
    for (const start of edgesOf(course)) {
      const { plan } = planRoute(course, { from: start, seed });
      let k = start.k, side = start.side;
      for (const intent of plan) {
        asked += 1;
        const j = joinedTo(course, k, exitFor(side, intent));
        if (!j) { impossible += 1; break; }
        k = j.k; side = j.side;
      }
    }
  }
  console.log(`   ${asked} instructions planned across 40 seeds from every edge of the course`);
  impossible === 0
    ? ok(`a route never asks for a turn into nothing: all ${asked} of them lead to another intersection`)
    : fail(`${impossible} of ${asked} planned instructions turn into a leg with nothing on the end of it`);

  /* --- and the candidate drives it --- */
  let drove = 0, wandered = 0, longest = 0, ranOut = 0;
  for (const seed of [2, 3, 4]) {
    let w = seedCourse(seed, LIMIT, { every: 3.0, control: TWO_WAY, cols: 3, rows: 2 });
    w = withCandidates(w, [{ id: "X", profile: "sound", planned: true }]);
    const me = w.actors.find((a) => a.candidate === "X");
    const told = walkRoute(w.course, { from: { k: me.k, side: me.route.split("/")[0] }, plan: me.plan });
    const went = [];
    let last = null, trip = me.trip;
    for (let i = 0; i < Math.round(500 / DT); i++) {
      w = step(w);
      const a = w.actors.find((x) => x.candidate === "X");
      if (!a || a.trip !== trip) break;        // they finished; a new trip is a new route
      const key = `${a.k}:${a.route}`;
      if (key !== last) { went.push(key); last = key; }
    }
    drove += 1;
    longest = Math.max(longest, went.length);
    const strayed = went.findIndex((x, i) => !told[i] || `${told[i].k}:${told[i].route}` !== x);
    if (strayed >= 0) {
      wandered += 1;
      console.log(`   seed ${seed}: told ${told.slice(0, 8).map((x) => x.k + ":" + x.route).join(" -> ")}`);
      console.log(`   seed ${seed}: went ${went.slice(0, 8).join(" -> ")}`);
    }
    if (went.length > me.plan.length) ranOut += 1;
  }
  wandered === 0
    ? ok(`and the candidate drives the route they were given, ${drove} of ${drove} times, up to ${longest} intersections without a wrong turn`)
    : fail(`${wandered} of ${drove} candidates went somewhere they were not told to — a plan that the driver does not follow is not a route`);

  /* SILENCE MEANS STRAIGHT ON, and it has to be checked rather than
     assumed because it is the rule that makes a LATE instruction a
     missed turn rather than a pause (CLAUDE.md, Directions). A plan that
     runs out is the same thing as an examiner who has stopped talking. */
  ranOut > 0
    ? ok(`and when the instructions run out they carry straight on, which is what makes a late one a missed turn rather than a pause`)
    : fail("no candidate ever outdrove their plan, so 'silence means straight on' is untested here");

  /* And the same seed plans the same route, or two candidates being
     compared are not on the same course after all. */
  const twice = (s) => JSON.stringify(planRoute(course, { from: edgesOf(course)[0], seed: s }).plan);
  twice(9) === twice(9)
    ? ok("and a seed plans one route: the same drive replays for anybody given it")
    : fail("planning the same route twice gave two answers");
}


console.log("\n8. AND THE EXAMINER CAN GIVE THE DIRECTIONS");
{
  /* One of the examiner's four jobs, and the first the rebuild can do.
     Three rules carry it and all three are checked here rather than
     asserted:

       silence means straight on;
       an instruction has a deadline, not a window;
       and a late instruction is the EXAMINER'S fault.

     The third is why the second matters. Being busy with one job makes
     you late with another, and the error that follows is then yours and
     unmarkable -- which is the interlock that makes four systems a game
     rather than four scoreboards. */
  const start = () => withCandidates(
    seedCourse(2, LIMIT, { every: 3.0, control: TWO_WAY, cols: 3, rows: 2 }),
    [{ id: "X", profile: "sound" }],
  );

  /* --- told nothing --- */
  {
    let w = start();
    const me = w.actors.find((a) => a.candidate === "X");
    console.log(`   told nothing, a candidate enters at intersection ${me.k} from the ${me.route.split("/")[0]}`);
    const went = [];
    let last = null;
    for (let i = 0; i < Math.round(400 / DT); i++) {
      w = keepDriving(step(w));
      const a = w.actors.find((x) => x.candidate === "X");
      if (!a || a.trip !== me.trip) break;
      const key = `${a.k}:${a.route}`;
      if (key !== last) { went.push(key); last = key; }
    }
    const allStraight = went.every((x) => x.endsWith("/straight"));
    console.log(`   and drives ${went.join(" -> ")}`);
    allStraight && went.length > 1
      ? ok(`silence means straight on: a candidate told nothing crossed ${went.length} intersections and turned at none of them`)
      : fail(`a candidate told nothing turned somewhere — ${went.join(" -> ")} — so silence is not straight on and a late instruction would be a pause rather than a missed turn`);
  }

  /* --- told in time --- */
  {
    let w = start();
    const ahead = toTell(w, "X");
    console.log(`   the examiner is offered ${ahead.map((x) => `leg ${x.at} (${x.distance} ahead)`).join(", ")}`);
    ahead.every((x) => x.told === null)
      ? ok("and a candidate starts with nothing told, so the instructions are the examiner's to give rather than the course's to know")
      : fail("the candidate already knows where to go, so nothing the examiner does can matter");

    w = tell(w, "X", 1, "left");
    const went = [];
    let last = null, trip = w.actors.find((a) => a.candidate === "X").trip;
    for (let i = 0; i < Math.round(400 / DT); i++) {
      w = keepDriving(step(w));
      const a = w.actors.find((x) => x.candidate === "X");
      if (!a || a.trip !== trip) break;
      const key = `${a.k}:${a.route}`;
      if (key !== last) { went.push(key); last = key; }
    }
    console.log(`   told "left" for the second intersection, drives ${went.join(" -> ")}`);
    went.length > 1 && went[1].endsWith("/left")
      ? ok("an instruction given in time is followed, at the intersection it was given for")
      : fail(`the candidate did not take the turn they were told to: ${went.join(" -> ")}`);
  }

  /* --- told too late --- */
  {
    let w = start();
    let refusedAt = null, wentStraight = null, trip = w.actors.find((a) => a.candidate === "X").trip;
    for (let i = 0; i < Math.round(400 / DT); i++) {
      w = keepDriving(step(w));
      const a = w.actors.find((x) => x.candidate === "X");
      if (!a || a.trip !== trip) break;
      /* Say it once they are already there, which is the whole point. */
      if ((a.leg ?? 0) === 1 && refusedAt === null) {
        refusedAt = stillTellable(w, "X", 1);
        const before = JSON.stringify(a.plan ?? []);
        w = tell(w, "X", 1, "left");
        const after = JSON.stringify(w.actors.find((x) => x.candidate === "X").plan ?? []);
        wentStraight = before === after && w.course.at[a.k].layout.paths[a.route].intent === "straight";
      }
    }
    refusedAt === false && wentStraight
      ? ok("and one given after they are already there is not an instruction at all: they carried straight on, which is the examiner's fault rather than the candidate's")
      : fail("an instruction given after the candidate had already committed was accepted, so lateness costs nothing and the four jobs cannot make each other fail");
  }

  /* --- and the deadline is the loosest TRUE one, said out loud --- */
  {
    const w = start();
    const me = w.actors.find((a) => a.candidate === "X");
    const path = w.course.at[me.k].layout.paths[me.route];
    const notice = path.length / Math.max(1, me.v0);
    console.log(`   the deadline today is the handoff, which allows ${notice.toFixed(0)}s of notice on a ${path.length.toFixed(0)}m leg`);
    notice > 5
      ? ok(`the deadline is real but generous — it is the tick the plan is read, and it will only ever move EARLIER once a turn has a speed to slow for (DECISIONS.md 5.15.13)`)
      : fail(`only ${notice.toFixed(1)}s of notice, which is not a deadline anybody could work with`);
  }
}


console.log("\n9. DEFERRED MARKING, AND THE SECTION SHEET");
{
  /* `detect.js` comes across unchanged and is fed what the sim already
     derives. What is checked here is not `detect.js` -- verify-detect
     does that -- but the HANDOFF: that the sim's faults arrive in the
     shape it grades, that marks pair with them, that the directions are
     graded against the set course, and that the whole thing is
     deterministic. */
  const drive = (profile, examiner, seconds = 300, seed = 4) => {
    let w = withCandidates(
      seedCourse(seed, LIMIT, { every: 4.0, control: TWO_WAY, cols: 3, rows: 2 }),
      [{ id: "X", profile }],
    );
    const out = { sheets: [], faults: {}, marks: 0 };
    let section = { trip: -1, from: 1 }, known = 0;
    for (let i = 0; i < Math.round(seconds / DT); i++) {
      w = noticing(keepDriving(step(w)));
      const a = w.actors.find((x) => x.candidate === "X");
      /* Grade the section being tracked FIRST -- it fills, or the drive
         ends with legs in it, which is what a drive nobody directed looks
         like -- and only then notice that a new trip has begun. The other
         order loses the last section of every drive. */
      const done = section.trip >= 0 && sectionDone(w, "X", section.from, section.trip);
      if (done) {
        const sheet = sheetFor(w, "X", { from: section.from, trip: done.trip });
        if (sheet) out.sheets.push(sheet);
        section = done.ended ? { trip: -1, from: 1 } : { ...section, from: section.from + SECTION };
      }
      if (a) {
        if (a.trip !== section.trip) section = { trip: a.trip, from: 1 };
        w = examiner(w, a, (w.faults ?? []).slice(known));
        known = (w.faults ?? []).length;
      }
    }
    for (const f of w.faults ?? []) if (f.who === "X") out.faults[f.trait] = (out.faults[f.trait] ?? 0) + 1;
    out.marks = (w.marks ?? []).length;
    return out;
  };
  const tot = (sheets, f) => sheets.reduce((t, s) => t + f(s), 0);

  /* EXAMINERS, as functions of the world. A perfect one marks every
     fault as soon as a person could (REACTION_FLOOR after it begins) and
     gives every direction the moment it can be given; a silent one does
     nothing; a spraying one marks every tick. */
  const directs = (w, a) => {
    for (const slot of toTell(w, "X", 2)) {
      if (slot.told === null) w = tell(w, "X", slot.at, a.wanted[slot.at] ?? "straight");
    }
    return w;
  };
  const perfect = (w, a, fresh) => {
    w = directs(w, a);
    /* A fault that began REACTION_FLOOR ago is the earliest anybody could
       call; call it now, once. */
    for (const f of w.faults ?? []) {
      if (f.who !== "X" || f.called) continue;
      if (w.t >= f.from + REACTION_FLOOR + DT) {
        w = mark(w, "X");
        w = { ...w, faults: w.faults.map((x) => (x === f ? { ...x, called: true } : x)) };
      }
    }
    return w;
  };
  const silent = (w, a) => directs(w, a);
  const spraying = (w, a) => mark(directs(w, a), "X");
  const mute = (w) => w;                       // no directions at all

  /* --- a clean driver gives a clean sheet --- */
  const sound = drive("sound", perfect);
  console.log(`   sound driver, perfect examiner: ${sound.sheets.length} sheets, faults ${JSON.stringify(sound.faults)}`);
  sound.sheets.length >= 1 && sound.sheets.every((s) => s.result.score === 100 && s.directionsOnYou === 0)
    ? ok(`a sound driver directed on time is a clean sheet: ${sound.sheets.length} sections, every one scored 100 with nothing on the examiner`)
    : fail(`a sound driver produced a marked sheet — ${sound.sheets.map((s) => s.result.score).join(", ")} — so something is being charged that did not happen`);

  /* --- a weak axis shows on the sheet, in detect.js's own shape --- */
  const rolled = drive("unschooled", perfect);
  const hits = tot(rolled.sheets, (s) => s.result.hits.length);
  const missed = tot(rolled.sheets, (s) => s.result.missed.length);
  console.log(`   unschooled driver, perfect examiner: faults ${JSON.stringify(rolled.faults)}, ${hits} caught, ${missed} missed across ${rolled.sheets.length} sheets`);
  (rolled.faults.rollingStop ?? 0) > 0 && hits > 0 && missed === 0
    ? ok(`an unschooled driver's rolling stops reach the sheet and a prompt examiner catches all of them: ${hits} caught, none missed`)
    : fail(`rolling stops did not reach the sheet as catchable faults (${rolled.faults.rollingStop ?? 0} derived, ${hits} caught, ${missed} missed)`);

  /* --- and the three examiner failures cost what they should --- */
  const quiet = drive("unschooled", silent);
  const quietMissed = tot(quiet.sheets, (s) => s.result.missed.length);
  quietMissed > 0 && quiet.sheets.some((s) => s.result.score < 100)
    ? ok(`a silent examiner misses them: ${quietMissed} missed, and the sheet says so`)
    : fail("an examiner who marked nothing was not charged for the faults they let go");

  const spray = drive("unschooled", spraying, 300);
  const invented = tot(spray.sheets, (s) => s.result.invented.length);
  invented > 20 && spray.sheets.length > 0 && spray.sheets.every((s) => s.result.score === 0)
    ? ok(`and spraying marks is charged for every one that landed on nothing: ${invented} invented across ${spray.sheets.length} sheets, all scored 0`)
    : fail(`marking every tick scored ${spray.sheets.map((s) => s.result.score).join(", ")} with ${invented} invented — inventing faults has to cost or the strategy is to mark everything`);

  const deaf = drive("sound", mute);
  const onYou = tot(deaf.sheets, (s) => s.directionsOnYou);
  const turnsWanted = tot(deaf.sheets, (s) => s.calls.filter((c) => c.wanted !== "straight").length);
  console.log(`   sound driver, no directions: ${turnsWanted} turns wanted across ${deaf.sheets.length} sheets, ${onYou} on the examiner`);
  onYou === turnsWanted && turnsWanted > 0
    ? ok(`and every direction never given for a turn the course wanted lands on the examiner — ${onYou} of ${turnsWanted} — because silence meant straight on and the candidate did as told`)
    : fail(`${onYou} directions on the examiner against ${turnsWanted} turns the course wanted; a missed turn nobody called for is being blamed on the wrong person`);

  /* --- what the sheet can see today, and what it cannot --- */
  const src = fs.readFileSync(new URL("../src/sim/marking.js", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  const traits = [...src.matchAll(/trait: "([a-zA-Z]+)"/g)].map((m) => m[1]);
  const named = [...new Set(traits)].sort();
  console.log(`   faults the sheet can derive today: ${named.join(", ")}`);
  JSON.stringify(named) === JSON.stringify(["harshBraking", "rollingStop", "undueDelay", "wideLine"])
    ? ok("the sheet derives exactly the four faults the sim holds as physical quantities, and nothing it would have to author")
    : fail(`the sheet derives ${named.join(", ")}, which is not the list this stage can honestly stand behind`);
  /* The wide line is judged against the old engine's visibility floor,
     IMPORTED. A second 0.45 written here would be the two-implementations
     bug; and the floor must not be lowered to make a fault appear. */
  /POS_VISIBLE \/ PX_PER_M/.test(src) && !/0\.45/.test(src.replace(/\/\/.*$/gm, ""))
    ? ok("lane-keeping is judged against POS_VISIBLE imported from faults.js, not a second copy of the number")
    : fail("marking.js restates the visibility floor instead of importing it, or lowered it");

  /* --- and it replays --- */
  const twice = () => JSON.stringify(drive("unschooled", perfect, 200).sheets.map((s) => [s.result.score, s.result.hits.length, s.directionsOnYou]));
  twice() === twice()
    ? ok("the same seed produces the same sheet")
    : fail("two runs of one seed produced different sheets, so nothing graded here can be trusted");
}


console.log("\n10. THE ROAD IS DRAWN FROM THE PATH");
{
  /* Section 0's rule, made checkable: whatever the renderer draws the
     road from has to contain every place a car can be. `roadsOf` is what
     both screens stroke, so the property is asked of it directly rather
     than of a screenshot -- and asked at FULL STRAY, because the stroke
     has to hold a car that is off its line, not only one on it. */
  const distToPoly = (p, pts) => {
    let best = Infinity;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], vx = b.x - a.x, vy = b.y - a.y;
      const L = vx * vx + vy * vy || 1;
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / L));
      best = Math.min(best, Math.hypot(p.x - (a.x + vx * t), p.y - (a.y + vy * t)));
    }
    return best;
  };
  const half = intersectionFor().lane;      // two lanes of road: half of it is a lane
  const stray = POS_VISIBLE / PX_PER_M;     // the most a car is ever off its line on a straight
  for (const bends of [0, 1]) {
    const w = seedCourse(3, LIMIT, { every: 3.0, control: TWO_WAY, cols: 3, rows: 2, bends });
    const roads = roadsOf(w.course);
    let worst = -Infinity, samples = 0;
    for (const spot of w.course.at) {
      const { lineAt } = spot.layout.place;
      for (const [key, path] of Object.entries(spot.layout.paths)) {
        for (let s = 0; s <= path.length; s += 2) {
          const p = poseOn(w.course, spot.k, key, s);
          /* The legs only. The corners are the turn arcs, whose radius is
             DECISIONS.md 5.15.12's open question and not the road's. */
          if (Math.max(Math.abs(p.x - spot.at.x), Math.abs(p.y - spot.at.y)) < lineAt) continue;
          samples++;
          /* The car's far side at full stray, against the drawn edge. */
          worst = Math.max(worst, Math.min(...roads.map((r) => distToPoly(p, r.pts))) + CAR.width / 2 + stray - half);
        }
      }
    }
    const pts = roads.reduce((t, r) => t + r.pts.length, 0);
    console.log(`   bends=${bends}: ${roads.length} roads, ${pts} points; ${samples} path samples on the legs, a car at full stray reaches ${(-worst).toFixed(3)}m short of the drawn edge at worst`);
    worst <= 1e-6
      ? ok(`every point a car can reach on a leg is on the drawn road, with ${(-worst).toFixed(2)}m to spare at full stray (bends=${bends})`)
      : fail(`a car can be ${worst.toFixed(2)}m off the drawn road (bends=${bends}): the screen cannot express where the engine put it`);
    if (!bends) {
      /* A link's road has a vertex at the seam; straight means collinear,
         not two points. */
      const straight = roads.every((r) => r.pts.every((q, i) => i < 2
        || Math.abs((q.x - r.pts[0].x) * (r.pts[1].y - r.pts[0].y) - (q.y - r.pts[0].y) * (r.pts[1].x - r.pts[0].x)) < 1e-6));
      straight
        ? ok("and a straight course draws as straight lines, which is the rectangle each road replaced")
        : fail("a straight course produced a bent road polyline");
    }
  }
}

console.log("\n11. THE BEND");
{
  /* --- nothing bends unless asked: every course that existed is the same course --- */
  const before = seedCourse(4, LIMIT, { every: 3.0, control: TWO_WAY, cols: 3, rows: 2 });
  const explicit = seedCourse(4, LIMIT, { every: 3.0, control: TWO_WAY, cols: 3, rows: 2, bends: 0 });
  const paths = (w) => JSON.stringify(w.course.at.map((a) => a.layout.paths));
  paths(before) === paths(explicit) && before.course.at.every((a) => Object.values(a.layout.paths).every((p) => p.intent !== "straight" || p.pts.length === 4))
    ? ok("with no bends asked for, every straight path is the same four points it always was")
    : fail("the bend changed a course that did not ask for one");

  /* --- as tight as the road's speed allows, and no tighter --- */
  const bent = seedCourse(4, LIMIT, { every: 3.0, control: TWO_WAY, cols: 3, rows: 2, bends: 1 });
  const place = bent.course.at[0].layout.place;
  const want = radiusFor(LIMIT / 3.6);
  const radii = bent.course.links.map((l) => tightestOf(place.reach, place.lineAt, Math.abs(l.bend)));
  console.log(`   ${bent.course.links.length} links bent by ${bent.course.links.map((l) => l.bend.toFixed(1)).join(", ")}m; tightest ${radii.map((r) => r.toFixed(1)).join(", ")}m against ${want.toFixed(1)}m wanted`);
  radii.every((r) => Math.abs(r - want) < 0.5)
    ? ok(`every bend is exactly as tight as a ${LIMIT} km/h road allows: ${want.toFixed(0)}m, from the speed and one design constant`)
    : fail("a bend's radius is not the one derived from the road speed");

  /* --- the seams are still exact, and the road is straight through them --- */
  const seams = seamsOf(bent.course);
  const apart = Math.max(...seams.map((s) => s.apart)), turned = Math.max(...seams.map((s) => s.turned));
  apart < 1e-9 && turned < 1e-9
    ? ok(`with every link bent the ${seams.length} seams are exact: ${apart.toExponential(1)}m apart, ${turned.toExponential(1)} degrees out`)
    : fail(`a bent link's seam is ${apart}m and ${turned} degrees out`);

  /* --- alongDir across a seam: the projection error where following actually uses it --- */
  {
    const c = bent.course;
    const link = c.links[0];
    const out = c.at[link.a].layout.paths[`${OPPOSITE[link.aSide]}/straight`];   // leaves by aSide
    const dir = dirOut(link.aSide);
    let worst = 0;
    for (let back = 2; back <= 60; back += 2) {
      for (let gap = back + 2; gap <= 60; gap += 2) {
        const me = poseOn(c, link.a, `${out.from}/${out.intent}`, out.length - back);
        const them = poseOn(c, link.b, `${link.bSide}/straight`, gap - back);
        const read = alongDir(them, dir) - alongDir(me, dir);
        worst = Math.max(worst, gap - read);
      }
    }
    console.log(`   across the seam of a bent link, gaps up to 60m read short by at most ${worst.toFixed(3)}m`);
    worst >= 0 && worst < 0.5
      ? ok("the straight-lane projection following uses across a boundary is within half a metre on any gap it would act on, and only ever reads SHORT")
      : fail(`alongDir misreads a cross-boundary gap by ${worst.toFixed(2)}m on a bend; following needs distance along the lane here`);
  }

  /* --- traffic on it: nobody through anybody, with candidates aboard --- */
  {
    let hits = 0, cars = 0;
    for (const seed of [4, 5]) {
      let w = withCandidates(seedCourse(seed, LIMIT, { every: 3.0, control: TWO_WAY, cols: 3, rows: 2, bends: 1 }), [{ id: "X", profile: "ragged" }]);
      for (let i = 0; i < Math.round(200 / DT); i++) { w = keepDriving(step(w)); hits += overlapping(w).length; cars = Math.max(cars, w.actors.length); }
    }
    hits === 0
      ? ok(`two seeds, every link bent, a ragged candidate aboard, 400s of traffic (up to ${cars} cars): nobody drove through anybody`)
      : fail(`${hits} overlapping car-ticks on the bent course`);
  }

  /* --- THE WIDE LINE: the steering axis, markable at last, and only here --- */
  const floor = POS_VISIBLE / PX_PER_M;
  const stray = (profile, bends, seed = 4, seconds = 240) => {
    let w = withCandidates(seedCourse(seed, LIMIT, { every: 3.0, control: TWO_WAY, cols: 3, rows: 2, bends }), [{ id: "X", profile }]);
    let worst = 0, bendsMet = 0, onBend = false;
    for (let i = 0; i < Math.round(seconds / DT); i++) {
      w = noticing(keepDriving(step(w)));
      const a = w.actors.find((x) => x.candidate === "X");
      if (!a) continue;
      worst = Math.max(worst, Math.abs(strayOf(w, a)));
      const now = wideAt(w, a) > 0;
      if (now && !onBend) bendsMet++;
      onBend = now;
    }
    const showings = (w.faults ?? []).filter((f) => f.trait === "wideLine");
    return { worst, showings, bendsMet };
  };
  const sS = stray("sound", 0), sB = stray("sound", 1), rS = stray("ragged", 0), rB = stray("ragged", 1);
  console.log(`   worst stray: sound ${sS.worst.toFixed(3)} / ${sB.worst.toFixed(3)}m, ragged ${rS.worst.toFixed(3)} / ${rB.worst.toFixed(3)}m (straight / bent), floor ${floor.toFixed(2)}m`);
  rS.worst <= floor && rS.showings.length === 0
    ? ok(`on a straight road even the ragged driver stays under the floor (${rS.worst.toFixed(3)}m): the weave alone is never a markable fault, as before`)
    : fail("the weave alone cleared the visibility floor on a straight road, which the bound says it cannot");
  rB.worst > floor && rB.showings.length > 0
    ? ok(`on the bend the same driver runs wide to ${rB.worst.toFixed(3)}m and the sheet derives ${rB.showings.length} wideLine showings`)
    : fail("the ragged driver's wide line did not clear the floor on a bend, so steering is still unmarkable");
  sB.showings.length === 0 && sB.worst < floor / 2
    ? ok(`and a sound driver on the same bends shows nothing (${sB.worst.toFixed(3)}m): the bend is the occasion, the deficit is the cause`)
    : fail("a sound driver was derived a wide line, so the bend is being marked rather than the driver");
  rB.worst <= 2 * floor + 1e-6
    ? ok(`the wide line is bounded: at the worst of the axis the stray is ${rB.worst.toFixed(3)}m, the car's side on the centre line and no further`)
    : fail(`the stray reached ${rB.worst.toFixed(2)}m, past the room the other lane leaves`);
  /* One showing per right-hand bend: the fault is the bend being driven
     wide, not the sinusoid crossing the floor. */
  console.log(`   ragged on the bent course: ${rB.bendsMet} right-hand bends met, ${rB.showings.length} showings, lengths ${rB.showings.map((f) => ((f.to ?? f.over) - f.from).toFixed(1)).join("/")}s`);
  rB.showings.length <= rB.bendsMet && rB.showings.every((f) => (f.to ?? f.over) - f.from > 1)
    ? ok("one showing per bend at most, each lasting seconds rather than a flicker of the weave")
    : fail("the wide line is being derived per weave crossing rather than per bend");
  /* THE SABOTAGE: the fault must vanish with its cause. Same seed, same
     course, same everything, one rating changed. */
  const ragged = PROFILES.find((p) => p.id === "ragged"), sound = PROFILES.find((p) => p.id === "sound");
  const onlySteering = Object.keys(ragged.ratings).every((k) => k === "steering" || ragged.ratings[k] === sound.ratings[k]);
  onlySteering && rB.showings.length > 0 && sB.showings.length === 0
    ? ok("strip the steering deficit -- the only rating the two profiles differ on -- and every wideLine showing vanishes: derived, not authored")
    : fail("the controlled comparison is not controlled: the profiles differ on more than steering, or the fault survived its cause being removed");

  /* --- and it reaches the sheet --- */
  {
    let w = withCandidates(seedCourse(4, LIMIT, { every: 3.0, control: TWO_WAY, cols: 3, rows: 2, bends: 1 }), [{ id: "X", profile: "ragged" }]);
    let sheets = [], section = { trip: -1, from: 1 };
    for (let i = 0; i < Math.round(300 / DT); i++) {
      w = noticing(keepDriving(step(w)));
      const a = w.actors.find((x) => x.candidate === "X");
      if (!a) continue;
      if (a.trip !== section.trip) section = { trip: a.trip, from: 1 };
      for (const slot of toTell(w, "X", 2)) if (slot.told === null) w = tell(w, "X", slot.at, a.wanted[slot.at] ?? "straight");
      for (const f of w.faults ?? []) {
        if (f.who !== "X" || f.called || w.t < f.from + REACTION_FLOOR + DT) continue;
        w = mark(w, "X");
        w = { ...w, faults: w.faults.map((x) => (x === f ? { ...x, called: true } : x)) };
      }
      const done = sectionDone(w, "X", section.from, section.trip);
      if (done) { const sheet = sheetFor(w, "X", { from: section.from, trip: done.trip }); if (sheet) sheets.push(sheet); section = done.ended ? { trip: -1, from: 1 } : { ...section, from: section.from + SECTION }; }
    }
    const caught = sheets.reduce((t, s) => t + s.result.hits.filter((h) => h.fault.trait === "wideLine").length, 0);
    const missed = sheets.reduce((t, s) => t + s.result.missed.filter((f) => f.trait === "wideLine").length, 0);
    caught > 0 && missed === 0
      ? ok(`a prompt examiner catches every wide line on the sheet: ${caught} caught, ${missed} missed across ${sheets.length} sections`)
      : fail(`the wide line reached the sheet as ${caught} caught and ${missed} missed`);
  }
}

console.log("\n12. A LOADED DRIVER IS A WORSE DRIVER");
{
  /* The other half of directions.js, and the trade the directions
     mechanic rests on: calling ahead buys the candidate time and costs
     their concentration. What is checked is that the cost is real, that
     it is the old engine's own curve rather than a second one, that it
     is bounded by what already bounded each axis, and that a driver with
     nothing held has not moved by a byte. */
  const fresh = () => withCandidates(
    seedCourse(4, LIMIT, { every: 3.0, control: TWO_WAY, cols: 3, rows: 2, bends: 1 }),
    [{ id: "X", profile: "ragged" }],
  );
  const w0 = fresh();
  const a0 = w0.actors.find((x) => x.candidate === "X");
  underLoad(a0, w0.road) === a0 && w0.actors.every((a) => underLoad(a, w0.road) === a)
    ? ok("with nothing held every actor's loaded view IS the actor: the traffic, and a candidate told nothing, are unmoved by a byte")
    : fail("an actor with nothing held came back changed, so the mechanic is not free in the common case");

  const w3 = tell(tell(tell(w0, "X", 1, "left"), "X", 2, "right"), "X", 3, "straight");
  const a3 = w3.actors.find((x) => x.candidate === "X");
  const v3 = underLoad(a3, w3.road);
  console.log(`   told three ahead: holding ${heldBy(a3)}, composure ${v3.composure.toFixed(3)}; weave ${a3.weave.toFixed(3)} -> ${v3.weave.toFixed(3)}m, planned braking ${a3.brake.toFixed(2)} -> ${v3.brake.toFixed(2)} m/s^2`);
  heldBy(a3) === 2 && v3.composure === skillUnderPressure(1, pressureOf(2))
    ? ok("told three ahead a candidate carries two -- the next one is never carried -- and their composure is directions.js's own curve, imported, not restated")
    : fail(`held ${heldBy(a3)} with composure ${v3.composure} against ${skillUnderPressure(1, pressureOf(2))} from directions.js`);
  v3.weave > a3.weave && v3.brake > a3.brake
    ? ok("and the load amplifies the weaknesses they have: the weave and the planned braking both grew")
    : fail("the load did not amplify a weak axis");
  underLoad(v3, w3.road) === v3
    ? ok("loading a loaded view is the identity, so a view passed through several hands in one tick is loaded once")
    : fail("underLoad is not idempotent: the load compounds");

  /* Bounded by what bounded each axis unloaded, at the worst of every
     axis and the heaviest load. */
  const worst = { ...a3, caution: 0.0, weave: weaveRoom(w3.road.lane), brake: HARSH_AT, plan: ["l", "l", "l", "l", "l"], leg: 0 };
  const vw = underLoad(worst, w3.road);
  const timidest = underLoad({ ...worst, caution: 2 }, w3.road);
  vw.weave <= weaveRoom(w3.road.lane) + 1e-9 && vw.brake <= HARSH_AT + 1e-9 && vw.caution >= 0 && timidest.caution <= 2
    ? ok(`bounded: the loaded weave never exceeds the room (${vw.weave.toFixed(3)}m), braking never plans past abrupt (${vw.brake.toFixed(2)}), caution stays on the axis`)
    : fail("a loaded driver escaped a bound that held unloaded");
  const perfect = underLoad({ ...worst, caution: 1, weave: 0, brake: 2.7 }, w3.road);
  perfect.weave === 0 && perfect.brake === 2.7 && perfect.caution === 1
    ? ok("a driver with no deficit is unmoved by any load: composure decides how badly a habit shows, never which habits a driver has")
    : fail("load invented a weakness in a driver who had none");

  /* THE TRADE, MEASURED THROUGH THE SAME DERIVATION THE SHEET USES. The
     same seed and the same route, driven twice: an examiner who tells
     only the next intersection (nothing ever held) and one who tells
     every slot the moment it is offered (up to two held). */
  const drive = (profile, ahead, seconds = 300) => {
    let w = withCandidates(
      seedCourse(4, LIMIT, { every: 3.0, control: TWO_WAY, cols: 3, rows: 2, bends: 1 }),
      [{ id: "X", profile }],
    );
    let stray = 0, heldMax = 0, jump = 0;
    for (let i = 0; i < Math.round(seconds / DT); i++) {
      const before = w.actors.find((x) => x.candidate === "X");
      const wasAt = before ? strayOf(w, before) : null;
      if (before) for (const slot of toTell(w, "X", ahead)) if (slot.told === null) w = tell(w, "X", slot.at, before.wanted[slot.at] ?? "straight");
      /* The one artifact: an instruction changes the weave's amplitude in
         the tick it is given, and the car steps sideways by the change. */
      const told = w.actors.find((x) => x.candidate === "X");
      if (told && wasAt != null && told.id === before.id) jump = Math.max(jump, Math.abs(strayOf(w, told) - wasAt));
      w = noticing(keepDriving(step(w)));
      const a = w.actors.find((x) => x.candidate === "X");
      if (a) { stray = Math.max(stray, Math.abs(strayOf(w, a))); heldMax = Math.max(heldMax, heldBy(a)); }
    }
    const wide = (w.faults ?? []).filter((f) => f.trait === "wideLine").reduce((t, f) => t + ((f.to ?? f.over) - f.from), 0);
    return { stray, heldMax, jump, wide };
  };
  const r1 = drive("ragged", 1), r3 = drive("ragged", 3);
  const s1 = drive("sound", 1), s3 = drive("sound", 3);
  console.log(`   ragged, told 1 ahead: held ${r1.heldMax}, worst stray ${r1.stray.toFixed(3)}m, ${r1.wide.toFixed(1)}s off the line; told 3 ahead: held ${r3.heldMax}, ${r3.stray.toFixed(3)}m, ${r3.wide.toFixed(1)}s`);
  console.log(`   sound,  told 1 ahead: worst stray ${s1.stray.toFixed(3)}m; told 3 ahead: ${s3.stray.toFixed(3)}m (the sound profile is rated 0.9, not 1.0, so it has a tenth of a deficit to amplify)`);
  r1.heldMax === 0 && r3.heldMax === 2 && r3.stray > r1.stray && r3.wide >= r1.wide
    ? ok(`the trade is real: the same driver on the same route runs wider under load (${r1.stray.toFixed(3)} -> ${r3.stray.toFixed(3)}m, ${r1.wide.toFixed(1)} -> ${r3.wide.toFixed(1)}s off the line)`)
    : fail(`load did not cost the candidate anything measurable: ${JSON.stringify({ r1, r3 })}`);
  const bound = severityOf({ skill: skillUnderPressure(1, pressureOf(2)) }) - 1;   // the amplitude change at full load, as a share
  console.log(`   the sideways step in the tick an instruction is given: ${r3.jump.toFixed(3)}m at worst, against a bound of ${(bound * weaveRoom(w3.road.lane)).toFixed(3)}m`);
  r3.jump <= bound * weaveRoom(w3.road.lane) + 1e-9
    ? ok("and the one artifact is measured and inside its bound: the car steps sideways by no more than the amplitude change when told")
    : fail(`an instruction moved the car ${r3.jump.toFixed(3)}m sideways in one tick`);
}

console.log("\n13. THE CANDIDATE PERCEIVES THE WORLD AS A PERSON DOES: LATE");
{
  /* The observation axis as a live input. A candidate decides from the
     world as it was their lag ago; traffic perceives the present, as it
     always has, because with everybody lagged traffic touches and nothing
     can yet respond to that (tools/measure/lag.mjs). What is checked: the
     traffic is unmoved; the lag is the old engine's registration curve;
     the candidate really does decide from the past; the axis reads --
     harder braking, and gaps a lag tighter than they look -- and nobody
     touches. */
  const sound = PROFILES.find((p) => p.id === "sound").ratings;
  const trace = (opts) => {
    let w = seedCourse(4, LIMIT, { every: 3.0, control: TWO_WAY, cols: 3, rows: 2, bends: 1, ...opts });
    const out = [];
    for (let i = 0; i < 600; i++) { w = step(w); if (i % 40 === 0) out.push(w.actors.map((a) => [a.id, a.s, a.v, a.lag])); }
    return { w, s: JSON.stringify(out) };
  };
  const on = trace({ perceive: "candidate" }), off = trace({});
  on.s === off.s && on.w.actors.every((a) => a.lag === 0) && !("past" in off.w)
    ? ok("traffic perceives the present: with nobody being examined a world with the candidate's perception on is byte-identical to the default, which keeps no past at all")
    : fail("switching the candidate's perception on moved the traffic, which is not lagged");

  let w = withCandidates(
    seedCourse(4, LIMIT, { every: 3.0, control: TWO_WAY, cols: 3, rows: 2, bends: 1, perceive: "candidate" }),
    [{ id: "X", profile: "sound" }],
  );
  const x = w.actors.find((a) => a.candidate === "X");
  const expect = lagFor(sound, PERCEIVE, rng(4242 * 7 + 0 + 3));
  console.log(`   the sound candidate perceives ${x.lag.toFixed(3)}s behind (floor ${PERCEIVE.floor}s, span ${PERCEIVE.span}s x their deficit); traffic ${[...new Set(w.actors.filter((a) => !a.candidate).map((a) => a.lag))].join(",")}`);
  x.lag === expect && x.lag > PERCEIVE.floor
    ? ok("the candidate's lag is the old engine's registration delay, shape for shape: the reaction floor plus the span their observation deficit buys")
    : fail(`the candidate's lag is ${x.lag} against ${expect} from the same constants`);

  for (let i = 0; i < 60; i++) w = keepDriving(step(w));
  const me = w.actors.find((a) => a.candidate === "X");
  const seen = seenBy(w, me);
  const back = Math.round(me.lag / DT);
  seen !== w.actors && seen === w.past[back - 1] && seenBy(w, { ...me, lag: 0 }) === w.actors
    ? ok(`and they decide from the committed state ${back} ticks back, while a driver with no lag reads the present`)
    : fail("seenBy did not return the state the lag names");

  /* THE AXIS READS. Same seed, same route, three observation ratings on
     an otherwise sound driver: harder braking as it falls, and the gap
     they take a lag tighter than the one they saw. And nobody touches. */
  const stops = (layout, path) => layout.place.control[path.from] === "stop";
  const margins = (world, me, actors) => {
    const layout = layoutOf(world, me), mine = layout.paths[me.route];
    const out = [];
    for (const them of actors) {
      if (them.id === me.id || (them.k ?? 0) !== (me.k ?? 0)) continue;
      const meet = layout.conflicts[them.route + "|" + me.route];
      if (!meet) continue;
      const theirs = layout.paths[them.route];
      if (them.going || them.s >= theirs.stopAt || them.s > meet.a) continue;
      if (!((stops(layout, mine) && !stops(layout, theirs))
        || (!stops(layout, mine) && !stops(layout, theirs) && mine.intent === "left" && theirs.from === OPPOSITE[mine.from] && theirs.intent !== "left"))) continue;
      out.push((meet.a - them.s) / Math.max(them.v, 0.5) - timeToCover(me.v, meet.clearOf - me.s, me.v0));
    }
    return out;
  };
  const byRating = {};
  for (const observation of [0.9, 0.5, 0.15]) {
    let harsh = 0, hits = 0, gap = [], lag = 0;
    for (const seed of [4, 5]) {
      let w = withCandidates(
        seedCourse(seed, LIMIT, { every: 3.0, control: TWO_WAY, cols: 3, rows: 2, bends: 1, perceive: "candidate" }),
        [{ id: "X", profile: "sound", planned: true, ratings: { ...sound, observation } }],
      );
      for (let i = 0; i < Math.round(240 / DT); i++) {
        const before = w.actors.find((a) => a.candidate === "X");
        w = keepDriving(step(w));
        const a = w.actors.find((z) => z.candidate === "X");
        if (!a) continue;
        lag = a.lag;
        if ((a.a ?? 0) < -HARSH_AT) harsh++;
        for (const o of overlapping(w)) if (o.a === a.id || o.b === a.id) hits++;
        if (!before || before.id !== a.id) continue;
        const path = layoutOf(w, a).paths[a.route];
        if (!((a.going && !before.going) || (before.s < path.stopAt && a.s >= path.stopAt && !a.going))) continue;
        const wasTrue = margins(w, before, w.past?.[0] ?? w.actors), wasSeen = margins(w, before, seenBy(w, before));
        if (wasTrue.length && wasSeen.length) gap.push({ seen: Math.min(...wasSeen), real: Math.min(...wasTrue) });
      }
    }
    byRating[observation] = { harsh, hits, gap, lag };
    console.log(`   observation ${observation}: lag ${lag.toFixed(2)}s, harsh-braking ticks ${harsh}, gaps judged ${gap.length} (seen ${gap.map((g) => g.seen.toFixed(1)).join("/")}s, really ${gap.map((g) => g.real.toFixed(1)).join("/")}s), overlaps ${hits}`);
  }
  const r = byRating;
  /* WHAT IT DOES NOT DO, stated so nobody reads it in: the lag does not
     read through braking on the road. Measured over three seeds and
     fifteen minutes per rating, the braking distribution is the same at
     every observation rating (peak 5.78, p95 2.67-2.72 m/s^2) -- leaders
     here brake gently and following gaps are comfortable, so a second
     of lag costs nothing a follower notices. The first version of this
     check asserted the opposite off one seed's single event, and failed
     on the next two. The axis reads at the box, as the gap. */
  console.log(`   harsh-braking ticks by rating: ${[0.9, 0.5, 0.15].map((k) => `${k}: ${r[k].harsh}`).join(", ")} -- the lag does not read through braking in this traffic, and is not claimed to`);
  const worst = r[0.15];
  const misjudged = worst.gap.filter((g) => g.seen > g.real).length;
  worst.gap.length > 0 && misjudged > 0 && worst.gap.every((g) => g.seen - g.real <= worst.lag + 0.5)
    ? ok(`and the poorest observer takes gaps tighter than they look, by up to their lag: ${misjudged} of ${worst.gap.length} judged gaps were smaller than seen, never by more than the lag`)
    : fail(`gap misjudgment did not read as the lag: ${JSON.stringify(worst.gap)}`);
  Object.values(r).every((v) => v.hits === 0)
    ? ok("and at every rating this sound-tempered candidate touched nobody in 480s on the course -- the BOLD one, lagged, rear-ends on the crossing (47 car-ticks in eight hours: a 0.39s headway against a 0.55s lag), which is why it is OFF by default until contact has a response (stage 5)")
    : fail("a lagged candidate drove into somebody on the course as well; the measurement behind the default has moved");
  const plain = withCandidates(seedCourse(4, LIMIT, { every: 3.0, control: TWO_WAY, cols: 3, rows: 2, bends: 1 }), [{ id: "X", profile: "sound" }]);
  plain.actors.every((a) => a.lag === 0) && !plain.road.perceive
    ? ok("the default world lags nobody: every trace that existed is the trace it was")
    : fail("perception is on by default, and the bold candidate on the crossing says it must not be yet");
}

console.log("\n" + "=".repeat(70));
if (problems) { console.log(`FAILED: ${problems} problem(s).`); process.exit(1); }
console.log("OK: the roads join, and the traffic on them is the same traffic.");
console.log("\n   Stage 3's real test is a drive that reads like a drive.");
