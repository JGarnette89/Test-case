/* =====================================================================
   COMPOSITION
   Ask for a situation, not for a level.

   Generation so far sampled arrivals on a fixed four-way and kept the
   draws that were playable. That gives variety but it cannot be aimed:
   there was no way to ask for "busy, and you cannot see much" and get one.

   So a brief describes conditions, and a composer builds a scene that
   MEASURABLY meets them. The measuring is the whole point. Dropping a van
   on a corner and calling the result low-visibility is authoring the
   answer, the same mistake as hardcoding a window. Instead the scene is
   built, the engine is asked what a driver can actually see and actually
   has to yield to, and the draw is discarded when the numbers disagree
   with the brief.

   Pure, and seeded: the same brief and seed give the same scene forever.
   ===================================================================== */
import {
  simulate, poseAt, conflicts, spanOf, eventsAreReadable, MIN_WARNING, EMERGENCY_LEAD,
  M, CX, CY, LANE, STEP,
} from "./index.js";
import { whatEgoSees, sightBlockersOf } from "./sight.js";
import { cameraFor } from "../frame.js";
import { GRACE } from "./score.js";
import { PULL_STEP } from "./sight.js";
import {
  crossSpec, teeSpec, validIntents, SIDES, OPPOSITE, RIGHT_OF, roadHalf, hasLeg,
} from "./road.js";

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (r, xs) => xs[Math.floor(r() * xs.length)];
const span = (r, lo, hi) => Math.round((lo + r() * (hi - lo)) * 10) / 10;
const within = (range, v) => v >= range[0] && v <= range[1];

/* --- the vocabulary --------------------------------------------------
   Small, and in a driver's words rather than a designer's. Every term has
   to be measurable or it does not belong here. */
export const TRAFFIC = {
  light: { actors: [1, 1], gap: [1.6, 3.0], priors: [0, 1] },
  busy: { actors: [2, 3], gap: [0.9, 1.8], priors: [1, 3] },
  heavy: { actors: [3, 4], gap: [0.6, 1.2], priors: [2, 4] },
};
export const VISIBILITY = {
  open: { blindness: [0, 0.05] },
  restricted: { blindness: [0.2, 1] },
};
export const JUNCTIONS = ["cross", "tee", "arterial"];

/* Where a standing obstruction can plausibly go: off the carriageway, on
   one of the four corners, near or a little further back. */
function blockerSpots(spec) {
  const vx = roadHalf(spec, "vert", LANE);
  const hy = roadHalf(spec, "horiz", LANE);
  const spots = [];
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (const near of [M(1.0), M(3.0)]) {
        spots.push({
          x: CX + sx * (vx + near + M(2.6)),
          y: CY + sy * (hy + near + M(1.2)),
          rot: 0, hl: M(2.8), hw: M(1.15),
        });
      }
    }
  }
  return spots;
}

/* --- measurement -----------------------------------------------------
   What the scene turned out to be, asked of the engine rather than
   assumed from what was placed. */
export function measure(scn) {
  const sim = simulate(scn);
  const statics = sightBlockersOf(scn);
  const think = Math.round((sim.legalAt - scn.ego.arriveAt) * 100) / 100;

  /* Blindness: across the wait, what share of the road users actually on
     the board cannot be seen clearly from the line? Sampled, because a
     blocker sitting where nothing passes restricts nothing. */
  let samples = 0, unseen = 0;
  const until = Math.max(sim.legalAt, scn.ego.arriveAt + 0.6);
  for (let t = scn.ego.arriveAt; t <= until; t += 0.2) {
    const sees = whatEgoSees(sim, t, 0, statics);
    for (const a of sim.actors) {
      const pose = poseAt(a, t);
      if (pose.gone || pose.hidden) continue;
      // Off the board is not hidden, it simply has not arrived yet.
      if (pose.x < -40 || pose.x > 760 || pose.y < -40 || pose.y > 760) continue;
      samples++;
      if (sees[a.id] !== "clear") unseen++;
    }
  }

  return {
    legalAt: sim.legalAt,
    think,
    priors: sim.priors.length,
    blindness: samples ? Math.round((unseen / samples) * 100) / 100 : 0,
    samples,
  };
}

