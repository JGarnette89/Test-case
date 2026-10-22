/* ONE SHAPED DRIVE, AND WHAT SHAPING DID IN IT (22 October; DECISIONS 10.17).
   Moved out of verify-shaping so the endless highway and the city run the
   identical gates -- a second copy of the gate logic for the city would be
   the two-implementations pattern (CLAUDE.md item 2) in a check.

   drive({ raw, cars, seed, secs, shape, trips, pace }) -> {
     placed, retired, nearEvents, placedCrash, jolted, crashes, shaped, enc }
     raw    the map (a TEST_MAPS build)
     shape  true: shaped (forced on, so a map not yet asking can be tested);
            false: the map's own flag switched off -- the unshaped control
     trips  true: the good driver drives to places one after another (a grid
            has dead ends for a cruise); false: it cruises the road it is on
   Per tick: every car placed (born this tick with `placed` set) and every car
   gone mid-road, with the distance from the player; a placed car in a crash
   within ten seconds; and every driver it was placed in front of, asked of
   the rules (whatStops) whether it now asks of them more than their own
   comfortable braking -- the jolt. */
import { worldFor } from "../../src/sim/scene.js";
import { step, poseOf, whatStops } from "../../src/sim/crossing.js";
import { withDriver } from "../../src/sim/drive.js";
import { DT, vehicleOf, decide } from "../../src/sim/traffic.js";
import { SIGHT } from "../../src/sim/shaping.js";
import { placesOf, routeTo } from "../../src/sim/route.js";
import { goodStep } from "./good-driver.mjs";
import { noticeTick } from "../../src/sim/session.js";
import { newEncounters, encounterTick, encounterSummary } from "../../src/sim/encounters.js";

export function drive({ raw, cars, seed, secs, shape, trips = false, pace = 1.19, overtake = true, extra = {} }) {
  let { loaded, world: w, me } = worldFor(seed, 50, 2.0, true, cars, raw, raw.sections?.[0]?.start ?? null, false);
  w = shape ? { ...w, shape: true, ...extra } : { ...w, shape: false };
  const me0 = me;
  const sc = { me, args: [1], saveWallet: false }, enc = newEncounters();
  const places = trips ? placesOf(w.course, loaded) : null;
  let trip = 0;
  const pick = () => { for (let i = 0; i < 80; i++) { const p = places[(++trip * 7919 + i * 104729) % places.length]; const r = routeTo(w.course, me, p); if (r && r.length > 300) return p; } return null; };
  const followersAt = new Map(), born = new Map(), out = { placed: 0, retired: 0, nearEvents: [], placedCrash: 0, jolted: 0, crashes: 0, shaped: !!w.shape };
  for (let n = 0; n < secs / DT; n++) {
    if (trips && !sc.dest) { sc.dest = pick(); sc.routeKey = null; }
    if (me.atEdge || (trips && !sc.dest)) { me = { ...me0 }; w = withDriver(w, me); sc.me = me; if (trips) { sc.dest = pick(); sc.routeKey = null; } }
    me = goodStep(me, w, sc, { overtake, pace });
    sc.me = me;
    const prev = w, c0 = (w.crashes ?? []).length;
    w = step(withDriver(w, me));
    /* The screen's own per-tick logic: an arrival noticed ends the trip, so the next is picked. Without it (the first version, 22 October) a driver on trips reached the first place and stood at the curb for the rest of the drive, "meeting" the traffic going past -- 16 met a minute against the 6.6 the same driver meets moving. */
    noticeTick(sc, { me: prev.actors.find((a) => a.player) ?? me, world: prev }, { me, world: w });
    encounterTick(enc, me, w);
    const at = poseOf(w, me);
    const before = new Map(prev.actors.map((a) => [a.id, a]));
    const now = new Set(w.actors.map((a) => a.id));
    for (const a of w.actors) {
      /* Placed by shaping -- not a car arriving at the map's edge. */
      if (before.has(a.id) || a.player || a.placed == null) continue;
      out.placed++; born.set(a.id, w.t);
      /* Who it was placed in front of, by the rules themselves -- and on what lane change, if any. */
      const behind = new Map();
      for (const b of w.actors) { if (b.player || b.crash || b.id === a.id) continue; if (whatStops(b, w).leader?.id === a.id) behind.set(b.id, b.lc?.at ?? null); }
      followersAt.set(a.id, behind);
      const p = poseOf(w, a), d = Math.hypot(p.x - at.x, p.y - at.y);
      if (d <= SIGHT) out.nearEvents.push(`placed ${a.id} ${d.toFixed(0)} m away`);
    }
    for (const [id, a] of before) {
      if (now.has(id) || a.player) continue;
      out.retired++;
      /* How traffic has always left: at the end of its road (an off-ramp at the map's edge), or pulling in at the end of its trip (a district street). Shaping's are the ones gone mid-road. */
      const pEnd = prev.course.at[a.k].layout.paths[a.route];
      if (pEnd && a.s >= pEnd.length - (a.v ?? 0) * DT - 0.5) continue;
      if (a.leaveAt != null) continue;
      /* ...and a crash, cleared where it stood once it has stood (crashes are counted on their own). */
      if (a.crash) continue;
      const p = poseOf(prev, a), q = poseOf(prev, me), d = Math.hypot(p.x - q.x, p.y - q.y);
      if (d <= SIGHT) out.nearEvents.push(`gone ${id} ${d.toFixed(0)} m away (${a.route} s${a.s.toFixed(0)} of ${pEnd.length.toFixed(0)}${a.rival ? " rival" : ""})`);
    }
    for (const c of (w.crashes ?? []).slice(c0)) {
      out.crashes++;
      if ([c.a, c.b].some((id) => born.has(id) && w.t - born.get(id) < 10)) out.placedCrash++;
    }
    /* THE DRIVER BEHIND A CAR PLACED IN THE LAST THREE SECONDS: is the placed car what holds them, and does the following model ask more of their brakes for it than their own comfortable rate? */
    for (const a of w.actors) {
      if (a.player || a.crash) continue;
      const view = whatStops(a, w), L0 = view.leader;
      const t0 = L0 ? born.get(L0.id) : null;
      if (t0 == null || w.t - t0 >= 3) continue;
      /* Only somebody it was placed in front of, still on the lane change they had then (or none). */
      const was = followersAt.get(L0.id);
      if (!was || !was.has(a.id) || (was.get(a.id) ?? null) !== (a.lc?.at ?? null)) continue;
      const asked = decide(a, view);
      /* What the placed car adds: against the same driver on an empty road. */
      const alone = decide(a, { ...view, leader: null, gap: Infinity });
      if (asked < -(a.brake ?? vehicleOf(a).brake) - 1e-6 && alone >= -(a.brake ?? vehicleOf(a).brake)) {
        out.jolted++;
        if (process.env.SHOWJOLT && out.jolted < 8) console.log(`   jolt: ${a.id} v${a.v.toFixed(1)} asked ${asked.toFixed(1)} (comfortable ${(a.brake ?? 0).toFixed(1)}) by placed ${L0.id} v${(L0.v ?? 0).toFixed(1)} at ${view.gap.toFixed(1)} m, placed ${(w.t - t0).toFixed(2)} s ago${a.lc ? " (changing lane)" : ""}`);
      }
    }
  }
  out.enc = encounterSummary(enc);
  return out;
}
