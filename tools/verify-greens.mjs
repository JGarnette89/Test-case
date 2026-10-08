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
import { seedGraph, step, noticeAfter, patienceOf, pathOf, waitAt, whatStops, HONK_AFTER, HONK_TOPS } from "../src/sim/crossing.js";
import { LOOP } from "../src/sim/actuated.js";
import { HONK_FOR } from "../src/sim/horn.js";
import { playerOn, withDriver, playerHonk } from "../src/sim/drive.js";
import { controls } from "../src/iso/controls.js";
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
  check(p(0.15, 1) < p(0.15, 0.3) && p(0.15, 0.3) < p(1, 1) && p(1, 1) < p(1, 0.3), `bold and rule-minded first (${p(0.15, 1).toFixed(1)} s), bold and careless next (${p(0.15, 0.3).toFixed(1)}), a sound driver at the maintainer's 2.5 s (${p(1, 1).toFixed(1)}), a careless sound one later (${p(1, 0.3).toFixed(1)})`);
  check(Math.abs(p(1, 1) - HONK_AFTER) < 1e-9 && [0.05, 0.3, 0.6, 1].every((c) => [0, 0.5, 1].every((k) => p(c, k) <= HONK_TOPS)), `a sound, compliant driver honks at the maintainer's ${HONK_AFTER} s, and nobody who honks waits past ${HONK_TOPS} s ("2-3 seconds tops")`);
}

console.log("\n3. IN THE SIM: test map 1, two seeds, five minutes at 120 cars");
{
  /* What a horn may be aimed at, judged from outside the horn's own code: a
     car stopped with no traffic holding it, no car close in front, nobody on
     foot, and not at its line under a red; or a car moving that had just
     come in front of the honker. */
  const atError = (wb, tgt, honker) => {
    if (!tgt) return false;
    if ((tgt.v ?? 0) >= 0.5) return honker.leadId === tgt.id;   // `honker` as it is after the tick: a near miss is the leader that has just appeared
    const ws = whatStops(tgt, wb);
    return !ws.held && ws.leader?.id !== "ped" && !(ws.queued && ws.leader?.id !== "line") && !(ws.leader?.id === "line" && ws.red && ws.gap <= LOOP);
  };
  const starts = { sharp: [], poor: [] };
  let honks = 0, atErrors = 0, timidHonks = 0, crashes = 0;
  for (const seed of [1, 2]) {
    let w = seedGraph(seed, 50, loaded, { every: 2.0, target: 120, posted: true });
    const greenAt = new Map();
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
          if (atError(wb, wb.actors.find((x) => x.id === a.honkTo), a)) atErrors++;
        }
        if (greenAt.has(a.id) && a.v > 0.5) {
          const d = deficitOf(a.ratings, "observation").deficit;
          if (d < 0.2) starts.sharp.push(w.t - greenAt.get(a.id)); else if (d >= 0.6) starts.poor.push(w.t - greenAt.get(a.id));
          greenAt.delete(a.id);
        }
      }
    }
    crashes += (w.crashes ?? []).filter((c) => !String(c.a).startsWith("ped-") && !String(c.b).startsWith("ped-")).length;
  }
  const med = (xs) => { const s = xs.slice().sort((x, y) => x - y); return s[s.length >> 1]; };
  check(starts.sharp.length >= 20 && starts.poor.length >= 10 && med(starts.poor) > med(starts.sharp) + 0.5,
    `poor observers sit visibly longer at a green going straight: median ${med(starts.poor)?.toFixed(1)} s against ${med(starts.sharp)?.toFixed(1)} s for sharp ones (${starts.poor.length} and ${starts.sharp.length} starts)`);
  check(atErrors === honks, `every horn in ordinary traffic is aimed at an error -- a car stopped with nothing holding it, or one that has just come in front (${atErrors} of ${honks}); traffic doing its job draws none`);
  check(timidHonks === 0, `no timid driver honked (${timidHonks})`);
  check(crashes === 0, `no vehicle touched another (${crashes})`);
}

