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
  /* VEHICLES: a heedless person stepping in front of a car is a strike the
     design allows -- everybody struck took a risk -- and verify-peds owns it;
     counted here it failed this check on a timing change elsewhere (8 October). */
  const cars = (w.crashes ?? []).filter((c) => !String(c.a).startsWith("ped-") && !String(c.b).startsWith("ped-"));
  check(cars.length === 0, `the default city, perception off, two minutes at 200 cars: ${cars.length} crashes between vehicles (${(w.crashes ?? []).length - cars.length} people struck, verify-peds' business)`);
}

console.log("\n5. A WORLD'S CRASH LIST BEGINS WITH ITS CLOCK (12 November, DECISIONS 10.70)");
{
  /* THE KNOWN CASE: the endless loop at 260 cars, seed 3, in the played configuration, has two cars crash DURING THE WARM-UP on the on-7 slip road (a queue of 17 stands behind them). `warmed` put the clock back
     to zero and left the crash list as it was, so every probe counting `w.crashes` counted a crash from before its own window, with a time in the world's future, and the screen could open on a crash the
     player never saw. The list begins empty; the wreck stays, as an actor. [instrument: the case is a measured one, found by describing each crash, tools/measure/warmup-crashes.mjs] */
  const loop = loadMap(TEST_MAPS.find((t) => t.id === "test-loop").build());
  let w = seedGraph(3, 50, loop, { target: 260, posted: true, brakeReaction: true, walkers: true, rivals: true });
  check((w.crashes ?? []).length === 0, `a world opens with no crash in its list, though the warm-up crashed two cars: ${(w.crashes ?? []).length} logged at t = ${w.t}`);
  for (let i = 0; i < 5 / DT; i++) w = step(w);
  check((w.crashes ?? []).every((c) => c.t >= 0 && c.t <= w.t + 1e-9), `and every crash logged lies inside the clock that is running: ${(w.crashes ?? []).length} logged, latest at ${(w.crashes ?? []).reduce((m, c) => Math.max(m, c.t), 0).toFixed(2)} s of ${w.t.toFixed(2)}`);
}

console.log("\n6. A WORLD OPENS CLEAR OF THE WARM-UP'S WRECKS (12 November, DECISIONS 10.70; the maintainer's call, flagged for Jay)");
{
  /* THE KNOWN CASES, measured by counting crashed cars standing at t = 0 (tools/measure/warmup-wrecks.mjs): on the loop at 300 cars, played, seeds 3, 8 and 17 each had two or more wrecks standing
     when the clock started (8 of 50 seeds do); a player opened on a wreck and a queue they had nothing to do with. The warm-up runs the ordinary traffic for about 109 s, crashes included, and the
     wrecks of the last 45 s used to stand into the world (and for longer than designed: `crash.t` was left on the warm-up's clock, so a wreck from the warm-up's 99th second stood until the run's 144th). The warm-up's
     crashes are cleared when it ends -- towed, the same as CRASH_CLEAR does later -- so the queue behind them moves. A crash AFTER the clock starts is untouched (section 1), and people are not
     cars: a struck person is stored apart (`peds`, state "struck") and the clearing filters `actors` only, so it is untouched BY CONSTRUCTION; NOT TESTED HERE, because no map or seed with a person lying at t = 0 is known (the loop has no crosswalks). [Jay: the call is the maintainer's, an artefact against content; the three seeds are measured cases] */
  const loop = loadMap(TEST_MAPS.find((t) => t.id === "test-loop").build());
  for (const seed of [3, 8, 17]) {
    const w = seedGraph(seed, 50, loop, { target: 300, posted: true, brakeReaction: true, walkers: true, rivals: true });
    const wrecks = w.actors.filter((x) => x.crash).length;
    check(wrecks === 0, `loop seed ${seed} at 300 cars opens with no wreck standing: ${wrecks} crashed cars at t = 0 (each had two or more before)`);
  }
}

console.log(`\n${"=".repeat(70)}`);
console.log(failed ? `${failed} FAILURE(S)` : "OK: contact is a crash that stops both cars, is logged, stands and is cleared; no two cars overlap unless it is a recorded crash; the player's contact crashes the other car; and traffic that never crashed still does not.");
process.exit(failed ? 1 : 0);
