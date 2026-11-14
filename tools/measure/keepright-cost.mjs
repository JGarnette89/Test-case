/* WHAT DOES KEEPING RIGHT COST THE CAR THAT DOES IT (the lead, 14 November: is keep-right un-sorting the road)?
   For every keep-right move on a multi-lane road (through traffic): at the tick it begins, the speed of the leader the car LEFT in its own lane and the one it INHERITS in the lane to the right (none = free road to the look distance), against its own wanted speed;
   5 s later, whether it is HELD (headway under 2 s, under 90% of wanted) and its speed as a share of what it wants; and whether it begins a DISCRETIONARY change within 20 s of the move (the yo-yo).
   The same for discretionary changes (the overtake), as the control: a change of choice should leave a car better off.
   Usage: node tools/measure/keepright-cost.mjs <mapId> [cars] [seed=1] [seconds=300] */
import { loadMap } from "../../src/map/load.js";
import { TEST_MAPS } from "../../src/map/samples.js";
import { carsFor } from "../../src/map/cars.js";
import { seedGraph, step } from "../../src/sim/crossing.js";
import { laneSpan } from "../../src/sim/course.js";
const [id, carsArg, seedArg = "1", secsArg = "300"] = process.argv.slice(2);
const loaded = loadMap(TEST_MAPS.find((m) => m.id === id).build()), cars = carsArg ? +carsArg : carsFor(loaded);
let w = seedGraph(+seedArg, 50, loaded, { every: 2.0, target: cars, posted: true, walkers: true, rivals: true, brakeReaction: true });
for (let i = 0; i < 3600; i++) w = step(w);
const lanesOf = (world) => {
  const lanes = new Map(), info = new Map();
  for (const a of world.actors) {
    const L = world.course.at[a.k ?? 0].layout, p = L.paths[a.route], leg = L.legs[p?.from];
    if (!leg || (leg.across ?? leg.lanes ?? 1) < 2 || a.s > p.stopAt || a.crash || /^offb?-/.test(L.legs[p.to]?.road ?? "")) continue;
    const span = laneSpan(world.course, a.k ?? 0, a.route, a.s)[0], pos = leg.pos ?? leg.lane ?? 0, group = span.lane.split("#")[0];
    const o = { a, along: span.along, pos, group }; info.set(a.id, o); const key = `${group}|${pos}`; (lanes.get(key) ?? lanes.set(key, []).get(key)).push(o);
  }
  for (const xs of lanes.values()) xs.sort((p, q) => p.along - q.along);
  return { lanes, info };
};
const leaderIn = (lanes, group, pos, along, id) => { const xs = lanes.get(`${group}|${pos}`); if (!xs) return null; for (const o of xs) if (o.along > along + 0.5 && o.a.id !== id) return o; return null; };
const stats = () => ({ n: 0, leftFree: 0, leftSlower: 0, newFree: 0, newSlowerThanOld: 0, newSlowerThanWant: 0, held5: 0, share5: 0, yoyo: 0, dvLeader: 0, dvN: 0 });
const S = { keepRight: stats(), choice: stats() }; const pending = [];
const held = (a) => a.headway != null && a.v < 0.9 * a.v0 && a.headway / Math.max(a.v, 1) < 2;
for (let i = 0; i < +secsArg * 20; i++) {
  const before = w; w = step(w);
  let bl = null;
  for (const a of w.actors) {
    if (!(a.lc && a.lc.at === before.t && !a.lc.abort)) continue;
    const was = before.actors.find((b) => b.id === a.id); if (!was) continue;
    const kr = a.keptRight !== was.keptRight, turn = !kr && was.want && was.want.k === was.k;
    if (turn || a.lc.mandatory || a.lc.merge) continue;
    bl ??= lanesOf(before); const me = bl.info.get(a.id); if (!me) continue;
    const dir = kr ? 1 : (a.lc.L0 > 0 ? -1 : 1);   // L0 = -dir*sep: a move right (dir +1) leaves the old lane on the left
    const old = leaderIn(bl.lanes, me.group, me.pos, me.along, a.id), nw = leaderIn(bl.lanes, me.group, me.pos + (a.lc.L0 < 0 ? 1 : -1), me.along, a.id);
    const look = Math.max(30, a.v0 * 4), oldV = old && old.along - me.along < look ? old.a.v : null, newV = nw && nw.along - me.along < look ? nw.a.v : null;
    const s = S[kr ? "keepRight" : "choice"]; s.n++;
    if (oldV == null) s.leftFree++; else if (oldV < a.v0 - 1) s.leftSlower++;
    if (newV == null) s.newFree++; else { if (newV < a.v0 - 1) s.newSlowerThanWant++; if (oldV != null && newV < oldV) s.newSlowerThanOld++; }
    pending.push({ id: a.id, t: w.t, kind: kr ? "keepRight" : "choice", yoyo: false });
  }
  const done = []; for (const p of pending) {
    const a = w.actors.find((x) => x.id === p.id);
    if (!a) { done.push(p); continue; }
    if (!p.d5 && w.t - p.t >= 5) { p.d5 = true; const s = S[p.kind]; if (held(a)) s.held5++; s.share5 += a.v / Math.max(1, a.v0); }
    if (w.t - p.t > 0.5 && w.t - p.t <= 20 && a.lc && a.lc.at === w.t - 0 && !a.lc.abort && !a.lc.mandatory && !a.lc.merge && !a.keepRightFlag) { /* counted below by the comparison with keptRight */ }
    if (w.t - p.t >= 20) done.push(p);
  }
  for (const p of done) pending.splice(pending.indexOf(p), 1);
  // yo-yo: a keep-right move followed within 20 s by a discretionary change begun by the same car
  for (const a of w.actors) if (a.lc && a.lc.at === before.t && !a.lc.abort) { const was = before.actors.find((b) => b.id === a.id); const kr = was && a.keptRight !== was.keptRight; if (!kr && !a.lc.mandatory && !a.lc.merge && !(was?.want && was.want.k === was.k)) for (const p of pending) if (p.id === a.id && p.kind === "keepRight" && w.t - p.t > 0.5 && w.t - p.t <= 20 && !p.yoyo) { p.yoyo = true; S.keepRight.yoyo++; } }
}
console.log(`${id}, ${cars} cars, seed ${seedArg}: lane changes of the car's own choosing, through traffic, multi-lane road`);
for (const [k, s] of Object.entries(S)) {
  const pc = (x) => (100 * x / Math.max(1, s.n)).toFixed(0) + "%";
  console.log(`  ${k}: ${s.n} moves. LEFT BEHIND: no leader within the look ${pc(s.leftFree)}, a leader slower than wanted by over 1 m/s ${pc(s.leftSlower)}. INHERITED: no leader within the look ${pc(s.newFree)}, a leader slower than wanted ${pc(s.newSlowerThanWant)}, slower than the one left ${pc(s.newSlowerThanOld)}. 5 s LATER: held ${pc(s.held5)}, mean speed ${(100 * s.share5 / Math.max(1, s.n)).toFixed(0)}% of wanted. A discretionary change begun within 20 s: ${pc(s.yoyo)}`);
}
