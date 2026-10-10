# DAY AND NIGHT — the player's two lives (recorded 9 October 2026, NOT BUILT)

The maintainer's design direction, verbatim:

> "there is a dual personality to the player. day time (driving tasks,
> legal) and night time (less or illegal). the player should benefit from
> good driving in the daytime with fewer stops but we want the player
> almost always actively navigating traffic and obstacles anyways, whereas
> the night time play is for racing and driving amongst more empty streets
> (except for example a downtown night club district). earn during the day
> to tune up your ride for the night time scene, use those good driving
> skills to make big money in different scenarios."

Planning only. Nothing here is built; it is the frame the objectives work
(SIMULATOR.md, "OBJECTIVES: ALL THREE LEVELS") will be built inside.

## The structural point: DAY AND NIGHT ARE NOT TWO GAMES

They are **two traffic densities and two rule sets over one world.** The
driving model does not change; the context does.

- **Density is already a dial**: `seedGraph`'s `target`, per map
  (`map/cars.js`), live on `#/map`. Night is the same world with the dial
  turned down -- and kept up in the places night is busy.
- **Breaking the rules knowingly is already modelled**: the COMPLIANCE axis
  (`core/driver.js`; R2-DESIGN.md 17; `verify-compliance`) describes
  drivers who know a rule and choose not to keep it -- the scofflaw who
  rolls a stop only with nobody about. **At night the PLAYER becomes a
  low-compliance driver by choice**, using the same model that was built
  to describe the NPCs. The symmetry is the design: the player's night is
  what the traffic's scofflaws already are, and the world already knows
  how to react to it (horns, the near-miss rule, crashes that stand).

## It solves the purpose problem

The maintainer, weeks earlier: *"I just find myself needing somewhere to
go."* Day gives him **jobs**; night gives him **stakes**; the **economy**
links them -- earn by day, spend on the car for the night. That is a LOOP,
which free roam does not have at all today.

## Design constraints (recorded so they are not left implicit)

1. **FEWER STOPS MUST NOT MEAN LESS TO DO.** Good driving by day is
   rewarded with fewer stops, AND the player should be almost always
   actively navigating. Those pull against each other unless the reward is
   **CONTINUOUS MOTION, never an easier drive.** The green wave
   (`sim/progression.js`; SIMULATOR.md "green waves"; `verify-waves`) and
   the actuated lights (`sim/actuated.js`; the "GOOD DRIVING IS PAID IN
   FLOW" ruling) are exactly that: the reward is that you keep moving, and
   moving through traffic IS the activity. **The reward for good driving is
   flow, never idleness.**

2. **EMPTY STREETS ARE A RISK, NOT A FEATURE.** The maintainer's own
   verdict is that the pleasure is threading traffic (SIMULATOR.md, "THE
   PLEASURE IS IN THREADING TRAFFIC"). An emptier night removes the thing
   he enjoys **unless something replaces traffic density as the source of
   difficulty** -- speed, racing against others, consequence, pursuit.
   Night must SUBSTITUTE a difficulty, not simply have less. **The nightclub
   district is valuable precisely because it keeps one place dense** at
   night: the threading survives there, with different people in it.

3. **THE ECONOMY PAYS FOR SKILL, NOT TIME.** The project's standing rule:
   every reward must be something a genuinely good driver would get. So
   earnings track **driving quality, not hours spent** -- or it becomes a
   grind, which would also undermine the day's purpose. A smooth fare pays
   more than a rough one; a clean delivery more than one that drew horns.
   Measured against the same standards the sim already holds the traffic
   to (smoothness, the limit, the horn as the world's verdict, near
   misses).

## The parked questions, and the default taken for each

Put to the maintainer on 9 October and PARKED by instruction: no budget to
answer them now. Work proceeds on these defaults; they are not to be
raised again until there is budget, and any of them is overturned by a
word from him.

| # | Question | Default taken |
|---|---|---|
| 1 | Street racing vs "the traffic law cannot be humoured" | **Both**: sanctioned events (closed course; the game says the law does not apply there) and illegal night street racing, which the game always judges AS illegal -- consequences follow. The law is never misdescribed. |
| 2 | Demerit points (Ontario-style) | **Yes**, day and night, decaying over time; a suspension is the failure state (lose the licence, lose the day jobs until it is back). |
| 3 | What the player earns | **Money**, by skill (constraint 3); spent on tuning and the car's look (the cosmetics roadmap item) and on licence classes. |
| 4 | Police | **Yes, as actors**, mainly at night; built after racing exists, since pursuit is one of night's substitute difficulties. |
| 5 | Storyline frame | **A driver building a life in one town** -- day work, the night scene -- which is the shape of this direction. Purgatory stays parked. |
| 6 | The examiner game | **A day job**: work as an examiner. The shelved exam mode returns as content. |
| 7 | Taxi standard | Smooth (no harsh braking or acceleration), at or under the limit, no horn aimed at you, arrival in reasonable time; the fare scales with it. |
| 8 | Trucking | Its **own vehicle** (the `VEHICLES` truck row: slower, longer stops, wide turns), unlocked by a licence class bought with day earnings; trailers later. |
| 9 | Other activities | Delivery runs, a bus on a schedule, driving lessons/examining; emergency vehicles later. |
| 10 | Names and world | A **fictional Ontario-feeling town** on the single handmade ~8 km^2 map of the original plan (SIMULATOR.md). |
| 11 | How missions are offered | A **phone/dispatch screen plus map markers**. |
| 12 | Which activity first | **Taxi**: reuses errands, the smooth-driving standard and the horn as feedback; the purest "a good driver is rewarded". |

## Cross-references

- Green wave and actuated lights -- the day's reward as flow: SIMULATOR.md
  ("GREEN WAVES", "GOOD DRIVING IS PAID IN FLOW", "ACTUATED SIGNALS").
- Compliance -- the night's player as a chosen scofflaw: R2-DESIGN.md 17,
  `core/driver.js`, `verify-compliance`.
- Threading traffic as the pleasure: SIMULATOR.md, "THE PLEASURE IS IN
  THREADING TRAFFIC".
- The objectives levels this sits over: SIMULATOR.md, "OBJECTIVES: ALL
  THREE LEVELS".
