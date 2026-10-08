/* =====================================================================
   GREEN WAVES: signals along a road timed so a car at the posted speed
   meets green after green (SIMULATOR.md, "green waves").

   The maintainer, from play: "getting stuck at a light is simply
   boring." The answer is signal PROGRESSION, which real arterials have:
   no invented mechanic, only honest timing. Drive at the speed the road
   was built for and the lights open ahead of you; speed and you sit at
   red; dawdle and you miss it. Waiting stops being a property of the
   traffic and becomes the consequence of how you drove. The governing
   rule, which this module keeps: every reward is something a genuinely
   good driver would get. Nothing here knows the player exists.

   WHAT IT DOES, all derived, nothing typed in:

   1. CORRIDORS. Between signalled intersections, the road, carried
      straight on through any unsignalled intersection where it has
      priority -- it does not stop, and the road crossing it stops or
      yields (a minor road's stop sign stops the minor road, not this
      one; an uncontrolled crossroads stops everybody, by turns). A run's travel time is each road's length at its own posted
      speed.

   2. WHICH LINKS ARE COORDINATED. A real signal system can time a line
      of lights for one direction exactly, not a grid in every direction
      at once. So a spanning tree over the signalled intersections,
      FASTEST ROADS FIRST: an arterial's chain of lights is coordinated
      before any side street's. Each tree link is timed in the direction
      it was reached from.

   3. ONE CYCLE PER CONNECTED SYSTEM. Progression only holds if the
      lights repeat together, so every signal in a system runs the
      longest cycle among them, the shorter ones lengthening every green
      equally to fill it -- what a coordinated system does with its
      slack.

   4. THE OFFSET. A car that left the last light at the start of its
      green arrives after the run's travel time; this light's green
      begins one AMBER before that. Amber is by definition the reaction
      plus the comfortable stop from the road's speed (signal.js), so the
      green is up just as an approaching driver would otherwise have had
      to begin braking for a red -- they see green, and carry on. The
      lead is derived, not chosen.

   A single signal, or a map without signals, gets exactly the plan it
   always had: offset 0 and its own cycle.

   Pure. Takes the graph's own pieces and returns new plans.
   ===================================================================== */
import { retime, PHASE_TOL } from "./signal.js";

const norm = (d) => ((((d + 180) % 360) + 360) % 360) - 180;
/* How far apart two lights can be and still be one system: past this, a
   platoon released by one has spread out by the next and there is no
   wave left to time for. A FLAGGED design figure. Distance and not a
   count of side streets: an arterial is cut into short pieces by every T
   that meets it (the bench's had nine between two lights), and none of
   them stops it. */
export const CORRIDOR_MAX = 2000;   // m

/* `at`: the graph's per-node entries (each with layout.legs, layout.signal);
   `links`: { road, a, aSide, b, bSide }; `roadOf`: road id -> road;
   `lanes`: the lane table (one-way roads have no lanes against them). */
