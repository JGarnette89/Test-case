# CHARACTERS — five people as axis profiles (recorded 13 October 2026, NOT BUILT)

From the maintainer's CHARACTERS document (written with another model;
recorded from its summary -- the original is not yet in the repo). Setting
and campaign: [STORY.md](STORY.md).

**CAST CHANGED, 3 November (STORY.md, Red City).** Five SPECIALISTS ("the
Connects") replace four rivals, under a new mentor, **Artie Brooks**
(dispatcher). Victor Braga: industrial freight. Brenda Braga: the suburbs
**and the exam mode** -- an authority now, not only a timid driver. **Maya
Lin** (downtown, night) where Mason "Swerve" Lin was; **Hank Miller** (rural)
where "Grizzly" Hannah Miller was; **Zane "Slip" Gault** (highways) is new and
gives the Highway Network district its person. Whether Maya and Hank are the
same people renamed, whether Jay stays, and whether these five are still
anyone's RIVALS are open (STORY.md section 5). The code still names Mason
and Hannah (`sim/rivals.js`, `content/dialogue.js`). What follows is the
13 October record, and its axis reasoning stands whatever the names become.

## They are axis profiles, which makes them cheap

Every driver in the sim is five skills and compliance (`core/driver.js`:
observation, confidence, steering, braking, knowledge; compliance beside
them). A rival is a profile on those axes, and the sim already turns a
profile into behaviour. **Who they are is cheap. Where they live is
expensive** (below).

| Character | Territory | Driving | Axis profile |
|---|---|---|---|
| **A.U.T.O.** | the whole grid | the system, not a driver | -- |
| **Jay "The Clockmaker"** | -- | the mentor | (a mentor; not a rival profile) |
| **Victor Braga** | industrial district and port | aggressive gap-forcing, bullying merges | high confidence, **no caution** (confidence's bold tail), **low compliance** |
| **Brenda Braga** | suburbs | ultra-conservative: early braking, stopping ten feet short of lines, over-yielding | **confidence's TIMID tail**, maximum compliance |
| **Mason "Swerve" Lin** | downtown and the nightclub district | precision gap-threading at speed | high confidence AND high skill (steering, observation) -- bold but able |
| **"Grizzly" Hannah Miller** | the rural county | rally weight transfer, gravel drifting | high observation and steering |

**BRENDA VALIDATES A DECISION THAT HAD ALMOST NO CONTENT.** The two-tailed
confidence axis was argued for on the grounds that being bad at BOTH ends
makes drivers feel like people (CLAUDE.md, "Confidence is two-tailed";
`cautionOf`), and the timid tail has had barely any expression. Brenda is a
driver who commits faults by being TOO careful -- and the sim already
expresses her: `stopsShort` (stopping short of the line), undue delay
(waiting past an opening), the timid caution margin, and the horn's
timid-never-honks. She is the first character the timid tail was built for.

**CORRECTED, 14 October:** `stopsShort` was the OLD ENGINE's; the
simulator had no stopping short at all until the rivals' cheap pass added
it, derived from the knowledge axis for every driver (SIMULATOR.md, "THE
RIVALS, CHEAPLY"). Undue delay, the timid margin, courtesy and never
honking were already the simulator's.

Mason is the player's own fantasy -- bold AND good -- which is the
combination the axes separate most cleanly (a bold driver with poor
observation is the dangerous one; with good observation, the fast one).

## Where they live is expensive -- unbuilt

Each rival's territory needs content that does not exist:

- **Gravel and wet surfaces** (Hannah), and **drifting / weight transfer**
  -- the player's car model (`sim/player.js`) has grip, not a slip model.
- **Livestock and farm equipment** (the rural county).
- **School zones** (the suburbs).
- **Police pursuit** (night; DAY-NIGHT.md parks police as actors, after
  racing).
- **Head-to-head racing** against a named rival.
- **A.U.T.O.'s punishment side** (STORY.md).

## The name: BRAGA (the maintainer's choice, 13 October)

The documents named them Victor and Brenda **Vance**. "Victor Vance" is a
Grand Theft Auto character, so both changed before anything ships, and they
stay one family: **Victor Braga** and **Brenda Braga**. Braga replaces the
borrow everywhere.

## DECIDED, 13 October: RIVALS CHEAP NOW, HEAVY WORK UNDERNEATH

The maintainer, verbatim: *"rivals are cheap now, but we need to get the
heavy work underway so it can sit underneath the rest."*

**First, cheap: the five recognisable in the world that exists**, as axis
profiles -- Victor forcing gaps, Brenda stopping short and over-yielding,
Mason threading at speed, Hannah reading obstacles -- to test in front of
the maintainer whether they read as PEOPLE before their worlds are built.

**Then the heavy work, and the line is SHARED FOUNDATION versus DISTRICT
DECORATION** -- build what every district needs, not what one district
needs:

| shared, underneath everything (now) | district-specific (later) |
|---|---|
| head-to-head racing -- all four rivals need it | school zones |
| police pursuit -- the night's, not one place's | livestock |
| road surfaces beyond asphalt -- Hannah's, and weather reuses it | farm equipment |
| A.U.T.O.'s punishment side -- city-wide (STORY.md) | nightclub crowds, loading docks |

Sequenced after courtesy gaps and the Web Worker.

## DECIDED, 13 October: THE FAMILY IS BRAGA

Both changed and stay related. Offered Voss (the minimal change), Varga and
Thorne; the maintainer chose **Braga**. See "The name", above.
