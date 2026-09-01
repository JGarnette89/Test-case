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
- **A pedestrian on a crossing holds the near half, not the whole thing.**
  Deliberately changed from "holds the entire crossing until completely
  across": once they are past the midpoint — onto the side serving the
  opposing direction of traffic — a driver may go. Still a legal rule, not
  a geometric one, still encoded as an explicit override (`blockUntilClear`
  in `index.js`), just narrower — real drivers take the lane once it opens
  rather than waiting for someone who has already left their side of the
  road. Progress is `pose.progress`, the same `k` `poseOn` already derives
  for the walk, so this needs no geometry of its own and does not care
  which direction the pedestrian is walking (`p.reverse`). One accepted
  side effect: `walker`'s window (and any other scenario whose pedestrian
  is on the exit leg rather than the approach) no longer lands on the same
  instant from every rotated approach, because which physical half is
  "near" is not compass-fixed the way the old full-crossing hold was —
  see `verify-route.mjs`, which checks every rotation is still individually
  safe rather than identically timed.
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
- **An emergency vehicle on a call outranks everybody.** Not by arrival
  order, not by which side it is on, and not by any `priority` a scenario
  stamped on somebody else — `outranks` in `index.js` checks `emergency`
  first, before anything else can talk its way past it. The only thing
  asked of the player is to yield and go once it is safe, so there is no
  new action and no new button: it is the ordinary GO, against a window
  the rule has moved.

  **Yielding is not freezing.** Priority decides who goes first where the
  paths actually meet. A call three intersections away is still a prior
  and still costs nothing, because the ego is long clear before it
  arrives — a version that pinned a driver to the line for a distant siren
  would be teaching a habit nobody wants. Both halves are checked in
  `verify-events.mjs`.

  Pulling over is deliberately NOT modelled here. It only makes sense
  for a driver already in motion, so it belongs to a lane-change or
  merge scenario rather than to a car stopped at a line.
- **Someone waiting at a crossing button holds none of the crossing.**
  The signal has not changed; traffic keeps moving, which is what happens
  at a real push-button crossing and what makes the press worth reading —
  it is a warning that a phase is coming, not the phase itself. See
  `holdsCrossing` in `index.js`. Without that rule a waiting pedestrian
  would block from the moment they became visible, and the button would
  be indistinguishable from them simply walking out.

  The wait between press and walk signal (`PED_BUTTON_WAIT`) must stay
  longer than `GRACE`, so the phase never lands inside the graded window.
  Otherwise the scorer would be handing out marks for time that drives
  into a crossing.
- **Legally yours and safe to take are not the same thing, and the scorer
  grades the second one.** `legalAt` is derived against priors only — whoever
  outranks the ego. A non-prior is still a physical object: one still
  arriving when the window opens can be scheduled, or simply driving, on the
  assumption the ego leaves promptly, and a player who takes the grace the
  scorer offers can meet it anyway. `safeAtFor(sim)` in `index.js` is the
  real scoring boundary — checked against everyone, across the whole graced
  window and every depth of creep. Grade against `safeAtFor(sim)`, never
  against `sim.legalAt` directly.

  It diverges from `legalAt` on about half the set situations now, and
  that is the mechanism working rather than failing. It used to be nearly
  a no-op, but only because traffic crossed an intersection in a fixed
  1.5s: almost nothing was still arriving inside the ego's 2.6s of grace.
  Real acceleration made crossings take three times as long, so a second
  road user still on its way in during that grace is ordinary. What is
  checked in `verify-wontstop.mjs` is the invariant that actually
  matters: `safeAt` is NEVER earlier than `legalAt` — that direction
  would mean the scorer offering a window the engine calls unsafe — and
  `wontstop`, which deliberately authors a driver who never yields,
  stays the largest divergence by a clear margin (4.1s against 1.4s for
  the next). An ordinary scenario diverging past 2s is treated as a bug
  somewhere else surfacing here.
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
React, no SVG, no DOM and no colours in it. A renderer needs two calls:
`simulate(scenario) -> { ego, actors, legalAt, priors }`, then
`safeAtFor(sim) -> number` for the window to actually grade against. Kept
separate on purpose — folding the second into the first made Endless
generation roughly 13x slower, because composition calls `simulate()` deep
inside its own search loop, where only `legalAt` is ever needed. This is what
makes a 3D view a second renderer rather than a rewrite — that is the agreed
direction, 2D now, 3D later, so do not put anything visual into the engine.

