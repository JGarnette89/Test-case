/* WHAT WAS THE OVERSHOOTER HELD FOR? (4 November; IN FLIGHT 40's first question.)
   overshoot-entry.mjs left 26 of 56 held-late cars with no blocker named. It asked
   blockedBy with live = null, over true positions, and counted any failure to find
   a blocker with a known age as "unnamed". Here the first tick of each hold that
   ends in an overshoot is named in the terms whatStops itself holds by:
     hidden    byHidden: a truck's margin, nothing visible holding them
     walker    somebody on a crosswalk, held at the line
     scanning  still looking along the cross road (checks only)
     car       blockedBy names a car, with the live signal the sim passes; its age at
               this node, and whether the old call (live = null) would have named it
     picture   only the car's own picture names one (checks only: not asked here)
     none      none of the above: whatStops holds for a reason this cannot name
   Each overshoot is also "impossible from entry", "held late" or "could have
   stopped", as overshoot-entry.mjs judges it (hardest braking, no reaction time).
   MARGIN=1: world.marginCanStop on. Then RELEASED counts the driver who was asking
   for the margin (the same tick with the switch off says byHidden) and is not held
   by it, once per approach, and whether they are in a crash within 10 s of release.
   Also crashes, car-on-car, and hard braking (past 5.4 m/s^2, moving car-ticks).
   Usage: node overshoot-hold.mjs <treeRoot> seeds(comma) [cars=150] */
