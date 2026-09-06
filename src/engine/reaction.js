/* =====================================================================
   REACTION — the traffic moving around a driver who took its space

   "This is what poor drivers don't see, the traffic moving around them."
   When the candidate takes a gap that was not theirs, the road user with
   priority gives way, and THAT is what the player is looking for. It is
   harder to spot than a collision, which is correct, and it rewards
   watching the whole scene rather than only the candidate.

   THE REACTION IS THE OBSERVABLE, NEVER THE DEFINITION OF THE FAULT.
   Encroachment is marked on what the candidate did, against road users
   holding the line they planned — see clearance.js, which imports nothing
   from here and never will. This file adds what the player SEES when the
   intrusion was bad enough that somebody had to do something about it.

   That distinction is load-bearing rather than tidy. Measure the fault on
   the reacted world and a driver who forces somebody to brake scores
   BETTER, because the other car got out of the way — precisely backwards.
   So there are two derived worlds: what the candidate did, which is what
   is marked, and what then happened, which is what is drawn and what
   decides whether anybody was actually hit.

   DERIVED, NOT SCRIPTED. Nobody writes down "the red car brakes here".
   The reaction is the LEAST giving way that avoids the collision, found
   by search — so how hard they had to brake is a measurement of how bad
   the intrusion was, and a driver who barely encroached gets a barely
   perceptible lift off the throttle.

   Pure. No React, no DOM, no colour.
   ===================================================================== */
import { poseAt } from "./index.js";
import { REACTION_FLOOR } from "./score.js";
import { touchesEver, clampDepart } from "./clearance.js";
import { YIELD_RAMP, MOST_GIVE, yieldingProfile } from "./paths.js";

/* Nobody gives way to something they have not had time to perceive. The
   floor is the engine's own reaction time, and the reacting driver's own
   observation is deliberately NOT modelled — they are assumed to be
   looking, because this file is about what the player sees rather than
   about grading the other driver. */
export const NOTICE = REACTION_FLOOR;

/* The most a driver can give: `MOST_GIVE` of their speed, which the
   profile's shape caps just short of reversing and which at 0.8 is a full
   stop. Beyond that the candidate is simply going to be hit, and that is
   the terminal outcome the game already has. */
export const MOST_GIVEN = MOST_GIVE;

/* And the longest anybody sits there. Past this the candidate has not
   taken somebody's gap, they have blocked the road, and that is a
   different situation than the one this file models. */
export const MOST_WAIT = 8.0;

/* A motion profile's clock starts when its owner departs, not when the
   scenario does. Handing it a scenario-time instant makes the whole
   reaction land seconds late and do nothing — measured, the largest
   possible sacrifice changed the collision time by exactly zero. One
   conversion, in one place, so the two callers cannot disagree. */
const yieldSpec = (actor, fromWorld, give, wait = 0) => ({
  from: Math.max(0, fromWorld - (actor.departAt ?? 0)),
  give,
  wait,
});

/* How much this road user has to give up to avoid the candidate: first
   how hard they brake, and if slowing cannot buy enough, how long they
   then sit and wait.

   THE LEAST THAT WORKS, in both, because the amount IS the severity the
   player reads: 0.1 is a lift off the throttle, 0.8 is standing on the
   brakes, and a wait on top of that is a driver stopped in the road
   because somebody pulled out on them.

   Two bisections rather than one, run in order, and each is over a
   parameter the lag is monotone in at every instant — see paths.js, where
   the first parameterisation was monotone in neither. */
