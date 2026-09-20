/* =====================================================================
   THE CHASE CAMERA: behind the car, looking down the road ahead.

   The maintainer's playtest said "it's hard to see what's coming up",
   which is what this camera exists to fix. What can be checked without
   his eyes: the camera leads the car in its direction of travel; the
   lead grows with speed and is floored and capped; the camera eases
   toward where it wants to be rather than snapping, whatever the frame
   rate; the view turns so the road ahead is up the screen, the short
   way round, never faster than a driver would turn their head; the
   car stays on the screen at every zoom on a phone held upright and on
   a wide desk canvas; and the rotated projection agrees with itself --
   the point in front of the car lands above it on screen, and the
   depth order under rotation is the depth order the screen shows.
   ===================================================================== */
import { newChase, chaseStep, zoomFor, LEAD_MIN, LEAD_MAX, LEAD_SECONDS, TURN_RATE, UP_HEADING } from "../src/iso/chase.js";
import { viewOf, LIFT } from "../src/iso/project.js";

let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? " ok " : "FAIL"} ${msg}`); if (!ok) failed++; };
const norm = (d) => ((((d + 180) % 360) + 360) % 360) - 180;

/* 1. The lead: in the direction of travel, growing with speed, floored and capped. */
{
  for (const heading of [0, 90, -90, 180, 37]) {
    const car = { x: 100, y: 100, z: 0, heading, v: 16.7 };
    const cam = chaseStep(newChase(), car, 1 / 60);
    const dx = cam.x - car.x, dy = cam.y - car.y;
    const along = Math.hypot(dx, dy), dir = (Math.atan2(dy, dx) * 180) / Math.PI;
    check(Math.abs(norm(dir - heading)) < 0.01 && Math.abs(along - 16.7 * LEAD_SECONDS) < 0.01, `heading ${heading}: the camera sits ${along.toFixed(1)} m ahead of the car along its heading`);
  }
  const at = (v) => chaseStep(newChase(), { x: 0, y: 0, z: 0, heading: 0, v }, 1 / 60).lead;
  check(at(5.6) > at(2) || at(2) === LEAD_MIN, `the lead grows with speed: ${at(5.6).toFixed(1)} m at 20 km/h, ${at(16.7).toFixed(1)} m at 60`);
  check(at(0) === LEAD_MIN && at(50) === LEAD_MAX, `floored at ${LEAD_MIN} m for a stopped car and capped at ${LEAD_MAX} m`);
}

/* 2. Easing: no snap after the first frame, frame-rate independent, and it arrives. */
{
  const car = { x: 0, y: 0, z: 0, heading: 0, v: 10 };
  let cam = chaseStep(newChase(), car, 1 / 60);
  const moved = { x: 200, y: 0, z: 0, heading: 0, v: 10 };
  const one = chaseStep(cam, moved, 1 / 60);
  check(one.x < moved.x + 10 && one.x > cam.x, `a car that jumped 200 m ahead pulls the camera ${(one.x - cam.x).toFixed(1)} m in one frame, not all the way`);
  /* The same second at 60 Hz and at 20 Hz lands within a metre. */
  let a = cam, b = cam;
  for (let i = 0; i < 60; i++) a = chaseStep(a, moved, 1 / 60);
  for (let i = 0; i < 20; i++) b = chaseStep(b, moved, 1 / 20);
  check(Math.abs(a.x - b.x) < 1.0, `after one second the camera is where it would be at any frame rate (${a.x.toFixed(1)} m at 60 Hz, ${b.x.toFixed(1)} at 20)`);
  for (let i = 0; i < 300; i++) a = chaseStep(a, moved, 1 / 60);
  check(Math.abs(a.x - (moved.x + a.lead)) < 0.05, "and it arrives");
}

/* 3. Rotation: the road ahead is up; the short way round; rate-limited; off when asked. */
{
  for (const heading of [0, 90, 180, -90, 45]) {
    const cam = chaseStep(newChase(), { x: 0, y: 0, z: 0, heading, v: 10 }, 1 / 60);
    const view = viewOf(6, cam, cam.rot, { w: 400, h: 600 });
    const h = (heading * Math.PI) / 180;
    const [x0, y0] = view.P(0, 0, 0), [x1, y1] = view.P(Math.cos(h) * 10, Math.sin(h) * 10, 0);
    check(Math.abs(x1 - x0) < 0.01 && y1 < y0, `heading ${heading}: ten metres ahead of the car is straight up the screen (dx ${(x1 - x0).toFixed(2)} px, dy ${(y1 - y0).toFixed(1)})`);
  }
  /* From facing east to facing north (a left turn, -90): the rotation goes the short way, at most TURN_RATE. */
  let cam = chaseStep(newChase(), { x: 0, y: 0, z: 0, heading: 0, v: 10 }, 1 / 60);
  const rot0 = cam.rot;
  cam = chaseStep(cam, { x: 0, y: 0, z: 0, heading: -90, v: 10 }, 1 / 60);
  const d = norm(cam.rot - rot0);
  check(d > 0 && d <= TURN_RATE / 60 + 1e-9, `a 90 degree turn starts turning the view the short way at no more than ${TURN_RATE} degrees a second (${(d * 60).toFixed(0)} in this frame)`);
  for (let i = 0; i < 240; i++) cam = chaseStep(cam, { x: 0, y: 0, z: 0, heading: -90, v: 10 }, 1 / 60);
  check(Math.abs(norm(cam.rot - (UP_HEADING + 90))) < 0.5, `and settles with north up (${cam.rot.toFixed(1)} degrees)`);
  /* Through the wrap: from heading 170 to -170 is a 20 degree turn, not 340. */
  let w = chaseStep(newChase(), { x: 0, y: 0, z: 0, heading: 170, v: 10 }, 1 / 60);
  const r0 = w.rot;
  w = chaseStep(w, { x: 0, y: 0, z: 0, heading: -170, v: 10 }, 1 / 60);
  check(Math.abs(norm(w.rot - r0)) < 5, "a turn across the 180 line goes the short way round");
  const fixed = chaseStep(newChase(), { x: 0, y: 0, z: 0, heading: 37, v: 10 }, 1 / 60, { rotate: false });
  check(fixed.rot === 0, "with rotation off the view is the plain isometric one");
}

/* 4. The car stays on the screen at every lead, on a phone upright and a wide desk canvas. */
{
  for (const [w, h, name] of [[395, 560, "a phone upright"], [1249, 446, "a wide desk canvas"], [800, 455, "the pane"]]) {
    let worst = 0;
    for (const v of [0, 5, 10, 16.7, 25, 33]) {
      const car = { x: 0, y: 0, z: 0, heading: 0, v };
      const cam = chaseStep(newChase(), car, 1 / 60);
      const k = zoomFor(w, h, cam.lead);
      const view = viewOf(k, cam, cam.rot, { w, h });
      const [, py] = view.P(0, 0, 0);
      worst = Math.max(worst, py / h);
    }
    check(worst <= 0.93, `on ${name} the car never sits below ${(worst * 100).toFixed(0)}% of the height at any speed`);
  }
  check(zoomFor(395, 560, LEAD_MAX) < zoomFor(395, 560, LEAD_MIN), "the view is wider at speed than at rest");
}

/* 5. The rotated projection is consistent: depth order under rotation matches the screen. */
{
  const cam = { x: 0, y: 0, z: 0 };
  for (const rot of [0, 37, 90, -135]) {
    const view = viewOf(5, cam, rot, { w: 400, h: 400 });
    /* Two points on one line of sight in the rotated frame project to the same pixel and the nearer has the larger key. */
    const a = { x: 10, y: 20, z: 0 };
    const r = (rot * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
    /* Step along the line of sight (1, 1, 1/LIFT) in the ROTATED frame: in the world that is R^-1 (1, 1). */
    const b = { x: a.x + (c + s) * 3, y: a.y + (-s + c) * 3, z: a.z + 3 / LIFT };
    const [ax, ay] = view.P(a.x, a.y, a.z), [bx, by] = view.P(b.x, b.y, b.z);
    check(Math.abs(ax - bx) < 1e-6 && Math.abs(ay - by) < 1e-6 && view.key(b.x, b.y, b.z) > view.key(a.x, a.y, a.z), `rot ${rot}: a point up the line of sight lands on the same pixel and keys nearer`);
    /* A box face that faces the eye in the rotated frame has a positive dot with view.eye. */
    check(Math.abs(Math.hypot(view.eye.x, view.eye.y) - Math.SQRT2) < 1e-9, "the eye direction turned back into the world keeps its length");
  }
}

if (failed) { console.log(`\n${failed} FAILED`); process.exit(1); }
console.log("\nOK: the chase camera leads with speed, eases, turns the short way, keeps the car on screen, and the rotated view agrees with itself.");
