# PROPOSAL: your own town, built from rewards (26 November 2026)

**RULED IN DIRECTION (26 November): the town is IN the first release, and the player plays their own town as it grows.** Section 4's two points are still open, and section 7's order is the planner's. The standing instruction applies: "I want to avoid adding 50 half-cooked features" (DECISIONS 10.38). This is the layer AFTER the round loop is fun on its own (slices 9 and 10 first).

## 1. Jay's idea, in his words

- "let user build their own world with the reward for beating levels... the player can build their own traffic network and actually drive through it. Higher difficulty routes and roads would yield bigger rewards and a reason for the player to keep playing at all"
- "The building process for the road network would be extremely simplified. The user picks a space (maybe of varying size worth more or less, bigger spaces have more intricate roads and obstacles) and the generator fits it with the existing network"

## 2. The loop

1. Rounds earn stars (the round loop as it is).
2. Stars buy a **plot**: an empty space beside the town, in a few sizes. A bigger plot costs more.
3. **The generator fills the plot** with roads and buildings, joined to the town's existing roads. The player chooses where and how big. The generator chooses the streets.
4. **Rounds are drawn from the town's own intersections.** A bigger, busier plot brings harder decisions, and harder decisions pay more stars.

## 3. What already exists, and what it does not do yet

**Exists:** `src/map/generate.js`.
- `fillZone(map, zoneId, { seed })` fills a polygon with local streets, deterministically.
- A street that reaches the edge ends ON the road there (`SNAP`, 25 m). A dangling end is trimmed. An island nobody can drive into is dropped.
- Controls come from the established rules: a T's stem stops, and a local crossroads is an all-way stop.
- `fillLots` puts buildings along the frontages.
- `verify-generate` holds all of this, including traffic that never overlaps.

**Missing:**
- **Size buys intricacy.** Today a district's kind and density set its block size, and nothing makes a bigger plot more intricate. "More intricate roads and obstacles" means the generator choosing, by plot size and tier:
  - more lanes;
  - signals and protected lefts (`sim/signal.js`, `map/bays.js`);
  - bus stops (`sim/buses.js`);
  - crosswalks and people (`sim/peds.js`);
  - trucks hiding things (`sim/sight.js`).
  All of these exist in the sim; none is placed by the generator yet.
- **Rounds drawn from a player's town.** Today rounds come from `src/game/rounds.js` pools on fixed maps. Drawing them from any map needs the pool criteria applied to that map's intersections, measured, never typed in (GAME.md rule 1).
- **Traffic from inside the town.** A closed town is fed by its buildings and parked cars (`sim/parking.js`), as the generated city already is. The stand-in city took 6 to 8 s to build on Jay's phone `[M, DECISIONS 10.63]`. A starter town is far smaller; this is unmeasured.
- **Saving the town** through `src/storage.js`. A town is a seed and a list of plots, so it stays small.

## 4. Two things to settle before building

- **DECISIONS 10.63 ruled mission areas AUTHORED, because "a generator cannot supply intent."** A plot is not a mission area: its intent is the tier the player paid for, which the generator CAN express as which features it places. This should be said and ruled, not slipped past.
- **The reward must be measured, never priced by label.** A round's payout comes from how hard its decision actually was: the traffic at the lines, the conflicts, the gap the player took. A plot's price can be set by hand, `[invented]`. What it pays out cannot be (GAME.md rule 1).

## 5. Questions for Jay, and his answers (26 November)

1. **Release: RULED, Jay: "Yes the town is in the first release."** It was asked as follows. The first version people download, with ads, could ship in one of two ways:
   - (a) the rounds alone, with the town added in a later update; or
   - (b) not until the town is in it.
2. **"Actually drive through it": RULED, Jay: "Chained, predetermined route."** A route through the town is a fixed chain of decisions, and the car drives itself between them. Not free driving.
3. **Plot sizes: RULED, Jay: "3 is exactly my thoughts."** Three sizes: small, medium and large.
4. **Where rounds come from: RULED, Jay: "My thinking is you play your own town as it grows."** Every round is in the player's own town, from the first round on. It was asked as follows. Today every round is a random intersection on the project's fixed test maps. Once a player owns a town, should:
   - (a) every round happen in their town; or
   - (b) a starting set stay on the fixed maps (before the player owns anything, or as a separate mode), with the town's rounds beside it?

## 6. The smallest version that tests the idea

- A starter town of one crossroads.
- Three plot slots around it, in one size, filled by `fillZone` as it is.
- Rounds drawn from the town's intersections.
- One upgrade tier that adds a signal.

It shows whether owning a place keeps a player coming back, before any of the expensive parts.

## 7. What the rulings change, and the order (planner, 26 November)

**The fixed test maps become a stand-in.** If rounds always come from the player's town, then:
- the first round is played in a **starter town** the player owns from the start;
- the round pools in `src/game/rounds.js`, measured on fixed maps today, have to be measured on any town;
- a town has to give enough different decisions, or the rounds repeat. A starter town of one crossroads would repeat at once.

So the starter town is a small generated neighbourhood: a few intersections of different kinds, a T with a stop and an all-way stop at least `[invented]`. Its size is measured by how many different decisions it gives, never chosen.

**The order, each step something Jay can play:**
1. **Rounds from any map.** The pool criteria run on a map's intersections, measured, not listed by hand. Proven on the existing test maps first, so nothing changes for the player yet.
2. **A starter town.** Generated from a seed, saved through `src/storage.js`; every round is played in it.
3. **Plots.** Stars buy a small, medium or large plot beside the town. `fillZone` fills it, joined to the roads around it, and its intersections join the round pool.
4. **Size buys intricacy.** Medium and large plots bring signals, more lanes, crosswalks with people, and bus stops, from the sim's existing pieces.
5. **The chained route.** A predetermined route through the town as a chain of decisions, the car driving itself between them.

Slices 9 and 10 (the boost and the look) finish first.
