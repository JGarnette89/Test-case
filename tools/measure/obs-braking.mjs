/* Observation on the decision, across ALL driving: hard braking (> 3.5 m/s^2)
   per driver-minute by observation deficit, with drivers looking away and
   without, same seeds. If the gap between poor and sound observers appears
   only when they look away, it is observation's -- late reaction to what the
   car ahead did -- and not something else poor observers happen to carry.
   Run: node tools/measure/obs-braking.mjs [map test-1|city|test-peds] [secs] [seeds...] */
import { loadMap } from "../../src/map/load.js";
import { TEST_MAPS } from "../../src/map/samples.js";
import { seedGraph, step } from "../../src/sim/crossing.js";
import { deficitOf } from "../../src/core/driver.js";
import { DT } from "../../src/sim/traffic.js";

export function hardBraking(mapId, secs, seeds, perceive, extra = {}) {
  const band = { sound: { ticks: 0, hard: 0, events: 0 }, poor: { ticks: 0, hard: 0, events: 0 } };
  for (const seed of seeds) {
    let w = { ...seedGraph(seed, 50, loadMap(TEST_MAPS.find((t) => t.id === mapId).build()), { target: 120, posted: true, perceive }), ...extra };
    const wasHard = new Map();
    for (let i = 0; i < secs / DT; i++) {
      w = step(w);
      for (const a of w.actors) {
        if (a.player || a.crash) continue;
        const d = deficitOf(a.ratings ?? {}, "observation").deficit ?? 0;
        const b = d < 0.2 ? band.sound : d > 0.5 ? band.poor : null;
        if (!b) continue;
        b.ticks++;
        const hard = -(a.a ?? 0) > 3.5;
        if (hard) b.hard++;
        if (hard && !wasHard.get(a.id)) b.events++;
        wasHard.set(a.id, hard);
      }
    }
  }
  const per = (b) => b.events / Math.max(1e-9, (b.ticks * DT) / 60);
  return { sound: per(band.sound), poor: per(band.poor), band };
}

if (process.argv[1]?.endsWith("obs-braking.mjs")) {
  const mapId = process.argv[2] ?? "test-1", secs = Number(process.argv[3] ?? 300);
  const seeds = process.argv.slice(4).map(Number);
  if (!seeds.length) seeds.push(3, 5);
  for (const [perceive, extra, note] of [[false, {}, ""], [true, {}, ""], [true, { pedsAlwaysSeen: true }, ", people on foot always seen"], [true, { ignorePeds: true }, ", people on foot ignored entirely"]]) {
    const r = hardBraking(mapId, secs, seeds, perceive, extra);
    console.log(`${mapId}, drivers look away ${perceive ? "ON " : "off"}${note}: hard-braking events per driver-minute -- sound observers ${r.sound.toFixed(3)}, poor ${r.poor.toFixed(3)} (x${(r.poor / Math.max(1e-9, r.sound)).toFixed(1)})`);
  }
}
