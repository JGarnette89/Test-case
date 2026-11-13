/* =====================================================================
   BODY MOTION (13 November, DECISIONS 10.70; src/iso/body.js, and draw.js's body transform).

   A car leans into a corner, dives under braking and squats under power: one system for every vehicle kind, a TABLE of constants per kind, renderer-only
   (no simulation state, nothing crossing the worker), the inputs from what the page already holds. What is held here, each as a property a correct
   implementation has to have and not a restatement of a constant:
     1. every vehicle kind has a row, and the rows are ordered as Jay's words and physics say (a truck leans further and slower than a car);
     2. the spring is a spring: it reaches its target, overshoots by a bounded amount, settles, and the heavier vehicles are slower;
     3. DIRECTIONS: a right turn rolls the body left side down, braking dips the nose, power lifts it, and a clamp holds;
     4. ON REAL TRAFFIC: through a bend the roll has the sign opposite to the bend (read independently from the path's positions), and over a drive the
        angles are smooth at the frame rate: no jump between frames, and almost no power above 8 Hz (the staircase of the tick and the path's vertices
        must not reach the picture);
     5. THE DRAWING: with no body motion the box is exactly what it was; a lean lowers the right side for a positive roll and raises the nose for a positive pitch;
        the lowest point rests on the road after the drop; and the lamps are placed by the SAME transform as the box (a lamp on a body that leans);
     6. MEMORY: an id that is no longer drawn is forgotten, an id whose world restarts is somebody else, a long gap snaps and does not integrate;
     7. WIRING: the screen draws every car, the player included, through `bodyOf`, passes the body to every lamp call, and ships with it OFF.
   ===================================================================== */
import fs from "node:fs";
import { loadMap } from "../src/map/load.js";
import { TEST_MAPS } from "../src/map/samples.js";
import { seedGraph, step, DT } from "../src/sim/crossing.js";
import { VEHICLES } from "../src/sim/traffic.js";
import { poseOnGraph } from "../src/sim/graph.js";
import { lateralOf } from "../src/sim/lanechange.js";
import { BODY, targetsOf, springStep, newBody, beginBodyFrame, endBodyFrame, bodyOf, rowOf, resolveBody } from "../src/iso/body.js";
import { boxCorners, bodyPoint, dropFor } from "../src/iso/draw.js";

let failed = 0;
const check = (ok, msg) => { console.log(`  ${ok ? "ok  " : "FAIL:"} ${msg}`); if (!ok) failed++; };
const DEG = Math.PI / 180, FDT = 1 / 60;
/* [instrument] from the measurement: the real traffic gives 1.767 degrees between frames and 0.752% of the roll above 8 Hz; the spring bypassed (angle = target, a 20 Hz staircase reaching the picture) gives 14.5 and 3.68. The limits sit between. */
const JUMP_LIMIT = 4, HF_LIMIT = 0.02;

console.log("\n1. A ROW FOR EVERY VEHICLE, ORDERED AS JAY AND PHYSICS SAY");
{
  const kinds = Object.keys(VEHICLES), fields = ["slope", "roll", "pitch", "rollHz", "pitchHz", "rollZeta", "pitchZeta", "maxRoll", "maxPitch", "pivot"];
  check(kinds.every((k) => BODY[k] && fields.every((f) => Number.isFinite(BODY[k][f]) && BODY[k][f] > 0)), `every vehicle kind in the sim (${kinds.join(", ")}) has a body row with every field positive and finite`);
  check(Object.keys(VEHICLES).every((k) => rowOf(k) === BODY[k]), "`rowOf` gives every kind ITS OWN row (a truck is not drawn with a car's spring)");
  check(rowOf("something-new") === BODY.car, "and a kind nobody wrote a row for falls back to the car's, not to nothing");
  check(BODY.truck.roll > BODY.car.roll && BODY.bus.roll > BODY.car.roll && BODY.truck.rollHz < BODY.car.rollHz && BODY.bus.rollHz < BODY.car.rollHz, "[Jay: a truck leans further and slower than a hatchback] a truck and a bus lean further and at a lower frequency than a car");
  check(BODY.car.pivot > 0 && BODY.car.pivot < 0.5 * (0.75 + 0.62), `[the maintainer: about axle height] the car's roll centre is above the ground (${BODY.car.pivot} m) and well below the middle of the body`);
}

