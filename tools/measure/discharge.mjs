/* HOW FAST A STANDING QUEUE LEAVES A GREEN (22 October; the maintainer: "the
   drivers are a little lethargic off the line"). At test map 1's signal:
   cars through per minute, and per lane, for each car that crosses its stop
   line having stood in the queue, the time since the car ahead of it in that
   lane crossed (the discharge headway -- about 2 s in real traffic), the
   first car's time from its green (the start-up delay), and the share of
   head cars that crossed on a red (a late entry).
   Usage: node tools/measure/discharge.mjs [cars=260] [secs=300] [seed=1] [lookAway=0] */
import { worldFor } from "../../src/sim/scene.js";
import { step } from "../../src/sim/crossing.js";
import { movementLight } from "../../src/sim/signal.js";
import { DT } from "../../src/sim/traffic.js";
const [carsArg = "260", secsArg = "300", seedArg = "1", lookArg = "0"] = process.argv.slice(2);
let { world: w } = worldFor(Number(seedArg), 50, 2.0, false, Number(carsArg), null, null, lookArg === "1");
const K = w.course.at.findIndex((n) => n.layout.signal), L = w.course.at[K].layout;
const lastCross = new Map(), greenAt = new Map(), wasLight = new Map();
const headways = [], startups = [];
let through = 0, onRed = 0, minute = 0;
const perMin = [], standing = [];
const q = (xs, f) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(f * (s.length - 1))] : NaN; };
const light = (leg, intent, world) => movementLight(L.signal, L.legs[leg]?.base, intent, world.t, world.lights?.[K]?.live ?? null);
for (let i = 0; i < Number(secsArg) / DT; i++) {
  if (i && i % 1200 === 0) { perMin.push(through - minute); minute = through; standing.push(w.actors.filter((a) => !a.player && (a.v ?? 0) < 0.5).length); }
  const prev = w;
  w = step(w);
  /* When each lane's straight movement went green. */
  for (const leg of Object.keys(L.legs)) {
    const now = light(leg, "straight", w);
    if (now === "green" && wasLight.get(leg) !== "green") greenAt.set(leg, w.t);
    wasLight.set(leg, now);
  }
  const was = new Map(prev.actors.map((a) => [a.id, a]));
  for (const a of w.actors) {
    if ((a.k ?? 0) !== K) continue;
    const b = was.get(a.id), p = L.paths[a.route];
    if (!b || !p || (b.k ?? 0) !== K || !(b.s < p.stopAt && a.s >= p.stopAt)) continue;
    through++;
    const lt = light(p.from, p.intent, prev);
    if (lt === "red" && p.intent !== "right") onRed++;
    if (b.stoppedAt != null) {
      const last = lastCross.get(p.from);
      const g = greenAt.get(p.from);
      if (last != null && g != null && last >= g) headways.push(w.t - last);
      else if (g != null && w.t - g < 30) startups.push(w.t - g);
    }
    lastCross.set(p.from, w.t);
  }
}
console.log(`test map 1's signal, ${carsArg} cars, ${secsArg} s, seed ${seedArg}, look-away ${lookArg === "1" ? "on" : "off"}: ${(through / (Number(secsArg) / 60)).toFixed(1)} cars through a minute; ${onRed} crossed on a red (not turning right)`);
console.log(`   discharge headway from a standing queue, s: median ${q(headways, 0.5).toFixed(2)}, p90 ${q(headways, 0.9).toFixed(2)} (${headways.length}); first car's start after its green: median ${q(startups, 0.5).toFixed(2)}, p90 ${q(startups, 0.9).toFixed(2)} (${startups.length})`);
console.log(`   per minute, cars through: ${perMin.join(" ")}; cars standing anywhere at each minute: ${standing.join(" ")}`);
