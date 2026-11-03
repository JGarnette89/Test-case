# MAP INVENTORY (3 November 2026)

The first of the two things handoff 2026-10-28-evening section 9 asked to
establish before the combined map is built: **which features exist on which
map, and which check depends on which map.** Jay: *"I'm not sure every test
map has every feature in it."* This is the answer, measured.

**Table 1 is generated, not written.** Every number is counted from the
LOADED map by `tools/measure/map-inventory.mjs`, never read off a map's
name or blurb. Regenerate it after any change to a map:

    node tools/measure/map-inventory.mjs

The intersection types are `brief.js` `typeOfNode`, the one definition the
brief report already uses. Tables 2 and 3 are read from the source, and
say so.

## 1. Features, map by map

| Feature | `city` | `test-peds` | `test-signs` | `test-buses` | `test-1` | `test-highway` | `test-loop` | `bench` | `brief-default` |
|---|---|---|---|---|---|---|---|---|---|
| Offered on | #/tests | #/tests | #/tests | #/tests | #/tests | #/tests | #/tests | #/bench | #/tests, make a map |
| Extent of its roads (km²) | 2.85 | 1.12 | 1.12 | 1.28 | 1.84 | 9.82 | 5.4 | 3 | 3 |
| Road (km) | 22.1 | 3 | 3 | 2.4 | 6.5 | 10.2 | 13.6 | 31 | 30 |
| Road by kind (km) | arterial 6.1, collector 1.4, residential 14.8 | collector 1.4, residential 1.6 | collector 1.4, residential 1.6 | collector 1.6, residential 0.8 | collector 2.8, arterial 2.5, residential 1.2 | highway 6.3, collector 4.1 | highway 10.4, arterial 3.2 | arterial 6.8, collector 5, residential 16.6 | arterial 6.8, collector 5, residential 15.6 |
| Default cars | 300 | 40 | 40 | 20 | 120 | 230 | 140 | 380 | 370 |
| T intersections | 32 | -- | -- | -- | 1 | -- | 8 | 30 | 28 |
| Crossroads | 46 | 2 | 2 | 1 | 3 | 2 | -- | 91 | 82 |
| Five-way or more | -- | -- | -- | -- | 1 | -- | -- | -- | -- |
| Signals | 2 | -- | -- | -- | 1 | 2 | -- | 3 | 4 |
| Signals with a left arrow | -- | -- | -- | -- | 1 | -- | -- | 1 | -- |
| Green-wave systems | 1 | -- | -- | -- | 1 | 1 | -- | 1 | 1 |
| All-way stops | 40 | 1 | -- | -- | 1 | -- | -- | 58 | 50 |
| Stop on the minor road | 32 | -- | -- | 1 | 1 | -- | -- | 57 | 56 |
| Yield on the minor road | -- | -- | 1 | -- | -- | -- | -- | 1 | -- |
| Uncontrolled (incl. highway splits) | 4 | 1 | 1 | -- | 1 | -- | 8 | 1 | -- |
| Highway junctions (ramps meeting) | -- | -- | -- | -- | -- | 2 | 8 | -- | -- |
| Signs as objects | stop 196 | stop 6 | yield 2 | stop 2 | stop 7 | -- | -- | stop 316, yield 2 | stop 284 |
| One-way roads | -- | -- | -- | -- | -- | -- | 16 | -- | -- |
| Speed limits (km/h) | 40, 50, 60 | 40, 50 | 40, 50 | 40, 50 | 40, 50, 60 | 50, 100 | 60, 80, 100 | 40, 50, 60 | 40, 50, 60 |
| Crosswalk ends | -- | 9 | -- | -- | -- | -- | -- | 214 | -- |
| Mid-block crossings | -- | 1 | -- | -- | -- | -- | -- | -- | -- |
| Sidewalk pieces | 286 | 16 | 14 | 8 | 35 | 12 | 16 | 468 | 426 |
| Bus stops, curb | -- | -- | -- | 2 | -- | -- | -- | 10 | -- |
| Bus stops, bay | -- | -- | -- | 2 | -- | -- | -- | 10 | -- |
| Roads with turn bays | -- | -- | -- | -- | 4 | -- | -- | -- | -- |
| Acceleration lanes | -- | -- | -- | -- | -- | -- | 4 | -- | -- |
| Lane drops (lanes change at a join) | -- | -- | -- | -- | -- | -- | -- | -- | -- |
| Overpasses | -- | -- | -- | -- | 1 | 1 | -- | -- | -- |
| Highest point (m) | -- | -- | -- | -- | 7 | 10 | 10 | -- | -- |
| Roads turning over 25° along their length | -- | -- | -- | -- | 1 | 3 | 2 | -- | -- |
| Parking (km of road) | 14.6 | 1.6 | 1.6 | 0.8 | 1.2 | -- | -- | 19 | 18 |
| Buildings | 786 | -- | -- | -- | -- | -- | -- | 1041 | 1289 |
| Zones (kind/character) | residential/rolling-stops, commercial/tailgaters | -- | -- | -- | -- | -- | -- | residential, commercial, residential, residential, commercial, residential | residential, residential, residential, residential, residential, residential |
| Generated streets | 98 | -- | -- | -- | -- | -- | -- | ? | 132 |
| Truck share | 0.06 | 0.06 | 0.06 | 0.06 | 0.06 | 0.15 | 0.12 | 0.06 | 0.06 |
| Density shaping asked for | false | false | false | false | false | false | true | false | false |
| Sections | 6 | 3 | 2 | 3 | 6 | 5 | 3 | 5 | 3 |
| Load warnings | 78 | 3 | 2 | 1 | 6 | 2 | 8 | 121 | 110 |

