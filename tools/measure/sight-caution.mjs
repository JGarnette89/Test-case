/* A BLOCKED SIGHTLINE, BY DRIVER (DECISIONS 10.39; SIMULATOR IN FLIGHT 40). An occasion is
   a free straight approach to a line with no red: nobody within 40 m ahead, moving, the
   road blocked at first asking (crossing.js blockedSightline, which asks about the road
   and the trucks and nothing about the driver, so it finds those who do not respond).
   Taken once per approach, 20-60 m out, when it first holds. Of each: speed then, speed
   at the line, and the hardest braking in the next 5 s; thrown away if they stop or are
   held. Banded by the three axes, each band with the other two sound.
     CAUTION=1  world.sightCaution on       MARGIN=1  world.marginCanStop on
   Usage: node sight-caution.mjs seeds(comma) [cars=150]; --sum dir tagA tagB */
import fs from "node:fs";
if (process.argv[2] === "--sum") {
  const [dir, ...tags] = process.argv.slice(3), mean = (a) => a.reduce((p, q) => p + q, 0) / Math.max(1, a.length);
  for (const tag of tags) {
    const rows = fs.readdirSync(dir).filter((f) => f.startsWith(tag + "-") && f.endsWith(".json")).map((f) => JSON.parse(fs.readFileSync(`${dir}/${f}`, "utf8")));
    const occ = rows.flatMap((r) => r.occ), sum = (k) => rows.reduce((n, r) => n + r[k], 0);
    console.log(`\n${tag}: ${rows.length} batches, ${occ.length} occasions; moving v/v0 ${(sum("vSum") / sum("vN")).toFixed(4)}; drivers ${rows.reduce((n, r) => n + r.drivers, 0)}; do not know ${rows.reduce((n, r) => n + r.unknowing, 0)}`);
    const bands = { "sound (all three)": (o) => o.obs > 0.8 && o.knows && o.c >= 0.8 && o.c <= 1.2, "poor observer": (o) => o.obs < 0.5 && o.knows && o.c >= 0.8 && o.c <= 1.2, "does not know": (o) => !o.knows && o.obs > 0.8 && o.c >= 0.8 && o.c <= 1.2, "bold": (o) => o.c < 0.5 && o.knows && o.obs > 0.8, "timid": (o) => o.c > 1.3 && o.knows && o.obs > 0.8 };
    const sticky = occ.filter((o) => o.held >= 0.8);
    console.log(`  blocked 80%+ of the approach: ${sticky.length} of ${occ.length} occasions; share of the approach blocked, median ${[...occ.map((o) => o.held)].sort((a, b) => a - b)[occ.length >> 1]}; the derived speed there, median ${[...sticky.map((o) => o.vc)].sort((a, b) => a - b)[sticky.length >> 1]} m/s`);
    for (const [label, pop] of [["ALL OCCASIONS", occ], ["BLOCKED 80%+ OF THE APPROACH", sticky]]) { console.log("  " + label);
    for (const [name, test] of Object.entries(bands)) {
      const b = pop.filter(test), cut = b.map((o) => 1 - o.line / Math.max(1, o.first)), slowed = cut.filter((x) => x >= 0.1);
      console.log(`  ${name.padEnd(18)} ${String(b.length).padStart(5)} occasions, ${String(new Set(b.map((o) => o.who)).size).padStart(4)} drivers: at the line ${mean(b.map((o) => o.line)).toFixed(1)} m/s from ${mean(b.map((o) => o.first)).toFixed(1)}; slowed 10%+ on ${(100 * slowed.length / Math.max(1, b.length)).toFixed(0)}%; those by ${(100 * mean(slowed)).toFixed(0)}%; hard after (over 5.4) ${b.filter((o) => o.after > 5.4).length}; caution braking over comfortable ${b.filter((o) => o.overBrake).length}`);
    } }
    console.log(`  everyone           ${occ.length} occasions: at the line ${mean(occ.map((o) => o.line)).toFixed(1)} from ${mean(occ.map((o) => o.first)).toFixed(1)}; slowed 10%+ ${(100 * occ.filter((o) => 1 - o.line / Math.max(1, o.first) >= 0.1).length / Math.max(1, occ.length)).toFixed(0)}%; lost, of those not slowing: ${JSON.stringify({ unknowing: occ.filter((o) => !o.knows && 1 - o.line / Math.max(1, o.first) < 0.1).length, poorObs: occ.filter((o) => o.knows && o.obs < 0.7 && 1 - o.line / Math.max(1, o.first) < 0.1).length, bold: occ.filter((o) => o.knows && o.obs >= 0.7 && o.c < 0.5 && 1 - o.line / Math.max(1, o.first) < 0.1).length, other: occ.filter((o) => o.knows && o.obs >= 0.7 && o.c >= 0.5 && 1 - o.line / Math.max(1, o.first) < 0.1).length })}`);
  }
  process.exit(0);
}
const { loadMap } = await import("../../src/map/load.js");
const { TEST_MAPS } = await import("../../src/map/samples.js");
const { seedGraph, step, whatStops, layoutOf, pathOf, blockedSightline } = await import("../../src/sim/crossing.js");
const { movementLight } = await import("../../src/sim/signal.js");
const { DT } = await import("../../src/sim/traffic.js");
const { reads, soundnessOf } = await import("../../src/core/driver.js");
const [seedsArg, carsArg = "150"] = process.argv.slice(2);
const city = loadMap(TEST_MAPS.find((t) => t.id === "city").build());
const out = { seeds: seedsArg, occ: [], vSum: 0, vN: 0, drivers: 0, unknowing: 0 };
for (const seed of seedsArg.split(",").map(Number)) {
  let w = seedGraph(seed, 50, city, { target: Number(carsArg), posted: true, rivals: true });
  if (process.env.CAUTION === "1") w = { ...w, sightCaution: true };
  if (process.env.MARGIN === "1") w = { ...w, marginCanStop: true };
  const open = new Map(), seen = new Set(), who = new Set();
  for (let i = 0; i < 600 / DT; i++) {
    const prev = w;
    w = step(w);
    for (const a of w.actors) {
      if (a.player || a.crash || a.parked) continue;
      if (!who.has(a.id)) { who.add(a.id); out.drivers++; if (!reads(a, "blocked-sightline")) out.unknowing++; }
      if ((a.v ?? 0) > 1) { out.vSum += a.v / Math.max(1, a.v0 ?? a.v); out.vN++; }
      const P = pathOf(w, a), key = `${a.id}|${a.k}|${a.route}`, L = layoutOf(w, a), o = open.get(key), at = P.stopAt - (a.length ?? 4.5) / 2;
      if (o) {
        if (o.line == null) {
          if (a.v < 1) { open.delete(key); continue; }
          /* Still blocked, asked of the road and not the driver: how much of the approach was. */
          if (Math.round(w.t / DT) % 4 === 0) { o.asked++; const bs2 = blockedSightline(w, a); if (bs2) { o.blocked++; o.vc = Math.min(o.vc, bs2.vc); } }
          if (a.s >= at) { o.line = a.v; o.t = w.t; }
        }
        if (o.line != null) {
          o.after = Math.max(o.after ?? 0, -(a.a ?? 0));
          if (w.t - o.t >= 5) { open.delete(key); out.occ.push({ who: `${seed}:${a.id}`, first: o.first, line: +o.line.toFixed(2), after: +o.after.toFixed(2), obs: o.obs, knows: o.knows, c: o.c, overBrake: o.overBrake, held: +(o.blocked / Math.max(1, o.asked)).toFixed(2), vc: +o.vc.toFixed(1) }); }
        } else if (o.covered && -(a.a ?? 0) > (a.brake ?? 2.7) + 1e-6 && whatStops(a, prev).cover && !whatStops(a, prev).held) o.overBrake = true;
        continue;
      }
      if (seen.has(key) || Math.round(w.t / DT) % 4 || a.going || a.lc || P.intent !== "straight") continue;
      const d = at - a.s;
      if (d < 20 || d > 60 || a.v < 8) continue;
      const bs = blockedSightline(w, a);
      if (!bs) continue;
      seen.add(key);
      const v = whatStops(a, w);
      if (v.leader && v.leader.id !== "line" && v.gap < 40) continue;
      if (L.signal && movementLight(L.signal, L.legs[P.from]?.base, P.intent, w.t, w.lights?.[a.k ?? 0]?.live) !== "green") continue;
      if ((L.place?.control?.[P.from] ?? "none") === "stop" || (L.place?.control?.[P.from] ?? "none") === "yield") continue;
      open.set(key, { first: +a.v.toFixed(2), obs: +soundnessOf(a.ratings ?? {}, "observation").toFixed(2), knows: reads(a, "blocked-sightline"), c: +(a.caution ?? 1).toFixed(2), covered: true, asked: 0, blocked: 0, vc: bs.vc });
    }
  }
}
console.log(JSON.stringify(out));
