/* =====================================================================
   THE PROMOTION CHECK (DECISIONS 10.9, written before LOD; placement.js
   `admissible`). Whoever puts a car into the full simulation -- density
   shaping placing one ahead of the player, LOD promoting one out of a
   cheaper tier -- asks one test, and each refusal says which rule bit.
   Stated here, on the endless highway warmed a minute at 160 cars, with
   cases BUILT to trip exactly one rule each:

   1. A car on an open stretch of a through lane, at its own speed, is
      admitted.
   2. Each rule refuses what it is for: inside a box (lane), faster than its
      road (speed), inside the headway of the car ahead (ahead), just in
      front of a car closing on it (behind), on an off-ramp nobody is on,
      ahead of a car from the same approach (queue -- the lane index alone
      sees nobody there), level with a car in the next lane (space -- its own
      lane clear), and a first decision past its comfortable braking
      (arrival). The rules OVERLAP by design -- a car just behind another on
      its route is in its lane and its queue and near it in space -- so a
      case asserts its rule bites, and the queue and space cases are built
      where the lane index alone would admit (asserted "only that" at
      first, 22 October: the overlap is the design, not a failure).
   3. Every car density shaping places is admissible at the moment it is
      placed, re-asked here with the rule set the check builds itself.
   ===================================================================== */
import { loadMap } from "../src/map/load.js";
import { TEST_MAPS } from "../src/map/samples.js";
import { seedGraph, step, whatStops, pathOf, poseOf, carFor } from "../src/sim/crossing.js";
import { decide, vehicleOf } from "../src/sim/traffic.js";
import { cornerAccel } from "../src/sim/corner.js";
import { admissible, placeOf, laneIndexOf } from "../src/sim/placement.js";

let failed = 0;
const check = (ok, msg) => { console.log(`  ${ok ? "ok  " : "FAIL:"} ${msg}`); if (!ok) failed++; };
const loaded = loadMap(TEST_MAPS.find((m) => m.id === "test-loop").build());
let w = seedGraph(1, 50, loaded, { every: 2.0, target: 160, posted: true });
for (let i = 0; i < 1200; i++) w = step(w);
/* The model the car will drive by, as the step hands it to shaping. */
const opts = {
  poseOf,
  wantsAccel: (w2, car) => Math.min(decide(car, whatStops(car, w2)), cornerAccel(car, pathOf(w2, car))),
  brakeOf: (car) => car.brake ?? vehicleOf(car).brake,
};
const ask = (car) => admissible(w, car, opts);
const same = (r, rules) => JSON.stringify([...r.why].sort()) === JSON.stringify([...rules].sort());

/* A through route on the loop, and where on it nobody is near: the exit stretch's widest gap in its own lane. */
const L = (k) => w.course.at[k].layout;
let base = null;
for (let k = 0; k < w.course.at.length && !base; k++) {
  for (const [route, p] of Object.entries(L(k).paths)) {
    const from = L(k).legs[p.from], to = L(k).legs[p.to];
    if (!from?.road?.startsWith("loop-") || !to?.road?.startsWith("loop-") || from.accel || to.accel) continue;
    /* Anywhere along the path but the box: the approach to a node is most of its road. */
    for (let s = 60; s < p.length - 60 && !base; s += 20) {
      if (s > p.stopAt - 80 && s < p.clearAt + 60) continue;
      const at = placeOf(w.course, k, route, s);
      const xs = at ? (laneIndexOf(w).get(at.lane) ?? []).map((e) => e.c) : [];
      if (at && xs.every((c) => Math.abs(c - at.c) > 400) && w.actors.every((a) => { const q = poseOf(w, a), me = poseOf(w, { k, route, s }); return Math.hypot(q.x - me.x, q.y - me.y) > 60; })) base = { k, route, s };
    }
  }
}
const make = (k, route, s, v = null) => { const c = { ...carFor(w, 990000 + Math.floor(s), k, route, null, "car"), s }; return { ...c, v: v ?? c.v0 }; };

console.log("\n1. AN OPEN STRETCH IS ADMITTED");
{
  const r = base ? ask(make(base.k, base.route, base.s)) : { ok: false, why: ["no open stretch found"] };
  check(!!base && r.ok, `a car on an open stretch of a through lane, at its own speed: admitted (${r.why.join(", ") || "nothing refused it"})`);
}

