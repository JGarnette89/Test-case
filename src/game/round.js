/* =====================================================================
   A ROUND, PURE (WORK-game-slice2 section 4): the decision point, one
   tick, the timing, the end condition and the verdict. No React, no DOM,
   no .jsx import, so a check in Node builds the same world the screen does.

   A ROUND IS ONE FROZEN DECISION (Jay, 25 November). `toDecision` runs the
   autopilot (autopilot.js) to the stop line and returns the round FROZEN
   there. The player presses (`press`: the sim runs, the car holds) and lets
   go (`release`: the car goes). Phases: approach (building), frozen,
   waiting, gone.

   WHAT HAPPENED IN A ROUND IS WHAT THE SIM'S TRAFFIC DID AND WHAT THE
   PLAYER'S DETECTORS (sim/events.js) NOTICED (GAME.md rule 1). Two things
   are added here, each the sim's own question asked at one moment:
   - failedToYield: crossing.js openTo, asked at the pull-away and the entry
     (slice 1, unchanged);
   - the TIMING: when the road became the player's (openTo, asked every
     tick from the freeze) against when they went.

   Every grade below -- the stars and the constants beside them -- is
   [invented] until Jay rules (GAME.md rule 2): the marking logic examiners
   use is not public and stays out.
   ===================================================================== */
import { worldFor, playerContact, PREROLL } from "../sim/scene.js";
import { step, DT, openTo, AT_REST, atNode, blockedBy } from "../sim/crossing.js";
import { stepDriver, withDriver } from "../sim/drive.js";
import { afterContact } from "../sim/contact.js";
import { detect, newEventState, TRIGGERS } from "../sim/events.js";
import { DEFAULT_MERGE_TOLERANCE } from "../sim/lanechange.js";
import { lenOf } from "../sim/traffic.js";
import { REACTION_FLOOR } from "../core/perception.js";
import { autoInput } from "./autopilot.js";
import { faultWords, praiseWords } from "./words.js";

/* What `sceneFor` is called with by its other callers (ExamRide: 50 and 2.0; MapRoad: 50 and 2.0). `kmh` only sizes
   the geometry of a map whose roads post their own speeds; `every` is the spawn spacing the screens pass. [instrument] */
export const KMH = 50;
export const EVERY = 2.0;

export const CLEAR_BY = 25;       // m past the far edge of the box, in the lane out, and the round is through [invented]
export const TIME_CAP = 60;       // s of a round, counted from the freeze, before it is called out of time [invented]
export const APPROACH_CAP = 60;   // s of sim time to build the decision point; past it the seed is not a round [invented, the spec's]
export const FRONT_CLEAR = 10;    // m of clear road ahead in the player's own lane for "at the front" [invented, the spec's]
/* m: at rest with the FRONT BUMPER within this of the stop line [invented, the spec's 2 m]. The spec said the car's position within 2 m of the line,
   but `me.s` is the car's centre and a sound driver stops with the bumper at the line, so the centre is half a car length (2.25 m [M,
   a probe: s 132.1 at rest, stopAt 134.35]) short of it, always. The bumper is the quantity the spec means. */
export const AT_LINE = 2;
export const FAILED_TO_YIELD = 5;  // severity of going when the way was not open [invented]
export const WRONG_TURN = 2;      // severity of making another turn than the one asked [invented] (TRIGGERS gives missedTurn 2)
/* m short of the stop line within which a pull-away from rest is THE pull-away from the line, the moment a stop-and-go driver
   commits (crossing.js blockedBy: "commitment begins at the launch rather than at the line"). [invented] */
export const LAUNCH_SPAN = 6;

/* THE TIMING [invented] until Jay rules. */
/* Seconds after the road became the player's at which waiting is UNDUE DELAY. It restates crossing.js's `const UNDUE_AT = 4.0;`
   (line 745), which is not exported and cannot be without an edit under src/sim. tools/verify-rounds.mjs section 6 reads that
   line's text and holds the two equal: it is the one place they are held together. [the Ontario scoresheet's "4-5 seconds"
   is Jay's; the reading as time since the opening is the sim's] */
export const UNDUE = 4.0;
export const UNDUE_SEVERITY = 2;      // [invented]
export const MISSED_GAP = 1.5;        // s: an earlier opening at least this long, let pass, is a missed gap [invented, the spec's]
export const STARS_AT = [1.0, 2.5];   // s of delay: at most the first is 3 stars, at most the second 2, later 1 [invented, the spec's]
export const EARLY_STARS = 2;         // went before the first opening, and not flagged as failing to yield [invented, the spec's]
const EPS = 1e-6;                     // [instrument] float slack on sums of DT

