# STORY — Red City, Miskawin (recorded 3 November 2026, NOT BUILT)

**This replaces Metro Grid as the setting.** From the maintainer's new
STORY document (written with another model, Gemini; it cites a
`Narrative_Architecture_85879625.md` that is not in the repo and has not
been seen). Same convention as before: **direction, not specification.**
Where it conflicts with what exists or with a standing ruling, the conflict
is recorded beside it, not settled by whoever reads this next. The
13 October Metro Grid record is kept at the bottom as history, because this
document is silent on several things that one decided (section 5).

**RULED, 3 November (section 4, at its top): a full physics model is the
endpoint; anybody can be raced; night is free driving; the region is
one region with one set of rules, its roads drawn from places like
southwestern Ontario and Michigan; metric always.**

**RECORDED AS DIRECTION, WITH SIX THINGS IT DOES NOT SAY (section 5).**
The setting, the era, the hub and the five specialists are clear enough to
record as decided. The player's premise, the campaign's shape, the mentor,
whether the specialists are still rivals, how revival is measured, and the
rulings in section 4 are not. Nothing in code changes on this record alone.

Characters: [CHARACTERS.md](CHARACTERS.md) (cast change at its top).
Vehicles: [VEHICLES-GARAGE.md](VEHICLES-GARAGE.md). Day and night:
[DAY-NIGHT.md](DAY-NIGHT.md). Districts: [DISTRICTS.md](DISTRICTS.md).
Order of work: [PLAN.md](PLAN.md) (section 2 carries the new disagreements).

---

## 1. The document, as received

### Core vision
A top-down / isometric driving simulation, "GTA in your pocket": car
culture, manual driving skill, **vehicle weight transfer**, and economic
progression through an underground network of human drivers.

### Setting and atmosphere
- **Region: MISKAWIN** -- Great Lakes geography; naming that blends
  Indigenous phonetic roots with French colonial and Anglo-American
  settlement history.
- **Hub city: RED CITY** -- a dense rust-belt motor-town: heavy industrial
  plants, flat grid concession roads, **international bridge bottlenecks**,
  freezing lake-effect weather.
- **Era: THE 1980s-1990s ANALOG ERA.** No smartphones, digital mini-maps or
  instant messaging. Navigation is paper roadmaps in the glovebox,
  handwritten notes, physical dispatch slips, CB radios, rotary payphones.
