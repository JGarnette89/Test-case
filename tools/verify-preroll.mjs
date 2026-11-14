/* =====================================================================
   THE WINDOW IS FILLED BEFORE THE PLAYER HAS THE WHEEL (DECISIONS 10.93; Jay, 14 November: "it took about a minute of driving before the road was filled"). Shaping places one car a tick and starts only once a player is on the map, so the world opened with a handful of cars within 1.5 km of him.
   `worldFor`'s `preroll` option runs seconds of the shaped world with the player standing; only the screen asks for it (`sceneFor`). Expectations are literals:

     1. IT FILLS THE WINDOW: on the five-lane road at its own 100 cars, the cars within 1.5 km of the player go from under 15 to at least 70 (measured 5-8 to 81-95, eight seeds).
     2. IT COSTS NOBODY A CRASH: no crash in the pre-roll on any of 8 seeds on each of the three shaped maps, and the player is never hit (a player standing still for fifteen seconds is a car cars could run into).
     3. IT CHANGES NOTHING ELSEWHERE: on a map that does not ask for shaping, and with `preroll` 0, the world is the world it was, car for car -- so every check that builds one through `worldFor` is unmoved.
     4. THE SCREEN ASKS FOR IT, and the worker builds the same world: `sceneFor` passes `preroll: PREROLL` in the args the worker is given (read from the source, because the screen is JSX and cannot be loaded here), and PREROLL is between 10 and 20 seconds.
   Sabotage: the pre-roll made a no-op fails 1; the screen's `preroll` removed fails 4. Usage: node tools/verify-preroll.mjs
   ===================================================================== */
import { readFileSync } from "node:fs";
import { TEST_MAPS } from "../src/map/samples.js";
import { worldFor, PREROLL } from "../src/sim/scene.js";
import { poseOf } from "../src/sim/crossing.js";

let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? " ok " : "FAIL"} ${msg}`); if (!ok) failed++; };
const raw = (id) => TEST_MAPS.find((m) => m.id === id).build();
const near = (w, me) => { const p = poseOf(w, me); return w.actors.filter((a) => !a.player && !a.parked && Math.hypot(poseOf(w, a).x - p.x, poseOf(w, a).y - p.y) < 1500).length; };
const make = (id, seed, preroll) => worldFor(seed, 50, 2.0, true, null, raw(id), raw(id).sections?.[0]?.start ?? null, false, false, preroll == null ? {} : { preroll });

console.log("1. IT FILLS THE WINDOW");
{
  const a = make("test-highway-gen-wide", 1, null), b = make("test-highway-gen-wide", 1, 15);
  const n0 = near(a.world, a.me), n1 = near(b.world, b.me);
  check(n0 < 15 && n1 >= 70, `five lanes at 100 cars: ${n0} cars within 1.5 km without it, ${n1} with 15 s (under 15, and at least 70)`);
}
console.log("\n2. IT COSTS NOBODY A CRASH");
for (const id of ["test-highway-gen-wide", "test-highway-gen", "test-loop"]) {
  let any = 0, hit = 0;
  for (let seed = 1; seed <= 8; seed++) { const { world } = make(id, seed, 15), cs = world.crashes ?? []; if (cs.length) any++; if (cs.some((c) => c.a === "player" || c.b === "player")) hit++; }
  check(any === 0 && hit === 0, `${id}: 8 seeds with a 15 s pre-roll, ${any} with a crash, the player hit in ${hit}`);
}
console.log("\n3. IT CHANGES NOTHING ELSEWHERE");
{
  const fp = (w) => JSON.stringify(w.actors.map((x) => [x.id, x.route, Math.round(x.s * 1e3), Math.round(x.v * 1e3)]));
  const a = make("test-1", 3, null), b = make("test-1", 3, 15), c = make("test-highway-gen", 3, 0), d = make("test-highway-gen", 3, null);
  check(!a.world.shape && fp(a.world) === fp(b.world), "test map 1 (it does not ask for shaping): with a pre-roll asked for, the same world, car for car");
  check(fp(c.world) === fp(d.world), "a shaped map with preroll 0: the same world as with none asked for");
}
console.log("\n4. THE SCREEN ASKS FOR IT");
{
  const src = readFileSync(new URL("../src/apps/MapRoad.jsx", import.meta.url), "utf8");
  check(/preroll:\s*PREROLL/.test(src), "sceneFor passes `preroll: PREROLL` in the args (the same args the worker is given)");
  check(PREROLL >= 10 && PREROLL <= 20, `PREROLL is ${PREROLL} s (between 10 and 20: 70-80% of the fill at 10, and about a second of launch time at 20)`);
}
console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
