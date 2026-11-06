/* WHO HITS A PLAYER WHO HAS THE ROAD (DECISIONS 10.55). A scripted player drives straight on,
   obeys their own light and sign, stops for the car ahead in their lane, and otherwise assumes
   anybody who should yield to them will. Every contact is classified by how the OTHER car came to
   be there, with its light tracked independently of the sim as it crossed its line.
   usage: node tools/measure/side-impact.mjs [map id] [cars] [minutes] [seeds] [look: 0 or 1]   */
import { worldFor } from "../../src/sim/scene.js";
import { step, whatStops } from "../../src/sim/crossing.js";
import { DT } from "../../src/sim/traffic.js";
import { stepDriver, withDriver } from "../../src/sim/drive.js";
import { playerContact, afterContact } from "../../src/sim/contact.js";
import { movementLight } from "../../src/sim/signal.js";
import { holdAt } from "../../src/sim/player.js";
import { limitAt } from "../../src/sim/graph.js";
import { TEST_MAPS } from "../../src/map/samples.js";

const [mapId = "test-1", carsArg = "180", minsArg = "8", seedsArg = "3", lookArg = "0"] = process.argv.slice(2);
const entry = TEST_MAPS.find((m) => m.id === mapId);
if (!entry) { console.log("maps:", TEST_MAPS.map((m) => m.id).join(" ")); process.exit(1); }
const raw = entry.build(), cars = Number(carsArg), mins = Number(minsArg), seeds = Number(seedsArg);

const liveOf = (w, k) => w.lights?.[k]?.live ?? null;
const lightOn = (w, k, p, L) => (L.signal ? movementLight(L.signal, L.legs[p.from]?.base, p.intent, w.t, liveOf(w, k)) : null);

/* The player's pedal. */
function drive(me, w) {
  const L = w.course.at[me.k].layout, p = L.paths[me.route], posted = limitAt(w.course, me) ?? 13.9;
  const toLine = p.stopAt - 2.5 - me.s;
  let need = 0;
  const brakeFor = (gap) => { need = Math.max(need, gap <= 0.5 ? 9 : (me.v * me.v) / (2 * gap)); };
  if (toLine > -2) {
    const lit = lightOn(w, me.k, p, L);
    if (L.signal) { if (lit === "red" || (lit === "amber" && (me.v * me.v) / (2 * Math.max(toLine, 0.5)) < 4)) brakeFor(toLine); }
    else if (me.stoppedAt == null && (L.place?.control?.[p.from] ?? L.legs[p.from]?.control) === "stop") brakeFor(toLine);
    else if ((L.place?.control?.[p.from] ?? L.legs[p.from]?.control) === "stop" && (me.v ?? 0) < 1) {
      /* Stopped at a sign: whose turn it is, as the traffic is told. */
      const v = whatStops({ ...me, caution: 1, headway: 1.6 }, w);
      if (v.leader?.id === "line") brakeFor(toLine);
    }
  }
  /* The car ahead in their lane, here or across the seam. */
  for (const a of w.actors) {
    if (a.player || a.k !== me.k) continue;
    const q = L.paths[a.route];
    if (q?.from === p.from && a.s > me.s) brakeFor(a.s - me.s - 6.5);
  }
  if (need > 0.8) return Math.max(-1, -need / 7.5);
  return me.v < posted * 0.95 ? 0.7 : holdAt(me.v, 0);
}

