/* =====================================================================
   PAINTING THE ISOMETRIC WORLD ON A CANVAS.

   Canvas 2D rather than SVG, as SIMULATOR.md 5.2 decided: a city view is
   thousands of small polygons re-sorted every frame, which is not an SVG
   workload. Everything here is a "drawable" -- one depth key and one
   paint function -- collected, sorted by the key from project.js, and
   painted back to front, IN TWO LAYERS: the floor (ground, roads at
   ground level, junction surfaces), which nothing standing on it can
   be hidden by; then everything with height, decks included, each
   small enough to have one honest key. That is what has to survive the
   overpass: a deck piece, a car under it, a car on it, the ground under
   all three. verify-paint.mjs sweeps it at every rotation.

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
import { viewOf } from "./project.js";
import { lightAt, arrowAt } from "../sim/signal.js";
import { poseAt, groundAt as stage0Ground, LANE } from "./road.js";
import { C } from "../theme.js";

/* Below this many pixels a metre the view is FAR (drawFrame): the whole
   city at once, drawn simply: a car is then under seven pixels long. */
export const LOD_K = 1.5;
/* Below this the road's paint, signs and arrows are too small to read and
   the ground is one quad: roads are drawn as ribbons (drawFrame, `flat`). */
export const FLAT_K = 2.5;
const CAR_LEN = 4.5;

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
/* A signal's lenses: the lit one, and the same colour asleep. Dark
   enough to read as off at a glance and light enough that the head
   still reads as three lenses rather than a black slab. */
const LENS = { red: "#e4483c", amber: "#f2b84b", green: "#4fd07a" };
const DARK = { red: "#4a2622", amber: "#4a3d22", green: "#22402e" };
const CABIN = { l: 2.3, w: 1.55, h: 0.62, back: 0.25 };
const CAR_COLOURS = [C.red, C.green, C.amber, C.blue, "#F2E8D5"];
const PED_COLOURS = ["#3a6fd8", "#d85a3a", "#2e9a5a", "#9a4fd0", "#d8b43a"];

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

