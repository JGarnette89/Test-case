# DIALOGUE — A.U.T.O., Jay and the rivals (recorded 13 October 2026, CONTENT ONLY, delivery NOT BUILT)

The line set was **authored externally** (the maintainer, with another
model) and **revised once** against review notes. It is good enough to use.
It will be stored as DATA keyed by trigger and speaker, so the game reads
it directly (`src/content/dialogue.json`). Nothing here builds the
delivery system beyond what is recorded below.

**NO SOURCE FILE IS COMING (the maintainer, 14 October).** This record
-- written from the maintainer's description of the external set -- IS the
source. When the content is built, it is written here, against this record
and the decisions below, and stored as data then. The lines themselves are therefore written when delivery is built,
to the spec below: five or six A.U.T.O. lines, four or five from Jay and
one or two from the relevant rivals per trigger; every line under 90
characters; metric; A.U.T.O. correct on the stop rule (a full stop, no
time stated), Brenda's "three seconds" her own characterisation.

Characters: [CHARACTERS.md](CHARACTERS.md) (Victor and Brenda Braga, Mason
"Swerve" Lin, "Grizzly" Hannah Miller, Jay "The Clockmaker", A.U.T.O.).
Setting: [STORY.md](STORY.md). The order it is built in:
[PLAN.md](PLAN.md).

## The content

Twenty triggers (the list has twenty-two names; the file decides), each
with five or six A.U.T.O. lines, four or five from Jay, and one or two
from the relevant rivals. Every line under 90 characters; all units
metric; A.U.T.O. factually correct on the stop rule, with Brenda keeping
her excessive three seconds as characterisation.

| trigger | detectable today? |
|---|---|
| rolling a stop sign | yes -- the stop verdict (`drive.js`), the rolling rule |
| stopping short of the line | yes -- `lastStop.verdict === "short"` |
| dawdling when clear | yes -- `playerFreeSince` (the horn's own test) |
| failing to return to the curb lane | yes -- keep-right's `hogTime` (needs the player's copy) |
| running wide on a bend | yes -- lane-keeping off the line |
| braking harshly | yes -- `lastStop.verdict === "harsh"`, `HARSH_AT` |
| signalling late or not at all | yes -- signal against the turn (`aheadOf`) |
| cutting into a gap too tight | yes -- gap at the change against `wantedGap` |
| blocking an intersection | yes -- stopped in the box, `freeStop` |
| missing a turn | yes -- signal asked a turn the lane did not make |
| colliding | yes -- `playerContact` |
| catching a green wave | **NO -- an event that does not exist yet** |
| losing one by speeding | **NO -- same** |
| being let into a gap | yes -- courtesy offer to the player (`courtesy.js`) |
| letting someone in yourself | **NO -- the player offering is not detected** |
| being honked at | yes -- `honkTo === "player"` |
| merging onto the highway | yes -- ramp to loop leg, at speed |
| passing a truck | yes -- overtake of a `truck` row |
| stopping for a pedestrian | yes -- held by `ped` |
| a long clean run | **NO -- needs the streak counter** |
| a sustained streak | **NO -- same** |
| driving well under the limit | yes -- speed against `postedAt` |

## THE WORK REQUIRED TO USE IT

1. **A RATE LIMITER -- THE REAL DESIGN PROBLEM, built before any trigger
   is wired.** Twenty triggers firing freely makes A.U.T.O. a stream of
   notifications the player learns to ignore, and then the interventions
   that matter get ignored too. A BUDGET: at most one line per interval,
   prioritised by severity (a collision outranks a wide line), recent
   lines AND recent triggers suppressed so nothing repeats within a
   session. Wired to one trigger only after it exists, or the first test
   is unpleasant and the dialogue gets blamed.
2. **A STREAK COUNTER**: fault-free distance and duration, reset by any
   fault-trigger above -- for "a long clean run" and "a sustained streak".
3. **TWO EVENTS NOT YET DETECTED AS EVENTS:**
   - **catching or losing a green wave** -- the wave exists as a mechanic
     (`progression.js`) but not as a moment the game notices: green after
     green at the posted speed, or a red met for being over it;
   - **the PLAYER offering a courtesy gap** -- the courtesy work is AI
     drivers offering to the player, not the reverse: a traffic car
     signalling into the player's lane and the player dropping back.

Everything else is already detectable, which is the point of having
specified it against real triggers.

## Minor notes, recorded rather than fixed

- Several A.U.T.O. lines mention **sensor loops and pads** and a named
  **"intersection 4B"**. Neither exists as a named thing (the loops do, in
  `actuated.js`, unnamed); both are cheap flavour consistent with the
  setting. Intersection names would be map data if ever wanted.
- **Mason's collision line mentions losing position**, which only makes
  sense at night, in a race -- fine in context, and the delivery must
  know a line can be CONTEXT-DEPENDENT (day/night, racing or not).