const classes = {};
let contacts = 0, driven = 0, entries = 0, ran = 0, metres = 0, nodes = 0, respawns = 0, standing = 0;
const redBy = {};
for (let seed = 1; seed <= seeds; seed++) {
  const { world, me: me0 } = worldFor(seed, 50, undefined, true, cars, raw, null, lookArg === "1");
  let w = world, me = me0;
  const entered = new Map();   // id -> { k, lit, stopped, intent }
  for (let i = 0; i < (mins * 60) / DT; i++) {
    const before = new Map(w.actors.map((a) => [a.id, a]));
    const inp = { steer: Math.max(-1, Math.min(1, -0.35 * me.off - 1.2 * Math.atan2(Math.sin(me.psi), Math.cos(me.psi)))), slider: drive(me, w) };
    me = stepDriver({ ...me, signal: null }, inp, w, DT);
    w = step(withDriver(w, me));
    driven += DT; metres += me.v * DT; if (me.v < 0.1) standing += DT; if (me.k !== before.get("player")?.k) nodes++;
    /* Each car's light as it crossed its line: read here, by this probe, from the signal itself. */
    for (const a of w.actors) {
      const b = before.get(a.id);
      if (!b || b.k !== a.k || a.player) continue;
      const L = w.course.at[a.k].layout, q = L.paths[a.route];
      if (q && b.s <= q.stopAt && a.s > q.stopAt) {
        const lit = lightOn(w, a.k, q, L);
        entered.set(a.id, { k: a.k, lit, stopped: a.stoppedAt != null, intent: q.intent, ctl: L.place?.control?.[q.from] ?? L.legs[q.from]?.control ?? null });
        entries++;
        if (lit === "red") { ran++; const key = `${q.intent}, ${a.stoppedAt != null ? "stopped first" : "never stopped"}, ${a.v.toFixed(0) > 3 ? "over 3 m/s" : "slow"}`; redBy[key] = (redBy[key] ?? 0) + 1; }
      }
    }
    const c = playerContact(w, me);
    for (const f of c.fresh) {
      contacts++;
      let what;
      if (f.kind !== "car") what = f.kind;
      else {
        const a = before.get(f.id) ?? {}, L = w.course.at[me.k].layout, p = L.paths[me.route];
        const e = entered.get(f.id), sameNode = e && e.k === me.k, inBox = me.s > p.stopAt - 1 && me.s < p.clearAt + 1;
        const lit = sameNode ? e.lit : null;
        const myLit = L.signal ? lightOn(w, me.k, p, L) : null;
        const o = w.actors.find((x) => x.id === f.id);
        console.log(`    seed ${seed} t ${w.t.toFixed(1)}: ${f.atFault ? "player's" : "not theirs"} (${f.why ?? "no rule"}), closing ${f.closing.toFixed(1)}; player ${p.intent} from ${p.from} s ${me.s.toFixed(1)} of box ${p.stopAt.toFixed(1)}-${p.clearAt.toFixed(1)} v ${me.v.toFixed(1)} entered ${JSON.stringify(me.entry ?? null)}; other ${o?.route} s ${o?.s.toFixed(1)} entered ${JSON.stringify(o?.entry ?? null)}`);
        if (f.why === "from behind") what = "struck from behind";
        else if (a.lc) what = "the other car changing lane into them";
        else if (sameNode && lit === "red" && e.intent === "right") what = `right on red, ${e.stopped ? "after stopping" : "rolled"}`;
        else if (sameNode && lit === "red") what = `the other car entered on RED going ${e.intent}`;
        else if (sameNode && lit === "amber") what = `the other car entered on amber going ${e.intent}`;
        else if (sameNode && lit === "green") what = `the other car entered on green going ${e.intent} (mine ${myLit})`;
        else if (sameNode && e.ctl === "stop") what = `the other car from a stop sign, ${e.stopped ? "stopped first" : "rolled"}, going ${e.intent}`;
        else if (sameNode) what = `the other car through ${e.ctl ?? "nothing"} going ${e.intent}`;
        else what = inBox ? "in the box, the other car's entry unseen" : "on a stretch: player into a car, or a car at a seam";
        if (a.crash) what = `a wreck already standing`;
        what += f.atFault ? " [player's fault]" : " [not theirs]";
      }
      classes[what] = (classes[what] ?? 0) + 1;
    }
    w = c.world;
    me = afterContact(me, c, w).me;
    me = { ...me, damage: 0 };   // this probe is counting contacts, not driving a damaged car
    w = withDriver(w, me);
    if (me.atEdge || (me.v < 0.05 && me.backRoom > 0)) { respawns++; me = { ...me0 }; w = withDriver(w, me); }
  }
}
console.log(`${mapId} at ${cars} cars, ${seeds} seeds, ${(driven / 60).toFixed(0)} driven minutes: ${contacts} contacts (${(contacts / (driven / 60)).toFixed(2)} a minute)`);
console.log(`  traffic: ${entries} entries at signals and signs tracked, ${ran} of them on red`);
console.log(`  the player: ${(metres / 1000).toFixed(1)} km, ${nodes} intersections, ${respawns} put back at the start, ${(standing / 60).toFixed(1)} min standing; look-away ${lookArg === "1" ? "on" : "off"}`);
console.log("  traffic entries on red:", JSON.stringify(redBy));
for (const [k, n] of Object.entries(classes).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${k}`);
