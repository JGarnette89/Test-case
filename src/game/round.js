/* =====================================================================
   A ROUND, PURE (WORK-game-slice1 section 2): building it, one tick, the
   end condition and the verdict. No React, no DOM, no .jsx import, so a
   check in Node builds the same world the screen does.

   WHAT HAPPENED IN A ROUND IS WHAT THE SIM'S TRAFFIC DID AND WHAT THE
   PLAYER'S DETECTORS (sim/events.js) NOTICED (GAME.md rule 1). The one
   detector added here, failedToYield, is the question the sim's own
   undue-delay clock asks (crossing.js openTo), asked once, on the tick the
   line is crossed.

   Every grade below -- the stars and the constants beside them -- is
   [invented] until Jay rules (GAME.md rule 2): the marking logic examiners
   use is not public and stays out.
   ===================================================================== */
import { worldFor, playerContact, PREROLL } from "../sim/scene.js";
import { step, DT, openTo, AT_REST, atNode, blockedBy } from "../sim/crossing.js";
import { stepDriver, withDriver, playerHonk } from "../sim/drive.js";
import { afterContact } from "../sim/contact.js";
import { detect, newEventState, TRIGGERS } from "../sim/events.js";
import { DEFAULT_MERGE_TOLERANCE } from "../sim/lanechange.js";
import { ASSIST } from "../sim/player.js";
import { faultWords, praiseWords } from "./words.js";

/* What `sceneFor` is called with by its other callers (ExamRide: 50 and 2.0; MapRoad: 50 and 2.0). `kmh` only sizes
   the geometry of a map whose roads post their own speeds; `every` is the spawn spacing the screens pass. [instrument] */
export const KMH = 50;
export const EVERY = 2.0;
/* The lane assist the screen uses: MapRoad's own default setting ("gentle", settings.js), so a round drives as #/map does. [instrument] */
export const PLAYER_ASSIST = ASSIST.gentle;

export const CLEAR_BY = 25;       // m past the far edge of the box, in the lane out, and the round is through [invented]
export const TIME_CAP = 60;       // s of a round before it is called out of time [invented]
export const FAILED_TO_YIELD = 5;  // severity of going when the way was not open [invented]
export const WRONG_TURN = 2;      // severity of making another turn than the one asked [invented] (TRIGGERS gives missedTurn 2)
/* m short of the stop line within which a pull-away from rest is THE pull-away from the line, the moment a stop-and-go driver
   commits (crossing.js blockedBy: "commitment begins at the launch rather than at the line"). [invented] */
export const LAUNCH_SPAN = 6;

/* The arguments `sceneFor` (apps/MapRoad.jsx) takes, positionally. */
export const sceneArgs = (def) => [def.seed, KMH, EVERY, true, def.cars, def.map(), def.start];

/* The same world `sceneFor` builds, through the one function it calls (sim/scene.js worldFor), with the trailing options it passes. */
export const roundWorld = (def) => worldFor(...sceneArgs(def), false, false, { checks: false, mergeTolerance: DEFAULT_MERGE_TOLERANCE, preroll: PREROLL });

export function startRound(def, { world, me }) {
  return { def, world, me, ev: newEventState(), events: [], t0: world.t, targetK: me.k, made: null, crossedAt: null, launch: null, end: null, hornSeen: 0 };
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

/* One tick. `input` is { steer, slider, signal, horn } (iso/controls.js state), `assist` optional (a check drives with goodInput's 0).
   Returns { rs, signal }: the round after the tick, and the signal the player is left with -- spent by the turn it caused, to be
   written back by the screen as MapRoad does. */
export function roundTick(rs, input) {
  const { def } = rs;
  const prev = { me: rs.me, world: rs.world };
  let me = rs.me, world = rs.world, hornSeen = rs.hornSeen;
  if (input.horn !== hornSeen) { hornSeen = input.horn; me = { ...me, ...playerHonk(me, world) }; }
  me = stepDriver({ ...me, signal: input.signal }, { steer: input.steer, slider: input.slider, assist: input.assist ?? 0 }, world, DT);
  let w = step(withDriver(world, me));
  const c = playerContact(w, me);
  world = c.world;
  /* After the end the world and the car go on moving, so the player sees what happened, but nothing more is noticed or judged. */
  if (rs.end) {
    me = afterContact(me, c, world).me;
    world = withDriver(world, me);
    return { rs: { ...rs, me, world, hornSeen }, signal: me.signal };
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
    /* FAILED TO YIELD (review, 24 November). Each moment is read in the world before the move, for a sound driver in the
       player's place (crossing.js openTo, the undue-delay clock's own question). Two kinds of right of way, judged two ways:
       - THE TURN AT A STOP: pulling away from the line while a driver at a stop sign who has the right of way is still
         waiting for it (they stopped first, or are on the right). A rule with no judgment in it, so the pull-away alone is it.
       - A GAP IN MOVING TRAFFIC: the sound driver's gap is conservative (one pull-away it refused had the car 87 m and 9.6 s
         off), so it counts only if the way was ALSO shut as the player entered -- by which time only a car already committed
         to the intersection shuts it. The proper measure is the time margin to the entitled car (post-encroachment time,
         the encroachment ruling): slice 2.
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

  /* THE END: the first of these. */
  let end = null;
  const p2 = pathOf(world, me);
  if (crossedAt != null && ((me.k === rs.targetK && p2 && me.s >= p2.clearAt + CLEAR_BY) || me.k !== rs.targetK)) end = { why: "through" };
  else if (c.fresh?.some((f) => f.kind === "person" || f.atFault)) end = { why: "contact" };
  else if (me.atEdge) end = { why: "edge" };
  else if (world.t - rs.t0 > TIME_CAP) end = { why: "time" };

  return { rs: { ...rs, me, world, ev: state, events: [...rs.events, ...events], made, crossedAt, launch, end, hornSeen }, signal: me.signal };
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
  const worst = faults.reduce((m, f) => Math.max(m, f.severity), 0);
  /* STARS, one table, all [invented] until Jay rules. */
  const through = rs.end?.why === "through";
  const stars = !through || worst >= 5 ? 0 : worst >= 3 ? 1 : worst >= 1 ? 2 : 3;
  return { stars, why: rs.end?.why ?? null, faults, praise, notes, made: rs.made, task: def.task };
}
