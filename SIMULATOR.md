# The simulator first: the reframe, and the plan

*18 September 2026. Settled with the maintainer, including the player's
verb (section 1.1, settled later the same day). Nothing here is built;
this is the plan the next work is held to. Read REBUILD.md for the
foundation it stands on and DECISIONS.md for the rulings it keeps.*

---

## IN FLIGHT -- what is half built (kept current; read this first)

The maintainer, 21 October: it should be possible to answer "where are we"
by reading, not by reconstructing it from reports. Three columns of
unfinished; an item leaves this list when it is shipped or dropped, and
says which.

**Live build: see the latest commit** (anticipation as one property, item 18, and the warm-up glance fix, 18ca3c8; look-away on again, as ruled -- item 16; before it `0149f91`, look-away reset to off -- the gridlock, item 15; before it `1dfa18c`, the heap on the readout -- the next drive says whether the phone pays in garbage; before it `f55c371`, the green split: horns at 2.0 s, the mark at undue delay -- DECISIONS 10.16; before it `c1760aa`, density shaping built, NOT on -- DECISIONS 10.17; nothing new to drive; before it `d93a5ab`, every readout number says its statistic; trip and worst-frame lines corrected -- DECISIONS 10.4; before it `adc1f8e`, the crash log; the frame line adds up; before it `2702c79`, the neighbour index, first step: a driver reads its own lane in order, -22% step at 260 cars on the loop -- SIMULATOR 1.2.17; before it `c4cd824`, a step budget per frame; crashes say which were with the player -- SIMULATOR 1.2.17; before it `86b7cb9`, nobody stranded at an acceleration lane, the player above all -- DECISIONS 10.15; before it `d97b47a`, lateOffGreen on the sheet, lit courses, merging across the taper -- DECISIONS 10.15-10.16; before it `fd1127e`, the courtesy ruling and gap seeking, DECISIONS
10.15).

