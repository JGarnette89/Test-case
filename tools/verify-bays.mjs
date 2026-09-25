/* =====================================================================
   VERIFY BAYS -- turn bays: where they are, what they may do, and who
   uses them. The big arterial (the test map's E, 25 September).

   1. THE GEOMETRY IS THE LANES'. A bay's lane lies exactly on its
      neighbour until its taper begins and is exactly one lane out over
      its storage; the through lanes stay one lane apart everywhere while
      the median opens under them; the drawn road contains every lane;
      and the taper is the one derived from the lane change's own
      numbers, not a typed distance.
   2. A BAY IS FOR ITS TURN. Under the general rule a left bay turns left
      and nothing else, a right bay right, and the through lanes then
      carry neither turn; a double left lands in two different lanes;
      the test map is clean; a bay that could never be used -- at an
      edge, on a one-way road -- is refused with a warning, not built.
   3. IN TRAFFIC, at 300 cars: nobody drives through anybody; every left
      at E is made from a left bay; nobody is ever in a bay before it
      opens; and nobody moves into a bay except for the turn it makes.

   SABOTAGED WHEN WRITTEN, and what it showed. Letting a car into a bay
   before it opens fails section 3 twice over (the early-bay assertion,
   and 30 overlapping car-ticks: the bay's lane lies on its neighbour's).
   Removing the guard that keeps overtakes out of bays does NOT fail it,
   and that is the check's boundary rather than its proof: an overtake
   keeps its own movement and a bay never offers a through one, so the
   guard is a second line -- only a bay-to-bay overtake inside the double
   left rests on it alone, and none arose in two minutes. The last
   assertion therefore says what happened, not that the guard works.

     node tools/verify-bays.mjs
   ===================================================================== */
import { emptyMap, road, LANE } from "../src/map/format.js";
import { loadMap } from "../src/map/load.js";
import { testMap1 } from "../src/map/samples.js";
import { graphOf } from "../src/sim/graph.js";
import { offsetsOf, baysAt, taperFor } from "../src/map/bays.js";
import { defaultTurns } from "../src/sim/lanes.js";
import { seedGraph, step, overlapping } from "../src/sim/crossing.js";
import { LC_TIME } from "../src/sim/lanechange.js";
import { REACTION_FLOOR } from "../src/core/perception.js";

let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? " ok " : "FAIL"} ${msg}`); if (!ok) failed++; };
const d2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

const loaded = loadMap(testMap1());
const g = graphOf(loaded, { lane: LANE });
const kE = g.at.findIndex((s) => s.node === "n4");
const E = g.at[kE].layout;

console.log("\n1. THE GEOMETRY IS THE LANES'");
{
  const r = loaded.roads.find((x) => x.id === "B-east");
  const b = baysAt(r, "end");
  check(Math.abs(b.taper - (LC_TIME + REACTION_FLOOR) * (r.speed / 3.6)) < 1e-9 && Math.abs(taperFor(60) - 69.7) < 0.1,
    `the taper is a clean lane change plus a reaction at the road's speed: ${b.taper.toFixed(1)} m at ${r.speed} km/h, typed nowhere`);

  /* A bay against its neighbour, sample by sample, along the direction of travel. */
  let before = 0, storage = Infinity, sampledBefore = 0, sampledStorage = 0;
  const bayLanes = Object.values(g.lanes).filter((l) => l.bay);
  for (const bay of bayLanes) {
    const [roadId, rest] = bay.id.split(":");
    const dir = rest.split("#")[0];
    const nb = g.lanes[bay.bay === "left" ? `${roadId}:${dir}#0` : `${roadId}:${dir}#${loaded.roads.find((x) => x.id === roadId).lanes - 1}`];
    const j = Number(bay.index.slice(1));
    const R = loaded.roads.find((x) => x.id === roadId);
    const bb = baysAt(R, dir === "fwd" ? "end" : "start");
    for (let i = 0; i < bay.pts.length; i++) {
      const toEnd = bay.length - bay.at[i];
      const sep = d2(bay.pts[i], nb.pts[i]);
      if (bay.at[i] < bay.opensAt - 1e-6) { before = Math.max(before, sep); sampledBefore++; }
      if (toEnd < bb.length - 1) { storage = Math.min(storage, Math.abs(sep - (j + 1) * LANE) < 0.05 ? Infinity : sep); sampledStorage++; }
    }
  }
  check(bayLanes.length === 8 && sampledBefore > 0 && before < 0.01, `all ${bayLanes.length} bays at E lie on their neighbour until the taper begins (${sampledBefore} samples, at most ${(before * 100).toFixed(2)} cm apart)`);
  check(sampledStorage > 0 && storage === Infinity, `and over the storage every bay is exactly its lanes out from its neighbour (${sampledStorage} samples)`);

  /* Through lanes of one direction stay a lane apart while the median opens. */
  let worst = 0, n = 0;
  for (const R of loaded.roads.filter((x) => x.bays)) {
    for (const dir of ["fwd", "rev"]) for (let i = 0; i + 1 < R.lanes; i++) {
      const A = g.lanes[`${R.id}:${dir}#${i}`], B = g.lanes[`${R.id}:${dir}#${i + 1}`];
      for (let k = 0; k < A.pts.length; k++) { worst = Math.max(worst, Math.abs(d2(A.pts[k], B.pts[k]) - LANE)); n++; }
    }
  }
  check(n > 0 && worst < 0.05, `the through lanes stay one lane apart everywhere the median opens under them (${n} samples, off by at most ${(worst * 100).toFixed(1)} cm)`);

  /* The drawn surface holds every lane: the road's edge is at least half a lane beyond the outermost lane on its side. */
  let tight = Infinity;
  for (const R of loaded.roads.filter((x) => x.bays)) {
    const o = offsetsOf(R);
    for (let k = 0; k < R.pts.length; k++) {
      const outR = Math.max(...[...o.fwd.through, ...o.fwd.right].map((a) => a[k]));
      const outL = Math.max(...[...o.rev.through, ...o.rev.right].map((a) => a[k]));
      tight = Math.min(tight, o.edgeRight[k] - outR, o.edgeLeft[k] - outL);
    }
  }
  check(Math.abs(tight - LANE / 2) < 1e-6, `the drawn road is wide enough for every lane on it, bays included: the outermost lane's centre is half a lane from the edge (${tight.toFixed(2)} m)`);
}