console.log("\n4. THE PLAYER IS HONKED AT WHEREVER THEY IMPEDE OR ENDANGER SOMEBODY (the maintainer's cases)");
{
  const mk = (w, n, k, route, s, v = 0, caution = 1, compliance = 0.9) => {
    const c = { ...driver(w.road, 3, n), n, k, route, s, v, leg: 0, stoppedAt: v ? null : 0, going: false, accepted: false, openFor: 0, openedAt: null, waited: 0, delayed: false };
    c.caution = caution; c.ratings = { ...c.ratings, compliance }; return c;
  };
  /* Run with the player held where they are; every first horn, and the hardest any car braked. */
  const run = (w, me, secs) => {
    const honks = new Map();
    let hardest = 0;
    for (let i = 0; i < secs / DT; i++) {
      const wb = w;
      w = withDriver(step(w), me);
      for (const c of w.actors) {
        const b = wb.actors.find((x) => x.id === c.id);
        if (b && !c.player) hardest = Math.max(hardest, (b.v - c.v) / DT);
        if (c.honkAt != null && !honks.has(c.id)) honks.set(c.id, { to: c.honkTo, at: c.honkAt });
      }
    }
    return { honks, hardest, w };
  };
  const test1 = loadMap(TEST_MAPS.find((m) => m.id === "test-1").build());
  const fresh = (loaded) => seedGraph(3, 50, loaded, { every: 1e9, target: 0, posted: true });
  /* a. At a signal, a few metres short of the line: honked once the green has gone unused, never at the red. */
  for (const back of [3, 6]) {
    let w = fresh(test1);
    const me0 = playerOn(w.course, "A-north", "end"), L = w.course.at[me0.k].layout, path = L.paths[me0.route];
    const me = { ...me0, s: waitAt(path, me0) - back, v: 0, a: 0 };
    w = withDriver({ ...w, actors: [mk(w, 9001, me.k, me.route, me.s - 7.5)] }, me);
    let green = null;
    const r = (() => { const honks = new Map(); for (let i = 0; i < 40 / DT; i++) { w = withDriver(step(w), me); if (green == null && movementLight(L.signal, L.legs[path.from].base, path.intent, w.t, w.lights?.[me.k]?.live) === "green") green = w.t; for (const c of w.actors) if (c.honkAt != null && !honks.has(c.id)) honks.set(c.id, c.honkAt); } return honks; })();
    const at = r.get("car-9001");
    check(green != null && at != null && at > green && at - green <= HONK_TOPS + 0.1, `${back} m short of the line at a signal: the light came round and the player sat, and the car behind honked ${at != null && green != null ? (at - green).toFixed(1) : "never"} s into the green -- within the maintainer's 2-3 s, never at the red`);
  }
  /* b. Stopped mid-block in a live lane, three cars queued behind: all three honk, at the player. */
  {
    let w = fresh(test1);
    const me0 = playerOn(w.course, "A-north", "end");
    const me = { ...me0, s: 60, v: 0, a: 0 };
    w = withDriver({ ...w, actors: [1, 2, 3].map((q) => mk(w, 9000 + q, me.k, me.route, 60 - 7.5 * q)) }, me);
    const { honks } = run(w, me, 20);
    check(honks.size === 3 && [...honks.values()].every((h) => h.to === "player"), `stopped mid-block, three cars queued behind: ${honks.size} of them honk, all at the player -- a few cars back too (${[...honks.entries()].map(([id, h]) => `${id} at ${h.at.toFixed(1)} s`).join(", ")})`);
  }
  /* c. Stopped across two lanes: the cars in both lanes honk. */
  {
    let w = fresh(test1);
    const me0 = playerOn(w.course, "A-B", "end"), L = w.course.at[me0.k].layout, path = L.paths[me0.route], leg = L.legs[path.from];
    const me = { ...me0, s: 60, v: 0, a: 0, off: -1.5 };
    const other = L.legAt(leg.base, (leg.pos ?? leg.lane) - 1), r2 = L.routesFrom(other)[0];
    w = withDriver({ ...w, actors: [mk(w, 9001, me.k, me.route, 52.5), mk(w, 9002, me.k, r2, 51)] }, me);
    const { honks, w: after } = run(w, me, 20);
    const c2 = after.actors.find((a) => a.id === "car-9002");
    check(honks.size === 2 && [...honks.values()].every((h) => h.to === "player") && c2.s < 60 - 4, `stopped across two lanes: the car in each lane stops short of the player and honks (${honks.size}; the one in the next lane stood ${(60 - c2.s).toFixed(1)} m back)`);
  }
  /* d. Stopped in the box of an uncontrolled crossroads: the car on the crossing road honks. */
  {
    const signs = loadMap(TEST_MAPS.find((m) => m.id === "test-signs").build());
    let w = fresh(signs);
    const me0 = playerOn(w.course, "U-south", "end"), L = w.course.at[me0.k].layout, path = L.paths[me0.route];
    const me = { ...me0, s: (path.stopAt + path.clearAt) / 2, v: 0, a: 0 };
    const cross = Object.entries(L.paths).find(([r, p]) => p.intent === "straight" && L.conflicts[`${r}|${me.route}`] && !p.from.startsWith("U-south"));
    w = withDriver({ ...w, actors: [mk(w, 9001, me.k, cross[0], cross[1].stopAt - 60, 10)] }, me);
    const { honks } = run(w, me, 30);
    check(honks.get("car-9001")?.to === "player", `stopped in the middle of an intersection: the car held on the crossing road honks at the player (at ${honks.get("car-9001")?.at.toFixed(1)} s)`);
  }
  /* e. Cutting in close and slow in front of a car at speed: an instant horn. */
  {
    let w = fresh(test1);
    const me0 = playerOn(w.course, "A-B", "end"), L = w.course.at[me0.k].layout, path = L.paths[me0.route], leg = L.legs[path.from];
    const other = L.legAt(leg.base, (leg.pos ?? leg.lane) - 1), r2 = L.routesFrom(other).find((r) => L.paths[r].intent === "straight") ?? L.routesFrom(other)[0];
    const me = { ...me0, route: r2, s: 40 + 4.5 + 9, v: 5, a: 0 };
    w = withDriver({ ...w, actors: [mk(w, 9001, me0.k, r2, 40, 14)] }, me);
    const { honks, hardest } = run(w, me, 4);
    const h = honks.get("car-9001");
    check(h?.to === "player" && h.at < 0.5 && hardest > 5, `cutting in 9 m ahead at 18 km/h of a car at 50: it brakes at ${hardest.toFixed(1)} m/s^2 and honks at once (${h ? `${h.at.toFixed(2)} s` : "never"})`);
  }
  /* f. And not where the player is doing it right: waiting at a red, at their line. */
  {
    let w = fresh(test1);
    const me0 = playerOn(w.course, "A-north", "end"), L = w.course.at[me0.k].layout, path = L.paths[me0.route];
    const me = { ...me0, s: waitAt(path, me0), v: 0, a: 0 };
    w = withDriver({ ...w, actors: [mk(w, 9001, me.k, me.route, me.s - 7.5, 0, 0.05, 1)] }, me);
    let honkedAtRed = false;
    for (let i = 0; i < 40 / DT; i++) { w = withDriver(step(w), me); const c = w.actors.find((a) => a.id === "car-9001"); const lit = movementLight(L.signal, L.legs[path.from].base, path.intent, w.t, w.lights?.[me.k]?.live); if (c?.honkAt != null && c.honkAt >= w.t - 2 * DT && lit === "red") honkedAtRed = true; }
    check(!honkedAtRed, "a player waiting at their line on a red is never honked at, even by the most impatient driver behind");
  }
}

