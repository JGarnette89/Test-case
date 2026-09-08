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
import { chaseOn } from "../src/frame.js";
import {
  TILES, specFor, kerbsideFor, roadsideLifeFor, CHARACTER,
  planDrive, driveFromPlan, runwayNeededFor, composeForTile,
  markableTimeline, pacingOf, DEAD_AIR_CEILING, segmentHazards,
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
      const { scn } = composeForTile(tile, since, (seed * 7919 + i * 104729) >>> 0, {});
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
  console.log(`   note: junctions ALONE cannot meet the ${DEAD_AIR_CEILING}s target -- a leg takes about`);
  console.log("   10s, so a budget with only junctions to spend cannot react faster than one");
  console.log("   arrives. Sections 7 and 8 measure what the roadside adds.");
}

/* ---------- 7. segment hazards, and whether 25s is reachable --------- */
console.log("\n7. THE ROADSIDE IS THE SECOND SOURCE OF EVENTS");
{
  /* Junctions were the only source, and a leg takes about ten seconds, so
     no budget could react faster than a junction arrived. Segment hazards
     are built from the roadside content that already exists -- the same
     roadsideLifeFor that places the people and the same kerbsideFor that
     places the props -- so liveliness and hazard supply are one piece of
     work rather than two systems. */
  const plan = planDrive({ seed: 1, length: 6 });
  const drive = driveFromPlan(plan, { legFor: (spec) => legFor(spec) });
  let hazards = 0, hidden = 0, faults = 0;
  drive.links.forEach((link, i) => {
    const tile = plan[i].tile;
    for (const h of segmentHazards(tile, link, i * 29 + 1, { candidate: { traits: ["wander"] } })) {
      hazards++;
      faults += faultsIn(h.scn).length;
      if (h.blockers.length) hidden++;
    }
  });
  hazards > 0
    ? ok(`the roadside produces ${hazards} hazards on one drive, ${faults} of them markable`)
    : fail("no segment hazard was produced at all");
  hidden === hazards
    ? ok("every one of them has props between the candidate and the person")
    : fail(`${hazards - hidden} hazards had nothing hiding them -- they are scenery, not hazards`);

  /* One source of roadside position, not two. If a second notion of where
     people stand ever appears, this is where it shows. */
  const link = drive.links[0];
  const people = roadsideLifeFor(plan[0].tile, link, 29);
  const hz = segmentHazards(plan[0].tile, link, 29, {});
  const fromPeople = hz.every((h) => people.some((p) => p.id === h.person.id));
  fromPeople
    ? ok("every hazard comes from a person roadsideLifeFor already placed")
    : fail("a hazard appeared somewhere roadsideLifeFor did not put anybody");
}

console.log("\n8. DEAD AIR: IS THE TARGET REACHABLE?");
{
  const measure = (seed, { predictive, segments }) => {
    const plan = planDrive({ seed, length: 8 });
    const drive = driveFromPlan(plan, { legFor: (spec) => legFor(spec) });
    let since = 0; const filled = [];
    for (let i = 0; i < plan.length; i++) {
      const tile = plan[i].tile;
      const legTime = tile.runway / CHARACTER[tile.character].speed + 4;
      const { scn } = composeForTile(tile, since, (seed * 7919 + i * 104729) >>> 0, { legTime: predictive ? legTime : 0 });
      const fs = scn ? faultsIn(scn) : [];
      since = fs.length ? legTime - Math.min(...fs.map((f) => f.from)) : since + legTime;
      const link = drive.links[i];
      filled.push({
        tile, scn,
        hazards: segments && link ? segmentHazards(tile, link, seed * 31 + i, { candidate: { traits: ["wander"] } }) : [],
      });
    }
    return pacingOf(markableTimeline(filled)).worstGap;
  };

  /* Held-out seeds: more than were used while building, so this reports
     what the mechanism does rather than what it was tuned to do. */
  const SEEDS = 24;
  const both = [], onlySeg = [], onlyPred = [], neither = [];
  for (let seed = 1; seed <= SEEDS; seed++) {
    both.push(measure(seed, { predictive: true, segments: true }));
    onlySeg.push(measure(seed, { predictive: false, segments: true }));
    onlyPred.push(measure(seed, { predictive: true, segments: false }));
    neither.push(measure(seed, { predictive: false, segments: false }));
  }
  const stat = (a) => {
    const s = [...a].sort((x, y) => x - y);
    return { worst: s[s.length - 1], median: s[Math.floor(s.length / 2)], avg: a.reduce((x, y) => x + y, 0) / a.length };
  };
  const B = stat(both), S = stat(onlySeg), P = stat(onlyPred), N = stat(neither);
  console.log("\n   configuration            worst   median   average");
  console.log("   " + "-".repeat(52));
  for (const [name, s] of [["neither", N], ["segments only", S], ["predictive only", P], ["both", B]]) {
    console.log(`   ${name.padEnd(22)} ${s.worst.toFixed(1).padStart(6)}s ${s.median.toFixed(1).padStart(7)}s ${s.avg.toFixed(1).padStart(8)}s`);
  }

  /* Neither piece is sufficient alone -- that is the finding, and it is
     what justifies having built both. */
  B.worst < S.worst && B.worst < P.worst
    ? ok(`both pieces are needed: ${N.worst.toFixed(1)}s unaided, ${S.worst.toFixed(1)}s with segments alone, ${P.worst.toFixed(1)}s predictive alone, ${B.worst.toFixed(1)}s together`)
    : fail(`one piece alone matched the pair (${S.worst.toFixed(1)}s / ${P.worst.toFixed(1)}s vs ${B.worst.toFixed(1)}s)`);

  B.median < DEAD_AIR_CEILING
    ? ok(`a typical drive now meets the ${DEAD_AIR_CEILING}s target (median ${B.median.toFixed(1)}s, average ${B.avg.toFixed(1)}s)`)
    : fail(
        `the median drive is ${B.median.toFixed(1)}s of dead air, over the ${DEAD_AIR_CEILING}s target.
` +
        `        DO NOT LOWER DEAD_AIR_CEILING. It is a claim about a player's attention,
` +
        `        not a knob for making this pass. If dead air is too long the answer is MORE
` +
        `        TO LOOK AT -- opening the generator to marginal windows took the worst drive
` +
        `        from 39.7s to 22.2s and 6 drives over the target to 0. See DECISIONS.md 8.3.`);

  /* The hard requirement, as opposed to the target. */
  const over = both.filter((g) => g > 90).length;
  over === 0
    ? ok(`and no drive of ${SEEDS} breaches the 90s failure condition (worst ${B.worst.toFixed(1)}s)`)
    : fail(`${over} drive(s) went over 90s with nothing to mark`);

  const missed = both.filter((g) => g > DEAD_AIR_CEILING).length;
  console.log(`   note: ${missed} of ${SEEDS} drives still exceed the ${DEAD_AIR_CEILING}s target, worst ${B.worst.toFixed(1)}s.`);
  console.log("   The target is reachable typically but not guaranteed: a stretch of");
  console.log("   arterial has activity 0.15 and SHOULD be quiet, so the remaining");
  console.log("   gaps are on roads where dead air is the correct answer.");
}