/* Would taking the derived window actually hit somebody?

   The window is derived against the road users who OUTRANK the ego —
   that is what "legally yours" means. But a car that does not outrank you
   is still a physical object, and a generated scene where the player does
   everything correctly and is hit anyway is not a fair question, whoever
   would be at fault in real life. Those draws are thrown away.

   This was invisible while the composer handed priority to every car,
   because then every car was checked. Fixing the priority exposed it.

   Checked across the whole GRACE stretch the scorer still calls "good",
   not only the instant the window opens: a road user who does not
   outrank the ego can still be mid-arrival when the window opens, and
   get scheduled on the assumption the ego leaves promptly. A player who
   takes the full grace the scorer offers can walk straight into that —
   which was exactly the failure mode the paragraph above already
   named, just re-opened by anything later than the first instant. */
function collidesDepartingAt(sim, T, creepSteps = 0) {
  const ego = { ...sim.ego, departAt: T, stopBias: (sim.ego.stopBias || 0) + creepSteps * PULL_STEP };
  for (let t = T; t < T + spanOf(ego); t += STEP) {
    const mine = poseAt(ego, t);
    if (mine.gone) break;
    for (const a of sim.actors) {
      const theirs = poseAt(a, t);
      if (theirs.gone || theirs.hidden) continue;
      if (conflicts(ego, mine, a, theirs, 0, 0, 0, "crash")) return true;
    }
  }
  return false;
}

/* Matches generate.js's own bound: the encroachment fault only ever
   watches priors, so it cannot warn about creeping toward a road user
   who does not outrank the ego — this is the only check standing
   between that and a silent hit. */
const CREEP_STEPS_CHECKED = 8;

export function windowIsSafe(scn) {
  const sim = simulate(scn);
  for (let steps = 0; steps <= CREEP_STEPS_CHECKED; steps++) {
    // +1e-9 guards against float drift silently dropping the sample right
    // at the boundary — where a narrow unsafe sliver actually hid once.
    for (let d = sim.legalAt; d <= sim.legalAt + GRACE + 1e-9; d += STEP * 2) {
      if (collidesDepartingAt(sim, d, steps)) return false;
    }
  }
  return true;
}

/* Does what was built match what was asked for? Returns the reasons when
   it does not, because "rejected" on its own cannot be tuned. */
export function meetsBrief(brief, m) {
  const why = [];
  const traffic = TRAFFIC[brief.traffic];
  const vis = VISIBILITY[brief.visibility];
  if (traffic && !within(traffic.priors, m.priors)) {
    why.push(`${m.priors} with priority, wanted ${traffic.priors.join("-")}`);
  }
  if (vis && !within(vis.blindness, m.blindness)) {
    why.push(`blindness ${m.blindness}, wanted ${vis.blindness.join("-")}`);
  }
  return { ok: why.length === 0, why };
}

/* --- composing ------------------------------------------------------- */
function roadFor(brief, r) {
  const kind = brief.junction ?? pick(r, JUNCTIONS);
  if (kind === "tee") {
    const missing = pick(r, SIDES);
    const stem = pick(r, SIDES.filter((s) => s !== missing && s !== OPPOSITE[missing]));
    return { kind, spec: teeSpec({ missing, stem }) };
  }
  if (kind === "arterial") {
    const wideAxis = r() < 0.5 ? "horiz" : "vert";
    const legs = {};
    for (const s of SIDES) {
      const big = wideAxis === "vert" ? (s === "N" || s === "S") : (s === "E" || s === "W");
      legs[s] = { lanes: big ? (r() < 0.5 ? 2 : 3) : 1, control: big ? "none" : "stop" };
    }
    return { kind, spec: { legs } };
  }
  return { kind, spec: crossSpec(brief.control ?? (r() < 0.25 ? "signal" : "stop")) };
}

