/* =====================================================================
   DRIVING A ROUND FOR CHECKS (verify-rounds, measure/round-seeds): build
   the decision point (round.js toDecision), then let a POLICY decide, tick
   by tick, whether to hold or to go -- through press, release and
   roundTick, the same calls the screen makes.

   A policy is `policy(rs) -> "hold" | "go"`, called on the frozen frame
   and then once per tick while waiting. THE POLICIES READ THE OPENINGS
   THEMSELVES, tick by tick, with crossing.js openTo: never the round's own
   record (rs.openings), which would compare the code with itself. An
   opening here is a stretch of ticks the way is open, at least
   REACTION_FLOOR long (its own statement of the rule; the one it checks).

   Policies carry state (the tracker), so make a fresh one per run.
   ===================================================================== */
import { toDecision, press, release, roundTick, verdictOf, TIME_CAP } from "../../src/game/round.js";
import { openTo, DT } from "../../src/sim/crossing.js";
import { REACTION_FLOOR } from "../../src/core/perception.js";

const EPS = 1e-6;

/* THE CHECK'S OWN READING OF THE ROAD: call `see(rs)` once per decision tick. `stretch` is the current open stretch { from } or null;
   `first` is the first stretch that has run REACTION_FLOOR (an opening); `history` holds every stretch, closed ones with `to`. */
export function tracker() {
  const T = { stretches: [], stretch: null, first: null, seen: 0, freezeOpen: null };
  T.see = (rs) => {
    const t = rs.world.t, open = openTo({ ...rs.me, caution: 1 }, rs.world, 1);
    if (T.freezeOpen == null) T.freezeOpen = open;
    if (open && !T.stretch) { T.stretch = { from: t, to: null }; T.stretches.push(T.stretch); }
    else if (!open && T.stretch) { T.stretch.to = t; T.stretch = null; }
    if (!T.first) T.first = T.stretches.find((s) => (s.to ?? t) - s.from >= REACTION_FLOOR - EPS) ?? null;
    T.seen++;
    return T;
  };
  return T;
}

/* THE POLICIES. Each returns { policy, T } so a check can read what the policy saw. */
/* oracle: hold until the first opening has run REACTION_FLOOR, then go. */
export function oracle() {
  const T = tracker();
  return { T, policy: (rs) => { T.see(rs); return T.first ? "go" : "hold"; } };
}
/* eager: go at once. */
export function eager() {
  const T = tracker();
  return { T, policy: (rs) => { T.see(rs); return "go"; } };
}
/* late(x): go at the first opening (one that has run REACTION_FLOOR) plus x seconds. `T.goneIn` records whether, at that moment, the
   stretch of the first opening was still open (the GO is inside it) -- a check skips and counts the runs where it was not. */
export function late(x) {
  const T = tracker();
  return { T, policy: (rs) => {
    T.see(rs);
    if (T.first && rs.world.t - T.first.from >= x - EPS) { T.goneIn = T.stretch === T.first; T.goAt = rs.world.t; return "go"; }
    return "hold";
  } };
}

/* Drive a round to its end. Returns { rs, verdict, ticks, T } or null when the seed has no decision point. */
export function driveDecision(type, seed, cars, make, { maxTicks = Math.round((TIME_CAP + 20) / DT), onTick = null } = {}) {
  let rs = toDecision(type, seed, cars);
  if (!rs) return null;
  const { policy, T } = make();
  const start = rs;
  let ticks = 0;
  while (!rs.end && ticks < maxTicks) {
    if (rs.phase !== "gone") {
      if (policy(rs) === "go") rs = release(rs);
      else if (rs.phase === "frozen") rs = press(rs);
    }
    const before = rs;
    rs = roundTick(rs);
    ticks++;
    if (onTick) onTick(before, rs);
  }
  return { rs, verdict: verdictOf(rs), ticks, T, start };
}

/* The task's turn, for a precondition: the routes out of the start leg of a fresh frozen round, as intents. */
export function routesOfTask(rs) {
  const k = rs.targetK, layout = rs.world.course.at[k].layout, from = layout.paths[rs.me.route].from;
  return layout.routesFrom(from).map((r) => layout.paths[r].intent);
}
