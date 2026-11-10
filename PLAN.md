# PLAN — everything recorded, in one order (13 October 2026)

**Why this exists.** SIMULATOR.md's staged path (section 6) was written on
18 September. Since then the design has arrived piecemeal, in side
documents: the story and A.U.T.O. ([STORY.md](STORY.md)), five characters
([CHARACTERS.md](CHARACTERS.md)), six vehicle classes and the garage
([VEHICLES-GARAGE.md](VEHICLES-GARAGE.md)), day and night
([DAY-NIGHT.md](DAY-NIGHT.md)), objectives (SIMULATOR.md, "OBJECTIVES"),
the dialogue set ([DIALOGUE.md](DIALOGUE.md)), trucks as a job, the
rivals' cheap pass and the shared foundations. This file is the ONE ordered
sequence that reconciles them. The side documents keep the reasoning; this
keeps the order. When the order changes, it changes here.

**The rule that has worked, kept:** every step ends in something the
maintainer can DRIVE. A plan this large is more likely to forget it, not
less, so each phase below names its playable milestone.

**Cost units** are calendar time at the pace of the last month of
sessions (a feature like courtesy gaps or actuated signals: two to four
days, measured and checked). Days < a week; weeks = 1-4; months = more.
**Kind**: **SHARED** foundation (every district, every mode needs it),
**PLAYER** -facing feature, or **DISTRICT** decoration (one place needs
it). The maintainer's rule: build what every district needs before what
one district needs.

---

## 1. Where it stands -- built

The SIMULATOR (stages 0-2, 5 and much of 6): a stepped 20 Hz world on a
road network with elevation and overpasses; the player at the wheel
(two controls, signal-as-turn-commit, lane assist, chase and free
cameras); the editor (roads, zones, controls, signs, crosswalks, stops,
buildings, undo, a map library); maps as data with test maps and named
sections; a generated city inside drawn districts; five driver axes plus
compliance, district characters; signals (phases, actuated loops, green
waves), signs as objects with difficulty, lane changes and keep-right,
turn bays, corners, one-way roads, the endless highway; trucks, buses and
stops, passengers, passing a bus; parked cars and trips; pedestrians at
crosswalks and walking along sidewalks; sight blocking by trucks;
attention lapses; crashes that stand; the horn both ways; courtesy gaps
(13 Oct); the exam mode, rough (`#/exam`); the phone bench.

Not built from section 6: **stage 4, the sprite art pipeline** (cars are
still prisms), and the **handmade ~8 km² world** (test maps and a
generated stand-in city instead).

---

## 2. Where documents disagree, and which should win

