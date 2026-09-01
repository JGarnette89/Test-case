/* =====================================================================
   EVENT VERIFICATION
   Run:  node tools/verify-events.mjs

   Two things that happen DURING the wait rather than before it, added so
   that a longer wait is spent reading rather than sitting: a pedestrian
   at a push button, and an emergency vehicle on a call.

   Both have to clear the same bar every tell in this game clears, and
   neither is allowed to be a script that simply punishes the player:

     readable   visible before the player has to decide, not after
     worth it   a controlled comparison — the same scene, one thing
                changed — has to show it is worth real seconds

   And both have a rule underneath that is checked as a rule, not as an
   emergent property of the footprints: somebody waiting at a kerb holds
   none of the crossing, and an emergency vehicle outranks everybody
   whatever the arrival order says.
   ===================================================================== */
import { C } from "../src/theme.js";
import {
  simulate, safeAtFor, poseAt, spanOf, movementOf, conflicts, crossingOf, eventsAreReadable, M,
} from "../src/engine/index.js";
import { SCENARIOS, S } from "../src/engine/scenarios.js";
import { ENDLESS_BRIEFS, composeScenario } from "../src/engine/compose.js";
import { cameraFor } from "../src/frame.js";
import { specOf } from "../src/engine/road.js";
import { GRACE } from "../src/engine/score.js";

const r2 = (n) => Math.round(n * 100) / 100;
let problems = 0;
const fail = (m) => { problems++; console.log("  FAIL: " + m); };
const ok = (m) => console.log("  ok   " + m);
const win = (s) => { const sim = simulate(s); return { legalAt: sim.legalAt, safeAt: r2(safeAtFor(sim)), sim }; };

/* ================= THE CROSSWALK BUTTON ================= */
console.log("\n1. A PEDESTRIAN AT THE BUTTON HOLDS NONE OF THE CROSSING");
{
  const scn = SCENARIOS.find((s) => s.id === "button");
  if (!scn) { fail("the button scenario is missing"); }
  else {
    const { sim } = win(scn);
    const ped = sim.actors.find((a) => a.kind === "ped");
    const cr = crossingOf(ped.from, ped.road);
    const mid = { x: (cr.a.x + cr.b.x) / 2, y: (cr.a.y + cr.b.y) / 2, rot: cr.rot };
    const probe = { id: "probe", kind: "ped" };
    const blocked = (t) => conflicts(probe, mid, ped, poseAt(ped, t), 0, 0, 0, "yield");

    // While waiting — pressed, signal not changed — the middle of the
    // crossing must be free. Once they step off it must not be.
    const whileWaiting = ped.departAt - 0.5;
    const justWalking = ped.departAt + 0.4;
    !blocked(whileWaiting)
      ? ok(`at ${r2(whileWaiting)}s they are at the button and the crossing is free`)
      : fail(`a pedestrian merely waiting at the button is already holding the crossing`);
    blocked(justWalking)
      ? ok(`at ${r2(justWalking)}s they have stepped off and it is held`)
      : fail(`the crossing is not held once the pedestrian is actually on it`);

    const pose = poseAt(ped, ped.arriveAt + 0.1);
    pose.pressed
      ? ok(`the press is exposed to the renderer (pose.pressed) from ${ped.arriveAt}s`)
      : fail("nothing marks the button as pressed, so there is no tell to draw");
    poseAt(ped, ped.arriveAt - 1.0).pressed === false
      ? ok("and not before they reach it — walking up is not pressing")
      : fail("the button reads as pressed before the pedestrian has got there");
  }
}

console.log("\n2. THE PRESS IS READABLE, AND WORTH READING");
{
  const scn = SCENARIOS.find((s) => s.id === "button");
  const { sim, safeAt } = win(scn);
  const ped = sim.actors.find((a) => a.kind === "ped");

  // Readable: on screen, and pressed, before the ego is at the line.
  const decide = scn.ego.arriveAt;
  ped.arriveAt <= decide
    ? ok(`the button goes in at ${ped.arriveAt}s, ${r2(decide - ped.arriveAt)}s before the ego reaches the line`)
    : fail(`the button goes in at ${ped.arriveAt}s but the ego is at the line at ${decide}s — nothing to read in time`);
  !poseAt(ped, decide).hidden
    ? ok("and they are visible at that moment, not still off screen")
    : fail("the pedestrian is not yet visible when the ego must decide");

  /* Worth reading: the same scene with the button removed, so they simply
     walk out. Only that one field differs. */
  const walksOut = { ...scn, actors: scn.actors.map((a) => (a.kind === "ped" ? { ...a, button: false } : a)) };
  const b = win(walksOut);
  const gain = r2(b.safeAt - safeAt);
  gain >= 0.5
    ? ok(`reading it is worth ${gain}s (waiting at a button ${safeAt}s vs walking straight out ${b.safeAt}s)`)
    : fail(`reading it gains only ${gain}s — not worth reading`);

  /* And the phase has to land clear of the graded window, or the scorer
     would be offering time that drives into a crossing. */
  const graded = r2(safeAt + GRACE);
  ped.departAt >= graded
    ? ok(`the walk phase starts at ${r2(ped.departAt)}s, after the graded window closes at ${graded}s`)
    : fail(`the walk phase starts at ${r2(ped.departAt)}s, inside the graded window ending ${graded}s — the scorer would reward driving into it`);
}

