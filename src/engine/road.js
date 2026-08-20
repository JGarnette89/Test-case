/* =====================================================================
   ROAD SPEC
   A junction described, rather than assumed.

   Everything so far has hardcoded one shape: four legs, one lane each
   way, one control for the whole intersection. That assumption is spread
   across two lookup tables and it is what blocks T-junctions, multi-lane
   roads, and eventually a slip road.

   So a junction is now data. Which legs exist, how many lanes each
   carries, and what controls each one — because control is per leg and
   always was. A stop sign on the minor leg of a T is the ordinary case,
   and "all-way stop" is just four legs that happen to agree.

   The geometry below derives what STOPS and EXITS used to state. For the
   default spec it derives exactly the same numbers, which is what makes
   replacing them safe.
   ===================================================================== */

/* Which way each leg points, and which side of its centreline traffic
   coming IN sits on. Right-hand traffic: entering from the south you are
   on the east half of that road. */
const LEG = {
  S: { out: { x: 0, y: 1 }, off: { x: 1, y: 0 }, rot: -90, axis: "vert" },
  N: { out: { x: 0, y: -1 }, off: { x: -1, y: 0 }, rot: 90, axis: "vert" },
  W: { out: { x: -1, y: 0 }, off: { x: 0, y: 1 }, rot: 0, axis: "horiz" },
  E: { out: { x: 1, y: 0 }, off: { x: 0, y: -1 }, rot: 180, axis: "horiz" },
};

export const SIDES = ["N", "S", "E", "W"];
export const INTENTS = ["straight", "right", "left"];
export const RIGHT_OF = { S: "E", N: "W", W: "S", E: "N" };
export const OPPOSITE = { S: "N", N: "S", E: "W", W: "E" };

/* Where an intent takes you. Right is the leg on your right; left is the
   one opposite that; straight is the leg opposite you. Derived so a
   three-legged junction cannot end up with an exit that is not there. */
export function exitSideFor(from, intent) {
  if (intent === "right") return RIGHT_OF[from];
  if (intent === "left") return OPPOSITE[RIGHT_OF[from]];
  return OPPOSITE[from];
}

export const DEFAULT_LEG = { lanes: 1, control: "stop" };

/* The four-way every existing scenario is built on. */
export function crossSpec(control = "stop", lanes = 1) {
  const legs = {};
  for (const s of SIDES) legs[s] = { lanes, control };
  return { legs };
}

/* A T. The stem is the minor leg and it is the one that stops; the
   through road runs uninterrupted, which is the ordinary configuration
   and not the only one the spec can express. */
export function teeSpec({ missing = "N", stem = "S", lanes = 1, stemControl = "stop", throughControl = "none" } = {}) {
  const legs = {};
  for (const s of SIDES) {
    if (s === missing) continue;
    legs[s] = { lanes, control: s === stem ? stemControl : throughControl };
  }
  return { legs, missing };
}

export const specOf = (scn) => scn?.road ?? crossSpec(scn?.control ?? "stop");

export const hasLeg = (spec, side) => Boolean(spec.legs[side]);
export const legOf = (spec, side) => spec.legs[side] ?? DEFAULT_LEG;
export const controlOf = (spec, side) => legOf(spec, side).control;

/* --- widths ----------------------------------------------------------
   A road's half-width is however many lanes it carries each way. The
   junction box is bounded by the two roads that cross in it, so a leg
   running north-south stops just outside the width of the east-west road
   — not its own. Getting that backwards is invisible at one lane each
   way, because both are the same number.                                */
export function roadHalf(spec, axis, LANE) {
  const sides = axis === "vert" ? ["N", "S"] : ["E", "W"];
  const lanes = sides.filter((s) => hasLeg(spec, s)).map((s) => legOf(spec, s).lanes);
  return (lanes.length ? Math.max(...lanes) : 1) * LANE;
}

/* How far out along a leg its stop line sits: clear of the road it
   crosses, plus the setback. */
export function stopReach(spec, side, LANE, setback) {
  const crossing = LEG[side].axis === "vert" ? "horiz" : "vert";
  return roadHalf(spec, crossing, LANE) + setback;
}

/* Lane centre offset from the road's centreline. Lane 0 is the one
   nearest the middle, which is the lane a left turn comes from. */
export const laneOffset = (index, LANE) => (index + 0.5) * LANE;

/* Where a vehicle rests on `side`, in the given inbound lane. */
export function stopPoint(spec, side, LANE, setback, lane = 0, CX = 360, CY = 360) {
  const leg = LEG[side];
  const reach = stopReach(spec, side, LANE, setback);
  const off = laneOffset(lane, LANE);
  return {
    x: CX + leg.out.x * reach + leg.off.x * off,
    y: CY + leg.out.y * reach + leg.off.y * off,
    rot: leg.rot,
  };
}

/* Where a vehicle leaving by `side` goes: the outbound lane of that leg,
   run off the board. Outbound is the mirror of inbound — the other half
   of the same road. */
export function exitPoint(side, LANE, lane = 0, CX = 360, CY = 360, beyond = 80, W = 720, H = 720) {
  const leg = LEG[side];
  const off = laneOffset(lane, LANE);
  const far = leg.out.x !== 0 ? (leg.out.x > 0 ? W + beyond : -beyond) : (leg.out.y > 0 ? H + beyond : -beyond);
  return leg.out.x !== 0
    ? { x: far, y: CY - leg.off.y * off }
    : { x: CX - leg.off.x * off, y: far };
}

export { LEG };

/* =====================================================================
   Validity
   A three-legged junction has intents that lead nowhere: from the stem of
   a T, "straight" exits the leg that is missing. Nothing in the geometry
   stops that — a car would simply drive off into a road that is not
   there, and it would look almost right.

   So a spec can be asked what is legal from a given approach, and a
   scenario can be checked against it before anyone tries to drive it.
   ===================================================================== */
export function validIntents(spec, from) {
  if (!hasLeg(spec, from)) return [];
  return INTENTS.filter((i) => hasLeg(spec, exitSideFor(from, i)));
}

/* Returns a list of problems, empty when the scenario is sound. Reported
   rather than thrown: a bad scenario should be findable in a harness, not
   a crash halfway through a drive. */
export function validateRoad(spec, participants) {
  const problems = [];
  for (const p of participants) {
    if (!p || p.kind === "ped") continue;
    if (!hasLeg(spec, p.from)) {
      problems.push(`${p.id ?? "?"} approaches from ${p.from}, which has no leg`);
      continue;
    }
    const ok = validIntents(spec, p.from);
    if (!ok.includes(p.intent)) {
      problems.push(
        `${p.id ?? "?"} goes ${p.intent} from ${p.from}, which exits ` +
        `${exitSideFor(p.from, p.intent)} — no such leg. Legal here: ${ok.join(", ") || "nothing"}`
      );
    }
  }
  return problems;
}
