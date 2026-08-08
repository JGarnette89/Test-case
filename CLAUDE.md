# CLAUDE.md

Read this before making changes. It encodes decisions that took a long time to
get right, and several of them are non-obvious.

## What this repo is

Two related products that share a visual language and a domain model.

**DriveDraw** — a diagramming tool for driving instructors. Draw an intersection,
place vehicles and signs, annotate right-of-way with numbered path arrows. Used
in-car on a tablet and projected in classrooms.

**Right of Way** — a real-time judgment game. You are one car at an intersection.
Traffic arrives on a schedule. Press GO at the moment the road is legally yours.
Too early is a failure to yield; too late is undue delay.

Both are React + SVG, no canvas, no game engine. Mobile-first.

## Domain authority

**The maintainer is a driving examiner in Ontario, Canada. Their reading of the
rules wins over anything you infer.** If a change depends on a traffic-law
assumption, say so explicitly and ask rather than guessing. Getting a rule wrong
does not merely lose a user — it teaches someone something false.

Rules follow Ontario. Do not silently generalise to other jurisdictions.

### Rules already established — do not regress these

- **Right of way is about path conflict, not intersection occupancy.** You do
  NOT wait for another vehicle to completely exit the intersection. You wait
  until your path is clear of theirs. This was an early bug and it is a big deal.
- **Two vehicles going straight from opposite legs do not conflict.** They pass
  on their own sides. The window opens immediately.
- **A moving vehicle claims the road ahead of it**, proportional to speed. This
  is what makes turning across an oncoming stream a conflict even when the
  arithmetic says you would squeeze through. A stopped vehicle claims nothing.
- **A pedestrian on a crossing holds the entire crossing** until completely
  across. This is a legal rule, not a geometric one, and is encoded as an
  explicit override (`blockUntilClear`), not emergent from footprints.
- Simultaneous arrivals resolve by the right-hand rule, then left-turn-yields
  for head-to-head.

## Architecture principles

**Data over code.** Road layouts in DriveDraw are plain JSON-ish primitives
(`rect`, `poly`, `band`, `line`, `arrow`, `walk`, `hatch`), never hardcoded JSX.
Adding a template must be a data entry, not a new component. Same for game
scenarios: they declare arrival times and intents, and the engine derives the
answer.

**Never author the answer.** In Right of Way, the safe window is computed by
simulating footprints through the intersection. Do not hardcode "window opens at
3.2s". If a scenario needs a specific window, change the arrival times until the
engine produces it.

**Driver behaviour is composable traits.** `wander`, `creep`, `overshoot`,
`slowStart`, `wideTurn`, `lateSignal`. A trait bends how the car actually drives
and the conflict engine works out the consequences. Never script a trait to
punish the player directly.

**True-to-life scale.** DriveDraw is 24 px per metre, the game is 20 px/m. Lane
3.6 m, car 4.5 x 1.8 m, truck 9 x 2.55 m, painted lines 0.15 m. Signs are the one
deliberate exaggeration, drawn as map symbols because a real 0.75 m sign face
would be unreadable.

## Verification requirement

**Any change to the conflict engine, trait system, or scenario timings must be
re-verified numerically before it is considered done.** Reimplement the scheduler
in a short Python script, run every scenario, and print the resulting windows.
Compare a trait-carrying vehicle against a well-driven control — if the trait
does not move the window, the scenario does not teach anything and the timings
need retuning.

This has caught real bugs three times: an approximate box-overlap test that let
collisions through, a left turn that could legally cut in front of oncoming
traffic, and two traits that had no effect at all.

## Conventions

- Plain React with hooks. No Redux, no state library.
- Inline style objects and a small `<style>` block. No Tailwind, no CSS files.
- `lucide-react` for icons. Do not add UI or animation libraries without asking.
- Comments explain *why*, not *what*. Only where the reasoning is not obvious.
- Mobile-first: 44 px minimum touch targets, `100dvh`, safe-area insets,
  `touch-action: none` on the canvas, 16 px inputs so iOS does not zoom.

## Known work in progress

- `Storage` in both apps falls back to in-memory when no backend is present, so
  saves do not survive a refresh. Add a `localStorage` adapter for the web build.
  The Capacitor Preferences adapter is already written for the native build.
- Right of Way has ten scenarios. It wants sixty-plus, and eventually randomised
  arrival times so the engine generates situations rather than replaying a list.
- DriveDraw exports PNG via a cleaned SVG clone. Fonts fall back in the export
  because webfonts are not embedded.

## Do not

- Do not add analytics, accounts, or network calls. These run offline in a car.
- Do not use `localStorage` in code that still has to run as a chat artifact —
  it fails there. Go through the `Storage` adapter.
- Do not "simplify" the template or trait systems back into hardcoded cases.
