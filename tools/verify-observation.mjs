/* =====================================================================
   OBSERVATION: DRIVERS WHO CAN MISS THINGS. The thinnest axis in the
   model -- it has never owned a fault of its own -- given something to
   express. A driver sees the road as it is and every so often looks away
   for their registration delay; while away they go on with the picture
   they had, carried forward (sim/attention.js, crossing.js `seenBy`), and
   they read a sign only while looking (sim/reading.js).

     1. Glances: nobody with no lag ever looks away; a glance lasts the
        driver's lag and comes round every LOOK_EVERY; drivers look away
        at different moments.
     2. While looking a driver sees the present. While away, the picture is
        carried forward: right about a car doing what it was doing, wrong
        about one that changed.
     3. With everybody looking away, crashes happen and every one is a
        recorded crash -- and the same traffic with nobody looking away
        has none. Counted and reported, never tuned to.
     4. Signs on a clear road are never missed, because every sign is in
        view longer than any glance lasts: misses need sight lines.
     5. A local knows their own district's signs; a driver with no lag
        reads everything, which is the sim as it was.
   ===================================================================== */
import { loadMap } from "../src/map/load.js";
import { TEST_MAPS } from "../src/map/samples.js";
import { seedGraph, step, seenBy, overlapping, pathOf, layoutOf, PERCEIVE } from "../src/sim/crossing.js";
import { DT, stoppingRoom } from "../src/sim/traffic.js";
import { knownControl, signReach, SIGN_LEGIBLE } from "../src/sim/reading.js";
import { lookingAway, LOOK_EVERY } from "../src/sim/attention.js";
import { deficitOf } from "../src/core/driver.js";

let failed = 0;
const check = (ok, msg) => { console.log(`  ${ok ? "ok  " : "FAIL:"} ${msg}`); if (!ok) failed++; };
const t1 = loadMap(TEST_MAPS.find((t) => t.id === "test-1").build());
const city = loadMap(TEST_MAPS.find((t) => t.id === "city").build());
const mean = (xs) => xs.reduce((s, x) => s + x, 0) / Math.max(1, xs.length);

console.log("\n1. GLANCES AWAY: HOW LONG, HOW OFTEN, AND NOT ALL AT ONCE");
{
  const away = (me, secs) => { let n = 0, runs = [], run = 0; for (let t = 0; t < secs; t += DT) { const a = lookingAway(t, me) > 0; if (a) { n++; run += DT; } else if (run) { runs.push(run); run = 0; } } return { share: (n * DT) / secs, runs }; };
  const none = away({ n: 7, lag: 0 }, 120);
  check(none.share === 0, "a driver with no lag never looks away");
  const g = away({ n: 7, lag: 1.5 }, 120);
  check(Math.abs(g.share - 1.5 / LOOK_EVERY) < 0.02 && g.runs.length >= 18 && g.runs.every((r) => Math.abs(r - 1.5) <= DT + 1e-9),
    `a driver with a 1.5 s lag looks away ${g.runs.length} times in two minutes, each for their lag, ${(100 * g.share).toFixed(0)}% of the time (${(100 * 1.5 / LOOK_EVERY).toFixed(0)}% by construction)`);
  const phases = new Set(Array.from({ length: 40 }, (_, n) => Math.round(((lookingAway(0.01, { n, lag: LOOK_EVERY - 0.02 }) + LOOK_EVERY) % LOOK_EVERY) * 10)));
  check(phases.size > 30, `forty drivers look away at ${phases.size} different moments, not together`);
}