function paintBox(ctx, view, corners, colour) {
  const P = view.P;
  const faces = [];
  for (const f of FACES) {
    const p0 = corners[f[0]], p1 = corners[f[1]], p2 = corners[f[2]];
    const n = cross(sub(p1, p0), sub(p2, p0));
    if (dot(n, view.eye) <= 0) continue;
    const cx = f.reduce((t, i) => t + corners[i].x, 0) / 4, cy = f.reduce((t, i) => t + corners[i].y, 0) / 4, cz = f.reduce((t, i) => t + corners[i].z, 0) / 4;
    faces.push({ key: view.key(cx, cy, cz), f, n });
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
export function drawFrame(ctx, canvas, scene, { audit = false } = {}) {
  const { roads, terrain, cam, k, tilt, props = [], actors = [], junctions = [] } = scene;
  /* THE GROUND IS THE SCENE'S, not stage 0's hill: a map supplies its
     own (flat, for now), and a deck is wherever a road stands more than
     a metre above whatever ground the scene has. */
  const groundAt = scene.groundAt ?? stage0Ground;
  /* A DECK IS DECLARED, NOT INFERRED FROM HEIGHT. A loaded map says
     which points of which road span another (load.js), which is the
     quantity that actually matters; height above the ground was a
     proxy for it, and it read a road CLIMBING a hill as a bridge in
     the air the moment the land under it was flat. Roads that carry no
     declaration -- anything hand-built rather than loaded -- keep the
     height test. */
  const isDeck = (road, i) => (typeof road.pts[i].bridge === "boolean" ? road.pts[i].bridge : road.pts[i].z - groundAt(road.pts[i].x, road.pts[i].y) > 1.0);
  const counts = { cells: 0, segments: 0, cars: 0, props: 0 };
  /* The view: rotated by `scene.rot` degrees about the camera when a
     chase camera asks for it, and the depth key with it. */
  const view = viewOf(k, cam, scene.rot ?? 0, canvas, { centreY: scene.centreY ?? 0.55 });
  const P = view.P, depthOf = view.key;
  const rotDeg = scene.rot ?? 0;
  const margin = 40 * k;
  const onScreen = ([px, py]) => px > -margin && px < canvas.w + margin && py > -margin && py < canvas.h + margin;
  const items = [];
  /* FAR: THE WHOLE CITY AT ONCE (the free camera, iso/freecam.js). Below
     LOD_K a lane is under three pixels, and drawing a car as two shaded
     boxes, a road's paint, a sign's post or a flat cell of grass buys
     nothing anybody can see -- measured, the whole stand-in city was
     297,000 canvas calls and 38 ms of script a frame on a desktop
     (tools/measure/freecam-perf.mjs). So a car is one dot in its colour,
     markings and signs are left out, a road is one filled ribbon, a
     building its roof, and flat grass one quad under the lot. Nothing's
     depth key changes, so the painter's order is the one verify-paint
     holds at every zoom. Never a zoom cap: seeing the whole city is the
     point. */
  const far = k < LOD_K, flat = k < FLAT_K;
  if (flat && terrain.length) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const c of terrain) for (const q of c) { x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y); }
    const g = [{ x: x0, y: y0, z: 0 }, { x: x1, y: y0, z: 0 }, { x: x1, y: y1, z: 0 }, { x: x0, y: y1, z: 0 }];
    items.push({ layer: 0, key: -Infinity, tag: audit && { kind: "cell", poly: g }, paint: () => { quad(ctx, P, g[0], g[1], g[2], g[3]); ctx.fillStyle = shade(C.grass, { x: 0, y: 0, z: 1 }, 0.35); ctx.fill(); } });
  }

  ctx.fillStyle = "#1b1e23";
  ctx.fillRect(0, 0, canvas.w, canvas.h);

  /* The ground, culled to the view. Slightly lighter where it faces the
     light so the hill's shape is visible as shape and not only as a road
     that climbs. */
  for (const cell of terrain) {
    const [a, b, c, d] = cell;
    if (flat && Math.abs(a.z) < 0.05 && Math.abs(b.z) < 0.05 && Math.abs(c.z) < 0.05 && Math.abs(d.z) < 0.05) continue;   // flat: the quad under the lot
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
    counts.cells++;
    items.push({ layer: 0, key, tag: audit && { kind: "cell", poly: [a, b, c, d] }, paint: () => { quad(ctx, P, a, b, c, d); ctx.fillStyle = shade(tone, n, 0.35); ctx.fill(); ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 0.5; ctx.stroke(); } });
  }

  /* THE FLOOR IS ITS OWN LAYER (22 September). The maintainer: "traffic
     disappears under the intersections and occasionally under the road
     while traveling." Every car used to carry a fixed pad of 10 past its
     own centre so it would sort after the segment it stood on, whose
     key is that segment's nearest corner. The pad was sized, without
     anybody saying so, for a 7.2 m road: a two-lane road across the
     view puts its nearest corner 10.2 key units past a car in its
     middle, a junction surface 20 or more, and the sort put the car
     first and the tarmac over it. Measured before the fix in
     verify-paint.mjs: 706 misdrawn car-frames in 96, and 46 of them at
     the fixed view, so the camera's rotation was not the cause, only
     the thing that made every orientation happen. A bigger pad would
     break at the next width.

     So: a flat surface at ground level can never hide a thing standing
     on or above it, whatever its size, and it is painted first. Ground
     cells, ground-level road segments and junction surfaces are layer
     0, sorted among themselves by the rules that keep tarmac over grass
     and the box over the ribbons; everything with height -- cars,
     signs, props, piers, and DECKS, which can hide what is under them
     -- is layer 1, sorted by depth. A deck is cut into pieces no wider
     than a lane and half a segment long, so its nearest corner is never
     far from a car on it, and a car on a deck is keyed past the widest
     piece's own key span, measured from the pieces as built rather than
     typed. A car under a deck needs nothing: the piece over it is a
     deck's height further into the screen by construction. */
  const lerp = (p, q, t) => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t, z: p.z + (q.z - p.z) * t });
  let deckSpan = 0;   // the largest key span of any deck piece in view: how far past its centre a car on a deck must be keyed
  for (const { road } of roads) {
    const { pts, left, right } = road;
    /* FAR: each ground-level stretch of road is ONE ribbon, its points
       thinned to about two pixels apart -- seven canvas calls a segment
       was most of the whole city's frame. Markings are not drawn this far
       out, so where two ribbons meet at a junction the tarmac is one
       colour whichever lands on top; decks keep their pieces below. */
    if (flat) {
      const stride = Math.max(1, Math.floor(2 / (k * Math.max(0.5, (road.at?.[1] ?? 5) - (road.at?.[0] ?? 0)))));
      let run = [];
      const flush = () => {
        if (run.length < 2) { run = []; return; }
        const L = run.map((i) => left[i]), R = run.map((i) => right[i]).reverse();
        const poly = [...L, ...R];
        if (poly.some((q) => onScreen(P(q.x, q.y, q.z)))) {
          const key = Math.max(...poly.map((q) => depthOf(q.x, q.y, q.z))) + 0.01;
          counts.segments += run.length - 1;
          items.push({ layer: 0, key, tag: audit && { kind: "road", id: `${road.id}@far`, poly }, paint: () => {
            ctx.beginPath();
            poly.forEach((q, j) => { const [x, y] = P(q.x, q.y, q.z); if (j) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
            ctx.closePath(); ctx.fillStyle = shade(C.asphalt, { x: 0, y: 0, z: 1 }, 0.45); ctx.fill();
          } });
        }
        run = [];
      };
      for (let i = 0; i < pts.length; i++) {
        const deckHere = i + 1 < pts.length && isDeck(road, i) && isDeck(road, i + 1);
        if (deckHere) { run.push(i); flush(); continue; }
        if (i % stride === 0 || i === pts.length - 1 || (i + 1 < pts.length && isDeck(road, i + 1))) run.push(i);
      }
      flush();
    }
    for (let i = 0; i + 1 < pts.length; i++) {
      if (flat && !(isDeck(road, i) && isDeck(road, i + 1))) continue;   // drawn above as a ribbon
      const a = left[i], b = left[i + 1], c = right[i + 1], d = right[i];
      if (!onScreen(P(a.x, a.y, a.z)) && !onScreen(P(c.x, c.y, c.z))) continue;
      const n = cross(sub(b, a), sub(d, a));
      const deck = isDeck(road, i) && isDeck(road, i + 1);
      counts.segments++;
      /* The paint on the segment: its edges, the centre line with its
         gaps, and the lines between lanes going the same way. */
      const lines = () => {
        ctx.lineWidth = Math.max(1, 0.15 * k);
        ctx.strokeStyle = "rgba(250,250,242,0.8)";
        seg(ctx, P, a, b); seg(ctx, P, d, c);
        /* THE CENTRE LINE SAYS WHAT KIND OF ROAD THIS IS, the way it does
           on a real one: an arterial carries a solid double yellow, a
           collector the broken single, a residential street nothing at
           all. The cheapest of the cues that make three roads feel like
           three kinds of place (SIMULATOR.md 1.1.10). */
        /* Where a turn bay opens the median, the line moves to its far
           side (map/bays.js `centre`); elsewhere it is the centreline. */
        const mid = road.centre ?? pts;
        if (road.kind === "arterial" || road.kind === "highway") {
          const p0 = mid[i], p1 = mid[i + 1], len = Math.hypot(p1.x - p0.x, p1.y - p0.y) || 1;
          const ox = (-(p1.y - p0.y) / len) * 0.14, oy = ((p1.x - p0.x) / len) * 0.14;
          ctx.strokeStyle = C.yellow;
          for (const s of [-1, 1]) seg(ctx, P, { x: p0.x + s * ox, y: p0.y + s * oy, z: p0.z }, { x: p1.x + s * ox, y: p1.y + s * oy, z: p1.z });
        } else if (road.kind !== "residential" && i % 3 !== 2) { ctx.strokeStyle = C.yellow; seg(ctx, P, mid[i], mid[i + 1]); }
        /* A null point is a stretch where the lanes either side are not
           yet apart -- a bay lying on its neighbour before its taper. */
        if (road.laneLines && i % 2 === 0) { ctx.strokeStyle = "rgba(250,250,242,0.75)"; for (const line of road.laneLines) if (line[i] && line[i + 1]) seg(ctx, P, line[i], line[i + 1]); }
      };
      const fill = (p, q, r, s) => {
        quad(ctx, P, p, q, r, s);
        ctx.fillStyle = shade(C.asphalt, n, 0.45); ctx.fill();
        if (!flat) { ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 0.6; ctx.stroke(); }   // hide the hairline between pieces
      };
      if (!deck) {
        /* KEYED BY ITS NEAREST CORNER, the mirror of the ground's rule:
           a segment follows every cell that reaches under it. */
        const key = Math.max(depthOf(a.x, a.y, a.z), depthOf(b.x, b.y, b.z), depthOf(c.x, c.y, c.z), depthOf(d.x, d.y, d.z)) + 0.01;
        items.push({ layer: 0, key, tag: audit && { kind: "road", id: `${road.id}#${i}`, poly: [a, b, c, d] }, paint: () => { fill(a, b, c, d); if (!flat) lines(); } });
      } else {
        const across = Math.max(1, Math.round(Math.hypot(d.x - a.x, d.y - a.y) / LANE));
        const pieces = [];
        for (let s = 0; s < across; s++) for (let h = 0; h < 2; h++) {
          const L0 = lerp(a, b, h / 2), L1 = lerp(a, b, (h + 1) / 2), R0 = lerp(d, c, h / 2), R1 = lerp(d, c, (h + 1) / 2);
          const pa = lerp(L0, R0, s / across), pb = lerp(L1, R1, s / across), pc = lerp(L1, R1, (s + 1) / across), pd = lerp(L0, R0, (s + 1) / across);
          const keys = [pa, pb, pc, pd].map((p) => depthOf(p.x, p.y, p.z));
          pieces.push({ pa, pb, pc, pd, key: Math.max(...keys) + 0.01, span: Math.max(...keys) - Math.min(...keys), outerL: s === 0, outerR: s === across - 1 });
        }
        for (const p of pieces) deckSpan = Math.max(deckSpan, p.span);
        const last = pieces.reduce((m, p) => (p.key > m.key ? p : m), pieces[0]);
        for (const p of pieces) {
          items.push({ layer: 1, key: p.key, tag: audit && { kind: "deck", id: `${road.id}#${i}`, poly: [p.pa, p.pb, p.pc, p.pd] }, paint: () => {
            /* The slab: its outer sides, a metre deep, so the deck reads as
               a thing with thickness standing in the air rather than a
               ribbon floating. */
            const drop = (q) => ({ ...q, z: q.z - 1.0 });
            for (const [e0, e1, out] of [...(p.outerL ? [[p.pa, p.pb, -1]] : []), ...(p.outerR ? [[p.pd, p.pc, 1]] : [])]) {
              quad(ctx, P, e0, e1, drop(e1), drop(e0));
              const t = sub(e1, e0);
              ctx.fillStyle = shade("#3b3f47", { x: -t.y * out, y: t.x * out, z: 0 }, 0.45); ctx.fill();
            }
            fill(p.pa, p.pb, p.pc, p.pd);
            if (p === last) lines();
          } });
        }
        /* Piers at the ends of the span, so the deck visibly stands on
           something -- and only at the ends, because the road it crosses
           runs under the middle. */
        const spanEnd = !(isDeck(road, i - 1) && i > 0) || !(i + 2 < pts.length && isDeck(road, i + 2));
        if (spanEnd) {
          const ground = { x: pts[i].x, y: pts[i].y, z: 0 };
          for (const side of [left, right]) {
            const top = { x: side[i].x * 0.85 + pts[i].x * 0.15, y: side[i].y * 0.85 + pts[i].y * 0.15, z: pts[i].z - 1.0 };
            const foot = { x: top.x, y: top.y, z: ground.z };
            const pier = boxCorners({ x: top.x, y: top.y, z: foot.z }, 0, 0, { l: 1.2, w: 1.2, h: top.z - foot.z });
            items.push({ layer: 1, key: depthOf(top.x, top.y, foot.z) + 0.01, tag: audit && { kind: "pier", at: foot }, paint: () => paintBox(ctx, view, pier, "#8a8d93") });
          }
        }
      }
    }
  }

  /* JUNCTIONS: the surface where legs meet, painted over the ribbons
     that run into the node so their centre lines stop at the box; the
     stop lines where the sim holds a car; a sign beside each. Keyed a
     hair past the nearest of its corners, which is past every ribbon
     segment under it. */
  for (const j of junctions) {
    if (!j.surface.length || !onScreen(P(j.at.x, j.at.y, j.at.z ?? 0))) continue;
    const key = Math.max(...j.surface.map((p) => depthOf(p.x, p.y, p.z ?? 0))) + 0.05;
    counts.segments++;
    items.push({ layer: 0, key, tag: audit && { kind: "junction", id: j.node, poly: j.surface.map((p) => ({ x: p.x, y: p.y, z: p.z ?? 0 })) }, paint: () => {
      ctx.beginPath();
      j.surface.forEach((p, i) => { const [x, y] = P(p.x, p.y, p.z ?? 0); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
      ctx.closePath();
      ctx.fillStyle = shade(C.asphalt, { x: 0, y: 0, z: 1 }, 0.45); ctx.fill();
      ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 0.6; ctx.stroke();
      ctx.lineCap = "butt";
      if (!flat) for (const l of j.lines) {
        /* A crosswalk bar is half a metre of paint; a stop line 0.45. */
        ctx.lineWidth = Math.max(1.5, (l.kind === "zebra" ? 0.5 : 0.45) * k);
        ctx.strokeStyle = l.kind === "stop" || l.kind === "zebra" ? "rgba(250,250,242,0.95)" : "rgba(250,250,242,0.7)";
        seg(ctx, P, l.a, l.b);
      }
    } });
    /* LANE ARROWS (graph.js junctionsOf): white road paint, one glyph per
       restricted lane -- a stem, and a head for each movement the lane
       may make, bent the way it goes. Painted after the whole floor
       (layer 0.5) because they lie on a road segment whose own key can
       be nearer than any point of the arrow. */
    if (!flat) for (const ar of j.arrows ?? []) {
      const h = (ar.heading * Math.PI) / 180, fx = Math.cos(h), fy = Math.sin(h), rx = -Math.sin(h), ry = Math.cos(h);
      const pt = (f, r) => ({ x: ar.at.x + fx * f + rx * r, y: ar.at.y + fy * f + ry * r, z: ar.at.z ?? 0 });
      items.push({ layer: 0.5, key: depthOf(ar.at.x, ar.at.y, ar.at.z ?? 0), paint: () => {
        ctx.strokeStyle = "rgba(250,250,242,0.9)"; ctx.fillStyle = "rgba(250,250,242,0.9)";
        ctx.lineWidth = Math.max(1.2, 0.22 * k); ctx.lineCap = "round";
        seg(ctx, P, pt(-2.2, 0), pt(0.6, 0));
        for (const m of ar.moves) {
          const side = m === "left" ? -1 : m === "right" ? 1 : 0;
          const tip = side ? pt(1.6, side * 1.1) : pt(2.4, 0);
          const from = side ? pt(0.6, 0) : pt(0.6, 0);
          seg(ctx, P, from, tip);
          /* the head: two short strokes back from the tip */
          const dx = tip.x - from.x, dy = tip.y - from.y, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
          const back = (a) => ({ x: tip.x - (ux * Math.cos(a) - uy * Math.sin(a)) * 0.7, y: tip.y - (uy * Math.cos(a) + ux * Math.sin(a)) * 0.7, z: tip.z });
          seg(ctx, P, tip, back(0.6)); seg(ctx, P, tip, back(-0.6));
        }
      } });
    }
    if (!flat) for (const s of j.signs) {
      /* A post and a face: the face a flat box at eye height, red for a
         stop, turned to the driver it faces. Drawn as a map symbol, a
         little larger than life, as every sign here is.

         A SIGNAL IS THE SAME POST WITH THREE LENSES, and the lit one is
         read from the clock -- `lightAt` on the node's own plan, the
         same call the sim's drivers obey, so the screen cannot show a
         green to a driver the rules are holding. A state the engine can
         produce and the screen cannot express is a lie about what
         happened (CLAUDE.md), and a red nobody can see is exactly that. */
      const isLight = s.kind === "signal";
      const postH = isLight ? 2.6 : 1.7;
      const post = boxCorners({ x: s.at.x, y: s.at.y, z: s.at.z ?? 0 }, s.heading, 0, { l: 0.12, w: 0.12, h: postH });
      const lens = isLight ? ["red", "amber", "green"].map((c, i) => ({
        c,
        box: boxCorners({ x: s.at.x, y: s.at.y, z: (s.at.z ?? 0) + postH + 0.9 - i * 0.42 }, s.heading + 90, 0, { l: 0.34, w: 0.12, h: 0.34 }),
      })) : null;
      const housing = isLight ? boxCorners({ x: s.at.x, y: s.at.y, z: (s.at.z ?? 0) + postH + 0.06 }, s.heading + 90, 0, { l: 0.5, w: 0.16, h: 1.3 }) : null;
      /* A PROTECTED LEFT has its own lens beside the stack, toward the
         road -- lit green or amber by `arrowAt`, the same call the
         left-turners obey (signal.js). */
      const hasArrow = isLight && !!j.signal?.arrows?.[s.base];
      const hr = ((s.heading + 90) * Math.PI) / 180;
      const arrowLens = hasArrow ? boxCorners({ x: s.at.x - Math.cos(hr) * 0.45, y: s.at.y - Math.sin(hr) * 0.45, z: (s.at.z ?? 0) + postH + 0.06 }, s.heading + 90, 0, { l: 0.34, w: 0.12, h: 0.34 }) : null;
      const face = isLight ? null : boxCorners({ x: s.at.x, y: s.at.y, z: (s.at.z ?? 0) + 1.7 }, s.heading + 90, 0, { l: 0.9, w: 0.12, h: 0.9 });
      /* The ALL-WAY plate: a white tab under the octagon (graph.js). */
      /* NO LEFT TURN: a white face crossed by a red band -- a map symbol. */
      /* SPEED LIMIT: a white board, taller than wide, the number drawn on it. */
      const speedBoard = s.kind === "speed-limit" ? boxCorners({ x: s.at.x, y: s.at.y, z: (s.at.z ?? 0) + 1.6 }, s.heading + 90, 0, { l: 0.75, w: 0.1, h: 0.9 }) : null;
      /* ONE WAY: a black board along the road with a white bar (graph.js
         derives it from the road's `oneWay`); DO NOT ENTER: red, white bar. */
      const oneWay = s.kind === "one-way" ? boxCorners({ x: s.at.x, y: s.at.y, z: (s.at.z ?? 0) + 1.9 }, s.heading + 90, 0, { l: 1.3, w: 0.1, h: 0.45 }) : null;
      const oneWayBar = s.kind === "one-way" ? boxCorners({ x: s.at.x, y: s.at.y, z: (s.at.z ?? 0) + 2.06 }, s.heading + 90, 0, { l: 1.0, w: 0.14, h: 0.12 }) : null;
      const band = s.kind === "no-left-turn" || s.kind === "do-not-enter" ? boxCorners({ x: s.at.x, y: s.at.y, z: (s.at.z ?? 0) + 2.08 }, s.heading + 90, 0, { l: 0.95, w: 0.14, h: 0.14 }) : null;
      const plate = s.allWay ? boxCorners({ x: s.at.x, y: s.at.y, z: (s.at.z ?? 0) + 1.3 }, s.heading + 90, 0, { l: 0.7, w: 0.1, h: 0.3 }) : null;
      items.push({ layer: 1, key: depthOf(s.at.x, s.at.y, s.at.z ?? 0) + 0.01, tag: audit && { kind: "sign", at: s.at }, paint: () => {
        paintBox(ctx, view, post, "#9a9da3");
        if (s.kind === "speed-limit") {
          paintBox(ctx, view, speedBoard, "#f4f4ee");
          /* The number, projected onto the board's centre and sized to it. */
          const [cx, cy] = view.P(s.at.x, s.at.y, (s.at.z ?? 0) + 2.0);
          const [, ty] = view.P(s.at.x, s.at.y, (s.at.z ?? 0) + 2.35);
          const px = Math.max(6, Math.abs(cy - ty) * 1.1);
          ctx.fillStyle = "#1c1d20"; ctx.font = `700 ${px.toFixed(0)}px sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.fillText(String(s.kmh), cx, cy);
          return;
        }
        if (s.kind === "do-not-enter") { paintBox(ctx, view, face, "#c8322b"); paintBox(ctx, view, band, "#f4f4ee"); return; }
        if (s.kind === "one-way") { paintBox(ctx, view, oneWay, "#1c1d20"); paintBox(ctx, view, oneWayBar, "#f4f4ee"); return; }
        if (s.kind === "no-left-turn") { paintBox(ctx, view, face, "#f4f4ee"); paintBox(ctx, view, band, "#c8322b"); return; }
        if (!isLight) { if (plate) paintBox(ctx, view, plate, "#f4f4ee"); paintBox(ctx, view, face, s.kind === "stop" ? "#c8322b" : "#f2b84b"); return; }
        paintBox(ctx, view, housing, "#2a2d33");
        const lit = lightAt(j.signal, s.base, scene.t ?? 0);
        for (const l of lens) paintBox(ctx, view, l.box, l.c === lit ? LENS[l.c] : DARK[l.c]);
        if (arrowLens) { const a = arrowAt(j.signal, s.base, scene.t ?? 0); paintBox(ctx, view, arrowLens, a ? LENS[a] : DARK.green); }
      } });
    }
  }

  /* CARS GIVEN AS POSES: a car on a map is somewhere on a path through
     a node, not at a distance along one road, so the sim hands the
     renderer where it is and which way it faces. Drawn exactly as the
     others, keyed the same way. */
  /* A CAR'S KEY: its own centre, a hair past -- the floor is painted
     already, so nothing at ground level needs allowing for. A car on a
     deck is keyed past the widest deck piece's span, so it follows the
     piece it stands on whatever the piece's orientation to the view. */
  const carKey = (at) => depthOf(at.x, at.y, at.z) + (at.z - groundAt(at.x, at.y) > 1.0 ? deckSpan + 0.02 : 0.01);
  for (const a of actors) {
    const [px, py] = P(a.x, a.y, a.z ?? 0);
    if (px < -margin || px > canvas.w + margin || py < -margin || py > canvas.h + margin) continue;
    counts.cars++;
    const at = { x: a.x, y: a.y, z: a.z ?? 0 };
    /* Quantised RELATIVE TO THE VIEW: a sprite set has 32 headings as
       seen from the camera, so the step is taken in the rotated frame. */
    const deg = quantise(a.heading + rotDeg) - rotDeg;
    /* Far: a person is under a pixel -- except somebody struck, who is a
       dot that flashes, so it is never missed. A car is one dot. */
    if (far) {
      if (a.ped && !a.struck) continue;
      const colour = a.struck ? (Math.floor((scene.t ?? 0) * 2) % 2 ? "#ff8a1e" : "#5a2a08") : a.colour ?? CAR_COLOURS[(a.n ?? 0) % CAR_COLOURS.length];
      const r = Math.max(1.5, (a.length ?? CAR_LEN) * k * 0.6);
      items.push({ layer: 1, key: carKey(at), tag: audit && { kind: a.ped ? "ped" : "car", id: a.id ?? a.n, at }, paint: () => { ctx.fillStyle = colour; ctx.fillRect(px - r / 2, py - r / 2, r, r); } });
      continue;
    }
    /* A PERSON: a narrow upright box, 0.5 m square and 1.7 m tall. */
    if (a.ped) {
      /* Struck: lying on the road, flashing like a wreck's hazards. */
      const person = a.struck ? boxCorners(at, deg, 0, { l: 1.7, w: 0.5, h: 0.3 }) : boxCorners(at, deg, 0, { l: 0.5, w: 0.5, h: 1.7 });
      const colour = a.struck ? (Math.floor((scene.t ?? 0) * 2) % 2 ? "#ff8a1e" : "#5a2a08") : PED_COLOURS[(a.n ?? 0) % PED_COLOURS.length];
      items.push({ layer: 1, key: carKey(at), tag: audit && { kind: "ped", id: a.id, at }, paint: () => paintBox(ctx, view, person, colour) });
      continue;
    }
    const colour = a.colour ?? CAR_COLOURS[(a.n ?? 0) % CAR_COLOURS.length];
    /* A TRUCK (sim/traffic.js VEHICLES): a cargo box behind a cab, both
       from the vehicle's own length and width. Two boxes side by side in
       plan, so they are painted far one first, by the same depth key the
       world is sorted by. */
    if (a.kind === "truck") {
      const L = a.length ?? 9, W = a.width ?? 2.55, H = a.height ?? 3.4;
      const cabL = 2.2, boxL = L - cabL - 0.2;
      const box = { l: boxL, w: W, h: H, back: (L - boxL) / 2 }, cab = { l: cabL, w: W - 0.1, h: H * 0.8, back: -(L - cabL) / 2 };
      const rad = (deg * Math.PI) / 180, along = (d) => ({ x: at.x + Math.cos(rad) * d, y: at.y + Math.sin(rad) * d, z: at.z });
      const parts = [[boxCorners(at, deg, 0, box), "#e9e6df", along(-box.back)], [boxCorners(at, deg, 0, cab), colour, along(-cab.back)]]
        .sort((p, q) => depthOf(p[2].x, p[2].y, p[2].z) - depthOf(q[2].x, q[2].y, q[2].z));
      items.push({ layer: 1, key: carKey(at), tag: audit && { kind: "car", id: a.id ?? a.n, at }, paint: () => { for (const [c, col] of parts) paintBox(ctx, view, c, col); } });
      continue;
    }
    const body = boxCorners(at, deg, 0, BODY);
    const cabin = boxCorners(at, deg, 0, CABIN, BODY.h);
    /* Between the two tiers a car is its body alone: the cabin is a few pixels. */
    items.push({ layer: 1, key: carKey(at), tag: audit && { kind: "car", id: a.id ?? a.n, at }, paint: () => { paintBox(ctx, view, body, colour); if (!flat) paintBox(ctx, view, cabin, colour); } });
  }

  for (const { road, cars = [] } of roads) {
    for (const car of cars) {
      const along = car.dir > 0 ? car.s : road.length - car.s;
      const p = poseAt(road, along);
      const roadHeading = car.dir > 0 ? p.heading : p.heading + 180;
      /* Right of travel in plan, y down: (-sin, cos) of the heading. */
      const h = (roadHeading * Math.PI) / 180;
      const off = LANE / 2 + (car.weave ?? 0);
      const at = { x: p.x - Math.sin(h) * off, y: p.y + Math.cos(h) * off, z: p.z };
      /* A driven car points where its wheel says, not where the road does. */
      const deg = quantise(roadHeading + (car.yaw ?? 0) + rotDeg) - rotDeg;
      const grade = tilt ? (car.dir > 0 ? p.grade : -p.grade) : 0;
      const [px, py] = P(at.x, at.y, at.z);
      if (px < -margin || px > canvas.w + margin || py < -margin || py > canvas.h + margin) continue;
      counts.cars++;
      const colour = car.colour ?? CAR_COLOURS[car.n % CAR_COLOURS.length];
      const body = boxCorners(at, deg, grade, BODY);
      const cabin = boxCorners(at, deg, grade, CABIN, BODY.h);
      items.push({ layer: 1, key: carKey(at), tag: audit && { kind: "car", id: car.n, at }, paint: () => { paintBox(ctx, view, body, colour); paintBox(ctx, view, cabin, colour); } });
    }
  }

  /* Stand-in buildings, for the budget ramp: boxes on the ground, keyed
     like cars. */
  for (const b of props) {
    const z = groundAt(b.x, b.y);
    const [px, py] = P(b.x, b.y, z);
    if (px < -margin || px > canvas.w + margin || py < -margin || py > canvas.h + margin) continue;
    counts.props++;
    const box = boxCorners({ x: b.x, y: b.y, z }, b.heading, 0, { l: b.l, w: b.w, h: b.h });
    items.push({ layer: 1, key: depthOf(b.x, b.y, z) + 0.01, tag: audit && { kind: "prop", at: { x: b.x, y: b.y, z } }, paint: far
      ? () => { quad(ctx, P, box[4], box[5], box[6], box[7]); ctx.fillStyle = "#8a8f9c"; ctx.fill(); }
      : () => paintBox(ctx, view, box, "#7d8290") });
  }

  /* The floor first, then everything with height; each by depth. */
  items.sort((a, b) => a.layer - b.layer || a.key - b.key);
  for (const it of items) it.paint();
  return { items: items.length, ...counts, ...(audit ? { order: items.map((it) => ({ ...it.tag, key: it.key })) } : {}) };
}
