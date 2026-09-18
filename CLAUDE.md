# CLAUDE.md

Read this before making changes. It encodes decisions that took a long time to
get right, and several of them are non-obvious.

---

## START HERE IF YOU ARE PICKING THIS UP COLD

More than one agent works in this repository. Anything decided by argument
and not written down is invisible to every tool that was not part of that
argument, so the documentation is a CONTRACT rather than a diary.

**THE PROJECT WAS REFRAMED ON 18 SEPTEMBER 2026: it is a TRAFFIC
SIMULATOR first, with the examiner game as a mode inside it later. Read
[SIMULATOR.md](SIMULATOR.md) before starting anything.** It records why
(the axes were built before a world that could express them), the
decisions (one continuous handmade ~8 km² world, an editor, maps as
data loaded in chunks, elevation, an ISOMETRIC view, roads as free
curves), what survives of the code below (the stepped sim core; the
assessment machinery is shelved, not deleted; the content-generation
layer does not survive), and the staged path, every stage of which ends
in something the maintainer can look at. Everything under "The examiner
game" in this file describes the shelved mode and the retired engine;
it is history until the exam mode returns.

**THE FOUNDATION IS BEING REPLACED. Read [REBUILD.md](REBUILD.md)
before starting anything in `src/engine/`.** The maintainer played the
game and concluded it "doesn't resemble anything like a game, more like a
flash animation... the cars crawl on the road and they don't actually
interact". The cause is structural: every road user's motion is resolved
before the drive begins, so no participant ever reads another while
moving. Interaction cannot be added to trajectories that were all decided
in advance. REBUILD.md scopes a stepped simulation, what survives, and
what it costs.

**Read [DECISIONS.md](DECISIONS.md) before changing anything in
`src/engine/`.** Almost all of it survives the rebuild -- every domain
ruling, the five-axis driver model, the three perception layers, the
failure patterns. That is the point of having written it. It is the load-bearing constraints with their reasoning
attached — the things that have a plausible, well-intentioned "fix" that
destroys what they protect. This file is the long-form history; that one
is what you must not break.

**[DRIVE-GUIDE.md](DRIVE-GUIDE.md)** is how to actually operate the game
at `#/drive`, and what is knowingly missing from it.

Eight things to know before your first change:

1. **NEVER AUTHOR THE ANSWER, and never author the fault.** Windows are
   simulated, never typed in. Faults are DERIVED by controlled comparison
   — strip the trait, and the fault must vanish. Writing down "at 3.4s
   this driver swings wide" turns the game into a memory test.

2. **THE RECURRING BUG IS TWO IMPLEMENTATIONS OF ONE QUANTITY**, or a
   proxy standing in for the quantity that actually matters. It has paid
   out more than any other heuristic here: `basePose` vs `cleanPose`,
   `legalAt` vs `safeAtFor`, occluded vs not-yet-on-stage, a fixed
   traversal time standing in for motion, a smoothstep standing in for
   braking, observation calibrated against collisions. **The tell is a
   measurement that comes out at exactly zero, or exactly saturated, or
   suspiciously clean.** DECISIONS.md §10 lists them.

3. **A CHECK CAN PASS FOR THE WRONG REASON, AND GREEN IS WORSE THAN RED
   WHEN IT DOES.** Three shapes of this, all found in the rebuild and all
   of them shipping green first:

   - **It passes with the mechanism removed.** The cross-boundary
     following check measured the closest gap near a seam under ordinary
     traffic. Deleting the rule entirely moved the worst gap from 10.04m
     to 8.46m and it still passed. Sabotage the thing on purpose before
     believing a check about it. DECISIONS.md §5.15.4.
   - **It has an implied sample size nobody stated.** `verify-telling`
     compared drivers over one ten-minute drive; which manoeuvres they
     drew swung the answer more than the driver did, and an unrelated
     change took a 7.1x separation to 1.17x. Eight seeds gives 2.3x.
     §5.15.9.
   - **It compares a quantity with itself.** A check that set the gap
     horizon to the approach length and then asserted the approach
     covered it. §5.15.3.

4. **A CHECK HAS A BOUNDARY, AND IT IS INVISIBLE IN ITS OUTPUT.** The
   second recurring failure, three times in two days: `verify-turns`
   measured only the approach and never the exit; `verify-screens`
   rendered the mode components and never the shell every route goes
   through, then rendered one frame at t=0 and never a branch that only
   runs under a runtime condition. All shipped green. When a check passes
   on something you suspect, ask what it does NOT look at — and try to
   make it fail on purpose. DECISIONS.md §10.1.

5. **THE BUILD PASSING DOES NOT MEAN THE APP RENDERS.** A render-time
   `ReferenceError` is not a build error: `vite build` succeeded while
   `App` threw on mount and every route served a blank page. Run
   `node tools/verify-screens.mjs`, which renders `App` and every route
   under SSR. It still cannot tell you how anything LOOKS.

6. **A STATE THE ENGINE CAN PRODUCE AND THE RENDERER CANNOT EXPRESS IS
   NOT A MISSING FEATURE. IT IS A LIE ABOUT WHAT HAPPENED.** Everything
   else in this file is about not authoring the answer; this is about not
   silently discarding it. `outcome.js` knew contact ends a drive from
   the day it was written and `ExaminerDrive` never asked it, so two cars
   drove through each other and play carried on — in **63% of drives**,
   in the build the maintainer was playing. They have never seen a collision
   in this game because there was nothing to see. When you add a state,
   ask what draws it; when you find one that nothing draws, that is not a
   backlog item. DECISIONS.md §5.12.

7. **SCRIPTED PLAYTHROUGHS DO NOT WORK HERE. Do not try.** The preview
   pane delivers zero animation frames — measured, 0 in 1.5s with
   `document.hidden` false — and clamps timers, so an rAF-driven screen
   never advances and nothing errors. The signature is a screen that draws
   correctly and never moves, or a hand-rolled frame pump that stalls
   after a burst. Verify by reading, by `verify-screens.mjs`, and by
   asking a person to open the page. This cost real time four times before
   it was written down.

8. **RUN THE CHECKS THAT COULD HAVE BROKEN, NOT ALL OF THEM -- AND NONE
   OF THIS WEAKENS THE DISCIPLINE.** The maintainer's instruction, after
   one session ran past five thousand turns and the usage limit stopped
   work three times in two days. A large share of those turns went on
   full suite runs after changes confined to one subsystem, on sweeps
   re-run per tweak, on re-verifying things nothing had touched, and on
   waiting for background runs that a later edit had already made
   meaningless. The account, with numbers, is DECISIONS.md 11.3. The
   rules:

   - **The import lines at the top of each `tools/verify-*.mjs` ARE the
     dependency map.** `src/engine/` never imports `src/sim/`, so a
     change confined to `src/sim/` can only break `verify-sim`,
     `verify-crossing`, `verify-telling`, `verify-course` and
     `verify-screens` -- about 100 seconds, against 18 minutes for the
     suite. The table is below; re-derive it with
     `grep -l "sim/" tools/verify-*.mjs` when in doubt, and whenever you
     add a check.
   - **Reserve the full suite for three occasions: before a commit;
     after a change that crosses subsystems (`index.js`, `paths.js`,
     `ratings.js`, `road.js`, `scenarios.js` and `score.js` are imported
     by nearly every check); and when something unexplained happens.** A
     subset run is REPORTED as a subset -- name the checks and say why
     the others could not have broken. If you cannot say why, that is a
     reason to run more, never fewer.
   - **Don't re-verify what hasn't moved.** `verify-equivalence` and
     `engine-golden.json` exist so that "did the engine change" is a
     one-second question. Run it FIRST after any engine change: green
     means no window, departure or pose moved, and the rest of the
     engine suite is then checking things the change could not reach.
   - **Batch measurement.** A sweep is a script with its range as
     parameters, run once across the range, and kept beside the number
     it produced -- under `tools/measure/`, or as the verify section it
     became. Prefer one run that answers several questions to several
     runs that each answer one. A number in the docs without its script
     has to be measured again: REBUILD.md 8.2's bend table cost exactly
     that when the bend came to be built.
   - **Stop background work the moment an edit supersedes it.** Kill it
     -- the harness's task stop, or the process -- do not wait on it,
     and never read its result as evidence about the current tree. A
     suite started against a tree that is still being edited costs the
     run, the stale failure, the explanation, and the re-run; that
     happened here, twice.
   - **Prefer the cheap diagnostic.** `git status`, the log file, a
     one-line `node -e` against the module, `grep` for the anchor --
     before driving the whole system to reproduce anything. This
     environment forces it anyway: the pane draws no frames (item 7).
   - **Write patch scripts as files and run them; grep an anchor before
     asserting on it.** Bash heredocs with quotes in them fail on this
     Windows shell, and a documentation anchor drifts by a word.
   - **Before a long operation, write down what you are doing and what
     comes next**, in the scratchpad. Context is compacted and sessions
     are cut off; re-deriving the state afterwards was one of the largest
     costs of the session that produced this rule.

   | a change confined to | run | cost (run of 10 Sep) |
   |---|---|---|
   | `*.md` | nothing | 0 |
   | `tools/verify-X.mjs` | X | |
   | `src/apps/*`, `App.jsx`, `theme.js` | `verify-screens` | 6s |
   | `src/iso/*` | `verify-perf`, `verify-wheel`, `verify-screens` | 7s |
   | `src/sim/traffic.js` | the `src/sim/` five, plus `verify-wheel` (the player rides its step) | ~3m |
   | `src/sim/*` | `verify-sim`, `-crossing`, `-telling`, `-course`, `-screens` | ~100s |
   | `src/frame.js` | `-screens`, `-camera`, `-clearance`, `-events`, `-world` | ~5m |
   | `src/engine/detect.js` | `-detect`, `-faults`, `-outcome`, `-course` | ~2m |
   | `src/engine/paths.js` | `-equivalence` first, then `-turns`, `-roundabout`, `-detect`, `-outcome`, `-reaction` and the `src/sim/` five | ~4m |
   | `index.js`, `ratings.js`, `road.js`, `scenarios.js`, `score.js` | the full suite | 18m |

   Where the 18 minutes go: `verify-candidate` 6m39s, `verify-world`
   4m06s, `verify-roguelike` 1m31s, `verify-course` 63s, `-outcome` 43s,
   `-generator` 33s, `-events` 31s, `-crossing` 19s, `-playthrough` 16s,
   `-telling` 13s, `-screens` 6s; everything else under ten seconds. The
   three long ones are old-engine checks that a `src/sim/` change cannot
   reach.

   **WHAT DOES NOT CHANGE, AND IT MATTERS MORE THAN THE SAVINGS.**
   Measure before building. Report a failure rather than building over
   it. Never tune a number to make a check pass. Never claim a run was
   green without it being green, and never let "the checks passed" stand
   where "the five sim checks passed" is the truth. "Run fewer checks"
   rots into "skip the inconvenient ones" the first time a subset is
   chosen for convenience rather than justified from the imports -- so
   the justification is said out loud every time, and a commit still
   gets the whole suite. A saving that trades against any of this is not
   a saving.

**LANGUAGE IS ONTARIO, CANADA — American English, North American road
terms.** intersection not junction, curb not kerb, sidewalk not pavement,
yield not give way, shoulder not verge, crosswalk not zebra crossing, turn
signal not indicator, parking lot not car park; color, behavior, meter,
center. `arterial`, `collector`, `roundabout`, `right of way`, `stop line`
and `driveway` were already correct. **Player-facing text and code
identifiers are both done** — 446 `junction` and 82 `kerb` occurrences,
17 distinct names, renamed as their own pass.

**The sweep damaged the prose around it and this paragraph was part of the
damage**, which is the lesson worth keeping: it read "intersection not
intersection, curb not curb" for two increments, because the rename
rewrote the sentence that documented the rename. It also left 48
instances of "a intersection". Re-read the thing that documents a sweep,
after the sweep. See DECISIONS.md §2.1.

**If a change depends on a traffic-law assumption, ASK.** The maintainer
is a driving examiner; getting a rule wrong teaches somebody something
false, which is the worst outcome available here.

---

## What this repo is

**Right of Way** — a real-time judgment game. **You are the examiner.**

You sit in the passenger seat while a candidate drives a set course. You hold
a field of view and can only mark what you actually saw. You give the
directions, in time for them to be followed. You watch for danger and take the
wheel when you have to. And you mark the faults you catch — while paying for
the ones you invent.

