# DISTRICTS — five district briefs (recorded 14 October 2026, CONTENT ONLY, NOT BUILT)

**Authored externally** (the maintainer, with another model). Stored as DATA
beside the dialogue and the jobs -- **`src/content/districts.json`**,
pending: the file is to be pasted by the maintainer and committed as
given. Five briefs -- Industrial and Port, Suburbs and Retail, Downtown and
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

## TWO CORRECTIONS, FLAGGED BACK TO THE MAINTAINER -- NOT DECIDED HERE

1. **"Cautious drivers stop five metres short"** (Suburbs). The model stops
   a knowledge-weak driver short by up to **3.2 m** (`STOP_SHORT`,
   `traffic.js` -- the old engine's own `stopsShort`), and it is the
   knowledge axis that does it, not caution (the maintainer's ruling: a
   controlled stop in the wrong place is knowledge). Which is right -- the
   brief's 5 m, or the constant? And should caution add to it?
2. **"Interstate Connector"** (Highway Network) is American: Ontario has no
   Interstates. It also sits oddly beside **"Highway 401"**, a real Ontario
   road -- does the maintainer want real road names used directly, or
   fictional ones in the Ontario style?
