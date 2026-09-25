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

   A PROTECTED LEFT ARROW (25 September, the big arterial) is a LEADING
   interval at the head of its phase: the approaches on that axis that
   post an arrow (a road end's `leftArrow`) show a green arrow to their
   left-turning lanes while every ball on the node is red, then an amber
   arrow, then an all-red so the last of them clear the box, and only
   then the ordinary green -- during which the left is permissive again,
   yielding to the oncoming, exactly as before. Nothing new in the rules:
   an arrow resolves to "none" for a left and the ball's red holds
   everybody the arrow does not cover. It rides on the same derived amber
   and all-red; `ARROW_FOR` is its green, a design constant like
   GREEN_FOR. A node with no arrow runs exactly the cycle it always did.

   WHICH LIGHT A DRIVER OBEYS depends on their movement (`movementLight`):
   a left-turner on an arrowed approach reads the arrow while it is lit
   and the ball otherwise; everybody else reads the ball. The drivers,
   the amber-commit memory, the signal check and the renderer all ask
   that one function, so none of them can see a different light.
   ===================================================================== */
import { CAR, stoppingRoom } from "./traffic.js";
import { REACTION_FLOOR } from "../core/perception.js";

export const GREEN_FOR = 20;     // s: a design constant -- how long one phase runs
export const ARROW_FOR = 8;      // s: a design constant -- how long a protected left arrow runs
export const PHASE_TOL = 40;     // deg: approaches within this of one axis run together
export const SIGNAL = "signal";  // the control string a map's road end carries
const norm = (d) => ((((d + 180) % 360) + 360) % 360) - 180;

/* Is this control string a signal, and does it forbid right on red? */
export const isSignal = (c) => typeof c === "string" && c.startsWith(SIGNAL);
export const noRightOnRed = (c) => c === "signal-no-right-on-red";

/* THE PLAN FOR ONE NODE, or null where no leg is signalised. `legs` is
   the layout's legs, `ids` its leg ids, `boxHalf` how far the box
   reaches from the middle. */
export function signalFor(legs, ids, boxHalf, { greenFor = GREEN_FOR, arrowFor = ARROW_FOR } = {}) {
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
  /* Which approaches post a protected left, and the leading interval each
     phase carries for them: none where no approach in it has one. */
  const arrows = Object.fromEntries(bases.map((b) => [b.base, ids.some((id) => legs[id].base === b.base && legs[id].arrow)]));
  const lead = phases.map((p) => (p.bases.some((b) => arrows[b]) ? arrowFor + amber + allRed : 0));
  const starts = [];
  let t0 = 0;
  for (let i = 0; i < phases.length; i++) { starts.push(t0); t0 += lead[i] + step; }
  return {
    phases: phases.map((p) => p.bases),
    forBase,
    greenFor, amber, allRed, arrowFor,
    arrows, lead, starts,
    cycle: t0,
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
/* Where in its own phase this base is at time t: seconds since the
   phase began, or null outside it. */
function intoPhase(signal, base, t) {
  const i = signal.forBase[base];
  if (i == null) return undefined;
  const into = ((t % signal.cycle) + signal.cycle) % signal.cycle;
  const mine = into - (signal.starts?.[i] ?? i * (signal.greenFor + signal.amber + signal.allRed));
  const span = (signal.lead?.[i] ?? 0) + signal.greenFor + signal.amber + signal.allRed;
  return mine < 0 || mine >= span ? null : mine;
}

/* THE BALL: what the round light on this approach shows. */
export function lightAt(signal, base, t) {
  if (!signal) return null;
  const mine = intoPhase(signal, base, t);
  if (mine === undefined) return null;
  if (mine === null) return "red";
  const u = mine - (signal.lead?.[signal.forBase[base]] ?? 0);
  if (u < 0) return "red";                         // the phase's leading arrow: every ball red
  if (u < signal.greenFor) return "green";
  if (u < signal.greenFor + signal.amber) return "amber";
  return "red";                                    // the all-red clearance
}

/* THE ARROW: "green" or "amber" while this approach's protected left is
   lit, null when it is dark (or the approach has none). */
export function arrowAt(signal, base, t) {
  if (!signal?.arrows?.[base]) return null;
  const mine = intoPhase(signal, base, t);
  if (mine == null) return null;
  if (mine < signal.arrowFor) return "green";
  if (mine < signal.arrowFor + signal.amber) return "amber";
  return null;
}

/* THE LIGHT THIS MOVEMENT OBEYS: the arrow, for a left while it is lit;
   the ball otherwise. */
export function movementLight(signal, base, intent, t) {
  if (intent === "left") { const a = arrowAt(signal, base, t); if (a) return a; }
  return lightAt(signal, base, t);
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
  const light = movementLight(signal, base, intent, t);
  if (light == null) return standing === "stop" ? "stop" : "none";
  if (light === "green") return "none";
  if (light === "amber") return toLine > 0 && stoppingRoom(v) <= toLine ? "hold" : "none";
  return intent === "right" && !signal.noRightOnRed[base] ? "stop" : "hold";
}
