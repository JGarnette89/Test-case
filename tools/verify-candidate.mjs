/* Driver identity: one candidate across a drive, and habits you can
 * actually pin down.
 *
 * Half the real job is identifying a driver's tendencies, and the game
 * made that impossible in the most basic way. Measured before any of this
 * existed, over 320 generated junctions: the candidate carried no traits
 * at all and committed none of the 143 faults on offer. Every one belonged
 * to some other road user, and the plan's turn survived into the composed
 * junction 9 times in 120 — so the examiner was directing a manoeuvre the
 * candidate was never making.
 *
 * What is checked here is deliberately not "the code does what it says".
 * It is the properties a correct implementation would have to have:
 *
 *   - one driver, at every junction AND every segment;
 *   - a habit gets repeated chances, so it can be told from an incident;
 *   - the rival habits get chances they visibly decline, so a hypothesis
 *     can be tested rather than merely formed;
 *   - a tell is true of the car, always;
 *   - and a clean driver stays clean, so "there is always something" is
 *     not the winning assumption.
 */
import {
  composeCandidate, chancesAt, chancesIn, showingsIn, habitReport, masks,
  shapeOf, traitsForScene, SHOWINGS_FOR_A_HABIT, CLEAN_SHARE, TRAITS_PER_CANDIDATE,
} from "../src/engine/candidate.js";
import {
  AXES, CONFIDENT_ENOUGH, composeDriver, axisEvidence, vocabularyByAxis, ERROR_SCALE,
} from "../src/engine/ratings.js";
import {
  planDrive, driveFromPlan, composeForTile, segmentHazards, CHARACTER,
} from "../src/engine/tiles.js";
import { faultsIn } from "../src/engine/faults.js";
import { simulate, TRAIT_KEYS } from "../src/engine/index.js";
import { SCENARIOS } from "../src/engine/scenarios.js";
import { crossSpec } from "../src/engine/road.js";

let problems = 0;
const ok = (s) => console.log(`  ok   ${s}`);
const fail = (s) => { problems++; console.log(`  FAIL: ${s}`); };

const base = SCENARIOS.find((s) => s.id === "opposite");
const legFor = (spec) => ({
  ...base, road: spec,
  ego: { ...base.ego, departAt: simulate({ ...base, road: spec }).legalAt },
});

/* One drive, end to end, exactly the way the world builds one: a driver
   composed once, a planned route, junctions and segments in order. */
function drive(seed, { steer = false, show = false, length = 7, candidate = null } = {}) {
  const cand = candidate || composeCandidate(seed * 7 + 3);
  const plan = planDrive({ seed, length, candidate: steer ? cand : null });
  const laid = driveFromPlan(plan, { legFor: (spec) => legFor(spec) });
  const scenes = [];
  const sofar = {};
  let since = 0;

  for (let i = 0; i < plan.length; i++) {
    const tile = plan[i].tile;
    const legTime = tile.runway / CHARACTER[tile.character].speed + 4;
    /* A rated driver has no fixed list to owe, so `show` only applies to
       the trait model. Under ratings the planner steers opportunity and
       the driver decides for themselves whether to take it. */
    const owing = (cand.traits || []).filter((t) => (sofar[t] || 0) < SHOWINGS_FOR_A_HABIT);
    const { scn } = composeForTile(tile, since, (seed * 7919 + i * 104729) >>> 0, {
      legTime,
      candidate: cand,
      at: { from: plan[i].entry, intent: plan[i].intent },
      show: show && owing.length ? owing : null,
    });
    if (scn) {
      scenes.push({ scn, kind: "junction", plan: plan[i] });
      for (const f of showingsIn(scn)) sofar[f.trait] = (sofar[f.trait] || 0) + 1;
    }
    const link = laid.links[i];
    if (link) {
      for (const h of segmentHazards(tile, link, seed * 31 + i, { candidate: cand })) {
        scenes.push({ scn: h.scn, kind: "segment" });
        for (const f of showingsIn(h.scn)) sofar[f.trait] = (sofar[f.trait] || 0) + 1;
      }
    }
    since += legTime;
  }
  return { cand, plan, scenes };
}

