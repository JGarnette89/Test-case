/* =====================================================================
   CAMERA VERIFICATION
   Run:  node tools/verify-camera.mjs

   frameFor is the resting board; cameraFor is what a merge or a long
   lane change will need instead — a frame that eases out to cover a
   road user further out than the board reaches, in time for the player
   to actually read them before a decision, not at it (see CLAUDE.md's
   merging notes). Nothing in the game asks for this yet, so there is no
   real merge scenario to check it against. What can be checked without
   one, headlessly:

     - every existing scenario renders byte-identical to today, because
       none of them declare a camera
     - a tracked actor is provably still inside the frame at every
       sampled instant of a real run, not just at the moment it arrives
     - the frame never contracts below the resting board
     - the reach it opens to comes from the actor's own spawn point, not
       a picked number — move the actor and the frame follows
     - the transition is a transition: sampled fine enough, it takes more
       than one frame to open, so nothing pops
   ===================================================================== */
import { SCENARIOS } from "../src/engine/scenarios.js";
import { simulate, movementOf, poseAt, basePose, cleanPose, TRAIT_KEYS, M, CX, CY, STEP, W } from "../src/engine/index.js";
import { specOf, crossSpec } from "../src/engine/road.js";
import { rotateScenario } from "../src/engine/route.js";

const QUARTER = { S: "W", W: "N", N: "E", E: "S" };
function turnsToFace(scn, from) {
  let cur = scn.ego.from;
  for (let n = 0; n < 4; n++) { if (cur === from) return n; cur = QUARTER[cur]; }
  return 0;
}
import { frameFor, cameraFor, worldHalfFor, chaseFor } from "../src/frame.js";

const r2 = (n) => Math.round(n * 100) / 100;
let problems = 0;
const fail = (x) => { problems++; console.log(`  FAIL: ${x}`); };
const ok = (x) => console.log(`  ok   ${x}`);

const halfOf = (box) => Number(box.split(" ")[2]) / 2;
const isSquareCentred = (box) => {
  const [x, y, w, h] = box.split(" ").map(Number);
  return w === h && r2(x + w / 2) === CX && r2(y + h / 2) === CY;
};

/* ---------- 1. no camera declared, no change ---------- */
console.log("\n1. UNDECLARED CAMERA IS THE RESTING FRAME, EXACTLY");
{
  let bad = 0;
  for (const scn of SCENARIOS) {
    // A scenario that declares a camera is supposed to move — checked
    // separately below, against the real declaration rather than a
    // synthetic one.
    if (scn.camera) continue;
    const spec = specOf(scn);
    const sim = simulate(scn);
    const base = frameFor(spec);
    for (const t of [0, scn.duration / 3, scn.duration / 2, scn.duration]) {
      const got = cameraFor(spec, sim, t, scn.camera);
      if (got.box !== base.box) {
        bad++;
        fail(`${scn.id}: camera box drifted from the resting frame at t=${t} with no camera declared`);
      }
    }
  }
  if (bad === 0) console.log(`  ok   all ${SCENARIOS.length} scenarios render identically to frameFor (none declare a camera)`);
}

/* ---------- build a tracking scenario from a real actor -------------
   "opposite" already has a car whose spawn point sits well outside the
   resting board — every approach does, since APPROACH_RUN outreaches a
   single-lane board's half-extent. Real, not invented: this is where
   that car already stands before it starts rolling in. */
const base = SCENARIOS.find((s) => s.id === "opposite");
const baseSim = simulate(base);
const trackedActor = baseSim.actors[0];
const trackedSpec = specOf(base);
const trackedBase = frameFor(trackedSpec);
const reach = (() => {
  const mv = movementOf(trackedActor);
  return Math.max(Math.abs(mv.spawn.x - CX), Math.abs(mv.spawn.y - CY));
})();

console.log(`\n2. A TRACKED ACTOR OPENS THE FRAME TO ITS OWN SPAWN REACH  (${trackedActor.id}, reach ${r2(reach)}px vs base half ${r2(trackedBase.scale * 720 / 2)}px)`);
{
  const camScn = { id: base.id, camera: { track: [{ id: trackedActor.id }] } };
  const early = cameraFor(trackedSpec, baseSim, -10, camScn.camera);
  const late = cameraFor(trackedSpec, baseSim, 20, camScn.camera);
  r2(halfOf(early.box)) === r2(trackedBase.scale * 720 / 2)
    ? ok("long before the ramp window, the frame is still the resting board")
    : fail(`expected the resting half far before the ramp, got ${halfOf(early.box)}`);
  halfOf(late.box) >= reach - 1
    ? ok("once fully open, the frame reaches at least as far as the actor's spawn point")
    : fail(`frame opened to ${halfOf(late.box)}, short of the ${reach} the actor's spawn needs`);
  isSquareCentred(late.box)
    ? ok("the open frame is still square and centred on the junction — a zoom, not a pan")
    : fail(`frame is not square/centred: ${late.box}`);
}

