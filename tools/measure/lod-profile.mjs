/* SIMULATOR 1.2.19.  The shaped drive's step, profiled by function (the player at 119%, look-away off). node tools/measure/lod-profile.mjs [cars] */
import { Session } from "node:inspector/promises";
import { worldFor } from "../../src/sim/scene.js";
import { TEST_MAPS } from "../../src/map/samples.js";
import { step } from "../../src/sim/crossing.js";
import { withDriver } from "../../src/sim/drive.js";
import { goodStep } from "../lib/good-driver.mjs";
const cars = Number(process.argv[2] ?? 180);
const loop = TEST_MAPS.find((m) => m.id === "test-loop").build();
let { world: w, me } = worldFor(1, 50, 2.0, true, cars, loop, loop.sections?.[0]?.start ?? null, false);
w = { ...w, shape: true };
const sc = { me, args: [1], saveWallet: false };
let stepMs = 0;
const tick = (timed) => { me = goodStep(me, w, sc, { overtake: true, pace: 1.19 }); sc.me = me; const x = withDriver(w, me); const t0 = performance.now(); w = step(x); if (timed) stepMs += performance.now() - t0; };
for (let i = 0; i < 2400; i++) tick(false);
const session = new Session(); session.connect();
await session.post("Profiler.enable"); await session.post("Profiler.setSamplingInterval", { interval: 100 }); await session.post("Profiler.start");
const N = 1200;
for (let i = 0; i < N; i++) tick(true);
const { profile } = await session.post("Profiler.stop");
const by = new Map(profile.nodes.map((n) => [n.id, n])), parent = new Map();
for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
const name = (n) => `${n.callFrame.functionName || "(anon)"} ${n.callFrame.url.split("/").pop()}:${n.callFrame.lineNumber + 1}`;
const inc = new Map(); let total = 0, gc = 0;
for (const id0 of profile.samples) {
  const chain = []; for (let id = id0; id != null; id = parent.get(id)) chain.push(by.get(id));
  if (!chain.some((n) => n.callFrame.functionName === "step" && /crossing/.test(n.callFrame.url))) { if (chain[0].callFrame.functionName === "(garbage collector)") gc++; continue; }
  total++;
  const seen = new Set();
  for (const n of chain) { const k = name(n); if (!seen.has(k)) { seen.add(k); inc.set(k, (inc.get(k) ?? 0) + 1); } }
}
const ms = stepMs / N;
console.log(`${cars} cars shaped: step ${ms.toFixed(2)} ms; GC samples outside step ${gc} vs ${total} in step`);
for (const [k, c] of [...inc].filter(([k]) => /\.js:/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, 40)) console.log(`  ${(100 * c / total).toFixed(0).padStart(3)}%  ${(ms * c / total).toFixed(2).padStart(6)} ms  ${k}`);
for (const F of (process.env.FOCUS ?? "").split(",").filter(Boolean)) {
  const under = new Map(); let tot = 0;
  for (const id0 of profile.samples) {
    const chain = []; for (let id = id0; id != null; id = parent.get(id)) chain.push(by.get(id));
    const i = chain.findIndex((n) => n.callFrame.functionName === F); if (i < 0) continue; tot++;
    const child = i === 0 ? "(self)" : name(chain[i - 1]); under.set(child, (under.get(child) ?? 0) + 1);
  }
  console.log(`under ${F}: ${(ms * tot / total).toFixed(2)} ms`);
  for (const [k, c] of [...under].sort((a, b) => b[1] - a[1]).slice(0, 10)) console.log(`  ${(ms * c / total).toFixed(2).padStart(6)} ms  ${k}`);
}
