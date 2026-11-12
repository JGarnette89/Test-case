/* =====================================================================
   A KNOWN SHORTFALL, WITH A RATCHET (12 November, the maintainer's ruling; DECISIONS 10.70).

   A bar that states a goal the world does not yet meet (Jay's "1 in 10000" for a stand at the end of the merge
   lane; a near-zero crash rate) must not sit red for months -- a suite people read past is worth less than none --
   and must not be loosened to meet the world either. So the bar stays exactly as stated and the check reports one
   of four things, never a quiet pass:

     ok     the measured value meets the bar. If a recorded shortfall existed it is CLOSED (removed from the state).
     SKIP   the bar is not met, and the value is no worse than the recorded one (within the allowance): a KNOWN
            SHORTFALL, printed with its reason, the open item that tracks it, today's value, the bar and the
            recorded value. Not a pass; the runner counts it and lists it.
     SKIP   ... "shortfall improved, recorded value now X": the value is better than the recorded one by more than
            the allowance, so the recorded value MOVES to it. THE RATCHET ONLY EVER MOVES TOWARD THE BAR; a shortfall
            that could be undone without the line going red would be protecting yesterday's badness.
     FAIL   the value is worse than the recorded one by more than the allowance: a REGRESSION, new information,
            or there is no recorded value and nobody asked for one to be made.

   WHERE THE RECORDED VALUES LIVE: `tools/shortfalls.json`, TRACKED, and written only by this module -- when a
   shortfall is first recorded (SHORTFALL_RECORD=1, deliberately), when it improves, and when it closes. It is
   not a run artifact like check-times.json: a run that merely repeats the recorded value writes nothing, so a
   diff to this file always means the world moved. `SHORTFALL_FILE` points the module at another file (the check of
   this module uses one in a temp directory).

   LOWER IS BETTER, always (a rate, a share, a count of waits). `allow` is the noise allowance on the measured
   value, stated by the caller with its reasoning; 0 means strict, which is right for a count over fixed seeds
   (the sim is deterministic, so the same code gives the same value) and wrong for a share over a few hundred
   joiners, where a change elsewhere reshuffles which cars meet which and the allowance is the measurement's own
   standard error.
   ===================================================================== */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "shortfalls.json");
const fileOf = () => process.env.SHORTFALL_FILE ?? DEFAULT_FILE;
const read = () => { try { return JSON.parse(fs.readFileSync(fileOf(), "utf8")); } catch { return {}; } };
const write = (state) => fs.writeFileSync(fileOf(), JSON.stringify(state, null, 2) + "\n");
const num = (x) => (Number.isInteger(x) ? String(x) : (+x).toPrecision(4).replace(/\.?0+$/, ""));

/* Returns { pass, line }: `pass` false only for a FAIL (the caller counts it in its own `failed`); `line` is what
   to print. `id` is the stable key in the state file; `item` names the open item that tracks the shortfall;
   `reason` says in words why the world does not meet the bar. */
export function knownShortfall({ id, label, measured, bar, allow = 0, item, reason, unit = "" }) {
  const state = read(), rec = state[id]?.recorded, u = unit;
  if (measured <= bar) {
    if (state[id]) { delete state[id]; write(state); return { pass: true, line: `  ok   ${label}: measured ${num(measured)}${u} meets the bar ${num(bar)}${u} -- shortfall closed, its record removed (was ${num(rec)}${u}, tracked: ${item})` }; }
    return { pass: true, line: `  ok   ${label}: measured ${num(measured)}${u} meets the bar ${num(bar)}${u}` };
  }
  if (rec == null) {
    if (process.env.SHORTFALL_RECORD === "1") {
      state[id] = { recorded: measured, bar, item, reason, recordedAt: new Date().toISOString().slice(0, 10) }; write(state);
      return { pass: true, line: `  SKIP ${label}: known shortfall, RECORDED NOW: measured ${num(measured)}${u} against the bar ${num(bar)}${u} (${reason}; tracked: ${item})` };
    }
    return { pass: false, line: `  FAIL: ${label}: measured ${num(measured)}${u} against the bar ${num(bar)}${u} and no shortfall is recorded for "${id}" -- a baseline is made deliberately (SHORTFALL_RECORD=1 on a real run), never by a check passing` };
  }
  if (measured > rec + allow) return { pass: false, line: `  FAIL: ${label}: REGRESSION -- measured ${num(measured)}${u} against a recorded shortfall of ${num(rec)}${u} (allowance ${num(allow)}${u}, bar ${num(bar)}${u}; tracked: ${item})` };
  if (measured < rec - allow) {
    state[id] = { ...state[id], recorded: measured, recordedAt: new Date().toISOString().slice(0, 10) }; write(state);
    return { pass: true, line: `  SKIP ${label}: shortfall improved, recorded value now ${num(measured)}${u} (was ${num(rec)}${u}), still short of the bar ${num(bar)}${u} (${reason}; tracked: ${item})` };
  }
  return { pass: true, line: `  SKIP ${label}: known shortfall: measured ${num(measured)}${u} against the bar ${num(bar)}${u}, recorded ${num(rec)}${u} (${reason}; tracked: ${item})` };
}
