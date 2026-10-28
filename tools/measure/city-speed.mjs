/* HOW FAST THE CITY DRIVES AGAINST WHAT ITS DRIVERS WANT (28 October; IN
   FLIGHT 39's G2: does misreading the car ahead across a seam make the
   traffic polite?). The city, a stated car count, one seed, 180 s after 60:
   every second, over every car moving above 1 m/s, the mean of v / v0 (speed
   against the speed that driver wants on that road); and how many cars
   arrive at their trip's end a minute, from either tree.
   Usage: node city-speed.mjs <treeRoot> cars seed */
const [root, cars, seed] = process.argv.slice(2);
const { loadMap } = await import(`file:///${root}/src/map/load.js`);
const { TEST_MAPS } = await import(`file:///${root}/src/map/samples.js`);
const { seedGraph, step } = await import(`file:///${root}/src/sim/crossing.js`);
const { DT } = await import(`file:///${root}/src/sim/traffic.js`);
let w = seedGraph(Number(seed), 50, loadMap(TEST_MAPS.find((t) => t.id === "city").build()), { target: Number(cars), posted: true });
for (let i = 0; i < 60 / DT; i++) w = step(w);
let sum = 0, n = 0, gone = 0;
for (let i = 0; i < 180 / DT; i++) {
  const ids = new Set(w.actors.map((a) => a.id));
  w = step(w);
  const now = new Set(w.actors.map((a) => a.id));
  for (const id of ids) if (!now.has(id)) gone++;
  if (i % 20) continue;
  for (const a of w.actors) if (!a.player && (a.v ?? 0) > 1 && a.v0 > 0) { sum += a.v / a.v0; n++; }
}
console.log(JSON.stringify({ cars: Number(cars), seed: Number(seed), meanVoverV0: +(sum / n).toFixed(4), samples: n, finishedPerMin: +(gone / 3).toFixed(1) }));
