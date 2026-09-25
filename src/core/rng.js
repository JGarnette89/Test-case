/* =====================================================================
   CORE -- one seeded random source

   What the live simulator and the shelved engine both stand on. It
   imports nothing from src/engine/ or src/sim/, so the live screens
   can use it without the old engine in their closure (checked in
   verify-core.mjs).

   Moved here verbatim on 24 September from engine/index.js. The old home
   imports and re-exports it, so there is still one definition.
   ===================================================================== */
/* One seeded random source for the whole engine. mulberry32, and it was
   written out identically in four separate files before this — the exact
   duplication the project treats as a bug arriving early. Its first draw
   is well distributed for small seeds, which a plain LCG's is not: a
   naive one written for candidate.js returned ~0.236 for every seed in
   sequence, so a 15% branch taken on the first draw never fired once in
   200 candidates. */
export function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
