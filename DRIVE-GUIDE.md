# The drive — how to operate it

`#/drive`. Six intersections, one candidate, a marking sheet after intersection 3
and again after intersection 6. Then a new candidate.

**Read "What is missing" at the bottom first.** Three fairly central
things are absent and you will otherwise spend the first drive looking for
them.

---

## What you are doing

You are the examiner. The candidate drives; you do three jobs at once:

- **Direct them** — in time to be followed. If you are late, that is your
  fault, not theirs.
- **Watch them** — the camera rides with their car.
- **Mark what you saw** — but on a sheet at the end of the section, not
  the instant you see it. That is what makes the job memory as well as
  attention.

---

## The screen

**The road.** The camera is centred on the candidate and turns with them,
so their straight-ahead always draws upward.

> The camera follows their **intended** line, not their actual one. So
> when the car sits off-center or crooked in the frame, **that offset is
> the fault**. It is not the camera wobbling. A wandering driver drifts
> across the frame; a wide turn swings out of it.

**The cars.**

| | |
|---|---|
| blue | the candidate |
| grey | other traffic |
| amber, dimmed | partially obscured from the car |
| not drawn | fully hidden behind something |

**Top left**, four readouts:

- `Intersection 3/6` — where you are in the course.
- `Section 1` — which sheet you are working toward.
- `6s of road` — how much road ahead the view holds.
- `2 stacked` — in amber, and only when you are holding instructions.

**Bottom of the road**, the instruction clock. One of three states:

- amber `tell them within 4.2s` — counting down to the deadline.
- green `"Turn left" — given at -2.3s` — you have spoken.
- red `Too late to be followed — that one is yours` — you missed it, and
  the candidate carrying straight on is **your** error, not theirs.

---

## The controls

Three rows under the road.

**Row 1 — which intersection you are directing.**
`This one` · `Intersection 4` · `Intersection 5`. A ✓ means that one has been
given. Tapping a chip just changes what the direction buttons will do.

**Row 2 — the instruction.**
`Turn left` · `Follow the road` · `Turn right`. Speaks it for whichever
intersection is selected, then snaps the selection back to the current one so
you cannot leave it pointed at the wrong intersection by accident.

**Row 3 — everything else.**
`Mark a fault` records a call at the current instant on the current
intersection. Then pause/play, and the circular arrow, which **restarts with
a new candidate**.

**The meter** shows their composure, and the line beside it says how many
marks you have made here and whether anything is in the air.

---

## What to actually try

**First drive: just direct them.** Take each intersection as you reach it.
That is correct play and it costs nothing. Get a feel for how much warning
the deadline gives — it varies a lot, from about 1 second to about 10,
because it is derived from what each manoeuvre demands rather than being a
fixed number.

**Second drive: mark as well.** Watch the blue car against the center of
the frame. Marking well scores 100; marking nothing scores 0; marking
everything also scores 0, because inventing a fault costs.

**Third drive: stack.** This is the thing I would most like your read on.
Select `Intersection 5` while driving intersection 3 and give that instruction
early. You will see `1 stacked` appear, composure drop, and their faults
get measurably wider at the next intersection.

> Calling **one** ahead is free — they arrive and discharge it
> immediately, so they never actually *carry* anything. Only calling
> **two** ahead loads them. That fell out of the design rather than being
> chosen, and it is why there are three chips rather than two.

The trade is: an instruction given early can never be given late, and it
buys back your attention for watching — at the cost of the candidate
driving worse. Measured at 34% pressure and 1.14x wider faults. **Whether
that reads as them getting worse is the question no measurement here can
answer.**

---

## The sheet

Appears after intersection 3 and after intersection 6.

- A score out of 100, then `precision · recall · timeliness`.
- **Directions** — every intersection, what you said, and whose fault it was.
  "Called early" is amber, not red: it is a trade you chose.
- **What you missed** — faults that were on screen and went uncalled.
- After the final section, **your candidate**, and which axes they were
  weak on.

`Carry on` continues; `Another candidate` starts a fresh drive.

---

## What is working

- The candidate is **one person across the whole drive**, drawn with five
  skill ratings and weak on one or two. Their habits recur, so they are
  identifiable rather than random.
- Every fault is **derived**, never scripted — strip the cause and the
  fault disappears.
- Traffic hidden behind something is **not drawn and cannot be marked**.
- Other road users **yield** when the candidate takes their space, and
  how hard they brake measures how bad the intrusion was.
- Instruction deadlines are **derived per leg**, not a constant.
- Marking is deferred, scored on precision and recall, with a real cost
  for inventing.

## What is missing or rough

Please do not judge it for these — they are known.

- **No intervention.** The fourth job is absent, so a tight intersection just
  happens and you watch it. What an intervention *is*, on the sheet, is
  the open question I need from you.
- **No field of view.** You cannot mark what is hidden, but nothing models
  where you were *looking* — and every fault the candidate's own car
  commits is always fully markable. The gaze cone was deleted from the
  engine and the docs wrongly said it was built. This is the biggest
  absence.
- **Marks are uncategorised.** You record *when*, never *what*.
- **No debrief.** The last sheet names the weak axes and stops.
- **Sections score independently.** No drive total.
- **Look-ahead is fixed at 6s.** 10s reads as anticipation but is too wide
  to spot a fault on a phone; 4s reads faults well and sees nothing
  coming. Unresolved — the Examiner lab has it on a slider.
- **Going off course does nothing.** Silence means straight on, but the
  route does not re-plan.
- **"What you missed" caps at six lines** and shows only the tell.

---

## If the page is blank

Hard reload (`Ctrl+Shift+R`) first — a bundle that threw during
hot-reload can leave a stale one cached. If that does not do it, restart
the dev server. If it is still blank, the browser console's first error is
the thing to send me.