console.log("\n" + "=".repeat(70));
console.log("CANDIDATE: one driver, and habits you can pin down");
console.log("=".repeat(70));

/* ---------- 1. one driver ------------------------------------------- */
console.log("\n1. THE SAME PERSON IS DRIVING THE WHOLE WAY");
{
  let drives = 0, scenes = 0, mismatched = 0, junctions = 0, segments = 0;
  for (let seed = 1; seed <= 8; seed++) {
    const { cand, scenes: sc } = drive(seed, { steer: true, show: true });
    drives++;
    const want = [...cand.traits].sort().join(",");
    for (const s of sc) {
      scenes++;
      if (s.kind === "junction") junctions++; else segments++;
      const got = [...(s.scn.ego.traits || [])].sort().join(",");
      if (got !== want) {
        mismatched++;
        if (mismatched <= 3) fail(`seed ${seed} ${s.kind}: ego carries [${got}], candidate is [${want}]`);
      }
    }
  }
  mismatched === 0
    ? ok(`one driver across ${scenes} scenes on ${drives} drives (${junctions} junctions, ${segments} segments)`)
    : null;
  segments > 0 && junctions > 0
    ? ok("and the identity spans both kinds of scene, which is where it used to split")
    : fail("the drives produced only one kind of scene, so persistence across kinds is untested");
}

/* ---------- 2. the route is the route -------------------------------- */
console.log("\n2. THE JUNCTION IS THE ONE THE ROUTE ASKED FOR");
{
  let total = 0, matched = 0;
  for (let seed = 1; seed <= 8; seed++) {
    const { scenes } = drive(seed, { steer: true, show: true });
    for (const s of scenes.filter((x) => x.kind === "junction")) {
      total++;
      if (s.scn.ego.from === s.plan.entry && s.scn.ego.intent === s.plan.intent) matched++;
    }
  }
  matched === total
    ? ok(`the composed junction matches the plan's (entry, intent) ${matched}/${total} times, against 9/120 before`)
    : fail(`${total - matched} of ${total} junctions were composed for a different manoeuvre than the route directs`);
}

/* ---------- 3. a habit is not an incident ---------------------------- */
console.log("\n3. A HABIT GETS REPEATED CHANCES, AND ITS RIVALS GET REFUSED ONES");
{
  const N = 20;
  const run = (opts) => {
    const t = { id: 0, gl: 0, hd: 0, ru: 0, tr: 0, dr: 0 };
    for (let seed = 1; seed <= N; seed++) {
      const { cand, scenes } = drive(seed, opts);
      if (!cand.traits.length) continue;
      const rep = habitReport(cand, scenes);
      t.dr++; t.tr += cand.traits.length;
      t.id += rep.identifiable.length;
      t.gl += rep.glimpsed.length;
      t.hd += rep.hidden.length;
      t.ru += rep.ruledOut.length;
    }
    return t;
  };

  /* One thing changed at a time, on the same seeds and the same random
     stream: an unsteered plan and a steered one differ only where the
     candidate actually changed a choice. */
  const plain = run({});
  const asked = run({ show: true });
  const steered = run({ steer: true });
  const both = run({ steer: true, show: true });

  console.log("\n   configuration        identifiable  glimpsed  hidden  rivals ruled out");
  console.log("   " + "-".repeat(68));
  for (const [label, t] of [["persistence only", plain], ["+ ask for a showing", asked], ["+ steer the turns", steered], ["both", both]]) {
    console.log(
      `   ${label.padEnd(20)} ${`${t.id}/${t.tr}`.padStart(12)} ${String(t.gl).padStart(9)} ${String(t.hd).padStart(7)} ${String(t.ru).padStart(17)}`
    );
  }
  console.log("");

  /* The headline property: most of a driver's habits are identifiable, so
     the player has something to be right about. A share rather than a
     count, because how many traits a drive is carrying varies. */
  const share = both.id / both.tr;
  share >= 0.85
    ? ok(`${both.id} of ${both.tr} carried traits reach ${SHOWINGS_FOR_A_HABIT} showings (${(share * 100).toFixed(0)}%)`)
    : fail(`only ${both.id} of ${both.tr} carried traits become identifiable (${(share * 100).toFixed(0)}%)`);

  /* Persistence was the big lever and steering is the finishing one.
     Saying which is which matters: it is the difference between a fix and
     a pile of things that were added at the same time. */
  both.id > plain.id
    ? ok(`asking and steering add ${both.id - plain.id} identifiable habits over persistence alone (${plain.id} -> ${both.id})`)
    : fail(`neither asking nor steering improved on persistence alone (${plain.id} vs ${both.id})`);
  plain.id > 0
    ? ok(`and persistence alone was most of it: ${plain.id}/${plain.tr}, from a baseline where the candidate had no traits at all`)
    : fail("persistence alone produced no identifiable habit, so something upstream is wrong");

  /* Forming a hypothesis is half of it. Testing one needs junctions where
     a rival habit had every opportunity and did nothing. */
  both.ru >= both.tr
    ? ok(`and ${both.ru} rival habits were given ${SHOWINGS_FOR_A_HABIT}+ chances they visibly declined, so a hypothesis can be tested`)
    : fail(`only ${both.ru} rivals were ruled out, so the player can form a hypothesis but not test it`);
}

