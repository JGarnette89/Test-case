/* DOES THE PLAYER MEET THE SAME CARS AGAIN? (the lead's hypothesis for the loop disagreement, 17 Nov 2026: a circle cannot be outrun, so the population comes back round and traffic "arriving from behind" happens for free,
   which would make the spawn rule redundant there rather than ineffective.) The good driver drives `secs` s at pace 1.0; an ENTRY is a car going from farther than 150 m from the player to within it (by shaping's own signed window
   distance); a RE-ENTRY is an entry by a car (same id) that had already been within 150 m earlier in the drive. Prediction stated before it ran, from the hypothesis: the loop's re-entry share is high (a large share, say over a third)
   and the generated road's about zero (it cannot come back; the road ends). The rule is left as each map has it (the loop: off; the generated road: on); `RULE=off|on` forces it, asserted from cars placed behind.
   Usage: MAP=test-loop node tools/measure/recirculation.mjs [secs=480] */
import { TEST_MAPS } from "../../src/map/samples.js";
import { worldFor } from "../../src/sim/scene.js";
import { step } from "../../src/sim/crossing.js";
import { withDriver } from "../../src/sim/drive.js";
import { DT } from "../../src/sim/traffic.js";
import { windowOf } from "../../src/sim/shaping.js";
import { placeOf } from "../../src/sim/placement.js";
import { goodStep } from "../lib/good-driver.mjs";
const secs = Number(process.argv[2] ?? 480), MAP = process.env.MAP ?? "test-loop", RULE = process.env.RULE ?? "map";
const roadOf = (l) => String(l).split("#")[0];
const signed = (win, lane, c) => { const r = roadOf(lane); if (r === win.road) return c - win.at.c; const da = win.ahead.get(r); if (da != null) return da + c; const db = win.behind.get(r); if (db != null) return -(db + ((win.g.len.get(r) ?? 0) - c)); return null; };
const one = (seed) => {
  const raw = TEST_MAPS.find((m) => m.id === MAP).build();
  if (RULE !== "map" && raw.traffic) raw.traffic = { ...raw.traffic, spawnSide: RULE === "on" };
  let { world: w, me } = worldFor(seed, 50, 2.0, true, null, raw, raw.sections?.[0]?.start ?? null, false, false, { preroll: 15 });
  const sc = { me, args: [1], saveWallet: false }, inside = new Set(), everIn = new Set(), born = new Set(w.actors.map((a) => a.id));
  const lastIn = new Map(); let entries = 0, reentries = 0, gapShort = 0, gapMid = 0, gapLong = 0, behind = 0, laps = 0, d0 = null, ticks = 0;
  for (let n = 0; n < secs / DT; n++) {
    me = goodStep(me, w, sc, { overtake: true, pace: 1 }); sc.me = me; w = step(withDriver(w, me));
    const win = windowOf(w, w.actors); if (!win) continue;
    for (const a of w.actors) { if (!born.has(a.id)) { born.add(a.id); if (a.placed != null && !a.player) { const at = placeOf(w.course, a.k ?? 0, a.route, a.s); const d = at ? signed(win, at.lane, at.c) : null; if (d != null && d < 0) behind++; } } }
    if (n % 5) continue; ticks++;
    const now = new Set();
    for (const a of w.actors) { if (a.player || a.parked) continue; const at = placeOf(w.course, a.k ?? 0, a.route, a.s); if (!at) continue; const d = signed(win, at.lane, at.c); if (d != null && Math.abs(d) < 150) now.add(a.id); }
    for (const id of now) if (!inside.has(id)) { entries++; if (everIn.has(id)) { reentries++; const gap = w.t - lastIn.get(id); if (gap < 10) gapShort++; else if (gap < 60) gapMid++; else gapLong++; } everIn.add(id); }
    for (const id of now) lastIn.set(id, w.t);
    inside.clear(); for (const id of now) inside.add(id);
  }
  return { entries, reentries, gapShort, gapMid, gapLong, distinct: everIn.size, behind, edged: !!me.atEdge };
};
const seeds = [1, 2, 3, 4], rows = seeds.map(one), sum = (k) => rows.reduce((t, r) => t + r[k], 0);
console.log(`${MAP}, rule ${RULE} (placed behind: ${sum("behind")}), ${seeds.length} seeds x ${secs} s: ${sum("entries")} entries into the 150 m zone by ${sum("distinct")} distinct cars; RE-ENTRIES (a car already met once) ${sum("reentries")} = ${(100 * sum("reentries") / Math.max(1, sum("entries"))).toFixed(0)}% of entries; per seed ${rows.map((r) => `${r.reentries}/${r.entries}`).join(" ")}; BY HOW LONG THE CAR HAD BEEN AWAY: under 10 s (the boundary's flicker, not a return) ${sum("gapShort")}, 10 to 60 s ${sum("gapMid")}, over 60 s (a car met again after a real absence) ${sum("gapLong")} = ${(100 * sum("gapLong") / Math.max(1, sum("entries"))).toFixed(0)}% of entries; ${rows.filter((r) => r.edged).length} reached the road's end`);