export function compose(brief, seed) {
  const r = rng(seed);
  const { kind, spec } = roadFor(brief, r);
  const traffic = TRAFFIC[brief.traffic ?? "busy"];

  /* The ego needs a leg that exists, an intent that leads somewhere, and
     a reason to be stopped at all. The player's whole job is to hold and
     then go, so putting them on an uncontrolled through road asks them to
     wait at a road with nothing telling them to — and the engine then
     derives a window for a car that was never going to stop, which is not
     a window anybody can take safely. */
  const legs = SIDES.filter((s) => hasLeg(spec, s));
  const controlled = legs.filter((x) => spec.legs[x].control !== "none");
  const from = pick(r, controlled.length ? controlled : legs);
  const legal = validIntents(spec, from);
  if (!legal.length) return null;

  const count = Math.round(span(r, traffic.actors[0], traffic.actors[1]));
  // The ego always holds; what varies is whether anyone else has to.
  const egoStops = true;
  /* Decided before the actors rather than after them, because whether a
     pedestrian can be given a push button depends on it: a press the
     driver is already past cannot be read, and building one only to throw
     the whole draw away costs a try for no reason. */
  const egoArrive = span(r, 1.0, 2.2);
  const egoIntent = pick(r, legal);
  /* Under signals only one pair of legs moves at a time. The ego is held,
     so its own axis is held with it and the crossing axis has the green.
     Letting every other leg roll was the same as giving all four a green
     at once, which is why traffic appeared from directions that should
     have been stopped alongside the player. */
  const sameAxis = (a, b) => a === b || OPPOSITE[a] === b;
  const actors = [];
  let when = span(r, 0.6, 1.6);
  for (let i = 0; i < count; i++) {
    /* Sometimes the other road user is on foot — ported from generate.js,
       which was the only place this ever turned up before now. A
       pedestrian holds the near half of the crossing until they are past
       its midpoint (see index.js, PED_HOLDS_UNTIL), the same legal rule
       generate.js's own comment describes, just narrower than it used to
       be. Their crossing has to be on a leg the ego actually meets, or it
       is scenery instead of a decision — and, unlike a plain four-way,
       has to be a leg this junction actually has. */
    if (r() < 0.22) {
      const pedLegs = [from, OPPOSITE[from], RIGHT_OF[from]].filter((s) => s && hasLeg(spec, s));
      if (pedLegs.length) {
        /* Some of them are waiting at a push button rather than already
           crossing, which is a different answer to the same picture: the
           signal has not changed, so they hold none of it and the road is
           still yours (see holdsCrossing in index.js). Generated rather
           than hand-authored only, because the whole skill is telling the
           two apart when you did not know which one you were getting.

           Not so often that a pedestrian stops meaning "wait" — the
           default reading has to stay the common one, or the lesson
           inverts into "pedestrians never matter". */
        // Only where the press would land early enough to be read.
        const atButton = r() < 0.6 && when <= egoArrive - MIN_WARNING;
        actors.push({
          id: `p${i}`,
          from: pick(r, pedLegs),
          intent: "straight",
          arriveAt: when,
          stops: false,
          kind: "ped",
          colorKey: "pale",
          name: "Pedestrian",
          // Pedestrians are not resolved by arrival order against vehicles.
          priority: -1,
          blockUntilClear: true,
          reverse: r() < 0.5,
          ...(atButton ? { button: true } : {}),
        });
        when = Math.round((when + span(r, traffic.gap[0], traffic.gap[1])) * 10) / 10;
        continue;
      }
    }

    const side = pick(r, legs);
    const opts = validIntents(spec, side);
    if (!opts.length) continue;
    const control = spec.legs[side].control;
    const stops = control === "signal" ? sameAxis(side, from) : control === "stop";

    /* Priority is granted by the ROAD, never by being generated. A car
       that does not stop while the ego does has it — that is a through
       road, or a green light. Where both stop, nobody is handed anything:
       arrival order and the right-hand rule decide, which is the whole
       point of a four-way.

       Stamping a priority on every car regardless made later arrivals
       outrank an ego that got to the line first, which is unreadable and
       unfair — the player yields to someone who should have waited. */
    const roadGivesWay = !stops && egoStops;

    actors.push({
      id: `a${i}`,
      from: side,
      intent: pick(r, opts),
      arriveAt: when,
      stops,
      lane: Math.floor(r() * spec.legs[side].lanes),
      kind: "car",
      colorKey: ["red", "green", "amber"][i % 3],
      name: `${["Red", "Green", "Amber"][i % 3]} car`,
      ...(roadGivesWay ? { priority: -(count - i) - 1 } : {}),
      signal: null,
    });
    when = Math.round((when + span(r, traffic.gap[0], traffic.gap[1])) * 10) / 10;
  }
  if (!actors.length) return null;

  /* Occasionally one of them is on a call. Rare on purpose — an emergency
     vehicle that turns up every third junction stops being the thing that
     rearranges the right of way and becomes just another car with lights.

     Added after the ordinary traffic rather than inside the loop, because
     its arrival is pinned relative to the ego's decision (see
     EMERGENCY_LEAD in index.js) instead of following the gap sequence:
     it has to land close enough behind the decision to be on screen when
     it is made, and far enough to be acted on. */
  let camera;
  /* Not in heavy traffic. An emergency vehicle pushes the window PAST
     itself, and in a busy scene that lands the window on whoever was
     arriving next — which windowIsSafe then rightly rejects, so a heavy
     brief mostly burns tries producing draws it will throw away. It also
     does not need the company: the ambulance IS the event, and a quieter
     junction is where "the road was yours and it still is not" reads
     most clearly. */
  if ((brief.traffic ?? "busy") !== "heavy" && r() < 0.2) {
    const side = pick(r, legs.filter((s) => s !== from));
    const opts = validIntents(spec, side);
    if (opts.length) {
      /* It REPLACES a car rather than joining them. An emergency vehicle
         pushes the ego's window past itself, and every extra road user
         still arriving after that is another chance for the window to
         land on somebody — which windowIsSafe then rejects. Swapping
         rather than adding keeps the junction about as busy as the brief
         asked for and makes the draw far likelier to survive. */
      if (actors.length > 1) actors.pop();
      const lead = span(r, EMERGENCY_LEAD[0] + 0.2, EMERGENCY_LEAD[1] - 0.4);
      actors.push({
        id: "amb",
        from: side,
        intent: "straight",
        arriveAt: Math.round((egoArrive + lead) * 10) / 10,
        stops: false,
        lane: 0,
        kind: "car",
        colorKey: "red",
        name: "Ambulance",
        emergency: true,
        signal: null,
      });
      /* Declared so the renderer widens to bring it into shot before the
         decision. Whether that actually worked is measured below rather
         than assumed — the frame depends on how wide this junction is. */
      camera = { track: [{ id: "amb", revealBy: lead + 2.2, rampFor: 2.5, pad: 30 }] };
    }
  }

  const scn = {
    id: `composed-${seed}`,
    generated: true,
    composed: true,
    seed,
    conditions: { ...brief, junction: kind },
    title: "Generated situation",
    brief: "",
    control: spec.legs[from].control === "signal" ? "signal" : "stop",
    road: spec,
    ...(camera ? { camera } : {}),
    duration: 18,
    ego: { from, intent: egoIntent, arriveAt: egoArrive, stops: true, colorKey: "blue" },
    actors,
  };

  /* Visibility is searched for, never asserted. Every plausible corner is
     tried and the one that actually blinds the approach most is kept — a
     van where nothing passes has restricted nothing. */
  if ((brief.visibility ?? "open") === "restricted") {
    let best = null;
    for (const spot of blockerSpots(spec)) {
      const trial = { ...scn, sightBlockers: [{ id: "van", ...spot }] };
      const m = measure(trial);
      if (!best || m.blindness > best.blindness) best = { trial, blindness: m.blindness };
    }
    return best && best.blindness > 0 ? best.trial : null;
  }
  return scn;
}