/* ---------- 3. the open is a transition, not a snap ---------- */
console.log("\n3. THE OPEN IS GRADUAL");
{
  // A synthetic later arrival so the whole ramp falls inside a playable
  // window — every real scenario today arrives too early for the default
  // lead to visibly animate mid-run, which is a fact about today's
  // scenarios, not a flaw in the mechanism (see assessment notes).
  const lateActor = { ...trackedActor, arriveAt: 8 };
  const lateSim = { ...baseSim, actors: [lateActor] };
  const camera = { track: [{ id: lateActor.id, revealBy: 3, rampFor: 2.5 }] };
  const readyAt = lateActor.arriveAt - 3;   // 5
  const rampStart = readyAt - 2.5;          // 2.5

  const before = halfOf(cameraFor(trackedSpec, lateSim, rampStart - 0.5, camera).box);
  const mid = halfOf(cameraFor(trackedSpec, lateSim, (rampStart + readyAt) / 2, camera).box);
  const after = halfOf(cameraFor(trackedSpec, lateSim, readyAt + 0.5, camera).box);

  before < mid && mid < after
    ? ok(`half-extent climbs across the ramp: ${r2(before)} -> ${r2(mid)} -> ${r2(after)}`)
    : fail(`not a monotonic climb: ${r2(before)} -> ${r2(mid)} -> ${r2(after)}`);

  // Sampled at engine resolution, no single step should cover most of the
  // move — that would be a pop with extra steps, not a pan.
  let biggestStep = 0, prev = null;
  for (let t = rampStart - 0.2; t <= readyAt + 0.2; t += STEP) {
    const h = halfOf(cameraFor(trackedSpec, lateSim, t, camera).box);
    if (prev != null) biggestStep = Math.max(biggestStep, Math.abs(h - prev));
    prev = h;
  }
  const span = after - before;
  biggestStep < span * 0.15
    ? ok(`no single ${STEP}s step covers more than 15% of the move (worst: ${r2((biggestStep / span) * 100)}%)`)
    : fail(`a single step covered ${r2((biggestStep / span) * 100)}% of the move — that is a snap`);
}

/* ---------- 4. never contracts below the resting board ---------- */
console.log("\n4. THE FRAME NEVER SHRINKS BELOW THE RESTING BOARD");
{
  const camera = { track: [{ id: trackedActor.id, revealBy: 3, rampFor: 2.5 }] };
  let bad = 0;
  for (let t = -5; t <= 15; t += 0.25) {
    const h = halfOf(cameraFor(trackedSpec, baseSim, t, camera).box);
    if (h < trackedBase.scale * 720 / 2 - 1e-6) { bad++; fail(`frame contracted below the resting board at t=${r2(t)}`); }
  }
  if (bad === 0) ok("half-extent stays at or above the resting board across the whole clock");
}

/* ---------- 5. once revealed, the tracked actor stays inside frame -----
   The promise is not "visible from the moment it exists" — off-frame
   before its reveal is exactly what a car waiting at its spawn point
   does today, tracked or not. The promise is that by `revealBy` seconds
   ahead of arrival, the actor is inside the frame with its margin, and
   stays there for as long as it remains in play. Checked at engine
   resolution against the real "opposite" actor, not a synthetic one — so
   this also exercises the actual spawn/rest geometry the game uses. */
console.log("\n5. ONCE REVEALED, THE TRACKED ACTOR STAYS INSIDE FRAME");
{
  const within = (box, x, y) => {
    const [bx, by, bw, bh] = box.split(" ").map(Number);
    return x >= bx && x <= bx + bw && y >= by && y <= by + bh;
  };
  const camera = { track: [{ id: trackedActor.id, revealBy: 3, rampFor: 2.5 }] };
  const readyAt = trackedActor.arriveAt - 3;
  let bad = 0, checked = 0;
  for (let t = readyAt; t <= base.duration; t += STEP * 4) {
    const frame = cameraFor(trackedSpec, baseSim, t, camera);
    const pose = poseAt(trackedActor, t);
    if (pose.gone) continue;
    checked++;
    if (!within(frame.box, pose.x, pose.y)) {
      bad++;
      fail(`${trackedActor.id} at (${r2(pose.x)},${r2(pose.y)}) is outside frame ${frame.box} at t=${r2(t)}`);
    }
  }
  if (bad === 0) ok(`stayed inside its frame across ${checked} sampled poses from revealBy to departure`);
}

