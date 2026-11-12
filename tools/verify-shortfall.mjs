/* =====================================================================
   THE KNOWN-SHORTFALL MECHANISM (tools/lib/shortfall.mjs; the maintainer's ruling, 12 November): a bar that stays as
   stated, a SKIP with its reason when the world does not meet it, a regression that goes red, and a ratchet that
   only moves toward the bar. Every expectation below is stated here as a property, not read from the module's constants.
   ===================================================================== */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { knownShortfall } from "./lib/shortfall.mjs";

let failed = 0;
const check = (ok, msg) => { console.log(`  ${ok ? "ok  " : "FAIL:"} ${msg}`); if (!ok) failed++; };
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shortfall-"));
process.env.SHORTFALL_FILE = path.join(dir, "shortfalls.json");
const state = () => { try { return JSON.parse(fs.readFileSync(process.env.SHORTFALL_FILE, "utf8")); } catch { return {}; } };
const run = (measured, extra = {}) => knownShortfall({ id: "x", label: "near rest", measured, bar: 0.01, allow: 0.01, item: "the merge item", reason: "joiners at rest at the lane end", ...extra });

console.log("\n1. A BASELINE IS MADE DELIBERATELY, NEVER BY A CHECK PASSING");
{
  delete process.env.SHORTFALL_RECORD;
  const r = run(0.13);
  check(!r.pass && /no shortfall is recorded/.test(r.line) && !fs.existsSync(process.env.SHORTFALL_FILE), "above the bar with nothing recorded and no one asking to record: FAIL, and nothing is written");
  process.env.SHORTFALL_RECORD = "1";
  const q = run(0.13);
  check(q.pass && /^  SKIP/.test(q.line) && state().x?.recorded === 0.13 && state().x.item === "the merge item", "with SHORTFALL_RECORD=1 it records the measured value, with the item that tracks it, and skips");
  delete process.env.SHORTFALL_RECORD;
}

console.log("\n2. THE KNOWN SHORTFALL IS A SKIP, NOT A PASS, AND WRITES NOTHING");
{
  const before = fs.readFileSync(process.env.SHORTFALL_FILE, "utf8");
  for (const m of [0.13, 0.135, 0.125]) {
    const r = run(m);
    check(r.pass && /^  SKIP/.test(r.line) && /known shortfall/.test(r.line) && /0\.13/.test(r.line) && /the merge item/.test(r.line), `measured ${m} against a bar of 0.01 and a record of 0.13 (allowance 0.01): SKIP naming the value, the record and the item`);
  }
  check(fs.readFileSync(process.env.SHORTFALL_FILE, "utf8") === before, "and a run that only repeats the recorded value (within the allowance) writes nothing: a diff to the file always means the world moved");
}

console.log("\n3. A REGRESSION GOES RED");
{
  const r = run(0.15);
  check(!r.pass && /REGRESSION/.test(r.line) && state().x.recorded === 0.13, "measured 0.15 against a record of 0.13 and an allowance of 0.01: FAIL as a regression, and the record is not moved to the worse value");
}

console.log("\n4. THE RATCHET TIGHTENS WHEN THE WORLD IMPROVES, EXPLICITLY, AND ONLY TOWARD THE BAR");
{
  const r = run(0.08);
  check(r.pass && /shortfall improved, recorded value now 0\.08/.test(r.line) && state().x.recorded === 0.08, "measured 0.08 against a record of 0.13: SKIP saying 'shortfall improved, recorded value now 0.08', and the record is 0.08");
  const s = run(0.13);
  check(!s.pass && /REGRESSION/.test(s.line), "and the old, worse value is now a regression: the improvement cannot be undone without the line going red");
  const t = run(0.085);
  check(t.pass && state().x.recorded === 0.08, "a value inside the allowance of the new record is a plain skip and the record stays");
}

console.log("\n5. A SHORTFALL THAT REACHES ITS BAR PASSES AND DISAPPEARS");
{
  const r = run(0.009);
  check(r.pass && /^  ok/.test(r.line) && /closed/.test(r.line) && state().x === undefined, "measured 0.009 against a bar of 0.01: ok, 'shortfall closed', and the record is removed");
  const s = run(0.5);
  check(!s.pass, "and the bar is then a plain bar again: 0.5 with nothing recorded is a FAIL, not a skip");
  const u = run(0.009);
  check(u.pass && /^  ok/.test(u.line) && !/closed/.test(u.line), "a value that meets the bar with nothing recorded is a plain ok");
}

console.log("\n6. A STRICT ALLOWANCE (a count over fixed seeds, the sim being deterministic)");
{
  process.env.SHORTFALL_RECORD = "1";
  knownShortfall({ id: "n", label: "crashes", measured: 5, bar: 0, item: "the crash item", reason: "sanctioned low-speed crashing, no rate set" });
  delete process.env.SHORTFALL_RECORD;
  check(knownShortfall({ id: "n", label: "crashes", measured: 5, bar: 0, item: "i", reason: "r" }).pass, "the recorded count again: SKIP");
  check(!knownShortfall({ id: "n", label: "crashes", measured: 6, bar: 0, item: "i", reason: "r" }).pass, "one more crash than recorded: FAIL");
  check(/recorded value now 3/.test(knownShortfall({ id: "n", label: "crashes", measured: 3, bar: 0, item: "i", reason: "r" }).line), "two fewer: the record moves to 3");
}

fs.rmSync(dir, { recursive: true, force: true });
console.log(failed ? `\n${failed} FAILURE(S)` : "\nOK: a bar stays as stated; a shortfall is a skip with its reason, a regression is red, and the record only moves toward the bar -- and a run that repeats it writes nothing.");
process.exit(failed ? 1 : 0);
