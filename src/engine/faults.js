/* =====================================================================
   FAULTS — what the candidate actually did wrong, and when

   The driver game asked one question: when may I go. The examiner game
   asks a different one: what did that driver do wrong, was it visible,
   and did you catch it. This file answers the first half.

   THE RULE, carried over intact. The driver game never authored the
   answer — the safe window is simulated, never typed in. Here the same
   temptation reappears wearing a new costume: hand-writing "at 3.4s this
   driver swings wide, mark it". Do that and the game is a memory test
   with a driving skin.

   So a fault is DERIVED, by controlled comparison: simulate the scenario
   as written, simulate it again with one trait stripped from one driver,
   and diff the two. Where the poses separate by more than a driver could
   fail to notice, the fault is happening; the trait-carrying car's
   position at those instants is where an examiner would have to be
   looking. Same car, same schedule, one thing changed — the technique
   verify-windows.mjs already uses to prove a trait matters at all.

   Two channels, because not every fault bends the path. A late indicator
   changes nothing about where the car goes; it changes what the car is
   telling you. That is still a fault and still has a window in which it
   is observable.

   Pure. No React, no DOM, no colour. Severity is deliberately NOT decided
   here — see FAULT_TIER below.
   ===================================================================== */
import { simulate, poseAt, signalShowing, TRAITS, M, STEP } from "./index.js";

/* How far two versions of the same car have to separate before an
   examiner could honestly be expected to see the difference. Below this
   the trait is real but unwitnessable, and marking someone for missing it
   would be marking them for not having a ruler.

   0.45 m is a quarter of a car's width. ROT is degrees of heading. */
export const POS_VISIBLE = M(0.45);
export const ROT_VISIBLE = 4;

/* Sampling step for the diff. STEP is the engine's own resolution floor
   and there is no reason to go finer: a fault briefer than one step is
   not a fault anybody could call. */
const DT = STEP;

/* How long a fault has to persist to be callable at all. A single
   sample's worth of divergence is a numerical artifact, not a driving
   fault. */
export const MIN_DURATION = 0.2;

/* Severity is a DOMAIN question and it belongs to the maintainer, not to
   this file. Everything derived here is reported as a marked fault —
   costs points, does not end the drive — because that is the safe
   default: over-reporting severity would fail candidates for things a
   real examiner would note and move on from.

   Critical events (a collision, a failure to yield) are NOT trait faults
   and are not derived here. They come from the conflict engine, which
   already knows what a collision is. See criticalEventsIn below. */
export const DEFAULT_TIER = "marked";

/* ---------------------------------------------------------------------
   Building the control
   --------------------------------------------------------------------- */

/* The candidate is `scn.ego`; everyone else is an actor. Both carry
   traits, and both can commit faults — which is the whole reason the flip
   is cheap: schedule() applies traits to every participant it is handed,
   the ego included. */
function stripTrait(scn, who, trait) {
  const drop = (p) => ({ ...p, traits: (p.traits || []).filter((t) => t !== trait) });
  if (who === "ego") return { ...scn, ego: drop(scn.ego) };
  return { ...scn, actors: scn.actors.map((a) => (a.id === who ? drop(a) : a)) };
}

const participantsOf = (sim) => [sim.ego, ...sim.actors];
const findIn = (sim, id) => participantsOf(sim).find((p) => p.id === id);

/* ---------------------------------------------------------------------
   The diff
   --------------------------------------------------------------------- */

/* When does this one trait on this one driver actually show, and where is
   the car while it does? Returns null if it never visibly shows — which
   is a real answer, not a failure: lateSignal bends no path at all, and
   overshoot on a driver who never reaches the line shows nothing. */
export function faultWindow(scn, who, trait, horizon = 20) {
  const dirty = simulate(scn);
  const clean = simulate(stripTrait(scn, who, trait));
  const a = findIn(dirty, who);
  const b = findIn(clean, who);
  if (!a || !b) return null;

  const samples = [];
  let peakPos = 0, peakRot = 0, anyPath = false, anySignal = false;

  for (let t = 0; t <= horizon; t += DT) {
    const pa = poseAt(a, t), pb = poseAt(b, t);
    if (pa.gone && pb.gone) break;
    // A car that is not on stage yet cannot be observed doing anything.
    if (pa.hidden || pb.hidden || pa.gone || pb.gone) continue;

    const dPos = Math.hypot(pa.x - pb.x, pa.y - pb.y);
    const dRot = Math.abs(((pa.rot - pb.rot + 540) % 360) - 180);
    const sig = signalShowing(a, t) !== signalShowing(b, t);

    const path = dPos > POS_VISIBLE || dRot > ROT_VISIBLE;
    if (!path && !sig) continue;

    if (path) anyPath = true;
    if (sig) anySignal = true;
    peakPos = Math.max(peakPos, dPos);
    peakRot = Math.max(peakRot, dRot);
    samples.push({ t: Math.round(t * 100) / 100, x: pa.x, y: pa.y, rot: pa.rot });
  }

  if (samples.length < 2) return null;
  const from = samples[0].t;
  const to = samples[samples.length - 1].t;
  if (to - from < MIN_DURATION) return null;

  return {
    who,
    trait,
    tell: TRAITS[trait]?.tell ?? trait,
    tier: DEFAULT_TIER,
    from,
    to,
    duration: Math.round((to - from) * 100) / 100,
    peakPos,
    peakRot,
    // What an examiner would actually be reading. A path fault is watched;
    // a signal fault is read off the indicator and nothing else.
    channel: anyPath ? "path" : anySignal ? "signal" : "path",
    samples,
  };
}

/* Every fault in a scenario, from every participant including the
   candidate. Ordered by when they become observable, because that is the
   order an examiner meets them in. */
export function faultsIn(scn, horizon = 20) {
  const out = [];
  const ego = { ...scn.ego, id: "ego" };
  for (const p of [ego, ...(scn.actors || [])]) {
    for (const trait of p.traits || []) {
      const w = faultWindow(scn, p.id, trait, horizon);
      if (w) out.push(w);
    }
  }
  return out.sort((x, y) => x.from - y.from || String(x.who).localeCompare(String(y.who)));
}

/* Where the faulting car is at a given instant, or null if the fault is
   not live then. The renderer and the scorer both need this: one to know
   where to draw attention, the other to know whether the examiner was
   looking at the right place at the right time. */
export function faultAt(fault, t) {
  if (t < fault.from || t > fault.to) return null;
  let best = null, gap = Infinity;
  for (const s of fault.samples) {
    const d = Math.abs(s.t - t);
    if (d < gap) { gap = d; best = s; }
  }
  return best;
}