This is the whole game. There are no other modes.

**Two of those four are DESIGN rather than build.** The field of view is not
implemented — the gaze cone was deleted from `sight.js`, so visibility is
occlusion only and every fault the candidate's own car commits is always
markable. Nor is taking the wheel: intervention is unbuilt and is the blocking
question. Both are in `DECISIONS.md` §12 with what it would take. Do not read
the paragraph above as a description of the current build.

**It was a driver game until 2 Sep 2026, and most of the code still is.** You
were one car at an intersection, pressing GO the moment the road became
legally yours. That premise is finished, but nothing has been deleted: the
driver game is shipped, verified, working code and it is the material the
examiner game is built from, not a thing to tear out. Sections of this file
still describe it because it still exists. See "The examiner game" below for
what is agreed, what is built, and what is not.

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
- **A T-intersection defaults to a stop on the minor leg only**, with the through
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
- **An instruction is given as early as it is clear what it is
  specifically asking.** The maintainer's practice, verbatim: "I will ask the
  applicant to 'turn right at the first street' more or less as soon as that
  statement is true to where our route takes us." So the instruction window
  OPENS when the phrase stops being ambiguous — when the intersection ahead is the
  one the phrase points at — and CLOSES when the candidate must already be
  acting on it. Neither edge is a number anybody picked; both are derived in
  `directions.js`.

  **Stacking instructions is a trade, not a fault.** Also verbatim: "I will
  avoid giving instructions in a row, only when having multiple instructions
  to execute does not overwhelm the concentration of the applicant, or when
  knowing the multiple steps required in advance will give the driver the most
  possible time to complete their task." Both halves are real and they pull
  opposite ways, which is what makes it a mechanic. Calling ahead buys the
  candidate time — an instruction given early can never be given late — and
  buys the examiner attention back for the other three systems. It costs the
  candidate's concentration, and **a loaded driver is a worse driver**. You
  are trading your own risk for theirs.

  Measured, so the meter is not a feeling: at full stack the candidate's
  wide turn is 62% wider and their slow start 56% worse. `verify-directions.mjs`
  reads that through the same fault derivation the examiner marks against,
  rather than asserting that a number moved.

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

## The examiner game

Four systems running at once, which is the point: they compete for the same
attention, and the interesting failures come from that competition rather than
from any one of them being hard.

1. **Observe the candidate's driving.** They drive; you watch.
2. **Assess observable errors.** Mark what you caught. Marking a fault that
   did not happen has to cost, or the strategy is to mark everything.
3. **Watch for danger and intervene.** Take the wheel before it becomes a
   collision.
4. **Give the directions.** A set course, and the candidate only knows what
   you told them.

**The flip was cheap for one reason: the candidate is just a participant.**
`simulate()` calls `schedule([ego, ...actors])`, and `schedule` applies driver
traits to everything it is handed, the ego included. So the car being examined
needs no special case anywhere — it drives badly in the same named, measured
ways any NPC does. Measured: 6 of the 7 driver traits produce a visible fault
on the candidate's own car.

### Never author the fault

The driver game's one inviolable rule was **never author the answer** — the
safe window is simulated, never typed in. The same temptation reappears here
wearing a new costume: hand-writing "at 3.4s this driver swings wide, mark
it". Do that and the game is a memory test with a driving skin.

So a fault is DERIVED, by controlled comparison: simulate as written,
simulate again with one trait stripped from one driver, diff the poses. Where
they separate by more than a driver could fail to notice, the fault is
happening, and the car's position at those instants is where an examiner would
have to be looking. Same car, same schedule, one thing changed — the technique
`verify-windows.mjs` already used to prove a trait matters at all.
`src/engine/faults.js` does this and `verify-faults.mjs` proves it: strip the
trait and the fault must disappear, every time.

This also settles the hardest content question for free. The derivation that
produces a fault produces its **visibility** too, so a fault the player could
not physically have seen cannot be marked against them.

### What is built

- **`src/engine/faults.js`** — fault derivation. `faultsIn(scn)` returns every
  fault from every participant with who, what, when, where, how long, and
  which channel it reads on. `MIN_DURATION` is a real gate: `lateflag`'s late
  signal lasts 0.15s and is correctly dropped as uncallable.
- **`src/engine/sight.js`** gives what CAN be seen from the car:
  `whatEgoSees` for occlusion, `faultSeenAt` and `faultShownFor` for
  whether a fault was readable, `assessCreep` for what edging forward
  buys and costs.

**THE GAZE CONE IS NOT BUILT. It was, and it was deleted.** `examinerEye`,
`inCone`, `whatExaminerSees`, `faultVisibility` and `OWN_CAR_READ_AT` are
gone from `sight.js` — the removal is the same one recorded under Known
work in progress, where it left `aim`/`setLooking`/`worldRef` dangling in
the lab and the Examiner screen threw on mount. This section described it
as shipped for far longer than it existed.

So today **visibility is occlusion only**: a fault is markable if nothing
was between the eye and it, whatever the player was attending to. And
`faultSeenAt` returns `"clear"` unconditionally for the ego, so every
fault the CANDIDATE commits is always fully markable — the entire
candidate-observation half of the scoring is currently ungated.

That matters because "you hold a field of view and can only mark what you
actually saw" is the headline mechanic in this file's own description of
the game. The three-visibility-state design below (`clear` / `partial` /
`hidden`, with `away` distinct from `hidden`) is still the right design
and `detect.js` still consumes it — `SEEN_ENOUGH` grades against what was
shown. What is missing is the half that decides where the player was
looking. Rebuilding it is one angular test in front of the occlusion
`visibility()` already does, plus a control on the screen.

**When it is rebuilt, gaze must be relative to the car's heading, never
absolute.** `route.js` rotates a scenario a quarter turn to reuse it from
another approach, and the whole reason that is safe is that a rotated
scene is an identical situation pointing a different way. A gaze held in
world degrees would break exactly that — the same drive would need a
different look from each approach.

**And reading the candidate's own car is a different act from spotting
anyone else's.** The examiner sits IN that car, about a metre from its
centre, so the bearing to it is meaningless: every fault it commits would
read as 90 degrees off to the side, and the candidate-observation half
would score zero. Whatever replaces `faultVisibility` has to judge the ego
against the road ahead of its own bonnet, with no occlusion, since nothing
can hide your own car.

### Detection: grading the examiner — built

`src/engine/detect.js`. The fourth scoring shape, and none of the three
existing ones can express it: `deadline` asks "had you done it by when",
`window` asks "not before when", merging asks "how soon did you start".
This asks which of the things that actually happened you caught, what you
invented, and whether you were watching at the time. Precision and recall
with a clock on it.

Three rules carry it:

- **A fault you could not see is not one you missed.** Recall counts only
  faults genuinely observable — `SEEN_ENOUGH` of them, given where the
  player was really looking. A drive where nothing was visible is a clean
  sheet, not a failure. Without this the game punishes players for its own
  geometry.
- **Inventing a fault costs** (`FALSE_COST`), or the dominant strategy is
  to mark constantly. Measured: spraying 40 marks scores 0 against a real
  drive's 100, and precision drops to 0.075. One fault pays once — repeat
  marks on it are recorded as invented.
- **Prompt beats late beats silent.** Full credit while the fault is
  happening, easing to `LATE_CREDIT` by the end of `CALL_GRACE`, because
  noticing on the way out of an intersection is still noticing.

**Whether a mark carries a category is deliberately left open**, because
it is the maintainer's call whether a player picks one one-thumbed
mid-drive. Pass `what` and it is scored as a categorised call — naming the
wrong fault is an invented call, not a free hit; omit it and only the
timing is graded. Both are verified.

`verify-detect.mjs` is property-based rather than a restatement of the
formula: marking everything must lose, marking nothing must lose, catching
more must never score worse, and an unseen fault must never count against
you. Those would have to hold of any correct implementation.

### Belief: where you think the traffic is — built

Sight answers "can I see it now". `src/engine/belief.js` answers the
examiner-ish question: what do I still think is true about a car I looked
at four seconds ago? Look at a car and you learn where it is; look away
and you carry on believing it is doing the normal thing, vaguer the longer
you leave it; look back and you find out.

**The prediction is "they carry on driving properly", not dead
reckoning.** A straight-line extrapolation would have every turning car
read as a deviation, including impeccably driven ones, and the mechanic
would be noise. What an observer expects is competence. So the prediction
rides `cleanPose`, and the payoff is the property that makes it worth
having: **belief and reality diverge exactly where a driver is doing
something wrong.** Looking away from good driving costs nothing —
measured at 0 m across every clean driver in the set, including 7 clean
turning cars. 3 of 23 road users would betray a stale belief, so a
deviation means something rather than being a tax on looking away.

**`cleanPose` is NOT `basePose`, and assuming otherwise cost four traits
their entire contribution.** `poseAt` is `basePose` plus the traits that
bend a pose (`wander`, `creep`), so `basePose` is clean of those — but the
traits that rewrite a parameter (`overshoot`, `slowStart`, `wideTurn`,
`cutsCorner`) write `stopBias`/`turnBias`/`startDelay`, which `movementOf`
and `schedule` then read, so `basePose` already CONTAINS their fault.
Predicting from it hands the observer oracle knowledge of the very faults
they are supposed to catch: all four measured a belief error of exactly
zero until this was found. `cleanPose` in `index.js` rebuilds a trait-free
twin, and `startDelay` needs winding back by hand because `schedule()`
spends it into `departAt` rather than leaving it for `movementOf`.

The offset is **carried, not snapped**: the prediction keeps whatever
error the car had when you last looked, so a glance never teleports it and
a car has to CHANGE what it is doing wrong to fool you. `lateSignal`
correctly produces no belief error at all — it bends no path, so it is
something you had to have been watching.

### The camera rides with the candidate — built

`chaseFor` in `frame.js`: the view is centred on the candidate's car and
turns alongside it, so the candidate's straight-ahead always draws upward.
That is what makes the examiner's gaze — already held in degrees off the
car's heading — land on a fixed screen direction, and it is the reason
relative gaze was the right call in `sight.js`.

**It follows the INTENDED pose, not the actual one, and that is the whole
design rather than an implementation detail.** Lock the camera to
`poseAt()` — where the car really is — and the car sits dead centre and
perfectly straight forever while the WORLD wobbles around it. Every
steering fault the game exists to catch would vanish at exactly the moment
it happened: a wandering driver would read as a wandering camera, a wide
turn as the road sliding sideways.

So the camera rides `basePose()`, the same trait-free control
`faults.js` diffs against. The car is drawn at its real pose and visibly
deviates from the centre of frame; that deviation IS the fault, exposed as
`drift` for a renderer that wants to say so out loud. One idea read two
ways. It also kills the wobble for free — `wander` turns the heading ±6°
several times a scenario, and `basePose` has no twitch in it.

**The view is sized as a DURATION of road ahead, not a distance.** A
distance is wrong at one speed or the other; ten seconds is the same
judgment at any speed, and it is roughly how far ahead a driver is
actually thinking. `LOOK_AHEAD` is 10s, read against the leg's own motion
profile — its cruise or top speed, never the instantaneous one, which
would collapse the view to nothing at a stop line and heave it open again
on the pull-away. The car sits low in the frame (a quarter of the forward
reach behind it) so the road ahead gets the space.

At 10s that is 72m on `gap` and 115m on a 41 km/h straight, and **it is
almost certainly too wide to read a fault by** — the candidate is a few
pixels on a phone. Around 4s (29m) reads well and 10s reads as
anticipation. That tension is real and not yet resolved: the examiner
needs both, and the answer is probably not one fixed number. The Examiner
lab has it on a slider for exactly this reason.

**A chase view sweeps far more world, in two ways.** It travels with the
car, and it rotates — so the corners of a square viewport swing out to the
half-DIAGONAL, not the half-width. `worldHalfFor(spec, sim, camera,
{ chase: true })` pays for both, measured off the car's own path. Same
failure mode as the ambulance in the void: whatever the camera can reveal
has to have been drawn. On `gap` the world goes from 360 to 951.

Playable in the **Examiner lab** (`src/apps/ExaminerLab.jsx`, `#/examiner`,
second entry in the mode switcher): the chase camera, the gaze cone, every
derived fault with its live visibility, and the stacking meter, all on one
canvas with the knobs exposed. It is a bench, not a game — it scores
nothing, and when there is a real examiner renderer it is scaffolding and
should go.

