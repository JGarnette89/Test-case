/* =====================================================================
   DENSITY SHAPING (sim/shaping.js; DECISIONS 10.17): the cars the phone
   affords, spent where the player is. Expectations stated here.
   (tools/wip-shaping.mjs until 22 October; in the suite since the
   endless highway was switched on.)

   1. OUT OF SIGHT MEANS OUT OF SIGHT: SIGHT is farther than the drive
      camera shows at its widest -- the longest lead, the furthest zoom-out
      the screen allows, every corner of the screen -- on phones and
      tablets held either way, through the renderer's own projection
      (iso/freecam.js groundAt).
   2. NOBODY APPEARS OR VANISHES IN VIEW, NOBODY IS PLACED INTO SOMEBODY:
      on the endless highway at 160 cars, a good driver cruising, every car
      placed and every car retired is farther from the player than SIGHT
      at that tick (every one, not a sample); no placed car is in a crash
      within ten seconds of being placed; and no driver behind a placed car
      brakes past their own comfortable rate in the three seconds after.
   3. IT IS WHAT THE PLAYER MEETS: the same seeds and target with shaping
      off meet far fewer cars -- shaped, at least three times the cars met
      a minute.
   4. NOTHING CHANGES WITHOUT A PLAYER, OR WITHOUT THE MAP ASKING: a world
      marked to shape with nobody driving is the unshaped world tick for
      tick; test map 1, which does not ask, is not shaped when driven.
   5. ON A CLOSED LOOP THE ROAD AHEAD IS NEVER STRIPPED: retiring behind
      never leaves the player's window emptier than unshaped -- the road
      behind is the road ahead a lap later. Sabotaged (retiring, never
      placing): the window starves to 0-4 cars against 32-33.
   ===================================================================== */
import { createHash } from "node:crypto";
import { worldFor } from "../src/sim/scene.js";
import { TEST_MAPS } from "../src/map/samples.js";
import { step, poseOf, whatStops } from "../src/sim/crossing.js";
import { withDriver } from "../src/sim/drive.js";
import { DT, vehicleOf, decide } from "../src/sim/traffic.js";
import { SIGHT, windowOf, inWindow } from "../src/sim/shaping.js";
import { placeOf } from "../src/sim/placement.js";
import { zoomFor, LEAD_MAX } from "../src/iso/chase.js";
import { groundAt, CENTRE_Y } from "../src/iso/freecam.js";
import { goodStep } from "./lib/good-driver.mjs";
import { drive as shapeDrive } from "./lib/shape-drive.mjs";
import { newEncounters, encounterTick, encounterSummary } from "../src/sim/encounters.js";

let failed = 0;
const check = (ok, msg) => { console.log(`  ${ok ? "ok  " : "FAIL:"} ${msg}`); if (!ok) failed++; };
const loop = TEST_MAPS.find((m) => m.id === "test-loop").build();

console.log("\n1. OUT OF SIGHT MEANS OUT OF SIGHT");
{
  /* CSS pixels: small and large phones, a small and a large tablet. */
  const screens = [[360, 780], [393, 851], [412, 915], [430, 932], [768, 1024], [820, 1180], [1024, 1366]];
  const ZOOM_OUT = 0.5;   // the drive screen's furthest (MapRoad: zoom clamped to 0.5-4)
  let widest = 0, where = "";
  for (const [a, b] of screens) for (const [w, h] of [[a, b], [b, a]]) {
    const k = zoomFor(w, h, LEAD_MAX) * ZOOM_OUT, cam = { x: 0, y: 0, k, rot: 0 }, canvas = { w, h };
    /* The car sits 0.707 k LEAD_MAX below the camera's point (iso/chase.js zoomFor). */
    const me = groundAt(cam, canvas, w / 2, h * CENTRE_Y + 0.707 * k * LEAD_MAX);
    for (const [px, py] of [[0, 0], [w, 0], [0, h], [w, h]]) {
      const g = groundAt(cam, canvas, px, py), d = Math.hypot(g.x - me.x, g.y - me.y);
      if (d > widest) { widest = d; where = `${w}x${h}`; }
    }
  }
  check(SIGHT > widest, `SIGHT ${SIGHT} m is beyond the widest the drive camera shows: ${widest.toFixed(0)} m (${where}, zoomed out, at the longest lead)`);
}

/* A drive on the endless highway: the good driver cruising, every tick, with what shaping did -- the one drive the city's measurement runs too (tools/lib/shape-drive.mjs). */
const drive = (seed, secs, shape) => shapeDrive({ raw: loop, cars: 160, seed, secs, shape });

