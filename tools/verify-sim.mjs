/* Stage 0 of the rebuild: one road, cars that follow each other.
 *
 * DELIBERATELY ALMOST EMPTY. REBUILD.md section 6 says stage 0 has "no
 * tests beyond nobody overlaps", and that is not laziness -- it is the
 * protection against the specific way a rebuild fails. The current
 * codebase is 28 green checks over a game the maintainer says is not a
 * game; a rebuild that leads with a test suite reproduces exactly that.
 *
 * So there is one property here, and it is the one whose absence
 * produced every structural defect in the old foundation: NO TWO ACTORS
 * EVER OCCUPY THE SAME PIECE OF ROAD. It is impossible to satisfy by
 * accident. If it ever needs weakening, the old architecture is growing
 * back -- see REBUILD.md section 7.1.
 *
 * The other two checks are about the loop rather than the traffic, and
 * they are here because both are things that cannot be retrofitted:
 * determinism, and agreeing with the old engine about how big a metre
 * is while the two exist side by side.
 */
import { M as engineM } from "../src/engine/index.js";
import {
  seedTraffic, step, run, overlapping, perceive, wantedGap, roadFor,
  cautionOf as simCaution,
  ROAD, CAR, DT, M, PX_PER_M, ON_SCREEN,
} from "../src/sim/traffic.js";
import { composeDriver } from "../src/engine/ratings.js";
import { cautionOf as engineCaution } from "../src/engine/awareness.js";
import { readFileSync } from "node:fs";

let problems = 0;
const ok = (s) => console.log(`  ok   ${s}`);
const fail = (s) => { problems++; console.log(`  FAIL: ${s}`); };

console.log("\n" + "=".repeat(70));
console.log("SIM STAGE 0: one road, cars that follow each other");
console.log("=".repeat(70));

const SEEDS = 20, MINUTES = 2;
const TICKS = Math.round((MINUTES * 60) / DT);

console.log("\n1. NOBODY EVER OCCUPIES THE SAME PIECE OF ROAD");
{
  let worst = null, checked = 0;
  for (let seed = 1; seed <= SEEDS; seed++) {
    let w = seedTraffic(seed);
    for (let i = 0; i < TICKS; i++) {
      w = step(w);
      checked++;
      const bad = overlapping(w);
      if (bad.length && (!worst || bad[0].overlap > worst.overlap)) {
        worst = { ...bad[0], seed, tick: w.tick };
      }
    }
  }
  worst === null
    ? ok(`${SEEDS} seeds, ${MINUTES} minutes each, ${checked.toLocaleString()} ticks: no two cars ever overlap`)
    : fail(
        `${worst.a} and ${worst.b} overlap by ${worst.overlap.toFixed(2)}m ` +
        `on seed ${worst.seed} at tick ${worst.tick}.\n` +
        "        This is the one property stage 0 has to have. In the old engine\n" +
        "        every road user's motion was resolved before the drive began and\n" +
        "        nobody read anybody else while moving, which is why cars drove\n" +
        "        through each other in 63% of drives. DO NOT WEAKEN THIS CHECK to\n" +
        "        make a following model pass -- fix the following model. See\n" +
        "        REBUILD.md section 7.1."
      );

  /* AND SOMEBODY ACTUALLY HAS TO FOLLOW SOMEBODY, or the check above is
     passing on cars that never met.

     Asked against the gap the DRIVER wanted rather than against a
     distance chosen here. A car sitting at its own desired following
     distance is following; one at three times that is on an open road.
     A fixed metre threshold would be a second opinion about what close
     means, and it would move every time the speeds did -- which it did:
     the first version of this check asserted "under 6m" and then failed
     at 8.91m, which turned out to be a car holding its target headway
     exactly. The traffic was right and the check was wrong. */
  let tightest = Infinity, closest = Infinity, followed = 0, samples = 0;
  let w = seedTraffic(1);
  for (let i = 0; i < TICKS; i++) {
    w = step(w);
    for (const me of w.actors) {
      const view = perceive(me, w);
      if (!view.leader) continue;
      samples++;
      const ratio = view.gap / Math.max(0.1, wantedGap(me, view.leader));
      if (ratio < tightest) tightest = ratio;
      if (ratio < 1.25) followed++;
      closest = Math.min(closest, view.gap);
    }
  }
  const share = samples ? followed / samples : 0;
  tightest <= 1.25 && share > 0.05
    ? ok(`somebody is genuinely following somebody: ${(100 * share).toFixed(0)}% of the time a car has anyone in front, it is inside 1.25x the gap it wants (tightest ${tightest.toFixed(2)}x, ${closest.toFixed(1)}m)`)
    : fail([
        `no car ever came within 1.25x of its own desired following distance`,
        `(tightest ${tightest.toFixed(2)}x, ${(100 * share).toFixed(0)}% of samples).`,
        `Either the road is too empty for anybody to catch anybody, or the`,
        `following model is holding a gap nobody would hold. Stage 0 exists to`,
        `show cars interacting, and traffic that never interacts shows nothing.`,
      ].join(" "));
}

