/* =====================================================================
   SIGNS AS OBJECTS (the signs design, SIMULATOR.md): what has to hold.

     1. A sign IS the rule at its approach. A map that says "stop" as the
        road end's shorthand and the same map with a stop sign standing
        there load to the same controls, and the traffic on them is
        identical, tick for tick -- converting changes where the rule is
        written, never what it is.
     2. Disagreements are said, never guessed: sign against shorthand (the
        sign wins), a sign on a signal's approach (the signal wins), a sign
        at no road, a no-right-on-red plate with no signal.
     3. A sign stays at its road END through a split at a T.
     4. A sign stands where the map puts it: level with the line by
        default, `back` metres before it when set back.
     5. The editor writes signs, not shorthand, and keeps them at their end
        through its own splits and deletions.
     6. A driver learns a rule in one place (sim/reading.js), and only
        there.
   ===================================================================== */
import fs from "node:fs";
import { loadMap } from "../src/map/load.js";
import { TEST_MAPS } from "../src/map/samples.js";
import { emptyMap, road } from "../src/map/format.js";
import { graphOf, junctionsOf } from "../src/sim/graph.js";
import { seedGraph, step, pathOf, whatStops, blockedBy, overlapping, YIELD_AT } from "../src/sim/crossing.js";
import { DT, CAR, wantedSpeed } from "../src/sim/traffic.js";
import { yieldCross } from "./measure/yield.mjs";
import { newDraft, addRoad, addPoint, setRoadControl, setSignBack, splitRoad, deleteRoad, controlAt, setNoLeft } from "../src/editor/model.js";

let failed = 0;
const check = (ok, msg) => { console.log(`  ${ok ? "ok  " : "FAIL:"} ${msg}`); if (!ok) failed++; };
const P = (x, y) => ({ x, y, z: 0 });
const codes = (l) => l.warnings.map((w) => w.code);

/* The same map with every stop and yield written as a sign standing there
   instead of as the road end's shorthand. */
const asSigns = (m) => {
  const signs = [];
  const roads = m.roads.map((r) => {
    const control = { ...r.control };
    for (const e of ["start", "end"]) if (control[e] === "stop" || control[e] === "yield") { signs.push({ id: `s-${r.id}-${e}`, kind: control[e], road: r.id, end: e }); control[e] = "none"; }
    return { ...r, control };
  });
  return { ...m, roads, signs };
};

console.log("\n1. A SIGN IS THE RULE AT ITS APPROACH");
for (const t of TEST_MAPS) {
  const m = t.build(), s = asSigns(m);
  const a = loadMap(m), b = loadMap(s);
  const ctl = (l) => JSON.stringify(l.roads.map((r) => [r.id, r.control]));
  const legs = (l) => JSON.stringify(graphOf(l, { conflicts: false }).at.map((q) => q.layout.place.control));
  check(s.signs.length > 0 && ctl(a) === ctl(b) && legs(a) === legs(b), `${t.name}: ${s.signs.length} stop and yield signs in place of the shorthand, the same control on every road end and every leg`);
  let wa = seedGraph(2, 50, a, { target: 100, posted: true }), wb = seedGraph(2, 50, b, { target: 100, posted: true });
  let same = JSON.stringify(wa.actors) === JSON.stringify(wb.actors);
  for (let i = 0; i < 1200 && same; i++) { wa = step(wa); wb = step(wb); same = JSON.stringify(wa.actors) === JSON.stringify(wb.actors); }
  check(same, `${t.name}: and the traffic is identical, tick for tick, for a minute`);
}

