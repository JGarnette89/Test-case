/* =====================================================================
   THE RIVALS, CHEAPLY (sim/rivals.js; PLAN.md item 3): four named drivers
   who are axis profiles and nothing else, and whose driving shows it.

   1. The profile is the person: each derives -- through the same `driver`
      as everybody -- what the character says. Victor no caution, a
      scofflaw who rolls unwatched stops, never courteous, honks soonest;
      Brenda the timid tail, courteous, never honks, stops well short;
      Mason bold with every skill sound; Hannah sound everywhere, no stop
      short, the shortest lag.
   2. They come and go like anybody: each is on the map within minutes of
      the city starting, never two of one, back after leaving; a world
      without rivals has none.
   3. They read as themselves, measured against the people round them over
      ten minutes of the city on two seeds: Victor drives fastest for the
      limit; Brenda slowest, and her stops are well short of where
      Hannah's are (how close each follows is the profile's, section 1:
      the city never holds them in steady following); Mason changes lane more than the traffic does.
   4. Stopping short is knowledge and only knowledge: the distance is the
      old engine's 3.2 m times the knowledge deficit, and nobody stops
      short with knowledge sound.
   ===================================================================== */
import { loadMap } from "../src/map/load.js";
import { testCityReady } from "../src/map/samples.js";
import { seedGraph, step, pathOf, patienceOf, overlapping } from "../src/sim/crossing.js";
import { postedAt } from "../src/sim/graph.js";
import { DT, STOP_SHORT, driver, lenOf } from "../src/sim/traffic.js";
import { RIVALS } from "../src/sim/rivals.js";
import { courteous } from "../src/sim/courtesy.js";
import { deficitOf } from "../src/core/driver.js";

let failed = 0;
const check = (ok, msg) => { console.log(`  ${ok ? "ok  " : "FAIL:"} ${msg}`); if (!ok) failed++; };
const by = Object.fromEntries(RIVALS.map((r) => [r.name, r]));
const road = { speed: 13.9, kmh: 50, lane: 3.6 };
const as = (name) => driver(road, 1, 1, by[name].ratings);

console.log("\n1. THE PROFILE IS THE PERSON");
{
  const v = as("Victor"), b = as("Brenda"), m = as("Mason"), h = as("Hannah");
  check(v.caution === 0 && v.rollsStops === "unwatched" && !courteous(v) && patienceOf(v) < 1, `Victor: caution ${v.caution}, rolls stops with nobody about, never lets anybody in, honks after ${patienceOf(v).toFixed(2)} s`);
  check(b.caution === 2 && courteous(b) && patienceOf(b) === Infinity && b.short > 2, `Brenda: caution ${b.caution}, lets you in, never honks, stops ${b.short.toFixed(2)} m short`);
  check(m.caution < 0.5 && deficitOf(m.ratings, "steering").deficit === 0 && deficitOf(m.ratings, "observation").deficit === 0, `Mason: caution ${m.caution.toFixed(2)} (bold), steering and observation sound`);
  check(h.caution === 1 && h.short === 0 && courteous(h) && [v, b, m].every((x) => x.notices >= h.notices), `Hannah: caution at the optimum, stops at the line, lets you in, notices soonest (${h.notices.toFixed(2)} s)`);
  check(v.v0 > h.v0 && h.v0 > b.v0 && v.headway < h.headway && h.headway < b.headway, `speed and gap wanted: Victor ${(v.v0 * 3.6).toFixed(0)} km/h / ${v.headway.toFixed(2)} s, Hannah ${(h.v0 * 3.6).toFixed(0)} / ${h.headway.toFixed(2)}, Brenda ${(b.v0 * 3.6).toFixed(0)} / ${b.headway.toFixed(2)}`);
}

