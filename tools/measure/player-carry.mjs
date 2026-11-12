/* DOES THE PLAYER'S DRAWN CAR STEP SIDEWAYS BETWEEN TICKS? (13 November, DECISIONS 10.70; read-only.) The screen draws the player at `driverPose({...me, s: me.s + me.v * carry})`: along the road the car is carried at the tick's
   speed, but `off` (its offset from the route's line) and `psi` (its heading against the route) are held at the tick's values, though both are changing every tick while the wheel is turned
   (stepPlayerOn: off += v sin(psi) dt, psi += psiDot dt). Asked of a steered drive on the loop: the drawn pose at six frames between two ticks against the straight line between the two ticks' poses (what a perfectly carried car would
   show), sideways and in heading, and the size of the step at each tick boundary. No traffic. Usage: node tools/measure/player-carry.mjs [kmh=80]. Asserts nothing. */
import { loadMap } from "../../src/map/load.js";
import { TEST_MAPS } from "../../src/map/samples.js";
import { seedGraph, DT } from "../../src/sim/crossing.js";
import { playerAt, stepDriver, driverPose, withDriver } from "../../src/sim/drive.js";
import { holdAt } from "../../src/sim/player.js";
const kmh = +(process.argv[2] ?? 80);
const course = { ...seedGraph(1, 50, loadMap(TEST_MAPS.find((m) => m.id === "test-loop").build()), { every: 2 }), actors: [] };
const k = 0, route = Object.keys(course.course.at[k].layout.paths).find((r) => /^loop-7\|end#1/.test(r)), turnOf = (a, b) => ((a - b + 540) % 360) - 180;
let me = { ...playerAt(course.course, k, route), s: 300, v: kmh / 3.6, going: true, accepted: true, signal: null, off: 0 }, world = withDriver(course, me);
const poses = [], states = [];
for (let i = 0; i < 6 / DT; i++) {
  states.push(me); poses.push(driverPose(me, course.course));
  const steer = i < 1.2 / DT ? 0.5 : i < 2.4 / DT ? -0.5 : 0;   // a weave, as a lane change is steered
  me = stepDriver(me, { steer, slider: holdAt(me.v, me.grade ?? 0), assist: 0 }, world, DT); world = withDriver(world, me);
}
let worstLat = 0, worstHead = 0, tickStepLat = 0, tickStepHead = 0, offStep = 0, n = 0;
for (let i = 0; i + 1 < states.length; i++) {
  const p0 = poses[i], p1 = poses[i + 1], h = (p0.heading * Math.PI) / 180, nx = -Math.sin(h), ny = Math.cos(h);
  tickStepLat = Math.max(tickStepLat, Math.abs((p1.x - p0.x) * nx + (p1.y - p0.y) * ny - 0)); tickStepHead = Math.max(tickStepHead, Math.abs(turnOf(p1.heading, p0.heading)));
  if (states[i + 1].route === states[i].route) offStep = Math.max(offStep, Math.abs(states[i + 1].off - states[i].off));   /* the quantity the drawn pose holds still for a tick: the offset from the route's line (a car moves ALONG ITS HEADING, so in the heading's own frame its sideways step is nil, which is what the first column of this tool measured and why it read 12 mm) */
  for (const f of [1, 2, 3, 4, 5]) {
    const carry = (f / 6) * DT, drawn = driverPose({ ...states[i], s: states[i].s + states[i].v * carry }, course.course);
    const t = carry / DT, ix = p0.x + (p1.x - p0.x) * t, iy = p0.y + (p1.y - p0.y) * t, ih = p0.heading + turnOf(p1.heading, p0.heading) * t;
    worstLat = Math.max(worstLat, Math.abs((drawn.x - ix) * nx + (drawn.y - iy) * ny)); worstHead = Math.max(worstHead, Math.abs(turnOf(drawn.heading, ih))); n++;
  }
}
console.log(JSON.stringify({ kmh, frames: n, "worst sideways gap between the drawn car and a perfectly carried one, mm": +(worstLat * 1000).toFixed(1), "worst heading gap, degrees": +worstHead.toFixed(3), "largest change of the offset from the route's line in ONE TICK, mm (what the drawn pose holds still between ticks)": +(offStep * 1000).toFixed(1), "largest heading change in one tick, degrees": +tickStepHead.toFixed(3) }, null, 1));
