/* =====================================================================
   THE BEND, MEASURED ONCE ACROSS THE RANGE.

   Every number REBUILD.md 8.2 and DECISIONS.md 5.15.17-18 quote about the
   curved road comes from this script, kept so the numbers can be
   produced again -- the first bend measurement was run inline, its
   script was not kept, and its table could not be reproduced when the
   bend came to be built (CLAUDE.md, cold-start item 8). Run it with
   `node tools/measure/bend.mjs`; it answers several questions in one run
   rather than one per run:

     1. the bow at each road speed: amplitude, tightest radius, extra
        length, and what a driver at that speed feels sideways
     2. what `alongDir`'s straight-lane projection gets wrong across a
        seam, as a function of the true following gap
     3. how far off their line each profile strays on a straight and on
        a bend, and how much of it is the wide line
     4. traffic on a course with every link bent: overlaps, and the
        wide-line showings per driver

   Not a check. `verify-course.mjs` sections 10 and 11 assert the
   properties; this reports the quantities behind them.
   ===================================================================== */
import {
  seedCourse, step, overlapping, strayOf, wideAt, TWO_WAY, DT, CAR, radiusFor,
} from "../../src/sim/crossing.js";
import { withCandidates, keepDriving, PROFILES } from "../../src/sim/candidate.js";
import { noticing } from "../../src/sim/marking.js";
import { poseOn, alongDir, dirOut, roadsOf, seamsOf, LATERAL } from "../../src/sim/course.js";
import { tightestOf, intersectionFor } from "../../src/sim/intersection.js";

const SECONDS = Number(process.argv[2] ?? 300);
const SEED = Number(process.argv[3] ?? 4);
const f = (x, n = 2) => x.toFixed(n);

console.log(`\n1. THE BOW, per road speed (lateral ${f(LATERAL)} m/s^2 = 0.15 g)`);
for (const kmh of [40, 50, 60, 80, 100]) {
  const w = seedCourse(1, kmh, { every: 5, control: TWO_WAY, cols: 2, rows: 1, bends: 1 });
  const place = w.course.at[0].layout.place;
  const A = Math.abs(w.course.links[0].bend);
  const straight = place.reach - place.lineAt;
  const path = w.course.at[0].layout.paths["W/straight"];
  const extra = path.length - 2 * place.reach;
  const v = kmh / 3.6;
  console.log(`   ${String(kmh).padStart(3)} km/h: reach ${f(place.reach, 0)}m, bow ${f(A, 1)}m, tightest ${f(tightestOf(place.reach, place.lineAt, A), 0)}m (asked ${f(radiusFor(v), 0)}), `
    + `+${f(extra, 1)}m over ${f(2 * straight, 0)}m of leg, ${f((v * v) / radiusFor(v), 2)} m/s^2 at the limit, ${f((1.35 * v) ** 2 / radiusFor(v), 2)} for the boldest`);
}

console.log(`\n2. ALONGDIR ACROSS A SEAM: what the straight-lane projection reads for a true gap`);
{
  const w = seedCourse(1, 60, { every: 5, control: TWO_WAY, cols: 2, rows: 1, bends: 1 });
  const c = w.course;
  const out = c.at[0].layout.paths["W/straight"];
  const dir = dirOut("E");
  /* Follower on intersection 0's exit at `back` metres short of the seam,
     leader on intersection 1's approach `gap` metres past it, measured
     by arc length; what the projection makes of it. */
  console.log("   true gap ->  projected, for the follower this far short of the seam:");
  for (const gap of [8, 15, 30, 60, 120, 200]) {
    const row = [];
    for (const back of [4, 20, 60, 150, 250]) {
      const me = poseOn(c, 0, "W/straight", out.length - back);
      const ahead = gap - back;
      const them = ahead >= 0 ? poseOn(c, 1, "W/straight", ahead) : poseOn(c, 0, "W/straight", out.length - back + gap);
      const read = alongDir(them, dir) - alongDir(me, dir);
      row.push(`${f(read, 2)}`.padStart(7));
    }
    console.log(`   ${String(gap).padStart(5)}m -> ${row.join("")}   (follower ${[4, 20, 60, 150, 250].join("/")}m short)`);
  }
  const seams = seamsOf(c);
  console.log(`   seams with every link bent: worst apart ${Math.max(...seams.map((s) => s.apart)).toExponential(1)}m, worst turned ${Math.max(...seams.map((s) => s.turned)).toExponential(1)} deg`);
}