/* ---------- every shipped camera earns its keep ----------
   The sections above prove the mechanism against a synthetic declaration.
   This one proves the real ones do the job they were added for: a tracked
   actor has to be ON SCREEN before the ego must decide, because the whole
   reason to widen the view is that something is coming which the player
   would otherwise be marked for not seeing. */
console.log("\n5. SHIPPED CAMERAS REVEAL THEIR ACTOR IN TIME");
{
  const declared = SCENARIOS.filter((s) => s.camera?.track?.length);
  if (!declared.length) console.log("  (none declared)");
  for (const scn of declared) {
    const spec = specOf(scn);
    const sim = simulate(scn);
    for (const track of scn.camera.track) {
      const p = track.id === "ego" ? sim.ego : sim.actors.find((a) => a.id === track.id);
      if (!p) { fail(`${scn.id}: camera tracks "${track.id}", which is not in the scenario`); continue; }

      let seenAt = null;
      for (let t = 0; t < scn.duration; t += 0.05) {
        const pose = poseAt(p, t);
        if (pose.gone) break;
        if (pose.hidden) continue;
        const [bx, by, bw, bh] = cameraFor(spec, sim, t, scn.camera).box.split(" ").map(Number);
        // A margin, because a sliver at the very edge is not "seen".
        if (pose.x > bx + 20 && pose.x < bx + bw - 20 && pose.y > by + 20 && pose.y < by + bh - 20) {
          seenAt = r2(t); break;
        }
      }
      /* Same bar the roundabout's exit tell has to clear: appearing at
         the exact instant of the decision is not a warning. */
      const MIN_WARNING = 0.6;
      const decide = scn.ego.arriveAt;
      if (seenAt == null) { fail(`${scn.id}: ${track.id} never comes into frame at all`); continue; }
      seenAt <= decide - MIN_WARNING
        ? ok(`${scn.id}: ${track.id} is on screen at ${seenAt}s, ${r2(decide - seenAt)}s before the ego reaches the line`)
        : fail(`${scn.id}: ${track.id} appears at ${seenAt}s against a decision at ${decide}s — under the ${MIN_WARNING}s a player needs to act on it`);

      // And the widening has to be what did it: with the camera removed,
      // the same actor should still be off screen at the decision point.
      const [fx, fy, fw, fh] = frameFor(spec).box.split(" ").map(Number);
      const atDecide = poseAt(p, decide);
      const inFixed = atDecide.x > fx + 20 && atDecide.x < fx + fw - 20
        && atDecide.y > fy + 20 && atDecide.y < fy + fh - 20;
      inFixed
        ? fail(`${scn.id}: ${track.id} is already visible in the resting frame — the camera is decoration here`)
        : ok(`${scn.id}: and it is NOT visible without the camera — the widening is what reveals it`);
    }
  }
}

/* ---------- the world is drawn as wide as the camera opens ----------
   A camera that widens past the fixed 720x720 board used to reveal
   nothing: ground, scenery and the road legs were all laid out to that
   board, so the extra space was bare and the road simply stopped in
   mid-air — with a tracked actor driving in across it, since the camera
   widened to cover that actor's approach in the first place.

   worldHalfFor is what the renderer sizes all three to. Two things have
   to hold. It must reach at least as far as the camera ever opens, and
   it must not move with the clock: scenery is scattered once per
   scenario and would visibly grow outward mid-reveal otherwise. */
