/* =====================================================================
   THE CHASE CAMERA: behind the car, looking down the road ahead.

   The maintainer's first playtest of the wheel screen (20 Sep): "it's
   hard to see what's coming up." The fixed isometric view put the road
   ahead in whichever screen direction the car happened to point -- on
   half the headings the player was driving toward the bottom of the
   screen -- and the camera sat on the car rather than ahead of it. So:

   THE CAMERA LEADS THE CAR, in the direction of travel, by a distance
   that grows with speed -- more road at 60 than at 20 -- and it EASES,
   because a camera that snaps reads as sway. The lead is seconds of
   travel, floored so a stopped car still shows the intersection in
   front of it and capped so the car stays on the screen.

   AND THE VIEW ROTATES WITH THE CAR, so the road ahead is always up.
   The engineering call, made on the merits and recorded in
   SIMULATOR.md 5.2 because it constrains the art: everything the
   renderer draws today is a box the code builds, which rotates for
   free, so a rotating view costs nothing now; what it costs later is
   that scenery cannot be a single-view isometric sprite -- it has to
   be rotation-tolerant (faces on a box, several views, or a billboard)
   -- and car sprites are indexed by their heading relative to the
   view, which is what a 32-heading set already is. Four or eight
   snapped rotations would have needed the same scenery views and added
   a jolt at every turn; not rotating is what was just judged undrivable.
   The rotation is eased and rate-limited, never instantaneous; a fixed
   view remains available as a toggle, for the comparison.

   Pure: no canvas, no React. The screen owns the state and calls
   `chaseStep` once a frame.
   ===================================================================== */
export const LEAD_SECONDS = 2.6;   // of travel: at 60 km/h, 43 m of road ahead
export const LEAD_MIN = 14;        // m: at rest the intersection ahead is still in view
export const LEAD_MAX = 48;        // m: the car stays on the screen at the zoom the speed gives
export const EASE = 3.5;           // per second: the camera closes most of a gap in about a third of a second
export const TURN_RATE = 120;      // degrees per second, at most, so a turn is watched rather than snapped
export const TURN_EASE = 2.5;      // per second, for the rotation

/* The screen-up direction is the world's north-west diagonal under the
   2:1 projection (px = x - y, py = (x + y) / 2: moving along (-1, -1)
   keeps px and takes py up). A view rotated by `rot` puts a car heading
   `h` (degrees, clockwise from +x, y down) straight up when
   h + rot = -135. */
export const UP_HEADING = -135;
const norm = (d) => ((((d + 180) % 360) + 360) % 360) - 180;

export function newChase(at = { x: 0, y: 0, z: 0 }, heading = 0) {
  return { x: at.x, y: at.y, z: at.z ?? 0, rot: UP_HEADING - heading, lead: LEAD_MIN, snap: true };
}

/* One frame. `car` is { x, y, z, heading, v }; `dt` seconds; `rotate`
   false holds the view fixed (rot 0). Returns the new camera: its
   world centre, its rotation in degrees, and the lead it is using. */
export function chaseStep(cam, car, dt, { rotate = true } = {}) {
  const lead = Math.max(LEAD_MIN, Math.min(LEAD_MAX, car.v * LEAD_SECONDS));
  const h = (car.heading * Math.PI) / 180;
  const want = { x: car.x + Math.cos(h) * lead, y: car.y + Math.sin(h) * lead, z: car.z ?? 0 };
  const wantRot = rotate ? UP_HEADING - car.heading : 0;
  if (cam.snap) return { x: want.x, y: want.y, z: want.z, rot: wantRot, lead, snap: false };
  /* Exponential easing, frame-rate independent. */
  const f = 1 - Math.exp(-EASE * dt);
  const x = cam.x + (want.x - cam.x) * f, y = cam.y + (want.y - cam.y) * f, z = cam.z + (want.z - cam.z) * f;
  /* Rotation: the short way round, eased, and rate-limited. */
  const d = norm(wantRot - cam.rot);
  const step = d * (1 - Math.exp(-TURN_EASE * dt));
  const cap = TURN_RATE * dt;
  const rot = norm(cam.rot + Math.max(-cap, Math.min(cap, step)));
  return { x, y, z, rot, lead: cam.lead + (lead - cam.lead) * f, snap: false };
}

/* Pixels per metre for a view that shows the lead plus a margin above
   the car -- wider as the car goes faster -- and never so close that
   the car, which sits `lead` metres below the camera's centre, leaves
   the bottom of the screen: on a wide, short canvas the height is the
   limit, on a phone held upright the width is. `w`, `h` in CSS pixels;
   `centreY` where the camera's point sits, as a share of the height. */
export function zoomFor(w, h, lead, centreY = 0.55) {
  const byWidth = w / (34 + lead * 0.9);
  /* The car is 0.707 k lead below the centre (screen-down is a metre of
     world diagonal per 0.707 pixel-metres); keep it above 0.92 h. */
  const byHeight = ((0.92 - centreY) * h) / (0.707 * Math.max(1, lead));
  return Math.min(byWidth, byHeight);
}
