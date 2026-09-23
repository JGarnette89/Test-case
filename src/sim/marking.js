/* =====================================================================
   STAGE 3: DEFERRED MARKING, AND THE SECTION SHEET.

   `detect.js` comes across unchanged. It is pure, it takes faults in one
   shape and marks in another, and it grades the EXAMINER -- which of the
   things that actually happened did you catch, what did you invent, and
   how promptly. Nothing here re-implements any of that. This file's only
   job is to hand it what the simulation already knows, in the shape it
   already takes.

   WHAT COUNTS AS A FAULT HERE IS DELIBERATELY THE LIST OF THINGS THE SIM
   ALREADY DERIVES, AND NOTHING ELSE. Stage 4 is the fault model -- the
   controlled comparison, the five-axis attribution, visibility. This
   stage has three quantities that are already physical facts about a
   driver, each a threshold on a number the model holds for its own
   reasons:

     undueDelay    sat past the opening a competent driver would have
                   taken, by more than the maintainer's 4-5s (crossing.js)
     rollingStop   crossed a stop line without ever coming to rest, on a
                   leg that has a stop sign
     harshBraking  braked harder than twice the comfortable rate, which
                   is where the old engine says a stop stops being
                   controlled (HARSH_AT)
     wideLine      off their line by more than a driver could fail to
                   notice -- the old engine's own floor, POS_VISIBLE --
                   which only a bend can produce

   THE FOURTH IS THE STEERING AXIS, AND IT COULD NOT BE ON THE SHEET
   UNTIL THE ROAD BENT. On a straight the weave is bounded at half the
   room between a car and the next lane (0.45m, because the driver over
   there has the same claim on the other half), and POS_VISIBLE is 0.45m:
   the most a driver can stray is exactly the floor at which a fault
   becomes visible, so a ragged driver at 0.38m was below it, and lowering
   the floor to make a fault appear would have been authoring one. On a
   bend the same deficit also runs wide, into the other half of the room
   (crossing.js, `wideAt`), and the two together clear the floor. The
   threshold is imported, not restated: the number the old engine derived
   a fault against is the number this reads. DECISIONS.md 5.15.14, 5.15.18.

   VISIBILITY IS NOT MODELLED AT THIS STAGE, so every fault counts as
   shown for its whole duration. `detect.js` takes `shownFor` for exactly
   this and the default is "shown throughout". Said here so nobody reads
   the sheet's recall as gated when it is not.

   Pure. No React, no DOM, no colour.
   ===================================================================== */
import { sectionSheet } from "../engine/detect.js";
import { POS_VISIBLE } from "../engine/faults.js";
import { HARSH_AT, PX_PER_M } from "./traffic.js";
import { AT_REST, AT_LINE, waitAt, pathOf, layoutOf, strayOf, wideAt } from "./crossing.js";

/* The old engine's visibility floor is in pixels; the sim is in metres. */
const OFF_LINE = POS_VISIBLE / PX_PER_M;

/* How many intersections make a section. CLAUDE.md derives 2.7-3.6 from
   what a player can hold in free recall; three is the whole number
   inside it. */
export const SECTION = 3;

/* =====================================================================
   NOTICING

   Run once per tick after `step`, like `keepDriving`. It watches each
   candidate and keeps three things on the world: the faults they have
   committed (as intervals, some still open), the moment they were handed
   to each intersection, and the small state it needs to tell a rolling
   stop from a real one. Everything it writes is a fact about what
   happened; nothing it writes changes what happens next.
   ===================================================================== */