### The drive — the first playable loop

`src/apps/ExaminerDrive.jsx`, `#/drive`. Six intersections, one candidate, and
three of the four jobs running together: watch, mark, direct. Intervention
is absent because what an intervention IS remains the maintainer's call.

**Marking is DEFERRED to a sheet at the end of each section**, which is
what makes the job memory as well as attention — you cannot mark the
instant you see. `sectionSheet` in `detect.js` is that sheet, and it lives
in the engine rather than the component so it can be checked at all: a
React component is the one place nothing else in this suite can reach.

**A leg starts as early as its own instruction needs, and no constant can
do that job.** Measured over 48 generated intersections the instruction
deadline runs from 4.50s BEFORE the candidate reaches the line to 8.20s
after, because it is derived from what the manoeuvre demands rather than
from the intersection. A fixed 3.5s run-in left 15 of those 48 undirectable;
6.0s made every other intersection a wait. `runInFor(sim, { floor })` in
`directions.js` gives each leg its own, floored at the candidate's own
approach so the player always sees them arriving. The shipped drive spans
1.0s to 9.9s of decision time as a result.

**In the rebuild the trade is live**: `underLoad` in `src/sim/traffic.js`
reads what a candidate is carrying every tick and amplifies the deficit
on each axis by the same curve, bounded by what bounded it unloaded.
DECISIONS.md 5.16.1. The paragraph below is the old drive's history.

**The stacking trade shipped INERT, and that is worth remembering.** The
direction buttons wrote `given[at]` — the intersection being driven — while
`held` counts instructions outstanding for intersections BEYOND it. So `held`
was zero by construction: no pressure, no composure cost, and the
`"stacked"` verdict could never fire. The one mechanic the screen exists
to evaluate was the one it could not perform, and every check passed
because every check was aimed at the engine underneath it.

Two things came out of fixing it. **Stacking only exists at a distance of
two** — an instruction for the very next intersection is discharged the moment
they arrive, so it never makes them CARRY anything — which is why `AHEAD`
offers this intersection, the next, and the one after. And **load is frozen
when a leg begins** rather than read per frame: live, it would re-simulate
the intersection underneath the candidate the instant you spoke and the car
would jump. The cost lands on the driving done while holding it.

Measured through the same derivation the examiner marks: 0 / 0 / 1
instructions in the air at call-distances 0, 1 and 2, and at that load
every fault-carrying intersection widens — 1.14x the deviation at 34%
pressure. Checked in `verify-detect.mjs` §10.

**A frame delta is clamped at BOTH ends.** The ceiling is the familiar
one — a backgrounded tab must not teleport the candidate through a
intersection on the first frame back. The floor is not, and it was observed
rather than theorised: the baseline is taken from `performance.now()`
while the tick reads rAF's own frame timestamp, and a stale frame after a
stall made those disagree by **8.96 seconds**, running the clock backwards
to before the leg began. A negative delta is now zero.

**Grade against the deadline the player was SHOWN.** Stacking writes
`skill`, `skill` scales `startDelay`, `startDelay` moves `departAt`, and
the deadline is derived from `departAt` — so a window recomputed at
section close is not the one they were racing. The component records the
window it displayed and the sheet reads that.

### Directions — built

**A set course is a route.** `route.js` already sequences intersections and
keeps continuity, and the instruction to give at each intersection is simply that
leg's `ego.intent`. `exitHeading` and `entrySideAfter` already derive where the
candidate ends up **from their actual intent**, which is exactly what going
off course needs.

Three rules make this the system that ties the other three together:

- **Silence means straight on.** A candidate told nothing carries on ahead. So
  a late instruction is a missed turn, not a pause.
- **An instruction has a deadline, not a window.** It must be given in time to
  be followed. That is the `deadline` shape `actions.js` already implements —
  no new scoring shape needed for this one.
- **A late instruction is the examiner's fault, not the candidate's.** This is
  real practice and it is the interlock the whole design rests on: being busy
  marking a fault makes you late with a direction, and the resulting error is
  then yours and unmarkable. The four systems have to be able to make each
  other fail, or they are four scoreboards rather than one game.

### Driver identity — built

**One candidate, composed once, driving the whole route.** `candidate.js`
holds them; `egoFor` is the one place a scene gets its driver, so an intersection
and a segment ask for the same person. Before this the candidate was not
merely inconsistent, they were FLAWLESS: measured over 320 generated
intersections, the ego carried no traits at all and committed none of the 143
faults on offer, while segments took whatever traits their caller felt like
handing them. The route's turn survived into the composed intersection 9 times
in 120 — about what chance gives — so the examiner was directing a manoeuvre
the candidate was never making. It is 56/56 now, because a draw whose road
lacks the leg the route asked for is refused rather than quietly re-seated.

**The trait model already expressed a habit; the WORLD did not.** Nothing
about a driver trait was per-scenario — it lives on the participant and
`schedule()` applies it to everyone. So no third word was introduced: a
trait is the disposition, a SHOWING is one occasion it visibly expressed,
and a habit is a trait with several showings — a derived property of a
drive, not a field on anybody, which is what makes it checkable.

**A habit that manifests once is an incident.** For a player to identify a
tendency they must form a hypothesis and then test it, so
`SHOWINGS_FOR_A_HABIT` is 3 and it is measured, never tuned to fit. And the
testing half needs no separate machinery: a left turn is where `cutsCorner`
would show, so a left turn where nothing happens is evidence AGAINST it.
Measured per drive: 24 of 25 carried traits identifiable, and 82 rival
habits given three or more chances they visibly declined.

**Where a habit can show is DERIVED, never tabulated.** `chancesAt(shape)`
builds the smallest scene with that shape and asks `faultsIn` — a cheaper
call to the same oracle, not a second oracle. Writing "cutsCorner needs a
left" down would author the answer and go stale the first time a trait
changed. It also caught what a table would have frozen in: `creep` reads as
inert everywhere until the candidate has something to actually be HELD by.

**Recurrence is the accept/reject loop narrowed, not a new mechanism.**
`mustShow` is `mustFault` asking for THIS driver's habit rather than
anybody's fault; it subsumes it, shares the one expensive `faultsIn` call,
and sits where every other guarantee in `compose.js` lives. The fallback
ladder gains one rung at the top so a habit with nothing to say here cannot
cost the player an intersection. The planner steers WHICH turn, never whether to
turn — a route still has to read like a route. Persistence alone was most of
the win (20/25); asking and steering are the finishing 4.

**Two habits that cannot both be true are refused, derived the same way.**
`wideTurn` and `cutsCorner` both write `turnBias`, so a driver fitted with
both had one silently overwritten and it derived no fault at all — measured,
`wideTurn` took 0 showings from 5 chances. A pair is incompatible when
fitting both hides either, which is the same controlled comparison asked of
two traits instead of one, so a new trait that writes over an old one is
caught on its first draw.

**A tell must be true of the car on a road with no line, too.** `overshoot`
and `slowStart` write `stopBias`/`startDelay`, and `stopBias` shifts the
origin of the traverse whether or not anyone braked — so on a segment a
candidate produced 3.8s of markable fault whose tell said they had stopped
past a line that was not there. Both are now guarded on `p.stops`, the same
rule `cutsCorner` already lived under. It removed real supply and the supply
was false: 17 non-stopping actors in 114 composed scenes were carrying one.

### A driver is four ratings, and traits are what they compile to

**CONFIDENCE, STEERING, BRAKING, KNOWLEDGE** (`ratings.js`). A rating is a
standing disposition by construction, so identity stops being bolted onto
the scenario model and becomes the model — and habits emerge instead of
being scripted, because a weak axis produces the same kind of error again
and again across situations that look nothing alike.

**Traits are not deleted, they are COMPILED.** The roll resolves once, at
composition time, from the scenario's own seed, and its output is the same
trait list a participant always carried — so `schedule`, `poseAt` and
`faultWindow`'s controlled comparison are untouched, and ground truth
stays deterministic and replayable. A candidate carrying `traits` instead
of `ratings` keeps them verbatim, which is why every hand-authored
scenario and the golden are unmoved. Never resolve the roll at simulation
or render time: there would be no discrete thing to strip, no control to
diff against, and only `POS_VISIBLE`/`MIN_DURATION` separating a fault
from numerical noise.

**Confidence is two-tailed; the other three are monotonic.** Too little
gives hesitation and refused gaps, too much gives tight gaps and skipped
observation, and there is no such thing as steering too well. So
confidence is held as a POSITION with an optimum and measured as deviation
from it. Two candidates can then fail in opposite directions on one axis,
which no monotonic rating can express.

**`CAUSES` is the one table this project authors on purpose.** Attribution
is weighted and multi-axis — `cutsCorner` is the maintainer's ruling,
"a steering error combined with a knowledge error" — because measured
across the set only `wander` and `wideTurn` belong unambiguously to one
axis. Everywhere else the answer is derived, but "why did that driver do
that" is not recoverable from geometry at any price: it is a claim about
people, so it is data and it is the maintainer's. The same weights are
read in both directions, generation and attribution, because two tables
would drift the first time either was tuned.

**An axis is only readable through errors it DOMINATES.** Entangled
evidence does not accumulate into an inference. Measured: knowledge has
19.1s of evidence per drive of which only 4.8s is dominant, so it speaks
constantly through cut corners and overshoots and can never be heard on
its own. Braking and knowledge each dominate ONE kind of error, and
confidence has no risky-tail error at all — three measured content gaps,
reported by `verify-candidate.mjs` rather than left as a worry, and they
are what R2 exists to fill.

**Error FREQUENCY is not readable and must never be made so.** `briefFor`
swings the fault rate between 0.15 and 0.9 on dead air, so frequency
carries the pacing budget's signal, not the driver's. Pacing owns how many
opportunities a drive presents; the ratings own whether this driver takes
them, and the dead-air floor is backstopped by other road users through
`mustFault`. A player reads WHICH axis fails and how bad each instance is,
never how often.

### Encroachment is measured in seconds, and the bands are derived

**The standard is intrusion on entitled space, NOT forced evasive action.**
The maintainer's ruling, and stricter than collision avoidance on purpose:
turning within a fraction of a second in front of somebody is a failure to
yield whether or not they had to brake. So **a fault exists independently
of any reaction**, and `clearance.js` imports nothing that could react —
checked at source level, because defining the fault in terms of a response
would mean a scene where nobody happened to react silently contained no
fault.

**Time, not distance** — a gap in metres means nothing without closing
speed. The quantity is post-encroachment time: how much time separates the
candidate's occupancy of a piece of road from the entitled driver's. It is
what "turning within .3 seconds in front of someone" measures, and it
degenerates to ordinary following headway when the candidate turns INTO a
lane rather than across it, so one measure covers both.

**The worst of it over the manoeuvre, never the value at one instant.**
The candidate accelerates away and the gap recovers — measured, in 18 of
18 conflicts — so a single reading understates the fault by exactly that
recovery.

**The bands are NOT invented and NOT a real-world number transplanted.** A
driver is taught 2-3 seconds and this game's pace does not allow it. But
`forwardClaim` has granted every moving vehicle `LOOKAHEAD` seconds of
road ahead since it was written, and `legalAt` refuses to let anybody into
that space — so the entitled gap was already stated, already in seconds,
already shipped. `ENTITLED === LOOKAHEAD` is asserted, so changing
`LOOKAHEAD` moves the bands with it rather than leaving a second opinion
behind. Real driving's 2:1 split (encroached below 2.0s, inside the other
driver's reaction envelope below 1.0s) is preserved at 0.9 : 0.45.
Cross-checked against the game's own behaviour: 95% of legal departures
measure comfortable, and the one situation authored to be tight — `gap` —
measures tight at 0.70s.

**Contact stays the engine's own collision predicate**, not a PET that
rounded to zero, so the terminal outcome is exactly where it always was.

**An encroachment is a fault in `faultsIn`, and it has NO TRAIT.** It is
not a habit — it is what the candidate did with the gap — so it carries
`trait: null` and a `band`, and anything reasoning by removing a cause has
to skip it (`isTraitFault`). Folding it in cost pacing nothing: dead air,
events per drive and the count over the ceiling are all unmoved, and it
adds 0.17 encroachments per drive. That was thin, and it was the same
thinness measured everywhere else — a generated intersection is open, and
`windowIsSafe` rejected draws whose window landed on somebody, so the
supply was rare by construction. **That gate is no longer the default**
and the supply is 0.70 per drive; see the ruling above. On hand-authored
situations it fires reliably: `gap` carries one at 0.70s driven exactly
as written.