console.log("\n5. THE HORN IS DRAWN, AND SAYS WHO AND WHERE");
{
  const fills = [], lines = [];
  const ctx = new Proxy({}, { get: (t, p) => (p in t ? t[p] : p === "fill" ? () => fills.push(t.fillStyle) : p === "lineTo" ? () => lines.push(t.strokeStyle) : () => {}), set: (t, p, v) => { t[p] = v; return true; } });
  const canvas = { w: 400, h: 600 };
  const car = (id, x, extra = {}) => ({ id, n: 1, x, y: 0, z: 0, heading: 0, length: 4.5, width: 1.8, height: 1.5, ...extra });
  const scene = (honkerX, honkTo, t = 10.3) => ({ roads: [], terrain: [], cam: { x: 0, y: 0, z: 0 }, k: 8, tilt: false, t, actors: [car("car-1", honkerX, { honkAt: 10, honkTo }), car("player", 25, { player: true }), car("car-2", -20)] });
  const draw = (sc) => { fills.length = 0; lines.length = 0; drawFrame(ctx, canvas, sc); return { badge: fills.filter((f) => f === "#ffffff").length, pointer: lines.filter((s) => s === "#ffffff").length }; };
  const on = draw(scene(0, "player")), edge = draw(scene(5000, "player")), elsewhere = draw(scene(5000, "car-2")), gone = draw(scene(0, "player", 10 + HONK_FOR + 0.1));
  check(on.badge >= 1 && on.pointer >= 1, `a honking car on screen carries the badge, with a pointer to the player it is aimed at (${on.badge} white discs, ${on.pointer} white pointer strokes)`);
  check(edge.badge >= 1, `a horn at the player from off the screen is the badge on the screen's edge (${edge.badge})`);
  check(elsewhere.badge === 0, `a horn off the screen aimed at somebody else is not drawn (${elsewhere.badge})`);
  check(gone.badge === 0 && HONK_FOR >= 1.5, `a horn shows for ${HONK_FOR} s and is then gone (${gone.badge} after)`);
}

