/* =====================================================================
   ACTUATED SIGNALS: lights that answer the traffic standing at them.

   The maintainer's ruling (8 October, SIMULATOR.md "GOOD DRIVING IS PAID
   IN FLOW"): good driving is rewarded in time moving, never speed off
   the line -- and the first and cleanest way a real road does that is
   the loop in the pavement. A signal that has been running on a clock
   (signal.js) now runs on its detectors, as most real ones do:

     THE STOP-LINE LOOP. Presence: a car standing on it, or over it,
     CALLS its phase. A car that stops well short of the line is not on
     it, and its phase is never called -- the light does not change for
     a driver who does not pull up to it. Creeping up is the remedy, as
     on a real road.

     THE ADVANCE LOOP, back at the start of the dilemma zone -- the same
     reaction-plus-comfortable-stop distance the amber is derived from,
     so nothing new is chosen. A car crossing it at speed calls its phase
     ahead of arriving, and on a green it EXTENDS it: the green holds
     while cars keep coming, gap by gap, up to the plan's own green.

   A green runs at least MIN_GREEN, then ends when nobody has actuated
   it for PASSAGE seconds (it GAPS OUT) or at the plan's green (it MAXES
   OUT) -- but only if another phase is waiting. With nobody waiting it
   rests in green. Amber and all-red are the plan's, derived as before.
   A protected left arrow leads its phase only when a left lane is
   called. MIN_GREEN, PASSAGE and LOOP are traffic-engineering settings,
   flagged as design constants; everything else is the plan's.

   COORDINATED SIGNALS keep their wave. A light in a green-wave system
   (progression.js) runs its clock as before, but a side phase whose
   turn comes with nobody calling it is SKIPPED: the coordinated road
   stays green through it. The coordinated windows never move, so a car
   at the posted speed meets the same greens; the road only gains the
   time nobody was using.

   PURE. `stepLights` takes the plans, the last state and what the loops
   detect this tick, and returns the next state; crossing.js feeds it
   from the committed world and stores the result on the world, so a
   light is decided from the traffic as it was, like every driver's
   decision, and two worlds stepped side by side never share one.
   ===================================================================== */

export const LOOP = 10;        // m: a stop-line presence loop's length back from the line (design constant)
export const MIN_GREEN = 6;    // s: the shortest green once given (design constant)
export const PASSAGE = 3;      // s: the gap in actuations that ends a green (design constant)
export const MIN_ARROW = 4;    // s: the shortest protected left once given (design constant)

/* WHAT THE LOOPS SEE at one node: `dets` is every car on an approach to
   it, as { base, intent, toLine, v, player } -- toLine the distance from
   where it waits to where it is, negative past the line. */
export function detect(plan, dets) {
  const called = new Set(), acted = new Set(), lefts = new Set(), saw = {};
  for (const d of dets) {
    const i = plan.forBase[d.base];
    if (i == null) continue;
    const onLoop = d.toLine >= -1 && d.toLine <= LOOP;
    const advance = !onLoop && d.v > 2 && d.toLine > LOOP && d.toLine <= (plan.advance?.[d.base] ?? 0);
    if (!onLoop && !advance) continue;
    called.add(i);
    /* A car standing on the loop holds its call; a car MOVING over either
       loop is an actuation, which is what keeps a green going. */
    if (advance || d.v > 0.5) acted.add(i);
    if (d.intent === "left" && plan.arrows?.[d.base]) lefts.add(d.base);
    if (d.player) saw[d.base] = true;
  }
  return { called, acted, lefts, saw };
}

const coordinated = (plan) => plan.offset != null && plan.coord?.length > 0;

/* THE FIRST STATE, at time t: an isolated light starts in its first
   phase's green with its minimum already served, so it can answer the
   first call at once; a coordinated one starts where its clock is. */
