/* THE SKILL DIAL (28 October; SIMULATOR IN FLIGHT 34): the population's
   rating distribution, moved while the world runs.

   What must hold, and why each could be got wrong plausibly:
   1. Level 0 is the population as it always was -- the dial untouched
      changes nobody (the hash gate holds the worlds; this holds the draw).
   2. The dial MOVES the distribution rather than clamping it: every axis's
      mean falls monotonically from +1 to -1, every level keeps a spread,
      and no level piles drivers up on 0 or 1 (a clamp's signature).
   3. A redraw replaces exactly the fields `driver` derives from the
      ratings: every field that differs between two levels for one driver
      is in PERSONAL (a missing one is a driver only half redrawn -- new
      ratings, old braking), and every PERSONAL field but `stuck` differs
      for somebody (no dead entries).
   4. LIVE: moving the dial redraws everybody on the map from their own
      seed at the new level -- position, speed, route untouched -- and
      never the player or a rival; arrivals after it are drawn at it too.
   5. THE WORKER: a redrawn driver's new ratings reach the page (they are
      sent once, so a protocol that sends them only on first appearance
      leaves the page showing who the driver USED to be).
   Usage: node tools/verify-skill.mjs */
import { composeDriver, AXES, soundnessOf } from "../src/core/driver.js";
import { driver, PERSONAL, roadFor } from "../src/sim/traffic.js";
import { applySkill, redrawn } from "../src/sim/skill.js";
import { step, DT } from "../src/sim/crossing.js";
import { worldFor } from "../src/sim/scene.js";
import { handle, merge } from "../src/sim/remote.js";
import { testCityReady } from "../src/map/samples.js";
import { townOf } from "../src/sim/towns.js";

let failed = 0;
const ok = (cond, msg) => { console.log(`${cond ? " ok " : "FAIL"} ${msg}`); if (!cond) failed++; };
const LEVELS = [-1, -0.5, 0, 0.5, 1];
const N = 3000;

console.log("\n1. LEVEL 0 IS THE POPULATION AS IT WAS");
{
  let same = 0;
  for (let i = 1; i <= N; i++) if (JSON.stringify(composeDriver(i * 7919 + 11)) === JSON.stringify(composeDriver(i * 7919 + 11, null, 0))) same++;
  ok(same === N, `${same} of ${N} drivers drawn at level 0 are the drivers drawn with no level`);
}

console.log("\n2. THE DISTRIBUTION MOVES, IT IS NOT CLAMPED");
{
  const stats = {};
  for (const L of LEVELS) {
    const v = Object.fromEntries(AXES.map((a) => [a, []]));
    for (let i = 1; i <= N; i++) { const d = composeDriver(i * 7919 + 11, null, L); for (const a of AXES) v[a].push(soundnessOf(d.ratings, a)); }
    stats[L] = Object.fromEntries(AXES.map((a) => {
      const xs = v[a], m = xs.reduce((s, x) => s + x, 0) / xs.length;
      const sd = Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length);
      const ends = xs.filter((x) => x <= 1e-9 || x >= 1 - 1e-9).length / xs.length;
      return [a, { m, sd, ends }];
    }));
  }
  const mono = AXES.every((a) => LEVELS.every((L, i) => i === 0 || stats[L][a].m > stats[LEVELS[i - 1]][a].m + 0.05));
  ok(mono, `every axis's mean soundness rises with the dial by more than 0.05 a step: ${AXES.map((a) => `${a} ${LEVELS.map((L) => stats[L][a].m.toFixed(2)).join("/")}`).join(", ")}`);
  const spread = AXES.every((a) => LEVELS.every((L) => stats[L][a].sd > 0.02));
  ok(spread, `every level keeps a spread on every axis (sd over 0.02; least ${Math.min(...AXES.flatMap((a) => LEVELS.map((L) => stats[L][a].sd))).toFixed(3)})`);
  const pile = Math.max(...AXES.flatMap((a) => LEVELS.map((L) => stats[L][a].ends)));
  ok(pile < 0.02, `no level piles drivers on 0 or 1 -- the signature of a clamp (worst ${(pile * 100).toFixed(1)}%, line 2%)`);
  ok(stats[-1].observation.m < 0.4 && stats[1].observation.m > 0.9, `the ends are far apart: observation ${stats[-1].observation.m.toFixed(2)} at -1, ${stats[1].observation.m.toFixed(2)} at +1`);
}

console.log("\n3. A REDRAW IS EXACTLY THE FIELDS THE RATINGS DECIDE");
{
  const road = { ...roadFor(50), perceive: { floor: 0.3, span: 1.6, jitter: 0.2 } };
  const moved = new Set();
  for (let n = 1; n <= 400; n++) {
    const a = driver(road, 7, n, null, null, "car", -1), b = driver(road, 7, n, null, null, "car", 1);
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) moved.add(k);
  }
  /* `v` is the speed a new car JOINS the road at -- where it is, not who it is; section 4 holds that a redraw keeps it. */
  const STATE = ["v"];
  const missing = [...moved].filter((k) => !PERSONAL.includes(k) && !STATE.includes(k));
  ok(missing.length === 0, `every field that moves with the level is in PERSONAL${missing.length ? ` -- missing: ${missing.join(", ")}` : ` (${[...moved].join(", ")})`}`);
  const dead = PERSONAL.filter((k) => k !== "stuck" && !moved.has(k));
  ok(dead.length === 0, `every PERSONAL field but stuck moves for somebody${dead.length ? ` -- never moves: ${dead.join(", ")}` : ""}`);
}

