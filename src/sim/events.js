/* =====================================================================
   EVENTS: the moments the game notices about the player's driving
   (PLAN.md phase 2; DIALOGUE.md).

   One detector per trigger, each a comparison of the player and the world
   one tick apart -- what the sim already holds, never a judgement written
   here that the sim does not make. The stream feeds the voice
   (sim/voice.js), which decides what, if anything, is said: this module
   says what HAPPENED and nothing about whether to mention it.

   Pure. `detect(prev, now, state)` with prev/now = { me, world, hit } --
   `me` the player as stepDriver left them, `world` the world as it stood,
   `hit` whether the player touched anything this tick -- returns
   { events, state }. The state is the detectors' memory (streaks,
   episodes already reported); keep it and pass it back.

   EVERY FAULT RESETS THE STREAK. The streak counter is fault-free distance
   and time; "a long clean run" and "a sustained streak" fire once each per
   streak, at CLEAN_RUN metres and STREAK seconds.

   Two events the game had as mechanics but never as moments, now noticed:
   - THE GREEN WAVE: green after green at a signalled line without stopping,
     at or under the posted speed -- caught on the third; and lost by
     speeding: brought to rest by a red after riding a wave, having driven
     the link well over the limit.
   - THE PLAYER LETTING SOMEBODY IN: a car of the traffic changes into the
     player's lane in front of them, close, after the player eased off.
   ===================================================================== */
import { whatStops, AT_REST } from "./crossing.js";
import { movementLight } from "./signal.js";
import { postedAt } from "./graph.js";
import { reasonToStayOut, KEEP_RIGHT_FAULT } from "./lanechange.js";
import { clearBetween, wantedGap, lenOf, DT } from "./traffic.js";

/* What each trigger is: how serious (5 a collision, 1 a remark), and whether it is praise. */
export const TRIGGERS = {
  collision:       { severity: 5, praise: false },
  ranRed:          { severity: 5, praise: false },
  rolledStop:      { severity: 4, praise: false },
  blockingBox:     { severity: 4, praise: false },
  harshBraking:    { severity: 3, praise: false },
  lateSignal:      { severity: 3, praise: false },
  noSignal:        { severity: 3, praise: false },
  tightGap:        { severity: 3, praise: false },
  honkedAt:        { severity: 3, praise: false },
  stoppedShort:    { severity: 2, praise: false },
  dawdling:        { severity: 2, praise: false },
  missedTurn:      { severity: 2, praise: false },
  wideTurn:        { severity: 2, praise: false },
  waveLost:        { severity: 2, praise: false },
  notKeepingRight: { severity: 1, praise: false },
  underLimit:      { severity: 1, praise: false },
  waveCaught:      { severity: 2, praise: true },
  stoppedForPed:   { severity: 2, praise: true },
  letSomeoneIn:    { severity: 2, praise: true },
  cleanRun:        { severity: 2, praise: true },
  streak:          { severity: 2, praise: true },
  letIn:           { severity: 1, praise: true },
  highwayMerge:    { severity: 1, praise: true },
  passedTruck:     { severity: 1, praise: true },
  /* Raised by the screen, not detected here: it knows where the player was going (sim/route.js). */
  arrived:         { severity: 2, praise: true },
};

/* Flagged design constants: what counts as a long clean run, a sustained
   streak, dawdling, crawling, a proper signal and a wave ridden. */
export const CLEAN_RUN = 2000;        // m without a fault
export const STREAK = 300;            // s without a fault
export const DAWDLE = 3;              // s free and still: the horn's own HONK_TOPS
export const BLOCK = 2;               // s standing in the box
export const CRAWL = 10;              // s well under the limit on a clear road
export const CRAWL_SHARE = 0.6;       // of the posted speed
export const SIGNAL_LEAD = 2;         // s: the established 2-3 s, its floor
export const WAVE = 3;                // greens in a row
export const OVER = 1.1;              // of the limit, held through a link, loses a wave

export const newEventState = () => ({ streakFrom: null, streakM: 0, streakS: 0, cleanSaid: false, streakSaid: false, dawdleSince: null, boxFor: 0, boxSaid: false, crawlFor: 0, crawlSaid: false, hogFor: 0, hogSaid: false, wave: 0, overFor: 0, vHist: [], trucks: {} });

const layoutOf = (w, me) => w.course.at[me.k ?? 0]?.layout;
const pathOf = (w, me) => layoutOf(w, me)?.paths[me.route];
const legOf = (w, me) => { const L = layoutOf(w, me), p = pathOf(w, me); return p && L.legs[p.from]; };
/* A road's kind by its id: the course keeps its roads as a list, indexed once per course. */
const kinds = new WeakMap();
const kindOf = (w, leg) => {
  if (!leg) return null;
  let m = kinds.get(w.course);
  if (!m) { m = new Map((w.course.roads ?? []).map((r) => [r.id, r.kind])); kinds.set(w.course, m); }
  return m.get(leg.road) ?? null;
};

