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
import {
  TILES, specFor, kerbsideFor, roadsideLifeFor, CHARACTER,
  planDrive, driveFromPlan, runwayNeededFor, composeForTile,
  markableTimeline, pacingOf, DEAD_AIR_CEILING,
} from "../src/engine/tiles.js";
import { composeScenario } from "../src/engine/compose.js";
import { faultsIn } from "../src/engine/faults.js";
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

/* ---------- 5. routes are directable, and present decisions ---------- */
console.log("\n5. EVERY PLANNED ROUTE IS DIRECTABLE, AND ASKS FOR DECISIONS");
{
  let short = 0, straightOnly = 0, routes = 0, junctions = 0;
  const characters = new Set();
  for (let seed = 1; seed <= 25; seed++) {
    const plan = planDrive({ seed, length: 6 });
    const drive = driveFromPlan(plan, { legFor: (spec) => legFor(spec) });
    routes++;
    for (const p of plan) characters.add(p.tile.character);

    for (let i = 1; i < drive.legs.length; i++) {
      junctions++;
      const delivered = runwayFor(drive, i);
      const needed = runwayNeededFor(plan[i].tile.character);
      if (delivered + M(0.6) < needed) {
        short++;
        if (short <= 3) fail(`seed ${seed} junction ${i} (${plan[i].tile.character}): ${m(delivered)}m runway, needs ${m(needed)}m`);
      }
    }
    /* Silence means straight on, so a route of nothing but straight-ahead
       junctions never asks the examiner for an instruction at all and the
       directing task quietly disappears. */
    if (!plan.slice(0, -1).some((p) => p.intent !== "straight")) straightOnly++;
  }
  short === 0
    ? ok(`all ${junctions} junctions across ${routes} routes deliver the runway their character needs`)
    : null;
  straightOnly === 0
    ? ok("every route turns somewhere, so the directing task always has something to ask")
    : fail(`${straightOnly} of ${routes} routes are straight through, asking for no instruction`);
  characters.size > 1
    ? ok(`routes mix road character (${[...characters].join(", ")}), so difficulty changes kind along a drive`)
    : fail("every route is one kind of road");
}

/* ---------- 6. pacing: supply exists, and steering improves it ------- */
console.log("\n6. THE DRIVE KEEPS OFFERING SOMETHING TO MARK");
{
  /* The regression that made this necessary: compose.js attached no driver
     traits at all, so a generated drive offered ZERO faults and the world
     failed at the one job it exists for. */
  let anyFault = 0, tries = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const scn = composeScenario({ traffic: "busy", visibility: "open" }, seed * 7919);
    if (!scn) continue;
    tries++;
    if (faultsIn(scn).length) anyFault++;
  }
  anyFault > 0
    ? ok(`generated junctions produce markable behaviour (${anyFault} of ${tries} draws)`)
    : fail("no generated junction produced a derivable fault -- the world offers nothing to assess");

  console.log("\n   seed   unsteered   steered   events   empty");
  console.log("   " + "-".repeat(50));
  const plainGaps = [], fedGaps = [];
  let empties = 0;
  for (let seed = 1; seed <= 6; seed++) {
    const plan = planDrive({ seed, length: 8 });
    const plain = plan.map((p, i) => ({
      tile: p.tile,
      scn: composeScenario(CHARACTER[p.tile.character].brief, (seed * 7919 + i * 104729) >>> 0),
    }));
    const pp = pacingOf(markableTimeline(plain));

    let since = 0; const fed = []; let e = 0;
    for (let i = 0; i < plan.length; i++) {
      const tile = plan[i].tile;
      const { scn } = composeForTile(tile, since, (seed * 7919 + i * 104729) >>> 0);
      if (!scn) e++;
      const legTime = tile.runway / CHARACTER[tile.character].speed + 4;
      const fs = scn ? faultsIn(scn) : [];
      since = fs.length ? legTime - Math.min(...fs.map((f) => f.from)) : since + legTime;
      fed.push({ tile, scn });
    }
    const fp = pacingOf(markableTimeline(fed));
    plainGaps.push(pp.worstGap); fedGaps.push(fp.worstGap); empties += e;
    console.log(
      `   ${String(seed).padStart(4)}   ${pp.worstGap.toFixed(1).padStart(8)}s ${fp.worstGap.toFixed(1).padStart(8)}s ` +
      `${String(fp.count).padStart(7)} ${String(e).padStart(6)}`
    );
  }
  const worstPlain = Math.max(...plainGaps), worstFed = Math.max(...fedGaps);
  empties === 0
    ? ok("the fallback ladder means no junction is ever left empty")
    : fail(`${empties} junction(s) came back with nothing at all`);
  worstFed < worstPlain
    ? ok(`steering cuts the worst dead stretch from ${worstPlain.toFixed(1)}s to ${worstFed.toFixed(1)}s`)
    : fail(`steering did not improve the worst dead stretch (${worstPlain.toFixed(1)}s vs ${worstFed.toFixed(1)}s)`);
  worstFed < 90
    ? ok(`and stays inside the design's 90s failure condition (worst ${worstFed.toFixed(1)}s)`)
    : fail(`a drive went ${worstFed.toFixed(1)}s with nothing to mark`);
  console.log(`   note: the ${DEAD_AIR_CEILING}s target is NOT met. Junctions are still the only`);
  console.log("   source of events and a leg takes about 10s, so the budget cannot react");
  console.log("   faster than a junction arrives. Segment hazards are the next piece.");
}

console.log("\n" + "=".repeat(70));
console.log(problems === 0 ? "OK: culling, routes and pacing all measured." : `${problems} PROBLEM(S) FOUND.`);
process.exit(problems === 0 ? 0 : 1);