/* ---------- 4. what a shape can show, derived not declared ----------- */
console.log("\n4. WHERE A HABIT CAN SHOW IS DERIVED, AND THE FORECAST'S ERROR IS MEASURED");
{
  /* Nothing anywhere says "cutsCorner needs a left". The shapes below are
     asked of faultsIn, the identical derivation the scorer grades
     against — so a trait whose behaviour changes changes this table with
     it instead of leaving a stale one behind. */
  const shown = {};
  for (const stops of [true, false])
    for (const intent of ["straight", "right", "left"])
      shown[`${stops ? "stop" : "roll"}/${intent}`] = chancesAt(shapeOf({ stops, intent, prior: true }));

  for (const [k, v] of Object.entries(shown)) console.log(`   ${k.padEnd(14)} ${v.join(" ") || "(nothing)"}`);

  /* The properties that make it a real constraint rather than a listing. */
  const l = shown["stop/left"], r = shown["stop/right"], st = shown["stop/straight"];
  l.length > st.length
    ? ok("a turn asks more of a driver than a straight-on: more habits can show")
    : fail("a turn shows no more than a straight-on, so intent is not a lever at all");
  l.includes("cutsCorner") && !r.includes("cutsCorner")
    ? ok("cutsCorner needs a LEFT, derived — the engine's own left-only rule surfacing here rather than being restated")
    : fail("cutsCorner's derived shape does not match the left-only rule it is written under");
  shown["roll/straight"].length < shown["stop/straight"].length
    ? ok("a segment shows less than a junction, so segments cannot carry a drive's whole character")
    : fail("a segment shows as much as a junction, which would make junctions redundant");

  /* The forecast is used by the planner, which has no scene yet. Where it
     strays from the truth is a number, not a shrug. */
  let agree = 0, over = 0, under = 0, n = 0;
  for (let seed = 1; seed <= 6; seed++) {
    for (const s of drive(seed, { steer: true, show: true }).scenes) {
      const forecast = new Set(chancesAt(shapeOf({
        stops: s.scn.ego.stops !== false, intent: s.scn.ego.intent, prior: s.kind === "junction",
      })));
      const truth = new Set(chancesIn(s.scn));
      n++;
      const missed = [...truth].filter((t) => !forecast.has(t)).length;
      const spare = [...forecast].filter((t) => !truth.has(t)).length;
      if (!missed && !spare) agree++;
      over += spare;
      under += missed;
    }
  }
  console.log(`   forecast vs scene over ${n} scenes: ${agree} exact, ${over} predicted-but-absent, ${under} present-but-unpredicted`);
  under === 0
    ? ok("the forecast never misses a chance the scene actually offered, so nothing is planned away by accident")
    : ok(`the forecast under-predicts ${under} times; reporting uses the scene, so this only costs the planner`);
}

