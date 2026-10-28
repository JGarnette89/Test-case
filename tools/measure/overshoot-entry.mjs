/* COULD THE OVERSHOOTER EVER HAVE STOPPED? (28 October; IN FLIGHT 40, the
   prediction written before this ran: if the cause is late discovery, most
   overshoots begin with the car already unable to stop before its line at
   the moment it could first see the conflict.) For every OVERSHOOT -- a car
   held at its line (whatStops: held, leader "line") that crosses it while
   still moving -- two moments, each judged at the vehicle's hardest braking
   with no reaction time (the most generous reading):
     ENTRY      the first tick it was at this node on this route (crossing the
                seam, or arriving there) -- before it, right of way at this
                node does not exist for it (crossing.js blockedBy);
     FIRST HELD the first tick of the hold that ended in the overshoot.
   Each overshoot is one of: "impossible from entry" (late discovery);
   "possible at entry, impossible when held" (held late, within the node);
   "possible when held" (could have stopped, did not). The city at 150 with
   rivals, ten minutes a seed, from either tree.
   Usage: node overshoot-entry.mjs <treeRoot> seeds(comma) */
const [root, seedsArg] = process.argv.slice(2);
const { loadMap } = await import(`file:///${root}/src/map/load.js`);
const { TEST_MAPS } = await import(`file:///${root}/src/map/samples.js`);
const { seedGraph, step, whatStops, layoutOf } = await import(`file:///${root}/src/sim/crossing.js`);
const { DT, stoppingRoom, vehicleOf } = await import(`file:///${root}/src/sim/traffic.js`);
const city = loadMap(TEST_MAPS.find((t) => t.id === "city").build());
const out = { seeds: seedsArg, overshoots: 0, impossibleFromEntry: 0, heldLate: 0, couldHaveStopped: 0, rows: [] };
for (const seed of seedsArg.split(",").map(Number)) {
  let w = seedGraph(seed, 50, city, { target: 150, posted: true, rivals: true });
  const entry = new Map(), hold = new Map();
  for (let i = 0; i < 600 / DT; i++) {
    const prev = w;
    for (const a of prev.actors) {
      if (a.player || a.crash) continue;
      const key = `${a.k}|${a.route}`, e = entry.get(a.id);
      if (!e || e.key !== key) entry.set(a.id, { key, s: a.s, v: a.v });
      const v = whatStops(a, prev);
      if (v.held && v.leader?.id === "line") { if (!hold.has(a.id)) hold.set(a.id, { s: a.s, v: a.v }); }
      else hold.delete(a.id);
    }
    w = step(w);
    for (const a of w.actors) {
      const h = hold.get(a.id); if (!h) continue;
      const b = prev.actors.find((x) => x.id === a.id); if (!b) continue;
      const P = layoutOf(w, a).paths[a.route];
      if (!(b.s < P.stopAt && a.s >= P.stopAt && a.v > 0.5)) continue;
      const most = vehicleOf(a).most, e = entry.get(a.id);
      const fromEntry = e && stoppingRoom(e.v, most) <= P.stopAt - e.s, fromHold = stoppingRoom(h.v, most) <= P.stopAt - h.s;
      out.overshoots++;
      const kind = !fromEntry ? "impossibleFromEntry" : !fromHold ? "heldLate" : "couldHaveStopped";
      out[kind]++;
      if (out.rows.length < 12) out.rows.push({ seed, t: +w.t.toFixed(1), id: a.id, kind, entryV: +(e?.v ?? 0).toFixed(1), entryRoom: +(P.stopAt - (e?.s ?? 0)).toFixed(1), needAtEntry: +stoppingRoom(e?.v ?? 0, most).toFixed(1), holdV: +h.v.toFixed(1), holdRoom: +(P.stopAt - h.s).toFixed(1), needAtHold: +stoppingRoom(h.v, most).toFixed(1) });
    }
  }
}
console.log(JSON.stringify(out));
