/* =====================================================================
   THE GAME LOOK (WORK-game-slice10; Jay, after slice 8: "Pedestrians are
   barely visible. Intersections need a major visual overhaul. Signage is
   basically unrecognizable.").

   PAINT ONLY. These are the sim's own places (a person's pose, a sign's
   post, a junction's lines, a sidewalk's edge) drawn so that they read at
   a glance on a phone. drawFrame (draw.js) calls in here only behind its
   one `const game = look === "game"` test, and only Game.jsx asks for it:
   with no look given, nothing in this file runs and nothing is allocated
   for it.

   Map symbols, larger than life, as signs and stop lines already were:
   every size below has a floor in pixels. Every number marked [invented]
   is a look decision for Jay to rule on; none of them is a driver's
   behaviour.
   ===================================================================== */
import { lightAt, arrowAt } from "../sim/signal.js";

/* ---------- people -------------------------------------------------- */

/* High-visibility colours no car (theme.js red/green/amber/blue/cream), post, bollard or bus uses [invented]. */
export const PERSON_COLOURS = ["#b8ff00", "#ff2fa8", "#00e0ff", "#ff6a00"];
const SKIN = "#f1c8a0", TROUSER = "#262a36", OUTLINE = "rgba(6,8,12,0.95)";
/* A person is never under this many pixels tall on screen [invented, the spec's]; the figure is scaled up from the foot until it is. */
export const PERSON_MIN_PX = 18;
const PERSON_M = 2.15;   // the figure's height in metres: legs 0.8, torso 1.0, head 0.35

/* The scale that gives a person PERSON_MIN_PX of screen height at this zoom (1 when life size is already enough). The vertical metre's own screen length is read off the view, so the tilt and the zoom are both in it. */
export function personScale(view, at, pad = 1.15) {
  const a = view.into(at.x, at.y, at.z, [0, 0]), b = view.into(at.x, at.y, at.z + 1, [0, 0]);
  const per = Math.abs(a[1] - b[1]);
  return per > 1e-6 ? Math.max(1, (PERSON_MIN_PX * pad) / (PERSON_M * per)) : 1;
}

/* One person as an item's paint closure: a soft shadow, two legs that swing, a hi-vis torso, a head. The bob and the stride come from the sim's clock `t`, never React state. */
export function personPaint(H, { ctx, view, a, at, deg, t, k }) {
  const s = personScale(view, at);
  const rad = (deg * Math.PI) / 180, fx = Math.cos(rad), fy = Math.sin(rad), rx = -fy, ry = fx;
  if (a.struck) {
    /* Lying on the road, flashing like a wreck's hazards, at the figure's new size. */
    const lying = H.boxCorners(at, deg, 0, { l: 1.8 * s, w: 0.7 * s, h: 0.35 * s });
    const colour = Math.floor(t * 2) % 2 ? "#ff8a1e" : "#5a2a08";
    return () => { H.paintShadow(ctx, view, at, deg, 1.8 * s, 0.7 * s); H.paintBox(ctx, view, lying, colour, OUTLINE); };
  }
  const phase = t * 8 + (a.n ?? 0) * 1.7, swing = Math.sin(phase) * 0.28 * s, bob = Math.abs(Math.sin(phase)) * 0.07 * s;
  const leg = (side, along) => H.boxCorners({ x: at.x + rx * 0.17 * s * side + fx * along, y: at.y + ry * 0.17 * s * side + fy * along, z: at.z }, deg, 0, { l: 0.3 * s, w: 0.26 * s, h: 0.8 * s }, bob);
  const legL = leg(-1, swing), legR = leg(1, -swing);
  const torso = H.boxCorners(at, deg, 0, { l: 0.6 * s, w: 0.9 * s, h: 1.0 * s }, 0.8 * s + bob);
  const colour = PERSON_COLOURS[(a.n ?? 0) % PERSON_COLOURS.length];
  const head = { x: at.x, y: at.y, z: at.z + 1.8 * s + 0.17 * s + bob };
  return () => {
    H.paintShadow(ctx, view, at, deg, 0.9 * s, 0.9 * s);
    H.paintBox(ctx, view, legL, TROUSER, OUTLINE); H.paintBox(ctx, view, legR, TROUSER, OUTLINE);
    H.paintBox(ctx, view, torso, colour, OUTLINE);
    const p = view.into(head.x, head.y, head.z, [0, 0]);
    ctx.beginPath(); ctx.arc(p[0], p[1], Math.max(3.2, 0.2 * s * k), 0, 2 * Math.PI);
    ctx.fillStyle = SKIN; ctx.fill(); ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1.5; ctx.stroke();
  };
}