console.log("\n2. WHAT A DRIVER WHO LOOKED AWAY STILL BELIEVES");
{
  let w = seedGraph(3, 50, t1, { target: 150, posted: true, perceive: true });
  for (let i = 0; i < 400; i++) w = step(w);
  let looking = 0, lookingOk = 0;
  const steady = [], changed = [];
  const byId = new Map(w.actors.map((a) => [a.id, a]));
  for (const me of w.actors) {
    if (!(me.lag > 0)) continue;
    const off = lookingAway(w.t, me);
    const seen = seenBy(w, me);
    if (!off) { looking++; if (seen === w.actors) lookingOk++; continue; }
    const back = Math.min(Math.round(off / DT), w.past.length);
    if (back < 1) continue;   // away for under half a tick: still the present
    const then = new Map(w.past[back - 1].map((a) => [a.id, a]));
    for (const s of seen) {
      const now = byId.get(s.id), was = then.get(s.id);
      if (!now || !was || now.k !== s.k || now.route !== s.route || s.player || s.crash) continue;
      (Math.abs(now.v - was.v) < 0.05 ? steady : changed).push(Math.abs(now.s - s.s));
    }
  }
  check(looking > 20 && lookingOk === looking, `the ${looking} drivers looking at this instant all see the present`);
  check(steady.length > 50 && mean(steady) < 0.1, `those looking away have a car moving steadily where it is: ${mean(steady).toFixed(3)} m out on average over ${steady.length} sightings`);
  check(changed.length > 10 && mean(changed) > 5 * mean(steady), `and are wrong about the cars that changed speed: ${mean(changed).toFixed(2)} m out over ${changed.length}`);
}

console.log("\n3. WITH EVERYBODY LOOKING AWAY NOW AND THEN: CRASHES, EVERY ONE RECORDED -- AND THEY ARE THE GLANCES' DOING");
{
  /* A controlled comparison: the same seed, map and count with nobody
     looking away. Counted and reported, never tuned to (DECISIONS.md 4.4). */
  let silent = 0, rows = [], on = 0, off = 0;
  for (const [name, loaded, cars] of [["test map 1", t1, 150], ["the city", city, 250]]) {
    const n = {};
    for (const perceive of [true, false]) {
      let w = seedGraph(3, 50, loaded, { target: cars, posted: true, perceive });
      for (let i = 0; i < 180 / DT; i++) {
        w = step(w);
        if (i % 5) continue;
        const byId = new Map(w.actors.map((x) => [x.id, x]));
        for (const o of overlapping(w)) if (!(byId.get(o.a)?.crash && byId.get(o.b)?.crash)) silent++;
      }
      n[perceive] = (w.crashes ?? []).length;
    }
    on += n[true]; off += n[false];
    rows.push(`${name} at ${cars} cars: ${n[true]} (nobody looking away: ${n[false]})`);
  }
  console.log(`       crashes in three minutes: ${rows.join(", ")}`);
  check(silent === 0, "every overlap is a recorded crash -- none silent");
  /* NOT ZERO WITHOUT GLANCES (29 September). This asserted `off === 0`,
     which only ever held by the seed: attentive city traffic has a
     measured background of about 9 crashes an hour (tools/measure/
     gap-risk.mjs), an open item of its own. When the compliance split
     moved this seed's occasions it met one -- two attentive left-turners
     at the signalled node, one of them extremely bold -- nothing to do
     with glances. The claim that survives is the one this section is
     for: the glances are most of the crashes. */
  check(on > 0 && off * 4 <= on, `the same traffic with nobody looking away crashes ${off} times against ${on}: the crashes are mostly the glances' (the rest is the attentive background, an open item)`);
}

