/* =====================================================================
   DENSITY SHAPING (sim/shaping.js; DECISIONS 10.17): the cars the phone
   affords, spent where the player is. Expectations stated here.

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
   ===================================================================== */
import { createHash } from "node:crypto";
import { worldFor } from "../src/sim/scene.js";
import { TEST_MAPS } from "../src/map/samples.js";
import { step, poseOf, whatStops } from "../src/sim/crossing.js";
import { withDriver } from "../src/sim/drive.js";
import { DT, vehicleOf, decide } from "../src/sim/traffic.js";
import { SIGHT } from "../src/sim/shaping.js";
import { zoomFor, LEAD_MAX } from "../src/iso/chase.js";
import { groundAt, CENTRE_Y } from "../src/iso/freecam.js";
import { goodStep } from "./lib/good-driver.mjs";
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

/* A drive on the endless highway: the good driver cruising, every tick, with what shaping did. */
const drive = (seed, secs, shape) => {
  let { world: w, me } = worldFor(seed, 50, 2.0, true, 160, loop, loop.sections[0].start, false);
  /* Forced while the loop's own flag is off (work in progress): restore "the map asks" when it is switched on. */
  w = { ...w, shape };
  const sc = { me, args: [1], saveWallet: false }, enc = newEncounters();
  const followersAt = new Map(), born = new Map(), out = { placed: 0, retired: 0, nearEvents: [], placedCrash: 0, jolted: 0, crashes: 0, shaped: !!w.shape };
  for (let n = 0; n < secs / DT; n++) {
    /* At the maintainer's own pace: he was seen at 119 in a 100, and the encounter rate depends on closing on traffic -- at 95% of the limit the player sat in a platoon at its own speed and met almost nobody, shaped or not. */
    me = goodStep(me, w, sc, { overtake: true, pace: 1.19 });
    sc.me = me;
    const prev = w, c0 = (w.crashes ?? []).length;
    w = step(withDriver(w, me));
    encounterTick(enc, me, w);
    const at = poseOf(w, me);
    const before = new Map(prev.actors.map((a) => [a.id, a]));
    const now = new Set(w.actors.map((a) => a.id));
    for (const a of w.actors) {
      /* Placed by shaping -- not a car arriving at the map's edge, which the player can start beside (the slip road begins at one). */
      if (before.has(a.id) || a.player || a.placed == null) continue;
      out.placed++; born.set(a.id, w.t);
      /* Who it was placed in front of, by the rules themselves: every driver whose whatStops leader it is now -- and on what lane change, if any. */
      const behind = new Map();
      for (const b of w.actors) { if (b.player || b.crash || b.id === a.id) continue; if (whatStops(b, w).leader?.id === a.id) behind.set(b.id, b.lc?.at ?? null); }
      followersAt.set(a.id, behind);
      const p = poseOf(w, a), d = Math.hypot(p.x - at.x, p.y - at.y);
      if (d <= SIGHT) out.nearEvents.push(`placed ${a.id} ${d.toFixed(0)} m away`);
    }
    for (const [id, a] of before) {
      if (now.has(id) || a.player) continue;
      /* Gone: retired, or left at an edge (an off-ramp, which ends at the map's edge, far from the loop). Either way, not in view. */
      out.retired++;
      const p = poseOf(prev, a), q = poseOf(prev, me), d = Math.hypot(p.x - q.x, p.y - q.y);
      /* A car that left at the end of its road (an off-ramp at the map's edge) is how cars have always left; shaping's are the ones gone mid-road. */
      const pEnd = prev.course.at[a.k].layout.paths[a.route];
      if (pEnd && a.s >= pEnd.length - (a.v ?? 0) * DT - 0.5) continue;
      if (d <= SIGHT) { const L = prev.course.at[a.k].layout, p = L.paths[a.route]; out.nearEvents.push(`gone ${id} ${d.toFixed(0)} m away (${a.route} s${a.s.toFixed(0)} of ${p.length.toFixed(0)}${a.rival ? " rival" : ""}${a.leaveAt != null ? " pulling in" : ""})`); }
    }
    for (const c of (w.crashes ?? []).slice(c0)) {
      out.crashes++;
      if ([c.a, c.b].some((id) => born.has(id) && w.t - born.get(id) < 10)) out.placedCrash++;
    }
    /* THE DRIVER BEHIND A CAR PLACED IN THE LAST THREE SECONDS, asked of the
       rules themselves (whatStops): is the placed car what holds them, and does
       the following model ask more of their brakes for it than their own
       comfortable rate? (By `leadId` alone the check counted drivers braking
       for a bend, or for their own lane change, while the placed car pulled
       away.) */
    for (const a of w.actors) {
      if (a.player || a.crash) continue;
      const view = whatStops(a, w), L0 = view.leader;
      const t0 = L0 ? born.get(L0.id) : null;
      if (t0 == null || w.t - t0 >= 3) continue;
      /* Only somebody it was placed in front of, still on the lane change they had then (or none): one who changed lanes in behind it afterwards chose that gap themselves. */
      const was = followersAt.get(L0.id);
      if (!was || !was.has(a.id) || (was.get(a.id) ?? null) !== (a.lc?.at ?? null)) continue;
      const asked = decide(a, view);
      /* What the placed car adds: the demand with it, against the same driver on an empty road -- one above its own road's limit slows for that whoever is in front (22 October: a follower slower than the car placed ahead of it, braking toward its own off-ramp's speed). */
      const alone = decide(a, { ...view, leader: null, gap: Infinity });
      if (asked < -(a.brake ?? vehicleOf(a).brake) - 1e-6 && alone >= -(a.brake ?? vehicleOf(a).brake)) {
        out.jolted++;
        if (process.env.SHOWJOLT && out.jolted < 8) console.log(`   jolt: ${a.id} v${a.v.toFixed(1)} asked ${asked.toFixed(1)} (comfortable ${(a.brake ?? 0).toFixed(1)}) by placed ${L0.id} v${(L0.v ?? 0).toFixed(1)} at ${view.gap.toFixed(1)} m, placed ${(w.t - t0).toFixed(2)} s ago${a.lc ? " (changing lane)" : ""}`);
      }
    }
  }
  out.enc = encounterSummary(enc);
  return out;
};

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

console.log(failed ? `\n${failed} FAILURE(S)` : "\nall passed");
process.exit(failed ? 1 : 0);
