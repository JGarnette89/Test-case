/* =====================================================================
   THE PLAYER'S CONTACT WITH THE WORLD (DECISIONS 10.49, 10.52): an event
   and a response, not the end of the drive.

   `playerContact` runs where the world steps -- the page or the sim's
   worker -- and says what happened: an event only on FIRST touch of each
   partner, held until the two have been apart, and whatever is solid
   against the player now. `afterContact` runs on the page, which owns the
   player, and is the whole of the physics: moved out of the overlap, speed
   into the thing gone, damage.

   NOT A PHYSICS MODEL. No mass, no spin: the least that keeps the world
   honest until the full model the story asks for (STORY.md section 4).

   WHO WAS AT FAULT (DECISIONS 10.55): struck from behind, in lane, with no
   lane change just made, is not the player's. A car changing lane into them
   is not. In an intersection it is who owed whom, from what each entered
   under (`owedBy`). Everything else is the player's, and a person always
   is. Known and said out loud: a brake-check reads as not at fault, nothing
   detecting one. It does not use marking.js (10.48).
   ===================================================================== */
import { poseOf, crashWith, CRASH_CLEAR, leftYields } from "./crossing.js";
import { onRightOf } from "./graph.js";
import { driverPose } from "./drive.js";
import { touching, separation, HALF_W, DAMAGE_AT, INOPERABLE, LIMP, BACK_ROOM } from "./player.js";
import { contactWith } from "./parking.js";
import { pedAt, strikePed } from "./peds.js";
import { poseOnGraph } from "./graph.js";
import { DT } from "./traffic.js";

/* Flagged design constants. */
export const REARM = 2;            // s apart before the same partner can be a new contact
export const CHANGED_WITHIN = 3;   // s since a lane change that makes being struck from behind the player's doing
export const IMPACT_KEEP = 0.5;    // of their speed a player keeps through what they struck, before the solid takes the rest
export const TOW_AFTER = CRASH_CLEAR;   // s an inoperable car stands, as long as a wreck does
const LANE = 3.6, MARGIN = 0.02;

/* STRUCK FROM BEHIND: the other car behind the player's middle, pointing the
   same way within 45 degrees, closing on them, the player within their lane
   and not just arrived in it. */
export function rearStruck(me, mine, q, v, t) {
  const h = (mine.heading * Math.PI) / 180, dx = q.x - mine.x, dy = q.y - mine.y;
  if (dx * Math.cos(h) + dy * Math.sin(h) >= 0) return false;
  const c = Math.cos((((q.heading - mine.heading) * Math.PI) / 180));
  if (c < Math.SQRT1_2) return false;
  if (v * c - (me.v ?? 0) <= 0.5) return false;
  if (Math.abs(me.off ?? 0) > LANE / 2 - HALF_W) return false;
  return t - (me.laneAt ?? -Infinity) >= CHANGED_WITHIN;
}

/* WHO OWED WHOM IN AN INTERSECTION: "player", "other", or null when one of them was not in it.
   NOT `blockedBy`, which is a driver's decision, with their own reading of the sign and their
   own judgment of a gap, and which says a car in the box finishes. This is the DUTY, as posted,
   and a car that judged a gap and was wrong still owed it. In the order of the law:
     1. a red, or a stop not made, against somebody who did neither;
     2. a sign against a road with none;
     3. left yields to oncoming;
     4. with no control at all, the car on the right has the road;
     5. otherwise whoever entered second had somebody already in there. */
export function owedBy(me, a, layout) {
  const p = me.entry, o = a.entry;
  const pPath = layout.paths[me.route], oPath = layout.paths[a.route];
  if (!p || !o || p.k !== (me.k ?? 0) || o.k !== (a.k ?? 0) || p.k !== o.k || !pPath || !oPath) return null;
  const within = (who, path) => who.s <= path.clearAt + 2;
  if (!within(me, pPath) || !within(a, oPath)) return null;
  const broke = (e) => e.ctl === "red" || (e.ctl === "stop" && e.rolled);
  if (broke(p) !== broke(o)) return broke(p) ? "player" : "other";
  const under = (e) => e.ctl === "stop" || e.ctl === "yield";
  if (under(p) !== under(o)) return under(p) ? "player" : "other";
  const left = leftYields(pPath, oPath, layout);
  if (left != null) return left ? "player" : "other";
  if (p.ctl === "none" && o.ctl === "none") {
    if (onRightOf(layout, pPath.from, oPath.from)) return "player";
    if (onRightOf(layout, oPath.from, pPath.from)) return "other";
  }
  return p.t > o.t ? "player" : "other";
}

const closingSpeed = (me, mine, q, v) => {
  const a = (mine.heading * Math.PI) / 180, b = (q.heading * Math.PI) / 180, vm = me.v ?? 0;
  return Math.hypot(vm * Math.cos(a) - v * Math.cos(b), vm * Math.sin(a) - v * Math.sin(b));
};

/* After a tick: { world, hit, fresh, solids }. `hit` is true only on the tick
   of a new contact. A world nobody has touched is the same world. */