```
src/engine/index.js      the conflict rules, driver traits, and what is where at time t
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
src/engine/traits.js     PLAYER perks and consumables — not the driver traits above
src/engine/roguelike.js  a run: stages, bosses, the branch, the Checkride, Insight
src/engine/stages.js     the roguelike's stages and its roundabout graph, as data
src/engine/bosses.js     hand-authored boss situations, as data
src/theme.js             palette and type — the engine must never import this
src/environments.js      city, suburban, rural scenery — renderer side only
src/frame.js             the camera: frameFor and cameraFor — no React
src/storage.js           adapter chain: artifact host, localStorage, memory
src/progress.js          what the player has cleared, and the daily record
src/apps/RightOfWayTiming.jsx  the renderer — every mode is this one component
src/apps/RoguelikeScreens.jsx  the run's own four screens: branch, draft, both endings
src/apps/roadArt.jsx     SVG shared by the renderer and those screens
src/apps/timingStyles.js the style objects both of the above use
src/apps/MergeRush.jsx   a minigame prototype, deliberately not wired in
```

**The renderer is one component, and it is the thing that grows.** Every
mode — set, daily, endless, roguelike, routes — is a branch inside
`RightOfWayTiming.jsx`, so a new mode means reading it first. When a
screen has no business with the timing loop, the press or the grade, it
belongs beside `RoguelikeScreens.jsx` instead: take a run and a callback,
render, and let `roguelike.js` decide what the callback actually does.

**The scenario draw must stay pure.** `drawn` is a `useMemo` over
`(source, drawSeed)` and nothing else. Do not seed it from `Date.now()`
and do not write to `seenShapes` inside it. `useMemo` is a performance
hint React may discard and recompute whenever it likes: a clock-seeded
draw silently swaps the intersection mid-play, taking `sim`, `safeAt` and
the graded window with it. Advance `drawSeed` deliberately (`nextDraw()`)
when a new situation is actually wanted, and record what was drawn in an
effect after commit.

**Never author the answer.** The safe window is computed by simulating
footprints through the intersection. Do not hardcode "window opens at 3.2s". If
a scenario needs a specific window, change the arrival times until the engine
produces it. The generator obeys the same rule: it declares arrivals and intents
and then asks the engine what they mean.

**Data over code.** Scenarios, routes and traits are plain declarations. Adding
a situation, a drive, or a trait must be a data entry, not a new component.

**There are two unrelated things called "traits". Know which one you are in.**

- **Driver traits** — `TRAITS` in `src/engine/index.js`. How an NPC actually
  drives. They belong to a car in a scenario.
- **Player traits** — `TRAIT_CATALOG` in `src/engine/traits.js`. Run-scoped
  perks the player drafts in the roguelike. They belong to a run, and they
  bend nothing about how anyone drives.

They are one word apart and do opposite things: a driver trait is *supposed*
to move a window, and a player trait must never be able to.

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
Pedestrians rotate with the scene too — `crossingOf` is derived from the
actor's own `from` leg, not pinned to north, so `isRotatable`/`rotateScenario`
in `route.js` carry a pedestrian like any other actor; `walker` rotates
cleanly to all four approaches.

