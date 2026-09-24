/* =====================================================================
   TRAFFIC SIGNALS: a control that changes with time.

   Every control the sim had until now was a standing fact about a leg --
   this one stops, that one does not -- and the whole of right of way
   read it that way. A signal is the first control that is a function of
   the clock, and the design rule that keeps it from being a second
   rule system is this:

     A SIGNAL RESOLVES, AT EVERY INSTANT, TO A CONTROL THE SIM ALREADY
     HAS, PLUS ONE GENUINELY NEW STATE.

       green            -> "none"  -- an uncontrolled leg. A left turn
                                      still yields to the oncoming,
                                      which is exactly a permissive
                                      left and needed no new code.
       amber            -> "hold" if this driver can still stop at the
                                      line comfortably, "none" if not.
                                      Derived per car from its own speed
                                      and the sim's own braking rate,
                                      so the dilemma zone is physical
                                      rather than authored.
       red, turning right -> "stop"  -- which IS right-on-red: stop, then
                                      take a gap, which is what a
                                      stop-controlled leg has always
                                      done. (Unless the leg posts
                                      otherwise: `signal-no-right-on-red`.)
       red, otherwise   -> "hold"  -- THE NEW STATE. Not "wait for a
                                      gap": wait, gap or no gap.

   So a signalised intersection runs the rules that were already
   verified, and the only new question anywhere is "what is this light
   doing right now".

   WHICH LEGS RUN TOGETHER IS DERIVED FROM THE GEOMETRY, never authored.
   Approaches on one axis -- the same bearing or the opposite one within
   `PHASE_TOL` -- share a phase, because their straight-through paths do
   not conflict (CLAUDE.md: two vehicles going straight from opposite
   legs pass on their own sides). A crossroads therefore has two phases
   and a five-way has three, with nobody writing either number down, and
   a map that adds a leg gets the phase it needs.

   THE TIMINGS ARE DERIVED TOO, except one.

     amber   = the reaction floor plus the time to shed the road's speed
               at the comfortable rate -- the standard amber interval,
               and it falls out of `stoppingRoom`, so changing the sim's
               braking moves it rather than leaving a second opinion.
     all-red = how long it takes to clear the box from the line at that
               speed. Below it, a car that entered legally is still in
               the intersection when the next phase goes green.
     green   = `GREEN_FOR`, and it IS a design constant: how long a
               phase runs is a traffic-engineering choice about demand,
               not a fact about physics. Flagged as such.
   ===================================================================== */
import { CAR, stoppingRoom } from "./traffic.js";
import { REACTION_FLOOR } from "../engine/score.js";

export const GREEN_FOR = 20;     // s: a design constant -- how long one phase runs
export const PHASE_TOL = 40;     // deg: approaches within this of one axis run together
export const SIGNAL = "signal";  // the control string a map's road end carries
const norm = (d) => ((((d + 180) % 360) + 360) % 360) - 180;

/* Is this control string a signal, and does it forbid right on red? */
export const isSignal = (c) => typeof c === "string" && c.startsWith(SIGNAL);
export const noRightOnRed = (c) => c === "signal-no-right-on-red";

/* THE PLAN FOR ONE NODE, or null where no leg is signalised. `legs` is
   the layout's legs, `ids` its leg ids, `boxHalf` how far the box
   reaches from the middle. */
export function signalFor(legs, ids, boxHalf, { greenFor = GREEN_FOR } = {}) {
  const lit = ids.filter((id) => isSignal(legs[id].control));
  if (!lit.length) return null;

  /* One phase per axis. Bases rather than lanes: every lane of one
     approach shows the same light, which is what a driver sees. */
  const bases = [];
  for (const id of ids) if (!bases.some((b) => b.base === legs[id].base)) bases.push({ base: legs[id].base, bearing: legs[id].bearing });
  const phases = [];
  for (const b of bases.slice().sort((x, y) => x.bearing - y.bearing)) {
    const home = phases.find((p) => {
      const d = Math.abs(norm(p.bearing - b.bearing));
      return d < PHASE_TOL || Math.abs(d - 180) < PHASE_TOL;
    });
    if (home) home.bases.push(b.base);
    else phases.push({ bearing: b.bearing, bases: [b.base] });
  }

  /* The fastest approach decides both derived intervals: an amber sized
     for the slowest road would strand the fastest driver in the box. */
  const speed = Math.max(...ids.map((id) => legs[id].speed ?? 50 / 3.6));
  const amber = Math.max(3, REACTION_FLOOR + stoppingRoom(speed) / speed);
  const allRed = Math.max(1, (2 * boxHalf + CAR.length) / speed);
  const step = greenFor + amber + allRed;
  const forBase = {};
  phases.forEach((p, i) => p.bases.forEach((b) => { forBase[b] = i; }));
  return {
    phases: phases.map((p) => p.bases),
    forBase,
    greenFor, amber, allRed,
    cycle: step * phases.length,
    /* PER APPROACH, not per node: one leg may post no-right-on-red
       while the others allow it, which is how the sign is actually
       used. */
    noRightOnRed: Object.fromEntries(bases.map((b) => [b.base, ids.some((id) => legs[id].base === b.base && noRightOnRed(legs[id].control))])),
  };
}

/* WHAT THIS LEG'S LIGHT IS DOING AT TIME t. The cycle is the same for
   every node on a map -- offsetting them so a driver meets a green wave
   is a real thing signals do and is not modelled; it would be an
   `offset` on the plan and nothing else here would change. */
export function lightAt(signal, base, t) {
  if (!signal) return null;
  const i = signal.forBase[base];
  if (i == null) return null;
  const step = signal.greenFor + signal.amber + signal.allRed;
  const into = ((t % signal.cycle) + signal.cycle) % signal.cycle;
  const mine = into - i * step;
  if (mine < 0 || mine >= step) return "red";
  if (mine < signal.greenFor) return "green";
  if (mine < signal.greenFor + signal.amber) return "amber";
  return "red";                                    // the all-red clearance
}

/* THE CONTROL A DRIVER IS ACTUALLY UNDER, this instant: the standing
   one where there is no signal, and the resolution above where there
   is. `toLine` is how far this car's nose is from the line, negative
   once past it.

   The amber decision is the dilemma zone, derived: a driver who can
   still stop comfortably must, and one who cannot must carry on,
   because a car that stands on the brakes at an amber it could not
   make is the fault this model already calls `harshStop`. */
export function controlUnder(signal, base, intent, t, { v = 0, toLine = Infinity, standing = "none" } = {}) {
  const light = lightAt(signal, base, t);
  if (light == null) return standing === "stop" ? "stop" : "none";
  if (light === "green") return "none";
  if (light === "amber") return toLine > 0 && stoppingRoom(v) <= toLine ? "hold" : "none";
  return intent === "right" && !signal.noRightOnRed[base] ? "stop" : "hold";
}
