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
import { step, DT, openTo, AT_REST, atNode, blockedBy, conflictOf, CAR } from "../sim/crossing.js";
import { stepDriver, withDriver, driverPose } from "../sim/drive.js";
import { afterContact } from "../sim/contact.js";
import { detect, newEventState, TRIGGERS } from "../sim/events.js";
import { DEFAULT_MERGE_TOLERANCE } from "../sim/lanechange.js";
import { lenOf, HARSH_AT } from "../sim/traffic.js";
import { REACTION_FLOOR } from "../core/perception.js";
import { autoInput } from "./autopilot.js";
import { TRAIL, TRAIL_MIN_M } from "./stage.js";
import { faultWords, praiseWords } from "./words.js";

/* What `sceneFor` is called with by its other callers (ExamRide: 50 and 2.0; MapRoad: 50 and 2.0). `kmh` only sizes
   the geometry of a map whose roads post their own speeds; `every` is the spawn spacing the screens pass. [instrument] */
export const KMH = 50;
export const EVERY = 2.0;

export const CLEAR_BY = 10;       // m past the far edge of the box, in the lane out, and the round is through [invented; slice 4: from 25, the tail after the box is shorter]
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
/* THE FORCED BRAKE (slice 5, section 4; Jay: "thread the needle if need be"). If an ENTITLED car brakes harder than the sim's own harsh
   threshold (HARSH_AT, traffic.js) at any tick between GO and the player clearing the box, the fault `forcedBrake` is added: "You made another
   driver brake hard." THIS IS A DELIBERATE DEPARTURE FROM THE OLD ENGINE'S STANDARD, where a fault was intrusion on entitled space whether or
   not anybody reacted (CLAUDE.md, "Encroachment is measured in seconds"). Here an early GO that nobody had to answer is threaded, and a GO
   that made somebody stand on the brakes is the fault: Jay's call for this game. Severity [invented]. */
export const FORCED_BRAKE = 3;
const EPS = 1e-6;                     // [instrument] float slack on sums of DT

/* The arguments `sceneFor` (apps/MapRoad.jsx) takes, positionally. */
export const sceneArgs = (def) => [def.seed, KMH, EVERY, true, def.cars, def.map(), def.start];

/* The same world `sceneFor` builds, through the one function it calls (sim/scene.js worldFor), with the trailing options it passes. */
export const roundWorld = (def) => worldFor(...sceneArgs(def), false, false, { checks: false, mergeTolerance: DEFAULT_MERGE_TOLERANCE, preroll: PREROLL });

/* THE PER-DECISION STATE, in ONE object (slice 4, section 1): the openings, when the car froze and when it went, the arrival's trail, the
   pull-away, the turn made, the crossing and the timing verdict. A later slice with several decision points keeps a list of these; `rs`
   carries the world, the car, the events and the end, which are the round's. */
export const newDecision = () => ({ decideAt: null, goAt: null, openings: [], timing: null, trail: null, launch: null, made: null, crossedAt: null });

export function startRound(def, { world, me }) {
  return { def, world, me, ev: newEventState(), events: [], t0: world.t, targetK: me.k, end: null, phase: "approach", decision: newDecision() };
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
  const open = wayOpen(rs), t = rs.world.t, { openings } = rs.decision, last = openings[openings.length - 1];
  const set = (o) => ({ ...rs, decision: { ...rs.decision, openings: o } });
  if (open && (!last || last.to != null)) return set([...openings, { from: t, to: null }]);
  if (!open && last && last.to == null) return set([...openings.slice(0, -1), { ...last, to: t }]);
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
  const rs = startRound(def, roundWorld(def));
  return toDecisionFrom(rs, rs.me.k);
}

/* EVERY DECISION POINT IS A CUT (slice 4, section 1): from ANY running round state, run on -- unseen, the autopilot -- to rest at the line
   of node `k`, record the arrival, freeze, and return the decision state; null when there is no decision there. The per-decision
   state is fresh (`newDecision`): the world, the car and the round's events carry on from `rs0`.
   NULL BEFORE RUNNING when the round has ended, or the car is already past that line (on a later node, or on this one beyond its stop
   line): there is no decision to come. toDecision is this from the round's start. */
