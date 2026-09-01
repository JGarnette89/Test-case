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
import { simulate, movementOf, poseAt, CX, CY, STEP, W } from "../src/engine/index.js";
import { specOf } from "../src/engine/road.js";
import { frameFor, cameraFor, worldHalfFor } from "../src/frame.js";

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

console.log("\n" + "=".repeat(66));
console.log(problems === 0 ? "OK: camera verified." : `${problems} PROBLEM(S) FOUND.`);
process.exit(problems === 0 ? 0 : 1);
