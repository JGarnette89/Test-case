/* =====================================================================
   THE SEED POOLS (WORK-game-slice2 section 5; GAME.md rule 1: never author
   the answer). For each round type, each seed 1-200 at each car count:
   build the decision point (round.js toDecision), watch the road from the
   freeze with the way held for PROBE_FOR seconds, and sort the seed into a
   POOL by what the freeze shows:

     now   open at the freeze, and that opening lasts at least NOW_LONG s
           (going at once is right);
     wait  shut at the freeze, and the FIRST opening (a stretch of at least
           REACTION_FLOOR) begins between WAIT_FROM and WAIT_TO s of waiting
           and lasts at least WAIT_LONG s (waiting is right, and then going);

   and rejected when the point is not reached, an opening is shorter than
   that, nothing opens in time, or the ORACLE fails. THE ORACLE holds until
   the first opening plus REACTION_FLOOR and goes: it must end through,
   make the task, and earn 3 stars with no fault. A seed it cannot pass
   cleanly is not a fair round.

   THE OPENINGS ARE READ HERE BY openTo, tick by tick (tools/lib/round-drive
   tracker), never from the round's own record.

   usage: node tools/measure/round-seeds.mjs [typeId ...] [--cars=4,8,12] [--seeds=200] [--json]
   ===================================================================== */
import { TYPES } from "../../src/game/rounds.js";
import { toDecision, press, roundTick } from "../../src/game/round.js";
import { driveDecision, oracle, tracker } from "../lib/round-drive.mjs";
import { REACTION_FLOOR } from "../../src/core/perception.js";

export const NOW_LONG = 2.0;     // s [invented, the spec's]
export const WAIT_LONG = 1.5;    // s [invented, the spec's]
export const WAIT_FROM = 1.0;    // s [invented, the spec's]
export const WAIT_TO = 10.0;     // s [invented, the spec's]
export const PROBE_FOR = 12;     // s held, to see WAIT_TO plus WAIT_LONG [instrument]
const EPS = 1e-6;

/* Hold the car at the freeze and read the road for PROBE_FOR s. Returns the tracker and the freeze time, or null with no decision point. */
export function probe(type, cars, seed) {
  let rs = toDecision(type, seed, cars);
  if (!rs) return null;
  const T = tracker(), t0 = rs.decision.decideAt;
  rs = press(rs);
  T.see(rs);
  while (rs.world.t - t0 < PROBE_FOR && !rs.end) { rs = roundTick(rs); T.see(rs); }
  return { T, t0, tEnd: rs.world.t, ended: rs.end?.why ?? null };
}

/* One seed: its pool or its reason for none. */
export function classify(type, cars, seed) {
  const p = probe(type, cars, seed);
  if (!p) return { seed, pool: null, reason: "noPoint" };
  const { T, t0, tEnd } = p;
  const len = (s) => (s.to ?? tEnd) - s.from;
  let pool, reason = null, opens = null, lasts = null;
  if (T.freezeOpen) {
    const s0 = T.stretches[0];
    lasts = len(s0);
    if (lasts + EPS >= NOW_LONG) pool = "now"; else reason = "shortOpening";
  } else {
    const first = T.stretches.find((s) => len(s) >= REACTION_FLOOR - EPS);
    if (!first) reason = "nothingOpens";
    else {
      opens = first.from - t0; lasts = len(first);
      if (opens < WAIT_FROM - EPS) reason = "opensTooSoon";
      else if (opens > WAIT_TO + EPS) reason = "nothingOpens";
      else if (lasts + EPS < WAIT_LONG) reason = "shortOpening";
      else pool = "wait";
    }
  }
  if (!pool) return { seed, pool: null, reason };
  /* THE ORACLE. */
  const r = driveDecision(type, seed, cars, oracle);
  const v = r.verdict, ok = r.rs.end?.why === "through" && v.made === type.task && v.stars === 3 && v.faults.length === 0;
  if (!ok) return { seed, pool: null, reason: "oracleFails", wouldBe: pool, detail: `${r.rs.end?.why} ${v.stars}* [${v.faults.map((f) => f.id)}]` };
  return { seed, pool, opens, lasts, held: r.rs.decision.goAt - r.rs.decision.decideAt };
}

/* A type at a car count over seeds 1..n. */
export function sweep(type, cars, n, onSeed = null) {
  const rows = [];
  for (let seed = 1; seed <= n; seed++) { const row = classify(type, cars, seed); rows.push(row); if (onSeed) onSeed(row); }
  const why = {};
  for (const r of rows) if (!r.pool) why[r.reason] = (why[r.reason] ?? 0) + 1;
  return { cars, rows, now: rows.filter((r) => r.pool === "now").map((r) => r.seed), wait: rows.filter((r) => r.pool === "wait").map((r) => r.seed), why };
}

const args = process.argv.slice(2);
const main = !!process.argv[1] && process.argv[1].endsWith("round-seeds.mjs");
if (main) {
  const ids = args.filter((a) => !a.startsWith("--"));
  const opt = (name, d) => (args.find((a) => a.startsWith(`--${name}=`)) ?? `--${name}=${d}`).split("=")[1];
  const COUNTS = opt("cars", "4,8,12").split(",").map(Number), SEEDS = Number(opt("seeds", 200));
  for (const type of TYPES.filter((t) => !ids.length || ids.includes(t.id))) {
    const table = [];
    for (const cars of COUNTS) {
      const s = sweep(type, cars, SEEDS);
      console.log(`${type.id.padEnd(18)} cars ${String(cars).padStart(2)}: now ${String(s.now.length).padStart(3)}  wait ${String(s.wait.length).padStart(3)}  rejected ${JSON.stringify(s.why)}`);
      table.push(s);
    }
    const best = table.slice().sort((a, b) => b.now.length + b.wait.length - (a.now.length + a.wait.length) || a.cars - b.cars)[0];
    const hold = best.rows.filter((r) => r.pool === "wait").map((r) => r.held).sort((a, b) => a - b);
    console.log(`  CHOSEN ${type.id}: cars ${best.cars}, now ${best.now.length}, wait ${best.wait.length}; oracle hold in wait seeds min ${hold[0]?.toFixed(2)} median ${hold[hold.length >> 1]?.toFixed(2)} max ${hold[hold.length - 1]?.toFixed(2)} [M]`);
    console.log(`  POOL ${JSON.stringify({ id: type.id, cars: best.cars, now: best.now, wait: best.wait })}`);
  }
}