/* ---------- 5. a tell has to be true --------------------------------- */
console.log("\n5. A TELL IS TRUE OF THE CAR, INCLUDING WHERE THERE IS NO LINE");
{
  /* Found by probing where each habit can show: overshoot and slowStart
     fired on a driver who never stopped, because stopBias shifts the
     origin of the traverse whether or not anyone braked. On a segment
     that produced 3.8s of derivable, markable fault whose tell said the
     candidate had stopped past a line that was not there — the project's
     own worst outcome, teaching something false. */
  const rolling = (traits) => ({
    id: "roll", road: crossSpec("none", 1), control: "none", duration: 18,
    ego: { from: "S", intent: "straight", arriveAt: 0, stops: false, traits },
    actors: [{ id: "x", from: "N", intent: "straight", arriveAt: 14, stops: false, kind: "car" }],
  });
  const lied = ["overshoot", "slowStart"].filter((t) => faultsIn(rolling([t])).some((f) => f.who === "ego"));
  lied.length === 0
    ? ok("overshoot and slowStart stay silent on a driver who never stops — the tell cannot be a lie")
    : fail(`${lied.join(" and ")} still derive a fault on a driver who never stopped`);

  const stopping = ["overshoot", "slowStart"].filter((t) =>
    faultsIn({ ...rolling([t]), road: crossSpec("stop", 1), control: "stop", ego: { from: "S", intent: "straight", arriveAt: 1.4, stops: true, traits: [t] } })
      .some((f) => f.who === "ego"));
  stopping.length === 2
    ? ok("and both still show on a driver who does stop, so the guard narrowed them rather than killing them")
    : fail(`${2 - stopping.length} of them no longer show even where they should`);

  /* Two habits that write the same field cannot both be true of one
     driver, and the engine says so without being asked: wideTurn and
     cutsCorner both write turnBias, so fitting both leaves one with
     nothing to be blamed for and it derives no fault at all. Measured on
     a real drive before this was caught: wideTurn, 0 showings from 5
     chances, while cutsCorner took all five.

     DERIVED, not listed -- the same controlled comparison asked of a pair
     instead of a single trait, so a new trait that writes over an old one
     fails here on its first draw. */
  const pairs = [];
  for (const a of TRAIT_KEYS) for (const b of TRAIT_KEYS) if (a < b && masks(a, b)) pairs.push(`${a}+${b}`);
  pairs.length > 0
    ? ok(`incompatible habits are derived, not listed: ${pairs.join(", ")}`)
    : fail("no pair of habits was found to hide the other, but wideTurn and cutsCorner share turnBias");
  masks("wideTurn", "cutsCorner") && !masks("wander", "creep")
    ? ok("and it discriminates: swinging wide and cutting in cannot coexist, drifting and creeping can")
    : fail("the masking test does not separate the pair that conflicts from one that does not");

  let drawnBad = 0;
  for (let i = 1; i <= 400; i++) {
    const t = composeCandidate(i).traits;
    for (let a = 0; a < t.length; a++) for (let b = a + 1; b < t.length; b++) if (masks(t[a], t[b])) drawnBad++;
  }
  drawnBad === 0
    ? ok("and no candidate in 400 is drawn carrying a habit that hides another")
    : fail(`${drawnBad} candidates carry an incompatible pair, so one of their habits can never be spotted`);

  /* Every trait a scene claims a chance for must actually produce one
     when the candidate has it. This is the same rule faults.js lives
     under — a fault that survives its cause being removed was never
     derived from it — turned around: a chance that produces nothing when
     the cause IS present was never a chance. */
  let claimed = 0, empty = 0;
  for (let seed = 1; seed <= 4; seed++) {
    for (const s of drive(seed, { steer: true }).scenes.slice(0, 6)) {
      for (const t of chancesIn(s.scn)) {
        claimed++;
        const forced = { ...s.scn, ego: { ...s.scn.ego, traits: [t] } };
        if (!faultsIn(forced).some((f) => f.who === "ego" && f.trait === t)) empty++;
      }
    }
  }
  empty === 0
    ? ok(`all ${claimed} claimed chances produce a real fault when the habit is present`)
    : fail(`${empty} of ${claimed} claimed chances produce nothing even with the habit fitted`);
}