**`sightBlockers` are the one thing that cannot rotate**, and `isRotatable`
refuses them. A blocker is fixed x/y, authored to blind one specific approach
— the van in `unprotected` sits where it hides the S leg. Rotation spins the
road and every actor's `from`, but a static blocker has no `from` to spin, so
a rotated copy leaves it planted in the same screen position while the road
turns around it. `legalAt` never reads `sightBlockers`, so nothing about
safety would notice; the driver would. Two situations trip this today —
`unprotected` and `boss-blind-rush` — which is why the Checkride's leg order
leads with `unprotected`: it is the one leg that can never be aligned to
whatever the previous leg leaves you facing.

**Scoring rewards reading, not luck.** Full marks anywhere inside 0.35s of the
window opening, because nobody reacts to a visual cue faster than that, decaying
to zero at 2.6s — exactly where undue delay begins, so there is no cliff at the
verdict boundary. A press more than 0.25s early is a failure to yield and scores
nothing on any curve.

`REACTION_FLOOR` and `GRACE` are now *defaults*, not constants: `grade()` takes
both as optional parameters so a drafted player trait can widen the curve for
one run. Widen only — nothing may narrow them, and every existing call site
that passes neither behaves exactly as it always did. **`EARLY_TOLERANCE` is
deliberately not a parameter.** It is the boundary of a failure to yield, not a
matter of taste; loosening it would reward going before the road was yours,
which is the one thing no perk is allowed to buy.

**True-to-life scale.** The game is 20 px per metre. Lane 3.6 m, car 4.5 x 1.8 m,
truck 9 x 2.55 m, painted lines 0.15 m. Signs are the one deliberate
exaggeration, drawn as map symbols because a real 0.75 m sign face would be
unreadable.

**True-to-life motion, too — speed is stated and time is derived.** A path
knows its own length; how long it takes comes from a motion profile in
`paths.js`. A vehicle that stopped accelerates away at ~2.4 m/s² and levels
off (41 km/h straight, 26 through a left, 22 through a right); one that
never stopped cruises at the speed it carries through (45 km/h); a
pedestrian walks at 1.35 m/s. Crossing a stop-controlled junction therefore
takes about five seconds, not one and a half.

The version this replaced set a fixed duration per manoeuvre, and it was
wrong in two ways that were measured rather than suspected. Cars left the
line at a constant 72 km/h having accelerated from rest in no time at all.
And because the time was fixed rather than derived, a wider road made
traffic move FASTER — the six-lane `arterial` was crossed at 89 km/h in the
same 1.5s as a two-lane street, while that scenario's own lesson says
"crossing takes longer here than it feels like it should". A player
learning gap judgment from that was learning something false, which is the
one outcome this file cares about most.

It also quietly disabled a rule: "a moving vehicle claims road proportional
to speed" was pegged at the `MAX_CLAIM` ceiling for 18 of 21 road users,
because everything moved fast enough to saturate it. Real speeds
un-saturate it — 0 of 21 now — so the claim discriminates again.

Do not reintroduce a fixed traversal time. If a scenario needs a different
window, move the arrival times, exactly as with everything else here.

## The roguelike layer

A run is a driving test with stakes: named **stages** (`stages.js`), each
capped by a hand-authored **boss** (`bosses.js`), with a roundabout branch
screen between them for choosing what comes next, building to a four-leg
**Checkride** finale. Clearing the Checkride is the run's one win state
(`outcome: "won"`); any critical fault anywhere ends it (`"ended"`).

**The boundary that makes the whole thing safe.** A player trait or a
purchased consumable may change exactly three things: what the player is
shown, how generous the scorer is being *for display this run*, and which
brief the generator is asked for next. It may never touch `legalAt`,
`safeAt`, collision detection, or a pad/claim/resolution constant. A perk
that moved the window would be authoring the answer wearing a costume.

This is enforced structurally, not by good intentions:

- **The dependency runs one way only.** `traits.js` and `roguelike.js` may
  import `compose.js`'s exported vocabulary; `compose.js` and `generate.js`
  never import them. A trait describes an *intent* (`trafficBias: "heavy"`)
  and it is `roguelike.js`'s job to turn that into a draw. Checked by a
  source-level grep in `verify-roguelike.mjs`.
