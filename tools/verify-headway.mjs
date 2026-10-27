/* THE FOLLOWING GAP ON THE THROTTLE BAR (27 October; sim/drive.js headwayOf).
   Held event by event against an independent statement of the same thing
   (DECISIONS 10.23: totals hide the errors that matter): the car ahead from
   the cars' POSES alone -- the nearest whose body is wholly ahead of the
   player's and within half a lane of the player's line -- never from the
   lane index or the queue rule the readout reads.

   THE BOUNDARY, said because it is invisible in the output (CLAUDE.md item
   4): the pose statement is a straight line, so on a bend or a skewed road
   it picks the wrong lane, and it cannot tell a car following the player's
   path through a box from one crossing it. So it is compared where it is
   sound -- player and car on the same lane by the map, not in a box, the
   car not changing lane -- and there the two must name the same car at the
   same gap. Everywhere, the readout must never name a car beside the player
   (a negative gap) or one that has taken another exit.

   1. Where both are sound, the same car, the gap within 0.5 m.
   2. Never a car alongside, never a car on another exit.
   3. It appears: the shaped highway and the city both show it often. */
import { worldFor } from "../src/sim/scene.js";
import { TEST_MAPS } from "../src/map/samples.js";
import { step, poseOf } from "../src/sim/crossing.js";
import { withDriver, headwayOf } from "../src/sim/drive.js";
import { placeOf } from "../src/sim/placement.js";
import { goodStep } from "./lib/good-driver.mjs";

let failed = 0;
const check = (ok, what) => { console.log(`  ${ok ? "ok  " : "FAIL"} ${what}`); if (!ok) failed++; };

function drive(id, secs) {
  const raw = TEST_MAPS.find((m) => m.id === id).build();
  let { world: w, me } = worldFor(1, 50, 2.0, true, 180, raw, raw.sections?.[0]?.start ?? null, false);
  const me0 = me, sc = { me, args: [1], saveWallet: false };
  const out = { samples: 0, shown: 0, sound: 0, agree: 0, worst: 0, misses: [], alongside: 0, otherExit: 0 };
  for (let i = 0; i < secs * 20; i++) {
    if (!me || me.atEdge) { me = { ...me0 }; w = withDriver(w, me); }
    me = goodStep(me, w, sc, { overtake: true, pace: 1.19 });
    sc.me = me;
    w = step(withDriver(w, me));
    if (i % 10) continue;
    out.samples++;
    const hw = headwayOf(me, w);
    if (hw) {
      out.shown++;
      if (hw.clear < 0) out.alongside++;
      const L = w.course.at[me.k ?? 0].layout, c = w.actors.find((a) => a.id === hw.id);
      /* Another exit: past its box onto a road the player is not taking -- unless it is still changing lane, when the sim counts it in both (lanechange.js). */
      if (c && !c.lc && (c.k ?? 0) === (me.k ?? 0) && c.s > L.paths[c.route].clearAt && L.paths[c.route].to !== L.paths[me.route].to && placeOf(w.course, c.k ?? 0, c.route, c.s)?.lane !== placeOf(w.course, me.k ?? 0, me.route, me.s)?.lane) out.otherExit++;
    }
    /* The independent statement, by poses. */
    const p = poseOf(w, me), h = (p.rot * Math.PI) / 180, ux = Math.cos(h), uy = Math.sin(h);
    let best = null;
    for (const a of w.actors) {
      if (a.player || a.parked) continue;
      const q = poseOf(w, a), dx = q.x - p.x, dy = q.y - p.y, along = dx * ux + dy * uy, side = -dx * uy + dy * ux;
      const clear = along - (p.length + q.length) / 2;
      if (clear < 0 || Math.abs(side) > 1.8 || Math.abs((q.z ?? 0) - (p.z ?? 0)) > 2) continue;
      if (!best || clear < best.clear) best = { clear, a };
    }
    if (!best || me.v < 2 || best.clear / me.v >= 5) continue;
    const pm = placeOf(w.course, me.k ?? 0, me.route, me.s), pa = placeOf(w.course, best.a.k ?? 0, best.a.route, best.a.s);
    if (!pm || !pa || pm.lane !== pa.lane || best.a.lc || best.clear > 40) continue;
    out.sound++;
    if (hw && hw.id === best.a.id && Math.abs(hw.clear - best.clear) < 0.5) { out.agree++; out.worst = Math.max(out.worst, Math.abs(hw.clear - best.clear)); }
    else if (out.misses.length < 5) out.misses.push(`t ${w.t.toFixed(1)}: poses ${best.a.id} at ${best.clear.toFixed(1)} m, readout ${hw ? `${hw.id} at ${hw.clear.toFixed(1)} m` : "nothing"}`);
  }
  return out;
}

for (const [id, label] of [["test-loop", "the endless highway, shaped"], ["city", "the city"]]) {
  console.log(`\n${label}, 180 cars, the good driver at 119% for two minutes`);
  const r = drive(id, 120);
  check(r.sound >= 20 && r.agree === r.sound, `where both statements are sound, the same car at the same gap: ${r.agree} of ${r.sound} (worst ${r.worst.toFixed(2)} m)${r.misses.length ? `\n         ${r.misses.join("\n         ")}` : ""}`);
  check(r.alongside === 0 && r.otherExit === 0, `never a car beside the player (${r.alongside}) or on another exit (${r.otherExit})`);
  check(r.shown >= r.samples / 10, `it is shown: ${r.shown} of ${r.samples} samples`);
}
console.log(failed ? `\n${failed} FAILURE(S)` : "\nOK: the following gap on the throttle bar names the car the poses say is ahead in the player's lane, at the same gap, and never one beside them or on another exit.");
process.exit(failed ? 1 : 0);
