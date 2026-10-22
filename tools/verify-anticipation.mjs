/* =====================================================================
   ANTICIPATION, ONE PROPERTY (DECISIONS 10.15, 10.20). On any occasion that
   will need them a driver anticipates -- acts from when the need was
   knowable -- or reacts -- from when it was pressing; the chance is their
   observation soundness, one draw per occasion (core/driver.js
   `anticipates`). The sites derive from it and say only what their
   occasion, knowable and pressing moments are.

     EACH SITE IS VARIED ALONE (world.anticipate by site): varied together,
   reacting joiners stopped planning, which moved the offers' onset by
   itself, and section 2 passed with courtesy's reacting branch deleted --
   a check passing with its mechanism removed (CLAUDE.md item 3).

     1. The law, once, for every site: the share anticipated tracks
        soundness; fully sound always, fully deficient never; the same
        occasion asked twice the same answer; a player always; the check's
        controlled comparison (world.anticipate) overrides it.
     2. Courtesy onset (courtesy.js offerOf): the same reacting offerers,
        with the pressing rule and without it, begin later and brake
        harder with it -- "a reacting one brakes late and sharp" (10.12),
        derived.
     3. Gap-seeking (lanechange.js gapTarget), in the world as drawn: a sound
        observer plans its join most times and a poor one seldom -- the law
        read at the site, from what the joiners did.
   The glance (crossing.js heedsRoad) is the fourth site and is held in
   verify-lookaway section 3. Checking behind (courtesy.js, the same draw as
   the onset) is MEASURED and not held: offers that braked a follower past
   its comfortable rate, 6 of 137 anticipating against 11 of 108 reacting
   over four seeds (tools/measure/anticipation.mjs) -- too few a seed for a
   floor that would not be a coin.

   Usage: node tools/verify-anticipation.mjs
   ===================================================================== */
import { loadMap } from "../src/map/load.js";
import { TEST_MAPS } from "../src/map/samples.js";
import { seedGraph, step } from "../src/sim/crossing.js";
import { DT } from "../src/sim/traffic.js";
import { anticipates, soundnessOf } from "../src/core/driver.js";

let failed = 0;
const check = (ok, msg) => { console.log(`  ${ok ? "ok  " : "FAIL:"} ${msg}`); if (!ok) failed++; };
const q = (xs, f) => { if (!xs.length) return NaN; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(f * s.length))]; };

console.log("\n1. THE LAW: THE CHANCE OF ANTICIPATING IS THE OBSERVATION SOUNDNESS, ONE DRAW PER OCCASION");
{
  const N = 4000;
  const rows = [];
  let worst = 0;
  for (const obs of [0, 0.2, 0.5, 0.8, 1]) {
    let yes = 0;
    for (let i = 0; i < N; i++) {
      const d = { n: i % 97, ratings: { observation: obs } };
      if (anticipates(d, `occasion:${i}`)) yes++;
    }
    const s = soundnessOf({ observation: obs }, "observation");
    rows.push(`${s.toFixed(1)} -> ${(yes / N).toFixed(3)}`);
    worst = Math.max(worst, Math.abs(yes / N - s));
    if (s === 0) check(yes === 0, `a driver with no observation never anticipates (${yes} of ${N})`);
    if (s === 1) check(yes === N, `a fully sound one always does (${yes} of ${N})`);
  }
  console.log(`       soundness -> share anticipated over ${N} occasions each: ${rows.join(", ")}`);
  check(worst <= 0.03, `the share tracks soundness within 0.03 everywhere (worst ${worst.toFixed(3)})`);
  const d = { n: 7, ratings: { observation: 0.5 } };
  let same = true;
  for (let i = 0; i < 500; i++) if (anticipates(d, `k${i}`) !== anticipates({ ...d }, `k${i}`)) same = false;
  check(same, "the same occasion asked twice gives the same answer");
  /* Per occasion, not per driver: one middling driver anticipates some occasions and not others. */
  let some = 0;
  for (let i = 0; i < 200; i++) if (anticipates(d, `k${i}`)) some++;
  check(some > 60 && some < 140, `a driver at 0.5 anticipates ${some} of 200 occasions -- per occasion, not a fixed trait`);
  check(anticipates({ player: true, ratings: { observation: 0 } }, "x"), "the player always anticipates (their own judgment is theirs, not the model's)");
  check(anticipates({ ratings: { observation: 0 } }, "x", { anticipate: "all" }) && !anticipates({ ratings: { observation: 1 } }, "x", { anticipate: "none" }), "the controlled comparison overrides the draw");
}

