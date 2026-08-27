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

**The audience is North American, and the rules should read that way.** Where
Ontario practice and general North American practice differ in a small way, and
the general reading makes for better gameplay, take the general one. Nothing
here should be so provincial that a driver in Michigan finds it wrong.

That is a licence to generalise, not a licence to be vague. A rule that is
actually different somewhere — not merely worded differently — still has to be
picked deliberately, and said out loud when it is. Teaching something false is
still the worst outcome available.

Jurisdiction-specific rules are not lost, they are deferred: the plan is an
international mode later, flagged by country, where the differences become the
point rather than a trap. Anything genuinely local should be written so it can
move into that mode rather than being baked into the default.

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
- **Signal before any change of direction OR motion**, slowing included when
  the slowing leads into a turn. In `actions.js` the signal deadline therefore
  anchors to whichever act comes first — the slow, the moving-off, or the
  manoeuvre — never to the manoeuvre by default.
- **Partial success is partial marks, like a road test.** Perfection is
  rewarded, not required. Omitting a step scores nothing for that step but
  does not fail the task; doing the right things in the wrong order keeps a
  little credit, because the player knew to do them, but not much, because a
  signal after the fact informed nobody.
- **Too much creep is intersecting the path of other traffic** — which
  includes pedestrians and cyclists approaching a crossing, not only vehicles
  on the road. Ontario also holds that a vehicle waiting to turn left must not
  cross the stop line while a car ahead of it is already waiting in the
  intersection; that is a scenario waiting to be written.
- **A T-junction defaults to a stop on the minor leg only**, with the through
  road running uninterrupted. Any other configuration must remain expressible —
  control is per leg in `road.js`, and an all-way stop is simply four legs that
  agree.
- **Merging is scored on how early the driver started solving it, not on
  hitting a moment.** This is a third scoring shape and it does not fit the two
  that exist. `deadline` asks "done by when" and `window` asks "not before" —
  merging asks *how soon*, with credit falling off the longer it is left.

  What earns it: looking over the ramp **before the lane opens**, signalling
  early, and adjusting speed early. A driver who waits until the merge point
  to start assessing the traffic beside and behind them has already lost the
  thing being measured, even if they then merge safely.

  Whose fault it is when nobody lets you in depends on what the driver did.
  Signalling late, or picking a gap that was never there, is theirs. Doing all
  of it early and still being shut out is not.

  Harder still, and the case worth building toward: an on-ramp that doubles as
  an off-ramp, so exiting traffic crosses the merging traffic. That is a weave,
  and the engine can derive the conflict rather than being told about it.
- **Signalling out of a roundabout is best practice, not common practice.** So
  the indicator can never be the thing a roundabout scenario asks you to read.
  The line carries it instead: a driver about to leave drifts to the outside of
  the circulating lane, one staying in holds the inner line. That is geometry,
  so the engine derives what it costs — it is not a script that punishes you.

  Two things this has to keep satisfying, both checked in
  `verify-roundabout.mjs`. The drift has to be visible **before the player must
  decide**, or it is a post-mortem rather than a tell. And it has to be worth
  reading: the payoff is at the exit *before* yours, because a car peeling off
  at your own leg crosses your give-way line on the way out and holds you up
  anyway. Currently worth 3.25s.

## Architecture

**The engine is pure and the renderer is disposable.** `src/engine/` has no
React, no SVG, no DOM and no colours in it. A renderer needs exactly one call:
`simulate(scenario) -> { ego, actors, legalAt, priors }`. This is what makes a
3D view a second renderer rather than a rewrite — that is the agreed direction,
2D now, 3D later, so do not put anything visual into the engine.