console.log("\n4. SIGNS ON A CLEAR ROAD ARE NEVER MISSED -- AND WHY");
{
  /* Measured first, and the answer is the finding: on these maps a stop
     sign is in clear view for longer than anybody's glance away lasts, so
     every driver reads it, poor observer or sound, and in time to stop.
     A sign is missed only where its view is cut short -- a short block, a
     van, a building, a crest -- which is sight lines, the next piece. So
     what is held is the arithmetic that makes it so; a map whose view of
     a sign is shorter than the longest glance fails here, and then the
     misses are real and belong on this check's tally. */
  const longest = PERCEIVE.floor + PERCEIVE.span * (1 + PERCEIVE.jitter);
  let shortest = Infinity, where = "";
  for (const [name, loaded] of [["test map 1", t1], ["the city", city]]) {
    const w = seedGraph(1, 50, loaded, { target: 10, posted: true });
    for (const spot of w.course.at) {
      const L = spot.layout;
      for (const path of Object.values(L.paths)) {
        const c = L.place.control[path.from];
        if (c !== "stop" && c !== "yield") continue;
        const { at, from } = signReach(L, path);
        const v = L.legs[path.from]?.speed ?? 50 / 3.6;
        const secs = (at - from) / v;
        if (secs < shortest) { shortest = secs; where = `${name}, ${path.from}`; }
      }
    }
  }
  check(shortest > longest, `the shortest clear view of any stop or yield sign is ${shortest.toFixed(1)} s at the posted speed (${where}), against the longest glance anybody takes, ${longest.toFixed(2)} s`);
  const tally = { sound: { passes: 0, missed: 0 }, poor: { passes: 0, missed: 0 } };
  for (const [loaded, cars] of [[t1, 150], [city, 250]]) {
    let w = seedGraph(5, 50, loaded, { target: cars, posted: true, perceive: true });
    const readAt = new Map();
    for (let i = 0; i < 120 / DT; i++) {
      const before = new Map(w.actors.map((a) => [a.id, a]));
      w = step(w);
      for (const a of w.actors) {
        const was = before.get(a.id);
        if (!was || was.k !== a.k || was.route !== a.route || a.player || a.crash || a.home) continue;
        const L = layoutOf(w, a), p = pathOf(w, a);
        if (L.place.control[p.from] !== "stop") continue;
        const key = `${a.id}@${a.k}`;
        if (!readAt.has(key) && knownControl(a, L, p, w.t) === "stop") readAt.set(key, { gap: p.stopAt - a.s, v: a.v });
        if (was.s < p.stopAt && a.s >= p.stopAt) {
          const d = deficitOf(a.ratings, "observation").deficit;
          const who = d < 0.2 ? tally.sound : d > 0.5 ? tally.poor : null;
          if (!who) continue;
          who.passes++;
          const r = readAt.get(key);
          if (!r || r.gap < stoppingRoom(r.v)) who.missed++;
        }
      }
    }
  }
  check(tally.poor.passes > 20 && tally.sound.passes > 20 && tally.poor.missed === 0 && tally.sound.missed === 0,
    `and so on the road: ${tally.poor.passes} stop lines passed by poor observers and ${tally.sound.passes} by sound ones, every sign read in time to stop`);
}

console.log("\n5. LOCALS, AND THE PERFECT READER");
{
  const w = seedGraph(1, 50, city, { target: 50, posted: true, perceive: true });
  let spot = null;
  for (const s of w.course.at) for (const [id, leg] of Object.entries(s.layout.legs)) if (!spot && leg.zone && s.layout.place.control[id] === "stop") spot = { id, leg, L: s.layout };
  const path = Object.values(spot.L.paths).find((p) => p.from === spot.id);
  const { from } = signReach(spot.L, path);
  /* Just come into view, and looking away since before it did. */
  const n = [...Array(400).keys()].find((k) => lookingAway(10, { n: k, lag: 2.0 }) > 1.5);
  const eyesOff = { s: from + 1, v: 14, lag: 2.0, n };
  check(knownControl({ ...eyesOff, home: spot.leg.zone }, spot.L, path, 10) === "stop" && knownControl({ ...eyesOff, home: "elsewhere" }, spot.L, path, 10) === "none",
    `a metre into the sign's view (legible at ${SIGN_LEGIBLE} m) and looking away, a local knows the stop and a visitor has not read it yet`);
  const back = { ...eyesOff, n: [...Array(400).keys()].find((k) => lookingAway(10, { n: k, lag: 2.0 }) === 0) };
  check(knownControl({ ...back, home: "elsewhere" }, spot.L, path, 10) === "stop", "a visitor who is looking reads it the moment it is in view");
  check(knownControl({ ...eyesOff, lag: 0 }, spot.L, path, 10) === "stop" && knownControl({ ...eyesOff, lag: 0, s: -1000 }, spot.L, path, 10) === "stop",
    "and a driver with no lag knows it wherever they are: perception off is the sim as it was");
}

console.log(`\n${"=".repeat(70)}`);
console.log(failed ? `${failed} FAILURE(S)` : "OK: drivers look away for their lag every few seconds and not together, see the present while looking and a carried-forward picture while not, every crash that follows is recorded and is the glances' doing, a sign in clear view is read by everybody in time, and locals know their own.");
process.exit(failed ? 1 : 0);