console.log("\n2. THE SAME SEED REPLAYS EXACTLY");
{
  /* Determinism is a property of a fixed timestep with seeded decisions,
     not of motion being a closed-form function -- which was the standing
     objection to a rebuild and was wrong. It matters from the first
     stage because the golden becomes a recorded TRACE, and because
     retrofitting determinism is the kind of change that gets skipped. */
  const a = run(seedTraffic(7), 4000);
  const b = run(seedTraffic(7), 4000);
  const same = JSON.stringify(a) === JSON.stringify(b);
  same
    ? ok("4000 ticks, twice, byte for byte identical")
    : fail("the same seed produced two different runs, so no trace can ever be a baseline");

  /* And stepping in pieces is the same as stepping in one go, or the
     screen's frame-rate-independent accumulator is a lie. */
  let c = seedTraffic(7);
  for (let i = 0; i < 40; i++) c = run(c, 100);
  JSON.stringify(c) === JSON.stringify(a)
    ? ok("and 40 x 100 ticks equals 4000 ticks, so the frame rate cannot change the outcome")
    : fail("stepping in batches diverges from stepping in one go -- the timestep is not fixed in practice");
}

console.log("\n3. IT AGREES WITH THE OLD ENGINE ABOUT HOW BIG A METRE IS");
{
  /* The two will live side by side for several stages. A second opinion
     about the scale is the recurring bug of this project (DECISIONS.md
     section 10) and it would show up as a renderer drawing one world at
     the wrong size. */
  M(1) === engineM(1)
    ? ok(`${PX_PER_M} px per metre, the same figure the old engine uses`)
    : fail(`sim says ${M(1)} px per metre and the engine says ${engineM(1)}`);
  CAR.length === 4.5 && CAR.width === 1.8 && ROAD.laneWidth === 3.6
    ? ok("and about how big a car and a lane are (4.5 x 1.8m, 3.6m lane)")
    : fail("the sim's car or lane dimensions have drifted from the project's true-to-life scale");
}