Notes on reading it:

- **"Uncontrolled" includes highway splits.** On `test-loop` all 8 are
  where a ramp meets the loop, not street intersections. The next row
  separates them.
- **Signs as objects** counts stop and yield signs. No map has a
  no-left-turn or no-right-on-red sign, though both are in the format
  (`SIGN_KINDS`) and checked in `verify-signs` on hand-built fixtures.
  One-way and speed signs are derived from the roads, not placed.
- **Sidewalk pieces** are the pieces `sidewalksOf` derives, not a length.
- **Default cars** is `carsFor`, the screen's starting density.
- **The `city`'s stored bounds understate its extent** (0.07 km² against
  2.85 for its roads), so the extent row measures the roads. Nothing reads
  those bounds for the sim, but the editor may.
- **Load warnings** are the loader's own, and every map has some. 121 on
  the bench map is worth a look before it becomes the base of anything.

## 2. Against Jay's list for the combined map

The list from handoff section 9, each item against where it exists today:

| Wanted | Where it is now |
|---|---|
| Signalised crossroads | `city`, `test-1`, `test-highway`, `bench`, brief |
| A stop junction | everywhere but the highways |
| A T | `city`, `test-1`, `bench`, brief (and the loop's ramp splits) |
| Residential and business stretches | `city` (two characters), `bench` and brief (zones) |
| Bends | only `test-1` (1), `test-highway` (3), `test-loop` (2). **The generated city and the bench have none** |
| Pedestrian crossings | `test-peds` (9 ends, the only mid-block crossing), `bench` (214 ends). **None on the `city`** |
| A lane drop | **nowhere** -- no join on any map changes its lane count |
| A merge taper | `test-loop` only (4 acceleration lanes) |
| A highway with proper on- and off-ramps | `test-loop` only, and it is one-way. `test-highway` is a two-way highway with signalled crossroads, no ramps |

Not on the list, but only on one map: the five-way and turn bays
(`test-1`), the yield on a minor road (`test-signs`, plus one on the
bench), bus stops (`test-buses`, `bench`), one-way roads (`test-loop`),
overpasses (`test-1`, `test-highway`). **Nothing has a roundabout**: the
simulator has never had one; the old engine's single-lane roundabout went
with it.

**The bench's map is already most of a combined city.** It is a brief
with every intersection type, a downtown and buses (`BENCH_BRIEF`), and it
carries crosswalks, curb stops and bays, a left arrow and a yield that the
`city` does not. What it lacks is the list's highway half (ramps, merge,
bends) and a lane drop. So the combined map is plausibly the bench brief
plus a highway section, not a new map drawn from nothing.