export function toDecisionFrom(rs0, k) {
  if (rs0.end) return null;
  const at = rs0.world.course.at[k];
  if (!at) return null;
  if ((rs0.me.k ?? 0) > k) return null;
  if ((rs0.me.k ?? 0) === k) { const p = at.layout.paths[rs0.me.route]; if (p && rs0.me.s > p.stopAt) return null; }
  let rs = { ...rs0, targetK: k, phase: "approach", decision: newDecision(), events: [] };
  const t0 = rs.world.t;
  /* THE ARRIVAL, RECORDED (slice 3): the car as it stood on each of the last TRAIL seconds of ticks (the car objects themselves; their
     poses are worked out once, at the freeze). Nothing here is read by the sim. */
  const hist = [];
  while (rs.world.t - t0 <= APPROACH_CAP) {
    if (rs.end || rs.decision.crossedAt != null || rs.me.contacts > 0) return null;
    hist.push({ t: rs.world.t, me: rs.me });
    const path = pathOf(rs.world, rs.me);
    if (rs.me.v < AT_REST && rs.me.stoppedAt != null && Math.abs(path.stopAt - (rs.me.s + lenOf(rs.me) / 2)) <= AT_LINE && rs.me.k === rs.targetK && !carAhead(rs)) {
      /* decision.trail: the drawn pose and speed of the player on each tick of the last TRAIL s; the LAST ENTRY IS THE FROZEN POSE. Entries on
         another node or route than the freeze's (a car only just arrived on this approach) are left out. */
      const own = hist.filter((h) => h.me.k === rs.me.k && h.me.route === rs.me.route);
      /* THE SPEC'S 3.0 s IS NOT ENOUGH ROAD (review of slice 3): the sim's comfortable stop sheds speed over about 9 s, so the last 3 s
         cover 5.4-5.5 m [M, probe, 64 pooled seeds] and the screech would replay a crawl. The trail is the last TRAIL s OR the last
         TRAIL_MIN_M of road, whichever is LONGER. */
      let i = own.length - 1;
      const end = own[i];
      while (i > 0 && (end.t - own[i].t < TRAIL - 1e-6 || end.me.s - own[i].me.s < TRAIL_MIN_M)) i--;
      const trail = own.slice(i).map((h) => {
        const p = driverPose(h.me, rs.world.course);
        return { x: p.x, y: p.y, z: p.z ?? 0, heading: p.heading, v: h.me.v, s: h.me.s, t: h.t };
      });
      rs = { ...rs, events: [], phase: "frozen", t0: rs.world.t, decision: { ...rs.decision, decideAt: rs.world.t, trail } };
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
     or is the one open at the freeze (going at once is the right answer, and it has no history to measure).
     delay = now - THE FIRST OPENING's start (review, 25 November): the sim reads Jay's undue-delay band ("waiting 4-5 seconds
     beyond when the opening is there") as time since the opening APPEARED, not since the stretch the driver finally took
     (crossing.js, the comment above UNDUE_AT: on a busy road an opening is a rapid series of brief ones, and the unbroken
     reading never fires). The first opening is the first stretch that ran REACTION_FLOOR, or the one open at the freeze.
     missedGap: an EARLIER stretch of at least MISSED_GAP, let pass.
   - otherwise: before an opening (or into a shut road after one): kind "early". */
export function timingOf(openings, decideAt, now) {
  const cur = openings[openings.length - 1];
  const atFreeze = !!cur && cur.to == null && cur.from === decideAt;
  if (cur && cur.to == null && (atFreeze || now - cur.from >= REACTION_FLOOR - EPS)) {
    const earlier = openings.slice(0, -1);
    const first = openings.find((o) => o.from === decideAt || (o.to ?? now) - o.from >= REACTION_FLOOR - EPS) ?? cur;
    return { kind: "inside", delay: now - first.from, from: first.from, missedGap: earlier.some((o) => o.to - o.from >= MISSED_GAP - EPS), atFreeze };
  }
  return { kind: "early", delay: null, from: null, missedGap: false, atFreeze: false };
}

/* The player lets go: the decision. */
export function release(rs) {
  if (rs.phase !== "frozen" && rs.phase !== "waiting") return rs;
  const d = rs.decision;
  return { ...rs, phase: "gone", decision: { ...d, goAt: rs.world.t, timing: timingOf(d.openings, d.decideAt, rs.world.t) } };
}

/* THE ENTITLED CARS, by the round's own statement: another road user at the player's node whose path CONFLICTS with the player's route, that
   is not yet past that conflict (blockedBy's own test) and has not yet stopped at its line (`stoppedAt` null -- a car standing at its line
   brakes for nobody). Read on the world BEFORE a tick, with the speeds of the world after it: the deceleration is the change in speed from
   one tick to the next, in the round's own tick. Returns the ids braking harder than HARSH_AT. */
function forcedBrakers(prev, world, me) {
  const k = me.k ?? 0, L = world.course?.at[k]?.layout;
  if (!L) return [];
  const after = new Map(world.actors.map((a) => [a.id, a]));
  const out = [];
  for (const a of atNode(prev.world, prev.world.actors, k)) {
    if (a.id === me.id || a.shadow || a.player || a.route == null || (a.k ?? 0) !== k || a.stoppedAt != null) continue;
    const hit = conflictOf(L, me.route, a.route);
    if (!hit || a.s > hit.clearOf + CAR.length / 2 + (lenOf(a) - CAR.length)) continue;
    const b = after.get(a.id);
    if (b && (a.v - b.v) / DT > HARSH_AT) out.push(a.id);
  }
  return out;
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

  /* FORCED BRAKING: from GO until the player has cleared the box, once per car. */
  if (rs.phase === "gone" && rs.decision.goAt != null && me.k === rs.targetK) {
    const pp = pathOf(world, me);
    if (pp && me.s < pp.clearAt) {
      for (const id of forcedBrakers(prev, world, me)) {
        if (!rs.events.some((e) => e.id === "forcedBrake" && e.by === id)) events.push({ id: "forcedBrake", t: world.t, severity: FORCED_BRAKE, praise: false, by: id });
      }
    }
  }

  /* THE TURN MADE, and FAILED TO YIELD: on the tick the line is crossed at the round's own intersection (events.js's own test). */
  let { made, crossedAt, launch } = rs.decision;
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
  else if (rs.decision.decideAt != null && world.t - rs.decision.decideAt > TIME_CAP) end = { why: "time" };

  let next = { ...rs, me, world, ev: state, events: [...rs.events, ...events], decision: { ...rs.decision, made, crossedAt, launch }, end };
  /* The openings are kept from the freeze until the car is released. */
  if (next.phase === "waiting") next = trackOpenings(next);
  return next;
}

/* The stars the TIMING alone earns. */
export function timingStars(t) {
  if (!t) return 3;
  if (t.kind === "early") return 3;   // going early is not a timing fault; what it did to the traffic is the verdict's (forcedBrake, failedToYield, contact)
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
    /* Waiting is the TIMING verdict's (undueDelay, below): the sim's own dawdling detector would say it a second time. */
    if (e.id === "dawdling" && rs.decision.timing) continue;
    if (e.praise) { const w = praiseWords(e.id); if (w) bump(praise, e, w); }
    else if (e.noFault) bump(notes, e, faultWords(e.id));
    else bump(faults, { ...e, severity: e.severity ?? TRIGGERS[e.id]?.severity ?? 1 }, faultWords(e.id));
  }
  /* The other turn than the one asked. */
  const D = rs.decision;
  if (D.made != null && D.made !== def.task) faults.push({ id: "wrongTurn", count: 1, severity: WRONG_TURN, words: faultWords("wrongTurn") });
  /* THE TIMING, once the player has let go. */
  const t = D.timing ?? null;
  const delay = t?.kind === "inside" ? t.delay : null;
  const tStars = timingStars(t);
  if (delay != null && delay >= UNDUE - EPS) faults.push({ id: "undueDelay", count: 1, severity: UNDUE_SEVERITY, words: faultWords("undueDelay") });
  /* THREADED: went before the first opening and nobody had to answer it: no forced braking, no failure to yield, no contact. */
  if (t?.kind === "early" && rs.end?.why === "through" && !faults.some((f) => ["forcedBrake", "failedToYield", "collision", "struckPerson"].includes(f.id)) && praiseWords("threaded")) praise.push({ id: "threaded", count: 1, words: praiseWords("threaded") });
  if (t?.missedGap) notes.push({ id: "missedGap", count: 1, words: faultWords("missedGap") });
  const worst = faults.reduce((m, f) => Math.max(m, f.severity), 0);
  /* STARS, one table, all [invented] until Jay rules: the LOWER of the fault table and the timing's. */
  const through = rs.end?.why === "through";
  const byFaults = !through || worst >= 5 ? 0 : worst >= 3 ? 1 : worst >= 1 ? 2 : 3;
  const stars = Math.min(byFaults, tStars);
  if (through && tStars === 3 && t?.kind === "inside" && praiseWords("quick")) praise.push({ id: "quick", count: 1, words: praiseWords("quick") });
  return { stars, why: rs.end?.why ?? null, faults, praise, notes, made: D.made, task: def.task, delay, timingStars: t ? tStars : null, openAtFreeze: !!D.openings?.[0] && D.openings[0].from === D.decideAt };
}
