# STORY — Metro Grid and A.U.T.O. (recorded 13 October 2026, NOT BUILT)

Direction from the maintainer's STORYLINE document (written with another
model; recorded here from its summary -- the original is not yet in the
repo). Direction, not specification: where it conflicts with what exists,
the conflict is recorded beside it rather than either side adopted.
Characters: [CHARACTERS.md](CHARACTERS.md). Vehicles and the garage:
[VEHICLES-GARAGE.md](VEHICLES-GARAGE.md). The day/night frame it sits in:
[DAY-NIGHT.md](DAY-NIGHT.md).

## The setting

The city is **METRO GRID**, governed by **A.U.T.O.**, a municipal AI that
monitors speed, lane discipline, gap selection and signal compliance. It
REWARDS compliant drivers with green waves and PUNISHES others with
artificial reds, speed governors, forced rerouting into congestion and
automated fines.

**This is a straight upgrade to the green wave's justification.** It stood
as "signal progression is real, so this is not magic" (SIMULATOR.md,
"GREEN WAVES"; `sim/progression.js`; the "GOOD DRIVING IS PAID IN FLOW"
ruling; `sim/actuated.js`). A.U.T.O. makes the mechanic the setting's
central fact -- and supplies the PUNISHMENT half, which had no story at all.
Note what it monitors is close to what the sim already measures: speed
(the posted limit), lane discipline (lane-keeping, keep-right), gap
selection (the confidence axis), signal compliance (reds, ambers, the
compliance axis).

**Unbuilt: the whole punishment side** -- artificial reds, governors,
forced rerouting, fines. Today the lights reward (loops, waves) and never
target a driver.

## The campaign: three acts

- **Act I.** Your examiner licence is revoked for passing a driver who
  drove safely but violated an arbitrary AI directive. **This is the
  knowledge-versus-compliance distinction the simulation already models**
  (`core/driver.js`; R2-DESIGN.md 17; `verify-compliance`), turned into a
  plot: the system punishes the rule broken, not the danger caused, and the
  examiner judged the danger. You start an underground academy.
- **Act II.** District territory wars against rival fleets: train students
  by day to raise a district's **ZONE QUALITY**, race rivals at night for
  territory.
- **Act III.** A.U.T.O. locks the grid. The climax: a synchronised convoy
  of graduates holding a green wave across four sectors to overload it.

## Zone Quality resolves an open question

When the driving school was first proposed (DRIVING-SCHOOL.md) the risk
flagged against it was that **a town improving might be measurable but not
perceptible**. Zone Quality gives it a channel the player feels in their
hands: **raise it and signal delays ease.** That was the risk most likely
to sink the school idea, and this answers it. It also has a mechanism
already half-built: district characters (`sim/towns.js`) weight which axis
a district's drivers are weak on, so a district's drivers getting better is
a re-weighting the sim can express, and its signals easing is a change to
the loops and waves that already run.

## Implied features that do not exist

- **The convoy climax**: several AI cars keeping a progression AS A GROUP
  (platoon control). Today each car drives alone and a wave is only timed
  lights; nothing holds a formation.
- **A.U.T.O.'s punishment side** (above).
- **Zone Quality** as a stored, changing quantity per district, and its
  link to signal timing.
- **Territory**: districts owned, contested and changing hands.
