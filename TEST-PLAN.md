# Testing plan — 18 September 2026

*For the maintainer's session. Ordered so the first hour answers the
questions that decide everything else. Every screen listed was rendered
under the headless check and opened in a real browser on 17 September:
all mount, no console errors, production build clean. What none of that
can tell is how anything MOVES — that is what this session is for.*

**Use a real browser, not the preview pane.** The pane delivers no
animation frames; nothing will move in it. Phone or desktop browser at
the dev server (`npm run dev`, then `http://localhost:5173/#/...`), or
the built `dist/`.

**How to report a finding**: the route, the seed (every sim screen shows
it; "another route" / the restart button advances it), the control
settings, roughly when it happened, and what you saw. A seed reproduces
the drive exactly, so a seed plus a time is a repro.

---

## 0. Before anything else: what is half-built, off, or known to look wrong

So nothing below is mistaken for a discovery:

- **Perception lag is OFF by default.** The candidate's observation
  rating does nothing in any screen today. It is built and measured, and
  it is off because a bold candidate who perceives 0.55 s late keeps a
  0.39 s headway and rear-ends the car ahead — and **contact has no
  response in the sim**: nothing draws a collision, nothing ends the
  drive. Until that exists (stage 5), observation is inert. If you see two
  cars occupy the same road anyway, that is a real finding — the checks
  say it never happens at the densities they run — report the seed.
- **Turn speed is wrong and known to be.** Nothing in the sim knows a
  corner is coming, so a car takes a turn at whatever speed it arrived
  at. At an all-way stop everybody stopped so it is hidden; on a two-way
  stop's through road, left turns run at up to 78 km/h. It waits on your
  ruling (question D3 below).
- **A right turn's arc is 3.85 m**, tighter than a car can steer, and it
  passes 0.95 m outside the curb corner — so a car weaving right clips the
  corner by 8 cm. Known; question D1.
- **The weave is invisible in the chase view** (0.38 m of stray is under
  a pixel at that zoom) and is shown as a number — "off line" — instead.
  The fixed view shows it. This is expected, not a bug.
- **The wide line on a bend shows only on RIGHT-hand bends** (the outside
  is the oncoming lane); on left-hand bends it declines, following your
  wide-turn ruling that off-road is rare. Question D4.
- **Traffic on the course is sparse**: at the course's spawn rate the
  through road offers a car every ~15 s, so gap acceptance rarely bites
  there. The crossing screen has denser settings. A density fix is
  scoped, not built.
- **The load meter's effect is modest**: a ragged driver told three
  ahead strays 0.900 m instead of 0.765 m. Real, bounded, small.
- **The old-engine drive (`#/drive`) is the previous foundation**, kept
  for comparison. In the frozen first frame the first instruction's
  callout reads "Too late to be followed" before the candidate has gone
  anywhere. That may be an artifact of a clock that has not started, or a
  bug; it takes you three seconds to tell.
- **No sound, no signals as content, no pedestrians in the sim screens,
  no weather, one vehicle size.**

---

## 1. `#/sim` — stage 0, following (5 minutes)

Six cars on one road, each wanting a different speed, deciding from what
they can see of the car ahead. Controls: speed limit 30 / 50 / 60 / 100.

**The question**: does traffic that queues, closes up and spreads out
read as drivers, or as sprites? You said the traffic looked great at
100 km/h once; check that still holds at 30, where following is
tighter.

**A bad answer**: cars that stop and start in lockstep, a car that
plainly drives into the one ahead, braking that looks like a wall
(everything stops at once), or nothing that reads as a decision.

---

## 2. `#/crossing` — stage 1, taking turns (15 minutes)

An intersection with nobody directing. Controls: All-way / Two-way,
Quiet / Busy / Relentless, 30 / 50 / 60 km/h. A dawdling count appears
when somebody has waited past the competent opening.

**All-way stop, Busy.** The question: does arrival order read? Whoever
stopped first goes; arriving together, the car on the right; a left
yields to the oncoming. **A bad answer**: two cars go at once, a car
enters while another is still in its path, a queue that never clears, or
a driver who sits with nothing coming.

