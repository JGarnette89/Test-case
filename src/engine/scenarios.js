/* =====================================================================
   SCENARIOS
   Declarations, not answers. Each states who arrives, from where,
   intending what — the engine derives when the window opens.
   ===================================================================== */
import { C } from "../theme.js";
import { M } from "./index.js";
import { teeSpec, crossSpec } from "./road.js";
/* ---------------- scenarios ---------------- */
const S = (o) => ({ stops: true, kind: "car", ...o });

const SCENARIOS = [
  {
    id: "opposite",
    title: "Don't wait for an empty box",
    brief: "Four-way stop. Two cars got there before you.",
    control: "stop",
    duration: 12,
    ego: { from: "S", intent: "straight", arriveAt: 2.4, stops: true, color: C.blue },
    actors: [
      S({ id: "w", from: "W", intent: "straight", arriveAt: 0.9, color: C.red, name: "Red car" }),
      S({ id: "n", from: "N", intent: "straight", arriveAt: 1.7, color: C.green, name: "Green car", signal: null }),
    ],
    lesson: "The green car is still in the intersection when your turn comes — and it makes no difference. It is coming straight towards you on its own side, so your paths never touch. You only ever wait for the cars whose path crosses yours, which here was the red one.",
  },
  {
    id: "signalled",
    title: "Reading the turn signal",
    brief: "Four-way stop. The car opposite got there first.",
    control: "stop",
    duration: 12,
    ego: { from: "S", intent: "straight", arriveAt: 1.6, stops: true, color: C.blue },
    actors: [
      S({ id: "n", from: "N", intent: "right", arriveAt: 1.0, color: C.red, name: "Red car", signal: "right" }),
    ],
    lesson: "The red car is signaling right, and it turns right — away from your path entirely. Nothing crosses you, so you go almost as soon as you have stopped. Reading the turn signal is what buys you those seconds.",
  },
  {
    id: "liar",
    title: "The turn signal that lied",
    brief: "Four-way stop. The car on your right is signaling right.",
    control: "stop",
    duration: 13,
    ego: { from: "S", intent: "straight", arriveAt: 1.5, stops: true, color: C.blue },
    actors: [
      S({ id: "e", from: "E", intent: "left", arriveAt: 0.9, color: C.red, name: "Red car", signal: "right" }),
    ],
    lesson: "It signaled right, which would have tucked it away down the side road in under a second. It swung left across the whole intersection instead — the longest path there is, straight through where you were going. An turn signal is a statement of intent, not a commitment: confirm it against the wheels before you move.",
  },
  {
    id: "silent",
    title: "The long way round",
    brief: "Four-way stop. The car on your right arrived first and is signaling left.",
    control: "stop",
    duration: 13,
    ego: { from: "S", intent: "straight", arriveAt: 1.7, stops: true, color: C.blue },
    actors: [
      S({ id: "e", from: "E", intent: "left", arriveAt: 1.1, color: C.red, name: "Red car", signal: "left" }),
    ],
    lesson: "A left turn is the longest path through an intersection and the one that keeps your lane blocked longest. Reading that turn signal tells you this is a wait, not a glance — and roughly how long a wait it is going to be.",
  },
  {
    id: "gap",
    title: "Finding the gap",
    brief: "Green light. Oncoming traffic is not stopping.",
    control: "signal",
    duration: 15,
    ego: { from: "S", intent: "left", arriveAt: 1.0, stops: true, color: C.blue },
    actors: [
      S({ id: "o1", from: "N", intent: "straight", arriveAt: 1.6, stops: false, color: C.red, name: "First car", priority: -3 }),
      S({ id: "o2", from: "N", intent: "straight", arriveAt: 3.2, stops: false, color: C.green, name: "Second car", priority: -2 }),
      S({ id: "o3", from: "N", intent: "right", arriveAt: 5.0, stops: false, color: C.amber, name: "Third car", signal: "right", priority: -1 }),
    ],
    lesson: "The third car is signaling right, which takes it off into the side road before it ever reaches you. Once you have read that, the gap you need arrives sooner than it looks — you are only waiting for the two that are actually coming through.",
  },
  {
    id: "walker",
    title: "The empty intersection",
    brief: "Four-way stop. No other traffic at all.",
    control: "stop",
    duration: 13,
    ego: { from: "S", intent: "straight", arriveAt: 1.0, stops: true, color: C.blue },
    actors: [
      S({ id: "p", from: "N", intent: "straight", arriveAt: 0.8, stops: false, kind: "ped", color: "#F2E8D5", name: "Pedestrian", priority: -1, blockUntilClear: true }),
    ],
    lesson: "No cars is not the same as clear. Someone walked into the crosswalk on the far side, and you are driving straight through it. You wait until they are past its midpoint — the near half held you up, the far half is theirs to finish crossing.",
  },
  {
    id: "wanderer",
    title: "The one that shouldn't matter",
    brief: "Four-way stop. The car opposite is coming straight through.",
    control: "stop",
    duration: 14,
    ego: { from: "S", intent: "straight", arriveAt: 1.3, stops: true, color: C.blue },
    actors: [
      S({ id: "n", from: "N", intent: "straight", arriveAt: 1.1, color: C.red, name: "Red car", traits: ["wander"], phase: 0.6 }),
    ],
    lesson: "A car coming straight at you on its own side cannot touch you — that was the first thing you learned here, and it holds right up until the driver stops holding their lane. This one is drifting the better part of a meter either side of center. Watch how a car is being driven, not just where it is going.",
  },
  {
    id: "sleeper",
    title: "Asleep at the line",
    brief: "Four-way stop. The car on your right got there well before you.",
    control: "stop",
    duration: 15,
    ego: { from: "S", intent: "straight", arriveAt: 1.8, stops: true, color: C.blue },
    actors: [
      S({ id: "e", from: "E", intent: "straight", arriveAt: 0.7, color: C.red, name: "Red car", traits: ["slowStart"] }),
    ],
    lesson: "They arrived first, stopped, and then did nothing — head down, most likely. It is still their turn, and the moment you decide they have waved you through is the moment they look up and go. Wait for them to actually take it.",
  },
  {
    id: "creeper",
    title: "Never quite stopped",
    brief: "Four-way stop. The car on your right is edging forward.",
    control: "stop",
    duration: 14,
    ego: { from: "S", intent: "straight", arriveAt: 1.5, stops: true, color: C.blue },
    actors: [
      S({ id: "e", from: "E", intent: "straight", arriveAt: 0.9, color: C.red, name: "Red car", traits: ["creep", "overshoot", "slowStart"] }),
    ],
    lesson: "Rolling stops and a nose already over the line tell you this driver is impatient and only half committed to stopping at all. They have the right of way, so the answer is simple — let them take it, and give them room while they do.",
  },
  {
    id: "lateflag",
    title: "Signalling on the way round",
    brief: "Four-way stop. The car on your right shows nothing at all.",
    control: "stop",
    duration: 14,
    ego: { from: "S", intent: "straight", arriveAt: 1.6, stops: true, color: C.blue },
    actors: [
      S({ id: "e", from: "E", intent: "left", arriveAt: 1.0, color: C.red, name: "Red car", signal: "left", traits: ["lateSignal"] }),
    ],
    lesson: "No turn signal until it was already turning. By the time that signal appeared it told you nothing you could still act on. Where there is no information to read, the answer is always to wait for the wheels.",
  },
  {
    id: "wontstop",
    title: "Right of way doesn't stop a car",
    brief: "Four-way stop. The oncoming car is not slowing for its sign.",
    control: "stop",
    duration: 16,
    ego: { from: "S", intent: "straight", arriveAt: 1.5, stops: true, color: C.blue },
    actors: [
      S({ id: "e", from: "N", intent: "left", arriveAt: 4.0, stops: false, color: C.red, name: "Red car", signal: "left" }),
    ],
    lesson: "It had no right of way — turning left across you, it was always yours to take first. It just never planned to stop for the sign at all: no braking, no hesitation, the same speed the whole way in. Right of way is a rule about who goes first when everyone actually stops. It is not a guarantee that everyone will.",
  },
  {
    id: "circle",
    title: "Already going round",
    brief: "Roundabout. A car is in the circle, coming from your left.",
    control: "yield",
    layout: "roundabout",
    duration: 16,
    ego: { from: "S", intent: "straight", arriveAt: 1.4, stops: true, color: C.blue },
    actors: [
      S({ id: "w", from: "W", intent: "left", arriveAt: 0.5, color: C.red, name: "Red car" }),
    ],
    lesson: "A roundabout has no right-hand rule and no queue. Whoever is already going round has it, and they reach you from the left — so that is the only direction that decides when you go. The red car entered before you and is taking the third exit, which keeps it in the circle right across your entry. Once it has passed you, the road is yours, and you do not wait for it to leave the roundabout entirely.",
  },
  {
    id: "circle-leaving",
    title: "It never signaled",
    brief: "Roundabout. A car is coming round from your left, showing nothing.",
    control: "yield",
    layout: "roundabout",
    duration: 18,
    /* Arrives at 4.2, not 3.2. The red car now accelerates away from its
       give-way line instead of appearing in the circle already at speed,
       so it reaches the drift — the tell this whole scenario is built on
       — about a second later than it used to. At 3.2 the ego was at the
       line and committing before the tell had happened, which makes it a
       post-mortem rather than something to read. Checked in
       verify-roundabout.mjs, which fails if the drift lands late. */
    ego: { from: "S", intent: "straight", arriveAt: 4.2, stops: true, color: C.blue },
    actors: [
      /* The exit before yours is the west leg. Taking it, this car is gone
         long before it reaches you; staying in, it comes all the way round
         and across your entry. It drifts out for that west exit while you
         are still approaching, so the tell lands before you have to decide
         — which is the only thing that makes it a tell rather than a
         post-mortem. */
      S({ id: "n", from: "N", intent: "right", arriveAt: 0.6, color: C.red, name: "Red car", signal: null }),
    ],
    lesson: "It never signaled, and most drivers never do. What it did was drift to the outside of the circulating lane on the approach to the west exit, and a car moving out is a car leaving. It was gone one exit before yours, so nothing ever crossed you and your window opened the moment you stopped. Had it held the inner line it was coming all the way round to your leg and you would have sat there for seconds. Read the line, not the lamp: wheels commit, turn signals only promise.",
  },
  {
    id: "tee",
    title: "Out of the side road",
    brief: "T-intersection. You are on the stem, and the road you are joining does not stop.",
    control: "stop",
    /* The ordinary T: a stop on the minor leg only, and no north leg at
       all, so "straight" is not a thing you can do from here. */
    road: teeSpec({ missing: "N", stem: "S" }),
    duration: 15,
    ego: { from: "S", intent: "left", arriveAt: 1.3, stops: true, color: C.blue },
    actors: [
      S({ id: "e1", from: "E", intent: "straight", arriveAt: 2.2, stops: false,
        color: C.red, name: "Red car", priority: -3 }),
      S({ id: "w1", from: "W", intent: "straight", arriveAt: 3.9, stops: false,
        color: C.green, name: "Green car", priority: -2 }),
    ],
    lesson: "Turning left out of a side road means crossing one stream and joining another, and neither of them stops for you. The gap you need is not a gap in one direction — it is a gap in both at the same moment, which is why this is the turn people take too early. Nothing here has a stop sign except you.",
  },
  {
    id: "arterial",
    title: "Six lanes to cross",
    brief: "Stop sign, and the road you are crossing has three lanes each way.",
    control: "stop",
    /* The minor road is one lane; the arterial is three each way. The
       junction is wider, so the stop line sits further back and the view
       pulls out to fit — both derived, neither typed. */
    road: {
      legs: {
        N: { lanes: 1, control: "stop" }, S: { lanes: 1, control: "stop" },
        E: { lanes: 3, control: "none" }, W: { lanes: 3, control: "none" },
      },
    },
    duration: 18,
    ego: { from: "S", intent: "straight", arriveAt: 1.4, stops: true, color: C.blue },
    actors: [
      S({ id: "w1", from: "W", intent: "straight", arriveAt: 2.6, stops: false, lane: 0,
        color: C.red, name: "Near-lane car", priority: -3 }),
      S({ id: "w2", from: "W", intent: "straight", arriveAt: 3.4, stops: false, lane: 2,
        color: C.green, name: "Far-lane car", priority: -2 }),
      S({ id: "e1", from: "E", intent: "straight", arriveAt: 4.2, stops: false, lane: 1,
        color: C.amber, name: "Amber car", priority: -1 }),
    ],
    lesson: "Six lanes is six lanes of exposure, and you are committed from the moment you move. The gap has to be a gap in every lane you cross, not just the near one — the car in the far lane is the one people forget, because it is furthest away and looks slowest. Crossing takes longer here than it feels like it should.",
  },
  {
    id: "unprotected",
    title: "The one you cannot see",
    brief: "Stop sign on the side road. A van is parked right on the corner.",
    control: "stop",
    manoeuvre: "unprotectedLeft",
    duration: 18,
    ego: { from: "S", intent: "straight", arriveAt: 1.2, stops: true, color: C.blue },
    /* A standing obstruction on the corner, not a road user. This is what
       actually blinds a driver at a junction — a parked van, a hedge, a
       hoarding — rather than another car in the road. */
    sightBlockers: [
      { id: "van", x: 268, y: 452, rot: 0, hl: M(2.8), hw: M(1.15) },
    ],
    actors: [
      /* Through traffic on the main road. It does not stop, and from the
         line the van hides the approach it comes down. */
      S({ id: "thru", from: "W", intent: "straight", arriveAt: 2.3, stops: false,
        color: C.red, name: "Red car", priority: -2 }),
    ],
    lesson: "The van on the corner hid the road you had to read. From the line there was nothing to see, and nothing to see is not the same as nothing coming — so the question was never when to go, it was whether you had enough information to go at all. Edging forward buys that information and spends your margin doing it. Too far and you are in the path of the traffic you were trying to see.",
  },
  {
    id: "button",
    title: "Somebody pressed the button",
    brief: "Four-way stop. Someone is waiting at the crossing you are about to drive through.",
    control: "stop",
    duration: 20,
    /* This window CLOSES. Every other scenario in the game opens one and
       leaves it open — once your path is clear it stays clear, so a late
       press only ever costs marks. Here the walk phase arrives and takes
       the crossing back, which is the entire point of the button being
       worth reading. Declared rather than inferred so verify-playthrough
       can keep enforcing "an open window is always safe to take" for
       everything that has not said otherwise. The graded stretch
       [safeAt, safeAt+GRACE] is still guaranteed safe by safeAtFor — what
       is allowed here is a collision AFTER the scorer has already called
       it undue delay. */
    windowCloses: true,
    ego: { from: "S", intent: "straight", arriveAt: 1.4, stops: true, color: C.blue },
    actors: [
      S({ id: "e", from: "E", intent: "straight", arriveAt: 0.9, color: C.red, name: "Red car" }),
      /* At the button, not on the crossing. They hold none of it while the
         signal has not changed (see holdsCrossing in index.js), so the
         window opens as soon as the red car is clear — about four seconds
         earlier than if they had simply walked out. Reading which of those
         two is happening is the whole scenario. */
      S({
        id: "p", from: "N", intent: "straight", arriveAt: 1.0, stops: false, kind: "ped",
        color: "#F2E8D5", name: "Pedestrian", priority: -1,
        blockUntilClear: true, button: true,
      }),
    ],
    lesson: "They are standing at the button, not stepping off it. The signal has not changed, so the crossing is not theirs yet and the road ahead of you is still clear — you wait for the red car and then go. What the press buys you is a warning: a walk phase is coming, and every second you spend deciding is a second closer to sitting behind a full crossing. Read the difference between waiting to cross and crossing.",
  },
  {
    id: "ambulance",
    title: "Yours, but not yet",
    brief: "Four-way stop. Nothing else is waiting — but listen.",
    control: "stop",
    duration: 20,
    /* The view eases out so the approach is on screen before the ego is at
       the line. Without it an emergency vehicle doing 36 km/h shows up
       about three quarters of a second before it arrives, and marking a
       player early for something they could not see is the opposite of
       what this game is for. */
    camera: { track: [{ id: "amb", revealBy: 3.5, rampFor: 2.5, pad: 30 }] },
    ego: { from: "S", intent: "straight", arriveAt: 3.0, stops: true, color: C.blue },
    actors: [
      /* Arrives well after the ego and would ordinarily be the one waiting.
         `emergency` outranks everything (see outranks in index.js), which
         is a rule rather than anything the footprints could derive. */
      S({ id: "amb", from: "W", intent: "straight", arriveAt: 4.6, stops: false,
        color: C.red, name: "Ambulance", emergency: true }),
    ],
    lesson: "You stopped first, and there was nothing at any of the other three lines — by arrival order the intersection was yours to take. It is still not yours. An emergency vehicle on a call outranks everybody, whoever got there first and whichever side they are on, and the only thing being asked of you is to stay put and go once it has passed. Notice it does not need to be close to matter: the moment you can tell what it is, the right of way you thought you had is gone.",
  },
];
export { SCENARIOS, S };