- **The antagonist: A.U.T.O.** ("Autonomous Infrastructure Utility /
  Network") -- a city-wide algorithmic system controlling traffic lights,
  overhead gantry cameras and induction loops. It has **REPLACED HUMAN
  DRIVING** with uniform, sterile, electric compliance pods ("toasters")
  that move at rigid speeds and enforce absolute predictability.

### The hub: Brooks Dispatch
**Artie Brooks**, a weathered old-school dispatcher in a cinder-block office
under the international bridge's girders: switchboards, coffee-ringed
paperwork, cassettes. Mentor and operational hub. His board is **physical,
carbon-copy**: jobs are picked from paper slips, and they tie the player
into the underground resistance against A.U.T.O.

### The Connects: five specialists, five local authorities
Day and night contracts across Red City and its townships:

| specialist | domain | focus |
|---|---|---|
| **Brenda Braga** -- suburbs, and **the exam mode** | clean subdivisions, strict regulatory compliance | precision, stopping distances, zero-tolerance exam scoring |
| **Victor Braga** -- industrial freight | docks, assembly plants, manufacturing corridors | heavy cargo, torque management, logistics |
| **Hank Miller** -- rural outcounty | gravel concession roads, farmland, unlit rural highways | low-traction handling, weight transfer on dirt, "wilderness survival driving" |
| **Maya Lin** -- downtown and nightlife | the neon core, the club district | midnight street performance, tight cornering, **urban drift** |
| **Zane "Slip" Gault** -- interstate bypasses | multi-lane concrete highways, high-speed arterial loops | highway weaving ("swimming"), slipstreaming, **dodging A.U.T.O. speed gantries at 90 mph** |

### The progression loop
- **Day, the hustle:** legal or grey-market courier runs, industrial
  parts, guiding nervous students through Brenda's exam routes -- earn,
  upgrade the car in Artie's bay.
- **Night, the reclaim:** high-speed runs with Zane, street tests with
  Maya, long-distance hauling with Hank.
- **The world reacts -- ECONOMIC REVIVAL.** Early game: roads choked with
  slow, lifeless pods; traffic a rigid conveyor belt. Late game: as the
  player completes contracts and trains drivers, the supply chain and
  independent chop shops revive; the spawner injects varied vehicles
  (rusted sedans, V8 muscle, tuned imports) and **loosens AI compliance**,
  until the streets are a chaotic mosaic of human driving styles.

---

## 2. What it changes, against the record

| | before (13 Oct, Metro Grid) | now (3 Nov, Red City) |
|---|---|---|
| city | Metro Grid, governed by A.U.T.O. | Red City in Miskawin; a Great Lakes border motor-town |
| era | unstated (present-day by default: phone/dispatch screen, DAY-NIGHT default 11) | **1980s-90s, analog** |
| A.U.T.O. | monitors HUMAN drivers; rewards with green waves, punishes with reds, governors, rerouting, fines | runs the infrastructure AND has **replaced human drivers with pods** |
| mentor | Jay "The Clockmaker" | **Artie Brooks**, a dispatcher (Jay unmentioned) |
| the cast | four RIVALS: Victor, Brenda, Mason "Swerve" Lin, "Grizzly" Hannah Miller | five SPECIALISTS ("Connects"): Victor, Brenda, **Maya Lin**, **Hank Miller**, **Zane "Slip" Gault** |
| Brenda | a rival driver: confidence's timid tail, stops short, over-yields | **the exam mode's authority**: zero-tolerance scoring |
| the world improving | ZONE QUALITY per district, raised by training students; signal delays ease | ECONOMIC REVIVAL: traffic mix and compliance loosen as the player progresses |
| campaign | three acts: licence revoked; territory wars; the convoy that overloads the grid | **no acts stated** |
| handling | drifting and weight transfer deferred (PLAN 6): Hannah's county gets grip, not a slip model | **weight transfer is in the core vision**, and drift is Maya's discipline |

**Two things it lines up well, worth keeping whatever else changes:**

1. **The five specialists map one-to-one onto the five district briefs
   (DISTRICTS.md)** -- Victor the Industrial and Port, Brenda the Suburbs
   and Retail, Maya the Downtown and Nightclub, Hank the Rural Outer County,
   Zane the **Highway Network, which had no character before**. Each
   district's different relationship to the green wave now has a person
   attached to it.
2. **Revival is the skill dial, already built.** A pod is a driver at the
   top of every axis and of compliance; a revived street is a population
   drawn lower and wider. `sim/skill.js` already redraws everybody on the
   map at `world.skill` with place and manoeuvre kept, and `sim/towns.js`
   already weights a district's people by axis. What revival adds is a
   VEHICLE mix (a row per kind in `VEHICLES`) and a stored, changing
   quantity to drive the dial -- the same stored per-district quantity
   Zone Quality needed (PLAN.md 3).

---

## 3. What it implies that does not exist

- **A pod.** A row in `VEHICLES` and a driver profile at the ceiling. NOT
  the audit's proposed row as written (ARCHITECTURAL-AUDIT, 1 November):
  its `variance` and `headway` are vehicle fields for quantities the
  DRIVER owns (speed spread and following gap come from the ratings), which
  is two definitions of one quantity; and its sports rows carry `cap` above
  1, which is a car built to exceed the limit. Its numbers are invented,
  not derived.
- **Varied human vehicles** (rusted sedan, V8, tuned compact). Each needs
  per-vehicle handling first: `stoppingRoom`, `BRAKE`, `LATERAL`,
  `radiusFor` and grip are still global (PLAN.md 13, VEHICLES-GARAGE.md).
- **A slip model** -- weight transfer, drift; RULED the endpoint (section
  4, item 1). `sim/player.js` has grip.
  PLAN 6 deferred this explicitly; the new core vision reverses that
  (section 4, item 3).
- **Weather and surfaces**: gravel (already PLAN 14), and now snow and ice
  from "lake-effect".
- **An analog presentation.** Built pieces that read as modern: the route
  drawn on the road (`session.js` `routePts`, PLAN 7), the turn-by-turn
  banner (`hud.js` `drawNav`), the receipt (`drawReceipt`), the caption
  bubble (`drawCaption`), the dispatch "phone screen" of DAY-NIGHT default
  11. All are canvas drawing over data the sim already produces, so a
  restyle is a renderer change, not a sim change -- see section 4, item 5,
  before any of it is removed.
- **A contract board** -- several job kinds through one pipeline, each
  scored its own way, in place of `sim/jobs.js`'s taxi. Consistent with
  DECISIONS 10.35 (a feature belongs to the world, not the screen), which
  is also the exam mode running inside the main game rather than at
  `#/exam`.
- **Speed gantries** -- DISTRICTS.md already lists overhead gantries as
  outside the buildable palette.
- **Revival as a stored quantity**, and what raises it.

---

## 4. Conflicts with standing rulings

### RULED, 3 November (the maintainer, answering items 1-3 and section 5.5)

1. **A FULL PHYSICS MODEL IS THE ENDPOINT.** Verbatim: *"a full physics
   model is the ideal endpoint, simulating grip and weight transfer. If our
   game is modelled around putting the user in different traffic situations
   (in different vehicles) we want as many possibilities as we can."* So
   PLAN 6's "grip, not a slip model" is withdrawn: weight transfer and grip
   limits per vehicle and per surface are the target of PLAN 13-14, and
   drift is what that model produces at the limit, not a separate feature.
   **Not decided, and the next question under it:** whether the TRAFFIC
   drives on the same model or stays on today's motion with per-vehicle
   numbers. The player's car first is the cheap order; a whole city on a
   force model is a frame-budget question for the phone.
2. **ANYBODY CAN BE RACED.** Verbatim: *"the answer to this is anybody we
   want to. For example, we get a mission from Zane to race NPCs on the
   highway and we go from there. There could be named or unnamed NPCs
   depending on story beats."* So racing (PLAN 15) stays SHARED: an
   opponent is any driver -- a profile on the axes, named or not -- given a
   course, and the specialists are where missions come from, not
   necessarily who you race.
3. **NIGHT IS FREE DRIVING, AND CONTENT IS NOT RESTRICTED.** Verbatim:
   *"'judged as illegal' is a nebulous statement. By whom? Auto? Then to
   what end? At this point we want a night cycle to put the player in, and
   they can drive however they want. Traffic should be calmer in some areas
   at night allowing for faster driving and rule breaking. Putting
   restrictions on what we can present as content doesn't make sense at
   this point."* DAY-NIGHT default 1 is withdrawn. What is built now is a
   night the player drives as they like, with quieter traffic in places;
   whether anything -- A.U.T.O., police, fines, demerits -- answers it is
   left for the story and missions to decide. **What does not move:** the
   sim still knows the law. A red is still a red to the traffic, a fault
   is still named truly where the game names one, and "the fiction can be
   strange, the law cannot" is about describing the rules truthfully, not
   about stopping the player breaking them.
4. **ONE REGION, ONE SET OF RULES, WITH THE ROADS OF A PLACE LIKE HOME.**
   Verbatim: *"I wanted something that felt similar to home but allowed for
   a variety of environments. SW Ontario/Michigan give you almost every type
   of road you could drive on. The map editor could always create a new
   environment, this is just what we will focus on."* And, correcting the
   first record of it the same day: *"I didn't intend for the region to have
   an international split. So the same rules would apply. I used Ontario and
   Michigan as examples only."* So Miskawin is ONE fictional region with ONE
   rule set -- the project's default, Ontario practice read the general North
   American way (CLAUDE.md, domain authority) -- and southwestern Ontario
   and Michigan are EXAMPLES of the variety of road it should have, not
   places it is set in or split between. **The bridge is a bridge, not a
   border**: the document's "international bridge" stays a landmark and a
   bottleneck, with nothing on the far side that changes the rules. This
   leaves DISTRICTS.md correction 2 ("modelled on no one place") standing,
   naming rule included.
5. **METRIC ALWAYS.** Zane's 90 mph is 145 km/h, and every unit in the
   game, the dialogue and the missions is metric.


6. **THE INSTRUMENTS STAY; THEY ARE RESTYLED, NOT REMOVED.** Verbatim:
   *"Instrument layer should stay as that's how the player is controlling
   the game, the current control scheme should be brought to match the
   aesthetic, not thrown away."* So the slider, the wheel bar, the signal
   taps and the readouts on them (HOLD, SLOW, STOP, FLW, BRK, the following
   gap) are kept as they work and redrawn in the period's look -- a
   restyle of what exists, never a replacement scheme. **The navigation
   display falls under the same ruling** (the maintainer, 3 November:
   "Navigation display falls under the same ruling, restyle it."): the
   route drawn on the road, the turn banner and the lane advice are kept
   and restyled. Paper route cards and street names may come as additions;
   they replace nothing.
7. **ANY CHARACTER CAN GIVE ANY KIND OF MISSION, INCLUDING ONE WITH LIMITED
   CONTROL.** Verbatim: *"Brenda could give you either mission, so we need
   to be able to accommodate both. If we wanted, any character could give
   us a limited control mission, it's not tied to any one person."* So a
   mission is not tied to its giver, and the job machinery has to carry
   both seats: the player DRIVING while somebody judges, and the player
   with LIMITED CONTROL -- examining a candidate who drives (`sim/exam.js`:
   directions by the turn taps, the instructor's brake on the slider), or
   any other mission where somebody else has the wheel. Answers items 6
   and 7 below as far as the build is concerned; Brenda's character stays
   the story's.

### Still open

1. ~~**90 mph, and speeding as content.**~~ **RULED above (3, 5).** The project is metric
   (DIALOGUE.md's spec: "all units metric") and Ontario/North American;
   90 mph is 145 km/h. More than the unit: Zane's discipline is dodging
   speed enforcement at speed, and Maya's is street performance. DAY-NIGHT
   default 1 already answers the shape of this -- illegal night driving is
   allowed and **always judged as illegal; the law is never misdescribed**
   -- and CLAUDE.md's "humour is allowed, the traffic law is not". Does
   that default stand for Zane and Maya?
2. ~~**"Modelled on no one place."**~~ **RULED above (4): it still is; one region, one rule set.** DISTRICTS.md correction 2 (the
   maintainer, 14 October): functional North American names, the city
   modelled on no one place, no named real route. A rust-belt motor-town
   with an international bridge on the Great Lakes reads strongly as
   Windsor-Detroit. Is that now intended, or should the bridge stay
   generic?
3. ~~**Weight transfer and drift.**~~ **RULED above (1).** Deferred in PLAN 6 ("Hannah's county gets
   surfaces, not a slip model"); now in the core vision and two
   specialists' disciplines. A slip model is a player-car rewrite plus the
   traffic's corner speeds -- a SHARED foundation of weeks, not decoration.
   Reinstated, and where in the order?
4. **A.U.T.O. replaces the drivers.** The simulator's interest is human
   error on five axes; a road of pods has none, and the maintainer's own
   verdict is that the pleasure is threading traffic (SIMULATOR.md, "THE
   PLEASURE IS IN THREADING TRAFFIC"). A predictable conveyor belt is easy
   to thread. Is the early game meant to feel thin -- the point of the arc
   -- and if so how early does variety arrive? And are the pods also
   NPCs the examiner's candidates share the road with?
5. **The analog era against what is built.** (RULED, item 6 above: instruments and navigation display both kept and restyled.) The route on the road, the
   turn banner, the lane advice and the headway readout are how a phone
   player gets anywhere today (PLAN 7, built 14 October; DECISIONS 10.34
   on drivers told too late). Removing them is a gameplay change, not a
   restyle: a paper slip with street names only works when the map has
   street-name signs, which it does not yet (`sim/reading.js` reads
   regulatory signs, not names). Restyle now, replace later, or keep them
   as Artie's notes?
6. **Brenda, rival or examiner?** (For the build: RULED, item 7 above -- she can give either kind of mission.) She was built as a rival driver
   (`sim/rivals.js`: confidence 0, compliance 1; she stops short and
   over-yields) and the timid tail's first character (CHARACTERS.md). As
   the exam mode's zero-tolerance authority she is a different role. Both
   can be true -- a timid driver who examines strictly -- but it is a
   choice.
7. **The exam mode's place.** (RULED, item 7 above: a mission any character can give.) PLAN 2 row 3 put it as the Act I prologue
   (the test that costs the licence) and then teaching at the academy. The
   new document makes it a day job: students through Brenda's routes. That
   is DAY-NIGHT default 6 again.
8. **Grey-market day work.** DAY-NIGHT: day is legal driving tasks, and the
   economy pays for skill. "Grey-market" by day is new; whether it changes
   what a day job scores is open.

---

## 5. What it does not say -- open

1. **Who the player is.** Metro Grid gave a premise: an examiner whose
   licence was revoked. This document gives none.
2. **The campaign.** No acts, no ending. Do the three acts, the territory
   wars and the convoy climax stand, change, or go?
3. **Jay "The Clockmaker".** Artie is the mentor now. Is Jay gone, or a
   second voice? Jay speaks under nearly every trigger in
   `src/content/dialogue.js`.
4. **Mason and Hannah.** Renamed to Maya Lin and Hank Miller, or replaced
   by different people? The built code names them (`sim/rivals.js`,
   `content/dialogue.js`, `sim/voice.js`, `iso/hud.js`).
5. ~~**Rivals.**~~ **RULED, section 4 item 2: anybody, named or not.** "Connects" are allies. Racing head-to-head (PLAN 15) and
   territory both assumed opponents. Who do you race?
6. **Revival against Zone Quality.** Same idea or different? Per district
   or city-wide? Raised by what, exactly -- contracts, trained drivers,
   both? Does it still ease signal delays?

Also minor: the acronym's expansion ("Autonomous Infrastructure Utility /
Network") does not spell A.U.T.O. And **Miskawin**: if it is meant to echo
Anishinaabemowin (*misko-*, red), worth having a speaker confirm the form
and meaning before it is the region's name.

---

## 6. HISTORY: Metro Grid and A.U.T.O. (recorded 13 October 2026)

Superseded as the setting on 3 November. Kept because the new document is
silent on its premise, its acts and Zone Quality (section 5), and some of
its reasoning survives the change of setting.

The city was **METRO GRID**, governed by **A.U.T.O.**, a municipal AI that
monitors speed, lane discipline, gap selection and signal compliance. It
REWARDS compliant drivers with green waves and PUNISHES others with
artificial reds, speed governors, forced rerouting into congestion and
automated fines.

**This is a straight upgrade to the green wave's justification** -- still
true under Red City, whose A.U.T.O. also controls the lights and loops. It
stood as "signal progression is real, so this is not magic" (SIMULATOR.md,
"GREEN WAVES"; `sim/progression.js`; the "GOOD DRIVING IS PAID IN FLOW"
ruling; `sim/actuated.js`). What A.U.T.O. monitors is close to what the sim
already measures: speed (the posted limit), lane discipline (lane-keeping,
keep-right), gap selection (the confidence axis), signal compliance (reds,
ambers, the compliance axis).

**Unbuilt: the whole punishment side** -- artificial reds, governors,
forced rerouting, fines. Today the lights reward (loops, waves) and never
target a driver.

### The campaign: three acts (status open under Red City)

- **Act I.** Your examiner licence is revoked for passing a driver who
  drove safely but violated an arbitrary AI directive -- the
  knowledge-versus-compliance distinction the simulation already models
  (`core/driver.js`; R2-DESIGN.md 17; `verify-compliance`), turned into a
  plot. You start an underground academy.
- **Act II.** District territory wars against rival fleets: train students
  by day to raise a district's **ZONE QUALITY**, race rivals at night for
  territory.
- **Act III.** A.U.T.O. locks the grid. The climax: a synchronised convoy
  of graduates holding a green wave across four sectors to overload it.

### Zone Quality resolved an open question

When the driving school was first proposed (DRIVING-SCHOOL.md) the risk
flagged against it was that **a town improving might be measurable but not
perceptible**. Zone Quality gave it a channel the player feels: **raise it
and signal delays ease.** Red City's revival offers a second and more
visible channel -- the traffic itself changes -- which answers the same
risk at least as well.

### Implied features that did not exist (13 October)

- **The convoy climax**: platoon control -- several AI cars keeping a
  progression as a group.
- **A.U.T.O.'s punishment side**.
- **Zone Quality** as a stored per-district quantity, and its link to
  signal timing.
- **Territory**: districts owned, contested and changing hands.