**Two-way stop, Busy then Relentless.** The question: does the through
road read as a through road (it never stops), and does the minor road's
wait read as gap-finding rather than a rule firing? Watch the minor-road
queue for one car that goes on a gap you would have taken, and one that
waits on a gap you would have refused. **A bad answer**: the through
road stops for the side road; a minor-road car pulls out into a car that
then has to stand on the brakes; the side road never gets out at
Relentless (starvation is a finding, not a mood).

**Undue delay.** When "dawdling" appears, was that driver actually
sitting on an opening you would have taken? The rule marks them 4 s after
the first opening a competent driver could have acted on, reading
openings as *time since the opening appeared* rather than one unbroken
gap (question D6).

---

## 3. `#/candidates` — stage 2, the first falsification test (20 minutes)

Two candidates, the same seeded traffic, the same route, names hidden
until you ask. This is **the test that decides the driving-school idea**
(DRIVING-SCHOOL.md section 6): can a player tell two rated drivers apart
by watching?

Do it as an experiment, not a tour. For each pair below, watch for a
couple of minutes without revealing, say out loud which is which and
why, then reveal:

| pair | what should give it away |
|---|---|
| Sound vs Hesitant | the wait at a two-way stop line: gaps refused |
| Sound vs Pushy | gaps taken early; more trips completed |
| Sound vs Ragged | the line: use the fixed view; the drift number |
| Sound vs Heavy-footed | braking left late on the approach to a stop |
| Sound vs Unschooled | stop signs rolled when the road is free |

Record for each: **told apart, guessed, or could not**. Also try
Two-way vs All-way: Hesitant should be indistinguishable from Sound at
an all-way stop (nobody judges a gap there) — that is correct, and it is
why a course needs more than one kind of place.

**A bad answer** is not "I could not tell Ragged from Sound at chase
zoom" — that is expected and documented. A bad answer is any pair that
cannot be told apart in the view where it should show, because then the
school cannot be built on it.

---

## 4. `#/course` — stage 3, the curve, the load: the main event (45 minutes)