| | says | says | recommend |
|---|---|---|---|
| 1 | CLAUDE.md: the examiner game "is the whole game. There are no other modes." | SIMULATOR.md: a traffic simulator first, the exam a mode later | **SIMULATOR.md** -- CLAUDE.md already marks its examiner sections as history; rewrite its opening paragraph so a cold reader is not misled |
| 2 | DAY-NIGHT.md parked default 5: "a driver building a life in one town", purgatory parked | STORY.md: Metro Grid, A.U.T.O., an examiner stripped of his licence, three acts | **STORY.md** -- the maintainer's later, fuller choice; default 5 is superseded, and the purgatory frame is retired |
| 3 | DAY-NIGHT.md default 6: the examiner game is "a day job: work as an examiner" | STORY.md Act I: the examiner's licence is REVOKED | **STORY.md, reconciled**: the exam mode returns as the Act I prologue (the test that costs you the licence) and then as TEACHING at the academy (DRIVING-SCHOOL.md's verb change) -- not as a paid day job |
| 4 | DAY-NIGHT.md default 10: "a fictional Ontario-feeling town" | STORY.md: Metro Grid, a city under a municipal AI, four districts and "sectors" | **Both**: the city is Metro Grid; its roads, signs and rules stay Ontario/North American (CLAUDE.md, domain authority). Fiction may be strange, the law may not |
| 5 | SIMULATOR.md stage 4: vehicles as 32-heading SPRITES from a voxel pipeline | VEHICLE RENDERERS: vehicles drawn BY CODE on the canvas | **Code-drawn now** -- no art dependency, scales with zoom, already how everything is drawn; the sprite pipeline is deferred (section 6) |
| 6 | DAY-NIGHT.md constraint 3 / ruling: every reward must be one a genuinely good driver would get | GARAGE: a tactical ECM that subverts signals | **Already resolved** (VEHICLES-GARAGE.md): the honesty rule belongs to the DAY; the ECM is night-only |
| 7 | GARAGE formula: "effective compliance score" | `core/driver.js`: compliance is a driver's own disposition | **Rename**: A.U.T.O.'s assessment of the player is `scrutiny`, never "compliance" (recorded) |
| 8 | CHARACTERS/VEHICLES: a motorcycle that filters between lanes | Ontario law: lane filtering is not legal; the sim assumes one vehicle per lane | **Cut the filtering**; a motorcycle, if ever, is a narrow rigid row in `VEHICLES` that keeps its lane (section 6) |
| 9 | SIMULATOR.md section 8 and the reframe: "one continuous handmade ~8 km² world" | practice: generated districts inside drawn shapes, test maps | **Both, staged**: the handmade blockout (the maintainer's) with generation inside it remains the target; until then, test maps carry each feature |
| 10 | CLAUDE.md, the roguelike/purgatory sections, Purgatory Road artifact | STORY.md | **STORY.md**; the roguelike is deleted code (cut B) and its notes are history |
| 11 | STORY.md (13 Oct): Metro Grid, present day, A.U.T.O. watching human drivers | STORY.md (3 Nov): Red City, Miskawin, 1980s-90s analog, A.U.T.O. has replaced drivers with pods | **3 Nov is the setting**; its premise, acts, mentor and rivals are unstated, so the 13 Oct answers stand until the maintainer says otherwise (STORY.md 5) |
| 12 | PLAN 6: drifting and weight transfer deferred; grip, not a slip model | STORY.md (3 Nov): weight transfer in the core vision; drift is Maya's discipline | **RULED 3 Nov: a full physics model (grip and weight transfer, per vehicle and surface) is the endpoint**; items 13-14 grow to it. Open: whether the traffic shares it (STORY.md 4) |
| 13 | DIALOGUE.md: all units metric; DAY-NIGHT default 1: illegal driving always judged as illegal | Zane: dodging speed gantries "at 90 mph" | **RULED 3 Nov: metric always; default 1 withdrawn** -- night is free driving with calmer traffic in places, content unrestricted; whether anything answers it is the story's (STORY.md 4) |
| 14 | DISTRICTS.md correction 2: the city modelled on no one place | a Great Lakes border motor-town with an international bridge | **RULED 3 Nov: one fictional region, one rule set** -- southwestern Ontario and Michigan are examples of the road variety wanted, not a setting or a border; the bridge is not international in effect; correction 2 stands (STORY.md 4) |
| 15 | PLAN 7 (built): the route on the road, the turn banner, lane advice | the analog era: paper slips, street names, no digital navigation | **RULED 3 Nov: kept and restyled, never replaced** (STORY.md 4, ruling 6); paper route cards and street names may come as additions, and street-name signs do not exist yet |
| 16 | DAY-NIGHT default 11: missions on a phone/dispatch screen | Artie's carbon-copy board | **Artie's board** -- the same screen, in period; no gameplay change |

---

## 3. The dependency spine

Most of the recorded work hangs off five foundations. Build them in this
order and almost everything else becomes a parameterisation:

```
 A. FRAME BUDGET (Web Worker) ── everything below spends it
 B. EVENTS + RATE LIMITER ──── dialogue, A.U.T.O.'s voice, feedback, streaks, jobs' scoring
 C. GO SOMEWHERE: destinations + routing + a route shown to the player
        ├── jobs (taxi, delivery, hauling) ── trucks as a job (+ articulation)
        ├── racing (a course between checkpoints, an opponent that drives TO it)
        ├── police pursuit (routing to a moving target)
        ├── A.U.T.O. forced rerouting
        └── parking lots (destinations that are areas) ── deferred
 D. MONEY: earnings by skill, fines, prices ── garage, fines, jobs' pay, licence classes
 E. PER-VEHICLE AND PER-SURFACE HANDLING (global constants → per vehicle, per surface)
        ├── surfaces (gravel, wet) ── weather, Hannah's county
        ├── garage performance tiers (brakes, handling, tyres, engine)
        └── articulation's own handling
```

Known dependencies, made explicit:
- the dialogue needs the RATE LIMITER (B) before any trigger is wired;
- trucks as a job needs ARTICULATION (sim and renderer: turn geometry,
  lane rules, clearance, reopened by the maintainer) AND a delivery
  destination (C);
- parking lots need the OBJECTIVES layer (C) plus open-space motion;
- Hannah's district needs SURFACES (E);
- racing is shared by all four rivals and needs C;
- Zone Quality needs a STORED PER-DISTRICT QUANTITY that does not exist,
  plus the driving school's population and learning (DRIVING-SCHOOL.md 4);
- A.U.T.O.'s punishment side needs `scrutiny` (B's events feed it), money
  (D) for fines, the player model's cap for governors, and C for
  rerouting; its "artificial reds" ride on the actuated lights (built);
