/* =====================================================================
   THE GREEN, NOTICED, AND THE HORN (the maintainer, 8 October).

   "some people get distracted or are on their phones and don't start
   right away. Cars honking to correct the poor behavior of other drivers
   should be included. a visual indicator of honking would be helpful ...
   not every driver would also be the type to honk right away, or at all
   while some might honk as soon as the light is green."

   1. How long a driver takes to notice their light has gone green is the
      observation axis and nothing else: a sharp observer the reaction
      floor, a poor one their registration delay, and longer when the
      change came mid-glance (attention.js). Nothing else about them moves
      it.
   2. Who honks and how soon is confidence and compliance: a timid driver
      never, a bold rule-minded one first.
   3. In the sim: poor observers visibly sit at greens longer; horns are
      heard, aimed only at a car that could have gone and has not, and wake
      it; timid drivers never honk; nothing crashes.
   4. A player who sits at a green gets honked at by the car behind.
   5. The horn is drawn: arcs over the car on screen, a badge on the edge
      for a horn at the player from off it, nothing for one aimed elsewhere
      off screen.
   ===================================================================== */
import { loadMap } from "../src/map/load.js";
import { TEST_MAPS } from "../src/map/samples.js";
import { seedGraph, step, noticeAfter, patienceOf, pathOf, waitAt, openTo, COMPETENT, UNDUE_AT, AT_LINE } from "../src/sim/crossing.js";
import { playerOn, withDriver } from "../src/sim/drive.js";
import { driver, DT } from "../src/sim/traffic.js";
import { movementLight } from "../src/sim/signal.js";
import { deficitOf } from "../src/core/driver.js";
import { REACTION_FLOOR, REGISTER_FLOOR, REGISTER_SPAN } from "../src/core/perception.js";
import { LOOK_EVERY } from "../src/sim/attention.js";
import { drawFrame } from "../src/iso/draw.js";

let failed = 0;
const check = (ok, msg) => { console.log(`  ${ok ? "ok  " : "FAIL:"} ${msg}`); if (!ok) failed++; };
const loaded = loadMap(TEST_MAPS.find((m) => m.id === "test-1").build());

console.log("\n1. NOTICING THE GREEN IS THE OBSERVATION AXIS");
{
  const at = (notices, n = 3, t = 0.01) => noticeAfter({ n, notices, caution: 1, ratings: { compliance: 1 } }, t);
  check(Math.abs(at(REGISTER_FLOOR) - REGISTER_FLOOR) < 1e-9 || at(REGISTER_FLOOR) <= 2 * REGISTER_FLOOR, `a sharp observer notices in their registration floor (${at(REGISTER_FLOOR).toFixed(2)} s, floor ${REGISTER_FLOOR})`);
  const poor = REGISTER_FLOOR + REGISTER_SPAN;
  let looking = Infinity, away = 0;
  for (let t = 0; t < LOOK_EVERY; t += 0.05) { const d = at(poor, 3, t); looking = Math.min(looking, d); away = Math.max(away, d); }
  check(Math.abs(looking - poor) < 1e-6 && away > poor && away <= 2 * poor, `a poor observer takes their registration delay (${looking.toFixed(2)} s) looking, and up to ${away.toFixed(2)} s when the change comes mid-glance -- never more than twice it`);
  const bold = { n: 3, notices: 1.2, caution: 0.1, ratings: { compliance: 0.2 } }, timid = { ...bold, caution: 1.9, ratings: { compliance: 1 } };
  check(noticeAfter(bold, 2) === noticeAfter(timid, 2), "and nothing else about the driver moves it: a bold scofflaw and a timid stickler with one registration delay notice together");
}

