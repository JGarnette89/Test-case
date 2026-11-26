# PROPOSAL: your own town, built from rewards (26 November 2026)

**A PROPOSAL, NOT RULED. Nothing is built from it until Jay answers section 5.** The standing instruction applies: "I want to avoid adding 50 half-cooked features" (DECISIONS 10.38). This is the layer AFTER the round loop is fun on its own (slices 9 and 10 first).

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

1. **Release (asked again, more specifically; open).** The first version people download, with ads, could ship in one of two ways:
   - (a) the rounds alone, with the town added in a later update; or
   - (b) not until the town is in it.
2. **"Actually drive through it": RULED, Jay: "Chained, predetermined route."** A route through the town is a fixed chain of decisions, and the car drives itself between them. Not free driving.
3. **Plot sizes: RULED, Jay: "3 is exactly my thoughts."** Three sizes: small, medium and large.
4. **Where rounds come from (asked again, more specifically; open).** Today every round is a random intersection on the project's fixed test maps. Once a player owns a town, should:
   - (a) every round happen in their town; or
   - (b) a starting set stay on the fixed maps (before the player owns anything, or as a separate mode), with the town's rounds beside it?

## 6. The smallest version that tests the idea

- A starter town of one crossroads.
- Three plot slots around it, in one size, filled by `fillZone` as it is.
- Rounds drawn from the town's intersections.
- One upgrade tier that adds a signal.

It shows whether owning a place keeps a player coming back, before any of the expensive parts.
