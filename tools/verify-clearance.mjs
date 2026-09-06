/* Clearance: how much of somebody else's space the candidate took.
 *
 * The standard is ENCROACHMENT ON ENTITLED SPACE, not forced evasive
 * action — the maintainer's ruling, and stricter than collision avoidance
 * on purpose. Turning within a fraction of a second in front of somebody
 * is a failure to yield whether or not they had to brake.
 *
 * Two consequences shape everything checked here. A fault must exist
 * INDEPENDENTLY of any reaction, or the marking sheet would depend on the
 * reaction layer and a scene where nobody happened to react would
 * silently contain no fault. And the unit is TIME, because a gap in
 * metres means nothing without closing speed.
 */
import fs from "node:fs";
import { simulate, safeAtFor, poseAt, LOOKAHEAD, M } from "../src/engine/index.js";
import {
  ENTITLED, REACTION_ENVELOPE, BANDS, bandFor, petBetween,
  encroachmentIn, worstEncroachment, PET_STEP,
} from "../src/engine/clearance.js";
import { SCENARIOS } from "../src/engine/scenarios.js";
import { composeScenario } from "../src/engine/compose.js";
import { specOf } from "../src/engine/road.js";
import { chaseFor } from "../src/frame.js";

let problems = 0;
const ok = (s) => console.log(`  ok   ${s}`);
const fail = (s) => { problems++; console.log(`  FAIL: ${s}`); };

console.log("\n" + "=".repeat(70));
console.log("CLEARANCE: the space you took, in seconds");
console.log("=".repeat(70));

/* ---------- 1. the bands are derived, not chosen -------------------- */
console.log("\n1. THE BANDS COME FROM THE ENGINE'S OWN NOTION OF ENTITLED SPACE");
{
  /* A driver is taught 2-3 seconds and this game's pace does not allow
     it. The scale factor is not invented to fit: forwardClaim has granted
     every moving vehicle LOOKAHEAD seconds of road ahead since it was
     written, and legalAt refuses to let anybody into that space. The
     entitled gap was already stated, already in seconds, already shipped. */
  ENTITLED === LOOKAHEAD
    ? ok(`entitled space is the engine's own claim, ${ENTITLED}s — change LOOKAHEAD and the bands follow`)
    : fail(`ENTITLED (${ENTITLED}) has drifted from LOOKAHEAD (${LOOKAHEAD}) and is now a second opinion`);

  /* Real driving marks the space encroached below ~2.0s and puts the
     other driver inside their own reaction envelope below ~1.0s. A 2:1
     split, preserved. */
  Math.abs(ENTITLED / REACTION_ENVELOPE - 2) < 1e-9
    ? ok(`and the real-world 2:1 ratio is preserved: ${ENTITLED}s entitled, ${REACTION_ENVELOPE}s reaction envelope (scale factor ${(ENTITLED / 2).toFixed(2)})`)
    : fail(`the bands are ${ENTITLED} and ${REACTION_ENVELOPE}, which is not the 2:1 real driving uses`);

  const ids = BANDS.map((b) => b.id);
  ids.filter((x) => BANDS.find((b) => b.id === x).terminal).length === 1
    ? ok(`four bands, exactly one terminal: ${ids.join(" < ")}`)
    : fail(`${ids.filter((x) => BANDS.find((b) => b.id === x).terminal).length} bands are terminal; only contact may be`);
}

/* ---------- 2. a fault exists without any reaction ------------------ */
console.log("\n2. THE FAULT DOES NOT DEPEND ON ANYBODY REACTING");
{
  /* Structural, not a promise. Nothing reacts in this engine yet — that
     was measured — so if clearance could only see a fault where somebody
     braked it would see none at all. It sees plenty, which is the point:
     the standard is stricter than collision avoidance. */
  const src = fs.readFileSync("src/engine/clearance.js", "utf8");
  const imports = [...src.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);
  const only = imports.every((i) => i === "./index.js");
  only
    ? ok(`clearance depends on the world and nothing else (imports: ${[...new Set(imports)].join(", ")})`)
    : fail(`clearance imports ${imports.filter((i) => i !== "./index.js").join(", ")}, so the fault could come to depend on a response to it`);

  let marked = 0, hit = 0, total = 0;
  for (const scn of SCENARIOS) {
    const sim = simulate(scn);
    const safe = safeAtFor(sim);
    const w = worstEncroachment(sim, { departAt: Math.max(0, safe - 1.2) });
    if (!w) continue;
    total++;
    if (w.touched) hit++; else if (w.band !== "comfortable") marked++;
  }
  marked > 0
    ? ok(`going 1.2s early is markable in ${marked} of ${total} situations WITHOUT contact (${hit} did make contact)`)
    : fail("no early departure produced a markable encroachment short of contact, so the mild bands are unreachable");
}

