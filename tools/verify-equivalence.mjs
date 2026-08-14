/* =====================================================================
   BEHAVIOURAL EQUIVALENCE
   Run:  node tools/verify-equivalence.mjs
   Bake: node tools/verify-equivalence.mjs --write

   The other harnesses check that the engine is right. This one checks
   that it has not CHANGED, which is a different job and the one that
   matters during a refactor.

   The hole it fills: a change to geometry moves every window, so the
   baselines get updated, and at that moment the regression net can no
   longer tell an intended change from a mistake. So the fingerprint here
   is taken deliberately, committed, and compared — and a refactor that is
   supposed to preserve behaviour has to prove it did.

   What is fingerprinted is everything a renderer or a scorer can observe:
   the derived window, who outranks whom, when each road user departs, and
   the full pose of every road user across the whole scenario. If two
   engines agree on all of that they are the same engine.

   Rebaking is a decision, not a step. Only pass --write when the change
   is MEANT to move things, and say so in the commit.
   ===================================================================== */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { simulate, poseAt, spanOf } from "../src/engine/index.js";
import { whatEgoSees, sightBlockersOf, noseOut, creepPose } from "../src/engine/sight.js";
import { SCENARIOS } from "../src/engine/scenarios.js";
import { ROUTES } from "../src/engine/routes.js";
import { planRoute } from "../src/engine/route.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GOLDEN = path.join(HERE, "engine-golden.json");
const WRITE = process.argv.includes("--write");

const SAMPLE = 0.05;              // matches the engine's own resolution
const r3 = (n) => Math.round(n * 1000) / 1000;

/* Every pose a scenario produces, start to finish. Rounded to a
   thousandth of a pixel: far finer than anything visible, coarse enough
   that floating-point noise between platforms cannot cause a false alarm. */
function fingerprint(scn) {
  const sim = simulate(scn);
  const people = [sim.ego, ...sim.actors];
  const end = Math.max(scn.duration, ...people.map((p) => (p.departAt ?? 0) + spanOf(p))) + 0.5;

  const tracks = {};
  for (const p of people) {
    const track = [];
    for (let t = 0; t <= end; t = r3(t + SAMPLE)) {
      const q = poseAt(p, t);
      track.push([r3(q.x), r3(q.y), r3(q.rot), q.gone ? 1 : 0, q.hidden ? 1 : 0, q.waiting ? 1 : 0]);
    }
    tracks[p.id] = track;
  }

  /* Poses alone miss the sightline mechanic: the eye sits a metre back
     from the bumper, so moving it changes what can be read without moving
     anything on screen. Sampled across a few creep steps, since creeping
     is the thing that is supposed to change the answer. */
  const sightAt = [];
  const statics = sightBlockersOf(scn);
  for (let t = r3(scn.ego.arriveAt); t <= Math.min(sim.legalAt + 1, scn.duration); t = r3(t + 0.4)) {
    for (const creeps of [0, 2]) {
      sightAt.push([
        t, creeps,
        r3(noseOut(creepPose(sim.ego, t, creeps))),
        JSON.stringify(whatEgoSees(sim, t, creeps, statics)),
      ]);
    }
  }

  return {
    legalAt: sim.legalAt,
    priors: sim.priors.map((p) => p.id),
    departs: people.map((p) => [p.id, r3(p.departAt ?? 0)]),
    spans: people.map((p) => [p.id, r3(spanOf(p))]),
    tracks,
    sight: sightAt,
  };
}

function build() {
  const out = { scenarios: {}, routes: {} };
  for (const s of SCENARIOS) out.scenarios[s.id] = fingerprint(s);
  for (const r of ROUTES) {
    const plan = planRoute(r, SCENARIOS);
    out.routes[r.id] = plan.ok
      ? plan.legs.map((leg) => ({ id: leg.id, from: leg.ego.from, legalAt: simulate(leg).legalAt }))
      : { problems: plan.problems.map((p) => p.detail) };
  }
  return out;
}

const current = build();