/* The arguments `sceneFor` (apps/MapRoad.jsx) takes, positionally. */
export const sceneArgs = (def) => [def.seed, KMH, EVERY, true, def.cars, def.map(), def.start];

/* The same world `sceneFor` builds, through the one function it calls (sim/scene.js worldFor), with the trailing options it passes. */
export const roundWorld = (def) => worldFor(...sceneArgs(def), false, false, { checks: false, mergeTolerance: DEFAULT_MERGE_TOLERANCE, preroll: PREROLL });

export function startRound(def, { world, me }) {
  return {
    def, world, me, ev: newEventState(), events: [], t0: world.t, targetK: me.k, made: null, crossedAt: null, launch: null, end: null,
    phase: "approach", decideAt: null, goAt: null, openings: [], timing: null,
  };
}

/* WHO HOLDS THE WAY, BY THE STOP RULE: a driver the sim says this one must yield to (crossing.js blockedBy, the same call openTo
   makes) who is themselves at a stop sign as posted and not yet under way -- waiting for a turn they have. Classifies why the
   way was shut; openTo decides whether it was. */
function waitingByStop(me, world) {
  const L = world.course.at[me.k ?? 0].layout;
  return atNode(world, world.actors, me.k ?? 0).some((a) => {
    if (a.id === me.id || a.going || !blockedBy(me, a, L, 1, world.t ?? 0)) return false;
    const q = L.paths[a.route];
    return (L.place.control?.[q.from] ?? L.legs[q.from]?.control) === "stop";
  });
}

const layoutOf = (w, me) => w.course.at[me.k ?? 0]?.layout;
const pathOf = (w, me) => layoutOf(w, me)?.paths[me.route];

/* THE OPENINGS: whether the road is the player's now, for a sound driver standing at the line -- the question the sim's undue-delay
   clock asks (crossing.js openTo, caution 1). The list holds stretches { from, to } in world.t; `to` is null while one is still open. */
const wayOpen = (rs) => openTo({ ...rs.me, caution: 1 }, rs.world, 1);
function trackOpenings(rs) {
  const open = wayOpen(rs), t = rs.world.t, last = rs.openings[rs.openings.length - 1];
  if (open && (!last || last.to != null)) return { ...rs, openings: [...rs.openings, { from: t, to: null }] };
  if (!open && last && last.to == null) return { ...rs, openings: [...rs.openings.slice(0, -1), { ...last, to: t }] };
  return rs;
}

/* IS A FRONT CAR NEARER THAN FRONT_CLEAR: any other car of the player's own approach leg and node, past the player, with a bumper-to-bumper
   gap under it. Measured on the leg, not the lane index, which reads nothing at rest (drive.js headwayOf needs 2 m/s). */
function carAhead(rs) {
  const { me, world } = rs, L = layoutOf(world, me), path = L.paths[me.route];
  return world.actors.some((a) => {
    if (a.id === me.id || a.shadow || (a.k ?? 0) !== (me.k ?? 0)) return false;
    const q = L.paths[a.route];
    return q && q.from === path.from && a.s > me.s && a.s - me.s - lenOf(a) / 2 - lenOf(me) / 2 < FRONT_CLEAR;
  });
}

/* BUILDING TO THE DECISION POINT: the world for (def, seed, cars), the autopilot's approach until the car is at rest at its line, at
   the front, with its stop counted -- and the round frozen there. Null when the point is not reached inside APPROACH_CAP, or the car
   was touched or ended the round on the way: the seed is not a round. The approach's events are not the player's: the list starts
   empty (the detectors' own state carries on, so the stop is still judged as one). */
export function toDecision(def0, seed, cars) {
  const def = { ...def0, seed, cars };
  let rs = startRound(def, roundWorld(def));
  const t0 = rs.world.t;
  while (rs.world.t - t0 <= APPROACH_CAP) {
    if (rs.end || rs.crossedAt != null || rs.me.contacts > 0) return null;
    const path = pathOf(rs.world, rs.me);
    if (rs.me.v < AT_REST && rs.me.stoppedAt != null && Math.abs(path.stopAt - (rs.me.s + lenOf(rs.me) / 2)) <= AT_LINE && rs.me.k === rs.targetK && !carAhead(rs)) {
      rs = { ...rs, events: [], phase: "frozen", decideAt: rs.world.t, t0: rs.world.t };
      return trackOpenings(rs);
    }
    rs = roundTick(rs);
  }
  return null;
}

