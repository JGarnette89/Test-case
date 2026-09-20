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
Jay's to run; the instrument is ready at `#/iso`); per-road posted
speeds in the sim (the loader carries them, every car drives at one
limit); ground under a road that climbs; a candidate on the map. The
editor is stage 2. (Junction surfaces, the chase camera and more than
one lane each way were on this list; 1.1.2 has them.)

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

### Stage 2 — the editor, first version

Section 4. Draw, set kinds and elevation, snap to nodes, set controls,
validate, save, drive — in one screen.

*Deliverable:* `#/editor`: the maintainer draws a map and drives it in
the same session. The first throwaway test maps are his.
*The question:* can a badly drawn map break the sim? (Try to.) Is
drawing a road pleasant enough that he will draw eight square
kilometres of them?
*Cost:* one to two weeks.

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

*Deliverable:* `#/exam?id=test-1`: ride with a rated candidate on the
stage 2 map, give directions with the turn control, intervene with the
slider, get a sheet.
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
*The question:* is it learnable? Can he find the back street he found
yesterday? Does the traffic feel alive at every density the districts
ask for? And, with the player at the wheel: is it good to drive?
*Cost:* three to four weeks.

### Stage 6 — a world with things in it

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
