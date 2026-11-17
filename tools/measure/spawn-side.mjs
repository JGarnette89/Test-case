/* WHAT THE PLAYER MEETS PER CAR, WITH AND WITHOUT "FAST CARS BEHIND, SLOW CARS AHEAD" (Jay, 17 Nov 2026; DECISIONS 10.102). The rule's purpose is more encounters per car on the map, so that fewer cars give
   the same felt density (the Pixel budget). encounters.js's `met` (cars within 30 m) is too rare to compare (about one a minute on this road, a handful of events a drive), so this counts two
   things with more events in them: cars that came within 150 m of the player (distinct cars a minute) and PASSES (a car crossing from ahead of the player to behind him or the reverse, within 150 m
   of him, a minute; either direction). Distance by shaping's own window geometry (signed). good driver, five-lane 110 map shaped at 100 cars, three seeds, `secs` s, pace 1.0 and 1.19; `extra` switches the rule.
   Usage: node tools/measure/spawn-side.mjs [secs=300] */
import { TEST_MAPS } from "../../src/map/samples.js";
import { worldFor } from "../../src/sim/scene.js";
import { step } from "../../src/sim/crossing.js";
import { withDriver } from "../../src/sim/drive.js";
import { DT } from "../../src/sim/traffic.js";
import { windowOf } from "../../src/sim/shaping.js";
import { placeOf } from "../../src/sim/placement.js";
import { goodStep } from "../lib/good-driver.mjs";
const secs = Number(process.argv[2] ?? 300), raw = () => TEST_MAPS.find((m) => m.id === "test-highway-gen-wide").build();
const roadOf = (l) => String(l).split("#")[0];
const signed = (win, lane, c) => { const r = roadOf(lane); if (r === win.road) return c - win.at.c; const da = win.ahead.get(r); if (da != null) return da + c; const db = win.behind.get(r); if (db != null) return -(db + ((win.g.len.get(r) ?? 0) - c)); return null; };
const one = (seed, pace, on) => {
  let { world: w, me } = worldFor(seed, 50, 2.0, true, null, raw(), raw().sections?.[0]?.start ?? null, false, false, { preroll: 15 });
  if (on) w = { ...w, spawnSide: true };
  const sc = { me, args: [1], saveWallet: false }, last = new Map(), seen = new Set(); let passes = 0, crashes = 0, carsSum = 0, ticks = 0;
  for (let n = 0; n < secs / DT; n++) {
    me = goodStep(me, w, sc, { overtake: true, pace }); sc.me = me; w = step(withDriver(w, me));
    if (n % 5) continue;
    const win = windowOf(w, w.actors); if (!win) continue;
    carsSum += w.actors.length; ticks++;
    for (const a of w.actors) { if (a.player || a.parked) continue; const at = placeOf(w.course, a.k ?? 0, a.route, a.s); if (!at) continue; const d = signed(win, at.lane, at.c); if (d == null) { last.delete(a.id); continue; }
      if (Math.abs(d) < 150) seen.add(a.id);
      const p = last.get(a.id); if (p != null && p * d < 0 && Math.abs(d) < 150 && Math.abs(p) < 150) passes++; last.set(a.id, d); }
  }
  return { seen: seen.size, passes, crashes: (w.crashes ?? []).length, cars: carsSum / Math.max(1, ticks) };
};
for (const pace of [1.0, 1.19]) for (const on of [false, true]) {
  const rows = [1, 2, 3].map((s) => one(s, pace, on)), m = (k) => rows.reduce((s, r) => s + r[k], 0) / rows.length, mins = secs / 60;
  console.log(`pace ${pace}, side rule ${on ? "ON " : "OFF"}: cars within 150 m ${(m("seen") / mins).toFixed(1)}/min · passes ${(m("passes") / mins).toFixed(1)}/min · per car on the map: ${(m("seen") / mins / m("cars")).toFixed(3)} seen, ${(m("passes") / mins / m("cars")).toFixed(3)} passes · crashes ${m("crashes").toFixed(1)}`);
}