function giveNeeded(ego, actor, from, horizon) {
  if (!touchesEver(ego, actor, { from: ego.departAt ?? 0, horizon })) return { give: 0, wait: 0, avoided: true };
  const hits = (give, wait) =>
    touchesEver(ego, { ...actor, yielding: yieldSpec(actor, from, give, wait) }, { from: ego.departAt ?? 0, horizon });

  const bisect = (lo, hi, test) => {
    for (let i = 0; i < 14; i++) {
      const mid = (lo + hi) / 2;
      if (test(mid)) lo = mid; else hi = mid;
    }
    return hi;
  };

  /* Rounded UP, never to nearest. Bisection leaves an interval of about
     5e-5 and rounding to three places moves the answer by up to 5e-4 —
     ten times the precision it just bought, and enough to land back on
     the side that collides. Measured: the search reported "avoided" and
     the applied world hit anyway in 13% of reacting scenes. Rounding away
     from the collision can only ever give a little more way than needed. */
  if (!hits(MOST_GIVEN, 0)) {
    return { give: Math.ceil(bisect(0, MOST_GIVEN, (g) => hits(g, 0)) * 1000) / 1000, wait: 0, avoided: true };
  }
  /* Slowing is not enough: they stop, and the question becomes how long
     they sit there. */
  if (hits(MOST_GIVEN, MOST_WAIT)) {
    return { give: MOST_GIVEN, wait: MOST_WAIT, avoided: false };
  }
  return {
    give: MOST_GIVEN,
    wait: Math.ceil(bisect(0, MOST_WAIT, (w) => hits(MOST_GIVEN, w)) * 100) / 100,
    avoided: true,
  };
}

/* How long they end up giving up. Reported for the renderer and the
   debrief, and deliberately not used to grade anything. */
export const timeGivenUp = (give, wait = 0) => yieldingProfile(null, { give, wait }).hold;

/* Who had to give way to this departure, and by how much.

   `entitled` defaults to the priors, because giving way is something you
   do for traffic that had the right of way — a road user who was yielding
   to the candidate anyway is not reacting to an intrusion. */
export function reactionsFor(sim, { departAt = null, horizon = 18 } = {}) {
  const ego = departAt == null ? sim.ego : { ...sim.ego, departAt: clampDepart(sim.ego, departAt) };
  const entitled = (sim.priors?.length ? sim.priors : sim.actors).filter((a) => a.kind !== "ped");
  const out = [];
  for (const a of entitled) {
    const from = Math.max(a.arriveAt ?? 0, (ego.departAt ?? 0) + NOTICE);
    const r = giveNeeded(ego, a, from, horizon);
    if (r.give === 0 && r.wait === 0) continue;   // nothing to give way to
    out.push({
      who: a.id, name: a.name ?? a.id, give: r.give, wait: r.wait, from,
      gaveUp: timeGivenUp(r.give, r.wait), avoided: r.avoided,
    });
  }
  return out.sort((x, y) => y.gaveUp - x.gaveUp);
}

/* The world as it then played out: the same scene with the yielding
   applied. What is DRAWN, and what decides whether anybody was hit.

   Returns a fresh object; the original sim is left untouched, which is
   what lets the caller keep both worlds and mark against the first. */
export function withReactions(sim, reactions, { departAt = null } = {}) {
  const by = new Map(reactions.map((r) => [r.who, r]));
  return {
    ...sim,
    ego: departAt == null ? sim.ego : { ...sim.ego, departAt: clampDepart(sim.ego, departAt) },
    actors: sim.actors.map((a) => {
      const r = by.get(a.id);
      return r ? { ...a, yielding: yieldSpec(a, r.from, r.give, r.wait) } : a;
    }),
    priors: (sim.priors ?? []).map((a) => {
      const r = by.get(a.id);
      return r ? { ...a, yielding: yieldSpec(a, r.from, r.give, r.wait) } : a;
    }),
  };
}

/* Did anybody actually get hit, once the giving way is taken into
   account? The terminal outcome, and the only thing the reaction is
   allowed to change. */
export function contactAfter(reacted, { horizon = 18 } = {}) {
  const ego = reacted.ego;
  for (const a of reacted.actors) {
    if (touchesEver(ego, a, { from: ego.departAt ?? 0, horizon })) return a.id;
  }
  return null;
}