/* ---------- 3. a legal departure is comfortable --------------------- */
console.log("\n3. WHAT A LEGAL MANOEUVRE LEAVES");
{
  const rows = [];
  for (const scn of SCENARIOS) {
    const sim = simulate(scn);
    const w = worstEncroachment(sim, { departAt: safeAtFor(sim) });
    if (w) rows.push({ id: scn.id, ...w });
  }
  let gen = 0;
  const BRIEFS = [{ traffic: "light", visibility: "open" }, { traffic: "busy", visibility: "open" }, { traffic: "heavy", visibility: "open" }];
  for (let seed = 1; seed <= 30; seed++) {
    const scn = composeScenario(BRIEFS[seed % 3], seed * 7919);
    if (!scn) continue;
    const sim = simulate(scn);
    const w = worstEncroachment(sim, { departAt: safeAtFor(sim) });
    if (w) { rows.push({ id: `gen-${seed}`, ...w }); gen++; }
  }
  const vals = rows.map((r) => r.pet).sort((a, b) => a - b);
  const q = (p) => vals[Math.min(vals.length - 1, Math.floor(p * vals.length))];
  console.log(`   ${rows.length} manoeuvres whose paths conflict at all (${gen} generated)`);
  console.log(`   min ${vals[0].toFixed(2)}s   p10 ${q(0.1).toFixed(2)}s   median ${q(0.5).toFixed(2)}s   p90 ${q(0.9).toFixed(2)}s   max ${vals[vals.length - 1].toFixed(2)}s`);

  const bad = rows.filter((r) => r.touched);
  bad.length === 0
    ? ok("no legal departure makes contact with anybody")
    : fail(`${bad.length} legal departure(s) make contact: ${bad.map((r) => r.id).join(", ")}`);

  const comfy = rows.filter((r) => r.band === "comfortable").length;
  const share = comfy / rows.length;
  share >= 0.8
    ? ok(`${comfy} of ${rows.length} legal departures are comfortable (${(share * 100).toFixed(0)}%), so the standard does not mark ordinary driving`)
    : fail(`only ${(share * 100).toFixed(0)}% of legal departures are comfortable — the bands are marking correct driving`);

  /* The tail is not a failure. legalAt is computed WITH LOOKAHEAD, so the
     tightest legal departures land on the entitled boundary by
     construction, and a situation authored to be tight should measure as
     tight. That is the standard being stricter than the safety engine,
     which is the whole ruling. */
  const tightOnes = rows.filter((r) => r.band !== "comfortable").map((r) => `${r.id} ${r.pet.toFixed(2)}s`);
  console.log(`   legal but not comfortable: ${tightOnes.join(", ") || "none"}`);
}

/* ---------- 4. severity is monotone in how early you went ----------- */
console.log("\n4. GOING EARLIER NEVER IMPROVES THE BAND");
{
  const order = ["contact", "veryTight", "tight", "comfortable"];
  console.log("   scenario      legal " + [0, 0.5, 1.0, 1.5, 2.0].map((d) => `-${d.toFixed(1)}s`.padStart(14)).join(""));
  let breaks = 0, rows = 0;
  for (const scn of SCENARIOS) {
    const sim = simulate(scn);
    const safe = safeAtFor(sim);
    const seq = [0, 0.5, 1.0, 1.5, 2.0].map((d) => worstEncroachment(sim, { departAt: Math.max(0, safe - d) }));
    if (seq.some((w) => !w)) continue;
    rows++;
    for (let i = 1; i < seq.length; i++) {
      if (order.indexOf(seq[i].band) > order.indexOf(seq[i - 1].band)) breaks++;
    }
    if (rows <= 5) {
      const cells = seq.map((w) => `${w.pet.toFixed(2)} ${w.band.slice(0, 5)}`.padStart(14));
      console.log(`   ${scn.id.padEnd(13)} ${safe.toFixed(2)}s${cells.join("")}`);
    }
  }
  breaks === 0
    ? ok(`severity never improves as the candidate goes earlier, across ${rows} situations`)
    : fail(`${breaks} case(s) where departing earlier produced a BETTER band, so the measure is not monotone`);
}

