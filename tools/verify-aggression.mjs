/* AGGRESSION: THE COST A DRIVER WILL IMPOSE ON OTHERS (DECISIONS 10.32;
   SIMULATOR IN FLIGHT 35). What must hold, and why each could plausibly be
   got wrong:
   1. THE EXACT CONTROL: \`imposed: false\` is the old world -- nobody carries
      aggression (the hash gate holds it byte for byte; this holds the field).
   2. INDEPENDENT OF SKILL BY CONSTRUCTION: a driver's ratings are the same at
      every aggression level and their aggression the same at every skill
      level; the dial moves the distribution and keeps the order.
   3. NOBODY AT ZERO: the imposition starts at a lift-off and rises with
      aggression to the hardest braking -- a driver who imposes nothing never
      moves.
   4. THE DECISION IS THE QUANTITY: the deceleration lane changes force on the
      car behind, MEASURED in the world, rises with the dial -- not read back
      from the code. A rule that ignored the imposition would fail here.
   5. COURTESY IS ITS OTHER READING: a compliant driver offers whatever their
      confidence; nobody aggressive past COURTEOUS_BELOW does.
   6. DENYING: it happens at the dial's top, never at its default, and only
      from drivers asked, past DENY_FROM.
   7. THE HORN AT BEING HELD UP: none at the default; at the top, only from
      drivers past HELD_FROM, at a moving car, once per hold -- its own class.
   8. THE RIVALS keep the old rule until they are moved onto it.
   9. THE WORKER carries a redrawn driver's aggression to the page.
   Usage: node tools/verify-aggression.mjs */
import { composeDriver, aggressionOf, soundnessOf } from "../src/core/driver.js";
import { imposesOf, LIFT, MOST_BRAKE, AGGRESSION_DEFAULT, vehicleOf } from "../src/sim/traffic.js";
const BRAKE = vehicleOf({ kind: "car" }).brake;
import { seedGraph, step, whatStops, DT } from "../src/sim/crossing.js";
import { courteous, COURTEOUS_BELOW, DENY_FROM } from "../src/sim/courtesy.js";
import { HELD_FROM } from "../src/sim/horn.js";
import { worldFor } from "../src/sim/scene.js";
import { handle, merge } from "../src/sim/remote.js";
import { loadMap } from "../src/map/load.js";
import { TEST_MAPS, testCityReady } from "../src/map/samples.js";

let failed = 0;
const ok = (cond, msg) => { console.log(`${cond ? " ok " : "FAIL"} ${msg}`); if (!cond) failed++; };
const loop = loadMap(TEST_MAPS.find((t) => t.id === "test-loop").build());

console.log("\n1. THE EXACT CONTROL");
{
  let w = seedGraph(1, 50, loop, { target: 150, posted: true, imposed: false });
  for (let i = 0; i < 20 / DT; i++) w = step(w);
  ok(w.actors.length > 50 && w.actors.every((a) => a.aggression == null), `with the old rule nobody carries aggression (${w.actors.length} cars)`);
  let v = seedGraph(1, 50, loop, { target: 150, posted: true });
  for (let i = 0; i < 20 / DT; i++) v = step(v);
  const car = v.actors.filter((a) => !a.player && !a.rival);
  ok(car.length > 50 && car.every((a) => a.aggression != null), `with the new rule every ordinary driver does (${car.length})`);
}

console.log("\n2. INDEPENDENT OF SKILL, BY CONSTRUCTION");
{
  let rOk = 0, aOk = 0, order = 0, pairs = 0;
  for (let i = 1; i <= 2000; i++) {
    const seed = i * 7919 + 5;
    const r = JSON.stringify(composeDriver(seed, null, 0).ratings);
    if ([0, 0.3, 1].every((A) => JSON.stringify(composeDriver(seed, null, 0, A).ratings) === r)) rOk++;
    const a = composeDriver(seed, null, 0, 0.6).aggression;
    if ([-1, 0, 1].every((L) => composeDriver(seed, null, L, 0.6).aggression === a)) aOk++;
    const j = seed + 7919;
    if ((aggressionOf(seed, 0.3) < aggressionOf(j, 0.3)) === (aggressionOf(seed, 1) < aggressionOf(j, 1))) order++;
    pairs++;
  }
  ok(rOk === 2000, `ratings unchanged by the aggression dial for ${rOk} of 2000 drivers`);
  ok(aOk === 2000, `aggression unchanged by the skill dial for ${aOk} of 2000`);
  ok(order === pairs, `the dial keeps the order: ${order} of ${pairs} pairs ranked the same at 0.3 and at 1`);
}

