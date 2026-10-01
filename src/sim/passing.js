/* =====================================================================
   GOING ROUND A STOPPED BUS (SIMULATOR.md, "3. Bus stops", slice D). The
   maintainer's ruling, 30 September: "Traffic can pull around on a broken
   centre line, yielding to oncoming traffic (ideally, our drivers could
   always make a mistake here)."

   WHERE: a two-way road with one lane each way and NO SOLID centre line --
   a collector's broken line, or a residential street with none painted
   (the maintainer, 1 October: "people can pass a bus on an unmarked
   street if the way is clear the other way"). An arterial's solid double
   line forbids it (draw.js paints the three). Behind a bus standing at a curb stop, a driver who has
   come to a stop behind it may pull out into the oncoming lane, pass, and
   come back in clear ahead of it.

   THE MISTAKE IS THE GAP. Whether to go is the same question a left turn
   across the oncoming asks (crossing.js `gapNeeded`): the time the pass
   takes from where they are, padded by their caution, against the time
   the nearest oncoming vehicle needs to reach the end of it. A bold driver
   takes a pass a sound one refuses, and the oncoming driver has to brake
   for it -- which is what the player sees and what an examiner marks.

   THE MOTION is positional, like a bus pulling into its bay (buses.js
   `pullOf`): out over PASS_TAPER, alongside, back in over PASS_TAPER, by
   where the car is on its own lane -- never on a clock. The car stays on
   its own path the whole time, offset into the oncoming lane.

   AND THE PASSER IS COMMITTED once it starts: it does not brake for the
   oncoming traffic, which brakes for it (crossing.js `whatStops`). Two
   cars that each stopped for the other nose to nose in one lane would be
   exactly the wait DECISIONS.md 10.7 forbids -- nothing could move to end
   it. The oncoming driver can always stop or slow; the passer finishing
   is what ends the conflict.

   Pure. No React, no DOM.
   ===================================================================== */
import { lenOf, widthOf, timeToCover, vehicleOf } from "./traffic.js";
import { laneAt, inBay } from "./buses.js";
import { LANE } from "../map/format.js";

/* Out and back in over this far: about what a car needs to cross one lane
   at low speed. And the room left ahead of the bus before coming back in.
   Flagged design constants. */
export const PASS_TAPER = 12, PASS_CLEAR = 6;
/* The kinds painted with a solid centre line, which may not be crossed to pass. */
const SOLID = new Set(["arterial", "highway"]);

const ease = (x) => { const c = Math.max(0, Math.min(1, x)); return c * c * (3 - 2 * c); };

/* How far into the oncoming lane a passing car is, in metres to the LEFT
   of its own lane's line (so negative as a lateral offset to the right). */
export function passOffset(a) {
  const p = a.pass;
  if (!p) return 0;
  if (a.s <= p.s1) return LANE * ease((a.s - p.s0) / (p.s1 - p.s0));
  if (a.s <= p.s2) return LANE;
  return LANE * (1 - ease((a.s - p.s2) / (p.s3 - p.s2)));
}
/* Out in the oncoming lane enough to be in an oncoming car's way. */
export const outInOncoming = (a) => passOffset(a) > LANE / 2;

