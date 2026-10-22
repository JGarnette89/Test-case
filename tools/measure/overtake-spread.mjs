/* IS THE SPEED SPREAD REACHING THE ROAD? (22 October; the maintainer at 108
   in a 100 overtook 3.6 a minute and was overtaken 0.3.) Two possibilities:
   the spread is too narrow, or he simply drives faster than its fastest
   band. Asked of the AI, not of him: on the endless highway, the fleet's
   wanted speed against the posted limit, and, for AI drivers whose wanted
   speed is the limit (within 2%), how often they are overtaken and how often
   they overtake -- counted from their own seat exactly as the instrument
   counts for the player (sim/encounters.js: a car beside, same heading,
   within PASS_SIDE along, going from ahead to behind or the reverse).
   Usage: node tools/measure/overtake-spread.mjs [cars=280] [secs=240] [seed=1] */
import { worldFor } from "../../src/sim/scene.js";
import { TEST_MAPS } from "../../src/map/samples.js";
import { step, poseOf } from "../../src/sim/crossing.js";
import { postedAt, postedOutAt } from "../../src/sim/graph.js";
import { DT } from "../../src/sim/traffic.js";
import { PASS_SIDE } from "../../src/sim/encounters.js";

const [carsArg = "280", secsArg = "240", seedArg = "1"] = process.argv.slice(2);
const raw = TEST_MAPS.find((m) => m.id === "test-loop").build();
let { world: w } = worldFor(Number(seedArg), 50, 2.0, false, Number(carsArg), raw, null, false);
const posted = (a) => { const p = w.course.at[a.k ?? 0].layout.paths[a.route]; return (a.s > p.clearAt ? postedOutAt(w.course, a.k ?? 0, a.route) : postedAt(w.course, a.k ?? 0, a.route)) ?? null; };
const onLoop = (a) => w.course.at[a.k ?? 0].layout.legs[w.course.at[a.k ?? 0].layout.paths[a.route]?.to]?.road?.startsWith("loop");
/* The fleet's wanted speed against the limit, on the loop itself. */
const ratios = w.actors.filter((a) => !a.player && onLoop(a) && posted(a)).map((a) => (a.v0 ?? 0) / posted(a)).sort((x, y) => x - y);
const q = (xs, f) => xs[Math.floor(f * (xs.length - 1))];
console.log(`endless highway, ${carsArg} cars, seed ${seedArg}: wanted speed / posted limit across ${ratios.length} cars on the loop -- min ${q(ratios, 0).toFixed(2)}, p10 ${q(ratios, 0.1).toFixed(2)}, median ${q(ratios, 0.5).toFixed(2)}, p90 ${q(ratios, 0.9).toFixed(2)}, max ${q(ratios, 1).toFixed(2)}; above 1.08 (the maintainer's pace): ${(100 * ratios.filter((r) => r > 1.08).length / ratios.length).toFixed(0)}%`);
/* Track drivers who want the limit, from their seat. */
const tracked = new Map();   // id -> { rel: Map, overtook, overtaken, t }
const trackOf = (a) => { let s = tracked.get(a.id); if (!s) { s = { rel: new Map(), overtook: 0, overtaken: 0, t: 0 }; tracked.set(a.id, s); } return s; };
for (let n = 0; n < Number(secsArg) / DT; n++) {
  w = step(w);
  if (n % 2) continue;   // every other tick: passes take seconds
  const poses = new Map(w.actors.map((a) => [a.id, poseOf(w, a)]));
  for (const me of w.actors) {
    if (me.player || !onLoop(me) || !(me.v > 2)) continue;
    const lim = posted(me);
    if (!lim || Math.abs((me.v0 ?? 0) / lim - 1) > 0.02) continue;
    if (!tracked.has(me.id) && tracked.size >= 40) continue;
    const st = trackOf(me);
    st.t += 2 * DT;
    const mp = poses.get(me.id), h = ((mp.rot ?? 0) * Math.PI) / 180, fx = Math.cos(h), fy = Math.sin(h);
    const rel = new Map();
    for (const a of w.actors) {
      if (a.id === me.id) continue;
      const p = poses.get(a.id);
      if (Math.abs(p.x - mp.x) > PASS_SIDE + 5 || Math.abs(p.y - mp.y) > PASS_SIDE + 5) continue;
      const dx = p.x - mp.x, dy = p.y - mp.y, along = dx * fx + dy * fy, across = Math.abs(-dx * fy + dy * fx);
      if (Math.cos((((p.rot ?? 0) - (mp.rot ?? 0)) * Math.PI) / 180) <= 0.7 || Math.abs(along) > PASS_SIDE) continue;
      rel.set(a.id, { along, across });
      const was = st.rel.get(a.id);
      if (was && across >= 1.8 && was.across >= 1.8) {
        if (was.along > 0 && along <= 0) st.overtook++;
        else if (was.along < 0 && along >= 0) st.overtaken++;
      }
    }
    st.rel = rel;
  }
}
const all = [...tracked.values()].filter((s) => s.t > 30);
const min = all.reduce((t, s) => t + s.t, 0) / 60;
const tot = (k) => all.reduce((t, s) => t + s[k], 0);
console.log(`  ${all.length} drivers who want the limit (within 2%), ${min.toFixed(1)} driver-minutes on the loop: overtaken ${(tot("overtaken") / min).toFixed(2)} a minute, overtook ${(tot("overtook") / min).toFixed(2)} a minute`);
