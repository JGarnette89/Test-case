/* WHY CITY DRIVERS MISS THEIR TURNS (27 October): 97% of those in the wrong
   lane for the exit they drew never got over (tools/measure/destinations.mjs).
   Per car with a `want`, followed from the seam onto that approach until it
   gets over or gives up: the approach's length, how much road the driver
   has to change in (to the give-up line lanechange.js draws: the speed it is
   heading for x its change time x 1.2 + 10 m short of the stop line), how
   long it spent standing or below the speed a change can begin at, how often
   it was considered and why not -- and, separately, whether the missed ones
   ever had room to do it at all (the dying-lane question: starting too late,
   or blocked?).
   Usage: node tools/measure/missed-turns.mjs [map=city] [cars=200] [secs=180] [seed=1] [checks=0] */
import { worldFor } from "../../src/sim/scene.js";
import { TEST_MAPS } from "../../src/map/samples.js";
import { step } from "../../src/sim/crossing.js";
import { withDriver } from "../../src/sim/drive.js";
import { DT, vehicleOf } from "../../src/sim/traffic.js";
import { LC_TIME, LC_SPEED } from "../../src/sim/lanechange.js";
import { deficitOf } from "../../src/core/driver.js";
import { goodStep } from "../lib/good-driver.mjs";
const [id = "city", carsS = "200", secsS = "180", seedS = "1", chk = "0"] = process.argv.slice(2);
const raw = TEST_MAPS.find((m) => m.id === id).build();
let { world: w, me } = worldFor(Number(seedS), 50, 2.0, true, Number(carsS), raw, raw.sections?.[0]?.start ?? null, false, false, { checks: chk === "1" });
const me0 = me, sc = { me, args: [1], saveWallet: false };
const open = new Map(), done = [];
for (let i = 0; i < Number(secsS) / DT; i++) {
  if (!me || me.atEdge) { me = { ...me0 }; w = withDriver(w, me); }
  me = goodStep(me, w, sc, { overtake: true, pace: 1.19 }); sc.me = me;
  w = step(withDriver(w, me));
  const now = new Set();
  for (const a of w.actors) {
    if (a.player) continue;
    now.add(a.id);
    const L = w.course.at[a.k].layout, p = L.paths[a.route], leg = L.legs[p.from];
    let o = open.get(a.id);
    if (a.want && a.want.k === a.k && (!o || o.k !== a.k || o.leg !== (a.leg ?? 0))) {
      const T0 = LC_TIME / Math.sqrt(vehicleOf(a).lateral ?? 1), mine = T0 * (1 + 0.5 * (deficitOf(a.ratings ?? {}, "steering").deficit ?? 0));
      const giveUp = p.stopAt - (Math.max(a.v, a.v0 ?? a.v) * mine * 1.2 + 10);
      o = { k: a.k, leg: a.leg ?? 0, len: p.stopAt, startS: a.s, room: giveUp - Math.max(a.s, 40), lanes: leg?.across ?? leg?.lanes ?? 1, standing: 0, slow: 0, ticks: 0, missed0: a.missedTurns ?? 0, met0: a.turnsMet ?? 0, changes0: a.turnChanges ?? 0 };
      open.set(a.id, o);
    }
    if (!o) continue;
    o.ticks++;
    if (a.v < 0.3) o.standing++; else if (a.v < LC_SPEED) o.slow++;
    const left = a.k !== o.k || (a.leg ?? 0) !== o.leg;
    if (left || (a.missedTurns ?? 0) > o.missed0 || (a.turnsMet ?? 0) > o.met0) {
      done.push({ ...o, outcome: (a.turnsMet ?? 0) > o.met0 ? "made it" : "missed", changed: (a.turnChanges ?? 0) > o.changes0 });
      open.delete(a.id);
    }
  }
  for (const k of [...open.keys()]) if (!now.has(k)) open.delete(k);
}
const missed = done.filter((d) => d.outcome === "missed"), made = done.filter((d) => d.outcome === "made it");
const pct = (n, of) => `${n} (${(100 * n / Math.max(1, of)).toFixed(0)}%)`;
const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
console.log(`${id} ${carsS} cars seed ${seedS} checks ${chk}: ${done.length} wants followed to an end -- ${made.length} made it, ${missed.length} missed`);
for (const [name, g] of [["missed", missed], ["made it", made]]) {
  if (!g.length) continue;
  console.log(`  ${name}: approach median ${med(g.map((d) => d.len)).toFixed(0)} m; room to change in (to the give-up line, from 40 m in) median ${med(g.map((d) => d.room)).toFixed(0)} m, none at all ${pct(g.filter((d) => d.room <= 0).length, g.length)}; one lane only ${pct(g.filter((d) => d.lanes < 2).length, g.length)}; time standing median ${(med(g.map((d) => d.standing / Math.max(1, d.ticks))) * 100).toFixed(0)}% of the approach, crawling under the change speed ${(med(g.map((d) => d.slow / Math.max(1, d.ticks))) * 100).toFixed(0)}%`);
}