console.log("\n2. DISAGREEMENTS ARE SAID");
{
  const base = () => { const m = emptyMap("d"); m.roads.push(road({ id: "a", points: [P(0, 0), P(200, 0)], control: { start: "none", end: "stop" } }), road({ id: "b", points: [P(200, 0), P(400, 0)] }), road({ id: "c", points: [P(200, 0), P(200, 200)] })); return m; };
  const m1 = base(); m1.signs = [{ id: "y", kind: "yield", road: "a", end: "end" }];
  const l1 = loadMap(m1);
  check(l1.roads.find((r) => r.id === "a").control.end === "yield" && codes(l1).includes("control-vs-sign"), "shorthand says stop, a yield sign stands there: warned, and the sign governs");
  const m2 = base(); m2.roads[0].control.end = "signal"; m2.signs = [{ id: "s", kind: "stop", road: "a", end: "end" }];
  const l2 = loadMap(m2);
  check(l2.roads.find((r) => r.id === "a").control.end === "signal" && codes(l2).includes("sign-at-signal"), "a stop sign on a signal's approach: warned, and the signal governs");
  const m3 = base(); m3.signs = [{ id: "x", kind: "stop", road: "nowhere", end: "end" }, { id: "k", kind: "slow down", road: "a", end: "end" }];
  const l3 = loadMap(m3);
  check(codes(l3).includes("sign-no-road") && codes(l3).includes("unknown-sign") && l3.signs.length === 1, "a sign at no road and a sign of no known kind are dropped, each warned");
  const m4 = base(); m4.signs = [{ id: "p", kind: "no-right-on-red", road: "a", end: "end" }];
  const l4 = loadMap(m4);
  const m5 = base(); m5.roads[0].control.end = "signal"; m5.signs = [{ id: "p", kind: "no-right-on-red", road: "a", end: "end" }];
  const l5 = loadMap(m5);
  check(codes(l4).includes("plate-without-signal") && l5.roads.find((r) => r.id === "a").control.end === "signal-no-right-on-red", "the no-right-on-red plate: warned on a stop approach, and on a signal it makes the signal no-right-on-red");
}

console.log("\n3. A SIGN STAYS AT ITS END THROUGH A SPLIT");
{
  /* A T lands on the middle of road "long", which the loader splits: the
     sign at long's END must be on the half that has that end. */
  const m = emptyMap("t");
  m.roads.push(road({ id: "long", points: [P(0, 0), P(400, 0)] }), road({ id: "stem", points: [P(200, 200), P(200, 0)] }), road({ id: "far", points: [P(400, 0), P(400, 300)] }), road({ id: "far2", points: [P(400, 0), P(700, 0)] }));
  m.signs = [{ id: "s", kind: "stop", road: "long", end: "end" }, { id: "t", kind: "yield", road: "stem", end: "end" }];
  const l = loadMap(m);
  const s = l.signs.find((q) => q.id === "s");
  check(!!s && s.road.startsWith("long#") && s.end === "end" && l.roads.find((r) => r.id === s.road).control.end === "stop", `the loader split "long" at the T and its end's stop sign is on ${s?.road}, still at its end`);
}

console.log("\n4. A SIGN STANDS WHERE THE MAP PUTS IT");
{
  const t1 = TEST_MAPS.find((t) => t.id === "test-1").build();
  const drawn = (m) => junctionsOf(graphOf(loadMap(m), { conflicts: false })).flatMap((j) => j.signs.map((q) => ({ ...q, node: j.node })));
  const a = drawn(t1), b = drawn(asSigns(t1));
  check(JSON.stringify(a) === JSON.stringify(b), `every sign on test map 1 is drawn exactly where it was before signs were objects (${a.length})`);
  const moved = asSigns(t1);
  const target = moved.signs[0];
  moved.signs = moved.signs.map((q) => (q === target ? { ...q, back: 12 } : q));
  const c = drawn(moved);
  const diff = a.map((q, i) => Math.hypot(q.at.x - c[i].at.x, q.at.y - c[i].at.y)).filter((d) => d > 0.01);
  check(diff.length === 1 && Math.abs(diff[0] - 12) < 0.6, `set back 12 m, one sign moves, ${diff[0]?.toFixed(1)} m along its approach, and nothing else moves`);
}

