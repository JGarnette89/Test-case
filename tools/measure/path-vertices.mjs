/* THE PATH DATA: vertex spacing and turning angle along an approach (13 November, DECISIONS 10.70; read-only). Is a bend a polyline approximating a circle, with uniform turning angles, or irregular? Usage: node tools/measure/path-vertices.mjs [routePrefix=loop-7|end#1]. */
import { loadMap } from "../../src/map/load.js";
import { TEST_MAPS } from "../../src/map/samples.js";
import { seedGraph } from "../../src/sim/crossing.js";
const prefix = process.argv[2] ?? "loop-7|end#1";
const w = seedGraph(1, 50, loadMap(TEST_MAPS.find((m) => m.id === "test-loop").build()), { every: 2 });
const L = w.course.at[0].layout, route = Object.keys(L.paths).find((r) => r.startsWith(prefix)), p = L.paths[route];
const turnOf = (a, b) => ((a - b + 540) % 360) - 180;
const sp = [], ang = [];
for (let i = 1; i < p.pts.length - 1; i++) {
  const a = p.pts[i - 1], b = p.pts[i], c = p.pts[i + 1];
  const h1 = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI, h2 = (Math.atan2(c.y - b.y, c.x - b.x) * 180) / Math.PI;
  sp.push(Math.hypot(b.x - a.x, b.y - a.y)); ang.push(turnOf(h2, h1));
}
const st = (x) => { const s = [...x].sort((a, b) => a - b), m = x.reduce((a, b) => a + b, 0) / x.length; return { n: x.length, min: +s[0].toFixed(3), p50: +s[Math.floor(s.length / 2)].toFixed(3), max: +s[s.length - 1].toFixed(3), mean: +m.toFixed(3), sd: +Math.sqrt(x.reduce((q, v) => q + (v - m) ** 2, 0) / x.length).toFixed(3) }; };
const bent = ang.map((a, i) => ({ a, i })).filter((q) => Math.abs(q.a) > 0.05);
console.log(JSON.stringify({ route, length: +p.length.toFixed(0), vertices: p.pts.length, spacing_m: st(sp), "turning angle at a vertex, degrees (all)": st(ang), "vertices that turn by more than 0.05 deg": bent.length, "turning angle where it turns": bent.length ? st(bent.map((q) => q.a)) : null, "implied radius from the mean turn and the mean spacing, m": bent.length ? +(st(sp).p50 / (Math.abs(st(bent.map((q) => q.a)).mean) * Math.PI / 180)).toFixed(0) : null }, null, 1));
