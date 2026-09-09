/* =====================================================================
   FRAME
   The camera. Pure geometry, no React and no colour, so it can be tested
   the same headless way the engine is — the renderer is the only file
   that should be drawing anything.

   frameFor is the resting frame: board size derived from lane geometry
   alone (see f9c3f5b), the same for every frame of a run. Good enough
   for every scenario built so far, because every road user's approach
   fits inside it.

   A merge or a long lane change will not: the car worth reading is
   further out than the intersection board reaches, and it has to be visible
   before the decision, not at it. cameraFor lets a scenario name which
   actors the camera should ease out to cover. How far is read off that
   actor's own spawn point — the engine already knows how far back its
   approach starts — never a picked pixel value. When is read off its
   arriveAt, the same clock everything else in the engine runs on.

   Pure zoom: the intersection stays centred, only the extent grows. A frame
   that also panned could slide the intersection off-centre right when
   the player needs to be reading it — a problem worth solving once a
   real scenario needs it, not before.
   ===================================================================== */
import { M, W, CX, CY, movementOf, basePose, poseAt, cleanPose } from "./engine/index.js";
import { speedAt } from "./engine/paths.js";
import { boxHalf } from "./engine/road.js";

export function frameFor(spec) {
  const { vx, hy } = boxHalf(spec, M(3.6));
  // Enough road either side of the intersection to read an approach.
  const wanted = 2 * Math.max(vx, hy) + M(26);
  const size = Math.max(W, wanted);
  const half = size / 2;
  return { box: `${CX - half} ${CY - half} ${size} ${size}`, scale: size / W };
}

const smoothstep = (k) => k * k * (3 - 2 * k);

// 0 before `from`, 1 at and after `to`, eased between.
const easeWindow = (t, from, to) => {
  if (to <= from) return t >= to ? 1 : 0;
  return smoothstep(Math.max(0, Math.min(1, (t - from) / (to - from))));
};

/* `camera.track` is a list of { id, revealBy, rampFor, pad }:
     id        which actor (or "ego") the frame must widen to cover
     revealBy  the frame must be fully open this many seconds before the
               actor arrives — so it is read before the decision, not at it
     rampFor   how many seconds the zoom itself takes, ending at revealBy
     pad       world-unit clearance kept beyond the actor, past its spawn
   Absent `camera`, or an id with nothing to track, this is frameFor. */
export function cameraFor(spec, sim, t, camera) {
  const base = frameFor(spec);
  const tracks = camera?.track;
  if (!tracks || !tracks.length) return base;

  const half0 = (base.scale * W) / 2;
  let half = half0;
  for (const track of tracks) {
    const { id, revealBy = 3, rampFor = 2.5, pad = M(3) } = track;
    const p = id === "ego" ? sim.ego : sim.actors.find((a) => a.id === id);
    if (!p) continue;
    const mv = movementOf(p);
    if (!mv.spawn) continue;
    const reach = Math.max(Math.abs(mv.spawn.x - CX), Math.abs(mv.spawn.y - CY)) + pad;
    const readyAt = p.arriveAt - revealBy;
    const e = easeWindow(t, readyAt - rampFor, readyAt);
    half = Math.max(half, half0 + (reach - half0) * e);
  }
  const size = half * 2;
  return { box: `${CX - half} ${CY - half} ${size} ${size}`, scale: size / W };
}

/* =====================================================================
   THE CHASE CAMERA — riding with the candidate

   The examiner sits in the car, so the view goes with the car: centred on
   it and turning alongside it, rather than hanging over a fixed intersection.

   IT FOLLOWS THE INTENDED POSE, NOT THE ACTUAL ONE, and that is the whole
   design rather than an implementation detail. Lock the camera to
   poseAt() -- where the car really is -- and the car sits dead centre and
   perfectly straight forever, while the WORLD wobbles around it. Every
   steering fault the examiner game exists to catch would become invisible
   at exactly the moment it happened: a wandering driver would read as a
   wandering camera, a wide turn as the road sliding sideways.

   So the camera rides basePose(): the car's motion with no traits applied,
   which is where a clean driver would have been. The car is then drawn at
   its real pose and visibly deviates from the centre of frame -- drifting
   in its lane, swinging wide, cutting in. The deviation IS the fault, and
   it is the same difference faults.js derives by controlled comparison.
   One idea, read two ways.

   It also settles the wobble for free. wander turns the heading +/-6 deg
   several times a scenario; a camera bolted to that would spin the world
   on every twitch. basePose has no twitch in it.

   Rotation convention: the engine measures heading from +x, screen y runs
   down, and the candidate's straight-ahead is drawn UP. So the world is
   turned by -90 - rot about the car. That makes the examiner's gaze -- 
   already held in degrees off the car's heading, see sight.js -- land on
   a fixed screen direction, which is the whole reason relative gaze was
   the right call there.

   Returns the same { box, scale } every other frame does, plus the centre
   and the rotation to apply about it. Composing them is the renderer's
   job; this file still draws nothing.
   ===================================================================== */