export function noticing(world) {
  if (!world.watching?.length) return world;
  /* Faults are REPLACED, never mutated: the previous world still holds
     the old objects and a tick must not reach back into it. */
  let faults = world.faults ?? [];
  /* A fault closes now, or -- for one that is judged over a stretch of
     road rather than tick by tick -- at the last instant it was showing. */
  const close = (f) => { faults = faults.map((x) => (x === f ? { ...x, to: x.over ?? world.t } : x)); };
  /* THE DRIVE OUTLIVES THE DRIVER. A candidate who goes off the edge is
     replaced by a new one on the next trip, and the sheet for the drive
     that just ended still needs what they were told, when, and what the
     course wanted. So a record of each trip is kept on the world, from
     the moment it starts until it is graded. */
  const drives = { ...(world.drives ?? {}) };
  const seen = { ...(world.seen ?? {}) };
  const handoffs = { ...(world.handoffs ?? {}) };
  let changed = false;

  for (const w of world.watching) {
    const a = world.actors.find((x) => x.candidate === w.id);
    const me = seen[w.id] ?? { trip: -1, leg: -1, rested: false, lined: null };
    const next = { ...me };

    /* Gone off the edge, or between trips: close anything still open,
       and note that the drive has ended so the last section can be
       graded even though it did not fill. A drive that ends early is
       usually the examiner's doing -- silence meant straight on, and
       straight on left the world -- which is exactly the sheet to see. */
    if (!a) {
      for (const f of faults) if (f.who === w.id && f.to == null) { close(f); changed = true; }
      const key = `${w.id}/${me.trip}`;
      if (drives[key] && drives[key].ended == null) { drives[key] = { ...drives[key], ended: world.t }; changed = true; }
      continue;
    }
    const key = `${w.id}/${a.trip}`;
    const rec = drives[key];
    if (!rec || rec.plan !== a.plan || rec.toldAt !== a.toldAt || rec.leg !== (a.leg ?? 0)) {
      drives[key] = { wanted: a.wanted ?? [], plan: a.plan ?? [], toldAt: a.toldAt ?? {}, leg: a.leg ?? 0, ended: null };
      changed = true;
    }

    /* A NEW LEG. Remember when they were handed to it -- that is what an
       instruction's deadline is measured against -- and reset what has
       to be re-learned per approach. */
    if (a.trip !== me.trip || (a.leg ?? 0) !== me.leg) {
      /* A NEW TRIP ENDS THE OLD ONE, and this is the only place that can
         say so: `keepDriving` puts the next candidate on the road in the
         same tick the last one left, so there is never a tick with nobody
         to watch. The previous drive is closed here, not on absence. */
      if (a.trip !== me.trip && me.trip >= 0) {
        const old = `${w.id}/${me.trip}`;
        if (drives[old] && drives[old].ended == null) drives[old] = { ...drives[old], ended: world.t };
      }
      handoffs[key] = { ...(handoffs[key] ?? {}), [a.leg ?? 0]: world.t };
      next.trip = a.trip; next.leg = a.leg ?? 0; next.rested = false; next.lined = null;
      changed = true;
    }
    const at = { who: w.id, intersection: a.leg ?? 0, trip: a.trip };
    const path = pathOf(world, a);
    const stops = layoutOf(world, a).place.control[path.from] === "stop";

    /* --- undue delay: open while it is happening, closed when they go --- */
    const open = (trait) => faults.find((f) => f.who === w.id && f.trait === trait && f.to == null);
    const delaying = a.delayed && a.stoppedAt != null && !a.going;
    if (delaying && !open("undueDelay")) {
      faults = [...faults, { ...at, trait: "undueDelay", from: world.t, to: null }];
      changed = true;
    } else if (!delaying && open("undueDelay")) {
      close(open("undueDelay")); changed = true;
    }

    /* --- a rolling stop: judged at the line, from what happened before it --- */
    if (stops) {
      const toLine = waitAt(path) - a.s;
      if (a.v < AT_REST) next.rested = true;
      if (next.lined == null && toLine < AT_LINE + 6) next.lined = world.t;   // entering the line region
      if (a.s >= path.stopAt && next.lined != null && next.lined !== "done") {
        if (!next.rested) {
          faults = [...faults, { ...at, trait: "rollingStop", from: next.lined, to: world.t }];
          changed = true;
        }
        next.lined = "done";
      }
    }

    /* --- harsh braking: harder than the rate a stop stops being controlled at --- */
    const harsh = (a.a ?? 0) < -HARSH_AT;
    if (harsh && !open("harshBraking")) {
      faults = [...faults, { ...at, trait: "harshBraking", from: world.t, to: null }];
      changed = true;
    } else if (!harsh && open("harshBraking")) {
      close(open("harshBraking")); changed = true;
    }

    /* --- the wide line: off the line by more than could be missed --- */
    /* ONE SHOWING PER BEND, the way the old engine derives one fault per
       trait per scenario: from the first instant the stray clears the
       floor to the last instant it does, however many times the weave
       dips it back under in between. A driver running wide through a
       bend is doing one thing, and an examiner who saw it saw one thing;
       twenty half-second flickers on the sheet would be the sinusoid
       showing rather than the fault. The bend is the unit because it is
       where the wide line exists at all (`wideAt`), and it ends before
       the seam, so a showing never straddles two intersections. */
    const wide = Math.abs(strayOf(world, a)) > OFF_LINE;
    const showing = open("wideLine");
    if (wide) {
      faults = showing
        ? faults.map((x) => (x === showing ? { ...x, over: world.t } : x))
        : [...faults, { ...at, trait: "wideLine", from: world.t, to: null, over: world.t }];
      changed = true;
    } else if (showing && !(wideAt(world, a) > 0)) {
      close(showing); changed = true;
    }

    if (next.trip !== me.trip || next.leg !== me.leg || next.rested !== me.rested || next.lined !== me.lined) {
      seen[w.id] = next; changed = true;
    }
  }
  return changed ? { ...world, faults, seen, handoffs, drives } : world;
}