console.log("\n7. THE DRAWN WORLD COVERS EVERYTHING THE CAMERA REVEALS");
{
  let short = 0, unstable = 0, widened = 0;
  for (const scn of SCENARIOS) {
    const spec = specOf(scn);
    const sim = simulate(scn);
    const world = worldHalfFor(spec, sim, scn.camera);
    const resting = (frameFor(spec).scale * W) / 2;
    if (world > resting + 1e-6) widened++;

    let widest = 0;
    for (let t = 0; t <= scn.duration; t += 0.05) {
      widest = Math.max(widest, (cameraFor(spec, sim, t, scn.camera).scale * W) / 2);
    }
    if (world < widest - 1e-6) {
      short++;
      fail(`${scn.id}: world drawn to ${r2(world)} but the camera opens to ${r2(widest)} — bare ground at the edges`);
    }
    // Same answer whenever it is asked: it is a property of the scenario.
    if (worldHalfFor(spec, sim, scn.camera) !== world) {
      unstable++;
      fail(`${scn.id}: worldHalfFor is not stable — scenery would resize as the camera eases`);
    }
  }
  short === 0 ? ok(`all ${SCENARIOS.length} scenarios draw a world at least as wide as their camera ever opens`) : null;
  unstable === 0 ? ok("and the extent is a stable property of the scenario, not of the clock") : null;
  widened > 0
    ? ok(`${widened} scenario(s) genuinely need more world than the resting board — the check has something to catch`)
    : fail("no scenario widens past the resting board, so this check proves nothing");

  /* And the invariant that actually matters at the pixel level: anything
     VISIBLE in the frame has world drawn under it. Being outside the
     world while also outside the frame is fine — that is just off
     screen, which is where an approach starts from. */
  let offWorld = 0;
  for (const scn of SCENARIOS) {
    const spec = specOf(scn);
    const sim = simulate(scn);
    const world = worldHalfFor(spec, sim, scn.camera);
    for (const a of [sim.ego, ...sim.actors]) {
      for (let t = 0; t <= scn.duration; t += 0.05) {
        const p = poseAt(a, t);
        if (p.gone) break;
        if (p.hidden) continue;
        const [bx, by, bw, bh] = cameraFor(spec, sim, t, scn.camera).box.split(" ").map(Number);
        if (!(p.x > bx && p.x < bx + bw && p.y > by && p.y < by + bh)) continue;
        if (Math.max(Math.abs(p.x - CX), Math.abs(p.y - CY)) > world + 1e-6) {
          offWorld++;
          fail(`${scn.id}/${a.id}: visible at (${r2(p.x)},${r2(p.y)}) with no world drawn under it`);
        }
      }
    }
  }
  offWorld === 0 ? ok("every road user that is on screen has ground and road drawn beneath it") : null;
}