/* ---------- signs --------------------------------------------------- */

/* A face's size on screen: 3 px for each pixel-per-metre of zoom, between 26 and 56 [invented, the spec's bounds]. */
export const SIGN_MIN_PX = 26, SIGN_MAX_PX = 56;
export const signPx = (k) => Math.min(SIGN_MAX_PX, Math.max(SIGN_MIN_PX, 3 * k));
const RED = "#d4202a", WHITE = "#f7f7f2", BLACK = "#16171a";
const LENS = { red: "#e4483c", amber: "#f2b84b", green: "#4fd07a" };
const DARK = { red: "#4a2622", amber: "#4a3d22", green: "#22402e" };
const GLOW = { red: "rgba(255,59,48,0.35)", amber: "rgba(255,176,32,0.35)", green: "rgba(47,212,104,0.35)" };
export const SIGN_COLOURS = { LENS, DARK };

function poly(c, pts, fill) { c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.closePath(); c.fillStyle = fill; c.fill(); }
const octagon = (cx, cy, r) => Array.from({ length: 8 }, (_, i) => { const a = (Math.PI / 8) + (i * Math.PI) / 4; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; });
function text(c, str, x, y, px, fill, floor = 5, weight = 800) { c.fillStyle = fill; c.font = `${weight} ${Math.max(floor, px).toFixed(1)}px sans-serif`; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(str, x, y); }

/* The face's height for a kind, in units of S: what the caller needs to stand it on its post. */
export function faceHeight(kind, S, s) {
  if (kind === "signal") return S * (s?.hasArrow ? 1.85 : 1.45);
  if (kind === "stop") return S * (s?.allWay ? 1.3 : 1);
  if (kind === "speed-limit") return S * 1.15;
  if (kind === "one-way") return S * 0.55;
  return S;
}