/* A MARK. The examiner saying "that" -- when, at which intersection, and
   optionally what. Whether a mark carries a category is the maintainer's
   open question and `detect.js` scores both; nothing here decides it. */
export function mark(world, id, what = null) {
  const a = world.actors.find((x) => x.candidate === id);
  if (!a) return world;
  const m = { at: world.t, intersection: a.leg ?? 0, trip: a.trip, who: id };
  if (what) m.what = what;
  return { ...world, marks: [...(world.marks ?? []), m] };
}

/* =====================================================================
   THE SHEET

   One section of one candidate's drive, graded. Two things graded
   against two different people, exactly as `sectionSheet` keeps them:
   the faults are the candidate's and the examiner is graded on catching
   them; the directions are the examiner's own.

   THE WANTED ROUTE IS THE SET COURSE, and the given one is what was
   actually said. An instruction's window opens when the intersection it
   names is the next one -- the moment they were handed to the one before
   it -- and closes at the handoff to it, which is the tick the plan is
   read. Both edges are recorded times, not numbers anybody picked.
   ===================================================================== */
export function sheetFor(world, id, { from = 1, upTo = from + SECTION, trip: which = null } = {}) {
  const w = world.watching?.find((x) => x.id === id);
  const a = world.actors.find((x) => x.candidate === id);
  const trip = which ?? a?.trip ?? w?.trip ?? 0;
  const key = `${id}/${trip}`;
  const handed = world.handoffs?.[key] ?? {};
  /* From the drive record, so a trip that has ended grades exactly as a
     live one does. */
  const rec = world.drives?.[key] ?? { wanted: a?.wanted ?? [], plan: a?.plan ?? [], toldAt: a?.toldAt ?? {} };
  const wanted = rec.wanted;
  const toldAt = rec.toldAt;
  const plan = rec.plan;

  const legs = [];
  const given = {};
  for (let L = from; L < upTo; L++) {
    if (handed[L] == null) break;                // not there yet: the section is not over
    const done = (world.faults ?? []).filter((f) =>
      f.who === id && f.trip === trip && f.intersection === L && f.to != null)
      .map((f) => ({ ...f, duration: f.to - f.from }));
    legs.push({
      faults: done,
      window: { opensAt: handed[L - 1] ?? 0, deadline: handed[L], intent: wanted[L] ?? "straight" },
      intent: wanted[L] ?? "straight",
    });
    if (plan[L] != null) given[L] = { at: toldAt[L] ?? handed[L], intent: plan[L] };
  }
  const marks = (world.marks ?? []).filter((m) => m.who === id && m.trip === trip
    && m.intersection >= from && m.intersection < from + legs.length);

  return legs.length ? { ...sectionSheet({ legs, marks, given, from }), trip } : null;
}

/* IS A SECTION COMPLETE, for one particular trip: have they been handed
   past its last leg, or has that drive ended with legs in it still
   ungraded? Asked about a SPECIFIC trip because a new candidate is on the
   road in the same tick the last one left, so "the candidate" is always
   there and never the one whose drive just ended. */
export function sectionDone(world, id, from = 1, trip) {
  if (trip == null) return null;
  const a = world.actors.find((x) => x.candidate === id);
  if (a && a.trip === trip) {
    return (a.leg ?? 0) >= from + SECTION ? { trip, ended: false } : null;
  }
  const rec = world.drives?.[`${id}/${trip}`];
  if (rec?.ended != null && rec.leg >= from) return { trip, ended: true };
  return null;
}