console.log("\n4. AND IT HOLDS AS THE SPEED LIMIT RISES");
{
  /* The limit is a parameter because the maintainer needs 100 km/h
     eventually and should not need us to try it. Higher speeds stress
     the model in four specific ways and each is checked here. */
  const LIMITS = [30, 50, 60, 80, 100];
  const rows = [];
  for (const kmh of LIMITS) {
    let overlaps = 0, closing = 0, gapT = [], brake = 0, cars = 0, ticks = 0;
    for (const seed of [1, 2, 3]) {
      let w = seedTraffic(seed, kmh);
      for (let i = 0; i < 1200; i++) {
        const prev = w;
        w = step(w);
        ticks++; cars += w.actors.length;
        overlaps += overlapping(w).length;
        for (const me of w.actors) {
          brake = Math.min(brake, me.a ?? 0);
          const view = perceive(me, w);
          if (!view.leader) continue;
          gapT.push(view.gap / Math.max(1, me.v));
          /* THE REAL TUNNELLING CONDITION is how much two cars close on
             each other between samples, not how far one travels. Two cars
             going the same way at similar speeds barely close at all; it
             is the DIFFERENCE that could carry one through another
             without any tick seeing them overlap. */
          const was = prev.actors.find((a) => a.id === me.id);
          const wasLead = prev.actors.find((a) => a.id === view.leader.id);
          if (was && wasLead) {
            closing = Math.max(closing, (wasLead.s - was.s) - (view.leader.s - me.s));
          }
        }
      }
    }
    rows.push({ kmh, overlaps, closing, cars: cars / ticks, brake,
                gapT: [...gapT].sort((a, b) => a - b)[Math.floor(gapT.length / 2)] });
  }
  console.log("   limit   cars on road   median gap   closes per tick   worst braking");
  for (const r of rows) {
    console.log("   " + (r.kmh + " km/h").padEnd(8) + r.cars.toFixed(1).padStart(9)
      + (r.gapT.toFixed(2) + "s").padStart(13) + (r.closing.toFixed(2) + "m").padStart(15)
      + (r.brake.toFixed(1) + " m/s2").padStart(17));
  }

  rows.every((r) => r.overlaps === 0)
    ? ok(`no overlaps at any limit from ${LIMITS[0]} to ${LIMITS[LIMITS.length - 1]} km/h`)
    : fail(`overlaps appear at ${rows.filter((r) => r.overlaps).map((r) => r.kmh).join(", ")} km/h`);

  /* THE GAP IS A TIME, SO IT SCALES BY CONSTRUCTION. A model holding a
     fixed DISTANCE would look right at one limit and absurd at the other
     -- 17m is a sensible gap at 60 and tailgating at 100. */
  const spread = Math.max(...rows.map((r) => r.gapT)) - Math.min(...rows.map((r) => r.gapT));
  spread < 0.25
    ? ok(`the gap is a time and stays one: ${rows[0].gapT.toFixed(2)}s at ${rows[0].kmh} against ${rows[rows.length - 1].gapT.toFixed(2)}s at ${rows[rows.length - 1].kmh}, ${(spread).toFixed(2)}s apart`)
    : fail(`median headway swings ${spread.toFixed(2)}s across the range, so the gap is not scaling with speed`);

  /* Nothing may pass through anything between samples. */
  const worstClose = Math.max(...rows.map((r) => r.closing));
  worstClose < CAR.length / 2
    ? ok(`nothing can tunnel: two cars close by at most ${worstClose.toFixed(2)}m in a tick, against a ${CAR.length}m car`)
    : fail(`two cars close by ${worstClose.toFixed(2)}m per tick against a ${CAR.length}m car, so one could pass through another between samples and no tick would see it`);

  /* Ordinary traffic must not be making emergency stops. This is the
     check that caught the spawn bug: worst braking was pinned at exactly
     -8.0 m/s2, the emergency clamp, at EVERY limit including 30 km/h,
     because cars were being let onto the road inside their own stopping
     distance. */
  const worstBrake = Math.min(...rows.map((r) => r.brake));
  worstBrake > -4
    ? ok(`and ordinary traffic brakes comfortably, never in emergency: worst ${worstBrake.toFixed(1)} m/s2 across every limit`)
    : fail([
        `something is braking at ${worstBrake.toFixed(1)} m/s2 in ordinary traffic.`,
        `An emergency stop is about 8. If this is pinned at exactly the clamp it is`,
        `not traffic, it is cars being created somewhere they cannot stop from --`,
        `check what the spawn gate thinks "room" means. DECISIONS.md 10.0.`,
      ].join(" "));

  /* AND THE CHECK ABOVE HAS TEETH AT SPEED. Put a car somewhere it
     cannot possibly avoid contact and the overlap check must see it --
     otherwise "no overlaps" would only mean the samples were lucky. */
  const road = roadFor(100);
  const lead = { id: "lead", s: 6.5, v: road.speed * 0.5, v0: road.speed * 0.5 };
  const back = { id: "back", s: 0, v: road.speed * 1.3, v0: road.speed * 1.3 };
  let w = { t: 0, tick: 0, seed: 1, road, spawned: 0, nextAt: 1e9, actors: [lead, back] };
  let caught = false, hardest = 0;
  for (let i = 0; i < 400; i++) {
    w = step(w);
    hardest = Math.min(hardest, w.actors.find((a) => a.id === "back")?.a ?? 0);
    if (overlapping(w).length) caught = true;
  }
  caught && hardest <= -7
    ? ok(`and it has teeth at 100 km/h: a car placed 2m behind a slower one brakes at ${hardest.toFixed(1)} m/s2 and the contact is caught`)
    : fail("a car placed somewhere it cannot avoid contact was not caught, so a clean run means nothing");
}