console.log("\n2. A BAY IS FOR ITS TURN");
{
  const all = new Set(["left", "straight", "right"]);
  const t = defaultTurns(6, all, { left: 2, right: 1 });
  check(JSON.stringify(t) === JSON.stringify([["left"], ["left"], ["straight"], ["straight"], ["straight"], ["right"]]),
    `the general rule with two left bays and a right bay: ${JSON.stringify(t)} -- bays turn only, and the through lanes give the turns up to them`);
  check(JSON.stringify(defaultTurns(3, all)) === JSON.stringify([["left", "straight"], ["straight"], ["straight", "right"]]), "and with no bays it is exactly the rule it always was");

  check(g.errors.length === 0, `the test map, E included, has no lane with nowhere to land (${g.errors.length} errors)`);
  const dbl = Object.keys(E.paths).filter((k) => E.legs[E.paths[k].from].base === "B-east|end" && E.paths[k].intent === "left");
  const into = new Set(dbl.map((k) => E.paths[k].to));
  check(dbl.length === 2 && into.size === 2 && dbl.every((k) => E.legs[E.paths[k].from].bay === "left"), `the double left from the west is two bays into two different lanes (${dbl.map((k) => k.replace(/\|/g, "")).join(", ")})`);
  const lefts = Object.values(E.paths).filter((p) => p.intent === "left");
  check(lefts.length > 0 && lefts.every((p) => E.legs[p.from].bay === "left"), `every left at E is made from a left bay (${lefts.length} paths)`);

  const refused = (m) => loadMap(m).warnings.map((w) => w.code);
  const one = emptyMap("b", "b"); one.roads.push(road({ id: "x", kind: "arterial", points: [{ x: 0, y: 0 }, { x: 400, y: 0 }], bays: { end: { left: 1 } } }));
  check(refused(one).includes("bay-at-edge"), "a bay at a road end that meets no intersection is dropped, with a warning");
  const ow = emptyMap("b", "b"); ow.roads.push(road({ id: "x", kind: "arterial", oneWay: true, points: [{ x: 0, y: 0 }, { x: 400, y: 0 }], bays: { end: { left: 1 } } }));
  check(refused(ow).includes("bays-one-way"), "and so is a bay on a one-way road, which has no median to open it into");
}

console.log("\n3. IN TRAFFIC, AT 300 CARS");
{
  let w = seedGraph(3, 50, loaded, { target: 300, posted: true });
  const L = w.course.at[kE].layout;
  let overlaps = 0, early = 0, earlyEg = null, overtakeIn = 0, bayEntries = 0, leftsE = 0, leftsNotBay = 0;
  const seenLc = new Set(), counted = new Set();
  for (let i = 0; i < 20 * 120; i++) {
    w = step(w);
    if (i % 5 === 0) overlaps += overlapping(w).length;
    for (const a of w.actors) {
      const lay = w.course.at[a.k ?? 0].layout, p = lay.paths[a.route];
      if (!p) continue;
      const leg = lay.legs[p.from];
      /* In a bay before it opens -- a changer counts from the tick it begins. */
      if (leg?.bay && a.s < (leg.opensAt ?? 0) - 0.5) { early++; earlyEg ??= `${a.id} on ${p.from} at ${a.s.toFixed(1)} m, opens at ${leg.opensAt.toFixed(1)}`; }
      if (a.lc && leg?.bay && !seenLc.has(`${a.id}@${a.lc.t0}`)) {
        seenLc.add(`${a.id}@${a.lc.t0}`);
        if (!lay.legs[a.lc.fromLeg]?.bay) { bayEntries++; if (!a.lc.mandatory) overtakeIn++; }
      }
      if ((a.k ?? 0) === kE && p.intent === "left" && a.s >= p.stopAt && !counted.has(`${a.id}@${a.route}`)) {
        counted.add(`${a.id}@${a.route}`); leftsE++; if (!leg.bay) leftsNotBay++;
      }
    }
  }
  check(overlaps === 0, `two minutes, the whole map at 300 cars: ${overlaps} overlapping car-ticks`);
  check(leftsE > 20 && leftsNotBay === 0, `${leftsE} lefts through E, every one from a bay`);
  check(bayEntries > 20 && early === 0, `${bayEntries} cars moved into a bay, and nobody was ever in one before it opens${earlyEg ? ` (${earlyEg})` : ""}`);
  check(overtakeIn === 0, `and every one of them moved in for the turn it makes -- a bay is never used to get past somebody (${overtakeIn} were)`);
}

console.log(failed ? `\n${failed} FAILED` : "\nOK: a bay lies on its neighbour until it opens and a lane out once it has, turns only, and is used by the traffic for its turn and nothing else.");
process.exit(failed ? 1 : 0);