export function initLight(plan, t = 0) {
  /* `shift`: how far this light's clock runs ahead of the world's -- the
     warm-up winds the world's back to zero (crossing.js `warmed`) and a
     light that jumped with it would go from green to red with no amber
     under a car already crossing. Every light shifts alike, so the wave
     between them is untouched. */
  if (coordinated(plan)) return { mode: "coord", cur: null, next: null, shift: 0, live: null, saw: {} };
  return { mode: "green", i: 0, at: t - MIN_GREEN, lastAct: -Infinity, callAt: null, live: liveOf(plan, "green", 0), saw: {} };
}

/* The next phase after i that is called, in the plan's order; null when none is. */
function nextCalled(plan, i, called) {
  const n = plan.phases.length;
  for (let d = 1; d < n; d++) { const j = (i + d) % n; if (called.has(j)) return j; }
  return null;
}

/* What each approach shows in a mode: the ball, and the arrow. */
function liveOf(plan, mode, i) {
  const ball = {}, arrow = {};
  plan.phases.forEach((bases, j) => bases.forEach((b) => {
    ball[b] = j !== i ? "red" : mode === "green" ? "green" : mode === "amber" ? "amber" : "red";
    arrow[b] = j === i && plan.arrows?.[b] ? (mode === "arrow" ? "green" : mode === "arrowAmber" ? "amber" : null) : null;
  }));
  return { ball, arrow };
}

/* ONE TICK of an isolated light. */
function stepIsolated(plan, s0, seen, t) {
  const s = { ...s0, saw: seen.saw };
  const el = t - s.at;
  const to = (mode, extra = {}) => Object.assign(s, { mode, at: t }, extra);
  if (s.mode === "green") {
    if (seen.acted.has(s.i)) s.lastAct = t;
    const next = nextCalled(plan, s.i, seen.called);
    /* THE MAXIMUM RUNS FROM THE CALL THAT WANTS THE GREEN, not from the
       green's start: a green that has rested a minute with nobody
       waiting has not used up anybody's time. */
    s.callAt = next == null ? null : s.callAt ?? t;
    if (next != null && el >= MIN_GREEN && (t - s.lastAct > PASSAGE || t - s.callAt >= plan.greenFor)) to("amber", { callAt: null });
  } else if (s.mode === "amber") {
    if (el >= plan.amber) to("allred");
  } else if (s.mode === "allred") {
    if (el >= plan.allRed) {
      /* The call that ended the green is served -- or, if it has gone
         (the car turned right on red and left), the green comes back. */
      const j = nextCalled(plan, s.i, seen.called) ?? s.i;
      const leftCalled = plan.phases[j].some((b) => seen.lefts.has(b));
      to(leftCalled ? "arrow" : "green", { i: j, lastAct: t });
    }
  } else if (s.mode === "arrow") {
    if (plan.phases[s.i].some((b) => seen.lefts.has(b))) s.lastAct = t;
    if (el >= MIN_ARROW && (t - s.lastAct > PASSAGE || el >= plan.arrowFor)) to("arrowAmber");
  } else if (s.mode === "arrowAmber") {
    if (el >= plan.amber) to("arrowRed");
  } else if (s.mode === "arrowRed") {
    if (el >= plan.allRed) to("green", { lastAct: t });
  }
  s.live = liveOf(plan, s.mode, s.i);
  return s;
}

/* ONE TICK of a coordinated light: the clock's windows, a side window
   skipped when nobody calls it at the moment it would have to begin --
   which is when the phase before it would start its amber. A window
   that is skipped belongs to whoever was green before it. */