## 3. Which check uses which map

Read from each check's source: the maps it builds or names. "Fixtures"
means maps the check builds itself (`emptyMap` plus roads), which retiring
a test map cannot touch. **Retiring a map breaks every check in its row.**

| Map | Checks that use it |
|---|---|
| `test-1` (`testMap1`, also the default of `scene.js` `worldFor`) | actuated, bays, busbays, buses, checks, connect, crashes, drive, editor, encounters, exam, generate, graph, greens, keepright, lanecost, lanes, map, money, observation, paint, passing, signal, signs, voice -- **25** |
| `test-loop` | anticipation, checks, courtesy, generate, headway, lookaway, loop, merge, mergecount, promotion, shaping, voice -- **12** |
| `city` (`testCityReady`) | chase, compliance, crashes, generate, headway, observation, peds, places, rivals, skill, trucks, worker -- **12** |
| `test-buses` | busbays, buses, passing |
| `test-peds` | paint, peds |
| `test-signs` | greens |
| `test-highway` | none by name |
| every `TEST_MAPS` entry, whatever it holds | start, walkers, waves (and generate's section 0, every section opens) |
| brief maps | briefs, start, waves |
| the bench map | bench, start, waves |
| stage 0 (`stage0Map`) | editor, graph, map |
| no map: the compass intersection or stage 0's roads | core, course, crossing, perf, screens, sim, telling, wheel |

So: **`test-highway` can go without breaking any check by name** (three
checks loop over all test maps and would simply see one fewer) -- though
two measurement scripts use it (`tools/measure/wave-miss.mjs`,
`highway-speed.mjs`). And there is a ninth map no menu lists:
`src/map/highway.js` `testHighway`, "the open highway -- 15 km that change
character: a climb, a downhill 90, interchanges", same function name as the
samples.js one, used by no check.
`test-signs` feeds one check and `test-peds` two. `test-1`, `test-loop`
and the `city` are what most of the suite stands on, so a combined map
either keeps them or moves 25, 12 and 12 checks.

## 4. Which features each screen switches on

DECISIONS 10.35: features belong to screens, not to the world. Read from
`sim/scene.js` `worldFor`, `MapRoad.jsx`, `ExamRide.jsx` and
`iso/benchworld.js`:

| Feature | `#/map`, `#/tests`, editor's Drive it | `#/exam` | `#/bench` |
|---|---|---|---|
| Map | any (test-1 by default) | **test-1 only** | the bench map only |
| Rivals | on | on | **off** |
| People walking | on | on | on (switchable) |
| Drivers looking away | off, a switch | **off, no switch** | **off** |
| The candidate's checks (mirrors, shoulder) | off, a switch | **off, no switch** | **off** |
| Density shaping | on where the map asks (only `test-loop`), a switch | **never** (not driving) | **never** |
| Traffic skill dial | **here only** | no | no |
| Trucks, buses, parked cars, crossers | as the map says | as the map says | switchable, for the split |
| Sim in a worker | yes | **no, in the page** | yes |

The same map is therefore a different world depending on which screen
opened it: look-away, checks, shaping and the skill dial are each a
property of one screen. That is the defect 10.35 names, and this table is
its scope.

## What this leaves for the combined map

1. Item 2 of handoff section 9 is done: the checks-to-maps table above.
2. The decision it informs is Jay's: two maps (a combined one plus the
   endless highway) or keep `test-1` and the `city` as check fixtures
   behind a debug menu while the menu shows only the combined one. The
   cheapest path the numbers suggest: **build the combined map from the
   bench brief plus a highway section with ramps and a lane drop; keep the
   existing maps as fixtures off the menu; move checks only when a fixture
   is retired.**
3. Features as a property of the world (10.35) is the other half, and
   section 4 is its list.