console.log("\n2. THE SPRING IS A SPRING");
{
  const run = (hz, zeta) => { let x = 0, v = 0, peak = 0, t90 = null, tSettle = 0; for (let i = 0; i < 6 / FDT; i++) { [x, v] = springStep(x, v, 1, hz, zeta, FDT); peak = Math.max(peak, x); if (t90 == null && x >= 0.9) t90 = i * FDT; if (Math.abs(x - 1) > 0.05) tSettle = i * FDT; } return { x, peak, t90, tSettle }; };
  for (const kind of Object.keys(VEHICLES)) {
    const r = run(BODY[kind].rollHz, BODY[kind].rollZeta);
    check(Math.abs(r.x - 1) < 0.02 && r.peak < 1.45 && r.tSettle < 3.5, `${kind}: a step reaches its target (${r.x.toFixed(3)}), overshoots by under 45% (${((r.peak - 1) * 100).toFixed(0)}%) and settles within 5% by ${r.tSettle.toFixed(2)} s`);
  }
  check(run(BODY.truck.rollHz, BODY.truck.rollZeta).t90 > run(BODY.car.rollHz, BODY.car.rollZeta).t90 && run(BODY.bus.rollHz, BODY.bus.rollZeta).t90 > run(BODY.car.rollHz, BODY.car.rollZeta).t90, "the heavier vehicles are slower to lean: a truck and a bus take longer than a car to reach 90%");
}

console.log("\n2b. THE RESOLVE: ONE FUNCTION, A BASE ROW THEN THE MODIFIERS FITTED, AND PLANTED MEANS TIGHTER, NOT SMALLER");
{
  const step = (row) => { let x = 0, v = 0, peak = 0, settle = 0; for (let i = 0; i < 6 / FDT; i++) { [x, v] = springStep(x, v, 1, row.rollHz, row.rollZeta, FDT); peak = Math.max(peak, x); if (Math.abs(x - 1) > 0.05) settle = i * FDT; } return { peak, settle }; };
  check(Object.keys(VEHICLES).every((k) => resolveBody(k, []) === BODY[k] && resolveBody(k) === BODY[k]), "with no modifiers (there is no upgrade system) the resolve returns the kind's base row itself: nothing copied, nothing changed");
  const planted = [{ hz: 1.5, zeta: 1.4 }];
  const r = Object.keys(VEHICLES).map((k) => ({ k, base: BODY[k], res: resolveBody(k, planted), b: step(BODY[k]), p: step(resolveBody(k, planted)) }));
  check(r.every((x) => x.p.settle < 0.75 * x.b.settle && x.p.peak <= x.b.peak + 1e-9), `[the maintainer: tighter, not smaller] a planted modifier (frequency x1.5, damping x1.4) settles at least a quarter sooner and overshoots no more, for every kind (${r.map((x) => `${x.k} ${x.b.settle.toFixed(2)} s to ${x.p.settle.toFixed(2)} s`).join("; ")})`);
  check(r.every((x) => { const a = targetsOf(x.base, 3, -4), b = targetsOf(x.res, 3, -4); return Math.abs(a.roll - b.roll) < 1e-12 && Math.abs(a.pitch - b.pitch) < 1e-12; }), "and the PEAK INFORMATION IS UNTOUCHED: the angle a given acceleration settles to is the same, so the distance cue is delivered whole and resolved sooner");
  const crush = resolveBody("car", [{ gain: 0.05 }, { gain: 0.5 }]);
  check(crush.roll >= 0.8 * BODY.car.roll && crush.pitch >= 0.8 * BODY.car.pitch, `no stack of modifiers can remove the cue: gains of 0.05 and 0.5 leave ${(100 * crush.roll / BODY.car.roll).toFixed(0)}% of the car's roll (an amplitude floor, at least 80%)`);
  const ab = resolveBody("truck", [{ hz: 1.2 }, { zeta: 1.1 }]), ba = resolveBody("truck", [{ zeta: 1.1 }, { hz: 1.2 }]), both = resolveBody("truck", [{ hz: 1.2, zeta: 1.1 }]);
  check(JSON.stringify(ab) === JSON.stringify(ba) && JSON.stringify(ab) === JSON.stringify(both), "modifiers compose: the order they are fitted in, or whether they come as one or two, does not matter");
  const wild = resolveBody("car", [{ hz: 50, zeta: 50 }]);
  check(wild.rollHz <= 5 && wild.rollZeta <= 1 && 2 * Math.PI * wild.rollHz * 0.05 < 2, "and frequency and damping are bounded, so no modifier can make the spring unstable at the frame step");
}

