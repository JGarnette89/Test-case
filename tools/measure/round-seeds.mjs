/* =====================================================================
   WHICH SEED AND HOW MANY CARS EACH ROUND SHOWS ITS PROPERTY AT
   (WORK-game-slice1 section 3; GAME.md rule 1: never author the answer).

   For each round, the good driver (tools/lib/good-driver.mjs) is run
   through the round's own tick on seeds 1-60 at a few car counts. Per
   run it records whether the round ended `through`, the verdict, the
   time to `through`, and the round's `expose` property:
     cameToRest   -- the driver was at rest (stoppedAt set) when it crossed the line;
     heldByRight  -- while standing at its line (at rest, within AT_SPAN m short of it)
                     openTo(sound, world, 1) was false for at least HELD_FOR s in total.
   A run SHOWS the round when it ended through, with 3 stars, the property
   held, and the time inside TIME_BAND. Printed per round and car count:
   how many seeds show it, and the time spread. The chosen pair (the car
   count with the most showing seeds, fewest cars on a tie; then its lowest
   showing seed) is printed last -- that is the rule, nothing else picks.

   usage: node tools/measure/round-seeds.mjs [roundId ...] [--cars=4,8,14] [--seeds=60]
   ===================================================================== */
import { ROUNDS, HELD_FOR } from "../../src/game/rounds.js";
import { driveRound } from "../lib/round-drive.mjs";
import { openTo, DT, AT_REST } from "../../src/sim/crossing.js";

export const AT_SPAN = 6;            // m short of the line that counts as standing at it [instrument]
export const TIME_BAND = [15, 45];   // s a round's good-driver time must fall in [invented]

const args = process.argv.slice(2);
const ids = args.filter((a) => !a.startsWith("--"));
const opt = (name, d) => (args.find((a) => a.startsWith(`--${name}=`)) ?? `--${name}=${d}`).split("=")[1];
const COUNTS = opt("cars", "4,8,14").split(",").map(Number);
const SEEDS = Number(opt("seeds", 60));

/* One run, with what the round exists to show measured on the way. */
export function measureRun(def) {
  let rested = false, held = 0, crossAt = null;
  const { rs, verdict } = driveRound(def, {
    onTick: (before, inp, after) => {
      const { me, world } = before;
      const path = world.course.at[me.k].layout.paths[me.route];
      if (me.k === before.targetK && me.v < AT_REST && me.s <= path.stopAt && path.stopAt - me.s < AT_SPAN && before.crossedAt == null && !openTo({ ...me, caution: 1 }, world, 1)) held += DT;
      if (crossAt == null && after.crossedAt != null) { crossAt = after.crossedAt; rested = before.me.stoppedAt != null; }
    },
  });
  return { rs, verdict, t: rs.world.t - rs.t0, rested, held };
}

export const showsOf = (def, m) => {
  const exposed = def.expose === "cameToRest" ? m.rested : m.held >= HELD_FOR;
  return { exposed, shows: m.rs.end?.why === "through" && m.verdict.stars === 3 && exposed && m.t >= TIME_BAND[0] && m.t <= TIME_BAND[1] };
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const when = new Date().toISOString().slice(0, 10);
  console.log(`round-seeds, run ${when}: seeds 1-${SEEDS}, cars ${COUNTS.join("/")}, time band ${TIME_BAND.join("-")} s, held at least ${HELD_FOR} s`);
  for (const base of ROUNDS.filter((r) => !ids.length || ids.includes(r.id))) {
    const table = [];
    for (const cars of COUNTS) {
      const rows = [];
      for (let seed = 1; seed <= SEEDS; seed++) {
        const def = { ...base, seed, cars };
        let m;
        try { m = measureRun(def); } catch (e) { rows.push({ seed, error: e.message }); continue; }
        const { exposed, shows } = showsOf(def, m);
        rows.push({ seed, why: m.rs.end?.why ?? "none", stars: m.verdict.stars, faults: m.verdict.faults.map((f) => f.id).join("+"), t: m.t, exposed, held: m.held, shows });
      }
      const ok = rows.filter((r) => r.shows), through = rows.filter((r) => r.why === "through"), exp = rows.filter((r) => r.exposed);
      const ts = ok.map((r) => r.t).sort((a, b) => a - b);
      const why = {}; for (const r of rows) why[r.why ?? "error"] = (why[r.why ?? "error"] ?? 0) + 1;
      const fl = {}; for (const r of rows) if (r.faults) fl[r.faults] = (fl[r.faults] ?? 0) + 1;
      console.log(`${base.id.padEnd(10)} cars ${String(cars).padStart(2)}: shows ${String(ok.length).padStart(2)}/${SEEDS}  through ${String(through.length).padStart(2)}  exposed ${String(exp.length).padStart(2)}  time ${ts.length ? `${ts[0].toFixed(1)}..${ts[ts.length - 1].toFixed(1)} (median ${ts[ts.length >> 1].toFixed(1)})` : "-"}  ends ${JSON.stringify(why)}  good-driver faults ${JSON.stringify(fl)}`);
      table.push({ cars, rows, shows: ok.length });
    }
    const best = table.slice().sort((a, b) => b.shows - a.shows || a.cars - b.cars)[0];
    const first = best.rows.find((r) => r.shows);
    console.log(first ? `  CHOSEN ${base.id}: cars ${best.cars}, seed ${first.seed} (shows at ${best.shows}/${SEEDS} seeds; good driver ${first.t.toFixed(1)} s)` : `  NONE ${base.id}: no seed in 1-${SEEDS} shows the property at any of cars ${COUNTS.join("/")}`);
  }
}
