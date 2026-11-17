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
import { loadMap } from "../../src/map/load.js";
import { carsFor } from "../../src/map/cars.js";
const secs = Number(process.argv[2] ?? 300), MAP = process.env.MAP ?? "test-highway-gen-wide", raw = () => TEST_MAPS.find((m) => m.id === MAP).build();
const roadOf = (l) => String(l).split("#")[0];
const signed = (win, lane, c) => { const r = roadOf(lane); if (r === win.road) return c - win.at.c; const da = win.ahead.get(r); if (da != null) return da + c; const db = win.behind.get(r); if (db != null) return -(db + ((win.g.len.get(r) ?? 0) - c)); return null; };
const one = (seed, pace, on, cars = null) => {
  /* THE ARM, SET BEFORE THE PRE-ROLL (found 17 Nov): the earlier harness set `spawnSide` AFTER worldFor, so on the generated road -- whose table now carries the rule -- the 15-30 s pre-roll that builds the player's starting population ran under the rule in BOTH arms, and the OFF arm was switched off only afterwards. "off" and "on" put the arm in the map before the world is built (and the world is asserted to carry it); "late" is the old way (an unruled pre-roll, the rule switched on after). */
  const rawMap = raw(); const ruled = on === true || on === "on", pre = ruled; if (rawMap.traffic) rawMap.traffic = { ...rawMap.traffic, ...(ruled ? { spawnSide: true } : { spawnSide: false }) };
  let { world: w, me } = worldFor(seed, 50, 2.0, true, cars, rawMap, rawMap.sections?.[0]?.start ?? null, false, false, { preroll: 15 });
  if (typeof on === "string" && !!w.spawnSide !== pre) throw new Error(`arm ${on} did not take: world.spawnSide ${w.spawnSide}`);
  /* The generated highway carries the rule itself now (roadgen SPAWN_SIDE), so OFF has to be said: an absent override ran the rule in both arms (found 17 Nov, the first count measure read OFF and ON identical). */
  w = { ...w, spawnSide: on === "late" ? true : ruled };
  const sc = { me, args: [1], saveWallet: false }, last = new Map(), seen = new Set(); let passes = 0, crashes = 0, carsSum = 0, ticks = 0; const curve = [], born = new Set(w.actors.map((a) => a.id)); let behindBirths = 0, aheadBirths = 0;
  for (let n = 0; n < secs / DT; n++) {
    me = goodStep(me, w, sc, { overtake: true, pace }); sc.me = me; w = step(withDriver(w, me));
    { const win0 = windowOf(w, w.actors); for (const a of w.actors) { if (born.has(a.id)) continue; born.add(a.id); if (a.player || a.placed == null || !win0) continue; const at0 = placeOf(w.course, a.k ?? 0, a.route, a.s); const d0 = at0 ? signed(win0, at0.lane, at0.c) : null; if (d0 != null) { if (d0 < 0) behindBirths++; else aheadBirths++; } } }
    if (n > 0 && n % Math.round(60 / DT) === 0) curve.push({ seen: seen.size, passes });
    if (n % 5) continue;
    const win = windowOf(w, w.actors); if (!win) continue;
    carsSum += w.actors.length; ticks++;
    for (const a of w.actors) { if (a.player || a.parked) continue; const at = placeOf(w.course, a.k ?? 0, a.route, a.s); if (!at) continue; const d = signed(win, at.lane, at.c); if (d == null) { last.delete(a.id); continue; }
      if (Math.abs(d) < 150) seen.add(a.id);
      const p = last.get(a.id); if (p != null && p * d < 0 && Math.abs(d) < 150 && Math.abs(p) < 150) passes++; last.set(a.id, d); }
  }
  return { curve, behindBirths, aheadBirths, edged: !!me.atEdge, seen: seen.size, passes, crashes: (w.crashes ?? []).length, cars: carsSum / Math.max(1, ticks) };
};
/* BUG FOUND 17 NOV, THE ARMS TEST'S FIRST RUN: `!!on` on the string "off" is TRUE, so the "off" arm ran the rule (off and on read identical, 36.0 per seed 41 28 39), and the assertion compared against the same wrong value so it passed -- the arm-forcing failure again, inside the fix for it. Fixed here; the "late" arm (27.3, 5.5 a minute) was right and equals the first harness's ON exactly, so the discrepancy is WHETHER THE PRE-ROLL RAN UNDER THE RULE (5.5 unruled pre-roll, 7.2 to 8.2 ruled). A true off arm on this road is still to re-run.
/* THE ARMS, VERIFIED BY AN OBSERVABLE IN THE WORLD (the standing practice, 17 Nov: an arm is proved by something the world does, never by the variable that set it): rule off must place NO car behind the player, rule on at
   least 20, or this throws before printing. The arms are built in before the pre-roll. Per seed, per arm: distinct cars within 150 m cumulative at each minute, and passes; then the ON-minus-OFF difference PAIRED BY SEED, with its
   standard error (seeds are the same worlds in both arms up to the rule), over the whole run and over the steady window (minute 3 to the last whole minute). Per-seed values are printed and kept.
   MAP picks the road (default the generated five-lane road), SEEDS the count (default 8). The generated road ends at about minute 6, so run it at 330 s; the loop has no end.
   Usage: [MAP=test-loop SEEDS=6] node tools/measure/spawn-side.mjs 330 arms2 */
