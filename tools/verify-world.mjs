/* The world layer: culling, routes and pacing.
 *
 * Culling is only ever safe if it is invisible — culled and unculled must
 * agree EXACTLY for anything inside the frame, or the scorer and the
 * screen part company and the fairness constraint the whole examiner
 * redesign rests on is broken quietly.
 *
 * The reach is derived from the frame rather than declared as a constant,
 * for the reason this stage keeps relearning: a second number that has to
 * track the first is a proxy, and proxies drift silently. So this file
 * checks the derivation as well as the result.
 */
import { simulate, poseAt, M, W } from "../src/engine/index.js";
import {
  whatEgoSees, visibility, eyePoint, reachOf, withinReach, sightBlockersOf,
} from "../src/engine/sight.js";
import { driveThroughTiles, runwayFor, candidateAt } from "../src/engine/world.js";
import { TILES, specFor, kerbsideFor, roadsideLifeFor, CHARACTER } from "../src/engine/tiles.js";
import { frameAround } from "../src/frame.js";
import { SCENARIOS } from "../src/engine/scenarios.js";

const m = (px) => Math.round((px / 20) * 10) / 10;
let problems = 0;
const ok = (s) => console.log(`  ok   ${s}`);
const fail = (s) => { problems++; console.log(`  FAIL: ${s}`); };

const base = SCENARIOS.find((s) => s.id === "opposite");
const legFor = (spec) => ({
  ...base, road: spec,
  ego: { ...base.ego, departAt: simulate({ ...base, road: spec }).legalAt },
});
const withSpec = (t) => ({ ...t, spec: specFor(t.character) });

/* A drive with real roadside content on it, which is what makes culling
   necessary in the first place. */
function worldOf(tileId, n = 10) {
  const tile = withSpec(TILES.find((t) => t.id === tileId));
  const tiles = Array.from({ length: n }, () => tile);
  const drive = driveThroughTiles({ tiles, legs: tiles.map(() => legFor(tile.spec)) });
  const blockers = [];
  drive.links.forEach((link, i) => {
    for (const b of kerbsideFor(tile, link, i * 13 + 1)) {
      blockers.push({ p: { id: b.id, kind: "static" }, pose: { x: b.x, y: b.y, rot: b.rot }, hl: b.hl, hw: b.hw });
    }
  });
  return { tile, drive, blockers };
}

/* ---------- 1. culling is invisible ---------------------------------- */
console.log("1. CULLED AND UNCULLED AGREE, EXACTLY");
{
  const { tile, drive, blockers } = worldOf("res-busy", 10);
  const speed = CHARACTER[tile.character].speed;
  let compared = 0, disagreed = 0, culledTotal = 0, keptTotal = 0;

  for (let i = 0; i < drive.links.length; i++) {
    const link = drive.links[i];
    for (let k = 0.1; k <= 0.9; k += 0.1) {
      const eye = { x: link.from.x + (link.to.x - link.from.x) * k, y: link.from.y + (link.to.y - link.from.y) * k };
      const pose = { ...eye, rot: (Math.atan2(link.to.y - link.from.y, link.to.x - link.from.x) * 180) / Math.PI };
      const view = frameAround(pose, speed, { lookAhead: 4 });
      const reach = reachOf(eye, view, W);
      const near = withinReach(eye, reach, blockers);
      culledTotal += blockers.length - near.length;
      keptTotal += near.length;

      /* Targets across the whole frame, including its corners — the
         hardest place for a cull to be correct. */
      const half = (view.scale * W) / 2;
      for (let dx = -1; dx <= 1; dx += 0.5) {
        for (let dy = -1; dy <= 1; dy += 0.5) {
          const target = { x: view.cx + dx * half, y: view.cy + dy * half, rot: 0 };
          const full = visibility(eye, { kind: "car" }, target, blockers);
          const cut = visibility(eye, { kind: "car" }, target, near);
          compared++;
          if (full !== cut) {
            disagreed++;
            if (disagreed <= 3) fail(`disagreement at (${m(target.x)},${m(target.y)}): full=${full} culled=${cut}`);
          }
        }
      }
    }
  }
  disagreed === 0
    ? ok(`${compared} sightlines across whole frames: culled agrees with unculled every time`)
    : null;
  ok(`and it removed ${((culledTotal / (culledTotal + keptTotal)) * 100).toFixed(0)}% of the blockers doing it`);
}