if (WRITE) {
  writeFileSync(GOLDEN, JSON.stringify(current), "utf8");
  const n = Object.keys(current.scenarios).length;
  const points = Object.values(current.scenarios)
    .reduce((a, s) => a + Object.values(s.tracks).reduce((b, t) => b + t.length, 0), 0);
  console.log(`baked ${n} scenarios and ${Object.keys(current.routes).length} routes`);
  console.log(`${points} sampled poses -> tools/engine-golden.json`);
  console.log("\nOnly correct if this change was MEANT to move behaviour.");
  process.exit(0);
}

if (!existsSync(GOLDEN)) {
  console.log("no baseline yet — run with --write to bake one");
  process.exit(1);
}

const golden = JSON.parse(readFileSync(GOLDEN, "utf8"));
let problems = 0;
const fail = (m) => { problems++; console.log(`  FAIL: ${m}`); };

console.log("\nSCENARIOS");
const ids = new Set([...Object.keys(golden.scenarios), ...Object.keys(current.scenarios)]);
for (const id of ids) {
  const a = golden.scenarios[id], b = current.scenarios[id];
  if (!a) { console.log(`  new    ${id} (not in the baseline)`); continue; }
  if (!b) { fail(`${id} has disappeared`); continue; }

  if (a.legalAt !== b.legalAt) { fail(`${id}: window ${a.legalAt} -> ${b.legalAt}`); continue; }
  if (JSON.stringify(a.priors) !== JSON.stringify(b.priors)) {
    fail(`${id}: priors ${JSON.stringify(a.priors)} -> ${JSON.stringify(b.priors)}`); continue;
  }
  if (JSON.stringify(a.departs) !== JSON.stringify(b.departs)) {
    fail(`${id}: departure times changed`); continue;
  }
  if (JSON.stringify(a.spans) !== JSON.stringify(b.spans)) {
    fail(`${id}: traversal times changed`); continue;
  }

  // Poses: report the first divergence and how far off it is, because
  // "something moved" is not actionable and "the ego is 3px out at 2.4s" is.
  let diverged = null;
  for (const who of Object.keys(a.tracks)) {
    const ta = a.tracks[who], tb = b.tracks[who];
    if (!tb) { diverged = { who, t: 0, note: "missing from the new run" }; break; }
    if (ta.length !== tb.length) { diverged = { who, t: 0, note: `track length ${ta.length} -> ${tb.length}` }; break; }
    for (let i = 0; i < ta.length; i++) {
      const [x1, y1, r1, g1, h1, w1] = ta[i];
      const [x2, y2, r2, g2, h2, w2] = tb[i];
      if (x1 !== x2 || y1 !== y2 || r1 !== r2 || g1 !== g2 || h1 !== h2 || w1 !== w2) {
        diverged = {
          who, t: r3(i * SAMPLE),
          note: `by ${r3(Math.hypot(x2 - x1, y2 - y1))}px, ${r3(r2 - r1)}deg` +
                (g1 !== g2 || h1 !== h2 || w1 !== w2 ? " and a state flag" : ""),
        };
        break;
      }
    }
    if (diverged) break;
  }
  if (diverged) { fail(`${id}: ${diverged.who} moves at t=${diverged.t}s — ${diverged.note}`); continue; }

  if (JSON.stringify(a.sight ?? null) !== JSON.stringify(b.sight ?? null)) {
    const row = (a.sight || []).findIndex((s, i) => JSON.stringify(s) !== JSON.stringify(b.sight?.[i]));
    const at = a.sight?.[row];
    fail(`${id}: what the driver can see changed` + (at ? ` (t=${at[0]}s, ${at[1]} creeps)` : ""));
    continue;
  }

  console.log(`  same   ${id.padEnd(16)} window ${a.legalAt}`);
}

console.log("\nROUTES");
for (const id of Object.keys(golden.routes)) {
  const a = JSON.stringify(golden.routes[id]), b = JSON.stringify(current.routes[id]);
  a === b ? console.log(`  same   ${id}`) : fail(`${id}: plan or windows changed`);
}

console.log("\n" + "=".repeat(66));
if (problems === 0) {
  console.log("OK: the engine behaves exactly as the baseline.");
} else {
  console.log(`${problems} DIFFERENCE(S) from the baseline.`);
  console.log("If they were intended, rebake: node tools/verify-equivalence.mjs --write");
}
process.exit(problems === 0 ? 0 : 1);
