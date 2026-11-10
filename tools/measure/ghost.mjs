/* THE CLIFF (DECISIONS 10.66, 10.67 piece 4): what the traffic does about a player on no lane, MEASURED, NOT DECIDED.
   The traffic finds the player by (k, route, s). On no lane those are the latched route's -- a ghost -- and the car is
   somewhere else. Two made scenes on test map 1, one traffic car each, the real position on:
     A. THE GHOST IS QUEUED BEHIND: the player stands on the grass; their ghost stands on the lane the route is latched
        to. A car comes down that lane. Does it stop for nothing?
     B. THE CAR IS NOT SEEN: the player stands in a lane, facing against it (on no lane), their ghost on another street.
        A car comes down the lane they are standing in. Does it brake before it reaches them?
   The player holds the slider at rest (a pull to the bottom from a standstill is reverse, player.js: the first run of
   this backed the player 30 m toward the road and measured that).
   Usage: node tools/measure/ghost.mjs */
import { seedGraph, step, poseOf, DT } from "../../src/sim/crossing.js";
import { playerAt, withDriver, driverPose, routeForSignal, stepDriver } from "../../src/sim/drive.js";
import { playerContact } from "../../src/sim/contact.js";
import { poseOnGraph } from "../../src/sim/graph.js";
import { loadMap } from "../../src/map/load.js";
import { testMap1 } from "../../src/map/samples.js";

const loaded = loadMap(testMap1());
let warm = seedGraph(1, 50, loaded, { every: 2 });
for (let i = 0; i < 200; i++) warm = step(warm);
const template = warm.actors.find((a) => !a.player && a.kind !== "truck" && a.kind !== "bus");
const empty = { ...warm, actors: [], every: 1e9, nextAt: 1e9, realPos: true };
const course = empty.course;
const car = (id, k, route, s, v) => ({ ...template, id, k, route, s, v, lc: null, pass: null, crash: null, stoppedAt: null, going: false, accepted: false, want: null });
const leg = "A-north|end#1", k = course.at.findIndex((s) => s.layout.legs[leg]), layout = course.at[k].layout;
const south = routeForSignal(layout, leg, null);                                  // the southbound approach, straight on
const west = Object.keys(layout.paths).find((r) => r === "A-B|start#0/A-west|end#0");   // the lane the stagger latches to (10.64)

const run = (name, me, other, secs = 20) => {
  let w = withDriver({ ...empty, actors: [other] }, me), minGap = Infinity, touched = null, vAtEnd = 0, stoodFor = 0, braked = 0;
  for (let i = 0; i < secs / DT; i++) {
    me = stepDriver(me, { steer: 0, slider: 0, assist: 0 }, w, DT);
    w = step(withDriver(w, me));
    const o = w.actors.find((a) => a.id === other.id);
    if (!o) break;
    const p = poseOf(w, o), m = driverPose(me, course), ghost = poseOnGraph(course, me.k, me.route, me.s);
    minGap = Math.min(minGap, Math.hypot(p.x - m.x, p.y - m.y));
    if ((o.a ?? 0) < -0.5) braked++;
    if ((o.v ?? 0) < 0.2) stoodFor += DT;
    vAtEnd = o.v ?? 0;
    const c = playerContact(w, me);
    if (c.hit && touched == null) touched = { t: i * DT, v: o.v ?? 0, closing: c.fresh[0]?.closing };
    if (i === Math.round(secs / DT) - 1) console.log(`${name}\n   after ${secs} s: the car is ${Math.hypot(p.x - m.x, p.y - m.y).toFixed(1)} m from the player's car and ${Math.hypot(p.x - ghost.x, p.y - ghost.y).toFixed(1)} m from the ghost, doing ${(vAtEnd * 3.6).toFixed(0)} km/h; stood ${stoodFor.toFixed(1)} s; braking on ${braked} ticks; nearest it came to the car ${minGap.toFixed(1)} m; ${touched ? `STRUCK the player at ${touched.t.toFixed(1)} s doing ${(touched.v * 3.6).toFixed(0)} km/h` : "never touched the player"}`);
  }
};

/* A. The player 34 m off on the grass (where 10.64's run leaves them), the ghost standing in the westbound lane. */
{
  const g = poseOnGraph(course, k, west, 227.6);
  const me = { ...playerAt(empty, k, west), s: 227.6, v: 0, going: true, accepted: true, noLane: true, lost: true, at: { x: 372.4, y: 432.1, z: g.z ?? 0, heading: 117 } };
  run("A. the ghost on the lane, the player 34 m away on the grass; a car comes down that lane at 43 km/h from 90 m back", me, car("a", k, west, 227.6 - 90, 12));
}
/* B. The player standing in the southbound lane facing north; the ghost on the westbound lane, far from it. */
{
  const at = poseOnGraph(course, k, south, 200);
  const me = { ...playerAt(empty, k, west), s: 300, v: 0, going: true, accepted: true, noLane: true, lost: true, at: { x: at.x, y: at.y, z: at.z ?? 0, heading: at.rot + 180 } };
  run("B. the player standing in the southbound lane, against it; a car comes down that lane at 43 km/h from 110 m back", me, car("b", k, south, 90, 12), 14);
}
