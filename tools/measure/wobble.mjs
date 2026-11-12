/* THE PLAYER'S HEADING WOBBLE (13 November, DECISIONS 10.70). A hands-off drive (the lane assist following the road) round the loop-7 bend at 80 km/h; the drawn absolute heading against an INDEPENDENT smooth reference (the chord of the path's
   POSITIONS 10 m either side, computed here and not by the code under test); the deviation, and the tick-to-tick noise: the step of (heading - reference) per tick. Measured before the fix (the player's heading the polyline's segment heading, a staircase
   of 0.48 degrees every 5 m): deviation rms 0.111 degrees, worst 0.243; noise p50 / p95 / max 0.106 / 0.355 / 0.427. Asserts nothing: verify-drive section 11 holds it. */
import { loadMap } from "../../src/map/load.js";
import { TEST_MAPS } from "../../src/map/samples.js";
import { seedGraph, DT } from "../../src/sim/crossing.js";
import { playerAt, stepDriver, driverPose, withDriver } from "../../src/sim/drive.js";
import { poseOnGraph } from "../../src/sim/graph.js";
import { holdAt } from "../../src/sim/player.js";
const course = { ...seedGraph(1, 50, loadMap(TEST_MAPS.find((m) => m.id === "test-loop").build()), { every: 2 }), actors: [] };
const route = Object.keys(course.course.at[0].layout.paths).find((r) => /^loop-7\|end#1/.test(r)), turnOf = (a, b) => ((a - b + 540) % 360) - 180;
const refAt = (s) => { const a = poseOnGraph(course.course, 0, route, s - 10), b = poseOnGraph(course.course, 0, route, s + 10); return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI; };
let me = { ...playerAt(course.course, 0, route), s: 500, v: 80 / 3.6, going: true, accepted: true, signal: null, off: 0 }, world = withDriver(course, me);
const dev = [], offs = [];
for (let i = 0; i < 40 / DT && me.s < 1400; i++) {
  me = stepDriver(me, { steer: 0, slider: holdAt(me.v, me.grade ?? 0), assist: 1 }, world, DT); world = withDriver(world, me);
  dev.push(turnOf(driverPose(me, course.course).heading, refAt(me.s))); offs.push(me.off);
}
const rms = Math.sqrt(dev.reduce((a, b) => a + b * b, 0) / dev.length), steps = dev.slice(1).map((d, i) => Math.abs(d - dev[i])).sort((a, b) => a - b);
console.log(JSON.stringify({ ticks: dev.length, "max |off| m": +Math.max(...offs.map(Math.abs)).toFixed(2), "heading deviation from the smooth reference: rms deg": +rms.toFixed(3), "max deg": +Math.max(...dev.map(Math.abs)).toFixed(3), "tick-to-tick noise: p50 / p95 / max deg": [steps[Math.floor(steps.length / 2)], steps[Math.floor(steps.length * 0.95)], steps[steps.length - 1]].map((x) => +x.toFixed(3)) }));