- **Bias picks the brief, never the verdict.** `composeScenario`'s own
  `windowIsSafe` gate runs unconditionally whatever was asked for, so a
  biased draw has passed exactly the audit an unbiased one would.
- **A consumable is shaped like a trait.** Every `CONSUMABLES` entry has the
  same `apply(mods) -> mods` signature as a permanent trait, verified to
  produce the identical key set — so a spend cannot smuggle in a kind of
  effect the trait system's invariants do not already cover. Most are the
  identity function; the *action* lives in `spendConsumable`.

**`isCritical` is broader than `route.js`'s `DEFAULT_END_ON`, on purpose.**
That default only checks `result.verdict === "collision"`. A failure to yield
reports as `"early"`, and encroachment or a blocked box only ever surface
through `gradeTask()`'s sheet, never as a verdict string. Copying the default
uninspected would let a run survive its own worst faults. The Checkride
therefore grades its legs through `isCritical` too, not `recordLeg` — one of
its four legs (`unprotected`) is manoeuvre-graded, exactly the case the
narrower check misses. `planRoute`/`currentLeg` are still reused for what they
are good at: resolving each leg's rotation.

**A hand-authored scenario skips the generator's safety net.** `windowIsSafe`
lives inside `composeScenario`, so it only ever guards generated draws.
Anything written by hand — every boss, every entry in `scenarios.js` — has to
be checked against `safeAtFor` directly instead. `verify-stages.mjs` does this
for the bosses; a new hand-authored situation must not skip it.

## Verification requirement

**Any change to the conflict engine, trait system, scenario timings or the
generator must be re-verified numerically before it is considered done.**

```
node tools/verify-windows.mjs      every window; each trait removed on its own
node tools/verify-route.mjs        rotation, continuity, run mechanics
node tools/verify-generator.mjs    determinism, safety, spread, rejection rate
node tools/verify-roundabout.mjs   direction, geometry, the exit tell
node tools/verify-wontstop.mjs     a driver who fails to yield: tell, safety, the extended window
node tools/verify-playthrough.mjs  every scenario at every press time
node tools/verify-task.mjs         manoeuvres: order, deadlines, fault tiers
node tools/verify-sight.mjs        occlusion, and the creep trade
node tools/verify-compose.mjs      briefs produce scenes that match them
node tools/verify-camera.mjs       the camera opens gradually, never shrinks, keeps a revealed actor in frame
node tools/verify-roguelike.mjs    traits and Insight: the safety wall, the one-way dependency
node tools/verify-stages.mjs       stages, bosses, the branch graph, a full run end to end
node tools/verify-events.mjs       the crossing button and the emergency vehicle: rule, readable, worth reading
node tools/verify-equivalence.mjs  nothing moved that was not meant to
python tools/verify-scoring.py     re-derives the scoring curve independently
```

All fifteen must exit 0. Seven things they check are worth understanding:

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
- **A safe window has to stay safe for its whole grace period, not just its
  first instant — and at every depth of creep.** A window can open, close
  again as a second road user arrives, and reopen later; creeping shifts
  where the ego actually departs from, which the encroachment fault cannot
  see because it only ever watches priors — creeping toward traffic that has
  right of way is the foul, not creeping toward traffic that does not.
  Both generators sweep grace and creep before accepting a draw;
  `safeAtFor` in `index.js` does the same for hand-authored scenarios, on
  demand rather than inside `simulate()` itself, because the sweep is too
  expensive to pay on every call a search loop makes.
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
traffic, two traits that had no effect at all, 31 generated scenarios that
claimed to demand a wait while going immediately still scored full marks, a
scored window that stayed "good" past the instant a non-prior road user's own
schedule assumed the ego was already gone (1142 of 4000 generated drafts
before the fix), and the same failure again through creep specifically —
invisible to the encroachment fault because it only ever watches priors — in
62 of 1500 further drafts, plus two scenarios that had already shipped
(`sleeper`, `creeper`) by exactly one `STEP` each.