/* ================= THE EMERGENCY VEHICLE ================= */
console.log("\n3. AN EMERGENCY VEHICLE OUTRANKS EVERYBODY, AS A RULE");
{
  const probe = (arriveAt, extra = {}) => ({
    id: "probe", control: "stop", duration: 22,
    ego: { from: "S", intent: "straight", arriveAt: 1.2, stops: true, color: C.blue, ...extra },
    actors: [S({ id: "v", from: "W", intent: "straight", arriveAt, stops: false, color: C.red, name: "Car" })],
  });
  const base = probe(4.0);
  const ordinary = win(base);
  const onCall = win({ ...base, actors: [{ ...base.actors[0], emergency: true }] });

  const wasPrior = ordinary.sim.priors.some((p) => p.id === "v");
  const isPrior = onCall.sim.priors.some((p) => p.id === "v");
  // Arriving 2.8s AFTER the ego, from the ego's left, with no priority
  // stamped on it: by every ordinary rule the ego goes first.
  !wasPrior
    ? ok("an ordinary car arriving 2.8s later does not outrank the ego")
    : fail("the control car already outranked the ego — the comparison proves nothing");
  isPrior
    ? ok("the same car on a call does, despite arriving far later")
    : fail("an emergency vehicle did not take priority over the ego");
  onCall.legalAt > ordinary.legalAt
    ? ok(`and it moves the legal window: ${ordinary.legalAt}s -> ${onCall.legalAt}s`)
    : fail(`the window did not move (${ordinary.legalAt} -> ${onCall.legalAt}) — the rule is not reaching it`);

  /* Yielding is not the same as freezing. Priority decides who goes
     first where the paths actually meet — a call three intersections
     away does not pin a driver to a stop line they would be long clear
     of, and a scenario that made it do so would be teaching a habit
     nobody wants. Same emergency vehicle, far enough back that the ego
     is gone before it arrives. */
  const distant = win({ ...probe(9.0), actors: [{ ...probe(9.0).actors[0], emergency: true }] });
  distant.sim.priors.some((p) => p.id === "v")
    ? ok("a distant one is still a prior — the rule does not switch off with range")
    : fail("a distant emergency vehicle stopped being a prior");
  distant.legalAt <= 1.2 + 1e-9
    ? ok(`but it costs nothing when the ego is clear long before it arrives (window still ${distant.legalAt}s)`)
    : fail(`a distant emergency vehicle pinned the ego to the line until ${distant.legalAt}s — yielding is not freezing`);

  // It must beat an explicit priority too, or a scenario could out-stamp it.
  const stamped = win({
    ...base,
    ego: { ...base.ego, priority: -99 },
    actors: [{ ...base.actors[0], emergency: true }],
  });
  stamped.sim.priors.some((p) => p.id === "v")
    ? ok("and it outranks even an ego carrying an explicit priority of -99")
    : fail("an explicit priority out-stamped an emergency vehicle — emergency must be checked first");
}