/* The player presses: the sim runs, the car holds. */
export const press = (rs) => (rs.phase === "frozen" ? { ...rs, phase: "waiting" } : rs);

/* THE TIMING VERDICT, at GO. Looks at the openings as they stand at `now` (the world the car is released in).
   - inside an opening: the stretch the GO falls in is open now and has run REACTION_FLOOR (a shorter one was never an opening),
     or is the one open at the freeze (going at once is the right answer, and it has no history to measure). delay = now - its start.
     missedGap: an EARLIER stretch of at least MISSED_GAP, let pass.
   - otherwise: before an opening (or into a shut road after one): kind "early". */
export function timingOf(openings, decideAt, now) {
  const cur = openings[openings.length - 1];
  const atFreeze = !!cur && cur.to == null && cur.from === decideAt;
  if (cur && cur.to == null && (atFreeze || now - cur.from >= REACTION_FLOOR - EPS)) {
    const earlier = openings.slice(0, -1);
    return { kind: "inside", delay: now - cur.from, from: cur.from, missedGap: earlier.some((o) => o.to - o.from >= MISSED_GAP - EPS), atFreeze };
  }
  return { kind: "early", delay: null, from: null, missedGap: false, atFreeze: false };
}

/* The player lets go: the decision. */
export function release(rs) {
  if (rs.phase !== "frozen" && rs.phase !== "waiting") return rs;
  return { ...rs, phase: "gone", goAt: rs.world.t, timing: timingOf(rs.openings, rs.decideAt, rs.world.t) };
}

/* One tick. In `frozen` it does nothing (the screen does not call it) and returns `rs`. `held === false` while waiting is a release
   (a screen that reads the button's state each tick can pass it instead of calling `release`). The autopilot drives the car: `hold` in
   waiting, `go` once gone, `approach` while building. */
export function roundTick(rs, { held } = {}) {
  if (rs.phase === "frozen") return rs;
  if (rs.phase === "waiting" && held === false) rs = release(rs);
  const { def } = rs;
  const prev = { me: rs.me, world: rs.world };
  let me = rs.me, world = rs.world;
  const phase = rs.phase === "waiting" ? "hold" : rs.phase === "gone" ? "go" : "approach";
  const inp = autoInput(me, world, { task: def.task, phase });
  me = stepDriver({ ...me, signal: inp.signal }, { steer: inp.steer, slider: inp.slider, assist: 0 }, world, DT);
  let w = step(withDriver(world, me));
  const c = playerContact(w, me);
  world = c.world;
  /* After the end the world and the car go on moving, so the player sees what happened, but nothing more is noticed or judged. */
  if (rs.end) {
    me = afterContact(me, c, world).me;
    world = withDriver(world, me);
    return { ...rs, me, world };
  }
  const { events: found, state } = detect(prev, { me, world, hit: c.hit, contact: c }, rs.ev);
  const events = found.slice();

  /* THE TURN MADE, and FAILED TO YIELD: on the tick the line is crossed at the round's own intersection (events.js's own test). */
  let { made, crossedAt, launch } = rs;
  const path = pathOf(world, me), pPath = pathOf(prev.world, prev.me);
  const sameApproach = me.k === rs.targetK && (prev.me.k ?? 0) === (me.k ?? 0) && path && pPath && pPath.from === path.from;
  /* THE PULL-AWAY FROM THE LINE: the last one before the crossing, and whether a sound driver standing there had an opening. */
  if (sameApproach && made == null && (prev.me.v ?? 0) < AT_REST && (me.v ?? 0) >= AT_REST && prev.me.s <= path.stopAt && path.stopAt - prev.me.s < LAUNCH_SPAN) {
    const sound = { ...prev.me, caution: 1 }, open = openTo(sound, prev.world, 1);
    launch = { t: world.t, open, byStop: !open && waitingByStop(sound, prev.world) };
  }
  const crossed = sameApproach && prev.me.s <= path.stopAt && me.s > path.stopAt;
  if (crossed && made == null) {
    made = path.intent; crossedAt = world.t;
    /* FAILED TO YIELD (review, 24 November; slice 2: the pull-away is the GO, and this is unchanged). Each moment is read in the
       world before the move, for a sound driver in the player's place (crossing.js openTo, the undue-delay clock's own question).
       Two kinds of right of way, judged two ways:
       - THE TURN AT A STOP: pulling away from the line while a driver at a stop sign who has the right of way is still
         waiting for it (they stopped first, or are on the right). A rule with no judgment in it, so the pull-away alone is it.
       - A GAP IN MOVING TRAFFIC: the sound driver's gap is conservative (one pull-away it refused had the car 87 m and 9.6 s
         off), so it counts only if the way was ALSO shut as the player entered -- by which time only a car already committed
         to the intersection shuts it. The proper measure is the time margin to the entitled car (post-encroachment time,
         the encroachment ruling): not built.
       Read at the crossing alone it blamed the player for a rival who stopped after them and went out of turn, both already
       under way. Rolling in with no pull-away, the crossing is the commitment. All [invented] until Jay rules.
       On a red, ranRed already says it. */
    const atEntry = openTo({ ...prev.me, caution: 1 }, prev.world, 1);
    const failed = launch ? launch.byStop || (!launch.open && !atEntry) : !atEntry;
    if (!events.some((e) => e.id === "ranRed") && failed) {
      events.push({ id: "failedToYield", t: world.t, severity: FAILED_TO_YIELD, praise: false });
    }
  }

  me = afterContact(me, c, world).me;
  world = withDriver(world, me);

  /* THE END: the first of these. The time is counted from the freeze, and not at all while the decision point is being built. */
  let end = null;
  const p2 = pathOf(world, me);
  if (crossedAt != null && ((me.k === rs.targetK && p2 && me.s >= p2.clearAt + CLEAR_BY) || me.k !== rs.targetK)) end = { why: "through" };
  else if (c.fresh?.some((f) => f.kind === "person" || f.atFault)) end = { why: "contact" };
  else if (me.atEdge) end = { why: "edge" };
  else if (rs.decideAt != null && world.t - rs.decideAt > TIME_CAP) end = { why: "time" };

  let next = { ...rs, me, world, ev: state, events: [...rs.events, ...events], made, crossedAt, launch, end };
  /* The openings are kept from the freeze until the car is released. */
  if (next.phase === "waiting") next = trackOpenings(next);
  return next;
}

