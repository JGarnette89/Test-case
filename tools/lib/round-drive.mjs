/* =====================================================================
   DRIVING A ROUND FOR CHECKS (verify-rounds, measure/round-seeds): the
   good driver (tools/lib/good-driver.mjs, unchanged) at the wheel of a
   round, through roundTick -- the same tick the screen runs.

   The good driver waits by `whatStops`, as written; nothing here makes it
   wait by `openTo` (that would compare the detector with itself).
   `edit(input, ctx)` changes the one thing a controlled comparison
   changes; `onTick(before, input, after)` lets a check watch.
   ===================================================================== */
import { roundWorld, startRound, roundTick, verdictOf, TIME_CAP } from "../../src/game/round.js";
import { routeForSignal } from "../../src/sim/drive.js";
import { goodInput } from "./good-driver.mjs";
import { DT } from "../../src/sim/traffic.js";

/* The scene object goodInput reads: the turn it is told, at the round's own intersection. */
export function sceneOf(def, rs) {
  const k = rs.targetK, layout = rs.world.course.at[k].layout, from = layout.paths[rs.me.route].from;
  const route = routeForSignal(layout, from, def.task === "straight" ? null : def.task);
  return { route: { steps: [{ k, route }] } };
}

/* The routes out of the start leg, for a precondition: does one of them have the round's task as its intent? */
export function routesOfTask(def, rs) {
  const k = rs.targetK, layout = rs.world.course.at[k].layout, from = layout.paths[rs.me.route].from;
  return layout.routesFrom(from).map((r) => layout.paths[r].intent);
}

export function driveRound(def, { edit = null, onTick = null, maxTicks = Math.round((TIME_CAP + 20) / DT), world = null } = {}) {
  const w = world ?? roundWorld(def);
  let rs = startRound(def, w);
  const sc = sceneOf(def, rs);
  let ticks = 0;
  while (!rs.end && ticks < maxTicks) {
    const { input, signal } = goodInput(rs.me, rs.world, sc, {});
    const inp = { steer: input.steer, slider: input.slider, signal, horn: 0, assist: input.assist };
    if (edit) edit(inp, { rs, sc, ticks });
    const before = rs;
    ({ rs } = roundTick(rs, inp));
    ticks++;
    if (onTick) onTick(before, inp, rs);
  }
  return { rs, verdict: verdictOf(rs), ticks };
}