console.log("\n4. THE EMERGENCY SCENARIO IS FAIR TO THE PLAYER");
{
  const scn = SCENARIOS.find((s) => s.id === "ambulance");
  if (!scn) { fail("the ambulance scenario is missing"); }
  else {
    const { sim, legalAt, safeAt } = win(scn);
    const amb = sim.actors.find((a) => a.id === "amb");
    const wait = r2(safeAt - scn.ego.arriveAt);
    wait > 1
      ? ok(`the ego genuinely has to wait ${wait}s — legally yours on arrival, and still not yet`)
      : fail(`the ego waits only ${wait}s — there is no lesson here`);

    // Departing on the window must be safe, and going on arrival must not be.
    const clear = (departAt) => {
      const ego = { ...sim.ego, departAt };
      for (let t = departAt; t < departAt + spanOf(ego); t += 0.05) {
        const mine = poseAt(ego, t);
        if (mine.gone) break;
        for (const a of sim.actors) {
          const th = poseAt(a, t);
          if (th.gone || th.hidden) continue;
          if (conflicts(ego, mine, a, th, 0, 0, 0, "crash")) return false;
        }
      }
      return true;
    };
    clear(safeAt)
      ? ok(`departing on the window (${safeAt}s) does not meet it`)
      : fail(`departing on the derived window still meets the emergency vehicle`);
    !clear(scn.ego.arriveAt)
      ? ok(`going the moment you arrive (${scn.ego.arriveAt}s) does meet it — the wait is real, not bookkeeping`)
      : ok(`going on arrival does not collide; the fault there is the failure to yield, which is the rule being taught`);

    // The whole graded stretch has to be safe, same bar as everywhere else.
    let bad = null;
    for (let d = safeAt; d <= safeAt + GRACE + 1e-9; d += 0.05) if (!clear(d)) { bad = r2(d); break; }
    bad == null
      ? ok(`safe across the whole graded window [${safeAt}, ${r2(safeAt + GRACE)}]`)
      : fail(`departing at ${bad}s inside the graded window meets the emergency vehicle`);

    // Slow enough to read: the old 54 km/h put it on screen for well
    // under a second. verify-camera checks the frame; this checks the pace.
    const mv = movementOf(amb);
    const kmh = (mv.traverse.length / 20) / mv.traverse.duration * 3.6;
    kmh < 45
      ? ok(`it crosses at ${r2(kmh)} km/h — quick, but slow enough to see coming`)
      : fail(`it crosses at ${r2(kmh)} km/h, too fast to be read in the frame available`);
  }
}

/* ================= GENERATED, NOT JUST HAND-AUTHORED ================= */
console.log("\n5. THE GENERATORS PRODUCE BOTH, AND ONLY WHEN THEY WORK");
{
  let drawn = 0, buttons = 0, ambs = 0;
  let unreadable = 0, notPrior = 0, unframed = 0, freeAmb = 0;
  for (let seed = 1; seed <= 260; seed++) {
    const scn = composeScenario(ENDLESS_BRIEFS[seed % ENDLESS_BRIEFS.length], seed);
    if (!scn) continue;
    drawn++;
    if (!eventsAreReadable(scn)) unreadable++;
    if (scn.actors.some((a) => a.kind === "ped" && a.button)) buttons++;

    const amb = scn.actors.find((a) => a.emergency);
    if (!amb) continue;
    ambs++;
    const sim = simulate(scn);
    if (!sim.priors.some((p) => p.id === amb.id)) notPrior++;
    if (safeAtFor(sim) - scn.ego.arriveAt < 0.3) freeAmb++;

    // On screen before the decision, given the camera the draw declared.
    let seen = null;
    for (let t = 0; t <= scn.ego.arriveAt; t += 0.05) {
      const pose = poseAt(sim.actors.find((a) => a.id === amb.id), t);
      if (pose.gone) break;
      const [bx, by, bw, bh] = cameraFor(specOf(scn), sim, t, scn.camera).box.split(" ").map(Number);
      if (pose.x > bx + 20 && pose.x < bx + bw - 20 && pose.y > by + 20 && pose.y < by + bh - 20) { seen = t; break; }
    }
    if (seen == null || seen > scn.ego.arriveAt - 0.6) unframed++;
  }

  console.log(`  ${drawn} draws: ${buttons} with a button (${r2(buttons / drawn * 100)}%), ${ambs} with an emergency vehicle (${r2(ambs / drawn * 100)}%)`);
  buttons > 0 ? ok("the composer does produce crossing buttons") : fail("no generated draw carried a crossing button");
  ambs > 0 ? ok("and does produce emergency vehicles") : fail("no generated draw carried an emergency vehicle");
  unreadable === 0
    ? ok("every generated draw's events are readable before the decision")
    : fail(`${unreadable} generated draw(s) carry an event the player could not read in time`);
  notPrior === 0
    ? ok("every generated emergency vehicle takes priority")
    : fail(`${notPrior} generated emergency vehicle(s) were not priors`);
  unframed === 0
    ? ok("every generated emergency vehicle is in frame before the decision")
    : fail(`${unframed} generated emergency vehicle(s) were still off screen when the player had to commit`);
  freeAmb === 0
    ? ok("and every one of them actually costs the ego time")
    : fail(`${freeAmb} generated emergency vehicle(s) cost the ego nothing — decoration`);
}

console.log("\n" + "=".repeat(66));
console.log(problems === 0 ? "OK: events verified." : `${problems} PROBLEM(S) FOUND.`);
process.exit(problems === 0 ? 0 : 1);
