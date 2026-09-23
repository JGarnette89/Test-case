/* =====================================================================
   BELIEF — where you think the traffic is

   Sight answers "can I see it right now". This answers the harder and
   more examiner-ish question: what do I still think is true about a car
   I looked at four seconds ago?

   The model is the one a real observer runs. Look at a car and you learn
   where it is. Look away and you do not stop knowing about it — you carry
   on believing it is doing the normal thing, with that belief getting
   vaguer the longer you leave it. Look back and you find out.

   THE PREDICTION IS "THEY CARRY ON DRIVING PROPERLY", and picking that
   rather than dead reckoning is the whole design.

   A straight-line extrapolation at last-seen speed would have every
   turning car "deviate", including impeccably driven ones, and the
   mechanic would be noise. What an observer actually expects is not
   constant velocity, it is competence: that car will follow its lane,
   take its turn, and get on with it. So the prediction rides `cleanPose`
   — this participant with every trait undone.

   Emphatically NOT `basePose`, and the difference is not academic.
   basePose is clean of the traits that bend a pose (wander, creep) but
   already contains the ones that rewrote a parameter (overshoot,
   slowStart, wideTurn, cutsCorner), so predicting from it hands the
   observer oracle knowledge of exactly the faults they are meant to
   catch. Measured: four of the six path traits produced a belief error of
   precisely zero until this was fixed.

   Which produces the property that makes this worth having: belief and
   reality diverge EXACTLY where a driver is doing something wrong. A
   clean car is where you left it, every time, so looking away from
   good driving costs nothing. A car with a path trait is not, so the
   thing you failed to watch is precisely the thing you needed to.

   Carried forward, not snapped: the prediction keeps whatever offset the
   car had at the moment you last saw it. Last seen a metre wide of its
   lane, you go on believing it is a metre wide of its lane. That keeps
   the belief continuous at the instant of observation — no jump — and
   means a car has to CHANGE what it is doing wrong to fool you.

   Pure. No React, no DOM, no colour. Who looked where and when is the
   renderer's business; this file only says what that implies.
   ===================================================================== */
import { cleanPose, poseAt, M } from "./index.js";

/* How long a look is worth. Full confidence for a moment after it — you
   have just seen the thing — then decaying to nothing, at which point
   you have simply lost track and the belief should not be drawn at all.

   Deliberately shorter than it feels like it should be: the point is to
   force a re-check, and a belief that survives ten seconds makes looking
   away free. */
export const BELIEF_HOLD = 0.6;
export const BELIEF_FADE = 4.0;

/* Below this, a belief and the truth are the same thing as far as anyone
   watching is concerned. Matches faults.js's own visibility floor, since
   both are asking "could a person tell these apart". */
export const BELIEF_SAME = M(0.45);

const rad = (d) => (d * Math.PI) / 180;

/* What one look tells you: not a position, but an OFFSET from what the
   car ought to be doing, held in the car's own frame so it carries
   through turns. */
export function observe(p, t) {
  const actual = poseAt(p, t);
  const base = cleanPose(p, t);
  if (!actual || !base || actual.hidden || base.hidden) return null;

  const r = rad(base.rot);
  const dx = actual.x - base.x, dy = actual.y - base.y;
  return {
    id: p.id,
    at: t,
    ahead: dx * Math.cos(r) + dy * Math.sin(r),
    lateral: -dx * Math.sin(r) + dy * Math.cos(r),
    heading: ((actual.rot - base.rot + 540) % 360) - 180,
  };
}

/* How much of that look is left. 1 while it is fresh, easing to 0 once
   you have lost the thread. */
export function confidenceAt(obs, t) {
  if (!obs) return 0;
  const age = t - obs.at;
  if (age < 0) return 0;
  if (age <= BELIEF_HOLD) return 1;
  const k = (age - BELIEF_HOLD) / BELIEF_FADE;
  if (k >= 1) return 0;
  // Smooth, so a belief thins out rather than stepping down.
  return 1 - k * k * (3 - 2 * k);
}

/* Where you think it is: doing the normal thing, still carrying whatever
   it was doing wrong when you last looked. */
export function predictAt(p, obs, t) {
  const base = cleanPose(p, t);
  if (!base || base.hidden) return null;
  if (!obs) return base;
  const r = rad(base.rot);
  return {
    ...base,
    x: base.x + Math.cos(r) * obs.ahead - Math.sin(r) * obs.lateral,
    y: base.y + Math.sin(r) * obs.ahead + Math.cos(r) * obs.lateral,
    rot: base.rot + obs.heading,
  };
}

/* How wrong the belief has become, in world units. This is the number the
   mechanic lives on: zero for a car driving properly, growing for one
   that is not. */
export function divergenceAt(p, obs, t) {
  const guess = predictAt(p, obs, t);
  const truth = poseAt(p, t);
  if (!guess || !truth || truth.hidden || truth.gone) return 0;
  return Math.hypot(truth.x - guess.x, truth.y - guess.y);
}

/* Does this car ever repay a second look? A car whose belief never
   diverges is one you can safely ignore once seen — which is correct, and
   is why not every car has to be a trap. Reported so content can be
   checked rather than hoped about. */
export function deviatesEver(p, observedAt = 0, horizon = 20, step = 0.05) {
  const obs = observe(p, observedAt);
  let worst = 0, at = null;
  for (let t = observedAt; t <= horizon; t += step) {
    const d = divergenceAt(p, obs, t);
    if (d > worst) { worst = d; at = Math.round(t * 100) / 100; }
  }
  return { deviates: worst > BELIEF_SAME, worst, at };
}