console.log("\n3. NOBODY AT ZERO");
{
  const at = (a) => imposesOf({ aggression: a });
  ok(at(0) === LIFT && LIFT > 0 && at(0) < BRAKE, `aggression 0 still imposes a lift-off (${at(0)} m/s^2, under a comfortable stop at ${BRAKE})`);
  ok(at(1) === MOST_BRAKE && [0, 0.25, 0.5, 0.75, 1].every((a, i, xs) => i === 0 || at(a) > at(xs[i - 1])), `rising to the hardest braking at 1 (${at(1)}), strictly`);
  ok(imposesOf({}) === null, "a driver without the field has no imposition (the old rule decides)");
}

/* The braking a change forces: the car whose new leader is a changer, its hardest in 4 s. */
function forced(level, seed = 1, secs = 120) {
  let w = seedGraph(seed, 50, loop, { target: 150, posted: true });
  w = { ...w, aggression: level };
  for (let i = 0; i < 40 / DT; i++) w = step(w);
  const open = new Map(), seen = new Set(), peaks = [];
  let denials = 0, deniers = [], held = [], heldPairs = new Set(), heldRepeat = 0;
  for (let i = 0; i < secs / DT; i++) {
    w = step(w);
    const byId = new Map(w.actors.map((a) => [a.id, a]));
    for (const a of w.actors) {
      if (a.lc && !a.lc.abort && !a.lc.missed && !seen.has(`${a.id}@${a.lc.at}`)) { seen.add(`${a.id}@${a.lc.at}`); open.set(`${a.id}@${a.lc.at}`, { at: a.lc.at, who: null, peak: 0 }); }
      if (a.deny && a.deny.since === w.t - DT) { denials++; deniers.push(a.aggression); }
      if (a.honkWhy === "heldUp" && Math.abs(a.honkAt - (w.t - DT)) < 1e-9) {
        const L = byId.get(a.honkTo);
        held.push({ aggr: a.aggression, moving: (L?.v ?? 0) > 1 });
        /* one honk per continuous hold: the same car, the same hold (`heldSince`, when it began) -- back behind it later, after another, is a new hold */
        const k = `${a.id}>${a.honkTo}@${a.heldSince}`; if (heldPairs.has(k)) heldRepeat++; heldPairs.add(k);
      }
    }
    for (const a of w.actors) {
      if (a.player || (a.v ?? 0) < 1) continue;
      const l = whatStops(a, w).leader, L = l && byId.get(l.id);
      if (!L?.lc) continue;
      const o = open.get(`${L.id}@${L.lc.at}`);
      if (!o || w.t - o.at > 4) continue;
      if (o.who == null || o.who === a.id) { o.who = a.id; o.peak = Math.max(o.peak, -(a.a ?? 0)); }
    }
    for (const [k, o] of open) if (w.t - o.at > 4) { if (o.who) peaks.push(o.peak); open.delete(k); }
  }
  peaks.sort((x, y) => x - y);
  return { w, n: peaks.length, p75: peaks[Math.floor(0.75 * peaks.length)] ?? 0, over2: peaks.filter((x) => x > 2).length / Math.max(1, peaks.length), denials, deniers, held, heldRepeat };
}