/* One static face, drawn at (cx, cy) on any 2D context: the sprite cache's and the frame's own are the same function. `top` is the face's top edge. */
export function drawFace(c, kind, cx, top, S, o = {}) {
  const R = S / 2;
  if (kind === "stop") {
    const cy = top + R;
    const Rv = R / Math.cos(Math.PI / 8);   // the circumradius that makes the face S across its flats
    poly(c, octagon(cx, cy, Rv), RED);
    c.strokeStyle = WHITE; c.lineWidth = Math.max(1.2, S * 0.05); c.beginPath(); octagon(cx, cy, Rv * 0.9).forEach((q, i) => (i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]))); c.closePath(); c.stroke();
    text(c, "STOP", cx, cy + S * 0.02, S * 0.3, WHITE);
    if (o.allWay) {
      const w = S * 0.84, h = S * 0.26, y = top + S + 2;
      c.fillStyle = RED; c.fillRect(cx - w / 2, y, w, h); c.strokeStyle = WHITE; c.lineWidth = Math.max(1, S * 0.04); c.strokeRect(cx - w / 2, y, w, h);
      text(c, "ALL WAY", cx, y + h / 2 + 0.5, S * 0.15, WHITE);
    }
  } else if (kind === "yield") {
    const cy = top + R, t = (r) => [[cx - r, cy - r * 0.8], [cx + r, cy - r * 0.8], [cx, cy + r * 0.95]];
    poly(c, t(R * 1.05), RED); poly(c, t(R * 0.6), WHITE);
  } else if (kind === "speed-limit") {
    const w = S * 0.82, h = S * 1.15;
    c.fillStyle = WHITE; c.fillRect(cx - w / 2, top, w, h); c.strokeStyle = BLACK; c.lineWidth = Math.max(1.2, S * 0.05); c.strokeRect(cx - w / 2, top, w, h);
    text(c, "MAXIMUM", cx, top + h * 0.2, S * 0.1, BLACK, 4, 700);
    text(c, String(o.kmh ?? ""), cx, top + h * 0.62, S * 0.42, BLACK);
  } else if (kind === "one-way") {
    const w = S * 1.2, h = S * 0.55;
    c.fillStyle = BLACK; c.fillRect(cx - w / 2, top, w, h); c.strokeStyle = WHITE; c.lineWidth = 1; c.strokeRect(cx - w / 2 + 1, top + 1, w - 2, h - 2);
    const y = top + h * 0.36;
    c.strokeStyle = WHITE; c.lineWidth = Math.max(1.5, S * 0.07); c.beginPath(); c.moveTo(cx - w * 0.32, y); c.lineTo(cx + w * 0.22, y); c.stroke();
    poly(c, [[cx + w * 0.4, y], [cx + w * 0.18, y - h * 0.22], [cx + w * 0.18, y + h * 0.22]], WHITE);
    text(c, "ONE WAY", cx, top + h * 0.8, S * 0.15, WHITE);
  } else if (kind === "do-not-enter") {
    const cy = top + R;
    c.beginPath(); c.arc(cx, cy, R, 0, 2 * Math.PI); c.fillStyle = RED; c.fill(); c.strokeStyle = WHITE; c.lineWidth = Math.max(1.2, S * 0.05); c.stroke();
    c.fillStyle = WHITE; c.fillRect(cx - R * 0.72, cy - R * 0.17, R * 1.44, R * 0.34);
  } else if (kind === "no-left-turn") {
    const cy = top + R;
    c.fillStyle = WHITE; c.fillRect(cx - R, top, S, S); c.strokeStyle = BLACK; c.lineWidth = 1; c.strokeRect(cx - R, top, S, S);
    c.strokeStyle = BLACK; c.lineWidth = Math.max(2, S * 0.1); c.lineCap = "butt";
    c.beginPath(); c.moveTo(cx + R * 0.25, cy + R * 0.5); c.lineTo(cx + R * 0.25, cy - R * 0.05); c.lineTo(cx - R * 0.15, cy - R * 0.05); c.stroke();
    poly(c, [[cx - R * 0.55, cy - R * 0.05], [cx - R * 0.15, cy - R * 0.38], [cx - R * 0.15, cy + R * 0.28]], BLACK);
    c.beginPath(); c.arc(cx, cy, R * 0.8, 0, 2 * Math.PI); c.strokeStyle = RED; c.lineWidth = Math.max(2, S * 0.09); c.stroke();
    c.beginPath(); c.moveTo(cx - R * 0.57, cy - R * 0.57); c.lineTo(cx + R * 0.57, cy + R * 0.57); c.stroke();
  }
}