**A clean candidate can still be marked, and that is correct.** Folding
encroachment in broke "a clean driver commits nothing" in 3 of 59 scenes,
and the failure was worth having: a situation authored to be tight hands
an encroachment to whoever drives it. The property is now what it was
always about — a clean candidate contributes no habit OF THEIR OWN — and
the situational residual is reported rather than swallowed.

**The mild band's observable is the gap itself**, because there is no
reaction to notice — which makes the hardest faults to spot the least
severe ones, correctly. Measured legible: the bands are 22 px apart at the
10s look-ahead and 56 px at 4s, which is about one car length either way.
That is how a driver judges it anyway, and it is a second independent
argument for the shorter look-ahead.

### The fault vocabulary is written against measured gaps

**R2.5 added `rollingStop`, `noSignal` and `stopsShort`, and each answers a
measurement rather than being a plausible driving error somebody thought
of.** Knowledge dominated one fault and braking one, so neither axis could
be isolated by a player; and the rolling stop owned 100% of the residual
collisions the reaction layer could not prevent, which is why caution was
deliberately left untuned rather than dialled up to absorb a fault
belonging elsewhere. The floor is now met: steering 3, knowledge 3,
braking 2, confidence 2.

### The three-way stop split — built, and both discriminators are derived

    registered the control, stopped smoothly, wrong place -> KNOWLEDGE
    registered the control, stopped abruptly              -> BRAKING
    did not register the control in time                  -> OBSERVATION

**No rule table, because both discriminators are quantities the model
already holds.** The registration delay that separates observation from
confidence for an encroachment does the same work here, and the approach
rewrite supplies the second: the manner of a stop is a number now
(`approachDecelOf`). `ABRUPT_AT` is twice the comfortable rate the
approach geometry derives — 5.40 m/s^2 — so an ordinary stop is
controlled by construction and anything at double it is unmistakably not.

**BRAKING IS BACK ABOVE THE FLOOR**, with `harshStop` (abrupt, right
position) and `brakesTooLate` (abrupt and into the box). Both are manner
faults, which is what makes them braking where `overshoot` and
`stopsShort` are knowledge.

**And how much time the candidate had to read the sign matters, without
anybody coding it.** Measured: a poor observer misses the control 98% of
the time with 1.0s to the line and 30% with 2.4s, while a perfect observer
never misses it at any distance. That falls out of the registration delay
meeting a shorter approach.

**LATE AND MISPLACED STOPS ARE TWO DIFFERENT FAULTS, and the
discriminator is the MANNER of the stop rather than its position.**
Maintainer's ruling. A CONTROLLED stop in the wrong place is a KNOWLEDGE
gap — not knowing where to stop, or why the stopping point matters. An
ABRUPT or uncontrolled stop, before or after the line, is BRAKING
control, or an OBSERVATION failure if the driver did not register the
controls in time. Same observable position, three causes, and the
discriminator is a physical quantity rather than a label.

**And a rolling stop is a knowledge fault essentially always**: "a
particularly poorly skilled driver would have to be completely unable to
make their stop due to lack of control to make this anything other than a
failure to obey traffic law." Weighted 0.9 knowledge, 0.1 control.

**Applying that ruling took BRAKING from 2 dominant kinds to 0**, because
`overshoot` and `stopsShort` move the resting point and leave the manner
alone, so both are the controlled case and both are knowledge. It was
reported rather than argued away, and it came back the moment the approach
rewrite made an abrupt stop expressible. Attribution getting more accurate
is allowed to cost an axis its content for as long as it takes to write
the content properly.

**OBSERVATION is exempt from the trait floor, and that is the point.** It
does not express through a trait at all — it degrades what the candidate
registers, and its faults surface as an ENCROACHMENT that `causeOf`
attributes to it. Counting trait kinds is the wrong instrument for that
axis.

**STALE CLAIM CORRECTED, and the correction matters more than the claim
did.** This used to read "every encroachment on a generated drive
attributes to observation". Re-measured over 25 drives, every one of them
attributes to **`unsighted`**, which is NOT the same thing and must never
be counted as it: `causeOf` returns `unsighted` when the road user was
genuinely not in view when the candidate committed -- the scenario's
doing -- and `observation` only when they were in view and the candidate
registered them too late, which is the driver's failing.

Folding the two together would clear the attributability floor on paper
while destroying the asymmetry the whole five-axis structure rests on:
occlusion is PERCEPTIBLE and caution can compensate for it, inattention is
not and nothing can. See DECISIONS.md 4.4. Leave them separate and leave
the floor unmet until real content meets it.

**A rolling stop is modelled as a car that never comes to rest**, not as
one that leaves early. It holds its crawl through the approach where a
clean twin decelerates, and carries speed through the line — so the tell
is an ABSENCE (no deceleration) and it is visible both before the line and
after it. It only shows where the candidate did not have to wait anyway:
held by traffic, they stop like everybody else, which is correct.

**The incompatibilities came out derived on first contact**:
`overshoot+stopsShort`, `cutsCorner+wideTurn`, and — nobody wrote this one
down — `lateSignal+noSignal`. You cannot signal late if you never
signalled.

**ONE ROLL PER AXIS, NEVER ONE PER FAULT KIND.** Rolling each available
kind independently made the number of faults a candidate commits a
function of how many kinds the game has vocabulary for: 1.11 per intersection
at seven kinds, 1.57 at ten, 2.0 at twelve — which took the section
implied by a 3-4 recall band down to 1.5 intersections, which is not a
section. The fix was not a smaller `ERROR_SCALE`. A driver's deficit
decides HOW MUCH they err and the vocabulary decides WHICH WAY, so the
roll is per axis they could fail on here and the kind is drawn from that
axis weighted. Density is a property of the driver again, it holds still
as R2 keeps adding content, and "variety over volume" falls out by
construction: at most one fault per axis per intersection, so two weaknesses
show at most two things and they are two DIFFERENT things. Measured after:
1.00 per intersection, 2.13 axes per drive, section 3.0-4.0 intersections.

**Identification has saturated, and the levers now earn their place
elsewhere.** Persistence alone reaches 24/25 identifiable, so `mustShow`
and the planner's turn-steering add nothing there. They still add to
DISCONFIRMATION — 149 rivals ruled out becomes 160 — which is the half
that lets a player test a hypothesis rather than only form one. If that
stops being true too, they should be removed rather than kept as
decoration, and `verify-candidate.mjs` asserts the combined picture so
that it would show.

### Three layers, and OBSERVATION as the fifth axis — built

**What happened is layer 1. What the CANDIDATE perceived is layer 2. What
the PLAYER noticed is layer 3.** The FAULT lives in the gap between 1 and
2; the SCORE lives in the gap between 1 and 3. `awareness.js` is layer 2.

The original view cone was the right idea attached to the wrong party. A
poor driver's defining characteristic is not perceiving the traffic around
them, so putting the cone on the player asked the PLAYER to be the bad
driver.

**OBSERVATION is not a peer of the other four axes.** They govern what the
candidate DOES with what they perceived; it governs what they perceived at
all — concretely, it is the parameter that degrades `whatEgoSees` down to
what this driver registered. Different layer, so it does not compete to
explain the same fault.

**Observation is whether they GATHERED the information; confidence is what
they did with it, or without it.** With layer 2 modelled this stops being
an attribution weight and becomes a fact the model holds: a tight gap
taken having registered the vehicle is confidence, the same gap taken
without registering it is observation. Measured on identical encroachments
— same scene, same departure, same band — so only the cause differs.

**NEVER score observation by outcome.** The moment "didn't see the van" is
graded by whether contact occurred it collapses back into confidence.
Enforced structurally: `awareness.js` does not import `clearance.js`, and
`causeOf` is checked at source level for any reference to contact or band.
The registration span was calibrated on the MISS RATE and deliberately not
on the contact rate, for the same reason.

**One registration delay per road user, resolved at composition time from
the seed** — the same rule fault occurrence lives under. A per-frame roll
would resolve at simulation time and ground truth would move between runs.
The floor is `REACTION_FLOOR`: nobody registers faster than they can
react, and a perfect observer takes exactly that with no jitter, because
consistency is what being good at this means.

**`REGISTER_SPAN` is derived twice over.** It is the p25 of the measured
lead time from a road user becoming clear to the decision (0.50s min,
1.60s p25, 3.75s median across 93 road users), and independently it is
where drawn drivers miss a mean of 5% of visible traffic and the worst
miss 16% — enough to be a habit, not enough to be a hazard.

**`pose.hidden` conflates occluded with not-yet-on-stage, and they are
different facts.** Only the first is perceptual; the second is the board
being finite. Conflating them made a candidate rated 1.0 on observation
blind to traffic nobody could miss. Measured afterwards: the distinction
fires only for PEDESTRIANS, because a vehicle is already approaching from
t=0 — but for them it is real, and before it a candidate simply ignored a
pedestrian who had not yet stepped off the curb.

### The margin you leave for what you cannot see IS confidence

**Departing the instant your KNOWN set is clear is not neutral behaviour.**
It is a driver with no humility about their own perception — so the margin
a driver leaves for traffic they have not accounted for is overconfidence,
expressed as a standing disposition rather than a dice roll. That gives
the risky tail its markable, non-terminal expression: an overconfident
driver takes gaps sized only to what they registered, so they are
routinely tight and occasionally unlucky rather than simply crashing.
`cautionOf` is the whole of confidence in one number — 1 at the optimum,
0 maximally bold, 2 maximally timid.

**THE ASYMMETRY THAT JUSTIFIES THE WHOLE AXIS STRUCTURE.** Occlusion is
PERCEPTIBLE, so caution can compensate for it: you can see that you cannot
see past the van, and wait. Inattention is INVISIBLE FROM THE INSIDE, so
nothing can compensate for it: you do not know you failed to look, and no
amount of care will make you account for a car you never registered.

That is why observation and confidence are two axes rather than two names
for one thing, and it generalises — an axis earns its place when it fails
in a way the others cannot reach. It was not designed in. It arrived as a
FAILED derivation: an attempt to set the caution allowance from the gap
between what a driver knew to be clear and what actually was gave a spread
of 2.8s to 40.2s, because where little is hidden the shortfall is
inattention and the ratio explodes. Forcing a constant out of that would
have buried the finding. Checked directly: with nothing hidden the margin
is zero whatever the confidence.

**The allowance is the candidate's own crossing time, derived per
scenario.** The way to be sure an unseen stretch is empty is to watch it
for as long as anything hiding there would take to reach you — the same
duration you need to be clear of the box before it arrives. One quantity
doing both jobs. 5.05s straight, 5.90s left, 7.65s roundabout, nothing
typed in.

**Three recognisably different drivers from two axes**, measured: a poor
observer who is careful is hesitant but safer, a good observer who is bold
is fast and mostly fine, and the dangerous candidate is both blind and
bold. And the timid tail shares the mechanism rather than having one
bolted on — `slowStart` and `creep` were already registered as
confidence's timid side, so the axis is two-tailed in both of its
expressions.

**A residual belongs to whichever axis actually caused it.** The contacts
caution could not remove turned out to be 100% zero-dwell departures for
the bold-and-blind extreme — the candidate reaching the line and leaving
in the same instant. That is a ROLLING STOP, a knowledge fault, and R2.5's
business. Caution cannot fix it and must not be tuned until it appears to.

### The world gives way, and that is the observable rather than the fault

**A road user with priority brakes for a candidate who took their space,
and THAT is what the player is looking for.** Harder to spot than a
collision, which is correct, and it rewards watching the whole scene.

**The reaction never decides whether a fault happened.** Encroachment is
marked on what the candidate did, against road users holding the line they
planned; `clearance.js` imports nothing from `reaction.js` and never will,
checked at source. The reason is measured rather than asserted: marking on
the REACTED world would soften 63% of faults, so a driver who forces
somebody to stand on the brakes would score BETTER for it. Two derived
worlds — what the candidate did, which is marked, and what then happened,
which is drawn and decides whether anybody was hit.

**Derived, not scripted: the least giving way that avoids the collision**,
found by search, so how hard somebody braked measures how bad the
intrusion was. The parameter is HOW HARD THEY BRAKE over a fixed ramp, not
how much time they give up — the first version stretched the ramp to fit
the time and was therefore NON-MONOTONE in its own parameter, so a bigger
sacrifice braked more gently and lagged less exactly when it mattered.
A search cannot bisect that. Giving way also has to include STOPPING:
slowing alone buys about three seconds, and 30 of 33 residual collisions
could not be avoided by any amount of it.