console.log("\n3. DIRECTIONS");
{
  const c = BODY.car, r = targetsOf(c, 3, 0), l = targetsOf(c, -3, 0), b = targetsOf(c, 0, -4), g = targetsOf(c, 0, 4), big = targetsOf(c, 1e6, -1e6);
  check(r.roll < 0 && l.roll > 0 && Math.abs(r.roll + l.roll) < 1e-12, "a right turn (a positive lateral acceleration) rolls the body left side down (roll < 0), a left turn the other way, equally");
  check(b.pitch < 0 && g.pitch > 0 && Math.abs(b.pitch + targetsOf(c, 0, 4).pitch) < 1e-12, "braking dips the nose (pitch < 0), power lifts it (pitch > 0), equally");
  check(Math.abs(big.roll) <= c.maxRoll * DEG + 1e-12 && Math.abs(big.pitch) <= c.maxPitch * DEG + 1e-12 && Math.abs(big.roll) > 0, "and a clamp holds whatever the acceleration");
  check(r.pitch === 0 && b.roll === 0, "a turn does not dive and braking does not lean: the two axes are independent");
  const up = targetsOf(c, 0, 0, 0.06), down = targetsOf(c, 0, 0, -0.06), both = targetsOf(c, 0, -4, 0.06);
  check(up.pitch > 0 && down.pitch < 0 && Math.abs(up.pitch + down.pitch) < 1e-12 && up.roll === 0, "THE ROAD'S GRADIENT: uphill lifts the nose, downhill dips it, equally, and does not lean the body");
  check(Math.abs(both.pitch - (targetsOf(c, 0, -4, 0).pitch + up.pitch)) < 1e-12, "and it adds to the dive and squat (braking uphill is the sum of the two)");
}

