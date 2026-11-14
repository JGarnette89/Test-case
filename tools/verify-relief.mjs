/* =====================================================================
   RELIEF SHADING (iso/relief.js, DECISIONS 10.87): a signal, not light.

   The expectations are stated here, not read from the module: "toward the
   viewer" is FOUND from where viewOf puts points on the screen, so the
   light being fixed to the viewer (not the world) is held by a statement
   independent of how reliefLight builds it. Then the wiring: drawn, the
   fills of a hilly scene change and a flat scene's do not, and the clamp,
   the off switch and the flat tier hold.
   ===================================================================== */
import { RELIEF } from "../src/iso/body.js";
import { reliefLight, reliefFactor } from "../src/iso/relief.js";
import { viewOf } from "../src/iso/project.js";
import { drawFrame } from "../src/iso/draw.js";
import { terrain, groundAt as stage0Ground } from "../src/iso/road.js";
import { seedScene, stepScene, carsOf } from "../src/iso/world.js";

let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? " ok " : "FAIL"} ${msg}`); if (!ok) failed++; };
const canvas = { w: 800, h: 600 };

/* THE VIEWER-FIXED LIGHT: the world direction that is screen-up, found from the projection itself. */
const upWorld = (rot) => {
  const v = viewOf(5, { x: 0, y: 0, z: 0 }, rot, canvas), [ox, oy] = v.P(0, 0, 0);
  const [ax, ay] = v.P(1, 0, 0), [bx, by] = v.P(0, 1, 0);
  const a11 = ax - ox, a12 = bx - ox, a21 = ay - oy, a22 = by - oy;   // solve [a11 a12; a21 a22] (p q) = (0, -1)
  const det = a11 * a22 - a12 * a21, p = (-a12 * -1) / det, q = (a11 * -1) / det;
  const l = Math.hypot(p, q);
  return { x: p / l, y: q / l };
};
{
  console.log("the factor");
  const m = 0.09;
  const ref = { up: null };
  for (const rot of [0, 37, 90, -135, 200]) {
    const u = upWorld(rot), L = reliefLight(rot);
    /* the ground rises toward screen-up (a climb ahead) or falls toward it (a descent) */
    const climb = reliefFactor(u.x * m, u.y * m, L), descend = reliefFactor(-u.x * m, -u.y * m, L), flat = reliefFactor(0, 0, L);
    ref.up ??= { climb, descend };
    check(flat === 1, `rot ${rot}: flat ground is exactly 1`);
    check(climb > 1.05 && descend < 0.95, `rot ${rot}: a climb ahead is brighter (${climb.toFixed(3)}) and a descent darker (${descend.toFixed(3)}) than the flat`);
    check(Math.abs(climb - ref.up.climb) < 1e-9 && Math.abs(descend - ref.up.descend) < 1e-9, `rot ${rot}: the same as at rot 0 -- the light is the viewer's, not the world's`);
  }
  /* a world-fixed light would fail the line above: the old one read +2.8% at one heading and -2.8% at another (DECISIONS 10.86) */
  const L0 = reliefLight(0), u0 = upWorld(0);
  let prev = 0;
  for (const g of [0.01, 0.02, 0.04, 0.09, 0.15]) { const f = reliefFactor(u0.x * g, u0.y * g, L0); check(f >= prev, `a steeper climb is never darker (${(g * 100).toFixed(0)}%: ${f.toFixed(3)})`); prev = f; }
  const hi = reliefFactor(u0.x * 5, u0.y * 5, L0), lo = reliefFactor(-u0.x * 5, -u0.y * 5, L0);
  check(lo === RELIEF.floor && hi <= RELIEF.ceil && hi > 1, `clamped: a wall down is ${lo} (the floor), a wall up is ${hi.toFixed(3)} (within the ceiling), never black, never blown out`);
  let sat = null; for (let g = 0.005; g < 0.3; g += 0.005) if (reliefFactor(-u0.x * g, -u0.y * g, L0) === RELIEF.floor) { sat = g; break; }
  console.log(`   (a descent reaches the floor at ${(sat * 100).toFixed(1)}% grade: below it descents grade, above they are all the same dark)`);
  check(RELIEF.floor >= 0.5 && RELIEF.ceil <= 1.5, "and the clamp itself is a modest one");
  const g0 = { ...RELIEF, gain: 0 };
  check(reliefFactor(u0.x * m, u0.y * m, L0, g0) === 1, "gain 0 is off: exactly 1");
  check(reliefFactor(NaN, 0, L0) === 1 && reliefFactor(0, Infinity, L0) === 1, "a degenerate gradient gives 1, not NaN");
  /* the whole point of the gain: the physical value would be invisible */
  const phys = reliefFactor(u0.x * m, u0.y * m, L0, { ...RELIEF, gain: 1 });
  check(Math.abs(phys - 1) < Math.abs(ref.up.climb - 1) / 3, `at gain 1 a ${m * 100}% climb is ${(100 * (phys - 1)).toFixed(1)}% and at the shipped gain ${(100 * (ref.up.climb - 1)).toFixed(1)}%: the gain is what makes it readable`);
}

/* THE WIRING: drawn, with the gain on vs off. */
{
  console.log("\nthe wiring");
  const fills = () => { const out = []; return { out, ctx: new Proxy({}, { get: (t, p) => (p === "fill" ? () => out.push(t.fillStyle) : p === "canvas" ? { width: 1, height: 1 } : t[p] ?? (() => {})), set: (t, p, v) => { t[p] = v; return true; } }) }; };
  const draw = (scene, gain, k = 5) => { const saved = RELIEF.gain; RELIEF.gain = gain; try { const f = fills(); drawFrame(f.ctx, canvas, { ...scene, k, rot: 30 }, {}); return f.out; } finally { RELIEF.gain = saved; } };
  let sc = seedScene(2, 60); const road = sc.valley; sc = stepScene(sc, 20 * 40);
  const p = road.pts[Math.round(160 / 5)];
  const hilly = { roads: carsOf(sc), terrain: sc.terrain, props: sc.props, groundAt: stage0Ground, cam: { x: p.x, y: p.y, z: p.z }, tilt: true };
  const off = draw(hilly, 0), on = draw(hilly, RELIEF.gain);
  let changed = 0; for (let i = 0; i < off.length; i++) if (off[i] !== on[i]) changed++;
  check(off.length === on.length && changed > 20, `on the hilly valley the gain changes ${changed} of ${off.length} fills`);
  /* a flat world: every fill is byte-identical with the gain on */
  const flatT = terrain({ ground: () => 0 }), flatRoad = { ...hilly, terrain: flatT, groundAt: () => 0, roads: [], cam: { x: 100, y: 100, z: 0 } };
  const f0 = draw(flatRoad, 0), f1 = draw(flatRoad, RELIEF.gain);
  check(f0.length > 0 && f0.every((c, i) => c === f1[i]), `on flat ground all ${f0.length} fills are identical with the gain on`);
  /* the flat tier (zoomed out to the map) is left alone */
  const z0 = draw(hilly, 0, 1.5), z1 = draw(hilly, RELIEF.gain, 1.5);
  check(z0.length === z1.length && z0.every((c, i) => c === z1[i]), "in the flat tier (zoomed out) nothing is shaded by relief");
}

if (failed) { console.log(`\n${failed} FAILED`); process.exit(1); }
console.log("\nOK: relief is the viewer's light on the ground's own gradient, clamped, off at gain 0, flat on the flat and in the map tier.");