console.log("\n6. THE PLAYER'S HORN: the car behind the car behind can get the traffic moving");
{
  /* The control: a tap at the top centre honks; a drag that starts there steers; the signal taps are where they were. */
  const c = controls(), box = { w: 400, h: 700 };
  c.pointer("down", 1, 200, 30, box, 0); c.pointer("up", 1, 200, 30, box, 100);
  const tapped = c.state.horn;
  c.pointer("down", 2, 200, 30, box, 1000); c.pointer("move", 2, 260, 32, box, 1050); const steer = c.state.steer; c.pointer("up", 2, 260, 32, box, 1100);
  c.pointer("down", 3, 20, 30, box, 2000); c.pointer("up", 3, 20, 30, box, 2100);
  check(tapped === 1 && c.state.horn === 1 && steer > 0.4 && c.state.signal === "left", `a tap at the top centre is one honk, a drag that starts there steers (${steer.toFixed(2)}), and the left signal tap still signals`);
  /* In the sim: a driver at the head of a queue who will not notice the green for a long while; the player behind them, or behind the car behind them. */
  const test1 = loadMap(TEST_MAPS.find((m) => m.id === "test-1").build());
  const mk = (w, n, k, route, s, extra = {}) => ({ ...driver(w.road, 3, n), n, k, route, s, v: 0, leg: 0, stoppedAt: 0, going: false, accepted: false, openFor: 0, openedAt: null, waited: 0, delayed: false, ...extra });
  const trial = (back, honk, midCaution = 1.6) => {
    let w = seedGraph(3, 50, test1, { every: 1e9, target: 0, posted: true });
    const me0 = playerOn(w.course, "A-north", "end"), L = w.course.at[me0.k].layout, path = L.paths[me0.route];
    const line = waitAt(path, me0);
    /* The head car does not notice for a long time (a registration delay of 8 s), and the one between, if any, would never honk (timid). */
    const head = mk(w, 9001, me0.k, me0.route, line, { notices: 8, caution: 1.6 });
    const mid = back === 2 ? [mk(w, 9002, me0.k, me0.route, line - 7.5, { caution: midCaution })] : [];
    let me = { ...me0, s: line - 7.5 * back, v: 0, a: 0 };
    w = withDriver({ ...w, actors: [head, ...mid] }, me);
    let green = null, honked = null, started = null;
    for (let i = 0; i < 40 / DT && started == null; i++) {
      if (green != null && honked == null && honk && w.t >= green + 1) { me = { ...me, ...playerHonk(me, w) }; honked = { at: w.t, to: me.honkTo }; }
      w = withDriver(step(w), me);
      if (green == null && movementLight(L.signal, L.legs[path.from].base, path.intent, w.t, w.lights?.[me.k]?.live) === "green") green = w.t;
      const h = w.actors.find((a) => a.id === head.id);
      if (green != null && h && h.v > 0.5) started = w.t;
    }
    return { green, honked, started };
  };
  const quiet = trial(1, false), loud = trial(1, true), twoBack = trial(2, true), byTraffic = trial(2, false, 1);
  check(quiet.started - quiet.green > 6, `left alone, the driver at the head who has not noticed sits ${(quiet.started - quiet.green).toFixed(1)} s into the green`);
  check(loud.honked?.to === "car-9001" && loud.started - loud.honked.at < 2, `the player behind honks a second in: the horn is aimed at them and they go ${(loud.started - loud.honked.at).toFixed(1)} s after it`);
  check(twoBack.honked?.to === "car-9001" && twoBack.started - twoBack.honked.at < 2, `two cars back, the player's horn passes the car between and reaches the driver holding everybody up, who goes ${(twoBack.started - twoBack.honked.at).toFixed(1)} s after it`);
  /* WHAT THE MAINTAINER MEANT (8 October): "the cars ahead honking faster solve that problem without having the player input". The player two back does nothing; a sound driver between them honks within the 2-3 s, and the queue moves. */
  check(byTraffic.started != null && byTraffic.started - byTraffic.green <= HONK_TOPS + 2, `with no input from the player two cars back, the sound driver between honks and the driver at the head goes ${(byTraffic.started - byTraffic.green).toFixed(1)} s into the green -- against ${(quiet.started - quiet.green).toFixed(1)} s with nobody to honk`);
}

console.log(failed ? `\n${failed} FAILURE(S)` : "\nall passed");
process.exit(failed ? 1 : 0);