- the Act III convoy needs PLATOON CONTROL (several AI cars holding a
  progression as a group), which nothing has;
- police and the night need DAY/NIGHT (density dial per time, rule sets,
  night rendering).

---

## 4. The order

Each item: what it is · kind · cost · depends on. Phases end in a
playable milestone.

### Phase 1 -- in flight, then the rivals (about two weeks)

1. **Courtesy gaps** -- the traffic lets a signalling player in; the mark
   on the car. PLAYER. Days. *Finishing now.*
2. **The sim in a Web Worker** -- the step off the main thread; the cap
   roughly triples by the measured split (SIMULATOR.md 1.2.9). SHARED.
   Days. *Built, 13 October: `#/map` and `#/bench` ("Sim in a worker").*
   The phone's bench says what it bought.
3. **The rivals' cheap pass** -- Victor and Brenda Braga, Mason Lin,
   Hannah Miller as named drivers in the world that exists, each an axis
   profile (bold-and-scofflaw gap forcing; timid-and-compliant stopping
   short and over-yielding; bold-and-able threading; observant-and-steady
   reading obstacles), findable on the map with a name tag. PLAYER, cheap.
   About a week. Tests whether they read as PEOPLE before their worlds
   exist. *Built, 14 October (SIMULATOR.md, "THE RIVALS, CHEAPLY").*

> **PLAYABLE MILESTONE 1 -- "Meet the rivals."** Drive the stand-in city
> at the higher density the worker buys, with the courtesy gaps, and pick
> out the four rivals by how they drive.

### Phase 2 -- A.U.T.O. speaks (about two weeks)

4. **Events and the rate limiter** -- one event stream from the sim
   (the 22 triggers, DIALOGUE.md), a budget of at most one line per
   interval, by severity, nothing repeated in a session. SHARED. A week. *Built, 14 October.*
5. **Streak counter; green-wave caught/lost; the player offering a
   courtesy gap** -- the three things DIALOGUE.md lists as undetected.
   SHARED. Days. *Built, 14 October.*
6. **Dialogue delivery** -- the stored lines on screen (a line, a
   speaker, a portrait slot), context-aware (day/night, racing).
   PLAYER. Days, after 4. *Built, 14 October: 236 lines, a caption on the canvas.*

> **PLAYABLE MILESTONE 2 -- "The city talks back."** Drive; A.U.T.O., Jay
> and the rivals comment, rarely enough to matter.

### Phase 3 -- going somewhere, and the first job (about a month)