console.log("\n4. LIVE: THE DIAL REDRAWS THE MAP, AND ONLY WHO THE DRIVERS ARE");
{
  let { world: w } = worldFor(1, 50, 1.1, false, 150, testCityReady(), null, false);
  for (let i = 0; i < 30 / DT; i++) w = step(w);
  ok(applySkill(w) === w && applySkill({ ...w, skill: 0 }).actors === w.actors, "an untouched dial, or one at 0, redraws nobody (the same world back)");
  const before = new Map(w.actors.map((a) => [a.id, a]));
  const w2 = applySkill({ ...w, skill: -1 });
  const zones = new Map((w.course.map?.zones ?? []).map((z) => [z.id, z]));
  let redrawnOk = 0, kept = 0, placeKept = 0, count = 0, untouchable = 0, untouched = 0;
  for (const a of w2.actors) {
    const b = before.get(a.id);
    if (b.player || b.rival || b.candidate) { untouchable++; if (a === b) untouched++; continue; }
    count++;
    /* An independent statement of who they should now be: their own seed, their own district, at -1. */
    const z = b.home ? zones.get(b.home) : null;
    const want = composeDriver(w.seed * 7919 + b.n, z ? townOf(z.character ?? "ordinary") : null, -1);
    if (JSON.stringify(a.ratings) === JSON.stringify(want.ratings)) redrawnOk++;
    if (["s", "v", "route", "k", "leg", "lc", "stoppedAt", "going"].every((k) => JSON.stringify(a[k]) === JSON.stringify(b[k]))) placeKept++;
    if (Object.keys(b).filter((k) => !PERSONAL.includes(k)).every((k) => a[k] === b[k])) kept++;
  }
  ok(count > 50 && redrawnOk === count, `every driver on the map (${count}) is redrawn from their own seed and district at -1 (${redrawnOk} match)`);
  ok(placeKept === count && kept === count, `and nothing but who they are changes: place, speed and manoeuvre kept for ${placeKept}, every other field for ${kept}`);
  ok(untouched === untouchable, `the player, candidates and rivals are never redrawn (${untouched} of ${untouchable} untouched)`);
  const meanObs = (ws) => { const xs = ws.actors.filter((a) => !a.player && !a.rival); return xs.reduce((s, a) => s + soundnessOf(a.ratings, "observation"), 0) / xs.length; };
  let w3 = w2;
  const nAt = Math.max(...w2.actors.map((a) => a.n ?? 0));
  for (let i = 0; i < 40 / DT; i++) w3 = step(w3);
  const later = w3.actors.filter((a) => (a.n ?? 0) > nAt && !a.rival && !a.player);
  const laterOk = later.filter((a) => soundnessOf(a.ratings, "observation") <= 0.8).length;
  ok(meanObs(w2) < meanObs(w) - 0.3 && meanObs(w3) < 0.45, `the map's observation falls with the dial (${meanObs(w).toFixed(2)} -> ${meanObs(w2).toFixed(2)}), and stays there as traffic turns over (${meanObs(w3).toFixed(2)} after 40 s)`);
  ok(later.length > 5 && laterOk === later.length, `arrivals after the dial moved are drawn at it: ${laterOk} of ${later.length} new drivers within the -1 profile's observation (at most 0.8)`);
  const back = applySkill({ ...w2, skill: 0 });
  ok(back.actors.every((a) => { const o = before.get(a.id); return !o || JSON.stringify(a.ratings) === JSON.stringify(o.ratings); }), "turned back to 0, the same people are who they were");
}

console.log("\n5. THE WORKER: A REDRAWN DRIVER'S RATINGS REACH THE PAGE");
{
  const args = [1, 50, 1.1, false, 150, testCityReady(), null, false];
  let { world: page } = worldFor(...args);
  let { state, reply } = handle(null, { type: "init", args, seq: 1 });
  page = merge(page, structuredClone(reply.dyn));
  for (let i = 0; i < 40; i++) { ({ state, reply } = handle(state, { type: "step", me: null, seq: i + 2 })); page = merge(page, structuredClone(reply.dyn)); }
  ({ state } = handle(state, { type: "set", key: "skill", value: -1 }));
  page = { ...page, skill: -1 };
  for (let i = 0; i < 3; i++) { ({ state, reply } = handle(state, { type: "step", me: null, seq: i + 100 })); page = merge(page, structuredClone(reply.dyn)); }
  const truth = new Map(state.world.actors.map((a) => [a.id, a]));
  const agree = page.actors.filter((a) => JSON.stringify(a.ratings) === JSON.stringify(truth.get(a.id)?.ratings)).length;
  ok(agree === page.actors.length, `the page's copy holds every driver's new ratings (${agree} of ${page.actors.length})`);
  const fieldsAgree = page.actors.filter((a) => PERSONAL.every((k) => JSON.stringify(a[k]) === JSON.stringify(truth.get(a.id)?.[k]))).length;
  ok(fieldsAgree === page.actors.length, `and every field a redraw writes (${fieldsAgree} of ${page.actors.length})`);
}

console.log(failed ? `\n${failed} FAILED` : "\nALL PASSED");
process.exit(failed ? 1 : 0);
