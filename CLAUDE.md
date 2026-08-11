# CLAUDE.md

Read this before making changes. It encodes decisions that took a long time to
get right, and several of them are non-obvious.

## What this repo is

**Right of Way** — a real-time judgment game. You are one car at an
intersection. Traffic arrives on a schedule. Press GO at the moment the road is
legally yours. Too early is a failure to yield; too late is undue delay, and it
is the more common fault.

React + SVG, no canvas, no game engine. Mobile-first.

**DriveDraw** — a diagramming tool for driving instructors — used to live here
too. It is no longer wired in. The source is still at `src/apps/DriveDraw.jsx`
and in git history, but nothing imports it and it is not in the bundle. Do not
resurrect it into this app without being asked.

The working name is Right of Way. **PRNDL** was considered and is on hold:
there is a live automotive app of that name shipping on both stores, and a US
trademark registration (class 037). Neither is necessarily a bar, but it is not
a decision to make casually a second time.

## Domain authority

**The maintainer is a driving examiner in Ontario, Canada. Their reading of the
rules wins over anything you infer.** If a change depends on a traffic-law
assumption, say so explicitly and ask rather than guessing. Getting a rule wrong
does not merely lose a user — it teaches someone something false.

Rules follow Ontario. Do not silently generalise to other jurisdictions.

### Rules already established — do not regress these

- **Right of way is about path conflict, not intersection occupancy.** You do
  NOT wait for another vehicle to completely exit the intersection. You wait
  until your path is clear of theirs. This was an early bug and it is a big deal.
- **Two vehicles going straight from opposite legs do not conflict.** They pass
  on their own sides. The window opens immediately.
- **A moving vehicle claims the road ahead of it**, proportional to speed. This
  is what makes turning across an oncoming stream a conflict even when the
  arithmetic says you would squeeze through. A stopped vehicle claims nothing.
- **A pedestrian on a crossing holds the entire crossing** until completely
  across. This is a legal rule, not a geometric one, and is encoded as an
  explicit override (`blockUntilClear`), not emergent from footprints.
- Simultaneous arrivals resolve by the right-hand rule, then left-turn-yields
  for head-to-head.
- **Proper signalling is 2–3 seconds before a change of direction or before
  stopping at the line.** A late signaller sits outside that window but must
  still be readable — `LATE_SIGNAL_LEAD` is 0.8s, not zero. The lesson is "do
  not commit on an absent indicator", never a gotcha. An indicator that appears
  after the wheels have turned punishes attentiveness instead of assumption.

## Architecture

**The engine is pure and the renderer is disposable.** `src/engine/` has no
React, no SVG, no DOM and no colours in it. A renderer needs exactly one call:
`simulate(scenario) -> { ego, actors, legalAt, priors }`. This is what makes a
3D view a second renderer rather than a rewrite — that is the agreed direction,
2D now, 3D later, so do not put anything visual into the engine.

```
src/engine/index.js      geometry, motion, traits, the conflict rules
src/engine/score.js      grading a press against a derived window
src/engine/route.js      several intersections in one drive, and continuity
src/engine/generate.js   seeded scenario generation
src/engine/scenarios.js  the ten set situations, as data
src/engine/routes.js     drives, as data
src/theme.js             palette and type — the engine must never import this
src/storage.js           adapter chain: artifact host, localStorage, memory
src/progress.js          what the player has cleared
```

**Never author the answer.** The safe window is computed by simulating
footprints through the intersection. Do not hardcode "window opens at 3.2s". If
a scenario needs a specific window, change the arrival times until the engine
produces it. The generator obeys the same rule: it declares arrivals and intents
and then asks the engine what they mean.

**Data over code.** Scenarios, routes and traits are plain declarations. Adding
a situation, a drive, or a trait must be a data entry, not a new component.

**Driver behaviour is composable traits.** `wander`, `creep`, `overshoot`,
`slowStart`, `wideTurn`, `lateSignal`. A trait bends how the car actually drives
and the conflict engine works out the consequences. Never script a trait to
punish the player directly. Traits divide into two kinds and only one is
expected to move a window:

- **PATH** traits bend where the car goes, so they must change the window.
- **INFO** traits change only what can be read in time. `lateSignal` is the
  whole category. A zero delta there is correct, not a dead trait.

**Scenario rotation.** A uniform quarter turn preserves both `RIGHT_OF` and
`OPPOSITE`, so a scenario written for a southern approach is reusable from all
four — verified to produce an identical window from every approach. This is how
routes keep continuity without four hand-written copies of each intersection.
`walker` is the exception: its pedestrian is pinned to the north crossing by
fixed coordinates, so it cannot be rotated and the planner refuses rather than
silently misplacing it.

**Scoring rewards reading, not luck.** Full marks anywhere inside 0.35s of the
window opening, because nobody reacts to a visual cue faster than that, decaying
to zero at 2.6s — exactly where undue delay begins, so there is no cliff at the
verdict boundary. A press more than 0.25s early is a failure to yield and scores
nothing on any curve.

