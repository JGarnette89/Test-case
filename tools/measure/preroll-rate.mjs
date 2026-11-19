import { TEST_MAPS } from "../../src/map/samples.js";
import { worldFor } from "../../src/sim/scene.js";
import { IX } from "../../src/map/interchange.js";
IX.STYLE = process.argv[2]; const N = Number(process.argv[3] ?? 60), id = process.argv[4] ?? "test-highway-gen";
let crash = 0, hits = [], n = 0;
for (let seed = 1; seed <= N; seed++) { const r = TEST_MAPS.find((m) => m.id === id).build(), { world } = worldFor(seed, 50, 2.0, true, null, r, r.sections?.[0]?.start ?? null, false, false, { preroll: 15 }); n++; const cs = world.crashes ?? []; if (cs.length) { crash++; hits.push(`${seed}:${cs.length}`); } }
console.log(`${id} ${IX.STYLE}: ${crash} of ${n} seeds with a crash in the 15 s pre-roll (${hits.join(" ")})`);