/* THE SPRITE CACHE: a static face (a stop sign with its text, a yield, a speed number) is drawn once into an offscreen canvas per kind, per variant (all-way, speed) and per 2 px size bucket, and then only blitted. A signal's face is never cached: its lit lens changes with the clock. With no offscreen canvas to be had (a check, a server render) the face is drawn straight onto the frame, by the same drawFace. */
const SPRITES = new Map();
export const spriteStats = { built: 0 };
const make = (w, h) => (typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(w, h) : typeof document !== "undefined" ? Object.assign(document.createElement("canvas"), { width: w, height: h }) : null);
function paintStatic(ctx, kind, cx, top, S, o) {
  if (typeof OffscreenCanvas === "undefined" && typeof document === "undefined") { drawFace(ctx, kind, cx, top, S, o); return; }
  const B = Math.round(S / 2) * 2, dpr = ctx.getTransform?.()?.a || 1;
  const key = `${kind}|${o.allWay ? "aw" : ""}${o.kmh ?? ""}|${B}|${dpr.toFixed(2)}`;
  let sp = SPRITES.get(key);
  if (sp === undefined) {
    const W = Math.ceil((B * 1.4 + 4) * dpr), Ht = Math.ceil((B * 1.5 + 4) * dpr), cv = make(W, Ht), g = cv && cv.getContext && cv.getContext("2d");
    if (g) { g.scale(dpr, dpr); drawFace(g, kind, (B * 1.4 + 4) / 2, 2, B, o); spriteStats.built++; sp = { cv, w: B * 1.4 + 4, h: B * 1.5 + 4 }; } else sp = null;
    if (SPRITES.size > 96) SPRITES.clear();
    SPRITES.set(key, sp);
  }
  if (sp) ctx.drawImage(sp.cv, cx - sp.w / 2, top - 2, sp.w, sp.h);
  else drawFace(ctx, kind, cx, top, S, o);
}

/* One sign, on its post: the face turned to the camera at the head of the post, over the post the frame has already drawn. */
export function paintSign(ctx, view, s, j, scene, k, geom) {
  const S = signPx(k), kind = s.kind === "signal" ? "signal" : s.kind;
  const p = view.into(s.at.x, s.at.y, (s.at.z ?? 0) + geom.postH, [0, 0]);
  const Hh = faceHeight(kind, S, { hasArrow: geom.hasArrow, allWay: s.allWay }), top = p[1] - Hh, cx = p[0];
  if (kind === "signal") { paintSignal(ctx, view, s, j, scene, S, cx, top, Hh, geom); return; }
  if (s.kind === "stop") paintStatic(ctx, "stop", cx, top, S, { allWay: !!s.allWay });
  else if (s.kind === "speed-limit") paintStatic(ctx, "speed-limit", cx, top, S, { kmh: s.kmh });
  else if (s.kind === "yield" || s.kind === "one-way" || s.kind === "do-not-enter" || s.kind === "no-left-turn") paintStatic(ctx, s.kind, cx, top, S, {});
  else paintStatic(ctx, "yield", cx, top, S, {});
}

/* A signal: a black housing, three round lenses (red on top), the lit one bright with a glow and the rest dim; a fourth small lens with a green arrow where the approach has a protected left. The light comes from lightAt/arrowAt, the calls the drivers obey. */
function paintSignal(ctx, view, s, j, scene, S, cx, top, Hh, geom) {
  const w = S * 0.46, lit = lightAt(j.signal, s.base, scene.t ?? 0, scene.lights?.[j.k]?.live), r = S * 0.17, step = S * 0.4;
  ctx.fillStyle = "#14161b"; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(cx - w / 2, top, w, Hh, w * 0.28) : ctx.rect(cx - w / 2, top, w, Hh); ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.35)"; ctx.lineWidth = 1; ctx.stroke();
  ["red", "amber", "green"].forEach((name, i) => {
    const y = top + step * (0.55 + i);
    if (name === lit) { ctx.fillStyle = GLOW[name]; ctx.beginPath(); ctx.arc(cx, y, r * 1.9, 0, 2 * Math.PI); ctx.fill(); }
    ctx.fillStyle = name === lit ? LENS[name] : DARK[name]; ctx.beginPath(); ctx.arc(cx, y, r, 0, 2 * Math.PI); ctx.fill();
  });
  if (geom.hasArrow) {
    const a = arrowAt(j.signal, s.base, scene.t ?? 0, scene.lights?.[j.k]?.live), y = top + step * 3.55, ar = r * 0.85;
    ctx.fillStyle = a ? LENS[a] : DARK.green; ctx.beginPath(); ctx.arc(cx, y, ar, 0, 2 * Math.PI); ctx.fill();
    ctx.strokeStyle = a ? "#0d1a12" : "#2f5a40"; ctx.lineWidth = Math.max(1.5, ar * 0.3); ctx.beginPath(); ctx.moveTo(cx + ar * 0.5, y + ar * 0.4); ctx.lineTo(cx + ar * 0.5, y - ar * 0.1); ctx.lineTo(cx - ar * 0.4, y - ar * 0.1); ctx.stroke();
    poly(ctx, [[cx - ar * 0.75, y - ar * 0.1], [cx - ar * 0.3, y - ar * 0.5], [cx - ar * 0.3, y + ar * 0.3]], a ? "#0d1a12" : "#2f5a40");
  }
  if (scene.lights?.[j.k]?.saw?.[s.base]) {
    const r2 = Math.max(3.5, S * 0.12), y = top - r2 - 2;
    ctx.fillStyle = "rgba(63,208,255,0.35)"; ctx.beginPath(); ctx.arc(cx, y, r2 * 1.7, 0, 2 * Math.PI); ctx.fill();
    ctx.fillStyle = "#3fd0ff"; ctx.beginPath(); ctx.arc(cx, y, r2, 0, 2 * Math.PI); ctx.fill();
  }
}

