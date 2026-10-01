# The simulator first: the reframe, and the plan

*18 September 2026. Settled with the maintainer, including the player's
verb (section 1.1, settled later the same day). Nothing here is built;
this is the plan the next work is held to. Read REBUILD.md for the
foundation it stands on and DECISIONS.md for the rulings it keeps.*

---

## 0. The reframe, and why

**The product is a traffic simulator first. The examiner game becomes a
mode inside it, later.**

Why, recorded so it is not re-argued: **the axes were built before a
world that could express them.** Weeks went on measuring whether driver
skill is legible in a world where a driver only follows a car in a
straight line and stops at a sign — and there was nothing for a good
driver to be good at. No version of this game has ever had the candidate
respond to an instruction in a way a player could feel. The assessment
machinery kept coming first and the world kept being deferred. The
maintainer's own words: *"we never simulated anything other than cars in
a straight line, so none of the axes do anything by the limited
framework."*

The measurements bear him out, and they were made by the assessment
work itself: three of five axes were found to express on the road rather
than at the box (DECISIONS.md 5.14.8), the risky tail of confidence had
no supply because the road offered a car every fifteen seconds, the
observation axis read through nothing but a misjudged gap because
leaders brake gently and nothing was ever hidden, and the wide line
needed a bend before the steering axis could be marked at all. Every one
of those is the world being too thin for the model, not the model being
wrong. The order was backwards.

**A second thing recorded: metric realism is no longer a goal in
itself.** It came from the project's origin as a tool for instructors to
draw real situations. Gameplay now takes precedence over fidelity.
Derived constants are welcome where they help — a derived number is
still better than a tuned one when it is doing work — and they are not
worth defending where they do not. The bend radius from a side-friction
factor was worth deriving; a stop line 5.65 m from the centre of the
intersection is worth exactly as much as it helps the drive read.

---

## 1. The decisions

All settled with the maintainer on 18 September.

1. **One continuous world, free roam.** Not separate selectable
   environments.
2. **Handmade, roughly 8 km².** Dense and learnable rather than expansive
   — GTA-like attention per inch. **Familiarity with the city is a design
   pillar**: knowing the back streets is meant to become a skill, which
   is what keeps travel interesting after the visuals stop being novel.
3. **Endless comes from the traffic, not the map.** Fixed streets, never
   the same drive.
4. **Built in an editor we make.** The maintainer sketches the blockout
   — the highway route, the district areas — and detail is generated
   inside his shapes; he then hand-places wherever it matters. The editor
   may eventually be player-facing, so it is built properly, and **the
   map format survives badly-drawn input without taking the simulation
   down.**
5. **Multiple maps as data, added over time.** Throwaway test maps are
   first-class; expect a series of them as gameplay is tested.
6. **The map loads in pieces from the start.** Cheap now, painful to
   retrofit, and it is what lets the city grow later.
7. **Elevation**, including overpasses and underpasses — roads can cross
   without meeting. Blind crests and dips are wanted as real hazards.
8. **Isometric view, not top-down.** This reverses the sprite rule:
   sprites cannot be freely rotated, so a vehicle needs a drawing per
   heading — 16 minimum, 32 for smooth. The voxel pipeline from the
   earlier art research now earns itself: model once, render the angles
   automatically.
9. **Roads are free curves drawn from a path**, not built from
   fixed-direction tiles. Driving quality beats tile crispness. The road
   surface is drawn by code; buildings, vehicles and props are sprites on
   top.
10. **The player drives** — two controls, turns committed at
    intersections. Settled later the same day; section 1.1.

### 1.1 The player drives — the control scheme, and what it gives the exam mode

**The player drives. Confirmed by the maintainer**, which settles the
question section 8 first raised.

**The controls, in his words**: *"players can move left and right,
throttle and braking could be a slider going up and down, allowing for
slowing without braking and braking without applying full brakes."* Two
controls:

- **lateral** — steering, left and right;
- **one vertical slider** spanning throttle at the top, through a neutral
  coasting zone, down to partial and then full braking at the bottom.

**Turning is the middle option.** On the open road the player steers for
real, so bends are genuinely driven and the curve work matters. Turns at
intersections are **committed to rather than steered**: the player
chooses a direction and the car takes the corner along the arc the model
builds. That keeps bends meaningful without asking anyone to thread a
right-angle turn with a thumb on a phone.

**A dividend, recorded because it was not designed for.** The slider's
neutral zone and its graduated braking put the MANNER of slowing in the
player's hands — easing off against stabbing the brake. That is the same
distinction the assessment work arrived at on its own (DECISIONS.md
5.15.15: a fault is how you did it, not where you ended up; the stop
split on manner, not position), and it means **the player and the AI
drivers become measurable on identical terms**: the slider's position
over time is a deceleration profile, which is exactly the quantity the
driver model plans with and the sheet judges against. Lane-keeping the
same: a player steering on a bend strays from the lane's centre in the
same metres the weave and the wide line are measured in. Nothing new has
to be built to measure a player that is not already built to measure a
car.

**The result, and it changes what the exam mode costs.** The scheme
separates two things other control models fuse: **WHERE WE ARE GOING**
and **HOW WE ARE DRIVING**. Committing to a turn is a different verb from
steering through a bend. That division is exactly the division of labour
between an examiner and a candidate — the examiner picks the route, the
candidate drives — so the exam mode becomes **the base game with
steering removed and the remaining two controls reinterpreted**:

- the turn-commit control becomes **giving the direction**, unchanged.
  No separate instruction system has to be built; the player has been
  using that control since their first minute in the game.
- the slider's lower half becomes **intervention**. Easing it down is
  telling the candidate to slow; pushing it to the bottom is the
  instructor's brake. That yields **graduated intervention for free**,
  which matters because the maintainer ruled that a hasty grab is struck
  from the candidate's sheet but still costs the player — and partial and
  full are now genuinely different acts rather than one button.

The exam mode therefore moves from a separate build to a
reinterpretation, and it sits earlier in the staged path than it did
(section 6, stage 3).

**THE CAUTION, written in because it is the failure this project keeps
repeating.** The elegance is a dividend, not a reason. **The base game
must be good on its own terms.** If driving the simulator is not
enjoyable, the exam mode inherits a clean mapping onto something nobody
wants to play. The controls are designed to feel right to drive, and the
exam mode takes what it gets. The moment the driving is shaped around
how neatly it degrades into examining — a neutral zone sized for
intervention rather than for coasting, a turn commit timed for a
direction's deadline rather than for the corner — we are building
assessment machinery first again, which is the mistake being corrected.
Any decision about the controls is judged by one question: does it feel
right to drive?

#### 1.1.19 Auto-steer, and the one-dial framing — the maintainer's ruling, 25 September. Agreed, not built.

**The player can switch on auto-steer: the car holds its lane and they
keep throttle and brake. Switchable at will. An extension lets it drive
entirely while they consult a map.**

**Technically this is nearly free, and it should be recorded as such.**
The AI drivers already hold a lane, keep a line and move over for a
turn (1.1.13, 1.1.16, 1.1.17) — that is the whole of the steering axis
of the existing driver model, already built and already driving every
car on the map. Auto-steer is handing the player's own car to that same
model for STEERING ONLY. No new system, no new control, nothing to
design beyond deciding how the player's control surface reflects it
(the lateral input goes idle, or is overridden, while the slider stays
theirs).

**The design rule that decides whether it works: AUTO-STEER MUST BE
ADEQUATE, NOT OPTIMAL.** If it drives better than the player, it gets
left on permanently and the steering control becomes dead content — the
same failure shape as an assist that quietly makes the thing it assists
with pointless. It should be competent and slightly dull: conservative
through corners, will not take an opportunistic gap, will not overtake.
Cruise control, not a chauffeur. That is a tuning question for whichever
driver profile auto-steer is handed — a sound, unremarkable one, never
the bold end of the confidence axis — not a new mechanic.

**The structural point that unifies both this and the split above
(R2-DESIGN.md §17), and the most important thing to write down here:
THE PLAYER AND THE AI SHARE ONE DRIVER MODEL, AND EVERY MODE IS SIMPLY
WHICH PARTS THE HUMAN HOLDS.**

| mode | steering | pedals | route |
|---|---|---|---|
| full control | human | human | human |
| auto-steer | AI | human | human |
| map mode | AI | AI | human (watching) |
| exam mode | AI | AI | human (holding the route, marking) |

Four points on one dial, not four modes to build separately. This is
the same move section 1.1 already made once — the turn-commit control
turning out to be the direction-giving control in disguise, so the exam
mode became a reinterpretation of the base game rather than a second
build. Auto-steer and map mode generalise it: the exam mode is not a
fourth thing to build, it is **a configuration of the dial that already
exists** once auto-steer and the AI driver model exist for the player's
own car. What section 1.1 found for the route/manner split, this finds
for the whole control surface.

---

## 2. What survives, honestly

### 2.1 Survives, and is the foundation

The cold review's finding stands: **the stepped simulation core is good
work.** Specifically, and by file:

- `src/sim/traffic.js` — the stepped world; car-following that reads as
  drivers; **one driver model from five ratings**, candidate included;
  the load model. This is the thing the school idea and the towns idea
  both rest on (DRIVING-SCHOOL.md) and it carries over whole.
- `src/sim/intersection.js` — paths through an intersection as
  polylines with cumulative distance; turn arcs from the old engine's
  `turnPoints`; **the conflict region between any two paths, found by
  footprint scan**; the bend as a bow that returns to its heading; the
  road axis a renderer draws from. Survives, but see 2.4: its compass is
  the thing the map generalises.
- `src/sim/crossing.js` — **yielding as gap acceptance**, precedence
  (stopped first; the right-hand rule; left yields to oncoming;
  commitment at the launch), undue delay against the competent opening,
  joining at the speed there is room for, following across a boundary,
  perception as a lag. Survives.
- `src/sim/course.js` — links as the same piece of road, exact seams,
  handoff at the seam, `roadsOf` for the renderer. **Survives as
  mechanics; the GRID does not.** A course placed on a grid is exactly
  the special case the map replaces.
- `src/engine/ratings.js` — the five axes and how a deficit is read.
  Survives as the model of a person.
- `src/engine/paths.js` — turn geometry. Survives.
- **Every domain ruling in DECISIONS.md.** Right of way is path conflict;
  a moving vehicle claims the road ahead; the five axes and the three
  layers; yielding is not freezing; the stop-fault split on manner. These
  are the examiner's rules and they are the product whichever mode is
  in front.
- The four sim checks (`verify-sim`, `-crossing`, `-telling`,
  `-course`) and `verify-screens`. They keep running per commit under the
  dependency rule in CLAUDE.md item 8; sections that assert the grid
  will move to asserting the graph when the grid goes.

### 2.2 Shelved, not deleted — the assessment machinery

Returns for the exam mode, untouched until then:

- `src/sim/marking.js` (deferred marking, the section sheet, the four
  derived faults), `src/engine/detect.js` (grading the examiner),
  `src/engine/directions.js` (the instruction window, late/stacked
  verdicts, the load curve — the curve itself stays live in traffic.js),
  the tell/toTell/sheet half of `src/sim/candidate.js`, and the old
  engine's fault derivation, clearance, awareness, belief and sight
  modules.
- The stage 4 findings in REBUILD.md — the twin, the gap taken, what
  each axis needs, the two questions for the maintainer — stand as the
  spec for exam mode when it returns, in a world that finally gives the
  axes something to do.

Shelved means: no new work on them, their checks stay green as long as
the files they import are untouched (which under the dependency rule
means they need not be re-run), and nothing is deleted.

### 2.3 Does not survive, and never did

**The content-generation layer.** `compose.js`, `generate.js`, the tile
library and planner in `tiles.js`, `world.js`'s placement, `scenarios.js`
and `routes.js` as content, `route.js`'s rotation trick — all of it
answered "how do we make situations out of pre-resolved scenes", which is
a question the stepped world does not ask. The roguelike layer
(`roguelike.js`, `stages.js`, `bosses.js`, `traits.js`) was retired
already. **What survives from that layer is its IDEAS as content for the
map**: parked cars, driveways, emerging vehicles, pedestrians stepping
out, the curbside strip, "a driveway is the break in the parked row",
parking prohibited near an intersection. They get rebuilt on the map, not
ported.

The old renderer (`RightOfWayTiming.jsx`, `ExaminerDrive.jsx`,
`ExaminerLab.jsx`) goes with the old engine: kept in git, unlisted,
unmaintained. The four sim screens (`SimRoad`, `SimCrossing`,
`SimCandidates`, `SimCourse`) are the SVG top-down renderer and are
replaced by the isometric one; their stages become that renderer's
stages.

**`ASSET-SPEC.md` is superseded in its central instruction.** It forbids
rotation sets and mandates strict top-down; the isometric decision
reverses both. Its dimensions, palette, naming and manifest survive; it
is flagged at the top and will be rewritten as v2 once stage 0 has
settled the projection (section 5.3). Do not commission art against v1.

### 2.4 The one real refactor in the core

The sim's intersection is **compass-aligned**: four legs at N/E/S/W,
`SIDES`, `OPPOSITE` and `rightOf` as constants, and a grid that places
intersections a reach apart. REBUILD.md 8.2 named this "the expensive
version" of a curve and deliberately did not do it. **The map requires
it**: an intersection is wherever roads meet, at whatever bearings, with
however many legs (three, four, five, skewed). Precedence has to be
restated in bearing terms — "on my right" is the approach whose bearing
is clockwise-next; "oncoming" is the approach within some angle of
opposite — and `pathFor` has to build arcs between arbitrary legs. The
rules do not change; their coordinates do. This is the bulk of stage 1
and the largest single piece of work in the core.

---

## 3. The map format

A map is data, in JSON, in metres, and it is the one artifact both the
editor and the simulator agree on. It is designed so that **nothing a
badly drawn map contains can throw the simulation**: loading normalises,
warns, and produces a valid graph or refuses with a reason.

### 3.1 What a map holds

```
map
  id, name, version
  bounds        { x, y, w, h }        metres; origin top-left, y southward as today
  chunk         256                    metres per chunk edge (section 3.4)
  roads[]       one per drawn stroke
    id, kind    residential | collector | arterial | highway | service
    points[]    { x, y, z }            the centreline as the editor drew it
    lanes       per direction (1, 2, 3); oneWay: true|false
    speed       km/h
    parking     none | parallel
    control     per end: how this road meets the node at each end (stop | yield | none | signal)
  nodes[]       where roads MEET — explicit, never inferred from geometry
    id, at { x, y, z }, legs[] { road, end }
  zones[]       district polygons: residential | commercial | industrial | park | water | highway
    polygon[], density, character biases (the town profile, DRIVING-SCHOOL.md section 3)
  props[]       hand-placed things: { kind, at, heading, z }
  spawns[]      optional: where traffic enters; every dangling road end is one by default
```

**Roads cross without meeting when there is no node.** An overpass is two
roads whose plan projections cross with no node at the crossing; the
loader checks their elevations differ by at least a clearance and warns
if they do not. Connectivity comes only from nodes, so a road drawn over
another by accident yields "no intersection here" and a warning, never a
crash.

### 3.2 Normalisation on load — what makes it survive bad input

In order, every load:

1. **Dedupe and thin** points closer than 0.5 m; drop roads shorter than a
   car.