7. **Destinations and routing** -- a place (a door, a stand, a dock) as
   map data; a route on the graph TO it; for the player, the route shown
   (a line on the road, a turn arrow, the dispatch screen's marker).
   SHARED, the deepest one. Two weeks.
   **BUILT 14 October** (`src/sim/route.js`, `src/sim/session.js`): a
   place is the curb in front of a building, derived from the map's own
   buildings (755 of the stand-in city's 786); a route is the shortest
   path over the graph's joins; the screen draws it on the road, says
   the next movement and WHICH LANE it needs, and notices arriving.
   `#/map`'s Go somewhere sends the player to a place 400 m to 2.5 km
   away. Docks and stands as typed places wait for the jobs that need
   them. `verify-places`.
8. **Money** -- earnings by SKILL not time (the sim's own standards:
   smooth, at the limit, no horns aimed at you), a balance, stored
   through `storage.js`. SHARED. Days.
   **BUILT 15 October** (`src/sim/money.js`): the base is the task (a
   flag and a rate on the route as planned), every fault the game raises
   costs its own severity, contact voids the fare, time over the limit and
   lateness cost, a clean drive is tipped; a wallet through storage.js.
9. **The job machinery and TAXI** -- pick up, deliver, a standard, a fare
   (DAY-NIGHT.md defaults 7, 11, 12). PLAYER. A week on 7 and 8.
   **BUILT 15 October** (`src/sim/jobs.js`): `#/map`'s Taxi: find a
   fare -- an offer, accept, the pickup, 3 s at the curb, the meter, the
   drop-off, a receipt on the canvas. `verify-money`. Milestone 3's
   first half: "a dispatch offers a fare; drive it; get paid for how you
   drove".
9a. **PASSENGER COMFORT scoring** -- one mechanic serving taxi, the
   commuter express and the VIP airport shuttle (JOBS.md): smoothness from
   the sim's own harsh-braking and lateral measures. PLAYER. Days.
9b. **HIGHWAY FLOW PACER** (JOBS.md) -- hold a steady buffer behind a
   convoy and let merging traffic in: the win condition is NOT BEING THE
   PROBLEM. Possible only because following and courtesy are modelled
   (it needs the player-offers-a-gap event of item 5); probably the
   cheapest genuinely distinctive job on the list. PLAYER. Days to a week.
9c. **Multi-stop delivery** -- the courier sprint, the food run and the mail
   route are ONE activity in three costumes; budget it once. PLAYER. Days.

> **PLAYABLE MILESTONE 3 -- "The first fare."** A dispatch offers a fare;
> drive it; get paid for how you drove. Then the flow pacer and the first
> deliveries on the same machinery.

**The job catalogue (JOBS.md) is budgeted as about NINE distinct
activities, not sixteen.** Ten jobs need nothing beyond the objectives
layer (and articulation for the two semi hauls); the rest are a
dependency argument, placed below where their blocker is built.

### Phase 4 -- the hauling job (about six weeks)

10. **Articulation** -- a tractor and trailer as two rigid bodies and a
    hitch, in METRES, heading zero east, a clamp that clamps; swept path,
    turn geometry, lane rules and clearance reopened (the maintainer
    accepted it). SHARED for the semi class. Three to four weeks.
11. **The player at the wheel of a semi** -- no view behind, jackknife as
    content, REVERSING (the two-control scheme driving backwards).
    PLAYER. Two weeks.
12. **Hauling as a job** -- a load, a dock to back into, a delivery on the
    job machinery: the intermodal haul and the steel coil delivery first
    (JOBS.md, nothing new), then **PORT FREIGHT REVERSE DOCK** -- the most
    appealing job on the list, unlocked by REVERSING, which is what makes
    the articulated truck an activity rather than a bigger vehicle. Its
    loading bays are a dock as a destination, not the parking-lot work.
    PLAYER. A week on 7-11.

> **PLAYABLE MILESTONE 4 -- "Back it into the dock."**

### Phase 5 -- the shared foundations the rivals stand on (two to three months)

13. **Per-vehicle and per-surface handling** -- the global constants
    (`stoppingRoom`, `BRAKE`, `LATERAL`, `radiusFor`, grip) become
    properties of a vehicle and of a surface, as the per-road speed limits
    did. SHARED. Two to three weeks. **3 November: the first step toward
    a full physics model -- grip and weight transfer per vehicle and
    surface -- which is now the endpoint (STORY.md 4, item 1); drift falls
    out of it. The player's car first; whether the traffic shares it is
    open.** Costed then: months, not weeks.
14. **Surfaces** -- gravel, wet asphalt; grip and the traffic's corner
    speeds follow; weather reuses it later -- and lake-effect snow and ice
    are now in the setting. SHARED. One to two weeks.
    **Gravel unlocks two jobs** (rural produce delivery, gravel quarry
    haul) **and Hannah's district** -- the job list corroborates it as a
    shared foundation independently.
15. **Head-to-head racing** -- a course of checkpoints (C), an opponent
    that drives TO it with any driver's profile -- named or not, as the
    mission says (the maintainer, 3 November: "anybody we want to"; e.g.
    Zane offers a race against NPCs on the highway). SHARED. Three weeks.
16. **Day and night** -- the density dial by time, the night's rule set,
    night rendering (lamps exist; headlights and darkness do not; the
    `shadowBlur` cost noted). SHARED. Two to three weeks.
17. **A.U.T.O.'s punishment side** -- `scrutiny` (A.U.T.O.'s assessment of
    the player, fed by phase 2's events, raised by engine tuning -- the
    detection signature), targeted reds on the actuated lights, fines
    (D), a speed governor, forced rerouting (C). SHARED, city-wide. Three
    weeks.
18. **Police pursuit** -- police as actors, mainly at night, chasing by
    routing to a moving target. SHARED. Three to four weeks.
19. **The garage** -- cosmetics first (paint, headlights, underglow on the
    player's car only), then performance tiers on 13. PLAYER. Two weeks.

> **PLAYABLE MILESTONES**: "Race Mason downtown at night" (15+16), "A.U.T.O.
> notices you" (17), "Lose the police" (18).

### Phase 6 -- the campaign and the school (months)

20. **The handmade world** -- Metro Grid's blockout with its four
    districts and the four sectors Act III needs, generation inside it,
    cheap far traffic so 8 km² runs on a phone. SHARED. The maintainer's
    authoring time plus a month.
21. **The campaign scaffold** -- acts, missions via the phone/dispatch
    screen, the Act I prologue built on the exam mode (`exam.js`; the
    intervention ruling still open). PLAYER. Three to four weeks.
22. **The academy and ZONE QUALITY** -- a persistent population, a model
    of learning, a stored per-district quantity, its signal delays easing
    (DRIVING-SCHOOL.md 4). SHARED for Act II. Two to three months.
22a. **Escort behaviour** -- shepherding one specific slow vehicle (the
    Courtesy Pacer Escort, JOBS.md); the same family as the Act III convoy's
    platoon control, so built once for both. SHARED. Two weeks.
22b. **Blind-spot collisions as a scored category** (Port Warehouse
    Distribution) -- adjacent to sight and contact, not the same; a small
    addition once a box-truck job exists. PLAYER. Days.
23. **District decoration**, one at a time, after all of the above. The
    SCHOOL ZONE goes first of these: the school zone run (JOBS.md) is one
    of the strongest jobs -- smoothness with pedestrians at stake is the
    clearest use of the braking model:
    school zones (suburbs), loading docks (port, shares the dock from 12),
    nightclub crowds (downtown), livestock and farm equipment (county).
    DISTRICT. One to two weeks each.
24. **Act III's convoy** -- platoon control on a green wave across four
    sectors. PLAYER, the finale. A month, last.

---

## 4b. The architectural audit (1 November) against this order

An external review (Gemini) audited the code against the Red City story in
three areas; checked against the code on 3 November. **It changes nothing
in the order above.** **Provenance:** `ARCHITECTURAL-AUDIT.md` and
`REPORT-CHECKS.md` were supplied by the maintainer and committed on 3 November
(this section was written before they were read here and has not been rechecked
line by line). Conflicts with the story: DECISIONS 10.37. Where it lands:

| the audit's phase | where it already sits |
|---|---|
| P0, a contract engine replacing the taxi | items 9a-9c. `jobs.js` is already the job machinery with the taxi as its first job, and pay is already separate (`money.js`); what is missing is a job of several stops (9c) and a scoring rule per job, by its metric (9a first). Written the project's way: a job is a RECORD (JOBS.md already gives vehicle, district, difficulty, metric) and its scorer is picked by its metric -- not the audit's `Contract` class with evaluator objects |
| P1, one screen | the combined-map item (handoff 2026-10-28 evening section 9; DECISIONS 10.35). `ExamRide.jsx` shares `sceneFor` with MapRoad but runs its own canvas and loop. `RoadStrip.jsx` is already imported by nothing |
| P2, the analog presentation | a presentation pass after that. The instruments AND the navigation display (route on the road, turn banner, lane advice) are KEPT and restyled (STORY.md 4, ruling 6). The genuinely cheap pieces: a needle speedometer, an odometer, a paper receipt, a dot-matrix caption. NEW SYSTEMS, not restyles: street names (the map format has none, nor signs for them) under any paper route card; audio (the game has none) under CB squelch; an engine model under a tachometer |
| P3, vehicle kinds and revival | after item 13 and the physics model it now grows to; revival drives the skill dial (`sim/skill.js`) and a vehicle mix. **Position open: see below** |

**THE FIRST GAME IS THE ENDLESS HIGHWAY (DECISIONS 10.60, 10 November). The cut is the world, not the features: the expansive city is deferred, and only it. Read 10.60 before ordering anything below by what the city needed. Then 10.62: content pulls the player back, missions leave the highway by an exit into a generated area, stops differ; separate-or-continuous is read there. Then 10.61: IN FLIGHT 36 and 42 are defects in the product and come first when there is room; pull-off points are the world still to build; distance drives no difficulty lever yet.**

**The order from here (DECISIONS 10.52, 5 November): terminal contact, built (10.54); body motion; then destinations and player-tuned density as one piece with one measurement; then the price of slowing with prior sight. The rest of the legibility work is the per-axis list in 10.52: show the cause, not the state, and do not fix a seeing problem by changing the driver model. Delayed consequences arrive by mail. Sound: recorded, unscheduled. Accident scenes with emergency services, and the test for choosing a visual style: DECISIONS 10.53, direction, unscheduled.**

**What a collision costs (DECISIONS 10.48, unscheduled, filed here and against the contract work):** the maintainer's direction, damage that accumulates and is not game-ending, and the project lead's unruled proposals: attribution from the fault machinery, continuity as the cost, a consequence that routes you somewhere and not into a form, a damaged car that handles wrong. Mass is not yet in `VEHICLES`.

**The vehicle archetypes: the project lead's view, for the order, not yet set with the maintainer.** Its best and cheapest item: distinct physics per class is mostly a data table, and it is what makes a rusted sedan feel different from a tuned import. **It is not free.** Populating them moves every world and re-baselines every check, so it belongs after the world settles (39, 40). **Read against the code:** `VEHICLES` already has `accel`, `brake`, `most`, `cap` and `lateral` per row, so the longitudinal half is data; `radiusFor` and grip, per PLAN 13, are what to check next. A row nobody draws moves nothing, since trucks have their own stream. **DO NOT COPY THE AUDIT'S TABLE AS WRITTEN: its `cap` values are a defect.** An ordinary car's `cap` is `Infinity`, so `v8_muscle` at 1.4, `tuned_compact` at 1.35 and `rust_sedan` at 1.25 would all limit cars an ordinary car is not limited beside, the reverse of what those rows are for. It also cuts into the speed spread already tuned (`wantedFor`). And STORY.md section 3 still stands against the audit's `variance` and `headway` as vehicle fields: the driver owns those.

**The mission rule it needed (STORY.md 4, ruling 7):** a mission is not
tied to its giver, and the job machinery carries both seats -- the player
driving while somebody judges, and the player with limited control while
somebody else drives (the exam mode is the first of these). Build 9a-9c so
a job names which seat the player is in.

**Its specialist evaluators are mostly blocked:** Hank's on surfaces (14),
Maya's drift on the physics model (13), Zane's slipstream on drag (not
modelled), Victor's load shift on articulation and load physics (phase 4).
Buildable now: Brenda's exam and Artie's courier runs.

**Its checks report** (30 October; **its timings are loaded-run numbers, not costs**, TESTING.md): a duplicated
warm-up in `verify-courtesy` section 7, and a second found in the same search,
`verify-trucks` sections 3 and 7. **Both fixed, sabotaged and on `main`**
(TESTING.md): side by side under one load, 593 s -> 434 s and 571 s -> 548 s,
output identical line for line. "The other slow checks run distinct worlds -- their time
is their sample" is that session's claim, not verified. **Cached warmed worlds are refuted; district subgraphs stand only with traffic
kept flowing across their edges: DECISIONS 10.36.** Its keep-right worker-thread
recommendation is approved by the project lead, sabotage first; **not started,
DONE 4 November: 327 s to 69 s at nine workers, measured near alone (TESTING.md).** The report's claim that `verify-screens` harnesses `ExaminerDrive` is
false (deleted 24 September; confirmed by search on 3 November).

## 4a. The content already written, against what can be built

**Three external content files now exist, all written against real
mechanics:** the dialogue set ([DIALOGUE.md](DIALOGUE.md), twenty-odd
triggers, five speakers), sixteen day jobs ([JOBS.md](JOBS.md), about nine
distinct activities), and five district briefs ([DISTRICTS.md](DISTRICTS.md),
each with its own layout, hazards, naming and landmarks). **Together they
describe considerably more content than this plan can build soon** -- a
year of the order above would not exhaust them. They are a well to draw
from, not a backlog to clear, and nothing in them moves the order: each
piece is built when the foundation under it exists, and the parts outside
the buildable palette (DISTRICTS.md: alleyways, multi-lane roundabouts,
ditches, farm machinery, gantries) are cut or added deliberately.

The district briefs carry one finding worth building toward: **each
district has a different relationship to the green wave** -- highway speed
discipline, industrial long phases, suburban stop signs with no waves,
downtown reaction over rhythm, rural no signals and grip -- so the core
mechanic means something different in each place (DISTRICTS.md).

## 5. At a glance: how far off

| horizon | what |
|---|---|
| **this week and next** | courtesy (shipping), the worker, the rivals' cheap pass |
| **within a month** | events + rate limiter, dialogue on screen, streaks |
| **one to two months** | destinations and routing, money, taxi, passenger comfort, the flow pacer, multi-stop delivery |
| **two to three months** | articulation, driving a semi, reversing, hauling, the reverse dock |
| **three to six months** | handling refactor, surfaces, racing, day/night, A.U.T.O.'s punishments, pursuit, garage |
| **six months and more** | the handmade 8 km² Metro Grid, the campaign, the academy and Zone Quality, district decoration, the convoy finale |

---

## 6. Cut, or deferred indefinitely -- more is recorded than can be built

- **The Downtown Medical Express** (JOBS.md) waits on a motorcycle, which
  is deferred; the job is not a reason to build one.
- **Multiplayer** -- deferred indefinitely. The deterministic seeded sim is
  kept as an asset (SIMULATOR.md roadmap), nothing more.
- **Motorcycle lane filtering** -- cut (illegal in Ontario; breaks one
  vehicle per lane everywhere). A motorcycle at all: deferred.
- ~~**Drifting and weight transfer** as physics -- deferred~~ **REINSTATED 3
  November as the endpoint of items 13-14 (STORY.md 4, item 1).** Was: deferred; Hannah's county
  gets surfaces (grip), not a slip model.
- **Parking lots as simulated places** (the Costco lot: carts, circling,
  queues) -- deferred indefinitely; a destination at a lot's entrance
  serves the jobs.
- **The sprite art pipeline** (stage 4) -- deferred; code-drawn vehicles
  (VEHICLE RENDERERS) instead.
- **International mode, leaderboards and Play connectivity** -- deferred
  indefinitely; no network code until asked.
- **Livestock and farm equipment** -- last of the decoration, cut if time
  runs short.
- **The old engine (`src/engine/`)** -- DELETED 14 October, with its
  checks (the maintainer: "it's just bloat at this point"). The exam
  mode's grading moved to `src/sim/detect.js`.

---

## 7. The next three, plainly (updated 15 October)

Done since the plan was written: courtesy gaps, the Web Worker (and its
stutter, and the page's garbage: 400 cars clean on the phone), the rivals,
A.U.T.O. speaks (phase 2), destinations and routing, money, the taxi.

1. **Passenger comfort** (9a): smoothness through acceleration and
   corners, measured from the car model, joining the taxi fare.
2. **The highway flow pacer** (9b).
3. **Multi-stop delivery** (9c): courier, food run and mail route as one
   activity.

**Next playable milestone: 3, "The first fare"** -- its first half (a fare
offered, driven, paid for how it was driven) is built; it completes with
those three.
**Added 21 October, NOT STARTED -- recorded so it is not lost:**
- **Signalling in the driver model.** NPC turn signals are drawn but are
  not the driver's: a turn signal comes on a fixed 3 s / 25 m out, a lane
  change signals only while the car is moving across. The maintainer: most
  drivers "signal poorly, closer to their steering action than to show
  their intent". When a driver signals is knowledge (knowing to) and
  observation (having planned the move in time) -- a natural home for both,
  and the most visible piece of driver character there is. Costed with the
  road-infrastructure scoping (21 October report).
- **Courtesy that has looked behind; the onset of braking as the braking
  axis's observable; observation's markable fault; lead-car obligation** --
  DECISIONS.md 10.12 and 10.13.

