/* =====================================================================
   WHEN TWO CARS COLLIDE (DECISIONS.md 5.12: a state the sim can produce
   and the screen cannot show is a lie about what happened).

     1. Contact is a crash: both cars stop where they hit, the world logs
        it once with where it happened, and it stands in the road until
        CRASH_CLEAR, then is cleared.
     2. THE INVARIANT: no two cars ever overlap unless they are a recorded
        crash -- in the traffic where crashes actually happen (everybody
        perceiving late), not only in traffic that never crashes.
     3. The car the player hits has crashed too.
     4. Traffic that never crashed before still never does: the default
        world, perception off, logs nothing.
   ===================================================================== */
import { loadMap } from "../src/map/load.js";
import { TEST_MAPS } from "../src/map/samples.js";
import { seedGraph, step, overlapping, crashWith, poseOf, CRASH_CLEAR, DT } from "../src/sim/crossing.js";

let failed = 0;
const check = (ok, msg) => { console.log(`  ${ok ? "ok  " : "FAIL:"} ${msg}`); if (!ok) failed++; };
const t1 = loadMap(TEST_MAPS.find((t) => t.id === "test-1").build());
const city = loadMap(TEST_MAPS.find((t) => t.id === "city").build());

console.log("\n1. CONTACT IS A CRASH, AND IT IS SEEN THROUGH");
{
  /* Two cars put in the same place: the next step must crash them. */
  let w = seedGraph(1, 50, t1, { target: 60, posted: true });
  const a = w.actors.find((x) => !x.player && (x.v ?? 0) > 3);
  const clone = { ...a, id: "clone", n: 99999 };
  w = { ...w, actors: [...w.actors, clone] };
  w = step(w);
  const A = w.actors.find((x) => x.id === a.id), B = w.actors.find((x) => x.id === "clone");
  check(A?.crash && B?.crash && A.v === 0 && B.v === 0 && A.crash.with === "clone", "two cars in one place: both crashed, both stopped where they hit");
  check((w.crashes ?? []).filter((c) => [c.a, c.b].includes("clone")).length === 1 && Number.isFinite(w.crashes.at(-1).at.x), "logged once, with where it happened");
  const where = poseOf(w, A);
  let still = true, gone = null;
  for (let i = 0; i < (CRASH_CLEAR + 2) / DT; i++) {
    w = step(w);
    const now = w.actors.find((x) => x.id === a.id);
    if (!now) { gone = w.t; break; }
    const p = poseOf(w, now);
    if (Math.hypot(p.x - where.x, p.y - where.y) > 0.01 || now.v !== 0) still = false;
  }
  check(still && gone != null && Math.abs(gone - (A.crash.t + CRASH_CLEAR)) < 0.2, `it stands exactly where it hit until cleared, ${CRASH_CLEAR} s later`);
  check((w.crashes ?? []).filter((c) => [c.a, c.b].includes("clone")).length === 1, "and it is not logged again while it stands there");
}

console.log("\n2. NO TWO CARS EVER OVERLAP UNLESS THEY ARE A RECORDED CRASH");
{
  /* Where crashes happen: everybody perceiving the world late (the
     observation axis switched on for all), heavy traffic, both maps. */
  let natural = 0, silent = 0;
  for (const [name, loaded, cars] of [["test map 1", t1, 150], ["the city", city, 250]]) {
    let w = seedGraph(3, 50, loaded, { target: cars, posted: true, perceive: true });
    for (let i = 0; i < 3 * 60 / DT; i++) {
      w = step(w);
      if (i % 5) continue;
      const byId = new Map(w.actors.map((x) => [x.id, x]));
      for (const o of overlapping(w)) if (!(byId.get(o.a)?.crash && byId.get(o.b)?.crash)) silent++;
    }
    natural += (w.crashes ?? []).length;
    console.log(`       ${name}: ${(w.crashes ?? []).length} crashes in three minutes with everybody perceiving late`);
  }
  check(silent === 0, `every overlap is a recorded crash (${silent} silent) -- across ${natural} crashes that happened on their own`);
}

console.log("\n3. THE CAR THE PLAYER HITS HAS CRASHED TOO");
{
  let w = seedGraph(1, 50, t1, { target: 40, posted: true });
  const a = w.actors.find((x) => !x.player);
  w = crashWith(w, a.id, { x: 0, y: 0, z: 0 });
  const now = w.actors.find((x) => x.id === a.id);
  check(now.crash?.with === "player" && now.v === 0 && w.crashes.at(-1).a === "player", "it stops, and the crash is logged against the player");
}

console.log("\n4. TRAFFIC THAT NEVER CRASHED STILL DOES NOT");
{
  let w = seedGraph(1, 50, city, { target: 200, posted: true });
  for (let i = 0; i < 2 * 60 / DT; i++) w = step(w);
  check((w.crashes ?? []).length === 0, `the default city, perception off, two minutes at 200 cars: ${(w.crashes ?? []).length} crashes`);
}

console.log(`\n${"=".repeat(70)}`);
console.log(failed ? `${failed} FAILURE(S)` : "OK: contact is a crash that stops both cars, is logged, stands and is cleared; no two cars overlap unless it is a recorded crash; the player's contact crashes the other car; and traffic that never crashed still does not.");
process.exit(failed ? 1 : 0);