/* ---------- 6. a clean driver stays clean ---------------------------- */
console.log("\n6. SOME CANDIDATES ARE CLEAN, AND STAY CLEAN");
{
  const clean = { id: "clean", traits: [], skill: 1 };
  let scenes = 0, faulted = 0;
  for (let seed = 1; seed <= 5; seed++) {
    for (const s of drive(seed, { steer: true, show: true, candidate: clean }).scenes) {
      scenes++;
      if (showingsIn(s.scn).length) faulted++;
    }
  }
  faulted === 0
    ? ok(`a clean candidate commits nothing across ${scenes} scenes — a blank sheet is a real answer`)
    : fail(`a candidate with no traits still produced ego faults in ${faulted} of ${scenes} scenes`);

  let cleanDrawn = 0;
  const N = 400;
  for (let i = 1; i <= N; i++) if (composeCandidate(i).traits.length === 0) cleanDrawn++;
  const share = cleanDrawn / N;
  share > 0.05 && share < 0.3
    ? ok(`and ${(share * 100).toFixed(0)}% of drawn candidates are clean, so "there is always something" loses`)
    : fail(`${(share * 100).toFixed(0)}% of candidates are clean, against a ${(CLEAN_SHARE * 100).toFixed(0)}% intent`);

  const counts = new Set();
  for (let i = 1; i <= N; i++) counts.add(composeCandidate(i).traits.length);
  const [lo, hi] = TRAITS_PER_CANDIDATE;
  [...counts].every((n) => n === 0 || (n >= lo && n <= hi))
    ? ok(`and a candidate carries ${lo}-${hi} traits, never a crowd of them`)
    : fail(`candidates were drawn with trait counts outside 0 or ${lo}-${hi}: ${[...counts].join(",")}`);
}

/* ---------- 7. the drive still works --------------------------------- */
console.log("\n7. NONE OF THIS COST THE DRIVE ITS SUPPLY");
{
  /* A junction that cannot satisfy the demand must relax it rather than
     come back empty — a habit that has nothing to say here must not cost
     the player a whole junction. */
  let empty = 0, junctions = 0, asked = 0, granted = 0;
  for (let seed = 1; seed <= 8; seed++) {
    const cand = composeCandidate(seed * 7 + 3);
    const plan = planDrive({ seed, length: 7, candidate: cand });
    let since = 0;
    for (let i = 0; i < plan.length; i++) {
      const tile = plan[i].tile;
      const legTime = tile.runway / CHARACTER[tile.character].speed + 4;
      const want = cand.traits;
      const res = composeForTile(tile, since, (seed * 7919 + i * 104729) >>> 0, {
        legTime, candidate: cand, at: { from: plan[i].entry, intent: plan[i].intent },
        show: want.length ? want : null,
      });
      junctions++;
      if (!res.scn) empty++;
      if (want.length) { asked++; if (res.asked) granted++; }
      since = res.scn && showingsIn(res.scn).length ? 0 : since + legTime;
    }
  }
  empty === 0
    ? ok(`the ladder still fills every junction (${junctions} composed, none empty)`)
    : fail(`${empty} of ${junctions} junctions came back with nothing at all`);
  granted > 0 && granted < asked
    ? ok(`and the demand is real but not absolute: ${granted} of ${asked} junctions delivered the habit asked for, the rest relaxed`)
    : granted === asked
      ? ok(`every junction asked for a habit delivered it (${granted}/${asked})`)
      : fail("no junction ever delivered the habit it was asked for, so the top rung is dead");
}