if (process.argv[3] === "arms2") {
  const seeds = Array.from({ length: Number(process.env.SEEDS ?? 8) }, (_, i) => i + 1), mins = Math.floor(secs / 60), out = {};
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length, se = (a) => Math.sqrt(a.reduce((x, y) => x + (y - mean(a)) ** 2, 0) / (a.length - 1)) / Math.sqrt(a.length);
  for (const arm of ["off", "on"]) {
    const rows = seeds.map((sd) => one(sd, 1.0, arm, null)); out[arm] = rows;
    const bb = rows.reduce((t, r) => t + r.behindBirths, 0), ab = rows.reduce((t, r) => t + r.aheadBirths, 0);
    if (arm === "off" && bb !== 0) throw new Error(`the OFF arm placed ${bb} cars behind the player: the arm did not take`);
    if (arm === "on" && bb < 20) throw new Error(`the ON arm placed only ${bb} cars behind the player: the arm did not take`);
    console.log(`arm ${arm.padEnd(3)} on ${MAP}: placed behind ${bb}, ahead ${ab}; ${rows.filter((r) => r.edged).length} of ${seeds.length} reached the road's end (arm verified by the placements)`);
  }
  const last = mins - 2;   // the last whole minute's index in `curve`
  for (const [label, f] of [["whole run (cars seen by the last minute)", (r, k) => r.curve[last][k]], [`steady window (minute 3 to ${mins - 1})`, (r, k) => r.curve[last][k] - r.curve[2][k]]]) for (const k of ["seen", "passes"]) {
    const off = out.off.map((r) => f(r, k)), on = out.on.map((r) => f(r, k)), d = on.map((x, i) => x - off[i]);
    console.log(`${label}, ${k}: OFF ${mean(off).toFixed(1)} +/- ${se(off).toFixed(1)}, ON ${mean(on).toFixed(1)} +/- ${se(on).toFixed(1)}; ON minus OFF paired by seed ${mean(d).toFixed(1)} +/- ${se(d).toFixed(1)} (${(100 * mean(d) / Math.max(1e-9, mean(off))).toFixed(0)}% of OFF; ${Math.abs(mean(d) / se(d)).toFixed(1)} standard errors)`);
    console.log(`    per seed OFF ${off.map((x) => x.toFixed(0)).join(" ")} | ON ${on.map((x) => x.toFixed(0)).join(" ")}`);
  }
  process.exit(0);
}
/* THE STEADY RATE (found 17 Nov: the 360 s curve jumps at minute 3, in both arms -- the handover's early minutes are not the road's steady traffic -- so a slope from minute 2 overstates it). Minutes 4 to the end of a longer run, four seeds.
   Usage: node tools/measure/spawn-side.mjs 540 steady */
