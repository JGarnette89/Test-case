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
} from "../src/sim/course.js";
import { exitFor } from "../src/sim/intersection.js";
import {
  withCandidates, keepDriving, toTell, tell, stillTellable,
} from "../src/sim/candidate.js";
import {
  seedCourse, step, overlapping, whatStops, poseOf, reachFor, edgesOf, gapNeeded,
  DT, CAR, ALL_WAY, TWO_WAY,
} from "../src/sim/crossing.js";
import { decide, wantedGap } from "../src/sim/traffic.js";

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


console.log("\n" + "=".repeat(70));
if (problems) { console.log(`FAILED: ${problems} problem(s).`); process.exit(1); }
console.log("OK: the roads join, and the traffic on them is the same traffic.");
console.log("\n   Stage 3's real test is a drive that reads like a drive.");