export function detect(prev, now, state0 = newEventState()) {
  const out = [];
  const st = { ...state0, trucks: { ...state0.trucks }, vHist: state0.vHist.slice(-Math.round(3 / DT)) };
  const t = now.world.t;
  const say = (id, data = {}) => out.push({ id, t, ...TRIGGERS[id], ...data });
  const pm = prev.me, me = now.me, pw = prev.world, w = now.world;
  if (!pm || !me) return { events: out, state: st };
  const L = layoutOf(w, me), path = pathOf(w, me), leg = legOf(w, me);
  const sameSpot = (pm.k ?? 0) === (me.k ?? 0);
  const pPath = pathOf(pw, pm);
  const posted = postedAt(w.course, me.k ?? 0, me.route) ?? 13.9;
  st.vHist.push(me.v ?? 0);

  /* COLLISION: the screen says the player touched something this tick. */
  if (now.hit) say("collision");

  /* CROSSING THE LINE this tick, on the same approach. */
  const crossed = sameSpot && path && pPath && pPath.from === path.from && pm.s <= path.stopAt && me.s > path.stopAt;
  if (crossed) {
    const ctl = L.place.control?.[path.from] ?? leg?.control;
    if (L.signal) {
      const light = movementLight(L.signal, leg.base, path.intent, pw.t, pw.lights?.[me.k ?? 0]?.live);
      if (light === "red" && !(path.intent === "right" && pm.stoppedAt != null)) say("ranRed");
      /* THE WAVE: through on a green without having stopped, at the limit or under. */
      if (light === "green" && pm.stoppedAt == null && (pm.v ?? 0) <= posted * 1.05) {
        st.wave++;
        if (st.wave === WAVE) say("waveCaught", { greens: st.wave });
      } else if (light !== "green") st.wave = 0;
      st.overFor = 0;
    } else if (ctl === "stop" && pm.stoppedAt == null) say("rolledStop");
    /* THE SIGNAL, for the turn this line commits to. */
    if (path.intent !== "straight") {
      const on = pw.signalOn;
      if (!pm.signal) say("noSignal");
      else if (on && on.dir === pm.signal && pw.t - on.since < SIGNAL_LEAD) say("lateSignal", { lead: pw.t - on.since });
    }
    if (pm.signal && path.intent !== pm.signal) say("missedTurn", { asked: pm.signal });
  }

  /* LOSING THE WAVE BY SPEEDING: brought to rest by a red, having ridden one, over the limit on the way. */
  if (L?.signal && (me.v ?? 0) > posted * OVER) st.overFor += DT;
  if (me.lastStop && me.lastStop !== pm.lastStop && L?.signal && st.wave >= 2 && st.overFor > 3) { say("waveLost", { greens: st.wave }); st.wave = 0; st.overFor = 0; }
  else if (me.lastStop && me.lastStop !== pm.lastStop && L?.signal) st.wave = 0;

  /* THE STOP, as stepDriver judged it. */
  if (me.lastStop && me.lastStop !== pm.lastStop) {
    if (me.lastStop.verdict === "harsh") say("harshBraking");
    else if (me.lastStop.verdict === "short") say("stoppedShort");
  }
  /* THE TURN, as the car model judged it leaving the box. */
  if (me.lastTurn && me.lastTurn !== pm.lastTurn && me.lastTurn.verdict === "wide") say("wideTurn");

  /* DAWDLING: free to go and still sitting, past the horn's own patience. */
  const since = w.playerFreeSince;
  if (since != null && t - since >= DAWDLE && st.dawdleSince !== since) { st.dawdleSince = since; say("dawdling"); }

  /* BLOCKING THE BOX: standing between the line and the far side. */
  if (path && (me.v ?? 0) < AT_REST && me.s > path.stopAt && me.s < path.clearAt) {
    st.boxFor += DT;
    if (st.boxFor >= BLOCK && !st.boxSaid) { st.boxSaid = true; say("blockingBox"); }
  } else { st.boxFor = 0; st.boxSaid = false; }

  /* HONKED AT: a horn aimed at the player this tick. */
  for (const a of w.actors) if (!a.player && a.honkTo === me.id && a.honkAt === pw.t) { say("honkedAt", { by: a.id, rival: a.rival ?? null }); break; }

  /* A LANE CHANGE INTO A GAP TOO TIGHT: the car now behind could not keep half the gap it wants. */
  if (sameSpot && path && pPath && pPath.from !== path.from && me.s <= path.stopAt) {
    let behind = null, d = Infinity;
    for (const a of w.actors) {
      if (a.player || (a.k ?? 0) !== (me.k ?? 0)) continue;
      const p = L.paths[a.route];
      if (!p || p.from !== path.from) continue;
      const gap = me.s * (p.stopAt / path.stopAt) - a.s;
      if (gap > 0 && gap < d) { d = gap; behind = a; }
    }
    if (behind && clearBetween(d, behind, me) < 0.5 * wantedGap(behind, me)) say("tightGap", { behind: behind.id });
    /* LET IN: a courtesy offered for this lane, and the player took it. */
    if (w.actors.some((a) => a.courtesy && a.courtesy.leg === path.from)) say("letIn");
  }

  /* LETTING SOMEBODY IN: a car of the traffic begins a change into the
     player's lane, in front of them and close, after the player eased off
     -- a metre a second or more over the last three seconds. */
  if (path && me.s <= path.stopAt) {
    const eased = st.vHist.length > 1 && st.vHist[0] - (me.v ?? 0) >= 1;
    for (const a of w.actors) {
      if (a.player || (a.k ?? 0) !== (me.k ?? 0) || !a.lc || a.lc.t0 !== pw.t) continue;
      const p = L.paths[a.route];
      if (!p || p.from !== path.from) continue;
      const ahead = a.s * (path.stopAt / p.stopAt) - me.s;
      if (ahead > 0 && ahead < 30 && eased) { say("letSomeoneIn", { who: a.id, rival: a.rival ?? null }); break; }
    }
  }

  /* KEEPING RIGHT: out of the curb lane with no reason, past the fault's own time. */
  if (path && leg && (leg.across ?? leg.lanes ?? 1) >= 2 && (me.v ?? 0) > 5 && !me.signal && me.s < path.stopAt - 40) {
    const reason = reasonToStayOut(w, { ...me, v0: posted }, L, path, leg, Math.max(30, posted * 4), posted);
    if (typeof reason !== "string") {
      st.hogFor += DT;
      if (st.hogFor >= KEEP_RIGHT_FAULT && !st.hogSaid) { st.hogSaid = true; say("notKeepingRight"); }
    } else { st.hogFor = 0; st.hogSaid = false; }
  } else if (!path || (me.v ?? 0) <= 5) { st.hogFor = 0; st.hogSaid = false; }

  /* CRAWLING: well under the limit on a clear road, away from any line. */
  if (path && (me.v ?? 0) > 1 && (me.v ?? 0) < posted * CRAWL_SHARE && me.s < path.stopAt - 60) {
    const view = whatStops({ ...me, caution: 1, headway: 1.6 }, w);
    if (!view.leader || view.gap > 60) { st.crawlFor += DT; if (st.crawlFor >= CRAWL && !st.crawlSaid) { st.crawlSaid = true; say("underLimit"); } }
    else st.crawlFor = 0;
  } else if ((me.v ?? 0) >= posted * 0.8) { st.crawlFor = 0; st.crawlSaid = false; }

  /* STOPPED FOR SOMEBODY ON FOOT. */
  if ((me.v ?? 0) < AT_REST && (pm.v ?? 0) >= AT_REST && whatStops({ ...me, caution: 1, headway: 1.6 }, w).leader?.id === "ped") say("stoppedForPed");

  /* ONTO THE HIGHWAY, at its pace: from a road of another kind onto a highway, at four fifths of its limit or better. */
  if (!sameSpot || (pPath && path && pPath !== path)) {
    const was = kindOf(pw, legOf(pw, pm)), is = kindOf(w, leg);
    if (was && was !== "highway" && is === "highway" && (me.v ?? 0) >= 0.8 * posted) say("highwayMerge");
  }

  /* PASSING A TRUCK: one in the next lane, same approach, from ahead of the player to behind. */
  if (path && leg) {
    for (const a of w.actors) {
      if (a.kind !== "truck" || (a.k ?? 0) !== (me.k ?? 0)) { delete st.trucks[a.id]; continue; }
      const p = L.paths[a.route], al = p && L.legs[p.from];
      if (!al || al.base !== leg.base || al.id === leg.id) { delete st.trucks[a.id]; continue; }
      const rel = a.s * (path.stopAt / p.stopAt) - me.s, half = lenOf(a) / 2;
      const was = st.trucks[a.id];
      if (was != null && was > half && rel < -half && (me.v ?? 0) > (a.v ?? 0)) say("passedTruck", { truck: a.id });
      st.trucks[a.id] = rel;
    }
  }

  /* THE STREAK: fault-free distance and time; any fault starts it again. */
  if (out.some((e) => !e.praise)) { st.streakM = 0; st.streakS = 0; st.cleanSaid = false; st.streakSaid = false; }
  else {
    st.streakM += (me.v ?? 0) * DT; st.streakS += DT;
    if (st.streakM >= CLEAN_RUN && !st.cleanSaid) { st.cleanSaid = true; say("cleanRun", { metres: Math.round(st.streakM) }); }
    if (st.streakS >= STREAK && !st.streakSaid) { st.streakSaid = true; say("streak", { seconds: Math.round(st.streakS) }); }
  }
  return { events: out, state: st };
}