**Round a bisection away from the thing it is avoiding.** Rounding to
three places moved the answer ten times further than the search's own
precision and put it back on the colliding side — the search said
"avoided" and the world hit anyway in 13% of scenes.

**`departOverride` in `schedule()` is how a driver acts on their own
decision.** A replacement rather than a floor, because the point is that a
driver who has not registered the traffic goes EARLY. Wiring it changed
pacing and supply by nothing at all — a drawn candidate observes well
enough that their decision coincides with the engine's — which makes the
wiring safe and the content thin: 2 encroachments in 112 intersections.

**Pedestrians give way by hesitating**, which the same yielding profile
expresses: they hold at the curb or stop where they are. That earns
pedestrian conflicts the graduated near-miss band vehicles have, instead
of being all-or-nothing terminal — before it, every contact on a generated
drive was with a pedestrian and every one ended the drive.

**`heedless` keeps the hazard authorable.** A child after a ball, somebody
on a phone. Reacting is the default because most people do, but a
pedestrian who does not look is exactly the hazard the game wants and it
stays a content decision rather than the engine deciding for everybody.
Measured: the same departure is a near miss against an attentive
pedestrian and a collision against a heedless one.

### A candidate has a CHARACTER, and the target is the player's experience

**There is an optimum number of faults, not a direction.** Too few and
there is nothing to find; too many and ticking everything becomes
rational, which destroys the false-positive penalty that makes the sheet
mean anything. And because marking is DEFERRED, a section with fifteen
faults is not harder in an interesting way, it is a memory test.

So the quantity is **faults per section a competent player could catch and
recall** — free recall runs out at about four items, so the band is 3-4 —
and SECTION LENGTH IS DERIVED FROM IT rather than chosen. At the measured
1.11 candidate faults per intersection that puts a section at **2.7-3.6
intersections**. Cross-checked against `SHOWINGS_FOR_A_HABIT` = 3, derived
independently: a section inside recall, several per drive, lets a habit
accumulate its evidence without any one section overflowing.

**Variety over volume.** Three faults across three axes beat six from one,
because the player is assembling a picture of a person rather than
counting incidents. So the distribution draws a PROFILE — weak on one or
two axes, sound on the rest — instead of sampling each axis
independently, which produced drivers slightly bad at everything and
identifiable as nothing. Measured: 2.38 distinct axes show per drive, and
100% of a candidate's non-weak axes carry little deficit.

**The cost of characters is quieter worst cases, and it is not absorbed.**
Same seeds, only the distribution changed: median dead air 22.3s -> 20.9s
and drives over the ceiling 9/24 -> 6/24, but the WORST drive went 35.7s
-> 39.7s. A candidate weak only on knowledge, on a route that does not
test it, gives you less than a driver who was mildly poor at everything —
which is the flatter floor the old distribution bought and the ruling
asked to stop buying.

**Creep is the CANDIDATE's, not the player's.** It was a player input in
the driver game — edge forward to see past the van — and feeding a player
input into the candidate's awareness would be exactly the contamination
the three-layer split exists to prevent.

Design, findings and the debrief roadmap: `DRIVER-IDENTITY.md`. The
three-layer reframing, the five axes and R2's build order:
`R2-DESIGN.md`.

### Still open — and three of these are the maintainer's

- **Does going off course end the drive, or do you re-route?** Real tests
  re-route. Re-routing needs `planRoute` to replan from the actual exit
  heading rather than plan the whole course up front.
- **What is an intervention, in law and on the sheet?** An examiner taking
  control is itself a recorded outcome. Automatic fail for the candidate? Is
  failing to intervene a fail for the player? **This is the blocking
  question now**, not a distant one: the mechanical prerequisite is
  measured and met (see the warning-time entry below), and the accept test
  refuses contact solely because a collision is a state the game cannot
  respond to.
