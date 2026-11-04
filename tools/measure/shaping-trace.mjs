/* WAS SHAPING'S ENCOUNTER BOOST PARTLY CARS BUNCHED BEHIND LEADERS THAT WERE NOT
   THERE? (4 November; SIMULATOR IN FLIGHT 11.) One drive at verify-shaping's own
   settings (the endless highway, 160 cars, the good driver at 119%, 180 s), one
   JSON line out:
     met          cars met a minute (encounters.js, the counter the check reads)
     metPhantom   of those, the share following a phantom when first met
     nearPhantom  of all following by cars within 100 m of the player, each second,
                  the share against a phantom (straight line more than 5 m beyond
                  the gap plus half-lengths: tools/measure/phantom-leader.mjs)
     near         mean cars within 100 m, each second (independent of the counter)
     nearSpeed    their mean v / v0, so a jam reads as a jam
     playerV      the player's mean speed; stopped: the share of seconds under 2 m/s
   Usage: node tools/measure/shaping-trace.mjs seed shaped(1|0)
          node tools/measure/shaping-trace.mjs --sum file-a file-b */
import fs from "node:fs";

if (process.argv[2] === "--sum") {
  const read = (f) => fs.readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
  const ratio = (rows, seeds) => mean(seeds.map((s) => rows.find((r) => r.seed === s && r.shaped).met)) / Math.max(1e-9, mean(seeds.map((s) => rows.find((r) => r.seed === s && !r.shaped).met)));
  const seedsOf = (rows) => [...new Set(rows.map((r) => r.seed))].sort((a, b) => a - b);
  /* Seeded, so the interval is the same every time it is read. */
  let x = 12345; const rnd = () => (x = (x * 1664525 + 1013904223) >>> 0) / 2 ** 32;
  const boot = (fn, seeds) => { const v = []; for (let i = 0; i < 4000; i++) v.push(fn(seeds.map(() => seeds[Math.floor(rnd() * seeds.length)]))); v.sort((a, b) => a - b); return [v[100], v[3899]]; };
  const [fa, fb] = process.argv.slice(3), A = read(fa), B = read(fb), seeds = seedsOf(A).filter((s) => seedsOf(B).includes(s));
  for (const [name, rows] of [[fa, A], [fb, B]]) {
    const on = rows.filter((r) => r.shaped), off = rows.filter((r) => !r.shaped), [lo, hi] = boot((s) => ratio(rows, s), seeds);
    console.log(`\n${name}: ratio over ${seeds.length} seeds ${ratio(rows, seeds).toFixed(2)} (95% over seeds ${lo.toFixed(2)}-${hi.toFixed(2)}); first eight ${ratio(rows, seeds.slice(0, 8)).toFixed(2)}`);
    console.log(`  shaped met/min ${on.map((r) => r.met.toFixed(1)).join(" ")} | unshaped mean ${mean(off.map((r) => r.met)).toFixed(1)}`);
    console.log(`  shaped: met following a phantom ${(100 * mean(on.map((r) => r.metPhantom))).toFixed(1)}%, near following against a phantom ${(100 * mean(on.map((r) => r.nearPhantom))).toFixed(1)}%, cars within 100 m ${mean(on.map((r) => r.near)).toFixed(1)} (unshaped ${mean(off.map((r) => r.near)).toFixed(1)}), their v/v0 ${mean(on.map((r) => r.nearSpeed)).toFixed(2)} (unshaped ${mean(off.map((r) => r.nearSpeed)).toFixed(2)}), player ${mean(on.map((r) => r.playerV)).toFixed(1)} m/s, stopped ${(100 * mean(on.map((r) => r.stopped))).toFixed(1)}%`);
    const top = [...on].sort((a, b) => b.met - a.met), hi4 = top.slice(0, 4), lo4 = top.slice(-4);
    console.log(`  highest four seeds (${hi4.map((r) => r.seed).join(",")}): met ${mean(hi4.map((r) => r.met)).toFixed(1)}, met following a phantom ${(100 * mean(hi4.map((r) => r.metPhantom))).toFixed(1)}%, player ${mean(hi4.map((r) => r.playerV)).toFixed(1)} m/s, near v/v0 ${mean(hi4.map((r) => r.nearSpeed)).toFixed(2)}, stopped ${(100 * mean(hi4.map((r) => r.stopped))).toFixed(1)}%`);
    console.log(`  lowest four seeds  (${lo4.map((r) => r.seed).join(",")}): met ${mean(lo4.map((r) => r.met)).toFixed(1)}, met following a phantom ${(100 * mean(lo4.map((r) => r.metPhantom))).toFixed(1)}%, player ${mean(lo4.map((r) => r.playerV)).toFixed(1)} m/s, near v/v0 ${mean(lo4.map((r) => r.nearSpeed)).toFixed(2)}, stopped ${(100 * mean(lo4.map((r) => r.stopped))).toFixed(1)}%`);
  }
  const [dlo, dhi] = boot((s) => ratio(A, s) - ratio(B, s), seeds);
  console.log(`\nthe difference in ratio, ${fa} minus ${fb}: ${(ratio(A, seeds) - ratio(B, seeds)).toFixed(2)} (95% over seeds ${dlo.toFixed(2)} to ${dhi.toFixed(2)})${dlo <= 0 && dhi >= 0 ? ": NOT told apart" : ""}`);
  process.exit(0);
}