```
src/engine/index.js      the conflict rules, traits, and what is where at time t
src/engine/road.js       a junction described: legs, lanes, control per leg
src/engine/paths.js      path shapes — line, curve, polyline — and no road at all
src/engine/sight.js      what the driver can see, and what creeping costs
src/engine/actions.js    manoeuvres: ordered actions, fault tiers, the mark sheet
src/engine/score.js      grading a press against a derived window
src/engine/route.js      several intersections in one drive, and continuity
src/engine/generate.js   seeded scenario generation
src/engine/compose.js    a brief in, a scene that measurably matches it out
src/engine/scenarios.js  the set situations, as data
src/engine/routes.js     drives, as data
src/theme.js             palette and type — the engine must never import this
src/environments.js      city, suburban, rural scenery — renderer side only
src/storage.js           adapter chain: artifact host, localStorage, memory
src/progress.js          what the player has cleared, and the daily record
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
node tools/verify-roundabout.mjs   direction, geometry, the exit tell
node tools/verify-playthrough.mjs  every scenario at every press time
node tools/verify-task.mjs         manoeuvres: order, deadlines, fault tiers
node tools/verify-sight.mjs        occlusion, and the creep trade
node tools/verify-compose.mjs      briefs produce scenes that match them
node tools/verify-equivalence.mjs  nothing moved that was not meant to
python tools/verify-scoring.py     re-derives the scoring curve independently
```

All ten must exit 0. Six things they check are worth understanding:

- **Equivalence is the one for refactors.** The others check the engine is
  right; that one checks it has not *changed*. It matters because a change to
  geometry moves every window, so the baselines get rebaked — and at that
  moment the regression net stops being able to tell an intended change from a
  mistake. `engine-golden.json` is a committed fingerprint of every window,
  every departure, every pose at 0.05s, and what the driver can see. Rebake it
  with `--write` only when the change is *meant* to move behaviour, and say so
  in the commit. Verified sensitive to a 1 cm shift in where cars rest and to
  a 40 cm shift in the driver's eye position.

- **Creeping has to buy sight AND cost safety.** If it only buys sight it is
  a free action and everyone holds it down; if it only costs, it is a trap.
  `verify-sight.mjs` measures both, and also measures whether there is *room*
  to creep: `PULL_STEP` is sized against the ~2 m between the stop line and
  the junction, because a step that fits into that band only once makes the
  mechanic a switch rather than a judgment.

- **A path trait that moves no window teaches nothing.** Compare a
  trait-carrying vehicle against a well-driven control. Known-inert traits are
  listed with reasons in `verify-windows.mjs` so a *new* dead trait still fails.
- **The generator audits the engine.** Every derived window is replayed to prove
  that departing on it does not collide. This is a harder test of the conflict
  rules than the fixed scenarios can give.
- **A tell has to be readable and worth reading.** Both are measured, not
  asserted: it must appear before the player has to decide, and a controlled
  comparison — same scenario, same arrival times, one thing changed — has to
  show it is worth real seconds. A tell that fails either is decoration.
- **The run loop is mirrored, because it cannot be driven headlessly.** It is
  `requestAnimationFrame`-driven, so no automated check can exercise the real
  component. `verify-playthrough.mjs` replays the same sequence of engine calls
  across every scenario at every press time — catching runs that never
  terminate, throw, miss a collision, or disagree with the scorer. It cannot
  catch a React mistake, so the component still needs eyes on it.

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
- **Composition is a search, not a sampler.** `compose.js` takes a brief —
  how much traffic, how much of it you can see — and builds a scene, then
  asks the engine what it actually turned out to be and throws it away if
  the numbers disagree. Placing a van and calling the result low-visibility
  would be authoring the answer, exactly like hardcoding a window. Blindness
  is measured from the driver's eye across the wait, so an obstruction where
  nothing passes counts for nothing.

  The vocabulary is deliberately small and in a driver's words. Every term
  has to be measurable or it does not belong: traffic is how many road users
  end up with priority, visibility is the share of them that cannot be seen
  clearly. Endless cycles the brief so a run moves through different kinds of
  situation, and keeps the shapes it has handed out so it does not repeat.
- **Roundabouts are in, but only just.** Single lane, two hand-written
  situations, and the generator does not produce them yet — that needs its own
  acceptance rules for exit choice and how many cars are circulating. They also
  have no pedestrian crossings, which on a real roundabout sit set back from the
  entry and are therefore not the crossings already built.
- **An international mode is planned.** Flagged by country, where local rule
  differences are the point rather than a trap — the thing traffic enthusiasts
  would come for. Until then the default is North American, and anything
  genuinely local should be written so it can move into that mode later.
- T-junctions, uncontrolled intersections and pedestrian crossovers are all
  wanted, behind the above.
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