export function coordinate(at, links, roadOf, lanes) {
  const plan = (k) => at[k]?.layout?.signal ?? null;
  const signalled = at.map((_, k) => k).filter((k) => plan(k));
  if (signalled.length < 2) return { offsets: {}, systems: [] };

  /* Links by node, each way, with the base a car leaves by and arrives on. */
  const out = new Map();
  for (const L of links) {
    for (const [from, side, to, toSide, end] of [[L.a, L.aSide, L.b, L.bSide, "start"], [L.b, L.bSide, L.a, L.aSide, "end"]]) {
      /* Driving AWAY from `from` along this road: forward from its start end, backward from its end. */
      if (!lanes[`${L.road}:${end === "start" ? "fwd" : "rev"}#0`]) continue;
      const r = roadOf[L.road];
      const run = { from, side, to, toSide, road: L.road, length: r?.length ?? 0, speed: ((r?.speed ?? 50) / 3.6) };
      if (!out.has(from)) out.set(from, []);
      out.get(from).push(run);
    }
  }
  const baseLeg = (k, base) => Object.values(at[k].layout.legs).find((l) => l.base === base) ?? null;

  /* 1. CORRIDORS: from each signal, along each road, straight on through
     unsignalled intersections that do not stop it, to the next signal. */
  const edges = [];
  for (const k of signalled) {
    for (const first of out.get(k) ?? []) {
      let run = first, time = first.length / first.speed, dist = first.length, slowest = first.speed;
      const seen = new Set([k]), via = [];
      while (run && !plan(run.to)) {
        if (dist > CORRIDOR_MAX || seen.has(run.to)) { run = null; break; }
        seen.add(run.to); via.push(run.to);
        const arrive = baseLeg(run.to, run.toSide);
        if (!arrive || arrive.control !== "none") { run = null; break; }      // this road stops here: not one corridor
        /* ...and THE CROSS TRAFFIC must be the one that stops or yields. At
           an uncontrolled crossroads nobody has priority -- everybody
           yields to the right -- so a platoon stops there whatever its
           leg says. Measured on the bench, 6 October: 3 and 16 km/h at
           the two uncontrolled crossings of a 1,500 m link the first
           version timed through, which took 131 s against the 90 it was
           timed for and so arrived on red. */
        const crossing = Object.values(at[run.to].layout.legs).filter((l) => Math.abs(Math.abs(norm(l.bearing - arrive.bearing)) - 90) < PHASE_TOL);
        if (crossing.some((l) => l.control === "none")) { run = null; break; }
        const ahead = (out.get(run.to) ?? []).find((n) => {
          const leg = baseLeg(run.to, n.side);
          return n.side !== run.toSide && leg && Math.abs(Math.abs(norm(leg.bearing - arrive.bearing)) - 180) < PHASE_TOL;
        });
        if (!ahead) { run = null; break; }
        time += ahead.length / ahead.speed; dist += ahead.length; slowest = Math.min(slowest, ahead.speed);
        run = { ...ahead, side: run.side, from: k };
        run.toSide = ahead.toSide; run.to = ahead.to;
      }
      if (!run || run.to === k || dist > CORRIDOR_MAX) continue;
      edges.push({ from: k, side: first.side, to: run.to, toSide: run.toSide, time, dist, speed: slowest, via });
    }
  }
  if (!edges.length) return { offsets: {}, systems: [] };

  /* 2. A SPANNING TREE, FASTEST ROADS FIRST (Prim's, deterministic). */
  const better = (a, b) => b.speed - a.speed || a.time - b.time || a.from - b.from || a.to - b.to;
  const inTree = new Set(), tree = [], systems = [];
  const bySpeed = edges.slice().sort(better);
  for (const seed of bySpeed) {
    if (inTree.has(seed.from)) continue;
    const system = [seed.from];
    inTree.add(seed.from);
    for (;;) {
      const e = bySpeed.find((x) => inTree.has(x.from) && !inTree.has(x.to) && system.includes(x.from));
      if (!e) break;
      inTree.add(e.to); system.push(e.to); tree.push(e);
    }
    if (system.length > 1) systems.push(system);
    else inTree.delete(seed.from);
  }

  /* 3. ONE CYCLE PER SYSTEM, the shorter plans' greens lengthened to fill it. */
  for (const system of systems) {
    const cycle = Math.max(...system.map((k) => plan(k).cycle));
    for (const k of system) {
      const p = plan(k);
      if (p.cycle < cycle) at[k].layout.signal = retime(p, p.greenFor + (cycle - p.cycle) / p.phases.length);
    }
  }

  /* 4. THE OFFSETS, down the tree from each system's first signal. */
  const offsets = {};
  const greenAt = (k, base) => { const p = plan(k), i = p.forBase[base]; return (p.offset ?? 0) + p.starts[i] + (p.lead?.[i] ?? 0); };
  for (const system of systems) {
    at[system[0]].layout.signal = { ...plan(system[0]), offset: 0 };
    offsets[system[0]] = 0;
    for (const e of tree.filter((x) => system.includes(x.from))) {
      const p = plan(e.to), i = p.forBase[e.toSide];
      if (i == null || plan(e.from).forBase[e.side] == null) continue;
      const want = greenAt(e.from, e.side) + e.time - p.amber;          // green one amber before a car at speed arrives
      const offset = ((want - p.starts[i] - (p.lead?.[i] ?? 0)) % p.cycle + p.cycle) % p.cycle;
      at[e.to].layout.signal = { ...p, offset };
      offsets[e.to] = offset;
    }
  }
  /* WHICH PHASE IS THE COORDINATED ONE at each timed light: the phase
     holding the corridor's approaches. An actuated light keeps that
     phase's windows on the clock and skips a side phase nobody calls
     (actuated.js). */
  for (const e of tree) for (const [k, side] of [[e.from, e.side], [e.to, e.toSide]]) {
    const p = plan(k), i = p.forBase[side];
    if (i != null && offsets[k] != null && !(p.coord ?? []).includes(i)) at[k].layout.signal = { ...p, coord: [...(p.coord ?? []), i] };
  }
  return { offsets, systems, tree };
}
