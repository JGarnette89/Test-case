/* =====================================================================
   JOBS (PLAN.md phase 3, item 9): the machinery a job runs on, and the
   first job, the TAXI (DAY-NIGHT.md default 12: "reuses errands, the
   smooth-driving standard and the horn as feedback; the purest 'a good
   driver is rewarded'").

   A FARE: dispatch offers a pickup a short drive away and a drop-off
   across town (default 11: a dispatch, and the marker on the map). Drive
   to the pickup and pull in at the curb; the passenger gets in while the
   car stands there (BOARD seconds -- move off and they are still getting
   in); the meter runs from there to the drop-off, where they get out the
   same way; the fare is what the drive earned (sim/money.js).

   The route, the line on the road and arriving are going-somewhere's
   (sim/route.js, session.js `navigate`): a job only says where to go next
   and what happens on arrival.

   Pure. `jobTick` -> { job, dest?, paid? }.
   ===================================================================== */
import { routeTo } from "./route.js";
import { newMeter, meterTick, fareFor, TARIFF } from "./money.js";
import { rng } from "../core/rng.js";

/* Flagged design constants. */
export const BOARD = 3;                          // s standing at the curb to get in, or out
export const TO_PICKUP = [120, 1200];            // m: dispatch sends the nearest kind of fare, not one across town
export const RIDE = [700, 3000];                 // m: a ride worth taking a cab for
const MOVED = 0.5;                               // m/s: the car has moved off

/* A place as a position a route can start from. */
const at = (p) => ({ k: p.k, route: p.route, s: p.s });

/* THE OFFER: a pickup and a drop-off from the map's own places, or null
   when the map has no fare to give. The estimate is the clean fare --
   what the job pays a driver who takes nothing off it. */
export function offerFare(course, me, places, seed = 1) {
  if (!places?.length) return null;
  const r = rng(seed * 7919 + 17);
  for (let tries = 0; tries < 60; tries++) {
    const pickup = places[Math.floor(r() * places.length)];
    const toPickup = routeTo(course, me, pickup);
    if (!toPickup || toPickup.length < TO_PICKUP[0] || toPickup.length > TO_PICKUP[1]) continue;
    for (let j = 0; j < 30; j++) {
      const dropoff = places[Math.floor(r() * places.length)];
      if (dropoff === pickup) continue;
      const ride = routeTo(course, at(pickup), dropoff);
      if (!ride || ride.length < RIDE[0] || ride.length > RIDE[1]) continue;
      const estimate = Math.round((TARIFF.flag + TARIFF.perKm * (ride.length / 1000)) * 100) / 100;
      return { kind: "taxi", state: "offered", pickup, dropoff, toPickup: toPickup.length, length: ride.length, estimate };
    }
  }
  return null;
}

/* Accepted: off to the pickup. */
export const accept = (job) => ({ job: { ...job, state: "toPickup" }, dest: job.pickup });

/* ONE TICK OF A JOB. `arrived`: going-somewhere's arrival this tick (stopped
   at the curb at the place sent to). `events`: what the game noticed. */
export function jobTick(job, { arrived, me, t, course, events = [] }) {
  if (!job || job.state === "offered" || job.state === "done") return { job };
  const moved = (me.v ?? 0) > MOVED;
  switch (job.state) {
    case "toPickup":
      return arrived ? { job: { ...job, state: "boarding", since: t } } : { job };
    case "boarding":
      if (moved) return { job: { ...job, state: "toPickup" }, dest: job.pickup };
      if (t - job.since < BOARD) return { job };
      /* In: the meter starts, over the ride from where they got in. */
      return { job: { ...job, state: "toDropoff", meter: newMeter({ length: job.length, course, route: routeTo(course, me, job.dropoff), t }) }, dest: job.dropoff };
    case "toDropoff": {
      const meter = meterTick(job.meter, me, course, events);
      return arrived ? { job: { ...job, meter, state: "alighting", since: t } } : { job: { ...job, meter } };
    }
    case "alighting": {
      const meter = meterTick(job.meter, me, course, events);
      if (moved) return { job: { ...job, meter, state: "toDropoff" }, dest: job.dropoff };
      if (t - job.since < BOARD) return { job: { ...job, meter } };
      const fare = fareFor(meter, t);
      return { job: { ...job, meter, state: "done", fare }, paid: fare };
    }
    default: return { job };
  }
}

/* What the screen says about the job, beside the directions. */
export function jobText(job, t) {
  if (!job) return null;
  if (job.state === "toPickup") return "Fare waiting -- pick up at the curb";
  if (job.state === "boarding") return `Passenger getting in... ${Math.max(0, Math.ceil(BOARD - (t - job.since)))}`;
  if (job.state === "toDropoff") return `Meter running -- ${(job.length / 1000).toFixed(1)} km fare`;
  if (job.state === "alighting") return `Passenger getting out... ${Math.max(0, Math.ceil(BOARD - (t - job.since)))}`;
  return null;
}