/* Sections 2 and 3 run the endless highway, where joiners and offerers meet. */
const map = loadMap(TEST_MAPS.find((m) => m.id === "test-loop").build());
const SECS = 180;
function run(seed, anticipate, extra = {}) {
  let w = seedGraph(seed, 50, map, { every: 2.0, target: 150, posted: true });
  if (anticipate) w = { ...w, anticipate, ...extra };
  for (let i = 0; i < 60 / DT; i++) w = step(w);
  const entered = new Map(), offers = new Map(), planned = new Set();
  for (let i = 0; i < SECS / DT; i++) {
    const prev = w;
    w = step(w);
    const was = new Map(prev.actors.map((a) => [a.id, a]));
    for (const a of w.actors) {
      if (a.player || a.parked) continue;
      const L = w.course.at[a.k].layout, p = L.paths[a.route];
      if (p && L.legs[p.to]?.accel && a.s > p.clearAt) {
        if (!entered.has(a.id)) entered.set(a.id, { t: w.t, obs: soundnessOf(a.ratings ?? {}, "observation") });
        if (a.mergeV != null) planned.add(a.id);
      }
      const c = a.courtesy;
      if (c && !c.done && !c.forPlayer) {
        const key = `${a.id}>${c.for}`;
        let o = offers.get(key);
        if (!o) { o = { onset: entered.has(c.for) ? c.since - entered.get(c.for).t : null, peak: 0 }; offers.set(key, o); }
        const b = was.get(a.id);
        if (b) o.peak = Math.max(o.peak, (b.v - a.v) / DT);
      }
    }
  }
  return { entered, offers: [...offers.values()], planned };
}

/* RESTATED 22 OCTOBER, verdict "check wrong". It compared every offerer
   anticipating with every offerer reacting -- two mechanisms against each
   other: a reacting offerer waits for the pressing moment, an anticipating
   one checks behind first and may hold off for its follower. Which won
   moved with whatever reshuffled the traffic: the lane-change fix (IN
   FLIGHT 26) took it from 11.6 against 12.9 s to 13.3 against 12.9 with no
   change to courtesy at all, and the null had already swung it by 1.7 s.
   The claim the design makes is about the PRESSING RULE: the same reacting
   offerers, with it and without it (world.noPressing, a controlled
   comparison) -- measured onset 12.9 against 10.8 s (+2.1), peak 3.14
   against 3.04. Stated here: later by at least a second, and harder. */
const SEEDS2 = [1, 2, 3, 4];
console.log(`\n2. THE PRESSING RULE: THE SAME REACTING OFFERERS WITH IT AND WITHOUT IT, THE REST AS DRAWN (endless highway, 150 cars, seeds ${SEEDS2.join(",")}, ${SECS} s)`);
{
  const merge = (rs) => ({ offers: rs.flatMap((r) => r.offers) });
  const rule = merge(SEEDS2.map((sd) => run(sd, { ask: "none" }))), without = merge(SEEDS2.map((sd) => run(sd, { ask: "none" }, { noPressing: true })));
  const on = (r) => r.offers.map((o) => o.onset).filter((x) => x != null), pk = (r) => r.offers.map((o) => o.peak);
  const [ow, or, pw, pr] = [q(on(without), 0.5), q(on(rule), 0.5), q(pk(without), 0.5), q(pk(rule), 0.5)];
  console.log(`       offers ${rule.offers.length} with the rule / ${without.offers.length} without; onset after the joiner came onto its lane, median ${or.toFixed(1)} s / ${ow.toFixed(1)} s; the offerer's peak braking, median ${pr.toFixed(2)} / ${pw.toFixed(2)} m/s^2`);
  check(rule.offers.length >= 20 && without.offers.length >= 20, `enough offers to read (${rule.offers.length}, ${without.offers.length})`);
  check(or >= ow + 1, `a reacting offerer waits for the pressing moment: ${or.toFixed(1)} s against ${ow.toFixed(1)} without the rule`);
  check(pr > pw, `and then brakes harder: ${pr.toFixed(2)} against ${pw.toFixed(2)} m/s^2`);
}

console.log(`\n3. GAP-SEEKING IN THE WORLD AS DRAWN: WHO PLANS THEIR JOIN (seed 1, ${SECS} s)`);
{
  const r = run(1, null);
  const band = (lo, hi) => { const ids = [...r.entered].filter(([, e]) => e.obs >= lo && e.obs < hi).map(([id]) => id); return [ids.filter((id) => r.planned.has(id)).length, ids.length]; };
  const [sp, sn] = band(0.9, 1.01), [pp, pn] = band(0, 0.5);
  console.log(`       planned a gap: sound observers (0.9 or more) ${sp} of ${sn}, poor (under 0.5) ${pp} of ${pn}`);
  /* Not every join has a gap to plan for (nobody near: gapTarget returns nothing), so the sound share is not their soundness; what the law says at the site is the ORDER, by a margin. */
  check(sn >= 20 && pn >= 10, `enough joiners in each band (${sn}, ${pn})`);
  check(sp / sn >= 2 * (pp / Math.max(pn, 1)), `a sound observer plans its join at least twice as often as a poor one: ${(sp / sn).toFixed(2)} against ${(pp / Math.max(pn, 1)).toFixed(2)}`);
}

console.log(`\n${"=".repeat(70)}`);
console.log(failed ? `${failed} FAILURE(S)` : "OK: anticipating is the observation soundness, one draw per occasion; reacting offerers start later and brake harder; sound observers plan their joins and poor ones seldom do.");
process.exit(failed ? 1 : 0);