console.log("\n2. WHO HONKS, AND HOW SOON: confidence and compliance");
{
  const p = (caution, compliance) => patienceOf({ caution, ratings: { compliance } });
  check(p(1.4, 1) === Infinity && p(1.01, 0.5) === Infinity, "a timid driver (caution above the optimum) never honks");
  check(p(0.15, 1) < p(0.15, 0.3) && p(0.15, 0.3) < p(1, 1) && p(1, 1) < p(1, 0.3), `bold and rule-minded first (${p(0.15, 1).toFixed(1)} s), bold and careless next (${p(0.15, 0.3).toFixed(1)}), a sound driver at the undue-delay standard (${p(1, 1).toFixed(1)}), a careless sound one later (${p(1, 0.3).toFixed(1)})`);
  check(Math.abs(p(1, 1) - UNDUE_AT) < 1e-9, `a sound, compliant driver honks exactly where the maintainer marks undue delay (${UNDUE_AT} s)`);
}

console.log("\n3. IN THE SIM: test map 1, two seeds, five minutes at 120 cars");
{
  const starts = { sharp: [], poor: [] };
  let honks = 0, aimedWell = 0, timidHonks = 0, woken = 0, wokenFast = 0, crashes = 0;
  for (const seed of [1, 2]) {
    let w = seedGraph(seed, 50, loaded, { every: 2.0, target: 120, posted: true });
    const greenAt = new Map(), honkAtTarget = new Map();
    for (let i = 0; i < 300 / DT; i++) {
      const before = new Map(w.actors.map((a) => [a.id, a])), wb = w;
      w = step(w);
      for (const a of w.actors) {
        const b = before.get(a.id);
        if (!b || a.player) continue;
        if (b.heldRed && !a.heldRed && pathOf(w, a)?.intent === "straight") greenAt.set(a.id, w.t);
        if (a.honkAt != null && a.honkAt !== b.honkAt) {
          honks++;
          if (a.caution > 1) timidHonks++;
          /* Aimed well: at a car stopped at its line (AT_LINE, the sim's own), on its green, with its way open. */
          const tgt = wb.actors.find((x) => x.id === a.honkTo);
          if (tgt) {
            const tp = pathOf(wb, tgt), L = wb.course.at[tgt.k ?? 0].layout;
            const green = movementLight(L.signal, L.legs[tp.from]?.base, tp.intent, wb.t, wb.lights?.[tgt.k ?? 0]?.live) === "green";
            if (green && tgt.v < 0.3 && tgt.s >= waitAt(tp, tgt) - AT_LINE && openTo(tgt, wb, COMPETENT)) aimedWell++;
            honkAtTarget.set(tgt.id, a.honkAt);
          }
        }
        if (greenAt.has(a.id) && a.v > 0.5) {
          const d = deficitOf(a.ratings, "observation").deficit;
          if (d < 0.2) starts.sharp.push(w.t - greenAt.get(a.id)); else if (d >= 0.6) starts.poor.push(w.t - greenAt.get(a.id));
          if (honkAtTarget.has(a.id) && honkAtTarget.get(a.id) >= greenAt.get(a.id)) { woken++; if (w.t - honkAtTarget.get(a.id) <= REACTION_FLOOR + 1.5) wokenFast++; }
          greenAt.delete(a.id);
        }
      }
    }
    crashes += (w.crashes ?? []).filter((c) => !String(c.a).startsWith("ped-") && !String(c.b).startsWith("ped-")).length;
  }
  const med = (xs) => { const s = xs.slice().sort((x, y) => x - y); return s[s.length >> 1]; };
  check(starts.sharp.length >= 20 && starts.poor.length >= 10 && med(starts.poor) > med(starts.sharp) + 0.5,
    `poor observers sit visibly longer at a green going straight: median ${med(starts.poor)?.toFixed(1)} s against ${med(starts.sharp)?.toFixed(1)} s for sharp ones (${starts.poor.length} and ${starts.sharp.length} starts)`);
  check(honks >= 3 && aimedWell === honks, `horns are heard (${honks}), and every one is aimed at a car stopped at its line on its green with its way open (${aimedWell} of ${honks})`);
  check(timidHonks === 0, `no timid driver honked (${timidHonks})`);
  check(woken >= 1 && wokenFast === woken, `a driver honked at starts within a reaction and a pull-away of hearing it (${wokenFast} of ${woken})`);
  check(crashes === 0, `no vehicle touched another (${crashes})`);
}

