/* The courtesy trial, shared by verify-courtesy and measure/courtesy: a
   player on the endless highway, level with a car in the lane beside,
   signalling to move into it. */
import { loadMap } from "../../src/map/load.js";
import { testLoop } from "../../src/map/samples.js";
import { step } from "../../src/sim/crossing.js";
import { playerOn, withDriver } from "../../src/sim/drive.js";
import { DT, wantedGap, clearBetween } from "../../src/sim/traffic.js";

export const loop = loadMap(testLoop());
export const gapBeside = (w, pl) => {
  const layout = w.course.at[pl.k].layout, path = layout.paths[pl.route], leg = layout.legs[path.from];
  const to = layout.legAt(leg.base, (leg.pos ?? leg.lane) - 1);
  let ahead = null, behind = null, da = Infinity, db = Infinity;
  for (const a of w.actors) {
    if (a.player || (a.k ?? 0) !== pl.k) continue;
    const p = layout.paths[a.route];
    if (!p || p.from !== to) continue;
    const d = a.s - pl.s * (p.stopAt / path.stopAt);
    if (d >= 0 && d < da) { da = d; ahead = a; }
    if (d < 0 && -d < db) { db = -d; behind = a; }
  }
  return (!ahead || clearBetween(da, pl, ahead) >= wantedGap(pl, ahead)) && (!behind || clearBetween(db, behind, pl) >= wantedGap(behind, pl));
};
/* One trial, controlled: in a warmed highway, one car in the middle lane
   with the road cleared 60 m either side of it in both its lane and the
   curb lane, and the player in the curb lane LEVEL WITH it (half a metre
   ahead) at its speed -- the moment a gap is actually needed. Without
   courtesy the two hold station (the player holds that speed); signal on after 1 s; until a gap, the
   line, or 30 s. Returns { t, car } or null where no car fits. */
export function trial(base, i, on, log) {
  let w = { ...base, courtesy: on };
  const at0 = playerOn(w.course, `loop-${(i % 4) * 2}`, "end");
  const layout = w.course.at[at0.k].layout;
  const base0 = layout.legs[layout.paths[at0.route].from].base;
  const curb = layout.legAt(base0, 2), mid = layout.legAt(base0, 1);
  const route = Object.keys(layout.paths).find((r) => layout.paths[r].from === curb);
  const cp = layout.paths[route];
  const level = w.actors.filter((a) => (a.k ?? 0) === at0.k && layout.paths[a.route]?.from === mid && a.s > 60 && a.s < layout.paths[a.route].stopAt - 200 && !a.lc && a.kind !== "truck" && a.kind !== "bus").sort((a, b) => a.s - b.s);
  if (!level.length) return null;
  const c = level[Math.floor(i / 4) % level.length];
  const sc = (a) => a.s * (cp.stopAt / layout.paths[a.route].stopAt);
  const v = Math.min(c.v, c.v0 ?? c.v);
  let pl = { ...at0, route, s: sc(c) + 0.5, v, v0: v, caution: 1, headway: 1.6 };
  w = { ...w, actors: w.actors.filter((a) => a.id === c.id || (a.k ?? 0) !== pl.k || Math.abs(sc(a) - pl.s) > 60 || ![curb, mid].includes(layout.paths[a.route]?.from)) };
  const t0 = w.t;
  for (let n = 0; n < 30 / DT; n++) {
    /* The player holds the speed they were level at -- their own lane is clear 60 m ahead. */
    pl = { ...pl, s: pl.s + pl.v * DT, signal: n * DT >= 1 ? "left" : null };
    if (pl.s > cp.stopAt - 60) break;
    const was = w;
    w = step(withDriver(w, pl));
    log?.(was, w, pl, t0 + 1);
    if (pl.signal && gapBeside(w, pl)) return { t: w.t - (t0 + 1), car: c };
  }
  return { t: 30, car: c };
}