console.log("\n2. NOBODY APPEARS OR VANISHES IN VIEW, NOBODY IS PLACED INTO SOMEBODY");
const on = [1, 2].map((s) => drive(s, 180, true)), off = [1, 2].map((s) => drive(s, 180, false));
{
  const tot = (xs, k) => xs.reduce((t, x) => t + x[k], 0);
  const near = on.flatMap((x) => x.nearEvents);
  console.log(`   two 3-minute drives shaped: ${tot(on, "placed")} placed, ${tot(on, "retired")} gone; ${tot(on, "crashes")} crashes in all (unshaped, the same seeds: ${tot(off, "crashes")})`);
  check(on.every((x) => x.shaped) && tot(on, "placed") > 50, `the endless highway asks to be shaped, and is: ${tot(on, "placed")} cars placed`);
  check(near.length === 0, `every car placed and every car gone was more than SIGHT from the player at that moment${near.length ? `: ${near.slice(0, 4).join("; ")}` : ""}`);
  check(tot(on, "placedCrash") === 0, `no placed car was in a crash within ten seconds of being placed (${tot(on, "placedCrash")})`);
  check(tot(on, "jolted") === 0, `nobody behind a car just placed braked past their own comfortable rate (${tot(on, "jolted")} car-ticks)`);
}

console.log("\n3. IT IS WHAT THE PLAYER MEETS");
{
  const met = (xs) => xs.reduce((t, x) => t + Number(x.enc.metPerMin), 0) / xs.length;
  console.log(`   met a minute, 160 cars: shaped ${on.map((x) => x.enc.metPerMin).join(", ")}; unshaped ${off.map((x) => x.enc.metPerMin).join(", ")}; overtaken by the player a minute ${on.map((x) => x.enc.overtookPerMin).join(", ")} against ${off.map((x) => x.enc.overtookPerMin).join(", ")}; gaps judged ${on.map((x) => x.enc.gapsPerMin).join(", ")} against ${off.map((x) => x.enc.gapsPerMin).join(", ")}`);
  check(met(on) >= 3 * met(off), `shaped, the player meets at least three times the cars: ${met(on).toFixed(1)} a minute against ${met(off).toFixed(1)}`);
}

console.log("\n4. NOTHING CHANGES WITHOUT A PLAYER, OR WITHOUT THE MAP ASKING");
{
  const hash = (shape) => {
    let { world: w } = worldFor(3, 50, 2.0, false, 160, loop, null, false);
    w = { ...w, shape };
    const h = createHash("sha1");
    for (let i = 0; i < 60 / DT; i++) { w = step(w); if (i % 20 === 0) h.update(JSON.stringify(w.actors.map((a) => [a.id, a.k, a.route, +a.s.toFixed(6), +a.v.toFixed(6)]))); }
    return h.digest("hex");
  };
  check(hash(true) === hash(false), "a minute of the endless highway marked to shape, with nobody driving: identical, tick for tick, to it unmarked");
  const { world: t1 } = worldFor(1, 50, 2.0, true, 150, null, null, false);
  const { world: watch } = worldFor(1, 50, 2.0, false, 160, loop, null, false);
  check(!t1.shape && !watch.shape, "test map 1 driven is not shaped (it does not ask), and the endless highway watched is not either");
}

console.log("\n5. ON A CLOSED LOOP THE ROAD AHEAD IS NEVER LEFT EMPTIER THAN UNSHAPED");
{
  /* The maintainer, 22 October: retiring behind on a closed loop must not
     strip road the player is about to re-enter -- the road behind is the
     road ahead a lap later. Stated as what it would cost: the cars in the
     player's window (AHEAD in front, BEHIND behind, by network distance),
     sampled every 5 s over a 5-minute drive (a lap and more at the
     maintainer's pace), shaped against unshaped on the same seed -- the
     shaped window's leanest tenth at least the unshaped window's median, so
     no stretch of the drive is starved. */
  const count = (w) => {
    const win = windowOf(w, w.actors);
    if (!win) return null;
    let n = 0;
    for (const a of w.actors) {
      if (a.player || a.parked) continue;
      const at = placeOf(w.course, a.k ?? 0, a.route, a.s);
      if (at && inWindow(win, at.lane, at.c)) n++;
    }
    return n;
  };
  const sample = (seed, shape) => {
    let { world: w, me } = worldFor(seed, 50, 2.0, true, 160, loop, loop.sections[0].start, false);
    if (!shape) w = { ...w, shape: false };
    const sc = { me, args: [1], saveWallet: false }, xs = [];
    for (let n = 0; n < 300 / DT; n++) {
      me = goodStep(me, w, sc, { overtake: true, pace: 1.19 }); sc.me = me;
      w = step(withDriver(w, me));
      if (n % 100 === 99) { const c = count(w); if (c != null) xs.push(c); }
    }
    return xs;
  };
  const q = (xs, f) => [...xs].sort((a, b) => a - b)[Math.floor(f * (xs.length - 1))];
  for (const seed of [1, 2]) {
    const on = sample(seed, true), off = sample(seed, false);
    console.log(`       seed ${seed}: cars in the player's window, shaped min/p10/median ${Math.min(...on)}/${q(on, 0.1)}/${q(on, 0.5)}; unshaped ${Math.min(...off)}/${q(off, 0.1)}/${q(off, 0.5)}`);
    check(q(on, 0.1) >= q(off, 0.5), `seed ${seed}: the shaped window's leanest tenth (${q(on, 0.1)} cars) is at least the unshaped window's median (${q(off, 0.5)})`);
  }
}

console.log(failed ? `\n${failed} FAILURE(S)` : "\nall passed");
process.exit(failed ? 1 : 0);