console.log("\n5. THE EDITOR WRITES SIGNS");
{
  let m = newDraft(); let r;
  ({ map: m, id: r } = addRoad(m)); m = addPoint(m, r, P(0, 0)); m = addPoint(m, r, P(100, 0));
  m = setRoadControl(m, r, "end", "stop");
  check(m.signs?.length === 1 && m.signs[0].kind === "stop" && m.roads[0].control.end === "none" && controlAt(m, m.roads[0], "end") === "stop", "choosing stop puts a stop sign at that end, not shorthand");
  m = setSignBack(m, r, "end", 8);
  check(m.signs[0].back === 8, "and it can be set back from the line");
  const sig = setRoadControl(m, r, "end", "signal");
  check(sig.signs.length === 0 && sig.roads[0].control.end === "signal", "choosing a signal takes the sign away and makes the end a signal");
  const sp = splitRoad(m, r, 0, P(50, 0));
  check(sp.map.signs[0].road === sp.ids[1] && sp.map.signs[0].end === "end", "splitting the road moves the sign at its end to the half that has that end");
  check(deleteRoad(m, r).signs.length === 0, "deleting the road takes its signs with it");
}

console.log("\n6. A DRIVER LEARNS A RULE IN ONE PLACE");
{
  const src = fs.readFileSync(new URL("../src/sim/crossing.js", import.meta.url), "utf8");
  const direct = (src.match(/place\.control\[/g) ?? []).length;
  check(src.includes("knownControl(actor, layout, path") && src.includes("theirControl(layout, path)") && direct === 1,
    `crossing.js asks sim/reading.js for every driver's rule; the one direct read left is where traffic spawns, which is not a driver's question (${direct})`);
}

console.log("\n7. A YIELD SIGN: SLOW, GIVE WAY, STOP ONLY IF NEEDED (the maintainer's ruling)");
{
  /* A through road east-west, yield signs on the minor road's two
     approaches (tools/measure/yield.mjs). */
  const run = (ctl, cars, seed, secs = 240) => {
    let w = seedGraph(seed, 50, loadMap(yieldCross(ctl)), { target: cars, posted: true });
    const out = { minor: [], idleStops: 0, rests: 0, throughHeldByUncommitted: 0, crashes: 0, over: 0 };
    const low = new Map(), idle = new Map();
    for (let i = 0; i < secs / DT; i++) {
      const before = new Map(w.actors.map((a) => [a.id, a]));
      w = step(w);
      const L = w.course.at[0].layout;
      for (const a of w.actors) {
        const was = before.get(a.id);
        if (!was || was.k !== a.k || was.route !== a.route || a.crash || w.course.at[a.k].through) continue;
        const p = pathOf(w, a), leg = L.legs[p.from], minor = leg.road === "n" || leg.road === "s";
        const key = `${a.id}@${a.k}`;
        if (a.s < p.stopAt && a.s > p.stopAt - 40) low.set(key, Math.min(low.get(key) ?? Infinity, a.v));
        /* At the line: the car's nose within a car length of it. */
        if (minor && a.s < p.stopAt && a.s > p.stopAt - CAR.length && a.v < 0.3) {
          const why = whatStops(a, w);
          if (why.held || why.queued) idle.set(key, 0);
          else { const n = (idle.get(key) ?? 0) + DT; idle.set(key, n); if (n > 1.0 && n - DT <= 1.0) out.idleStops++; }
        }
        /* The through road gives way to a yield-road car only once that
           car is committed -- past its line or launched. */
        if (!minor && a.s < p.stopAt) {
          for (const b of w.actors) {
            if (b.id === a.id || b.k !== a.k || b.crash) continue;
            const bp = pathOf(w, b), bl = L.legs[bp.from];
            if (!(bl.road === "n" || bl.road === "s") || b.going || b.s >= bp.stopAt) continue;
            if (blockedBy(a, b, L, a.caution, w.t)) out.throughHeldByUncommitted++;
          }
        }
        /* Its speed as its NOSE reaches the line (centre half a car short). */
        const nose = p.stopAt - CAR.length / 2;
        if (minor && was.s < nose && a.s >= nose) out.minor.push({ v: a.v, stopped: (low.get(key) ?? a.v) < 0.3, caution: a.caution, straight: p.intent === "straight" });
      }
      if (i % 5 === 0) out.over += overlapping(w).filter((o) => !(w.actors.find((x) => x.id === o.a)?.crash)).length;
    }
    out.crashes = (w.crashes ?? []).length;
    return out;
  };
  const light = run("yield", 8, 3), busy = run("yield", 40, 3), stop = run("stop", 40, 3), none = run("none", 40, 3);
  /* Temperament needs more drivers than one light run has at its tails. */
  const more = [5, 9].map((seed) => run("yield", 8, seed));
  const rolled = light.minor.filter((m) => !m.stopped).length;
  check(light.minor.length >= 10 && rolled > 0 && light.idleStops === 0,
    `in light traffic ${rolled} of ${light.minor.length} yield-road cars crossed without stopping, and not one stood at the line for more than a second with nobody to give way to`);
  const kmh = (v) => (v * 3.6).toFixed(0);
  const moving = [...light.minor, ...busy.minor, ...more.flatMap((r) => r.minor)].filter((m) => !m.stopped);
  const fastest = Math.max(...moving.map((m) => m.v));
  const comp = moving.filter((m) => Math.abs(m.caution - 1) < 0.15).map((m) => m.v);
  const bold = moving.filter((m) => m.caution < 0.7).map((m) => m.v), timid = moving.filter((m) => m.caution > 1.3).map((m) => m.v);
  const mean = (xs) => xs.reduce((q, x) => q + x, 0) / Math.max(1, xs.length);
  /* The approach is the corner's (corner.js `speedBy`): it brakes at the
     driver's planned rate to their target and eases into it rather than
     landing on it, so what is held is arriving within 1 m/s of it -- and
     the comparison that says the slowing is the sign's: the same traffic
     with no sign at all. */
  const over = Math.max(...moving.map((m) => m.v - wantedSpeed(YIELD_AT, m.caution)));
  /* Straight across only: a turning car slows for its corner sign or no sign. */
  const med = (xs) => { const q = [...xs].sort((x, y) => x - y); return q[Math.floor(q.length / 2)]; };
  const free = med(none.minor.filter((m) => !m.stopped && m.straight).map((m) => m.v)), signed = med(moving.filter((m) => m.straight).map((m) => m.v));
  check(moving.length > 10 && over <= 1.0 && signed < free,
    `and slowed: every one reached the line within ${over.toFixed(2)} m/s of YIELD_AT (${kmh(YIELD_AT)} km/h, a flagged design constant) scaled by their temperament, the fastest at ${kmh(fastest)} km/h -- going straight across, a median ${kmh(signed)} km/h, against ${kmh(free)} on the same road with no sign`);
  check(bold.length >= 5 && timid.length >= 5 && mean(bold) > mean(timid),
    `a bold driver arrives hotter than a timid one: ${kmh(mean(bold))} against ${kmh(mean(timid))} km/h (${bold.length} and ${timid.length} crossings)`);
  check(busy.minor.filter((m) => m.stopped).length > 0 && busy.idleStops === 0,
    `in busy traffic they stop when they have to give way (${busy.minor.filter((m) => m.stopped).length} of ${busy.minor.length}), and still never for nobody`);
  check([light, busy, ...more].every((r) => r.throughHeldByUncommitted === 0 && r.idleStops === 0),
    "the through road never waits for a yield-road car that has not committed -- it has the right of way");
  check([light, busy, stop, none].every((r) => r.crashes === 0 && r.over === 0), "nobody touches, at any control");
  check(busy.minor.length > stop.minor.length,
    `and giving way costs less than stopping: ${busy.minor.length} yield-road crossings in four minutes against ${stop.minor.length} with stop signs, same traffic`);
  check(none.minor.length >= 30,
    `AN UNCONTROLLED CROSSROADS DOES NOT LOCK: ${none.minor.length} minor-road crossings in four minutes at 40 cars -- it was 1, every head car waiting for the car on its right round the circle, or for a car queued at rest behind somebody`);
}

console.log("\n8. THE ALL-WAY PLATE: DERIVED, UNDER EVERY STOP WHERE EVERY APPROACH STOPS, NOWHERE ELSE");
{
  const L = loadMap(TEST_MAPS.find((t) => t.id === "test-1").build());
  const c = graphOf(L, { lane: 3.6 });
  let right = 0, wrong = 0, stops = 0;
  const js = junctionsOf(c);
  js.forEach((j) => {
    const spot = c.at.find((a) => a.node === j.node) ?? c.at[js.indexOf(j)];
    const every = Object.values(spot?.layout?.legs ?? {}).every((q) => q.control === "stop");
    for (const s of j.signs) if (s.kind === "stop") { stops++; (!!s.allWay === every ? right++ : wrong++); }
  });
  check(stops > 0 && wrong === 0 && js.some((j) => j.signs.some((s) => s.kind === "stop" && !s.allWay)) && js.some((j) => j.signs.some((s) => s.allWay)),
    `${stops} stop signs on test map 1: the plate on every one at an intersection where all approaches stop, and on none where the cross road runs through (${wrong} wrong)`);
}

console.log("\n9. A NO-LEFT-TURN SIGN: NOBODY TURNS LEFT FROM THAT APPROACH, EVERYBODY ELSE STILL DOES");
{
  /* A crossroads of collectors; the sign on the south approach only. */
  const base = () => {
    const m = emptyMap("noleft");
    m.bounds = { x: 0, y: 0, w: 600, h: 600 };
    m.roads.push(
      road({ id: "w", points: [P(0, 300), P(300, 300)] }), road({ id: "e", points: [P(300, 300), P(600, 300)] }),
      road({ id: "n", points: [P(300, 0), P(300, 300)], control: { start: "none", end: "stop" } }),
      road({ id: "s", points: [P(300, 600), P(300, 300)], control: { start: "none", end: "stop" } }),
    );
    return m;
  };
  let draft = setNoLeft(base(), "s", "end", true);
  const L = loadMap(draft);
  const c = graphOf(L, { lane: 3.6 });
  const spot = c.at.find((a) => !a.through);
  const lay = spot.layout;
  const byRoad = (rid) => Object.keys(lay.legs).filter((id) => lay.legs[id].road === rid && !lay.legs[id].bay);
  const lefts = (rid) => byRoad(rid).filter((id) => (lay.legs[id].turns ?? []).includes("left")).length;
  check(draft.signs.some((q) => q.kind === "no-left-turn") && L.roads.find((r) => r.id === "s").noLeft?.end && lefts("s") === 0 && lefts("n") > 0 && lefts("w") > 0,
    `the editor puts the sign at the south approach, the loader carries it, and no lane of that approach is given a left (${lefts("n")} still on the north, ${lefts("w")} on the west)`);
  check(junctionsOf(c).some((j) => j.signs.some((q) => q.kind === "no-left-turn")), "and it is drawn, beside that approach");
  let w = seedGraph(3, 50, L, { target: 40, posted: true });
  const turned = { s: 0, other: 0 };
  for (let i = 0; i < 240 / DT; i++) {
    const before = new Map(w.actors.map((a) => [a.id, a]));
    w = step(w);
    for (const a of w.actors) {
      const was = before.get(a.id);
      if (!was || was.k !== a.k || c.at[a.k].through) continue;
      const pa = lay.paths[a.route];
      if (!pa || pa.intent !== "left" || !(was.s < pa.stopAt && a.s >= pa.stopAt)) continue;
      if (lay.legs[pa.from].road === "s") turned.s++; else turned.other++;
    }
  }
  check(turned.s === 0 && turned.other > 5, `four minutes of traffic: ${turned.s} lefts from the signed approach, ${turned.other} from the others`);
  const told = loadMap({ ...draft, roads: draft.roads.map((r) => (r.id === "s" ? { ...r, turns: { start: null, end: [["left", "straight"], ["straight", "right"]] } } : r)) });
  const errs = graphOf(told, { lane: 3.6 }).errors ?? [];
  check(errs.some((e) => e.code === "bad-turns" && /s/.test(e.lane)), `and a map whose own lane turns still give that approach a left is told so by name: ${errs.find((e) => e.code === "bad-turns")?.message ?? "no error"}`);
  check(!setNoLeft(draft, "s", "end", false).signs.some((q) => q.kind === "no-left-turn") && lefts("n") > 0, "and taking the sign away takes it away");
}

console.log(`\n${"=".repeat(70)}`);
console.log(failed ? `${failed} FAILURE(S)` : "OK: a sign is the rule at its approach and the traffic is identical for it, disagreements are said, a sign keeps its end through a split and stands where it is put, the editor writes signs, and a driver learns a rule in one place.");
process.exit(failed ? 1 : 0);