export function playerContact(w, me) {
  const mine = driverPose(me, w.course);
  const was = w.touches ?? null, now = {};
  const fresh = [], solids = [];
  const seen = (id) => was && was[id] != null && w.t - was[id] < REARM;
  for (const a of w.actors) {
    if (a.player) continue;
    const p = poseOf(w, a);
    const q = { x: p.x, y: p.y, z: p.z ?? 0, heading: p.rot, length: p.length, width: p.width };
    if (!touching(mine, q)) continue;
    solids.push(q);
    now[a.id] = w.t;
    if (seen(a.id)) continue;
    const v = a.v ?? 0, layout = w.course.at[me.k ?? 0].layout;
    const owed = owedBy(me, a, layout);
    /* A car changing lane into them, with the player holding theirs, owes them the lane. */
    const cutIn = !!a.lc && !a.lc.abort && Math.abs(me.off ?? 0) <= LANE / 2 - HALF_W && w.t - (me.laneAt ?? -Infinity) >= CHANGED_WITHIN;
    const notTheirs = owed ? owed === "other" : cutIn || rearStruck(me, mine, q, v, w.t);
    fresh.push({ kind: "car", id: a.id, closing: closingSpeed(me, mine, q, v), atFault: !notTheirs, why: owed ? "right of way" : cutIn ? "cut in" : notTheirs ? "from behind" : null });
    w = crashWith(w, a.id, { x: p.x, y: p.y, z: p.z ?? 0 }, "player", notTheirs ? a.id : "player");
  }
  const parked = w.parked ? contactWith(w.course, w.parked, mine, touching) : null;
  if (parked) {
    solids.push(parked);
    now[parked.id] = w.t;
    if (!seen(parked.id)) fresh.push({ kind: "parked", id: parked.id, closing: me.v ?? 0, atFault: true });
  }
  /* A person is not solid, and pedAt never returns somebody already struck. */
  const struck = pedAt(w, mine);
  if (struck) { fresh.push({ kind: "person", id: struck, closing: me.v ?? 0, atFault: true }); w = strikePed(w, struck); }
  /* Who is held: this tick's, and anybody touched lately. */
  if (was) for (const id in was) if (now[id] == null && w.t - was[id] < REARM) now[id] = was[id];
  let any = false; for (const _ in now) { any = true; break; }
  if (any) w = { ...w, touches: now };
  else if (was) { const { touches, ...rest } = w; w = rest; }
  return { world: w, hit: fresh.length > 0, fresh, solids };
}

/* THE RESPONSE, on the player. Moved out of each solid along the shortest
   way, in the terms the car has (`s` along the path, `off` across it). Speed
   INTO the thing is gone and speed along it kept, so a scrape along a parked
   car slows them rather than stopping them dead. */
export function afterContact(me, c, world) {
  let out = me;
  if (!c.fresh?.length && !c.solids?.length) return { me, letters: [] };
  const letters = [];
  for (const f of c.fresh ?? []) {
    if (f.kind === "person") { letters.push({ f, damaged: 0 }); continue; }
    if (f.atFault) out = { ...out, v: (out.v ?? 0) * IMPACT_KEEP };
    const damaged = (f.closing / DAMAGE_AT) ** 2;
    out = { ...out, damage: Math.min(INOPERABLE, (out.damage ?? 0) + damaged), pull: out.pull ?? (f.id.length % 2 ? 1 : -1) };
    letters.push({ f, damaged: Math.min(1, damaged) });
  }
  if (c.fresh?.length) out = { ...out, a: 0, shakenUntil: world.t + CRASH_CLEAR };
  for (const q of c.solids ?? []) {
    for (let i = 0; i < 3; i++) {
      const mine = driverPose(out, world.course), sep = separation(mine, q);
      if (!sep) break;
      const path = poseOnGraph(world.course, out.k, out.route, Math.min(out.s, world.course.at[out.k].layout.paths[out.route].length));
      const h = (path.rot * Math.PI) / 180, d = sep.depth + MARGIN, px = sep.nx * d, py = sep.ny * d;
      const len = world.course.at[out.k].layout.paths[out.route].length;
      const s = Math.max(0, Math.min(len - 0.01, out.s + px * Math.cos(h) + py * Math.sin(h)));
      const off = out.off - px * Math.sin(h) + py * Math.cos(h);
      const f = (mine.heading * Math.PI) / 180, fn = Math.cos(f) * sep.nx + Math.sin(f) * sep.ny;
      /* Only speed going INTO the thing: being struck from behind pushes forward and takes nothing. */
      const v = fn < 0 ? (out.v ?? 0) * Math.sqrt(Math.max(0, 1 - fn * fn)) : out.v ?? 0;
      /* Up against something, they may back off it (player.js `backOff`). */
      out = { ...out, s, off, v, ...(fn < 0 ? { backRoom: BACK_ROOM } : {}) };
    }
  }
  return { me: out, letters };
}

/* AN INOPERABLE CAR stands for as long as a wreck, and is then got going again
   where it is, limping: the maintainer's question is what this should be, and
   this forces nobody anywhere. Returns the player and whether they were towed. */
export function towTick(me, dt = DT) {
  if ((me.damage ?? 0) < INOPERABLE || (me.v ?? 0) > 0.1) return { me, towed: false };
  const deadFor = (me.deadFor ?? 0) + dt;
  if (deadFor < TOW_AFTER) return { me: { ...me, deadFor }, towed: false };
  const { deadFor: _, ...rest } = me;
  return { me: { ...rest, damage: LIMP }, towed: true };
}
