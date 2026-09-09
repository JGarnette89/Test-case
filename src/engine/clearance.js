/* =====================================================================
   CLEARANCE — how much of somebody else's space the candidate took

   THE STANDARD IS ENCROACHMENT ON ENTITLED SPACE, NOT FORCED EVASIVE
   ACTION. The maintainer's ruling, and it is stricter than collision
   avoidance on purpose: "turning within .3 seconds in front of someone is
   hardly yielding to traffic when though it didn't necessarily force a
   defensive action to prevent a collision, instead to protect this
   space."

   So a fault EXISTS INDEPENDENTLY OF ANY REACTION. Nothing in this file
   knows or cares whether the other driver braked. That matters
   structurally as well as morally: defining the fault in terms of the
   reaction would make the marking sheet depend on the reaction layer, and
   then a scene where nobody happened to have to react would silently
   contain no fault.

   TIME, NOT DISTANCE. A gap in metres means nothing without closing
   speed. The quantity is POST-ENCROACHMENT TIME: how much time separates
   the candidate's occupancy of a piece of road from the entitled driver's
   occupancy of the same piece. It is literally what "turning within .3
   seconds in front of someone" measures, and it degenerates to ordinary
   following headway when the candidate turns INTO another's lane rather
   than across it — which is why it works for crossing and following
   conflicts without two different measures.

   THE WORST OF IT, NOT THE VALUE AT ONE INSTANT. The candidate
   accelerates away, so the gap recovers; the severity of the fault is how
   bad it got, not what it happened to be at the moment of crossing.

   Pure. No React, no DOM, no colour, and no dependency on anything that
   reacts.
   ===================================================================== */
import { poseAt, extentsFor, poseFor, boxesOverlap, LOOKAHEAD, STEP } from "./index.js";

/* ---------------------------------------------------------------------
   The bands, derived from the engine's own notion of entitled space
   --------------------------------------------------------------------- */

/* A driver is taught to keep 2-3 seconds. That is not available at this
   game's pace, and the scale factor is NOT invented to fit: the engine
   has believed in an entitled gap since forwardClaim was written. A
   moving vehicle claims `LOOKAHEAD` seconds of road ahead of it, and
   legalAt refuses to let anybody into that space. So the game's entitled
   gap is already stated, already in seconds, and already shipped.

   ENTITLED = LOOKAHEAD = 0.9s, against a real-world 2.0s: a scale factor
   of 0.45. The ratios are preserved from there — real driving marks the
   space as encroached below 2.0s and puts the other driver inside their
   own reaction envelope below about 1.0s, a 2:1 split, so the game's
   split is 0.9 : 0.45.

   Cross-checked against the game's own behaviour rather than asserted: a
   LEGAL departure across the shipped set and 30 generated draws leaves a
   worst PET with median 1.90s and p10 1.40s, and 95% of them land in
   `comfortable`. So the standard does not mark ordinary driving, while
   still being strict enough that the one situation authored to be tight —
   `gap`, at 0.70s — measures as tight. That is the ruling working: the
   examiner's standard sits inside the safety engine's, not on top of it.

   A literal 2.0s would have marked most correct driving here, which is
   the incompatibility the scale factor exists to resolve. */
export const ENTITLED = LOOKAHEAD;
export const REACTION_ENVELOPE = ENTITLED / 2;

/* Ordered worst-first. `contact` is deliberately NOT a PET threshold: it
   is the engine's existing collision predicate, so the terminal outcome
   stays exactly where it already is and nothing about collision handling
   moves. */
export const BANDS = [
  { id: "contact", label: "Contact", terminal: true },
  { id: "veryTight", label: "Very tight", min: 0, max: REACTION_ENVELOPE, terminal: false },
  { id: "tight", label: "Tight", min: REACTION_ENVELOPE, max: ENTITLED, terminal: false },
  { id: "comfortable", label: "Comfortable", min: ENTITLED, max: Infinity, terminal: false },
];

export function bandFor(pet, touched = false) {
  if (touched) return BANDS[0];
  if (!Number.isFinite(pet)) return BANDS[3];
  return BANDS.slice(1).find((b) => pet >= b.min && pet < b.max) ?? BANDS[3];
}

/* ---------------------------------------------------------------------
   Measuring it
   --------------------------------------------------------------------- */

/* Sampling step. Coarser than STEP on purpose: this is an O(n^2) sweep
   over two timelines and the accept/reject loop may want to call it. The
   band boundaries are 0.45s apart, so 0.05s of resolution buys nothing a
   band could notice. */
export const PET_STEP = 0.1;
/* Beyond this the two were never near enough in time to be about each
   other, and pairing them up would only cost time. */
export const PET_WINDOW = 6;

/* Both tracks are sampled on ONE grid anchored at zero, not each from its
   own start. Sampling them from different origins put their timestamps
   half a step out of phase, so two vehicles genuinely occupying the same
   space at the same instant reported a PET of 0.05s rather than contact —
   a resolution artifact masquerading as a near miss. */
