/* WHAT A MAP'S ROAD REALLY IS (14 Nov): elevation and curvature read straight from the map's own centreline points, no drive. Usage: node tools/measure/road-profile.mjs <loop|hw6|hw15> */
import { testLoop, testHighway as hw6 } from "../../src/map/samples.js";
import { testHighway as hw15 } from "../../src/map/highway.js";
const which = process.argv[2] ?? "loop", m = { loop: testLoop, hw6, hw15 }[which]();
const pref = which === "loop" ? /^loop-/ : which === "hw6" ? /^hw-/ : /^hw|^road|^main|^loop|^highway/;
let roads = m.roads.filter((r) => (r.kind === "highway" || /hw|loop/.test(r.id)) && !/^(on|off)-/.test(r.id));
if (!roads.length) roads = m.roads;
console.log(which, "roads:", roads.map((r) => r.id).join(","), "of", m.roads.length);
/* stitch in id order by the first point; for the loop, sort by position along the ring */
const pts = roads.flatMap((r) => r.points);
const P = []; let u = 0;
for (let i = 0; i < pts.length; i++) { if (i) { const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); if (d > 60) continue; u += d; } P.push({ u, x: pts[i].x, y: pts[i].y, z: pts[i].z ?? 0 }); }
const L = u, W = 100;   // grade and heading over a 100 m chord
const at = (v) => { let i = 0; while (i < P.length - 1 && P[i + 1].u < v) i++; return P[i]; };
const prof = [];
for (let v = W; v <= L - W; v += 25) { const a = at(v - W / 2), b = at(v + W / 2); const g = (b.z - a.z) / (b.u - a.u || 1); const h0 = Math.atan2(at(v).y - a.y, at(v).x - a.x), h1 = Math.atan2(b.y - at(v).y, b.x - at(v).x); let dh = h1 - h0; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); prof.push({ v, z: at(v).z, g, k: Math.abs(dh) / (W / 2) }); }
const zs = P.map((p) => p.z), grades = prof.map((p) => p.g);
console.log(`length ${(L / 1000).toFixed(2)} km; z min ${Math.min(...zs).toFixed(1)} max ${Math.max(...zs).toFixed(1)} m; steepest climb ${(100 * Math.max(...grades)).toFixed(2)}%, steepest descent ${(100 * Math.min(...grades)).toFixed(2)}%`);
let rise = 0, fall = 0; for (let i = 1; i < prof.length; i++) { const d = prof[i].z - prof[i - 1].z; if (d > 0) rise += d; else fall -= d; } console.log(`total rise ${rise.toFixed(0)} m, total fall ${fall.toFixed(0)} m`);
/* grade runs: sign changes of grade beyond 0.5% => crests and dips */
const sg = (g) => (g > 0.005 ? 1 : g < -0.005 ? -1 : 0); const runs = []; let cur = null;
for (const p of prof) { const s = sg(p.g); if (!cur || cur.s !== s) { cur = { s, from: p.v, to: p.v, z0: p.z, z1: p.z, gmax: p.g }; runs.push(cur); } cur.to = p.v; cur.z1 = p.z; if (Math.abs(p.g) > Math.abs(cur.gmax)) cur.gmax = p.g; }
console.log("grade runs (>0.5%): [from-to m, length, rise m, peak grade]"); for (const r of runs) if (r.s) console.log(`  ${r.s > 0 ? "climb" : "drop "} ${r.from.toFixed(0)}-${r.to.toFixed(0)} (${(r.to - r.from).toFixed(0)} m), ${(r.z1 - r.z0).toFixed(1)} m, peak ${(100 * r.gmax).toFixed(2)}%`);
const flat = prof.filter((p) => Math.abs(p.g) <= 0.005).length / prof.length;
console.log(`share of length within +-0.5% grade: ${(100 * flat).toFixed(0)}%`);
const curved = prof.filter((p) => p.k > 1 / 5000), tight = prof.filter((p) => p.k > 1 / 800), r = prof.map((p) => (p.k > 1e-5 ? 1 / p.k : Infinity)).filter(isFinite);
console.log(`curved (radius under 5 km): ${(100 * curved.length / prof.length).toFixed(0)}% of length; under 800 m: ${(100 * tight.length / prof.length).toFixed(0)}%; tightest radius ${Math.min(...r).toFixed(0)} m`);
const cr = []; cur = null; for (const p of prof) { const c = p.k > 1 / 5000; if (!cur || cur.c !== c) { cur = { c, from: p.v, to: p.v, kmax: p.k }; cr.push(cur); } cur.to = p.v; cur.kmax = Math.max(cur.kmax, p.k); }
console.log("curved stretches [length m, tightest radius m]:", cr.filter((x) => x.c).map((x) => `${(x.to - x.from).toFixed(0)} m r${(1 / x.kmax).toFixed(0)}`).join("; "));
console.log("straight stretches [m]:", cr.filter((x) => !x.c).map((x) => (x.to - x.from).toFixed(0)).join(", "));
