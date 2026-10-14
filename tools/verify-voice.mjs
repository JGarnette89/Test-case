/* =====================================================================
   THE VOICE: what the game notices (sim/events.js), what it says
   (sim/voice.js), and the lines it says (content/dialogue.js).

   1. THE LIMITER, as properties over random event streams -- what any
      correct budget must do: never two lines inside GAP unless the second
      is urgent and URGENT_GAP has passed; no line twice in a session; no
      trigger again inside TRIGGER_REST; nothing stale spoken; the most
      severe pending event the one spoken; a line out of context never
      said; the same stream the same lines.
   2. THE LINES meet their spec: every trigger has them, under 90
      characters, metric, A.U.T.O. right about the stop rule.
   3. THE DETECTORS, each on the situation it names AND on its opposite --
      the player one tick apart on a real path of test map 1 (or the
      highway): a detector that fires on its opposite is noise, one that
      never fires is ceremony.
   ===================================================================== */
import { loadMap } from "../src/map/load.js";
import { testMap1, testLoop } from "../src/map/samples.js";
import { seedGraph, step } from "../src/sim/crossing.js";
import { playerOn } from "../src/sim/drive.js";
import { movementLight } from "../src/sim/signal.js";
import { DT } from "../src/sim/traffic.js";
import { KEEP_RIGHT_FAULT } from "../src/sim/lanechange.js";
import { detect, newEventState, TRIGGERS, CLEAN_RUN, STREAK, DAWDLE, CRAWL } from "../src/sim/events.js";
import { speak, newVoice, candidates, GAP, URGENT, URGENT_GAP, STALE, TRIGGER_REST } from "../src/sim/voice.js";
import { LINES } from "../src/content/dialogue.js";
import { rng } from "../src/core/rng.js";

let failed = 0;
const check = (ok, msg) => { console.log(`  ${ok ? "ok  " : "FAIL:"} ${msg}`); if (!ok) failed++; };

console.log("\n1. THE LIMITER");
{
  /* THE BUDGET, STATED HERE, not read from voice.js: measured against the
     module's own GAP, a GAP of zero passed (14 October, sabotaged) -- the
     check compared a quantity with itself. Changing the budget means
     changing this line, on purpose. */
  const BUDGET_GAP = 12, BUDGET_URGENT_GAP = 4;
  check(GAP === BUDGET_GAP && URGENT_GAP === BUDGET_URGENT_GAP, `the voice's budget is the record's: a line per ${BUDGET_GAP} s, ${BUDGET_URGENT_GAP} s for the urgent (voice.js has ${GAP} and ${URGENT_GAP})`);
  const ids = Object.keys(TRIGGERS);
  const run = (seed) => {
    const r = rng(seed);
    let v = newVoice(seed);
    const said = [], offered = [];
    for (let t = 0; t < 1800; t += DT) {
      const evs = [];
      if (r() < 0.05) { const id = ids[Math.floor(r() * ids.length)]; evs.push({ id, t, ...TRIGGERS[id] }); }
      offered.push(...evs);
      /* Pending and still sayable: an event whose lines are all used has nothing to be outranked by. */
      const pendingBefore = [...v.pending, ...evs].filter((e) => t - e.t <= STALE && !(t - (v.rested[e.id] ?? -Infinity) < TRIGGER_REST)).filter((e) => { const c = candidates(LINES, e, { when: "day" }, v.used); return c.auto.length + c.jay.length + c.rival.length > 0; });
      const out = speak(v, evs, t, LINES, { when: "day" });
      if (out.said) said.push({ ...out.said, sev: TRIGGERS[out.said.trigger].severity, top: Math.max(...pendingBefore.map((e) => e.severity)), offeredAt: pendingBefore.find((e) => e.id === out.said.trigger)?.t });
      v = out.state;
    }
    return { said, offered };
  };
  const a = run(7), b = run(7);
  let tooSoon = 0, repeats = 0, rested = 0, stale = 0, notTop = 0;
  const lineSeen = new Set(), lastBy = {};
  for (let i = 0; i < a.said.length; i++) {
    const s = a.said[i], p = a.said[i - 1];
    if (p && s.t - p.t < (s.sev >= URGENT ? BUDGET_URGENT_GAP : BUDGET_GAP) - 1e-9) tooSoon++;
    if (lineSeen.has(s.id)) repeats++; lineSeen.add(s.id);
    if (lastBy[s.trigger] != null && s.t - lastBy[s.trigger] < TRIGGER_REST) rested++; lastBy[s.trigger] = s.t;
    if (s.offeredAt == null || s.t - s.offeredAt > STALE) stale++;
    if (s.sev < s.top) notTop++;
  }
  check(a.said.length > 20 && a.said.length < a.offered.length / 3, `half an hour of random events: ${a.offered.length} noticed, ${a.said.length} said -- the budget holds the voice to a fraction`);
  check(tooSoon === 0, `never two lines inside ${BUDGET_GAP} s, or ${BUDGET_URGENT_GAP} s for severity ${URGENT} and up (${tooSoon} too soon)`);
  check(repeats === 0 && rested === 0, `no line said twice in a session (${repeats}), no trigger spoken to again inside ${TRIGGER_REST} s (${rested})`);
  check(stale === 0 && notTop === 0, `nothing said about an event over ${STALE} s old (${stale}), and the most severe pending event is the one said (${notTop} were not)`);
  check(JSON.stringify(a.said) === JSON.stringify(b.said), "the same stream, the same lines: a session replays");
  const raceOnly = Object.values(LINES).flat().filter((l) => l.when === "race").map((l) => l.id);
  check(raceOnly.length > 0 && !a.said.some((s) => raceOnly.includes(s.id)), `a line written for a race (${raceOnly.join(", ")}) is never said by day`);
  check(speak(newVoice(1), [], 10, LINES).said === null, "with nothing noticed, nothing is said");
}