console.log("\n4. THE DECISION IS THE QUANTITY: WHAT CHANGES COST THE CAR BEHIND RISES WITH THE DIAL");
const lo = forced(0), mid = forced(AGGRESSION_DEFAULT), hi = forced(1);
ok(lo.n >= 40 && hi.n >= 40, `enough changes with somebody behind: ${lo.n} at 0, ${mid.n} at the default, ${hi.n} at 1`);
ok(hi.over2 > lo.over2 + 0.05 && hi.p75 > lo.p75, `the share forcing more than 2 m/s^2 ${(100 * lo.over2).toFixed(0)}% at 0, ${(100 * mid.over2).toFixed(0)}% at the default, ${(100 * hi.over2).toFixed(0)}% at 1; p75 ${lo.p75.toFixed(2)} -> ${hi.p75.toFixed(2)}`);

console.log("\n5. COURTESY IS ITS OTHER READING");
{
  const ds = Array.from({ length: 3000 }, (_, i) => composeDriver(i * 13 + 3, null, 0, 1));
  const compliant = ds.filter((d) => soundnessOf(d.ratings, "compliance") >= 0.75);
  const boldCalm = compliant.filter((d) => d.ratings.confidence > 0.8 && d.aggression < COURTEOUS_BELOW);
  ok(boldCalm.length > 20 && boldCalm.every((d) => courteous(d)), `compliant, calm and BOLD: all ${boldCalm.length} would let somebody in -- confidence no longer decides it`);
  const hot = ds.filter((d) => d.aggression >= COURTEOUS_BELOW);
  ok(hot.length > 100 && hot.every((d) => !courteous(d)), `nobody at aggression ${COURTEOUS_BELOW} or more would (${hot.length} drivers)`);
}

console.log("\n6. DENYING");
ok(mid.denials === 0, `none at the default (${mid.denials})`);
ok(hi.denials > 0 && hi.deniers.every((a) => a >= DENY_FROM), `at the top ${hi.denials} denials, every one from a driver at ${DENY_FROM} or more`);

console.log("\n7. THE HORN AT BEING HELD UP, ITS OWN CLASS");
ok(mid.held.length === 0, `none at the default (${mid.held.length})`);
ok(hi.held.length > 10 && hi.held.every((h) => h.aggr >= HELD_FROM && h.moving), `at the top ${hi.held.length}, every one from a driver at ${HELD_FROM} or more, at a moving car`);
ok(hi.heldRepeat === 0, `once per hold -- never leaning on it (${hi.heldRepeat} repeats within one hold)`);

console.log("\n8. THE RIVALS KEEP THE OLD RULE");
{
  let { world: w } = worldFor(1, 50, 1.1, false, 150, testCityReady(), null, false);
  for (let i = 0; i < 120 / DT; i++) w = step(w);
  const rivals = w.actors.filter((a) => a.rival);
  ok(rivals.length > 0 && rivals.every((a) => a.aggression == null), `${rivals.length} rivals on the map, none carrying aggression`);
}

console.log("\n9. THE WORKER CARRIES IT");
{
  const args = [1, 50, 1.1, false, 150, testCityReady(), null, false];
  let { world: page } = worldFor(...args);
  let { state, reply } = handle(null, { type: "init", args, seq: 1 });
  page = merge(page, structuredClone(reply.dyn));
  for (let i = 0; i < 20; i++) { ({ state, reply } = handle(state, { type: "step", me: null, seq: i + 2 })); page = merge(page, structuredClone(reply.dyn)); }
  ({ state } = handle(state, { type: "set", key: "aggression", value: 0.9 }));
  for (let i = 0; i < 3; i++) { ({ state, reply } = handle(state, { type: "step", me: null, seq: i + 100 })); page = merge(page, structuredClone(reply.dyn)); }
  const truth = new Map(state.world.actors.map((a) => [a.id, a]));
  const agree = page.actors.filter((a) => a.aggression === truth.get(a.id)?.aggression && a.caution === truth.get(a.id)?.caution).length;
  const moved = page.actors.filter((a) => a.aggression != null && a.aggression > 0.3).length;
  ok(agree === page.actors.length && moved > 10, `the page holds every driver's redrawn aggression (${agree} of ${page.actors.length}; ${moved} now past the default's top)`);
}

console.log(failed ? `\n${failed} FAILED` : "\nALL PASSED");
process.exit(failed ? 1 : 0);
