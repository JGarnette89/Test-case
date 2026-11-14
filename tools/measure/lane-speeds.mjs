/* THE LEFT LANES, AS THE PLAYER MEETS THEM (Jay, 14 November, on the shaped five-lane road: "the left lane or two [should be] filled with significantly faster drivers, my own car speed caps at 119 and I'm on everyone's bumper ahead of me ... the lane needs to clear out a little faster so the player always has somewhere to go"; and "it took about a minute of driving before the road filled").
   The map as shipped (its own count and shaping), the good driver driving from the start (tools/lib/good-driver.mjs). From `warm` seconds on, every second, the cars within 1.5 km of the player on his carriageway, by lane (0 = inner): WANTED speed (v0) and ACHIEVED speed (v), and the share whose wanted speed is above the player's top (sim/player.js V_MAX, 33 m/s = 118.8 km/h);
   and the share of the time the player is within 60 m behind a car in his own lane slower than he is. A timeline of cars within the window, every 10 s from the start, shows how long the window takes to fill.
   Usage: node tools/measure/lane-speeds.mjs <mapId> [cars=the map's own] [seed=1] [secs=300] [warm=90] */
import { TEST_MAPS } from "../../src/map/samples.js";
import { worldFor } from "../../src/sim/scene.js";
import { step, poseOf } from "../../src/sim/crossing.js";
import { withDriver } from "../../src/sim/drive.js";
import { laneSpan } from "../../src/sim/course.js";
import { V_MAX } from "../../src/sim/player.js";
import { DT } from "../../src/sim/traffic.js";
import { goodStep } from "../lib/good-driver.mjs";
const [id, carsArg, seedArg = "1", secsArg = "300", warmArg = "90"] = process.argv.slice(2);
const raw = TEST_MAPS.find((m) => m.id === id).build();
let { loaded, world: w, me } = worldFor(+seedArg, 50, 2.0, true, carsArg ? +carsArg : null, raw, raw.sections?.[0]?.start ?? null, false);
const me0 = me, sc = { me, args: [1], saveWallet: false };
const fam = (r) => (/^(hb|offb|onb)-/.test(r) ? "B" : "A");
const roadOf = (world, a) => { const L = world.course.at[a.k ?? 0].layout, p = L.paths[a.route]; return L.legs[p?.from]?.road ?? ""; };
const inWin = (world, p, mine) => world.actors.filter((a) => !a.player && !a.parked && !a.crash && fam(roadOf(world, a)) === mine && Math.hypot(poseOf(world, a).x - p.x, poseOf(world, a).y - p.y) < 1500);
const timeline = [], lanes = new Map(); let playerSecs = 0, stuck = 0, vSum = 0;
const log = (msg) => timeline.push(msg);
{ const p = poseOf(w, me), mine = fam(roadOf(w, me)); log(`t=0 (before any step): ${inWin(w, p, mine).length} cars within 1.5 km on his carriageway (the world holds ${w.actors.length})`); }
for (let n = 0; n < +secsArg / DT; n++) {
  if (me.atEdge) { me = { ...me0 }; w = withDriver(w, me); sc.me = me; }
  me = goodStep(me, w, sc, { overtake: true, pace: 1.19 }); sc.me = me;
  w = step(withDriver(w, me));
  const t = (n + 1) * DT, p = poseOf(w, me), mine = fam(roadOf(w, me));
  if (n % 200 === 199 && t <= 130) log(`t=${Math.round(t)} s: ${inWin(w, p, mine).length} cars within 1.5 km on his carriageway`);
  if (n % 20 === 19 && t >= +warmArg) {
    const L = w.course.at[me.k ?? 0].layout, mp = L.paths[me.route], mleg = L.legs[mp?.from];
    const mySpan = laneSpan(w.course, me.k ?? 0, me.route, me.s)[0], myGroup = mySpan.lane.split("#")[0], myPos = mleg?.pos ?? mleg?.lane ?? 0;
    playerSecs++; vSum += me.v;
    for (const a of inWin(w, p, mine)) {
      const La = w.course.at[a.k ?? 0].layout, pa = La.paths[a.route], leg = La.legs[pa?.from];
      if (!leg || (leg.across ?? leg.lanes ?? 1) < 2 || a.s > pa.stopAt || /^offb?-/.test(La.legs[pa.to]?.road ?? "")) continue;
      const pos = leg.pos ?? leg.lane ?? 0, rec = lanes.get(pos) ?? lanes.set(pos, { v0: [], v: [] }).get(pos);
      rec.v0.push(a.v0 * 3.6); rec.v.push(a.v * 3.6);
      const sp = laneSpan(w.course, a.k ?? 0, a.route, a.s)[0];
      if (sp.lane.split("#")[0] === myGroup && pos === myPos && sp.along > mySpan.along && sp.along - mySpan.along < 60 && a.v < me.v - 0.3) { stuck++; break; }
    }
  }
}
const q = (xs, f) => { const s = xs.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(f * s.length))]; };
console.log(`${id}, ${carsArg ?? "the map's own count"} cars, seed ${seedArg}: the player's top speed is ${(V_MAX * 3.6).toFixed(1)} km/h (V_MAX)`);
for (const l of timeline) console.log("  " + l);
console.log(`  from ${warmArg} s on, the cars within 1.5 km on his carriageway, by lane (0 = inner), car-seconds, WANTED p10/50/90, ACHIEVED p10/50/90, share who WANT more than the player's top:`);
let all0 = [], all1 = [];
for (const [pos, r] of [...lanes.entries()].sort((a, b) => a[0] - b[0])) { all0 = all0.concat(r.v0); all1 = all1.concat(r.v); console.log(`    lane ${pos}: ${r.v.length} car-seconds; wanted ${q(r.v0, .1).toFixed(0)}/${q(r.v0, .5).toFixed(0)}/${q(r.v0, .9).toFixed(0)}; achieved ${q(r.v, .1).toFixed(0)}/${q(r.v, .5).toFixed(0)}/${q(r.v, .9).toFixed(0)} km/h; ${(100 * r.v0.filter((x) => x > V_MAX * 3.6).length / r.v0.length).toFixed(0)}% want more than ${(V_MAX * 3.6).toFixed(0)}`); }
console.log(`    ALL: wanted ${q(all0, .1).toFixed(0)}/${q(all0, .5).toFixed(0)}/${q(all0, .9).toFixed(0)}; achieved ${q(all1, .1).toFixed(0)}/${q(all1, .5).toFixed(0)}/${q(all1, .9).toFixed(0)}; ${(100 * all0.filter((x) => x > V_MAX * 3.6).length / all0.length).toFixed(0)}% want more than the player's top`);
console.log(`  the player: mean speed ${(3.6 * vSum / Math.max(1, playerSecs)).toFixed(0)} km/h; within 60 m behind a slower car in his own lane ${(100 * stuck / Math.max(1, playerSecs)).toFixed(0)}% of the time`);