const { TEST_MAPS } = await import("../../src/map/samples.js");
const { worldFor } = await import("../../src/sim/scene.js");
const { step, poseOf, whatStops } = await import("../../src/sim/crossing.js");
const { withDriver } = await import("../../src/sim/drive.js");
const { DT, lenOf } = await import("../../src/sim/traffic.js");
const { goodStep } = await import("../lib/good-driver.mjs");
const { noticeTick } = await import("../../src/sim/session.js");
const { newEncounters, encounterTick, encounterSummary } = await import("../../src/sim/encounters.js");

const seed = Number(process.argv[2]), shaped = process.argv[3] === "1", SECS = 180, CARS = 160;
const raw = TEST_MAPS.find((m) => m.id === "test-loop").build();
let { world: w, me } = worldFor(seed, 50, 2.0, true, CARS, raw, raw.sections?.[0]?.start ?? null, false);
w = shaped ? { ...w, shape: true } : { ...w, shape: false };
const me0 = me, sc = { me, args: [1], saveWallet: false }, enc = newEncounters();
const phantomIn = (world, a) => {
  const v = whatStops(a, world);
  if (!v.leader) return null;
  const L = world.actors.find((x) => x.id === v.leader.id);
  if (!L) return null;
  const p = poseOf(world, a), q = poseOf(world, L);
  return Math.hypot(q.x - p.x, q.y - p.y) > v.gap + (lenOf(a) + lenOf(L)) / 2 + 5;
};
let metSeen = new Set(), metN = 0, metPh = 0, followN = 0, followPh = 0, nearSum = 0, speedSum = 0, speedN = 0, vSum = 0, stopped = 0, secs = 0;
for (let n = 0; n < SECS / DT; n++) {
  if (me.atEdge) { me = { ...me0 }; w = withDriver(w, me); sc.me = me; }
  me = goodStep(me, w, sc, { overtake: true, pace: 1.19 });
  sc.me = me;
  const prev = w;
  w = step(withDriver(w, me));
  noticeTick(sc, { me: prev.actors.find((a) => a.player) ?? me, world: prev }, { me, world: w });
  encounterTick(enc, me, w);
  for (const id of enc.met) {
    if (metSeen.has(id)) continue;
    metSeen.add(id); metN++;
    const a = w.actors.find((x) => x.id === id);
    if (a && phantomIn(w, a)) metPh++;
  }
  if (n % 20) continue;
  secs++; vSum += me.v; if (me.v < 2) stopped++;
  const at = poseOf(w, me);
  for (const a of w.actors) {
    if (a.player || a.parked) continue;
    const q = poseOf(w, a);
    if (Math.hypot(q.x - at.x, q.y - at.y) > 100) continue;
    nearSum++; speedSum += (a.v ?? 0) / Math.max(1, a.v0 ?? a.v ?? 1); speedN++;
    const ph = phantomIn(w, a);
    if (ph != null) { followN++; if (ph) followPh++; }
  }
}
console.log(JSON.stringify({ seed, shaped, met: Number(encounterSummary(enc).metPerMin), metCars: metN, metPhantom: metPh / Math.max(1, metN), nearPhantom: followPh / Math.max(1, followN), near: nearSum / Math.max(1, secs), nearSpeed: speedSum / Math.max(1, speedN), playerV: vSum / Math.max(1, secs), stopped: stopped / Math.max(1, secs) }));