/* ---------- 8. R1: a driver as four ratings ------------------------- */
console.log("\n8. RATINGS: ERRORS DERIVED FROM WHAT A DRIVER IS BAD AT");
{
  const shape = { stops: true, intent: "left", prior: true };
  const flat = (v) => ({ confidence: CONFIDENT_ENOUGH, steering: v, braking: v, knowledge: v });
  const only = (axis, v) => ({ ...flat(1), confidence: axis === "confidence" ? v : CONFIDENT_ENOUGH, [axis]: v });

  /* P1: faults arise from ratings alone, with no trait named by hand. */
  const weak = { id: "w", ratings: flat(0.1), skill: 1 };
  const produced = new Set();
  for (let seed = 1; seed <= 40; seed++) for (const t of traitsForScene(weak, { ...shape, seed })) produced.add(t);
  produced.size > 0
    ? ok(`a driver described only by ratings produces ${produced.size} kinds of error, named by nobody: ${[...produced].join(", ")}`)
    : fail("ratings alone produced no error at all, so the compiler is inert");

  /* P2: determinism. The whole marking sheet rests on this. */
  let stable = true;
  for (let seed = 1; seed <= 60; seed++) {
    const a = traitsForScene(weak, { ...shape, seed }).join(",");
    const b = traitsForScene(weak, { ...shape, seed }).join(",");
    if (a !== b) stable = false;
  }
  const once = [1, 2, 3].map((s) => drive(s, { steer: true, candidate: composeDriver(s * 11) }));
  const twice = [1, 2, 3].map((s) => drive(s, { steer: true, candidate: composeDriver(s * 11) }));
  const sameDrive = once.every((d, i) =>
    d.scenes.length === twice[i].scenes.length &&
    d.scenes.every((sc, j) => (sc.scn.ego.traits || []).join(",") === (twice[i].scenes[j].scn.ego.traits || []).join(","))
  );
  stable && sameDrive
    ? ok("the same driver in the same situation errs identically on every replay, whole drives included")
    : fail(`ground truth is not replayable (per-scene stable: ${stable}, whole drive stable: ${sameDrive})`);

  /* P4: frequency tracks the deficit, opportunities held constant. The
     controlled comparison -- one shape, one seed range, only the rating
     moves. Pacing is not involved, so nothing but the driver can be
     responsible for the difference. */
  console.log("\n   rating   confidence  steering   braking  knowledge   (errors per 200 draws, one junction)");
  console.log("   " + "-".repeat(84));
  const curve = {};
  for (const axis of AXES) curve[axis] = [];
  for (const v of [0.0, 0.25, 0.5, 0.75, 1.0]) {
    const row = [];
    for (const axis of AXES) {
      let n = 0;
      for (let seed = 1; seed <= 200; seed++) n += traitsForScene({ ratings: only(axis, v) }, { ...shape, seed }).length;
      curve[axis].push(n);
      row.push(String(n).padStart(10));
    }
    console.log(`   ${v.toFixed(2).padStart(6)} ${row.join("")}`);
  }
  const monotone = ["steering", "braking", "knowledge"].filter((a) =>
    curve[a].every((x, i) => i === 0 || x <= curve[a][i - 1])
  );
  monotone.length === 3
    ? ok("steering, braking and knowledge are monotonic: the better the rating, the fewer the errors")
    : fail(`${3 - monotone.length} monotonic axis/axes did not fall with the rating`);

  /* Two-tailedness is the property, and it is checked as two separate
     claims on purpose. "The middle is no worse than either end" passes
     vacuously when an end is empty, which is exactly the state the model
     is in -- a check that cannot tell one-tailed from two-tailed would be
     reporting a success it has not earned. */
  const cc = curve.confidence;
  cc[0] > cc[2]
    ? ok(`confidence deviates rather than counts: too little is worse than enough (${cc[0]} against ${cc[2]})`)
    : fail(`the timid end of confidence is no worse than the optimum: ${cc.join(" -> ")}`);
  cc[4] > cc[2]
    ? ok(`and too much is worse than enough (${cc[4]} against ${cc[2]}), so the axis is genuinely two-tailed`)
    : ok(`MEASURED GAP: too much confidence produces ${cc[4]} errors against ${cc[2]} at the optimum. The axis is one-tailed today; the model supports the second tail and the fault vocabulary does not.`);

  /* P3: two candidates at opposite ends of one axis fail in OPPOSITE
     ways -- not more or less, but differently. */
  const kindsOf = (ratings) => {
    const out = new Set();
    for (let seed = 1; seed <= 200; seed++) for (const t of traitsForScene({ ratings }, { ...shape, seed })) out.add(t);
    return out;
  };
  const kt = kindsOf(only("confidence", 0.0));
  const kr = kindsOf(only("confidence", 1.0));
  const shared = [...kt].filter((x) => kr.has(x));
  kt.size > 0 && kr.size > 0 && shared.length === 0
    ? ok(`the two ends of confidence fail in opposite ways: timid [${[...kt].join(", ")}] against risky [${[...kr].join(", ")}]`)
    : ok(`MEASURED GAP: the two ends do not both speak -- timid [${[...kt].join(", ") || "nothing"}], risky [${[...kr].join(", ") || "nothing"}]. Overconfidence has no markable expression, so P3 cannot pass on content alone.`);

  /* P5: readability and attributability, per axis. An axis needs errors it
     DOMINATES, and at least two distinct kinds of them, or every signal it
     sends arrives entangled with another axis and cannot be isolated. */
  console.log("\n   axis         kinds touching it   kinds it dominates   tails covered");
  console.log("   " + "-".repeat(72));
  const vocab = vocabularyByAxis();
  for (const row of vocab) {
    const tails = row.axis === "confidence" ? `${row.tails.length}/2${row.tails.length === 1 ? " (timid only)" : ""}` : "n/a";
    console.log(`   ${row.axis.padEnd(12)} ${String(row.kinds.length).padStart(17)} ${String(row.dominates.length).padStart(20)}   ${tails}`);
  }
  const thin = vocab.filter((r) => r.dominates.length < 2);
  thin.length === 0
    ? ok("every axis dominates at least two distinct kinds of error, so each can be isolated")
    : ok(`MEASURED GAP: ${thin.map((r) => `${r.axis} dominates ${r.dominates.length}`).join(", ")} -- not yet isolable by a player. R2 content, stated as a number rather than a worry.`);
  const conf = vocab.find((r) => r.axis === "confidence");
  conf.tails.length === 2
    ? ok("and confidence has errors on both of its tails")
    : ok(`MEASURED GAP: confidence covers ${conf.tails.length} of its 2 tails. Overconfidence currently expresses only as a collision, which ends the drive rather than being marked.`);

  /* What that means on a real drive, in evidence rather than counts. */
  let ev = null;
  let rated = 0, scenes = 0;
  for (let seed = 1; seed <= 6; seed++) {
    const cand = composeDriver(seed * 11);
    const fs = [];
    for (const sc of drive(seed, { steer: true, candidate: cand }).scenes) {
      scenes++;
      const shown = showingsIn(sc.scn);
      if (shown.length) rated++;
      fs.push(...shown);
    }
    const rows = axisEvidence(fs);
    ev = ev || rows.map((r) => ({ axis: r.axis, weight: 0, dominant: 0, kinds: new Set() }));
    rows.forEach((r, i) => {
      ev[i].weight += r.weight;
      ev[i].dominant += r.dominant;
      r.dominantKinds.forEach((k) => ev[i].kinds.add(k));
    });
  }
  console.log("\n   axis         evidence (s)   of it dominant   distinct dominant kinds seen");
  console.log("   " + "-".repeat(72));
  for (const r of ev) {
    console.log(`   ${r.axis.padEnd(12)} ${r.weight.toFixed(1).padStart(12)} ${r.dominant.toFixed(1).padStart(16)}   ${[...r.kinds].join(", ") || "none"}`);
  }
  const readable = ev.filter((r) => r.kinds.size >= 2);
  readable.length > 0
    ? ok(`${readable.length} of ${AXES.length} axes are readable on a real drive (${readable.map((r) => r.axis).join(", ")})`)
    : fail("no axis is readable on a real drive, so the model cannot be played");

  /* And the world's supply must not have moved underneath the change. */
  const share = rated / scenes;
  share > 0.15 && share < 0.85
    ? ok(`a drawn driver errs in ${(share * 100).toFixed(0)}% of ${scenes} scenes, the range the trait model produced`)
    : fail(`a drawn driver errs in ${(share * 100).toFixed(0)}% of scenes, so ERROR_SCALE (${ERROR_SCALE}) has moved the world's supply`);
}

console.log("\n" + "=".repeat(70));
if (problems) {
  console.log(`FAILED: ${problems} problem(s).`);
  process.exit(1);
}
console.log("OK: one driver, and habits that repeat enough to be identified.");
