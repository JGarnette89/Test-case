/* THE CITY'S CRASHES, COUNTED AND CLASSIFIED (28 October; the lane-occupancy
   gate, SIMULATOR IN FLIGHT 38). verify-rivals' world -- the city, 150 cars,
   rivals on, ten minutes -- for each seed given, from either tree. Counts the
   crashes and the OVERSHOOT COMMITMENTS (a car held at its line for somebody
   it must give way to that crosses that line anyway, still moving), and
   classifies every crash by the 4 s before it, for each car: its leg's
   control; whether it was held at its line; whether it crossed its line while
   held and moving (OVERSHOT), and if so whether it was braking at its maximum
   as it crossed; whether it was committed deliberately (going, crossed while
   not held).
   THE HYPOTHESIS UNDER TEST, written before this ran (the project lead):
   "a car that fails to stop is rewarded with right of way" -- a car past its
   line while braking at its maximum is treated as committed. IF THAT IS THE
   MECHANISM, MOST CAR-ON-CAR CRASHES, ON BOTH TREES, INVOLVE A CAR THAT
   OVERSHOT ITS LINE WHILE HELD, BRAKING AT ITS MAXIMUM, AND PROCEEDED. If they
   mostly do not, the hypothesis does not survive.
   Usage: node crash-classify.mjs <treeRoot> seeds(comma) */
const [root, seedsArg] = process.argv.slice(2);
const { loadMap } = await import(`file:///${root}/src/map/load.js`);
const { TEST_MAPS } = await import(`file:///${root}/src/map/samples.js`);
const { seedGraph, step, whatStops, layoutOf } = await import(`file:///${root}/src/sim/crossing.js`);
const { DT, vehicleOf } = await import(`file:///${root}/src/sim/traffic.js`);
const city = loadMap(TEST_MAPS.find((t) => t.id === "city").build());
const out = { tree: root.includes("oldtree") ? "main" : "branch", seeds: seedsArg, overshoots: 0, crashes: [] };
for (const seed of seedsArg.split(",").map(Number)) {
  let w = seedGraph(seed, 50, city, { target: 150, posted: true, rivals: true });
  /* IN FLIGHT 40's switches, stated with the result: FTS=1 statement A, NER=1 statement B. */
  w = { ...w, ...(process.env.FTS === "1" ? { failToStop: true } : {}), ...(process.env.NER === "1" ? { noEmergencyRelease: true } : {}) };
  const stand = new Map(); let longest = 0, over60 = 0;
  const hist = new Map();   // id -> { heldT, overT, overMax, overV, crossT, crossHeld }
  const H = (id) => hist.get(id) ?? hist.set(id, {}).get(id);
  const seenCrash = new Set();
  for (let i = 0; i < 600 / DT; i++) {
    const prev = w;
    const heldNow = new Set();
    for (const a of prev.actors) {
      if (a.player || a.crash) continue;
      const v = whatStops(a, prev);
      if (v.held && v.leader?.id === "line") { heldNow.add(a.id); H(a.id).heldT = prev.t; }
    }
    w = step(w);
    for (const a of w.actors) {
      if (a.crash || a.player) continue;
      const b = prev.actors.find((x) => x.id === a.id); if (!b) continue;
      const P = layoutOf(w, a).paths[a.route];
      if (b.s < P.stopAt && a.s >= P.stopAt) {
        const h = H(a.id);
        h.crossT = w.t; h.crossHeld = heldNow.has(a.id); h.crossV = a.v; h.crossA = a.a ?? 0;
        if (heldNow.has(a.id) && a.v > 0.5) { out.overshoots++; h.overT = w.t; h.overMax = (a.a ?? 0) <= -0.95 * vehicleOf(a).most; h.overV = a.v; }
      }
    }
    for (const a of w.actors) { if (a.player || a.crash || a.parked) continue; if ((a.v ?? 0) < 0.3) { const t0 = stand.get(a.id) ?? w.t; stand.set(a.id, t0); const d = w.t - t0; if (d > longest) longest = d; if (d > 60 && d - DT <= 60) over60++; } else stand.delete(a.id); }
    for (const c of w.crashes ?? []) {
      const key = `${c.t}|${c.a}|${c.b}`;
      if (seenCrash.has(key)) continue;
      seenCrash.add(key);
      const desc = (id) => {
        const x = w.actors.find((y) => y.id === id);
        if (!x) return { id, ped: true };
        const L = layoutOf(w, x), P = L.paths[x.route], h = hist.get(id) ?? {}, recent = (t) => t != null && w.t - t <= 4;
        return { id, rival: x.rival ?? null, ctl: L.place.control[P.from], heldRecently: recent(h.heldT), overshot: recent(h.overT), overshotAtMax: recent(h.overT) && !!h.overMax, overshotV: recent(h.overT) ? +h.overV.toFixed(1) : null, crossedDeliberately: recent(h.crossT) && !h.crossHeld, sPastLine: +(x.s - P.stopAt).toFixed(1) };
      };
      const A = desc(c.a), B = desc(c.b);
      const ped = A.ped || B.ped || /^ped|walker/.test(String(c.a) + String(c.b));
      const shape = ped ? "pedestrian" : A.overshot && B.overshot ? "both overshot" : A.overshot || B.overshot ? "one overshot" : (A.heldRecently || B.heldRecently) ? "held, no overshoot" : "neither held";
      out.crashes.push({ seed, t: +c.t.toFixed(2), shape, A, B });
    }
  }
  out.longestStand = Math.max(out.longestStand ?? 0, +longest.toFixed(1)); out.standsOver60 = (out.standsOver60 ?? 0) + over60;
}
out.fts = process.env.FTS === "1"; out.ner = process.env.NER === "1";
console.log(JSON.stringify(out));
