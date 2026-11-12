/* WHICH SWITCH MAKES THE TRAFFIC CRASH? (12 November, DECISIONS 10.70.) The ordinary world (`worldFor`: brake reaction ON, perception off) crashes about 1.4 times in three minutes on test map 1 at 260 cars; the world
   `verify-crashes` calls "where crashes happen" (`seedGraph` with `perceive: true`, brake reaction OFF by default) crashes about never. This runs the 2 x 2 of the two switches and nothing else:
   test map 1, 260 cars, 180 s, no player, no checks. Usage: PERC=0|1 BR=0|1 node tools/measure/crash-matrix.mjs [seed]. Prints one line: crashes between vehicles. Asserts nothing. */
import { loadMap } from "../../src/map/load.js";
import { TEST_MAPS } from "../../src/map/samples.js";
import { seedGraph, step } from "../../src/sim/crossing.js";
import { DT } from "../../src/sim/traffic.js";
const seed = +(process.argv[2] ?? 1), perc = process.env.PERC === "1", br = process.env.BR === "1", mapId = process.env.MAP ?? "test-1", cars0 = +(process.env.CARS ?? 260), played = process.env.PLAYED === "1";   // PLAYED=1: the flags `worldFor` gives the player (brake reaction, walkers, rivals)   // MAP and CARS: the density sweep
let w = seedGraph(seed, 50, loadMap(TEST_MAPS.find((m) => m.id === mapId).build()), { target: cars0, posted: true, perceive: perc, brakeReaction: br || played, ...(+(process.env.MERGETOL ?? 0) ? { mergeTolerance: +process.env.MERGETOL } : {}), ...(played ? { walkers: true, rivals: true } : {}) });
/* EACH CRASH DESCRIBED (DETAIL=1, or always when PLAYED=1): are the two cars in the merge zone (either is on or entering an acceleration lane, on a slip road, or changing lane), and are they following one another on one route? The highway question: whether the merges are in the crashes. */
const hist = []; let seen = 0; const kinds = { total: 0, sameRoute: 0, mergeZone: 0, laneChange: 0, under20kmh: 0 };
const zoneOf = (world, a) => { if (!a) return { zone: false, lc: false }; const L = world.course.at[a.k ?? 0]?.layout, pth = L?.paths[a.route]; const to = L?.legs[pth?.to], from = L?.legs[pth?.from]; return { zone: !!(to?.accel || /^on-/.test(from?.road ?? "")), lc: !!a.lc }; };
for (let i = 0; i < 180 / DT; i++) {
  w = step(w); hist.push(w); if (hist.length > 21) hist.shift();
  const cr = w.crashes ?? [];
  while (seen < cr.length) {
    const c = cr[seen++]; if (String(c.a).startsWith("ped-") || String(c.b).startsWith("ped-")) continue;
    const ww = hist[Math.max(0, hist.length - 11)], A = ww.actors.find((x) => x.id === c.a), B = ww.actors.find((x) => x.id === c.b), za = zoneOf(ww, A), zb = zoneOf(ww, B);
    kinds.total++; if (A && B && A.route === B.route) kinds.sameRoute++; if (za.zone || zb.zone) kinds.mergeZone++; if (za.lc || zb.lc) kinds.laneChange++; if (Math.max(A?.v ?? 0, B?.v ?? 0) * 3.6 < 20) kinds.under20kmh++;
    if (process.env.DETAIL) console.log(`CRASH t=${w.t.toFixed(1)} ${A?.route} @${((A?.v ?? 0) * 3.6).toFixed(0)} km/h / ${B?.route} @${((B?.v ?? 0) * 3.6).toFixed(0)} km/h  merge zone ${za.zone || zb.zone}  lane change ${za.lc || zb.lc}`);
  }
}
const cars = (w.crashes ?? []).filter((c) => !String(c.a).startsWith("ped-") && !String(c.b).startsWith("ped-"));
console.log(JSON.stringify({ map: mapId, mergeTolerance: +(process.env.MERGETOL ?? 0) || null, cars: cars0, perceive: perc, brakeReaction: br, seed, kinds, crashes: cars.length, people: (w.crashes ?? []).length - cars.length }));