## Conventions

- Plain React with hooks. No Redux, no state library.
- Inline style objects and a small `<style>` block. No Tailwind, no CSS files.
- `lucide-react` for icons. Do not add UI or animation libraries without asking.
- Comments explain *why*, not *what*. Only where the reasoning is not obvious.
- Mobile-first: 44 px minimum touch targets, `100dvh`, safe-area insets,
  `touch-action: none` on the canvas, 16 px inputs so iOS does not zoom.

## Known work in progress

- **Leaderboards and Play-style connectivity are the agreed direction — not
  started.** The goal is what a game shipping on Google Play is expected to
  have: a leaderboard, achievements against the situations `progress.js`
  already tracks, cloud save so a cleared record survives a new device, and
  whatever sign-in that requires. This is the one part of the app the offline
  rule was always expected to eventually give way to — see Do not below. It
  has not given way yet: no account, network call, or SDK exists in this
  codebase, and none should be added except deliberately, on request. Agreeing
  to the direction is not the same as authorizing the build.
- **User-created scenarios** are wanted. Scenarios are already plain data, so
  this is an editor plus import/export, and sharing by file or link needs no
  server — a separate thing from the leaderboard/connectivity work above,
  which does need one.
- **The roguelike is built** — stages, bosses, the branch, the Checkride and
  the Insight economy all ship and are verified. See "The roguelike layer"
  above for the boundary rule that keeps it safe. What it does *not* have yet
  is any of the world around it: see the next two entries.
- **Minigames: one prototype, deliberately unwired.** `src/apps/MergeRush.jsx`
  is a convoy-runner in the style of the crowd-battle mobile ads, reskinned to
  this game's world — sign-gantry gates, a merge through rush-hour traffic
  rather than a crash, since this game is about avoiding those. It is
  standalone: no import from `src/engine/`, not on the home screen, not in the
  mode switcher, reachable only at `#/merge-rush`. The intent is
  WarioWare-style minigames between stages, but nothing is hooked up and it
  has not been playtested — see Do not.
- **An overworld and a narrative frame are agreed in direction, not built.**
  The setting is driving purgatory: the player had an incident and is stuck
  retaking the test until they can prove their way out, which is what the run
  loop already does mechanically. Bosses become examiners; deeper stages
  become stranger districts. The overworld is a literal road — cleared stages
  as landmarks behind you, fog ahead, roundabouts as interchanges, minigames
  as rest stops — reusing the road primitives rather than a new map system.
  Ideas, escalation levers and the open questions are collected in the
  "Purgatory Road" artifact rather than here, since they are a brainstorm
  rather than decisions:
  https://claude.ai/code/artifact/01c6d8d4-904b-401e-9f69-a4006be2dd88

  One rule survives the reskin intact: **the fiction can be as strange as it
  likes, the traffic law cannot.** A weirder vehicle, a stranger sign, a
  district where you must read signs by shape because the text is unreadable
  — all fine, and the last one is a real skill. A district with a genuinely
  different right-of-way rule is a domain question, and it is the
  maintainer's, like every other one in this file.
- **Longer waits are answered with something to read, not with shorter
  waits.** Realistic acceleration made every wait about three times what
  it was, and the agreed direction is to fill that time rather than tune
  it away: things that happen DURING the wait and change what the answer
  is. Two are built — the crossing button and the emergency vehicle, both
  in the established rules above — and both had to clear the same bar as
  any other tell: readable before the decision, and worth real seconds in
  a controlled comparison (`verify-events.mjs`).

  Still wanted, not built: a **fender bender** that blocks a lane
  mid-scenario. It is the one of these that changes the road rather than
  the traffic on it — a moving car becomes a static obstruction, sightlines
  close, and other traffic would want to re-route around it. That last part
  is genuine dynamic re-planning, which the engine does not do: everything
  is derived once, up front. Worth being deliberate about, because it is an
  architectural addition rather than a data entry.