/* Did the camera this scene declared actually get its actor into shot
   before the decision? Measured, not assumed — how much road fits on
   screen depends on how wide the junction turned out to be, and a wide
   arterial frames very differently from a two-lane cross. A draw whose
   emergency vehicle is still off screen when the player has to commit
   would mark them for not seeing something invisible, so it is thrown
   away like any other draw that does not measure up.

   This is the one place composition looks at the 2D frame. It is a check
   on a declaration the scenario makes, not a rule the engine derives —
   `eventsAreReadable` above states the renderer-independent requirement,
   and another renderer would satisfy it its own way. */
function framedInTime(scn) {
  if (!scn.camera?.track?.length) return true;
  const sim = simulate(scn);
  const spec = scn.road ?? crossSpec();
  const decide = scn.ego.arriveAt;
  for (const track of scn.camera.track) {
    const p = sim.actors.find((a) => a.id === track.id);
    if (!p) continue;
    let seen = false;
    for (let t = 0; t <= decide - MIN_WARNING; t += 0.05) {
      const pose = poseAt(p, t);
      if (pose.gone) break;
      if (pose.hidden) continue;
      const [bx, by, bw, bh] = cameraFor(spec, sim, t, scn.camera).box.split(" ").map(Number);
      if (pose.x > bx + 20 && pose.x < bx + bw - 20 && pose.y > by + 20 && pose.y < by + bh - 20) {
        seen = true; break;
      }
    }
    if (!seen) return false;
  }
  return true;
}

/* An emergency vehicle that changes nothing is decoration, and worse than
   decoration: it teaches that they can be ignored. One crossing the far
   side of the junction on its own path genuinely costs a driver nothing —
   which is correct, and is exactly why the draw has to be checked rather
   than assumed. Controlled comparison, the same shape every other tell in
   this game is held to: the identical scene with the call switched off. */
