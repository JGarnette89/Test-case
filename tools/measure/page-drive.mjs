/* WHAT THE PAGE DOES WHILE DRIVING, PER FRAME AND PER TICK (15 October):
   the phone read sim 0.11x, worker step 86 ms but a round trip of 444 ms,
   and the page itself at 37 fps with a 175 ms p95 -- on test map 1 at 320
   cars. The worker's answer cannot be handled until the page's frame is
   done, so a slow page slows the world too. This times the page's own
   work in #/map's drive mode on the desk, under the same conditions:
   per tick, laying the answer over the copy and the session (events, the
   voice, the route); per frame, the slider advice (drive.js aheadOf, which
   asks whatStops for the player), the poses and the draw.
   Usage: node tools/measure/page-drive.mjs [cars=320] [seconds=30] */
import { performance } from "node:perf_hooks";
import { serialize, deserialize } from "node:v8";
import { handle, merge } from "../../src/sim/remote.js";
import { worldFor } from "../../src/sim/scene.js";
import { stepDriver, aheadOf, withDriver } from "../../src/sim/drive.js";
import { noticeTick } from "../../src/sim/session.js";
import { benchActors } from "../../src/iso/bench.js";
import { drawFrame } from "../../src/iso/draw.js";
import { junctionsOf } from "../../src/sim/graph.js";
import { sidewalksOf } from "../../src/map/sidewalks.js";
import { groundFor } from "../../src/map/load.js";
import { terrain } from "../../src/iso/road.js";
import { DT } from "../../src/sim/traffic.js";

const cars = Number(process.argv[2] ?? 320), secs = Number(process.argv[3] ?? 30);
const args = [1, 50, 2.0, true, cars, null, null, false];
let { loaded, world: page, me } = worldFor(...args);
let { state, reply } = handle(null, { type: "init", args, seq: 1 });
page = merge(page, deserialize(serialize(reply.dyn)));
const b = loaded.bounds, ground = groundFor(loaded, { cell: 20 });
const statics = { roads: loaded.roads.map((road) => ({ road, cars: [] })), terrain: terrain({ x0: b.x, y0: b.y, x1: b.x + b.w, y1: b.y + b.h, cell: 20, ground }), junctions: junctionsOf(page.course), sidewalks: sidewalksOf(loaded), stops: loaded.stops ?? [], props: [], groundAt: ground };
const noop = () => {};
const ctx = new Proxy({}, { get: (t, p) => (p in t ? t[p] : noop), set: (t, p, v) => { t[p] = v; return true; } });
const T = { merge: [], session: [], ahead: [], poses: [], draw: [] };
const sc = { me, args, saveWallet: false };
const time = (k, fn) => { const t = performance.now(); const r = fn(); T[k].push(performance.now() - t); return r; };
for (let n = 0; n < secs / DT; n++) {
  const prev = { me, world: page };
  me = stepDriver(me, { steer: -me.off * 0.3 - me.psi * 3, slider: me.v < 11 ? 0.4 : 0.05, assist: 0 }, page, DT);
  ({ state, reply } = handle(state, { type: "step", me, seq: n + 2 }));
  const dyn = deserialize(serialize(reply.dyn));
  page = time("merge", () => withDriver(merge(page, dyn), me));
  time("session", () => noticeTick(sc, prev, { me, world: page, hit: reply.hit }));
  sc.me = me;
  for (let f = 0; f < 3; f++) {
    time("ahead", () => aheadOf(me, page.course, page));
    const actors = time("poses", () => benchActors({ world: page }, f / 60));
    for (const a of actors) if (!a.colour && !a.ped) a.colour = "#e0574f";
    const cam = { x: me.x ?? 0, y: me.y ?? 0, z: 0 };
    const p = actors.find((a) => a.id === "player") ?? actors[0];
    time("draw", () => drawFrame(ctx, { w: 395, h: 527 }, { ...statics, cam: { x: p.x, y: p.y, z: 0 }, rot: 0, k: 6.6, tilt: false, actors, t: page.t, lights: page.lights }));
  }
}
const q = (xs, f) => [...xs].sort((a, b) => a - b)[Math.floor(f * (xs.length - 1))];
console.log(`test map 1, ${page.actors.length} actors, driving ${secs} s -- the page's own work, desk ms:`);
for (const [k, xs] of Object.entries(T)) console.log(`  ${k.padEnd(8)} p50 ${q(xs, 0.5).toFixed(2)}  p95 ${q(xs, 0.95).toFixed(2)}  max ${Math.max(...xs).toFixed(2)}   (${k === "merge" || k === "session" ? "per tick" : "per frame"})`);