console.log("\n4. ON REAL TRAFFIC: THE SIGN, AND SMOOTHNESS AT THE FRAME RATE");
{
  let w = seedGraph(1, 50, loadMap(TEST_MAPS.find((m) => m.id === "test-loop").build()), { target: 200, posted: true });
  const snaps = [w]; for (let i = 0; i < 40 / DT; i++) { w = step(w); snaps.push(w); }
  const mem = newBody(), series = new Map(), turnOf = (a, b) => ((a - b + 540) % 360) - 180;
  /* the bend, read INDEPENDENTLY of body.js: the turn between the chord of the path's positions 9 m behind and the chord 9 m ahead, per metre (a right turn positive) */
  const kIndep = (course, a) => { const P = (s) => poseOnGraph(course, a.k ?? 0, a.route, s), L = course.at[a.k ?? 0].layout.paths[a.route].length, s = Math.min(L - 9, Math.max(9, a.s)); const p0 = P(s - 9), p1 = P(s), p2 = P(s + 9); const h1 = Math.atan2(p1.y - p0.y, p1.x - p0.x), h2 = Math.atan2(p2.y - p1.y, p2.x - p1.x); return turnOf((h2 * 180) / Math.PI, (h1 * 180) / Math.PI) * DEG / 9; };
  for (let f = 0; f < 38 * 60; f++) {
    const t = f * FDT, ti = Math.floor(t / DT + 1e-9), carry = t - ti * DT, ww = snaps[ti];
    beginBodyFrame(mem);
    for (const a of ww.actors) {
      if (a.player || a.crash) continue;
      const b = bodyOf(mem, ww, a, carry, FDT); if (!b) continue;
      let s = series.get(a.id); if (!s) series.set(a.id, (s = { roll: [], pitch: [], kA: [], v: [], sPos: [], len: [], lc: [], lc2: [], f0: f }));
      s.roll.push(b.roll); s.pitch.push(b.pitch); s.kA.push(kIndep(ww.course, a)); s.v.push(a.v); s.sPos.push(a.s); s.len.push(ww.course.at[a.k ?? 0].layout.paths[a.route].length); s.lc.push(!!a.lc && ww.t + carry < a.lc.t0 + a.lc.T + 1.5); s.lc2.push(a.lc && ww.t + carry < a.lc.t0 + a.lc.T ? (lateralOf(a.lc, ww.t + carry + 0.05) - 2 * lateralOf(a.lc, ww.t + carry) + lateralOf(a.lc, ww.t + carry - 0.05)) / 0.0025 : 0);
    }
    endBodyFrame(mem);
  }
  const full = [...series.values()].filter((s) => s.roll.length > 30 * 60);
  let lcN = 0, lcXY = 0, lcXX = 0, lcYY = 0; const badWin = []; let bends = 0, bendsRight = 0, signOk = 0, jumpMax = 0, hfSum = 0, hfN = 0, bigRoll = 0, bigPitch = 0;
  const hf = (x) => { const N = Math.min(x.length, 1200), xs = x.slice(0, N), m = xs.reduce((a, b) => a + b, 0) / N; let tot = 0, hi = 0; for (let k = 1; k < N / 2; k++) { const fr = (k * 60) / N; let re = 0, im = 0; for (let n = 0; n < N; n++) { const ang = (2 * Math.PI * k * n) / N, v = xs[n] - m; re += v * Math.cos(ang); im += v * Math.sin(ang); } const p = re * re + im * im; tot += p; if (fr > 8) hi += p; } return tot > 1e-18 ? hi / tot : null; };
  for (const s of full) {
    for (let i = 1; i < s.roll.length; i++) jumpMax = Math.max(jumpMax, Math.abs(s.roll[i] - s.roll[i - 1]) / DEG, Math.abs(s.pitch[i] - s.pitch[i - 1]) / DEG);
    if (Math.max(...s.roll.map((r) => Math.abs(r))) > 1 * DEG) bigRoll++; if (Math.max(...s.pitch.map((r) => Math.abs(r))) > 0.5 * DEG) bigPitch++;
    /* a sustained bend: the same sign of independent lateral acceleration, over 0.8 m/s^2, for a second and a half, then the roll over the last half second */
    for (let i = 120; i < s.roll.length; i += 60) {
      const win = s.kA.slice(i - 90, i).map((k, j) => k * s.v[i - 90 + j] ** 2);
      /* NOT NEAR A PATH'S END: the chord is one-sided there (it cannot read the next path), so for the last and first 12 m of a path it under-reads a bend that goes on across the seam: known, about one window in a thousand */
      const nearEnd = s.sPos.slice(i - 90, i).some((p, j) => p < 12 || p > s.len[i - 90 + j] - 12);
      /* AND NOT WHILE CHANGING LANE (or for 1.5 s after): a lane change's own lateral acceleration is added, and in a bend it can cancel the bend's (the two windows that failed a first version of this were exactly that) */
      const changing = s.lc.slice(i - 90 - 90, i).some(Boolean);
      if (!nearEnd && !changing && (win.every((a) => a > 0.8) || win.every((a) => a < -0.8))) { bends++; const mean = win.reduce((a, b) => a + b, 0) / win.length, rollNow = s.roll.slice(i - 30, i).reduce((a, b) => a + b, 0) / 30; if (mean > 0) bendsRight++; if (Math.sign(rollNow) === -Math.sign(mean) && Math.abs(rollNow) > 0.3 * DEG) signOk++; else badWin.push({ id: [...series.entries()].find(([, v]) => v === s)?.[0], i, mean: +mean.toFixed(2), rollDeg: +(rollNow / DEG).toFixed(2), f0: s.f0 }); }
    }
    /* a lane change on a straight: the roll follows the lateral acceleration of the move, opposite in sign (the lateral acceleration read here from the analytic lateralOf, independently of body.js) */
    for (let i = 60; i < s.roll.length; i++) if (s.lc2[i] !== 0 && Math.abs(s.kA[i] * s.v[i] ** 2) < 0.15) { lcN++; lcXY += s.roll[i] * s.lc2[i]; lcXX += s.roll[i] ** 2; lcYY += s.lc2[i] ** 2; }
    const h = hf(s.roll); if (h != null) { hfSum += h; hfN++; }
  }
  { const q = (x, f) => [...x].sort((a, b) => a - b)[Math.floor(f * (x.length - 1))], ar = full.flatMap((c) => c.roll.map((r) => Math.abs(r) / DEG)), ap = full.flatMap((c) => c.pitch.map((r) => Math.abs(r) / DEG));
    console.log(`       REPORTED (the magnitudes on the loop's traffic, over the top on purpose): |roll| p50 ${q(ar, 0.5).toFixed(2)}, p95 ${q(ar, 0.95).toFixed(2)}, max ${q(ar, 1).toFixed(1)} degrees; |pitch| p50 ${q(ap, 0.5).toFixed(2)}, p95 ${q(ap, 0.95).toFixed(2)}, max ${q(ap, 1).toFixed(1)}; before, both were exactly 0`); }
  check(full.length >= 20 && bigRoll >= 10 && bigPitch >= 10, `the case arose: ${full.length} cars drawn for 30 s of the loop's traffic; ${bigRoll} rolled by more than 1 degree and ${bigPitch} pitched by more than 0.5`);
  if (badWin.length) console.log("       the windows that failed:", JSON.stringify(badWin.slice(0, 4)));
  check(bends >= 10 && signOk === bends, `through a sustained bend (independent curvature over 0.8 m/s^2 for 1.5 s, not within 12 m of a path's end, not within 1.5 s of a lane change; the loop's bends are all right-hand, the left-hand direction is section 3's) the roll has the sign opposite to the turn and is over 0.3 degrees: ${signOk} of ${bends} windows (${bendsRight} of them right-hand)`);
  /* EACH KIND, THROUGH bodyOf: the same car in the same bend, drawn as a car, a truck and a bus, settles to a roll that is its row's gain times the lateral acceleration read independently of body.js (within 25%: the chord there is the path's, the reference's is not), and a truck and a bus lean further than a car */
  {
    const ww = snaps[600], cand = ww.actors.filter((a) => !a.player && !a.crash && !a.lc).map((a) => ({ a, g: Math.abs(kIndep(ww.course, a) * a.v * a.v) })).sort((x, y) => y.g - x.g)[0], aInd = kIndep(ww.course, cand.a) * cand.a.v ** 2;
    const settle = (kind) => { const m = newBody(); let b = null; for (let i = 0; i < 4 * 60; i++) { beginBodyFrame(m); b = bodyOf(m, { ...ww, t: ww.t }, { ...cand.a, kind, psi: undefined }, 0, FDT); endBodyFrame(m); } return b.roll; };
    const r = { car: settle("car"), truck: settle("truck"), bus: settle("bus") };
    const want = (k) => Math.max(-BODY[k].maxRoll, Math.min(BODY[k].maxRoll, -BODY[k].roll * aInd)) * DEG;
    /* AND THROUGH bodyOf, a planted car (fitted modifiers on the actor) reaches its lean sooner than an unmodified one in the same bend: the seam is wired, not only the function */
    const at03 = (mods) => { const m = newBody(); let b = null; for (let i = 0; i < 18; i++) { beginBodyFrame(m); b = bodyOf(m, { ...ww, t: ww.t }, { ...cand.a, kind: "car", psi: undefined, ...(mods ? { bodyMods: mods } : {}) }, 0, FDT); endBodyFrame(m); } return Math.abs(b.roll); };
    const tgt03 = Math.min(BODY.car.maxRoll, BODY.car.roll * Math.abs(aInd)) * DEG, err03 = (mods) => Math.abs(at03(mods) - tgt03);
    check(err03([{ hz: 1.5, zeta: 1.4 }]) < 0.5 * err03(null), `fitted on the car (a.bodyMods), a planted modifier is within ${(err03([{ hz: 1.5, zeta: 1.4 }]) / DEG).toFixed(2)} degrees of its steady lean after 0.3 s against ${(err03(null) / DEG).toFixed(2)} for the unmodified car: the seam is wired through bodyOf`);
    check(Math.abs(aInd) > 1 && ["car", "truck", "bus"].every((k) => Math.abs(r[k] - want(k)) < 0.25 * Math.abs(want(k))) && Math.abs(r.truck) > 1.2 * Math.abs(r.car) && Math.abs(r.bus) > 1.2 * Math.abs(r.car), `one car in a bend of ${aInd.toFixed(2)} m/s^2 settles to ${(r.car / DEG).toFixed(1)} degrees as a car, ${(r.truck / DEG).toFixed(1)} as a truck and ${(r.bus / DEG).toFixed(1)} as a bus (each within 25% of its row's gain times the independent lateral acceleration; the heavier ones lean further)`);
  }
  /* THE ROAD'S GRADIENT ON A REAL HILL (the test highway: low hills): a car on a sustained slope, read independently from the path's heights 9 m either side, settles to `slope` times the road's own angle, the nose up on the climb and down on the descent */
  {
    const hw = seedGraph(1, 50, loadMap(TEST_MAPS.find((m) => m.id === "test-highway").build()), { target: 120, posted: true }), gInd = (a) => { const L = hw.course.at[a.k ?? 0].layout.paths[a.route].length, s = Math.min(L - 9, Math.max(9, a.s)); return ((poseOnGraph(hw.course, a.k ?? 0, a.route, s + 9).z ?? 0) - (poseOnGraph(hw.course, a.k ?? 0, a.route, s - 9).z ?? 0)) / 18; };
    const cars = hw.actors.filter((a) => !a.player && !a.crash && !a.lc).map((a) => ({ a, g: gInd(a) })), climb = cars.filter((c) => c.g > 0.012).sort((x, y) => y.g - x.g)[0], drop = cars.filter((c) => c.g < -0.012).sort((x, y) => x.g - y.g)[0];
    const pitchOf = (c) => { const m = newBody(); let b = null; for (let i = 0; i < 4 * 60; i++) { beginBodyFrame(m); b = bodyOf(m, hw, { ...c.a, psi: undefined }, 0, FDT); endBodyFrame(m); } return b.pitch; };
    const pc = climb ? pitchOf(climb) : NaN, pd = drop ? pitchOf(drop) : NaN, wantC = climb ? BODY.car.slope * Math.atan(climb.g) : NaN, wantD = drop ? BODY.car.slope * Math.atan(drop.g) : NaN;
    check(!!climb && !!drop && pc > 0 && pd < 0 && Math.abs(pc - wantC) < 0.2 * Math.abs(wantC) && Math.abs(pd - wantD) < 0.2 * Math.abs(wantD), `on the test highway's hills a car on a ${climb ? (100 * climb.g).toFixed(1) : "?"}% climb settles to ${(pc / DEG).toFixed(2)} degrees nose-up and one on a ${drop ? (100 * -drop.g).toFixed(1) : "?"}% descent to ${(pd / DEG).toFixed(2)} nose-down (each within 20% of the table's slope times the road's own angle, the height read independently)`);
  }
  const lcR = lcXY / Math.sqrt(lcXX * lcYY || 1);
  check(lcN >= 300 && lcR < -0.3, `in a lane change on a straight the roll is opposite to the move's lateral acceleration: correlation ${lcR.toFixed(2)} over ${lcN} frames (zero would be no lean, +1 a lean the wrong way)`);
  check(jumpMax < JUMP_LIMIT, `[instrument: ${JUMP_LIMIT} degrees] no angle jumps between frames: the largest step of roll or pitch between two frames in ${full.length} cars is ${jumpMax.toFixed(3)} degrees`);
  check(hfN >= 20 && hfSum / hfN < HF_LIMIT, `[instrument: ${HF_LIMIT * 100}%] the roll is smooth: the share of its power above 8 Hz averages ${(100 * hfSum / Math.max(1, hfN)).toFixed(3)}% over ${hfN} cars`);
}

