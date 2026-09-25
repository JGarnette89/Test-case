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