console.log("\n2. EACH RULE REFUSES WHAT IT IS FOR");
{
  const p = L(base.k).paths[base.route];
  /* lane: inside the box. */
  check(same(ask(make(base.k, base.route, (p.stopAt + p.clearAt) / 2)), ["lane"]), "inside an intersection's box: refused for the lane, and only that");
  /* speed: five metres a second over its own road. */
  { const c = make(base.k, base.route, base.s); check(same(ask({ ...c, v: c.v0 + 5 }), ["speed"]), "faster than its own road lets it drive: refused for speed, and only that"); }
  /* ahead / behind: real cars on a through lane at speed, open road around them. */
  const lone = w.actors.find((a) => {
    const q = L(a.k).paths[a.route];
    if (a.lc || a.kind !== "car" || !q || (a.v ?? 0) < 15 || a.s < 60 || a.s > q.length - 60 || (a.s > q.stopAt - 80 && a.s < q.clearAt + 60)) return false;
    const at = placeOf(w.course, a.k, a.route, a.s), xs = laneIndexOf(w).get(at?.lane) ?? [];
    return at && xs.every((e) => e.a.id === a.id || Math.abs(e.c - at.c) > 250);
  });
  if (!lone) check(false, "no lone car at speed found to build the ahead and behind cases on");
  else {
    const half = 4.5;
    const behindIt = make(lone.k, lone.route, lone.s - (half + 20), lone.v);
    check(ask(behindIt).why.includes("ahead"), `twenty metres behind a car at its speed (${lone.id} at ${lone.v.toFixed(0)} m/s): refused for the car ahead (${ask(behindIt).why.join(", ")})`);
    const inFront = make(lone.k, lone.route, lone.s + (half + 15), Math.max(0, lone.v - 10));
    check(ask(inFront).why.includes("behind"), `fifteen metres in front of it, 10 m/s slower: refused for the car behind (${ask(inFront).why.join(", ")})`);
    /* space: the next lane of the same road, level with it. */
    const L0 = L(lone.k), q = L0.paths[lone.route], to = L0.legs[q.to];
    const next = Object.keys(L0.legs).find((id) => L0.legs[id].base === to.base && Math.abs((L0.legs[id].pos ?? 0) - (to.pos ?? 0)) === 1 && !L0.legs[id].accel && !L0.legs[id].bay);
    const r2 = next && Object.keys(L0.paths).find((r) => L0.paths[r].to === next && L0.paths[r].from !== q.from);
    if (!r2) check(false, "no lane beside the lone car to build the space case on");
    else {
      const b0 = make(lone.k, r2, lone.s), beside = { ...b0, v: Math.min(lone.v, b0.v0) };
      const rb = ask(beside);
      check(rb.why.includes("space") && !rb.why.includes("ahead") && !rb.why.includes("behind"), `level with it in the next lane of its road, its own lane clear: refused for space -- what the lane index alone would admit (${rb.why.join(", ")})`);
    }
  }
  /* queue: on an off-ramp, from the same approach as a car on the through lane, just ahead of it by the rule. */
  let qcase = null;
  for (const a of w.actors) {
    if (a.lc || a.kind !== "car") continue;
    const La = L(a.k), pa = La.paths[a.route];
    if (!pa || a.s < pa.clearAt + 5) continue;
    const ramp = Object.keys(La.paths).find((r) => La.paths[r].from === pa.from && La.legs[La.paths[r].to]?.road?.startsWith("off-"));
    if (!ramp || La.paths[ramp].length < a.s + 60) continue;
    /* Far enough ahead to be clear in space, close enough for its queue; and nobody on the ramp's own lane near. */
    const cand = make(a.k, ramp, a.s + 16, Math.max(0, (a.v ?? 0) - 8));
    const rc = ask(cand);
    if (!rc.why.includes("ahead") && !rc.why.includes("behind") && !rc.why.includes("space")) { qcase = cand; if (rc.why.includes("queue")) break; }
  }
  check(!!qcase && ask(qcase).why.includes("queue"), `on an off-ramp, ahead of a car from the same approach and slower, its own lane and space clear: refused for the queue by the rule -- what the lane index alone would admit (${qcase ? ask(qcase).why.join(", ") : "no case found"})`);
  /* arrival: the wiring -- a first decision past the comfortable rate refuses, whatever produced it. */
  const c = make(base.k, base.route, base.s);
  check(same(admissible(w, c, { ...opts, wantsAccel: () => -50 }), ["arrival"]), "a first decision past its own comfortable braking: refused for arrival, and only that");
}

console.log("\n3. EVERY CAR SHAPING PLACES IS ADMISSIBLE WHEN IT IS PLACED");
{
  /* Shaping on the endless highway, a player cruising at the maintainer's pace; each placement re-asked on the world it joined. */
  const { worldFor } = await import("../src/sim/scene.js");
  const { withDriver } = await import("../src/sim/drive.js");
  const { goodStep } = await import("./lib/good-driver.mjs");
  const raw = TEST_MAPS.find((m) => m.id === "test-loop").build();
  let { world: v, me } = worldFor(2, 50, 2.0, true, 160, raw, raw.sections[0].start, false);
  v = { ...v, shape: true };
  const sc = { me, args: [1], saveWallet: false };
  let placed = 0, refused = 0;
  const reasons = new Map();
  for (let n = 0; n < 90 * 20; n++) {
    me = goodStep(me, v, sc, { overtake: true, pace: 1.19 });
    sc.me = me;
    const prev = v;
    v = step(withDriver(v, me));
    for (const a of v.actors) {
      if (a.placed == null || prev.actors.some((b) => b.id === a.id)) continue;
      placed++;
      /* Re-asked against everybody else as they now are. */
      const r = admissible({ ...v }, a, { ...opts, actors: v.actors });
      if (!r.ok) { refused++; for (const x of r.why) reasons.set(x, (reasons.get(x) ?? 0) + 1); }
    }
  }
  check(placed > 30 && refused === 0, `${placed} cars placed in 90 s of shaping, every one admissible when re-asked on the world it joined${refused ? ` -- ${refused} not: ${[...reasons].map(([k, n]) => `${k} ${n}`).join(", ")}` : ""}`);
}

console.log(failed ? `\n${failed} FAILURE(S)` : "\nall passed");
process.exit(failed ? 1 : 0);