console.log("\n5. THE DRAWING");
{
  const at = { x: 10, y: -4, z: 2 }, box = { l: 4.5, w: 1.8, h: 0.75 }, deg = 33;
  /* the old arithmetic, written out independently: heading and grade only */
  const old = (u, v, w, grade) => { const a = deg * DEG, c = Math.cos(a), s = Math.sin(a), p = Math.atan(grade), fx = (u * box.l) / 2, fy = (v * box.w) / 2, fz = w * box.h; const px = fx * Math.cos(p) - fz * Math.sin(p), pz = fx * Math.sin(p) + fz * Math.cos(p); return [at.x + px * c - fy * s, at.y + px * s + fy * c, at.z + pz]; };
  const none = boxCorners(at, deg, 0.05, box), CORNERS = [[-1, -1, 0], [1, -1, 0], [1, 1, 0], [-1, 1, 0], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]];
  check(CORNERS.every((q, i) => old(...q, 0.05).every((x, j) => Math.abs(x - none[3 * i + j]) < 1e-12)), "with no body motion the box is exactly the old one (heading and grade only), at all eight corners");
  const zero = boxCorners(at, deg, 0.05, box, 0, { roll: 0, pitch: 0, pivot: 0.35, drop: 0 });
  check(none.every((x, i) => Math.abs(x - zero[i]) < 1e-12), "and a body at rest (roll 0, pitch 0) is the same box whatever the roll centre");
  const rolled = boxCorners(at, 0, 0, box, 0, { roll: 10 * DEG, pitch: 0, pivot: 0.35, drop: 0 });
  /* with heading 0 the box's right side is +y; the corner (u=1,v=+1,w=0) is index 2 and (1,-1,0) is index 1 */
  check(rolled[3 * 2 + 2] < rolled[3 * 1 + 2] - 0.1, `a positive roll puts the right side down: the right-hand base corner is ${(rolled[8] - at.z).toFixed(3)} m and the left-hand one ${(rolled[5] - at.z).toFixed(3)} m above the base`);
  const nose = boxCorners(at, 0, 0, box, 0, { roll: 0, pitch: 8 * DEG, pivot: 0.35, drop: 0 });
  check(nose[3 * 1 + 2] > nose[3 * 0 + 2] + 0.2, `a positive pitch raises the nose: the front base corner is ${(nose[5] - at.z).toFixed(3)} m and the rear one ${(nose[2] - at.z).toFixed(3)} m`);
  let worstSink = 0, worstGap = 0, n = 0;
  for (const [roll, pitch] of [[-14, 0], [14, 0], [0, -10], [0, 10], [9, -8], [-12, 10], [0, 0]]) for (const kind of ["car", "truck"]) {
    const bx = kind === "car" ? [[box, 0]] : [[{ l: 6.4, w: 2.55, h: 3.4, back: 1.2 }, 0], [{ l: 2.2, w: 2.45, h: 2.72, back: -3.4 }, 0]];
    const bm0 = { roll: roll * DEG, pitch: pitch * DEG, pivot: BODY[kind].pivot }, drop = dropFor(at, 20, 0, bm0, bx), bm = { ...bm0, drop };
    let low = Infinity; for (const [b, lift] of bx) { const c = boxCorners(at, 20, 0, b, lift, bm); for (let i = 0; i < 8; i++) low = Math.min(low, c[3 * i + 2] - at.z); }
    worstSink = Math.min(worstSink, low); worstGap = Math.max(worstGap, Math.abs(low)); n++;
  }
  check(worstSink > -1e-9 && worstGap < 1e-9, `after the drop the lowest point of every body rests exactly on the road, car and truck, ${n} leans up to the clamp (worst ${(worstSink * 1000).toFixed(6)} mm)`);
  const bm = { roll: -9 * DEG, pitch: 6 * DEG, pivot: 0.35, drop: 0.12 }, c = boxCorners(at, 57, 0, box, 0.3, bm), p = bodyPoint(at, 57, 0, bm, box.l / 2, box.w / 2, 0.3 + box.h);
  check(Math.hypot(c[3 * 6] - p.x, c[3 * 6 + 1] - p.y, c[3 * 6 + 2] - p.z) < 1e-12, "a lamp's point is placed by the SAME transform as the box's corner: the point (front, right, top) is that corner of the box to 1e-12 m, leaning");
  const unl = bodyPoint(at, 57, 0, null, 1.1, -0.7, 0.4), Hh = 57 * DEG;
  check(Math.abs(unl.x - (at.x + 1.1 * Math.cos(Hh) + 0.7 * Math.sin(Hh))) < 1e-12 && Math.abs(unl.y - (at.y + 1.1 * Math.sin(Hh) - 0.7 * Math.cos(Hh))) < 1e-12 && Math.abs(unl.z - (at.z + 0.4)) < 1e-12, "and with no body motion a lamp is where it always was: forward and right along the heading, up from the base");
}