/* How far ahead the examiner can read, in SECONDS of travel rather than
   in metres. A distance would be wrong at one speed or the other; a
   duration is the same judgment at any speed, and it is how far ahead a
   driver is actually thinking. Ten seconds is the starting value, meant
   to be played with.

   And a little road behind, because a chase view with the car on the
   bottom edge feels like the world is shoving it forward. A quarter of
   the forward reach is enough to sit in. */
export const LOOK_AHEAD = 10;
export const LOOK_BEHIND_FRACTION = 0.25;

/* The speed this leg is driven at — the profile's own cruise or top
   speed, not the instantaneous one. Instantaneous would collapse the
   view to nothing while the candidate sits at a stop line and then heave
   it open as they pull away, which is exactly the seasick camera nobody
   wants. Read off the engine's motion profile, so a slower manoeuvre
   genuinely does draw the view in. */
function legSpeed(p) {
  const prof = movementOf(p)?.traverse?.profile;
  if (!prof) return M(11.5);
  return prof.kind === "cruise" ? prof.v : prof.vmax;
}

/* The frame around a pose travelling at a speed. Factored out of
   chaseFor because the continuous world frames a candidate whose pose
   comes from the world rather than from one scenario's ego — and both
   must frame identically, or the viewport would mean something different
   inside an intersection than on the road between two.

   This is now rules rather than presentation: the viewport decides what
   is markable, so a renderer may not choose its own extent. See
   EXAMINER-REDESIGN.md section 3.1. */
export function frameAround(pose, speed, { lookAhead = LOOK_AHEAD } = {}) {
  const ahead = Math.max(M(12), lookAhead * speed);
  const behind = ahead * LOOK_BEHIND_FRACTION;
  const size = ahead + behind;
  const half = size / 2;
  const r = (pose.rot * Math.PI) / 180;
  const push = half - behind;
  const cx = pose.x + Math.cos(r) * push;
  const cy = pose.y + Math.sin(r) * push;
  return {
    box: `${cx - half} ${cy - half} ${size} ${size}`,
    scale: size / W,
    cx, cy,
    carX: pose.x, carY: pose.y,
    rotate: -90 - pose.rot,
    ahead, behind,
    seconds: ahead / speed,
  };
}

export function chaseFor(spec, sim, t, camera, { lookAhead = LOOK_AHEAD } = {}) {
  return chaseOn(intendedPose(sim.ego, t), legSpeed(sim.ego), {
    lookAhead,
    drift: driftOf(sim.ego, t),
  });
}

/* THE CAMERA IS A FUNCTION OF A POSE, and nothing else. Split out of
   chaseFor so a drive that spans SEVERAL intersections can point it at the
   candidate's position in world coordinates rather than at one scenario's
   ego -- which is what the continuous world needs and what a per-scenario
   camera could never give, because at a boundary it re-centred on a new
   scene 70-90m away. That jump is the hard cut.

   chaseFor keeps its exact behaviour by delegating here. */
export function chaseOn(pose, speed, { lookAhead = LOOK_AHEAD, drift = null } = {}) {
  const ahead = Math.max(M(12), lookAhead * speed);
  const behind = ahead * LOOK_BEHIND_FRACTION;
  const size = ahead + behind;
  const half = size / 2;

  /* Sit the car low in the frame so the road ahead gets most of it. The
     centre therefore rides in front of the car, along its heading. */
  const r = (pose.rot * Math.PI) / 180;
  const push = half - behind;
  const cx = pose.x + Math.cos(r) * push;
  const cy = pose.y + Math.sin(r) * push;

  return {
    box: `${cx - half} ${cy - half} ${size} ${size}`,
    scale: size / W,
    cx, cy,
    // Where the car actually is, which is not the centre of the frame.
    carX: pose.x, carY: pose.y,
    rotate: -90 - pose.rot,
    ahead, behind,
    seconds: ahead / speed,
    // What the car is actually doing, for a renderer that wants to show
    // the deviation explicitly rather than leave it implicit.
    drift,
  };
}

