/* =====================================================================
   DRIVING A HAZARD ROUND FOR CHECKS (verify-rounds, measure/round-seeds --hazard;
   WORK-game-slice8 sections 1 and 4). The oracle's GO (round-drive.mjs), then,
   optionally, a STOP a fixed time after a person steps off the curb.

   THE CHECK READS THE PERSON ITSELF, never the round's own record (rs.decision.hazard):
   a person STEPS when the world's `peds` list shows them `crossing` where the tick
   before they were not, after the player's car has crossed its stop line; the gap
   between them and the player's drawn footprint is worked out here from the
   poses (peds.js pedPose, drive.js driverPose, the vehicle's own length and width),
   as oriented-rectangle distance. The round's end, its verdict and its STOP
   are the code under test.
   ===================================================================== */
import { toDecision, setTarget, press, roundTick, verdictOf, stopNow, TIME_CAP, LIMIT } from "../../src/game/round.js";
import { oracle } from "./round-drive.mjs";
import { pedPose, crosswalksOf } from "../../src/sim/peds.js";
import { driverPose } from "../../src/sim/drive.js";
import { lenOf, CAR } from "../../src/sim/traffic.js";
import { DT, AT_REST } from "../../src/sim/crossing.js";

const EPS = 1e-6;

/* The distance from a point to the player's footprint (an oriented rectangle: the car's own length, the car's width), 0 inside it. [instrument] */
export function gapTo(me, world, q) {
  const p = driverPose(me, world.course), h = (p.heading * Math.PI) / 180, c = Math.cos(h), s = Math.sin(h);
  const dx = q.x - p.x, dy = q.y - p.y, u = dx * c + dy * s, v = -dx * s + dy * c;
  return Math.hypot(Math.max(0, Math.abs(u) - lenOf(me) / 2), Math.max(0, Math.abs(v) - CAR.width / 2));
}
/* Is the crosswalk's middle still ahead of the car's nose? (a cw is a segment a-b; its midpoint stands for it) [instrument] */
export function cwAheadOf(me, world, cw) {
  const p = driverPose(me, world.course), h = (p.heading * Math.PI) / 180;
  const mx = (cw.a.x + cw.b.x) / 2 - p.x, my = (cw.a.y + cw.b.y) / 2 - p.y;
  return mx * Math.cos(h) + my * Math.sin(h) - lenOf(me) / 2;
}

/* One hazard round. `stopAfter`: seconds after the person steps off at which STOP is tapped (null: never). Returns what the check saw:
   { rs, verdict, step: { id, t, preGo, sim }, minGap, struck, restShort, stopTick, speeds, ticks } or null when the seed has no decision point. `step` is null when nobody stepped onto the
   player's path after its stop line. */
export function hazardRun(type, seed, cars, { stopAfter = null, make = oracle, target = LIMIT, maxTicks = Math.round((TIME_CAP + 20) / DT) } = {}) {
  let rs = toDecision(type, seed, cars);
  if (!rs) return null;
  const { policy } = make();
  const out = { step: null, minGap: Infinity, struck: false, restShort: false, stopTick: null, stoppedAt: null, speeds: [], ticks: 0, seenBeforeGo: new Set(), goAt: null };
  const seen = (r) => { for (const p of r.world.peds ?? []) out.seenBeforeGo.add(p.id); };
  seen(rs);
  while (!rs.end && out.ticks < maxTicks) {
    if (rs.phase !== "gone") {
      if (policy(rs) === "go") { rs = setTarget(rs, target); out.goAt = rs.world.t; } else if (rs.phase === "frozen") rs = press(rs);
      seen(rs);
    }
    /* THE STOP: a fixed time after the step-off. */
    if (stopAfter != null && out.step && out.stopTick == null && rs.phase === "gone" && rs.world.t - out.step.t >= stopAfter - EPS) { rs = stopNow(rs); out.stopTick = rs.world.t; }
    const before = rs;
    rs = roundTick(rs);
    out.ticks++;
    if (rs.phase !== "gone") { seen(rs); continue; }
    const was = new Map((before.world.peds ?? []).map((p) => [p.id, p.state]));
    const path = rs.world.course.at[rs.me.k].layout.paths[rs.me.route];
    for (const p of rs.world.peds ?? []) {
      if (p.state === "crossing" && was.get(p.id) !== "crossing" && !out.step && rs.me.k === rs.targetK && rs.me.s > path.stopAt && cwAheadOf(before.me, before.world, crosswalksOf(rs.world.course)[p.cw]) > 0) out.step = { id: p.id, t: rs.world.t, preGo: out.seenBeforeGo.has(p.id), manner: p.manner, cw: p.cw };
    }
    if (out.step) {
      const p = (rs.world.peds ?? []).find((x) => x.id === out.step.id);
      if (p) {
        const g = gapTo(rs.me, rs.world, pedPose(rs.world, p));
        out.minGap = Math.min(out.minGap, g);
        if (p.state === "struck") out.struck = true;
        if (rs.me.v < AT_REST && out.stoppedAt == null) out.stoppedAt = rs.world.t;
      }
      out.speeds.push({ t: rs.world.t, v: rs.me.v, v0: before.me.v, stop: rs.stop });
    }
  }
  /* Short of them: at rest at the end, with the person's crosswalk still ahead of the nose, and nobody struck. */
  if (out.step && !out.struck && rs.me.v < AT_REST) out.restShort = cwAheadOf(rs.me, rs.world, crosswalksOf(rs.world.course)[out.step.cw]) > 0;   // the nose short of the line the person crosses on (the crosswalk's middle)
  return { rs, verdict: verdictOf(rs), ...out };
}