/* ---------- 5. the worst of it, not the value at one instant -------- */
console.log("\n5. THE GAP RECOVERS, SO THE MINIMUM IS WHAT COUNTS");
{
  /* The candidate accelerates away, so trailing traffic gets its space
     back. Scoring the gap at any single instant — the moment of crossing,
     say — would understate the fault by exactly that recovery. */
  let worse = 0, cases = 0, biggest = 0, example = null;
  for (const scn of SCENARIOS) {
    const sim = simulate(scn);
    const safe = safeAtFor(sim);
    const departAt = Math.max(0, safe - 1.2);
    const ego = { ...sim.ego, departAt };
    const entitled = (sim.priors?.length ? sim.priors : sim.actors).filter((a) => a.kind !== "ped");
    for (const a of entitled) {
      const whole = petBetween(ego, a, { from: departAt });
      if (!Number.isFinite(whole.pet) || whole.touched) continue;
      /* The same measurement restarted just after the worst instant --
         which is what any single later reading, the moment of crossing
         included, would have seen. */
      const late = petBetween(ego, a, { from: whole.at + 0.3 });
      if (!Number.isFinite(late.pet)) continue;
      cases++;
      if (late.pet > whole.pet + 1e-9) {
        worse++;
        if (late.pet - whole.pet > biggest) { biggest = late.pet - whole.pet; example = `${scn.id}/${a.id}`; }
      }
    }
  }
  worse > 0
    ? ok(`the gap recovers in ${worse} of ${cases} conflicts — up to ${biggest.toFixed(2)}s better late on (${example}), which a single-instant reading would have missed`)
    : fail("no conflict showed the gap recovering, so either nothing accelerates away or the horizon is wrong");
}

/* ---------- 6. the mild band has to be visible ---------------------- */
console.log("\n6. CAN A PLAYER SEE THE DIFFERENCE?");
{
  /* The mild band is the one with no reaction to notice, so the gap
     itself is the observable — which is exactly the examiner's skill, and
     which makes the hardest faults to spot the least severe ones. That is
     correct, but only if the gap is actually legible. */
  const scn = SCENARIOS.find((s) => s.id === "gap");
  const sim = simulate(scn);
  const spec = specOf(scn);
  const CAR = 4.5;
  const rows = [];
  for (const look of [10, 6, 4]) {
    const c = chaseFor(spec, sim, 3, null, { lookAhead: look });
    const metres = (c.scale * 720) / 20;
    const pxPerM = (390 / (c.scale * 720)) * 20;     // a phone, 390 css px wide
    const v = 11.5;                                   // straight cruise, m/s
    rows.push({ look, metres, pxPerM, entitledPx: ENTITLED * v * pxPerM, edgePx: REACTION_ENVELOPE * v * pxPerM });
  }
  console.log("   look-ahead   frame   px/m   entitled 0.90s   band edge 0.45s   difference   in car lengths");
  console.log("   " + "-".repeat(84));
  for (const r of rows) {
    const lengths = (REACTION_ENVELOPE * 11.5) / CAR;
    console.log(
      `   ${String(r.look).padStart(8)}s ${r.metres.toFixed(0).padStart(6)}m ${r.pxPerM.toFixed(2).padStart(6)} ` +
      `${r.entitledPx.toFixed(0).padStart(14)}px ${r.edgePx.toFixed(0).padStart(15)}px ${(r.entitledPx - r.edgePx).toFixed(0).padStart(11)}px ${lengths.toFixed(1).padStart(14)}`
    );
  }
  /* A car is 4.5 m, so at cruise the entitled gap is a shade over two car
     lengths and the band edge is a shade over one. "More or less than a
     car length" is a judgment a player can actually make by eye, and it
     is the heuristic real drivers use. */
  const widest = rows[0];
  widest.entitledPx - widest.edgePx >= 20
    ? ok(`even at the widest view the bands are ${(widest.entitledPx - widest.edgePx).toFixed(0)} px apart — about one car length, which is how a driver judges it anyway`)
    : fail(`at the widest view the bands are only ${(widest.entitledPx - widest.edgePx).toFixed(0)} px apart, which is not a judgment anybody can make`);
  rows[2].entitledPx - rows[2].edgePx > (widest.entitledPx - widest.edgePx) * 2
    ? ok(`and the narrow view more than doubles it (${(rows[2].entitledPx - rows[2].edgePx).toFixed(0)} px), a second independent argument for the shorter look-ahead`)
    : ok("the narrow view does not materially improve legibility of the bands");
}

console.log("\n" + "=".repeat(70));
if (problems) {
  console.log(`FAILED: ${problems} problem(s).`);
  process.exit(1);
}
console.log("OK: encroachment measured in seconds, bands derived from the engine's own claim.");