/* The stars the TIMING alone earns. */
export function timingStars(t) {
  if (!t) return 3;
  if (t.kind === "early") return EARLY_STARS;
  return t.delay <= STARS_AT[0] + EPS ? 3 : t.delay <= STARS_AT[1] + EPS ? 2 : 1;
}

/* The verdict. Each id appears once, with a count. */
export function verdictOf(rs) {
  const { def } = rs;
  const faults = [], praise = [], notes = [];
  const bump = (list, e, words) => {
    const at = list.find((x) => x.id === e.id);
    if (at) { at.count++; return; }
    list.push({ id: e.id, count: 1, ...(e.severity != null && !e.praise ? { severity: e.severity } : {}), words });
  };
  for (const e of rs.events) {
    if (e.praise) { const w = praiseWords(e.id); if (w) bump(praise, e, w); }
    else if (e.noFault) bump(notes, e, faultWords(e.id));
    else bump(faults, { ...e, severity: e.severity ?? TRIGGERS[e.id]?.severity ?? 1 }, faultWords(e.id));
  }
  /* The other turn than the one asked. */
  if (rs.made != null && rs.made !== def.task) faults.push({ id: "wrongTurn", count: 1, severity: WRONG_TURN, words: faultWords("wrongTurn") });
  /* THE TIMING, once the player has let go. */
  const t = rs.timing ?? null;
  const delay = t?.kind === "inside" ? t.delay : null;
  const tStars = timingStars(t);
  if (delay != null && delay >= UNDUE - EPS) faults.push({ id: "undueDelay", count: 1, severity: UNDUE_SEVERITY, words: faultWords("undueDelay") });
  if (t?.kind === "early" && !faults.some((f) => f.id === "failedToYield")) notes.push({ id: "early", count: 1, words: faultWords("early") });
  if (t?.missedGap) notes.push({ id: "missedGap", count: 1, words: faultWords("missedGap") });
  const worst = faults.reduce((m, f) => Math.max(m, f.severity), 0);
  /* STARS, one table, all [invented] until Jay rules: the LOWER of the fault table and the timing's. */
  const through = rs.end?.why === "through";
  const byFaults = !through || worst >= 5 ? 0 : worst >= 3 ? 1 : worst >= 1 ? 2 : 3;
  const stars = Math.min(byFaults, tStars);
  if (through && tStars === 3 && t?.kind === "inside" && praiseWords("quick")) praise.push({ id: "quick", count: 1, words: praiseWords("quick") });
  return { stars, why: rs.end?.why ?? null, faults, praise, notes, made: rs.made, task: def.task, delay, timingStars: t ? tStars : null, openAtFreeze: !!rs.openings?.[0] && rs.openings[0].from === rs.decideAt };
}