const [root, seedsArg, carsArg = "150"] = process.argv.slice(2);
const { loadMap } = await import(`file:///${root}/src/map/load.js`);
const { TEST_MAPS } = await import(`file:///${root}/src/map/samples.js`);
const { seedGraph, step, whatStops, layoutOf, blockedBy, waitAt } = await import(`file:///${root}/src/sim/crossing.js`);
const { movementLight } = await import(`file:///${root}/src/sim/signal.js`);
const { heldAhead } = await import(`file:///${root}/src/sim/peds.js`);
const { DT, stoppingRoom, vehicleOf } = await import(`file:///${root}/src/sim/traffic.js`);
const city = loadMap(TEST_MAPS.find((t) => t.id === "city").build());
const out = { root: root.split("/").pop(), seeds: seedsArg, cars: Number(carsArg), checks: null, margin: process.env.MARGIN === "1", overshoots: 0, crashes: 0, carOnCar: 0, harsh: 0, ticks: 0, released: 0, releasedCrash: 0, crashRows: [], overshootCrash: 0, kinds: {}, by: {}, ages: [], oldCallMissed: 0, rows: [] };
const bump = (o, k) => { o[k] = (o[k] ?? 0) + 1; };
for (const seed of seedsArg.split(",").map(Number)) {
  let w = seedGraph(seed, 50, city, { target: Number(carsArg), posted: true, rivals: true });
  if (process.env.MARGIN === "1") w = { ...w, marginCanStop: true };
  if (process.env.CAUTION === "1") w = { ...w, sightCaution: true };
  const releasedAt = new Map(), counted = new Set(), overAt = new Map();
  out.checks = w.checks === true;
  const entry = new Map(), hold = new Map();
  for (let i = 0; i < 600 / DT; i++) {
    const prev = w;
    for (const a of prev.actors) {
      if (a.player || a.crash) continue;
      const key = `${a.k}|${a.route}`, e = entry.get(a.id);
      if (!e || e.key !== key) entry.set(a.id, { key, s: a.s, v: a.v, t: prev.t });
      const v = whatStops(a, prev);
      if (process.env.MARGIN === "1" && !v.byHidden && a.v > 2 && !counted.has(key + a.id)) {
        const asked = whatStops(a, { ...prev, marginCanStop: false });
        if (asked.byHidden) { counted.add(key + a.id); releasedAt.set(a.id, prev.t); out.released++; }
      }
      if (!(v.held && v.leader?.id === "line")) { hold.delete(a.id); continue; }
      if (hold.has(a.id)) continue;
      const L = layoutOf(prev, a), mine = L.paths[a.route], k = a.k ?? 0, live = prev.lights?.[k]?.live ?? null;
      const others = prev.actors.filter((c) => c.id !== a.id && (c.k ?? 0) === k);
      const named = others.filter((c) => blockedBy(a, c, L, a.caution, prev.t, live));
      const oldCall = others.filter((c) => blockedBy(a, c, L, a.caution, prev.t, null));
      const walker = heldAhead(prev, a, mine);
      const scanning = prev.checks === true && !!a.scan && a.scan.must && !a.scan.round && a.stoppedAt != null && prev.t < a.scan.until;
      const why = v.byHidden ? "hidden" : walker && walker.s >= waitAt(mine, a) ? "walker" : scanning ? "scanning" : named.length ? "car" : "none";
      const ages = named.map((c) => { const ce = entry.get(c.id); return ce && ce.key === `${c.k}|${c.route}` ? prev.t - ce.t : null; }).filter((x) => x != null);
      hold.set(a.id, { myLight: L.signal ? movementLight(L.signal, L.legs[mine.from]?.base, mine.intent, prev.t, live) : null, stopSign: L.place?.control?.[mine.from] ?? null, asks: a.v * a.v / (2 * Math.max(0.01, waitAt(mine, a) - a.s)), s: a.s, v: a.v, why, age: ages.length ? Math.min(...ages) : null, oldNamed: oldCall.length > 0, red: !!v.red, hold: !!v.hold, signal: !!L.signal, control: L.place?.control?.[mine.from] ?? null, intent: mine.intent, by: named[0]?.id ?? null });
    }
    const c0 = (prev.crashes ?? []).length;
    w = step(w);
    for (const c of (w.crashes ?? []).slice(c0)) {
      out.crashes++;
      const ids = [c.a, c.b].filter((x) => x != null), people = ids.filter((id) => String(id).startsWith("car")).length;
      if (people === 2) out.carOnCar++;
      /* WHAT THE OVERSHOOT REACHED: handled, or hit? In a crash within 8 s of crossing the line while held. */
      if (ids.some((id) => overAt.has(id) && w.t - overAt.get(id) <= 8)) out.overshootCrash++;
      const rel = ids.find((id) => releasedAt.has(id) && w.t - releasedAt.get(id) <= 10);
      if (rel != null) out.releasedCrash++;
      out.crashRows.push({ seed, t: +w.t.toFixed(1), a: c.a, b: c.b, released: rel ?? null, since: rel != null ? +(w.t - releasedAt.get(rel)).toFixed(1) : null });
    }
    for (const a of w.actors) { if (a.player) continue; out.ticks++; if (-(a.a ?? 0) > 5.4 && (a.v ?? 0) > 0.5) out.harsh++; }
    for (const a of w.actors) {
      const h = hold.get(a.id); if (!h) continue;
      const b = prev.actors.find((x) => x.id === a.id); if (!b) continue;
      const P = layoutOf(w, a).paths[a.route];
      if (!(b.s < P.stopAt && a.s >= P.stopAt && a.v > 0.5)) continue;
      const most = vehicleOf(a).most, e = entry.get(a.id);
      const kind = !(e && stoppingRoom(e.v, most) <= P.stopAt - e.s) ? "impossibleFromEntry" : !(stoppingRoom(h.v, most) <= P.stopAt - h.s) ? "heldLate" : "couldHaveStopped";
      out.overshoots++; bump(out.kinds, kind); overAt.set(a.id, w.t);
      if (kind === "heldLate") {
        bump(out.by, h.why);
        if (h.why === "car") { out.ages.push(h.age == null ? null : +h.age.toFixed(1)); if (!h.oldNamed) out.oldCallMissed++; }
        if (h.why === "hidden") (out.hidden ??= []).push({ light: h.myLight ?? "unsignalled", control: h.stopSign, intent: h.intent, v: +h.v.toFixed(1), toLine: +(P.stopAt - h.s).toFixed(1), asks: +h.asks.toFixed(1) });
        if (h.why !== "car" && out.rows.length < 0) out.rows.push({ seed, t: +w.t.toFixed(1), id: a.id, why: h.why, holdV: +h.v.toFixed(1), toLine: +(P.stopAt - h.s).toFixed(1), signal: h.signal, red: h.red, hold: h.hold, control: h.control, intent: h.intent });
      }
      hold.delete(a.id);
    }
  }
}
console.log(JSON.stringify(out));