- **A window can now CLOSE.** Every scenario used to open one and leave it
  open, so a late press only ever cost marks. `button` is the first where
  the answer expires — the walk phase takes the crossing back. Scenarios
  like that declare `windowCloses: true`, which is what lets
  `verify-playthrough.mjs` keep enforcing "an open window is always safe
  to take" everywhere else while allowing a collision *after* the graded
  stretch here. The graded stretch itself is still guaranteed safe by
  `safeAtFor`; what is permitted is only the region the scorer has already
  called undue delay. Do not set that flag to quiet a failure — a window
  closing anywhere it was not designed to is a real bug.
- **Pedestrians in generation: done.** They rotate correctly (`crossingOf`
  is relative to the actor's own leg), and both generators place one now —
  `generate.js` (Daily) on 22% of draws, `compose.js` (Endless, ported from
  it) at a similar rate, on any leg the junction actually has, multi-lane
  included. Cyclists are not agreed — they would need a ruling on how a
  bicycle claims road compared with a car.
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

  The `Roundabout` component now has a **second, non-driving use**: it draws
  the roguelike's between-stages branch screen, where the exits are the stages
  on offer rather than roads. Two hand-written situations makes it look
  under-used; it is not.
- **The camera a merge scenario will need already exists, unused.**
  `src/frame.js` has `cameraFor`, which eases the view out to keep a named
  actor in frame before the decision point — verified in `verify-camera.mjs`
  against real scenario data, because no merge scenario exists yet to verify
  it against. What's missing is the merge itself: real conflict geometry for
  two converging lanes, which needs the maintainer's ruling the same as any
  other traffic-law question in this file, not a guess.
- **An international mode is planned.** Flagged by country, where local rule
  differences are the point rather than a trap — the thing traffic enthusiasts
  would come for. Until then the default is North American, and anything
  genuinely local should be written so it can move into that mode later.
- T-junctions, uncontrolled intersections and pedestrian crossovers are all
  wanted, behind the above.
- **`wideTurn` is unused.** It used to ride along in `lateflag` — bending the
  path by 1.1 m for a 0.01s effect on the window, under the resolution floor,
  while its tell still claimed a consequence to the player that was not
  really there. Removed from that scenario rather than left as a false tell.
  Still defined in `TRAITS`, waiting for a scenario where the wide line
  actually reaches the lane the ego uses.
- **`creep` is masked by `overshoot` in `creeper`.** Accepted — creepers are for
  confusing right of way in busier scenarios than that one.
- The timing renderer is the only one. 3D is the agreed direction, not started.

## Do not

- Do not add analytics, accounts, or network calls without being asked to. The
  offline-in-a-car rule still holds for everything the game does today.
  Leaderboards and Play-style connectivity are the agreed exception and the
  intended direction — see Known work in progress — but that is a decision to
  build toward, not a standing invitation. Nothing has been wired up; do not
  start on the assumption agreeing to the direction means agreeing to begin.
- Do not use `localStorage` directly. Go through `src/storage.js`, which falls
  back cleanly when storage is refused — a private window will hand you a
  `localStorage` that throws on first write.
- Do not put colour, React, or anything visual into `src/engine/`.
- Do not wire MergeRush — or any other minigame — into the roguelike run until
  it has been playtested and the shape is settled. It is a prototype to react
  to, and it is unwired on purpose, not by omission.
- Do not let a player trait or consumable reach `legalAt`, `safeAt`, collision
  detection, or a pad/claim/resolution constant. See "The roguelike layer".
- Do not "simplify" the scenario, route or trait systems back into hardcoded
  cases.
- Do not spoil the set situations in UI that lists them. Half of them turn on
  not knowing what is coming; locked ones are counted, never named.
