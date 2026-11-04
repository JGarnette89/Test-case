/* THE REAL-CAR LATE HOLDS: WHAT CHANGED ON THE TICK THE HOLD BEGAN? (5 November; the
   project lead's original question on IN FLIGHT 40, "why does the hold decision come late
   against a car visible for seconds".) For each overshoot held late by a named car, the
   tick before the hold began and the tick it began, asked of the blocker and of the driver:
     blocker   went from standing to moving, or moving to standing; arrived at the node
     accepted  the blocker's launch, or its "going"
     hidden    the blocker was hidden from this driver the tick before
     order     neither moved in state: blockedBy flipped on position alone, a question of
               who gets there first, the arrival comparison
   and how far ahead the conflict was by each: time for the blocker and for the driver to
   reach the meeting point. Also whether the driver could have seen it coming: was
   blockedBy, asked of the same car as if the driver had to give way, true earlier?
   Usage: node hold-flip.mjs <treeRoot> seeds(comma) [cars=150] */
const [root, seedsArg, carsArg = "150"] = process.argv.slice(2);
const I = (p) => import(`file:///${root}/src/${p}`);
const { loadMap } = await I("map/load.js");
const { TEST_MAPS } = await I("map/samples.js");
const { seedGraph, step, whatStops, layoutOf, blockedBy, conflictOf, poseOf, gapNeeded, pathOf } = await I("sim/crossing.js");
const { cornerAccel } = await I("sim/corner.js");
const { lenOf } = await I("sim/traffic.js");
const { DT, stoppingRoom, vehicleOf } = await I("sim/traffic.js");
const { blocked, eyeOf } = await I("sim/sight.js");
const city = loadMap(TEST_MAPS.find((t) => t.id === "city").build());
const out = { seeds: seedsArg, rows: [] };
const snap = (c) => ({ s: c.s, v: c.v, going: !!c.going, accepted: !!c.accepted, stoppedAt: c.stoppedAt ?? null, route: c.route, k: c.k ?? 0 });
for (const seed of seedsArg.split(",").map(Number)) {
  let w = seedGraph(seed, 50, city, { target: Number(carsArg), posted: true, rivals: true });
  const entry = new Map(), hold = new Map();
  let prevSnap = new Map();
  /* The world a second and two seconds back, by reference: worlds are never written. */
  const past = [];
  for (let i = 0; i < 600 / DT; i++) {
    const prev = w;
    const now = new Map(prev.actors.map((a) => [a.id, snap(a)]));
    for (const a of prev.actors) {
      if (a.player || a.crash) continue;
      const key = `${a.k}|${a.route}`, e = entry.get(a.id);
      if (!e || e.key !== key) entry.set(a.id, { key, s: a.s, v: a.v, t: prev.t });
      const v = whatStops(a, prev);
      if (!(v.held && v.leader?.id === "line")) { hold.delete(a.id); continue; }
      if (hold.has(a.id)) continue;
      const L = layoutOf(prev, a), mine = L.paths[a.route], k = a.k ?? 0, live = prev.lights?.[k]?.live ?? null;
      const named = prev.actors.filter((c) => c.id !== a.id && (c.k ?? 0) === k && blockedBy(a, c, L, a.caution, prev.t, live));
      if (v.byHidden || !named.length) { hold.set(a.id, { skip: true }); continue; }
      const c = named[0], before = prevSnap.get(c.id), ce = entry.get(c.id), hit = conflictOf(L, c.route, a.route);
      /* The tick before, from the same driver: would this car have blocked them then, at the snapshot? */
      const wasOnNode = before && before.k === k && before.route === c.route;
      const change = !before || !wasOnNode ? "blocker arrived at the node" : before.going !== !!c.going ? (c.going ? "blocker launched" : "blocker stopped going") : before.accepted !== !!c.accepted ? "blocker accepted" : (before.stoppedAt == null) !== (c.stoppedAt == null) ? "blocker came to rest" : "none: position alone";
      const pa = poseOf(prev, a), pc = poseOf(prev, c);
      /* hasGap's own arithmetic, at this tick and back through it: how long until they reach the region, and how long this driver needs. */
      const gapAt = (W) => { const A = W?.actors.find((x) => x.id === a.id), C = W?.actors.find((x) => x.id === c.id); if (!A || !C || (A.k ?? 0) !== k || (C.k ?? 0) !== k || A.route !== a.route || C.route !== c.route || !hit) return null; return { reach: (hit.a - (lenOf(C) - 4.5) / 2 - C.s) / Math.max(C.v, 0.5), need: gapNeeded(A, hit.clearOf - A.s, A.caution), v: A.v, a: A.a ?? 0, corner: cornerAccel(A, pathOf(W, A)) }; };
      const g0 = gapAt(prev), g1 = gapAt(past[past.length - 20]), g2 = gapAt(past[past.length - 40]);
      const oldV = g2 ? gapNeeded({ ...a, v: g2.v }, hit ? hit.clearOf - a.s : 0, a.caution) : null;
      hold.set(a.id, { g0, g1, g2, needAtOldSpeed: oldV, s: a.s, v: a.v, change, age: ce && ce.key === `${c.k}|${c.route}` ? +(prev.t - ce.t).toFixed(1) : null, by: c.id, byKind: c.kind, byV: +(c.v ?? 0).toFixed(1), toMeetMe: hit ? +((hit.b - a.s) / Math.max(a.v, 0.5)).toFixed(1) : null, toMeetThem: hit ? +((hit.a - c.s) / Math.max(c.v, 0.5)).toFixed(1) : null, theirStand: c.stoppedAt != null, signal: !!L.signal, intent: mine.intent, theirIntent: L.paths[c.route].intent, dist: +Math.hypot(pc.x - pa.x, pc.y - pa.y).toFixed(0), toLine: +(mine.stopAt - a.s).toFixed(1), caution: +(a.caution ?? 1).toFixed(2) });
    }
    prevSnap = now;
    past.push(prev); if (past.length > 41) past.shift();
    w = step(w);
    for (const a of w.actors) {
      const h = hold.get(a.id); if (!h) continue;
      const b = prev.actors.find((x) => x.id === a.id); if (!b) continue;
      const P = layoutOf(w, a).paths[a.route];
      if (!(b.s < P.stopAt && a.s >= P.stopAt && a.v > 0.5)) continue;
      hold.delete(a.id);
      if (h.skip) continue;
      const most = vehicleOf(a).most, e = entry.get(a.id);
      const kind = !(e && stoppingRoom(e.v, most) <= P.stopAt - e.s) ? "impossibleFromEntry" : !(stoppingRoom(h.v, most) <= P.stopAt - h.s) ? "heldLate" : "couldHaveStopped";
      if (kind === "heldLate") out.rows.push({ seed, t: +w.t.toFixed(1), id: a.id, holdV: +h.v.toFixed(1), ...h, s: undefined, v: undefined });
    }
  }
}
console.log(JSON.stringify(out));