A 3×2 grid of intersections, roads between them, a candidate with a
route, you giving the directions, a sheet after every three
intersections. Controls: play/pause, restart, "another route" (new
seed), Chase / Fixed, 2 in a row / 3×2, Two-way / All-way, Bends /
Straight, candidate picker, three direction slots ("at the next",
"then", "after that"), "Mark that", the load line ("carrying N ·
composure X%").

Take these in order:

**4a. The road bends.** Bends on, Chase view, Sound candidate. The
question: does a car follow the bend, and does the road look like a road
that bends? The road is drawn from the path now, so a car off the tarmac
is a bug. **Bad**: a car cutting across grass, a kink at the point where
two intersections' roads meet, a bend that looks like a corner.

**4b. Is 189 m "a little" (question D2)?** Every bend is as tight as a
60 km/h road is allowed to be by the road-design side-friction rule.
Does it challenge steering a little, or not at all, or too much?

**4c. The wide line.** Ragged candidate, Fixed view, Bends on. On a
right-hand bend the car should run out toward the centre line and no
further; the "off line" number should reach ~0.75 m; after three
intersections the sheet should list `wideLine`. Then Straight: the same
driver's stray stays under 0.45 m and the sheet never lists it. **Bad**:
the car crossing the centre line; a wide line on a left-hand bend;
`wideLine` on the Sound candidate's sheet.

**4d. Directions and the deadline.** Give the next instruction late on
purpose (after the handoff into that intersection). The candidate should
carry straight on, and the sheet should put that direction on you, not
on them. Give one on time: followed. Give none: straight on at every
intersection and every wanted turn on you. **Bad**: a late instruction
followed; a direction never given for a straight leg charged to you.

**4e. The stack.** Tell all three slots as soon as they appear. The load
line should read "carrying 2 · composure 59%". With the Ragged candidate
the off-line number's peak should rise (toward 0.90 m). **Bad**: the car
jumping sideways when told (it moves by at most 2–3 cm); carrying never
exceeding 1; a Sound candidate visibly worse under load (it moves by
~4 cm at most; if it looks like more, say so).

**4f. Marking.** Press "Mark that" when you see something; read the
sheet after three intersections. The question: does the sheet agree with
what you saw? It grades you: caught, missed, invented, and directions
late or never given. **Bad**: a fault you clearly saw listed as missed
after you marked it; a sheet that never arrives after three
intersections; an invented mark charged for something that did happen.

**4g. Density and life.** Two-way, 3×2, several seeds. The question that
matters most to you: does the world feel alive? Honest expectation: the
through road is sparse here (a car every ~15 s), so this is the screen
where "not enough traffic" is the likely finding. Say how much more you
want; the density measurement gives what each level costs.

**4h. All-way.** Same course, All-way. Undue delay should almost never
fire (nobody judges a gap); the Hesitant candidate should be
indistinguishable. If they still look hesitant, that is a finding.

---

## 5. `#/drive` and `#/examiner` — the old foundation (10 minutes, optional)

`#/drive` is the previous engine's playable loop: six pre-resolved
intersections, directions, marking, hazards on the links (parked cars,
driveways, emerging vehicles, pedestrians). It is what the rebuild
replaces; open it to compare *feel*, not to test it. One specific thing:
at the start, is the first instruction already red ("Too late to be
followed") before the candidate has reached the first intersection? If
yes, that is a bug in the old screen; note it and move on.

`#/examiner` is the bench: chase camera, occlusion, every derived fault
live. Only if there is time.

---

## 6. The open domain questions — settle these while you are in there

Each is blocking something. Where to look at it is given.

**D1 — The right turn's radius.** A right turn from a stop line at a
7.2 m intersection is a 3.85 m arc, tighter than a car's 5.5 m full lock,
and it clips the curb corner by 8 cm at full weave. What does a driver
actually do turning right from a stop line at a tight urban corner —
swing out first, start the turn late, cross the centre line briefly?
Watch any right turn at `#/crossing`. *Blocks: the turn-speed model and
the curb-clip fix.*

**D2 — The bend's tightness.** 189 m at 60 km/h, from the 0.15 g
side-friction rule. Is "as tight as a road built for that speed is
allowed to be" what you meant by "challenges steering a little"? Watch
`#/course` with Bends on. *Blocks: nothing; one constant moves.*

**D3 — Turn speed.** Cars take turns at arrival speed. Your stated
26 km/h for a left and 22 for a right are not derivable from lateral
acceleration at these radii, so the turn-speed and radius questions are
one question. *Blocks: the tighter instruction deadline (in time to slow
for the turn), and honest turns on a through road.*

**D4 — The wide line declines on left-hand bends.** The outside of a
left-hand bend is the curb, and your wide-turn ruling says off-road is
rare and not this model's, so a poor steerer only runs wide toward the
centre line on right-hand bends. Confirm that is the reading you want on
a bend. Watch the Ragged candidate at `#/course`, Fixed view. *Blocks:
nothing; the other half is one sign flip.*

**D5 — Pace, and the late-but-controlled stop.** Two braking/pace
questions the measurements raised: (a) is PACE a markable fault — a
candidate at 70% or 135% of the limit for the whole drive, with no single
occasion — and how would you mark it? (b) The heavy-footed driver plans
on 5.0 m/s² against the model's abrupt line of 5.4, so by your manner
ruling they never commit a braking fault; the controlled comparison shows
the lateness is real (1.2 m/s faster at 20 m from the line). Is
late-but-controlled a braking fault? Watch Heavy-footed at
`#/candidates`. *Blocks: whether the braking axis has any markable content
of its own.*

**D6 — Undue delay's reading.** The 4–5 s is yours; the OPENING is read
as time since the opening appeared rather than one unbroken 4 s gap,
because on a busy road no opening ever stayed open 4 s (longest measured
3.0 s) and the fault would never fire. Confirm that reading at
`#/crossing`, Two-way, Busy, when "dawdling" appears. *Blocks: nothing;
it is built this way and reasoned in the code.*

---

## 7. If something is broken

Blank screen, a throw, a frozen clock in a real browser, a car through
another car: note the route and seed and stop testing that screen. Every
route was confirmed to mount today; if one does not tomorrow, something
changed in between and it is the first thing to look at, not the last.