const EMERGENCY_MUST_COST = 0.3;
function emergencyEarnsItsPlace(scn) {
  if (!scn.actors.some((a) => a.emergency)) return true;
  const withCall = simulate(scn).legalAt;
  const without = simulate({
    ...scn,
    actors: scn.actors.map((a) => (a.emergency ? { ...a, emergency: false } : a)),
  }).legalAt;
  return withCall - without >= EMERGENCY_MUST_COST;
}

/* Draw until the measurements agree with the brief. Bounded, and it
   returns nothing rather than something that does not match. */
export function composeScenario(brief, seed, tries = 90) {
  for (let i = 0; i < tries; i++) {
    const scn = compose(brief, (seed * 2654435761 + i * 40503) >>> 0);
    if (!scn) continue;
    const m = measure(scn);
    // Unplayable draws go before the brief is even considered.
    if (m.think < 0 || m.think > 7 || m.legalAt > 11) continue;
    if (!eventsAreReadable(scn)) continue;
    if (!framedInTime(scn)) continue;
    if (!emergencyEarnsItsPlace(scn)) continue;
    if (!windowIsSafe(scn)) continue;
    if (!meetsBrief(brief, m).ok) continue;

    scn.title = titleFor(brief);
    scn.brief = describe(brief, m);
    scn.measured = { think: m.think, priors: m.priors, blindness: m.blindness };
    scn.lesson = lessonFor(brief, m);
    return scn;
  }
  return null;
}

/* A signature of the SHAPE of a situation, so a run can avoid handing out
   the same thing twice. Two scenes with the same road, the same approach
   and the same set of conflicting movements play the same however much
   the arrival times differ. */
export function signatureOf(scn) {
  const legs = SIDES.filter((s) => hasLeg(scn.road ?? crossSpec(), s)).join("");
  const movements = scn.actors
    .map((a) => `${a.from}${a.intent[0]}${a.lane ?? 0}`)
    .sort()
    .join(",");
  return `${legs}|${scn.ego.from}${scn.ego.intent[0]}|${movements}|${scn.sightBlockers ? "b" : ""}`;
}

const TITLE = { light: "Quiet crossing", busy: "Busy crossing", heavy: "Heavy traffic" };
const titleFor = (brief) =>
  (brief.visibility ?? "open") === "restricted" ? "You cannot see it all"
    : TITLE[brief.traffic ?? "busy"];

function describe(brief, m) {
  const who = m.priors === 0 ? "Nothing here has priority over you."
    : m.priors === 1 ? "One road user has priority."
    : `${m.priors} road users have priority.`;
  const seen = (brief.visibility ?? "open") === "restricted"
    ? " Something is blocking your view." : "";
  return who + seen;
}

function lessonFor(brief, m) {
  if ((brief.visibility ?? "open") === "restricted") {
    return "You could not see all of it from the line, and not being able to see is not the same as nothing coming. " +
      "Where the view is short the answer is more information, not a guess — edge forward until you can read it, " +
      "and accept that doing so spends some of your margin.";
  }
  if (m.priors >= 2) {
    return "More than one road user had priority here, and they do not clear in the order they arrived — " +
      "they clear in the order their paths stop crossing yours. Watch the one whose path you actually need, " +
      "not the one who has been waiting longest.";
  }
  return "Only what crosses your path can hold you up. Everything else is scenery, however close it looks.";
}

/* =====================================================================
   Endless
   A run should move through different KINDS of situation, not just
   different arrangements of one. So the brief cycles, and a run keeps the
   shapes it has already handed out so it does not hand them out again.

   Repeats are avoided rather than forbidden: if a brief cannot produce
   anything new in a reasonable number of tries, a repeat beats a blank
   screen. That trade is deliberate.
   ===================================================================== */
const ENDLESS_BRIEFS = [
  { traffic: "light", visibility: "open" },
  { traffic: "busy", visibility: "open" },
  { traffic: "busy", visibility: "restricted" },
  { traffic: "heavy", visibility: "open" },
  { traffic: "light", visibility: "restricted" },
  { traffic: "heavy", visibility: "restricted" },
];

export function endlessScenario(seed, recent = []) {
  const brief = ENDLESS_BRIEFS[Math.abs(seed) % ENDLESS_BRIEFS.length];
  const seen = new Set(recent);
  let fallback = null;
  for (let i = 0; i < 14; i++) {
    const scn = composeScenario(brief, (seed * 31 + i * 7919) >>> 0);
    if (!scn) continue;
    if (!fallback) fallback = scn;
    if (!seen.has(signatureOf(scn))) return scn;
  }
  return fallback;
}

export { ENDLESS_BRIEFS };