/* ---------- the intersection ---------------------------------------- */

const CONCRETE = "#e2dfd6", CURB_SHADE = "rgba(20,20,24,0.45)";
export const RETURN_R = 5;     // m, the curb return's radius [invented, the spec's]
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/* THE CORNERS, derived from the sidewalks the sim's map already has and cached on the sidewalks array: two sidewalks of different roads whose inner edges end at the same point (within 0.6 m) meet at a corner, and each edge leaves it along its own direction. The radius is RETURN_R and never more than the corner allows (the shorter edge, and 80% of it). Nothing of the sim's surface is moved: the fillet is asphalt painted INTO the block's corner, over the sidewalk. */
const CORNERS = new WeakMap();
export function cornersOf(sidewalks) {
  let list = CORNERS.get(sidewalks);
  if (list) return list;
  list = [];
  const ends = [];
  sidewalks.forEach((w, wi) => {
    const n = w.inner.length;
    if (n < 2) return;
    ends.push({ wi, w, at: w.inner[0], next: w.inner[1], len: runLen(w.inner) });
    ends.push({ wi, w, at: w.inner[n - 1], next: w.inner[n - 2], len: runLen(w.inner.slice().reverse()) });
  });
  const used = new Set();
  for (let i = 0; i < ends.length; i++) for (let m = i + 1; m < ends.length; m++) {
    const e = ends[i], f = ends[m];
    if (e.w.road === f.w.road || dist(e.at, f.at) > 0.6 || used.has(i) || used.has(m)) continue;
    const u1 = unit(e.at, e.next), u2 = unit(f.at, f.next);
    const cosT = u1.x * u2.x + u1.y * u2.y, th = Math.acos(Math.max(-1, Math.min(1, cosT)));
    if (th < 0.5 || th > 2.6) continue;               // a nearly straight or nearly folded corner has nothing to round
    const room = 0.8 * Math.min(e.len, f.len);
    const tan = Math.tan(th / 2);
    const r = Math.min(RETURN_R, room * tan), t = r / tan;
    const bis = { x: u1.x + u2.x, y: u1.y + u2.y }, bl = Math.hypot(bis.x, bis.y) || 1;
    const C = { x: (e.at.x + f.at.x) / 2, y: (e.at.y + f.at.y) / 2, z: e.at.z ?? 0 };
    const cen = { x: C.x + (bis.x / bl) * (r / Math.sin(th / 2)), y: C.y + (bis.y / bl) * (r / Math.sin(th / 2)) };
    const T1 = { x: C.x + u1.x * t, y: C.y + u1.y * t, z: C.z }, T2 = { x: C.x + u2.x * t, y: C.y + u2.y * t, z: C.z };
    let a1 = Math.atan2(T1.y - cen.y, T1.x - cen.x), a2 = Math.atan2(T2.y - cen.y, T2.x - cen.x), d = a2 - a1;
    while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    const arc = Array.from({ length: 9 }, (_, q) => { const a = a1 + (d * q) / 8; return { x: cen.x + Math.cos(a) * r, y: cen.y + Math.sin(a) * r, z: C.z }; });
    used.add(i); used.add(m);
    list.push({ C, T1, T2, r, t, arc, ends: [{ wi: e.wi, first: e.at === e.w.inner[0], t }, { wi: f.wi, first: f.at === f.w.inner[0], t }] });
  }
  CORNERS.set(sidewalks, list);
  return list;
}
/* How far the edge runs straight from its first point (within 5 degrees of its first segment): the room a fillet has along it. */
function runLen(p) {
  const u = unit(p[0], p[1]);
  let L = 0;
  for (let i = 1; i < p.length; i++) { const v = unit(p[i - 1], p[i]); if (v.x * u.x + v.y * u.y < Math.cos(0.0873)) break; L += dist(p[i - 1], p[i]); }
  return L;
}
function unit(a, b) { const l = dist(a, b) || 1; return { x: (b.x - a.x) / l, y: (b.y - a.y) / l }; }

