/* THE SHAPING WINDOW, SWEPT (DECISIONS 10.141; the lead: "total cars is the wrong lever, the window is": the same cars in a narrower window are denser around the player, and the cost to find is where cars would start to be SEEN appearing).
   One configuration per run: `cars` on the generated road, shaping's window AHEAD m ahead and BEHIND m behind (world.shapeAhead / shapeBehind, the constants' own override), the good driver cruising for `minutes` over the seeds. Reports:
   - MET a minute within 30 m (sim/encounters.js, the instrument the 17-19 came from) and the share of time following / followed;
   - SEEN: the cars within VIEW m of the player (the drive screen's reach at its usual zoom, a stated 120 m) -- their mean, the share of time with NONE, the longest empty stretch (s), and distinct cars coming into view a minute;
   - POPPING, from the world and not the rule: every car that APPEARS (an id not in the last tick) and every car that VANISHES (an id gone), by its straight-line distance from the player at that tick, excluding the player's own restarts: the 1st / 5th / 50th percentiles and the share inside SIGHT (400 m, the camera's widest reach, shaping's own out-of-sight line) and inside VIEW.
   Usage: node tools/measure/shaping-window.mjs cars ahead behind [minutes=4] [seeds=1,2,3] [map=test-highway-gen-wide] */
import { worldFor } from "../../src/sim/scene.js";
import { TEST_MAPS } from "../../src/map/samples.js";
import { step, poseOf } from "../../src/sim/crossing.js";
import { withDriver } from "../../src/sim/drive.js";
import { noticeTick } from "../../src/sim/session.js";
import { newEncounters, encounterTick, encounterSummary } from "../../src/sim/encounters.js";
import { SIGHT } from "../../src/sim/shaping.js";
import { goodStep } from "../lib/good-driver.mjs";
import { DT } from "../../src/sim/traffic.js";
const [carsArg, aheadArg, behindArg, minArg = "4", seedArg = "1,2,3", mapId = "test-highway-gen-wide"] = process.argv.slice(2);
const cars = Number(carsArg), VIEW = 120, def = TEST_MAPS.find((m) => m.id === mapId);
const opts = { overtake: true, pace: 1.0 };
const pc = (a, p) => (a.length ? [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(p * a.length))] : NaN);
const agg = { met: [], follow: [], followed: [], inView: [], empty: [], longestEmpty: [], intoView: [], appear: [], vanish: [], minutes: 0, count: [] };
for (const seed of seedArg.split(",").map(Number)) {
  const raw = def.build();
  let { loaded, world: w, me } = worldFor(seed, 50, 2.0, true, cars, raw, raw.sections?.[0]?.start ?? null, false, false, { preroll: 15 });
  w = { ...w, shape: true, shapeAhead: Number(aheadArg), shapeBehind: Number(behindArg) };
  const me0 = me, sc = { me, args: [1], saveWallet: false }, enc = newEncounters();
  let last = new Map(), inViewNow = new Set(), emptyRun = 0, longest = 0, emptyTicks = 0, viewSum = 0, entered = 0, ticks = 0;
  const N = (Number(minArg) * 60) / DT;
  for (let n = 0; n < N; n++) {
    let restarted = false;
    if (me.atEdge) { me = { ...me0 }; w = withDriver(w, me); sc.me = me; restarted = true; }
    const prev = { me, world: w };
    me = goodStep(me, w, sc, opts); w = step(withDriver(w, me)); noticeTick(sc, prev, { me, world: w }); sc.me = me; encounterTick(enc, me, w);
    const pp = poseOf(w, w.actors.find((a) => a.player) ?? me), now = new Map(), view = new Set();
    for (const a of w.actors) { if (a.player) continue; const p = poseOf(w, a), d = Math.hypot(p.x - pp.x, p.y - pp.y); now.set(a.id, d); if (d < VIEW) view.add(a.id); }
    if (n > 20 && !restarted) {
      for (const [id, d] of now) if (!last.has(id)) agg.appear.push(d);
      for (const [id, d] of last) if (!now.has(id)) agg.vanish.push(d);
      for (const id of view) if (!inViewNow.has(id)) entered++;
    }
    viewSum += view.size; if (view.size === 0) { emptyTicks++; emptyRun++; longest = Math.max(longest, emptyRun); } else emptyRun = 0;
    last = now; inViewNow = view; ticks++;
  }
  const s = encounterSummary(enc), mins = ticks * DT / 60;
  agg.met.push(s.metPerMin); agg.follow.push(s.followingShare); agg.followed.push(s.followedShare);
  agg.inView.push(viewSum / ticks); agg.empty.push(100 * emptyTicks / ticks); agg.longestEmpty.push(longest * DT); agg.intoView.push(entered / mins); agg.minutes += mins; agg.count.push(w.actors.length);
}
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length, f = (x, d = 1) => x.toFixed(d);
const inside = (a, r) => (a.length ? 100 * a.filter((d) => d < r).length / a.length : NaN);
console.log(JSON.stringify({ cars, ahead: Number(aheadArg), behind: Number(behindArg), minutes: agg.minutes, actors: Math.round(mean(agg.count)), met: +f(mean(agg.met)), following: +f(mean(agg.follow)), inView: +f(mean(agg.inView), 2), emptyPct: +f(mean(agg.empty)), longestEmptyS: +f(Math.max(...agg.longestEmpty)), intoViewPerMin: +f(mean(agg.intoView)),
  appear: { n: agg.appear.length, p1: Math.round(pc(agg.appear, 0.01)), p5: Math.round(pc(agg.appear, 0.05)), p50: Math.round(pc(agg.appear, 0.5)), inSight: +f(inside(agg.appear, SIGHT)), inView: +f(inside(agg.appear, VIEW)) },
  vanish: { n: agg.vanish.length, p1: Math.round(pc(agg.vanish, 0.01)), p5: Math.round(pc(agg.vanish, 0.05)), p50: Math.round(pc(agg.vanish, 0.5)), inSight: +f(inside(agg.vanish, SIGHT)), inView: +f(inside(agg.vanish, VIEW)) } }));