**True-to-life scale.** The game is 20 px per metre. Lane 3.6 m, car 4.5 x 1.8 m,
truck 9 x 2.55 m, painted lines 0.15 m. Signs are the one deliberate
exaggeration, drawn as map symbols because a real 0.75 m sign face would be
unreadable.

## Verification requirement

**Any change to the conflict engine, trait system, scenario timings or the
generator must be re-verified numerically before it is considered done.**

```
node tools/verify-windows.mjs      every window; each trait removed on its own
node tools/verify-route.mjs        rotation, continuity, run mechanics
node tools/verify-generator.mjs    determinism, safety, spread, rejection rate
python tools/verify-scoring.py     re-derives the scoring curve independently
```

All four must exit 0. Two things they check are worth understanding:

- **A path trait that moves no window teaches nothing.** Compare a
  trait-carrying vehicle against a well-driven control. Known-inert traits are
  listed with reasons in `verify-windows.mjs` so a *new* dead trait still fails.
- **The generator audits the engine.** Every derived window is replayed to prove
  that departing on it does not collide. This is a harder test of the conflict
  rules than the fixed scenarios can give.

New engine logic gets an independent re-derivation, not a self-check — that is
why the scoring curve is reimplemented from prose in Python rather than ported
from the JavaScript.

**There is a resolution floor.** `earliestClear` steps in `STEP` = 0.05s, so any
effect smaller than that is invisible to the engine by construction. "The trait
moved the window by 0.00" can mean "does nothing" or "does something too small
to represent" — measure at finer resolution before concluding which.

This requirement has caught real bugs: an approximate box-overlap test that let
collisions through, a left turn that could legally cut in front of oncoming
traffic, two traits that had no effect at all, and 31 generated scenarios that
claimed to demand a wait while going immediately still scored full marks.

## Conventions

- Plain React with hooks. No Redux, no state library.
- Inline style objects and a small `<style>` block. No Tailwind, no CSS files.
- `lucide-react` for icons. Do not add UI or animation libraries without asking.
- Comments explain *why*, not *what*. Only where the reasoning is not obvious.
- Mobile-first: 44 px minimum touch targets, `100dvh`, safe-area insets,
  `touch-action: none` on the canvas, 16 px inputs so iOS does not zoom.

## Known work in progress

- **Leaderboard is unresolved.** It is the intended hook, and it is the one
  feature that cannot be built offline. The offline rule below has not been
  changed. Do not add a network call on the assumption it was.
- **User-created scenarios** are wanted. Scenarios are already plain data, so
  this is an editor plus import/export, and sharing by file or link needs no
  server.
- **Pedestrians belong in generation — agreed, blocked on geometry.** Generated
  scenarios are cars only, so the crossing rule above is taught by exactly one
  hand-written situation and never appears in the daily or endless modes. The
  blocker is that pedestrian position is pinned to the north crossing by fixed
  coordinates (`PED_Y`, `PED_X0`, `PED_X1`). Making it relative to the approach
  fixes generation and `walker`'s un-rotatability in one go. Do that first.
  Cyclists are not agreed — they would need a ruling on how a bicycle claims
  road compared with a car.
- **Roundabouts are the next layout — agreed.** Yield on entry to traffic
  already circulating. This is a genuinely different geometry and the largest
  engine change outstanding; it is not a variation on the 4-way. T-junctions,
  uncontrolled intersections and pedestrian crossovers are wanted eventually but
  are behind it.
- **The daily should escalate through the week — agreed.** Easier on Monday,
  hardest by the weekend, resetting weekly. Implement as a difficulty target per
  weekday that the generator draws against; the date already seeds it, so this
  must not depend on player history. Everyone getting the same intersection on
  the same day is the property a leaderboard would later need — do not trade it
  away for a personalised ramp.
- **`wideTurn` is inert in `lateflag`.** Not broken: it bends the path by 1.1 m,
  but the net effect on that window is 0.01s, under the resolution floor,
  because the wide line never reaches the lane the ego uses. It needs a geometry
  where it bites. Its tell still claims a consequence to the player.
- **`creep` is masked by `overshoot` in `creeper`.** Accepted — creepers are for
  confusing right of way in busier scenarios than that one.
- The timing renderer is the only one. 3D is the agreed direction, not started.

## Do not

- Do not add analytics, accounts, or network calls. These run offline in a car.
  This is the rule the leaderboard would have to break; it has not been broken.
- Do not use `localStorage` directly. Go through `src/storage.js`, which falls
  back cleanly when storage is refused — a private window will hand you a
  `localStorage` that throws on first write.
- Do not put colour, React, or anything visual into `src/engine/`.
- Do not "simplify" the scenario, route or trait systems back into hardcoded
  cases.
- Do not spoil the set situations in UI that lists them. Half of them turn on
  not knowing what is coming; locked ones are counted, never named.