console.log("\n5. EVERY CAR IS A RATED DRIVER, AND THERE IS ONE DRIVER MODEL");
{
  /* The maintainer asked for NPC traits and answered it himself: "we are
     already building something like this into our candidates." So the
     thing being checked here is that there is no SECOND model -- because
     the old engine had two trait pools and they had already drifted,
     five in generate.js and seven in compose.js, neither of them the
     ratings model. This is that bug declined rather than predicted. */
  const src = readFileSync(new URL("../src/sim/traffic.js", import.meta.url), "utf8");
  /^import \{ composeDriver/m.test(src) || src.includes("composeDriver")
    ? ok("drivers come from `composeDriver`, the same five axes the candidate is drawn from")
    : fail([
        "the sim is drawing drivers some other way.",
        "There is ONE driver model in this project and every car uses it -- an NPC is",
        "a rated driver and the candidate is simply the one being assessed. A second",
        "vocabulary beside the ratings would drift, because one would be tuned for how",
        "traffic LOOKS and the other for how a candidate is MARKED. See REBUILD.md 4.1.",
      ].join(" "));

  /* AND CAUTION MEANS THE SAME THING IN BOTH PLACES. `cautionOf` cannot
     be imported from awareness.js without dragging most of the old
     engine along, so the sim has its own three lines against the same
     `deficitOf`. Two callers, one model -- and this is what would catch
     them parting company. */
  let worst = 0;
  for (let i = 1; i <= 200; i++) {
    const d = composeDriver(i * 13);
    worst = Math.max(worst, Math.abs(simCaution(d.ratings) - engineCaution(d)));
  }
  worst < 1e-12
    ? ok(`and caution means the same in the sim as in the engine, across 200 drawn drivers`)
    : fail(`the sim and the engine disagree about caution by up to ${worst.toFixed(4)} -- two confidence models have appeared`);

  /* THE TRAFFIC IS A MIX OF PEOPLE, not one driver repeated. Measured on
     what a person would actually see: the spread of desired speeds, and
     whether anybody is visibly bolder or more timid than the rest. */
  const seen = [];
  for (let seed = 1; seed <= 40; seed++) {
    let w = seedTraffic(seed, 60);
    for (let i = 0; i < 600; i++) {
      w = step(w);
      for (const a of w.actors) if (!seen.some((x) => x.id === a.id && x.seed === seed)) {
        seen.push({ seed, id: a.id, v0: a.v0, headway: a.headway, caution: a.caution });
      }
    }
  }
  const bold = seen.filter((d) => d.caution < 0.75).length;
  const timid = seen.filter((d) => d.caution > 1.25).length;
  const kmh = seen.map((d) => d.v0 * 3.6).sort((a, b) => a - b);
  const gaps = seen.map((d) => d.headway).sort((a, b) => a - b);
  console.log(`   ${seen.length} drivers: ${kmh[0].toFixed(0)}-${kmh[kmh.length - 1].toFixed(0)} km/h wanted, `
    + `${gaps[0].toFixed(2)}-${gaps[gaps.length - 1].toFixed(2)}s of gap kept`);
  bold > seen.length * 0.05 && timid > seen.length * 0.05
    ? ok(`a mix rather than one driver repeated: ${Math.round(100 * bold / seen.length)}% bold, ${Math.round(100 * timid / seen.length)}% timid, the rest ordinary`)
    : fail(`only ${bold} bold and ${timid} timid of ${seen.length} -- the traffic is one driver with noise on it, which is what NPC variety was supposed to fix`);

  /* A SPEEDER AND A TAILGATER ARE THE SAME PERSON IN DIFFERENT
     SITUATIONS, which falls out of one axis driving both knobs. The
     property that matters is that the bold end is visibly bolder on BOTH
     counts, or "tailgater" would just be a label on a random number. */
  const boldest = seen.reduce((a, b) => (a.caution < b.caution ? a : b));
  const meekest = seen.reduce((a, b) => (a.caution > b.caution ? a : b));
  boldest.v0 > meekest.v0 && boldest.headway < meekest.headway
    ? ok(`and the boldest wants ${(boldest.v0 * 3.6).toFixed(0)} km/h at ${boldest.headway.toFixed(2)}s where the meekest wants ${(meekest.v0 * 3.6).toFixed(0)} at ${meekest.headway.toFixed(2)}s -- one axis, both knobs`)
    : fail("boldness does not move speed and gap together, so a speeder and a tailgater are unrelated drivers rather than one person in two situations");
}

console.log("\n" + "=".repeat(70));
if (problems) { console.log(`FAILED: ${problems} problem(s).`); process.exit(1); }
console.log("OK: nobody drives through anybody, and the same seed replays.");
console.log("\n   Stage 0's real test is somebody watching it. Open #/sim.");