/* ---------- the chase camera --------------------------------------- */
console.log("\nTHE CHASE CAMERA RIDES WITH THE CANDIDATE");
{
  const scn = SCENARIOS.find((x) => x.id === "gap");   // the candidate turns left
  const spec = specOf(scn);
  const sim = simulate(scn);

  /* It follows the car — but the car is deliberately NOT at the centre of
     the frame. The view is sized as a duration of road ahead, and the car
     sits low in it so that road gets the space, so the frame's centre
     rides in front of the bonnet. What has to hold is that the car is
     tracked exactly, and that it stays comfortably inside the frame. */
  let offCar = 0, outOfFrame = 0, aheadWrong = 0;
  for (let t = 0; t <= 8; t += 0.1) {
    const c = chaseFor(spec, sim, t, scn.camera);
    const b = basePose(sim.ego, t);
    if (!b || b.hidden || !Number.isFinite(b.x)) continue;
    if (Math.hypot(c.carX - b.x, c.carY - b.y) > 1e-6) offCar++;
    // The car sits `behind` up from the rear edge of the frame.
    const half = (c.scale * W) / 2;
    const backEdge = Math.hypot(c.cx - b.x, c.cy - b.y) + c.behind;
    if (Math.abs(backEdge - half) > 1e-6) aheadWrong++;
    if (Math.hypot(c.carX - c.cx, c.carY - c.cy) > half) outOfFrame++;
  }
  offCar === 0 ? ok("the view tracks the candidate exactly") : fail(`${offCar} frame(s) lost the car`);
  aheadWrong === 0
    ? ok("the car sits low in the frame, so the road ahead gets the space")
    : fail(`${aheadWrong} frame(s) placed the car wrongly within the view`);
  outOfFrame === 0 ? ok("the candidate is always inside the frame") : fail(`${outOfFrame} frame(s) pushed the car off screen`);

  /* The view is sized as a DURATION of road, so a slower manoeuvre draws
     it in. That is the whole reason it is stated in seconds. */
  const wide = chaseFor(spec, sim, 2, scn.camera, { lookAhead: 10 });
  const tight = chaseFor(spec, sim, 2, scn.camera, { lookAhead: 4 });
  wide.ahead > tight.ahead && Math.abs(wide.seconds - 10) < 0.01 && Math.abs(tight.seconds - 4) < 0.01
    ? ok(`look-ahead is real seconds of road: 10s = ${(wide.ahead / 20).toFixed(0)}m, 4s = ${(tight.ahead / 20).toFixed(0)}m`)
    : fail(`look-ahead did not scale as a duration (${wide.seconds}s / ${tight.seconds}s)`);

  /* Straight ahead is up, whichever way the car is pointing. Checked from
     all four approaches, since a course rotates every leg. */
  let mis = 0, seen = 0;
  for (const from of ["S", "N", "E", "W"]) {
    const rot = rotateScenario(scn, turnsToFace(scn, from));
    if (!rot) continue;
    const rsim = simulate(rot);
    for (const t of [0, 2, 4]) {
      const c = chaseFor(specOf(rot), rsim, t, rot.camera);
      const b = basePose(rsim.ego, t);
      const onScreen = ((b.rot + c.rotate + 540) % 360) - 180;
      seen++;
      if (Math.abs(onScreen + 90) > 1e-6) mis++;
    }
  }
  mis === 0
    ? ok(`the candidate's straight-ahead draws upward in all ${seen} frames, from every approach`)
    : fail(`${mis} frame(s) did not put the heading up the screen`);

  /* Turning is continuous. A camera that jumped would be a bug you would
     feel before you saw it. */
  let worst = 0, prev = null;
  for (let t = 0; t <= 8; t += STEP) {
    const c = chaseFor(spec, sim, t, scn.camera);
    if (prev != null) worst = Math.max(worst, Math.abs(((c.rotate - prev + 540) % 360) - 180));
    prev = c.rotate;
  }
  worst < 8
    ? ok(`the view turns continuously, never more than ${worst.toFixed(1)} deg in one ${STEP}s step`)
    : fail(`the view jumped ${worst.toFixed(1)} deg in a single step`);

  /* THE ONE THAT MATTERS. Riding the car must not hide what the car is
     doing wrong. A camera locked to the real pose would pin the car dead
     centre and perfectly straight, and every steering fault would vanish
     into a wobbling world. */
  const dirty = { ...scn, ego: { ...scn.ego, traits: ["wander"] } };
  const dsim = simulate(dirty);
  let peakLat = 0, peakHead = 0;
  for (let t = 0; t <= 8; t += 0.05) {
    const c = chaseFor(spec, dsim, t, dirty.camera);
    peakLat = Math.max(peakLat, Math.abs(c.drift.lateral));
    peakHead = Math.max(peakHead, Math.abs(c.drift.heading));
  }
  peakLat > M(0.4) && peakHead > 3
    ? ok(`a wandering candidate still visibly wanders: ${(peakLat / 20).toFixed(2)}m off line, ${peakHead.toFixed(1)} deg off heading`)
    : fail(`the chase camera hid the fault (${(peakLat / 20).toFixed(2)}m, ${peakHead.toFixed(1)} deg) - it is following the real pose, not the intended one`);

  const clean = chaseFor(spec, sim, 3, scn.camera);
  Math.abs(clean.drift.lateral) < 1e-9
    ? ok("a clean candidate reads as no drift at all, so there are no false positives")
    : fail(`a clean candidate reported ${clean.drift.lateral} of drift`);

  /* And whatever it can reveal has to be drawn under it, corners
     included: a rotating square viewport sweeps its half-DIAGONAL. */
  const fixedWorld = worldHalfFor(spec, sim, scn.camera);
  const chaseWorld = worldHalfFor(spec, sim, scn.camera, { chase: true });
  chaseWorld > fixedWorld
    ? ok(`the world grows for a chase view (${Math.round(fixedWorld)} to ${Math.round(chaseWorld)})`)
    : fail("a chase camera did not widen the world it draws");

  let bare = 0;
  for (let t = 0; t <= 8; t += 0.1) {
    const c = chaseFor(spec, sim, t, scn.camera);
    const halfDiag = ((c.scale * W) / 2) * Math.SQRT2;
    if (Math.hypot(c.cx - CX, c.cy - CY) + halfDiag > chaseWorld + 1e-6) bare++;
  }
  bare === 0
    ? ok("every chase frame, at every rotation, lands inside the drawn world")
    : fail(`${bare} chase frame(s) could show bare ground in a corner`);
}