function trackOf(p, from, horizon, dt) {
  const out = [];
  const first = Math.ceil(from / dt) * dt;
  for (let t = first; t <= horizon; t += dt) {
    const po = poseAt(p, t);
    if (!po || po.hidden || po.gone || !Number.isFinite(po.x)) continue;
    out.push({ t: Math.round(t / dt) * dt, po, ext: extentsFor(p, po, 0, 0, 0, "hit"), p });
  }
  return out;
}

/* Contact is the engine's own collision test at a single instant, not a
   PET that rounded to nothing. Keeping it separate is what leaves the
   terminal outcome exactly where it already was. */
export function touchesEver(a, b, { from = 0, horizon = 18, dt = PET_STEP } = {}) {
  return touchEver(trackOf(a, from, horizon, dt), trackOf(b, 0, horizon, dt), dt) != null;
}

function touchEver(A, B, dt) {
  const byT = new Map();
  for (const y of B) byT.set(Math.round(y.t / dt), y);
  for (const x of A) {
    const y = byT.get(Math.round(x.t / dt));
    if (!y) continue;
    if (boxesOverlap(poseFor(x.p, x.po, 0, "hit"), x.ext, poseFor(y.p, y.po, 0, "hit"), y.ext)) return x.t;
  }
  return null;
}

/* The smallest time separation at which these two ever want the same
   space, and when. Infinity if their paths never conflict at all — which
   is a real answer, not a failure: most road users at most junctions are
   simply nothing to do with each other.

   Returns `touched` when they want it at the same instant, which is the
   engine's own collision test rather than a PET of zero. */
export function petBetween(a, b, { from = 0, horizon = 18, dt = PET_STEP } = {}) {
  const A = trackOf(a, from, horizon, dt);
  const B = trackOf(b, 0, horizon, dt);
  let best = Infinity, at = null;
  for (const x of A) {
    for (const y of B) {
      const gap = Math.abs(x.t - y.t);
      if (gap > PET_WINDOW || gap > best) continue;
      if (!boxesOverlap(poseFor(x.p, x.po, 0, "hit"), x.ext, poseFor(y.p, y.po, 0, "hit"), y.ext)) continue;
      best = gap;
      at = x.t;
    }
  }
  const hit = touchEver(A, B, dt);
  return { pet: hit != null ? 0 : best, at: hit ?? at, touched: hit != null };
}

/* You cannot leave before you arrive. A caller sweeping "what if they
   went N seconds early" will run past the ego's own arrival on a scenario
   whose window opens soon after it — measured, 4 of the 18 shipped
   situations at 2s early — and the poses that come back for a car that
   departed before it got there are not a tighter version of the
   manoeuvre, they are nonsense. Guarded here rather than in every caller,
   because it is a fact about the world and not about any one measurement. */
export const clampDepart = (ego, at) => Math.max(at, ego?.arriveAt ?? 0);

/* What the candidate took from everyone entitled to it.

   Entitled means the road users who had priority — `sim.priors` — because
   the fault is failing to yield space that was somebody else's, not
   passing close to somebody who was yielding to you.

   PEDESTRIANS GOVERNED BY `blockUntilClear` ARE EXCLUDED, and the reason
   is precise rather than categorical: one on a crossing is governed by a
   legal rule about the whole crossing rather than a following gap, so
   folding them into a headway measure would restate that rule in the
   wrong currency.

   It used to exclude ALL pedestrians, which was the same reasoning
   applied one step too widely. Somebody standing at a kerb is not on a
   crossing and no legal hold covers them — passing them at a third of a
   second IS a following-gap question, and it is the only clearance
   question a non-blocking hazard can ask. Narrowed to the rule's own
   stated scope; every pedestrian shipped or generated today carries
   `blockUntilClear`, so nothing that exists moves. */
export function encroachmentIn(sim, { departAt = null, horizon = 18 } = {}) {
  const ego = departAt == null ? sim.ego : { ...sim.ego, departAt: clampDepart(sim.ego, departAt) };
  const entitled = (sim.priors?.length ? sim.priors : sim.actors)
    .filter((a) => !(a.kind === "ped" && a.blockUntilClear));
  const out = [];
  for (const a of entitled) {
    const r = petBetween(ego, a, { from: ego.departAt ?? 0, horizon });
    if (!Number.isFinite(r.pet)) continue;
    out.push({ who: a.id, name: a.name ?? a.id, pet: r.pet, at: r.at, touched: r.touched, band: bandFor(r.pet, r.touched).id });
  }
  return out.sort((x, y) => x.pet - y.pet);
}

/* The single worst thing the candidate did to anybody, which is what a
   mark sheet records. */
export function worstEncroachment(sim, opts) {
  const all = encroachmentIn(sim, opts);
  return all.length ? all[0] : null;
}
