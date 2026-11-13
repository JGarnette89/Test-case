/* WHO IS IN THE FAST TAIL (DECISIONS 10.71): of drivers over 125 km/h on a 100 km/h highway, the share poor on each other axis (rating < 0.5) against the population, and weak-axis counts. */
import { driver } from "../../src/sim/traffic.js";
const road = { speed: 100 / 3.6, kind: "highway", lane: 3.6 }, D = [];
for (let n = 0; n < 20000; n++) { const d = driver(road, 11, n); D.push({ kmh: d.v0 * 3.6, r: d.ratings, weak: d.weakOn?.length ?? 0 }); }
const fast = D.filter((d) => d.kmh > 125), pct = (x, f) => (100 * x.filter(f).length / x.length).toFixed(0) + "%";
console.log(`n ${D.length}, fast tail ${fast.length} (${pct(D, (d) => d.kmh > 125)})`);
for (const ax of ["braking", "observation", "steering", "knowledge", "compliance", "confidence"]) console.log(ax.padEnd(12), "poor (<0.5): fast tail", pct(fast, (d) => d.r[ax] < 0.5), " population", pct(D, (d) => d.r[ax] < 0.5));
console.log("weak axes a driver has, mean: fast tail", (fast.reduce((a, d) => a + d.weak, 0) / fast.length).toFixed(2), " population", (D.reduce((a, d) => a + d.weak, 0) / D.length).toFixed(2));
