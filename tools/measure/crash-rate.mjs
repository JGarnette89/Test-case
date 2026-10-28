/* THE CITY'S CRASH RATE, AS THE MAINTAINER WOULD JUDGE IT (28 October; the
   project lead, for the maintainer: is this the right rate?). The world #/map
   builds when watching (sim/scene.js worldFor: rivals, people walking and
   crossing, posted speeds), the city, at a stated car count, ten minutes a
   seed. Crashes split car-on-car and with a pedestrian; with the cars on the
   map summed tick by tick, so the rate is per hour of driving AND per car-hour.
   Usage: node crash-rate.mjs <treeRoot> cars seeds(comma) */
const [root, cars, seedsArg] = process.argv.slice(2);
const { worldFor } = await import(`file:///${root}/src/sim/scene.js`);
const { TEST_MAPS } = await import(`file:///${root}/src/map/samples.js`);
const { step } = await import(`file:///${root}/src/sim/crossing.js`);
const { DT } = await import(`file:///${root}/src/sim/traffic.js`);
const raw = TEST_MAPS.find((t) => t.id === "city").build();
const out = { cars: Number(cars), seeds: seedsArg, minutes: 0, carHours: 0, carCar: 0, ped: 0 };
for (const seed of seedsArg.split(",").map(Number)) {
  let { world: w } = worldFor(seed, 50, 2.0, false, Number(cars), raw, null, false);
  const seen = new Set();
  for (let i = 0; i < 600 / DT; i++) {
    w = step(w);
    out.carHours += w.actors.filter((a) => !a.player).length * DT / 3600;
    for (const c of w.crashes ?? []) { const k = `${c.t}|${c.a}|${c.b}`; if (seen.has(k)) continue; seen.add(k); if (/ped|walker/.test(String(c.a) + String(c.b))) out.ped++; else out.carCar++; }
    for (const p of [...(w.peds ?? []), ...(w.walkers ?? [])]) if (p.state === "struck" && !seen.has("p:" + p.id)) { seen.add("p:" + p.id); if (![...seen].some((k) => k.includes(p.id + "|") || k.endsWith("|" + p.id))) out.ped++; }
  }
  out.minutes += 10;
}
console.log(JSON.stringify(out));