**MORE CARS DO NOT MAKE A BUSIER WORLD (the maintainer's phone, 22 October).
160 -> 280 cars on the endless highway, +75%, bought 5.5 -> 6.0 cars met a
minute, +9% -- and took the phone from 55 fps at 1.00x real time to 17 fps [MEASUREMENT OF A DEFECT: taken with the blind glance in play, item 15 -- re-measure, compare nothing new against it]
at 0.82x. More cars buy a slower phone, not more traffic around the player.
Quote this whenever "raise the density" comes back; it is closed. What moves
the number is WHERE the cars are (density shaping) and what they cost when
nobody can see them (LOD) -- one piece of work, measured as cars met a
minute at a frame rate the maintainer can play at (DECISIONS 10.17).**

**Committed, not shipped:** nothing.

**Measured / built, not committed:** the ruled braking-unchecked fault, built and measured non-discriminating on the course (sound 4, poor observer 6 in 12 drives), not shipped (DECISIONS 10.16).

**Started, not finished, in order:**
1. ~~where an offerer's braking comes from~~ -- found: every offerer
   brakes at exactly its own braking-axis rate (DECISIONS 10.12 work)
2. ~~suite, commit, ship~~ -- 30f9ce2
3. ~~re-measure on the shipped build~~ -- done, SIMULATOR 1.2.16
4. ~~the courtesy ruling~~ -- shipped (10.15); observation on the marking
   sheet: `lateOffGreen` (10.16); the ruled braking fault waits on the
   sheet running on the map
5. the 150-car regression -- gap seeking built (10.15) and better at
   every density, but at 150 the lane still stands more than the yield sign
   (1101 against 730): a joiner and the car letting it in slow together.
   CLOSED (DECISIONS 10.4, 10.15): standing time was the wrong measure.
   The 6% who stopped and waited up to 154 s: FIXED (10.15) -- the offer's
   deadline, one definition of the gap, and the player's deadline; 2% stop,
   longest 27 s, the player never stranded (verify-merge 4).
6. ~~the deliberate-breakage pass~~ -- done, all twelve fail when their module is broken (TESTING.md); verify-lanecost bites only at about ten times its cost
7. suite cost: 12 at once instead of 8 (1700 -> 1382 s); verify-compliance's 145 runs in worker threads, identical counts (950 -> 448 s under load); the derived suite 1588 -> 1356 s. The pole is now eight checks at 870-1020 s, most of them several independent worlds -- the same treatment would apply (TESTING.md)
10. ~~THE 57 MS~~ -- CLOSED: a median frame beside mean parts, during the spiral; reproduced with no hidden overhead (SIMULATOR 1.2.17); the readout now prints the frame's mean
37. A RIGHT TURN HELD BY THE LEFT TURN BESIDE IT -- THE THROUGH ROAD JAMS (found 28 October tracing verify-drive's stop-leg assertion; PRE-EXISTING, under the old gap rule; not fixed). verify-drive's two-way stop (two lanes each way, the through road uncontrolled, the stop legs N and S): under the OLD rule the scripted player reached the box in one pass of four and stood about 70 m short in a through-road queue in the other three -- so the assertion had passed on one lucky pass. The scripted driver is not at fault: it is queued behind real traffic. THE QUEUE'S HEAD is a car in the CURB lane turning RIGHT (W|end#1 -> S), at rest at its line on an uncontrolled leg for up to 19 s, held by blockedBy against a car in the INNER lane of the SAME APPROACH turning LEFT (W|end#0 -> N), itself waiting at its line for a gap in the oncoming traffic -- in all three jammed passes (pass 1 also had a legitimate blocker, an oncoming left turner into the same south road, in the box). THE CAUSE: the conflict table (crossing.js conflictOf) lists those two paths as conflicting at s 392.2 and 392.6 -- 1.3 m past the stop line (390.8), where the two cars are still side by side 3.6 m apart and about to turn away from each other. So any inner-lane left turner waiting for oncoming traffic holds the curb-lane right turner beside it, and the straight-through traffic behind them both. Likely on every multi-lane approach with a waiting left turner (the city, test map 1, the arterials) -- NOT MEASURED. Questions before a fix: is the conflict a footprint artefact of two adjacent lanes at the mouth of the box (the pad that keeps side-by-side paths apart, meeting turns that begin at the line), and does anything else rest on it; then what the jam costs the world (standing time at uncontrolled multi-lane approaches, before and after). verify-drive's stop-leg assertion stays as written and failing until the queue is fixed -- patching its sample would bury this.
36. HARD BRAKING IN FREE-FLOWING TRAFFIC -- NOTED PROMINENTLY, NOT CHASED (the project lead, 28 October: "a separate investigation and not today's"). With no lane change involved -- every moving car's back-to-back 4 s windows in which its leader was never a car mid-change -- ordinary following brakes past 3 m/s^2 in ONE WINDOW IN 18 on the endless highway (5.6% of 4,365 windows, 150 cars, seed 1, checks off, 60-240 s), 11.4% of 3,322 on the city at 250 and 5.6% of 3,111 on test map 1 at 200; past 1 m/s^2: 10.4%, 23.3%, 13.9% (tools/measure/imposed.mjs `background`). Real highway driving has very little hard braking. Either ordinary following-model behaviour at these densities, or a defect that has sat under everything measured -- every braking figure on the record (harsh-braking faults, the cut-in tail, courtesy's onset) stands on it. First question when picked up: on the highway, is that braking at tapers and merges, behind lane changes just finished, or on open road?
35. AGGRESSION AS A DISPOSITION, WITH ITS OWN DIAL (the maintainer, 28 October, on the skill dial's desk result: "I want to see those aggressive drivers on the road. make it happen"). DESIGN, NOT BUILT -- analysed and reported before building, as asked. WHAT EXISTS: today aggression lives inside the BOLD TAIL OF CONFIDENCE. One number, `caution` (core/driver.js cautionOf), drives speed wanted (traffic.js wantedSpeed, up to 1.35x the limit), following headway (0.55x), gap acceptance at an intersection (crossing.js gapNeeded x (1 + caution)) and in a lane change (lanechange.js kappaOf, a third of a competent gap), the gain worth a lane change (LC_GAIN x caution), patience before the horn (crossing.js patienceOf, with compliance), whether they offer courtesy (courtesy.js, caution and compliance at COMPETENT_AT) and part of rolling a stop (traffic.js rollsStops, 0.3 x boldness). So most of the surface the maintainer listed is ALREADY THERE -- and it is filed as a SKILL DEFICIT: weak confidence, drawn bold or timid half and half, which is why the skill dial at -1 made the road hesitant rather than dangerous, and why Victor's card would read "confidence 1.00, red" -- a misjudgement, not intent. THE FINDING: aggression is not a new mechanism; it is a second input to the margins the bold tail already moves, plus a few wants nothing has today. PROPOSED SHAPE: `aggression` 0..1, a disposition beside compliance (not a rating: higher is not less skilled), drawn from its own stream so the skill draw is untouched, and orthogonal to the skill dial by construction. ONE place combines the two: the margin a driver CHOOSES (aggression) times the margin they THINK they have (confidence) -> the existing `caution` readers, so there is one statement of the margin, not two. The far end of what exists: speed wanted, headway, gap acceptance, lane-change gain, horn patience, never offering courtesy. NEW WANTS, each small: (1) PRESSING -- the headway shrinks with how far a slower leader holds them under their want (tailgating with intent, against a bold driver's uniformly short gap); (2) DENYING -- the inverse of a courtesy offer: asked by a signalling driver for the space ahead, they close it (courtesy.js's askOf names who is asking; one definition); (3) THE HORN AT BEING HELD UP -- a new horn occasion, a car below their want ahead of them. THE READOUT: a seventh bar, aggression, drawn apart from the five skills and compliance -- so a driver with sound confidence and high aggression reads as doing it on purpose, and one with bold confidence and none reads as misjudging. THE RIVALS: a rival is a profile, so aggression is one more field of it -- Victor becomes an instance, not a parallel system. Moving his profile changes how he drives and verify-rivals' measurements; for the maintainer. DESTINATIONS (DECISIONS 10.30 point 4): frustration -- held under the want, refused a gap, an exit about to be missed -- is the input pressing already reads, so a thwarted driver with somewhere to be has something to be aggressive about. RULINGS NEEDED BEFORE BUILDING: (a) outright REFUSING TO YIELD -- taking right of way that is not theirs where the rule is clear -- is traffic law, and whether the game models it deliberately, and where (all-way stop, yield sign, merge), is the maintainer's; this proposal builds deliberately tight gaps and denied courtesy, which are legal or marginal, and holds that one; (b) a horn at a driver doing nothing wrong breaks "every horn is aimed at an error" (verify-greens) -- kept as its own recorded class; (c) whether the DEFAULT population should carry any aggression at all (today: none, and the world hashes say so) -- the "too polite" question, his. PREDICTIONS, recorded before any building (aggression dial at 1 against 0, skill dial at 0; the skill-spread instrument plus following-gap time): horns RISE (the skill dial's -1 lowered them); time following inside 0.75 car lengths (DECISIONS 10.24) RISES; tight lane changes RISE; courtesy offers FALL toward zero and denials appear; crashes RISE or at least do not fall -- if horns, close following and crashes do not rise it is not expressing aggression. Skill +1 with aggression 1 against skill -1 with aggression 1: the skilled population brakes harshly LESS and misses fewer checks while following as close -- precise and intimidating, not a menace. SUPERSEDED IN PART, 28 OCTOBER, BY THE MAINTAINER'S DEFINITION (DECISIONS 10.32): aggression is the COST A DRIVER WILL IMPOSE -- the deceleration they are prepared to force on others. The first build (believed margin x (1 - aggression), feeding speed, following gap, patience and every other `caution` reader) is set aside, saved at tools/scratch/kr/aggression-wip-v1.patch, not committed: by the definition, speed over the limit and a short following gap impose no deceleration on anybody, so they are not aggression and stay with confidence (and compliance for the limit). MEASURED FIRST (tools/measure/imposed.mjs, checks off, seed 1, 3 min after 60 s; the hardest braking of the car whose new leader is a changer, within 4 s): the median change costs nobody anything -- 0.03 m/s^2 on the highway, the city and test map 1 -- but the tail is real and UNDECLARED: of changes with somebody behind, 11% on the highway forced them past 3 m/s^2 (43 of 404 among changes where the changer LOOKED; missed checks were 8, median 8.0, the maximum), 5-7% elsewhere; by band, p90 7.7 bold, 2.3 sound, 1.1 timid on the highway; keep-right moves p90 5.4. So today the cost a change imposes is a BY-PRODUCT -- of the one gap rule (lanechange.js gapFor, the follower's comfortable gap scaled by caution) meeting the traffic -- not a quantity anybody chooses, and there is no driver who accepts "a slight lift-off" as such: nearly nothing, or a hard stop. CAVEAT, THEN CONTROLLED (same day): the instrument blamed all of the follower's braking in the 4 s on the change. The control (imposed.mjs `background`: every moving car's back-to-back 4 s windows with no car mid-change as its leader) brakes past 3 m/s^2 in 5.6% of windows on the highway, 11.4% on the city, 5.6% on test map 1; after a change the changer looked for, 10.6%, 15.4%, 7.5%. SO THE CHANGE'S OWN SHARE OF THE TAIL IS ABOUT 5, 4 AND 2 POINTS -- the 11% first reported overstated it by about double. What stands: the median change costs nothing, the cost a change imposes is nobody's declared choice, and a real tail exists above the traffic's own. (Ordinary following braking past 3 m/s^2 in one 4 s window in 18 on an open highway is itself high, and unexplained; noted, not chased.) THE RE-EXAMINED SHAPE, for approval: (1) ONE DECISION VARIABLE, the deceleration an action will force on the car it affects, PREDICTED from the following model the sim already has (the follower's closing speed and gap -> the braking it needs, the same arithmetic as gapFor's floor); an action is taken if that is within the driver's TOLERANCE, `imposes`, in m/s^2. CONFIDENCE becomes how well they PREDICT it (bold underestimate, timid overestimate -- still two-tailed, still a skill); AGGRESSION is the tolerance (a disposition). That replaces the scaled-gap rule (kappa) with the quantity itself, so the check can hold the measured deceleration against the declared tolerance. (2) THE SCALE: from "a slight lift-off" (about 0.5 m/s^2, a flagged constant) to "stand on your brakes" (the hard-braking cap, MOST_BRAKE 8); nobody at zero; the default population's distribution is a choice to be made and measured against the tail above, not today's accident. (3) WHERE IT DECIDES: every action that costs somebody else braking -- a lane change (the lag), a merge, pulling out or turning across priority traffic (the gap at a line), denying a gap (closing on an asker forces THEM to brake or abort). NOT speed, NOT the following gap. (4) LAW-BREAKING (10.32 ruling 1): a rule is broken when the driver does not keep it (compliance) AND the cost of breaking it to others is within `imposes` AND it gains them time -- today's "rolls only with nobody about" is the case cost = 0, so it falls out unchanged at the bottom. (5) THE HORN AT BEING HELD UP (ruling 2): the cost a slow leader imposes on THEM against their own tolerance -- an aggressive driver held below their want honks; its own recorded class. (6) COURTESY: ONE AXIS OR TWO -- RECOMMENDED: ONE DISPOSITION, TWO READINGS. A single signed axis cannot place the ordinary driver, who both accepts a little cost for others (eases off to let somebody in) and imposes a little (moves over with a lift-off behind): signed, that driver is at zero, and zero means neither. But two INDEPENDENT axes predict a driver who imposes heavily and also pays generously, for which there is no ruling and no observation. So: one disposition x, read as the cost they will IMPOSE (rising with x, never zero) and the cost they will ACCEPT for somebody else (falling with x) -- anticorrelated by construction, both nonzero for the ordinary driver, and courtesy's gate (courtesy.js `courteous`, today compliance and caution at COMPETENT_AT) becomes the accepting reading. If the maintainer has seen the generous bully, they split later; the reverse is harder. (7) PRESSING (tailgating to push a slower car) imposes no deceleration and does not fit the definition taken literally: held out unless he wants it as an expression of the same tolerance. THE CHANGE TO THE DEFAULT WORLD IS DELIBERATE: replacing kappa moves every world with lane changes, so the hash gate becomes a statement of what moved and why, with predictions. APPROVED AND BUILT IN PHASES, 28 October (the project lead). THE DETERMINISM QUESTION, answered before starting: NO SETTING OF THE NEW RULE REPRODUCES TODAY'S WORLD. Today a lane change is accepted on a DISTANCE (the follower's comfortable gap plus the room to shed the closing speed, scaled by the changer's confidence); the new rule accepts on a DECELERATION (what the change forces on the follower, against the changer's tolerance). They are different functions of gap, closing speed and the follower's own parameters, so no tolerance makes them agree everywhere, and a tolerance chosen per situation to agree would be the old rule in a costume. WHAT REPLACES THE GATE: the old rule stays, behind ONE SWITCH (`world.imposed === false`), and EVERY new behaviour is behind the same switch -- the decision, the courtesy gate, denying, the horn at being held up, and the aggression field itself, which an actor carries only with the switch on. With it off all 15 worlds must hash byte-identical to before: the exact control, proving nothing outside the switched path moved. With it on, every moved world is characterised, not accepted. PHASE 1 (this build): the lane change and the merge (lanechange.js gapFor, the lag side -- the lead side is the changer's own comfort, not a cost to anybody), the courtesy gate, denying, the horn at being held up, the seventh bar, the dial. PHASE 2, after: pulling out and turning across priority traffic at a line (crossing.js hasGap) and law-breaking as aggression x (1 - compliance) -- they touch right of way itself and wait until phase 1 is seen. THE SHAPE AS BUILT: `imposes` = LIFT + aggression x (MOST_BRAKE - LIFT), LIFT 0.5 m/s^2 ("a slight lift-off", flagged), so aggression 0 is NOT "imposes nothing" -- nobody is at zero; the PREDICTED deceleration is the follower's own next decision (traffic.js `decide`, the follower behind the changer at the lag gap) -- the sim's own model, not a second one; confidence is how well it is predicted (judged = predicted x kappaOf, the factor that scaled the gap before: bold underestimate, timid overestimate); the physics floor (lagSurvivable) stays for everybody. The aggression dial runs 0..1 and is the population's scale (aggression = dial x a uniform temperament, its own stream); THE DEFAULT IS 0.3 -- imposes from 0.5 to 2.75 m/s^2, from a lift-off to about a comfortable stop, a choice made to be measured against, flagged. Courtesy's gate drops confidence (a skill) for aggression below 0.5 (flagged), with compliance at COMPETENT_AT as before. Denying from aggression 0.5, one draw per ask against aggression; the horn at being held up from aggression 0.4 -- above the default's 0.3, so the default world has neither and both arrive with the dial. A RESTATEMENT THE DEFINITION FORCES: under "cost imposed", the following gap is NOT aggression -- it costs nobody a deceleration and stays with confidence (and pressing is held out). So the headline test is restated in the definition's own quantity: skilled-and-aggressive drivers IMPOSE AS MUCH (the measured deceleration their changes force on others) as unskilled-and-aggressive ones, while braking harshly LESS themselves and missing FEWER checks. "Follow just as close" would test confidence, not aggression. PREDICTIONS, written before the code (imposed.mjs and skill-spread.mjs; highway 150, test map 1 200, city 250; seed 1, then 2; checks off; old rule = switch off): D1 THE MIDDLE APPEARS: with the switch on at the default, the median deceleration forced on the car behind by a looked-for change rises from 0.03 to between 0.3 and 1.5 m/s^2 on the highway. D2 THE TAIL BELONGS TO CONFIDENCE: the share past 3 m/s^2 above the background falls for sound-confidence changers to within 2 points of the background, and stays above it for bold ones -- a sound driver at the default no longer forces a hard stop, a bold one still misjudges into one. D3 MORE CHANGES: a sound driver now takes a gap that costs a lift-off, which the old rule refused -- lane changes per minute rise on the highway, and joiners' waits at the tapers shorten. D4 COURTESY: offers do not fall at the default, and bold-but-unaggressive drivers now offer. A1 THE DIAL AT 1 against the default: the change-attributable tail past 3 m/s^2 rises; horns rise (the held-up class appears); denials appear and courtesy offers fall toward zero; crashes rise or do not fall. If imposed deceleration, horns and crashes do not rise, it is not expressing aggression. H THE HEADLINE (skill +1 against -1, both at aggression 1): the median deceleration their changes force on others within 0.3 m/s^2 of each other; harsh braking of their own and blind-spot misses clearly lower for the skilled. THE GATE: with the switch off, 15 of 15 hashes byte-identical.
34. THE SKILL DIAL AND THE PER-DRIVER READOUT (the maintainer: "the traffic is actually very polite ... a dial for different skills ... the skill level of the driver you are observing"; built 28 October as a FALSIFICATION TEST -- can a player tell a poorly rated driver from a well rated one by watching, never tested in live traffic). The dial moves the population's DISTRIBUTION (core/driver.js `profileAt`: weak-axis count, weak and sound ranges, confidence's deviation, compliance's share, all interpolated from today's profile at 0 to flagged extremes at -1 and +1), never clamps it; LIVE -- a change redraws everybody on the map from their own seed and district (sim/skill.js, the fields traffic.js `PERSONAL` names), so the same people get better or worse in front of the watcher; the player, candidates and rivals never redrawn. PREDICTIONS, written before any measurement (tools/measure/skill-spread.mjs; per 100 AI car-minutes, events counted at onset by detectors restated in the instrument; test-1 at 200, the city at 250, the endless highway at 150; seeds 1-2; checks off, the default): P1 the population: mean soundness per axis from about 0.73 at 0 to 0.25-0.40 at -1 and above 0.9 at +1. P2 THE DESK LINE, the falsification half run before the maintainer's eyes: all visible bad driving together at -1 at least TWICE level 0 on every map and seed, and at +1 at most half. If it does not double, the axes do not spread far enough to be seen and that is the finding, reported before he spends time on it. P3 by kind at -1 against 0, each with its mechanism: rolled stops at least 3x (compliance weak for ~90% at deficit 0.7-1 puts most over rollsStops' line; they roll only unwatched); harsh braking at least 2x (the braking deficit plans on up to twice the comfortable rate); keep-right faults at least 3x on the highway (compliance stretches the return, an unread rule never returns); blind-spot misses at least 3x (skip chance 0.6 x observation deficit); tight lane changes at least 1.5x (only the bold half of weak confidence takes them, and the timid half refuses gaps); late off the green at least 2x (registration lag); horns up but by less (timid drivers never honk); missed turns up, modestly (the steering deficit lengthens the blend). P4 CRASHES: the default traffic records about none (verify-crashes). AT -1 I EXPECT CRASHES TO APPEAR, and IF THEY DO IT IS A FINDING ABOUT THE POPULATION -- what the bottom of every axis does on the road, the "terrorises the road" question of DECISIONS 10.30 -- NOT A BUG TO TUNE AWAY. The model's floors (gapFor's physics floor, lagSurvivable) were built so that boldness and a missed check are survivable; whether they hold for a driver weak on four or five axes at once has never been asked. Recorded here before measuring so the result cannot be read either way afterwards. RESULTS, 28 October (skill-spread.mjs, checks off; per 100 AI car-minutes, 180 s after 60 s warm; ratios -1/0 and +1/0 of all events but crashes): P1 PARTLY -- drawn and on the map, mean soundness 0.71-0.75 at 0, 0.21 at -1 (confidence 0.13-0.15: BELOW my 0.25-0.40), 0.95 at +1. P2 THE DESK LINE: MET ON THE CITY, NOT ELSEWHERE -- city 2.81 and 3.02 (+1: 0.45, 0.47, met); test map 1 2.04 and 1.27 (+1: 0.79, 0.71); the endless highway 1.29 and 1.27 (+1: 0.67, 0.58). Three of six map-seeds double; two of six halve. P3 by kind: rolled stops at a stop sign, city 2.5x and 3.0x (partly; test map 1 and the highway have almost none to roll); harsh braking 1.6-3.5x everywhere, the strongest and most general signal; keep-right on the highway 3.7x and 3.8x (met); blind-spot misses per minute 1.8x and 0.45x on the highway, 2.3x and 0.46x on test map 1 (MISSED -- counted per minute, not per lane change, and at -1 fewer changes are made: tight changes FELL, 11.1 -> 9.3 and 8.5 -> 5.1 on the highway, because weak confidence is timid as often as bold and the timid refuse gaps); late off the green ~0 at every level (cannot express: with look-away off a driver notices a green within their registration delay, under 2 s, and the line is 4 s -- the instrument counted a thing the default world cannot do); horns FELL at -1 (city 1.33 -> 0.27, highway 5.1 -> 0, 3.6 -> 0) -- PREDICTED WRONG, mechanism untested (timid never honk; whether a poor observer fails to notice the error to honk at is a guess); missed turns at test map 1 HIGHER at +1 (12.8, 12.3) than at 0 (8.7, 8.8) -- unexplained, and they are 30-60% of test map 1's events, so they mask its ratio (without them test map 1 seed 2 is still 1.28). P4 CRASHES: NOT AS EXPECTED -- one at -1 (city seed 1) and one at 0 (city seed 2) in 1,500 car-minutes each, none elsewhere: the floors held for a population at the bottom of every axis. As recorded beforehand, a finding about the population and not a tuning target: the bottom of the model does not "terrorise the road" by crashing. WHAT THE INSTRUMENT DOES NOT COUNT: the continuous tells a watcher sees without an event -- the weave (steering), speed against the limit and following distance (confidence), stopping short of the line (knowledge). It counts onsets only, so it understates whatever a person reads as a manner rather than an incident; the maintainer's eyes are the test of those. BUILT, 28 October: on #/map, "Traffic skill" beside Cars (live, kept across a restart, never saved; the readout says the level when it is not 0); tap a car while watching, or in Look around while driving, for its card -- six bars, confidence drawn timid-to-bold about its optimum, colour by LACKING_AT and COMPETENT_AT, a ring on the car -- and a followed car shows its card unasked. verify-skill holds it, sabotaged twice (brake left out of PERSONAL; ratings sent only on first appearance) and failing each time where it should. FOR THE MAINTAINER TO JUDGE: whether the road visibly worsens at -1 -- on the city the desk says it should be obvious; on the highway and test map 1 the desk says the events barely double, and only his eyes can say whether the manners (weave, speed, gap) make up the difference.
33. CAREFUL PEDESTRIANS STRUCK (27 October; the defect behind the red suite). Two strike modes were briefed; tracing each: MODE 2 (a sound driver, observation 0.99, drove into a careful person standing in its lane) -- the pedestrian WAS in the driver's consideration (on its path, held by the near-half rule) and was filtered by the mid-block sight test: the driver was a TRUCK, its eye 1.5 m ahead of centre (a car's front) inside its own 9 m body, and the sight test counted every tall box, the viewer's own included. Not the car ahead (an ordinary car, hiding nothing), not deference to a leader. FIXED: peds.js inSight leaves the viewer's own body out; cars are unaffected (never tall). MODE 1 was not a defect: the person was TRUSTING (peds.js's third manner -- steps off whenever nothing is on the paint, never pauses for a car, by design), and verify-walkers and the diagnostic both counted non-heedless as careful (DECISIONS 10.23 item 11). After: 0 careful pedestrians struck in 16 runs of 15 minutes on test-peds, checks off and on; verify-walkers passes, and fails with the truck defect restored.
32. THE CITY'S MISSED TURNS (27 October; DECISIONS 10.30): 97% of city drivers in the wrong lane for the exit they drew never got over (906 missed against 56 changes made, five minutes, 200 cars). THE HYPOTHESIS TESTED AND REJECTED: the project lead proposed it was the merge-jam family -- drivers riding a dying lane, moving over too late -- and it was not; it was measured rather than accepted. VERDICT, traced per want (tools/measure/missed-turns.mjs): THE WORLD WAS BROKEN, and not as the merge jam was: TOLD TOO LATE TO ACT, NOT ACTING TOO LATE -- not blocked, not riding a lane to its end: 97% of the misses NEVER HAD ROOM (approach median 50 m, room to change before the give-up line a median -84 m; 0% of their time standing, 0% crawling), against a median 336 m approach for those who made it. A driver learns its exit one intersection ahead, and the city's short blocks gave it a turn needing another lane with no road left to change in. FIXED, within today's model: the exit is drawn among those this lane makes, and those another lane makes only where there is road to get over -- lanechange.js `changeRoom`, ONE definition read by the draw and by the give-up rule. City turns missed 906 -> 19 in the same five minutes (the misses left had room, a median 75 m: gaps); the endless highway unchanged (101 -> 102). The real cure is a route known several blocks ahead -- destinations (10.30), not started. Also fixed: the give-up rule read the speed a car has, not the one it is heading for, and a change begun pulling away from a line finished past it (a regression the checks exposed; with them off verify-lanes 63% -> 62% made, still clear of its bar).
31. THE CANDIDATE'S CHECKS AS EVENTS (the maintainer's build order, 27 October; DECISIONS 10.28 point 6, the gating dependency for the examiner layer). DESIGN AND PREDICTIONS, WRITTEN BEFORE ANY CODE:
   **Design.** `sim/checks.js`. A check is a named event with a DIRECTION (relative to the car's heading) and a TIMING, made by the driver's own behaviour at an OCCASION, never narrated: `mirror` (rear-view, behind), `mirror-left|right` (side mirror, rear quarter), `shoulder-left|right` (the blind spot), `left|right` (along the cross road at a line). Three occasions: (1) a LANE CHANGE -- side mirror then shoulder check toward the move, BEFORE the move (a prep of ~0.9 s, the signal on from its start), the gap judged again when the move begins; (2) PULLING AWAY FROM A LINE -- left-right-left, begun as the car slows to the line, launch held until it is done; (3) THE SCHEDULED GLANCE of a perceiving driver (attention.js) IS a rear-view mirror check -- look-away and checks are one mechanism. OBSERVATION decides whether a check happens at all, per occasion, at the lane change's existing measured rate (skip with chance 0.6 x the observation deficit, the same draw from the same stream as today's blind-spot roll). KNOWLEDGE decides whether the right check is made at the right moment, per driver and consistently (core/driver.js `reads`, two new kinds appended to DIFFICULTY, flagged as placed without a ruling): a driver who does not know the shoulder check either omits it or makes it late (after the move has begun); one who does not know left-right-left scans in the wrong order (right-left, ending away from the near traffic). DIRECTIONAL PERCEPTION, for perceiving drivers: while a check is being made the road ahead is carried, as a glance carries it today; a lane change with no shoulder check before it misses the car in the blind spot (today's `missed`, now the consequence of where they looked); at a line, cross traffic from a side not looked at since slowing for the line is judged from the picture of when they last looked that way. Drawn on each car as a look wedge toward what is being seen, so the maintainer can watch a driver check (the acceptance test, his). `world.checks === false` is today's world.
   **Predictions** (desk; written 27 October before building; judged against these, not fitted after):
   P1 EXACT: with checks off, all 17 world hashes identical to today's.
   P2 Lane changes: per minute on the shaped endless highway down 5-15% (gaps that close during the prep); crashes in default traffic still 0.
   P3 Blind-spot misses (per occasion with somebody in the blind spot): roughly double today's rate, from the observation skip alone to that plus the drivers who do not know the shoulder check (about one in six); aborts rise with them; contacts still 0 (the survivable floor is untouched).
   P4 Lines: median added wait at a stop line under 0.3 s (the scan mostly done on the approach); undue-delay marks for sound drivers unchanged.
   P5 Perception on: glances at the same rate, now mirror checks; launches without a full scan bring more hard braking by priority drivers; crashes at test map 1's crossroads at 260 cars at most 2 in 10 minutes.
   P6 Step cost: under 3% with perception off, under 5% with it on.
   **BUILT 27 October, NOT ON BY DEFAULT** (`world.checks`, off unless asked; on #/map the switch "Drivers check mirrors", beside look-away). tools/verify-checks.mjs holds it event by event against the looks as drawn, sabotaged three ways (knowledge ignored, the line hold removed, the eyes-off carry removed: each fails its line). Drawn as a pale wedge from the driver's seat toward what is being looked at (iso/draw.js). **The acceptance test is the maintainer's: switch it on, watch a driver check.**
   **AGAINST THE PREDICTIONS** (desk, final code, tools/measure/checks.mjs, three minutes, checks off -> on):
   P1 MET, exact: all 17 world hashes identical with checks off -- and that is the default.
   P2 PARTLY: lane changes a minute, shaped highway 130.4 -> 107.6 (-17%), test map 1 163.2 -> 146.0 (-11%), the city 40.4 -> 28.4 (-30%); crashes 0 everywhere. The drop is in discretionary changes: those made for a turn are about unchanged (city 27 -> 28, highway 122 -> 111) and missed turns rose 7% on the city; a change whose gap closes during the looks is not made (53 such on the highway in three minutes).
   P3 PARTLY: changes begun with somebody unseen in the blind spot, per 1000, highway 12.3 -> 29.7 (x2.4), test map 1 14.7 -> 13.7 (x0.9), with look-away 15.2 -> 21.2 (x1.4); the city's sample is too small to read (1 in each). The occasion counters (blindOcc) changed meaning on the way -- a driver who will look declines at the decision, uncounted -- and were restored to per-attempt; read per change begun, not per occasion.
   P4 PARTLY: no sound driver marked for undue delay with perception off (0 and 0 on test map 1 and the city, against 0 and 2); the stop-line median on the city unchanged (0.10 s), on test map 1 15.5 -> 17.1 s, which a signalled map's reds dominate. Found on the way and fixed before shipping: scans made during the warm-up lay on its clock, 14 s in the future, and held drivers at their lines (checks.js `rebaseLooks`); scans begun too late (12 m, 6 m/s) added their length to every stop.
   P5 MET for crashes (0 with look-away, test map 1 at 260); NOT MET for undue delay: 3 sound drivers marked with look-away on against 0 -- between looks a waiting driver's picture of the cross road is up to a few seconds old, and they wait on traffic gone. That is the OBSERVATION axis producing a mark the sheet calls CONFIDENCE's (crossing.js: "a driver no more cautious than competent can NEVER be marked"), and whether the examiner's mark should follow the cause or the observable is the maintainer's question.
   P6 NOT MET: step +6-9% with perception off (predicted under 3%), +21% with it on (predicted under 5%). Found on the way and fixed: a picture of the cross road per driver rebuilt the neighbour index for each of them every tick (+55% at first) -- now applied only to the cars visited.
   **THE GATES TO SWITCHING IT ON** -- each passes with checks off and fails with them on everywhere, each to be traced, none tuned: verify-lanes (58% of drivers in the wrong lane get over for their turn), verify-merge (a joiner stands 180 s at the end of its lane at 300 cars; courtesy's share), verify-signal (5 car-ticks of a driver committed at an amber braking hard for the line), verify-promotion (one placed car within 10 m of another when re-asked), verify-telling (confidence reads 2.0x where a gap matters, threshold over 2: the scan adds the same wait at every stop), verify-drive (stop-leg cars not seen at rest at their line while the player came through), and verify-walkers -- whose careful pedestrian struck is NOT the checks': with them off, seed 6 strikes one too (a separate task, flagged; the check runs one seed).
   **THE GATES, ONE AT A TIME (27 October, later), each with its verdict before any change** -- run with checks forced on everywhere:
   - verify-drive, stop legs not waiting while the player passes: THE WORLD BROKE. A car turning left off the through road, with no control at its line, stopped for an oncoming gap and was held to finish a left-right-left; it missed its gaps, the turn queue grew, and the two-way stop's minor legs starved (13 rounds of looking, 45 s, at the head of both). FIXED: only a look a control asked for (a stop, a yield, a red) holds the start (`scan.must`); a driver waiting with no control still looks, and goes when the gap comes. Now 2,708 car-ticks waiting, identical to checks off.
   - verify-telling, confidence's tell 2.0x against a bar over 2: THE WORLD HAD BROKEN, and the earlier change fixed it: a scan begun too late (12 m, 6 m/s) held every stop for its whole length; begun at 25 m and 9 m/s it is done by the time the car is at rest, and the waits per trip are now identical to checks off (two-way 3.21 s sound, 7.53 hesitant; ratio 2.35). PASSES.
   - verify-lanes, 57% of drivers in the wrong lane get over for their turn against a bar of 60% (63% off): THE WORLD CHANGED AS INTENDED and the check states the old world's figure -- every change now costs a look first, and changes made for a turn fell 5% (590 -> 558). The bar is three points under the old figure, not derived. NOT CHANGED: the maintainer's or the project lead's call whether 57% is acceptable, or the bar restated from a principle. (Re-measured after the merge fix below, which begins the looks for a turn's change when it is wanted.)
   - verify-merge, joiners stranded at 300 cars: THE WORLD BROKE. The looks for a merge began only once a gap was acceptable, so in dense traffic they outlasted it: over three seeds joiners stood 3,389 s in all against 1,372 with checks off, eleven over a minute on seed 1. FIXED: a change the driver must make (a merge, a lane for a turn) is looked for from when it is wanted, and the driver stays prepared while they keep wanting it; 1,360 s against 1,372. NOT YET PASSING: seed 1 still has five joiners over a minute, one for the whole three minutes, waiting prepared for a gap that never comes and an offer that never opens -- not yet shown to be the checks' doing (a jam on one seed), traced next. TRACED 27 October (tools/measure/merge-stranded.mjs): NOT a full lane and NOT courtesy -- A MUTUAL WAIT, latent with checks off. The head joiner stands at the lane's end; the next joiner back began its merge rolling (32 m behind at 10.8 m/s), and a merging car is held to the lane it leaves until its blend is over while a stopped car's blend stands still -- so it stopped part-way across, 1.9 m behind the head joiner's place, its leader the head joiner. The head joiner refuses that gap (the car behind 1.9 m back, its comfortable lag need 3.2 m; the floor, 1.5 m, is met); the straddler waits for its leader. Both stood the rest of the run with 400 m of open lane ahead, and the through lane queued behind the straddler -- which is the other four. The code has two guards for this shape already (lanechange.js "ROOM TO GET ACROSS", "FROM REST, ONLY FROM THE HEAD OF THE QUEUE") and a third was tried -- the whole blend's closing in hand at the start -- and REVERTED: checks off went from 0 joiners over a minute to 12 on the same seed, the same deadlock (car-1609, its straddler car-1684). All three PREDICT at the start of the change and cannot see a head joiner still rolling then that stops at the end later. The fix that would end it is at the other end -- the head joiner treating a car at rest behind it, whose leader is itself, as no lag threat. APPROVED 28 October ("a car that cannot move until you move is not a car you can cut off") and BUILT in lanechange.js gapFor, the one definition both its readers use (the change itself and keep-right's "no gap" excuse); the floor (room for the car behind to be there at all) still holds. SCOPE MEASURED before shipping, as asked (tools/measure/defer-scope.mjs, with a temporary hook not committed): ONE firing in 57 world-minutes of unshaped traffic over five maps, checks on and off -- the seed-1 deadlock, at a merge -- and none at a queue (test map 1 at 260, the city at 250, test-signs at 200, ten minutes each). At a light the rule needs the stopped car's leader to be the changer, which a car only partly across can be; it never was. THE GATE, what was allowed to move and what did: only a world where the rule fires. With CHECKS=0 (the default world) one of 15 hashes moved -- test-loop, 180 cars, seed 2, shaped and driven -- and it fired there once, car-1108 on slip road on-3, a stopped car 1.92 m behind it: a merge. With checks on, the same world: car-1108 stood 101 s before the fix and 1 s after, joiners over a minute 4 -> 1. verify-merge seed 1 at 300 cars: 0 joiners over a minute, checks on and off (was 5 on).
   - verify-merge, the remaining failure with checks on: "courtesy is what gives it" -- over the waits of 20 s or more without courtesy the check needs 4, and with checks on finds 1 (31 s -> 11 s, ratio 0.36 against the 0.7 line). PRE-EXISTING: identical before the deadlock fix, hidden behind the stranding failure. TRACED 28 October, and NOT the comfortable reading. Over 8 seeds (tools/measure/courtesy-tail.mjs, verify-merge's own trials: endless highway, 150 cars, every on-ramp taper at 120 s and 165 s, 8 trials a seed) the tail does rise with seeds but stays at a THIRD of the checks-off rate: waits of 20 s+ without courtesy 19 of 64 checks off, 6 of 64 on (seeds 1-4: 10 and 1, reproducing the check). Courtesy is fine -- the tail with courtesy is 0.43 of without, checks off, and 0.40 on (line 0.7). The world changed: every wait is shorter with checks on (without courtesy median 8.1 -> 5.4 s, p90 32.5 -> 17.6, max 84 -> 35), because the lane beside the taper is thinner -- 2.30 cars within 150 m of a taper checks off, 1.87 on, at the same 25 m/s, the same 150 on the map (tools/measure/taper-lane.mjs, seeds 1-4, 100-180 s) -- because KEEP-RIGHT MOVES FELL BY TWO THIRDS: 415 -> 157 lane changes into the right lane, merges unchanged (663 -> 674), overtakes -17% (867 -> 721), changes for a turn or exit +31% (174 -> 228). THE CHECK IS NOT CHANGED: its verdict hangs on whether a 62% fall in keep-right is the intended cost of looking first (then the check describes a world that no longer exists, and its sample must grow) or a defect (then fixing it restores the tail and the check passes as written). NEXT: trace the keep-right fall. TRACED 28 October: A DEFECT, AND NOT THE HYPOTHESIS. The hypothesis was that a low-urgency keep-right is abandoned when the looks outlast its gap. Not so: on the EXIT STRETCH (most of the endless highway) `exitStep` keep-right called `attempt`, which on deciding answers with the looks begun (`lcPrep`) and the route unchanged -- and `exitStep` tested only whether the route changed and returned the driver it started with, DISCARDING the looks. Every consideration began them afresh and threw them away; they never finished. The only exit keep-right moves left were drivers who skipped their checks (no looks to lose), so EVERY keep-right on the exit stretch with checks on was made without looking. Measured (tools/measure/keepright-exit.mjs, 150 cars, 0-180 s): exit keep-right 89 -> 8 and 91 -> 15 (seeds 1, 2), skipped 8 of 8 and 15 of 15; approach keep-right ROSE 16 -> 28 and 17 -> 26, the cars left out on the exit arriving still out. (tools/measure/keepright-trace.mjs, the approach's hog spells, saw no fall: keep-right moves back 7 -> 14, 10 -> 14 -- it watched the wrong half, CLAUDE.md item 4.) PREDICTIONS, written before the fix (carry the looks out of exitStep): P1 exit keep-right checks on within 20% of checks off per seed, skipped a minority (the skip rate, under 20%); P2 approach keep-right back toward checks off (under 22 per seed); P3 the lane beside the taper back toward 2.30 (from 1.87); P4 the courtesy tail rises toward the checks-off 19 of 64 and verify-merge passes as written with checks on; P5 with checks off every world identical (lcPrep exists only with checks on). Overtakes -17%: no mechanism offered, not predicted. FIXED (lanechange.js exitStep keeps the looks), RESULTS against the predictions, all checks on: P1 PARTLY -- exit keep-right 67 and 80 against 89 and 91 off (75%, 88%; seed 1 misses the 20% line), skipped 18% and 24% (seed 2 over the 20% line: a skipper has no looks to wait for, so is over-represented among quick moves); P2 MET in direction, 23 and 18 against 16 and 17 off; P3 MET, the lane beside the taper 2.28 (2.20-2.35, seeds 1-4) against 2.30 off; all keep-right 361 against 415 off (157 before); overtakes, unpredicted, 781 against 867 off (721 before); P4 MET, the courtesy tail 19 of 64 over seeds 1-8 -- the checks-off figure exactly -- and verify-merge's courtesy assertion PASSES AS WRITTEN with checks forced on (7 waits, ratio 0.43); P5 MET, all 15 hashes identical with CHECKS=0. BUT verify-merge now fails its stranding assertion with checks on: one joiner at 300 cars, seed 1, stands 62 s (line 60). TRACED (merge-stranded.mjs 300 1 1): the head joiner is prepared and watching (`seen` renewed every consideration), the curb lane beside it runs at 20-25 m/s, no gap sampled is takeable from rest, and NINE courtesy offers aimed at it never opened -- the weakness already recorded in verify-merge's section 4 note (the driver asked too close to brake from 25 m/s to the gap a car at rest needs). Hidden until now because the broken keep-right was thinning that lane. KNOWN FAILURE UNDER CHECKS ON, LEFT DELIBERATELY (the project lead, 28 October): it is the limitation of DECISIONS 10.15 -- a car at rest cannot join a 20-25 m/s stream through any gap, and courtesy from a car doing 25 m/s cannot make one. The default world (checks off) passes; fixing it changes courtesy, a design question for the maintainer, to be put to him once he has used the skill dial and can see which drivers are involved. Do not rediscover it: verify-merge section 4 at 300 cars, seed 1, checks forced on, 62 s.
   - verify-lanes turns, THE BAR RULED (the project lead, 28 October): relative to checks off, plus an absolute floor on the checks-off figure; margin and floor from measured spread, never picked. THE ARITHMETIC (tools/measure/turns-spread.mjs, the check's own world and counting -- test map 1, 200 cars, 150 s, every driver seen, turnsMet / (turnsMet + missedTurns) -- seeds 1-16, checks off and on; it reproduces the check's figure, 406/659 = 61.6% on its seeds 3, 5, 9). The check pools three seeds, so the statistic is a three-seed pool: over all 560 triples of the 16, checks OFF mean 62.0%, sd 1.8, min 57.2, p99 66.2; checks ON mean 55.9%, sd 1.0, min 53.4; the PAIRED drop off - on on the same seeds mean 6.1 points, sd 1.9, min 0.7, p99 10.2, max 11.3 (per seed -1.5 to 12.2). So the proposed 8-point margin sat one sd above the mean drop and about one draw in ten would have false-fired. MARGIN: the drop no more than 14 points -- mean + 4 sd (6.1 + 7.6 = 13.7), above the largest of 560 pools (11.3); a seed change has to be four sd out to fire it, and a collapse of turn-making with checks on is not a few points. FLOOR: checks off above 50% -- "most drivers who need a lane fail to get one" is the thing never accepted, and 50% is 6.7 sd under the mean and 7 points under the worst pool. BUILT 28 October (verify-lanes 4b, TURN_DROP 0.14, TURN_FLOOR 0.5): on its seeds 3, 5, 9 at 200 cars, 150 s -- off 406/659 = 62% (floor 50%), on 363/650 = 55.8%, a drop of 5.8 points (at most 14); PASSES. SABOTAGED: (1) with checks on, a turn's change never begun -- on 0 of 667, a drop of 61.6, the comparison FAILS, the floor passes (off untouched); (2) with checks off, every turn's change refused -- the floor FAILS at 0%; (2b) refused for half the drivers only, so changes still happen (307) and the count guards pass -- the floor FAILS at 32% on its own, the comparison passes (off fell below on, a drop of -24). The bar no longer depends on whether the checks are on: the gate item is closed.
   - **AN UNDERIVED CONSTANT IN A CHECK, the third this week (the project lead's count; DECISIONS 10.23 item 13)**: verify-lanes' 60% was never derived and sat a few points under the figure measured when it was written, so it encoded nothing -- and a two-point drift tripped it. Beside the proxy-drift lesson: a bar is a statement about the world and has to say where it comes from.
   - **A GATE CORRECTION, 28 October: tools/scratch/hashes.sh is a CHECKS-ON gate.** world-hash.mjs and shaped-hash.mjs both run with checks on unless CHECKS=0, and hashes.sh does not set it -- so the shaping fix's "17-hash gate read identical" (verify-promotion, above) was a checks-on reading, not the default world. Re-run with CHECKS=0: the shaping fix moved one shaped world, test-highway (325 -> 337 placements, inside the sampled window), and nothing unshaped. Both statements now made at both settings. Every earlier "checks off, all hashes identical" in this entry rests on a CHECKS=0 run (P1 says so); anything after 27 October that cites hashes.sh without CHECKS=0 is checks on.
   - REGRESSION FROM THE MERGE FIX, found re-measuring verify-lanes with checks on: one change on an approach now finishes past the line (8 car-ticks mid-change past it), and turns made are barely moved (58%). A must-make change prepared early begins its move later; the give-up deadline is asked before the move but apparently not in time. To trace before anything else on this list.
   - verify-signal, a driver committed at an amber braking hard for the line: THE CHECK MEASURED A PROXY. It counted any hard brake while the amber decision (`amberGo`) was still set -- and that state lasts to the next intersection: every event traced was a car 28 m and 190 m PAST its line, braking at 8 m/s^2 for a car that had just changed lanes 3.3 m in front of it having missed its shoulder check (allowed down to the survivable floor, by design). The world is fine. FIXED (e2ef6b2): counted only short of the line; passes checks off and on, fails with the amber decision made non-sticky (26 car-ticks).
   - **FOR THE MAINTAINER, measured not changed: a missed shoulder check ends in an EMERGENCY STOP two times in three** (tools/measure/cutin-braking.mjs, whole-world traffic, no player, 10 minutes): the endless highway at 180 cars, 30 changes begun with somebody unseen, the car behind at 8 m/s^2 after 20 -- 120 emergency stops an hour, checks off; 114 with them on. Test map 1 at 200 cars: 7 of 14, 42 an hour, off; 11 of 22, 66 an hour, on. Not the checks' doing: lanechange.js lets a missed check cut in down to where the car behind can still stop at its HARDEST (`lagSurvivable`), so being found out is nearly always a near miss. RULED 27 October (DECISIONS 10.31): "it shouldn't always be full braking, it depends on what is necessary" -- a spectrum by the driver's quality, the maximum the rare extreme; structural (the floor IS the maximum, so every cut-in lands on it); the fifth behaviour in the courtesy family; queued after the dial, not built.
   - verify-promotion, one placed car within 10 m of another when re-asked: THE WORLD WAS WRONG, latent and not the checks'. Shaping judged a placement on the OLD tick's clock with the NEW tick's cars, while contact detection a line later asks at t + DT -- two clocks for one moment. A car mid-lane-change stands somewhere else on each: the placed car was 10.04 m from a merging car on shaping's clock and 9.98 m in the world it joined; the checks only moved lane-change timing so one landed across the line. FIXED (shaping.js, asks at t + DT): passes checks off and on, 49 of 49 derived checks. NOT EXACT and said so: the 17-hash gate read identical, but it samples once a second and test-highway diverged at tick 2381, after the last sample -- one placement in 334 admitted 0.15 s earlier. The gate's boundary: a change in a run's last second is invisible to it.
   - verify-walkers: NOT THE CHECKS (perception off there; the striker a sound observer looking at the road; checks off strikes one on another seed) -- a pedestrian-model defect, its own task. With perception on, 16 runs of 15 minutes struck no careful pedestrian, checks on or off.
30. THE FOLLOW-CAR INDICATOR (the maintainer, 27 October): RULED (DECISIONS 10.24) -- follows too closely is markable: inside 0.75 car lengths (3.375 m) for 2-3 s, the 2-3 s a DWELL not a gap; above a derived floor of 7.1 km/h (where a sound driver's own gap is that). The gauge BUILT (1.2.20, verify-headway). RULED 27 October (DECISIONS 10.25): only while moving (standstill is stopping distance, a separate mark, not modelled); three entries -- business road, residential, highway driving -- the first sectional fault and the test case for 10.18's structure. NOT BUILT. CORRECTED the same day by the real score sheet (DECISIONS 10.26): headings are manoeuvres on a declared route (heading -> phase -> item -> variant), follows too closely is seven or more entries (Spacing, Gap), the road-classification work is DROPPED -- routes that declare legs and manoeuvres instead; and TRAFFIC CHECK, the sheet's most frequent item, has no observable in the game at all. Marking is not started until the maintainer asks. Still open: what "moving" means. The gauge's amber still uses the derived 7.1 km/h floor until "moving" is ruled. NEXT, after which the game layer (rivals with intent, the marking guide, the sectional sheet) is briefed. PERFORMANCE WORK STOPS HERE (1.2.19): the big wins were broken things, and they are fixed
29. ~~LOD~~ -- PARKED with its design and predictions (1.2.19); instead shaping's per-try pass over the fleet, contact detection's string keys and the pose's walk along its path -- exact (17 hashes, contacts old against new), the endless highway -10% on the desk; his phone predicted 19.5 -> ~17.5 ms at 180. The allocation readout (bytes a frame and a step) shipped 2aa7e1e
28. THE OVERTAKE ASYMMETRY IS NOT THE LATTICE (the maintainer at 108 in a 100: overtook 3.6 a minute, overtaken 0.3). Asked of the AI (tools/measure/overtake-spread.mjs, endless highway, 280 cars, two seeds): wanted speed / limit p10 0.92, median 1.03-1.04, p90 1.17-1.19, max 1.35 -- 19-25% of the fleet wants more than 108%; and AI drivers who want exactly the limit are overtaken 1.3-2.7 a minute and overtake 2.9-3.2. The spread reaches the road; at 108 only about a fifth of the fleet is faster than him, by smaller margins, and his 0.3 is about what that predicts. Closed: he is simply fast
27. MERGES JUDGED READ ZERO PARTLY BECAUSE THE COUNTER WAS BLIND ON EXIT STRETCHES -- FIXED: it read a lane change as the route's `from` lane changing, catching approach changes and missing most on exit stretches (the old counter matched 11 of 20 real lane changes near a car, 3 of 9 on exit stretches; now 20 of 20, 9 of 9 -- tools/verify-mergecount.mjs, split from verify-encounters, sabotaged). The rest of his zero is sparse traffic (4 in view, 4.5 met a minute): lane changes with a car within 30 m are rare there. The phone's readout shows the counter from this build
26. A LANE CHANGE JUDGED ONLY THE NEAREST CAR AHEAD -- FIXED (22 October): both neighbour searches now return every car ahead within reach (the lead need against a car standing still, the farthest any car can demand room), and a change is begun only if each leaves its own lead need. Measured per lane change, independently by pose (tools/measure/lc-closing.mjs, shaped, two seeds of 5 min): changes begun into a car closing too fast to stop for comfortably 1 in 10,364 before, 0 in 10,431 after -- the one was the traced crash; changes not starved. Crashes, 40 shaped minutes: 1 before, 0 after (too rare to read alone). NOT A CHECK: a check resting on one event a ten minutes is the implied-sample-size trap; the measure stands instead. The off-ramp-bound car alongside (defect 1 below) was NOT in the crash -- recorded, not changed: nothing it causes has been shown. Was, found gating density shaping (world wrong, NOT shaping's): traced (endless highway, 280 cars, shaped, seed 2, t 257.8), a driver moved from lane 1 into lane 2 judging only the player 10.8 m ahead (faster, about to pull out) -- leadOk -- while (1) a car bound for the off-ramp overlapped it alongside, invisible because exitNeighbours admits only cars bound for the target lane while whatStops queues every car from the same approach (two definitions of who is in a lane), and (2) a car 16 m beyond the player was 13 m/s slower, hidden because gapFor reads the nearest car ahead only. Rear-ended it 1.8 s later. Rate: 1 crash in 40 shaped minutes, 0 in 40 unshaped, none involving a placed car or the player (tools/measure/lc-crashes.mjs). FIX: judge every car ahead in the target lane within reach (the hardest-pressing, as whatStops follows) and admit cars in the lane by where they are, not where they are bound. Next after shaping's own gates
25. A GLANCING DRIVER'S PICTURE COPIES THE WHOLE WORLD -- BUILT AND CONFIRMED ON THE PHONE. **THE FIRST PHONE RESULT PREDICTED CORRECTLY, AFTER FIVE FAILED EXTRAPOLATIONS (22 October).** Written before his reading, with the mechanism behind it (the copies a share of the added cost, the phone scaling the desk on ONE map): "step near 45 ms, real time just about holds, roughly 20 fps". His reading on 6f981ee (endless highway, 280 cars, look-away on, unshaped, 3.1 min): step p50 41.4 ms (from 58.5), sim 0.89x (from 0.72), 18 fps (from 15), long tasks 3,515 ms in 5 s. ESTABLISHED PRACTICE, not an experiment: a phone number is predicted in writing, from a mechanism, before the reading, and the reading is judged against it. THE REMAINING LEVERS ARE THE MAINTAINER'S CALL, NOT AN ENGINEERING DEFAULT: look-away costs ~41 ms against ~25 without it, and the reuse lever at best removes the remaining copies (~a fifth of a look-away step), ~37 ms, still ~20 fps -- look-away cannot be optimised to free. Put to him: a setting turned up to watch behaviour and down to drive? The reuse lever is NOT built until he answers. Previously, built: HIS READING ON 7600bda, endless highway, 280 cars, look-away ON, 4.4 min: step p50 58.5 ms (2.4x his off baseline 24.6), sim 0.72x, 15 fps, long tasks 4,932 ms in 5 s, 29 full collections in 5 s, heap 78 MB flat. AGAINST THE PREDICTIONS WRITTEN BEFORE IT: below BOTH the compute-bound range (70-85 ms) and the allocation-bound one (>=110), between compute-bound and desk-overstates; the phone's on/off ratio (2.4x) is SMALLER than the desk's on this map (3.1x); full collections per simulated second ~8.1 against the baseline's 5 -- up ~60%, real but not the step. READ AS: look-away's cost on the phone is real and mostly compute, allocation a share on top; the fix is justified as removing work. THE FIX, measured on the desk (endless highway, 280 cars, look-away on, mean step): 28.0 -> 20.1 ms, the added cost 19.0 -> 11.3 ms (-41%), the world identical (the seven-map hash gate, and section 5 against a world with whole-world pictures, sabotaged): (1) a picture carries only the reader's node and the nodes joined to it -- every reader goes through those; (2) one copy of a car per moment and age, shared by the pictures it is in; (3) peripheral vision reads its own node, not the whole snapshot. TRIED AND DISCARDED: a remembered car as a prototype wrapper over the snapshot (one own field, not fifty) -- exact, and SLOWER (21.9 -> 25.8 ms: reads through the chain cost more on the hot path than the spread saved). LEFT, profiled: the copies are still a fifth of a look-away step (each a 50-field spread to change s), collection 8.8% against 3.6%. Next levers, not built: a pool of copy objects reused tick to tick (no allocation, the same compute; only safe if no seen car outlives its tick -- gate-checkable), or the per-driver memory of the few cars a driver saw (bounded, and NOT exact: a re-validation). Was, scoped: measured (a temporary counter), 16.6 whole-world carried pictures a tick at test map 1's 260 cars and 18.0 at the highway's 280 -- 4,310 and 5,030 car copies a tick, ~100k a second, several times what the step itself copies -- for 29-32 glancing readers a tick. NOT NECESSARY: every reader (whatStops through its relevance index and nearNode, nobodyAbout through atNode) reads only the cars at its own node and the nodes joined to it. The fix: carry forward only that neighbourhood from the snapshot -- ~30-60 cars, not 280 -- in carriedForward, two call sites. Expected EXACT (no reader looks further): checked by the world hash with perception on, identical before and after. Build after the reading, or on its own merits if the maintainer's number is moot. PREDICTIONS, WRITTEN BEFORE THE READING (the maintainer on 7600bda, endless highway, 280 cars, look-away switched ON -- it is off by default -- three minutes): desk, mean step 9.0 ms off, 28.0 on (+19.0); the whole-world copies alone 10.8 ms (57% of the added cost), everything a glancing driver's read costs 13.0 (68%) (a temporary timer, tools/scratch/copytime.mjs). His off baseline: step p50 24.6 ms, sim 1.00x, 25 full collections in 5 s -- a phone factor of ~2.8. H1 COMPUTE-BOUND (the phone scales the desk uniformly): step p50 ~3.1x the baseline, 70-85 ms, sim ~0.6x, full collections per SIMULATED second near the baseline's 5. H2 ALLOCATION-BOUND (the phone's collector punishes the copies): step >=110 ms (the crossroads ran 3.45x on the phone against 1.7x on the desk -- that ratio would put it near 150), sim <=0.45x, collections per simulated second well above 5. H0 DESK OVERSTATES: step under ~50 ms, sim ~1.0x. Long tasks do NOT discriminate (the step passes the 50 ms tick under both H1 and H2); the step ratio and collections per simulated second do. H1 or H2: the fix is justified (it removes most of the 10.8 ms on the desk alone); H2: urgent, and likely the crossroads reading's whole story; H0: it waits
24. LETHARGIC OFF THE LINE (the maintainer, watching 3e77206 at the crossroads): UNFINISHED -- does look-away slow a queue leaving a green? The first instrument (tools/measure/discharge.mjs) counted only cars that came to rest at the line, 12 events in five minutes: not evidence either way. NEXT: a discharge measure that follows a whole standing queue from its green (each car's start after the one ahead, look-away on and off), then decide
23. THE CAR AHEAD PULLING AWAY AS A PERIPHERAL CUE (the maintainer's mechanism for item 24): PARKED behind item 24 -- built only if the discharge measure shows look-away slows queues
22. TURN ARCS TIGHTER THAN A CAR CAN STEER (found investigating 21; tools/measure/turn-audit.mjs). CORRECTED: the skewed right turn does NOT drift a lane left -- the lane runs on a diagonal, and at the meeting point the car is 0.2 m off its own line. The conflict is the RADIUS: the arc is tangent to both lane lines from the stop point, so r = d / tan(turn/2), and a sharp corner gives an arc far under a car's 5.5 m lock whose swept body reaches the next lane. A CLASS: 227 of 633 turn paths across the seven test maps are under lock (city 205 of 528). SAME-APPROACH CONFLICTS (two lanes of one approach in the conflict table -- the capacity drain): 7 pairs, test map 1 (5) and the test highway (2), the city 0, every one a sharp RIGHT: 131 deg r 4.1 m (the crossroads), 169 deg r 1.2 m, 90 deg r 3.9 m (the 3.85 m corner of DECISIONS 5.15.12 -- the same family, confirmed), 115 deg r 2.3 m. BLOCKED ON THE MAINTAINER'S RULING (5.15.12, open): for a sharp corner no arc is tangent to both lanes, starts at the stop point AND is at least lock -- one gives: (a) sub-lock, as now, sweeping the next lane; (b) lock, finishing wide (tried: 1.65 m into the next lane, clipped waiting cars); (c) lock, begun before the line by a car that is not stopping -- and (a) or (b) for one that is. Which does a driver do at a tight right corner? THE THREE MEASURED (graph.js turn policy, default "tangent" = today, world hash identical on seven maps; tools/measure/turn-policy.mjs, tools/scratch/policy-traffic.mjs). The 228 turns under lock today, every one of them a RIGHT: TANGENT radius min 1.0 / median 3.8 m, finishes on its lane, 7 same-approach conflicts (test map 1, test highway). WIDE radius 5.5, finishes 1.6 m (p90 1.7, max 7.5) off its exit lane, 4 NEW same-approach conflicts in the city, crossroads throughput down ~3 cars a minute and 3 crashes in 20 minutes. EARLY radius 5.5 and on its lane, begun before the line (toward the curb: it changes only rights), no same-approach conflicts -- but NOT READY: at node 2 a right lands 7.4 m further along its exit lane, past where another right joins it, the conflict table loses the pair, and three crashes in ten minutes; it needs the merge-into-one-lane matching fixed first, and no lock arc serves node 2's 169 deg corner (a 57 m tangent) -- map design. AND THE CAPACITY CLAIM IS WITHDRAWN: removing the same-approach conflicts moves the crossroads' throughput by ~2% (early 38.3 / 36.8 a minute against 37.6 / 36.1), inside noise -- the holds it removes overlapped holds that happened anyway. So this is a geometry-truth question for the ruling, not a capacity lever.
21. THE CROSSROADS GRIDLOCKS WITH NO CRASH (the maintainer on 3e77206, test map 1, 260 cars, look-away on, 22 October): 13 fps, sim 0.56x, step 72.5 ms against 21 off, every approach queued and the box empty, zero crashes. His mechanism, watched: drivers lethargic off the line, AND a car through late on a red held every approach until it had cleared the WHOLE intersection -- a junction behaving as one exclusive lock. Look-away DEFAULTED OFF AGAIN meanwhile. INVESTIGATED (desk, look-away off unless said; tools/measure/box-hold.mjs, green-holds.mjs, discharge.mjs): (1) THE JUNCTION IS NOT ONE LOCK -- of 7,259 head-car-ticks standing at a line the light lets go, 0.1% were held by a box car whose path does not cross theirs; every hold is a real path conflict (blockedBy is per path). The fallback-to-conservative theory is not what happens. (2) A REAL CAPACITY DRAIN, GEOMETRY NOT RIGHT OF WAY: on the skewed approach (C-A, 64.8 deg) the right turn is a sharp 115 deg arc that drifts a full lane left -- from the curb lane through the inner lane's ground -- so it genuinely conflicts with the left-turner beside it, and yields to it while that left-turner stands waiting for an oncoming gap: the curb lane, straights and all, held behind a waiting left. 16% of green holds at that signal. The fix is the path (a right from the curb lane must stay out of the inner lane), not the rule. (3) THE DESK DOES NOT REPRODUCE A LOOK-AWAY GRIDLOCK: ten minutes, two seeds, throughput 36-37 cars a minute look-away off and on alike; standing cars climb ~95 -> ~140 in BOTH; nobody across on a red but 2-6 in ten minutes. The junction is low-capacity and degrades either way. (4) The phone's 3.5x with look-away on against the desk's 1.7x may be allocation (a carried picture copies every car per distinct glance start) -- a hypothesis, unmeasured. Queue discharge headway: the first instrument was too thin to read (12 events) and is not evidence either way. Open: the car-ahead-pulls-away cue (Jay's mechanism 1) awaits a discharge instrument that can see it
20. CLEAN DESK BASELINES (22 October, 18ca3c8 -- after the glanceAt rebase fix; desk only, the phone decides, 10.4). Median step at 2-3 minutes, tools/measure/step-drift.mjs, one run at a time on an idle machine: ENDLESS HIGHWAY 280 cars, player cruising -- look-away off 7.9-8.7 ms, on 29.1-29.3 ms (~3.4x); TEST MAP 1 crossroads 260 cars -- off 15.5-17.0 ms, on 24.8-29.0 ms (~1.7x). These replace the defect measurements (item 15). The look-away cost is HELD until the maintainer's phone reading says it matters. Separately: the highway's step still DRIFTS with look-away off, 7.1 -> 8.7 ms over three minutes at a constant 280 cars -- not look-away's; open
19. COURTESY FOR A PLAYER STANDING AT THE TAPER (found tracing 10.20): fails in a third to a half of the long waits, old code and new -- the driver asked is too close to brake from 25 m/s to the gap a car at rest needs, passes, withdraws, the next is asked (stranded.mjs, tools/scratch/nohelp traces). Recorded, not built; the player is never stranded past a minute (verify-merge)
18. ANTICIPATION AS ONE PROPERTY (DECISIONS 10.15, 10.20): BUILT -- anticipate (act from when the need is knowable) or react (from when it is pressing), the chance the observation soundness, one draw per occasion (core/driver.js anticipates); the glance, gap-seeking, courtesy onset and checking behind read it, the two COMPETENT_AT gates and the glance's own draw gone. verify-anticipation. The merge within chance of before (8 seeds). Found on the way: a standing-merge deadlock (fixed) and two verify-merge trial faults (restated). Getting over for a turn is a candidate fifth site, not built. Today five sites read five different statements of "how far ahead this driver plans" -- gap-seeking and checking behind a yes/no COMPETENT_AT gate, courtesy onset the registration lag, merging out of an ending lane a fixed stopping distance for everybody, glance timing a dice roll on the deficit -- four rules that roughly agree and one written today. One quantity per driver, the four derived from it
17. THE MERGE JAM (the maintainer's photograph, 22 October: cars queued in the dying lane while the lane beside sat empty) -- RE-CHECKED on 3e77206, NOT GONE and NOT look-away's: at 280 cars on the endless highway 7% of joiners stand, look-away off or on (longest 61 s off, 97 s on; at 150 cars 2%, 27 s) (entry-experience.mjs, PERCEIVE=1). BUT NOT THE PHOTOGRAPHED SHAPE: in every stander-second over three runs the lane beside was occupied within 150 m, median clear road 11-29 m ahead and 2-27 m behind, a takeable gap 1-3% of the time (merge-standers.mjs) -- a FULL lane, capacity, which anticipation does not fix. The empty-lane picture does not reproduce; NEEDS the photograph's map, place and build from the maintainer before anything is built
16. LOOK-AWAY, AS RULED (the maintainer, 22 October; DECISIONS 10.19): a glance is never blindness, is taken when it fits, and is the observation axis. 1 PERIPHERAL VISION -- built: the car ahead looming brings the eyes back a reaction later; the repro 12 crashes -> 0. 2 DEMAND GATING -- built: a due glance waits until the road leaves its length; long glances on clear road 57% -> 83%. 3 SKILL -- built: a poor observer skips the wait their deficit of the time; unfit glances sound 1%, poor 17%. Rates over 20 min: old glance 18 crashes, periphery alone 1, gating alone 3, all three 0 (verify-lookaway holds the mechanisms). DEFAULT ON AGAIN, the toggle kept (a saved choice under lookAwayOn stands). At 280 cars, look-away on: endless highway 0, city 0 by a glance, test highway 1 rear-end with nobody looking away. THE COST, HELD: desk only, the step with it on costs 1.6x off at 260 cars (median 29-30 ms against 17-19) -- the perception machinery, not gridlock. DO NOT OPTIMISE until the maintainer's phone reading says it matters (10.4: the index, the ceiling table and the jam hypothesis all misled); if it does, the first question is whether a glancing driver's carried picture needs to persist at all or can be derived. NEXT: anticipation as one property (item 18) (10.15) feeding gap-seeking, courtesy onset, lane-end merging and look-away timing
15. LOOK-AWAY WAS THE GRIDLOCK (the maintainer, 22 October, the same crossroads at 260 cars with it OFF): zero crashes, step 21 ms against 57.5, 58 fps against 14, sim 1.00x against 0.74x, long tasks 0 against 4946 ms. The chain: glance rear-ends in queues -> wrecks block approaches -> gridlock -> every car with far more neighbours -> the step triples. EVERY 260-280-CAR NUMBER TAKEN TODAY WITH LOOK-AWAY ON IS GRIDLOCK-CONFOUNDED -- MEASUREMENTS OF A DEFECT, NOT OF THE ENGINE; compare nothing new against them, re-measure (look-away off, then as rebuilt, item 16) -- the 280-car highway readings (36-50 ms, the drift, the jam at the merge, the GC line), the crossroads: evidence for this finding, NOT baselines. Re-measure with it off. Look-away was already off by default; the setting is renamed (lookAwayOn) so a saved on resets. What it does (crossing.js seenBy): TOTAL blindness to change for the whole glance -- every car carried forward at the speed it had -- with glances up to 2.4 s every 6 s (blind a median 9-10% of the time, the poorest tenth 26-28%, the worst ~40%); 12 crashes in 10 minutes, all rear-ends in queues, the follower looking away in every one, none a turner against oncoming (tools/measure/lookaway-crashes.mjs). Cost tracks CARS PER NEIGHBOURHOOD -- a warning for density shaping, which concentrates them
14. THE CROSSROADS CRASHES (the maintainer, test map 1, 260 cars, watching, look-away on): reproduced (tools/measure/crash-replay.mjs, seed 1) -- 4 in 120 s with look-away on, 0 with it off; all four REAR-ENDS in queues at the signalled node, each follower a poor observer (glance 1.7-2.4 s) looking away for ~2 s while closing on a stopping queue: the look-away design firing, not right of way. Open for the maintainer: is that rate wanted at 260 cars. AND A PATTERN: verify-crashes and verify-observation validate test map 1 at 150 cars, the merge was signed off at 150 -- the maintainer drives at 260-280; a density sweep of the checks is due
13. LOD AND SHAPING, ONE PIECE (DECISIONS 10.17): **LOD PARKED, 27 October (1.2.19)** -- measured before it was built: shaping already put ~90 of 180 cars within 700 m, the shaped highway holds no more cars and more buy nothing he feels, ~20% of the step for a week's work; the design and predictions are in 1.2.19, look-away (coarse cars never glance) is the biggest reason to revisit; the fixed work done instead, exact, -10% on the highway. Was: UNHELD (1.2.18) -- the clean 280-car reading has the world at 1.00x real time and 37 fps with 3 cars in view and 10.2 met a minute; the budget is confirmed and the allocation-first question is unmotivated at these counts. DENSITY SHAPING IS NOW THE PROJECT. Concentration's effect on the step is still to be MEASURED, not designed around (the clustering cost seen was collision gridlock). Was: held for the GC reading -- first answer what share of the phone's step is collection, not compute; if most, allocation reduction leads (what immutability buys, where the 8 MB goes, a ping-pong of car arrays), LOD second. Meanwhile the promotion check is written (placement.js admissible, verify-promotion, 10.9). Rule: no performance work is believed until a phone reading says so (DECISIONS 10.4)
12. THE GREEN, SPLIT (the maintainer, 22 October; DECISIONS 10.16): the horn at 2.0 s (HONK_AFTER, was 2.5), the mark at 4 s as undue delay's own constant; the escalation checked on a forced dawdler. OPEN for the maintainer: no modelled candidate reaches 4 s alone (poorest 2.7 s), so the observation fault is out of reach until the model has a distracted driver
11. DENSITY SHAPING (DECISIONS 10.17): ON FOR THE ENDLESS HIGHWAY since 22 October (verify-shaping in the suite; the jolts were the placed car's speed -- crossing.js exitLimit, one definition). Desk at 280 cars, 119%: met x2.4, overtakes x2.3 (targets met), merges judged x1.8 (target x2, SHORT -- partial). THE CITY, its own result (DECISIONS 10.17): every gate passes, but at the maintainer's style (119%, overtaking) met x1.18 and gaps judged x1.0 -- targets x1.3 and x2 NOT met, so it stays OFF; for a keep-right driver at 95% met x1.6-2.6 and gaps judged x3-9. A shorter window made his style worse; not tuned. Open: placement along the player's route. NEXT: the maintainer's phone reading on the highway, shaped and unshaped on one build; the lane-change fix (26); then LOD. History: built, NOT ON (later the same day: the queue-by-the-rule fix, the check at the maintainer's 119% pace -- 19-24 met a minute against his own 5.5 -- and tools/wip-shaping.mjs, outside the suite; still failing on placed cars slowing with their leaders, and an encounter figure that swings 5-23 between seeds at 3 minutes) -- placement.js and shaping.js committed inert (hash gate identical); on the loop, measured 17-20 met a minute against 2.2-2.6 with 0 crashes, but verify-shaping (tools/scratch/verify-shaping.wip.mjs) still fails on followers braking hard behind placed cars, and the encounter figure is unstable with the space check in. Hurts a dense grid (test map 1): per map, as data. Also found: a lane change onto a car at shaped density (world, own item); the loop's off-ramp ends are in sight
9. the 259-car highway (the maintainer's readout, 22 October; SIMULATOR 1.2.17) [PHONE CONCLUSIONS VOID, 1.2.18 -- the desk ramp stands]: (1) the step is superlinear in cars PER NODE, linear on the city -- the fix is the one sorted neighbour index; (2) the page was spiralling -- step budget shipped; (3) LOD next, with the neighbour index and gap predicate first (placement's first half pulled forward) -- the index's FIRST STEP shipped (whatStops' own lane, exact, -22% at 260 cars on the loop, SIMULATOR 1.2.17); next the lane change's and courtesy's scans onto it, then the gap predicate. Crashes: traffic alone 0 in 40 min; the readout now says which were with the player
8. ~~the step slowdown~~ -- found: two closures made per pair of cars in whatStops (+11% of its own time); hoisted, world hash identical on three maps, test map 1 10.92 -> 10.66 ms against 10.52 at 9c5c947

**Approved, parked until the above is done (not to be started):**
gradient (two commits: the grade term with level-map hashes as the gate,
then realistic truck and bus power, with grade in the junction clearing
prediction alongside it); the open highway (src/map/highway.js is
written and loads clean, 15 km, no conflict points -- not registered as a
test map, not driven); body motion and roadside density; placement;
signalling in the driver model; lead-car obligation (DECISIONS 10.13).

**Known, flagged, not scheduled:** harsh braking by cars mid-change rose
from 33 to 90 car-ticks on the signal map with the loop fixes (0.035% of
car-ticks overall, under the check's line); the lane-change exception
beside tapers (DECISIONS 10.11).

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

##### 1.2.3 THE STUTTER WAS GARBAGE -- 6 October, the city with everything in it

The ramp above is stage 0's roads and boxes. It has never seen a truck,
a bus, a bay, a pedestrian, a walker, a parked car, a building, a
sidewalk, a sight blocker or the free camera, so "the city tanks at
times" was something it could not reproduce. The measuring now lives
in four scripts, run on the city with 200 moving cars, 1835 parked and
264 walking:

- `tools/measure/frame-cost.mjs` -- #/map's own frame loop over a
  canvas that counts calls. It reports the frame distribution and the
  WORST frames, each split into sim step, poses, draw and garbage
  collection. It also gives the sim step with each kind of content
  switched off, and the draw with each kind left out, at street,
  district and whole-map zoom. Spikes, not averages, and the cost
  split by category and by side.
- `tools/measure/step-spikes.mjs` -- a CPU profile of only the slow
  steps.
- `tools/measure/step-alloc.mjs` and `draw-alloc.mjs` -- who allocates,
  per step and per frame.

**What it found: the spikes are the garbage collector.** 85% of a slow
step's time was the collector, not the sim (`step-spikes.mjs`). The
worst frames are frames where a major collection landed. So the cause
is how much garbage is made, and the answer is to make less, not to
compute less.

**The renderer was the biggest source, and nobody would have guessed
it.** The garbage `drawFrame` made per frame:

| | street | district | whole map |
|---|---|---|---|
| before | 13.0 MB | 14.8 MB | 14.7 MB |
| after | 0.8 MB | 1.9 MB | 3.5 MB |

That was about 780 MB a second at 60 fps. Almost all of it came from
things that were NOT on screen:

- Every terrain cell, road segment, sidewalk piece and parked car in
  the city was projected into a fresh array just to be culled.
- A sidewalk's polygon was rebuilt for every piece every frame.
- Loop bodies that made closures had V8 build their scope on every
  pass, before the cull could skip them.

The fixes:

- an allocation-free cull (`view.onScreen`);
- sidewalk pieces built once and kept;
- the per-thing bodies moved into functions called only past the cull;
- a box as one flat array rather than nine objects;
- faces sorted in scratch space;
- points projected into a reused pair (`view.into`).

**The arithmetic is the same arithmetic in the same order.** The old
renderer and the new were run side by side on every test map, at five
zooms and six rotations, and logged every canvas call with its
arguments. 1.34 million calls were identical, in identical order, with
the audit order identical too. The comparison catches a 1 mm change in
one face's sort key.

**The sim side**: 4.45 MB a step before, 4.77 MB with the frame's
poses after (it had been 7.06 MB). Parked cars' poses are now cached
per parking state, since they only change when somebody parks. The
sight test (`segHitsBox`) is allocation-free, and identical on a
million random cases.

What the whole frame does now, 30 s following a car:

| | p50 | p95 | p99 | GC |
|---|---|---|---|---|
| before | 3.66 ms | 8.71 ms | 13.57 ms | 541 ms in 552 pauses |
| after | 1.38 ms | 5.95 ms | 7.30 ms | 244 ms in 208 pauses |

These are desk-machine numbers; the phone is several times slower.

**By category, sim against draw.** Parked cars cost the sim almost
nothing (0.2 ms a step); they are a DRAW cost, 17-21% of canvas calls.
Sidewalks are the most expensive thing drawn per call, 0.24-0.34 ms
of a 0.8-1.0 ms frame. Trucks are the most expensive thing simulated:
0.9 ms of a 4 ms step. Walkers, people crossing and parking are
0.1-0.2 ms each.

**CORRECTED, 6 October:** this paragraph first said the trucks' 0.9 ms
"is the sight blocking". That was inferred, never measured. The
script's see-through row passed `seeThrough` to `seedGraph`, which
does not take it -- the step reads it off the world -- so the row
compared a world with itself and its "saving" was noise. The city
also has no crosswalks, so its "nobody crossing" row measured nothing
either. Both are fixed, and every row now prints what the world held,
so a switch that does nothing shows as nothing gone (1.2.4 has the
real numbers).

**What remains, worst first:**

1. **The sim step is now the frame.** It is ~4 ms every third frame on
   the desk. On a phone several times slower, that is a long frame
   every third frame at 20 Hz -- the likeliest stutter left. It still
   allocates ~4.8 MB a step: `whatStops` ~800 KB, the step's per-car
   copies ~730 KB, `poseOf`/`poseOnGraph` ~860 KB, `walkerPose`
   ~320 KB.
2. **Occasional major collections** still reach ~20 ms, now rarer.
3. Drawing parked cars as two shaded boxes each, at every zoom.

The phone number for the city, with all this in, is the measurement
still owed: open the city on `#/map` and read the fps readout.

##### 1.2.4 THE INSTRUMENT WAS MEASURING A SIMPLER GAME -- 6 October, and the bench

**What the phone said, on the garbage fix (`8b8237f`).** The maintainer
ran `#/iso` on the Pixel 7 Pro over HTTPS, a secure context now:

- every step held 60 fps with zero hitches and zero stalls, worst
  frame 16.8 ms, from 50 cars up to 200 cars with 200 props;
- the DOM probe hitched 12 times, so the control still bites;
- the step at 308 cars and 1238 things failed on p95 (25.1 ms) with no
  hitches -- graceful degradation, not stutter.

So the stutter is gone. **But the cap is not the game's.** In his
words, "the performance test appeared visually the same, no buses or
anything newer". `#/iso` is stage 0's roads with cars and boxes, so
200 cars was the ceiling of a scene without trucks, buses, walkers,
people crossing, parked cars, sidewalks or sight blocking. The desk
scripts had been rewritten for the real city and the phone instrument
had not, and the report's own columns said so.

**The bench (`src/iso/bench.js`, `#/bench`, the menu's Performance
entry).** It is the real sim on a map built to hold everything --
`BENCH_BRIEF`: every intersection type, a downtown with crosswalks,
curb stops and bays with buses, buildings on every lot, parked cars,
trucks at their share, sight blocking on. It is stepped and drawn as
`#/map`'s Watch does it, following a car at street zoom.

- **First, the ramp:** 50 to 400 cars, held eight seconds each, until
  a step's steady state fails. The DOM probe is still step 1.
- **Then the split:** at the steady cap, the same scene with each kind
  of thing switched off in turn, and once from further out. Every row
  prints the count proving its thing went to zero, and every frame is
  timed as sim step, poses and draw.
- `tools/measure/frame-cost.mjs` runs the same map by default, so a
  desk number and a phone number are of one scene.
- `tools/verify-bench.mjs` drives the screen's own frame through both
  phases. It holds each switch to removing its own thing and only its
  own thing; a "no trucks" that did nothing was planted and caught.

Building it found a real bug: a brief asking for downtown AND buses
had no bus stops at all. Downtown splits every collector at its
intersections, and the stop placer looked only at whole blocks. Fixed,
and `verify-briefs` asks for the pair.

**What the desk says about the bench at 200 cars, and what the phone
will probably say:** the sim step is 13.7 ms here, against 4 ms on the
plain city. Every third frame is a 16 ms frame on the desk, so on a
phone several times slower it will not hold 200. Switched off one at a
time:

| switched off | what went | step p50 (ms) | saved |
|---|---|---|---|
| nothing | -- | 13.72 | |
| people crossing | 60 crossing | 5.64 | **8.07** |
| walkers | 277 walking (crossers then come from the edges: 160) | 11.78 | 1.94 |
| sight blocking | trucks see-through | 11.81 | 1.91 |
| parking | 2646 parked | 12.55 | 1.17 |
| buses | 11 buses | 13.13 | 0.59 |
| trucks | 13 trucks | 13.33 | 0.39 |

**People crossing are 60% of the step.** That is the next thing to
diagnose, worst first, once the phone's number confirms it.

##### 1.2.5 THE PHONE ON THE WHOLE GAME, AND FORTY-ONE PEOPLE COSTING 13 MS -- 6 October

**The bench on the Pixel 7 Pro (`7da0243`):**
- **The cap fell from 200 cars to 50.** Step 50 held 59 fps; step 100
  failed on p95 (25.1 ms) with a worst frame of 33.3.
- **The sim is the bottleneck:** step median 17.6 ms against draw
  3.8 ms.
- **The split:**
  - 41 people crossing, 13.4 ms;
  - 292 walking, 10.6 ms;
  - 3 buses, 3.1 ms;
  - 4 trucks, 1.1 ms;
  - 2,684 parked cars, 0.9 ms;
  - sight blocking, 0.5 ms.

The maintainer did not trust the run, for two reasons, and both were
right.

**1. The positive control did not fire.** Zero hitches from the DOM
probe, against twelve on `#/iso`. The probe was only ever one control,
and the wrong one for the question it was standing in for. A React
update from the frame loop answers "does that cost here", and that
depends on the page: the bench's page is small, and the update may
simply have been cheap. Whether the run could see a hitch at all was
never asked. There are now two controls, each with its own line in the
report:

- **Control 1, can this run see a hitch.** In the probe step, the
  screen stalls itself for 80 ms every two seconds, away from the
  React update. The meter must see every stall, or the report says its
  hitch counts cannot be believed.
- **Control 2, does a React update cost here.** The updates issued are
  counted, and the frames they land on are timed against the rest. A
  probe that ran and cost nothing now reads differently from one that
  never ran.

The probe step also no longer ends a ramp: it fails by design.
`verify-bench` checks both controls, and it caught a meter made blind
to the stalls.

**2. Switching off drawn content made the SIM slower** -- sidewalks
-3.3 ms, buildings -4.5, the wide view -5.5. It was impossible, and the
cause was the split itself. The switches that keep the world carried
the baseline's world on, so they ran 9 to 36 s later in its life. A
bench world is not stationary: people crossing grow from 35 to 73 over
its first minute, and the step from 6.4 to 9.9 ms
(`tools/scratch/drift.mjs`). Every split step now RESTARTS the world
the baseline was built with. The step is pure -- measured: the input
world is untouched, and two runs from it are identical -- so it is the
same moment every time. `verify-bench` holds the drawing-only steps to
ending the sim exactly where the baseline did.

**3. The pedestrian cost, as found** (`tools/measure/step-profile.mjs`,
50 cars, a minute in, desk). 76% of the step was one function:
`fromWalker` in `peds.js`, 9.3 ms of 12.2.

- A crossing is WANTED at a curb, and is met by somebody already
  walking near it. A want nobody is near waits up to `WANT_FOR` (90 s)
  and asks again every tick.
- On the bench's downtown that is about 167 wants pending at once,
  against 264 walkers. Each want scanned every walker, working out
  where each one was along their sidewalk.
- That was 44,000 walker poses a tick, to start 5.4 crossings a
  second.

The cost was a PRODUCT, which is why the phone's two savings did not
sum: switching off either the walkers or the crossings removes nearly
all of it.

**The fix keeps the traffic identical, tick for tick.**
- Each walker's pose is computed once a tick, since nothing moves
  inside the function.
- A grid of `WANT_NEAR` cells means a want looks only at the nine
  cells round its curb, in the walkers' own order.
- `strikes` (is a car touching anybody crossing) had the same shape:
  every car's pose again for every person. It now computes each once.

`tools/measure/bench-hash.mjs` fingerprints the bench world over two
minutes at 50 cars and one at 150, and both hashes are unchanged.

**Step at 50 cars: 12.2 ms -> 1.9 ms (6.5x); at 200, 7.1 ms**, where
the cost is now the cars' own decisions (`whatStops`), as it should
be. The pedestrian side is about 1 ms at 200.

##### 1.2.6 LOAD IS NOT PLAY -- 6 October, the phone on `c38ecb9`

**What the phone said:**

- **The pedestrian fix held:** the step at 50 cars went from 17.6 ms to
  5.9; at 150 it is 13.8; the steady cap went from 50 to 150. People
  crossing now save 2.5 ms at 150 and people walking nothing, against
  13.4 and 10.6 before.
- **Both controls work.** Four stalls made, four seen. And a React
  update from the frame loop costs NOTHING on this page on this phone:
  16.7 ms on the frames it lands on against 16.9 for the rest. Recorded,
  not acted on: it cost twelve hitches on `#/iso`'s heavier page, so the
  rule stands.
- **The budget cap read 50**, because steps 100, 150 and 200 had one
  hitch each: 75, 67 and 108 ms frames with our own callback 6-30 ms of
  them and no long task in the gap. So the page got no frames, and it
  was not our code. Every one landed 3.9 to 5.8 s after a step had
  built a new city, and only on steps that had.

**The question that decides the cap: a cost a player meets once, when a
map opens, or in play?** The desk cannot answer for the phone --
node's collector is not Chrome's (`tools/measure/after-build.mjs` shows
large collections round each build and one 5.2 s after) -- so the bench
now answers it on every run:

- **A step that builds a new city gets a LOAD WINDOW** (`LOAD_WINDOW`,
  8 s, a chosen figure past the latest load hitch seen). It settles
  through it before recording a full 8 s of play.
- **Hitches in the window are not discarded.** They are listed as
  load-time hitches, with seconds since the step began, and do not fail
  the play budget.
- **The split ends with a SOAK:** the cap's city, built fresh, then 30
  s of play with construction well behind it. A hitch there is a
  play-time hitch whatever the window says. So is a hitch in any built
  step's 8 s of play.
- **The report gives the cap both ways**, play only and with load-time
  hitches counted, beside the steady-state cap. `verify-bench` plants a
  long frame in a load window, which must be filed as load-time, and
  one in play, which must fail.

Building that check found the cap itself was worded wrong. A hitch
fails a step without ending the ramp, so a later step can pass again,
and "the last step that passed" produced "held at 400, broke at 150".
A cap is now the last step that held BEFORE the first that did not.

**Sight blocking, measured directly** -- not by its switch, because
switching it off changes how the traffic behaves: with sight on, the
desk at 150 cars has 81 people crossing against 71 with it off.
Temporary timers round the sight code alone at 150 cars (desk) gave:

- **The sight code proper was about 0.6 ms of a 5 ms step.** Most of it
  was `phantomHolds`: a driver near their line looks every 3 m along
  every road that crosses theirs for anything a truck might hide. That
  is about 23 calls and 1,470 points a tick, of which 7 were hidden.
- **The rest of the switch's 1 ms is the world being different**, not
  sight being computed.

The fixes:

- each truck's CONE from the driver's eye is computed once per call
  (`sight.js` `conesFrom`/`blockedFrom`), so a point outside every cone
  skips the box test it could only fail. 1.2 million random cases, many
  at box corners, gave 0 differences, and a narrowed cone was caught
  with 83,102;
- the points along each path are fixed for the life of the map, so
  they are computed once, accumulated exactly as the loop counted them;
- an intersection's path list is built once;
- the trucks are found by id rather than by walking the world.

`phantomHolds`: 0.37 -> 0.21 ms. The bench world hashes identically at
50 and 150 cars.

##### 1.2.7 What the green waves shook loose -- 6 October

Retiming the lights put cars in places they had never been at the
moments the checks sample, and two old faults surfaced.

**1. A crash in the default traffic: a lane change into a car
alongside.** `verify-bays`, test map 1 at 300 cars, recorded 180
overlapping car-ticks. One driver crawled toward a red at 3 m/s and
moved left for its turn bay. Its blind-spot check was MISSED (an
observation deficit), with the car behind only 0.8 m back at 8 m/s.
That car drove on past, and 1.2 s later they met.

A missed check is meant to be found out: the driver registers the car
and swings back, and `verify-lanes` holds that it never touches. But a
missed check skipped the WHOLE lag test, including its physical floor
-- whether the car behind can stop behind the changer at all.

The first fix, refusing only a car level with the changer, moved the
crash somewhere else. On test map 1 at 150 cars, a missed change went
in with the car behind 6.2 m back closing at 6 m/s. That car braked as
hard as it could and stopped overlapping, and the swing back touched.

So now a missed check costs the driver the margin their temperament
would have left (`lagOk`), never the floor under it (`lagSurvivable`,
`lanechange.js` `attempt`). It is the same rule as a bold gap: an
observation failure is a car missed, never one that cannot be survived.

With the waves off the same seeds had no crash. These were waiting
for two cars to be put there.

**And the neighbour index went stale after a crash.** The step replaces
a crashed car in `next` in place, and anything the index had already
grouped from that array (`byK`) kept the car as it was before the
crash. For one tick every driver asking the index saw the wreck still
moving (0.91 m/s), while one scanning everybody saw it stopped.
`verify-generate` holds the index to the full scan tick for tick; it
had never seen a crash, so it had never caught this. The cache is now
dropped after each in-place replacement. Through a crash on that seed,
the two stay identical.

**2. The LAND stands above a road at the test map's overpass.
KNOWN, NOT FIXED.** `verify-paint` caught a car on the lower road at the
overpass junction (about 622, 795) 1.77-2.02 m below the grass drawn
round it. `groundFor` (map/load.js) pins a 20 m grid to the average
height of nearby road points, so the embankment's points and the road
beneath share nodes and the land interpolates above the road.

It is not a draw-order fault. Grass is painted before anything with
height and can hide nobody, and the road is drawn over it, so the car
shows. The audit had been folding it into the draw-order count, and
passed until now only because no car happened to stand there. It is
reported on its own line ("KNOWN, the land model"), never counted as
a misdraw.

**The fix belongs in `groundFor`:** never let the land stand above a
non-bridge road it lies beside, while keeping a climbing road's land
rising with it (1.1.5). Then turn the KNOWN line into a check.

##### 1.2.8 Three checks that were passing on luck, and one gap they hid -- 7 October

The lane-change floor moved every world, and the samples under three
checks moved with it. None was a regression; all three had been resting
on a sample too small to bear the claim.

- **`verify-compliance`: the right-on-red rows.** A quiet red is rare, so
  a few dozen occasions carry a bound of 25 points between "alone" and
  "in company"; 100% of 10 against 73% of 15 failed it by two points.
  72 seeds instead of 24 gives 95% of 22 against 79% of 34, and sound
  drivers 0% either way. More road time, not a looser bound.
- **`verify-walkers`: "nobody is struck".** A heedless person -- somebody
  who steps out without looking, a hazard kept on purpose -- is struck
  about once in 540 crossings, measured the same before the green waves
  (549 crossings, 1) and after (538, 1), so 89 crossings failed about one
  run in six. The claim that holds, and that the project's own rule says,
  is that CAREFUL people are never struck by traffic that is watching:
  asserted, sabotaged once, and the heedless strikes reported.
- **`verify-peds`: the ignore-people control.** One four-minute seed is a
  handful of crossings and struck nobody. Four seeds strike ten.

**The gap it exposed, KNOWN AND NOT FIXED: people walk into a standing
wreck.** Once a car has crashed into somebody it stands where it
stopped, in the crosswalk, and the next person to cross walks straight
into it: 14 sampled contacts over four seeds, every one with a car that
had already crashed. `strikes` (peds.js) skips crashed cars, and a
careful person's "keeps watching, lane by lane" loop skips them too. It
only exists after a crash, which is why a control that never crashed
anybody never saw it. The default traffic does not crash into people,
so it is not reached in ordinary play, but it is reachable after a
player strike, and a person walking through a wreck is a state the
screen would draw as a lie (CLAUDE.md item 6). The fix is for people on
foot to treat a standing wreck as an obstacle: wait, or go round.
`verify-peds` reports it on its own line.

##### 1.2.9 THE CAP, ANSWERED -- 8 October, the phone on `673c847`, two runs

**150 cars with everything in is the play cap, and it is not perfectly
clean.** The second run (the first is below) held the budget at every
step to 150 and broke at 200 (p95 25 ms, step p50 19 ms). Its 30 s soak at
150 had TWO play-time frames over the hitch line, 67 and 75 ms, with our
own callback 12 and 28 ms of them and no long task: the page missed
frames it was not busy for. The split rows at 150 show the same, about
one 58-92 ms frame in each 8 s hold, mostly with our callback well under
the frame. So: 150 plays at 60 fps with a visible stutter every 15-30 s,
not of our code's making on most of them; 100 plays clean.

**Where the step goes at 150** (phone, 13.6 ms p50 on the frames that run
one; a third of them): people crossing 3.2 ms, sight 3.6, buses 1.4,
parked cars 1.2, trucks 1.1. Each switch changes the traffic as well as
removing code, so these are upper bounds. Desk, `tools/measure/step-
profile.mjs 150`: 5.5 ms a step, of which the per-car decision is 2.7 and
the people crossing 1.1 -- no single function over a fifth of it. A
cache of the cars crossing each crosswalk (asked several times a tick per
person) left the traffic identical and saved nothing measurable (4.72 ms
a step either way, `tools/measure/step-time.mjs`), and was taken out
again. **There is no hot spot left to cut; the step is spread thin.**

**The levers that remain are structural**, in the order they pay:
1. **The sim in a Web Worker.** A frame at 150 is step (on one frame in
   three) + poses + draw = 13.6 + 1.6 + 4.2 ms, over 16.7 on the frames
   that step. Off the main thread, the frame is poses + draw (about 6 ms)
   every frame and the step has 50 ms per tick on another core: the
   cap moves from the main thread to the sim's own budget, about three
   times what it is. Workers run over plain HTTP. The sim is already
   pure and a world is plain data, so this is plumbing, not a rewrite.
2. **Cheap far traffic** (1.2.2, and the 8 km^2 answer): full decisions
   near the player only.

**THE SIM IN A WEB WORKER -- BUILT, 13 October** (`sim/remote.js`,
`sim/sim.worker.js`, `sim/scene.js`). Lever 1 above. Both sides build the
same world from the same arguments (`worldFor`, moved out of
`MapRoad.jsx`'s `sceneFor` so a worker can import it; the bench's from
`iso/benchworld.js`), so the course -- 7 MB of graph with functions in it
-- never crosses. Each tick the page steps the player against the world
it has, as it always did, and sends them; the worker writes them in,
steps, judges their contact (`playerContact`, also moved, one copy) and
returns only what changed. One tick in flight at most, owed time held to
two ticks, so an overloaded worker slows the world rather than piling up
-- and the order of events is the in-thread loop's: `verify-worker` holds
the page's copy to the in-thread world tick for tick for 90 s at full
throttle, contact included, and the bench's worker to the bench's world
under its switches (sabotaged: the lights left out of what crosses, six
failures). What crosses at 150 cars in the city: 229 KB a tick, 1.2-1.9
ms to clone on the desk. The BUILT worker bundle was run in a Node worker
thread shimmed as a browser worker (`tools/measure/worker-bundle.cjs`):
it builds, answers, and steps, 7 ms a step on the desk. Where no worker
can be made -- SSR, a browser without module workers -- or it fails, the
page steps in-thread from its own copy, exactly as before.

**TO JUDGE, ON THE PHONE: `#/bench`, twice -- "Sim in a worker" (the
default) and "Sim in the page".** The report's first lines say which. In
worker mode the `step` column is what the sim still costs the page --
laying the worker's answer over its copy -- and the cap should rise; by
how much is the question, since the clone is real work on a phone too.

**The instrument lied once, and is fixed.** In the first run the phone's
screen went off during the split: the "no walkers" step saw a 1.6 s gap
and the soak a 38 s one, both flagged hidden in the stall table -- and
the report still printed the soak as "0 hitches, worst 0". A hidden page
gets no frames, so a step it was hidden in measured the gap. Now a step
the page goes hidden in starts its clock again (perf.js, up to
`HIDDEN_RESTARTS` = 3) and past that is reported INVALID and counted for
no cap. `verify-perf` 3b holds both; with the restart removed it fails.

##### 1.2.10 A car across your path is in front of you, committed or not -- 8 October

**`673c847` shipped with a check failing, and the report said the suite
was green.** `verify-trucks` allows trucks that hide things at most one
more vehicle crash than see-through trucks in five minutes of the city at
15% trucks; it read 1 against 0 before the new speed limit past the box,
and 2 against 0 after. The suite run that cleared the commit had written
49 lines where 55 were due -- six checks never reported -- and it was read
as green without counting them. Now a run is counted: every check's line
and DONE, or it did not finish.

**What the two crashes were.**
- **One was not about sight at all.** On the arterial at a T, a bold driver
  (caution 0.28) turning left took a one-second gap in front of an
  oncoming car, in full view of each other for four seconds. The
  oncoming car braked, could not stop short of its line, rolled over it at
  20 km/h -- and past the line counted as committed, so it let go of the
  brake and drove into the turner still crossing its lane.
  The rule that was missing is physical, not
  legal: **right of way says who goes first; it never lets a car drive
  into one that is physically in its way.** In `whatStops`, once another
  car is inside the region where our paths overlap and until it is clear
  of it, the point where I would first touch it is a stopped car to stop
  short of. Only the car already inside the region holds the other, so
  two cars cannot hold each other there.
- **The other is the allowance the check names**: a car turning right
  into a lane while the car it merged in front of was hidden by a truck
  until two seconds before. It was the one crash before the speed limit
  change too.

After: 1 against 0, the full suite green (54 of 54, counted), no crash in
five minutes on the signal five-way, crossroads, test map 1 at 150 or
the city at 300 (`tools/measure/default-crashes.mjs 5`), and of the
world-hash maps only the city moved in two minutes -- the rule fires
rarely, where it matters.

##### 1.2.11 THE WORKER WAS THE WHOLE JITTER STORY -- 15 October

The maintainer: "still seeing jitter. the fps is solid but it's like the
simulation itself is slowing down." Three readings from his phone, test map
1, the sim in its worker:

| | A | B | C |
|---|---|---|---|
| cars | 164 | 170 | 156 |
| fps / p95 frame | 39 / 105.6 ms | 33 / 108.4 | 33 / 108.2 |
| **world, against real time** | **0.36x** | **0.25x** | **0.27x** |
| tick p50/p95/max | 138/155/161 ms | 205/211/214 | 185/192/198 |
| worker step p50/p95 | 20.8/27.1 ms | 21.2/25.2 | 17.1/18.8 |
| round trip | 136/155 ms | 204/210 | 184/192 |
| = wait | 0.4 | 0.6 | 0.4 |
| + answer built | 0.7 | 0.7 | 0.7 |
| + **back** | **110/131** | **179/185** | **165/174** |
| (of which reading the message) | 65 | -- | 104 |
| our own frame | 3.6/5.8 ms | 4.4/6.1 | 4.4/6.2 |
| browser long tasks | 2,485 ms in 5 s | 2,717 | 2,782 |

The step was 17-21 ms and steady; the way back 110-179 ms, five to nine
times the simulation it carried, most of it the browser turning each
answer back into objects; our own frame work 4 ms, which is why the frame
counter looked fine. The way back scales with the cars while the step
barely does -- transfer volume, not compute. **The worker cost six to nine
times what it saved.**

**Settled by the maintainer, 15 October, with the worker off ("set to
page"): it runs much better.** PAGE MODE IS THE DEFAULT (`simWorker`
setting, `#/map`'s "Sim: page"). The worker returns only if its way back
is rebuilt (the drawn state packed into two transferred buffers) and the
way back is then a small fraction of the step; otherwise it is deleted.

**The next shape, the opposite one** (the maintainer, same day): on `#/map`
and the endless highway it ran well to about 200 cars, then "sim stayed
steady while fps varied depending on the scene" -- the simulation keeping
pace, the cost moved to the renderer and scaling with what is on screen.
The readout now splits the frame by part, mean/p95 each -- sim, poses,
draw (its list, sort, paint and overlays), HUD -- and says what was drawn
against what exists (cars, road pieces, ground, buildings), so a scene
that is expensive says what is in it.

##### 1.2.12 Where a frame goes past 200 cars, measured on the desk -- 15 October

Four questions from the "fps varied depending on the scene" report, answered
by `tools/measure/draw-scenes.mjs` (the chase camera put on every car in
turn, phone-sized canvas, canvas calls counted) and `step-ramp.mjs`.

1. **The depth sort is not it.** 1-3% of the draw, and it sorts only what
   survived the cull: 140-260 items, never the world.
2. **The cull is real.** Ground drawn 64-89 of 5,340 cells (test map 1)
   and of 33,150 (the highway); road pieces 53-120; canvas calls are made
   only for what survives. **But the cull itself walks everything**: on the
   highway the list (cull and items) is 1.07 of a 1.3 ms draw on the desk,
   flat at every fleet, almost all of it testing 33,150 ground cells to
   find ~85. Constant, not scene-dependent -- and several ms a frame on
   the phone for nothing. A spatial index (cells and road pieces bucketed by
   area) makes it the size of the view.
3. **What follows the scene is CANVAS CALLS, and they follow the cars in
   view.** On test map 1 the draw's time correlates 0.77 with calls and
   calls 0.90 with cars in view: about 90 calls a car (two boxes' faces,
   their lamps) -- 3,900 at the median at 100 cars, 9,000 at the 95th
   percentile at 400. Desk script for the whole draw stays ~0.7 ms; the
   phone pays per call in script and in raster. That is "varies with the
   scene": a view with forty cars in it costs twice one with twelve.
4. **No cliff at 200 -- a slope, and a superlinear one, in the SIM STEP.**
   Test map 1, desk ms: 4.5 at 100 cars, 9.7 at 150, 16.3 at 200, 26.0 at
   250, 37.9 at 300, 64.1 at 400 -- the cost per car itself rising from
   45 to 160 us as the map fills (queues: each car has more neighbours to
   read). On the phone (x1.6) a step is ~26 ms at 200 cars: with the sim on
   the page a frame that steps then spans two vsyncs and more, which is the
   fps falling while the sim's own pace holds. The highway: 2.2 ms at 100,
   7.7 at 200, 15.4 at 300.

So past 200 cars the frame is two costs, neither a fast path falling off:
the step's superlinear growth, landing every third frame, and the draw's
calls per car in view. The fixes, in the order they pay: the cars drawn
from a cache (one image per car rather than ninety calls), the ground and
road cull through a spatial index, and the step's per-car growth profiled
where the neighbour reads go.

##### 1.2.13 The step made cheaper, the world unchanged -- 16 October

The step's cost per car rose as a map filled -- test map 1, 45 us a car at
100 cars, 160 at 400 -- and with the sim on the page that is half of a
frame. Profiled (`node --no-turbo-inlining --cpu-prof`, inlining off so
time lands on the function that spends it) rather than guessed: the first
guess, an index of who can matter to a driver, was right in shape and cost
more than it saved until built on integers, and the hottest line in the
step turned out to be one nobody would have named -- a conflict lookup that
built a string from two long route ids for every pair of cars.

1. **`conflictOf(layout, a, b)`**: the conflict table read by route then
   route, built once per route -- no string per pair. Ten call sites.
2. **The relevance index** (`relevanceOf`/`relevantTo`): each tick the list a
   driver reads is bucketed by lane, by approach, by lane change, by exit
   and by route, as integer positions; a driver visits only the cars that
   can satisfy one of `whatStops`'s own branches, in the list's order (a
   tie in `consider` goes to the first). The whole neighbourhood is built
   only where it is read.
3. **Near a truck**, only the cars a truck can hide (another approach at my
   intersection) and the relevant ones are read; the rest would be kept
   unchanged and dropped as irrelevant.
4. **`contactsIn` through a 16 m grid**: only neighbouring cars are box-
   tested, and any contacts are put back in the old order.

**THE WORLD IS IDENTICAL**: `tools/measure/world-hash.mjs` on six runs --
test map 1, the highway and the city, 150-300 cars, with and without
trucks -- byte for byte before and after every one of the four changes; and
the 40 checks that can see `crossing.js` pass. Desk ms, a step, idle:

| | before | after |
|---|---|---|
| test map 1, 300 cars | 37.9 | 22.9 (-40%) |
| test map 1, 400 cars | 64.1 | 39.1 (-39%) |
| highway, 300 cars | 15.5 | 10.5 (-32%) |
| city, 299 cars | 8.7 | 7.2 (-17%) |

**What is left**, in the next profile: the truck sight lines (`hiddenFrom`,
about 10%), the driver's memory rebuilt each tick, and the honest cost of a
queue -- every car on an approach weighs every car ahead of it on that
approach, because the leader is the most constraining car rather than the
nearest, and narrowing that would change who follows whom. Occasional
spikes to 40-65 ms remain on every map and are the next thing to find.

##### 1.2.14 What the player meets -- 20 October

The maintainer: *"performance is getting better but my issue is how we are
measuring performance compared to what the player will actually encounter
gameplay-wise. we spend a lot to simulate traffic the user will never
encounter, can we simulate the simulation and bring more traffic closer to
the user."* Every number kept so far -- cars, step ms, sim against real
time -- is the simulation's WORKLOAD. A world of 200 cars where the player
meets one a minute passed every check we own: section 10's pattern at the
largest scale yet.

**The instrument** (`src/sim/encounters.js`; on `#/map`'s readout as "you
met ... cars/min"; headless in `tools/measure/encounters.mjs` with the good
driver on trips): distinct cars within 30 m per minute; share of time
following a car (the player's own leader from `whatStops`, within 2.5 s);
share of time followed (a moving car behind in the player's lane, within
its 2.5 s); gaps judged per minute (standing at a line while a car on a
conflicting route comes on, once per approach).

**The current build, from the player's seat** (5 minutes driven each):

| map | cars | lane-km | met /min | following | followed | gaps /min |
|---|---|---|---|---|---|---|
| test map 1 | 120 | 29 | 18 | 10% | 36% | 0.6 |
| test map 1 | 200 | 29 | 26 | 4% | 56% | 0.8 |
| city | 200 | 71 | 6.6 | 5% | 10% | 0.4 |
| city | 300 | 71 | 9.6 | 8% | 12% | 0.6 |
| highway | 120 | 30 | 3.8 | 29% | 66% | -- |
| highway | 200 | 30 | 5.2 | 26% | 87% | -- |
| highway | 300 | 30 | 8.4 | 28% | 66% | -- |

Read with care: (1) the highway has no lines, so its decisions are merges,
which "gaps judged" does not count yet; (2) "followed" is inflated by the
measuring driver, who cruises at 0.95 of the limit while the traffic drives
at it; (3) the harness first measured a player parked at the map's edge
(nowhere reachable from a road leading off the map) and read 0 gaps -- it
now starts a new trip from a dead end. The finding stands either way: on
the city a player meets under ten cars a minute among three hundred.

**Next** (agreed order): density shaping -- the same budget in a ring
round the player, spawned ahead and retired behind, biased to their route
(on the loop, never stripping the road they will re-enter) -- measured by
this instrument; then simulation level of detail, with the promotion check
and the determinism ruling written into DECISIONS.md before any code.

##### 1.2.15 A highway to swim in -- 20 October

The maintainer: *"what id like to see from this is a highway the player can
endlessly 'swim' in with traffic behaving like traffic would."* Swimming is
differential motion -- passing and being passed -- so the encounter
instrument now counts it: **overtook** and **overtaken** per minute (a car
beside the player, a lane's half-width across, going from ahead to behind or
the reverse) and **merges judged** (into another lane, or onto a highway from
a slip road, with a car in that lane within 30 m).

**THE DIAGNOSIS** (`tools/measure/highway-swim.mjs`, 120-300 cars). The
expectation was a narrow speed spread and no overtaking. Measured, neither:
desired speed 94-96 km/h at a spread of +/- 21 (twice a real motorway's
10-12), surviving the following model (actual +/- 21-24); overtaking lane
changes 0.3-0.4 a car-minute; lanes sorted, about 104 / 97 / 70 km/h left to
curb. The "sandwiched" player numbers were mostly the MEASURING DRIVER, which
kept right and never overtook. Four harness faults were found on the way and
fixed in `tools/lib/good-driver.mjs` -- a throttle capped at a slider position
that held 80 km/h, the approach road's limit read for a kilometre of highway,
no overtaking, a parked player counted -- each one a reminder that the
instrument is only as honest as what it is fed.

**WHAT WAS REAL, AND FIXED:**
1. **On a highway the speed spread is the road's** (`traffic.js`
   `wantedOnHighway`): limit x (1.05 - 0.17 (caution - 1)) -- a typical
   driver just over the limit, a real spread, a floor near 0.88 -- where the
   street formula's 0.65 floor made the curb lane a lawful driver is kept in
   run at 70 km/h on a 100 road. The road's kind is read where the limit is
   (`graph.js` `kindAt`), at all four places a car's wanted speed is set.
   Maps with no highway hash identically to before. After: curb lane 78-82,
   middle 101-103, left 107-109 km/h. HIGHWAY_CENTRE and HIGHWAY_SLOPE are
   flagged for the maintainer.
2. **The limit in force is one function** (`graph.js` `limitAt`): past the
   box's far edge, the road turned onto. The fare meter, the voice's speed
   events and the HUD's limit sign all read the APPROACH road's limit for
   the whole exit stretch -- turning onto a faster road and driving at it,
   the meter called it speeding and the sign showed the old number.

**THE PLAYER, at the limit on the highway, after:** overtakes 4-6 cars a
minute (1-2 before), meets 5-10, merges judged 0.2-0.7. But **following
still 26-53%**, rising with density, and the reason is structural:

**HALF OF EVERY MULTI-LANE ROAD ALLOWS NO LANE CHANGE.** A path runs from an
intersection's approach, through the box, along the exit road to the seam
where the next intersection takes over. Lane changes -- the traffic's
(`lanechange.js`, room before the next line) and the player's (`drive.js`,
"only before the line") -- exist only on the approach. Measured: 50% of the
highway's multi-lane length (12.7 of 25.3 lane-km), 51% of the city's, 51% of
test map 1's. On those stretches nobody can overtake, and a player who steers
across a line moves the car but stays in the old lane to everybody else.
**Lane changes on the exit stretch -- BUILT, 20 October** (`lanechange.js`
`exitStep`; `drive.js` for the player). The lane there is the path's `to`
leg; a change starts only straightened out and a lane across (within 5
degrees and 0.6 m of a lane's width -- `besideOn`, the nearest point on the
target lane, since on a bend equal distance remaining is not side by side),
never with the seam too near to finish, and for the traffic only into a path
from the SAME road making the SAME movement -- a route past the box also
says how the car got there, and the exam reads a candidate's turn from it.

What the first version got wrong, all found by the suite (eleven checks red,
then five, then none): an approach-only rule re-picked a changed car's
route and kept its place, so a car 192 m along an 83 m path was handed over
the seam -- a 226 m jump into a crash; a truck that changed lane was still
held in its old APPROACH lane (`fromLeg`), braked to a stop for a car waiting
at a red twenty metres back, and the time-driven blend pivoted its 9 m body
over the centre line into it; `null === null` made two exit changers on one
road, going opposite ways, share a lane, which the neighbour index (rightly)
never offered -- caught as the index and no-index worlds diverging; and a
right-turner moved into a lane no right lands in became a car that had gone
straight. Checks restated, each with its reason in the check: verify-lanes
(an exit change finishes before the seam -- sabotaged, 86 carried over),
verify-drive (the lane a turn puts you in is judged leaving the box),
verify-graph (the partition per car, not per road mean -- sabotaged),
verify-bays, verify-waves (no harm within two standard errors of its own
sample; a bad wave under actuation is invisible to that claim and is caught
by the others -- measured by sabotage).

**Measured, main against this build, same seeds** (`highway-swim.mjs`, the
loop, 3 minutes after 3 of warm-up; `encounters.mjs`, the overtaking good
driver, one 5-minute drive per row):

| cars | overtaking changes /car-min | passes /car-min | player overtook /min | overtaken /min | met /min | following |
|---|---|---|---|---|---|---|
| 120 | 0.33 -> 0.66 | 0.26 -> 0.76 | 2.4 -> 3.6 | 0.8 -> 0.8 | 3.8 -> 3.6 | 44% -> 30% |
| 200 | 0.43 -> 0.68 | 0.40 -> 0.98 | 3.6 -> 3.6 | 1.6 -> 0.8 | 6.4 -> 5.0 | 45% -> 19% |
| 300 | 0.35 -> 0.80 | 0.50 -> 1.05 | 4.0 -> 4.2 | 2.2 -> 2.0 | 8.4 -> 7.2 | 42% -> 54% |

The traffic swims two to three times as much. The player's columns are one
drive each and do not move together (following fell at 120 and 200 and rose
at 300), so they say only that the player is not worse off; a player-side
claim needs several drives per row. Being OVERTAKEN did not rise: the
measuring driver holds the limit, and the traffic's mean is near it.

##### 1.2.16 Acceleration lanes -- 21 October

The maintainer, driving 9c5c947: *"the slip road makes it hard to judge,
most traffic seems to be queued to enter the highway. can we add an
acceleration lane rather than just a yield sign?"*

**BUILT** (`src/map/accel.js`; `graph.js`, `lanechange.js` `mergePlan`,
`courtesy.js`; `tools/verify-merge.mjs`). A road end may carry `accel: {
start: { from, length } }`: a lane beside the curb lane for the traffic
leaving that start, fed only by road `from`, open for `length`, closing
over the bays' taper, then lying on the curb lane. The other half of
1.1.15 (a lane count that changes along a road). **Both entries exist and
the map says which**: the loop's four entrances have lanes; a slip road
without one is a yield sign as before, which is still right on smaller
roads.

**The merge is the moving gap judgement, not the stop-line one.**
`gapFor` already judged a gap alongside at speed; what it lacked was the
closing speed in the COMFORTABLE gap (it was only in the survival floor),
so a joiner at 50 called a gap 45 m ahead of a car doing 100 comfortable.
It now adds the room the closing speed takes to shed: ahead by the
driver's own braking, behind by the follower's braking PLUS the joiner's
remaining acceleration (they close from both ends -- by braking alone it
throttled every entrance, worse than the yield signs). One rule, for every
lane change. **Speed matching is knowledge**: a driver who knows what the
lane is for (`accel-lane`, difficulty 0.20, flagged) waits until within a
tenth of the traffic's speed (`MATCH`, flagged) unless the lane is running
out; one who does not moves over at whatever speed. **The lane's end**:
nobody begins a change they cannot finish before the taper; a driver with
no gap by the point a comfortable stop must begin stops short of it and
goes from rest when a gap comes. Forcing in is the bold tail taking less
than comfortable (the floor holds); a hard shoulder is not modelled.
**Courtesy reaches the merge**: an ask is anybody's now -- the player's,
on an approach or past the box, and each joining car's while it is trying
to move over -- and goes to the one driver whose space it needs.

**Found and fixed on the way, each a real bug beyond the merge:**
- a blend that ran on the clock slid a stopped car sideways and swung its
  heading (yesterday's pivoting truck, and a merger struck from the side):
  below 3 m/s the blend runs at the car's share;
- a change begun with the car ahead in its own lane too close left it
  stopped across the line -- two cars waiting on each other for good;
- `exitNeighbours` ignored traffic short of its line, invisible behind a
  merger on a highway node (fifteen crashes at 300 cars);
- distance remaining disagrees ACROSS lanes on a bend (5.7 m on the loop),
  so cross-lane comparisons past the box now use the road's centreline
  (`exitAlong`);
- a path whose arc lands before its exit lane begins read every exit
  position 6.4 m out against its own lane;
- routing from an acceleration lane reached one destination in sixteen (it
  has no join; it carries on as the lane beside).
And from the full suite on this build (four checks red, then green):
- a merge aborted near the lane's end put the car back in its ending
  lane, across the curb lane and unable to finish going back -- the
  closed loop came to a standstill; no swinging back into a lane that is
  ending, and none once committed;
- a changer was held to its old lane until the blend was over, so one 92%
  across waited for good behind a stopped car it could no longer touch:
  between ordinary lanes it now leaves the old lane when the bodies cannot
  meet (a lane, less the half-widths and both cars' weave room); next to a
  turn bay or an acceleration lane, whose tapers bring lanes closer than
  a lane apart, it stays held as before;
- verify-signal counted the braking a STANDING car is asked for (one
  left-turner, 0.2 m inside its standstill gap, 518 of 626 "harsh"
  car-ticks; the moving count 108 against 110 before) and no longer caught
  the non-sticky amber it was written for; it counts moving cars and asks
  the property directly;
- verify-courtesy and verify-voice read the player's courtesy only, since
  the traffic now offers joining cars gaps too.
The test map: straights 3.3 km (10.4 km a lap), entrances on the
straights (two on the curves conflicted with the through lane), lanes
350 m (flagged; the derived default assumes the ramp's 80 km/h, but cars
leave its curve at about 50).

**Measured on the shipped build 30f9ce2** (22 October; the figures first
written here predated the loop fixes and the 5.7 m cross-lane error and are
withdrawn). Entry (`tools/measure/entry.mjs`, same map, code and seeds,
mean of three seeds, four minutes):

| cars | entry | on the highway | standing to enter | crashes |
|---|---|---|---|---|
| 60 | yield / lane | 54 / 52 | 108 / 129 car-s | 0 / 0 |
| 150 | yield / lane | 131 / 126 | 730 / 1367 car-s | 0 / 0 |
| 300 | yield / lane | 180 / 224 | 16365 / 10111 car-s | 0 / 0 |

The lane helps where the queue was -- 24% more of the world on the highway
at 300 -- and costs at 150, where joiners who find no gap by the taper stand
there: they never adjust their speed to meet a gap (IN FLIGHT item 5).
The player (`encounters.mjs`, overtaking driver at the limit, mean of
three seeds, five minutes each; at 120 and 200 the seeds spread by a factor
of two, at 300 within 10%): met 1.7 / 4.9 / 12.1 cars a minute,
overtook 1.3 / 4.1 / 10.3, overtaken 0.2 / 0.8 / 1.6, at 120 / 200 / 300
cars.

**THE CONTROLS: ADJUSTABLE WHILE DRIVING** (the maintainer: "refinement to
the controls (I'm not sure exactly what this means yet)"). Control feel
cannot be specified from a desk or measured headlessly; it is the one thing
only his hands can judge. So no speculative change: when the swimmable
highway ships, the build carries a debug panel on #/map, changeable
mid-drive, for what is most likely to be wrong -- steering rate, how hard the
lane assist pulls, the throttle and brake response curve, how quickly the car
settles after a lane change. He drives it at low, medium and high density,
says which positions felt right, and those positions become the constants.

##### 1.2.17 Six frames a second at 259 cars: the step, the spiral, and LOD -- 22 October

**MEASUREMENTS OF A DEFECT (marked 22 October, item 15).** Every 259-280-car figure in this section was taken with the old glance in play -- blind, on a fixed clock -- which crashed queues and gridlocked the world, and gridlock multiplies cars per neighbourhood and with them the step. They describe the defect, not the engine. Compare nothing new against them; the baselines are being re-measured with look-away off and as rebuilt (DECISIONS 10.19).

The maintainer's readout from the endless highway on 86b7cb9, page mode:
259 cars, 11 in view, 6 fps, frame 195.6 ms = sim 132 + poses 1.9 + draw
3.6 + hud 0.8, step 43.6 ms (page), "sim 0.99x real time", long tasks 4485
ms in 5 s, 2 crashes, 0 gaps judged in 2.5 minutes. The draw is 3.6 ms and
culling is excellent; the step is the bill.

**1. Is the step linear in the cars? Not on this map, and not because of
one term.** `tools/measure/step-ramp.mjs`, desk:

| | 60 | 150 | 260 | 400 cars |
|---|---|---|---|---|
| endless highway, us a car | 17 | 24 | 36 | 49 |
| the city (200 and 397 cars) | | | 24 | 29 |

The city is close to linear; the loop is not, and the loop is not
congested at 300 (1% of cars under 3 m/s, 84 km/h mean). The term is
LOCAL DENSITY: the loop has eight long nodes, so the cars per node grow
with the fleet and so does each car's neighbour work -- `whatStops` 46% of
a step at 100 cars, 57% at 300 (profiled without inlining,
`tools/measure/step-profile-map.mjs`; with inlining the sampler put the
time in the wrong functions, and two fixes aimed by it moved nothing).
Two exact prunes were built and measured -- cars behind me in my lane, and
cars ahead that cannot out-press the nearest (wantedGap of a stopped car
over their gap, against the nearest's press) -- with world hashes
identical on four maps; visits per car fell from 37 to 15 at 300 cars and
the step did not move, because walking the lane buckets to prune them cost
what the visits saved. Reverted. What makes it linear is ONE sorted
neighbour index per lane -- DECISIONS 10.10's "one neighbour search" -- and
even linear, 259 cars at the city's rate is ~6 ms on the desk and ~29 ms
on the phone (its factor here is ~4.6: 43.6 against 9.5). It does not
rescue this screen alone.

**2. Was the loop stepping to catch up? Yes: a spiral.** The page stepped
WHILE a tick was owed, with the frame's delta capped at 0.25 s: a slow step
made a slow frame, which owed more ticks. `tools/measure/page-loop.mjs`,
replaying the loop with the phone's step (x4.6) and its ~60 ms of frame
besides the sim, reproduces the readout: **4.9 fps, four steps a frame,
the world 0.99x** (the phone: 6 fps, 0.99x). Now a frame steps once, a
second time only if the first cost under 8 ms (PAGE_BUDGET, flagged), at
most three, and drops what is still owed to a tick (`sim/pace.js`
`pageMore`/`pageLeft`; #/map and #/exam). Same replay: **9.8 fps, one step
a frame, the world 0.49x** -- the screen keeps its frames and the world
slows, which the readout says. That is the honest trade at this cost: 44
ms of step per 50 ms tick and 60 ms of frame besides cannot all fit in
real time. verify-worker section 6, with the old pacing as the control and
sabotaged.

**The 60 ms outside the sim is not explained.** 195.6 ms of frame against
138 of named parts. With one step a frame the next readout separates it:
if it stays, it is not the steps (GC from them would shrink with them).

**RESOLVED ON THE PHONE (the maintainer, c4cd824, 160 cars, page mode):**
55 fps with the world at 1.00x real time -- both budgets met at once, a
first; long tasks 0 ms in 5 s, against 4,485 on the build before; step 16.6
ms p50.

**THE 57 MS, CLOSED -- it was the spiral, read through a mismatched
readout.** The frame line printed the frame's MEDIAN (195.6) beside the
MEANS of its parts (sim 132 + poses + draw + hud = 138): two different
statistics, so the 57 ms was never time anybody spent outside the parts. In
the spiral the median frame sat on four steps while the mean held about
three. Reproduced with no hidden overhead at all -- page-loop.mjs, the
frame's own work at the phone's ~6 ms and the step scaled to the phone's
~50 ms: the old pacing gives 7.0 fps, 2-5 steps a frame, the world 0.98x
(the phone read 6 fps, 0.99x); the step budget at the same cost, 17.5 fps,
one step a frame. The readout now prints the frame's mean, p95 and median,
so the frame and its parts are the same statistic. (Jay's second reading,
"frame 5.6 = sim 6.4 + ...", was the same mismatch the other way: a median
frame without a step beside a mean that includes them.)

**[VOID -- 1.2.18: built on phone readings taken with the blind glance in play.]** **THE CEILING, with the step budget (the maintainer's question: where does
the world fall below 0.95x real time?).** page-loop.mjs on the endless
highway, today's code (the neighbour index in), the phone's ~5 ms of frame
work, the step at the phone's factor -- 4.2 from his own 16.6 ms at 160
cars against the desk's ~4 ms on the same code, and 4.6 as the bracket:

| cars | 160 | 200 | 260 | 320 | 340 | 360 | 380 | 400 |
|---|---|---|---|---|---|---|---|---|
| world x real (4.2 / 4.6) | 1.00 | 1.00 | 1.00 | 0.99 / 0.97 | 0.98 / 0.95 | 0.94 / 0.90 | 0.89 / 0.80 | 0.80 / 0.73 |
| fps (4.2 / 4.6) | 44 / 40 | 39 | 37 / 33 | 20 | 20 / 19 | 19 / 18 | 18 / 16 | 16 / 15 |

**The world keeps pace to about 340 cars.** But there is a second, earlier
edge for SMOOTHNESS: once a step and the frame's own work pass two vsyncs
(about 28 ms of step), every frame with a step takes three, and the rate
halves -- about 35 fps at 260, about 20 at 320. So 160 was never the
ceiling; it was the spiral. Around 260-280 is smooth today, ~340 keeps real
time, and the phone at 250-260 is the arbiter (asked for).

**And the world is empty at any of these counts.** 4 in view of 160, 5.5
met a minute, 0 gaps judged in 90 s for the third report running;
following 51.7% / followed 13.5% -- he catches people, nobody catches him:
a density signature. Performance has stopped being the constraint.

**[VOID -- 1.2.18: the 280-car reading this rests on, and the phone factor and allocation conclusions drawn from it, were the blind glance's gridlock.]** **THE CEILING TABLE ABOVE IS DISCARDED, not adjusted (the maintainer's 280-car
drive, adc1f8e): it predicted 260 at ~35 fps and real time; at 280 the phone
ran 17 fps at 0.82x, its step 51.9 ms against a 50 ms tick. WHY THE METHOD
FAILED: desk step x a phone factor assumed the factor constant, and it is
not -- 4.2x at 160 cars, 4.6x at 259, ~6.5x at 280. A step at 280 cars
ALLOCATES about 8 MB on the desk (tools/measure/step-alloc.mjs; 10.9 MB
before the neighbour index), some 170 MB a second at 20 Hz: the world is
immutable, each car carries ~50 fields, and a tick copies each of them
several times. The desk's collector absorbs that; the phone's long tasks
(4.3 s of every 5) say its does not. Compute scales with the cars; garbage
collection scales with what is allocated and how much is alive, worse than
linearly on a phone -- so desk-times-a-factor is structurally wrong for this
question, not merely imprecise. The readout now shows the heap (at least the
garbage made a second, full collections, heap size) so the next drive says
so on the phone itself rather than by desk inference.

**[VOID -- 1.2.18: the phone figure compared here was the gridlock.]** **AND THE NEIGHBOUR INDEX, on the phone:** the desk step fell 22% and the
allocation 23% with it, but the phone at 280 (51.9 ms) is about where the
pre-index phone curve extrapolates (~49 ms from 43.6 at 259). Most of the
phone's step is not the lookups the index removed; on the desk's evidence
it is the per-car allocation in the step's own closure (2.8 MB a step,
untouched by the index). The rest of the index -- lane changing's and
courtesy's lookups -- is therefore not the lever; stepping fewer cars in
full is.

**3. LOD, and placement with it.** Required, not an optimisation: 259
simulated in full while 11 are in view. DECISIONS 10.9 is the ruling; 10.10
says LOD promotion CHOOSES NOTHING and reads the gap predicate as a
VALIDATOR. So the order is: (a) the one neighbour search and gap predicate
-- 10.10's second step, pulled forward: it is both the linear step on long
nodes (above) and LOD's validator; (b) LOD's promotion check, written
before the feature (10.9); (c) LOD, coarse and dormant tiers on the tick;
(d) placement for the player and density shaping -- which is out-of-sight
spawning, the dormant tier's other face. Placement's FIRST half moves ahead
of LOD; its second half lands with or after it.

**THE NEIGHBOUR INDEX, FIRST STEP -- BUILT the same day** (crossing.js
`takePlain`, `relevanceOf`). A PLAIN driver -- not the player, not passing,
not changing lane, not a bus -- reads its own lane through position-sorted
arrays of the plain cars: its approach by distance along it, its exit by
distance left, its two lanes across the seam by distance along the lane.
It walks ahead, computes each reachable car's exact press (wantedGap / gap,
arithmetic only), stops where nobody further can press harder than the
hardest so far (wantedGap behind a STANDING car over the least gap at that
distance), and hands whatStops only the hardest -- ties too, since it keeps
the first of equals in list order. Everything else is read through buckets
as before. Exact: world hashes identical on all seven test maps, with
perception on and off, trucks and buses (a gate that a deliberately wrong
cut changes on all seven); verify-generate section 11 now holds the endless
highway at 300 cars, warmed, identical with and without the index.

| endless highway, desk, p50 | 60 | 150 | 260 | 400 cars |
|---|---|---|---|---|
| before | 1.0 | 3.7 | 9.4 | 19.5 ms |
| index | 1.0 | 3.2 | 7.3 | 13.6 ms |

-22% at 260, -30% at 400; the city unchanged (near linear already). Visits
per car at 300: 37 -> 12.8. Two costs found and paid on the way: sorting
every bucket of every carried-forward picture (perception on: dozens of
lists a tick) made the city 23% dearer, so the index is built for the
present world only and a picture is read through the buckets -- leaving
+5% on the city with perception on (off by default in the game). What is
left of the superlinearity: cars mid-change still read their lanes in full
(8% of askers at 300, ~45 cars each), and denser traffic genuinely puts
more cars within reach. Next steps of 10.10's one search: the lane change's
own scans (exitNeighbours, gapFor) and courtesy's onto the same arrays.

**THE OPEN HIGHWAY WOULD NOT HELP THE STEP.** Asked whether its shorter
segments would cut the neighbour work: it has none -- a node is where roads
meet, so its 7 nodes have a median stretch of 2,250 m against the loop's
1,760, and traffic entering at one end and up the ramps puts 141 cars on
one node at 300 (the loop's worst: 57). Step at 300 cars, both warmed, same
code: open highway 11.5 ms, loop 9.7. Its case is the experience (the
NASCAR problem), not the cost; LOD is what serves both.

**The crashes -- CORRECTED.** This read "both involved the player", from
40 minutes of traffic alone without one. Wrong: the maintainer says they
were off screen and "the first one was almost immediate" -- traffic into
traffic, at the START. Forty minutes of steady state measured the wrong
window, as standing time did (DECISIONS 10.4). Cold starts, measured
(`tools/measure/cold-start.mjs`, the world as #/map builds it, the player
placed at the section start and stepped as the screen steps them): 0
crashes in the first minute over ten seeds at 259 cars, player standing or
absent; 0 in the first 30 s over forty more; 0 with the dial turned from
the map's 140 to 260 five seconds in; with drivers looking away, 1 in ten
minutes, at 52 s. NOT REPRODUCED. So the readout now logs each crash as it
is noticed: seconds into the drive, whether it was the player's, how far
from them, whether drivers look away, and the seed -- "2 crashes (0 with
you; at 4 s 230 m off, 37 s 610 m off; look-away off; seed 1)". Treated as
the fourth recurrence of placing a car into traffic until it is shown to
be something else. The readout now says how many were with the player
("2 crashes (0 with you)" would be traffic colliding near him -- a bug to
hunt).

**Noted, not acted on**: 0 gaps judged in 2.5 minutes while meeting 9.9
cars a minute -- the highway gives the player no decisions even at this
density; and following 42% / followed 37% at 9.9 met a minute is the
lattice signature again (SIMULATOR 1.2.15).


##### 1.2.18 The clean baseline, and what it voids -- 22 October

**THE MAINTAINER'S PHONE, THE ENDLESS HIGHWAY AT 280 CARS, LOOK-AWAY OFF**
(the build before 3e77206, on which look-away was off by default) -- THE
BASELINE every performance number is measured against from now on:

    280 cars on the map · 3 in view · 37 fps · p95 41.7ms
    sim 1.00x real time · tick p50/p95/max 50/57.5/69.2 · step p50/p95 24.6/30 ms (page)
    frame mean/p95 18.9/39.3 (median 8.8) = sim 11.4/31.1 + poses 2.2/2.7 + draw 4.1/4.8
      (list 2.6/3, sort 0/0.1, paint 1.3/1.6, overlay 0.1/0.2) + hud 1/1.3
    drawn: 170.1 things · cars 3.2 of 292 · road pieces 60 of 2722 · ground 106.9 of 38350
    since the drive began: you met 10.2 cars/min · following 32.7% · followed 46.8% ·
      0 gaps judged/min (5.1 min)
    long tasks 77 ms in 5 s · worst frame 79 ms · 25 full collections in 5 s, heap 82 MB

Against his earlier 280-car reading on the same map with the blind glance:
16 fps -> 37, sim 0.78x -> 1.00, step 50 ms -> 24.6, long tasks 4,908 ms ->
77. **Every performance problem chased on 22 October was downstream of one
defect** -- the blind, clock-driven glance (DECISIONS 10.19), whose rear-ends
and stalls jammed the world and multiplied cars per neighbourhood.

**VOID -- do not rediscover these as fact:**
- **The ceiling table and its revisions** (1.2.17): the ceiling is not 160,
  not 200; at 280 the world keeps real time at 37 fps. The method's inputs
  were phone readings of the gridlock.
- **The step drifting over five minutes** (36 -> 49 -> 50 ms at a constant
  280): the jam forming. (On the desk the highway's step still creeps with
  look-away off, 7.1 -> 8.7 ms in three minutes -- IN FLIGHT 20 -- small,
  separate, and not this.)
- **"A jam is cheap because the cars are following"**, and its correction
  **"gridlock is expensive"**: both were measurements of collision debris.
  (Neither was written here; recorded so neither comes back.)
- **"The phone factor is not constant"** (4.2x at 160, 4.6x at 259, ~6.5x at
  280): may still be true, but this data cannot establish it -- the 259 and
  280 points were the gridlock.
- **"Allocation dominates the phone's step"**: unconfirmed, and at these
  counts unmotivated -- 77 ms of long tasks in 5 s with 25 full collections
  is a phone keeping up. **NOT A DEAD END, CORRECTED THE SAME DAY:** the
  mechanism was real and in the wrong place -- not the step's per-car
  copying at 280 cars generally, but the glance path, which copied the whole
  world for each moment glances began (IN FLIGHT 25). Even there the
  maintainer's look-away-on reading puts it as a share of the cost (full
  collections per simulated second ~8 against 5) rather than the whole of
  it.

**DESK AND PHONE DIFFER BY MAP, NOT BY ONE DEVICE FACTOR** (22 October,
the third way the desk-to-phone extrapolation has misled us, after the
constant factor and the gridlock-era readings). Look-away on against off:
the desk 1.7x at the crossroads and 3.1x on the endless highway; the phone
3.45x at the crossroads (gridlock-confounded) and 2.4x on the highway. A
desk ratio from one map compared with a phone ratio from another said the
phone punished look-away harder; on the same map it punished it less. Any
desk-to-phone comparison is made on ONE map, both sides, or not at all.

**STANDS:**
- **The renderer has never been the problem.** Draw 4.1 ms of an 18.9 ms
  frame here, as in every reading this week; culling draws 3 of 292 cars.
- The desk step ramp in 1.2.17 (look-away off, so not confounded) stands as
  a DESK measurement; what it predicts on the phone is not established.
- The page's step budget and the readout's matched statistics (1.2.17).

**THE PROJECT NOW.** 3 cars in view, 10.2 met a minute, 0 gaps judged in 5.1
minutes: the engine runs 280 cars at real time and the player is alone.
Density shaping (DECISIONS 10.17, IN FLIGHT 11) has a confirmed budget.
Whether concentrating cars makes the step disproportionately dearer is to be
MEASURED as it is built, not designed around -- the clustering cost seen was
collision gridlock, not density.

**STILL OPEN, and real rather than an artefact: what look-away on costs on
the phone.** The maintainer on 3e77206 at the crossroads, 260 cars,
look-away on: step 72.5 ms against 21 off, 13 fps, sim 0.56x, 27 full
collections in 5 s -- 3.5x, where the desk measures 1.7x (IN FLIGHT 20, 21).
The desk does NOT reproduce a look-away-specific gridlock there: over ten
minutes and two seeds throughput is the same on and off (36-37 cars a
minute), and standing cars climb from ~95 to ~140 in both. The phone's extra
cost may be allocation: a glancing driver's carried picture copies every car
for each distinct moment glances began, dozens of whole-world copies a tick
-- a hypothesis, unmeasured. Look-away is off by default until it is settled.

##### 1.2.19 LOD, measured before it was built, and PARKED -- 27 October

**THE MAINTAINER'S PHONE, HIS BEST CONFIGURATION** (relayed 27 October;
recorded here because it existed in no document): the endless highway,
**180 cars, shaping on, look-away off -- 22 cars in view, 14.8 met a
minute, 2.7 merges judged a minute, step 19.5 ms; 60 fps at 129 cars,
comfortable at 180.** It is what #/map opens at (60de896). The desk's
step on the same map and configuration is ~7.3 ms (lod-split.mjs, two
seeds), so the phone factor HERE is ~2.7 -- on this map only (1.2.18).

**THE BRIEF LOD WAS GIVEN, AND WHAT MEASURING IT FOUND.** The brief:
"~180 simulated, ~22 in view: we pay full price for every car he cannot
see." Measured on the desk before any code (tools/measure/lod-split.mjs,
lod-census.mjs, lod-hold.mjs, lod-profile.mjs):

1. **Shaping had already put the cars where the player is.** Shaped, 180
   cars, two seeds: 44-57 within 400 m of the player, 64-85 within 600 m,
   75-97 within 700 m, and only 4-8 beyond 2 km. "22 in view" is what is
   DRAWN; a full tier has to reach past sight so that promotion happens
   where nobody can see it, so it holds ~90 cars, not 22. LOD and shaping
   were one piece of work (DECISIONS 10.17's reframe), and shaping did most
   of what LOD was for.
2. **More cars do not reach him on the shaped highway.** Asked for 240 the
   map holds 228-229; asked for 300, 256-259 (shaping admits arrivals only
   inside the window, and the window is full at competent gaps). Met a
   minute, two seeds of 5 minutes at his 119%: 21.1 at 180, 21.7 at 240,
   20.3 at 300 -- flat (noisy, and no trend). So headroom on the highway has
   nowhere to go, and 300 cars there is a configuration DECISIONS 10.22's
   scope rule rejects. The map where cars turn into encounters is the city
   (shaping off): at 200 cars 12 are within 400 m.
3. **A third of the step is not per-car decisions.** Profiled, 180 cars
   shaped: the per-car closure ~69% (whatStops 46%), shaping 11% (8% of it
   one pass over every car per placement try), contact detection 7%, the
   rest poses, tails, people and lights. LOD touches only the 69%.
4. **On the city half the far cars are where no cheap stand-in is safe.**
   Beyond 700 m, the share whose decision could be held (on a lane's
   stretch, not changing lane, not standing, not within half a second plus
   a comfortable stop of their line): highway 80%, city 48%, test map 1 52%
   -- the rest in a box (5-10%), standing (25-35% on the city and test map 1)
   or near their line.
5. **The promotion gate as written measured the wrong thing** --
   DECISIONS 10.9 and 10.23's eighth instrument.

**THE DESIGN, KEPT FOR WHEN SOMETHING NEEDS THE HEADROOM.** Two tiers, no
dormant:
- FULL within 600 m of the player (Euclidean: SIGHT 400 + 200 m, at least
  7 s at the city's worst closing speed, two cars at 50 km/h); demoted only
  past 700 m (hysteresis). Always full: the player, a wreck, and everybody
  when nobody is driving (watching has no pose to measure from, and the
  camera may not be an input -- the world would depend on the screen,
  10.9).
- COARSE, every tick: follows its lane leader by the same `decide` -- so
  every headway is one the following law produced, which is what keeps a
  promoted car out of somebody's headway: nothing is inserted, the car was
  in every index all along. Every tenth tick (staggered by id, so the cost
  is flat -- a spike is what the phone feels), the full decision. Every
  tick in full whenever holding is not safe: in a box, mid-change,
  standing, or near its line. Lost between full decisions: lane-change
  timing (up to 0.5 s late), glances, horns, the memo, brake lamps -- none
  visible from where the player is.
- NO DORMANT TIER: shaped, almost nothing is far; on the city far cars
  queue at signals, and a car advanced by formula cannot queue, so it
  fails promotion by construction.
- DETERMINISM as 10.9: the tier stored on the car, decided inside `step`
  from the world before the tick and the player's pose; LOD off hashes
  identically on all seven maps.
- PROMOTION CHECKED PER EVENT, never as a total (10.23): no contact; no
  hard braking by the promoted car or its new follower for 5 s; and an
  all-full TWIN replayed from 10 s before each promotion, gaps compared at
  the same tick -- a coarse gap the twin did not produce is a failure,
  traced one by one. `admissible` is placement's gate only (10.9).

**THE PREDICTIONS, written before any code** (step = fixed + full cars at
their cost + coarse cars at ~0.4x (highway) to ~0.6x (city) of it; the
phone at 2.7x on the highway; +-10 points on the decision share):

| | desk now | desk LOD | phone now | phone LOD |
|---|---|---|---|---|
| highway 180 shaped | 7.3 ms | 5.8-6.4 (-12 to -22%) | 19.5 (his) | 15-17.5 |
| highway 300 shaped (holds ~250) | 11.8 | 8.5-9.5 (-20 to -28%) | ~32 (not read) | 23-26 |
| city 300 unshaped | 11.9 | 9-10 (-15 to -25%) | not read | ~-20% of it |

At 180, fps up modestly, not to 60 (a frame that carries a step stays over
16.7 ms); met a minute unchanged; allocation down about a third.

**WHY IT IS PARKED, NOT CANCELLED (the maintainer, 27 October).** About a
fifth of the step for about a week's work, and the headroom has nowhere to
go: the shaped highway will not hold more cars, and more cars buy nothing
he feels. **Do not re-propose LOD without first answering what the headroom
would be spent on.** The things that would answer it:
- **LOOK-AWAY, THE BIGGEST SINGLE REASON TO REVISIT.** Coarse cars would
  never look away (agreed in principle; it parks with LOD), so look-away's
  cost -- ~41 ms against ~25 without it on the phone at 280 cars unshaped,
  IN FLIGHT 25 -- would be paid by full-tier cars only, about half the
  fleet at 180. Glance crashes would then happen only near the player.
- The city at more cars, where cars do turn into encounters (unshaped,
  met a minute rises with density: 6.6 at 200, 9.6 at 300, 1.2.14).
- A feature that costs step time and has nowhere else to come from.

**DONE INSTEAD: THE FIXED WORK, EXACT** (the maintainer's call, 27
October). Three changes, no behaviour moved:
- placement.js `admissible(..., { all: false })`, shaping's use: stops at
  the first rule that refuses, cheapest first, so the space and arrival
  rules (each a pass over the fleet) run only for a spot the headway rules
  admit; and the space rule reads poses from one grid per actors array and
  clock instead of a pose of every car per try. Shaping 0.84 -> 0.29 ms.
- crossing.js `contactsIn`: grid cells keyed by a number, not a string.
- intersection.js `segAt`: the segment a place is on, found by halving
  instead of a walk from the start (paths on the endless highway average
  264 points; every pose walked them twice -- here and graph.js
  poseOnGraph). The same index, so the same pose to the last bit.

Held exact by: 17 world hashes identical before and after
(tools/measure/shaped-hash.mjs -- a DRIVEN, shaped run, since
world-hash.mjs has nobody at the wheel and shaping never runs in it -- on
the endless highway at 180 (two seeds) and 300, the city shaped, test map 1
with look-away, the test highway shaped with look-away; and world-hash.mjs
on all seven maps plus test map 1 and the city with everybody perceiving
late); and contactsIn old against new on worlds with clones injected
(tools/measure/contacts-dump.mjs: 1,164 contacts, 90 snapshots with
several at once, identical; sabotaged -- half the neighbouring cells
skipped -- it differs in 28 snapshots). Ordinary traffic no longer crashes
at all (0 in 3 minutes even with everybody perceiving late), which is why
contacts are compared on made worlds.

| desk, mean step, alternating runs | before | after |
|---|---|---|
| endless highway, 180 shaped (2 seeds x 2) | 5.99 ms | 5.40 (-10%) |
| endless highway, 300 shaped | 10.13 | 9.22 (-9%) |
| the city, 200 unshaped | 5.55 | 5.60 (unchanged: short paths, no shaping) |

Against the estimate given before it was built (~15%): **two-thirds of
it.** The 15% was the whole cost of the two items, and a pose of every car
for contact detection is still paid -- now cheaper per pose, not avoided.
**PREDICTED FOR HIS PHONE, before he reads it:** the endless highway at 180
shaped, step 19.5 -> ~17.5 ms (16.5-18.5); fps a little up, not to 60; the
world unchanged -- same met a minute within noise. The city: no change.

**AN EXTERNAL PROFILE, RECONCILED (27 October).** A step-scaling report
from a Gemini run (pasted by the maintainer; NOT in the repo) split the
step by category. Against this section's own measurements:
- **Its milliseconds are not usable; its proportions roughly are.** It
  read 17.93 ms at 180 cars on the endless highway and 40.70 at 400 on the
  city. Like for like -- it ran UNSHAPED (spawning and shaping 0.00 ms) --
  the desk reads 5.30 and 15.85 (shaped-hash.mjs, 120 s, the good driver):
  3.4x and 2.6x apart, so no single factor. Look-away was ruled out as the
  cause (on against off: 2.0x on the highway, 1.36x on the city -- it
  cannot make 3.4x and 2.6x). Cost added PER CALL fits, and fits the
  differing ratios: the highway makes more small calls per millisecond of
  real work.
- **AND THAT INSTRUMENT IS BIASED TOWARD ITS OWN HEADLINE.** A cost added
  per call inflates exactly the category made of many cheap calls -- the
  neighbour search -- which is the category it then names as dominant: 35%
  of the highway step, 40% of the city's. Neighbour search IS the largest
  (a sampling profile, with no per-call cost, puts whatStops at 46% of the
  shaped highway step inclusive), but its share in that report is
  overstated by the instrument. DECISIONS 10.23's pattern, in an external
  tool.
- **Its 300-car highway column (51.91 ms, above 400's 39.92 in every
  category) is one run's event, not spawn churn**: unshaped, the loop does
  fill to 300, and the desk's step is monotone there (8.94 ms at 300, 13.34
  at 400). Discarded.
- **Ranked by growth ratio it surfaces trivia** (clearBetween 7.75x for
  0.36 ms); by absolute growth the list is whatStops, poseOnGraph and the
  pedestrian functions. poseOnGraph's walk along the path is the segAt fix
  above. whatStops is the decision core, the index already took 22% off
  it, and two exact prunes after it moved nothing: left, with performance
  work.
- **Shaping 0.00 against 11% is configuration, not disagreement**: it ran
  unshaped; #/map opens shaped, which is where the shaping fix pays, and on
  the unshaped city it pays nothing -- as the table above says.

**NOTED, NOT CHASED: the lane index's place just past a box onto an
acceleration lane.** Tracing the following readout (below), the player
2 m past the box edge onto the endless highway's acceleration lane was
placed by placement.js `placeOf` (graph.js exitAlong) ~4 m further along
the road than its path puts it: 2.1 m to the car ahead on the same path
by the index, 6.4 by the paths, 6.5 by the poses. Placement and density
shaping read that index; whether a placement near there is ever wrong by
it is unmeasured.

##### 1.2.20 The following gap on the throttle bar -- 27 October

The maintainer asked for it: following too close is something an
examiner marks, and the player had no way to see their own following
distance. `drive.js headwayOf`, drawn by `hud.js drawHeadway` at the top
of the throttle bar on its left: "car ahead", the time gap in seconds and
the metres under it -- the clear road bumper to bumper over the player's
speed, which is how the two-second rule counts. Shown while the player is
moving (2 m/s) and the gap is under 5 s (display constants, not a
standard).

**REBUILT AGAIN: A FOLLOW TARGET ON THE THROTTLE BAR (the maintainer,
27 October: "something similar to where it shows you to hold your
throttle to maintain speed, the follow indicator would eventually settle
within this holding zone once you have matched speed with the car ahead.
keep the current time to impact indicator though, I like it").** A
control aid, read by where the thumb is: a violet marker on the throttle
bar (drive.js followTarget, hud.js drawSlider) at the pressure that brings
the player to the speed to hold -- the car ahead's while there is room,
less once inside a sound driver's following gap at their speed -- over
3 s, never later than the brake's one mechanic (dv^2 / 2d, as the stop
marker). Within 0.3 m/s it IS the hold band and says "matched"; "too
close" when even full brake cannot match in the room left. The time to the
car ahead (seconds) is kept, top right above the bar; the gauge is gone.

Two versions failed verify-headway before shipping, recorded so neither
returns: the hold band asked at the car ahead's speed (the band is a dead
zone; a thumb held there stopped converging up to 6.4 m/s short), and
dv^2 / 2d alone (it only approaches their speed, so the player crept in
inside the gap and reached a standstill gap behind a slow car). Now, two
cars on the flat and on 3% either way, the thumb kept on the target and
the car moved by its own accelFor: 75 of 75 settle within 0.3 m/s with the
thumb in the hold band, closest 4.3 m; with the first version restored,
3 of 75, 17.4 m/s off, closest 1.3 m.

**SUPERSEDED, the gauge it replaced -- built and replaced the same day:** A thin strip down the outside of the throttle bar, the player's
bumper at its foot, rising with the gap to the car ahead on a square-root
scale to 8 car lengths (so the close end has the room); a tick at the
ruled 0.75 car lengths (3.375 m); a chevron for closing or dropping back
(past 0.5 m/s), so holding station behind somebody while waiting for a gap
is one glance; the gap in car lengths above it and the seconds under that.
Neutral outside the threshold, amber inside it above the 7.1 km/h floor
-- the threshold said, nothing marked. The fault waits on 10.18 (one entry
or several). The paragraphs below describe the first, text-only version
and how the car ahead is found, which is unchanged.

**NEUTRAL, NO FAULT, ON PURPOSE (the first version).** What is close at this game's scale and
whether it is a fault on the sheet are the maintainer's. The scale is
already ruled, for encroachment: a driver is taught 2-3 s and this
game's pace does not allow it, so the entitled gap is `LOOKAHEAD` = 0.9 s
with real driving's 2:1 split kept at 0.9 : 0.45 (DECISIONS 6; CLAUDE.md
"Encroachment is measured in seconds"). [SUPERSEDED the same day by DECISIONS
10.24: the maintainer ruled the threshold a DISTANCE, 0.75 car lengths, not a
time -- the entitled gap stays encroachment's.] Two things to put to him with it: the
traffic's own chosen headway is 0.7 s (traffic.js HEADWAY), INSIDE the
0.9 s it is owed -- flagged unreconciled since stage 0 -- so ordinary
traffic would read amber on those bands; and the encounter instrument's
"following" is 2.5 s (encounters.js FOLLOW_S), a third statement of a
following gap. Whether following too close is one fault or several
entries by section (DECISIONS 10.18) is his ruling, asked; one standard,
not varying with speed or weather, until he has driven with it.

**WHICH CAR IS AHEAD, and how that was found** (tools/verify-headway.mjs;
the trace in tools/measure/headway-trace.mjs). By the two rules the sim
follows by -- the lane index (every car in the player's lane by its
place along the road) and the queue by the rule (every car from the
player's approach, along its own path, through the box) -- the nearer.
Held sample by sample against the cars' POSES, an independent statement:
- The first version read the lane index alone and went blank whenever
  either car was in a box -- on the highway, every merge and diverge. 71
  of 480 samples on the endless highway named a car the poses saw and the
  readout did not; 56 on the city.
- A car alongside the player (a changer counts in both its lanes) sat
  nearer by place at a negative gap and hid the car really ahead.
- The queue rule kept a car that had taken an off-ramp as the car ahead.
- Just past the acceleration lane's box the index's gap was 4 m short
  (above); the queue's, along the paths, is used when both name one car.
After: where both statements are sound (same lane by the map, neither in a
box, nobody changing lane), 55 of 55 on the highway within 0.20 m and 23
of 23 on the city; never a car beside the player or on another exit.
Sabotaged -- a car alongside let through, the body lengths dropped from the
gap -- it fails each. Its boundary, said: the poses are a straight line,
so a bend, a skewed road and a box are where it cannot speak, and there
the readout rests on the sim's own two rules. Still blank, by design: a
car beyond the next intersection while the player has not reached it.

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
   one who does not, does not. First placed at .30 for "medium-high";
   **lowered to .15 on his ruling of 1 October** -- "it's just one of those
   things people know or dont" -- between the yield sign (.10) and
   no-right-on-red (.25). The BUS DRIVER knows the rule and still checks
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

**Ruled (1 October):** *"people can pass a bus on an unmarked street if
the way is clear the other way."* Passing is now forbidden only by a
solid line (an arterial's or a highway's); a residential street, unmarked,
is passed on the same gap judgment as a broken line.

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

### THE PLEASURE IS IN THREADING TRAFFIC (the maintainer's verdict, 6 October)

After driving the build with the bench, green-wave and performance
work in, he said, verbatim: *"I'm really enjoying the driving, it would
be nice to have a long highway scenario. we could have a great swim
simulator here, moving between cars feels really good. world needs
signals and brake lights. my initial thoughts are that the user will
need some slight assist to stay in the lane and pointing straight so
they aren't constantly adjusting."*

**The thesis under it: the fun is FLOW -- moving between cars -- and
the intersections are the assessment content.** One idea points the
highway scenario, the green waves and the traffic density the same
way: give the player traffic worth threading and roads long enough to
thread it on.

**This is the third time the road BETWEEN intersections has turned out
to matter more than the intersections:**
1. the ruling that the road between intersections is content
   (REBUILD.md 8);
2. the axes reading on the approach rather than in the box;
3. now, where the pleasure is.

Anything that treats a link as transit between the interesting parts
is wrong by this project's own evidence.

**What follows from it, in his order:**

1. **Brake lights and turn signals, legible.** This is information,
   not decoration. Threading traffic is reading what the drivers
   around you are about to do. A car braking ahead is invisible until
   you are closing on it, and a lane change or a turn is unpredictable
   without a signal. It feeds the observation axis from the player's
   side: a driver who notices brake lights early is doing what the axis
   measures in the AI.
2. **Lane-keeping assist.** It removes UNINTENTIONAL drift and never
   resists INTENTIONAL positioning: it centres the car when there is no
   steering input and never fights one. The strength is a setting.
   It is the lighter cousin of the auto-steer ruling (1.1.19), not the
   same thing.

   **BUILT, 7 October** (`sim/player.js` `assistSteer`, the "Lane assist"
   button on `#/map` in drive mode, saved; default GENTLE):
   - **Hands off means no input for 0.6 s** -- the wheel out of its dead
     band OR MOVING resets the clock -- and then it fades in over half a
     second. A first version read the wheel's position this instant and
     grabbed it at every crossing of centre in a weave; a second woke up
     during a slow weave lingering near centre. Both are now held
     identical to no assist by `verify-wheel`, and the slow weave was
     sabotaged once to prove it.
   - **Hands off, it aims the car at the lane centre a little way ahead**
     (8 m, or 1.5 s at speed) and points it along the road with the
     bend fed forward. From 1.2 m out and 3.4 degrees off, the lane is
     held within 0.07 m after 4 s on a straight or a gentle bend, against
     a drift of 3.7 m and 10.9 m with none.
   - **Authority is limited**: at most 0.35 of the wheel at firm, 0.175 at
     gentle. A sharp bend (R 80 m) is not driven for you at gentle; a
     bend is still driven.
   - **Never inside an intersection**: the turn there is committed.
   - Strengths: off, gentle (0.5), firm (1). Released partway into a
     lane change, it brings you back to the lane you were leaving;
     released once across, it centres you in the new one.
3. **A long highway:** multi-lane, sweeping curves, elevation, mixed
   speeds, trucks to pass, few or no intersections. The home of
   threading traffic, and the test bed for the green wave.

   **BUILT, 7 October: test map "Highway"** (`src/map/samples.js`
   `testHighway`, on `#/tests`, five sections):
   - **Six kilometres of three lanes each way at 100 km/h**, on a long
     sine 180 m either side of straight. The tightest bend is about
     810 m, inside the 525 m the loader allows 100 km/h on, so every
     curve is driven at the posted speed and none is a corner.
   - **10 m crests** between the crossroads, level at each crossroads,
     1.75% at the steepest. The player's car feels the climb (`resistance`
     in `player.js`); the traffic does not -- nothing in the AI reads
     grade yet, and the section says so rather than claiming otherwise.
   - **Two signalled crossroads 1.8 km apart**, so 1,896 m of curving
     road. At 2 km apart the road came to 2,045 m, past `CORRIDOR_MAX`,
     and no wave formed; the map was moved rather than the constant.
   - **A collector on a bridge** 7.5 m over the highway near the east end.
   - **15% trucks.** A map can now carry its own traffic mix
     (`traffic: { trucks }` in the format, clamped to 0-0.5 by the
     loader, read by `seedGraph` after an explicit option and before
     `TRUCK_SHARE`). A map without it is unchanged. A flagged choice:
     the upper end of what a real highway carries, so there is always a
     truck to pass.
   - Measured, 150 cars for 3 minutes: no crashes, no overlaps.

   **What building it shook loose: a car joining a road kept the old
   road's limit for most of a kilometre.** A path runs from one
   intersection's approach, through the box, and along the exit road to
   the next seam; the limit was set at the seam from the road the path
   ENTERS by. On a city block that is a hundred metres of error and
   nobody saw it. On the highway a car turning on from a 50 km/h side
   road drove the next 940 m at 52 km/h, and the open-highway median
   was 70 km/h against a wanted 93. The limit is now the exit road's
   from the box's far edge (`postedOutAt` in `graph.js`, applied in the
   step). Open-highway median after: **92 km/h** (p10 64, p90 105; `tools/measure/highway-speed.mjs`).
   It also means a car turning OFF a fast road onto a slow one slows
   for it straight away rather than at the next seam. It moves every
   map with roads of different speeds, so the world-hash baseline was
   re-recorded; with the new block disabled the old hash comes back
   exactly, so nothing else moved.

   **The wave on it, measured** (`tools/measure/waves.mjs test-highway
   150 10 2`): the clock holds -- a car holding 100 km/h from
   the first green finds the second green anywhere from 0.9 to 1.1 times
   the posted speed, red at 1.2 times and amber at 0.8 -- but **the
   traffic gains nothing from it: 45% of the platoon through without
   stopping with the wave, 43% without** (2 seeds, 10 minutes, 150 cars).
   The reason is spread, not timing: over 1.9 km the platoon's travel
   time runs p10 69 s, p50 83 s, p90 107 s against the 68 s the offset
   assumes (`tools/measure/wave-miss.mjs highway`). The fast tenth make
   it; the median car, which started from rest and drives a little under
   the limit, arrives as the green ends. That is a real property of long
   links, and why `CORRIDOR_MAX` exists; this link is just inside it.
   **For the player it works as designed**: hold the limit off the line
   and the second light is green. Whether the offset should allow for
   the launch from rest (about 6 s at 100 km/h) is the open question --
   it would centre the window on the platoon rather than on a car
   already at speed, and it moves every timed map, so it is its own
   measured increment rather than a tweak made here.

   **Three checks it caught out.** The suite's first run with the
   highway in it failed three, none of them on the highway's driving:
   - `verify-generate`: four of the highway's section starts could not
     be driven from. A start names the road end you drive TOWARD; I had
     named the dangling west end, which is driving off the map. Fixed
     in the map, not the check.
   - `verify-signs` asserted every test map has a stop or yield to
     rewrite as a sign; the highway has only signals. A map with none
     is now named and skipped, and at least three maps must carry some
     (sabotaged: with no sign written anywhere it fails, 0 maps).
   - `verify-buses`: "drivers who do not know drove on past it (0 of
     0)". At the rule's real difficulty (0.15) three runs held one or no
     driver who does not know it, so the half passed on whoever turned
     up, and the new speed limit past the box moved the traffic enough
     that nobody did. A fourth, controlled run makes the rule hard
     (0.9), as `verify-compliance` does with signs. Counted among those who
     could have stopped, 5 of 9 who do not know drove on past, with 46 of
     46 who do know letting the bus out across all four runs. Sabotaged
     (everybody made to yield whatever they know): 0 of 8, and it fails.
     The floor is 3, between the two; a first version counted drivers who
     could not have stopped either and still read 4 under sabotage.
4. **The green wave**, which the highway will show off better than a
   city street.

### FIRST AFTER THE RESET: green waves (designed 1 October, not built)

**The problem, named.** The maintainer, from play: *"the driving feels
good, however traffic makes it difficult to ever really get moving,
getting stuck at a light is simply boring. could we integrate a system
where a player can 'green' a stop or another proper action (like greening
a shot in nba2k) and have a favourable result such as making the light
change for them. this gives the player an almost magical control over the
road and traffic by driving really well."* Realistic traffic produces
waiting, and waiting is boring. That tension has to be RESOLVED, not
tolerated.

**The mechanism is green waves, and they are real.** Signal progression:
an arterial's lights timed so a car at the posted speed catches green
after green. It gives exactly the feeling he describes with no magic --
drive at the speed the road was designed for and the lights open ahead of
you; speed and you arrive early and sit at red; dawdle and you miss it.
**It needs no invented mechanic, only honest signal timing.** Today every
signal on a map runs one shared cycle with no offset (sim/signal.js
`intoPhase`, whose own comment says progression "would be an `offset` on
the plan and nothing else here would change"). The build: derive each
signal's offset along a corridor from the distance between intersections
and the road's posted speed, so the wave runs at least in the corridor's
main direction. Mostly signal timing rather than new systems, and it
changes the feel of every signalled road in the game -- which is why it is
first.

**It pays out on the skill the controls already test.** The throttle's
whole skill is finding and holding the right speed; the green wave rewards
exactly that, which is why it will feel earned rather than granted.

**And it inverts the problem.** Waiting stops being a property of traffic
and becomes the consequence of driving badly: a player who speeds, brakes
late and sits in the wrong lane stops at every light; one who holds a line
flows through. The boredom is not removed -- it becomes something the
player causes and can escape.

**On "greening" a stop: change what it pays.** A perfect stop must NOT
turn a light green -- that is the world bending, and it will read as
arbitrary. **A perfect stop gives a better LAUNCH**: off the line sooner
and cleaner, to the next light sooner, catching it. The reward is still
the green, earned by arriving properly rather than by the light noticing.
Chain a few and you are in the wave.

**THE GOVERNING RULE: EVERY REWARD MUST BE SOMETHING A GENUINELY GOOD
DRIVER WOULD GET.** Better momentum, better position, catching the
progression, reading the road earlier. The moment a reward can only be
explained by "the game liked that", the world stops being a place. It is
the same principle as the scorer never knowing something the screen did
not show.

**A second payout, informational rather than physical, worth
considering:** driving well reveals more of the road ahead -- the next
lights' timing, which lane is about to clear. Not changing the world,
reading it better: true to life, and it feeds the observation axis from
the player's side rather than the traffic's.

**Feedback must be immediate and legible** -- why the 2K meter works: you
know at once whether you nailed it and why. The braking marker already
makes a perfect stop a visible event; it must announce itself and pay out
visibly.

**Two consequences, recorded on purpose:**
- **It teaches the exam mode.** A player rewarded for good stops arrives at
  examining already knowing in their hands what a good stop feels like,
  then holds somebody else to it. Better than a rulebook.
- **It answers the cold review's open finding** that the four jobs do not
  compete hard enough to make each other fail, because the driving was
  never demanding enough to keep the player busy. A wave you can hold or
  lose gives the driving moment-to-moment stakes.

#### Green waves: BUILT (6 October) -- the timing; the better launch and the feedback are not yet

`src/sim/progression.js`. Nothing in it knows the player exists: it times
the lights, and every driver who holds the posted speed gets the benefit.

- **Corridors.** Between signalled intersections, the road goes straight
  on through any intersection where it has priority: its own approach is
  free, and the road crossing it stops or yields. **An uncontrolled
  crossroads ends a corridor.** Nobody has priority there, so a platoon
  stops whatever its leg says. The first version timed straight through
  two of them on the bench: traffic averaged 3 and 16 km/h at those
  crossings and took 131 s over a 1,500 m link timed for 90.
  `CORRIDOR_MAX` (2 km) is the one flagged figure: past it a platoon has
  spread out and there is no wave left to time.
- **Which links.** A spanning tree, fastest roads first, so an
  arterial's lights are coordinated before any side street's. A real
  system can time a line of lights for one direction, not a grid in
  every direction, and so can this.
- **One cycle per system.** Every signal in a connected system runs
  the longest cycle among them; the shorter plans lengthen every green
  equally to fill it. No green is ever shortened.
- **The offset.** The next light's green begins one AMBER before a car
  that left the last one at the posted speed arrives. Amber is the
  reaction plus the comfortable stop from that speed, so the green is
  up just as an approaching driver would have had to start braking for
  a red. Derived, not chosen.

**What it does, measured** (`tools/measure/waves.mjs`): a controlled
comparison, same map and seeds, timing on and off. The platoon is cars
released by the light before by the timed exit; "all arrivals" includes
cars joining from side streets, which no timing can help.

| map | platoon through the next light without stopping | all arrivals |
|---|---|---|
| a long arterial, three signals 500 m apart | **25% -> 73-75%** | 31% -> 62% |
| the bench (four signals, links of 1,000-1,500 m) | 48% -> 68% | 46% -> 61% |
| test map 1 (850 m) | | 27% -> 35% (4 seeds) |

**On the clock**, leaving two seconds into a green: on a 500 m link a car
finds green arriving at anything from 0.7 to 1.2 times the posted speed,
and red at 1.35. On the 1,000-1,500 m links the window narrows to about
0.8-1.0, so a driver who speeds sits at red. That is the design's
"speed and you arrive early" turning up by itself.

`tools/verify-waves.mjs` holds it:

- a car at the posted speed from a green arrives on a green on every
  timed link of every map;
- no corridor passes an uncontrolled crossroads;
- one cycle per system, and no green is shortened;
- a map with fewer than two linked signals keeps exactly its plans;
- in the sim, the platoon's through-rate beats the untimed rate by 25
  points or more;
- nothing crashes.

It caught both sabotages: zeroed offsets, and the uncontrolled-crossroads
guard removed.

**Not yet built, and next:**
- ~~**The better launch from a perfect stop.**~~ **RULED OUT, 8 October
  -- replaced by the ruling below.**

### GOOD DRIVING IS PAID IN FLOW (the maintainer's ruling, 8 October)

Verbatim: *"A better launch makes no sense if there's 3 cars ahead of you
starting at a 'normal' speed. The intent is to keep the player moving
along, changing lanes and driving skillfully through traffic situations.
A good stop (distance and harshness), sensible signal, following
distances etc should reward the user with less waiting time. I want
players to enjoy maneuvering between traffic, while being rewarded for
'good' driving habits with more situations to 'swim' in traffic."*

**What it settles.** The reward for a good habit is TIME MOVING -- less
standing, more traffic to thread -- never speed off the line. The habits
named: the stop (where, and how hard), the turn signal, following
distance, "etc". The pleasure being protected is manoeuvring between
traffic.

**THE DESIGN, AGREED 8 October** (his answers to four questions):

1. **ACTUATED SIGNALS ARE THE CORE.** *Agreed.* A loop at the stop line
   calls the green for a car standing on it; a car stopped well short is
   not detected and waits the cycle, or for somebody to pull up behind.
   Advance loops further back extend a green for a car coming on at a
   steady speed, so the driver who eases off early rolls through and the
   one who brakes late and hard finds the green gone. Where you stop and
   how hard both pay in waiting time -- and both are true of real roads,
   so the green wave's rule (every reward real) holds.
2. **A TIMELY SIGNAL OPENS A GAP.** *Agreed, and:* "some drivers might
   never see the signal at all, players should be ready for that." A
   courteous driver who registers the signal makes room; one who does
   not see it -- the observation axis -- or will not -- compliance --
   drives on. A signal is a request, never a guarantee, and reading WHO
   will let you in is part of the skill.
3. **NOT MORE TRAFFIC.** Verbatim: *"more traffic isn't necessarily more
   fun, i want the player to feel like they are cutting up traffic by
   controlling their vehicle expertly and predicting gaps and the
   actions of other drivers (signals)."* The world is not made denser
   around a good driver. The reward is the flow itself; the skill is
   control and PREDICTION -- reading gaps and reading other drivers'
   signals, which is the readability pass's brake lights and blinkers
   doing their job.
4. **THE PLAYER IS TOLD, ON THE THING THAT RESPONDED.** Verbatim: *"the
   player should have some indication they are doing well, perhaps a
   small indicator on the thing that is interacting with you well (the
   signal light or another car for example)."* No score screen and no
   HUD tally: a small mark on the signal head whose loop saw you, on the
   car that opened a gap for you. Map-symbol legible, like the lamps.

**Build order:** actuated signals with the stop-line and advance loops,
and the mark on the head; then courtesy gaps with the mark on the car.
Both built (below).

#### ACTUATED SIGNALS -- BUILT, 8 October (`src/sim/actuated.js`)

Every signal now runs on its loops by default (`seedGraph`'s
`actuated: false` puts them back on the clock, for comparing against).
- **The stop-line loop** is presence, LOOP (10 m) back from the line: a
  car on it calls its phase. A car stopped well short is never detected,
  and its phase is never called -- creep up, as on a real road.
- **The advance loop** sits where the dilemma zone starts -- reaction
  plus the comfortable stop from the approach's speed, the quantity the
  amber is derived from, so nothing new is chosen. A car crossing it
  calls ahead of arriving, and on a green extends it.
- **An isolated light** rests in green with nobody waiting; a call
  elsewhere ends the green once it has run MIN_GREEN (6 s) and gapped
  out (no actuation for PASSAGE, 3 s), or maxed out at the plan's own
  green counted FROM THE CALL. A protected left leads only when a left
  lane is called.
- **A coordinated light** (a green wave) keeps its clock: a side phase
  is skipped when nobody calls it, served late when a call comes while
  its window still has room, and hands its time back when its traffic
  has gone. The coordinated windows never move, so the wave holds.
- **THE MARK** (the ruling's point 4): a cyan dot on top of the signal
  head whose loop sees the player -- on the stop-line loop or coming on
  over the advance loop. Not a signal colour, so never read as the light.
- MIN_GREEN, PASSAGE, LOOP and MIN_ARROW are traffic-engineering
  settings, flagged as design constants.

**Measured** (`tools/measure/actuated.mjs`, `verify-actuated` 6): on
test map 1, cars stand at signalled lines **8.7-9.3 s a crossing against
11.4 on the clock** (40 cars, three seeds); 7.3 against 9.0 at 30 cars;
16.6 against 18.5 at 120. On the long arterial the platoon goes through
92% with the wave and the loops against 76% with the wave on the clock
and 84% with the loops alone -- the loops do some of the wave's work,
which is why `verify-waves` measures the offsets on the clock.

**Two lights went green straight to red on the way, and both are now a
checked invariant.** The warm-up's rebase re-read a coordinated light's
clock and jumped it, under a car already crossing (a light now carries
the shift on its own clock, and every light shifts alike, so the wave is
untouched); and a leading arrow ran under a green that had carried on
from an early return. The arrow now leads only when the light comes from
another phase or a left-turner calls for it, and then the green ends
with its amber first. `verify-actuated` holds "no green ever goes
straight to red" under random calls (lefts on both axes, coordinated and
isolated) and in the sim; sabotaging the arrow fix fails it three ways.

**What the other checks needed.** `verify-signal` 4, `-compliance` and
`-trucks`' red-run count read the light the world is actually showing
(`world.lights[k].live`), not the clock. `verify-signal` 5 and
`-trucks`' seam case set the time to get a red and test what a red
DOES -- rule tests, so they run on the clock. `verify-signal`'s
undue-delay test excluded rights on red, which are not held: lights
resting on light traffic put more of them in front of open gaps.
`verify-waves` measures the offsets on the clock (otherwise the loops'
work is credited to the wave and a broken offset hides behind them) and
holds the loops to not undoing it.

**What the new timing shook loose, again.** The loops change when cars
arrive everywhere, and two faults surfaced away from any signal:
- **Two committed cars bound for the same place.** At a wide uncontrolled
  junction on the generated city's arterial, the lines sit 12-15 m back
  from where the paths meet. Each driver judged at their line who would
  arrive first, both judged in their own favour, and both were past their
  lines and moving when the first reached the conflict -- two lefts met
  at 35 km/h. The rule of 1.2.10 (a car inside the overlap is a stopped
  car to me) fired with the second 1.7 m away. Its anticipating half:
  between two committed cars not yet in the region, the one that will get
  there second gives way if it can still stop at all; a tie goes by id,
  so both can never give way. No vehicle crash after it.
- **A heedless pedestrian struck** in the default city, by a turning car:
  the 5% who do not look, a strike the design allows and `verify-peds`
  holds. `verify-crashes`' "the default traffic never crashes" now counts
  crashes between vehicles and reports people struck beside it.

`verify-graph`'s posted-speed comparison runs its lights on the clock as
well as its waves off: an actuated light answers the traffic at it, so a
different limit on one road moved every light that road's cars reached.
Following distance needs no mechanism -- room ahead already keeps you
moving -- only making it legible, which the brake lamps begin.
- **The legible feedback.** The player should know at once that they
  are in the wave: the next light greening as they approach is itself
  the payout, so drawing the next signal's state earlier, or a marker
  for the wave's speed, is the cheap first form.

#### COURTESY GAPS -- BUILT, 13 October (`src/sim/courtesy.js`)

Item 2 of the ruling. The player signals toward the lane beside them on an
approach; the one driver whose space they need -- the nearest car in that
lane with its centre behind theirs, and only one actually in the way,
inside its own following gap -- may let them in.

- **WHO, FROM THE AXES, NOTHING NEW.** Courteous = competent on compliance
  AND not on the bold side of confidence, both at the model's own
  COMPETENT_AT. The timid are in (over-yielding is what the timid tail
  is); the bold and the scofflaw never. Measured (`tools/measure/courtesy.mjs`):
  **59% of the highway's drivers and 46% of the city's**; the courteous
  average compliance 0.90 and caution 1.15 (they lean timid), the rest
  compliance 0.48 and caution 0.78 -- the bold, the careless and both.
  **It reads as a type: the considerate driver, rule-minded and
  unhurried, and Brenda Braga is its extreme** (CHARACTERS.md). The third
  mechanic derived from the axes rather than added beside them, after the
  horn's patience and the green's delay.
- **SEEN, OR NOT.** The signal counts once it has been on for that
  driver's own time to notice something (`noticeAfter`, observation
  alone). A signal put on as the wheel turns is noticed by nobody in time;
  "some drivers might never see the signal at all" is the observation
  axis, and a driver who will not is compliance.
- **COMFORTABLE.** The driver follows the player as if they were already
  in the lane, braking no harder than their own rate, and never less than
  the real traffic ahead demands; one closing too fast to do that is not
  asked.
- **THE CLOCK RUNS FROM WHEN THE GAP IS THERE.** Dropping back from level
  to a following gap at a comfortable rate takes about 4.5 s at highway
  speed -- longer than the wait itself -- so the 4 s undue-delay standard
  (COURTESY_FOR) counts from the gap opening, and an offer that has not
  opened in twice that is dropped. Withdrawn, it is not made again while
  the player keeps signalling.
- **WHAT IT BUYS**, measured on the endless highway with the player level
  with a car in the lane beside at its speed, everything else cleared
  60 m (`tools/measure/courtesy-trial.mjs`): the car offered in 6 of 19
  such moments (the middle lane carries more of the bold); where it did, a
  gap a competent driver takes came **2.7-4.2 s after the signal went on
  in 5 of 6**, against 1 of those 6 without courtesy. A signal is a
  request, never a guarantee -- 13 of 19 drivers level with you would not.
- **AND A BUG THE CHECK MISSED, FOUND BY MAKING IT CHEAPER (14 October).**
  Cutting `verify-courtesy` to the sample it needs meant asking the trial
  of each temperament directly -- a level car the axes call courteous, and
  one they do not -- instead of whoever happened to sit level. Courteous
  drivers offered only 2 times in 8: the "can they drop back comfortably"
  test refused any car closing at all unless 1.5 m back, so a car LEVEL
  with the player -- the case the courtesy is for -- was refused for a
  fraction of a metre a second faster. Now only a car coming up from
  behind faster than it can shed is refused (the easing is capped at its
  own braking anyway): 7 of 8 offer, all 7 give a gap within 6 s (2.0-4.6
  s), none without courtesy, and no driver the axes call uncourteous ever
  offers. The "6 of 19" above was the bug's number, read as temperament.
- **THE MARK, ON THE CAR, IN THE HORN'S FAMILY** (ruling item 4; the
  readability lesson that a real-world cue is invisible at these zooms):
  over the offering car a GREEN badge with a black rim and two bold white
  chevrons pointing into the gap, a ring pulsing out once a second,
  never under 11 px -- the horn badge's size -- and on the road in front
  of its nose a green patch a car and a half long, outlined in white:
  WHERE to go, not only who is offering. Green-and-white is used by
  nothing else drawn on the road.
- **Lane changes are made on the approach**, as they always were
  (`drive.js` `laneChange`), so courtesy is offered there; the first part
  of a block, the previous intersection's exit, has none.
- `verify-courtesy` holds all of it, and was sabotaged twice: everybody
  courteous (the axes checks fail, and the gap rate drops), and the
  easing removed (gaps stop arriving; the offerer brakes at 8 m/s^2).

**To judge** (test map "Endless highway", any section): in the curb or
middle lane beside a car, signal toward its lane and hold it. Watch for
the green badge over that car and the green patch in front of it -- can
you see them in time to act, a second or two? About a third to a half of
drivers will offer; the rest will not, and that is meant.

### THE RIVALS, CHEAPLY -- BUILT, 14 October (`src/sim/rivals.js`; PLAN.md item 3)

Victor and Brenda Braga, Mason "Swerve" Lin and "Grizzly" Hannah Miller
drive every map the screen opens (`worldFor` asks for them; `seedGraph`'s
`rivals` is off by default, so every check's world is unchanged by their
presence). Each is an AXIS PROFILE and nothing else, made a driver by the
same `driver` as everybody; when one is not on the map the next car to
arrive -- at an edge or out of a district's curb -- is them, with no trip
to end. A name tag in their colour rides over the car (`paintNames`,
never under 12 px), and Watch has a button each to ride them.

**One new behaviour, derived, for everybody: WHERE A DRIVER STOPS AT A
LINE.** Short of it by the old engine's own `stopsShort` distance (3.2 m)
times the knowledge deficit (`STOP_SHORT`, traffic.js) -- a controlled
stop in the wrong place is KNOWLEDGE, the maintainer's ruling. It was
missing from the simulator: CHARACTERS.md had claimed `stopsShort`
expressed Brenda, which was true only of the old engine. A drawn driver
weak on knowledge now stops visibly back; a sound one at the line.

**Only where a car comes to REST** (`restAt` in crossing.js): the line it
brakes for and where it counts as stopped. Everything that asks where the
LINE is -- a yield's slowing, the amber, the loops, the gaps -- still asks
`waitAt`. The first version moved both, and the full suite found it: a
yield road's cars slowed early and sped up again before the line
(`verify-signs`), and a caller with no driver (`marking.js`) threw
(`verify-course`). A short stopper misjudges where to stand, not where
the line is.

**And only at a STOP, and only with room** (the full suite again, twice):
- Only where the control is a stop sign or a red. Held by traffic on a
  road with no control a driver waits where everybody waits: a left-turner
  standing 2.65 m back on a through road needed a gap the oncoming stream
  never left, the right-turner beside it is held by any left-turner at its
  line, and the lane starved (`verify-drive`: the player never reached the
  box).
- Only where they can still stop comfortably short of it. A target moved
  BEHIND a car already standing -- stopped at the line, then the light
  changed -- held it at full braking at rest, tick after tick: 2341 "harsh"
  car-ticks at one signalled crossroads against 29 before (`verify-signal`),
  every one a car not moving. Now 27.

**And a check carried its own copy of where cars stop.**
`verify-compliance` watched an occasion from 2 m before the old resting
point -- exactly where every car comes to rest, STANDSTILL short of the
line it brakes for -- so whether a rest was seen at all was decided in
the second decimal place, and a short stopper was never seen to rest and
was counted as rolling. It now watches from each driver's own `restAt`,
two metres further out (`WATCH`), and sets aside rests the TRAFFIC forced
(held by somebody crossing, a driver who does not know the right on red
stops like everybody else -- the established rule). Before: 91% alone
against 58% in company for the driver who does not read it, failing the
consistency bound; after: 90% against 87%, the scofflaw still 0% in
company. Sabotaged: that driver rolling only with nobody about.

Measured over ten minutes of the stand-in city at 150 cars on two seeds
(`verify-rivals`), against the crowd's medians (95% of the limit when
free, 1.84 s behind a car ahead in steady following, 0 lane changes):

| | % of the limit, free | steady following | lane changes | stops, from the box |
|---|---|---|---|---|
| Victor (bold, scofflaw) | 126% | never (too fast to sit behind anybody) | 2 | 2.2 m |
| Brenda (timid, compliant) | 64% | never (nobody ahead within reach) | 0 | 4.1 m |
| Mason (bold and able) | 115% | 1.25 s | 4 | 1.9 m |
| Hannah (sound) | 97% | -- | 0 | 1.9 m |

How closely Victor and Brenda follow (0.39 s and 1.02 s wanted) is
asserted on their profiles: the city never holds either in steady
following, and a traffic clause for it passed on no samples at all
before it was taken out (14 October).

Plus what the profile derives and the sim already expresses: Victor
rolls stops with nobody about, honks at once, never lets anybody in,
never keeps right; Brenda waits for gaps twice anybody's, never honks,
lets everybody in; Hannah notices soonest. Sabotaged: rivals arriving as
ordinary drawn drivers fails Victor's, Brenda's and the stop-short checks
(Mason's lane changes passed by chance -- two changes against the crowd's
none is thin, and is reported as such).

**Honest limits of the cheap pass.** Mason's threading is lane changes for
small gains into tight gaps: real, but the traffic is not dense enough on
most maps to make it spectacular. Hannah is the steady expert in a world
with no gravel and nothing to read but traffic -- her character lives in
the county, which is unbuilt; here she reads as "the good driver". Victor's
bullying merges are his tight lane changes and gaps; nothing yet makes
anybody give way to him by intimidation.

**To judge** (`#/map` or any test map, Watch, then "Victor", "Brenda",
"Mason", "Hannah"; or drive and look for the name tags): do they read as
PEOPLE by their driving -- would you know Brenda without the tag?

### A.U.T.O. SPEAKS -- BUILT, 14 October (PLAN.md phase 2; `src/sim/events.js`, `src/sim/voice.js`, `src/content/dialogue.js`)

**The events** (`events.js`): one detector per trigger, each a comparison
of the player and the world one tick apart -- what the sim already holds,
never a judgement made here: rolling a stop sign, running a red (not in the
original list; the most serious thing a driver can do at a light), a
blocked box, a harsh stop and a short one (as stepDriver judged them), a
late signal and none at all, a lane change into a gap the car behind could
not keep half of, a horn aimed at the player, dawdling past the horn's own
3 s, a missed turn, a wide turn (as the car model judged it), keeping out
of the curb lane with no reason past KEEP_RIGHT_FAULT, crawling well under
the limit on a clear road, a collision; and the praise -- a green wave
caught, stopping for somebody on foot, letting somebody in, being let in,
merging onto the highway at its pace, passing a truck, a clean run and a
sustained streak.

**The three things the game had as mechanics and not as moments, now
noticed:** THE STREAK (fault-free distance and time; any fault restarts
it; 2 km and 5 min each noticed once per streak); THE GREEN WAVE (three
greens in a row without stopping, at the limit -- caught; brought to rest
by a red after a wave, having driven the link over 1.1 times the limit --
lost by speeding); and THE PLAYER LETTING SOMEBODY IN (a car changes into
the player's lane close in front after the player eased off).

**The voice** (`voice.js`) is the rate limiter DIALOGUE.md called the real
design problem: one line per 12 s, 4 s for something severe (a crash, a
red, a rolled stop, a blocked box); the most severe pending event and only
it; nothing older than 3 s; no line twice in a session; a trigger once
spoken to rests 2 min; speaking clears the queue. Who speaks is drawn
from the session's seeded stream: a fault is A.U.T.O.'s most often, then
Jay's, then a rival's when the rival is the other party; praise is Jay's
more than A.U.T.O.'s.

**The lines** (`content/dialogue.js`): 236, written to the record's spec
(no external file came) -- five A.U.T.O. lines and four of Jay's per
trigger, one or two from a rival where it fits, all under 90 characters,
metric, A.U.T.O. right about the stop rule. They are drawn on the canvas
under the horn for 4.5 s (`hud.js drawCaption`), never React state.

**`verify-voice`** holds the limiter as properties over half an hour of
random events (178 lines said of 1,821 noticed), the lines to their spec,
and every detector but one on its situation AND its opposite. Sabotaged
twice: the gap set to zero (it first PASSED -- the check measured spacing
against the module's own constant; it now states the record's 12 s and
4 s itself), and the rolled-stop detector removed. It found a real bug on
the way: an urgent event with no lines left let a lesser one borrow its
4-s gap. **Not tested there: stopping for somebody on foot.**

**To judge** (`#/map`, drive): roll the stop sign at the end of B-north,
run a red, sit at a clear stop, cruise in the inner lane of A-west. Is the
voice there when it matters and quiet otherwise -- and do the lines read
as A.U.T.O., Jay and the rivals?

### GOING SOMEWHERE -- BUILT, 14 October (PLAN.md item 7; `src/sim/route.js`, `src/sim/session.js`)

The deepest shared foundation: jobs, racing, pursuit and A.U.T.O.'s
rerouting all ask how to get from here to there.

**A place is the curb in front of a building, on its own side of the
road** -- the nearest curb-lane point within 25 m with the building on the
right of travel, so arriving is pulling in at the curb, never crossing
the road to it. Derived from the map's buildings, never typed in: 755 of
the stand-in city's 786 buildings have one. **A route** is Dijkstra over
(intersection, approach): a movement, then the join to the next
approach, until the place's own stretch. 0.7 ms a route on the city.

**The lane is part of the direction.** The first drive across the city
failed at once: a left was asked for from the curb lane of an arterial,
which offers none, and the car went straight on. A real navigator says
"keep left", so the screen does -- from the exit BEFORE the intersection
as well, because a short link leaves no room to move over once on the
approach (`laneFor` in route.js, the join saying which lane the car
arrives in).

The session logic (the detectors, the voice, the route) moved out of
`MapRoad.jsx` into `src/sim/session.js`, so a check can drive it where
a React screen cannot be driven. `verify-places`: places on the right
curb; every route replays along the joins and is the shortest an
independent fixed-point search finds; and a scripted player who does
only what the screen says reaches six places across the empty city
(92-178 s) and the session notices. Sabotaged three ways (the wrong
side, a search that pops the longest first, the arrival never raised);
each caught.

**To judge** (`#/map`, drive, Go somewhere): is the line on the road
easy to follow at speed, and is the lane hint early enough?

**FIXED THE SAME DAY: "nowhere to go on this map"** on every tap (the
maintainer). `#/map` runs test map 1, which has no buildings, and places
came only from buildings -- while every check ran on the city. A stretch
of curb with no building on it is now a place too (one per stretch, at
its middle): 32 on test map 1, the furthest reachable 2.2 km. Section 5
of `verify-places` holds test map 1 to it, and fails with the fallback
removed. A small map with no trip of 400 m offers the furthest it has.

### THE WORKER'S STUTTER -- FIXED, 14 October (`src/sim/pace.js`)

The maintainer: "a lot of jittering regardless of what is on screen."
Since the sim moved into a Web Worker (13 October) the page took a tick
off its clock when it SENT a step, but the stepped world only arrived
with the answer. Between the two every car was drawn a whole tick behind
where the frame before had drawn it, then jumped forward -- a 20 Hz
judder on every car, whatever was on screen. The player's own car was
stepped at send, so it ran a tick ahead of the traffic until the answer.

**No performance instrument could see it, because it cost nothing.** The
bench, `frame-cost` and the in-app meter time frames; these frames were
ordinary. The session's new per-tick work was measured too and cleared:
0.02-0.06 ms a tick against a 9-10 ms step
(`tools/measure/session-cost.mjs`).

Now: the clock comes down when the answer arrives (`pace.js`, used by
`#/map` and the bench), the player stepped for a tick is drawn when that
tick's world is, and the chase camera follows the car where it is drawn
rather than its 20 Hz pose. Measured, not watched:

- `verify-worker` section 5 drives the pacing headlessly at a phone's
  ragged 60 Hz against worker latencies of 3-70 ms: 0 frames drawn
  backwards (the old pacing: 1,200 of 3,539 at 3-15 ms, 275 at 35 ms),
  and no frame's advance off a steady car's by half a tick's travel.
- **The bench now measures motion as well as cost**: a `back` column,
  the frames that drew the world at an earlier moment than the frame
  before. It must be 0. `verify-bench` runs the bench through the real
  protocol with a stand-in worker: 0 of 589; with the old pacing put
  back, 197 of 589 -- one every tick.

**To judge** (`#/map`, drive and watch): is the traffic smooth now? If
anything still shakes, run `#/bench` with "Sim in a worker" and send the
report: `back` says whether it is pacing, the step and draw columns
whether it is cost.

**THE BENCH WAS BUILDING EVERY WORLD TWICE, AND MEASURING SOME OF THEM
STANDING STILL** (the maintainer, 14 October: "long pauses and then the
car would jump ahead"). A bench world is warmed -- run until its roads
fill -- before it is shown: 3.7 s at 100 cars and 9.4 s at 400 on the
desk (`tools/measure/bench-build.mjs`), the phone's `build-s` 6-21 s.
With the sim in a worker the PAGE built it (frozen meanwhile), then the
worker built the same world again from scratch while the page showed it
standing still, and a step that changes only what is drawn restarted the
worker and rebuilt it a third way. And the ramp's load window started
when the PAGE finished, so where the worker's build outlasted it the
step was timed over a world that was not moving: the report's 300 and
400 rows (step cost 0/0) cannot be read as the sim holding at 400 cars.

Now, with a worker: the page holds only a shell (the course, nobody on
it); the worker builds the world and the screen says it is building it;
the ramp's clock does not start until the world arrives (`perf.js`,
`loading`); a draw-only step rewinds the worker to the world as built
(`remote.js` `rewind`). `verify-bench` holds all three against the
real protocol through a stand-in worker -- including a world that takes
15 s to arrive -- and each fails with its fix taken out. The in-page
bench (no worker) is unchanged: it builds as before, inside the load
window.

**THE PAGE'S GARBAGE, AND THE LONG FRAMES IT CAUSED (15 October).** The
first clean bench report held 60 fps to 400 cars, but four frames of 50-108
ms were our own callback: the shape of a full garbage collection. Measured
on the desk (`tools/measure/page-alloc.mjs`, `gc-pressure.mjs`,
`answer-size.mjs`), the page in worker mode was making about 150 MB of
garbage a second at 400 cars.

- **The draw** (`iso/draw.js`): the horn badge built a table of every road
  user in the city, parked cars included, every frame, for nobody -- about
  half the draw's garbage; a sign's dozen boxes, a building's box and a bus
  stop's were rebuilt every frame though they never change (kept now, per
  object); every ground cell, building and bus stop in the city had a
  closure scope built for it each frame before the cull could skip it (the
  bodies are functions past the cull now, as roads and sidewalks already
  were); and array destructuring was an iterator per ground cell.
  `quad`/`seg` project into scratch. Not a pixel moves -- `verify-paint`.
- **The worker's answer** (`sim/remote.js`): 621 KB at 400 cars, 36% of it
  `memo`, each driver's memory of somebody a truck hid -- read only by
  that driver's own step; the page calls `whatStops` for the player
  alone. Not sent now; and `ratings`, `weakOn`, `stuck` -- who a driver
  is -- go once, when a driver first appears. 273 KB. `verify-worker` now
  holds the page's copy to the worker's world FIELD BY FIELD, every actor,
  all but the memory (it compared a key of a few fields before), and fails
  if the page drops who a driver is or the answer drops any other field.

Per minute at 400 cars, on the desk, twice each: full collections 7 -> 3,
minor ones 330 -> ~198, script per frame 4.4 -> 3.3 ms. The longest full
collection went 30 -> 41-50 ms: fewer, each sweeping more. What decides its
length is what the page keeps live (the map, the course, 2,600 parked
cars), which this did not touch. The phone's bench decides whether the
long frames are gone; if they are not, the next lever is the live heap.

### THE WORLD'S OWN PACE, MEASURED -- 15 October (`src/sim/pace.js` sim clock; diagnosis open)

The maintainer: *"still seeing jitter. the fps is solid but it's like the
simulation itself is slowing down."* Test map 1, on the phone, the sim in
its worker (`#/map` uses it whenever it can).

**The instrument could not see this.** Every meter measured frames. A
world running at half speed with perfect frames passed all of them -- the
same class of gap as every other here: the thing that matters was not the
thing measured. Now:
- **`#/map`'s readout** has a second line: simulated seconds per real
  second over the last 5 s, the wall ms between ticks (p50/p95/max), the
  step's cost where it ran (the worker reports its own), and the round
  trip.
- **The bench** reports the same per step (`sim-x`, `tick-p95/max`,
  `stall`, `wkr`), and **a step fails if its world ran under 0.97x real
  time or any two ticks landed more than 100 ms apart**, however good its
  frames. `verify-bench`: a stand-in worker answering in two ticks gives
  perfect 16.7 ms frames and a world at 0.499x -- the step fails; with the
  rate removed from the verdict the check fails.

**The leading hypothesis, from the pacing's own arithmetic** (not yet
confirmed on the phone): one tick is in flight at a time, the next is
asked for on the first FRAME after the answer, and owed time is capped at
two ticks. So the tick period is the round trip rounded up to a frame:
50 ms keeps real time, 51 ms is four frames and 0.75x, and a single 100 ms
step is a stall whose time past the cap is lost. A desk worker steps test
map 1 in 7.4 ms (p95 10, max 38; `tools/measure/worker-step.mjs`); a
phone several times slower, with its spikes, would wander between 0.75
and 1.0 -- smooth frames, a world that hesitates. And the PLAYER is
stepped only when a tick is sent, so their own car runs at the world's
pace: the slowness is felt as input lag. The numbers on the phone decide.

**DIAGNOSED, 15 October: the worker's way BACK.** Three phone readings on
test map 1 at 156-170 cars: step 17-21 ms, steady; wait 0.4-0.6 ms; building
the answer 0.7 ms; **back 110-179 ms**, of which reading the message (the
browser turning the answer back into objects) 65-104 ms; our own frame
3.6-4.4 ms; the browser's long tasks 2.5-2.8 s in every 5 s. The world ran
at 0.25-0.36x real time with a frame counter that looked fine. The worker
was costing six to nine times the step it carried. And the way back scales
with the cars while the step barely does -- 164 cars 110 ms, 156 cars 165,
170 cars 179: noisy, but TRANSFER VOLUME, not compute -- which points at the
payload: the whole changed world, structured-cloned every tick.

**THE PATTERN, again (DECISIONS.md 10):** every instrument measured frames,
and the frames were fine. Nothing measured whether the world kept pace with
the clock, so a sim at a quarter speed passed everything. The readout's
"sim 0.27x real time" is what caught it, and only because the maintainer
could see it.

**THE WORKER IS OFF BY DEFAULT** (`#/map`'s "Sim: page" / "Sim: worker",
the `simWorker` setting; the bench's switch starts on the page). On the page
the same step fits the tick: `tools/measure/page-loop.mjs` replays #/map's
in-page loop with each real step scaled by the phone's own factor (its
worker steps over the desk's at the same densities, about 1.6): **1.000x real
time** at 156, 164 and 170 cars, frames 33 ms where a step lands (about 40
fps), and still 1.000x at three times the desk's cost. The phone's own
"(page)" readout is the measurement that counts.

**Before the worker goes back on**, the way back is rebuilt: what the
renderer draws (positions, headings, kind, lights, lamps) packed into a
preallocated buffer and TRANSFERRED, two buffers ping-ponged, never
allocated per tick. If the way back is still a meaningful fraction of the
step after that, the worker does not earn its place and is deleted rather
than kept as an option.

### MONEY AND THE FIRST FARE -- BUILT, 15 October (PLAN.md items 8 and 9; `src/sim/money.js`, `src/sim/jobs.js`)

**Paid for skill, never time** (DAY-NIGHT.md constraint 3 and default 7).
The base is the TASK: a flag fall ($4.50) and $1.90 a kilometre of the
route as planned when the fare was offered -- so a detour pays nothing and
dawdling pays nothing. Taken off it, each named on the receipt: every
fault the game's event stream raised during the ride at its OWN SEVERITY
(4% of the base a point -- the one number that already ranks the faults, so
no second table can drift from it); time over the posted limit (1% a
second past a 2 s grace, to 30%); arriving past a reasonable time (the
route's own driving time at its limits x1.5, plus 12 s an intersection; to
20%). Contact voids the fare. A ride with nothing taken off is tipped 15%.
All flagged design constants -- the maintainer's to move.

**The taxi**: `#/map`, drive, **Taxi: find a fare** -- an offer (the pickup
120 m-1.2 km away, the ride 0.7-3 km, the clean fare quoted), Accept; the
route to the pickup; stop at the curb and stand 3 s while they get in
(move off and they are still getting in); the meter runs to the drop-off,
3 s getting out, and the receipt on the canvas: the base, what came off and
why, the tip, the balance. The wallet goes through `storage.js`.

**Three things the first drive found:**
- **A route asked for a turn no signal could make.** Test map 1's five-way
  (n2) offers two lefts from one lane, and the signal means the one most a
  left (`routeForSignal`); the planner had chosen the other, and the car,
  signalling left as told, drove to the map's edge. Routes now use only the
  movements a signal can select (`route.js` `selectable`). The other left
  is unreachable for the player at all -- a property of that five-way, not
  fixed here.
- **Standing for a fare was dawdling,** and slowing to the curb was
  crawling under the limit. The session now tells the detectors when the
  player is pulling in at, or standing at, a place they were sent to
  (`atPlace`), and those two clocks start again when the reason ends.
- **A rough script earns nothing**, correctly: braking flat at every line
  took the whole fare. So the check drives with a GOOD driver
  (`tools/lib/good-driver.mjs`): the slider where the screen's own marker
  says, the turn and lane the directions say, keeping right, waiting for
  the rules before moving off. It earns the full fare and the tip ($8.36 on
  a $7.27 quote); the same ride at 1.3x the limit earns $5.09.

`verify-money`: the fare's properties (stated without the module's own
constants -- the first version compared each cost with `PER_SEVERITY` and
passed with it set to zero), the wallet through storage, and the fare
driven end to end. Sabotaged four ways (faults free, paid by time,
standing as dawdling, routes through unselectable turns); each caught.

**To judge** (`#/map`, drive, Taxi: find a fare): does the fare feel fair
-- what a clean drive pays, what a harsh stop or a red costs? The numbers
are a first pick.

### THE GREEN, NOTICED, AND THE HORN (the maintainer, 8 October) -- BUILT

Verbatim: *"another idea for driver behavior, people responding
differently to lights turning green. some people get distracted or are
on their phones and don't start right away. Cars honking to correct the
poor behavior of other drivers should be included. a visual indicator of
honking would be helpful since 360 degree audio will be difficult to
portray on phone speakers. not every driver would also be the type to
honk right away, or at all while some might honk as soon as the light is
green."*

**Why both pieces earn their place structurally** (the brief that came
with it):
- **Reacting to a green is the best content OBSERVATION has ever been
  offered.** Failing to notice a light has changed is literally a failure
  to observe, and unlike everything that axis had before IT IS VISIBLE:
  the car ahead does not move. Observation has never dominated a fault
  kind in this project, largely because its failures left no evidence a
  player could read. This leaves evidence at every light, for every
  driver.
- **A horn is the world commenting on driving**: a teaching signal, not
  decoration. It says something was poor without a tutorial or a UI
  element -- including when it is aimed at the player, so dawdling at a
  green gets you honked at and you learn the standard by meeting it. The
  same principle as the green wave paying for good driving diegetically.
- **Who honks is personality**, derived from the axes, not a new trait.
- **The visual is a requirement**: a phone speaker cannot place a sound,
  so a horn must be seen, and say WHO and roughly WHERE, at four to forty
  pixels -- the readability family of the lamps and the lit stop lines.

**Built** (`crossing.js` `noticeAfter`/`patienceOf`, `horn.js`,
`draw.js` `paintHorns`; `verify-greens`):
- **Noticing the green is the observation axis and nothing else**: a
  driver at the head of a queue under a red, when it goes green, sits for
  their registration delay (`lagFor` -- REACTION_FLOOR plus REGISTER_SPAN
  times the observation deficit, jittered; the same draw perception uses)
  and, if the change came mid-glance (attention.js: a glance every
  LOOK_EVERY seconds, as long as that delay), the rest of the glance
  first. No new parameter. **Measured** (`tools/measure/greens.mjs`,
  going straight): sharp observers start in a median **0.8 s**, poor ones
  **1.6-2.0 s**, up to about **3-4 s** mid-glance.
- **The horn**: queued behind a car that sits at its line on its green
  with its way open -- a left-turner waiting for a gap is doing it right,
  and is never honked at -- a driver's patience runs, and when it runs out
  they honk, and again after HONK_AGAIN if it goes on. A horn wakes the
  driver it is aimed at: they start a reaction after it.
- **Patience** is the maintainer's own undue-delay standard (UNDUE_AT,
  4 s) as the driver feels it: times their caution, stretched by how
  little the rules matter to them (x (2 - compliance)), since a horn here
  corrects somebody's driving. A timid driver -- caution past the
  optimum -- never honks.

**THE INSTANT-HONKER, as asked: BOLD AND RULE-MINDED.** Low caution
(confidence's bold tail) with high compliance: patience about 0.6 s, so
the horn goes the moment the car ahead fails to move. Bold and careless
honks next (about 1 s): impatient, but not invested in anybody else's
standard. A sound driver honks only at a genuinely undue delay (4 s,
exactly the maintainer's mark); a careless sound one later still; a timid
one never. **Does it read as a type? Yes, and a familiar one**: the
commuter in a hurry who is sure the rules are on their side -- the person
who leans on the horn at a green and would never run a red. It is the
same person in both halves of the model, which is what makes it
recognisable rather than random. Measured: every horn on test map 1 over
ten minutes came from a bold, compliant driver; in the city three of four.

**Honest about the size of it.** The axis's own numbers give dawdles up
to about 4 s, so horns are RARE -- about 4 in 10 minutes on test map 1 at
120 cars, from around 140 greens -- and a sound driver almost never gets
impatient enough. Jay's "on their phones" picture is longer than that: a
5-10 s lapse at a red. The registration delay cannot produce it; a longer
glance away while STANDING (when people really do look at phones) would,
and that is a new quantity -- the maintainer's call, not made here.

**The visual** (`paintHorns`): white sound-arcs thrown forward from the
honking car's roof, opening over the 0.8 s it shows -- white with a dark
edge, a colour no lamp or light uses, so it never reads as a signal --
and, for a horn aimed at the player from off the screen, a badge on the
screen's edge on the line toward the honker, with the arcs, so a horn
from behind is still placed. Drawn over the world as information; never
under a few pixels.

`verify-greens` holds all of it, and was sabotaged four ways (noticing
not the axis; horns at cars that could not go; timid drivers honking;
the off-screen badge missing) -- each fails it.

**REBUILT, 8 October, after the maintainer drove it.** His report: *"haven't
been able to get a car to honk at me, or perhaps I haven't noticed the
visual cue. does it only work when I'm stopped at the green line? a few
places back in traffic it doesn't work. this feature should work anytime a
driver is blocked when they otherwise shouldn't be (if I stop across two
lanes for example and block the road, both drivers approaching should be
honking at me)."*

**What it actually was, reproduced before anything changed**: mostly, the
horn never fired. It fired only at a car within two metres of its stop line
on a green, and only from the car directly behind: stopped 3 or 6 m short,
stopped mid-block, a few cars back, across two lanes, in the box, at a stop
sign, or cutting somebody up -- no horn, ever. A sound driver also waited
4-7 s and a timid one never honked, so the one case that worked was slow.
And when it did fire the cue was easy to miss: thin 2 px white arcs, 8-17
px across, for 0.8 s, over a 52 px car, with no line to whom. Built for
the case that prompted it, not the rule -- the pattern this project keeps
meeting.

**THE PRINCIPLE: A DRIVER HONKS WHEN ANOTHER DRIVER'S ERROR UNREASONABLY
IMPEDES OR ENDANGERS THEM.** As built:
- **Obstructed**: stopped behind a car that is stopped with NOTHING HOLDING
  IT -- no traffic holding it, no car close in front, nobody on foot, not at
  its line under a red -- and has been so for its own registration delay
  (it gets the time to notice first: without that, a required full stop
  before a right on red drew a horn 0.7 s later). A line it is merely
  sitting at does not count (a driver who has not noticed the green is held
  by their own lapse); "at its line under a red" means within the stop-line
  loop's reach (LOOP, 10 m): stopped further back than that with the road
  empty to the line, a driver is keeping everybody behind from pulling up --
  and from the loop. Or: held at an intersection by a car standing in the
  box with nothing holding it.
- **A few cars back**: stopped behind a car that is itself stuck behind the
  offender, the grudge passes back up the queue, and every horn is aimed at
  the car causing it.
- **A near miss**: braking at more than twice a comfortable stop (the
  established line between a controlled stop and an abrupt one) for a car
  that has just come in front -- cut in, or crossed -- which, judged as if
  still at its line, did not have the way: a horn at once.
- **The player across two lanes** is in front of the traffic in both, once
  their body reaches into the next lane.
- **The player is an offender like anybody**, with a poor observer's time
  to notice (the most generous a driver gets). Patience is still
  confidence and compliance; a timid driver still never honks.

**Measured against the player** (`verify-greens` 4): 3 or 6 m short at a
signal -- honked 6.4 s into an unused green, never at the red; stopped
mid-block with three queued -- all three honk at the player, the third a
second after the first; across two lanes -- the car in each lane stops short
and honks; stopped in the box -- the crossing car honks; cutting in 9 m
ahead at 18 km/h of a car at 50 -- it brakes at 8 m/s^2 and honks at once;
waiting at the line on a red -- never, even from the most impatient driver.
**In ordinary traffic** horns are now rare and always at an error (on test
map 1 a few in ten minutes, every one a near miss or an obstruction): the
traffic seldom errs enough, and the horn is for the player.

**The cue, as a map symbol** (`paintHorns`): a white disc with a black rim
and bold sound arcs aimed at the target, never under 11 px, 1.5 s with a
pulsing ring; a bold pointer to the car it is aimed at; the badge on the
screen's edge when the honker is off it. **And a "Test horn" button** on
`#/map` (drive mode): the nearest car honks at the player at once, so the
symbol can be seen to render before anybody judges when the traffic honks.

`verify-greens` holds all of it; six sabotages -- no queue, no straddle, no
box, no near miss, no red excuse, no pointer -- each fail it.

**THE MAINTAINER'S RULING ON PATIENCE (8 October), after the rebuild:**
*"A 6s delay before a horn at a driver sitting at a fresh green is way too
tolerant. This would be more like 2-3 seconds tops."* The 6 s was two
things stacked: patience on the undue-delay standard (4 s), counted only
AFTER the other car's own time to notice (2 s). Now patience is
HONK_AFTER (2.5 s) as the driver feels it -- scaled by caution and
compliance as before -- and never past HONK_TOPS (3 s); and it is counted
from when the other car COULD HAVE GONE, so their time to notice is inside
it. Measured: a player sitting through a fresh green is honked at 2.8 s
into it; stopped mid-block, 2.8 s after stopping. The grace before a
stopped car counts as in the way is a poor observer's time to notice
(about 2 s) for everybody -- not the driver's own delay, which let a badly
distracted driver buy themselves eight seconds with the very lapse that
was the fault.

**WHAT THE NOTE MEANT, clarified by the maintainer the same day:** *"When
I was speaking of the player experience I meant that the cars ahead
honking faster solve that problem without having the player input, this
works too."* The problem is the player stuck a few cars back behind a
driver who has not noticed the green. THE FIX IS THE 2-3 s RULING ITSELF:
the cars between honk within seconds, a horn wakes the driver it is aimed
at, and the grudge passes back up the queue -- so the queue moves with no
input from the player. The player's own horn below was built on a
different reading of the note; the maintainer kept it ("this works too")
as an option, not as the mechanism.

**THE PLAYER'S HORN** (the same note: *"we think about the player
experience of being the car behind the car behind and now we have a way
to keep the player moving along while still having some world flavor"*).
A tap at the top centre of the screen (between the signal taps; `h` on a
keyboard) honks. It is aimed at whoever is holding the player up -- the car
in front, or the driver the queue has already counted in the way, or the
head of the stopped queue in front -- and it is drawn like anybody's horn,
the badge over the player's car with its pointer. A driver who has not
noticed their green, honked at, goes a reaction later: measured, from
directly behind and from two cars back past a car that would never honk
itself, the driver at the head goes within 2 s of the horn instead of
sitting ten. Knowing who is holding you up is every driver's, a timid one
included; only HONKING is temperament.

**What the other checks needed** (the new timing moved every world):
- `verify-graph`'s drain test judged "arrived while over 40" on the count
  BEFORE the tick: two cars leaving at once from 41 and one arriving to
  make 40 read as a violation. It now judges the count the spawner fills
  to, after departures.
- `verify-compliance`'s quiet right-on-red sample fell to 9 against a
  floor of 10: an actuated light comes to a car alone at it, which removes
  the occasion. Its own crossroads runs on the clock (the subject is what
  a driver does at a red); the city runs stay actuated. 21 occasions after.
- `verify-waves` counts crashes between vehicles; a heedless person struck
  is `verify-peds`' business.
- **`verify-lanes` 6 measured lane changing by its switch**, and the
  switch changes the traffic. Its ratio sat at 13-15% until actuated
  signals kept traffic moving, then at 20% -- already so at `0554afd`,
  measured side by side (`tools/measure/lane-share.mjs`) -- while lane
  changing's own code is **0.4%** of a step (`tools/measure/lane-profile.mjs`).
  The bound was being spent on the rest of the sim. As with sight (1.2.6),
  the bound is now held on the code itself, profiled; the switch's ratio is
  reported beside it. A busy loop planted in `laneStep` reads 27%.

### THE ENDLESS HIGHWAY (the maintainer, 8 October) -- BUILT

Verbatim, "when it's not too disruptive": *"build a highway map that is
an endless loop, letting me drive endlessly through traffic. if it needs
some on/off ramps to introduce new cars into the flow of traffic allow
the agent to make that determination (this would be a helpful startpos
for the player as well, rather than sitting at 0 already on the highway
starting from a parking lot just off the highway is how you'd actually
begin that journey)."*

**CORRECTED BY MEASUREMENT (8 October): the premise below was wrong, and the record keeps both.** Stage 0's ring went stale because it was ONE LANE with no way past: nobody could overtake, so everybody ended up at the slowest car's speed. Three lanes with lane changing prevent that -- the closed control (exits removed) still had its speeds spread and 400-500 overtakes a minute at fifteen minutes. So the ramps are not what keeps the loop from queueing. Their real value is the PEOPLE: with them about two thirds of the drivers on the loop turn over every ten minutes, so the characters around the player keep changing; with the exits removed, 4-9% do. And they give the merge. **NOT MEASURED: runs longer than fifteen minutes.** The closed loop's spread sagged a little over the fifteen (sd 12.6 to 11.1 on one seed), so a much longer closed run may still homogenise; nobody has run one.

The premise as briefed, kept for the record: **RAMPS ARE NOT OPTIONAL; THEY ARE THE FIX.** Stage 0's first test road
was a loop, and it was wrong for a reason recorded at the time: six cars
circulating settled into a uniform ring at the slowest car's speed and
stayed there, and after the transient there was nothing to watch. A
closed highway loop fails the same way, more slowly -- the mix
homogenises into a queue behind the slowest vehicle and the threading
the maintainer enjoys disappears. So traffic must ENTER AND LEAVE: on
and off ramps at intervals, cars joining and leaving, so the mix keeps
refreshing.

**Measured, as the point rather than a formality**: speed spread and the
overtaking rate after five and after fifteen minutes, and the loop shown
not to go stale.

**THE START: a slip road, not a parking lot -- yet.** Joining from off
the highway is how the journey really starts, and starting at 0 on a
highway is not. Parking lots do not exist (they wait on the objectives
layer, unscoped for building), so the player starts stationary on a short
slip road / service road / layby and merges into the flow. **It becomes a
parking lot when lots exist.**

**THE MERGE IS CONTENT, NOT A SPAWN MECHANISM.** Merging onto a highway
is the hardest form of gap acceptance -- at speed, with a closing
differential -- and a skill the player has not yet been asked for. It is
the opening move.

**Questions for the maintainer when it lands**: does the loop still feel
alive after ten minutes, and does joining from the ramp feel like a real
start?

**BUILT, 8 October** (`samples.js` `testLoop`, test map "Endless
highway"; `verify-loop`; `tools/measure/loop.mjs`):
- **The loop**: one carriageway, three lanes, one way round a stadium --
  2.5 km straights, 600 m bends (inside the 525 m 100 km/h needs, so no
  bend lowers the limit; the points are written to a tenth of a
  millimetre, because a 600 m bend bows 3 mm over a 4 m step and points
  rounded to the centimetre read as a 409 m bend), 10 m crests on the
  bends, about 8.8 km a lap. One way because it is one side of a divided
  highway, and so that no ramp traffic ever crosses oncoming lanes.
- **Four interchanges**, an exit and then an entrance 900 m on (two 400 m
  ramps at 35 degrees reach 330 m along the loop each, and must not
  cross), on the outside -- the right of travel. The loop has no open end:
  every car came up an on-ramp and will leave by an off-ramp. An exit is a
  right turn from the curb lane; an entrance yields to the loop.
- **The start**: standing at the far end of an on-ramp, 400 m from the
  merge -- get up to speed and take a gap at 100 km/h. A lot beside the
  ramp when lots exist.
- 12% trucks (`traffic.trucks`).

**WHAT BUILDING IT FOUND: ONE-WAY ROADS WERE DRIVEN TWO-WAY.** The format,
the loader and the renderer all carried `oneWay` -- the editor draws one,
it is drawn one direction wide with ONE WAY and DO NOT ENTER signs -- and
the graph built both directions on every road anyway. The first loop ran
two-way traffic in a one-direction carriageway: 21 crashes in three
minutes. A state the screen expressed and the sim silently did not honour
(CLAUDE.md item 6). Now (`graph.js`): a one-way road's lanes all run start
to end, centred on the road with lane 0 to the left of travel; a leg at
its start is outbound only and at its end inbound only, so nobody turns
into it against the flow; nobody spawns on it where it leaves the map;
the player's left edge is the road's own, with no oncoming carriageway.
Every one-way street on every map now runs one way -- test-signs' among
them, so its traffic moved.

**DOES IT GO STALE? Measured, and the answer is more interesting than the
premise.** Minute 5 against minute 15, 200 cars, two seeds:

| | speed sd at 5 / 15 | overtakes a minute at 5 / 15 | loop cars new since minute 5 |
|---|---|---|---|
| ramps open | 15-18 / 15-16 km/h | 89-99 / 120-227 | **62-69%** |
| exits removed (the control) | 13-14 / 11-14 km/h | 353-448 / 403-520 | **4-9%** |

The speeds stay spread and overtaking stays high EITHER WAY: three lanes
and lane changing let fast drivers get round slow ones, so even a closed
loop does not settle into a queue in fifteen minutes. Stage 0's ring
failed because it was ONE lane with no way past -- the mechanism that went
stale there is the one the sim now has. What the ramps buy is the PEOPLE:
with them, two thirds of the loop's drivers are new every ten minutes, so
the characters around the player keep changing; without them almost
nobody is. And they buy the merge. (The closed loop's spread does sag a
little -- sd 12.6 to 11.1 on one seed -- so a much longer closed run may
still homogenise; fifteen minutes is what was measured.)

**AND ITS PAINT WAS STILL TWO-WAY (9 October, the maintainer's screenshot:
"Lanes that should be road are just painted on-top of the grass, and the
auto-lane assist pulls the user between lanes").** The one-way fix made
the graph drive a one-way road one way, with its lanes centred on it; the
loader still painted it the two-way way -- a double yellow down the
middle, lane lines either side as if for three lanes each way, two of them
out on the grass beyond the three-lane surface. Every lane's centre then
lay on a painted line, so the lane assist, holding the car in the centre
of its real lane, looked as if it held it on the paint: ONE fault, not
two. Now a one-way road's lines lie between its own lanes, it has no
centre line, and its left edge is yellow and its right white, as on a real
one-way carriageway. `verify-loop` holds the paint to the lanes the sim
drives; with the loader's one-way branch removed it fails (four lines for
three lanes). One more instance of a state the sim and the screen
disagreed about -- the second half of yesterday's, found by eye.

**THE PLAYER STARTS CLEAR, WHEREVER THEY START (9 October, `drive.js`
`placePlayer`, `verify-start`).** The maintainer on `4828823`: *"the player
spawns on top of another car on the slip road, instant collision and game
over."* The cause: the slip road's open end is one of the four places that
map's traffic ENTERS, the world is warmed up before the player is placed,
and nothing cleared the start -- stage 1's guarantee (`clearAround`,
`iso/world.js`) was written for the wheel screen's one road and never
carried to the map scene. The spawner's room test already counted the
player, so it was never a NEW car: it was one the warm-up had left there.
And it was not only the slip road -- with the guarantee removed, 75 of 264
placements across every map's starts had a car on top of the player or
within 12 m, the city's default start among them.

Now every map start goes through one function. The player appears with
nobody within START_NEAR (12 m) on any lane or path, and nobody travelling
the same way behind them inside what that car needs to stop for a car
standing there -- its reaction, its comfortable stop from its own speed,
its gap -- measured in the plane, so a car across a seam is found too.
Those cars are taken off the map before it starts. A collision before the
player has had any chance to act is impossible by construction.
`verify-start` holds it at EVERY start, enumerated rather than listed --
every section of every test map, the editor's default, every edge where
traffic enters, a generated map -- 88 starts, three seeds, the player then
standing still for five seconds untouched; with the guarantee removed it
fails at 75 placements. It also found `playerOn` handing back a route that
does not exist from a curb lane with no movement out of it; that is now
"nowhere to start", which the screen says in words.

### OBJECTIVES: ALL THREE LEVELS (the maintainer, 9 October) -- PLANNING, NOT BUILT

Verbatim: *"I think the clear choice is every level needs to be present.
places feel distinct, if we give the player a storyline to follow we'll
need to send them places, and filling the world with things to do (taxi
missions, truck driving, street racing to make a few) is what makes this
worth playing."* So: distinct places (level 1), being sent places (level
2) in service of a STORYLINE, and a world full of activities -- taxi,
trucking, street racing, and more -- (level 3). Planning only until usage
allows building; open questions were put to him the same day.

**The frame these sit in is DAY AND NIGHT: [DAY-NIGHT.md](DAY-NIGHT.md)**
(9 October) -- two densities and two rule sets over one world, the
constraints that keep it honest, and the twelve open questions PARKED with
the default taken for each.

### ROADMAP, RECORDED NOT BUILT (8 October)

- **Cosmetic upgrades for the player's car, as monetisation**: paint,
  wheels, appearance. Safe, cheap, and no architectural consequence --
  the player's car is drawn from its own colour and size today, and
  nothing in the sim reads how it looks.
- **Multiplayer**: cruising the town or the highway with other players.
  One thing in its favour that is easy to lose: **THE SIMULATION IS
  DETERMINISTIC AND SEEDED** -- a stepped world where every actor decides
  from the last committed state, with every random draw from a seeded
  stream (replay is checked: the world hash). That is exactly what
  networked simulation wants (lockstep, or one server stepping one
  world). An asset worth not discarding in a later refactor: no unseeded
  random, no wall-clock time in the step, no order that depends on a
  Map's history. The honest questions it raises, NOT answered now: who
  owns the traffic (one host stepping it, or every client in lockstep);
  how the density is agreed (each phone's cap differs); what happens when
  two players are in different parts of a map (does the whole map step,
  or only near players -- the cheap-far-traffic question again); and how
  a player's car, stepped from their own controls, joins the others'
  worlds without a round trip inside a frame.

### Parking lots: the maintainer's rulings (recorded 2 October, not built)

**Rules:** standard uncontrolled-intersection rules apply inside a lot.
**But busy lots are chaotic and drivers take tight chances** -- so the
rules are the same and the RISK TOLERANCE is higher: the same gap
acceptance, with drivers in a lot accepting tighter gaps than they would
on a street (a lot-wide shift in caution, the way a district's character
already shifts its drivers -- sim/towns.js).

### Objectives: what separates traffic from life (scoped 2 October, not built)

His words: *"imagine modeling a Costco parking lot, you'd have people
entering and leaving on foot/pushing carts, loading cars, waiting for spots
in their car, circling the lot (driving to and lining up and then leaving
the gas station as well) among other things. so parking lots are a big job
and require giving our drivers objectives not just simply to reach the
other side of the map."*

**He has named the real prerequisite.** Every car's objective today is to
traverse. A lot needs cars that want to PARK, wait for a space, queue for
fuel, load, and leave -- and people on foot with errands. That is an
**objectives layer**: a car going somewhere specific to do something there
reads as inhabited; a car passing through reads as traffic.

**What already exists, in primitive form:**
- **District trips:** a car pulls out from a curb slot, drives a trip of a
  few intersections, and pulls in at a free slot (crossing.js `leaveAt`,
  parking.js) -- an objective of "go home".
- **Bus routes and stops:** a bus has a next stop, stands its dwell, is
  served, moves on (buses.js) -- an objective sequence.
- **Walkers:** out of a door, along, in at another; wait at a bus stop,
  board, alight (walkers.js) -- errands on foot.
- **Wants:** a car that needs a lane for its turn gets into it or misses
  it (lanechange.js `want`) -- the machinery for "I need to be over there".

**What an objective needs that does not exist:** a DESTINATION that is a
place rather than an edge (a lot, a pump, a door); a route chosen TO it
rather than drawn at random at each node (routing on the graph); an
ACTIVITY at the destination with its own duration and queue (park, fuel,
load); and the open-space motion a lot needs -- a lot is an area, not a
lane path (the scoping in the next section).

**How much is reusable beyond lots -- most of it.** Routing to a
destination serves every trip in the city (people drive to places, so
traffic would thicken where places are); queues at an activity serve
drive-throughs, gas stations, school drop-offs, loading zones and bus
stops; errands on foot serve every door and crossing. Only the open-area
motion is specific to lots. So the order, when it comes: destinations and
routing first (every car benefits at once), activities and queues second
(gas station first: a lane-based queue, no open area), lots last.

**THE COST, BY HOW FAR IT GOES (6 October, for the maintainer to
decide).** Measured against the code as it stands. Today every car
picks a random exit at each intersection (crossing.js `wantFor`) and
ends its trip at any free curb slot after 3 to 10 intersections
(`TRIP`). The size anchor is the bus work: stops, bays, passengers and
passing were four increments.

1. **Destinations and routing -- about one increment, the cheapest by
   far.** A trip picks a PLACE, weighted by what is there (a commercial
   block draws more than a house), and the route to it is a shortest
   path over the graph's links, compiled into the per-intersection turn
   list the sim already follows (`me.plan`, which the exam mode's
   candidates use today). The car parks in a free slot near the place;
   a walker from its door is the driver going in.
   - What it buys: traffic thickens where places are and thins where
     they are not; cars come back the way they went; a street's busyness
     says something about the city.
   - What it risks: lane changes now have to make every turn a plan
     asks for, so a missed turn needs a re-route, as real drivers do.
   - Cost per tick: about nothing. A route is computed once per trip.
2. **Activities and queues -- about one increment for the first, less
   for each after.** A gas station is a bus bay with pumps: a place
   beside the road a car pulls into, stands at for a while, and leaves.
   `buses.js` already does pull-in, dwell and pull-out, and a queue is
   cars waiting behind a stopped car, which the sim has always done. It
   needs a map element, an editor tool and drawing.
   - Drive-throughs, school drop-offs and loading zones are the same
     shape at smaller cost each.
   - Still lane-based, with no open-area motion anywhere.
3. **Parking lots -- the large one, several increments, and it
   depends on 1 and 2.** The cheaper honest version runs a lot's aisles
   as one-way lanes on the graph and its stalls as slots (`parking.js`
   already has slots, pulling in and pulling out). Circling for a space
   is then a route choice inside the aisles, people walk between car and
   door as walkers already do, and the maintainer's rulings (uncontrolled
   rules, a higher risk tolerance, recorded above) are a lot-wide shift
   in caution.
   - Truly free motion -- cutting across empty stalls, carts -- is the
     expensive part, and the part to decide whether it is wanted.
   - The bench's cap (1.2.6) matters here: a lot puts many actors in a
     small area.

**THE PLAYER'S SIDE: "I just find myself needing somewhere to go"
(the maintainer, 6 October).** Driving is the fun and free roam has no
purpose; the exam mode has one, driving does not. That is the
objectives layer from the PLAYER's side, and it is not the same as map
size. Three levels, cheapest first:

1. **Distinct places.** A downtown that feels unlike a suburb that
   feels unlike a highway, so getting from one to another is its own
   reward. Largely CONTENT, and much of it exists:
   - the brief already makes downtowns (crosswalks, people on every
     sidewalk), residential grids and arterials;
   - districts carry a driver character (towns.js);
   - the highway (next on the list) adds the third kind.

   What is missing is the player KNOWING where they are: names on the
   map, and roads that change character visibly at a boundary.
   About one increment beyond the highway.
2. **Errands: "drive to X."** A named place picked for the player (a
   door, a district, a lot later), its direction and distance on the
   HUD, arrival detected, the next one offered. The route hint is the
   same shortest path NPC routing needs (level 1 above), so built
   together they share it. About one increment, and it gives free roam
   a loop at once.
3. **Chains with stakes.** Deliveries, a fare, a schedule -- a reason
   to drive WELL as well as somewhere to drive. It needs a design
   decision about what is being rewarded, under the green-wave rule
   (every reward something a good driver would really get), and is the
   maintainer's to shape. Not costed until he has.

**Map scale, measured** (`tools/measure/scale.mjs`, the area the roads
actually cover):

| map | roads | lane-km | km^2 | of the 8 km^2 target | lane-km per km^2 |
|---|---|---|---|---|---|
| test map 1 | 16 | 29 | 1.84 | 23% | 16 |
| the city (stand-in) | 143 | 71 | 2.85 | 36% | 25 |
| the bench (medium brief) | 234 | 90 | 3.00 | 38% | 30 |
| a large brief | 435 | 150 | 5.00 | 63% | 30 |

At the bench's density, 8 km^2 is about 240 lane-km and some 620 roads.

**Whether that is drivable at the density he wants: not yet, and the
reason is the SIM, not the drawing.**

- Drawing is per visible content: the renderer culls to the view, and
  a phone sees four to nine 256 m chunks of any map, however big.
- The sim steps EVERY car, walker and crosser on the map every tick.
  Nothing in `src/sim` uses chunks; they only narrow who a car asks
  about. So the sim's cost grows with what the map holds, not with
  what is on screen.
- The phone held 150 cars steady on the bench (1.2.6), which is 1.7
  cars per lane-km. The same 150 cars on an 8 km^2 map is 0.6 per
  lane-km: drivable but sparse.
- Keeping the bench's density needs about 400 cars, beyond the phone's
  cap at today's cost per car.

**The answer is the one 1.2.2 named for stage 5: simulate far traffic
cheaply.** Full decisions for cars near the player, and something far
lighter for the rest -- moving along their lanes at the road's speed,
promoted to full decisions as they come near. That is the piece of
work that makes an 8 km^2 city with Jay's density possible on the
phone, and it is a performance increment of its own.

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
