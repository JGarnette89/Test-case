/* Runner policy, independent of simulation and wall-clock timers.
 * Numeric timings stay compatible with tools/measure/subset-cost.mjs.
 * Hashes cover the check file itself, not its imported dependencies.
 */
export const TIME_FLOOR = 90;
export const TIME_CAP = 1200;

export function budgetFor({ recorded, sameFile, timeout = null, recordTimes = false }) {
  if (timeout !== null) return { seconds: timeout, reason: "--timeout override" };
  if (recordTimes) return { seconds: TIME_CAP, reason: "1,200 s cap (--record-times)" };
  if (!sameFile || !Number.isFinite(recorded) || recorded < 0)
    return { seconds: TIME_CAP, reason: "1,200 s cap (new, changed or unhashed check)" };
  const triple = 3 * recorded;
  if (triple >= TIME_CAP) return { seconds: TIME_CAP, reason: "1,200 s cap" };
  if (triple <= TIME_FLOOR) return { seconds: TIME_FLOOR, reason: "90 s floor" };
  return { seconds: triple, reason: "3x its last time" };
}

export function outcomeOf({ timedOut, code, seconds, recorded, sameFile }) {
  if (timedOut) return "TIMEOUT";
  if (code !== 0) return "FAIL";
  return sameFile && Number.isFinite(recorded) && seconds > recorded ? "SLOW" : "ok";
}
export const passed = (status) => status === "ok" || status === "SLOW";
