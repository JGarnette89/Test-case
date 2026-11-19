/* TRACE ONE PRE-ROLL CRASH (DECISIONS 10.148): the two cars of the first crash a seed's 15 s pre-roll records on test-highway-gen, every 0.25 s from 8 s before it: route, s, v, lane change, who leads, the gap to the leader (bumper to bumper along the road), and the lane's end. Usage: node tools/measure/preroll-crash-trace.mjs [seed=4] */
import { TEST_MAPS } from "../../src/map/samples.js";
import { worldFor } from "../../src/sim/scene.js";
import { step } from "../../src/sim/crossing.js";
import { DT } from "../../src/sim/traffic.js";
const seed = Number(process.argv[2] ?? 4);
const r = TEST_MAPS.find((m) => m.id === "test-highway-gen").build();
const total = worldFor(seed, 50, 2.0, true, null, r, r.sections[0].start, false, false, { preroll: 15 }).world;
const tc = (total.crashes ?? [])[0]; if (!tc) { console.log("no crash"); process.exit(0); }
console.log(`seed ${seed}: crash at t=${tc.t.toFixed(2)} between ${tc.a} and ${tc.b}`);
let { world: w } = worldFor(seed, 50, 2.0, true, null, r, r.sections[0].start, false, false, { preroll: 0 });
const rows = [];
for (let i = 0; i < (tc.t + 1) / DT; i++) { w = step(w);
  if (w.t >= tc.t - 8 && i % 5 === 0) { const get = (id) => w.actors.find((a) => a.id === id); const A = get(tc.a), B = get(tc.b); if (!A || !B) continue;
    const lead = (X) => { const l = w.actors.find((a) => a.id === X.leadId); return l ? `${l.id}(s${Math.round(l.s)} v${(l.v ?? 0).toFixed(1)})` : "-"; };
    rows.push(`${w.t.toFixed(2)} ${tc.a}: s${A.s.toFixed(1)} v${(A.v ?? 0).toFixed(1)} lead ${lead(A)} lc ${A.lc ? "Y" : "-"} | ${tc.b}: s${B.s.toFixed(1)} v${(B.v ?? 0).toFixed(1)} lead ${lead(B)} lc ${B.lc ? "Y" : "-"} | gap ${(Math.abs(A.s - B.s) - 4.5).toFixed(1)} m`); } }
console.log(rows.join("\n"));
