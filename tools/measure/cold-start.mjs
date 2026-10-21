/* CRASHES FROM A COLD START (22 October). The maintainer's readout said "2
   crashes" on the endless highway; they were off screen and "the first one
   was almost immediate", while forty minutes of traffic alone over four
   seeds crashed never -- a startup transient diluted by the steady state.
   So: the world as #/map builds it (sim/scene.js worldFor), with the player
   placed where the section starts them, standing (or driving), stepped as
   the screen steps them -- many seeds, the first `secs` seconds, every crash
   with its time and who.
   DIAL=260@5 turns the screen's car dial to 260 five seconds in, as #/map writes it (the world's `target`).
   Usage: node tools/measure/cold-start.mjs [map=test-loop] [cars=259] [seeds=1-20] [secs=60] [player=stand|drive|none] */
import { worldFor, playerContact } from "../../src/sim/scene.js";
import { TEST_MAPS } from "../../src/map/samples.js";
import { step } from "../../src/sim/crossing.js";
import { stepDriver, withDriver } from "../../src/sim/drive.js";
import { DT } from "../../src/sim/traffic.js";

const [mapId = "test-loop", carsArg = "259", seedArg = "1-20", secsArg = "60", mode = "stand"] = process.argv.slice(2);
const [s0, s1] = seedArg.includes("-") ? seedArg.split("-").map(Number) : [Number(seedArg), Number(seedArg)];
const raw = TEST_MAPS.find((m) => m.id === mapId).build();
const start = raw.sections?.[0]?.start ?? null;
let total = 0, early = 0;
const firsts = [];
for (let seed = s0; seed <= s1; seed++) {
  let { world: w, me } = worldFor(seed, 50, 2.0, mode !== "none", Number(carsArg), raw, start, process.env.LOOK === "1");
  const t0 = w.t;
  const [dialTo, dialAt] = (process.env.DIAL ?? "").split("@").map(Number);
  for (let i = 0; i < Number(secsArg) / DT; i++) {
    if (dialTo && Math.abs(w.t - t0 - dialAt) < DT / 2) w = { ...w, target: dialTo };
    if (me) {
      const input = mode === "drive" ? { steer: -me.off * 0.3 - me.psi * 3, slider: me.v < 20 ? 0.5 : 0.05, assist: 0 } : { steer: 0, slider: 0, assist: 0 };
      me = stepDriver(me, input, w, DT);
      w = withDriver(w, me);
    }
    const n0 = (w.crashes ?? []).length;
    w = step(w);
    if (me) { const c = playerContact(w, me); w = c.world; if (c.hit) me = { ...me, v: 0 }; }
    for (const c of (w.crashes ?? []).slice(n0)) {
      total++;
      const at = w.t - t0;
      if (at < 30) early++;
      const who = (id) => { const a = w.actors.find((x) => x.id === id); if (!a) return id; const L = w.course.at[a.k].layout, p = L.paths[a.route]; return `${id}(${a.kind ?? "car"} ${L.legs[p.from]?.road}->${L.legs[p.to]?.road} s${a.s.toFixed(0)}${a.lc ? " lc" + (a.lc.merge ? "-merge" : "") : ""})`; };
      const line = `seed ${seed} t=${at.toFixed(1)}s ${c.a === "player" || c.b === "player" ? "WITH PLAYER" : "traffic"}: ${who(c.a)} x ${who(c.b)}`;
      console.log(line);
      if (!firsts.some((f) => f.startsWith(`seed ${seed} `))) firsts.push(line);
    }
  }
}
console.log(`${mapId}, ${carsArg} cars, player ${mode}, seeds ${s0}-${s1}, first ${secsArg} s: ${total} crashes, ${early} in the first 30 s`);
