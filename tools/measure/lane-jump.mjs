/* DOES THE PLAYER'S CAR JUMP ON A LANE CHANGE? (12 November, DECISIONS 10.70; Jay: "on some close lane changes the player car will actually jump position and continue on".)
   The pose instrument of verify-drive section 9 (`slip`: a sideways step beyond what the turn allows; `jump`: the error in the distance moved along the heading), asked on EVERY tick of a drive and not only on the
   ticks the real-position machinery acts, pointed at the player's own lane changes: the car starts on a multi-lane approach, steers across a line until its route changes, and straightens.
   No traffic here (geometry alone); the traffic alongside is a second pass (LANE_JUMP_TRAFFIC). Usage: node tools/measure/lane-jump.mjs MAP [kmh=72] [real=0|1]. Asserts nothing. */
import { loadMap } from "../../src/map/load.js";
import { TEST_MAPS } from "../../src/map/samples.js";
import { seedGraph, DT } from "../../src/sim/crossing.js";
import { playerAt, stepDriver, driverPose, withDriver } from "../../src/sim/drive.js";
import { holdAt } from "../../src/sim/player.js";
import { approachAlong } from "../../src/sim/graph.js";
const [mapId = "test-loop", kmhArg = "72", realArg = "0"] = process.argv.slice(2), kmh = +kmhArg, real = realArg === "1";
const loaded = loadMap(TEST_MAPS.find((m) => m.id === mapId).build());
const base0 = { ...seedGraph(1, 50, loaded, { every: 2 }), actors: [] };
const base = real ? { ...base0, realPos: true } : base0;
const course = base.course;
const turnOf = (a, b) => ((a - b + 540) % 360) - 180;
const rows = [];
for (let k = 0; k < course.at.length; k++) {
  const layout = course.at[k].layout;
  for (const [route, path] of Object.entries(layout.paths)) {
    const leg = layout.legs[path.from];
    if (!leg || path.intent !== "straight" || path.stopAt < 60) continue;
    if (process.env.ROUTE && !route.startsWith(process.env.ROUTE)) continue;
    for (const dir of [-1, 1]) {
      const neighbour = layout.legAt ? layout.legAt(leg.base, (leg.pos ?? leg.lane) + dir) : null;
      if (!neighbour) continue;
      for (const frac of (process.env.FRACS ?? "0.15,0.5").split(",").map(Number)) {
        const s0 = Math.max(5, frac * path.stopAt - 30);
        let me = { ...playerAt(course, k, route), s: s0, v: kmh / 3.6, going: true, accepted: true, signal: null, off: 0 };
        let firstChange = null, level = null, world = withDriver(base, me), was = driverPose(me, course), slip = 0, jump = 0, at = null, changed = 0, changedAtTick = null, maxStepSide = 0;
        for (let i = 0; i < 12 / DT; i++) {
          const wasRoute = me.route, wasK = me.k;
          // steer toward the neighbour until the route changes, then back to straighten for the rest
          const target = changed ? 0 : dir * 3.6 * 0.9, steer = Math.max(-1, Math.min(1, ((target - (me.off ?? 0)) * (dir > 0 ? 0.6 : 0.6)) * 1));
          const before = me;
          me = stepDriver(me, { steer: changed ? 0 : dir, slider: holdAt(me.v, me.grade ?? 0), assist: 0 }, world, DT);
          world = withDriver(world, me);
          if (me.route !== wasRoute || me.k !== wasK) {
            changed++; if (changedAtTick == null) changedAtTick = i;
            /* THE MECHANISM, TESTED: the re-base keeps `s` and the adjacent lane's `s` is not the same place on a bend. Level with the car along the road's centreline (graph.js approachAlong, the approach half of what the exit stretch already does with exitAlong/exitSAt): the s on the NEW
               route whose centreline distance equals the old route's at the re-base, found by bisection, and the pose the car would have had there. */
            const al = approachAlong(course, k, wasRoute, me.s);
            if (al != null && me.k === wasK) {
              let lo = 0, hi = course.at[k].layout.paths[me.route].stopAt;
              for (let q = 0; q < 50; q++) { const mid = (lo + hi) / 2; if ((approachAlong(course, k, me.route, mid) ?? 0) < al) lo = mid; else hi = mid; }
              const s2 = (lo + hi) / 2, cand = driverPose({ ...me, s: s2 }, course), pn = driverPose(me, course);
              level = { shiftM: +(s2 - me.s).toFixed(3), jumpWithSameS: +Math.hypot(pn.x - was.x, pn.y - was.y).toFixed(3), jumpWithLevelS: +Math.hypot(cand.x - was.x, cand.y - was.y).toFixed(3) };
            }
          }
          const now = driverPose(me, course);
          if (me.s > path.stopAt - 5 || me.k !== k) break;
          const dx = now.x - was.x, dy = now.y - was.y, hm = ((was.heading + turnOf(now.heading, was.heading) / 2) * Math.PI) / 180;
          const dist = Math.hypot(dx, dy), allow = dist * Math.sin((Math.abs(turnOf(now.heading, was.heading)) * Math.PI) / 360);
          const sl = Math.abs(-dx * Math.sin(hm) + dy * Math.cos(hm)) - allow, jp = Math.abs(dx * Math.cos(hm) + dy * Math.sin(hm) - ((before.v + me.v) / 2) * DT);
          if (me.route !== wasRoute && me.k === wasK && firstChange == null) firstChange = { slipMm: +(sl * 1000).toFixed(1), jumpMm: +(jp * 1000).toFixed(1), tick: i };
          if (Math.max(sl, jp) > Math.max(slip, jump)) at = { tick: i, routeChanged: me.route !== wasRoute, s: +me.s.toFixed(1), off: +(me.off ?? 0).toFixed(2) };
          slip = Math.max(slip, sl); jump = Math.max(jump, jp);
          was = now;
        }
        rows.push({ k, route, dir, s0: +s0.toFixed(0), turnedDegAtChange: at ? +Math.abs(turnOf(driverPose({ ...me, s: at.s, off: 0 }, course).heading, driverPose({ ...me, s: 1, off: 0 }, course).heading)).toFixed(1) : null, changed: changed > 0, firstChange, level, slipMm: +(slip * 1000).toFixed(1), jumpMm: +(jump * 1000).toFixed(1), at });
      }
    }
  }
}
/* THE LANE CHANGE ITSELF (the first tick the route changes, on the same intersection) AND EVERYTHING ELSE the drive does, reported apart: the first is what Jay sees as a jump; the second is whatever else the pose does on the approach (the exit routes the signal picks near the line, the car drifting back). */
const lanesChanged = rows.filter((r) => r.changed && r.firstChange), bad = lanesChanged.filter((r) => r.firstChange.slipMm > 1 || r.firstChange.jumpMm > 1);
console.log(JSON.stringify({ map: mapId, kmh, realPos: real, cases: rows.length, laneChangesMade: lanesChanged.length, over1mmAtTheChange: bad.length, atTheChangeWorstSlipMm: Math.max(0, ...lanesChanged.map((r) => r.firstChange.slipMm)), atTheChangeWorstJumpMm: Math.max(0, ...lanesChanged.map((r) => r.firstChange.jumpMm)), elsewhereWorstSlipMm: Math.max(0, ...rows.map((r) => r.slipMm)), elsewhereWorstJumpMm: Math.max(0, ...rows.map((r) => r.jumpMm)) }));
for (const r of bad.sort((a, b) => Math.max(b.firstChange.slipMm, b.firstChange.jumpMm) - Math.max(a.firstChange.slipMm, a.firstChange.jumpMm)).slice(0, 8)) console.log(JSON.stringify(r));