/* ---------- 2. the reach is derived, and safe at the edge ------------ */
console.log("\n2. THE REACH COMES FROM THE FRAME, AND KEEPS WHAT STRADDLES IT");
{
  const { tile, drive } = worldOf("res-busy", 4);
  const speed = CHARACTER[tile.character].speed;
  const link = drive.links[0];
  const eye = { x: link.from.x, y: link.from.y };
  const pose = { ...eye, rot: -90 };

  /* A wider frame must never see less far. If reach stopped tracking the
     frame, this is where it would show. */
  let rising = true, prev = 0;
  const reaches = [];
  for (const la of [2, 4, 6, 10]) {
    const r = reachOf(eye, frameAround(pose, speed, { lookAhead: la }), W);
    reaches.push(`${la}s ${m(r)}m`);
    if (r <= prev) rising = false;
    prev = r;
  }
  rising
    ? ok(`reach tracks the frame: ${reaches.join(", ")}`)
    : fail(`reach did not grow with the frame: ${reaches.join(", ")}`);

  /* A big object sitting astride the boundary must be kept, because part
     of it is inside. Culling on the centre alone would drop a long wall
     that still blocks the view. */
  const view = frameAround(pose, speed, { lookAhead: 4 });
  const reach = reachOf(eye, view, W);
  const wall = {
    p: { id: "wall", kind: "static" },
    pose: { x: eye.x, y: eye.y - reach - M(3), rot: 90 },
    hl: M(6), hw: M(0.3),
  };
  withinReach(eye, reach, [wall]).length === 1
    ? ok("an object straddling the boundary is kept, not culled on its centre")
    : fail("a long object across the reach boundary was culled away");

  const far = {
    p: { id: "far", kind: "static" },
    pose: { x: eye.x, y: eye.y - reach - M(40), rot: 90 },
    hl: M(2), hw: M(0.9),
  };
  withinReach(eye, reach, [far]).length === 0
    ? ok("and something genuinely out of range is dropped")
    : fail("an out-of-range object survived the cull");
}

/* ---------- 3. it is worth doing ------------------------------------- */
console.log("\n3. AND IT IS WORTH DOING");
{
  const { tile, drive, blockers } = worldOf("res-busy", 12);
  const speed = CHARACTER[tile.character].speed;
  const link = drive.links[Math.floor(drive.links.length / 2)];
  const eye = { x: link.from.x, y: link.from.y };
  const pose = { ...eye, rot: -90 };
  const view = frameAround(pose, speed, { lookAhead: 4 });
  const near = withinReach(eye, reachOf(eye, view, W), blockers);
  const target = { x: view.cx, y: view.cy, rot: 0 };

  const time = (bs) => {
    for (let i = 0; i < 500; i++) visibility(eye, { kind: "car" }, target, bs);
    const t0 = process.hrtime.bigint();
    for (let i = 0; i < 3000; i++) visibility(eye, { kind: "car" }, target, bs);
    return Number(process.hrtime.bigint() - t0) / 1e6 / 3000;
  };
  const full = time(blockers), cut = time(near);
  console.log(`\n   ${blockers.length} blockers in the world, ${near.length} within reach`);
  console.log(`   visibility(): ${full.toFixed(4)}ms full, ${cut.toFixed(4)}ms culled`);
  cut < full
    ? ok(`culling is ${(full / cut).toFixed(1)}x cheaper per sightline at world density`)
    : fail(`culling was not cheaper (${full} vs ${cut})`);
}

/* ---------- 4. nothing that omits reach changed ---------------------- */
console.log("\n4. OMITTING THE REACH LEAVES EVERYTHING AS IT WAS");
{
  /* Culling is opt-in precisely so the driver game and its checks are
     untouched. If the default ever starts culling, this fails. */
  const scn = SCENARIOS.find((s) => s.id === "unprotected");
  const sim = simulate(scn);
  const statics = sightBlockersOf(scn);
  let same = 0, differ = 0;
  for (let t = 0; t <= 6; t += 0.1) {
    const a = JSON.stringify(whatEgoSees(sim, t, 0, statics));
    const b = JSON.stringify(whatEgoSees(sim, t, 0, statics, {}));
    a === b ? same++ : differ++;
  }
  differ === 0
    ? ok(`whatEgoSees without a reach is identical across ${same} samples`)
    : fail(`${differ} samples changed when no reach was given`);
}

console.log("\n" + "=".repeat(70));
console.log(problems === 0 ? "OK: culling is invisible, derived and worth doing." : `${problems} PROBLEM(S) FOUND.`);
process.exit(problems === 0 ? 0 : 1);