- **The candidate's observations are not modelled at all.** No head, no
  mirrors, no eyes for anyone — the engine knows where cars are, not where
  drivers are looking. A large share of what a real examiner marks is whether
  the candidate *looked*. This is the biggest gap in the whole design and it
  is new modelling, not reuse.

  **In the rebuild the first piece is built and measured**: a candidate
  can perceive the world a lag behind (`seenBy` in `src/sim/crossing.js`,
  the old engine's registration delay as a live input). It is OFF by
  default because the bold candidate, lagged, rear-ends the car ahead on
  the crossing -- a contact nothing can yet respond to -- and it switches
  on when contact ends a drive. DECISIONS.md 5.16.2.
- **Intervention cannot be triggered by the conflict, but the candidate's
  own driving gives ample warning.** Measured across ten situations,
  warning from first conflict to contact is min 0.45s, median 1.10s, max
  2.30s, against a 0.35s floor for noticing anything at all. That is a
  reflex test, so the cue has to be the candidate's behaviour beforehand.

  **It is, and it clears the bar with room to spare.** Over 60 generated
  drives and 360 intersections carrying 45 encroachments worse than
  comfortable:

  | cue | warning before the event |
  |---|---|
  | the conflict itself | 0.45s min, **1.10s median**, 2.30s max |
  | a prior derived fault by the candidate | 1.80s min, **6.30s median**, 10.10s max |

  56% of encroachments are preceded by a fault the candidate visibly
  committed earlier in the same intersection, and 96% of those give more
  warning than the conflict EVER gives at its best. The median is 5.7x.
  The cues are ordinary and varied -- `wander` 9, `harshStop` 4,
  `wideTurn` 3, `creep` 3, `overshoot` 3, `stopsShort` 3 -- so this is not
  one trait doing all the work.

  Note what the cue is NOT: it does not say which conflict is coming. It
  says this candidate is not on top of it right now, which is how a real
  examiner's hand ends up near the wheel. The uncued 44% is the honest
  half -- a tight intersection where the candidate did nothing else wrong,
  and nobody could have known.

  **`departureOnAwareness` is deliberately still a query rather than
  wired into `schedule()`**, so observation has no behavioural
  consequence in a composed drive yet. Every cue above is a trait fault.
  Wiring it would add a second, earlier class of cue.

  What is still open is the domain half, above: what an intervention IS
  on the sheet. That question is now on the critical path rather than
  beside it -- contact is the largest untapped supply the generator has
  (0.88 encroachments per drive with no gate at all against 0.70), and
  `windowIsMarkable` refuses it only because the game has no answer to a
  collision yet.
- **Content.** 4 of 18 situations carry any driver trait; 6 instances in the
  whole set. `generate.js` attaches one to 45% of actors from a deliberately
  narrower five-trait pool (it predates `wideTurn` and `cutsCorner`);
  `compose.js` attaches from all seven, and the CANDIDATE now carries the
  drive's own persisting traits rather than none at all.
- **A tile's declared road and the composed intersection's road disagree.**
  `world.js` lays out spacing, runway, links and roadside content from
  `specFor(tile.character)`, and `compose`'s `roadFor` then draws its own
  intersection kind and ignores it — measured, 15 of 56 match, and 0 of 13 for
  arterial tiles. Latent rather than live, since no renderer consumes the
  world yet, but real the moment one draws a drive. Fixing it means first
  deciding whether a three-lane arterial intersection is uncontrolled (as
  `CHARACTER.arterial.control` says today, which would leave the candidate
  stopping at nothing) or signalised — a road-design call, not a mechanical
  one. See `DRIVER-IDENTITY.md` §6.
- ~~**An APPROACH has no braking physics.**~~ **FIXED.** See "An approach
  is deceleration" in the Architecture section. Peak braking across the
  shipped set went from 18.1 m/s^2 (1.84g) to 3.70 (0.38g), and not one
  window moved. The old entry read:

  **Every car in the game stops at 1.84g.** Measured across the set: peak deceleration 18.1 m/s^2 on every
  approach, at every road speed, on every road. Comfortable braking is
  2-3, firm is 5, an emergency stop is about 8. `approachPose` is still a
  smoothstep lerp from a fixed 24.5 m run over a fixed 2.8 s, so approach
  speed does not follow the road either — cars arrive at a residential
  intersection at 47 km/h.

  **This is the same bug the departure side already fixed, on the other
  half of the manoeuvre.** CLAUDE.md's own history records replacing a
  fixed traversal duration with real acceleration; the approach was never
  given the same treatment.

  It blocks the maintainer's manner-based attribution outright: abrupt
  versus controlled is a deceleration comparison, and there is currently
  no controlled stop to compare against. It is also why BRAKING dominates
  no fault kind.

  Encouragingly the geometry is already about right — a comfortable stop
  from 11.5 m/s at 2.5 m/s^2 needs 26.5 m, against `APPROACH_RUN`'s
  24.5 m — so the fix is a real profile rather than new distances. It will
  move the golden for every scenario, exactly as the turn-geometry fix
  did, and it changes when a car is visible and where it is before
  `arriveAt`, so `sightingsIn`, belief and the camera all move with it. Its
  own increment, announced.

- ~~**Intersection controls are not perceivable objects.**~~ **BUILT.**
  `controlsOf` in `road.js` derives a positioned control per controlled leg
  from the same geometry the stop line comes from, origin-aware, and
  reproduces the renderer's old table exactly. A sign uses its DRAWN size,
  because the scorer must never know something the screen did not show.
  And a control is occluded by walls and hedges but NEVER by vehicles: a
  sign on a post is visible over a car, and a flat occlusion model must
  not pretend otherwise. The old entry read:

  **Awareness tracks road users only.** Awareness tracks
  ROAD USERS: `sightingsIn` iterates `sim.actors` and nothing else. A
  control is a string on a leg (`spec.legs[side].control`) with no
  position; the only spatial fact the engine has about one is the stop
  line. The RENDERER places signs from its own hardcoded four-entry table,
  board-relative and pinned to `CX`/`CY` — so it does not follow a
  intersection placed elsewhere in the world, which is the same class of bug
  `exitPoint` had. The signal is worse: one head drawn at one corner
  regardless of which leg it governs.

  This blocks the OBSERVATION branch of the stop-fault split — "did not
  register the control in time". What it takes:

  1. `controlsOf(spec, at)` in `road.js`, returning a positioned control
     per controlled leg, derived the way `stopPoint` already is. The
     renderer then draws from it instead of its own table, which removes
     the duplicate rather than adding a second one.
  2. An extent for a sign, and this needs a ruling: the map symbol is a
     deliberate exaggeration (~1.4 m drawn for a 0.75 m face), and
     occlusion against the drawn size would make signs far too easy to see.
  3. **A rule for elevated objects in a 2D occlusion model.** A sign on a
     post at 2 m is visible OVER a car; the engine's occlusion is flat, so
     a van would hide a stop sign you would really see straight over.
     Probably "signs are occluded by walls, hedges and buildings but not
     by vehicles" — cheap, and physically right. A domain call.

- **THE ROAD BETWEEN INTERSECTIONS IS CONTENT, NOT CONNECTIVE TISSUE.**
  The maintainer's ruling, verbatim: *"the roads between the
  intersections are just as important as the intersections themselves.
  this can't just be dead air the player needs to be engaged at all
  times."* So a route is not a sequence of intersections joined by
  transit — it is a continuous stretch of assessable driving that happens
  to contain intersections. REBUILD.md section 8.

  This contradicts an assumption the whole design has carried. Scenarios are intersections, `route.js` sequences
  intersections, pacing counts intersections, and a link has always been
  the distance between two of them.

  The rebuild put all five axes into a live decision model and then asked
  where each can be READ. **Three of the five express on the APPROACH and
  only confidence needs the box** -- steering (lane-keeping needs motion,
  and a queue at a stop line has none), braking (the whole of it is how
  late they leave it), and pace. Gap acceptance is the one thing the
  intersection is uniquely for. Measured at an all-way stop, where nobody
  judges a gap, a hesitant driver is indistinguishable from a sound one
  while ragged, heavy-footed and unschooled all still read as themselves.

  So link length is a content decision rather than spacing, a course
  needs more than one KIND of place or confidence is mute, and the camera
  has to work on the link as well as at the box. Everything the old
  engine built for segments — parked cars, driveways, emerging vehicles,
  pedestrians — lands here rather than being scenery between the
  interesting parts. DECISIONS.md 5.14.8.

- **TURN GEOMETRY IN `src/sim/` HAS TWO OPEN PROBLEMS AND ONE FIXED BUG,
  and two of the three are the maintainer's.**

  **FIXED:** every turning car drove 2.05m BACKWARDS in the middle of the
  intersection, because the turn arc's outbound tangent point lands past
  the box edge and `leave` was appended after it. The check that existed
  to catch a malformed path asked whether it JUMPED — two metres
  backwards is two metres of travel — so it measured distance where it
  needed direction. DECISIONS.md 5.15.11.

  **OPEN, and a domain question:** a right turn here has a 3.85m tangent
  radius, tighter than `TURN_R_MIN`'s 5.5m full lock. The old engine
  floors the radius and thereby finishes 1.65m wide of the lane; the sim
  does not floor and produces an arc no car can follow. Both are wrong in
  different directions. What does a driver actually do turning right from
  a stop line at a tight urban intersection? 5.15.12.

  **OPEN, and blocked on that one:** nothing in the sim knows a corner is
  coming, so a car takes a turn at whatever speed it arrives at. At an
  all-way stop this is hidden because everybody stopped; on a through
  road, left turns run at a median 40 km/h and up to 78, which at a 6.4m
  radius is about 7g. The maintainer's stated 26/22 km/h are not
  derivable from lateral acceleration at these radii, so the turn-speed
  question and the radius question are one question. 5.15.13.

- **CURVED ROADS: the old ruling no longer applies, and a curve is now
  cheap.** It was ruled out against the old engine, where roads were
  compass-fixed and a curve meant reworking the geometry everything else
  measured from. In `src/sim/` a path is already a polyline with
  cumulative distances, so a bend is more points. Measured, not assumed:
  a real approach bent into a real bend passed 63 cars in four minutes
  with ZERO overlaps, the conflict scan found the same conflict, and the
  cars sat on their own line.

  What it costs: the RENDERER, which draws roads as rectangles and would
  have to draw them from the path — small, and exactly section 0's rule,
  since until then the engine can produce a bend the screen cannot
  express. Plus one line (`alongDir`), measured accurate to 5cm at the
  radius a 60 km/h road wants. A curve that ARRIVES ON A DIFFERENT
  BEARING is still expensive and is what the old ruling was refusing.

  It is also where the OTHER HALF of the steering axis lives: a wide line
  needs somewhere to be wide into, and the outside of a bend is
  somewhere. REBUILD.md 8.2.

  **BUILT**, renderer first: `roadsOf` draws the road from the path, a
  link bows and returns to its heading as tightly as its speed allows
  (one flagged design constant, 0.15 g sideways: 189m at 60 km/h), and
  the wide line on right-hand bends puts lane-keeping on the sheet as
  `wideLine` -- one showing per bend, derived against the old engine's
  own floor, vanishing when the steering deficit is stripped. The seams
  are exact with every link bent and `alongDir` reads short by at most
  0.26m on any gap it acts on. REBUILD.md 8.2.1, DECISIONS.md
  5.15.17-18, numbers from `tools/measure/bend.mjs`.

- **THE EXAMINER GAME IS THE ONLY PRIORITY.** Maintainer's ruling,
  verbatim: *"from now on the examiner game is the only priority, other
  game modes don't need to be accessible at all."* The driver game is no
  longer a product that has to keep working, and where the two conflict
  the examiner game wins. Do not preserve driver-game playability,
  balance or experience at the examiner game's expense.

  **NOT ACCESSIBLE IS NOT DELETABLE**, and the distinction is
  load-bearing. `RightOfWayTiming` holds the only renderer in the project,
  and the examiner screens import `Road` and `Environment` straight out of
  it. The modules stay. What went is the obligation.

  What that actually changed:

  - **The menu.** Driver-game entries keep `legacy: true`, are filtered
    out of every menu by `LIVE` in `App.jsx`, and remain in `MODES` so
    their hash routes still resolve — the same arrangement MergeRush
    already lives under. The home screen leads with the examiner premise.
  - **`windowIsSafe` is gone.** It asked *could the player take this
    window and live*, which is exactly right for a game where the player
    presses GO — and it was one of the most valuable checks ever added
    here (1142 unsafe drafts in 4000). It was also the whole of the
    tension: one generator serving two games that wanted opposite things.
    With one game left there is no trade, so the gate went rather than
    being kept behind a flag. Proven unused before removal, exactly as
    `RightOfWay.jsx` was.
  - **Five assertions retired deliberately**, with the reasoning left in
    place rather than deleted, because they existed only to enforce that
    gate and would otherwise have failed confusingly later: four in
    `verify-compose.mjs` §5, and `verify-roguelike.mjs` §4's independent
    re-derivation of the same predicate, which correctly reported 34 of
    150 biased draws colliding. Both sections keep everything that was
    never about driver-game safety — §4 still establishes that a biased
    draw passes exactly the audit an unbiased one would, now against what
    the accept test promises today.

  Measured, identical seeds and candidates, 240 generated intersections:

  | | faults/intersection | encroachments/drive | drives carrying one | contacts |
  |---|---|---|---|---|
  | `windowIsSafe` (before) | 1.16 | 0.47 | 16/40 | 0 |
  | no gate at all | 1.23 | 0.88 | 26/40 | **8** |
  | shipped | 1.20 | **0.70** | **22/40** | 0 |

  The gate had been suppressing half the supply, and faults per intersection
  barely move — so this converts comfortable intersections into markable ones
  rather than padding the drive with noise. It produced the first
  `veryTight` intersections the set has ever contained.

  **What the accept test still refuses is CONTACT**, and that is an
  examiner-game reason rather than a leftover: an examiner watching a
  candidate hit somebody is supposed to have taken the wheel, and
  intervention is not built. The line sits exactly where the game's own
  ability to respond sits, **and it moves when intervention lands** — 8
  in 240 intersections with no gate at all is the supply still waiting on it.

  `safeAtFor` in `index.js` is the surviving statement of the same idea
  and is still live: `verify-clearance`, `verify-events`,
  `verify-playthrough`, `verify-stages` and `verify-wontstop` all use it,
  because a hand-authored situation still has to be measured against
  something.

  It immediately surfaced a real bug the old gate had been hiding: an
  emergency vehicle was placed with a hardcoded `intent: "straight"` while
  the intersection's own `validIntents` sat computed and unused, so a tee
  could get an ambulance driving to a leg it does not have. Those draws
  had been getting rejected for unrelated reasons.

- **The post-test debrief is agreed in direction, not built.** The
  candidate's habits are named and fed back, as the transition out of a test
  into the next task rather than a score screen. The pieces exist: the
  marking sheet is what the player recorded, `habitReport` is what was
  actually true, and the gap between them is what `scoreDetection` already
  computes. Naming the habits is also what teaches the player what to watch
  for next time. See `DRIVER-IDENTITY.md` §7.

  **Some of the prose already exists, and it has a second home.** The
  deleted `Order` mode carried eight hand-authored right-of-way puzzles,
  each with a `rule` and a `why` written by the maintainer — explanations
  of exactly the kind a debrief needs, since a debrief has to say why
  something was a fault. At commit `63a9c68`, in a static
  positions-and-answer format the engine cannot simulate, so it is prose
  to reuse rather than scenarios to restore.

- **A TUTORIAL, framed as job training for a new hire.** Agreed direction,
  not built. The eight rescued puzzles become an introduction to the core
  concepts, and the fiction does real work: the player is being trained to
  examine, which is exactly what the tutorial is for, and it gives the
  game the onboarding path it currently has none of. The same `rule` and
  `why` prose serves both this and the debrief — one body of writing, two
  places it is needed, which is why it was worth rescuing.

### Humour is allowed. The traffic law is not

The candidates are sinful drivers in purgatory and they can be as ridiculous
as they like. **The driving standards they are measured against cannot be.**
A parody driver may do something absurd; what makes it a fault, and how bad a
fault it is, still has to be true. This is the same rule the fiction already
lived under and it does not soften because the tone did.

The reference doc, kept current alongside this file:
https://claude.ai/code/artifact/2c436e9e-ddc3-4f18-a192-d42734d9127b

## Architecture

**`src/sim/` IS THE REPLACEMENT FOUNDATION AND IT LIVES ALONGSIDE, NOT
INSTEAD.** Read REBUILD.md first. It is a stepped 20 Hz simulation where
every actor decides from the previous committed state, which is the one
thing `src/engine/` structurally cannot do -- `poseAt(p, t)` is pure and
resolves every participant's motion before the drive begins, so nobody
ever reads anybody while moving. Stages 0-3 are built and watchable at
`#/sim`, `#/crossing`, `#/candidates` and `#/course` -- the last is a
course with a route, directions, marking and the section sheet. It imports from `src/engine/`
where a thing was already solved (path shapes, the ratings model, the
scoring floors) and never the other way round.

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
src/engine/road.js       an intersection described: legs, lanes, control per leg
src/engine/paths.js      path shapes — line, curve, polyline — and no road at all
src/engine/sight.js      what the driver can see, the examiner's cone, and what creeping costs
src/engine/faults.js     what the candidate did wrong, derived by controlled comparison
src/engine/candidate.js  one driver across a whole drive, and where each habit can show
src/engine/ratings.js    a driver as four axes, and the errors that follow from them
src/engine/clearance.js  how much of somebody else's space the candidate took, in seconds
src/engine/awareness.js  what the candidate registered, and whether they gathered it at all
src/engine/reaction.js   the traffic giving way to a driver who took its space
src/engine/directions.js the instruction you give, and what stacking them costs
src/engine/belief.js     where you think the traffic is once you stop looking
src/engine/detect.js     grading the examiner on what they caught and invented
src/engine/actions.js    manoeuvres: ordered actions, fault tiers, the mark sheet
src/engine/score.js      grading a press against a derived window
src/engine/route.js      several intersections in one drive, and continuity
src/engine/world.js      intersections placed in one coordinate space, and the roads between
src/engine/tiles.js      road character, the tile library, route planning and pacing
src/engine/generate.js   seeded scenario generation
src/engine/compose.js    a brief in, a scene that measurably matches it out
src/engine/scenarios.js  the set situations, as data
src/engine/routes.js     drives, as data
src/engine/traits.js     PLAYER car upgrades and consumables — not the driver traits above
src/engine/roguelike.js  a run: stages, bosses, the branch, the Checkride, Insight
src/engine/stages.js     the roguelike's stages and its roundabout graph, as data
src/engine/bosses.js     hand-authored boss situations, as data
src/sim/traffic.js       THE REBUILD, stage 0: a stepped world, and cars that follow each other
src/sim/intersection.js  stage 1: paths through an intersection, and where two of them would meet
src/sim/crossing.js      stage 1: who gives way, gap acceptance, and undue delay
src/sim/candidate.js     stage 2: a named driver as five ratings, and the course they drive
src/sim/course.js        stage 3: intersections placed in one space, the roads between them, and a route
src/sim/marking.js       stage 3: deferred marking and the section sheet, fed to detect.js unchanged
src/theme.js             palette and type — the engine must never import this
src/environments.js      city, suburban, rural scenery — renderer side only
src/frame.js             the camera: frameFor and cameraFor — no React
src/storage.js           adapter chain: artifact host, localStorage, memory
src/progress.js          what the player has cleared, and the daily record
src/apps/ExaminerDrive.jsx     the examiner game: watch, mark, direct, one candidate
src/apps/ExaminerLab.jsx       the bench behind it — knobs exposed, scores nothing
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

**Whatever the camera can reveal has to be drawn.** Ground, scenery and
the road legs were all laid out to a fixed 720x720 board, which was
invisible until `cameraFor` started widening past it — then the extra
space was bare and the legs stopped in mid-air, with the tracked actor
driving in across nothing, since the camera had widened precisely to
cover that actor's approach. `worldHalfFor` in `frame.js` is the extent
all three now size to: the camera's MAXIMUM, deliberately not the live
easing value, because scenery is scattered once per scenario and would
visibly grow outward mid-reveal otherwise. Scenery density scales with
the area so a wider world is filled rather than thinned. `Road` and
`Roundabout` take `reach`, `Environment` takes `worldHalf`, and all
three default to the board — so a scenario with no camera draws exactly
as it always has. Checked in `verify-camera.mjs`: the world covers the
widest frame, the extent does not move with the clock, and anything
visible has ground under it.

**Never author the answer.** The safe window is computed by simulating
footprints through the intersection. Do not hardcode "window opens at 3.2s". If
a scenario needs a specific window, change the arrival times until the engine
produces it. The generator obeys the same rule: it declares arrivals and intents
and then asks the engine what they mean.

**Data over code.** Scenarios, routes and traits are plain declarations. Adding
a situation, a drive, or a trait must be a data entry, not a new component.

**There are two unrelated things called "traits". Know which one you are in.**
(And a third relationship: a DRIVER trait is now mostly the compiled output
of `ratings.js`, not something hand-assigned. Hand-assigned driver traits
survive in `scenarios.js` and `bosses.js` and are not going anywhere until
every axis can manifest.)

- **Driver traits** — `TRAITS` in `src/engine/index.js`. How an NPC actually
  drives. They belong to a car in a scenario.
- **Player upgrades** — `TRAIT_CATALOG` in `src/engine/traits.js`. Run-scoped
  equipment fitted to the player's car in the roguelike. They belong to a
  run, and they bend nothing about how anyone drives.

They are one word apart and do opposite things: a driver trait is *supposed*
to move a window, and a player upgrade must never be able to.

**The player's side is presented as car equipment, in rarity tiers.** Common
through Legendary, ordered and weighted in `RARITIES`. That is a reskin of
what was already there, not a new power: rarity governs how often a part is
*offered*, never how hard the game is or how the scorer behaves, and there is
no pity timer and no scaling with run depth. A rare part is rare at every
draft.

The fiction is chosen to keep the safety boundary obvious rather than merely
enforced. **Every upgrade is glass, a mirror, a camera, a readout, or a route
choice** — things that change what the driver *knows*. No brakes, no tyres,
no suspension, no engine, and nothing that touches how the player's car moves
through the world. A part that cannot be described without implying the car
handles differently does not belong in that file, because it would be moving
`legalAt` with it.

Two consequences worth keeping. Names must stay literally true, exactly like
a driver trait's tell: `school-zone-routing` is named for the routing it does
and is pointedly *not* called "Pedestrian Detection", because `preferPedestrian`
sends you where the pedestrians are and does nothing to help you see one.
And `RARITIES` carries ids, labels and weights but **no colour** — the palette
lives in `theme.js` and the renderer keys off those ids, same as everywhere
else the engine refuses to know what things look like. Both are checked in
`verify-roguelike.mjs`, along with rarer actually being scarcer.

**Driver behaviour is composable traits.** `wander`, `creep`, `overshoot`,
`slowStart`, `wideTurn`, `cutsCorner`, `lateSignal`, `rollingStop`,
`stopsShort`, `noSignal` — and `TRAIT_KEYS` in
`index.js` is the ONE list of them, because a second copy is how a new trait
gets forgotten by one generator and not the other. A trait bends how the car
actually drives and the conflict engine works out the consequences. Never
script a trait to punish the player directly. Traits divide into two kinds
and only one is expected to move a window:

- **PATH** traits bend where the car goes, so they must change the window.
- **INFO** traits change only what can be read in time. `lateSignal` is the
  whole category. A zero delta there is correct, not a dead trait.

**A trait may only fire where its tell is true.** `cutsCorner` is left-only
because a right has no radius to give away; `overshoot` and `slowStart` are
guarded on `p.stops` because a driver who never stopped never stopped past a
line and never had a turn to be slow off. That guard is not cosmetic — before
it, a candidate on a segment produced 3.8s of derivable, markable fault with
a tell that was a lie. A trait whose `setup` writes unconditionally is
claiming a consequence somewhere it does not happen.

**Two traits that write the same field cannot both be fitted.** `wideTurn`
and `cutsCorner` both write `turnBias`, so one silently overwrites the other
and then derives NO fault, because `faultWindow` strips one trait at a time
and stripping the loser changes nothing. `masks(a, b)` in `candidate.js`
derives this by fitting both and asking, so a new trait that writes over an
old one is caught on its first draw rather than shipping as a habit that
never shows.

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
both as optional parameters so a fitted player upgrade can widen the curve for
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
pedestrian walks at 1.35 m/s. Crossing a stop-controlled intersection therefore
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

**An approach is DECELERATION, not an interpolation.** It used to be a
smoothstep lerp from a spawn point to the line over a fixed 2.8s, in which
nothing was a physical quantity — so nobody could notice that every car in
the game braked at 18.1 m/s^2, which is 1.84g, more than twice an
emergency stop. Approach speed did not follow the road either: a car
arrived at a residential intersection at 47 km/h. Exactly the bug the
departure side had already fixed, on the other half of the manoeuvre.

**The model is a, then v, then x.** `approachDecel` is the input, speed is
its integral, position is speed's. You cannot write 1.84g by accident
because you do not write the trajectory at all — and the MANNER of a stop,
which is the maintainer's discriminator between a braking fault and a
knowledge one, is now a quantity that exists (`approachSpeedOf`) rather
than something to be inferred from a curve. Closed form rather than
stepped state, deliberately: `poseAt` is pure and O(1) and `earliestClear`
samples it thousands of times per window, so stepping would be a rewrite
of the engine's shape rather than a refinement of its physics. What makes
it refinable is that a, v and x are named quantities related by
integration.

**The deceleration is derived, not chosen**: the rate that brings a car
from the engine's own straight cruise to rest in exactly the approach run
the game already used — 2.70 m/s^2, squarely in the comfortable band. The
distance was always right; only the profile was wrong.

**ONE MODEL FOR EVERY APPROACH: come in at the road's speed and shed only
what you do not need.** A car that stops sheds all of it, one with
priority sheds the difference between the road and the corner it is about
to take, and a straight-through car sheds nothing — you slow for the
corner, not for nothing, which is what keeps an emergency vehicle from
braking to a speed it was never going to lose.

A rolling car used to run its WHOLE approach at the speed it would take
the intersection at, and that inverted `wontstop`'s tell: a left-turner
cruising in at 7.2 m/s was slower than a car braking from road speed for
the first second and a half, so "that one is not slowing" read backwards
exactly when it mattered. The old check passed only because the old lerp
parked braking cars at their spawn point until 2.8s before arrival — the
tell was reading an artifact, not a behaviour.

**Rebaked deliberately, and the partition is the evidence.** The only
thing that moved in the golden was ego position during the approach, in
all 18 situations, 0 degrees of rotation, and all four routes byte
identical. NOT ONE WINDOW MOVED: the conflict engine only looks from
`arriveAt` onward.

**A car steers through a turn; it does not cut the corner.** A turn is a
circular arc that starts at the car and is tangent to the lane it is
leaving, so the bending happens at the corner where a driver actually turns
the wheel. `turnPoints` in `paths.js` builds it, and the radius is derived
rather than chosen: it is the distance from the car to where the two
centrelines cross, floored at `TURN_R_MIN` (5.5 m, a passenger car at full
lock). A wider road, whose stop line sits further back, therefore turns
wider on its own, and a left — whose corner is across the intersection — comes
out wider than a right. Nothing about the shape is authored.

The version this replaced was one quadratic Bezier from the stop line to an
off-board exit with its control point at the corner: legs of 2.7 m against
20 m, so all the bending happened at the stop line and none at the corner.
Measured, every turn in the game was committing two real faults. A left
crossed onto the oncoming side of its own approach while still 3.3 m short
of the intersection. A right left the carriageway — 4 m from the centreline
against a 3.6 m road edge — at a 3.4 m radius, tighter than a car can
physically steer. That was reported by eye before it was ever measured,
which is why `verify-turns.mjs` now exists.

Fixing it moved exactly three windows, and only the three with a
left-turning prior: `liar`, `silent` and `lateflag`, all by the same 0.95s
earlier. The old line swung a turning car across the ego's own approach
lane, which is a conflict the law never asked for, so the ego was being
held 0.95s longer than it should have been. Every scenario without a
turning actor is byte-identical, and that partition is the evidence the
change was confined to turn geometry.

**Bad turning is a trait, and its tell has to be true.** `turnBias` is how
badly a driver takes the corner, in metres of finishing error: positive
swings wide, negative cuts inside. `wideTurn` (+4.5 m) finishes in the far
lane of the road it turned into. `cutsCorner` (-2.6 m) is **left only**, and
that is a real rule rather than a shortcut — a left turns around a corner
across the intersection, so there is radius to give away, while a right turns
around the near curb where the clean radius is already close to
`TURN_R_MIN`, so the floor absorbs the bias and the tell would be claiming a
fault nobody could see. `verify-turns.mjs` checks each tell against the path
actually built.

## The roguelike layer

A run is a driving test with stakes: named **stages** (`stages.js`), each
capped by a hand-authored **boss** (`bosses.js`), with a roundabout branch
screen between them for choosing what comes next, building to a four-leg
**Checkride** finale. Clearing the Checkride is the run's one win state
(`outcome: "won"`); any critical fault anywhere ends it (`"ended"`).

**The boundary that makes the whole thing safe.** A player upgrade or a
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
  accept test runs unconditionally whatever was asked for, so a biased
  draw has passed exactly the audit an unbiased one would. The roguelike
  asks for `accept: "safe"` by name, because it is the driver game.
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

**A hand-authored scenario skips the generator's safety net.** The accept
test lives inside `composeScenario`, so it only ever guards generated draws.
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
node tools/verify-events.mjs       the crossing button and the emergency vehicle: rule, readable, worth reading, generated
node tools/verify-turns.mjs        turns are steered, not cut: radius, lane discipline, and honest fault tells
node tools/verify-faults.mjs       examiner: faults derive from a control, and the cone decides what was markable
node tools/verify-directions.mjs   the instruction window, and what stacking costs the candidate
node tools/verify-belief.mjs       what you still think is true once you look away
node tools/verify-detect.mjs       grading the examiner: caught, missed, invented, and when
node tools/verify-outcome.mjs      how a drive ends: contact, and who taking the wheel lands on
node tools/verify-tiles.mjs        a declared runway is a promise, held to measured geometry
node tools/verify-world.mjs        the continuous drive: culling, routes, pacing, hazards, and what draws them
node tools/verify-candidate.mjs    one driver across a drive, and habits that repeat enough to be named
node tools/verify-clearance.mjs    encroachment in seconds, and bands derived from the engine's own claim
node tools/verify-awareness.mjs    what the candidate registered, and observation kept off outcome
node tools/verify-reaction.mjs     the world gives way, and never decides whether a fault happened
node tools/verify-screens.mjs      every reachable screen actually mounts and draws
node tools/verify-sim.mjs          stage 0 of the rebuild: nobody drives through anybody
node tools/verify-crossing.mjs     stage 1: paths through an intersection, who gives way, and what waiting too long costs
node tools/verify-telling.mjs      stage 2: one driver model, and each weak axis showing as itself
node tools/verify-course.mjs       stage 3: intersections that join, and traffic that is the same traffic
node tools/verify-perf.mjs         the budget ramp terminates, stops at the first failure, and derives the cap
node tools/verify-wheel.mjs        the player at the wheel: a monotone pedal, a grip-limited wheel, a lane that can be held, honest contact
node tools/verify-equivalence.mjs  nothing moved that was not meant to
python tools/verify-scoring.py     re-derives the scoring curve independently
```

All thirty-three must exit 0 **before a commit**. Between commits, run
the subset the change could have broken and say which -- item 8 of the
cold-start section has the dependency table and the rule. Fourteen things
they check are worth understanding:

- **`verify-faults.mjs` guards the examiner game's honesty.** Its central
  check is the one that separates a derived fault from an asserted one: take
  the fault it found, remove the trait that caused it, and the same query must
  come back empty. A fault that survives its own cause being removed was
  never derived from it.


- **`verify-screens.mjs` closes the suite's one blind spot, and it cost
  twenty increments to find.** Every other check is headless, so a React
  mistake was invisible to all of them — and the Examiner screen threw on
  mount from the day it was written while twenty increments were verified
  against it. This bundles each reachable screen with vite's own SSR build
  and renders it with `react-dom/server`: no DOM, no animation frames, no
  timers. It asserts NOTHING about what is drawn and cannot — effects do
  not run under SSR — so a person still has to open the page. It only
  proves the screen mounts, which is the thing nobody was checking.
  Verified against the original bug by putting it back: it fails with
  `watched is not defined`.

  It has since caught a second, of a different shape. Deriving each leg's
  run-in meant the clock could not be known until the leg was composed, so
  `t` became state initialised to `null` and filled in by an effect —
  effects do not run under SSR, so `ExaminerDrive` rendered its empty
  guard and 98 characters of markup. The lesson is a convention rather
  than a fix: **a screen's first render must already have a time.** The
  component now holds `elapsed` from zero and derives `t = elapsed -
  runIn`, so there is no null state and no effect to miss.

- **`verify-candidate.mjs` guards the half of the job that is reading a
  person.** Its properties are the ones any correct implementation would
  have to have: one driver at every intersection AND every segment; a habit
  gets enough chances to be told from an incident; its rivals get chances
  they visibly decline, so a hypothesis can be tested rather than only
  formed; a tell is true of the car; and a clean driver stays clean. It
  also measures how far the planner's forecast of what an intersection could
  show strays from what the scene actually offered, rather than assuming a
  forecast is free.

- **`verify-clearance.mjs` guards a standard that is stricter than the
  safety engine.** It checks that the bands are still derived from
  `LOOKAHEAD` rather than typed in, that severity never improves as the
  candidate goes earlier, that the gap RECOVERS so a single-instant
  reading would understate the fault, and — the one that keeps the
  mechanic honest — that ordinary legal driving is not marked, at 95%
  comfortable. It also checks the mild band is legible on a phone, because
  that band has no reaction to notice and the gap itself is all the player
  has to go on.

- **`verify-turns.mjs` exists because a fault got past every other check.**
  Turns cut the corner for the entire life of the project, and nothing in
  the suite noticed: every check asked whether the *window* was right, and
  the window was self-consistent with a wrong path. It took someone playing
  it and saying the turns looked wrong. So this one measures the shape of
  the drive rather than its timing — steerable radius, which side of the
  road the car is on, which lane it finishes in — and it is the template for
  any future check of how the world moves rather than when.

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
  the intersection, because a step that fits into that band only once makes the
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

  **AND SCRIPTED PLAYTHROUGHS DO NOT WORK IN THIS ENVIRONMENT. Do not
  try.** The preview pane delivers ZERO animation frames -- measured, 0 in
  1.5s with `document.hidden` false -- and clamps timers hard, so an
  rAF-driven screen simply does not advance. Nothing errors; the page
  renders, the buttons respond, and the clock sits still.

  The signature is a screen that draws correctly and never moves, or a
  hand-rolled frame pump that stalls after a burst. Two traps go with it:
  a pump that yields only on microtasks starves React's scheduler, so the
  component never re-renders and never re-subscribes to rAF; and the
  component must already be subscribed BEFORE any pump starts, or nothing
  is ever there to call.

  This cost real time on four separate occasions before it was written
  down. Verify a component by reading it, by `verify-screens.mjs`, and by
  ASKING A PERSON TO OPEN THE PAGE. Their eyes are the better instrument
  and they are available; a scripted playthrough is neither.

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
- **Events in generation: done.** Both generators place a crossing
  button (~11% of composed draws) and, more rarely, an emergency vehicle
  (~3%). Three things are MEASURED per draw rather than assumed, and a
  draw failing any of them is thrown away like one that misses its brief:
  the press lands early enough to be read (`eventsAreReadable`, in
  index.js so both generators share one rule); the emergency vehicle is
  actually in frame before the decision, given the camera the draw
  declares (`framedInTime`); and it actually moves the window
  (`emergencyEarnsItsPlace`, a controlled comparison against the same
  scene with the call switched off — one crossing the far side of a
  intersection genuinely costs nothing, which is correct and is exactly why
  it has to be checked).

  Two things worth knowing if these get tuned. The emergency vehicle
  REPLACES a car rather than joining them, and is kept out of `heavy`
  briefs: it pushes the window past itself, so every extra road user
  still arriving after that is another chance for the window to land on
  somebody, which the accept test then rejects — adding rather than
  swapping dropped the yield to under 1%. And `framedInTime` is the one
  place composition looks at the 2D frame; it checks a declaration the
  scenario makes, while `eventsAreReadable` states the requirement in
  time alone, so another renderer can satisfy it its own way.
- **Pedestrians in generation: done.** They rotate correctly (`crossingOf`
  is relative to the actor's own leg), and both generators place one now —
  `generate.js` (Daily) on 22% of draws, `compose.js` (Endless, ported from
  it) at a similar rate, on any leg the intersection actually has, multi-lane
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
- T-intersections, uncontrolled intersections and pedestrian crossovers are all
  wanted, behind the above.
- **A wide turn needs a next lane to be wide INTO, and a stopped car does
  not weave.** Both reported by the maintainer from play. `wideTurn`'s
  flat 4.5m bias put a car 2.70m PAST THE CURB on a single-lane left --
  "a lot of left turns go completely off the roadway" -- because the room
  a road offers is 1.8m there. Clamping to the curb only moved the lie
  (the car finished on the lane line claiming to have crossed it), so the
  trait now DECLINES a road with no next lane, exactly as `cutsCorner`
  declines a right. The maintainer's ruling settles it: off-road is real
  but "very rare and usually due to accidental acceleration", which this
  model does not have. Parking bays and bike lanes are the content that
  would make it markable on a narrow road. See DECISIONS.md 5.8.

  `wander` applied its drift unconditionally while `creep` had always
  guarded on `po.waiting`. They are mirrors -- creep only means anything
  while waiting, wander only while moving -- and the tell ("never held a
  steady line") is lane-keeping, which needs motion.

  Both gaps were in the checks as much as the code: `verify-turns.mjs`
  measured only the APPROACH (`if (along <= hy) continue`), so the exit
  side had never been looked at at all. It now checks both, plus that a
  car held at the line does not move.

- **HALF THE SEGMENT HAZARDS WERE BUILT SIDEWAYS ON THE ROAD.** A hazard
  is a small scenario placed at a point on a link, and it was only ever
  PLACED — built against a fixed north-south road with the notional
  candidate entering from `"S"`, then dropped at a world point. Measured
  across 70 hazard scenes: 29 pointed the right way, **35 were at right
  angles to their own road and 6 were backwards.** A pedestrian stepping
  off the curb walked up the carriageway; a car leaving a driveway pulled
  out sideways across the street.

  Everything derived from those scenes inherited it, so **no number
  previously reported about the segment-hazard layer is trustworthy** —
  contacts, ease-off rates and the fault attribution split in particular.

  This is `route.js`'s problem one level down and `route.js` already solved
  it: a scenario carries an orientation as well as a position. Hazards
  never used `rotateScenario`, and `isRotatable` would have refused them
  because they carry `sightBlockers` with fixed coordinates. So the scene
  is now BUILT facing the right way — `entryForLink` picks the leg whose
  local travel direction already equals the link's, leaving the two frames
  a translation apart, with nothing to spin and no blocker to misplace. A
  third kind of hazard must go through it. `verify-world.mjs` §10.

  Three more of the same shape came out with it. `p.at` was doing two jobs
  on an emerging car — where the SCENE stands in the world and where the
  CAR stands in the scene — so `placeScenario` teleported it onto the
  scene's own centre; `rest`/`into`/`onward` are offsets now. The notional
  candidate drove the engine's 45 km/h on a 30 km/h street while the
  hazard's timing was derived from the street's speed, which is the same
  disagreement `driveThroughTiles` had before it read `tiles[i].speed`;
  `cruise` on a participant fixes it and is absent everywhere else. And
  the emerging car's path stopped at the merge point, so a car that pulled
  out in front of the candidate ceased to exist a few car lengths later —
  **not one of 73 emergences ever made contact.** Controlled comparison
  after: 33 of 33 driveway emergences hit a candidate who does nothing,
  3 of 33 hit one responding as composed.

- **NOTHING KEEPS CARS OFF EACH OTHER UNLESS THEY STOP.** Two open
  modelling gaps, found because the drive was ending in contact 63% of
  the time and a controlled comparison said it was not the candidate's
  driving — 22 contacts as shipped, **19 with nobody carrying any traits
  at all.**

  **There is no car-following.** Every approach is built independently by
  `approachFrom` over `APPROACH_RUN` from that car's own `arriveAt`, so
  two road users on one leg arriving two seconds apart occupy the same
  24.5m of road at overlapping times and the follower drives through the
  leader's tail. 12 of the 22 contacts were this.

  **A rolling non-prior never yields.** `priority: -1` says an actor gives
  way to the candidate and `outranks` honours it when ORDERING the queue,
  but a participant with `stops !== true` never enters the queue at all:
  `schedule()` gives them `departAt = arriveAt + startDelay` and no
  clearance check. 10 of the 22.

  Both were EXPOSED rather than caused by "not every intersection is a
  test" — before uncontrolled legs existed everybody stopped, so
  `earliestClear` always ran and neither hole was reachable.

  `sceneIsSurvivable` is a STOPGAP and must not be read as the fix: it
  refuses scenes where a clean twin of the candidate collides, so it
  throws the impossible ones away rather than making the model behave.
  Car-following in particular is worth building on its own merits —
  traffic that keeps gaps reads as drivers, traffic that interpenetrates
  reads as sprites, and an inhabited world is the whole direction.
  DECISIONS.md 5.12.5.

- **A driveway is the BREAK in the parked row, not a thing beside it.**
  The car that reverses out was being placed at a parked car's own slot,
  and that same car was then handed back as one of its own sight blockers
  — which is exactly what kept it invisible until it moved, and why the
  anticipation window fell short. You cannot park across a driveway.

  `curbsideFor` and `drivewaysFor` are now one pass over one slot grid, so
  the two cannot disagree, and **a driveway is a slot the density roll
  left empty** — the gaps were already there, density already says what
  share of the frontage is parked, and reading the remainder as driveways
  introduces no second rate to keep in step with the first. 3.5 per link,
  a driveway roughly every 34m of frontage per side.

  `DRIVEWAY_CLEAR` is derived from the two cars rather than picked: the
  emerging car turns within its own footprint, so it reaches its
  half-diagonal from the mouth, and a parked car reaches its own
  half-length toward it. 4.72m, against a measured worst case of 4.17m for
  the manoeuvre `emergeMovement` actually builds — so the bound holds
  without being fitted to it. Nothing is parked inside it: closest is
  5.50m. The same swept radius sets the mouth width, so a wider car
  widens the driveway AND pushes the parking back rather than one of the
  two.

  The apron is drawn from `drivewaysFor`, so the surface and the car that
  comes out of it cannot end up in different places.

  What it bought: **28 of 33 driveway emergences are now fully visible
  BEFORE the car moves**, against 0 of 40 for a car in a parallel space,
  which is correct — a car in a row of parked cars is hidden by them.
  The anticipation window (from perceptible to the candidate's arrival)
  meets its derived requirement of reaction plus braking time in 28 of 33
  driveway cases and 0 of 40 parallel ones.

- **`wideTurn` and `cutsCorner` are real now, and still unused.** `wideTurn`
  used to ride along in `lateflag` — bending the path by 1.1 m for a 0.01s
  effect on the window, under the resolution floor, while its tell claimed a
  consequence to the player that was not really there. It was removed from
  that scenario rather than left as a false tell, and this entry used to say
  it was waiting for a scenario where the wide line actually reaches the lane
  the ego uses. Under real turn geometry it does: 4.5 m wide, into the far
  lane of the receiving road. `cutsCorner` is its opposite and is new. Both
  are measured in `verify-turns.mjs` and both are ready to attach; neither is
  attached to a scenario yet, because which situation should teach a wide or
  a cut turn is a domain question, not a mechanical one.
- **`creep` is masked by `overshoot` in `creeper`.** Accepted — creepers are for
  confusing right of way in busier scenarios than that one.
- **The Examiner screen had never rendered.** It was first in the mode
  switcher and threw a `ReferenceError` the instant it mounted: `watched`
  and `beliefs` were used and never declared, and `aim`/`setLooking`/
  `worldRef` were left dangling when the gaze cone was deleted from
  `sight.js`. So every examiner increment from the flip onward was
  verified headlessly and NEVER LOOKED AT. This file already said the
  suite "cannot catch a React mistake, so the component still needs eyes
  on it" — this is what that costs when nobody does. Open the page after
  touching a component: a build passing is not a screen rendering.
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
- Do not let a player upgrade or consumable reach `legalAt`, `safeAt`, collision
  detection, or a pad/claim/resolution constant. See "The roguelike layer".
- Do not "simplify" the scenario, route or trait systems back into hardcoded
  cases.
- Do not spoil the set situations in UI that lists them. Half of them turn on
  not knowing what is coming; locked ones are counted, never named.