console.log(`\n3. STRAY FROM THE LINE, per profile, straight against bent (${SECONDS}s, seed ${SEED})`);
const drive = (profile, bends) => {
  let w = withCandidates(
    seedCourse(SEED, 60, { every: 3.0, control: TWO_WAY, cols: 3, rows: 2, bends }),
    [{ id: "X", profile }],
  );
  let worst = 0, worstWide = 0, hits = 0, ticks = 0, over = 0;
  for (let i = 0; i < Math.round(SECONDS / DT); i++) {
    w = noticing(keepDriving(step(w)));
    hits += overlapping(w).length;
    const a = w.actors.find((x) => x.candidate === "X");
    if (!a) continue;
    ticks++;
    const s = Math.abs(strayOf(w, a));
    worst = Math.max(worst, s);
    worstWide = Math.max(worstWide, wideAt(w, a));
    if (s > 0.45) over++;
  }
  const faults = {};
  for (const x of w.faults ?? []) faults[x.trait] = (faults[x.trait] ?? 0) + 1;
  const showings = (w.faults ?? []).filter((x) => x.trait === "wideLine");
  return { worst, worstWide, hits, faults, showings, share: ticks ? over / ticks : 0 };
};
console.log("   profile      straight: worst stray | bent: worst stray, of it wide, share of ticks over the floor, showings (mean length) | overlaps");
for (const p of PROFILES) {
  const s = drive(p.id, 0), b = drive(p.id, 1);
  const mean = b.showings.length ? b.showings.reduce((t, x) => t + ((x.to ?? x.over) - x.from), 0) / b.showings.length : 0;
  console.log(`   ${p.id.padEnd(11)} ${f(s.worst, 3)}m | ${f(b.worst, 3)}m, ${f(b.worstWide, 3)}m, ${f(100 * b.share, 1)}%, ${b.showings.length} (${f(mean, 1)}s) | ${s.hits + b.hits}`);
}

console.log(`\n4. THE ROAD CONTAINS EVERY PATH: worst distance from any path sample to its road's axis, less half a lane`);
{
  const w = seedCourse(SEED, 60, { every: 3.0, control: TWO_WAY, cols: 3, rows: 2, bends: 1 });
  const roads = roadsOf(w.course);
  const half = intersectionFor().lane;    // the road is two lanes wide: half of it is one lane
  let worst = -Infinity;
  const distToPoly = (p, pts) => {
    let best = Infinity;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], vx = b.x - a.x, vy = b.y - a.y;
      const L = vx * vx + vy * vy || 1;
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / L));
      best = Math.min(best, Math.hypot(p.x - (a.x + vx * t), p.y - (a.y + vy * t)));
    }
    return best;
  };
  /* Two regions, because they answer two different questions. The LEGS
     -- beyond the stop lines -- are what the bend changed and what the
     stroke has to contain. The CORNERS are the turn arcs, whose radius is
     the open question in DECISIONS.md 5.15.12: a 3.85m right turn passes
     0.95m outside the curb corner, so a car weaving to the right clips it
     by a few centimetres. That was true before the road bent and it is
     reported here so nobody reads it as the bend's doing. */
  let corner = -Infinity;
  for (const spot of w.course.at) {
    const { lineAt, boxHalf } = spot.layout.place;
    for (const [key, path] of Object.entries(spot.layout.paths)) {
      for (let s = 0; s <= path.length; s += 2) {
        const p = poseOn(w.course, spot.k, key, s);
        const dx = Math.abs(p.x - spot.at.x), dy = Math.abs(p.y - spot.at.y);
        if (dx < boxHalf && dy < boxHalf) continue;
        const d = Math.min(...roads.map((r) => distToPoly(p, r.pts)));
        const over = d + CAR.width / 2 + 0.45 - half;   // a car at full stray, beyond the tarmac?
        if (Math.max(dx, dy) >= lineAt) worst = Math.max(worst, over);
        else corner = Math.max(corner, over);
      }
    }
  }
  console.log(`   on the legs, beyond the stop lines: ${f(worst, 3)}m (negative is inside the drawn road)`);
  console.log(`   at the corners, on the turn arcs:   ${f(corner, 3)}m -- the right turn's radius, DECISIONS.md 5.15.12, not the bend`);
}
console.log();
