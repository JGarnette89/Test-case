/* =====================================================================
   PAINTING THE ISOMETRIC WORLD ON A CANVAS.

   Canvas 2D rather than SVG, as SIMULATOR.md 5.2 decided: a city view is
   thousands of small polygons re-sorted every frame, which is not an SVG
   workload. Everything here is a "drawable" -- one depth key and one
   paint function -- collected, sorted by the key from project.js, and
   painted back to front. That single rule is what has to survive the
   overpass: a deck segment, a car under it, a car on it, the ground
   under all three, each small enough to have one honest key.

   CODE-DRAWN BOXES AT 32 HEADINGS, NOT SPRITES. Stage 0 draws a car as
   two boxes so the visual direction can be judged without an art
   pipeline -- and the heading is quantised to 32 steps on purpose, so
   what is on screen is what a 32-heading sprite set will give and not
   something smoother that sprites could never match. The boxes are drawn
   LEVEL by default for the same reason: a sprite set has no pitch, so a
   car on a hill will be a level sprite at the road's height, and that is
   what has to be judged. The tilt toggle exists to show what pitching
   would buy if the level look reads wrong.
   ===================================================================== */
import { depthOf, TOWARD_EYE, projector } from "./project.js";
import { poseAt, isDeck, LANE } from "./road.js";
import { C } from "../theme.js";

/* Light from high, behind-left of the viewer, so tops are bright and
   the two faces that show are a little darker than each other. */
const LIGHT = norm({ x: -0.9, y: 0.35, z: 0.9 });
function norm(v) { const l = Math.hypot(v.x, v.y, v.z) || 1; return { x: v.x / l, y: v.y / l, z: v.z / l }; }
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });

/* A colour shaded by how a face meets the light. `amt` is the share of
   full brightness kept in shadow. */
function shade(hex, n, amt = 0.55) {
  const lit = amt + (1 - amt) * Math.max(0, dot(norm(n), LIGHT));
  const v = parseInt(hex.slice(1), 16);
  const ch = [(v >> 16) & 255, (v >> 8) & 255, v & 255].map((c) => Math.round(c * lit));
  return `rgb(${ch[0]},${ch[1]},${ch[2]})`;
}

/* Blend two hex colours by t. */
function mix(h1, h2, t) {
  const a = parseInt(h1.slice(1), 16), b = parseInt(h2.slice(1), 16);
  const ch = [16, 8, 0].map((sh) => Math.round(((a >> sh) & 255) * (1 - t) + ((b >> sh) & 255) * t));
  return `#${((ch[0] << 16) | (ch[1] << 8) | ch[2]).toString(16).padStart(6, "0")}`;
}

const HEADINGS = 32;
const quantise = (deg) => Math.round(deg / (360 / HEADINGS)) * (360 / HEADINGS);

const BODY = { l: 4.5, w: 1.8, h: 0.75 };
const CABIN = { l: 2.3, w: 1.55, h: 0.62, back: 0.25 };
const CAR_COLOURS = [C.red, C.green, C.amber, C.blue, "#F2E8D5"];

/* The eight corners of a box centred at `at`, heading `deg`, pitched by
   `grade` (rise over run) about its lateral axis, resting on its base. */
