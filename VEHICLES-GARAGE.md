# VEHICLES AND THE GARAGE (recorded 13 October 2026, NOT BUILT)

From the maintainer's VEHICLE RENDERERS and GARAGE documents (written with
another model; recorded from their summary -- the originals are not yet in
the repo). Direction, not specification: the CORRECTIONS below are the
project's conventions and measured facts, recorded against the documents.
Frame: [DAY-NIGHT.md](DAY-NIGHT.md), [STORY.md](STORY.md).

## Six vehicle classes

Compact, motorcycle, SUV/pickup, box truck, transit bus, articulated semi.
Today the sim has three rows in `VEHICLES` (`sim/traffic.js`): a car, a
truck (one rigid 9 m body), a bus.

### Corrections

1. **METRES, NOT PIXELS.** The document gives dimensions in pixels at about
   10 per metre. This project specifies every size in METRES and lets the
   renderer scale (20 px/m at the default; CLAUDE.md, "True-to-life
   scale"). A pixel size is right at one zoom only, and the camera zooms
   (`iso/chase.js`, `iso/freecam.js`). Every dimension is to be restated in
   metres before use.
2. **THE TRAILER CODE IS 90 DEGREES OFF.** It computes the hitch with sine
   for x and cosine for y, which puts heading zero to the SOUTH. This
   project's convention is forward along +x, heading zero EAST (the map is
   y-down; `iso/road.js` `ribbonOf`, `poseAt`). As written every trailer
   would render at right angles to its cab.
3. **ITS JACKKNIFE CLAMP OVERSHOOTS.** It sets the trailer angle to the limit
   and then adds further rotation on top, which can push the trailer
   straight back past the limit it just enforced.
4. **ARTICULATION IS NOT A RENDERING CHANGE.** A trailer cuts corners
   differently and sweeps a wider path, which touches the lane geometry,
   the turn rules and the clearance work already built and verified (the
   truck spanning its path as a rigid body, the truck refusing a corner too
   tight for its lane -- `verify-trucks`). The current truck is ONE rigid
   9 m body and **the maintainer approved it turning as one**. Articulation
   REOPENS that ruling; it is a sim change, not a sprite.
5. **THE MOTORCYCLE IS THE CLASS TO WATCH.** Narrow, single-track, and it
   may FILTER between lanes -- which breaks the assumption everywhere in the
   sim that one vehicle occupies one lane (following, lane change, conflict
   tables, the player's lane, the horn's straddling rule). Whether filtering
   is allowed is also a traffic-law question (it is not legal in Ontario);
   if it comes, it is the maintainer's call and a night-only behaviour at
   most.

## The garage

Upgrade tiers for **engine, brakes, handling, tyres** and a **tactical
ECM**, paid for with daytime earnings; and **paint, headlight colour and
night-only underglow**.

### THE DETECTION SIGNATURE -- the best mechanic in the four documents

**High engine tuning makes A.U.T.O. stricter with you by day**, so the car
you build for the night costs you day earnings. A genuine constraint on
the loop (DAY-NIGHT.md): it ties the two halves together with a trade-off
instead of a one-way flow of money.

**BUT DO NOT CALL IT COMPLIANCE.** The document's formula reduces an
"effective compliance score". In this project COMPLIANCE already means a
driver CHOOSING whether to follow rules they know (`core/driver.js`,
`verify-compliance`). The detection signature is **A.U.T.O.'S ASSESSMENT OF
THE PLAYER** -- a different quantity, owned by the system, not the driver.
Name it as such (e.g. `scrutiny` / A.U.T.O.'s assessment). One word for two
things is the pattern behind most of this project's real bugs (CLAUDE.md
item 2).

### THE ECM, and the principle it resolves

An ECM that overrides signals would break the rule that every reward must
be something a genuinely good driver would get -- **except that it is
NIGHT-ONLY**, and at night beating the grid is the point. So:

> **THE HONESTY RULE BELONGS TO THE DAY; SUBVERTING THE SYSTEM IS THE
> NIGHT'S FANTASY.** Day rewards real skill, honestly (the green wave,
> actuated lights, earnings that track driving quality). Night does not
> have to.

### Costs, recorded

- **Brakes, handling and tyres turn derived GLOBAL constants into
  PER-VEHICLE properties** -- stopping distances, turn radii, deceleration
  and lateral grip (`stoppingRoom`, `BRAKE`, `LATERAL`, `radiusFor`, the
  player's grip in `sim/player.js`). A real refactor, of the same shape as
  the per-road speed limits already done (posted speeds; `postedAt`).
  `VEHICLES` already makes some of it per vehicle (a truck's brake and
  accel), which is where it would extend.
- **Underglow with `ctx.shadowBlur` is expensive on canvas** -- fine for the
  one player car, not for many. Any glow on traffic would need a cheaper
  form (the lamps' drawn halo, as `paintLamps` does).
- **Engine tuning** above the traffic's speeds touches the player model's
  top speed and acceleration only; the traffic is unaffected.
