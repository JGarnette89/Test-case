/* Where lane changing's share of a step goes, by function (self and inclusive, lanechange.js only), at a fleet on test map 1 with the neighbour index off, as verify-lanes measures it. Usage: node tools/measure/lane-profile.mjs [cars=300] */
import { Session } from "node:inspector/promises";
import { loadMap } from "../../src/map/load.js";
import { testMap1 } from "../../src/map/samples.js";
import { seedGraph, step } from "../../src/sim/crossing.js";
const loaded = loadMap(testMap1());
let w = { ...seedGraph(3, 50, loaded, { target: Number(process.argv[2] ?? 300), posted: true, laneChanges: true, keepRight: true }), noIndex: true };
for (let i = 0; i < 200; i++) w = step(w);
const session = new Session(); session.connect();
await session.post("Profiler.enable"); await session.post("Profiler.setSamplingInterval", { interval: 100 }); await session.post("Profiler.start");
for (let i = 0; i < 600; i++) w = step(w);
const { profile } = await session.post("Profiler.stop");
const by = new Map(profile.nodes.map((n) => [n.id, n])), parent = new Map();
for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
const name = (n) => `${n.callFrame.functionName || "(anon)"} ${n.callFrame.url.split("/").pop()}:${n.callFrame.lineNumber + 1}`;
const inc = new Map(), self = new Map(); let total = 0;
for (const id0 of profile.samples) {
  total++; const leaf = by.get(id0); self.set(name(leaf), (self.get(name(leaf)) ?? 0) + 1);
  const seen = new Set(); let id = id0;
  while (id != null) { const nm = name(by.get(id)); if (!seen.has(nm)) { seen.add(nm); inc.set(nm, (inc.get(nm) ?? 0) + 1); } id = parent.get(id); }
}
const top = (m, re) => [...m].filter(([k]) => re.test(k)).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, v]) => `  ${(100 * v / total).toFixed(1)}%  ${k}`).join("\n");
console.log("inclusive, lanechange.js:\n" + top(inc, /lanechange/)); console.log("self, all src:\n" + top(self, /\.js:/));