console.log("\n6. MEMORY");
{
  const mem = newBody(), course = { at: [] };
  const world = (t) => ({ t, course });
  const car = (id, v) => ({ id, v, s: 0, route: null, k: 0, kind: "car" });
  beginBodyFrame(mem); bodyOf(mem, world(1), car(1, 20), 0, FDT); bodyOf(mem, world(1), car(2, 20), 0, FDT); endBodyFrame(mem);
  check(mem.cars.size === 2, "two cars drawn: two remembered");
  beginBodyFrame(mem); bodyOf(mem, world(1.05), car(1, 20), 0, FDT); endBodyFrame(mem);
  check(mem.cars.size === 1 && mem.cars.has(1), "one car no longer drawn: it is forgotten");
  for (let i = 0; i < 40; i++) { beginBodyFrame(mem); bodyOf(mem, world(1.05 + i * DT), car(1, 20 + i), 0, FDT); endBodyFrame(mem); }
  const wasPitch = Math.abs(mem.cars.get(1).pitch);
  beginBodyFrame(mem); const after = bodyOf(mem, world(0.2), car(1, 5), 0, FDT); endBodyFrame(mem);
  check(wasPitch > 2 * DEG && mem.cars.get(1).t === 0.2 && Math.abs(after.pitch) < 0.2 * wasPitch, `a world that restarts (its clock runs backwards) makes the id somebody else: the spring starts from rest (a pitch of ${(wasPitch / DEG).toFixed(1)} degrees before, ${(Math.abs(after.pitch) / DEG).toFixed(2)} after) and no acceleration is read across the restart`);
  const m2 = newBody(); beginBodyFrame(m2); bodyOf(m2, world(1), car(9, 0), 0, FDT); endBodyFrame(m2);
  beginBodyFrame(m2); const b = bodyOf(m2, world(1.05), car(9, 20), 0, 0.5); endBodyFrame(m2);
  check(Math.abs(b.pitch - targetsOf(BODY.car, 0, 20 / 0.05).pitch) < 1e-9, "a long gap between frames (a backgrounded tab) snaps exactly to the target and does not integrate a huge step");
  const wreck = newBody(); beginBodyFrame(wreck);
  check(bodyOf(wreck, world(1), { ...car(5, 10), crash: { t: 0 } }, 0, FDT) === null, "a wreck has no body motion");
}

