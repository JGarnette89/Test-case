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
import { step, DT, openTo } from "../sim/crossing.js";
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

/* The arguments `sceneFor` (apps/MapRoad.jsx) takes, positionally. */
export const sceneArgs = (def) => [def.seed, KMH, EVERY, true, def.cars, def.map(), def.start];

/* The same world `sceneFor` builds, through the one function it calls (sim/scene.js worldFor), with the trailing options it passes. */
export const roundWorld = (def) => worldFor(...sceneArgs(def), false, false, { checks: false, mergeTolerance: DEFAULT_MERGE_TOLERANCE, preroll: PREROLL });

export function startRound(def, { world, me }) {
  return { def, world, me, ev: newEventState(), events: [], t0: world.t, targetK: me.k, made: null, crossedAt: null, end: null, hornSeen: 0 };
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
  let { made, crossedAt } = rs;
  const path = pathOf(world, me), pPath = pathOf(prev.world, prev.me);
  const crossed = me.k === rs.targetK && (prev.me.k ?? 0) === (me.k ?? 0) && path && pPath && pPath.from === path.from && prev.me.s <= path.stopAt && me.s > path.stopAt;
  if (crossed && made == null) {
    made = path.intent; crossedAt = world.t;
    /* A SOUND DRIVER IN THE PLAYER'S PLACE, in the world BEFORE the move: was there an opening? On a red, ranRed already says it. */
    if (!events.some((e) => e.id === "ranRed") && !openTo({ ...prev.me, caution: 1 }, prev.world, 1)) {
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

  return { rs: { ...rs, me, world, ev: state, events: [...rs.events, ...events], made, crossedAt, end, hornSeen }, signal: me.signal };
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