if (process.argv[3] === "steady") {
  const pace = Number(process.env.PACE ?? 1.0), mins = Math.floor(secs / 60), seeds = [1, 2, 3, 4];
  const N = carsFor(loadMap(raw()));
  console.log(`map ${MAP}, ${N} cars (its own count); a run whose player reaches the end of the road is flagged`);
  for (const [on, cars] of [[false, N], [true, N], [true, Math.round(0.7 * N)], [true, Math.round(0.6 * N)]]) {
    const rows = seeds.map((sd) => one(sd, pace, on, cars)), at = (i, k) => rows.reduce((t, r) => t + (r.curve[i]?.[k] ?? 0), 0) / rows.length;
    const per = (k) => rows.map((r) => (r.curve[mins - 2][k] - r.curve[2][k]) / (mins - 4)), mean = (a) => a.reduce((x, y) => x + y, 0) / a.length, sd = (a) => Math.sqrt(a.reduce((x, y) => x + (y - mean(a)) ** 2, 0) / (a.length - 1));
    console.log(`pace ${pace}, rule ${on ? "ON " : "OFF"}, cars ${String(cars ?? "map's own").padEnd(9)}: STEADY (minute 3 to ${mins - 1}, cars ${cars}) seen ${mean(per("seen")).toFixed(1)} +/- ${(sd(per("seen")) / Math.sqrt(seeds.length)).toFixed(1)}/min, passes ${mean(per("passes")).toFixed(1)} +/- ${(sd(per("passes")) / Math.sqrt(seeds.length)).toFixed(1)}/min (mean +/- standard error over ${seeds.length} seeds; ${rows.filter((r) => r.edged).length} reached the end of the road) · per seed seen ${per("seen").map((x) => x.toFixed(1)).join(" ")}`);
  }
  process.exit(0);
}
/* THE RATE, NOT THE COUNT (found 17 Nov: "distinct cars seen a minute" over a whole run is NOT a rate -- the cars already within 150 m at the start are counted once and are most of a short run, so 240 s and 300 s runs
   of the same world read 5.4 and 3.9 a minute). The cumulative distinct-seen and passes at each minute of one run, and the SLOPE over minutes 2 to the end, which is the steady rate the start cannot inflate.
   Usage: node tools/measure/spawn-side.mjs 360 curve */
if (process.argv[3] === "curve") {
  const pace = Number(process.env.PACE ?? 1.0), mins = Math.floor(secs / 60);
  for (const [on, cars] of [[false, null], [true, null], [true, 85], [true, 70], [true, 60], [true, 50]]) {
    const rows = [1, 2, 3].map((sd) => one(sd, pace, on, cars)), at = (i, k) => rows.reduce((t, r) => t + (r.curve[i]?.[k] ?? 0), 0) / rows.length;
    const slope = (k) => (at(mins - 2, k) - at(0, k)) / (mins - 2);
    console.log(`pace ${pace}, rule ${on ? "ON " : "OFF"}, cars ${String(cars ?? "map's own").padEnd(9)}: seen by minute ${Array.from({ length: mins - 1 }, (_, i) => at(i, "seen").toFixed(0)).join(",")} · SLOPE seen ${slope("seen").toFixed(1)}/min, passes ${slope("passes").toFixed(1)}/min · crashes ${(rows.reduce((t, r) => t + r.crashes, 0) / rows.length).toFixed(1)}`);
  }
  process.exit(0);
}
/* THE PERFORMANCE CLAIM (Jay's rule should mean fewer cars for the same felt density): with the rule ON at a lower count, what cars-seen-a-minute does it keep against the rule OFF at 100?
   Usage: node tools/measure/spawn-side.mjs [secs] counts   (pace from PACE, default 1.0) */
if (process.argv[3] === "counts") {
  const pace = Number(process.env.PACE ?? 1.0), mins = secs / 60;
  for (const [on, cars] of [[false, 100], [true, 100], [true, 85], [true, 70], [true, 60], [true, 50]]) {
    const rows = [1, 2, 3].map((sd) => one(sd, pace, on, cars)), m = (k) => rows.reduce((t, r) => t + r[k], 0) / rows.length;
    console.log(`pace ${pace}, rule ${on ? "ON " : "OFF"}, ${String(cars).padStart(3)} cars: seen ${(m("seen") / mins).toFixed(1)}/min · passes ${(m("passes") / mins).toFixed(1)}/min · crashes ${m("crashes").toFixed(1)} · cars on map ${m("cars").toFixed(0)}`);
  }
  process.exit(0);
}
for (const pace of [1.0, 1.19]) for (const on of [false, true]) {
  const rows = [1, 2, 3].map((s) => one(s, pace, on)), m = (k) => rows.reduce((s, r) => s + r[k], 0) / rows.length, mins = secs / 60;
  console.log(`pace ${pace}, side rule ${on ? "ON " : "OFF"}: cars within 150 m ${(m("seen") / mins).toFixed(1)}/min · passes ${(m("passes") / mins).toFixed(1)}/min · per car on the map: ${(m("seen") / mins / m("cars")).toFixed(3)} seen, ${(m("passes") / mins / m("cars")).toFixed(3)} passes · crashes ${m("crashes").toFixed(1)}`);
}