function windowAt(plan, t) {
  const tt = t - (plan.offset ?? 0), n = Math.floor(tt / plan.cycle), into = tt - n * plan.cycle;
  let j = plan.phases.length - 1;
  while (j > 0 && into < plan.starts[j]) j--;
  return { n, j, u: into - plan.starts[j] };
}
function stepCoordinated(plan, s0, seen, t) {
  const s = { ...s0, saw: seen.saw };
  const w = windowAt(plan, t + (s.shift ?? 0)), nPh = plan.phases.length;
  const key = (n, j) => n * nPh + j;
  const side = (j) => !plan.coord.includes(j);
  const lead = (j) => plan.lead?.[j] ?? 0;
  const decide = (n, j, before) => {
    const served = !side(j) || seen.called.has(j);
    /* THE LEADING ARROW runs when the light comes to this phase from
       another, as the clock has it -- or, where this phase is already
       green going in, only if a left-turner is calling for it, and then
       the green ends with its amber first. Running it under a green that
       simply carried on put every ball from green straight to red, under
       a car already crossing (8 October). */
    const arrow = served && lead(j) > 0 && (before !== j || plan.phases[j].some((b) => seen.lefts.has(b)));
    /* `from`: when, inside the window, the current owner's green began. */
    return { key: key(n, j), j, served, arrow, owner: served ? j : before, before, from: arrow ? lead(j) : 0, sws: [], lastAct: -Infinity };
  };
  if (!s.cur || s.cur.key !== key(w.n, w.j)) {
    s.cur = s.next && s.next.key === key(w.n, w.j) ? s.next : decide(w.n, w.j, s.cur?.owner ?? plan.coord[0]);
    s.next = null;
  }
  const cur = (s.cur = { ...s.cur });
  const greenEnd = lead(w.j) + plan.greenFor, change = plan.amber + plan.allRed;
  if (seen.acted.has(w.j)) cur.lastAct = t;
  /* INSIDE A SIDE WINDOW -- the two things a real coordinated-actuated
     controller does with the time it is given. LATE SERVICE: a call that
     arrives while the window still has room for a change and a minimum
     green is served for the rest of it. EARLY RETURN: a side phase whose
     traffic has gone gaps out and hands the rest of its window back to
     the road it was taken from. Either way the coordinated windows
     themselves never move. */
  const settled = !cur.sws.length || w.u >= cur.sws[cur.sws.length - 1].at + change;
  if (side(w.j) && settled && w.u < greenEnd) {
    if (cur.owner !== w.j && seen.called.has(w.j) && greenEnd - w.u >= change + MIN_GREEN) {
      cur.sws = [...cur.sws, { at: w.u, from: cur.owner }];
      cur.owner = w.j; cur.served = true; cur.lastAct = t; cur.from = w.u + change;
    } else if (cur.owner === w.j && w.u >= cur.from + MIN_GREEN && t - cur.lastAct > PASSAGE && greenEnd - w.u >= change) {
      cur.sws = [...cur.sws, { at: w.u, from: w.j }];
      cur.owner = cur.before; cur.from = w.u + change;
    }
  }
  /* The decision for the next window is taken when this one's green ends. */
  if (w.u >= greenEnd && !s.next) {
    const nj = (w.j + 1) % nPh, nn = nj === 0 ? w.n + 1 : w.n;
    s.next = decide(nn, nj, cur.owner);
  }
  let mode, owner = cur.owner;
  const last = cur.sws[cur.sws.length - 1];
  if (last && w.u < last.at + change) {
    owner = last.from;
    mode = w.u < last.at + plan.amber ? "amber" : "allred";
  } else if (!cur.sws.length && cur.arrow && w.u < lead(w.j)) mode = w.u < plan.arrowFor ? "arrow" : w.u < plan.arrowFor + plan.amber ? "arrowAmber" : "arrowRed";
  else if (w.u < greenEnd || !s.next || (s.next.owner === owner && !s.next.arrow)) mode = "green";
  else mode = w.u < greenEnd + plan.amber ? "amber" : "allred";
  s.live = liveOf(plan, mode, owner);
  return s;
}

/* EVERY SIGNALLED NODE, ONE TICK. `plans[k]` the plan (null where the
   node has none), `state[k]` its last state, `detsAt(k)` the cars on its
   approaches. Returns the next state, keyed by node. */
export function stepLights(plans, state, detsAt, t) {
  const out = {};
  for (const k in plans) {
    const plan = plans[k];
    const s0 = state?.[k] ?? initLight(plan, t);
    const seen = detect(plan, detsAt(Number(k)));
    out[k] = coordinated(plan) ? stepCoordinated(plan, s0, seen, t) : stepIsolated(plan, s0, seen, t);
  }
  return out;
}

