# DISTRICTS — five district briefs (recorded 14 October 2026, CONTENT ONLY, NOT BUILT)

**Authored externally** (the maintainer, with another model). Stored as DATA
beside the dialogue and the jobs -- `src/content/districts.json`.

**NO SOURCE FILE IS COMING (the maintainer, 14 October).** This record
-- written from the maintainer's description of the external set -- IS the
source. When the content is built, it is written here, against this record
and the decisions below, and stored as data then. Five briefs -- Industrial and Port, Suburbs and Retail, Downtown and
Nightclub, Rural Outer County, and the Highway Network -- each with a name,
driver feel, street layout and road mix, characteristic hazards, building
style, a street-naming convention with six examples, and three or four
landmarks. See [CHARACTERS.md](CHARACTERS.md) for whose district is whose,
[JOBS.md](JOBS.md) and [DIALOGUE.md](DIALOGUE.md) for the other two content
files, and [PLAN.md](PLAN.md) for when any of it is built.

## A DESIGN FINDING: EACH DISTRICT HAS A DIFFERENT RELATIONSHIP TO THE GREEN WAVE

It emerged from the geography rather than being designed, and it is what
makes the districts worth building rather than re-skins: **the core
mechanic means something different in each place.**

| district | its signals | what the wave is there |
|---|---|---|
| **Highway Network** | ramp meters only | speed discipline pays most -- holding the speed is the whole game |
| **Industrial and Port** | long signal phases | waves are long but slow: rhythm over patience |
| **Suburbs and Retail** | stop-sign controlled | no waves at all; compliance is everything |
| **Downtown and Nightclub** | closely spaced lights | reaction over rhythm -- which independently matches the measurement that the wave's effect is modest on short city links (SIMULATOR.md, green waves) |
| **Rural Outer County** | no signals | the wave is irrelevant; surface grip decides everything |

So a district is a different QUESTION asked of the same driver, not the
same question in different paint -- the property the plan's "shared
foundation versus district decoration" rule exists to protect.

## OUTSIDE THE BUILDABLE PALETTE -- each to be cut or added deliberately, never assumed

- **Service alleyways**: not a road class (`format.js` KINDS).
- **Multi-lane roundabouts**: not built; the existing roundabout is a
  single circulating lane.
- **Roadside ditches**: need terrain below road level, which the map's
  ground does not have.
- **Slow farm machinery**: a vehicle class that does not exist (a row in
  `VEHICLES`, with its own speed and size; district decoration).
- **Overhead sign gantries**: new objects.
- **Ramp meters**: new but trivial -- a traffic light on a slip road, the
  signal machinery as it is.

Everything else in the briefs is buildable as written.

## TWO CORRECTIONS -- DECIDED BY THE MAINTAINER, 14 October

1. **Stopping short: 3.2 m stands.** The brief's "cautious drivers stop
   five metres short" is the external model's mistake. Verbatim: *"If our
   drivers will only stop up to 3.2m short, that is the number we will go
   with."* The model's `STOP_SHORT` (`traffic.js`), from the knowledge
   axis, is the number; whatever is written for the suburbs
   describes it as the model does.
2. **Names: functional, North American, in an Ontario context -- the city
   is modelled on no one place.** Verbatim: *"We want functional names that
   wouldn't be out of place throughout North America, most will
   unavoidably exist somewhere in the real world though we aren't modeling
   our city after one specific place."* So **"Interstate Connector"
   becomes "Expressway Connector"** (Ontario has expressways and numbered
   provincial highways, no Interstates). The same rule applies to every
   name in the file: a name that reads as a generic North American road
   (King Street, Mill Road, Harbour Drive) is fine even though somewhere
   has one; a name that pins the city to one real place is not -- so a
   named real route like **"Highway 401"** is not used: the highway takes a
   number of the same kind that does not single out one real road.
