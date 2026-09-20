/* =====================================================================
   THE PLAYER AT THE WHEEL: the car, the two controls, and contact.

   What "feels right to drive" is the maintainer's to judge on a phone.
   What can be checked here is that the model underneath is honest: the
   slider is monotone with a coasting band in the middle and a real
   emergency stop at the bottom; the wheel is limited by lock at walking
   pace and by grip at speed, and does nothing at rest; a road that bends
   under a straight wheel really does drift the car, and a driver who
   steers can really hold a lane through the stage-0 bends; contact says
   yes for a car you hit and never for one a lane away; and the pointer
   arithmetic puts the thumb where it says.
   ===================================================================== */
import { accelFor, yawRateFor, curvatureAt, stepPlayer, playerPose, touching, newPlayer, ACCEL_MAX, BRAKE_MAX, NEUTRAL } from "../src/sim/player.js";
import { controls, sliderValue, STEER_TRAVEL, SLIDER_W, SLIDER_TOP, SIGNAL_ZONE } from "../src/iso/controls.js";
import { valleyRoad, poseAt, LANE } from "../src/iso/road.js";
import { seedScene, stepWithPlayer, carsOf, DT } from "../src/iso/world.js";

let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? " ok " : "FAIL"} ${msg}`); if (!ok) failed++; };

/* 1. The slider. */
{
  const v = 15;
  const us = [-1, -0.8, -0.5, -0.2, -NEUTRAL, 0, NEUTRAL, 0.2, 0.5, 0.8, 1];
  const as = us.map((u) => accelFor(u, v));
  check(as.every((a, i) => i === 0 || a >= as[i - 1] - 1e-9), "acceleration never falls as the slider rises");
  check(accelFor(0, v) < 0 && accelFor(NEUTRAL, v) === accelFor(-NEUTRAL, v), `the neutral band coasts, and coasts the same across its width (${accelFor(0, v).toFixed(2)} m/s^2 at 54 km/h)`);
  check(accelFor(0, 0) < 0 && accelFor(0, 30) < accelFor(0, 10), "coasting slows harder the faster you go");
  check(Math.abs(accelFor(-1, v) + BRAKE_MAX) < 1e-9 && Math.abs(accelFor(1, v) - ACCEL_MAX) < 1e-9, `full brake is ${BRAKE_MAX} m/s^2 and full throttle ${ACCEL_MAX}`);
  check(accelFor(-0.5, v) > -BRAKE_MAX && accelFor(-0.5, v) < -1.5, `half brake is partial (${accelFor(-0.5, v).toFixed(2)} m/s^2)`);
}

/* 2. The wheel. */
{
  check(yawRateFor(1, 0) === 0, "a stationary car does not turn");
  const r = (v) => v / yawRateFor(1, v);
  check(r(2) < 5 && r(2) > 3, `at walking pace the turn is at the lock, about four metres (${r(2).toFixed(1)} m)`);
  check(r(17) > 40 && r(17) < 60, `at 60 km/h the turn is limited by grip, about fifty metres (${r(17).toFixed(1)} m)`);
  check(yawRateFor(-0.5, 10) === -yawRateFor(0.5, 10), "left is the mirror of right");
  check(Math.abs(yawRateFor(1, 17) * 17 - 6.0) < 1e-6, "full deflection at speed is exactly the grip limit's sideways acceleration");
}

/* 3. The road under the car. */
{
  const road = valleyRoad();
  const ks = []; for (let s = 10; s < road.length - 10; s += 5) ks.push(curvatureAt(road, poseAt, s));
  check(ks.some((k) => k > 1e-3) && ks.some((k) => k < -1e-3), "the valley road bends both ways");
  const R = 1 / Math.max(...ks.map(Math.abs));
  check(R > 80 && R < 400, `its tightest bend is a road bend, not a corner (radius ${R.toFixed(0)} m)`);

  /* A straight wheel on a bending road: the car leaves the lane. */
  let me = newPlayer(0, LANE / 2, 16.7);
  let left = null;
  for (let i = 0; i < 20 * 40; i++) {
    me = stepPlayer(me, { steer: 0, slider: 0.55 }, road, poseAt, DT);
    if (left == null && Math.abs(me.off - LANE / 2) > LANE / 2) left = me.s;
  }
  check(left != null && left < road.length, `a wheel held straight leaves the lane on the first bend (at ${left?.toFixed(0)} m)`);

  /* A driver who steers holds it: a plain proportional controller, the
     kind a thumb is. */
  me = newPlayer(0, LANE / 2, 16.7);
  let worst = 0, peak = 0;
  while (me.s < road.length - 5) {
    const steer = Math.max(-1, Math.min(1, -(me.off - LANE / 2) * 0.3 - me.psi * 3));
    me = stepPlayer(me, { steer, slider: me.v < 16.7 ? 0.6 : 0 }, road, poseAt, DT);
    worst = Math.max(worst, Math.abs(me.off - LANE / 2));
    peak = Math.max(peak, me.v);
  }
  check(worst < 0.8, `a steering driver holds the lane the whole road at 60 km/h (worst ${worst.toFixed(2)} m off centre)`);
  check(peak < 17.5, `and the slider holds the speed (peak ${(peak * 3.6).toFixed(0)} km/h)`);

  /* Off the road the car crawls and can come back. */
  me = { ...newPlayer(100, road.width / 2 + 3, 20), psi: 0 };
  for (let i = 0; i < 20 * 5; i++) me = stepPlayer(me, { steer: 0, slider: 1 }, road, poseAt, DT);
  check(me.v < 9, `on the grass, full throttle crawls (${(me.v * 3.6).toFixed(0)} km/h after 5 s)`);
  let back = null;
  for (let i = 0; i < 20 * 12 && back == null; i++) {
    const steer = Math.max(-1, Math.min(1, -(me.off - LANE / 2) * 0.3 - me.psi * 3));
    me = stepPlayer(me, { steer, slider: 0.6 }, road, poseAt, DT);
    if (Math.abs(me.off - LANE / 2) < 0.5 && Math.abs(me.psi) < 0.1) back = i * DT;
  }
  check(back != null, `and a driver steering for the lane is back in it, straight, within ${back?.toFixed(1)} s`);
}

/* 4. Contact. */
{
  const a = { x: 0, y: 0, z: 0, heading: 0 };
  const at = (x, y, heading = 0, z = 0) => ({ x, y, z, heading });
  check(touching(a, at(4.3, 0)) && !touching(a, at(4.7, 0)), "nose to tail: touching at 4.3 m between centres, clear at 4.7 (a car is 4.5 m long)");
  check(touching(a, at(0, 1.7)) && !touching(a, at(0, 2.1)), "abeam: touching at 1.7 m, clear at 2.1 (a car is 1.8 m wide)");
  check(!touching(a, at(0, LANE)), "a car a lane over never touches");
  check(!touching(a, at(0, 0, 0, 6.5)), "a car on the overpass never touches one beneath it");
  check(touching(at(3, 1, 45), a) === touching(a, at(3, 1, 45)), "contact is symmetric");
}

/* 5. The player in the traffic: followed, never driven through by the step. */
{
  let scene = seedScene(3, 60);
  let me = newPlayer(120, LANE / 2, 0);   // stopped in the lane
  for (let i = 0; i < 20 * 20; i++) {
    me = stepPlayer(me, { steer: 0, slider: 0 }, scene.valley, poseAt, DT);
    scene = stepWithPlayer(scene, me);
  }
  const fwd = scene.worlds[0].world.actors;
  const player = fwd.find((a) => a.player);
  const behind = fwd.filter((a) => !a.player && a.s < player.s).sort((p, q) => q.s - p.s)[0];
  check(player && Math.abs(player.s - me.s) < 1e-9, "the player is an actor in the traffic's world, where the screen put them");
  check(behind && player.s - behind.s > 4.5 && behind.v < 1, `the car behind a stopped player stops behind them (${(player.s - behind.s).toFixed(1)} m back, ${(behind.v * 3.6).toFixed(0)} km/h)`);
  const drawn = carsOf(scene, 0).flatMap((r) => r.cars).find((c) => c.player);
  check(drawn && drawn.colour && Math.abs(drawn.weave - (me.off - LANE / 2)) < 1e-9, "the renderer gets the player in their own colour at their own offset");
  const pose = playerPose(me, scene.valley, poseAt);
  check(Number.isFinite(pose.x) && Number.isFinite(pose.heading), "and a finite pose");
}

/* 6. The pointer arithmetic. */
{
  const box = { w: 400, h: 600 };
  const c = controls();
  c.pointer("down", 1, box.w - SLIDER_W / 2, SLIDER_TOP, box);
  check(c.state.slider === 1, "a thumb at the top of the track is full throttle");
  const mid = (SLIDER_TOP + box.h - 24) / 2;
  c.pointer("move", 1, box.w - SLIDER_W / 2, mid, box);
  check(c.state.slider === 0, "at the middle it is neutral");
  c.pointer("up", 1, box.w - SLIDER_W / 2, mid, box);
  c.pointer("down", 2, 100, 300, box);
  c.pointer("move", 2, 100 + STEER_TRAVEL / 2, 300, box);
  check(c.state.steer === 0.5, "half a thumb-sweep right is half lock");
  c.pointer("move", 2, 100 - 3 * STEER_TRAVEL, 300, box);
  check(c.state.steer === -1, "and it clamps at full lock");
  c.pointer("up", 2, 0, 0, box);
  check(c.state.steer === 0, "the wheel centres when the thumb lifts");
  const hold = controls(), spring = controls({ spring: true });
  hold.pointer("down", 1, box.w - 1, SLIDER_TOP, box); hold.pointer("up", 1, box.w - 1, SLIDER_TOP, box);
  spring.pointer("down", 1, box.w - 1, SLIDER_TOP, box); spring.pointer("up", 1, box.w - 1, SLIDER_TOP, box);
  check(hold.state.slider === 1 && spring.state.slider === 0, "the slider holds where it is left, or springs back, as configured");
  check(sliderValue(0, box) === 1 && sliderValue(box.h, box) === -1, "above and below the track clamp to the ends");
  /* The indicators: a tap in a top corner toggles that signal; a drag
     from there steers and signals nothing; the other side switches. */
  const s = controls();
  s.pointer("down", 3, 20, 20, box, 1000); s.pointer("up", 3, 20, 20, box, 1100);
  check(s.state.signal === "left", "a tap in the top-left corner signals left");
  s.pointer("down", 4, box.w - 20, 20, box, 2000); s.pointer("up", 4, box.w - 20, 20, box, 2100);
  check(s.state.signal === "right", "a tap top-right switches it to right");
  s.pointer("down", 5, box.w - 20, 20, box, 3000); s.pointer("up", 5, box.w - 20, 20, box, 3100);
  check(s.state.signal === null, "and tapping the same side again cancels it");
  s.pointer("down", 6, 20, 20, box, 4000); s.pointer("move", 6, 20 + STEER_TRAVEL, 20, box, 4050);
  check(s.state.steer === 1 && s.state.signal === null, "a drag that starts in the corner is steering, not a signal");
  s.pointer("up", 6, 20 + STEER_TRAVEL, 20, box, 4100);
  check(s.state.signal === null && s.state.steer === 0, "and lifting it signals nothing");
  s.pointer("down", 7, 20, 20, box, 5000); s.pointer("up", 7, 20, 20, box, 5600);
  check(s.state.signal === null, "a press held longer than a tap is not a tap");
  check(s.signal("left") === "left" && s.signal("left") === null, "the keyboard's q and e toggle the same signal");
  check(SIGNAL_ZONE.h < SLIDER_TOP, "the slider's track starts below the right-hand signal zone, so a thumb on it is never a signal");
}

if (failed) { console.log(`\n${failed} FAILED`); process.exit(1); }
console.log("\nOK: the car, the two controls and contact hold up; whether it feels right to drive is the phone's question.");