console.log("\n4. A PLAYER WHO SITS AT A GREEN IS HONKED AT");
{
  let w = seedGraph(3, 50, loaded, { every: 1e9, target: 0, posted: true });
  const me0 = playerOn(w.course, "A-north", "end");
  const path = w.course.at[me0.k].layout.paths[me0.route];
  const me = { ...me0, s: path.stopAt - 2.25, v: 0, a: 0 };
  const car = { ...driver(w.road, 3, 9001), n: 9001, k: me.k, route: me.route, s: me.s - 7.5, v: 0, leg: 0, stoppedAt: 0, going: false, accepted: false, openFor: 0, openedAt: null, waited: 0, delayed: false };
  car.caution = 0.2; car.ratings = { ...car.ratings, compliance: 1 };
  w = withDriver({ ...w, actors: [car] }, me);
  const L = w.course.at[me.k].layout, base = L.legs[path.from].base;
  let greenFrom = null, honk = null;
  for (let i = 0; i < 120 / DT && honk == null; i++) {
    w = withDriver(step(w), me);
    const lit = movementLight(L.signal, base, path.intent, w.t, w.lights?.[me.k]?.live);
    if (lit === "green" && greenFrom == null) greenFrom = w.t;
    const c = w.actors.find((a) => a.id === car.id);
    if (c?.honkAt != null && c.honkTo === "player") honk = c.honkAt;
  }
  const wait = honk != null && greenFrom != null ? honk - greenFrom : null;
  check(greenFrom != null && wait != null && wait <= patienceOf(car) + 0.2, `the light came round to the player on the loop, the player sat, and the bold driver behind honked ${wait?.toFixed(1)} s into the green (patience ${patienceOf(car).toFixed(1)} s)`);
}

console.log("\n5. THE HORN IS DRAWN, AND SAYS WHO AND WHERE");
{
  const strokes = [];
  const ctx = new Proxy({}, { get: (t, p) => (p in t ? t[p] : p === "arc" ? (...args) => strokes.push({ arc: args, colour: t.strokeStyle }) : () => {}), set: (t, p, v) => { t[p] = v; return true; } });
  const canvas = { w: 400, h: 600 };
  const scene = (x, honkTo) => ({ roads: [], terrain: [], cam: { x: 0, y: 0 }, k: 8, tilt: false, t: 10.2, actors: [{ id: "car-1", n: 1, x, y: 0, z: 0, heading: 0, length: 4.5, width: 1.8, height: 1.5, honkAt: 10, honkTo }] });
  const whites = () => strokes.filter((s) => /255,255,255/.test(String(s.colour)) || s.colour === "#ffffff").length;
  strokes.length = 0; drawFrame(ctx, canvas, scene(0, "car-2")); const onScreen = whites();
  strokes.length = 0; drawFrame(ctx, canvas, scene(5000, "player")); const atPlayer = whites();
  strokes.length = 0; drawFrame(ctx, canvas, scene(5000, "car-2")); const elsewhere = whites();
  strokes.length = 0; drawFrame(ctx, canvas, { ...scene(0, "car-2"), t: 11 }); const over = whites();
  check(onScreen >= 3, `a honking car on screen throws white arcs over it (${onScreen})`);
  check(atPlayer >= 3, `a horn at the player from off the screen is a badge on its edge (${atPlayer} white strokes)`);
  check(elsewhere === 0, `a horn off the screen aimed at somebody else is not drawn (${elsewhere})`);
  check(over === 0, `and a horn is shown for its moment and gone (${over} strokes 1 s on)`);
}

console.log(failed ? `\n${failed} FAILURE(S)` : "\nall passed");
process.exit(failed ? 1 : 0);
