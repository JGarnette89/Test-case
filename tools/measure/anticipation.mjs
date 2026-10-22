/* ANTICIPATION, BY ITS CONSEQUENCES (DECISIONS 10.20). The same world run
   three ways -- as drawn, everybody anticipating, everybody reacting
   (world.anticipate, core/driver.js) -- on the endless highway, where every
   site but the glance meets: joiners seeking gaps, offerers letting them
   in, the cars behind the offerers. Per run:
     joiners      how many entered, how many stood, car-seconds standing
     offers       how many; onset (offer start after the joiner came onto
                  its lane); the offerer's peak braking during the offer
     followers    offers during which the offerer's follower braked harder than
                  its own comfortable rate at least once (per OFFER: counted per
                  tick, one long queue behind one offer outweighed the rest)
   Usage: node tools/measure/anticipation.mjs [cars=150] [secs=240] [seeds=1,2] */
import { loadMap } from "../../src/map/load.js";
import { TEST_MAPS } from "../../src/map/samples.js";
import { seedGraph, step } from "../../src/sim/crossing.js";
import { DT, vehicleOf } from "../../src/sim/traffic.js";
import { placeOf, neighboursAt } from "../../src/sim/placement.js";

const [carsArg = "150", secsArg = "240", seedArg = "1,2"] = process.argv.slice(2);
const map = loadMap(TEST_MAPS.find((m) => m.id === "test-loop").build());
const q = (xs, f) => { if (!xs.length) return NaN; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(f * s.length))]; };
const onAccel = (w, a) => { const L = w.course.at[a.k].layout, p = L.paths[a.route]; return !!(p && L.legs[p.to]?.accel && a.s > p.clearAt); };

export function measure(mode, seeds, cars, secs) {
  const out = { joiners: 0, stood: 0, standing: 0, offers: 0, onset: [], peak: [], hardOffers: 0, stands: [] };
  for (const seed of seeds) {
    let w = seedGraph(seed, 50, map, { every: 2.0, target: cars, posted: true });
    if (mode !== "drawn") w = { ...w, anticipate: mode };
    for (let i = 0; i < 60 / DT; i++) w = step(w);
    const entered = new Map(), stoodIds = new Set(), offers = new Map(), standOf = new Map();
    for (let i = 0; i < secs / DT; i++) {
      const prev = w;
      w = step(w);
      const was = new Map(prev.actors.map((a) => [a.id, a]));
      for (const a of w.actors) {
        if (a.player || a.parked) continue;
        if (onAccel(w, a)) {
          if (!entered.has(a.id)) entered.set(a.id, w.t);
          if (a.v < 0.5) { stoodIds.add(a.id); out.standing += DT; standOf.set(a.id, (standOf.get(a.id) ?? 0) + DT); }
        }
        const c = a.courtesy;
        if (c && !c.done) {
          const key = `${a.id}>${c.for}`;
          let o = offers.get(key);
          if (!o) { o = { onset: entered.has(c.for) ? c.since - entered.get(c.for) : null, peak: 0, hard: false }; offers.set(key, o); }
          const b = was.get(a.id);
          if (b) o.peak = Math.max(o.peak, (b.v - a.v) / DT);
          /* The offerer's follower, in the offerer's lane. */
          const at = placeOf(w.course, a.k ?? 0, a.route, a.s);
          const f = at && neighboursAt(w, at.lane, at.c, a).behind?.car;
          const fb = f && was.get(f.id);
          if (fb && (fb.v - f.v) / DT > (f.brake ?? vehicleOf(f).brake)) o.hard = true;
        }
      }
    }
    out.joiners += entered.size; out.stood += stoodIds.size; out.offers += offers.size;
    for (const o of offers.values()) { if (o.onset != null) out.onset.push(o.onset); out.peak.push(o.peak); if (o.hard) out.hardOffers++; }
    out.stands.push(...standOf.values());
  }
  return out;
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/")}` || process.argv[1].endsWith("anticipation.mjs")) {
  const seeds = seedArg.split(",").map(Number), cars = Number(carsArg), secs = Number(secsArg);
  console.log(`endless highway, ${cars} cars, ${secs} s after a 60 s warm-up, seeds ${seeds.join(",")}`);
  for (const mode of (process.env.MODES ?? "drawn,all,none").split(",")) {
    const r = measure(mode, seeds, cars, secs);
    console.log(`  ${mode.padEnd(5)} joiners ${r.joiners}, stood ${r.stood} (${(100 * r.stood / Math.max(r.joiners, 1)).toFixed(0)}%), ${r.standing.toFixed(0)} car-s standing | offers ${r.offers}, onset median ${q(r.onset, 0.5).toFixed(1)} s p90 ${q(r.onset, 0.9).toFixed(1)}, peak braking median ${q(r.peak, 0.5).toFixed(2)} p90 ${q(r.peak, 0.9).toFixed(2)} m/s^2 | offers that braked a follower past comfortable ${r.hardOffers} of ${r.offers}`);
    console.log(`        stands, s: ${r.stands.sort((x, y) => y - x).map((x) => x.toFixed(0)).join(" ")}`);
  }
}
