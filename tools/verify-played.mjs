/* =====================================================================
   THE PLAYED WORLD IS WHAT A CHECK GETS (14 November). 37 of 52 checks built
   `seedGraph`'s bare defaults -- no walkers, no rivals, no brake reaction --
   a world nobody drives, and passed against it. Now:

     1. `playedGraph` (what checks build) and `worldFor` (what the page and
        the worker build) give the same world: the same cars in the same
        places after 400 ticks, on two maps. Stated against the screen's own
        builder, not against the constants `playedGraph` reads, so a changed
        constant cannot make both sides agree.
     2. The four things that make it the played world are visibly on: the
        world carries brake reaction, speeds are posted, and there are
        walkers and rivals in it.
     3. THE BURDEN IS ON THE EXCEPTION: a check or a helper under tools/lib
        that names `seedGraph` (the bare world) carries a `BARE WORLD:` line
        saying why. One that does not is a check that quietly stopped testing
        what is shipped.
   Sabotage: PLAYED.walkers = false fails 1 and 2; a check importing seedGraph
   with no marker fails 3. Usage: node tools/verify-played.mjs
   ===================================================================== */
import { readFileSync, readdirSync } from "node:fs";
import { loadMap } from "../src/map/load.js";
import { TEST_MAPS } from "../src/map/samples.js";
import { playedGraph, step } from "../src/sim/crossing.js";
import { worldFor } from "../src/sim/scene.js";

let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? " ok " : "FAIL"} ${msg}`); if (!ok) failed++; };

const fingerprint = (w) => JSON.stringify([w.actors.map((a) => [a.id, Math.round(a.s * 1000), Math.round((a.v ?? 0) * 1000)]), (w.people ?? w.walkers ?? []).length]);

for (const id of ["test-1", "test-loop"]) {
  const map = () => loadMap(TEST_MAPS.find((m) => m.id === id).build());
  console.log(`\n${id}`);
  let a = playedGraph(3, 50, map(), { every: 2.0, target: 60 });
  let b = worldFor(3, 50, 2.0, false, 60, TEST_MAPS.find((m) => m.id === id).build()).world;
  check(a.brakeReaction === true && b.brakeReaction === true, "both worlds carry brake reaction");
  check(a.road.posted === true && b.road.posted === true, "both worlds have posted speeds");
  check(!!(a.rivals ?? a.rival) === !!(b.rivals ?? b.rival), "rivals present in both or neither");
  const wa = !!(a.walkers ?? a.people ?? a.walk), wb = !!(b.walkers ?? b.people ?? b.walk);
  check(wa === wb, `walkers present in both or neither (${wa}/${wb})`);
  let same = fingerprint(a) === fingerprint(b);
  for (let i = 0; i < 400 && same; i++) { a = step(a); b = step(b); same = fingerprint(a) === fingerprint(b); if (!same) check(false, `worlds diverge at tick ${i + 1}`); }
  if (same) check(true, "the check's world and the page's world are the same 400 ticks");
}

console.log("\n3. the bare world needs a reason");
{
  const files = [...readdirSync("tools").filter((f) => /^verify-.*\.mjs$/.test(f)).map((f) => `tools/${f}`), ...readdirSync("tools/lib").filter((f) => f.endsWith(".mjs")).map((f) => `tools/lib/${f}`)];
  const bare = [];
  for (const f of files) {
    if (f.endsWith("verify-played.mjs")) continue;
    const t = readFileSync(f, "utf8");
    if (/\bseedGraph\b/.test(t) && !/BARE WORLD:/.test(t)) bare.push(f);
    /* A PARTIAL EXCEPTION IS AN EXCEPTION TOO (17 Nov, DECISIONS 10.115): a played-world check that switches one mechanism off (`brakeReaction: false`, `rivals: false`, `walkers: false`) says which and why on a BARE WORLD: line. */
    if (/\b(brakeReaction|rivals|walkers):\s*false\b/.test(t) && !/BARE WORLD:/.test(t)) bare.push(f);
  }
  check(bare.length === 0, bare.length ? `built the bare world with no BARE WORLD: reason: ${bare.join(", ")}` : `every one of ${files.length} checks and helpers builds the played world or says why not`);
}
console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
