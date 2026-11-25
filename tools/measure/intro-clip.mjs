/* =====================================================================
   THE CLIPPING IN THE ARRIVAL (WORK-game-slice7 section 1): for every pooled
   seed, the worst overlap of the player's DRAWN footprint with any other drawn
   road user over the intro (1/60 steps), with the whole recorded trail (what
   slice 6 drew) and with the screech the decision chooses (stage.js
   chooseScreech), and the configuration of each overlap -- the other car
   ahead of the player, behind it, or crossing -- at the worst instant.

   usage: node tools/measure/intro-clip.mjs
   ===================================================================== */
import { TYPES } from "../../src/game/rounds.js";
import { toDecision } from "../../src/game/round.js";
import { clipOf, othersTrack, chooseScreech, CLIP_DEPTH, SCREECH_MIN_M } from "../../src/game/stage.js";

const rows = [];
for (const type of TYPES) for (const pool of ["now", "wait"]) for (const seed of type.pools[pool]) {
  const rs = toDecision(type, seed, type.cars);
  if (!rs) { rows.push({ type, pool, seed, none: true }); continue; }
  const { trail, replay } = rs.decision, track = othersTrack(replay);
  const before = clipOf(trail, replay, track), pick = chooseScreech(trail, replay), after = clipOf(pick.trail, replay, track);
  rows.push({ type, pool, seed, before, after, kind: pick.kind, meters: pick.meters });
}
const configOf = (c) => (Math.abs(c.across) <= 2.0 ? (c.along > 0 ? "ahead" : "behind") : "crossing");
const hit = rows.filter((r) => r.before && r.before.worst > CLIP_DEPTH);
const cfg = {};
for (const r of hit) { const c = configOf(r.before); cfg[c] = (cfg[c] ?? 0) + 1; }
const kinds = {};
for (const r of rows) if (r.kind) kinds[r.kind] = (kinds[r.kind] ?? 0) + 1;
const stillHit = rows.filter((r) => r.after && r.after.worst > CLIP_DEPTH);
const near = rows.filter((r) => r.before && r.before.worst <= CLIP_DEPTH && r.before.nearest <= 2);
console.log(`seeds ${rows.length}, none ${rows.filter((r) => r.none).length}`);
console.log(`BEFORE (whole trail): ${hit.length} seeds overlap; configuration ${JSON.stringify(cfg)}; worst depth ${Math.max(0, ...hit.map((r) => r.before.worst)).toFixed(2)} m`);
console.log(`CHOSEN: ${JSON.stringify(kinds)}; shortened screech lengths ${rows.filter((r) => r.kind === "shortened").map((r) => r.meters.toFixed(1)).join(" ")}`);
console.log(`AFTER: ${stillHit.length} seeds overlap (min screech ${SCREECH_MIN_M} m)`);
console.log(`seeds with no overlap before whose nearest footprint came within 2 m: ${near.length}`);