/* The inner edge of one sidewalk, trimmed where a curb return takes over from it: the distance `t` is walked in from the end, whole segments dropped and the last one cut. */
function trimmed(w, trims) {
  let pts = w.inner.map((q) => ({ x: q.x, y: q.y, z: q.z ?? 0 }));
  for (const { first, t } of trims) {
    if (first) pts.reverse();
    let left = t;
    while (pts.length > 2 && dist(pts[pts.length - 1], pts[pts.length - 2]) <= left) { left -= dist(pts[pts.length - 1], pts[pts.length - 2]); pts.pop(); }
    const e = pts[pts.length - 1], q = pts[pts.length - 2], u = unit(e, q);
    pts[pts.length - 1] = { x: e.x + u.x * Math.min(left, dist(e, q)), y: e.y + u.y * Math.min(left, dist(e, q)), z: e.z };
    if (first) pts.reverse();
  }
  return pts;
}

/* The curb along every sidewalk in view and the asphalt fillet and curb line of every return in view, as items for drawFrame's list: layer 0.5, so they follow every floor item (the sidewalks included, which the fillets paint over) and precede every layer-1 one. */
export function curbItems(items, { sidewalks, view, onScreen, audit, ctx, k, asphalt }) {
  const corners = cornersOf(sidewalks), trims = new Map();
  for (const c of corners) for (const e of c.ends) { if (!trims.has(e.wi)) trims.set(e.wi, []); trims.get(e.wi).push(e); }
  const KEY = -1e12;
  const lineW = Math.max(2, 0.28 * k), P = [0, 0];
  const trace = (pts) => { ctx.beginPath(); pts.forEach((q, i) => { view.into(q.x, q.y, q.z ?? 0, P); i ? ctx.lineTo(P[0], P[1]) : ctx.moveTo(P[0], P[1]); }); };
  sidewalks.forEach((w, wi) => {
    let seen = false;
    for (let i = 0; i < w.inner.length && !seen; i++) seen = onScreen(w.inner[i].x, w.inner[i].y, w.inner[i].z ?? 0);
    if (!seen) return;
    const pts = trimmed(w, trims.get(wi) ?? []);
    items.push({ layer: 0.5, key: KEY, tag: audit && { kind: "game-curb", layer: 0.5, id: w.id }, paint: () => {
      ctx.lineCap = "butt"; ctx.lineJoin = "round";
      trace(pts); ctx.strokeStyle = CURB_SHADE; ctx.lineWidth = lineW + 1.5; ctx.stroke();
      trace(pts); ctx.strokeStyle = CONCRETE; ctx.lineWidth = lineW; ctx.stroke();
    } });
  });
  for (const c of corners) {
    if (!onScreen(c.C.x, c.C.y, c.C.z) && !onScreen(c.arc[4].x, c.arc[4].y, c.arc[4].z)) continue;
    items.push({ layer: 0.5, key: KEY + 1, tag: audit && { kind: "curb-return", layer: 0.5, at: c.C, r: c.r }, paint: () => {
      /* The asphalt first, over the sidewalk's corner (C, along one edge to T1, round the arc, T2 back to C); then the curb round the arc. */
      trace([c.C, c.T1, ...c.arc, c.T2]); ctx.closePath(); ctx.fillStyle = asphalt; ctx.fill();
      trace(c.arc); ctx.lineCap = "butt"; ctx.strokeStyle = CURB_SHADE; ctx.lineWidth = lineW + 1.5; ctx.stroke();
      trace(c.arc); ctx.strokeStyle = CONCRETE; ctx.lineWidth = lineW; ctx.stroke();
    } });
  }
}

