/* =====================================================================
   ENGINE VERIFICATION
   Run:  node tools/verify-windows.mjs

   Three checks, in the order they matter:

   1. Every scenario's window, printed. Read them. A window at the same
      instant the ego arrives means the scenario asks for anticipation,
      not reaction — that is a design choice, not a bug, but you should
      know which ones are like that.

   2. Trait vs control. Each trait-carrying scenario is re-run with the
      traits stripped. If a trait does not move the window, the scenario
      is not teaching anything and its timings need retuning. CLAUDE.md
      says this has caught real dead traits before.

   3. Scoring samples, dumped to tools/scoring-samples.csv for the Python
      re-derivation to check independently.
   ===================================================================== */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { simulate } from "../src/engine/index.js";
import { SCENARIOS } from "../src/engine/scenarios.js";
import { grade, GRACE, REACTION_FLOOR, EARLY_TOLERANCE } from "../src/engine/score.js";
import { specOf, validateRoad, validIntents } from "../src/engine/road.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const r2 = (n) => Math.round(n * 100) / 100;
let problems = 0;

/* ---------- 1. windows ---------- */
console.log("\nWINDOWS");
console.log("scenario        arrive  legalAt  think   actors  traits");
console.log("-".repeat(66));
for (const s of SCENARIOS) {
  const sim = simulate(s);
  const think = r2(sim.legalAt - s.ego.arriveAt);
  const traits = s.actors.flatMap((a) => a.traits || []);
  console.log(
    `${s.id.padEnd(15)} ${String(s.ego.arriveAt).padEnd(7)} ${String(sim.legalAt).padEnd(8)} ` +
    `${String(think).padEnd(7)} ${String(s.actors.length).padEnd(7)} ${traits.join(",") || "-"}`
  );
}

/* ---------- 1b. every scenario fits the road it is on ----------
   A three-legged junction has intents that lead nowhere: from the stem of
   a T, "straight" exits the leg that is not there. The car would drive off
   into open ground and it would look almost right, so it is checked rather
   than eyeballed. */
console.log("\nROADS");
{
  let bad = 0;
  for (const s of SCENARIOS) {
    const found = validateRoad(specOf(s), [{ ...s.ego, id: "ego" }, ...s.actors]);
    for (const msg of found) {
      bad++; problems++;
      console.log(`  FAIL: ${s.id}: ${msg}`);
    }
  }
  if (bad === 0) console.log(`  ok   all ${SCENARIOS.length} scenarios use legs their road actually has`);
}

/* ---------- 2. trait vs control ----------
   Traits split into two kinds, and only one kind is expected to move a
   window:

   PATH   bends where the car actually goes, so it must change the window.
          If it does not, the scenario is not teaching anything.
   INFO   changes only what the player can see in time, not where the car
          goes. lateSignal is the whole category: the legal window is
          identical, the driver just cannot read it as early. A zero delta
          here is correct, not a dead trait.                             */
const TRAIT_KIND = {
  wander: "PATH", creep: "PATH", overshoot: "PATH",
  slowStart: "PATH", wideTurn: "PATH",
  lateSignal: "INFO",
};

/* Path traits knowingly inert in a given scenario, with the reason. These
   are rulings from the maintainer, not excuses — the point of listing them
   is that a NEW dead trait still fails the check. Remove an entry the
   moment its scenario is retuned. */
const ACCEPTED_INERT = {
  "creeper/creep": "Masked by overshoot, which already claims further into " +
    "the box than creep ever reaches. Creepers are meant to confuse right of " +
    "way in harder, busier scenarios; this one is too simple to show it.",
  "lateflag/wideTurn": "Carries no weight here — the scenario teaches the " +
    "late indicator, not the line through the turn. Candidate for removal: " +
    "its tell is still shown to the player, which claims a consequence that " +
    "does not exist.",
};

// Re-run a scenario with a chosen set of traits removed from every actor.
const without = (s, drop) => ({
  ...s,
  ego: { ...s.ego },
  actors: s.actors.map((a) => ({
    ...a,
    traits: (a.traits || []).filter((t) => !drop.includes(t)),
  })),
});