2. **Resample** each centreline at a fixed spacing (the bend's 5 m today)
   so the sim's polyline walk and the renderer's ribbon see the same
   curve.
3. **Curvature clamp**: a bend tighter than the radius its speed allows
   (the side-friction rule, `radiusFor`) does not get rejected — its
   posted speed is lowered to what the bend allows, and the editor shows
   it. Gameplay over fidelity: a tight bend is content.
4. **Grade clamp**: elevation is smoothed so no segment exceeds a maximum
   grade; a crest sharper than the clamp is flattened and warned.
5. **Snap road ends** to a nearby road (within a lane width) by splitting
   that road and creating the node, so a T drawn slightly short still
   connects. Ends that snap to nothing become edges — spawn and despawn
   points.
6. **Build the graph**: nodes with legs at real bearings; each node's
   paths and conflict regions computed as `layoutFor` does today, per
   node rather than per template.
7. **Validate**: two roads crossing in plan without a node and without
   clearance; a node with one leg; a leg shorter than its own stop line
   setback; a lane count the road's width cannot hold. Each is a warning
   with a location. Only an empty map or a map with no drivable road
   refuses.

The output of a load is the graph plus the warning list. The editor
shows the list; the simulator ignores it.

### 3.3 Elevation

`z` per centreline point, interpolated along the road. In the first
version elevation is **visual only**: the renderer projects it, the sim
drives the plan path. Two things follow later, in this order:

- **Blind crests as occlusion**: a car beyond a crest is not in the
  driver's line of sight along the road profile, so `seenBy` does not
  return it until it appears. This is the first place the observation
  axis meets a world that hides things, and it is exactly the asymmetry
  DECISIONS.md 4.4 is built on: occlusion is perceptible and caution
  compensates; inattention is not.
- **Grade in the dynamics**: braking distance and pull-away on a hill.
  Only if it reads; probably not worth it.

### 3.4 Chunks

The map is stored whole and **indexed in chunks** of 256 m: every road
sample and every prop knows its chunk. Two things read the index:

- **The renderer** draws the chunks in and around the camera's view and
  nothing else. With roads as ribbons and buildings as sprites, an 8 km²
  city is ~120 chunks of which a phone view touches four to nine.
- **The simulator's neighbour queries.** `whatStops` today asks every
  actor about every other, which is fine at forty cars and is not at
  several hundred: measured, 141 cars cost 118 ms per simulated second
  and 316 cost 492 ms. A car's leader, its conflicts and the cars it
  yields to are all within a chunk or two, so the index turns the
  question from all-pairs into neighbours. **This is the reason chunks
  exist from the start**; the rendering benefit is the smaller half.

---

## 4. The editor, first version

**BUILT, 27 September** (`src/apps/Editor.jsx`, `src/editor/model.js`,
`src/editor/validate.js`, `src/map/edges.js`, `tools/verify-editor.mjs`),
against exactly this list. What follows is the spec it was built to;
what actually shipped, what it deliberately left out, and the real bug
finding it is recorded at the end of the section.

The minimum that lets the maintainer draw a road network with kinds and
elevation and drive it, at `#/editor`:

- **Draw a road**: click to place points, drag to move, double-click to
  finish. Snapping to existing roads at the ends (section 3.2 step 5).
- **Per road**: kind, lanes per direction, one-way, speed, parking.
- **Elevation**: a height handle per point, or a road-wide ramp; the
  profile drawn beside the map so a crest is visible while being made.
- **Nodes**: created by snapping; control per approach set by clicking
  the approach.
- **Zones**: draw a polygon, pick a kind. (Generation inside the shape is
  stage 5, not here.)
- **Validate**: the warning list, each entry jumping the view to the spot.
- **Save / load**: JSON to a file and to local storage; a map has an id
  and a version; the app ships with its test maps as data.
- **Drive it**: load the map into the simulator and put the player at
  the wheel of a car in its traffic (section 1.1). Same screen, one
  button, no reload.

Built as a screen in the app so it is one codebase and the same map
loader the game uses, from the first day. The generation inside shapes —
local streets filling a district, buildings along frontages, parking and
props — is stage 5; the editor's job at v1 is to make the blockout by
hand.

**THE DRAFT IS THE MAP.** `editor/model.js`'s functions are pure and
return exactly the shape `map/format.js` already defines -- addRoad,
addPoint, setRoadProps, setRoadControl, setPointZ, addZone and their
opposites -- so save is `JSON.stringify` with nothing editor-specific to
strip, and the format stays the one thing the editor and the simulator
agree on rather than gaining a second, editor-only shape. "Drive it"
reuses `MapRoad.jsx` -- the same screen `#/map` runs -- which now takes
an optional `mapData` prop in place of the hardcoded test map; `#/map`
itself is untouched (byte-identical render, confirmed by
`verify-screens`).

**WHAT V1 LEFT OUT, DELIBERATELY.** Nothing of section 4's list now;
per-lane turn overrides, turn bays and protected-left arrows all have
editor UI (below). A road with NO intersection anywhere (both ends
open: the first thing anybody draws, stage 0's own shape, a closed
loop) had no "Drive it" start at first; it has now -- `firstEdge` falls
back to a through road when no road meets a node, and `curbLegOf` hands
out a through spot only when asked (`{ through: true }`). Section 7
drives one to its far end; that check also caught `firstEdge` throwing
on a map that failed to load.

**A REAL BUG, CAUGHT HEADLESSLY, PER THE HOUSE RULE OF VERIFYING FROM
THE SERVER SIDE.** `verify-screens.mjs` can only render the editor's
INITIAL state under SSR -- it cannot click "Drive it" -- so
`verify-editor.mjs` section 7 runs the exact pipeline `MapRoad`'s
`sceneFor` uses (loadMap, seedGraph, find an open end, playerOn,
withDriver, step) directly, against a map drawn through the editor's
own operations rather than hand-authored. It found that the first
version of "where does a car start" pointed at the WRONG end of the
road: `curbLegOf`'s `end` argument names which end of the road touches
a node, not which end is the dangling one a car enters from, and the
two are opposite. Getting it backwards meant `playerOn` returned null
and a null actor reached `withDriver`, which every downstream reader of
`a.player` would have thrown on -- not on the hardcoded test map (its
own start was always correct by construction) but on the very first map
someone actually draws. A real browser would eventually have found
this by clicking "Drive it" once; the headless pipeline test found it
without one, which is the whole point of verifying this way.

**Can a badly drawn map break the sim?** Tried directly, in
`verify-editor.mjs` section 4: an empty draft, a road with zero or one
point, coincident points, a NaN coordinate from a stray event, a road
that loops back and crosses itself, a nonsense control string, a
negative lane count, turn bays on a one-way road, a crest steeper than
any road allows, a zone with no polygon -- eleven adversarial drafts,
none threw and none crashed validation. Whether drawing a road is
pleasant enough to draw eight square kilometres of them is the
maintainer's question to answer by using it, not one a check can.

**TWO MORE OF THE PLAN'S OWN REQUIREMENTS, CHECKED AND SATISFIED, THE
SAME SESSION.** *Elevation including overpasses*: two roads can cross
in plan at a real clearance and load clean, one crossing recorded in
`loaded.crossings` (`verify-editor.mjs` section 8) -- but a flat
top-down plan view cannot show WHICH road is on top for free, so the
canvas now draws a short gap in the UNDER road's line at every crossing
with real clearance, computed from that same `crossings` list rather
than re-derived. *Multiple maps as data, throwaway test maps
first-class*: `src/editor/library.js` -- named saves, a list, open,
delete -- separate from the single autosave slot that just follows
whatever is on screen. Building it caught a second real bug the same
way: the first id generator was `Date.now()` alone, which collided
when two saves landed in the same millisecond (exactly what the
check's own back-to-back saves did) and the second silently overwrote
the first rather than creating a new entry. Fixed the way
`editor/model.js`'s own `nextId` already does it -- checked against
what exists, never just trusted to be unique (`verify-editor.mjs`
section 9, sabotaged to confirm it fails without the fix).

**THE REST OF SECTION 4'S LIST, AND THE PHONE.** Control per approach
is set by tapping the approach: in the select tool a tap on a road's END
selects that approach (ringed on the canvas) and the panel shows it --
control, left bays (none, one, or two for a double left), a right bay,
and the protected left arrow, enabled only on a signal. So an
intersection like the test map's E, hand-authored in `map/samples.js`,
can now be drawn: `verify-editor.mjs` section 11 builds one from those
operations alone and gets eight bays, a protected left on every
approach, every left from a bay, and a minute of traffic with no
overlaps. Connectivity errors now jump to their intersection (they
carry a node, not a location). And the canvas is usable with fingers:
a tap places or selects, a one-finger drag pans in any tool, two
fingers pinch-zoom, dragging a point moves it live, a double-tap
finishes a road -- points are placed on RELEASE, so a press that turns
into a drag or a pinch never drops a stray point. The view geometry
(`editor/gesture.js`) is pure and checked in section 10, since a canvas
gesture is exactly the thing this environment cannot watch.

**JOINING THE WAY A PERSON MEANS.** A tap near the middle of another
road snaps onto its line (a blue ring previews it; green for an end),
so a T joins for certain rather than by a fingertip's luck against the
loader's 3.6 m. A road drawn straight across another at one height is
still a warning -- the editor cannot know an overpass was not meant --
but the warning now carries its fix, **Make intersection**, which splits
both roads at the crossing so four ends meet and the loader makes the
node (`editor/model.js` `joinCrossing`). And a whole road's height is
two numbers: a straight ramp between its ends, or a hump over them --
a bridge is one number, and a hump of 7 m over another road turns a
warned crossing into an overpass with no warning. The loader's own join
notes are counted in the validation panel rather than listed, since
they are the joins that were drawn, not problems. `verify-editor.mjs`
section 12, sabotaged: splitting only one of the two roads leaves a
three-legged node and fails it.

**CURVES YOU CAN ACTUALLY DRIVE, AND VALIDATION THAT KEEPS UP WITH A
FINGER.** A road tapped out point by point is straight segments meeting
at corners, and the loader rightly posts a cornered road at what its
tightest corner allows -- a right-angle zigzag drawn as an arterial
loads at 10 km/h. So a road can be reshaped: **Smooth** (one Chaikin
pass, both ends held exactly where they are so a joined road stays
joined; three passes take that zigzag to 15 km/h and a gentler sketch
much further), **Add points** (a midpoint in every segment, more
handles to drag a curve by), and **x** on any point (never below two).
Section 14. Separately, validation ran on every tap and cost ~600 ms on
the test map, almost all of it the graph's all-pairs conflict table --
which validation never reads. `graphOf(loaded, { conflicts: false })`
skips it (3 ms), and section 13 holds the lite graph to the full one:
same nodes, same legs, same connectivity verdict.

**LANE ARROWS.** Each approach into an intersection shows its lanes at
the line, centre out, as ← ↑ → toggles -- the movements the
intersection offers, lit for what each lane may do. Untouched, that is
the general rule as the graph applies it (`graphOf` now records each
approach's offer and the turns in force, and `validateDraft` maps them
back to the draft's own road ends -- an approach at a node the loader
made by splitting a road is not a road end and has no `turns` to set,
so it is not offered). Touching one writes the format's own `turns`
for that end; **Reset to rule** clears it. A change of lanes or bays
that leaves the override the wrong length drops it rather than leave
the graph a list to refuse. Section 15, sabotaged: without the split
filter a T offers approaches that are not road ends.

**BUILDINGS, PLACED BY HAND.** The plan's "he hand-places where it
matters": a Building tool (house, shop, apartment -- blockout sizes in
`map/format.js` `PROP_KINDS`, each overridable) drops a footprint where
tapped, turned to face the nearest road, and the panel sets kind,
heading and size. A building is moved by dragging it (held by the spot
grabbed, drawn live, committed on release like a road point), and
**Face nearest road** turns one moved to another street to face that
one -- not automatically, since a heading set on purpose should
survive a nudge. The format always had `props`; nothing drew a map's
props and nothing stopped one standing on a road. Both fixed: `loadMap`
normalises them and **drops any building whose footprint reaches a
road's surface**, warned at the spot (the editor draws it red), because
nothing in the sim collides with a prop and the traffic would drive
straight through it -- a state the renderer could not honestly draw
(CLAUDE.md item 6). "Drive it" draws the rest as boxes. The test is
plan-only for now, so a building under an overpass deck is dropped
too. Buildings do not yet block anybody's sight; that waits on sight
being modelled in the sim at all. `verify-editor.mjs` section 16 and
`verify-map.mjs` section 6, both sabotaged.

**UNDO AND REDO, FOR THE WHOLE DRAFT.** Toolbar buttons and
Ctrl/Cmd+Z, Ctrl+Shift+Z, Ctrl+Y (`editor/history.js`). The model is
pure, so history is a list of maps -- nothing inverse to keep in step
as the model grows. Consecutive edits merge into one step only when
they touch the same single object, leave its point count alone, and
land within 600 ms: typing "60" into a speed field is one step, five
fast taps of a road are five. Opening, loading or starting a map
starts history afresh. `verify-editor.mjs` section 17, sabotaged both
ways (no coalescing splits the typing; coalescing across a point
change swallows the taps).

*Not touched, because already true*: free-drawn curves (a road is
points placed wherever clicked, never a tile) and chunked loading
(`map/load.js` already indexes every sample and prop by chunk at load
time; nothing about the editor needed to change for it, and consuming
that index for culled rendering or bounded neighbour queries is stage
5/6's question, not stage 2's).

---

## 5. The renderer

### 5.1 The change

From top-down SVG to **isometric with elevation and code-drawn curved
roads.** Everything the current sim renderer does — the ribbon along a
path, the box, the markings, the chase camera — has to be redone in a
projection, with elevation, with depth ordering, with sprites instead of
drawn shapes, and at a scale of hundreds of moving things rather than
forty. This is the big one and it is where stage 0 goes first.

### 5.2 Decisions inside it

- **Projection**: a fixed isometric (2:1 dimetric) with `z` lifting the
  point straight up on screen. World stays metric; the projection is one
  function; every drawable goes through it.
- **The camera ROTATES with the car when the player drives -- reversed
  on 20 September, on the first playtest.** The paragraph this replaces
  said the camera does not rotate, because a city that always faces
  the same way is a city you can learn. The maintainer's first drive
  said "it's hard to see what's coming up, it's very hard to control
  from the current perspective": with the world fixed, the road ahead
  lay in whichever screen direction the car pointed, and on half the
  headings the player drove toward the bottom of the screen. So the
  driving view is a CHASE CAMERA (`src/iso/chase.js`): behind the car,
  leading it by seconds of travel -- more road at 60 than at 20 --
  eased so it never snaps, and TURNED so the road ahead is always up
  the screen, the short way round, never faster than 120 degrees a
  second. Watching the traffic keeps the fixed view; a fixed view
  stays available as a toggle while driving, for the comparison.

  The engineering call, on the merits: the alternatives were not
  rotating (just judged undrivable), four or eight snapped rotations
  (a jolt at every turn, and the same art cost as below), or free
  rotation, which costs nothing today because everything the renderer
  draws is a box the code builds and a box rotates for free.

  **WHAT IT CONSTRAINS, AND IT BELONGS HERE BEFORE ART IS
  COMMISSIONED (5.3):** scenery cannot be a single-view isometric
  sprite. A building, a tree, a sign has to be rotation-tolerant --
  faces painted onto a box the renderer extrudes (an artist paints a
  wall and a roof, not a building), a set of views with the nearest
  chosen, or a billboard that faces the camera. Car sprites are
  unaffected: a 32-heading set is indexed by the car's heading
  RELATIVE TO THE VIEW, which is what the renderer already quantises.
  The learnable-city argument survives in a weaker form: landmarks
  read from any side, and the map, when there is one, is north-up.
- **Roads by code**: the centreline projected; the surface as a filled
  ribbon whose edges are offset in world space before projection (so a
  bend's edges are true curves, not sheared); markings as projected
  polylines; intersections as filled polygons where legs meet. Kerbs and
  sidewalks the same way. Elevation makes a road's ribbon a strip that
  climbs; an overpass is a ribbon drawn after what it crosses.
- **Sprites for everything with height**: vehicles at 32 headings (16 as
  the floor), indexed by heading relative to the view; buildings and
  props as painted faces on extruded boxes or as view sets, never a
  single fixed-view sprite (the rotation decision above); trees and
  people as billboards. Anchored at the base of the footprint, sorted
  with everything else.
- **Draw order** is the isometric painter's problem and it is the known
  hard part: one key per drawable, its projection onto the line of
  sight -- `x + y + z / LIFT` in the ROTATED frame -- per frame; a car
  under an overpass draws before the overpass and a car on it after.
  Got right in stage 0 with one hill and one overpass; the z weight
  was 2 LIFT there, wrong by a factor of 1.5 and invisible by eye until
  the rotation check derived it.
- **Canvas, not SVG.** The app's rule has been React + SVG and no canvas,
  and it held because the old renderer drew one intersection. A city
  view of hundreds of sprites and ribbons re-sorted every frame is not an
  SVG workload, on a phone least of all. The sim steps at a fixed 20 Hz
  as it does now; the renderer draws at the display's rate from the last
  committed state, interpolating positions. Screens around the canvas
  (menus, the editor's panels) stay React.
- **Scale**: what fits on a phone decides it. Something like 60–80 m of
  road across a phone width, which puts a car around 30–40 px long at 32
  headings — large enough for a heading set to read, small enough to see
  a block ahead. Settled by looking, in stage 0.

### 5.3 The art pipeline

Model once, render the headings automatically: a voxel or low-poly model
per vehicle, a script that renders it at 32 headings from the isometric
camera with one fixed light, into a sheet plus a manifest. The same for
props with a heading (parked cars, benches); buildings and trees need
one view. The pipeline is stage 4 and it is what makes 32 headings cheap
rather than a commission of 32 drawings per car. ASSET-SPEC v2 is
written from the pipeline's output format, after stage 0 has fixed the
projection and the scale.

---

## 6. The staged path — every stage ends in something to look at

The lesson of this whole project, and a new direction is more vulnerable
to forgetting it, not less: a stage that ends in a check and not a
screen is a stage nobody can judge. Every stage below ends in a route the
maintainer opens.

### Stage 0 — the visual direction, in a day or two

**The maintainer's suggestion, agreed, with one change.** Take the
traffic that already works — stage 0's following on one road, with the
bend geometry that exists — and render it isometrically on a curved road
with a hill in it. No editor, no city, no map format.

The change: **do not wait for voxel sprites.** Draw the cars as
isometric boxes by code for this stage — a car is a rotated prism, which
is a dozen lines — so the test of the visual direction does not depend
on an art pipeline that is its own stage. A code-drawn prism at 32
headings proves the projection, the depth sort, the elevation and the
road ribbon exactly as a sprite would, and if the prisms look right the
sprites will.

Add one overpass to the hill — a second road crossing above — because
the draw-order problem is the one thing here that could send everything
downstream back to the drawing board, and it costs an afternoon to
include now.

*Deliverable:* `#/iso`: a curved road with a crest and a flyover, cars
following each other over it, camera following one of them. **BUILT,
18 September** -- canvas, the depth key from project.js, code-drawn
boxes at 32 headings, level by default with a tilt toggle, fixed
viewpoints on the overpass and the crest so neither has to be waited
for. One thing found on the way: ground cells and road segments cannot
share one kind of key -- a cell keyed by its centre painted grass over
the road it overlapped; the ground is keyed by its farthest corner and
the road by its nearest, and cars follow the segment they stand on.
*The question:* does an isometric curved road with elevation look
right? If it looks wrong, everything below changes, and we know on day
two rather than in month two.
*Cost:* one to two days.

### Stage 1 — the map as data, the sim on a graph, and the player at the wheel

The map format (section 3), the loader with its normalisation and
warnings, a hand-written test map in a text editor — a loop with a hill,
a T, a crossroads, a skewed five-way, an overpass — and **the core
refactor**: intersections at arbitrary bearings with any number of legs
(section 2.4), the grid gone, `course.js` reduced to the graph it always
was underneath. The isometric renderer draws the map from its chunks.
Traffic spawns at every dangling end, picks turns at random at every
node, and is endless.

**And the player drives, from here on.** The two controls of section
1.1 — steering on the road, the throttle-to-brake slider, turns
committed at nodes — on a car that is otherwise an ordinary member of
the traffic: the same following, the same right of way owed to it and
by it. This is the earliest stage a car can be driven, so it is the
stage the controls start being judged by feel, and the caution in 1.1
applies from the first day: the controls are tuned to drive well, and
nothing about them is decided for the exam mode's sake.

*Deliverable:* `#/map?id=test-1`: drive a hand-written map yourself,
in traffic.
*The question:* does it feel right to drive? Do the precedence rules
still read as people at a skewed five-way, with you in the queue?
*Cost:* one to two weeks; the refactor is most of it, the controls a
few days that will be revisited at every later stage.

#### 1.1 The first slice: at the wheel, on the stage-0 roads -- BUILT

`#/wheel`, 18 September. The two controls on the stage-0 roads, in the
stage-0 traffic, before the map format exists, so the feel can be
judged on a phone in week one rather than after the refactor. The car
lives in the road's frame (`src/iso/player.js`): metres along, metres
off the centreline, and a heading relative to the road's tangent, so a
road that bends under a straight wheel drifts the car outward -- the
bend is driven. The wheel is limited by lock at walking pace and by
tyre grip at speed (0.6 g at full deflection: a 48 m circle at 60
km/h), and does nothing at rest. The slider runs from the coast in
both directions: lifting off slows you a little, the first touch of
brake a little more, never less -- a version that ran the brake from
zero had a light brake slowing the car less than coasting, caught by
`verify-wheel.mjs`. Off the road the grass drags and the car crawls;
it can always come back.

The player is an actor in the traffic's own world (`stepWithPlayer`):
the car behind follows them with the model that follows everybody,
and stops behind them when they stop. Contact is two discs per car
(`touching`), and it stops the car -- what a collision IS in this game
is still the maintainer's question, so nothing more is claimed for it.

Not yet, and said on the screen: no intersections, so no turn commit;
the road wraps at its end; the oncoming lane does not react to a car
in it; nothing is scored. One product question for the maintainer,
felt rather than argued: **does the slider hold where it is left, or
spring back to neutral when the thumb lifts?** Both are on the screen
as a toggle.

#### 1.1.1 Where stage 1 stands -- 19 September, evening

**Built, committed, and green on the full suite (36 checks):**

- **The map format and its loader** (`src/map/format.js`, `load.js`;
  `57527ad`). Section 3 as written: thin, resample, the bend clamp on
  the sim's own side-friction rule, the grade clamp by diffusion, ends
  snapped within a lane width with the crossed road split, legs at
  real bearings, edges, crossings without a node warned, a 256 m chunk
  index. Only an empty map is refused. Stage 0 is the first map and
  loads back within 5 mm of the hand-built roads, which `#/iso` and
  `#/wheel` now run on.
- **The sim on a road network** (`src/sim/graph.js`; `c0623eb`).
  Section 2.4, the core refactor: intersections at any bearing with
  any number of legs, and crossing.js's rules unchanged -- they ask the
  layout what "on my right" and "oncoming" mean, in bearings. Proven by
  equivalence: a crossroads from four map strokes IS the compass
  crossroads, paths to the millimetre and the identical 68-pair
  conflict table. Then a T, a five-way at 0/45/135/180/270, a loop
  through four nodes with a bend and a hill, and an overpass, with
  minutes of traffic through each and nobody driving through anybody.
  The seam is the lane's own midpoint. Two cars on different levels
  are not touching.
- **The player drives the map, and the turn signal is the turn
  commit** (`src/sim/drive.js`, `player.js`; `6bb818e`). The three
  controls of 1.1 on `#/map`, in traffic, the player an ordinary
  member of it. Indicate before the line and the car takes that
  corner; no signal is straight on; past the line the turn is locked.
  A bend is driven, the box is committed to. The signal means the exit
  of its kind nearest a right angle; a T with no straight ahead and no
  signal takes the gentlest turn; the edge of the map is the end of
  the road.
- **Settings** (`src/settings.js`) through the storage adapter: the
  slider's manner, the traffic's speed, drive or watch -- kept across
  visits, applied once after the first render.

**Two domain questions surfaced, both flagged in the code:**
- what counts as ONCOMING at a skewed crossing -- `ONCOMING_TOL`, 40
  degrees, in graph.js: a five-way at 72 degrees has no oncoming pair
  and every pair falls to the right-hand rule;
- what a driver calls STRAIGHT ON where the road kinks -- 30 degrees:
  the test map's bent road arrives at its crossroads 25 degrees off
  square, and a driver does not signal for that.

**And one product question, felt rather than argued:** does the
indicator-as-commit feel like driving? It is a tap in a top corner,
which is a stalk; the car's line under the speed says what it is
about to do and when it is committed.

**Not yet in stage 1:** the real cap (the production-build sweep is
Jay's to run; the instrument is ready at `#/iso`); a candidate on the
map. The editor is stage 2. (Junction surfaces, the chase camera and
more than one lane each way were on this list; 1.1.2 has them. Ground
under a road that climbs is 1.1.5; per-road posted speeds are 1.1.6.)

**Not obvious from the diff:** a turn arc's radius is NOT floored at a
car's lock, on purpose -- flooring it swung the arc wide of a 3.85 m
corner into the next lane -- and the corner question stays open
(DECISIONS.md 5.15.12); the sim's per-frame allocation is about 4 MB
and is queued for its own commit; the servers a session starts die
with it, so the production build is served by a detached process
(`serve-preview.ps1` in the session scratchpad) until the deploy has a
repository.

#### 1.1.2 The first playtest -- 20 September: the chase camera, and wider roads

The maintainer drove `#/map` and said two things: "it's hard to see
what's coming up, it's very hard to control from the current
perspective", and "the road is very restrictive. I think we need wider
roads asap." Both landed the same day, the second as a gameplay call
rather than a realism one.

- **Junctions drawn from the sim's own geometry** (`7bf84b6`): the
  surface polygon, a stop line wherever a car is held, a sign per
  controlled road end -- `junctionsOf` in graph.js, so the screen and
  the rule that stops a car cannot disagree about where the line is.
- **The chase camera** (`src/iso/chase.js`; `bfbde16`): behind the
  car, leading it by 2.6 seconds of travel (14 m at rest, 48 m at
  speed), eased, and turned so the road ahead is up the screen. The
  rotation decision and what it costs the art pipeline are in 5.2.
  The depth key was wrong from stage 0 (z weighted 2 LIFT, should be
  1/LIFT) and the rotation check found it.
- **Wider roads, as lanes.** A road kind's default is now generous:
  a collector is two lanes each way, an arterial and a highway three,
  and only a residential or service street is one (`KINDS` in
  `src/map/format.js`; `lanes` on a road still overrides). The lane
  width stays 3.6 m -- wider lanes were an option and are still one
  if it reads narrow at this camera. The test map's collectors are
  therefore two each way, which is what the maintainer drives on.

  Built so that it does not have to be redone when overtaking arrives:
  - the loader paints lane lines from the same ribbon the surface
    comes from (`surfaceOf`), so a three-lane road draws three lanes;
  - the graph has ONE LEG PER LANE (`road|end#i`): lane 0 is beside
    the centre line, the last lane is the curb; a path exists from a
    lane only into the lane a turn of that kind goes to --
    `laneForTurn`: right turns from the curb lane into the curb lane,
    left turns from beside the centre line into the lane beside the
    centre line, straight on keeps its lane. That is the general
    North American rule as built, NOT yet confirmed by the maintainer,
    and it is the one place the rule lives; lane arrows that change it (dual
    turn lanes, a curb lane that must turn) are a road marking the
    format does not carry yet;
  - a stop line per lane, one sign per road end, and at a skewed
    crossing every lane's line is set back by 1/sin of the sharpest
    crossing angle (capped at 2), because with two lanes the crossing
    road's swept lanes reach further into the box -- the five-way's
    45-degree legs were being clipped without it;
  - the traffic is seeded into lanes and keeps them; NPCs never
    change lane. The conflict table compares paths from different
    lanes of one road like any other pair, and two straights in
    adjacent lanes are 3.6 m apart against the 2.7 m the weave room
    needs, so they do not conflict -- measured, not assumed: five
    minutes on two seeds on the two-lane test map, zero overlapping
    car-ticks;
  - **the player changes lane by drifting**: more than half a lane
    sideways on an approach and the car is in the next lane, its
    route re-picked for the signal from there, its offset re-based
    so nothing jumps; past the line the turn is committed and the
    lane is the turn's. When the signal asks for a turn this lane
    cannot make, the line under the speed says which lane it is
    made from ("left turns are from the left lane"); a signal with
    no such exit says so ("no left turn here"). The drive starts in
    the curb lane.

  **Lane changing for the traffic is now REACHABLE**, which it was
  not while a road was one lane. What exists: adjacent lanes are
  legs that share a `base`, each with its own path, seam and stop
  line; the following model measures the gap to the leader on a
  lane, and the same query on the neighbouring lane's path is the
  gap an NPC would be merging into; the player's `off` is already a
  lateral state a car can carry. What is missing is the decision
  (when a driver wants the other lane: a slower leader, a turn that
  is made from the other lane, an obstruction) and the manoeuvre (a
  blend between the two paths over a few seconds, during which the
  car is on both for the conflict scan). Overtaking is that plus a
  reason to want the lane back. The candidate's five axes have
  something to say in it -- observation before the move, confidence
  in the gap taken, steering in the blend -- so it is exam content,
  not only traffic realism.

#### 1.1.3 The second playtest -- 20 September: the throttle holds, and the corner is earned

Two more pieces of feel, both from the maintainer driving 1.1.2, and
the second is worth more than it looks.

**THE SLIDER HAS A MAINTAIN BAND, AND IT MOVES.** His words: "it
should have a clear section that will maintain steady speed, perhaps
dependant on the speed of the car itself (to maintain higher speeds
will require more fuel input from the throttle)." That is the physics,
so it is modelled as the physics rather than as a dead zone: the road
takes rolling resistance, air rising with the square of speed, and
g times the grade; the throttle supplies a thrust linear in the
slider, running out exactly at 120 km/h on the flat; the point where
the two balance is where the car holds its speed (`holdAt` in
`src/sim/player.js`), and it climbs with speed -- slider 0.19 at rest,
0.34 at 50 km/h, 0.56 at 80 -- and with the road, off the top of the
slider up stage 0's 23% hill above 60 km/h, and onto the BRAKE going
down it. Around that point the throttle holds the speed exactly across
a band 12% of the slider's travel wide (`HOLD_W`), so holding a speed
is finding the band and staying in it as it moves: something the
player does, which is what makes smoothness a skill and what the
assessment model will read as pace later -- a driver who cannot hold a
steady speed is the same fault whoever is driving.

**The band is drawn.** A moving equilibrium the player cannot see is
guesswork, so `drawSlider` paints it where `holdBand` puts it, blue,
with a line at the point and "hold" beside it; the thumb turns blue
and says HOLD inside it; "can't hold" appears above the track when the
hill costs more than the engine has. Built with the model, not after.

**THE CORNER HAS TO BE EARNED.** His words: "the signal to turn
strategy can work, but we need to make sure players are going the
correct speed to actually make the turn well and reward them for doing
so." So inside the box the commit still turns the wheel for the arc,
but THE TYRES DECIDE whether the car can do it. The arc at this speed
asks for a sideways acceleration; below `CLEAN` the turn is clean and
the speed is carried out; between `CLEAN` and `GRIP` the tyres scrub
speed off, harder toward the limit; past `GRIP` the car gets only
GRIP's worth of turning and runs wide -- and the wheel still works, so
a fast entry can be steered at, up to the same limit. `CLEAN` is not
chosen: it is what the maintainer's 26 km/h costs on this map's 12.7 m
left-turn arc (4.1 m/s^2, 0.4 g); and his 22 km/h for a right is what
the same number gives on the 9.3 m curb-lane right at the crossroads,
which nobody typed in. Swept in `tools/measure/turn.mjs`, held in the
band through the box, wheel straight:

| entry | crossroads left, 12.7 m | curb-lane right, 9.3 m |
|---|---|---|
| 12-24 km/h | clean, speed carried out | clean (to 22) |
| 26 | clean (the maintainer's number) | rough, scrubs 3 |
| 30 | rough, scrubs 2 km/h | rough, scrubs 7 |
| 36 | rough, scrubs 6, 0.4 m off the line | wide, 1.3 m off |
| 40 | wide, 1.0 m off the line, scrubs 10 | wide, 3.4 m off |

The outcome is said on screen: the corner's speed beside the car's
while the turn is ahead (green, amber, red as the car exceeds it), the
verdict for a few seconds after -- clean turn, rough turn and what it
scrubbed, ran wide, cut the corner, crawled round -- and a running
tally. Checked in `verify-drive.mjs` §6 as properties: clean up to his
numbers and not above, faster never earns a better verdict, a clean
turn carries its speed out, straight on is not judged.

**Why it is worth more than it looks.** It relocates the interesting
part of driving from the intersection to the APPROACH -- the speed
you arrive at decides the turn, so the road before the box is where
the judgment happens, which is the conclusion recorded in CLAUDE.md
("the road between intersections is content, not connective tissue")
reached from the other direction. And it gives the brake half of the
slider a job for the first time: you are slowing FOR something, and
judging how much. Both controls now have a reason to be precise.

**Known, deliberate, open.** The T's right turn is a 4.2 m arc and
wants 15 km/h, which is DECISIONS.md 5.15.12 (is the sim's right-turn
arc too tight?) now drivable rather than argued; if it feels too slow
that is evidence about the arc, not the tyre model. The traffic still
takes corners at whatever speed it arrives at (5.15.13); the player
is judged, the NPCs are not yet. `SCRUB` (3 m/s^2 at the limit) is a
design constant. Grade acts on the player only.

#### 1.1.4 The depth sort, 22 September: the floor is its own layer

The maintainer: "traffic disappears under the intersections and
occasionally under the road while traveling." Diagnosed before it was
touched, with a check that did not exist (`verify-paint.mjs`: every
car in the frame against every surface whose footprint it is inside,
at 24 rotations from 4 cameras, on the test map and on stage 0):
706 misdrawn car-frames in 96 on the map -- 439 under roads, 128
under junctions, 139 under the deck -- and 52 on stage 0's own road.

**It was the roads getting wider, not the camera turning -- and not
the seams.** The maintainer's correction, "the cars were disappearing
occasionally on any view", pointed at the fixed view, and
`tools/measure/paint.mjs` took the fixed view apart by case against
the renderer as it was: on A-west, the road that runs ACROSS the
view's depth axis, 113 of 113 cars were misdrawn, at segment seams
and mid-segment alike; on A-north, along the axis, 0 of 113; on the
bent road about half, wherever the bend turned across; in every box,
every car. Seams made no difference because the renderer never looked
one up: a car was keyed by its own centre, plus 10, and a segment by
its nearest corner. That 10 covered a 7.2 m road (a far-lane car is
at most 7.9 behind its segment's nearest corner) and not a 14.4 m one
(15.1 for a car in the far lane of a road across the axis), and never
a junction surface (20 or more). So the box was always wrong and the
open road wrong whenever it ran across the view -- "consistently at
intersections, occasionally while travelling" -- at any camera angle.
The key does rotate with the view (`viewOf`, checked in
verify-chase), so rotation only made every orientation happen.

**The fix is a layer, not a bigger pad.** A flat surface at ground
level cannot hide anything standing on or above it, whatever its
size, so ground cells, ground-level roads and junction surfaces are
painted first, sorted among themselves by the rules that keep tarmac
over grass and the box over the ribbons; everything with height --
cars, signs, props, piers and decks -- is painted after, by depth. A
deck can hide what is under it, so it stays in the second layer, cut
into pieces no wider than a lane and half a segment long; a car on a
deck is keyed past the widest piece's own key span, measured from the
pieces as built; a car under a deck needs nothing, because the piece
over it is a deck's height further in by construction. After: 0 of
706, 0 of 52, and sabotaging either half of the rule fails the check
(36 and 72 misdrawings when ground cars are keyed too far).

What it does not do: hide a car behind a hill's crest (the terrain in
front of a car is painted before it, as it always was), and it does
not change the cost -- the same items, one extra sort key.

#### 1.1.5 The land the map implies, 23 September: a road that climbs is not a bridge

Written by the session that hung on 22-23 September, committed
unverified as a checkpoint by a stand-in agent (`443ddbe`), and found
green afterwards on every check that runs -- `verify-map`,
`verify-paint`, `verify-graph`, `verify-wheel`, `verify-chase` and
`verify-perf` all pass. See 1.1.7 for what "every check that runs"
means.

**A map carries no terrain and the renderer was guessing.** Terrain is
the editor's business (section 4), so until it exists the ground was
flat -- and `isDeck` called anything more than a metre above the ground
a bridge. With the ground flat, the test map's A-B road, which climbs
6 m, read as a slab in the air with piers under it.

**The quantity that actually decides is which road spans which, and the
loader already knew it.** A crossing now records which road is `over`,
and every road point carries a derived `bridge` flag spanning
`gap / MAX_GRADE` either side -- the span a road that high cannot have
come down to the land within, at its own steepest allowed grade. So it
is derived from the clearance rather than chosen. `isDeck` reads the
declaration; roads that carry none -- anything hand-built rather than
loaded -- keep the height test.

**And the land is what the roads say it is.** `groundFor` in
`map/load.js`: a Laplace solve on a grid as coarse as the ground mesh
drawn from it, with every non-bridging road point pinned and everything
else the average of its neighbours. It meets every road that is on it
(0.102 m out on average over 966 points, 1.66 m at worst, at the
bridge's own ramp), rises with the hill -- A-B climbs 6.0 m and is
never more than 0.62 m above the ground -- and leaves 2.3 to 6.3 m of
air under the overpass. Solved once per map, in 4 ms.

The exclusion is load-bearing and is checked by sabotage: include the
bridge's own points and the land rises over 15 points of the road
beneath it.

**Still flat where nothing stands on it.** This is not terrain -- it is
the smoothest surface the roads admit. Real land, and a hill with
nothing on it, arrive with the editor.

#### 1.1.6 A road is driven at the speed it posts, 23 September

The last relic of the fixed road. `map/load.js` has derived a speed per
road since the format existed -- the kind's default, the road's
override, lowered where a bend cannot be taken at it -- and `seedGraph`
threw it away and drove the whole map at one number, so a residential
street and an arterial were the same road to drive.

Every leg now carries its own road's posted speed, because the leg is
what a car knows it is on; `postedAt` gives the limit for the road a
route comes in on. A car is drawn already driving to the limit of the
road it enters on, and the limit is re-derived at each node from the
road it has just joined, through the same `wantedSpeed` the spawn used.

**Off by default** (`seedGraph(..., { posted: true })`), so every
existing caller gets the world it always got -- `verify-equivalence` is
green and the test map's posted-50 roads measure identical either way,
9 of 9. That partition is the evidence the change is confined.

Two things decided rather than defaulted. `road.speed` still sizes the
geometry -- `reachFor`, the warm-up, how much road there has to be --
and under posted speeds it is the **fastest** road on the map, never an
average: those are bounds, and a bound from the fastest road is long
enough for every slower one. So turning this on can only make an
approach generous, never short. And the limit changes at the **node**,
not at the road boundary mid-box, which is where a driver reads the
next road's sign anyway.

Measured, controlled, one flag the only difference: C-A 47 -> 38 km/h
and C-southeast 61 -> 49. C-A is worth noting -- it posts 40 only
because the loader lowered it for its own bend, so the bend clamp now
reaches the traffic rather than stopping at a warning. The limit moves
and the DRIVER does not: boldness relative to the limit spreads 0.182
against 0.160, because `caution` is the person.

`verify-graph.mjs` section 7, sabotaged before being believed (stub
`postedAt` to null and three checks fail).

**Not wired to a screen.** `#/map` still passes its own kmh, so nothing
Jay drives changes until he asks for it. The open question is his: should
a 40 street feel like one, and is the bend clamp's 40 on C-A right?

#### 1.1.7 What can and cannot be checked away from Jay's machine

Established 23 September, in a Linux sandbox with the repository mounted
and **no install permitted** (the installed packages are his Windows
build; installing over them would break his machine).

**35 of the 38 `.mjs` checks were run there and all 35 passed, and so
did `verify-scoring.py`.** They are plain scripts over pure-JS source
with no dependency beyond node, which is the property that makes this
work and is worth keeping deliberately. Of the other three, two
(`verify-world`, `verify-candidate`) run correctly and were simply not
given the wall clock to finish -- see below -- and one cannot run at
all.

**`verify-screens.mjs` is the one that cannot run**, and it is the one
that matters most for a component change: it bundles each screen with
vite's own SSR build, and vite's native bindings (`rolldown`,
`lightningcss-win32-x64-msvc`) are platform-specific. So an agent
working away from Jay's machine can verify all of the engine and none
of the screens -- which is exactly the blind spot CLAUDE.md's
twenty-increment Examiner bug came out of. A change touching
`src/apps/*`, `App.jsx` or `theme.js` should not be made there.

Two practical notes for anyone working in such a sandbox. **Nothing
survives between shell calls** -- background and detached processes are
killed when the call returns -- and calls are capped at about three
minutes, so `verify-world` (4 min) and `verify-candidate` (6.5 min)
cannot be completed there; they start and emit progress normally, they
simply do not fit. And the repository mount **permits create and rename
but not unlink**, so git leaves `.git/*.lock` files behind and the next
git write fails with "another git process seems to be running"; renaming
the stale lock aside is what clears it.

**And one thing that is not the sandbox's doing: the working tree's line
endings have drifted to CRLF while every blob in the repository is LF.**
Found on 23 September across 46 tracked files, docs and source alike.
There is no `.gitattributes` and `core.autocrlf` is unset, so nothing is
normalising anything and something on the Windows side is writing them
out CRLF. The cost is that git reports those files as entirely rewritten
-- the 22 September checkpoint reads as 24,900 insertions when five files
actually changed -- which buries real work in noise and will spoil blame
on all 46. `git diff --ignore-cr-at-eol` is the way to read such a diff
until it is fixed; the fix is a `.gitattributes` with `* text=auto
eol=lf` and one `git add --renormalize .` commit, and it is Jay's call
because it touches every file in the repository.

#### 1.1.8 The refocus, 23 September: back to the traffic simulator -- and traffic signals

The maintainer drove 1.1.3 and liked it ("drives well", the throttle's
hold band liked), then refocused the project in his own words: "the
main project was to create a traffic simulator that happens to have a
great driving system within it, let's get back to that." That is the
ordering principle from here: the world and its traffic before more
polish on the car. His list, in the order it is being built: varied
intersections and traffic signals; a direct control on how many cars
are on the map, with higher defaults; roads that feel different; a
braking mechanic to match the throttle's; and the turn presentation.

**Why signals come first, and why they fix the turn.** "Turning is
awkward because the turn speed indicator encourages a smooth turn but
every intersection is a full stop." The cornering model is right (he
said so) and could not express itself: from a stop the speed through a
corner is decided by how you pull away, not how you arrive. It only
means something at an intersection you drive THROUGH -- a green, an
uncontrolled leg, the through road of a two-way stop. So most of
"turning feels awkward" is fixed by the map having places you do not
stop at, and the presentation work comes after.

**TRAFFIC SIGNALS (`src/sim/signal.js`), and the design rule that kept
them from being a second rule system: a signal resolves, at every
instant, to a control the sim already had plus ONE new state.** Green
is an uncontrolled leg (a left turn still yields to the oncoming, which
is exactly a permissive left and needed no new code). A red right turn
is a stop sign -- which IS right-on-red: a full stop, then a gap, per
the maintainer's earlier ruling. A red for anything else is the new
state, HOLD: wait, gap or no gap. An amber holds a driver who can still
stop comfortably and releases one who cannot, decided per car from its
own speed and the sim's own braking rate, so the dilemma zone is
physical rather than authored. `signal-no-right-on-red` is the posted
exception, per approach.

The phases are derived from the geometry: approaches on one axis share
a phase because their straights do not conflict, so a crossroads gets
two and a five-way three with nobody writing a number down. Amber is
the reaction floor plus the time to shed the road's speed at the
comfortable rate; all-red is the time to clear the box. GREEN_FOR (20
s) is the one design constant, because how long a phase runs is a
demand choice, not physics. The renderer draws the heads from the same
`lightAt` the drivers obey, so the screen cannot show a green to a car
the rules are holding.

**Two bugs found by measuring rather than looking, both fixed:**

- **A red was not a gap -- but nothing said so.** A car stopped at a
  red with no conflicting traffic in front of it had "accepted" its
  gap, because accepting was only ever about traffic: 20 of 56
  launches from rest were on a red, 13 of them left turns. The light
  now gates acceptance and the undue-delay clock both, so a driver
  waiting properly at a red is never marked for the wait the light
  imposed on them (the trap: a red road with nothing crossing it looks
  open to every test but the light). After: every launch on a red is a
  right turn, and every one came to a full stop first.
- **At the green onset both queues are standing at the line**, and "a
  stopped vehicle claims nothing" read the oncoming queue as an open
  road: a left-turner and the oncoming straight launched in the same
  tick and met in the box (one meeting, eight car-ticks, in five
  minutes on the varied map). An oncoming car at rest at its line has
  not given up its priority -- the exception the two-way stop already
  made -- but ONLY for a left-turner who is also standing at their
  line. Applied to one still rolling up, yielding switched on without
  warning and 800 car-ticks of full braking appeared in five minutes,
  against 4 without it. Narrowed, it is 3 and 0.

**THE MAP IS FOUR KINDS OF PLACE** (`src/map/samples.js`): the
crossroads is signalised, one T is a two-way stop on its minor leg, the
five-way is an all-way stop, and the other T is uncontrolled. The drive
starts heading south into the lights. Four minutes on it: 244 cars, no
overlapping car-ticks.

Checked in `tools/verify-signal.mjs`: phases derived; no two conflicting
paths ever open at once, against the layout's own conflict table over
the whole cycle, at a crossroads and a five-way; equal shares; the
intervals derived; per-driver control directly (green, red, right on
red, posted no-right-on-red, both sides of the amber dilemma); in five
minutes of traffic only rights launch on red and only after stopping,
the delay clock never runs at a red, harsh braking stays under 0.001%;
and a controlled comparison -- one car alone at the line, the light the
only difference -- that the HOLD is what does the work.

What it does not do yet: offsets between signals (a green wave -- one
`offset` on the plan), actuated signals that respond to queues,
protected left arrows, pedestrian phases, and an amber the traffic can
misjudge. The first two are the obvious next steps for a traffic
simulator; the last is exam content (a candidate running an amber is a
real fault) and waits for the exam mode.

#### 1.1.9 How many cars: a number the maintainer sets, 24 September

"We know we can push the cars on screen, that needs to reflect in the
available testing scenarios. Perhaps a way for me to directly determine
how many cars are in the map." A spawn interval does not do that: the
count on the road is whatever the interval, the map and the queues
settle to. So a world can carry a TARGET (`seedGraph(..., { target })`):
the edges top the map up to it, an arrival every `FILL` (0.2 s) while
short and none while full, a car leaving at one edge replaced at
another. Lowering it stops arrivals and lets the map drain through its
exits -- nobody is deleted in front of the driver -- and the dial on
`#/map` changes it LIVE rather than rebuilding the world. Kept across
visits in settings.

The range is measured (`tools/measure/density.mjs`, desk machine,
posted speeds on):

| cars | seeding | sim cost per 20 Hz tick | held over a minute |
|---|---|---|---|
| 30 | 0.4 s | 0.08 ms | 30 |
| 120 | 0.5 s | 1.1 ms | 120 |
| 200 | 1.6 s | 3.0 ms | 200 |
| 300 | 2.1 s | 6.2 ms | 267 -- the map saturates |

So the dial runs 10 to 300 and starts at 120, five times what the
screen used to carry (the old rate put about 37 on it). The sim's cost
is quadratic in the count, as the table shows, and a phone is several
times slower than this machine: 300 is the stress end, not a default.
What the renderer costs on top is the phone's question, and the
instrument on `#/iso` still answers it.

Checked in `verify-graph.mjs` section 8: 120 held at 119.9 on average,
never below 116; the old rate carries 37, so it is the target doing it;
lowered to 40, nobody arrives while the map is over it, it drains in
92 s and then holds 40; raised to 200, it tops up within a minute, with
nobody through anybody.

#### 1.1.10 Roads that feel different, 24 September

"We need different roads and they need to feel different to get a good
sense." Three things, in the order they reach the driver's seat:

- **Every road is driven at the speed it posts** -- the flag from 1.1.6
  is on for `#/map`, so the traffic on the arterial runs at 60 and on
  the residential streets at 40. The single "Limit" choice is gone; a
  speed-limit sign sits beside the speedometer showing the limit of the
  road you are on, red when you are more than 3 km/h over it.
- **The map has three kinds of road** (`src/map/samples.js`): an
  ARTERIAL east-west through the lights, three lanes each way at 60; the
  loop's COLLECTORS at 50 with two; the streets off the five-way
  RESIDENTIAL, one lane at 40. The arterial was given a road east of B
  (B-east) so it runs straight through B rather than ending at a T, and
  B became a crossroads with the arterial as its through road and the
  collector stopping -- the two-way stop the map already had, now the
  right way round for the roads it joins.
- **The centre line says what kind of road it is**: a solid double
  yellow on the arterial, the broken single on a collector, nothing on
  a residential street -- the cheapest cue of the three and the one a
  driver reads first.

**A limit found on the way, and it is the maintainer's.** A three-lane
approach into a T strands its middle lane: there is no straight ahead,
and `laneForTurn` lets a right go only from the curb lane and a left
only from beside the centre line. What the middle lane may do there is
a road marking the format does not carry yet -- a lane-use arrow -- and
a traffic-law question rather than something to guess, so the arterial
was routed through crossroads instead of into a T. Surfaced, not
decided.

**The crossroads corners now want more speed, and that is correct.**
The left from A-north now turns onto a three-lane road, so the box is
wider and the arc is 17-18 m instead of 12.7: its clean speed is 31
km/h, and the curb-lane right onto the arterial is 26. `CLEAN` has not
moved -- it is still the maintainer's 26 km/h on a 12.7 m arc -- and the
corner wants what that constant says an arc of this size wants. The
table in 1.1.3 describes the old geometry. `verify-drive.mjs` section 6
now checks every corner against its own arc rather than against a
number about one map, which is what let this change without anybody
touching the check's meaning.

Checks restated against the new map rather than loosened: the entry
count is derived from the map's own dangling road ends (a literal went
stale the moment the map gained an arterial); the posted-speed
comparison runs its "one limit" world at the fastest road's limit, so
the flag is the only difference (comparing at 50 moved the geometry
too); boldness is measured against the limit in force; and the T tests
use D, the T that remains. Traffic on the new map: four minutes at 120
cars and at 200, no overlapping car-ticks.

What would make roads feel more different still, and is not built:
parked cars along residential curbs (they narrow the street and hide
what comes out of it -- the old engine built them, 1.1's segment
hazards), sidewalks and roadside by zone, and lane-use arrows.

#### 1.1.11 The brake's answer to the hold band: the pressure that stops you at the line, 24 September

The maintainer liked the throttle's hold band and said braking needed
"something similar" without yet knowing what. The shape proposed and
built is the same one: a MOVING CORRECT VALUE the player tracks, drawn
on the slider.

A car at speed v with d metres to where it must be at rest needs a
constant deceleration of v^2/2d; `stopBand` in `src/sim/player.js`
inverts the pedal (`sliderFor`, a bisection on `accelFor`, which is
monotone) to the slider position that gives it. **Hold the thumb on
the white bar and the bar stays where it is**, because a constant
deceleration keeps v^2/2d constant all the way in; leave it late and
the bar slides down the brake -- the stop you need grows the later you
start it. The orange band around it is every pressure that brings the
car to rest between the line and two metres short of it (the sim's
own `AT_LINE`, the reach within which the sim counts you as at the
line). "can't stop" appears under the slider when full brake is no
longer enough.

**Two things beyond the proposal, and why.**

- **The marker is for whatever the rules say to stop for, not only the
  painted line.** It reads the same `whatStops` every car in the sim
  obeys: a stop sign until you have stopped, a red, an amber you can
  still make (so the amber dilemma is visible -- the marker appears if
  you can stop and does not if you cannot), a car with the right of way,
  or a car standing ahead of you, in which case it targets the
  standstill gap behind it. A marker computed from the line alone would
  ask a driver in a queue to stop inside the car in front. It never
  appears where nothing is to be stopped for (checked on the through
  road of the same crossroads: never, in six seconds of driving).
- **The stop is judged, like the turn**, on the maintainer's own rule,
  manner before position (CLAUDE.md, the three-way stop split): a stop
  that braked harder than `HARSH_AT` (twice the comfortable rate) is
  "harsh stop" whatever it ended; a controlled stop more than two metres
  short is "stopped short"; one with the nose over the line is "over the
  line"; otherwise "clean stop". Stops behind another car are not judged
  -- where you stop there is the other car's doing. The verdict shares
  the line under the speed with the turn verdict, and a running tally of
  both sits under it.

**The marker is not perfectly still when held, and that is the
physics.** The brake adds to what the road and the air take, and the
air takes less as the car slows, so a fixed pressure decelerates a
little less on the way in: held from 89 m out at 50 km/h the bar eases
down 5% of the slider over the whole approach. Making it perfectly
still would mean a brake that commands a deceleration rather than a
force, which no car has. Leaving it late moves it ten times as far.

Checked in `verify-drive.mjs` section 7: the marker is exactly v^2/2d
through the pedal; the band reaches two metres short; full brake cannot
stop 50 km/h in 8 m and says so; on a stop-sign approach at 50 km/h the
marker appears 89 m out, and tracking it is a clean stop 0.04 m from
the line at a peak of 1.0 m/s^2; holding speed until the stop needs
more than `HARSH_AT` makes the marker slide ten times as far and the
stop is judged harsh at 7.8 m/s^2; a smooth stop aimed six metres short
is judged short, not harsh; and on the through road there is no marker.

#### 1.1.12 The turn's presentation: one braking mechanic, for stops and corners, 24 September

"Turning is awkward because the turn speed indicator encourages a
smooth turn but every intersection is a full stop. The cornering speed
is correct, just the presentation needs work." Most of that was the map
(1.1.8 gave it places you drive through). The rest was the advice
itself, and it is fixed at the root rather than restyled:

- **Where a stop comes first, there is no corner advice at all.** From
  rest the speed through a corner is the pull-away's, not the
  approach's; advice about arriving at 26 km/h on an approach that ends
  at a stop sign was the contradiction the maintainer felt. The stop
  marker (1.1.11) is shown instead.
- **Where the car drives through a turn, the corner gets a marker on
  the slider exactly like a stop's**, in teal instead of orange: the
  pressure that brings the car down to the corner's speed by the start
  of the arc (`slowBand`). A stop is the case where that speed is zero,
  so braking has ONE mechanic -- get to the speed you need where you
  need it -- and the turn's advice is where the thumb is, not only in
  words at the top of the screen. The words stay, as the label.
- **The bar aims at the middle of the clean band, 90% of the corner's
  clean speed**, not the clean speed itself, which is the edge of
  "clean": a bar on the edge rewarded a driver who tracked it perfectly
  with a rough turn (measured: 15 km/h into a 14 km/h corner). And it
  stays up until the car is at the bottom of the band, not merely under
  the clean speed -- vanishing early left the driver holding the edge
  speed into the arc.

`CLEAN` is untouched; the cornering speeds are what the maintainer
called correct. What moved is when the advice appears and where.

Checked in `verify-drive.mjs` section 7: turning right at a stop sign
shows no corner advice and only the stop marker; turning right through
the uncontrolled T at 50 km/h, the corner marker appears and tracking
it arrives at the arc at 13 km/h for a corner that wants 14, and the
turn is judged clean.

That right turn at the T wants 14 km/h because its arc is 3.6 m -- the
tight right-turn radius that is DECISIONS.md 5.15.12's open question,
still the maintainer's to rule on.

#### 1.1.13 Lane changes, from the ratings -- 24 September

The brief: lane changing and overtaking "as behaviour arising from the
ratings rather than as a manoeuvre the AI performs on cue", reading "as
drivers with different temperaments, not one lane-change algorithm",
without undoing the performance headroom. `src/sim/lanechange.js`.

**Each part of the manoeuvre is decided by the axis that governs it.**
- CONFIDENCE decides whether, and how tight. The speed gain it takes to
  bother scales with `caution` (LC_GAIN, 2 m/s at caution 1, a flagged
  design constant), and so does the gap taken, against stage 0's own
  following model: a competent driver moves only into the gap the car
  behind would leave them; a bold one takes as little as a third of it,
  never less than 1.5 m bumper to bumper.
- OBSERVATION decides whether the gap was seen. A car beside or just
  behind in the target lane is the blind spot; a driver can skip the
  check with a probability that grows with their observation deficit,
  start into the space, register the car after their registration
  delay (the old engine's REACTION_FLOOR + deficit x REGISTER_SPAN) and
  swing back to the lane they left. The abort is the fault an examiner
  would see; nobody touches.
- STEERING decides how cleanly they arrive: the blend takes longer and
  runs past the new lane's centre by up to half the room -- the weave's
  own bound -- in proportion to the deficit.
- And a rule that is not a rating: a driver never leaves the lane their
  turn needs. Changing lane to MAKE a turn is a second behaviour, not
  built.

A clean change takes 3.8 s, derived: a smoothstep lateral move of one
lane peaks at 6L/T^2 sideways, set to the road's own comfort limit
(course.js LATERAL, 0.15 g). The car switches route at the START of the
change and is in both lanes for following until it ends, so the car
behind in the new lane eases off for it and the one in the old lane
keeps seeing it. Decisions are made twice a second, staggered, and only
for cars held up by a slower one -- which is most of why it is cheap.

**Measured, three seeds, 200 cars, two and a half minutes each
(`verify-lanes.mjs`):** 242 lane changes by 1174 drivers; per driver,
bold 0.52, middle 0.28, timid 0.07 -- bold drivers change 7.9 times as
often as timid ones; 14 changes by bold drivers took a gap a competent
driver would refuse (tightest 0.39 of the requirement), none by drivers
at or above competent caution; of the times a driver considered a change
with somebody in the blind spot, poor observers failed to see them 22%
of the time and good ones 2%, and 13 of 14 misses ended in an abort;
overshoot 0.30 m for poor steerers against 0.05 for sound ones. No car
changed out of its turn's lane, none was mid-change past a line, none
jumped, none touched -- at 120, 200 and 300 cars.

**The cost, by controlled comparison** (same map, seed and count, the
behaviour off and on, warmed and interleaved): 5% of the sim's tick at
120 cars, 2% at 300. It does not eat the headroom. Separately, and worth
knowing: the arterial added in 1.1.10 made the map itself dearer --
about 9 ms a tick at 300 cars on this machine against 6 before -- which
is the map, not lane changing, and is what the `#/map` dial at 300 on
the phone will show.

**Three things lane changing found, fixed or recorded:**
- **A stop line inside another road's turning path.** The crossroads'
  north approach is crossed at a shallow angle by the bowed road, so its
  line is set back 23.7 m -- and turns began at the line, so a left
  from there swept a 25 m arc through the spot where westbound traffic
  waits at its red (sixteen overlapping car-ticks in two minutes at 300
  cars, visible only once lane changes filled that lane). A driver
  released from a line that far back drives forward and turns at the
  corner, so the arc now starts where an ordinary line would be (graph.js
  `pathBetween`). At a square crossroads the two are the same point:
  the compass equivalence is still exact. `verify-graph.mjs` section 9
  now checks the general property at every node -- no path within half a
  car of a car waiting at another road's line -- and fails (0.73 m) with
  the old turn start put back.
- **The warm-up clock.** Lane changes begun during the warm-up kept a
  start time forty seconds in the future after the clock was reset, so
  their cars sat a lane off, in both lanes, until it caught up -- the
  exact trap CLAUDE.md names ("the rebase has to move everything on that
  clock"). Rebased now.
- **Harsh braking at the signalised crossroads rose from 3 car-ticks to
  1383 in five minutes with lane changes on.** The explanation first
  recorded here -- left-turners reaching the line at road speed because
  traffic does not slow for corners -- was only part of it, and the
  correction is in 1.1.14: most of it was the amber decision not
  sticking. Both are fixed there.

Not built: changing lane to make a turn; returning to the right after
passing (whether that is required on an urban multi-lane road is a
traffic-law question for the maintainer, not assumed); signals on NPC
lane changes, which is where knowledge would speak.

#### 1.1.14 The traffic slows for corners, and an amber decision sticks -- 24 September

Two fixes that lane changing (1.1.13) exposed, and one correction.

**THE AMBER DECISION WAS NOT STICKY -- the larger of the two, and the
first explanation missed it.** At an amber a driver who cannot stop
comfortably carries on (signal.js). But the decision was re-made every
tick, so when the red came seconds later a car still short of the line
was ordered to stop there, and stood on the brakes two metres out.
While traffic arrived at road speed it was through before the red and
it hardly showed; once cars slowed for anything -- a turn, a car
changing lane ahead -- it was the bulk of the harsh braking. Made
sticky (crossing.js `amberGo`, cleared at the next intersection): at the
signalised crossroads harsh braking goes from 1383 car-ticks to 23 in
five minutes, with corner slowing off. 1.1.13's account put that
number on left-turners arriving at speed; that was the smaller part.

**THE TRAFFIC SLOWS FOR CORNERS** (`src/sim/corner.js`) -- DECISIONS.md
5.15.13, open since stage 1 of the rebuild. Every turning path has its
corner found once (where the arc starts and ends, its tightest
curvature), and a driver slows to the speed they take it at: the
player's own cornering limit on that arc (`CLEAN`, the maintainer's 26
km/h on a 12.7 m left), scaled by confidence exactly as their road speed
is -- a bold driver hotter, a timid one slower -- and never past what
the tyres can do (`GRIP`). The slowing is a speed to be at by a place,
the same physics as the player's brake marker: the deceleration needed
builds until it reaches the rate this driver PLANS on braking at (the
braking axis) and is then held, so a driver who leaves it late brakes
harder into every corner, as they do at a stop line. It is a second
constraint, and the car takes the harder of it and whatever is in front.

Two versions were measured wrong first and are recorded in the module:
the corner as the nearer of it and the car in front (a driver behind
another car only began slowing when that car turned off), and the corner
as a car standing at the arc (a driver already slow enough still braked
hard closing on it, because the following model keeps a gap behind a
car that never moves).

Measured (`tools/measure/corners.mjs`, five minutes, corner slowing off
-> on): on the test map at 120 cars, left turns reach the arc at a
median 24 -> 20 km/h and at most 64 -> 32; right turns 29 -> 16 median
and 75 -> 33 at most; turns entered faster than the tyres allow 51-77
of ~110 -> 4-7. Harsh braking rises a little (test map 76 -> 128
car-ticks, crossroads 23 -> 52), and the part the corner itself causes
comes mostly from drivers who plan on braking late. The sim's cost does
not move (within 1% at 120 and at 300 cars).

`verify-graph.mjs` section 10: 1% of turns over the grip limit with
corner slowing, 56% without; entry speed as a share of the clean speed
bold 1.07, middle 0.93, timid 0.74; harsh braking for a corner from late
brakers 8 times, sound ones 5 -- the weakest of the three separations,
and reported as it is. `verify-signal.mjs` runs with lane changes and
corners both on again, and its right-on-red claim now has to see the
rule exercised (11 times on lighter traffic over two seeds) rather than
passing on "0 of 0".

What this does not decide: the tight right-turn radius (DECISIONS.md
5.15.12, the T's right at 14 km/h) is still the maintainer's. This
drives the arcs that exist at the speed they allow.

#### 1.1.15 Permitted movements and lane connectivity are the network's -- 24 September

The maintainer's answers to three questions, and the generalisation they
share, which is a CORRECTION to what was built:

- Middle lane at a T: "should be able to turn left or right, and these
  will always need to be connected to roads that can accommodate these
  turns, or the lanes need to converge ahead of the intersection."
- Turn lanes: "left turns should be from the lane beside the center
  line (unless it's a double left turn intersection) and right turns
  from the furthest right lane (again, unless it's a double turning
  lane). the intersection and connecting roads really make the final
  determination there, but in general left turns from the furthest
  left, right from the far right."
- The T's right at 14 km/h: fine provisionally, "real testing will give
  the final say". Left alone; not derived further.

**What was wrong.** One rule at every intersection (graph.js
`laneForTurn`), whose straight-on branch sent a lane into "the nearest
lane the road ahead has" -- so three lanes going straight into two
merged two of them INSIDE the box, silently. The test map had two such
places: both collectors into the five-way continue straight into
one-lane residential streets.

**What is built** (`src/sim/lanes.js`, wired into `graph.js`):
- **A lane's permitted movements are a property it carries.** The
  default is the maintainer's general rule (`defaultTurns`): left from
  the lane beside the centre line, right from the curb lane, straight
  from any, a one-lane approach may do everything, and a lane the rule
  leaves with nothing -- the middle lane at a T -- turns either way. A
  map overrides it per road end (`turns: { end: [[...], ...] }`, one
  list per lane from the centre line out): a double left is two lanes
  listing "left"; a right-turn-only curb lane lists only "right".
- **Lanes land in order from their own side** (`receive`): the k-th left
  lane into the k-th lane from the centre line, the k-th right lane into
  the k-th from the curb, straight lanes in order from the centre (so a
  left-only lane does not push the through lanes out of line).
- **A lane with nowhere to land is an AUTHORING ERROR**, named by lane
  and intersection, with what the author can do about it -- e.g. "at n0,
  lane N|end#2 may go straight into S, which has 2 lanes to receive 3
  straight lanes: give S more lanes, converge the lanes before the
  intersection, or change what lane 2 may do". `graphOf(...).errors`
  carries them; the graph is still built with the refused movement
  simply not offered, so no car is sent into a wall, and it is the
  editor's job to refuse to save a map that has any. Also refused: a
  `turns` that does not list every lane, one naming a movement the
  intersection does not offer, and a lane permitted nothing.
- **The test map is fixed the way a real road would be**: the two
  collectors' curb lanes at the five-way are marked right turn only.
- **Restrictions are visible.** A lane the map restricts gets painted
  arrows on its approach, and the line under the speed says "this lane
  is right turn only" when you are in one with no signal on -- because a
  car turned right where its driver meant to go straight, with nothing
  on screen to say why, is a state the screen cannot express.

Checked in `tools/verify-connect.mjs`: the general rule lane by lane; the
pairing order; the refusals, each naming lane and intersection (three
into two, a three-lane approach into a T of one-lane roads, a double
left into one lane, malformed and impossible `turns`, a lane permitted
nothing); a double left and a three-lane T into two-lane roads accepted;
the test map clean, and refused at exactly its two curb lanes with the
markings removed; and a double left used in traffic from both lanes,
nobody through anybody.

**WHAT IS NOT BUILT, AND WHAT IT NEEDS -- designed here because it is
cheap to design in and expensive to retrofit.** The maintainer's other
legal answer is "the lanes need to converge ahead of the intersection":
a LANE COUNT THAT CHANGES ALONG A ROAD. It is the part most likely to
bite, because today a road has one lane count from end to end, and
every layer below assumes it.

*The model needs:*
1. **A lane count per direction as a profile along the road**, not one
   number: sections with a count each, joined by TRANSITIONS -- a lane
   that ENDS (which one: the curb lane, as a merge; or the inner one, as
   a turn bay closing) over a taper, and a lane that BEGINS (a turn bay
   opening before an intersection, the commonest reason an approach has
   more lanes at the line than on the link).
2. **Lanes as pieces between transitions**, not one per road end. The
   graph's lane legs are the lanes present AT the node; a lane that ends
   upstream is a lane with a MUST-LEAVE-BY point.
3. **A forced lane change with a deadline** -- the car in a lane that
   ends has to get out before the taper. This is the same machinery as a
   driver changing lane to reach the lane their turn needs -- BUILT, see
   1.1.16: a mandatory change with a deadline, gap acceptance at the
   driver's confidence, and a missed turn when it cannot be made. A lane
   drop is that behaviour with the deadline set by the road instead of
   the turn, and the one difference that matters: a missed turn has a
   fallback (go where the lane goes) and a lane that ends does not, so a
   driver who cannot get over must slow and wait for a gap at the taper
   rather than give up.
4. **The connectivity check extended**: a lane may end at a taper
   instead of landing in a destination, and the taper must be long
   enough to merge in at the road's speed -- at least the distance a
   clean lane change takes (`LC_TIME` times the posted speed, plus a
   reaction's worth), derived from the same numbers the lane change
   uses, so "converge ahead" is validated as well as permitted.

*The map format needs:* `lanes` to accept a profile -- `{ fwd: [...],
rev: [...] }`, each a list of `{ from, count, ends?: "curb"|"inner" }`
sections by distance along the stroke -- alongside the plain number it
takes today, which stays the one-section case; `turns` per road end
(built); and a MAP_VERSION bump when the profile lands, because the
loader will read old maps as one section and must not read new ones as
old. The loader's surface and lane-line ribbons are built per section,
narrowing over a taper, so the paint follows the lanes.

*The editor needs:* lane count edited per section of a road, with a
handle for where a lane ends or begins and a drawn taper; lane arrows
at each approach as the way `turns` are edited (tap a lane, choose its
arrows) -- the same arrows the renderer paints; and the connectivity
errors shown on the map at the lane and intersection they name, with
saving refused while any remain. Once people other than the maintainer
draw maps this is what stops a map that works nowhere from being
shared.

#### 1.1.16 Drivers change lane to make their turn, or miss it -- 24 September

Permitted movements per lane (1.1.15) made a lane's turn a fact of the
road, and exposed that no driver ever had to change lane for one: every
car chose among its OWN lane's routes, so a restricted lane changed
nothing about traffic. Now a driver arriving at a node chooses an EXIT
from everything the approach offers (`wantFor` in crossing.js), and if
the lane they are in does not make it they drive on in it for now and
carry a `want`. lanechange.js acts on it:

- **A mandatory change toward the nearest lane that makes the turn**,
  with no speed gain asked for, through the same gap acceptance, blind
  spot check and blend as a discretionary one -- so confidence decides
  how tight a gap they will take to get over, and observation whether
  they looked.
- **A deadline set by the driver's own change**: if what is left before
  the line is less than their own blend at this speed, they give up and
  go where their lane goes. A MISSED TURN, counted, which is what a real
  driver who could not get over does. The turn is not re-planned yet; a
  car that missed simply carries on its lane's way.
- **A physical floor under the gap**, whatever the boldness: the gap
  must hold the difference in stopping distance at an emergency stop
  (8 m/s^2) plus a metre and a half. Boldness is taking a gap a
  competent driver would refuse, never one nobody could stop in.

Measured over three seeds at 200 cars (`verify-lanes.mjs`): 276 drivers
arrived in the wrong lane for their turn, 80% got over and made it;
timid drivers missed 19% of those turns and bold ones 14%. That is the
temperament showing where it matters -- the cautious driver who will
not force their way into the turn lane goes the long way round.

**A bug it exposed, in the following model, not the lane change.** At
300 cars, 180 overlapping car-ticks in two minutes, every one at the
five-way: a driver mid-change into the turn lane, followed the car
ahead in the lane it was leaving (13 m/s, 8 m ahead) and not the car
STOPPED 17 m ahead in the lane it was entering, because the leader was
chosen as the NEAREST candidate. It counted only once it became the
nearer, at 7.8 m and 12 m/s -- past stopping. The leader is now the
candidate that constrains the driver most, by the interaction term
`decide` itself reads (`wantedGap / gap`); in a single queue that is the
nearest car, so nothing changes where nobody is changing lane or
sharing an exit. After: 0 overlaps at 120, 200 and 300 cars.

**And two more it exposed, both older than lane changing**, found by
the checks the leader change had to pass:
- *A gridlock at the five-way.* The shared-exit rule (two paths leaving
  by the same leg follow by distance remaining) never asked whether the
  other car had crossed its line. A car still WAITING at its line has
  less of the shared path left than a car in the box, so it read as
  being in front: it held the car in the box, which held it at its line.
  Lowered from 120 to 40, the map was still at 44 two minutes later, a
  queue at the five-way that could never clear. A car now
  counts as in front on my way out only once it is past its own line.
- *Ten metres of lane that did not exist.* Where an angled road makes a
  turn's arc land on the outbound lane short of the box edge, the lane
  offset was floored at the box edge while the path ran from where the
  arc really landed -- so on 29 of the test map's paths every position
  on the way out read up to 10.4 m ahead, and the car behind saw its
  leader leap ten metres back towards it at the seam. It read short,
  so it cost needless braking rather than contact, and it is the
  recurring bug exactly: one distance, measured two ways. The exit now
  starts where the arc lands; `clearAt` does not move. Residual: two
  paths still read 0.58 m and 0.16 m ahead, the arc ending slightly off
  the lane's centreline.

**Cost, measured with the change:** lane changing is 9% of the sim tick
at 120 cars (2.03 -> 2.21 ms) and 6% at 300 (10.10 -> 10.69 ms). At the
320-car ceiling (1.2.2) that is about 0.6 ms of a 16.7 ms frame. It
eats into the headroom rather than the ceiling: the ceiling was set by
drawing, not by the sim, and was measured with lane changes off, so it
wants re-measuring on the phone with this build.

#### 1.1.17 Keep right: the knowledge axis, continuously, on the link -- 24 September

The maintainer's ruling, which makes returning to the curb lane law
rather than style: "that would be a measure of law adherence, since in
Ontario drivers should be moving into the driving (curb) lane unless
there's something in the way or they are making an upcoming left turn."

**WHY IT MATTERS MORE THAN IT LOOKS: it is the knowledge axis's first
CONTINUOUS expression.** Knowledge has been the thinnest of the five
for the whole project -- rolling stops and late signals, both momentary
and both needing an intersection (CLAUDE.md, "an axis is only readable
through errors it dominates"). Lane discipline is visible on every
multi-lane road for as long as a driver is on it, which is exactly the
content the link needed: the maintainer's ruling that the road between
intersections is assessable territory rather than dead air (REBUILD.md
8, DECISIONS.md 5.14.8). It also lands straight in the legal-compliance
layer he proposed for the daytime phase -- lane hogging is precisely
what that would penalise, and the detection is already in the right
shape for it (DRIVING-SCHOOL.md 7).

**What is built** (`lanechange.js`, `reasonToStayOut`; `marking.js`):
- **The exceptions ARE the rule.** A driver out of the curb lane is
  there for a reason, as a fact about the road right now, or failing to
  keep right: `turn` (the lane to the right does not make the movement
  this car is making here -- sitting left before a left is the law),
  `passing` (somebody beside or just behind in that lane: the pass is
  not finished), `inTheWay` (a slower car ahead there, near enough to
  hold them up), and `noGap` (no gap to move back into that a COMPETENT
  driver would take -- waiting for one is keeping right as soon as the
  road allows). The fourth was not in the first version: without it
  sound drivers were marked for a car a little further back than the
  blind spot, 7 of their 162 occasions. A driver mid-change has a clock
  that does not run.
- **The return is a driver completing a manoeuvre, not a car snapping
  back.** The clock starts when the reason passes; the prompt return is
  `RETURN_AFTER` = one lane change's duration (3.8 s, a flagged design
  constant) later, and knowledge stretches it: `RETURN_AFTER / (1 -
  deficit)`. The traffic's median driver returns in 4.4 s; the
  weak-on-knowledge quarter (deficit about 0.7) take 13 s, longer than
  most of an approach, so they sit out there; a driver who does not
  know the rule never returns. Continuous, no threshold typed in. The
  move itself goes through the same gap acceptance and blind-spot check
  as any change, so a poor observer can still start back into somebody.
- **Markable, as KNOWLEDGE.** `keepRight` on the sheet: out of the curb
  lane with no reason for longer than `KEEP_RIGHT_FAULT` = twice the
  prompt return (7.6 s). By construction that is "slower back than a
  driver at knowledge deficit 0.5"; every driver on the sound side of
  the ratings' profile returns well inside it. A design constant and a
  DOMAIN QUESTION for the maintainer: how long an examiner lets a
  driver sit out of the curb lane before it is marked. The fault reads
  the same `hogSince` the driver's own decision writes, so the sheet
  and the car cannot disagree about whether there was a reason.

**Measured** (`verify-lanes.mjs` section 7, three seeds, 150 s, 200
cars; the measurement script is `tools/measure/keepright.mjs`):
- A restatement of the exceptions written from the ruling -- not
  imported -- agreed with the model on all 2035 decisions it judged
  "no reason". Sabotaged by deleting the `inTheWay` exception from the
  model, it disagreed on 694: the check can fail.
- Weak-on-knowledge drivers were marked on 36% of 72 occasions out of
  the curb lane with no reason; sound ones on 2% of 148. None of the
  weak drivers moved back inside the threshold; the rest of their
  occasions ended with the approach running out first -- which on the
  screen is the car that stays out there.
- 107 returns, the soonest 4.0 s after the reason passed, median 4.5 s.
- Cruising out of the curb lane with no reason: 7.2% of the time with
  the rule, 12.5% without it, same seeds. Out of the curb lane at all:
  52% against 57% -- most of the traffic out there is correctly there;
  the largest shares are a turn ahead that the curb lane does not make,
  and the overpass's inner lanes, where nobody can change lane.
- Every driver watched: 29 `keepRight` faults on the sheet, 26 on
  weak-knowledge drivers and 3 on sound; with every driver's knowledge
  made perfect, 3 -- the same count, so those are not knowledge's. Not
  yet examined; the likeliest source is a timid driver refusing a gap a
  competent one would take, which would be confidence showing through a
  knowledge fault at 2% of occasions.
- Cost: keeping right is 2-4% of the sim tick at 120 cars and 3-7% at
  300 across three runs (the spread is run-to-run noise at this size);
  lane changing in all, 10% at 120 and 8-12% at 300. At 300 cars that
  is 1.2 ms of a 16.7 ms frame for all of lane changing, all of it
  added since the phone's ceiling was measured (1.2.2), which had no
  lane changes at all.

**What it does not do, and what that costs on screen.** Lane changes
happen only on the APPROACH half of each link -- the exit half, from the
box to the link's midpoint, is filed under the node behind, and nobody
changes lane there. So a driver who passes on the
exit half cannot move back until the next approach begins, and the left
lane clears more slowly than on a real road. That is the limit most
worth lifting next if the left lane reads as too full. And the overpass's
lanes are separate one-lane roads, so nobody changes lane on them at
all; they are judged neither way.

The CONFIDENCE check in `verify-lanes` now counts overtakes only. It
had counted every lane change, and the day this landed it read 1.9x
where it had read 3.3x. Measured by kind (seeds 3, 4, 5): overtakes
separate bold from timid 5.0x with keeping right off and 8.1x with it
on, while changes for a turn (1.2x, 0.9x) and returns to the curb lane
(0.6x) do not separate by temperament at all -- they are the law and
the route, not boldness -- and they drown the axis. A check whose
quantity other behaviours had started to feed. The first attempt at
the fix read 2.0x for a second reason: it joined lane changes to
drivers by actor id across three seeds, and ids repeat between seeds.

#### 1.1.18 A big arterial: turn bays, protected lefts, and a real spawn bug -- 25 September

The maintainer, having run 300 cars on the test map: "300 cars seems to
work, need advanced intersections to see it really work." Not more
cars -- a richer place for them to be. The test map gains E, east of B:
two three-lane arterials crossing under signals. Every approach differs
on purpose, so one node shows every case: a DOUBLE LEFT and a right bay
from the west, a left and a right bay from the north and east, a left
bay alone from the south.

**A TURN BAY IS A LANE THAT BEGINS**, the other half of the lane count
that changes along a road SIMULATOR.md 1.1.15 designed and did not
build (the half that ENDS -- a lane dropped into a merge -- is still
open). `map/bays.js` is the geometry: a road end declares `bays: {
left, right, length }`, and every lane on that approach -- through and
bay alike -- runs the WHOLE road, lying exactly on its neighbour until
a TAPER begins and easing across over it. That is what lets a bay be
treated like any other lane everywhere the sim already reasons about
lanes by comparing positions across two of them: nothing needed to
learn "not yet a lane" as a separate state. The taper is derived, not
typed: `changeTime(lane) + REACTION_FLOOR` at the road's own speed --
the same numbers `LC_TIME` already uses for an ordinary change, moved
to `core/motion.js` so both sides can call them without a cycle. A left
bay opens the road's MEDIAN, so the double yellow ends up on the far
side of it, painted the way a real one is; a right bay opens at the
curb, one side only.

**A BAY IS FOR ITS TURN.** Under the general rule (`lanes.js
defaultTurns`) a left bay turns left and nothing else, a right bay
right, and the through lanes then carry neither -- "the lane beside the
centre line" the maintainer's ruling gives the left to IS the left bay
where one exists. A car in a bay is placed by its POSITION across the
approach (`pos`, centre line out), not by a lane number, because a bay
sits between lanes without renumbering them; `graph.js` gives every
node a `legAt(base, pos)` and every caller that used to reach for
`leg.lane ± 1` now asks it instead. A bay with nowhere to make its own
turn, or one drawn at a road end that joins no intersection, or one on
a one-way road (no median to open, no oncoming to protect a left from)
is refused at load with a warning, the same discipline connectivity
already had.

**A DRIVER IN A BAY IS THE MANDATORY LANE CHANGE THIS PROJECT ALREADY
HAD** (1.1.16), asking for a leg one place further toward the centre or
the curb instead of one lane number further, and refusing to move into
a bay before it OPENS (`opensAt`, where the taper begins along the
path) -- a want that cannot yet be granted is simply carried a little
longer, exactly as a want the approach cannot grant at all already is.
A discretionary change -- overtaking -- never enters a bay: a bay is
for the turn it is signed for, never for getting past somebody. The
BLEND itself needed one correction: `lateralOf`'s L0 assumed a lane
change always crosses one whole lane, which is true everywhere except
a car entering or leaving a bay ON its taper, where the two lanes are
closer than that -- so `attempt()` now measures the real separation
there and the car does not visibly jump.

**A SIGNAL RESOLVES TO ONE MORE STATE: a LEADING PROTECTED-LEFT ARROW**
(`signal.js`), and the design rule from 1.1.8 holds again -- every
approach carrying `leftArrow` shows a green arrow at the head of its
phase while every ball on the node is red, then amber, then an all-red,
and only then the ordinary green, during which the left is permissive
again. `movementLight(signal, base, intent, t)` is the one function
every reader of the light now calls -- the drivers, the amber-commit
memory, `verify-signal`, the renderer -- because a left obeys the arrow
while it is lit and the ball otherwise, and nothing may read a
different light than the one a driver actually would. A node with no
approach posting an arrow runs the cycle it always did, to the tenth of
a second.

**A REAL BUG, FOUND BY MEASURING: for a car ENTERING the map at an
edge, the exit was drawn from the routes the SPAWN LANE happened to
offer, never from what the approach as a whole could reach.** Nothing
enters the world in a turn bay -- edges are never bays (1.1.16's own
rule) -- so no car spawned already wanting a bay's turn, and at the
arterial not one left arrived from the three edge approaches in the
first traffic run. `arriving()` now chooses like a car already at a
node does (`wantFor`): an exit from everything the approach offers,
carrying a `want` if the lane it starts in does not make it. This was
never a bay-specific bug -- it was there for every restricted lane the
map already had -- and fixing it moved the whole map's missed-turn rate
from 31% to 22% at 300 cars on an unrelated measurement taken before
and after, which is the size of what it was silently costing.

**Measured** (`tools/measure/arterial.mjs`, `verify-bays.mjs`, three
seeds, 300 cars, three minutes): 0 overlapping car-ticks map-wide; every
left through E made from a left bay (157 of 157 across three seeds);
nobody ever inside a bay before it opens; a bay used only for the turn
it is signed for, never an overtake. A bay's lane lies on its
neighbour's to within a centimetre before the taper and exactly one
lane out over the storage, sampled along every bay at the node.

**Cost.** The sim tick at 300 cars rose from a median 10.7 ms to
13.5 ms (of the 50 ms real-time budget) -- the geometry a bay's lane
now carries, evaluated for every car on an arterial approach whether or
not a bay is in play. Seeding at 300 held near its old cost only
because E's roads were drawn short (about 420 m, the test map's old
longest) after a first 700 m draft nearly tripled it -- the warm-up is
capped by the LONGEST road on the map (1.1.9), so one long road taxes
seeding a map that never asked for one.

**A THIRD FINDING, from getting `verify-lanes.mjs` green again after E
landed: keep-right's aggregate margin genuinely narrows at a wide,
busy node, and that is the node working as intended, not a fault in
it.** Two of the suite's checks had gone red together and turned out to
be two different things. `verify-lanes` section 2's abort/missed-check
invariant was a real check bug -- `seedGraph`'s warm-up (1.1.9) hands
back a world with some actors already mid-lane-change, a few already
aborted, and the measurement window only starts counting `missed`
starts from its own first tick, so 3-4 aborts a run had no start to be
counted against; fixed by capturing each driver's abort count at the
window's own start and comparing the delta, plus excluding a change
already missed and in flight at that instant (`watch()`'s `aborts0`
and `carriedMissed`).

The OTHER failure, "the left lane clears," was not a bug. Compared
directly on identical state, the model's `reasonToStayOut` and the
check's own independent restatement of the ruling agree perfectly at
E -- 0 disagreements across 1770 samples -- so the mechanism is sound.
What moved is the POPULATION: node E is three lanes wide and carries
about a third of the map's cruising volume, and being three lanes wide
means a momentary open gap in the lane to the right is common even
while the node is busy overall, which resets the return clock on every
passing "reason" tick. E's own on/off ratio is still a real reduction
(0.875 -- the rule still helps), just a weaker one than a narrower
node gives, and it drags the map-wide aggregate from 0.68 (E excluded)
to 0.79. The check's bound moved from 0.75 to 0.85, with the reasoning
kept beside it rather than just the number, and
`tools/measure/keepright.mjs --byNode` is what it was derived from.

Still open, and the maintainer's calls: whether the double left's two
lanes should read as visibly different in weight on screen (a real
double-left often has one lane favoured), and whether a lane that ENDS
-- 1.1.15's other half -- is worth building before or after the editor
gives someone a way to draw one.

#### 1.2 Production from here on, and the performance budget

**The maintainer's direction, 18 September: this is a production app,
and "production ready" is a bar, not a phase.** The project had run
only on a dev server on his machine, never on a phone, with no build
pipeline, no deploy, no save, no settings, and no error handling worth
the name. Three of those are built and the rest are stage 1 work:

- **One broken screen no longer takes the app down.** Every route
  renders inside an error boundary (`src/apps/ErrorBoundary.jsx`): the
  screen that threw shows what it threw, with a way home and a way to
  copy the details, and the menu keeps working. It has been seen to
  work rather than believed to -- `/?crash#/iso` throws on purpose --
  and it has already caught one real render error on the day it was
  written.
- **A build pipeline and a deploy.** `npm run build` produces the site;
  `.github/workflows/deploy.yml` renders every screen under SSR, builds,
  and publishes to GitHub Pages on every push to `main`, so anyone with
  the link can open it on any device. It needs a repository on GitHub
  to point at, which is the maintainer's to create (SETUP.md 6).
- **Save and settings** through `src/storage.js`, which already falls
  back cleanly when storage is refused: not built yet, and stage 1's.

**The performance budget, measured, not asserted.** Reference device: a
Pixel 7 Pro. In ordinary play, 60 fps; dips tolerated when the scene is
busy; never sustained below 30; and **no hitching** -- the maintainer's
words, and the ruling that consistency beats average: a steady 40 feels
better than a 60 that stutters, so a stutter is the failure. A floor
device is measured too, a mid-range Android two or three years old,
because the reference phone is not what most players hold.

So the instrument (`src/iso/perf.js`) records the things that ARE the
budget rather than an average: the frame 19 of 20 beat (p95 <= 25 ms),
the worst frame (no hitch over 50 ms -- three missed vsyncs), and
whether any whole second fell under 30 fps. `budgetRamp` steps the load
up -- more traffic, then stand-in buildings scattered where the camera
looks -- holding each step for eight seconds after a one-second settle
that keeps the scene build's own stall out of the record, and stops at
the first step that fails. **The cap on visible vehicles is DERIVED from
where the budget breaks on the device in hand**, never picked; it is
the last step that passed. Run from the button on `#/iso`, and the
report is a block of text to copy and paste back.

Two things are known before any phone has run it. `tools/verify-perf.mjs`
drives the ramp with synthetic frames and proves it terminates, stops at
the first failure, ignores the scene build, and derives the cap -- the
preview pane this project is built in delivers no animation frames, so
the ramp could not otherwise have been watched to completion before a
person was asked to spend a minute on it. And `tools/measure/perf.mjs`
measures the CPU half of a frame in node against a stub canvas: on the
development machine the sim step is negligible and the JavaScript of the
draw is 1-2 ms at every step of the ramp, from 37 cars on screen to 245,
with the ground cells a fixed cost that dwarfs the cars. What that
cannot see is the rasterising, which is the phone's whole question, and
the reason the desktop number is a floor and not a forecast. A phone's
JavaScript runs three to five times slower than a desktop's, which
still leaves the CPU half inside the budget at the heaviest step; if the
phone breaks the budget, it is the fill rate, and the levers are the
canvas's device-pixel ratio (a 3.5x screen is twelve pixels per CSS
pixel), the ground drawn as fewer, larger cells, and only then fewer
cars.

**If the density the maintainer wants is not achievable in a browser at
this scale, that is said early and plainly, as a design change -- fewer
cars in view, a tighter camera, simpler geometry -- rather than
discovered in stage 5 with a city built on top of it.** The first phone
report decides which.

##### 1.2.1 What the phone said -- 19 September, Pixel 7 Pro, the dev server

**The headline: on a real phone, on the slow development build
(unminified React in StrictMode), 114 cars and 120 props drew at a
locked 60 fps with no headroom consumed, and both failures so far were
stutters, not limits.**

Run 1 failed the budget at the first step on stalls alone: p50 16.7 ms,
p95 16.8 ms, zero slow seconds, 39 cars and 472 things drawn -- and
eight frames of 100-208 ms in the eight-second hold. Before anything
was changed, two things were measured. `tools/measure/alloc.mjs`
showed V8 on the exact per-frame work does young-generation scavenges
only (292 in 20 s, worst 1.6 ms, no full collections), so the JS heap
cannot produce a 100 ms pause from this code by itself; it also showed
the draw allocating about 4 MB per frame, a rate to cut later. And the
screen issued one React state update a second from inside the frame
loop, which lands exactly eight times inside a step's recorded window.

Run 3 settled it by controlled comparison, the same load twice: with
the update, 8 stalls of 133-158 ms a second apart; without it, zero
and a worst frame of 16.8 ms. Steps 2-4 then held p50 16.7 / p95
16.7-16.8 to 114 cars and 120 props. Step 5 at 154 cars had the same
p50 and p95 and ONE frame of 2642 ms with no cause flag -- a second
stall bug of the same class, not a capacity limit, since a device at
its limit shows a rising p95 long before it shows a stall.

What came out of it, and holds from here on:

- **No React state is written from a frame loop.** The readouts are
  drawn on the canvas from strings refreshed once a second; the DOM
  does not change while the world moves. The Wheel screen had been
  writing state four times a second while the player was driving.
- **The instrument attributes a stall** rather than counting it: how
  long our own callback ran, what the browser saw in the gap (long
  tasks, and Chrome's long animation frame with script against
  style/layout/render and the scripts by file and function), a full
  collection, a DOM update within the last two frames -- the cost
  lands one or two frames after the update, which is why the first
  flag read "no" against every stall it caused -- the tab going
  hidden, input arriving. The ramp's first step is a positive control:
  a state update once a second, so every report measures the thing
  that bit us. The ramp runs to traffic 24 (about 450 cars on a phone
  screen), starts each step's clock after the scene is built, and does
  not stop at a stutter.
- **A build stamp on the screen and on the report's first line.** A
  phone tab that kept the previous modules in memory ran the previous
  instrument and cost a round trip to recognise; the stamp is the
  commit plus the server or build start time, and a stale tab says so.
- **The device is named through client hints**, not the UA string:
  Chrome's User-Agent Reduction reports "Android 10; K" for every
  Android device, and it was misread once as an older phone.
- **The production build is measured from here on** (`npm run build`,
  the `drivedraw-preview` launch entry on port 4173): the dev server
  carries unminified React in StrictMode, which is not what a player
  gets.

Still open: the real ceiling (somewhere above 154 cars), the cause of
the 2642 ms frame (the next run's stall table says), and the floor
device.

##### 1.2.2 THE CEILING, MEASURED -- 24 September, Pixel 7 Pro, the production build over HTTPS

The number stage 1 was waiting for, taken on the deployed site
(`37d10a1`), so the build is the production one and the context is
secure (the device is identified by client hints: Pixel 7 Pro,
Android 17; canvas at DPR 2 on a 3.5 screen).

| step | cars drawn | props | fps | p95 ms | worst ms | hitches | verdict |
|---|---|---|---|---|---|---|---|
| 2 | 78 | 0 | 61 | 16.7 | 16.8 | 0 | locked 60 |
| 4 | 114 | 120 | 60 | 16.8 | 16.8 | 0 | locked 60 |
| 5 | 158 | 200 | 61 | 16.7 | 16.8 | 0 | locked 60 |
| 6 | 245 | 300 | 60 | 16.8 | 16.8 | 0 | locked 60 |
| 7 | 322 | 400 | 57 | 25 | 33.4 | 0 | inside the budget, at its edge |
| 8 | 482 | 500 | 48 | 25.1 | 41.7 | 0 | over: p95 past 25 ms |

**The ceiling: about 320 cars drawn with 400 buildings inside the
budget, and 245 with 300 at a locked 60 fps with nothing to spare
spent.** Zero hitches at every load step -- the stutter class of bug
found on 19 September is gone on the production build as well. The
DOM probe (a React update from the frame loop, on purpose) still
costs a 58 ms frame each time, so that rule still matters.

What this does and does not measure. It is the RENDERER and stage 0's
traffic (`#/iso`); the map's own sim is quadratic in the car count
(1.1.9: 6.2 ms a tick at 300 on the desk machine, and a phone is
several times slower), so the car count on `#/map` may meet the sim's
cost before the renderer's. The `#/map` readout shows fps: the dial
at 300 is the test. And "cars drawn" is cars on screen, not on the
map -- the map holds more than the camera sees.

**Run by the maintainer on his phone, 25 September: "300 cars seems to
work, need advanced intersections to see it really work."** So 300 on
the test map passes by feel, and the test map is now the limit on what
300 cars can show rather than the phone -- the next stress is richer
intersections, not more cars.

What it means for the plan: the default of 120 on the map is well
inside, the dial's 300 is at the renderer's edge, and a world of the
size SIMULATOR.md 1 describes has room for dense traffic in view as
long as the sim only works hard on what is near. That -- simulating
far chunks cheaply -- is the performance question stage 5 (the city)
will have to answer, not the renderer.

The report's cap line read "held up to 322 cars... broke at step 1
(DOM probe)", which contradicts itself: the probe hitches by design
and was being counted as the break. Fixed in `perf.js` -- the probe
is reported on its own line as the control it is.

### Stage 2 — the editor, first version -- BUILT, 27 September

Section 4. Draw, set kinds and elevation, snap to nodes, set controls,
validate, save, drive — in one screen.

*Deliverable:* `#/editor`: the maintainer draws a map and drives it in
the same session. The first throwaway test maps are his.
*The question:* can a badly drawn map break the sim? (Try to.) Is
drawing a road pleasant enough that he will draw eight square
kilometres of them? -- the first half is answered (eleven adversarial
drafts, none broke validation, section 4 above); the second is his to
answer by using it.
*Cost:* one to two weeks estimated; shipped in one session, v1 scope
(section 4 above says what that leaves out).

**Before the maintainer draws his own city (1 October): the two rough
steps, fixed.** Walking the path from a blank map to a drivable city found
two places it asked too much of him:
- **Every intersection he drew started uncontrolled**, and setting one was
  four separate edits (each road, each end). The **Intersection** tool
  sets a whole intersection in one tap -- all-way stop, stop or yield on
  the minor road, signals, or none -- through the same `setRoadControl`
  the end-by-end edit uses (editor/model.js `setIntersection`). A road
  running straight through is split there first; the minor road is the
  lower kind, or the stem of a T of one kind; at four equal roads
  "minor" is refused in words.
- **Bus stops could not be placed at all** -- they existed only in the
  Buses test map's code. The **Bus stop** tool puts one beside the road
  tapped, on the side tapped, just beyond the curb (or the parking strip),
  and the panel makes it a curb stop or a bay; the loader decides the
  direction it serves and refuses by name one it cannot place.
Both held to `verify-editor` section 19. Still open, and his to answer:
whether he draws on the PC or the phone -- maps saved in the library live
in one device's browser, and moving one between them today is Download
JSON, carry the file, Open a file.

### Stage 3 — the exam mode, as a reinterpretation

Moved up from the end of the path, because section 1.1 made it cheap:
the base game with steering removed and the other two controls
reinterpreted. A candidate driven by the model takes the player's seat;
the player's turn commit gives the direction; the slider's lower half
eases the candidate off or brakes for them, graduated. The shelved sheet
(section 2.2) comes back unchanged for the four faults the sim already
derives, marked deferred as before. Nothing about the controls changes
for this stage — that is the point, and the caution.

It sits here rather than after the city because it costs days and
because the reinterpretation is worth checking early: does giving a
direction with the turn control feel like giving a direction when you
are not the one steering? Does easing the slider read as "slow down" to
a passenger? Those are questions about the mapping, and they are cheap
to ask on a test map. It is NOT here because it is the priority; the
priority is stages 4 and 5, and if this stage ever competes with them
for time it yields.

**WHY IT GOES BEFORE THE CITY, 27 September -- and the reason is
sharper than "it is shorter".** The city is three to four weeks whose
value depends on the game being worth playing, and the thing this
project is ultimately for -- riding along, giving directions, catching
faults -- has never been tested. The maintainer knows from doing the
real job that it is interesting; what has never been established is
whether what has been built CONVEYS it. Building a world for three
weeks before finding out whether the thing you do in it is enjoyable is
exactly the mistake that cost the first engine. The rule above that
this stage yields when it competes with the driving does not apply,
because it does not compete: days against weeks, and the editor
question is his to answer in parallel, by using it. Stage 5 follows
straight after, without waiting.

**The guard on it: do not let it grow.** It is the reinterpretation of
controls that already exist, not a new system. The moment the work
turns into building assessment machinery rather than reinterpreting
controls, stop and say so -- that is the failure this ordering exists
to avoid.

*Deliverable:* `#/exam?id=test-1`: ride with a rated candidate on the
stage 2 map, give directions with the turn control, intervene with the
slider, get a sheet.

**BUILT, ROUGH ON PURPOSE, 27 September** -- `#/exam`, `src/sim/exam.js`,
`src/apps/ExamRide.jsx`, `tools/verify-exam.mjs`. The dial's last
position, and nothing new decides anything: the candidate is an
ordinary sim driver built from one of the six named profiles, put where
the player starts on the test map, carrying straight on at every
intersection unless told otherwise.

- **The turn taps give the direction.** In time, it is the route at the
  intersection ahead -- the same mid-approach route switch the player's
  own signal makes, through the same lane-change `want` when their lane
  does not make the turn (`wantFor` in crossing.js, now taking a told
  intent). Too late to slow for the corner and they carry on as they
  were: "too late" is the corner model's own arithmetic, the braking to
  reach THEIR corner speed before the arc against `HARSH_AT`, the sim's
  boundary for a controlled stop. Measured, it lands 17 m before the arc
  at 50 km/h on a free-flowing T; nothing was chosen. Past the line, it
  is for the next intersection.
- **The slider's lower half is the examiner's hand.** Easing down tells
  them to slow: they want less speed (down to a tenth, graduated) and
  shed it at their OWN braking rate. The last tenth of the travel is the
  instructor's brake, the car's full 7.5 m/s^2. The upper half does
  nothing; the examiner has no throttle. It springs back when let go.
- **A finding, caught by the check:** "slow down" first produced 8.0
  m/s^2, the model's emergency ceiling, because dropping a driver's
  wanted speed abruptly makes the following model brake as hard as it
  is allowed. Nobody slows like that because they were asked. Capped at
  the candidate's own `brake`, so a heavy-footed candidate obeys "slow
  down" in their own way too (verify-exam section 5).

**What it deliberately does not have** -- and the reason the sheet is
absent is structural, not time: `marking.js` imports the old engine's
grader (`detect.js`, `faults.js`), and a live screen may never reach
`src/engine/` (verify-core). Bringing the sheet back means moving that
grader into `src/core/` first, which is assessment work; this stage
exists to find out whether the ride is worth assessing before that is
built. Also absent: taking back a direction once given, saying
"straight on" (silence is), any record of interventions, the
candidate's visible signal and head checks, any map but the test map.
The screen says all of this to the person riding, so a known gap is not
reported as a fault.

**The question for the maintainer**, unchanged: does it feel like
examining?
*The question:* does the reinterpretation feel like examining, or like
a driving game with the wheel taken away?
*Cost:* days.

### Stage 4 — the art pipeline, and the first real sprites

Section 5.3. The voxel-to-headings script, vehicles as 32-heading
sprites replacing the prisms, a handful of buildings and trees, the
asset specification rewritten as v2 from what the pipeline emits.

*Deliverable:* the stage 2 map with real cars and a few buildings.
*The question:* does it look like the game? Do 32 headings read as
smooth, or is 16 enough?
*Cost:* a week of pipeline; art time on top, external.

### Stage 5 — the city

The maintainer's blockout — the highway route, the district polygons —
and **generation inside his shapes**: local streets filling a district,
buildings along frontages, parking, props; density and character per
district (the town profile). The spatial index for neighbour queries,
and the performance work to run a few hundred cars on a phone. Endless
traffic from every edge and from the districts.

*Deliverable:* the first version of the 8 km² city, driveable end to
end, never the same drive twice.

**In increments, each something to look at** (27 September): 5.1
streets inside a district; 5.2 buildings along frontages; 5.3 parking
and props; 5.4 the town profile per district; 5.5 the spatial index and
the phone at city scale; 5.6 traffic from the districts and every edge.
Until the maintainer's own blockout exists, `testCity0()` in
`map/samples.js` stands in for it -- an arterial loop, a collector, two
districts with no streets in them -- and is labelled as a stand-in.

**5.1, STREETS INSIDE A DISTRICT -- BUILT, 28 September**
(`src/map/generate.js`, editor zone panel "Generate streets",
`tools/verify-generate.mjs`). A grid aligned to the district's longest
edge, blocks sized by kind and density (residential about 110 by 220
m), clipped to the polygon. A street ends ON the road at the district's
edge if one is within 25 m, and otherwise is trimmed back to its last
junction -- never left dangling, since a loose end is a map edge where
traffic spawns. Streets that reach no road are dropped as islands. The
output is ordinary roads tagged with their zone: fixed, learnable,
hand-editable, regenerated or undone like anything drawn. Controls
follow the established T rule (the minor street stops where it meets a
bigger road; a T's stem stops and the through street runs), and **a
crossroads of two local streets is an all-way stop -- a map-design
default, the maintainer's to overrule.** On the stand-in: 98 road
pieces, 78 intersections, no authoring error, 200 cars for two minutes
with no overlap.

Two latent sim bugs it found, both reachable by hand in the editor
before it existed:

- **Two junctions 10 m apart crashed the graph.** The districts either
  side of the collector meet it at different block spacings, so T's
  landed 10 m apart; the road piece between was shorter than the box,
  and a straight-through read as a U-turn whose lane lines never cross.
  `pathBetween` handled that null corner in two places and read it
  unguarded in a third -- the recurring bug, two implementations of one
  quantity. Fixed, and the real problem is now an AUTHORING ERROR,
  `junctions-too-close`, named by both nodes: the road between two
  intersections must hold both stop lines (each leg's own `lineAt`) and
  a car. The generator aligns a street to a junction already on the
  road within that distance (with the graph's own skew allowance), so
  two T's from either side become one crossroads.
- **A map with no open end crashed spawning** -- a closed network had
  nowhere to arrive from. It now gets no arrivals. Traffic from inside
  the districts (5.6) is what makes a closed city live.

**5.2, BUILDINGS ALONG THE FRONTAGES -- BUILT, 28 September**
(`fillLots` in `map/generate.js`, "Place buildings" on the zone
panel). Lots along both sides of every street in the district, a
building on each lot the density fills, facing its street across a
front yard: houses at 18 m frontage behind a 7 m yard in a residential
district, shops at 30 m behind 12 m in a commercial one, bigger boxes in
an industrial one. Houses do not front an arterial -- a residential lot
backs onto one -- and every intersection keeps its corners clear.
**Whether a building is off the road is the loader's own test**
(`standsOn`, exported rather than written twice), so the loader keeps
every building the generator places: 787 on the stand-in city, none
dropped, none overlapping, every one facing a street it fronts.
Buildings are drawn and kept off the road; they still hide nothing from
anybody, which waits on sight in the sim (the editor limit recorded in
CLAUDE.md).

**5.6, TRAFFIC FROM INSIDE THE CITY -- BUILT, 28 September**
(`crossing.js`, the loader now passes zones through). Taken before 5.3
because a closed city -- every road meeting another at both ends -- had
no traffic at all. A car can now PULL OUT from the curb on a district
street (a non-arterial road inside a residential, commercial or
industrial zone): it appears at rest, and only where the lane is clear
a car's length ahead and, behind, by as much as the car behind would
want and needs to stop. Every car carries a trip length (3 to 10
intersections, from its own random stream); once spent, on a district
street, it picks a spot far enough ahead to stop for comfortably, slows
to it through the ordinary following model -- a stopped phantom at the
curb, no new braking law -- and is removed only at rest. On a closed
stand-in city at 150 cars: filled to 150 in two minutes, 76 pulled out,
43 pulled in, none vanished moving, no overlaps. With districts and
edges both present half the arrivals come from each
(`DISTRICT_SHARE`, a flagged design constant the town profile will
own); a map with no districts is untouched.

**A real sim bug it exposed, and the fix.** A rolling-stop driver counts
as stopped below 2.2 m/s, and the launch backstop fires above 1.5 m/s,
so the instant a rolling stopper's stop latched it was called LAUNCHED --
even while traffic was holding it and it was still braking to a real
stop. With traffic heading into the districts, many more cars turn left
off an arterial across oncoming traffic, and one bold rolling stopper
was declared going at 2.0 m/s mid-yield; the oncoming car stood on the
brakes for a car now "committed" in its path and they met. The rule was
already written down -- held by traffic, a rolling stopper stops like
everybody else -- and the backstop now waits until nothing holds them.
Checked directly on the open city, where it happened (sabotaged: one
held launch, one overlap).

**5.4, A DISTRICT'S CHARACTER -- BUILT, 28 September** (`sim/towns.js`,
"Drivers here" on the editor's zone panel). The maintainer's "towns are
distributions, not drivers" (DRIVING-SCHOOL.md 3): a district's
character weights which axis its people are weak on, and for confidence
which side -- ordinary, tailgaters, rolling stops, wanderers, late
brakers, hesitant. Nothing writes a behaviour; the model that already
turns ratings into driving does the rest. A car that pulls out of a
district is one of its people (`home`); traffic arriving at the city's
edge is from elsewhere and drawn as it always was. With no character the
draw is the old one exactly, checked against an independent
re-implementation over 2000 seeds. Measured: each character makes its
axis the weak one for 72-76% of its people against about 30% in an
ordinary place; in a rolling-stop neighbourhood 41% of its people roll
their stops against 14% elsewhere (rolling depends on two axes, so it is
three times as many, not everyone), and tailgaters keep a 0.54 s gap
against 0.69 s. `TOWN_PULL` = 6 is a flagged design constant. Not
expressible yet, and absent from the list: "nobody is looking" (needs
perception on) and "nobody signals" (the driver model has no signals).

**5.3, PARKED CARS -- BUILT, 28 September** (`sim/parking.js`; the
loader's `outer` width). A two-way residential street -- `parking:
"parallel"` in the format, which nothing used before -- now has a 2.4 m
strip beside each curb lane, drawn as road; the lanes and everything the
traffic drives by are unchanged (`width` stays the carriageway), and
buildings set back behind the strip. Slots of 6.5 m are pinned to the
curb lane at a distance along it -- the coordinate a car's own position
on that lane is measured in, so the slot beside a car is arithmetic --
and kept 15 m clear of each intersection's centre (the maintainer
confirmed the distance). The world starts with slots part-filled by the
district's density. A car pulls out of a FULL slot, which empties; a car
at the end of its trip picks a FREE slot nobody is heading for and takes
it. On a map with parking nobody comes from nowhere: the old in-lane
appearance survives only on maps with no parking at all. Measured on the
closed stand-in city: cars driving plus cars parked stay exactly 1,918
for two minutes, 27 in and 59 out, nobody touching a parked car. The
player's car can hit one (MapRoad's contact test includes them). On a
map with parking and no districts the parked cars are scenery and the
traffic is identical with or without them. Still absent: pulling in and
out is a sideways step of 3 m at rest, not a manoeuvre, and there are no
driveways.

**SIGNS AS OBJECTS, FIRST PART -- BUILT, 28 September** (`signs` in the
format, the loader's `signAt`, `sim/reading.js`, the editor's approach
panel, `tools/verify-signs.mjs`). The maintainer's request: signs at the
road's edge that drivers have to read, where before they "just know".
Two changes of very different size, and this is the first:

- **A sign is an object and it IS the rule at its approach** -- one
  source of truth. `signs: [{ id, kind, road, end, back }]`; a road end's
  `control` of stop or yield is SHORTHAND the loader expands into the
  sign, so every map written before loads unchanged. Where a sign and the
  shorthand disagree the sign wins, warned; a stop or yield sign on a
  signal's approach is refused, warned; the no-right-on-red plate makes a
  signal no-right-on-red and is warned anywhere else. Signs are resolved
  onto a road's ends before the loader splits it at a T, so a sign keeps
  its end. The editor now writes signs, not shorthand, sets them back
  from the line, and keeps them at their end through its own splits.
- **A driver learns a rule in one place** (`sim/reading.js`): the rule at
  their own approach and the rule at somebody else's (right of way) --
  two different acts of perception. TODAY A PERFECT READER, and the
  traffic on every test map is identical tick for tick whether its rules
  are written as signs or as shorthand (196 signs on the city). This is
  where observation lands: a sign too far to read, hidden, missed, or
  known by heart to a local.

**The maintainer's rulings, 28 September** (asked as six questions, each
with a default; he took the defaults for five and ruled on one):

1. **An unsigned road is 50 km/h** anywhere in the city (Ontario's
   built-up default); a road runs faster only where a sign says so.
2. **A speed limit holds until the next speed sign**, through
   intersections; after turning onto a street with no sign yet a driver
   assumes 50.
3. **A STOP SIGN CAN STAND MID-ROAD**, at a crossing that serves
   pedestrians -- a school zone, say -- without giving cars another route,
   and it must still do its job: stop traffic for that crossing. So a
   mid-block stop is a real feature, not a placement error; it needs
   pedestrians and crossings in the sim, which do not exist yet, and is
   planned after observation. **BUILT 29 September**: the editor's
   "Mid-block crossing" tool splits a street where it is tapped, puts a
   stop sign on both new approaches and a crosswalk between them -- two
   roads, two signs and a crosswalk, nothing new in the format. A node
   with only the one street through it already carried traffic; measured
   first (tools/measure/midblock.mjs). Four minutes: 68 cars over the
   line, every one having stopped, 10 people across, nothing touched.
   The Pedestrians test map's "mid-block crossing". verify-peds 4.
4. **Locals know their own district's signs without reading them**;
   drivers from elsewhere have to read every one.
5. **Sign kinds, in this order:** stop, yield, all-way plate, no right on
   red, no left turn, one way, do not enter, speed limit, school zone,
   curve ahead with advisory speed. **Stop, yield and the all-way plate
   are built** (28 September). The plate is DERIVED, never placed: it
   hangs under every stop sign at an intersection where every approach
   stops, because a plate authored on its own could disagree with the
   controls it describes (verify-signs section 8). The "Signs" test map
   has a yield crossroads and an uncontrolled one side by side. **No
   right on red** was already a plate on a signal. **No left turn is
   built**: placed per approach in the editor, drawn eight metres before
   the line, and it takes the left off what that approach is offered
   BEFORE lanes get their movements -- so nobody is given a left there,
   and a map whose own lane turns still list one is refused by name
   (verify-signs section 9). Drivers obey it; a knowledge-weak driver
   ignoring it waits on routes that plan past the next intersection.
   **One way and do not enter are built**, derived from the road's own
   `oneWay` like the all-way plate: ONE WAY beside the mouth where a
   one-way street leaves an intersection, DO NOT ENTER facing anybody who
   would turn into it the wrong way where it arrives (verify-signs
   section 10). **Speed limit signs are DRAWN**, derived from what each
   road posts: at a road's entrance from an intersection where its limit
   is not 50, or where a road meeting it there posts something else (17 on
   test map 1; 280 on the city, because every residential street posts 40
   and a driver turning onto one would otherwise assume 50 -- an AREA
   limit posted at the district's entrances is the likely real answer, and
   is the maintainer's call). The traffic still drives each road at its own
   posted speed; a limit CARRIED through intersections until the next sign
   (ruling 2) is driver state, not built -- and it is where a knowledge-weak
   driver who misses or forgets a limit would live. verify-signs section
   11. Left: school zone, curve ahead.
6. **Yield means:** slow, give way to traffic on the other road and anyone
   crossing, stop only if needed, and go without stopping when there is a
   safe gap -- a stop sign without the full stop. **BUILT 28 September**
   (DECISIONS.md 5.16.4): gap acceptance without a stop, the approach
   slowed to YIELD_AT (20 km/h, flagged) by temperament -- and building
   it found the uncontrolled crossroads under it locked, now fixed.
   Pedestrians in "anyone crossing" wait on pedestrians in the sim.

**The second change is observation** -- drivers who can miss or not yet
see a sign. **BUILT 28 September** (DECISIONS.md 5.16.3), behind "Drivers
look away" on the map screen: attention is intermittent, not late, and
signs are read only while looking. On today's maps nobody misses a sign
-- every one is in view longer than the longest glance -- and buildings
cut no sight line from any stop or yield line on the city
(tools/measure/sight.mjs): what would hide a sign is a crest or a short
view round a bend, the next piece of sight.

**WHEN TWO CARS COLLIDE -- BUILT, 28 September** (`contactsIn`,
`crashWith`, `CRASH_CLEAR` in `crossing.js`; `tools/verify-crashes.mjs`).
The first half of the observation work: a driver cannot be allowed to
miss something until missing it has a visible outcome (DECISIONS.md
5.12). Contact between any two cars is now a CRASH: both stop where they
hit, deciding nothing, and stand in the road -- traffic queues behind a
wreck -- until cleared after 45 s (a flagged design constant); the world
logs it once with where it happened. The car the player hits crashes too,
where before it drove on through them. It is never unseen: a wreck flashes
its hazards, the readout counts crashes, a banner says where the last one
is from here for eight seconds, watch mode has "the last crash" as a
view, and in exam mode the candidate colliding ends the drive with that
said. The invariant held in heavy traffic with everybody perceiving late
-- where crashes actually happen: no two cars ever overlap unless they are
a recorded crash (sabotaged: 279 silent overlaps). The default traffic
still never crashes.

**IT FOUND CRASHES THE DEFAULT TRAFFIC HAD BEEN HAVING UNSEEN.** The
signal check's five-way -- two-lane roads, one leg at 45 degrees --
crashed three times in four minutes in DEFAULT traffic, and every check
had called it clean: the one that looked read only the last tick of the
four minutes, and a pass-through lasting a tick or two was never on it.
A wreck now stays where it happened, and it showed. Two geometry bugs,
both fixed:

- **A skewed approach's stop line was too close.** Its setback scaled
  the box by the angle and never asked how wide the OTHER road is: at 45
  degrees the two surfaces overlap to 17.4 m and the line sat at 12.2, so
  waiting cars stood in the other road's exit lane. The line now stands
  where this approach's surface stops overlapping the other road's, D =
  (wB + wA cos theta) / sin theta -- exactly the old box at a right angle,
  so no square intersection moved. Only the LINE moves: the leg's box, and with it where the exit begins and every turn's arc, stays as it was -- a first version moved both and the player's committed right turn came off its arc.
- **Hairpins.** "Right" from the east leg onto the 45 degree leg is a 135
  degree turn, and its arc curls back across its own approach into the
  car queued behind, which following cannot protect (along the path they
  look apart). Turns sharper than 120 degrees (`HAIRPIN`) are not offered.
  **A question for the maintainer**: whether such a turn is normally
  allowed at a real five-way; not offering it is the default meanwhile.

After both: no crashes in four minutes of default traffic on the
five-way, the crossroads, test map 1 or the city at 300 cars, and the
signal check now counts every crash in the run rather than one tick.

**And the measurement that decides the next step:** with everybody
perceiving late, crashes run at 8 in three minutes on test map 1 and 13
on the city -- far more than believable. Late perception cannot simply be
switched on for all traffic; why it crashes that often is the first
question of the observation work.

**TEST MAPS WITH SECTIONS -- BUILT, 28 September** (`#/tests`,
`sections` in the format, `TEST_MAPS` in `map/samples.js`). The
maintainer tests from a phone, and drawing in the editor there is slow,
so every test map carries named SECTIONS -- a place to watch, optionally
a start to drive from, one line on what to judge -- and the Test maps
screen lists them with Watch and Drive. `#/map`'s hard-coded view
buttons became test map 1's sections. The stand-in city ships ready
(`testCityReady`): streets and buildings generated, the west rolling its
stops and the east tailgating, its sections chosen from the generated
map rather than typed in. Opening it cost 3.2 s on the desk machine,
2.6 of it building each intersection's conflict table; the scan now
samples each path once instead of once per pair and refuses pairs whose
boxes cannot meet, 2.5x faster and key for key the same table across
9,786 pairs (`verify-generate` section 0). A grid over the samples was
tried and was SLOWER at these sizes, and was taken out.

**5.5, THE NEIGHBOUR INDEX -- BUILT, 28 September** (`nearNode` /
`atNode` in `crossing.js`, `tools/measure/city-perf.mjs`). Measured
first: on the stand-in city every car asked every other car about
itself, so a step cost 1.7 ms at 100 cars, 8.2 at 200 and 18 at 300 on
the desk machine, four fifths of it that scan -- quadratic, and over a
phone's share of a 50 ms tick at a city's traffic. The rules already
bound who can matter: right of way is settled only between cars at the
same intersection, and following across a boundary runs along a lane,
which joins two neighbouring intersections only. So each car asks the
cars at its own node and the joined ones, from a per-node list built once
per tick. Measured after: 0.5 ms at 100, 1.25 at 200, 2.4 at 300 --
7.6 times faster at 300 and widening with size. EXACT, not approximate:
the same worlds stepped with the index and without stay identical tick
for tick for a minute on the city and on the test map, and dropping the
joined nodes from the index diverges at the first tick with 1,580
overlaps (`verify-generate` section 11). What is still unmeasured is the
phone itself at city scale; the numbers above are the desk machine's.

**One check changed with it, deliberately and on the record.** `verify-lanes`
bounds lane changing at 20% of a step. The index halved the rest of the
step and lane changing got cheaper too (1.88 to 1.27 ms at 300 cars), but
its SHARE rose to 22% because the denominator shrank. The bound was not
moved: the share is now measured on the sim it was calibrated on (index
off, 18%), and a new assertion requires the index never to make lane
changing cost more milliseconds than scanning everybody did (1.40 against
2.03 ms). `tools/measure/lane-cost.mjs` has both measurements.

### The free camera (28 September, the maintainer's request)

*"can you have a free roam camera implemented? being able to scroll the map
would improve the editor and testing."* Put ahead of everything else as
tooling that improves his judgement of everything else.

**THE GESTURES, DECIDED.** On the map screen, WATCHING: one finger drags the
ground under it, two pinch and pan together, the wheel zooms about the
cursor -- and any drag drops the view out of following a section or a car
into "free look". DRIVING: one finger is the wheel and the pedal, so the
camera cannot share the canvas; "Look around (pauses)" stops the world and
hands the canvas to the camera until "Back to the car". The two are never
live at once. IN THE EDITOR taps draw and select and two fingers always pan
and zoom; a one-finger drag PANS unless it starts on the road or building
ALREADY selected, which it then moves (`dragIntent`). Before, a drag on any
building moved it and a drag near any road point -- one every few metres
on a smoothed road -- moved that, so on a built-up map most attempts to pan
grabbed something. "Whole map" in both, from the map's real extent: the
generated city declares one 256 m chunk as its bounds and is 1900 x 1500 m.

**RANGE: the whole world to a kerb.** 0.06 to 40 px/m; a 2.83 km square --
eight square kilometres -- is a diamond (w + h) wide on this view and fits a
412 px phone at 0.069. The editor's floor went from 0.3 to 0.08.

**NOT CAPPED FOR SPEED; DRAWN SIMPLER.** Zoomed right out, the whole city
was 297,000 canvas calls a frame (tools/measure/freecam-perf.mjs). Two
detail tiers (draw.js): below FLAT_K (2.5 px/m) road paint, signs and
arrows go, a road is one ribbon with its points thinned to two pixels, and
flat ground is one quad; below LOD_K (1.5, a car under seven pixels) a car
is a dot and a building its roof; between them a car keeps its body and
drops the cabin. Now 3,500-17,600 calls at every zoom, against 10,900 for
the old default watch view and about 25,000 at its old widest. Depth keys
are unchanged, and verify-paint sweeps the free camera across both
thresholds: it found its own audit wrong first (a surface's height taken
as the average of its corners reads a car on the flat end of a hill road's
ribbon as under a deck), and a placed car underground, before it could be
trusted -- then a deck drawn as floor when far fails it, 172 frames.
The phone has to say whether the widest view is smooth; a desktop cannot
time canvas fills.

### Observation, scored on the decision (29 September)

**Against pedestrians the decision is late and nothing downstream feels
it.** Poor observers register somebody on foot late 21.7% of the time (by
0.78 s) against 7.4% (0.29 s) for sound ones; braking, stopping margin and
stops too late to be comfortable move by under a point
(tools/measure/ped-observation.mjs, controlled with people always seen and
people ignored). People step off only when every car can stop comfortably,
so they are SAFE BY CONSTRUCTION and the margin swallows the delay.

**Against the car in front it is real, on every road -- and a first
comparison hid it.** Glances away add hard braking (over 3.5 m/s^2) to
poor observers far more than to sound ones on every road type tried
(tools/measure/obs-where.mjs, one controlled map varied one thing at a
time), per driver-minute: all-way stops +0.21 against +0.09; signals +0.13
against +0.08; a through road +0.15 against +0.03; all-way stops at double
the traffic +0.43 against +0.04; the city +0.09 against +0.005. Largest in
dense stop-and-go, diluted where hard braking from other causes is already
common. Comparing poor with sound observers DIRECTLY said "no effect" on
test map 1 and the city: with nobody looking away poor observers brake hard
LESS (0.4-0.8x), because a driver is drawn weak on one or two axes and a
poor observer is less often also a poor braker (mean braking deficit 0.20
against 0.30). The honest measure is each group against itself. Late
reaction to the car ahead braking is the fault the maintainer's default
for question 6 names, and it is the first fault kind the observation axis
measurably dominates.

**OCCLUSION: WHAT IT WOULD COST TO GIVE OBSERVATION CONTENT AGAINST PEOPLE
ON FOOT -- assessed, NOT built, waiting on the maintainer.** The case: a
person stepping out from between parked cars, which is where a glance away
genuinely costs something and where the props that make a street feel
alive are the props that make it hard. What exists: parked cars as objects
(3,504 slots on the city, 1,802 full, along 22.8 km of curb), buildings,
wrecks, pedestrians with the near-half rule, drivers who look away, the
old engine's plan-view line-of-sight test (engine/sight.js `visibility`,
segment against footprints) to port rather than write. What it takes:

1. **Sight in the sim** -- a driver sees a person only when the line from
   their eye to them clears every parked car, wreck and building near it,
   checked against the few within reach (parked cars are indexed by curb
   lane already). Registration then runs from first SIGHT, not first
   step, and a glance away stacks on top. Small; the cost is the per-tick
   test, bounded by people on foot times cars near them.
2. **People crossing between parked cars, mid-block** -- a new source: a
   person appears at a gap in the parked row and crosses where there is no
   crosswalk. Everything today is at crosswalks, which are kept clear of
   parking, so without this there is nothing to be hidden behind.
3. **What they do when THEY cannot see** -- the hidden person cannot see
   the car either. Some step out anyway (the heedless or the trusting),
   which is the hazard; `heedless` already exists as a word in the old
   engine's design.
4. **Checks** -- decision-scored as above: registration from first sight,
   late and hard braking, with and without the parked cars as the control.

Rulings it needs, each a sentence: (a) are pedestrians crossing mid-block
between parked cars in scope; (b) who has the right of way there -- the
default would be the person yields outside a crosswalk and the driver must
still avoid them; (c) does a parked car hide an adult from a driver or
only a child -- the default would be a car hides a child entirely and an
adult's lower body, a van or truck an adult entirely, which needs parked
vehicles to have kinds; (d) how often people step out without being able
to see -- a flagged rate. Estimate once ruled: a day, most of it the
mid-block crossing source and its checks; the sight test itself is the
smallest part.

### People who take risks, and hiding (29 September, DECISIONS.md 5.16.5)

Built on the maintainer's ruling that fairness is owed to the player, not
to the simulation (sim/peds.js):

- **Manners.** At a crosswalk a person is careful (steps off only when
  every car could stop), trusting (whenever nothing is on the paint -- their
  right of way) or heedless (without looking); PED_RISK 15% trusting, 5%
  heedless. Mid-block, a person crosses from between parked cars at a
  crossing point every ~40 m of parked curb, GAP_RATE 30 per km of parked
  curb per hour, GAP_HEEDLESS 10% of them darting out at 3 m/s (DART) --
  at a walk they spent 1.8 s in the parking strip, which handed every
  driver the warning a dart never gives.
- **Hiding.** A driver sees somebody mid-block only when the line from
  their eye clears the parked cars and wrecks (plan footprints; a parked car
  hides a person behind it -- the height ruling is still the maintainer's).
- **Fairness.** Somebody trusting or heedless steps out in front of the
  player only if the player could still stop, reacting at the floor and
  braking fully, the hidden time counted. Set up directly in verify-peds 6:
  a heedless person 7 m ahead of the player at 40 km/h waits; the same
  person ahead of a traffic car darts out and is struck; switch the
  fairness off and the player case fails.
- **What building it found**, each a real gap and each fixed: a crossing
  just past a road's seam belongs to the next intersection, so neither the
  person nor the approaching driver saw the other (both now look across
  the seam, `bandsAhead`); a car that registered somebody mid-block held at
  its own stop line beyond them and drove through; the half rule let an
  inner-lane car pass somebody a metre over the middle (now: within a lane's
  half and half a metre of the car's line is always in its way); a car
  pulling out of a parking slot was placed straight onto somebody crossing
  there; a queued car creeping forward over the paint drove on into a
  careful person stepping out beside it; and a careful person hidden behind
  a parked car judged room a driver could not use.
- **Measured.** With everybody careful, nobody is struck by traffic that is
  watching, on the Pedestrians map or the city. With the defaults, the
  city (300 cars) sees people struck at the rate in
  tools/measure/gap-risk.mjs -- see the report to the maintainer -- and
  every one is somebody who took a risk.
- **People are seen coming and going (29 September, from the maintainer's
  testing: "they simply appear 10% in the road and disappear when they
  reach 90% of the way. it gives the impression cars are waiting for
  nobody").** It was the model, not an optimisation: a person was created
  standing at the carriageway edge already deciding, and deleted the tick
  they reached the far edge. Now a person is created `APPROACH` (10 m)
  back on the pavement, walks up in view, decides only at the kerb, crosses,
  and walks 10 m on before they are gone (sim/peds.js; verify-peds 7, held
  to fixed distances rather than to the constant, and sabotaged with it at
  0.5 m). So nobody decides to cross before they have been visible walking
  up to it. Cost: about twice as many people alive at once, each a few
  arithmetic operations a tick -- nothing measurable against the traffic.
- **Somebody seen running is braked for (29 September).** Found by the
  change above shifting which occasions came up: a car too close to stop
  comfortably is committed and goes on, because a person pauses at the
  middle for it -- but somebody darting across is plainly not going to,
  and an attentive car drove into a person it had been able to see for
  most of a second. A committed car now brakes as hard as the car can for
  a person it sees running, if that still stops it short (verify-peds 8,
  sabotaged). Most traffic strikes of heedless people before this were
  that gap; what is left is people nobody could see in time.
- **A deadlock at the middle (29 September).** Surfaced when the
  compliance split moved the walked crossroads' occasions: a person paused
  at the middle for a right-turner whose nose was on the paint, the car
  had stopped there for her, and each waited for the other for the rest of
  the run (longest curb wait 78 s against 7). A car at rest on the paint
  and not pulling away is waiting for them, so they go on; a wreck still
  holds them (peds.js `committedAcross`). verify-peds 2's sixty-second
  bound is what caught it.
- **Not yet:** emergency vehicles responding; a height ruling (children,
  vans); drivers slowing past parked rows where somebody could step out
  (caution against the unseen -- confidence's side of the asymmetry).

### Knowledge and compliance (29 September, R2-DESIGN.md 17)

A driver who does not know a rule breaks it wherever they meet it; one who
knows and does not care breaks it only when nobody is about. **Revised 30
September (the maintainer's proposal): every sign carries a difficulty and
knowledge is checked against it**, once per driver per kind -- nobody
misreads a stop sign, a sixth of traffic misreads the full stop a right on
red needs, and a hard sign placed on the map (a `difficulty` on the sign) is
misread by more of the same people. Stop-sign rolling is compliance alone
now. A hard sign must LOOK hard, so the player can see why -- a rendering
requirement, not yet met. R2-DESIGN 17 has the scale and the population. `#/candidates` has *Unschooled*
and *Scofflaw* side by side to watch. Measured and checked in
`verify-compliance.mjs`; the population it produced is in R2-DESIGN 17.

### THE SHAPE OF THE WORLD WORK (29 September, the maintainer)

In his words: *"a big part of this in the end is making a world that feels
alive and is nice to drive in, meaning we need to be able to show a
bustling downtown scene as well, with pedestrians going in and out of
places, crossing the road or just walking along. we might even include bus
stops at some point where large vehicles (note: we still haven't put a
single truck in the game as a visual/sizable obstacle) load and unload
passengers. so we need to be able to show things happening along the road
as well (an arterial road could turn off into some parking lots for large
shopping centers for example) that don't feel off limits for the user."*

**THE PRINCIPLE UNDERNEATH IT: THE WORLD IS NOT A DIORAMA WITH DRIVABLE
CORRIDORS.** If there is a parking lot, the player can drive into it.
Nothing on screen may read as scenery he is forbidden from reaching. This
is the section 0 rule (a state the engine can produce and the renderer
cannot express is a lie) turned round: a place the renderer draws and the
player cannot enter is a lie about the world.

In priority order:

1. **LARGE VEHICLES.** Until now every vehicle in the simulation was 4.5 x
   1.8 m. A truck is not decoration, it is a different driving problem: a
   MOVING SIGHT BLOCKER (the occlusion machinery already exists), slow to
   accelerate (a reason to use lane changing), wide through a turn, and it
   makes observation matter -- a driver behind a truck cannot see, and a
   good one positions differently. Built with the existing vehicle
   machinery at different dimensions and performance, never as a special
   case.
2. **AMBIENT PEDESTRIANS**, distinct from crossing ones: walking along the
   sidewalk, going in and out of buildings, standing about. Most never
   interact with traffic, so they are cheap -- and they make the hazardous
   ones UNPREDICTABLE. If everyone on screen is about to cross, a player
   learns to expect it; if most people are simply walking, the one who
   steps off is a surprise. The same principle as empty intersections
   making busy ones matter; it turns pedestrians from a hazard system into
   a living street.
3. **BUS STOPS**, needing 1 first: a large vehicle stopping to load and
   unload. A genuinely good traffic event -- it blocks a lane, people cross
   to and from it, and traffic decides whether to wait or go round.
4. **OFF-ROAD DESTINATIONS** -- an arterial turning into a shopping-centre
   parking lot. **STRUCTURALLY DIFFERENT, AND SCOPED BEFORE PROMISED.** The
   simulation runs on a graph of lanes; a parking lot is an open area, not
   a path. It is a different kind of space and needs designing rather than
   adding. Scoped, not started -- see "Parking lots: what it would take"
   when it is written.

The pedestrian persistence fix and the knowledge/compliance split came
first: both are prerequisites for any of this being worth anything.

#### 1. Large vehicles -- built (30 September)

**A truck is a row in the vehicle table** (`sim/traffic.js` `VEHICLES`,
read through `vehicleOf` wherever a size or a performance figure is
used): 9 x 2.55 m, pulling away at 1.0 m/s^2 against a car's 2.4, planning
on braking at 2.0 and stopping at most at 6 against 2.7 and 8, and keeping
to the posted limit. A car's row IS the constants every car was built on,
so a world with no trucks is the world it was, tick for tick
(`tools/measure/world-hash.mjs`). `TRUCK_SHARE` (6% of traffic arriving
from outside -- a flagged constant for the maintainer; urban arterials
carry roughly 5-10%) is per world, and trucks come only from outside: one
does not fit a curb slot. Drawn as a cargo box behind a cab.

**What building it found, each a real gap:**

- **A truck ran a red it could not stop for.** The amber decision -- can I
  stop comfortably -- was a car's; the truck judged by 2.7, planned on 2.0,
  stood on its 6 and still ended past the line. The amber is judged at the
  vehicle's own braking (`signal.js` `controlUnder`).
- **Nobody could see the next intersection's line across the seam.** A
  driver's path ends at the middle of the link, so on a short link a car
  crossed the seam at 60 km/h 20 m from a red and braked at 8 m/s^2; a
  truck could not. Within a driver's own comfortable stopping distance the
  next line is now braked for like the one on their own path
  (`crossing.js` `whatStops`). It helps cars too, measured on two seeds,
  33 car-hours (`tools/measure/seam-brake.mjs`): harsh-braking episodes
  13.2 -> 10.6 per car-hour, car crashes 2 -> 0. This is the one change a
  world without trucks sees.
- **A truck swung its rear into the next lane on a turn.** The sim puts a
  vehicle's centre on its path facing along it; for a 9 m body 25 degrees
  into a right turn that put the rear 1.9 m into the lane beside, where a
  left-turner was. A vehicle longer than the paths were drawn for now
  spans them as a rigid body: front on the path, rear the point on the path
  its length behind in a straight line -- it cuts inside a turn as a
  truck's rear wheels do.
- **A truck pulled out in front of a left-turner who could not stop.**
  The turn rule gives the straight-through vehicle the road, and the
  standing truck took it -- while the left-turner, already too close to
  stop, had judged the stopped truck as claiming nothing and gone. A car
  pulling away at 2.4 m/s^2 was usually clear; a truck at 1.0 was not. A
  vehicle standing at its line now waits for the gap when a left-turner
  plainly cannot stop short of their meeting point (`crossing.js`
  `blockedBy`). The car-only city is unchanged by it: no crashes, harsh
  braking the same.
- **A truck cut over the curb onto somebody waiting there (30 September).**
  The rigid-body pose is right -- a truck's rear does cut inside a turn --
  and on a tight residential right it cut 2 m inside the path, over the
  curb. A real truck swings wide into the next lane to make that corner;
  that is not modelled, so a truck now does not take a turn it cannot make
  within its own lane when its leg offers another way on (`corner.js`
  `fits`: a body of length L on an arc of radius r cuts r - sqrt(r^2 -
  (L/2)^2) inside it, against its lane's spare width) -- in route choice,
  in the lane it enters by, and in keep-right and every lane change, all of
  which had been putting trucks back into curb lanes whose right was too
  tight. In effect trucks keep to truck routes. **A domain question for the
  maintainer:** what should a truck do at a corner it cannot make in its
  lane -- swing into the lane beside, or the oncoming lane? That is the
  "takes intersections wide" behaviour, and it needs his answer first.
- **A truck that missed a car in its blind spot could not swing back in
  time.** A driver who skips the check notices after their registration
  delay and returns -- sized so a car beside is never reached (the lane
  change is 3.8 s, a car beside reached at about 1.9 s). A truck is wider
  and reached the car at 1.65 s. It also takes far less sideways
  acceleration than a car before it tips, so its row carries `lateral`
  0.6 (a flagged figure) and its lane change runs 5 s, reaching the car
  beside at 2.1 s -- past the slowest notice.
- **A crash was a silent overlap for one tick.** Contacts were tested on the
  new positions at the old clock, and a car changing lanes is placed
  across by the clock, so it was tested a tick behind everybody else.
  Tested at the new clock now (`crossing.js` `step`).
- **A truck kept the speed of the road it entered on.** The seam reset a
  driver's wanted speed with the car-only `wantedSpeed` instead of the
  vehicle's `wantedFor` -- two implementations of one quantity.

**Measured** (`tools/measure/trucks.mjs`, four seeds, ten minutes, the city
at 200): from rest to 30 km/h trucks 8.7 s, cars 4.7 s; trucks over the
limit never; no crash involving a truck in 5.7 truck-hours. Checked, each
mechanism sabotaged, in `verify-trucks.mjs`.

**Not yet -- and it is most of what makes a truck interesting:** a truck is
not yet a SIGHT BLOCKER. Nothing in the sim models one vehicle hiding
another from a driver -- `seenBy` is when a driver looks, never what they
can see past -- so a driver behind a truck is not yet blind, and the
observation axis does not yet reward positioning. Occlusion exists for
people behind parked cars (`peds.js` `inSight`); extending it to vehicles
behind vehicles is its own increment, and it is the next one on trucks.
Nor does a truck take an intersection wide: it cuts inside on the car's
path, which is safe but not what a truck driver does at a tight corner.

#### Trucks as sight blockers: what it takes (scoped 30 September)

**What exists.** A driver's picture of the world is `seenBy` -- WHEN they
look (`attention.js`), never WHAT they can see past. The only occlusion in
the sim is people on foot hidden behind parked cars and wrecks
(`peds.js` `inSight`, plan footprints on a grid). Nothing hides one vehicle
from another.

**Four pieces, in order:**

1. **Line of sight in the sim.** From a driver's eye to each road user they
   decide about, blocked by any vehicle taller than eye height -- a truck,
   never a car (you see over and through a car; nobody sees through a box
   truck). One segment-against-box test per truck nearby, trucks being 6%
   of traffic: cheap. A road user hidden this way is not in the driver's
   picture, exactly as one they looked away from is not.
2. **The margin for what you cannot see IS confidence** (CLAUDE.md, the
   asymmetry that justifies the axis structure). Occlusion is PERCEPTIBLE:
   a driver can see that the truck hides the oncoming lane. So a driver
   whose view of a conflicting approach is blocked assumes something could
   be in it -- a vehicle at the road's speed at the edge of what they can
   see -- and waits for the gap that would need, scaled by caution: the
   timid wait it out, the bold go. The classic case is the left turn behind
   an oncoming truck, and it makes confidence and observation readable
   against trucks as nothing else yet does. Built as a phantom in the
   gap check, not a new decision.
3. **People on foot hidden behind a truck**: `inSight` takes trucks as
   blockers like parked cars, for the traffic and for the player's
   fairness test (`playerCanRespond` counts the time somebody is hidden).
4. **THE PLAYER'S OWN VIEW -- a decision for the maintainer, and it
   changes how the game looks.** The isometric camera sees the whole
   world from above, so a truck hides things from every simulated driver
   and from nobody watching the screen. For the player to be blind behind
   a truck the way a driver is, the screen has to hide or dim what the
   player's car cannot see -- a sight-cone or shadow treatment of the
   world. That is a design change to the view, not a mechanism, and it
   waits for his answer. Pieces 1-3 do not.

**Pieces 1-3 BUILT, 30 September** (`sim/sight.js`, `crossing.js`
`whatStops`/`phantomHolds`, `peds.js` `inSight`). A vehicle hides what is
behind it when it is an opaque box taller than 2 m (`HIDES`) -- a truck,
not a car, whose glass you see through. What building it found:

- **The first test was against eye height, and every car hid every other**
  (a car is 1.5 m against a 1.2 m eye). The threshold is the box, not the
  eye.
- **The margin, placed naively, cost 20% of throughput.** Phantoms landed
  where nothing can be: in a waiting truck's own lane behind it (nothing
  comes through a truck) and on road a truck itself stands on. Excluded.
- **It locked an intersection.** A driver with the right of way waited for
  ever on a stretch a waiting truck hid, while the truck and everybody
  else waited for them -- throughput fell from 670 to 500 a minute over
  five minutes. OBJECT PERMANENCE resolves it: where road beyond the
  hidden stretch is in view, anything in the stretch came through the
  watched part, so the phantom lasts only as long as crossing the stretch
  takes; where the whole approach is hidden, a driver gives it up after
  the undue-delay wait (`UNDUE_AT`) scaled by their caution -- a real
  driver would edge forward to see, which is not modelled yet.
- **Forgetting what a truck hides crashed cars.** Two drivers stopped at
  their lines, the second waiting its turn, each dropped the other the
  moment a truck passed between them, and both went. A road user a truck
  hides is now carried forward from when the driver last saw them, for
  MEMORY (6 s, flagged) -- the attention model's own idea (`seenBy`),
  applied to sight.

- **It cost thirteen times a step, at first.** At 300 cars a step went
  from 18 ms to 236 with trucks opaque. Poses taken once per actor per
  tick, the margin scanned only by a driver at their line, the hiding
  test run only against somebody on another approach to their own
  intersection, and memory kept only by a driver near their line for
  those same people, brought it to 23 ms against 13 see-through -- the
  sight code itself about 13% of a step, the rest the traffic being held
  more. Memory alone had been 22 ms of it.
- **A truck's tail, in a turn, is not half its length behind it.** With
  front and rear on its path, a truck standing in a right turn has its
  tail 6.6 m behind its centre along the path, not 4.5, and a car
  following by half-length ran into it (`verify-bays`, 300 cars). Each
  long vehicle now carries where its tail really is (`rear`), and every
  following gap is back's nose to front's tail (`clearBetween`); a set-up
  probe in `verify-trucks` holds it, sabotaged.

- **A careful person was struck by a car a truck had hidden them from.**
  They stepped off in plain view; a moving truck then came between them and
  the car, which saw them at 8.8 m. Two changes: the allowance for being
  hidden is now walked out from the curb until the driver could first see
  them (a parking strip behind a parked car, a lane behind a truck), and a
  careful person keeps watching lane by lane -- they do not step into the
  lane of a car that cannot stop short of them with a metre to spare, and
  wait just outside the strip a car on the paint holds for them, so it
  goes by rather than waiting for them while they wait for it.
- **Hiding applies only on the approach.** Two cars merging into one exit
  lost each other behind a truck and met there: following somebody into a
  shared exit is not a decision a truck can hide, so once either is into
  the intersection, everybody is seen.
- **A truck's tail jumped 1.9 m in a sharp turn.** The search for where the
  tail lies along the path was a bisection over a fixed range and clamped
  when the tail lay beyond it; it now steps back to the first point a
  body's length from the front and bisects within that step.

**Measured** (`tools/measure/truck-sight.mjs`, the city, opaque against
see-through): at 6% trucks, 0 crashes either way, drivers held at a line
16.8% of the time against 13.6%, crossings within a few percent and no
minute decaying. At 15%, 3428 crossings against 3537, no minute below 92%
of its twin. And what a truck might hide holds the timid more than the bold
(4.6% of sampled ticks against 2.7%) -- the margin is confidence. A world of
cars is tick-identical. Piece 4, the player's own view, waits on the
maintainer.

**Checks it needs:** set-up probes, not waiting for traffic -- a left-turner
facing an oncoming truck with a car hidden in its shadow (the timid wait,
the bold go, and the hidden car is what they meet); somebody stepping out
from in front of a stopped truck; and a controlled comparison of the city
with trucks transparent against trucks opaque, to report what the blocking
costs in crashes, which by the fairness ruling is content, told as a rate.

#### 2. Ambient pedestrians: the plan (30 September)

**What exists:** people who cross -- created 10 m back along their
crosswalk's own line, walking up it, deciding at the curb (`peds.js`). No
sidewalk anywhere: the renderer draws the road surface and buildings set
off it, and nothing walks along a road.

**In order:**

1. **Sidewalks, derived and drawn.** A strip along each side of a road,
   just beyond its outer edge (and its parking strip, where it has one),
   `SIDEWALK_W` wide -- derived from the road, never drawn by hand, like the
   parking strip. The renderer draws them first: a person walking along a
   road must walk on something the screen shows (CLAUDE.md item 6).
2. **Walkers.** People on the sidewalks: walking along, from a building's
   door to another's or off the map, standing a while, going in. A density
   per kilometre of sidewalk, higher in commercial districts than
   residential -- a flagged tunable. They are cheap: a walker is a position
   along a sidewalk and a speed, stepped with no traffic questions at all.
3. **Crossers come FROM walkers.** A walker whose way on lies across the
   road turns at a crosswalk -- or, heedless, between parked cars -- and
   becomes exactly today's crossing pedestrian (approach, curb, decision by
   manner), and walks on along the far sidewalk. So the crossing hazard is
   drawn from people already on screen, and the one who steps off is one
   of many who did not -- the maintainer's point that most people simply
   walking is what makes the one who crosses a surprise.
4. **Checks:** walkers stay on the sidewalk and off the road except where
   they cross; the crossing rate the traffic meets is unchanged by the
   change of source, unless meant; and a world without sidewalks runs as
   it did.

**Steps 1 and 2 BUILT (30 September).** Open `#/tests`, the stand-in city,
and watch any street: grey sidewalks both sides, and people walking them,
coming out of front doors, going in at others, stopping a while.

- **Sidewalks** (`map/sidewalks.js`): 1.8 m (`SIDEWALK_W`, a common
  Ontario municipal width, flagged) beside every residential, collector and
  arterial road -- none beside a highway or a service lane, none on a deck.
  Taken from the road's DRAWN edge, so they step out round turn bays and
  sit beyond the parking strip. At an intersection each stops at the other
  road's edge, found to the centimetre, and two roads' sidewalks then cover
  the corner between them. Measured on every test map: none lies on any
  road's surface, and every sidewalk end at an intersection whose roads are
  all walked meets another (560 of 560 in the city). None is laid where the
  drawn ground would bury it: the 20 m ground grid stands 2.4 m above the
  street under test map 1's overpass, a cutting it cannot draw, and a
  walker there stood inside the hill (caught by `verify-paint`).
- **Walkers** (`sim/walkers.js`): 264 people on the city's 40.9 km. A
  density per kilometre by district (`WALKERS_PER_KM`: residential 4,
  commercial 12, industrial 1.5, park 3, elsewhere 2 -- a flagged tunable,
  chosen to look like a street with people on it). A door is where a
  building's nearest sidewalk faces it, joined by a front walk. A walker
  walks 150-1200 m, choosing at each corner, turns back at a dead end,
  stops a while about once in two minutes, then goes in at the next door
  it passes; somebody else comes out of another, so the number holds all
  day. Where a road leaves the map, people walk on and off. Nobody is
  created or ends anywhere else once the world is running.
- They read nobody and nobody reads them, and they are drawn exactly as
  the people who cross, so nothing tells you which is which. Their own
  random stream: with nobody crossing, the traffic is tick for tick what it
  was (`verify-walkers` section 3). On for the screens (`seedGraph`'s
  `walkers`), off in the other checks, which keep the old source of
  crossers. 31 microseconds a step for the city's 264.

**Step 3 BUILT (30 September): the people who cross are people who were
walking.** When a crossing is wanted at a curb -- at the same seeded rate
as before, per crosswalk and per kilometre of parked curb -- it waits (up
to 90 s, `WANT_FOR`) for somebody walking within 12 m of that curb
(`WANT_NEAR`), who turns and walks up to it from where they are, and from
there is exactly the crosser `peds.js` always had: the curb, the decision
by manner, the near half. Across, they walk on along the far sidewalk from
where their line meets it. Nobody on foot appears or vanishes anywhere
but a door, the map's edge, or that turn, and nobody moves more than a
step in a tick (`verify-walkers` section 4, on the city's mid-block
crossings AND the Pedestrians map's crosswalks -- run on the city alone it
passed with the crosswalk path broken).

**What it costs, and it is the maintainer's call:** crossings now follow
where people are walking. Measured over 20 minutes (tools/measure/
crossers.mjs): the stand-in city 642 an hour -> 354, the Pedestrians map
1134 -> 348, which has only 12 people on its 5.9 km of sidewalk. Nobody
struck either way. Either that is the point -- a busy street has more
people crossing than a quiet one -- or the rate should hold, which means
more walkers where crossings are wanted, or a wanted crossing drawing
somebody from further off. Not tuned until he says which.

**Found on the way:** the warm-up rebases every clock in the world to
zero, and the walkers' clocks (how long somebody stands, the ease onto a
sidewalk) were left on the old one -- the same bug `warmed`'s own comment
records for drivers, and a 1.5 m jump a tick until moved with the rest.
The step off the curb is still a 0.5 m jump in one tick, older than any of
this (`peds.js`: waiting half a metre back, then on the paint).
- **Known:** a hand-placed building standing on a sidewalk is drawn over it
  and walked through -- the generator's yards (7 m and up) keep its own
  buildings clear. Corners are covered but square; there are no curb ramps.

#### 3. Bus stops: the maintainer's rulings (30 September)

Asked before building, because each is a rule a driver can get wrong. In
his words, then what each means here:

1. **Going round a stopped bus.** *"Traffic can pull around on a broken
   centre line, yielding to oncoming traffic (ideally, our drivers could
   always make a mistake here)."* On a two-lane road with a broken centre
   line a driver behind a stopped bus may pass it in the oncoming lane,
   giving way to oncoming traffic; on a solid line they may not. The
   judgment of the oncoming gap is where drivers err -- confidence decides
   how tight a gap they take, observation whether they saw what was coming
   -- the same axes that already decide a lane change and a left turn.
2. **Yielding to a bus pulling out.** *"Cars should yield to buses moving
   into the road, however this doesn't seem to be common knowledge and
   maybe can be a medium-high knowledge check. The bus driver should know
   this information, but still will observe behind without simply assuming
   others will follow the rule."* A sign-difficulty-style knowledge check:
   a driver who reads the rule gives way to a bus signalling to pull out;
   one who does not, does not. Medium-high difficulty -- placed between
   no-right-on-red (.25) and right-on-red (.35) on the DIFFICULTY scale
   unless he says otherwise. The BUS DRIVER knows the rule and still checks
   behind: it pulls out when the traffic has let it, never on the rule
   alone -- so a driver who does not know it costs the bus time, not a
   crash.
3. **Bay or curb.** *"Both, sometimes a bay will exist other times the bus
   stop can stop at the side of a road. We need this variability since it
   exists in the real world."* A stop is map data, bay or curb, per stop.
   At a curb stop the bus stands in the curb lane and blocks it (ruling 1
   applies behind it); at a bay it pulls out of the lane and back in
   (ruling 2 applies as it leaves).

**Slice A BUILT (30 September): buses and curb stops.** Open `#/tests`,
**Buses**, either section. A bus is a row in the vehicle table (12.2 m,
pulls away like a truck, brakes gently for the people standing in it, tall
enough to hide what is behind it), arriving from outside at 8% of the
traffic on a map with stops (`BUS_SHARE`, flagged) and never on one
without. A stop is a PLACE on the map (`stops: [{ id, at, kind }]`): the
loader puts it beside the nearest road, and the side it stands on says
which direction it serves; one beside no road, within 15 m of an
intersection, or left of a one-way road is refused by name. A bus stops
for its stop by the rule every car already stops for a stopped car (the
same one that pulls a car into a parking slot), stands with its front door
at the sign for `DWELL` (12 s, flagged until passengers set it), and goes
on; the traffic behind queues. The doors open only AT the stop: a bus that
began its dwell held in a queue short of it crept up and stood 19 s, or ran
out its dwell and drove past its sign (`verify-buses`, which caught both).
Not yet: bays and the yield-to-a-bus rule (C), going round on a broken
line (D). Nothing yet places stops on the stand-in city.

**Slice B BUILT (30 September): passengers.** Somebody walking past a stop
waits there now and then (`WAIT_SHARE` 0.3, at most `WAIT_MAX` 8 queued
along the sidewalk behind the post, giving up after `WAIT_PATIENCE` 7
minutes), all flagged. A bus arrives carrying 4-30 people and a share of
them (10-40%) get off, one every 1.5 s at the front door, and walk away
along the sidewalk; then the people waiting walk to the door and get on.
The door is where a bus's side stands: the curb stepped out past the
parking strip, if there is one. The bus shuts its doors when nobody is
left getting off or on -- never under 6 s (`MIN_DWELL`), and a driver
running late goes at 45 s (`MAX_DWELL`), whoever is left, who go back to
waiting. Measured on the Buses map over 15 minutes: stands of 6-19 s, 32
got on, 112 got off, nobody on foot moved more than 0.38 m in a tick.
Neither side tells the other anything: the bus counts who is waiting
from the sidewalk as it was last tick, and when each person steps off is
one formula both read (`alightAt`). **Known:** the people buses bring in
from outside the map stay on it until their walk is done and they reach
the map's edge or a door, so a map with no buildings fills up -- the
Buses map went from 12 people on foot to 55 in 15 minutes.

**Slice C BUILT (1 October): bays, and giving way to a bus pulling out.**
Open `#/tests`, **Buses**, *the eastbound bay*. A stop of kind `bay` sets
the curb back (`BAY` in map/format.js: 3.2 m, the bus's length behind the
post, 15 m tapers) -- drawn, so the sidewalk steps back with it, and one
set of numbers for the surface and for the line the bus pulls along. The
bus eases into it over the taper before its stop, by where it is, never on
a clock; fully in, it is out of the lane and the traffic passes it. When
its people are done it signals, and pulls out only when nobody is beside it
and whoever is coming behind in the lane it rejoins is stopped or at least
`PULL_GAP` (4 s, flagged) back -- the maintainer's "will observe behind
without simply assuming others will follow the rule". A driver behind it
gives way only if they READ the rule -- `yield-to-bus` in core/driver.js,
difficulty 0.30, his "medium-high" placed between no-right-on-red and
right-on-red (flagged for him) -- and can stop comfortably; one who does
not drives on past. Measured over three 20-minute runs (`verify-buses`
section 6).

**Three bugs it found, none of them nudged:**
- **A bus waited 1062 s to pull out.** Not two parties deferring to each
  other: `laneSpanOnGraph` gives both ends of a path, the one not reached
  yet clamped to its start, so every car still on its way to the road the
  bus was rejoining read as standing beside it. `laneAt` (buses.js) is the
  lane a vehicle is actually on; the longest wait is now 6.6 s.
- **A bus that had been let out vanished from the lane** until its pull fell
  below the line, so the car that had stopped for it pulled forward and met
  it. A bus pulling out is in the lane from the moment it moves.
- **A bold driver turned left across a bus with 0.93 s to spare, judging
  1.22.** `hasGap` measured how soon the oncoming vehicle reaches the
  conflict from its CENTRE, where the conflict table puts a car's -- the one
  place the other vehicle's length was not counted (`hit` already counted
  it). A bus's front is 3.85 m further ahead than a car's, a truck's 2.25.
  Fixed in `hasGap` for every vehicle; a world of cars is unchanged.

Also: two buses bound for one bay -- the second sees the first in it and
stops behind; and a person deciding to wait walks to their place in the
queue rather than sliding there.

**Slice D BUILT (1 October): going round a stopped bus** (`sim/passing.js`).
Open `#/tests`, **Buses**, *the eastbound curb stop*. On a two-lane road
with a broken centre line -- a collector here: the renderer paints a
collector's line broken, an arterial's solid double, a residential
street's not at all -- a driver who has stopped behind a bus standing at a
curb stop may pull out into the oncoming lane, pass it and come back in 6
m clear ahead. Whether to go is the left turn's own question: the time the
pass takes, padded by their caution, against the time the oncoming traffic
needs to reach its end -- so a bold driver takes a pass a sound one
refuses, and that is the mistake the ruling asked for. The oncoming driver
brakes for a car in their lane; the passer, once out, does not brake for
them, because two cars each stopped for the other nose to nose would be
exactly the wait DECISIONS.md 10.7 forbids. Measured over two 15-minute
runs: 18 passes, and the time cars stood behind a curb bus fell from 98
car-seconds to 56; nothing touched (`verify-buses` section 7,
`tools/measure/passing.mjs`).

**Found on the way, and both are the bay's as much as the pass's:**
- **Out from close behind, the car hit the bus.** Stopped 2 m behind it, a
  car pulling out over the full taper reached the bus's tail still inside
  its width -- every one of the first 19 passes. The taper is now the room
  the car has, and each plan is checked by sweeping the car's footprint
  along the line against the bus's; one that would touch is not taken.
- **A long vehicle placed by its middle swings its nose.** Given a heading
  by rotating about its centre, a bus pulling out of a bay put its nose
  1.5 m into the oncoming lane and met the bus coming the other way. Front
  and back now each sit on the line, the chord between them the heading --
  as a truck spans its path through a turn -- and the line a bus follows
  into and out of a bay is the bay's own drawn shape (`bayShape`), so a
  standing bus is wholly in the bay the screen shows.

**For the maintainer:** passing is on the broken line only. A residential
street has no centre line painted at all -- is passing a stopped bus
allowed there (no marking, so permitted when safe), or not?

### Maps made to test something (1 October, the maintainer's priority)

His words: *"the designer has been making pretty good maps so far, I'm
thinking it would be better to start from a generated map and make
changes from there rather than start at a blank slate. truthfully my wife
has taken my mouse for her work and editing on a phone is proving
difficult. we could get more testing done if maps are created with those
features in mind."*

**So generation comes first and editing is refinement**, and the loop is
built around his actual channel: a map is generated aimed at something,
he drives it, he says in words what he wants different, and it is
changed. The editor's job becomes reviewing and tweaking, not authoring.
Weeks of testing on generated maps produced good findings; this makes the
aiming deliberate rather than incidental.

**BUILT** (`map/brief.js`, `#/tests` -> **Make a map**). A BRIEF is a small
vocabulary, every word of which is MEASURED in the map that comes out --
composition's rule, a word nothing can check does not belong:
- **size** small / medium / large (2x2, 3x2, 4x3 blocks of 500 m);
- **arterials** loop / long / cross / grid / none -- which major roads are
  arterials, the rest two-lane collectors (passable around a bus);
- **signals** how many signalled intersections, or left to the city;
- **every intersection type** -- signals, signals with a protected left
  arrow, all-way stop, stop on the minor road, yield on the minor road,
  uncontrolled, and a mid-block crossing;
- **downtown** -- a commercial centre of tight blocks, crosswalks at every
  one of its intersections, and the walkers a commercial district carries;
- **buses** -- a curb stop and a bay on every full collector block, placed
  where the loaded map has room for a bay;
- **mixed drivers** -- each district a different character.
The major roads are built from the brief, every intersection given its
control, the districts grown by the existing generator; then the LOADED
map is measured -- signals counted from its nodes, every type found,
crosswalk coverage, stops by kind -- and anything short of the brief is
said on the map (`report.missing`) and in its whole-map section, never
claimed. Each map carries a section per thing asked for. `verify-briefs`
holds all of it, sabotaged once (no signals written: three cases fail).

Found by its own check before it shipped: asking for **0** signals still
signalled the arterial crossings, and downtown had crosswalks at only
**53%** of its intersections -- a street meeting a road mid-block has no
road END there until the loader splits it.

**Not yet:** a brief written as a sentence (he describes, a request is
turned into a brief here -- the vocabulary is the contract); traffic
levels and truck share are the screen's, not the map's; parking lots and
roundabouts are not expressible.

#### Parking lots: what it would take (scoped 29 September, not started)

**What exists.** Everything that moves runs on the lane graph: a car is
`s` metres along a path through an intersection. The PLAYER is too
(`sim/player.js`: `s` along the road, `off` from its line, `psi` against
its tangent) -- off the road's edges "the grass drags hard and the car
crawls", so today anything off the lane network is, in effect, forbidden
ground. What already reaches off it: `sim/parking.js` (curb slots beside
a lane, cars pulling in and out of them at rest), district trips (a car's
journey begins and ends at a slot in its home zone), zones as drawn
polygons, and `map/generate.js` laying streets inside a zone.

**Two designs, and they are not the same size.**

A. **THE LOT AS A SMALL ROAD NETWORK.** Aisles are streets: one lane each
   way, a low posted speed, generated inside a zone of kind "lot" from its
   polygon and the entrances drawn on it (the way `generate.js` fills a
   district), joined to the arterial at those entrances as ordinary
   intersections. Stalls are slots on both sides of every aisle --
   `parking.js` extended from parallel curb slots to PERPENDICULAR stalls,
   whose pull-in is a short turning arc rather than a sideways drift.
   Shoppers are district trips whose home is the lot; people walk between
   stalls and the store doors (item 2). The player drives the aisles as
   roads; pulling into a stall needs the stall rows counted as drivable
   surface in the player's geometry (their edges widened where a stall
   row borders the aisle) -- contact with a parked car already exists.
   Everything drawn in the lot is then aisle or stall, and both are
   reachable, which satisfies the principle. It cannot do: cutting
   diagonally across an empty lot, or cars finding their own line across
   open tarmac. Moderate: a generator, a second kind of slot, the lot's
   surface and paint, and the player's edges -- every piece an extension
   of machinery that exists and is checked.

B. **THE LOT AS OPEN GROUND.** World-frame driving for the player (the
   bicycle model in `player.js` in x/y rather than against a road), a
   hand-over between the two frames at the lot boundary, NPCs moving in
   open space -- on derived aisle lines (which is A again) or by real path
   planning -- and a GENERAL yielding and avoidance rule for agents that
   have no conflict table, since every right-of-way decision the sim makes
   today is read off one. A second simulation paradigm beside the graph,
   and nothing verified so far covers it. Large, and not yet shown to be
   needed.

**Recommendation: A**, with the aisle network DERIVED from the lot polygon
and its entrances so the maintainer draws a lot, not its aisles, and the
draft stays the format. B only if play shows A's limits bite.

**Needs first:** perpendicular stalls; item 2 (people walking to and from
the doors); item 1 for delivery trucks at a loading dock.

**Domain questions for the maintainer before building:** right of way in
a lot is mostly not the Highway Traffic Act's -- it is private property.
What does he teach: the through aisle over the stall rows, a car backing
out yielding to everyone, pedestrians anywhere? And a lot exit onto an
arterial: a stop, a yield, right turns only?

### Stage 6 — a world with things in it

**Crosswalks, 28 September -- the first piece.** A crosswalk is map data per
road end (`crosswalk: { start, end }`, the editor's "Crosswalk" per
approach). There is no room for one in the 2.05 m between a stop line and
the box, so where a road end has one its approach's stop line moves back by
the crosswalk's width (CROSSWALK_W, 3 m) and nothing else moves -- a map
without crosswalks is the map it was, and every existing map has none.
Drawn as continental bars from the box edge out.

**Pedestrians, same day** (`sim/peds.js`). People appear at each
crosswalk's curb every PED_EVERY (25 s, flagged) on average, step off only
when every car that would cross their path could stop comfortably, and
walk at 1.35 m/s. A crossing pedestrian holds the HALF of the road they are
on, and the next half within a step of the middle (DECISIONS.md 5.4); a car
short of its line is held at it, one already past is stopped short of the
crosswalk -- and waits behind the first crosswalk on its path, never on it,
when a later one (a turn's exit crosswalk) is held. "The way is open" counts
them, so waiting for somebody on foot is never undue delay. The player's
car against a person: they are struck, lie where they fell, flashing, for
the 45 s a wreck stands, and the traffic stops for them. Measured on the
walked crossroads, four minutes: 29 people across at each control, the
longest curb wait 8.6 s, no touches -- and the same traffic told to ignore
them hits them 15 car-ticks. One measurement misled first: a car 0.35 m
short of the paint was counted as on it, and people waited 108 s for it.
The "Pedestrians" test map. Not yet: heedless pedestrians.

**Drivers who miss them, 29 September.** A driver in the middle of a glance
away (sim/attention.js) does not know about somebody who stepped off since,
and a car that reaches a person strikes them: they lie where they fell, the
car is a wreck, it is logged (peds.js `strikes`). Recording contacts
surfaced what the ten-minute runs on the Pedestrians map had been hiding,
and each was a real gap: people walked through a wreck standing on the
paint; the near-half rule's fixed one-metre step let a car that needed 2.5 s
to clear commit as somebody neared its half (now: held if they will be
there before it is clear); a car that slowed for its turn began braking for
somebody it could no longer stop for and crept into her (now: a car that
cannot stop comfortably is committed, and the person pauses at the middle
for it); a person stepping out in front of a car pulling away from its line
stopped it after it had taken its gap, and two cars met when it went on
(now: people let a car that is already pulling away go first); and, not
about pedestrians at all, at an unsigned crossroads a slow left-turner
rolled on while the oncoming car standing at its line judged a gap and went
-- a car still rolling in now gives way to one standing at its line, if it
can stop comfortably ("whoever gets there first") -- except where the
turn rule already makes the standing car the one to give way: a
left-turner waiting on a through road is waiting FOR the oncoming traffic
(read as "there first", it stopped the through road 700 times in
verify-crossing). That costs the unsigned crossroads about a quarter of its
throughput in heavy traffic: 68 cars through in four minutes at 40 cars,
against 93 before and 89 at a four-way stop -- which is what a busy
unsigned crossroads is when everybody is careful.
Measured after: half an hour, three seeds, 584 people across, nobody struck
and no crash of any kind with drivers watching; with drivers looking away,
0 struck in half an hour -- people rarely step out where a car could not
stop, so a glance seldom costs anybody. Observation's expression against
pedestrians is THIN, and that is the finding. verify-peds sections 2 and 5.


The content the axes have been waiting for, rebuilt on the map rather
than ported: pedestrians as road users, parked cars and driveways and
cars emerging from them, blind crests as occlusion with perception
switched on, and **contact as a state** — drawn, and with a response —
which is what the observation axis has been held behind. Then the two
falsification tests from DRIVING-SCHOOL.md re-run in this world: can you
tell two drivers apart, two districts apart, by watching.

*Deliverable:* a drive that feels alive, on the city, with hazards.
*The question:* the two tests. If a rated driver is legible here, the
axes were right all along and the world was the missing half.
*Cost:* four weeks and up; open-ended by nature.

### Stage 7 — the exam mode grows up, and the school

The stage 3 reinterpretation over the real world: a candidate on a
route through the city, faults derived where the twin measurement said
they localise, the hazards of stage 6 on the sheet, graduated
intervention with the maintainer's rulings on what a grab costs whom.
Then the driving school on top (DRIVING-SCHOOL.md): the population,
learning, towns as distributions. Not scoped further here; it is scoped
there.

---

## 7. Cost, honestly

Stages 0–5 — the visual direction, the map with the player at the
wheel, the editor, the exam reinterpretation, the pipeline, the city —
is on the order of **two to three months of focused work before the city
exists with art in it**, and stage 6 is open-ended after that. The exam
mode moving to stage 3 adds days, not weeks, which is the whole reason
it moved. For calibration: the rebuild's stages 0–3, which built the
stepped core this plan keeps, took about five weeks of sessions. The
renderer rewrite and the bearing refactor are each comparable to a
rebuild stage; the editor and the generation are each larger.

What is cheap: stage 0 (days), and it is the stage that can send the
rest back. What is not: the city and its generation, which is why it is
stage 5 and not stage 1, and why throwaway maps are first-class — the
maintainer will be driving his own hand-drawn blocks for a month before
generation fills them.

---

## 8. The biggest risk

The verb question this section first raised is settled: **the player
drives** (section 1.1). What remains is the risk that section named
underneath it, and it is now sharper rather than gone.

**The base game has to be good to drive on its own terms, and the
elegance of the exam mapping is the thing most likely to distract from
that.** Section 1.1 found that the controls degrade into examining
almost for free. That is a dividend. The failure this project repeats
is treating a dividend as a reason: the assessment machinery came first
once because it was elegant and measurable, and the world was deferred
until there was nothing for a good driver to be good at. The same
failure is available again in a new coat — a neutral zone sized so
intervention reads cleanly, a turn commit timed so a direction's
deadline is neat, a steering feel chosen because stray is measurable —
each defensible alone, each shaping the driving around the examining.
**If driving the simulator is not enjoyable, the exam mode inherits a
clean mapping onto something nobody wants to play.**

The mitigation is structural, not a resolution: every stage from stage 1
puts the maintainer at the wheel and asks first whether it is good to
drive; the exam mode at stage 3 is held to days and yields any time it
competes with the driving for time; and no control decision is argued
from what it does for the exam mode. Controls are designed to feel right
to drive, and the exam mode takes what it gets.

The technical risks are real and are smaller: the isometric draw order
with elevation and overpasses (stage 0 exists to hit it first); driving
controls on a phone that feel right at all, which is its own craft and
is why they start at stage 1 rather than stage 5; the simulation's cost
at hundreds of cars (the chunk index, stage 5); the projection making a
3.6 m lane and a 4.5 m car read at phone scale (stage 0 again). None of
them is unknown territory.