/* The lane id parts. */
const parse = (id) => { const m = /^(.*):(fwd|rev)#(\d+)$/.exec(id ?? ""); return m ? { road: m[1], dir: m[2], i: Number(m[3]) } : null; };

/* A road that may be passed on: two-way, one lane each way, broken centre
   line. Returns the oncoming lane's id, or null. */
export function oncomingLane(course, laneId) {
  const l = parse(laneId);
  if (!l) return null;
  const r = (course.map?.roads ?? []).find((x) => x.id === l.road);
  if (!r || r.oneWay || (r.lanes ?? 1) !== 1 || SOLID.has(r.kind)) return null;
  return `${r.id}:${l.dir === "fwd" ? "rev" : "fwd"}#0`;
}

/* Where somebody on the oncoming lane is, in MY lane's metres -- the two
   lanes of one road run opposite ways over the same length. */
const mirrored = (course, oppId, myId, along) => (course.lanes?.[myId]?.length ?? 0) - along;

/* SHOULD THIS DRIVER PASS THE BUS IN FRONT OF THEM, NOW? A plan, or null.
   `leader` is who `whatStops` found in front of them. */
export function planPass(world, me, leader, path) {
  if (me.pass || me.player || me.kind !== "car" || !leader || leader.kind !== "bus") return null;
  /* A bus standing at its curb stop, in the lane -- not one in a bay, and
     not one that is merely queued. */
  if (leader.dwellFrom == null || leader.busStop?.bay || inBay(leader)) return null;
  if ((me.v ?? 0) > 1) return null;   // come to a stop behind it first
  const course = world.course;
  const [mine] = laneAt(course, me), [theirs] = laneAt(course, leader);
  if (!mine || !theirs || mine.lane !== theirs.lane) return null;
  const opp = oncomingLane(course, mine.lane);
  if (!opp) return null;
  const busFront = theirs.along + lenOf(leader) / 2;
  if (busFront - (mine.along + lenOf(me) / 2) > 20) return null;   // right behind it
  /* The whole pass, in my lane's metres and my path's. */
  const endAlong = busFront + PASS_CLEAR + lenOf(me) / 2 + PASS_TAPER;
  const end = me.s + (endAlong - mine.along);
  const limit = me.s <= path.stopAt ? path.stopAt - 15 : path.length - 1;
  if (end > limit) return null;
  /* Room to come back in: nobody in my lane between the bus and the end. */
  for (const a of world.actors) {
    if (a.id === me.id || a.id === leader.id) continue;
    const [o] = laneAt(course, a);
    if (o?.lane === mine.lane && o.along > theirs.along && o.along - lenOf(a) / 2 < endAlong + 6) return null;
  }
  /* THE GAP: how long the pass takes, padded by caution, against how soon
     the oncoming traffic reaches the end of it. */
  const need = timeToCover(me.v ?? 0, end - me.s, me.v0, vehicleOf(me).accel) * (1 + (me.caution ?? 1));
  for (const a of world.actors) {
    const [o] = laneAt(course, a);
    if (o?.lane !== opp) continue;
    const x = mirrored(course, opp, mine.lane, o.along);   // their centre, in my metres
    const nose = x - lenOf(a) / 2;
    if (x + lenOf(a) / 2 < mine.along - lenOf(me) / 2) continue;   // already past me
    if (nose <= endAlong) return null;                            // in the stretch already
    if ((nose - endAlong) / Math.max(a.v ?? 0, 0.5) < need) return null;
  }
  /* OUT AS SHARPLY AS THE ROOM BEHIND THE BUS NEEDS. Stopped two metres
     behind it, a car pulling out over the full taper reached the bus's
     tail still inside its width and hit it -- every pass did (1 October).
     So the taper is the room the car has, and the plan is checked against
     the bus by the footprints themselves, swept along the line it would
     take; one that would touch is not taken. */
  const room = (theirs.along - lenOf(leader) / 2) - (mine.along + lenOf(me) / 2);
  const out = Math.min(PASS_TAPER, room / 0.6);
  if (out < 3) return null;
  const plan = { s0: me.s, s1: me.s + out, s2: end - PASS_TAPER, s3: end, bus: leader.id };
  if (sweepsInto(plan, me, mine.along, leader, theirs.along)) return null;
  return plan;
}

/* Does the car's footprint, along the planned line, touch the bus's (with
   a 0.2 m margin)? Both in my lane's metres, the bus on the lane's line. */
function sweepsInto(plan, me, myAlong, bus, busAlong) {
  const L = lenOf(me) / 2, W = widthOf(me) / 2, BL = lenOf(bus) / 2 + 0.2, BW = widthOf(bus) / 2 + 0.2;
  for (let s = plan.s0; s <= plan.s3; s += 0.25) {
    /* As poseOf places it: front and back each on the line. */
    const f = passOffset({ pass: plan, s: s + L }), r = passOffset({ pass: plan, s: s - L });
    const y = (f + r) / 2, th = Math.atan2(f - r, 2 * L), c = Math.cos(th), n = Math.sin(th);
    const u = myAlong + (s - plan.s0) - busAlong;
    for (const [a, b] of [[L, W], [L, -W], [-L, W], [-L, -W]]) {
      const cu = u + a * c - b * n, cy = y + a * n + b * c;
      if (Math.abs(cu) < BL && Math.abs(cy) < BW) return true;
    }
  }
  return false;
}

/* An oncoming car's view of somebody passing toward it in its lane: the
   gap to them in its own metres, or null where they are not in its way. */
export function passerAhead(course, me, them) {
  if (!them.pass || !outInOncoming(them)) return null;
  const [mine] = laneAt(course, me), [theirs] = laneAt(course, them);
  if (!mine || !theirs) return null;
  if (oncomingLane(course, theirs.lane) !== mine.lane) return null;
  const x = mirrored(course, mine.lane, theirs.lane, theirs.along);
  const gap = x - lenOf(them) / 2 - (mine.along + lenOf(me) / 2);
  return gap >= -lenOf(me) ? Math.max(0, gap) : null;
}
