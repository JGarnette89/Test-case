/* contactsIn's answer on worlds made to have contacts (27 October): ordinary
   traffic no longer crashes, so an exact refactor of contact detection is
   compared old against new here -- a city and test map 1 run with trucks,
   and every two seconds a dozen cars cloned a few metres along their own
   path or beside it (several contacts a tick, the path that orders them).
   Prints one JSON line a snapshot; diff two runs' output.
   Usage: node tools/measure/contacts-dump.mjs > out.txt */
import { loadMap } from "../../src/map/load.js";
import { TEST_MAPS } from "../../src/map/samples.js";
import { seedGraph, step, contactsIn } from "../../src/sim/crossing.js";
import { rng } from "../../src/core/rng.js";
for (const id of ["city", "test-1", "test-loop"]) {
  const L = loadMap(TEST_MAPS.find((t) => t.id === id).build());
  let w = seedGraph(5, 50, L, { target: 220, posted: true, trucks: 0.1 });
  const r = rng(11);
  for (let i = 0; i < 60 * 20; i++) {
    w = step(w);
    if (i % 40) continue;
    const clones = [];
    for (let j = 0; j < 12; j++) {
      const a = w.actors[Math.floor(r() * w.actors.length)];
      if (!a || a.player) continue;
      clones.push({ ...a, id: `clone-${i}-${j}`, s: a.s + (r() - 0.5) * 8, crash: j % 3 === 0 ? { t: w.t, with: a.id, at: { x: 0, y: 0 } } : undefined });
    }
    const out = contactsIn({ ...w, actors: [...w.actors, ...clones] });
    console.log(JSON.stringify([id, i, out]));
  }
}