console.log("\n7. WIRING");
{
  const src = fs.readFileSync(new URL("../src/apps/MapRoad.jsx", import.meta.url), "utf8"), draw = fs.readFileSync(new URL("../src/iso/draw.js", import.meta.url), "utf8"), settings = fs.readFileSync(new URL("../src/settings.js", import.meta.url), "utf8");
  check((src.match(/bodyOf\(body, w, a, carry, body\.dt\)/g) ?? []).length === 2, "MapRoad's actorsOf draws BOTH the player and the traffic through bodyOf (one function for everybody)");
  check(/export function actorsOf\(scene, carry, body = null\)/.test(src) && /beginBodyFrame\(body\)/.test(src) && /endBodyFrame\(body\)/.test(src), "and brackets the frame, so a car no longer drawn is forgotten");
  check((draw.match(/paintLamps\(ctx, view, a, at, deg, [^;]*?, bmx\)/g) ?? []).length === 3 && (draw.match(/function paintLamps\(.*bm = null\)/g) ?? []).length === 1, "every lamp call (car, truck, bus) passes the body to paintLamps");
  check(/resolveBody\(a\.kind, modsOf\(a\)\)/.test(fs.readFileSync(new URL("../src/iso/body.js", import.meta.url), "utf8")), "bodyOf reads its parameters ONLY through resolveBody (one function answers what a car's body parameters are)");
  check(/const T = frameOf\(deg, 0, bm\), spot = /.test(draw), "and the lamps' position goes through that body transform (frameOf, placeInto), not a copy of the heading arithmetic");
  check(/bodyMotion: true/.test(settings) && !/bodyMotion: false/.test(settings), "it ships ON (settings.js bodyMotion: true, Jay's phone look 13 November), and the debug chip still switches it off");
}

console.log(failed ? `\n${failed} FAILURE(S)` : "\nOK: every vehicle has a row, the spring behaves, the directions are right, a bend rolls the body the right way and smoothly, the drawing leans without sinking or leaving the lamps behind, and the screen draws everybody through the one function, on by default.");
process.exit(failed ? 1 : 0);