console.log("\n9. THE DRIVE IS CONTINUOUS TO WATCH, NOT ONLY TO ROUTE");
{
  /* THE THIRD BLIND SPOT, MADE MEASURABLE. Every check in this file
     passed while the drive played as a slideshow: the maintainer's words
     were "it's a series of very quick scenes that don't meaningfully
     connect to each other." Culling was right, pacing was right, route
     continuity was right -- and nobody had asked whether the VIEW moves
     or cuts, because "is the drive continuous" had only ever been
     answered about the route.

     Measured before the fix: the camera jumped 60-90m at every boundary,
     the candidate teleported 70-90m onto new ground, and 0 of 35-58
     scenery items survived. Nothing at all persisted.

     So this asks the felt question in the only form a number can take:
     between two frames a fifth of a second apart, the view may not move
     further than a car could have driven. */
  const { drive } = worldOf("res-quiet", 6);
  const end = drive.exits[drive.exits.length - 1];
  const STEP_T = 0.2;
  const v = drive.speed;
  const allow = v * STEP_T * 3;             // generous: 3x the distance travelled

  let worst = 0, worstAt = null, worstRot = 0, samples = 0;
  let prev = null;
  for (let t = 0; t <= end; t += STEP_T) {
    const p = candidateAt(drive, t);
    if (!p || !Number.isFinite(p.x)) continue;
    const cam = chaseOn(p, v, { lookAhead: 6 });
    samples++;
    if (prev) {
      const d = Math.hypot(cam.cx - prev.cx, cam.cy - prev.cy);
      const dr = Math.abs(((cam.rotate - prev.rotate + 540) % 360) - 180);
      if (d > worst) { worst = d; worstAt = t; }
      worstRot = Math.max(worstRot, dr);
    }
    prev = cam;
  }
  console.log(`   ${samples} frames over ${end.toFixed(0)}s; worst view step ${m(worst)}m at t=${worstAt?.toFixed(1)}s, worst turn ${worstRot.toFixed(0)} deg`);
  worst <= allow
    ? ok(`the view never cuts: worst step ${m(worst)}m against ${m(allow)}m of travel -- a boundary is a place you drive to, not a scene change`)
    : fail(
        `the view jumps ${m(worst)}m at t=${worstAt?.toFixed(1)}s, which is a CUT rather than a movement.` + String.fromCharCode(10) +
        `        A cut is the single most destructive thing for a sense of place: the` + String.fromCharCode(10) +
        `        maintainer played a version that jumped 60-90m at every junction and` + String.fromCharCode(10) +
        `        reported "a series of very quick scenes that don't meaningfully connect".` + String.fromCharCode(10) +
        `        Every other check in this file passed throughout. See DECISIONS.md 10.2.`
      );

  /* And the candidate has to actually TRAVEL between junctions rather
     than appearing at the next one. */
  let onLink = 0, atJunction = 0;
  for (let t = 0; t <= end; t += STEP_T) {
    const p = candidateAt(drive, t);
    if (p?.phase === "link") onLink += STEP_T; else atJunction += STEP_T;
  }
  onLink > 0
    ? ok(`and ${onLink.toFixed(0)}s of the ${end.toFixed(0)}s drive is spent driving BETWEEN junctions (${(100 * onLink / end).toFixed(0)}%), which used to be an instant jump`)
    : fail("the candidate never travels between junctions -- every boundary is still a teleport");

  /* Every junction reached, in order, once. */
  const seen = [];
  for (let t = 0; t <= end; t += STEP_T) {
    const j = candidateAt(drive, t)?.junction;
    if (j != null && j !== seen[seen.length - 1]) seen.push(j);
  }
  const ordered = seen.every((j, k) => j === k) && seen.length === drive.legs.length;
  ordered
    ? ok(`and the drive visits all ${seen.length} junctions in order, each exactly once`)
    : fail(`junction order is ${seen.join(",")}, which is not a drive through ${drive.legs.length} of them`);
}

console.log("\n" + "=".repeat(70));
console.log(problems === 0 ? "OK: culling, routes, pacing and segment hazards all measured." : `${problems} PROBLEM(S) FOUND.`);
process.exit(problems === 0 ? 0 : 1);