console.log("\n2. THEY COME AND GO LIKE ANYBODY; 3. THEY READ AS THEMSELVES");
const city = loadMap(testCityReady());
{
  /* TWO SEEDS, pooled: one ten-minute city is a handful of each rival's
     following and stopping (CLAUDE.md item 3, the implied sample size). */
  const first = {}, gone = {}, back = {};
  let dup = 0, over = 0;
  const stats = new Map();   // id -> { free: [v/limit], gap: [headway s], lc, s0, stops: [short m] }
  const stat = (k, a) => stats.get(k) ?? stats.set(k, { free: [], gap: [], lc: 0, stops: [], rival: a.rival ?? null }).get(k);
  for (const seed of [2, 3]) {
  let w = seedGraph(seed, 50, city, { target: 150, posted: true, rivals: true });
  const key = (a) => (a.rival ? a.id : `${seed}:${a.id}`);
  const prevLc = new Map(), prevV = new Map();
  for (let i = 0; i < 600 / DT; i++) {
    w = step(w);
    const ids = w.actors.map((a) => a.id);
    for (const r of RIVALS) {
      const n = ids.filter((x) => x === r.id).length;
      if (n > 1) dup++;
      if (n && first[r.name] == null) first[r.name] = w.t;
      if (!n && first[r.name] != null && gone[r.name] == null) gone[r.name] = w.t;
      if (n && gone[r.name] != null && back[r.name] == null) back[r.name] = w.t;
    }
    if (i % 20 === 0) over += overlapping(w).length;
    if (i % 5) continue;
    for (const a of w.actors) {
      if (a.kind !== "car" || a.crash) continue;
      const st = stat(key(a), a), p = pathOf(w, a);
      if ((a.lcCount ?? 0) > (prevLc.get(a.id) ?? 0)) st.lc += (a.lcCount ?? 0) - (prevLc.get(a.id) ?? 0);
      prevLc.set(a.id, a.lcCount ?? 0);
      const limit = postedAt(w.course, a.k ?? 0, a.route);
      if (a.v > 3 && limit && a.s < p.stopAt - 60) {
        const lead = w.actors.find((b) => b.id !== a.id && (b.k ?? 0) === (a.k ?? 0) && b.route === a.route && b.s > a.s && b.s - a.s < 80);
        if (!lead) st.free.push(a.v / limit);
        /* FOLLOWING, steady: the car ahead within 60 m and within 1 m/s of
           this one's speed. Any car within 80 m at any closing speed was
           mostly cars coming up on a queue, and read Victor as further back
           than the crowd on one seed (14 October). */
        else if (lead.s - a.s < 60 && Math.abs(lead.v - a.v) < 1) st.gap.push((lead.s - a.s - (lenOf(a) + lenOf(lead)) / 2) / a.v);
      }
      /* A stop at a line, measured from the line: the front of the car short of the stop line. */
      if (a.v < 0.05 && (prevV.get(a.id) ?? 0) >= 0.05 && a.s < p.stopAt && p.stopAt - a.s < 12) {
        const ahead = w.actors.some((b) => b.id !== a.id && (b.k ?? 0) === (a.k ?? 0) && pathOf(w, b)?.from === p.from && b.s > a.s && b.s < p.stopAt + 2);
        if (!ahead) st.stops.push(p.stopAt - (a.s + lenOf(a) / 2));
      }
      prevV.set(a.id, a.v);
    }
  }
  }
  check(RIVALS.every((r) => first[r.name] != null && first[r.name] < 180) && dup === 0, `each rival on the map within three minutes (${RIVALS.map((r) => `${r.name} ${first[r.name]?.toFixed(0) ?? "never"} s`).join(", ")}), never two of one (${dup})`);
  const left = RIVALS.filter((r) => gone[r.name] != null);
  check(left.every((r) => back[r.name] != null), `a rival who leaves comes back: ${left.map((r) => `${r.name} out at ${gone[r.name].toFixed(0)} s, back at ${back[r.name]?.toFixed(0) ?? "never"} s`).join("; ") || "nobody left in ten minutes"}`);
  check(over === 0, `nobody overlapping (${over})`);
  const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN);
  const med = (xs) => { const s = [...xs].filter((x) => !Number.isNaN(x)).sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
  const crowd = [...stats.values()].filter((s) => !s.rival);
  const crowdFree = med(crowd.filter((s) => s.free.length >= 10).map((s) => mean(s.free)));
  const crowdGap = med(crowd.filter((s) => s.gap.length >= 10).map((s) => mean(s.gap)));
  const crowdLc = med(crowd.map((s) => s.lc));
  const R = Object.fromEntries(RIVALS.map((r) => [r.name, stats.get(r.id) ?? { free: [], gap: [], lc: 0, stops: [] }]));
  console.log(`   the crowd: ${(crowdFree * 100).toFixed(0)}% of the limit when free, ${crowdGap.toFixed(2)} s behind the car ahead, ${crowdLc} lane changes each (medians)`);
  for (const r of RIVALS) { const s = R[r.name]; console.log(`   ${r.name.padEnd(7)} ${(mean(s.free) * 100).toFixed(0)}% of the limit, ${mean(s.gap).toFixed(2)} s back, ${s.lc} lane changes, stops ${s.stops.map((x) => x.toFixed(1)).join(" ") || "-"} m short`); }
  /* SPEED ONLY. How close they follow is asserted on the profile (section 1:
     headway 0.39 s against 1.02); in the city neither is ever in steady
     following -- Victor too fast to sit behind anybody at their speed,
     Brenda too slow for anybody to be ahead within reach -- so a traffic
     clause for it passed on no samples at all (14 October), and is gone. */
  check(mean(R.Victor.free) > crowdFree && mean(R.Victor.free) > mean(R.Hannah.free), `Victor drives faster for the limit than the crowd and Hannah (${(100 * mean(R.Victor.free)).toFixed(0)}%)`);
  check(mean(R.Brenda.free) < crowdFree, `Brenda drives slower for the limit than the crowd (${(100 * mean(R.Brenda.free)).toFixed(0)}%)`);
  /* Measured from the box edge (`stopAt`), where the line's own setback puts every car a couple of metres back: so against Hannah, who stops where she means to. */
  check(R.Brenda.stops.length >= 1 && R.Hannah.stops.length >= 1 && mean(R.Brenda.stops) - mean(R.Hannah.stops) > 1.5, `Brenda stops ${(mean(R.Brenda.stops) - mean(R.Hannah.stops)).toFixed(2)} m further back than Hannah (${mean(R.Brenda.stops).toFixed(2)} against ${mean(R.Hannah.stops).toFixed(2)} m from the box)`);
  check(R.Mason.lc > crowdLc, `Mason changes lane more than the traffic (${R.Mason.lc} against ${crowdLc})`);
}
{
  let w = seedGraph(2, 50, city, { target: 150, posted: true });
  for (let i = 0; i < 60 / DT; i++) w = step(w);
  check(!w.actors.some((a) => a.rival), "a world without rivals has none");
}

console.log("\n4. STOPPING SHORT IS KNOWLEDGE");
{
  const ok = [0, 0.3, 0.7, 1].every((k) => Math.abs(driver(road, 1, 1, { observation: 1, confidence: 0.5, steering: 1, braking: 1, knowledge: k, compliance: 1 }).short - STOP_SHORT * (1 - k)) < 1e-9);
  const others = ["observation", "confidence", "steering", "braking", "compliance"].every((ax) => driver(road, 1, 1, { observation: 1, confidence: 0.5, steering: 1, braking: 1, knowledge: 1, compliance: 1, [ax]: ax === "confidence" ? 0 : 0.1 }).short === 0);
  check(ok && others, `short of the line by ${STOP_SHORT} m times the knowledge deficit, and by nothing for any other weakness`);
}

console.log(failed ? `\n${failed} FAILURE(S)` : "\nall passed");
process.exit(failed ? 1 : 0);