/* basePose stops advancing once the run is over; hold the last real pose
   rather than letting the camera snap back to the start. */
function intendedPose(p, t) {
  const b = basePose(p, t);
  if (b && !b.hidden && Number.isFinite(b.x)) return b;
  return basePose(p, Math.max(0, t - 0.05));
}

/* How far the car has strayed from where a clean drive would have put it,
   in world units and degrees. Positive lateral is to the driver's right.

   MEASURED AGAINST cleanPose, NOT AGAINST THE CAMERA'S OWN CENTRE. The
   camera rides basePose, which is smooth and predictable and is the right
   thing to point a viewport with — but basePose is NOT trait-free. The
   traits that rewrite a parameter (overshoot, slowStart, wideTurn,
   cutsCorner) write stopBias / startDelay / turnBias, which movementOf and
   schedule then read, so basePose already contains their fault. Comparing
   the car against it asks whether the car deviates from itself.

   Measured before this was corrected: of the five faults that bend a
   path, FOUR reported a peak drift of exactly 0.00 m — overshoot,
   slowStart, wideTurn and cutsCorner — while differing from a genuinely
   clean line by 2.54 m to 12.24 m. Only wander showed anything. This is
   the same oracle-knowledge bug cleanPose was introduced into belief.js
   to fix, left unfixed here.

   The camera's framing is deliberately NOT changed with it: riding the
   clean line would slide a slow-starting candidate 12 m out of frame,
   which is a legibility decision rather than a correctness one. */
function driftOf(p, t) {
  const real = poseAt(p, t);
  const intended = cleanPose(p, t);
  if (!real || !Number.isFinite(real.x)) return { lateral: 0, ahead: 0, heading: 0 };
  if (!intended || !Number.isFinite(intended.x)) return { lateral: 0, ahead: 0, heading: 0 };
  const r = (intended.rot * Math.PI) / 180;
  const dx = real.x - intended.x, dy = real.y - intended.y;
  return {
    ahead: dx * Math.cos(r) + dy * Math.sin(r),
    lateral: -dx * Math.sin(r) + dy * Math.cos(r),
    heading: ((real.rot - intended.rot + 540) % 360) - 180,
  };
}

/* The widest this scenario's camera will EVER open to — not the live,
   still-easing value, but where it tops out. Ground, scenery and the
   speckle texture all have to be laid out to at least this extent, or a
   camera that opens further than a fixed 720x720 board reveals empty
   space around the edges: exactly what a tracked actor drives through
   coming from off-board, since its spawn point is what the camera widened
   to cover in the first place.

   Deliberately not the live frame: scenery is scattered once per scenario
   (see the renderer's own useMemo) and must not resize as the camera
   eases, or it would visibly pop outward mid-reveal. `t = Infinity` reads
   as fully eased in on every track (easeWindow clamps to 1), which is
   exactly "as wide as this scenario ever gets". */
export function worldHalfFor(spec, sim, camera, { chase = false } = {}) {
  const half = cameraFor(spec, sim, Infinity, camera).scale * W / 2;
  if (!chase) return half;

  /* A chase camera pans AND turns, so it sweeps far more world than a
     fixed one, and it sweeps it in two ways that both have to be paid
     for. It travels with the car, so the extent has to follow wherever
     the car goes. And it rotates, so the corners of a square viewport
     swing out to the HALF-DIAGONAL rather than the half-width — a view
     that only covered the half-width would show bare ground in the
     corners through every turn.

     Same failure as the one that put an ambulance in the void: whatever
     the camera can reveal has to have been drawn. Measured off the car's
     own path rather than guessed, at the engine's own step. */
  let far = 0, reach = half * Math.SQRT2;
  for (let t = 0; t <= 24; t += 0.1) {
    const q = basePose(sim.ego, t);
    if (!q || !Number.isFinite(q.x) || q.hidden) continue;
    const c = chaseFor(spec, sim, t, camera);
    // Measured from the frame's OWN centre, which rides ahead of the car.
    far = Math.max(far, Math.hypot(c.cx - CX, c.cy - CY));
    reach = Math.max(reach, ((c.scale * W) / 2) * Math.SQRT2);
    if (q.gone) break;
  }
  return far + reach;
}
