/* WHAT THE MAINTAINER'S RULING ON COMMITMENT DOES TO WHAT IS MEASURED (5 November; DECISIONS
   10.45: past the line is not committed; "the car is committed only when it's driving into
   the lane"). Nothing changed in the sim.
   1. THE ROOM: per approach and crossing road, from the stop line to where the paths first
      conflict (conflictOf .b, where a car's centre meets the region), by intent. The creep
      limit is the nearest such point, among roads on another approach.
   2. THE OVERSHOOTS: each car held at its line that crosses it moving (as
      overshoot-hold.mjs), followed to where it ends: stopped short of the conflict with the
      road it was held for, or went in. Short of it, by the ruling, it never left "creeping".
   3. THE WRONG YIELD: distinct pairs where a driver is held by a car the rules count as
      committed ONLY by position: past its line, not going, short of the conflict with them.
   Usage: node commitment.mjs seeds(comma) [cars=150] */
const [seedsArg, carsArg = "150"] = process.argv.slice(2);
const { loadMap } = await import("../../src/map/load.js");
const { TEST_MAPS } = await import("../../src/map/samples.js");
const { seedGraph, step, whatStops, layoutOf, blockedBy, conflictOf, waitAt } = await import("../../src/sim/crossing.js");
const { DT } = await import("../../src/sim/traffic.js");
const city = loadMap(TEST_MAPS.find((t) => t.id === "city").build());
const med = (a) => { const q = [...a].sort((x, y) => x - y); return q[q.length >> 1] ?? null; };
const out = { seeds: seedsArg, room: {}, overshoots: 0, stoppedShort: 0, wentIn: 0, unknown: 0, hidden: { stoppedShort: 0, wentIn: 0, unknown: 0 }, car: { stoppedShort: 0, wentIn: 0, unknown: 0 }, wrongYieldPairs: 0, heldPairs: 0, wrongYieldThemMoving: 0, wrongYieldThemStopped: 0, wrongYieldEntered: 0, wrongYieldStopped: 0 };
/* 1, once. */
{
  const w0 = seedGraph(1, 50, city, { target: 0, posted: true, every: 1e9 });
  const rooms = {};
  for (const n of w0.course.at) {
    const L = n.layout;
    for (const [r, p] of Object.entries(L.paths)) {
      const base = L.legs[p.from]?.base ?? p.from;
      let near = Infinity;
      for (const [r2, p2] of Object.entries(L.paths)) {
        if (r2 === r || (L.legs[p2.from]?.base ?? p2.from) === base) continue;
        const m = conflictOf(L, r2, r);
        if (m) near = Math.min(near, m.b);
      }
      if (near < Infinity) (rooms[p.intent] ??= []).push(near - p.stopAt);
    }
  }
  for (const [k, a] of Object.entries(rooms)) { const q = [...a].sort((x, y) => x - y); out.room[k] = { n: a.length, min: +q[0].toFixed(1), p25: +q[q.length >> 2].toFixed(1), median: +med(a).toFixed(1), max: +q[q.length - 1].toFixed(1), under2: a.filter((x) => x < 2).length, under5: a.filter((x) => x < 5).length }; }
}
for (const seed of seedsArg.split(",").map(Number)) {
  let w = seedGraph(seed, 50, city, { target: Number(carsArg), posted: true, rivals: true });
  const hold = new Map(), follow = new Map(), held = new Set(), wrong = new Map();
  for (let i = 0; i < 600 / DT; i++) {
    const prev = w;
    const sample = i % 5 === 0;
    for (const a of prev.actors) {
      if (a.player || a.crash) continue;
      const v = whatStops(a, prev);
      const isLine = v.held && v.leader?.id === "line";
      if (!isLine) { hold.delete(a.id); }
      const L = layoutOf(prev, a), mine = L.paths[a.route], k = a.k ?? 0, live = prev.lights?.[k]?.live ?? null;
      if (isLine && !hold.has(a.id)) {
        const named = prev.actors.filter((c) => c.id !== a.id && (c.k ?? 0) === k && blockedBy(a, c, L, a.caution, prev.t, live));
        let at = Infinity;
        for (const c of named) { const m = conflictOf(L, c.route, a.route); if (m) at = Math.min(at, m.b); }
        if (at === Infinity) { const base = L.legs[mine.from]?.base ?? mine.from; for (const [r2, p2] of Object.entries(L.paths)) { if (r2 === a.route || (L.legs[p2.from]?.base ?? p2.from) === base) continue; const m = conflictOf(L, r2, a.route); if (m) at = Math.min(at, m.b); } }
        hold.set(a.id, { at, why: v.byHidden ? "hidden" : "car" });
      }
      if (sample && v.held && !a.going) {
        for (const c of prev.actors) {
          if (c.id === a.id || (c.k ?? 0) !== k || !blockedBy(a, c, L, a.caution, prev.t, live)) continue;
          const key = `${a.id}|${c.id}|${k}`;
          held.add(key);
          const theirs = L.paths[c.route], m = conflictOf(L, c.route, a.route);
          if (m && !c.going && c.s >= theirs.stopAt && c.s < m.a && !wrong.has(key)) wrong.set(key, { id: c.id, at: m.a, v: c.v, k, route: c.route });
        }
      }
    }
    w = step(w);
    for (const a of w.actors) {
      const h = hold.get(a.id);
      if (h) {
        const b = prev.actors.find((x) => x.id === a.id), P = layoutOf(w, a).paths[a.route];
        if (b && b.s < P.stopAt && a.s >= P.stopAt && a.v > 0.5) { out.overshoots++; follow.set(a.id, { ...h, route: a.route, k: a.k ?? 0, t: w.t }); hold.delete(a.id); }
      }
      const f = follow.get(a.id);
      if (f) {
        const tally = (x) => { out[x]++; out[f.why][x]++; follow.delete(a.id); };
        if ((a.k ?? 0) !== f.k || a.route !== f.route || a.s >= f.at) tally("wentIn");
        else if (a.v < 0.5) tally("stoppedShort");
        else if (w.t - f.t > 10) tally("unknown");
      }
    }
    for (const [key, x] of wrong) {
      const c = w.actors.find((q) => q.id === x.id);
      if (x.done) continue;
      if (!c || (c.k ?? 0) !== x.k || c.route !== x.route || c.s >= x.at) { x.done = "entered"; out.wrongYieldEntered++; }
      else if (c.v < 0.5) { x.done = "stopped"; out.wrongYieldStopped++; }
    }
  }
  out.heldPairs += held.size; out.wrongYieldPairs += wrong.size;
}
console.log(JSON.stringify(out));