/* ---------- drift is measured against a genuinely clean line -------- */
console.log("\nDRIFT REPORTS THE FAULT, NOT THE CAR AGAINST ITSELF");
{
  /* The camera rides basePose, which is smooth and is the right thing to
     point a viewport with -- but basePose is NOT trait-free. overshoot,
     slowStart, wideTurn and cutsCorner write stopBias / startDelay /
     turnBias, which movementOf and schedule then read, so basePose
     already contains their fault and comparing the car against it asks
     whether the car deviates from itself.

     Measured before this was corrected: four of the five path-bending
     faults reported a peak drift of exactly 0.00 m while differing from a
     clean line by 2.54 m to 12.24 m. Same oracle-knowledge bug cleanPose
     was introduced into belief.js to fix, left unfixed in frame.js.

     This is the readout a renderer uses to say "there, that is the
     fault", so a zero here is not a small inaccuracy -- it is the
     examiner game's central signal reporting nothing. */
  const spec = crossSpec("stop", 1);
  const scene = (traits) => ({
    id: "drift", road: spec, control: "stop", duration: 20,
    ego: { from: "S", intent: "left", arriveAt: 1.2, stops: true, signal: "left", traits },
    actors: [
      { id: "h1", from: "W", intent: "straight", arriveAt: 1.4, stops: false, kind: "car", priority: -3 },
      { id: "h2", from: "W", intent: "straight", arriveAt: 4.6, stops: false, kind: "car", priority: -2 },
    ],
  });

  const rows = [];
  for (const trait of TRAIT_KEYS) {
    const sim = simulate(scene([trait]));
    let drift = 0, truth = 0;
    for (let t = 0; t <= 16; t += 0.05) {
      const c = chaseFor(spec, sim, t, null);
      drift = Math.max(drift, Math.hypot(c.drift.ahead, c.drift.lateral));
      const real = poseAt(sim.ego, t), clean = cleanPose(sim.ego, t);
      if (real && clean && !real.hidden && !clean.hidden && !real.gone && !clean.gone) {
        truth = Math.max(truth, Math.hypot(real.x - clean.x, real.y - clean.y));
      }
    }
    rows.push({ trait, drift, truth });
  }

  console.log("   trait          drift reported (m)   true offset (m)");
  console.log("   " + "-".repeat(56));
  for (const r of rows) {
    console.log(`   ${r.trait.padEnd(13)} ${(r.drift / M(1)).toFixed(2).padStart(18)} ${(r.truth / M(1)).toFixed(2).padStart(17)}`);
  }

  const wrong = rows.filter((r) => Math.abs(r.drift - r.truth) > M(0.01));
  wrong.length === 0
    ? ok("drift equals the car's real offset from a clean drive, for every trait")
    : fail(`${wrong.length} trait(s) report a drift that is not the real offset: ${wrong.map((r) => r.trait).join(", ")}`);

  /* And the ones that bend a path have to report something, or the
     readout is silently useless where it matters most. */
  const silent = rows.filter((r) => r.truth > M(0.45) && r.drift < M(0.01));
  silent.length === 0
    ? ok(`every fault that moves the car by more than POS_VISIBLE shows up in drift (${rows.filter((r) => r.drift > M(0.45)).length} of ${rows.length} traits)`)
    : fail(`${silent.map((r) => r.trait).join(", ")} move the car but report zero drift`);

  /* The camera itself must NOT have moved with the fix: riding a clean
     line would slide a slow-starting candidate metres out of frame, which
     is a legibility decision and not this fix's to make. */
  const slow = simulate(scene(["slowStart"]));
  let framedOnBase = true;
  for (let t = 0; t <= 16; t += 0.25) {
    const c = chaseFor(spec, slow, t, null);
    const b = basePose(slow.ego, t);
    if (!b || b.hidden || b.gone || !Number.isFinite(b.x)) continue;
    if (Math.abs(c.carX - b.x) > 1e-6 || Math.abs(c.carY - b.y) > 1e-6) framedOnBase = false;
  }
  framedOnBase
    ? ok("and the camera still frames the intended line, so the fix changed the readout and not the view")
    : fail("the camera's framing moved, which this fix was not supposed to touch");
}

console.log("\n" + "=".repeat(66));
console.log(problems === 0 ? "OK: camera verified." : `${problems} PROBLEM(S) FOUND.`);
process.exit(problems === 0 ? 0 : 1);