/* Continental crosswalk bars: each of the sim's zebra lines, bolder. The bar is 0.6 of the screen distance to the next line (so the white and the gap are about even whatever the heading and the tilt), never under 3 px [invented]. */
export const BAR_MIN_PX = 3;
export function crossBarWidth(view, l, next) {
  if (!next) return Math.max(BAR_MIN_PX, 0.5 * view.k);
  const a0 = view.P((l.a.x + l.b.x) / 2, (l.a.y + l.b.y) / 2, l.a.z ?? 0), a1 = view.P((next.a.x + next.b.x) / 2, (next.a.y + next.b.y) / 2, next.a.z ?? 0);
  const p = view.P(l.a.x, l.a.y, l.a.z ?? 0), q = view.P(l.b.x, l.b.y, l.b.z ?? 0), dx = q[0] - p[0], dy = q[1] - p[1], len = Math.hypot(dx, dy) || 1;
  const gap = Math.abs((a1[0] - a0[0]) * (dy / len) - (a1[1] - a0[1]) * (dx / len));
  return Math.max(BAR_MIN_PX, 0.6 * gap);
}

/* The next line of the same kind in the junction's list (or the one before it), whose distance gives the bar its pitch. */
export function neighbourLine(lines, l) {
  const i = lines.indexOf(l);
  return lines[i + 1]?.kind === l.kind ? lines[i + 1] : lines[i - 1]?.kind === l.kind ? lines[i - 1] : null;
}

/* A stop line: a solid white bar about 0.6 m deep, floored at 6 px [invented]. */
export const STOP_MIN_PX = 6;
export const stopLineWidth = (k) => Math.min(24, Math.max(STOP_MIN_PX, 0.6 * k));

/* A yield line: the shark's teeth, a row of white triangles pointing at the driver who yields (away from the intersection's middle). */
export function paintTeeth(ctx, view, l, j, k) {
  const dx = l.b.x - l.a.x, dy = l.b.y - l.a.y, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
  let nx = -uy, ny = ux;
  const mx = (l.a.x + l.b.x) / 2 - j.at.x, my = (l.a.y + l.b.y) / 2 - j.at.y;
  if (nx * mx + ny * my < 0) { nx = -nx; ny = -ny; }
  const base = Math.max(0.6, 7 / (0.7 * k)), n = Math.max(1, Math.floor(len / base)), bw = len / n, h = Math.max(0.6, base * 0.9), z = l.a.z ?? 0, P = [0, 0];
  ctx.fillStyle = "rgba(252,252,246,0.98)";
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const x0 = l.a.x + ux * bw * i, y0 = l.a.y + uy * bw * i, x1 = x0 + ux * bw, y1 = y0 + uy * bw;
    view.into(x0, y0, z, P); ctx.moveTo(P[0], P[1]);
    view.into(x1, y1, z, P); ctx.lineTo(P[0], P[1]);
    view.into((x0 + x1) / 2 + nx * h, (y0 + y1) / 2 + ny * h, z, P); ctx.lineTo(P[0], P[1]);
    ctx.closePath();
  }
  ctx.fill();
}
