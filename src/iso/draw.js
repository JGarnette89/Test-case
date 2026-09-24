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
import { lightAt } from "../sim/signal.js";
import { poseAt, groundAt as stage0Ground, LANE } from "./road.js";
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
/* A signal's lenses: the lit one, and the same colour asleep. Dark
   enough to read as off at a glance and light enough that the head
   still reads as three lenses rather than a black slab. */
const LENS = { red: "#e4483c", amber: "#f2b84b", green: "#4fd07a" };
const DARK = { red: "#4a2622", amber: "#4a3d22", green: "#22402e" };
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
    for (let i = 0; i + 1 < pts.length; i++) {
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
        if (road.kind === "arterial" || road.kind === "highway") {
          const p0 = pts[i], p1 = pts[i + 1], len = Math.hypot(p1.x - p0.x, p1.y - p0.y) || 1;
          const ox = (-(p1.y - p0.y) / len) * 0.14, oy = ((p1.x - p0.x) / len) * 0.14;
          ctx.strokeStyle = C.yellow;
          for (const s of [-1, 1]) seg(ctx, P, { x: p0.x + s * ox, y: p0.y + s * oy, z: p0.z }, { x: p1.x + s * ox, y: p1.y + s * oy, z: p1.z });
        } else if (road.kind !== "residential" && i % 3 !== 2) { ctx.strokeStyle = C.yellow; seg(ctx, P, pts[i], pts[i + 1]); }
        if (road.laneLines && i % 2 === 0) { ctx.strokeStyle = "rgba(250,250,242,0.75)"; for (const line of road.laneLines) seg(ctx, P, line[i], line[i + 1]); }
      };
      const fill = (p, q, r, s) => {
        quad(ctx, P, p, q, r, s);
        ctx.fillStyle = shade(C.asphalt, n, 0.45); ctx.fill();
        ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 0.6; ctx.stroke();   // hide the hairline between pieces
      };
      if (!deck) {
        /* KEYED BY ITS NEAREST CORNER, the mirror of the ground's rule:
           a segment follows every cell that reaches under it. */
        const key = Math.max(depthOf(a.x, a.y, a.z), depthOf(b.x, b.y, b.z), depthOf(c.x, c.y, c.z), depthOf(d.x, d.y, d.z)) + 0.01;
        items.push({ layer: 0, key, tag: audit && { kind: "road", id: `${road.id}#${i}`, poly: [a, b, c, d] }, paint: () => { fill(a, b, c, d); lines(); } });
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
      for (const l of j.lines) {
        ctx.lineWidth = Math.max(1.5, 0.45 * k);
        ctx.strokeStyle = l.kind === "stop" ? "rgba(250,250,242,0.95)" : "rgba(250,250,242,0.7)";
        seg(ctx, P, l.a, l.b);
      }
    } });
    for (const s of j.signs) {
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
      const face = isLight ? null : boxCorners({ x: s.at.x, y: s.at.y, z: (s.at.z ?? 0) + 1.7 }, s.heading + 90, 0, { l: 0.9, w: 0.12, h: 0.9 });
      items.push({ layer: 1, key: depthOf(s.at.x, s.at.y, s.at.z ?? 0) + 0.01, tag: audit && { kind: "sign", at: s.at }, paint: () => {
        paintBox(ctx, view, post, "#9a9da3");
        if (!isLight) { paintBox(ctx, view, face, s.kind === "stop" ? "#c8322b" : "#f2b84b"); return; }
        paintBox(ctx, view, housing, "#2a2d33");
        const lit = lightAt(j.signal, s.base, scene.t ?? 0);
        for (const l of lens) paintBox(ctx, view, l.box, l.c === lit ? LENS[l.c] : DARK[l.c]);
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
    const colour = a.colour ?? CAR_COLOURS[(a.n ?? 0) % CAR_COLOURS.length];
    const body = boxCorners(at, deg, 0, BODY);
    const cabin = boxCorners(at, deg, 0, CABIN, BODY.h);
    items.push({ layer: 1, key: carKey(at), tag: audit && { kind: "car", id: a.id ?? a.n, at }, paint: () => { paintBox(ctx, view, body, colour); paintBox(ctx, view, cabin, colour); } });
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
    items.push({ layer: 1, key: depthOf(b.x, b.y, z) + 0.01, tag: audit && { kind: "prop", at: { x: b.x, y: b.y, z } }, paint: () => paintBox(ctx, view, box, "#7d8290") });
  }

  /* The floor first, then everything with height; each by depth. */
  items.sort((a, b) => a.layer - b.layer || a.key - b.key);
  for (const it of items) it.paint();
  return { items: items.length, ...counts, ...(audit ? { order: items.map((it) => ({ ...it.tag, key: it.key })) } : {}) };
}