console.log("\nTRAIT vs CONTROL   (each trait removed on its own)");
console.log("scenario        trait        kind  withTrait  without   delta");
console.log("-".repeat(66));
let traitScenarios = 0;
for (const s of SCENARIOS) {
  const traits = [...new Set(s.actors.flatMap((a) => a.traits || []))];
  if (traits.length === 0) continue;
  traitScenarios++;
  const withAll = simulate(s).legalAt;

  for (const t of traits) {
    const kind = TRAIT_KIND[t] || "PATH";
    const control = simulate(without(s, [t])).legalAt;
    const delta = r2(withAll - control);
    const dead = Math.abs(delta) < 1e-9;
    const accepted = ACCEPTED_INERT[`${s.id}/${t}`];
    // Only an unexplained path trait that moves nothing is a fault.
    const fault = dead && kind === "PATH" && !accepted;
    if (fault) problems++;
    const note = fault ? "  <-- PATH TRAIT DOES NOTHING"
      : dead && kind === "INFO" ? "  (expected: info only)"
      : dead ? "  (known, accepted)" : "";
    console.log(
      `${s.id.padEnd(15)} ${t.padEnd(12)} ${kind.padEnd(5)} ${String(withAll).padEnd(10)} ` +
      `${String(control).padEnd(9)} ${String(delta).padEnd(7)}${note}`
    );
  }
}
if (traitScenarios === 0) console.log("(no scenario carries a trait)");
if (Object.keys(ACCEPTED_INERT).length) {
  console.log("\naccepted inert traits (rulings, not bugs):");
  for (const [k, why] of Object.entries(ACCEPTED_INERT)) console.log(`  ${k} — ${why}`);
}

/* ---------- 3. scoring behaviour + sample dump ---------- */
console.log("\nSCORING SHAPE");
const probe = SCENARIOS[0];
const legalAt = simulate(probe).legalAt;
const offsets = [-1.0, -EARLY_TOLERANCE - 0.01, -EARLY_TOLERANCE + 0.01, 0, 0.2,
                 REACTION_FLOOR, 0.6, 1.0, 1.5, 2.0, GRACE - 0.01, GRACE, GRACE + 0.5];
console.log("offset from window   verdict     score");
console.log("-".repeat(66));
for (const o of offsets) {
  const g = grade({ legalAt, pressedAt: legalAt + o });
  console.log(`${String(r2(o)).padStart(8)}             ${g.verdict.padEnd(11)} ${g.score}`);
}

// Invariants that must hold whatever the numbers are.
const inside = grade({ legalAt, pressedAt: legalAt });
const atFloor = grade({ legalAt, pressedAt: legalAt + REACTION_FLOOR });
const atGrace = grade({ legalAt, pressedAt: legalAt + GRACE });
const check = (name, ok) => { if (!ok) { problems++; console.log(`  FAIL: ${name}`); } };
check("pressing exactly on the window scores 100", inside.score === 100);
check("the whole reaction floor scores 100", atFloor.score === 100);
check("score reaches 0 exactly at the grace limit", atGrace.score === 0);
check("no cliff: grace boundary is still 'good'", atGrace.verdict === "good");
check("just past grace is 'late'", grade({ legalAt, pressedAt: legalAt + GRACE + 0.01 }).verdict === "late");
check("premature press scores nothing", grade({ legalAt, pressedAt: legalAt - 1 }).score === 0);
check("never going scores nothing", grade({ legalAt, pressedAt: null }).verdict === "missed");
check("a collision scores nothing", grade({ legalAt, pressedAt: legalAt, collided: true }).score === 0);

// Monotonic: waiting longer must never score more.
let last = 101;
for (let o = -0.25; o <= GRACE + 0.001; o += 0.01) {
  const sc = grade({ legalAt, pressedAt: legalAt + o }).score;
  if (sc > last) { check(`monotonic decay (broke at offset ${r2(o)})`, false); break; }
  last = sc;
}

/* Samples for the independent Python check. Every scenario, swept finely. */
const rows = ["scenario,legalAt,pressedAt,verdict,score"];
for (const s of SCENARIOS) {
  const la = simulate(s).legalAt;
  for (let o = -0.6; o <= GRACE + 0.6; o = r2(o + 0.02)) {
    const g = grade({ legalAt: la, pressedAt: r2(la + o) });
    rows.push(`${s.id},${la},${r2(la + o)},${g.verdict},${g.score}`);
  }
}
const csv = path.join(HERE, "scoring-samples.csv");
writeFileSync(csv, rows.join("\n") + "\n", "utf8");
console.log(`\nwrote ${rows.length - 1} scoring samples to tools/scoring-samples.csv`);

console.log("\n" + "=".repeat(66));
console.log(problems === 0 ? "OK: no problems found." : `${problems} PROBLEM(S) FOUND.`);
process.exit(problems === 0 ? 0 : 1);
