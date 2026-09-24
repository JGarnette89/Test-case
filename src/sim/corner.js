/* =====================================================================
   THE TRAFFIC SLOWS FOR CORNERS -- with the player's own cornering limit.

   DECISIONS.md 5.15.13 recorded it: nothing in the sim knew a corner was
   coming, so a car took a turn at whatever speed it arrived at -- left
   turns at a median 40 km/h on a through road, up to 78. It stayed
   hidden while every intersection was a stop. Signals and lane changes
   (SIMULATOR.md 1.1.13) brought it out: left-turners reached the line
   at road speed, found the oncoming gap closed, and stood on the brakes
   -- harsh braking at a signalised crossroads went from 3 car-ticks to
   1383 in five minutes.

   The record said the turn-speed question and the right-turn-radius
   question were one question, because the maintainer's 26 and 22 km/h
   were not derivable at the radii of the time. They are now: the
   player's CLEAN (player.js) is his 26 km/h on a 12.7 m left, and the
   same number gave his 22 on the curb-lane right unasked. So the
   traffic uses exactly the limit the player is judged against, on
   whatever arc the geometry builds. The tight-right radius question is
   still open and still his; this does not decide it, it only drives
   the arcs that exist at the speed they allow.

   AND A DRIVER'S TEMPERAMENT IS IN IT. The corner speed a driver aims
   for is the clean speed scaled exactly as their speed on the road is
   (traffic.js `wantedSpeed`): a competent driver takes the corner at
   the clean speed, a bold one hotter -- a rough turn, the verdict the
   player gets for the same thing -- and a timid one slower. Never past
   what the tyres can do (GRIP): boldness is a hot corner, not a car
   leaving the road.

   A SECOND constraint, not a second model: the corner allows an
   acceleration, the traffic in front allows one, and the car takes the
   harder of the two (`cornerAccel`).
   ===================================================================== */
import { poseAt } from "./intersection.js";
import { CLEAN, GRIP } from "./player.js";
import { wantedSpeed, decide, MOST_BRAKE } from "./traffic.js";


const norm = (d) => ((((d + 180) % 360) + 360) % 360) - 180;
/* Gentler than this is not a corner: a 150 m radius is a bend the road
   handles on its own. */
const STRAIGHT = 1 / 150;

/* The corner on a path, once: where its arc starts and ends, its
   tightest curvature, and the clean and grip-limited speeds for it.
   Cached on the path object, which is built once per map. */
export function cornerOf(path) {
  if (path._corner !== undefined) return path._corner;
  let kMax = 0, from = null, to = null;
  if (path.intent && path.intent !== "straight") {
    for (let s = path.stopAt; s <= path.clearAt; s += 0.5) {
      const a = poseAt(path, Math.max(path.stopAt, s - 1.5)).rot, b = poseAt(path, Math.min(path.clearAt, s + 1.5)).rot;
      const span = Math.min(path.clearAt, s + 1.5) - Math.max(path.stopAt, s - 1.5);
      if (span < 0.5) continue;
      const k = Math.abs((norm(b - a) * Math.PI) / 180 / span);
      if (k > STRAIGHT) { from ??= s; to = s; }
      kMax = Math.max(kMax, k);
    }
  }
  path._corner = kMax > STRAIGHT && from != null
    ? { from, to, k: kMax, clean: Math.sqrt(CLEAN / kMax), grip: Math.sqrt(GRIP / kMax) }
    : null;
  return path._corner;
}

/* The speed THIS driver takes that corner at. */
export const cornerSpeedOf = (corner, me) => Math.min(corner.grip, wantedSpeed(corner.clean, me.caution ?? 1));

/* THE CORNER AS A SECOND CONSTRAINT: the acceleration it allows, which
   the caller sets against what the traffic in front allows and takes
   the harder of. Infinity where the corner asks nothing yet.

   A SPEED TO BE AT, BY A PLACE -- the same physics as the player's brake
   marker (player.js `stopBand`), not a car standing at the corner. The
   deceleration that brings this car to its corner speed at the arc's
   start is (v^2 - vc^2) / 2d; a driver lets it build until it reaches
   the rate they PLAN on braking at (traffic.js `brake`, the braking
   axis) and then holds it. So a sound driver slows for a turn at the
   comfortable rate and one who leaves it late brakes harder into every
   corner, exactly as they do at a stop line. Inside the arc their
   wanted speed is capped at the corner speed.

   Two versions came first and were measured wrong. The corner as the
   nearer of it and the car in front: a driver behind another car began
   slowing only when that car turned off, and harsh braking on the test
   map went UP. The corner as a car standing at the arc: a driver
   already slow enough still braked hard closing on it, because the
   following model keeps a gap behind a car that never moves -- harsh
   braking tripled. */
export function cornerAccel(me, path) {
  const corner = cornerOf(path);
  if (!corner || me.s > corner.to) return Infinity;
  const vc = cornerSpeedOf(corner, me);
  if (me.s >= corner.from - 0.5) {
    if (me.v <= vc) return Infinity;
    return decide({ ...me, v0: vc }, { leader: null, gap: Infinity });
  }
  const d = corner.from - me.s;
  const need = (me.v * me.v - vc * vc) / (2 * d);
  if (need < (me.brake ?? 2.7)) return Infinity;
  return -Math.min(MOST_BRAKE, need);
}