function boxCorners(at, deg, grade, box, lift = 0) {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  const pitch = Math.atan(grade), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const out = [];
  for (const [u, v, w] of [[-1, -1, 0], [1, -1, 0], [1, 1, 0], [-1, 1, 0], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]]) {
    const fx = (u * box.l) / 2 - (box.back ?? 0), fy = (v * box.w) / 2, fz = lift + w * box.h;
    /* pitch about the lateral axis: forward rises with the grade */
    const px = fx * cp - fz * sp, pz = fx * sp + fz * cp;
    out.push({ x: at.x + px * c - fy * s, y: at.y + px * s + fy * c, z: at.z + pz });
  }
  return out;
}
/* Faces as corner indices, wound so the normal points outward. */
const FACES = [[4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];

function paintBox(ctx, P, corners, colour) {
  const faces = [];
  for (const f of FACES) {
    const p0 = corners[f[0]], p1 = corners[f[1]], p2 = corners[f[2]];
    const n = cross(sub(p1, p0), sub(p2, p0));
    if (dot(n, TOWARD_EYE) <= 0) continue;
    const cx = f.reduce((t, i) => t + corners[i].x, 0) / 4, cy = f.reduce((t, i) => t + corners[i].y, 0) / 4, cz = f.reduce((t, i) => t + corners[i].z, 0) / 4;
    faces.push({ key: depthOf(cx, cy, cz), f, n });
  }
  faces.sort((a, b) => a.key - b.key);
  for (const { f, n } of faces) {
    ctx.beginPath();
    for (let i = 0; i < 4; i++) { const [px, py] = P(corners[f[i]].x, corners[f[i]].y, corners[f[i]].z); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
    ctx.closePath();
    ctx.fillStyle = shade(colour, n);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.55)"; ctx.lineWidth = 1; ctx.stroke();
  }
}

function quad(ctx, P, a, b, c, d) {
  ctx.beginPath();
  let p = P(a.x, a.y, a.z); ctx.moveTo(p[0], p[1]);
  p = P(b.x, b.y, b.z); ctx.lineTo(p[0], p[1]);
  p = P(c.x, c.y, c.z); ctx.lineTo(p[0], p[1]);
  p = P(d.x, d.y, d.z); ctx.lineTo(p[0], p[1]);
  ctx.closePath();
}
function seg(ctx, P, a, b) {
  const p = P(a.x, a.y, a.z), q = P(b.x, b.y, b.z);
  ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
}

/* =====================================================================
   ONE FRAME.

   `scene` is { roads: [{ road, cars: [{ s, v, weave, id, dir }] }],
   terrain, cam, k, tilt } -- positions in metres, from the sim, with `s`
   already carried forward by the time since the last tick so motion is
   smooth at the display's rate rather than at the sim's.
   ===================================================================== */
export function drawFrame(ctx, canvas, scene) {
  const { roads, terrain, cam, k, tilt } = scene;
  const P = projector(k, cam, canvas);
  const margin = 40 * k;
  const onScreen = ([px, py]) => px > -margin && px < canvas.w + margin && py > -margin && py < canvas.h + margin;
  const items = [];

  ctx.fillStyle = "#1b1e23";
  ctx.fillRect(0, 0, canvas.w, canvas.h);

  /* The ground, culled to the view. Slightly lighter where it faces the
     light so the hill's shape is visible as shape and not only as a road
     that climbs. */
  for (const cell of terrain) {
    const [a, b, c, d] = cell;
    if (!onScreen(P(a.x, a.y, a.z)) && !onScreen(P(c.x, c.y, c.z))) continue;
    const n = cross(sub(b, a), sub(d, a));
    /* KEYED BY ITS FARTHEST CORNER. Ground cells are big and the road
       lies on them, so a cell keyed by its centre could land after a
       road segment it overlaps and paint the grass over the tarmac --
       which is what the first frame did. Keyed by the far corner a cell
       only follows things that are wholly nearer than all of it. */
    const key = Math.min(depthOf(a.x, a.y, a.z), depthOf(b.x, b.y, b.z), depthOf(c.x, c.y, c.z), depthOf(d.x, d.y, d.z));
    /* Height reads two ways at once: slopes facing the light are
       brighter, and the ground pales as it rises, the way a map tints
       its contours. A ten-metre hill on a flat colour is invisible. */
    const zc = (a.z + b.z + c.z + d.z) / 4;
    const tone = mix(C.grass, "#9fb86a", Math.min(1, zc / 14));
    items.push({ key, paint: () => { quad(ctx, P, a, b, c, d); ctx.fillStyle = shade(tone, n, 0.35); ctx.fill(); ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 0.5; ctx.stroke(); } });
  }

  for (const { road } of roads) {
    const { pts, left, right } = road;
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = left[i], b = left[i + 1], c = right[i + 1], d = right[i];
      if (!onScreen(P(a.x, a.y, a.z)) && !onScreen(P(c.x, c.y, c.z))) continue;
      /* KEYED BY ITS NEAREST CORNER, the mirror of the ground's rule:
         a segment follows every cell that reaches under it. */
      const key = Math.max(depthOf(a.x, a.y, a.z), depthOf(b.x, b.y, b.z), depthOf(c.x, c.y, c.z), depthOf(d.x, d.y, d.z)) + 0.01;
      const n = cross(sub(b, a), sub(d, a));
      const deck = isDeck(road, i) && isDeck(road, i + 1);
      items.push({ key, paint: () => {
        if (deck) {
          /* The slab: its outer sides, a metre deep, so the deck reads as
             a thing with thickness standing in the air rather than a
             ribbon floating. */
          const drop = (p) => ({ ...p, z: p.z - 1.0 });
          for (const [e0, e1, out] of [[a, b, -1], [d, c, 1]]) {
            quad(ctx, P, e0, e1, drop(e1), drop(e0));
            const t = sub(e1, e0);
            ctx.fillStyle = shade("#3b3f47", { x: -t.y * out, y: t.x * out, z: 0 }, 0.45); ctx.fill();
          }
        }
        quad(ctx, P, a, b, c, d);
        ctx.fillStyle = shade(C.asphalt, n, 0.45); ctx.fill();
        ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 0.6; ctx.stroke();   // hide the hairline between segments
        ctx.lineWidth = Math.max(1, 0.15 * k);
        ctx.strokeStyle = "rgba(250,250,242,0.8)";
        seg(ctx, P, a, b); seg(ctx, P, d, c);
        if (i % 3 !== 2) { ctx.strokeStyle = C.yellow; seg(ctx, P, pts[i], pts[i + 1]); }
      } });
      /* Piers at the ends of the span, so the deck visibly stands on
         something -- and only at the ends, because the road it crosses
         runs under the middle. */
      const spanEnd = deck && (!(isDeck(road, i - 1) && i > 0) || !(i + 2 < pts.length && isDeck(road, i + 2)));
      if (spanEnd) {
        const ground = { x: pts[i].x, y: pts[i].y, z: 0 };
        for (const side of [left, right]) {
          const top = { x: side[i].x * 0.85 + pts[i].x * 0.15, y: side[i].y * 0.85 + pts[i].y * 0.15, z: pts[i].z - 1.0 };
          const foot = { x: top.x, y: top.y, z: ground.z };
          const pier = boxCorners({ x: top.x, y: top.y, z: foot.z }, 0, 0, { l: 1.2, w: 1.2, h: top.z - foot.z });
          items.push({ key: depthOf(top.x, top.y, foot.z) + 4, paint: () => paintBox(ctx, P, pier, "#8a8d93") });
        }
      }
    }
  }

  for (const { road, cars } of roads) {
    for (const car of cars) {
      const along = car.dir > 0 ? car.s : road.length - car.s;
      const p = poseAt(road, along);
      const heading = car.dir > 0 ? p.heading : p.heading + 180;
      /* Right of travel in plan, y down: (-sin, cos) of the heading. */
      const h = (heading * Math.PI) / 180;
      const off = LANE / 2 + (car.weave ?? 0);
      const at = { x: p.x - Math.sin(h) * off, y: p.y + Math.cos(h) * off, z: p.z };
      const deg = quantise(heading);
      const grade = tilt ? (car.dir > 0 ? p.grade : -p.grade) : 0;
      const colour = car.colour ?? CAR_COLOURS[car.n % CAR_COLOURS.length];
      const body = boxCorners(at, deg, grade, BODY);
      const cabin = boxCorners(at, deg, grade, CABIN, BODY.h);
      const [px, py] = P(at.x, at.y, at.z);
      if (px < -margin || px > canvas.w + margin || py < -margin || py > canvas.h + margin) continue;
      /* A car follows the segment it stands on, whose key is that
         segment's nearest corner -- up to a car length and a road width
         nearer than the car's own centre -- so the car's key is pushed
         past that. A deck overlapping the car on screen is further still
         (project.js), so it still paints after. */
      items.push({ key: depthOf(at.x, at.y, at.z) + 10, paint: () => { paintBox(ctx, P, body, colour); paintBox(ctx, P, cabin, colour); } });
    }
  }

  items.sort((a, b) => a.key - b.key);
  for (const it of items) it.paint();
  return items.length;
}