console.log("\n2. THE LINES");
{
  const triggers = Object.keys(TRIGGERS);
  const missing = triggers.filter((t) => (LINES[t] ?? []).filter((l) => l.speaker === "auto").length < 5 || (LINES[t] ?? []).filter((l) => l.speaker === "jay").length < 4);
  check(missing.length === 0, `every trigger has five A.U.T.O. lines and four of Jay's at least (${missing.join(", ") || "all"})`);
  check(Object.keys(LINES).every((t) => triggers.includes(t)), "and no lines for a trigger nothing detects");
  const all = Object.values(LINES).flat();
  check(all.every((l) => l.text.length < 90), `all ${all.length} lines under 90 characters (longest ${Math.max(...all.map((l) => l.text.length))})`);
  check(!all.some((l) => /\b(mph|miles?|feet|ft|yards?|inch(es)?)\b/i.test(l.text)), "metric throughout");
  check(!LINES.rolledStop.filter((l) => l.speaker === "auto").some((l) => /second/i.test(l.text)), "A.U.T.O. never puts a time on a stop -- a stop is a complete stop (Brenda's three seconds are hers)");
  check(new Set(all.map((l) => l.id)).size === all.length, "every line its own id");
}

console.log("\n3. THE DETECTORS, ON THEIR SITUATIONS AND THEIR OPPOSITES");
{
  const L1 = loadMap(testMap1());
  const w0 = { ...seedGraph(1, 50, L1, { target: 0 }), actors: [], every: 1e9, nextAt: 1e9 };
  const lay = (me) => w0.course.at[me.k].layout, pth = (me) => lay(me).paths[me.route];
  const ev = (prev, now, st) => detect(prev, now, st ?? newEventState());
  const fires = (r, id) => r.events.some((e) => e.id === id);
  const routeFor = (me, intent) => Object.keys(lay(me).paths).find((r) => lay(me).paths[r].from === pth(me).from && lay(me).paths[r].intent === intent);
  const tick = (w) => ({ ...w, t: w.t + DT });
  const across = (me, w, extra = {}) => { const p = pth(me); return [{ me: { ...me, s: p.stopAt - 0.3, v: 8, stoppedAt: null, ...extra }, world: w }, { me: { ...me, s: p.stopAt + 0.1, v: 8, ...extra }, world: tick(w) }]; };

  /* The stop sign at the end of B-north. */
  const atStop = playerOn(w0.course, "B-north", "end");
  const [p1, n1] = across(atStop, w0);
  check(fires(ev(p1, n1), "rolledStop"), "rolling a stop sign is noticed");
  const [p2, n2] = across(atStop, w0, { stoppedAt: 3 });
  check(!fires(ev(p2, n2), "rolledStop"), "and a stop made first is not");

  /* The signal at the end of A-north: find a red, then a green, for straight on -- on the clock, since with nobody about an actuated light rests. */
  const wc = { ...seedGraph(1, 50, L1, { target: 0, actuated: false }), actors: [], every: 1e9, nextAt: 1e9 };
  const atSig = playerOn(wc.course, "A-north", "end");
  const baseOf = lay(atSig).legs[pth(atSig).from].base, L = lay(atSig);
  let wr = wc, wg = null;
  for (let i = 0; i < 4000 && !(wg && movementLight(L.signal, baseOf, "straight", wr.t, wr.lights?.[atSig.k]?.live) === "red"); i++) {
    wr = step(wr);
    if (!wg && movementLight(L.signal, baseOf, "straight", wr.t, wr.lights?.[atSig.k]?.live) === "green") wg = wr;
  }
  const sigStraight = { ...atSig, route: routeFor(atSig, "straight") ?? atSig.route };
  const [p3, n3] = across(sigStraight, wr);
  check(fires(ev(p3, n3), "ranRed"), "a red run is noticed");
  const [p4, n4] = across(sigStraight, wg);
  const g1 = ev(p4, n4);
  check(!fires(g1, "ranRed"), "and a green is not a red run");
  let st = g1.state; st = ev(p4, n4, st).state; const g3 = ev(p4, n4, st);
  check(fires(g3, "waveCaught") && !fires(ev(p4, n4, g1.state), "waveCaught"), "the third green in a row without stopping, at the limit, catches the wave -- the second does not");
  const fast = (x) => ({ ...x, me: { ...x.me, v: 30 } });
  check(!fires(ev(fast(p4), fast(n4), { ...newEventState(), wave: 2 }), "waveCaught"), "and over the limit it does not");
  const lostPrev = { me: { ...sigStraight, s: 100, v: 0, lastStop: null }, world: wr }, lostNow = { me: { ...sigStraight, s: 100, v: 0, lastStop: { verdict: "clean", at: wr.t } }, world: tick(wr) };
  check(fires(ev(lostPrev, lostNow, { ...newEventState(), wave: 3, overFor: 5 }), "waveLost") && !fires(ev(lostPrev, lostNow, { ...newEventState(), wave: 3, overFor: 0 }), "waveLost"), "brought to rest at a signal after a wave, having sped through the link, loses it; at the limit it is only a stop");

  /* Turning: the signal, its timing, and a turn the lane did not make. */
  const turnIntent = ["left", "right"].find((i) => routeFor(atStop, i));
  const left = turnIntent && routeFor(atStop, turnIntent);
  if (left) {
    const tl = { ...atStop, route: left };
    const [p5, n5] = across(tl, w0);
    check(fires(ev(p5, n5), "noSignal"), "a turn without a signal is noticed");
    const [p6, n6] = across(tl, { ...w0, signalOn: { dir: turnIntent, since: w0.t - 0.5 } }, { signal: turnIntent });
    check(fires(ev(p6, n6), "lateSignal"), "a signal on half a second before the line is late");
    const [p7, n7] = across(tl, { ...w0, signalOn: { dir: turnIntent, since: w0.t - 3 } }, { signal: turnIntent });
    const r7 = ev(p7, n7);
    check(!fires(r7, "lateSignal") && !fires(r7, "noSignal"), "three seconds before is not");
  } else check(false, "no turn from B-north to test the signal on");
  const [p8, n8] = across({ ...atStop, route: routeFor(atStop, "straight") ?? atStop.route }, w0, { signal: "left" });
  check(fires(ev(p8, n8), "missedTurn"), "signalling a left and going straight is a missed turn");

  /* The stop and the turn, as the car model judged them. */
  const base = { me: { ...atStop, s: 50, v: 0 }, world: w0 };
  const withStop = (verdict) => ({ me: { ...base.me, lastStop: { verdict, at: 1 } }, world: tick(w0) });
  check(fires(ev(base, withStop("harsh")), "harshBraking") && fires(ev(base, withStop("short")), "stoppedShort") && ev(base, withStop("clean")).events.filter((e) => !e.praise).length === 0, "a harsh stop and a short one are noticed, a clean one is not");
  check(fires(ev(base, { me: { ...base.me, lastTurn: { verdict: "wide" } }, world: tick(w0) }), "wideTurn") && !fires(ev(base, { me: { ...base.me, lastTurn: { verdict: "clean" } }, world: tick(w0) }), "wideTurn"), "a wide turn is noticed, a clean one is not");

  /* Dawdling, the box, a horn, a collision. */
  const free = { ...w0, playerFreeSince: w0.t - DAWDLE - 0.5 };
  const d1 = ev({ me: base.me, world: free }, { me: base.me, world: tick(free) });
  check(fires(d1, "dawdling") && !fires(ev({ me: base.me, world: free }, { me: base.me, world: tick(free) }, d1.state), "dawdling"), `free to go and still sitting past ${DAWDLE} s is noticed, once`);
  check(!fires(ev({ me: base.me, world: { ...w0, playerFreeSince: w0.t - 1 } }, { me: base.me, world: tick({ ...w0, playerFreeSince: w0.t - 1 }) }), "dawdling"), "and a second's thought is not");
  {
    const p = pth(atStop), inBox = { ...atStop, s: (p.stopAt + p.clearAt) / 2, v: 0 };
    let s2 = newEventState(), hits = 0;
    for (let i = 0; i < 3 / DT; i++) { const r = ev({ me: inBox, world: w0 }, { me: inBox, world: tick(w0) }, s2); s2 = r.state; if (fires(r, "blockingBox")) hits++; }
    check(hits === 1, `standing in the box is noticed once, after a couple of seconds (${hits})`);
  }
  {
    const honker = { id: "car-x", kind: "car", k: atStop.k, route: atStop.route, s: 10, v: 0, honkAt: w0.t, honkTo: "player" };
    check(fires(ev({ me: base.me, world: { ...w0, actors: [honker] } }, { me: base.me, world: tick({ ...w0, actors: [honker] }) }), "honkedAt"), "a horn aimed at the player is noticed");
    check(!fires(ev({ me: base.me, world: { ...w0, actors: [{ ...honker, honkTo: "car-y" }] } }, { me: base.me, world: tick({ ...w0, actors: [{ ...honker, honkTo: "car-y" }] }) }), "honkedAt"), "one aimed at somebody else is not");
  }
  check(fires(ev(base, { ...base, world: tick(w0), hit: true }), "collision") && !fires(ev(base, { ...base, world: tick(w0) }), "collision"), "a collision is noticed when the screen says contact, and only then");

  /* The arterial in from the west: three lanes. Keeping right, crawling, a tight gap, a truck passed, somebody let in. */
  const west = playerOn(w0.course, "A-west", "end"), Lw = lay(west), wb = Lw.legs[pth(west).from].base;
  const laneRoute = (pos) => Object.keys(Lw.paths).find((r) => Lw.legs[Lw.paths[r].from].base === wb && (Lw.legs[Lw.paths[r].from].pos ?? Lw.legs[Lw.paths[r].from].lane) === pos && Lw.paths[r].intent === "straight");
  const inner = { ...west, route: laneRoute(0), s: 80, v: 12 }, curb = { ...west, route: laneRoute((Lw.legs[pth(west).from].across ?? 3) - 1), s: 80, v: 12 };
  const hold = (me0, secs, wld = w0) => { let s2 = newEventState(), n = 0, me = me0; for (let i = 0; i < secs / DT; i++) { const nx = { ...me, s: me.s + me.v * DT }; const r = ev({ me, world: wld }, { me: nx, world: tick(wld) }, s2); s2 = r.state; me = nx; n += r.events.length ? r.events.filter((e) => e.id === "notKeepingRight" || e.id === "underLimit").length : 0; if (r.events.some((e) => e.id === "notKeepingRight" || e.id === "underLimit")) return { n, ids: r.events.map((e) => e.id) }; } return { n, ids: [] }; };
  check(hold(inner, KEEP_RIGHT_FAULT + 1).ids.includes("notKeepingRight"), "cruising in the inner lane with nothing to pass, past the fault's own time, is noticed");
  check(!hold(curb, KEEP_RIGHT_FAULT + 1).ids.includes("notKeepingRight"), "and the curb lane is not");
  check(hold({ ...curb, v: 4 }, CRAWL + 1).ids.includes("underLimit") && !hold({ ...curb, v: 12 }, CRAWL + 1).ids.includes("underLimit"), "crawling well under the limit on a clear road is noticed; at the limit it is not");
  {
    const moved = { ...curb, route: laneRoute(1) };
    const close = { id: "car-b", kind: "car", k: west.k, route: laneRoute(1), s: 75, v: 12 }, far = { ...close, s: 30 };
    const r1 = ev({ me: curb, world: { ...w0, actors: [close] } }, { me: moved, world: tick({ ...w0, actors: [close] }) });
    const r2 = ev({ me: curb, world: { ...w0, actors: [far] } }, { me: moved, world: tick({ ...w0, actors: [far] }) });
    check(fires(r1, "tightGap") && !fires(r2, "tightGap"), "changing lane five metres in front of a car at speed is a tight gap; fifty is not");
    const offered = { ...far, courtesy: { leg: Lw.paths[laneRoute(1)].from, since: 0 } };
    check(fires(ev({ me: curb, world: { ...w0, actors: [offered] } }, { me: moved, world: tick({ ...w0, actors: [offered] }) }), "letIn") && !fires(r2, "letIn"), "taking a gap somebody offered is noticed as being let in");
    const truck = (s) => ({ id: "truck-1", kind: "truck", k: west.k, route: laneRoute(1), s, v: 8 });
    let s3 = ev({ me: curb, world: { ...w0, actors: [truck(95)] } }, { me: curb, world: tick({ ...w0, actors: [truck(95)] }) }).state;
    check(fires(ev({ me: curb, world: { ...w0, actors: [truck(65)] } }, { me: curb, world: tick({ ...w0, actors: [truck(65)] }) }, s3), "passedTruck"), "a truck in the next lane going from ahead to behind is a truck passed");
    const changer = { id: "car-c", kind: "car", k: west.k, route: curb.route, s: 90, v: 10, lc: { t0: w0.t } };
    let s4 = newEventState(); for (const v of [14, 13.5, 13, 12.5]) s4 = ev({ me: { ...curb, v }, world: w0 }, { me: { ...curb, v }, world: tick(w0) }, s4).state;
    check(fires(ev({ me: curb, world: { ...w0, actors: [changer] } }, { me: curb, world: tick({ ...w0, actors: [changer] }) }, s4), "letSomeoneIn"), "easing off as a car changes into your lane just ahead is letting somebody in");
    check(!fires(ev({ me: curb, world: { ...w0, actors: [changer] } }, { me: curb, world: tick({ ...w0, actors: [changer] }) }), "letSomeoneIn"), "and without easing off it is not");
  }

  /* The streak: fault-free distance and time, and a fault starts it again. */
  {
    let s5 = newEventState(), clean = 0, streak = 0, me = { ...curb, s: 0, v: 10 };
    const p = pth(curb);
    for (let i = 0; i < (STREAK + 5) / DT; i++) {
      const nx = { ...me, s: 60 + ((me.s + me.v * DT) % (p.stopAt - 120)) };
      const r = ev({ me, world: w0 }, { me: nx, world: tick(w0) }, s5); s5 = r.state; me = nx;
      if (fires(r, "cleanRun")) clean++; if (fires(r, "streak")) streak++;
    }
    check(clean === 1 && streak === 1, `${CLEAN_RUN} m clean and ${STREAK} s clean are each noticed once (${clean}, ${streak})`);
    const reset = ev(base, { me: base.me, world: tick(w0), hit: true }, { ...s5, streakM: 1999 });
    check(reset.state.streakM === 0 && reset.state.streakS === 0, "and any fault starts the streak again");
  }

  /* Onto the highway at its pace, from the slip road. */
  {
    const H = loadMap(testLoop());
    let wh = { ...seedGraph(1, 50, H, { target: 0, posted: true }), actors: [], every: 1e9, nextAt: 1e9 };
    const ramp = playerOn(wh.course, "on-1", "end");
    const Lr = wh.course.at[ramp.k].layout, out = Object.keys(Lr.paths).find((r) => Lr.paths[r].from === Lr.paths[ramp.route].from);
    const onto = { ...ramp, route: out, s: Lr.paths[out].length - 0.2 };
    const j = wh.course.joins[`${ramp.k}|${Lr.paths[out].to}`];
    const nextRoute = j && Object.keys(wh.course.at[j.k].layout.paths).find((r) => wh.course.at[j.k].layout.paths[r].from === j.side);
    if (j && nextRoute) {
      const merged = (v) => ev({ me: { ...onto, v }, world: wh }, { me: { ...onto, k: j.k, route: nextRoute, s: 0.5, v }, world: tick(wh) });
      check(fires(merged(25), "highwayMerge") && !fires(merged(10), "highwayMerge"), "onto the highway from the slip road at its pace is a good merge; at 36 km/h it is not");
    } else check(false, "could not find the slip road's join onto the loop");
  }
  console.log("  note: stopping for somebody on foot is NOT tested here -- it asks the sim's own whatStops for a person in the way, which needs a crossing scene");
}

console.log(failed ? `\n${failed} FAILURE(S)` : "\nall passed");
process.exit(failed ? 1 : 0);
