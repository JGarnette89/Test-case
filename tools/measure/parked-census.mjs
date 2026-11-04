/* WHAT IS IN "180 CARS"? (5 November; the maintainer: "the majority of cars are just
   parked along the road, and they never ever seem to move. nobody ever gets in and
   drives so we spend the car budget for no moving traffic.") The game's own world
   (scene.js worldFor) with the good driver at the wheel, as he plays it, for SECS after
   its warm-up. Every count comes from the world, none from a setting:
     actors     world.actors, what the readout calls "cars on the map", less the player
     moving     of those, over 1 m/s; standing, under
     parked     world.parked, the slots with a car drawn in them
     ever left  of the slots full at the start, how many have emptied at the end
     in / out   pull-ins and pull-outs a minute
     near       within 100 m of the player, moving and parked, as he sees it
     step ms    the world step alone
   NOPARK=1 takes parking off every road, the control for what parked cars cost a step.
   Usage: node tools/measure/parked-census.mjs map cars seed [secs=240] */
import { TEST_MAPS } from "../../src/map/samples.js";
import { worldFor } from "../../src/sim/scene.js";
import { step, poseOf } from "../../src/sim/crossing.js";
import { withDriver } from "../../src/sim/drive.js";
import { parkingOf, parkedPoses } from "../../src/sim/parking.js";
import { districtStreetsOf } from "../../src/sim/crossing.js";
import { DT } from "../../src/sim/traffic.js";
import { goodStep } from "../lib/good-driver.mjs";

const [id, carsArg, seedArg = "1", secsArg = "240"] = process.argv.slice(2);
const cars = carsArg === "default" ? null : Number(carsArg), seed = Number(seedArg), SECS = Number(secsArg);
const raw = TEST_MAPS.find((m) => m.id === id).build();
if (process.env.NOPARK === "1") for (const r of raw.roads) r.parking = "none";
let { loaded, world: w, me } = worldFor(seed, 50, 2.0, true, cars, raw, raw.sections?.[0]?.start ?? null, false);
const me0 = me, sc = { me, args: [seed], saveWallet: false };
const slots = parkingOf(w.course).slots.length, start = Object.keys(w.parked ?? {});
const startSet = new Set(start), left = new Set();
let actors = 0, moving = 0, standing = 0, samples = 0, nearM = 0, nearP = 0, pIn = 0, pOut = 0, parkedSum = 0, ms = 0, ticks = 0;
const t0 = w.t;
for (let i = 0; i < SECS / DT; i++) {
  if (!me || me.atEdge) { me = { ...me0 }; w = withDriver(w, me); }
  me = goodStep(me, w, sc, { overtake: true, pace: 1.19 });
  sc.me = me;
  const prev = w.parked, input = withDriver(w, me);
  const a = performance.now();
  w = step(input);
  ms += performance.now() - a; ticks++;
  if (w.parked !== prev) {
    for (const k of Object.keys(prev ?? {})) if (!w.parked?.[k]) { pOut++; if (startSet.has(k)) left.add(k); }
    for (const k of Object.keys(w.parked ?? {})) if (!prev?.[k]) pIn++;
  }
  if (i % 20) continue;
  samples++;
  const list = w.actors.filter((c) => !c.player);
  actors += list.length; moving += list.filter((c) => (c.v ?? 0) > 1).length; standing += list.filter((c) => (c.v ?? 0) <= 1).length;
  const parked = parkedPoses(w.course, w.parked);
  parkedSum += parked.length;
  const p = poseOf(w, me);
  nearM += list.filter((c) => { const q = poseOf(w, c); return Math.hypot(q.x - p.x, q.y - p.y) <= 100; }).length;
  nearP += parked.filter((q) => Math.hypot(q.x - p.x, q.y - p.y) <= 100).length;
}
const mins = (w.t - t0) / 60;
console.log(JSON.stringify({ id, asked: cars ?? "default", target: w.target, seed, slots, districts: districtStreetsOf(w.course).length, parkedStart: start.length, parked: +(parkedSum / samples).toFixed(0), actors: +(actors / samples).toFixed(1), moving: +(moving / samples).toFixed(1), standing: +(standing / samples).toFixed(1), everLeft: left.size, leftShare: +(left.size / Math.max(1, start.length)).toFixed(3), inPerMin: +(pIn / mins).toFixed(1), outPerMin: +(pOut / mins).toFixed(1), nearMoving: +(nearM / samples).toFixed(1), nearParked: +(nearP / samples).toFixed(1), stepMs: +(ms / ticks).toFixed(2), crashes: (w.crashes ?? []).length }));
