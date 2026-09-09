import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  MousePointer2, Car, Truck, Bike, User, Octagon, Triangle, Ban,
  Lightbulb, Gauge, MoveUpRight, Type, PenTool, Eraser, Undo2, Redo2,
  Trash2, Save, FolderOpen, X, RotateCcw, RotateCw, Copy, Check,
  Minus, Spline, Route, Eye, EyeOff,
  ZoomIn, ZoomOut, Maximize2, Download, Zap, Move
} from "lucide-react";

/* =====================================================================
   PLATFORM LAYER
   Everything environment-specific lives here so a Capacitor build only
   has to change this block, not the app.
   ===================================================================== */

/* --- Fonts ---------------------------------------------------------
   The webfont @import below is a progressive enhancement only. For the
   native build, bundle the .woff2 files and replace it with @font-face
   rules pointing at local assets — otherwise a cold start with no signal
   (i.e. parked in a car) flashes fallback text. The stacks below are
   metric-compatible enough that the fallback is not jarring.            */
const FONT_DISPLAY = "'Rajdhani', 'Oswald', 'Arial Narrow', 'Roboto Condensed', system-ui, sans-serif";
const FONT_UI = "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

/* --- Storage -------------------------------------------------------
   Adapters are picked once at load. To go native, install
   @capacitor/preferences and register the adapter in initStorage().     */
function makeMemoryAdapter() {
  const mem = new Map();
  return {
    name: "memory",
    async get(k) { return mem.has(k) ? mem.get(k) : null; },
    async set(k, v) { mem.set(k, v); },
    async remove(k) { mem.delete(k); },
    async keys(prefix) { return [...mem.keys()].filter((k) => k.startsWith(prefix)); },
  };
}

function makeSandboxAdapter(api) {
  return {
    name: "sandbox",
    async get(k) {
      try { const r = await api.get(k, false); return r?.value ?? null; }
      catch { return null; }
    },
    async set(k, v) { await api.set(k, v, false); },
    async remove(k) { try { await api.delete(k, false); } catch { /* absent */ } },
    async keys(prefix) {
      try { const r = await api.list(prefix, false); return r?.keys || []; }
      catch { return []; }
    },
  };
}

// Capacitor Preferences — only used when running inside the native shell.
function makeCapacitorAdapter(prefs) {
  return {
    name: "capacitor",
    async get(k) { const r = await prefs.get({ key: k }); return r?.value ?? null; },
    async set(k, v) { await prefs.set({ key: k, value: v }); },
    async remove(k) { await prefs.remove({ key: k }); },
    async keys(prefix) {
      const r = await prefs.keys();
      return (r?.keys || []).filter((k) => k.startsWith(prefix));
    },
  };
}

const Storage = (() => {
  let adapter = null;
  function resolve() {
    if (adapter) return adapter;
    const g = typeof window !== "undefined" ? window : {};
    const cap = g.Capacitor?.Plugins?.Preferences;
    if (cap) adapter = makeCapacitorAdapter(cap);
    else if (g.storage?.get && g.storage?.set) adapter = makeSandboxAdapter(g.storage);
    else adapter = makeMemoryAdapter();
    return adapter;
  }
  return {
    get: (k) => resolve().get(k),
    set: (k, v) => resolve().set(k, v),
    remove: (k) => resolve().remove(k),
    keys: (p) => resolve().keys(p),
    get backend() { return resolve().name; },
  };
})();

const SCENARIO_PREFIX = "scenario:";

/* --- Noise texture -------------------------------------------------
   A live feTurbulence over the full screen re-rasterises on every
   repaint and is one of the most expensive things an SVG can do. This
   bakes the same grain into a small tiled bitmap once, which the GPU
   then composites for free.                                            */
const NOISE_TILE = (() => {
  try {
    if (typeof document === "undefined") return null;
    const N = 64;
    const cv = document.createElement("canvas");
    cv.width = N; cv.height = N;
    const ctx = cv.getContext("2d");
    if (!ctx) return null;
    const img = ctx.createImageData(N, N);
    const rnd = mulberry32(97531);
    for (let i = 0; i < N * N; i++) {
      const v = 128 + (rnd() - 0.5) * 210;
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return cv.toDataURL("image/png");
  } catch { return null; }
})();

/* =====================================================================
   SCALE
   Everything on the canvas is drawn from real-world metres so that a car
   occupies a true half of a lane, a truck really is twice a car's length,
   and following distances read correctly.
   ===================================================================== */
const SCALE = 24;                 // pixels per metre
const M = (v) => v * SCALE;       // metres -> pixels
const W = 1000, H = 640;          // canvas = 41.7 m x 26.7 m

const LANE_W = 3.6;               // standard lane, metres
const MARK_W = 0.15;              // painted line width, metres
const MARK_PX = M(MARK_W);
const DASH_CENTRE = `${M(3)} ${M(6)}`;   // 3 m mark, 6 m gap
const DASH_LANE = `${M(3)} ${M(9)}`;     // 3 m mark, 9 m gap
const STOP_BAR = M(0.4);

const COLORS = {
  asphalt: "#43474F",
  asphaltDark: "#383C43",
  shoulder: "#5E8A54",
  shoulderDark: "#4E7746",
  lane: "#FFC93C",
  edge: "#FAFAF2",
  ink: "#191C22",
  red: "#E05252",
  green: "#3BAA51",
  blue: "#3B7BE8",
  orange: "#F0743A",
  panel: "#24262A",
  panel2: "#2C2F34",
};

// tint a hex colour: amt > 0 lightens, amt < 0 darkens
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) =>
    Math.max(0, Math.min(255, Math.round(v + 255 * amt))));
  return `#${((ch[0] << 16) | (ch[1] << 8) | ch[2]).toString(16).padStart(6, "0")}`;
}

// deterministic scatter so the grass texture never reshuffles on re-render
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const GRASS_TUFTS = (() => {
  const r = mulberry32(20260730);
  const out = [];
  for (let i = 0; i < 520; i++) {
    out.push({
      x: -900 + r() * 2800, y: -700 + r() * 2050,
      rx: 7 + r() * 16, ry: 3 + r() * 6,
      rot: r() * 180, light: r() > 0.45, o: 0.06 + r() * 0.1,
    });
  }
  return out;
})();

/* =====================================================================
   TEMPLATE SYSTEM
   Templates are plain data, not JSX. Each one is:
     surface[] – paved shapes (drawn twice: white edging, then asphalt,
                 so overlapping pieces fuse into one road network)
     islands[] – unpaved areas punched back out of the asphalt
     marks[]   – painted markings (lines, lane arrows, crosswalks, hatching)
     props[]   – real, editable items dropped in with the template
   Adding a template means adding one entry to TEMPLATES. Nothing else
   in the app needs to change.
   ===================================================================== */

// --- surface primitives ---
const rect = (x, y, w, h) => ({ t: "rect", x, y, w, h });
const poly = (...pts) => ({ t: "poly", pts });
const band = (d, w, cap) => ({ t: "stroke", d, w, cap });
const disc = (cx, cy, r) => ({ t: "circle", cx, cy, r });

// --- marking primitives ---
const line = (a, b, s = "solid") => ({ t: "line", a, b, s });
const ring = (cx, cy, r, s = "solid") => ({ t: "ring", cx, cy, r, s });
const arrow = (x, y, rot, k) => ({ t: "arrow", x, y, rot, k });
const walk = (a, b, depth) => ({ t: "crosswalk", a, b, depth });
const hatch = (...pts) => ({ t: "hatch", pts });

// --- prop primitive ---
const signal = (x, y, state, rot = 0) => ({ kind: "sign-light", x, y, signal: state, rotation: rot });
// available for templates that need static signage, e.g. signPost("sign-yield", x, y)
const signPost = (kind, x, y, rot = 0) => ({ kind, x, y, rotation: rot });
void signPost;

/* Painted lane arrows, authored pointing +x (direction of travel).
   "right" variants are the left ones mirrored at render time. */
const A_THROUGH =
  `M ${M(-2.2)},${M(-0.18)} L ${M(1.05)},${M(-0.18)} L ${M(1.05)},${M(-0.62)} ` +
  `L ${M(2.2)},0 L ${M(1.05)},${M(0.62)} L ${M(1.05)},${M(0.18)} L ${M(-2.2)},${M(0.18)} Z`;
const A_TURN =
  `M ${M(-2.2)},${M(0.18)} L ${M(0.68)},${M(0.18)} L ${M(0.68)},${M(-0.55)} ` +
  `L ${M(1.12)},${M(-0.55)} L ${M(0.5)},${M(-1.45)} L ${M(-0.12)},${M(-0.55)} ` +
  `L ${M(0.32)},${M(-0.55)} L ${M(0.32)},${M(-0.18)} L ${M(-2.2)},${M(-0.18)} Z`;
const A_BRANCH =
  `M ${M(0.32)},${M(-0.10)} L ${M(0.68)},${M(-0.10)} L ${M(0.68)},${M(-0.55)} ` +
  `L ${M(1.12)},${M(-0.55)} L ${M(0.5)},${M(-1.45)} L ${M(-0.12)},${M(-0.55)} ` +
  `L ${M(0.32)},${M(-0.55)} Z`;

const ARROW_PATHS = {
  through: A_THROUGH,
  left: A_TURN,
  right: A_TURN,
  "left-through": `${A_THROUGH} ${A_BRANCH}`,
  "right-through": `${A_THROUGH} ${A_BRANCH}`,
};
const ARROW_MIRROR = { right: true, "right-through": true };

/* --- shared geometry --- */
const LP = M(LANE_W);                 // one lane
const H2 = M(LANE_W);                 // half-width of a 2-lane road
const CX = 500, CY = 320;

// A turn-pocket approach: 1 oncoming lane + 2 lanes on the near side,
// tapering back to a plain 2-lane road. Shared by the turning templates.
const APPROACH = (() => {
  const xc = 457;                     // centreline
  return {
    xc,
    left: xc - LP,                    // 371 – far curb
    mid: xc + LP,                     // 543 – line between the two near lanes
    right: xc + LP * 2,               // 630 – near curb at full width
    crossB: 236,                      // where the cross road ends
    taperTop: 430, taperBot: 520,
    stopY: 312, walkY: 240,
  };
})();

function approachSurface() {
  const a = APPROACH;
  return [
    rect(0, 64, 1000, 172),
    poly([a.left, a.crossB], [a.right, a.crossB], [a.right, a.taperTop],
      [a.mid, a.taperBot], [a.mid, 640], [a.left, 640]),
  ];
}
function approachCommonMarks() {
  const a = APPROACH;
  return [
    line([a.xc, a.crossB], [a.xc, 640], "centre2"),
    line([a.mid, a.crossB], [a.mid, a.taperTop], "solid"),
    walk([a.left, a.walkY], [a.right, a.walkY], M(2.5)),
    line([a.xc, a.stopY], [a.right, a.stopY], "stop"),
  ];
}

const TEMPLATES = {
  crossroad: {
    label: "4-Way Intersection", group: "Intersections",
    surface: [rect(CX - H2, 0, H2 * 2, 640), rect(0, CY - H2, 1000, H2 * 2)],
    marks: [
      line([CX, 0], [CX, CY - H2], "centre"), line([CX, CY + H2], [CX, 640], "centre"),
      line([0, CY], [CX - H2, CY], "centre"), line([CX + H2, CY], [1000, CY], "centre"),
      line([CX, CY + H2 + M(1)], [CX + H2, CY + H2 + M(1)], "stop"),
      line([CX - H2, CY - H2 - M(1)], [CX, CY - H2 - M(1)], "stop"),
      line([CX - H2 - M(1), CY], [CX - H2 - M(1), CY + H2], "stop"),
      line([CX + H2 + M(1), CY - H2], [CX + H2 + M(1), CY], "stop"),
    ],
  },

  crossSignal: {
    label: "Signalised Crossroad", group: "Intersections",
    surface: [rect(CX - H2, 0, H2 * 2, 640), rect(0, CY - H2, 1000, H2 * 2)],
    marks: [
      line([CX, 0], [CX, CY - H2], "centre"), line([CX, CY + H2], [CX, 640], "centre"),
      line([0, CY], [CX - H2, CY], "centre"), line([CX + H2, CY], [1000, CY], "centre"),
      walk([CX - H2, CY + H2 + M(1)], [CX + H2, CY + H2 + M(1)], M(2.5)),
      walk([CX + H2, CY - H2 - M(3.5)], [CX - H2, CY - H2 - M(3.5)], M(2.5)),
      walk([CX - H2 - M(3.5), CY - H2], [CX - H2 - M(3.5), CY + H2], M(2.5)),
      walk([CX + H2 + M(1), CY + H2], [CX + H2 + M(1), CY - H2], M(2.5)),
      line([CX, CY + H2 + M(4.5)], [CX + H2, CY + H2 + M(4.5)], "stop"),
      line([CX - H2, CY - H2 - M(4.5)], [CX, CY - H2 - M(4.5)], "stop"),
      line([CX - H2 - M(4.5), CY], [CX - H2 - M(4.5), CY + H2], "stop"),
      line([CX + H2 + M(4.5), CY - H2], [CX + H2 + M(4.5), CY], "stop"),
    ],
    props: [
      signal(CX + H2 + 40, CY - H2 - 40, "red"),
      signal(CX - H2 - 40, CY + H2 + 40, "red"),
      signal(CX + H2 + 40, CY + H2 + 40, "green"),
      signal(CX - H2 - 40, CY - H2 - 40, "green"),
    ],
  },

  turnLeft: {
    label: "Left-Turn Approach", group: "Turning",
    surface: approachSurface(),
    marks: [
      ...approachCommonMarks(),
      arrow(APPROACH.xc + LP / 2, 372, -90, "left"),
      arrow(APPROACH.mid + LP / 2, 372, -90, "right-through"),
      arrow(APPROACH.xc + LP / 2, 476, -90, "left"),
      arrow(APPROACH.left + LP / 2, 430, 90, "through"),
    ],
    props: [
      signal(APPROACH.xc + LP / 2, 34, "greenLeft"),
      signal(APPROACH.mid + LP / 2, 34, "red"),
    ],
  },

  turnRight: {
    label: "Right-Turn Approach", group: "Turning",
    surface: approachSurface(),
    marks: [
      ...approachCommonMarks(),
      arrow(APPROACH.xc + LP / 2, 372, -90, "through"),
      arrow(APPROACH.mid + LP / 2, 372, -90, "right"),
      arrow(APPROACH.mid + LP / 2, 476, -90, "right"),
      arrow(APPROACH.left + LP / 2, 430, 90, "through"),
    ],
    props: [
      signal(APPROACH.mid + LP / 2, 34, "red"),
    ],
  },

  tintersection: {
    label: "T-Intersection", group: "Intersections",
    surface: [rect(CX - H2, 0, H2 * 2, 640), rect(CX + H2, CY - H2, 1000 - CX - H2, H2 * 2)],
    marks: [
      line([CX, 0], [CX, 640], "centre"),
      line([CX + H2, CY], [1000, CY], "centre"),
      line([CX + H2 + M(1), CY - H2], [CX + H2 + M(1), CY], "stop"),
    ],
  },

  roundabout: {
    label: "Roundabout", group: "Intersections",
    surface: [
      rect(CX - H2, 0, H2 * 2, CY - M(12) + 8),
      rect(CX - H2, CY + M(12) - 8, H2 * 2, 640),
      rect(0, CY - H2, CX - M(12) + 8, H2 * 2),
      rect(CX + M(12) - 8, CY - H2, 1000, H2 * 2),
      disc(CX, CY, M(12)),
    ],
    islands: [disc(CX, CY, M(4))],
    marks: [
      ring(CX, CY, M(8), "lane"),
      line([CX, 0], [CX, CY - M(13)], "centre"),
      line([CX, CY + M(13)], [CX, 640], "centre"),
      line([0, CY], [CX - M(13), CY], "centre"),
      line([CX + M(13), CY], [1000, CY], "centre"),
      line([CX, CY - M(12.6)], [CX + H2, CY - M(12.6)], "giveway"),
      line([CX - H2, CY + M(12.6)], [CX, CY + M(12.6)], "giveway"),
      line([CX - M(12.6), CY - H2], [CX - M(12.6), CY], "giveway"),
      line([CX + M(12.6), CY], [CX + M(12.6), CY + H2], "giveway"),
    ],
  },

  straight: {
    label: "Straight Road", group: "Other",
    surface: [rect(CX - H2, 0, H2 * 2, 640)],
    marks: [line([CX, 0], [CX, 640], "centre")],
  },

  merge: {
    label: "Highway On-Ramp", group: "Highway",
    surface: [
      rect(-10, 90, 1020, LP * 2),
      poly([290, 90 + LP * 2], [1010, 90 + LP * 2], [1010, 90 + LP * 3], [290, 90 + LP * 3]),
      band("M -20,660 C 90,540 120,420 300,306", M(4.2)),
    ],
    marks: [
      line([0, 90 + LP], [1000, 90 + LP], "lane"),
      line([300, 90 + LP * 2], [1000, 90 + LP * 2], "centre-white"),
    ],
  },

  exit: {
    label: "Highway Off-Ramp", group: "Highway",
    surface: [
      rect(-10, 90, 1020, LP * 2),
      poly([120, 90 + LP * 2], [600, 90 + LP * 2], [600, 90 + LP * 3], [240, 90 + LP * 3]),
      band("M 600,306 L 1020,610", M(4.2)),
    ],
    marks: [
      hatch([622, 265], [862, 263], [862, 432]),
      line([0, 90 + LP], [1000, 90 + LP], "lane"),
      line([200, 90 + LP * 2], [600, 90 + LP * 2], "centre-white"),
    ],
  },

  parking: {
    label: "Parking Lot", group: "Other",
    surface: [rect(20, 128 - M(0.8), 960, M(5) * 2 + M(6) + M(1.6))],
    marks: (() => {
      const stall = M(2.5), depth = M(5), aisle = M(6);
      const top = (640 - (depth * 2 + aisle)) / 2;
      const rowB = top + depth + aisle;
      const out = [line([40, top + depth], [960, top + depth], "solid"),
      line([40, rowB], [960, rowB], "solid")];
      for (let i = 0; i <= 15; i++) {
        const x = 40 + i * stall;
        if (x > 960) break;
        out.push(line([x, top], [x, top + depth], "solid"));
        out.push(line([x, rowB], [x, rowB + depth], "solid"));
      }
      return out;
    })(),
  },

  blank: { label: "Open Surface", group: "Other", surface: [rect(0, 0, 1000, 640)] },
};

const ROAD_TEMPLATES = Object.entries(TEMPLATES).map(([key, t]) => ({ key, ...t }));
const TEMPLATE_GROUPS = ["Intersections", "Turning", "Highway", "Other"];

const VEHICLE_TOOLS = [
  { kind: "car", label: "Car", Icon: Car },
  { kind: "truck", label: "Truck", Icon: Truck },
  { kind: "bike", label: "Bike", Icon: Bike },
  { kind: "pedestrian", label: "Person", Icon: User },
];

const SIGN_TOOLS = [
  { kind: "sign-stop", label: "Stop", Icon: Octagon },
  { kind: "sign-yield", label: "Yield", Icon: Triangle },
  { kind: "sign-oneway", label: "One Way", Icon: MoveUpRight },
  { kind: "sign-noentry", label: "No Entry", Icon: Ban },
  { kind: "sign-light", label: "Signal", Icon: Lightbulb },
  { kind: "sign-speed", label: "Speed", Icon: Gauge },
];

const SIGNAL_STATES = [
  { key: "red", label: "Red" },
  { key: "amber", label: "Amber" },
  { key: "green", label: "Green" },
  { key: "greenLeft", label: "Arrow" },
  { key: "redFlash", label: "Flashing" },
  { key: "off", label: "Dark" },
];

const VEHICLE_COLORS = [
  { key: "blue", label: "Student", hex: COLORS.blue },
  { key: "red", label: "Other car A", hex: COLORS.red },
  { key: "green", label: "Other car B", hex: COLORS.green },
  { key: "orange", label: "Other car C", hex: COLORS.orange },
];

// Real vehicle footprints, metres (length along travel, width across)
const ITEM_DIMS = {
  car: { l: 4.5, w: 1.8 },
  truck: { l: 9.0, w: 2.55 },
  bike: { l: 1.75, w: 0.62 },
  pedestrian: { l: 0.4, w: 0.55 },
};
// Signs are the one deliberate exaggeration: a real 0.75 m sign face would be
// 18 px and unreadable, so signage renders as a map symbol.
const SIGN_R = 20;

function itemHalf(kind) {
  if (kind.startsWith("sign-")) return { hl: SIGN_R, hw: SIGN_R };
  const d = ITEM_DIMS[kind] || { l: 2, w: 2 };
  return { hl: M(d.l) / 2, hw: M(d.w) / 2 };
}

/* A 0.55 m pedestrian is 13 px across — far below the ~44 px minimum touch
   target. Hit areas are therefore floored, independently of what is drawn. */
const HIT_MIN = 22;
function itemHitHalf(kind) {
  const { hl, hw } = itemHalf(kind);
  return { hl: Math.max(hl, HIT_MIN), hw: Math.max(hw, HIT_MIN) };
}

// Point-in-rotated-box: transform the point into the item's local frame.
function itemHit(p, it) {
  const { hl, hw } = itemHitHalf(it.kind);
  const a = (it.rotation || 0) * Math.PI / 180;
  const dx = p.x - it.x, dy = p.y - it.y;
  const lx = dx * Math.cos(a) + dy * Math.sin(a);
  const ly = -dx * Math.sin(a) + dy * Math.cos(a);
  return Math.abs(lx) <= hl && Math.abs(ly) <= hw;
}

// Topmost first, so the item drawn last (visually on top) wins.
function topItemAt(p, items) {
  for (let i = items.length - 1; i >= 0; i--) {
    if (itemHit(p, items[i])) return items[i];
  }
  return null;
}

// Free rotation with a magnetic pull toward 15° increments.
function aimAngle(cx, cy, px, py) {
  let deg = (Math.atan2(py - cy, px - cx) * 180) / Math.PI;
  const step = Math.round(deg / 15) * 15;
  if (Math.abs(deg - step) < 5) deg = step;
  return (Math.round(deg) + 360) % 360;
}

const ROAD_WIDTHS = [
  { key: "narrow", label: "1 lane", width: M(LANE_W), lanes: 1 },
  { key: "two", label: "2 lane", width: M(LANE_W * 2), lanes: 2 },
  { key: "wide", label: "4 lane", width: M(LANE_W * 4), lanes: 4 },
];

const ARROW_COLORS = ["blue", "green", "red", "orange"];
const uid = () => Math.random().toString(36).slice(2, 10);
const clone = (o) => JSON.parse(JSON.stringify(o));

function getSVGPoint(svgEl, e) {
  const pt = svgEl.createSVGPoint();
  pt.x = e.clientX;
  pt.y = e.clientY;
  const m = svgEl.getScreenCTM().inverse();
  const p = pt.matrixTransform(m);
  return { x: p.x, y: p.y };
}

/* ---------------- Road geometry helpers ---------------- */
function offsetPolyline(points, dist) {
  const n = points.length;
  if (n < 2) return points;
  const normals = [];
  for (let i = 0; i < n - 1; i++) {
    const dx = points[i + 1].x - points[i].x;
    const dy = points[i + 1].y - points[i].y;
    const len = Math.hypot(dx, dy) || 1;
    normals.push({ x: -dy / len, y: dx / len });
  }
  return points.map((p, i) => {
    let nx, ny;
    if (i === 0) { nx = normals[0].x; ny = normals[0].y; }
    else if (i === n - 1) { nx = normals[n - 2].x; ny = normals[n - 2].y; }
    else {
      const a = normals[i - 1], b = normals[i];
      let sx = a.x + b.x, sy = a.y + b.y;
      const l = Math.hypot(sx, sy) || 1;
      sx /= l; sy /= l;
      const cos = a.x * b.x + a.y * b.y;
      const miter = Math.min(2.5, 1 / Math.max(0.35, Math.sqrt(Math.max(0, (1 + cos) / 2))));
      nx = sx * miter; ny = sy * miter;
    }
    return { x: p.x + nx * dist, y: p.y + ny * dist };
  });
}

function segIntersect(p1, p2, p3, p4) {
  const d = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x);
  if (Math.abs(d) < 1e-9) return null;
  const t = ((p3.x - p1.x) * (p4.y - p3.y) - (p3.y - p1.y) * (p4.x - p3.x)) / d;
  const u = ((p3.x - p1.x) * (p2.y - p1.y) - (p3.y - p1.y) * (p2.x - p1.x)) / d;
  const e = 0.02;
  if (t < -e || t > 1 + e || u < -e || u > 1 + e) return null;
  return { x: p1.x + t * (p2.x - p1.x), y: p1.y + t * (p2.y - p1.y) };
}

function isEndpoint(seg, pt, tol = 14) {
  const a = seg.points[0], b = seg.points[seg.points.length - 1];
  return Math.hypot(pt.x - a.x, pt.y - a.y) < tol || Math.hypot(pt.x - b.x, pt.y - b.y) < tol;
}

function computeIntersections(segments) {
  const out = {};
  segments.forEach((s) => { out[s.id] = []; });
  for (let i = 0; i < segments.length; i++) {
    for (let j = i + 1; j < segments.length; j++) {
      const A = segments[i], B = segments[j];
      for (let a = 0; a < A.points.length - 1; a++) {
        for (let b = 0; b < B.points.length - 1; b++) {
          const hit = segIntersect(A.points[a], A.points[a + 1], B.points[b], B.points[b + 1]);
          if (!hit) continue;
          if (isEndpoint(A, hit) && isEndpoint(B, hit)) continue; // continuation
          out[A.id].push({ x: hit.x, y: hit.y, r: B.width / 2 + M(0.5) });
          out[B.id].push({ x: hit.x, y: hit.y, r: A.width / 2 + M(0.5) });
        }
      }
    }
  }
  return out;
}

function projectOnSeg(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return { ...a };
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return { x: a.x + t * dx, y: a.y + t * dy };
}

function snapToNetwork(p, segments) {
  let best = null, bestD = Infinity;
  for (const s of segments) {
    for (const e of [s.points[0], s.points[s.points.length - 1]]) {
      const d = Math.hypot(p.x - e.x, p.y - e.y);
      if (d < M(2) && d < bestD) { best = { x: e.x, y: e.y }; bestD = d; }
    }
  }
  if (best) return best;
  for (const s of segments) {
    for (let i = 0; i < s.points.length - 1; i++) {
      const proj = projectOnSeg(p, s.points[i], s.points[i + 1]);
      const d = Math.hypot(p.x - proj.x, p.y - proj.y);
      if (d < s.width / 2 + M(1) && d < bestD) { best = proj; bestD = d; }
    }
  }
  return best || p;
}

/* ---------------- Template renderer ---------------- */
function Shape({ s, mode }) {
  const isEdge = mode === "edge", isIsland = mode === "island";
  const fill = isEdge ? COLORS.edge : isIsland ? COLORS.shoulder : COLORS.asphalt;
  const stroke = isEdge ? COLORS.edge : isIsland ? COLORS.edge : "none";
  const sw = isEdge ? MARK_PX * 2 : isIsland ? MARK_PX : 0;
  const common = { fill, stroke, strokeWidth: sw, strokeLinejoin: "round" };

  if (s.t === "rect") return <rect x={s.x} y={s.y} width={s.w} height={s.h} {...common} />;
  if (s.t === "poly") return <polygon points={s.pts.map((p) => p.join(",")).join(" ")} {...common} />;
  if (s.t === "circle") return <circle cx={s.cx} cy={s.cy} r={s.r} {...common} />;
  if (s.t === "stroke") {
    return (
      <path d={s.d} fill="none" stroke={isEdge ? COLORS.edge : COLORS.asphalt}
        strokeWidth={s.w + (isEdge ? MARK_PX * 2 : 0)}
        strokeLinecap={s.cap || "butt"} strokeLinejoin="round" />
    );
  }
  return null;
}

function markStyle(s) {
  switch (s) {
    case "lane": return { stroke: COLORS.edge, strokeWidth: MARK_PX, strokeDasharray: DASH_LANE };
    case "centre": return { stroke: COLORS.lane, strokeWidth: MARK_PX, strokeDasharray: DASH_CENTRE };
    case "centre-white": return { stroke: COLORS.edge, strokeWidth: MARK_PX, strokeDasharray: DASH_CENTRE };
    case "centreSolid": return { stroke: COLORS.lane, strokeWidth: MARK_PX };
    case "stop": return { stroke: COLORS.edge, strokeWidth: STOP_BAR };
    case "giveway": return { stroke: COLORS.edge, strokeWidth: MARK_PX * 1.4, strokeDasharray: "11 11" };
    default: return { stroke: COLORS.edge, strokeWidth: MARK_PX };
  }
}

function Mark({ m, idx }) {
  if (m.t === "line") {
    const [ax, ay] = m.a, [bx, by] = m.b;
    if (m.s === "centre2") {
      // double yellow: two solid lines a paint-width apart
      const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1;
      const nx = (-dy / len) * MARK_PX, ny = (dx / len) * MARK_PX;
      return (
        <g stroke={COLORS.lane} strokeWidth={MARK_PX}>
          <line x1={ax + nx} y1={ay + ny} x2={bx + nx} y2={by + ny} />
          <line x1={ax - nx} y1={ay - ny} x2={bx - nx} y2={by - ny} />
        </g>
      );
    }
    return <line x1={ax} y1={ay} x2={bx} y2={by} {...markStyle(m.s)} />;
  }

  if (m.t === "ring") {
    return <circle cx={m.cx} cy={m.cy} r={m.r} fill="none" {...markStyle(m.s)} />;
  }

  if (m.t === "arrow") {
    const d = ARROW_PATHS[m.k] || ARROW_PATHS.through;
    const flip = ARROW_MIRROR[m.k] ? " scale(1,-1)" : "";
    return (
      <path d={d} fill={COLORS.edge} opacity={0.95}
        transform={`translate(${m.x},${m.y}) rotate(${m.rot})${flip}`} />
    );
  }

  if (m.t === "crosswalk") {
    const [ax, ay] = m.a, [bx, by] = m.b;
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    const nx = -uy, ny = ux;
    const barW = M(0.5), pitch = M(0.95);
    const n = Math.max(1, Math.floor((len - barW) / pitch));
    const inset = (len - (n * pitch - (pitch - barW))) / 2;
    const bars = [];
    for (let i = 0; i < n; i++) {
      const t = inset + i * pitch + barW / 2;
      const px = ax + ux * t, py = ay + uy * t;
      bars.push(
        <line key={i} x1={px} y1={py} x2={px + nx * m.depth} y2={py + ny * m.depth}
          stroke={COLORS.edge} strokeWidth={barW} />
      );
    }
    return <g>{bars}</g>;
  }

  if (m.t === "hatch") {
    const id = `dd-hatch-${idx}`;
    const xs = m.pts.map((p) => p[0]), ys = m.pts.map((p) => p[1]);
    const x0 = Math.min(...xs) - 200, x1 = Math.max(...xs) + 200;
    const y0 = Math.min(...ys) - 200, y1 = Math.max(...ys) + 200;
    const stripes = [];
    for (let x = x0; x < x1; x += M(1.6)) {
      stripes.push(<line key={x} x1={x} y1={y1} x2={x + (y1 - y0) * 0.55} y2={y0} />);
    }
    return (
      <g>
        <defs><clipPath id={id}><polygon points={m.pts.map((p) => p.join(",")).join(" ")} /></clipPath></defs>
        <g clipPath={`url(#${id})`} stroke={COLORS.edge} strokeWidth={M(0.25)}>{stripes}</g>
        <polygon points={m.pts.map((p) => p.join(",")).join(" ")} fill="none"
          stroke={COLORS.edge} strokeWidth={MARK_PX} />
      </g>
    );
  }
  return null;
}

function TemplateLayer({ tpl }) {
  if (!tpl) return null;
  const { surface = [], islands = [], marks = [] } = tpl;
  return (
    <>
      <g>{surface.map((s, i) => <Shape key={`e${i}`} s={s} mode="edge" />)}</g>
      <g>{surface.map((s, i) => <Shape key={`a${i}`} s={s} mode="asphalt" />)}</g>
      <g>{islands.map((s, i) => <Shape key={`i${i}`} s={s} mode="island" />)}</g>
      <g pointerEvents="none" strokeLinecap="butt">
        {marks.map((m, i) => <Mark key={i} m={m} idx={i} />)}
      </g>
    </>
  );
}

/* ---------------- Ground ---------------- */
function Ground() {
  return (
    <g pointerEvents="none">
      <rect x={-2000} y={-2000} width={5000} height={5000} fill={COLORS.shoulder} />
      {GRASS_TUFTS.map((t, i) => (
        <ellipse key={i} cx={t.x} cy={t.y} rx={t.rx} ry={t.ry}
          transform={`rotate(${t.rot} ${t.x} ${t.y})`}
          fill={t.light ? shade(COLORS.shoulder, 0.09) : COLORS.shoulderDark}
          opacity={t.o} />
      ))}
    </g>
  );
}

/* ---------------- Custom road segments ---------------- */
function segPath(seg) {
  return "M " + seg.points.map((p) => `${p.x},${p.y}`).join(" L ");
}
const ptsPath = (pts) => "M " + pts.map((p) => `${p.x},${p.y}`).join(" L ");

function RoadMarkings({ seg, maskId }) {
  const lanes = seg.lanes ?? (seg.center ? 2 : 1);
  const els = [];
  if (lanes === 2) {
    els.push(<path key="c" d={segPath(seg)} stroke={COLORS.lane} strokeWidth={MARK_PX}
      strokeDasharray={DASH_CENTRE} fill="none" />);
  } else if (lanes === 4) {
    const off = seg.width / 4;
    els.push(<path key="c1" d={ptsPath(offsetPolyline(seg.points, -MARK_PX))} stroke={COLORS.lane} strokeWidth={MARK_PX} fill="none" />);
    els.push(<path key="c2" d={ptsPath(offsetPolyline(seg.points, MARK_PX))} stroke={COLORS.lane} strokeWidth={MARK_PX} fill="none" />);
    els.push(<path key="l1" d={ptsPath(offsetPolyline(seg.points, -off))} stroke={COLORS.edge} strokeWidth={MARK_PX} strokeDasharray={DASH_LANE} fill="none" />);
    els.push(<path key="l2" d={ptsPath(offsetPolyline(seg.points, off))} stroke={COLORS.edge} strokeWidth={MARK_PX} strokeDasharray={DASH_LANE} fill="none" />);
  }
  if (!els.length) return null;
  return (
    <g mask={maskId ? `url(#${maskId})` : undefined} pointerEvents="none"
      strokeLinecap="butt" strokeLinejoin="round">{els}</g>
  );
}

function CustomRoads({ segments, intersections, onSegmentPointerDown, interactive }) {
  if (!segments.length) return null;
  return (
    <g>
      <defs>
        {segments.map((s) => {
          const js = intersections[s.id] || [];
          if (!js.length) return null;
          return (
            <mask key={s.id} id={`dd-jm-${s.id}`} maskUnits="userSpaceOnUse">
              <rect x={0} y={0} width={W} height={H} fill="#fff" />
              {js.map((j, i) => <circle key={i} cx={j.x} cy={j.y} r={j.r} fill="#000" />)}
            </mask>
          );
        })}
      </defs>
      {segments.map((s) => (
        <path key={"e" + s.id} d={segPath(s)} stroke={COLORS.edge} strokeWidth={s.width + MARK_PX * 2}
          fill="none" strokeLinecap="round" strokeLinejoin="round" />
      ))}
      {segments.map((s) => (
        <path key={"a" + s.id} d={segPath(s)} stroke={COLORS.asphalt} strokeWidth={s.width}
          fill="none" strokeLinecap="round" strokeLinejoin="round"
          onPointerDown={(e) => interactive && onSegmentPointerDown(e, s)}
          style={{ cursor: interactive ? "pointer" : "default" }} />
      ))}
      {segments.map((s) => (
        <RoadMarkings key={"m" + s.id} seg={s}
          maskId={(intersections[s.id] || []).length ? `dd-jm-${s.id}` : null} />
      ))}
    </g>
  );
}

/* ---------------- Vehicles, people and signage ---------------- */
function ItemGraphic({ kind, color, signal }) {
  const c = VEHICLE_COLORS.find((v) => v.key === color)?.hex || COLORS.blue;
  const o = COLORS.ink;
  const glass = "#CFE3F0";

  if (kind === "car") {
    const L = M(4.5), Wd = M(1.8);
    const wheel = (wx, wy) => (
      <rect x={wx - M(0.36)} y={wy - M(0.14)} width={M(0.72)} height={M(0.28)} rx={M(0.11)}
        fill="#1D2026" stroke={o} strokeWidth={1.5} />
    );
    const cabX = -M(1.45), cabW = M(2.6);
    return (
      <g>
        {wheel(L / 2 - M(1.05), -Wd / 2)}
        {wheel(L / 2 - M(1.05), Wd / 2)}
        {wheel(-L / 2 + M(0.95), -Wd / 2)}
        {wheel(-L / 2 + M(0.95), Wd / 2)}
        {/* body */}
        <rect x={-L / 2} y={-Wd / 2} width={L} height={Wd} rx={M(0.55)}
          fill={c} stroke={o} strokeWidth={3} />
        {/* long highlight down the flank */}
        <rect x={-L / 2 + M(0.3)} y={-Wd / 2 + M(0.16)} width={L - M(0.6)} height={M(0.22)} rx={M(0.11)}
          fill="#fff" opacity={0.3} />
        {/* cabin */}
        <rect x={cabX} y={-Wd / 2 + M(0.17)} width={cabW} height={Wd - M(0.34)} rx={M(0.34)}
          fill={shade(c, -0.14)} stroke={o} strokeWidth={2} />
        {/* windscreen + rear window */}
        <path d={`M ${cabX + cabW - M(0.62)},${-Wd / 2 + M(0.24)}
                  L ${cabX + cabW},${-Wd / 2 + M(0.5)}
                  L ${cabX + cabW},${Wd / 2 - M(0.5)}
                  L ${cabX + cabW - M(0.62)},${Wd / 2 - M(0.24)} Z`}
          fill={glass} stroke={o} strokeWidth={1.5} />
        <path d={`M ${cabX + M(0.55)},${-Wd / 2 + M(0.26)}
                  L ${cabX},${-Wd / 2 + M(0.5)}
                  L ${cabX},${Wd / 2 - M(0.5)}
                  L ${cabX + M(0.55)},${Wd / 2 - M(0.26)} Z`}
          fill={glass} opacity={0.75} stroke={o} strokeWidth={1.5} />
        {/* mirrors */}
        <rect x={cabX + cabW - M(0.5)} y={-Wd / 2 - M(0.16)} width={M(0.3)} height={M(0.18)} rx={M(0.07)} fill={shade(c, -0.2)} stroke={o} strokeWidth={1.2} />
        <rect x={cabX + cabW - M(0.5)} y={Wd / 2 - M(0.02)} width={M(0.3)} height={M(0.18)} rx={M(0.07)} fill={shade(c, -0.2)} stroke={o} strokeWidth={1.2} />
        {/* lights */}
        <rect x={L / 2 - M(0.34)} y={-Wd / 2 + M(0.16)} width={M(0.26)} height={M(0.42)} rx={M(0.09)} fill="#FFE9A8" stroke={o} strokeWidth={1.2} />
        <rect x={L / 2 - M(0.34)} y={Wd / 2 - M(0.58)} width={M(0.26)} height={M(0.42)} rx={M(0.09)} fill="#FFE9A8" stroke={o} strokeWidth={1.2} />
        <rect x={-L / 2 + M(0.08)} y={-Wd / 2 + M(0.18)} width={M(0.22)} height={M(0.38)} rx={M(0.08)} fill="#E05252" stroke={o} strokeWidth={1.2} />
        <rect x={-L / 2 + M(0.08)} y={Wd / 2 - M(0.56)} width={M(0.22)} height={M(0.38)} rx={M(0.08)} fill="#E05252" stroke={o} strokeWidth={1.2} />
      </g>
    );
  }

  if (kind === "truck") {
    const L = M(9), Wd = M(2.55);
    const cabL = M(2.4);
    const wheel = (wx, wy) => (
      <rect x={wx - M(0.45)} y={wy - M(0.16)} width={M(0.9)} height={M(0.32)} rx={M(0.12)}
        fill="#1D2026" stroke={o} strokeWidth={1.5} />
    );
    return (
      <g>
        {wheel(L / 2 - M(1.4), -Wd / 2)}
        {wheel(L / 2 - M(1.4), Wd / 2)}
        {wheel(-L / 2 + M(2.4), -Wd / 2)}
        {wheel(-L / 2 + M(2.4), Wd / 2)}
        {wheel(-L / 2 + M(1.2), -Wd / 2)}
        {wheel(-L / 2 + M(1.2), Wd / 2)}
        {/* box body */}
        <rect x={-L / 2} y={-Wd / 2} width={L - cabL} height={Wd} rx={M(0.22)}
          fill="#EEF0F2" stroke={o} strokeWidth={3} />
        <rect x={-L / 2 + M(0.25)} y={-Wd / 2 + M(0.2)} width={L - cabL - M(0.5)} height={M(0.26)} rx={M(0.12)} fill="#fff" opacity={0.85} />
        {[1, 2, 3].map((i) => (
          <line key={i} x1={-L / 2 + (i * (L - cabL)) / 4} y1={-Wd / 2 + M(0.12)}
            x2={-L / 2 + (i * (L - cabL)) / 4} y2={Wd / 2 - M(0.12)}
            stroke={o} strokeWidth={1.5} opacity={0.35} />
        ))}
        {/* cab */}
        <rect x={L / 2 - cabL} y={-Wd / 2} width={cabL} height={Wd} rx={M(0.4)}
          fill={c} stroke={o} strokeWidth={3} />
        <rect x={L / 2 - cabL + M(0.2)} y={-Wd / 2 + M(0.18)} width={cabL - M(0.4)} height={M(0.24)} rx={M(0.11)} fill="#fff" opacity={0.3} />
        <path d={`M ${L / 2 - M(0.95)},${-Wd / 2 + M(0.3)}
                  L ${L / 2 - M(0.3)},${-Wd / 2 + M(0.6)}
                  L ${L / 2 - M(0.3)},${Wd / 2 - M(0.6)}
                  L ${L / 2 - M(0.95)},${Wd / 2 - M(0.3)} Z`}
          fill={glass} stroke={o} strokeWidth={1.5} />
        <rect x={L / 2 - M(1.1)} y={-Wd / 2 - M(0.2)} width={M(0.34)} height={M(0.22)} rx={M(0.08)} fill={shade(c, -0.2)} stroke={o} strokeWidth={1.2} />
        <rect x={L / 2 - M(1.1)} y={Wd / 2 - M(0.02)} width={M(0.34)} height={M(0.22)} rx={M(0.08)} fill={shade(c, -0.2)} stroke={o} strokeWidth={1.2} />
      </g>
    );
  }

  if (kind === "bike") {
    const L = M(1.75), Wd = M(0.62);
    return (
      <g>
        <ellipse cx={-L / 2 + M(0.34)} cy={0} rx={M(0.34)} ry={M(0.12)} fill="#1D2026" stroke={o} strokeWidth={1.5} />
        <ellipse cx={L / 2 - M(0.34)} cy={0} rx={M(0.34)} ry={M(0.12)} fill="#1D2026" stroke={o} strokeWidth={1.5} />
        <rect x={-L / 2 + M(0.28)} y={-M(0.09)} width={L - M(0.56)} height={M(0.18)} rx={M(0.08)} fill={c} stroke={o} strokeWidth={1.5} />
        {/* handlebars */}
        <rect x={M(0.24)} y={-Wd / 2 - M(0.04)} width={M(0.12)} height={Wd + M(0.08)} rx={M(0.05)} fill={shade(c, -0.2)} stroke={o} strokeWidth={1.2} />
        {/* rider */}
        <circle cx={-M(0.1)} cy={0} r={M(0.27)} fill={shade(c, 0.1)} stroke={o} strokeWidth={2} />
        <circle cx={-M(0.1)} cy={0} r={M(0.13)} fill="#2A2D33" />
      </g>
    );
  }

  if (kind === "pedestrian") {
    return (
      <g>
        <circle cx={0} cy={0} r={M(0.62)} fill="none" stroke="#fff" strokeWidth={2.5} opacity={0.5} />
        {/* arms */}
        <ellipse cx={-M(0.02)} cy={-M(0.24)} rx={M(0.09)} ry={M(0.13)} fill={shade(c, -0.12)} stroke={o} strokeWidth={1.2} />
        <ellipse cx={-M(0.02)} cy={M(0.24)} rx={M(0.09)} ry={M(0.13)} fill={shade(c, -0.12)} stroke={o} strokeWidth={1.2} />
        {/* shoulders */}
        <ellipse cx={-M(0.02)} cy={0} rx={M(0.19)} ry={M(0.28)} fill={c} stroke={o} strokeWidth={2} />
        {/* head from above */}
        <circle cx={M(0.05)} cy={0} r={M(0.14)} fill="#2A2D33" stroke={o} strokeWidth={1.2} />
        <circle cx={M(0.08)} cy={-M(0.04)} r={M(0.05)} fill="#fff" opacity={0.35} />
      </g>
    );
  }

  const R = SIGN_R;
  const post = <ellipse cx={0} cy={R * 0.55} rx={R * 0.5} ry={R * 0.2} fill="#000" opacity={0.22} />;
  switch (kind) {
    case "sign-stop":
      return (
        <g>
          {post}
          <polygon points={`${-R * 0.65},${-R} ${R * 0.65},${-R} ${R},${-R * 0.65} ${R},${R * 0.65} ${R * 0.65},${R} ${-R * 0.65},${R} ${-R},${R * 0.65} ${-R},${-R * 0.65}`}
            fill={COLORS.red} stroke="#fff" strokeWidth={3.5} />
          <polygon points={`${-R * 0.65},${-R} ${R * 0.65},${-R} ${R},${-R * 0.65} ${R},${R * 0.65} ${R * 0.65},${R} ${-R * 0.65},${R} ${-R},${R * 0.65} ${-R},${-R * 0.65}`}
            fill="none" stroke={o} strokeWidth={2} />
          <text x={0} y={5} fontSize={12} fontWeight="700" fill="#fff" textAnchor="middle" fontFamily={FONT_DISPLAY}>STOP</text>
        </g>
      );
    case "sign-yield":
      return (
        <g>
          {post}
          <polygon points={`${-R * 1.1},${-R * 0.8} ${R * 1.1},${-R * 0.8} 0,${R * 1.1}`}
            fill="#fff" stroke={COLORS.red} strokeWidth={5} strokeLinejoin="round" />
          <polygon points={`${-R * 1.1},${-R * 0.8} ${R * 1.1},${-R * 0.8} 0,${R * 1.1}`}
            fill="none" stroke={o} strokeWidth={2} strokeLinejoin="round" />
          <text x={0} y={R * 0.3} fontSize={10} fontWeight="700" fill={COLORS.red} textAnchor="middle" fontFamily={FONT_DISPLAY}>YIELD</text>
        </g>
      );
    case "sign-oneway":
      return (
        <g>
          {post}
          <rect x={-R * 1.35} y={-R * 0.8} width={R * 2.7} height={R * 1.6} rx={4} fill={COLORS.ink} stroke="#fff" strokeWidth={2.5} />
          <path d={`M ${-R * 0.8},0 L ${R * 0.8},0 M ${R * 0.3},${-R * 0.5} L ${R * 0.8},0 L ${R * 0.3},${R * 0.5}`}
            stroke="#fff" strokeWidth={3.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      );
    case "sign-noentry":
      return (
        <g>
          {post}
          <circle cx={0} cy={0} r={R} fill={COLORS.red} stroke="#fff" strokeWidth={3.5} />
          <circle cx={0} cy={0} r={R} fill="none" stroke={o} strokeWidth={2} />
          <rect x={-R * 0.6} y={-R * 0.22} width={R * 1.2} height={R * 0.44} rx={3} fill="#fff" stroke={o} strokeWidth={1.2} />
        </g>
      );
    case "sign-light": {
      const st = signal || "red";
      const lit = {
        red: st === "red" || st === "redFlash",
        amber: st === "amber",
        green: st === "green",
      };
      const lamp = (ly, col, on, flashing) => (
        <g className={flashing ? "dd-flash" : undefined}>
          {on && <circle cx={0} cy={ly} r={R * 0.52} fill={col} opacity={0.32} />}
          <circle cx={0} cy={ly} r={R * 0.3} fill={on ? col : shade(col, -0.4)}
            opacity={on ? 1 : 0.45} stroke={o} strokeWidth={1.2} />
          {on && <circle cx={-R * 0.09} cy={ly - R * 0.09} r={R * 0.08} fill="#fff" opacity={0.55} />}
        </g>
      );
      return (
        <g>
          {post}
          <rect x={-R * 0.58} y={-R * 1.15} width={R * 1.16} height={R * 2.3} rx={6}
            fill="#2A2E36" stroke={o} strokeWidth={2.5} />
          {lamp(-R * 0.66, COLORS.red, lit.red, st === "redFlash")}
          {lamp(0, COLORS.lane, lit.amber, false)}
          {st === "greenLeft" ? (
            <g>
              <circle cx={0} cy={R * 0.66} r={R * 0.52} fill={COLORS.green} opacity={0.3} />
              <circle cx={0} cy={R * 0.66} r={R * 0.3} fill={shade(COLORS.green, -0.4)}
                opacity={0.5} stroke={o} strokeWidth={1.2} />
              <path d={`M ${-R * 0.2},${R * 0.66} L ${R * 0.05},${R * 0.66 - R * 0.19}
                        L ${R * 0.05},${R * 0.66 + R * 0.19} Z`} fill={COLORS.green} />
              <rect x={R * 0.02} y={R * 0.66 - R * 0.06} width={R * 0.16} height={R * 0.12} fill={COLORS.green} />
            </g>
          ) : lamp(R * 0.66, COLORS.green, lit.green, false)}
        </g>
      );
    }
    case "sign-speed":
      return (
        <g>
          {post}
          <rect x={-R} y={-R} width={R * 2} height={R * 2} rx={5} fill="#fff" stroke={o} strokeWidth={3} />
          <rect x={-R * 0.82} y={-R * 0.82} width={R * 1.64} height={R * 1.64} rx={3} fill="none" stroke={o} strokeWidth={1.5} opacity={0.35} />
          <text x={0} y={R * 0.42} fontSize={R * 1.1} fontWeight="700" fill={COLORS.ink} textAnchor="middle" fontFamily={FONT_DISPLAY}>30</text>
        </g>
      );
    default:
      return null;
  }
}

/* ---------------- Signal state swatch (toolbar) ---------------- */
function SignalSwatch({ state }) {
  const on = (k) => state === k || (k === "red" && state === "redFlash");
  const dot = (cy, col, lit, arrow) => (
    <g>
      <circle cx={9} cy={cy} r={3.6} fill={lit ? col : shade(col, -0.42)} opacity={lit ? 1 : 0.4} />
      {arrow && <path d="M 6.4,20 L 10.4,17.4 L 10.4,22.6 Z" fill={COLORS.green} />}
    </g>
  );
  return (
    <svg width={18} height={30} viewBox="0 0 18 30" style={{ flex: "0 0 auto" }}>
      <rect x={2.5} y={2} width={13} height={26} rx={3.5} fill="#2A2E36" stroke={COLORS.ink} strokeWidth={1.5} />
      {dot(8, COLORS.red, on("red"))}
      {dot(15, COLORS.lane, on("amber"))}
      {state === "greenLeft"
        ? dot(22, COLORS.green, false, true)
        : dot(22, COLORS.green, on("green"))}
    </svg>
  );
}

/* ---------------- Floating mini toolbar ---------------- */
function MiniToolbar({ x, y, vb, children }) {
  const w = 240, h = 46;
  // Keep the bubble on screen even when its object sits near an edge.
  let cx = x, cy = y;
  if (vb) {
    cx = Math.max(vb.x + w / 2 + 6, Math.min(vb.x + vb.w - w / 2 - 6, x));
    cy = Math.max(vb.y + 6, Math.min(vb.y + vb.h - h - 6, y));
  }
  return (
    <foreignObject x={cx - w / 2} y={cy} width={w} height={h}
      data-transient="1" style={{ overflow: "visible" }}>
      <div xmlns="http://www.w3.org/1999/xhtml" style={{
        display: "flex", gap: 5, justifyContent: "center", pointerEvents: "auto"
      }}>
        {children}
      </div>
    </foreignObject>
  );
}
function MiniBtn({ onClick, title, children }) {
  return (
    <button onPointerDown={(e) => e.stopPropagation()} onClick={onClick} title={title} aria-label={title}
      style={{
        background: "rgba(44,47,52,0.95)", border: "1px solid rgba(255,255,255,0.16)", borderRadius: 8,
        color: COLORS.edge, width: 40, height: 40, display: "flex", alignItems: "center",
        justifyContent: "center", cursor: "pointer", fontSize: 15,
        boxShadow: "0 4px 14px rgba(0,0,0,0.4)",
      }}>
      {children}
    </button>
  );
}

/* ---------------- Scale bar ---------------- */
function ScaleBar({ vb, lift }) {
  const len = M(10);
  const x = vb.x + vb.w - len - 26;
  const y = vb.y + vb.h - 24 - (lift || 0);
  return (
    <g pointerEvents="none" opacity={0.94}>
      <rect x={x - 10} y={y - 22} width={len + 20} height={32} rx={6} fill="#0C0E11" opacity={0.5} />
      <line x1={x} y1={y} x2={x + len} y2={y} stroke="#fff" strokeWidth={3} />
      <line x1={x} y1={y - 6} x2={x} y2={y + 4} stroke="#fff" strokeWidth={3} />
      <line x1={x + len / 2} y1={y - 4} x2={x + len / 2} y2={y + 2} stroke="#fff" strokeWidth={2} />
      <line x1={x + len} y1={y - 6} x2={x + len} y2={y + 4} stroke="#fff" strokeWidth={3} />
      <text x={x + len / 2} y={y - 8} fontSize={14} fontWeight="700" fill="#fff" textAnchor="middle"
        fontFamily={FONT_DISPLAY}>10 m</text>
    </g>
  );
}

/* ================= MAIN APP ================= */
export default function DriveDraw() {
  const [roadTemplate, setRoadTemplate] = useState("crossroad");
  const [roadSegments, setRoadSegments] = useState([]);
  const [roadWidth, setRoadWidth] = useState("two");
  const [items, setItems] = useState([]);
  const [arrows, setArrows] = useState([]);
  const [texts, setTexts] = useState([]);
  const [paths, setPaths] = useState([]);
  const [tool, setTool] = useState("select");
  const [activeColor, setActiveColor] = useState("blue");
  const [signalState, setSignalState] = useState("red");
  const [selected, setSelected] = useState(null);
  const [editingTextId, setEditingTextId] = useState(null);
  const [history, setHistory] = useState({ past: [], future: [] });
  const [saveOpen, setSaveOpen] = useState(false);
  const [loadOpen, setLoadOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [savedList, setSavedList] = useState([]);
  const [status, setStatus] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [uiHidden, setUiHidden] = useState(false);
  const [size, setSize] = useState({ w: 1000, h: 640 });
  const [view, setView] = useState({ zoom: 1, panX: 0, panY: 0 });
  const [lowFx, setLowFx] = useState(false);
  const [exporting, setExporting] = useState(false);

  const wrapRef = useRef(null);
  const svgRef = useRef(null);
  const dragRef = useRef(null);
  const drawRef = useRef(null);
  const pointersRef = useRef(new Map());
  const gestureRef = useRef(null);
  const cancelEditRef = useRef(false);
  const [drawPreview, setDrawPreview] = useState(null);
  const [placeGuide, setPlaceGuide] = useState(null);

  // Abort whatever single-finger action is in flight, without committing it.
  const cancelActiveDraw = useCallback(() => {
    const d = drawRef.current;
    if (d?.mode === "aim") {
      // the object stays where it is; only the aiming gesture stops
      setPlaceGuide(null);
    }
    drawRef.current = null;
    dragRef.current = null;
    setDrawPreview(null);
    setPlaceGuide(null);
  }, []);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setSize({
      w: Math.max(1, el.clientWidth), h: Math.max(1, el.clientHeight),
    });
    measure();
    let ro;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(measure);
      ro.observe(el);
    }
    window.addEventListener("resize", measure);
    return () => {
      if (ro) ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  const narrow = size.w < 780;

  // Fit the design frame to the container's aspect, so spare space becomes
  // more ground rather than letterbox bars, then apply zoom/pan on top.
  const vb = (() => {
    const aspect = size.w / size.h, base = W / H;
    let w = W, h = H, x = 0, y = 0;
    if (aspect > base) { w = H * aspect; x = (W - w) / 2; }
    else { h = W / aspect; y = (H - h) / 2; }
    const zw = w / view.zoom, zh = h / view.zoom;
    return {
      x: x + (w - zw) / 2 + view.panX,
      y: y + (h - zh) / 2 + view.panY,
      w: zw, h: zh,
    };
  })();
  const worldPerPx = vb.h / Math.max(1, size.h);

  const MIN_ZOOM = 0.5, MAX_ZOOM = 6;
  const clampZoom = (z) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));

  // Zoom about a fixed point in world space, so pinching keeps the road
  // under your fingers rather than jumping to the centre.
  const zoomAbout = useCallback((factor, worldPt) => {
    setView((v) => {
      const z = clampZoom(v.zoom * factor);
      const applied = z / v.zoom;
      if (applied === 1) return v;
      if (!worldPt) return { ...v, zoom: z };
      const aspect = size.w / size.h, base = W / H;
      let w = W, h = H, x = 0, y = 0;
      if (aspect > base) { w = H * aspect; x = (W - w) / 2; }
      else { h = W / aspect; y = (H - h) / 2; }
      const cur = {
        x: x + (w - w / v.zoom) / 2 + v.panX,
        y: y + (h - h / v.zoom) / 2 + v.panY,
        w: w / v.zoom, h: h / v.zoom,
      };
      const fx = (worldPt.x - cur.x) / cur.w;
      const fy = (worldPt.y - cur.y) / cur.h;
      const nw = w / z, nh = h / z;
      const nx = worldPt.x - fx * nw, ny = worldPt.y - fy * nh;
      return {
        zoom: z,
        panX: nx - (x + (w - nw) / 2),
        panY: ny - (y + (h - nh) / 2),
      };
    });
  }, [size.w, size.h]);

  const resetView = () => setView({ zoom: 1, panX: 0, panY: 0 });

  const currentScene = { roadTemplate, roadSegments, items, arrows, texts, paths };

  const snapshotForUndo = useCallback(() => {
    setHistory((h) => ({ past: [...h.past.slice(-49), clone(currentScene)], future: [] }));
  }, [roadTemplate, roadSegments, items, arrows, texts, paths]);

  const applyScene = (scene) => {
    setRoadTemplate(scene.roadTemplate);
    setRoadSegments((scene.roadSegments || []).map((s) => ({
      ...s, lanes: s.lanes ?? (s.center ? 2 : 1),
    })));
    setItems(scene.items || []);
    setArrows(scene.arrows || []);
    setTexts(scene.texts || []);
    setPaths(scene.paths || []);
  };

  const undo = () => {
    setHistory((h) => {
      if (!h.past.length) return h;
      const prev = h.past[h.past.length - 1];
      const cur = clone(currentScene);
      applyScene(prev);
      setSelected(null);
      return { past: h.past.slice(0, -1), future: [...h.future, cur] };
    });
  };
  const redo = () => {
    setHistory((h) => {
      if (!h.future.length) return h;
      const next = h.future[h.future.length - 1];
      const cur = clone(currentScene);
      applyScene(next);
      setSelected(null);
      return { past: [...h.past, cur], future: h.future.slice(0, -1) };
    });
  };

  useEffect(() => {
    const onKey = (e) => {
      const el = e.target;
      const typing = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      const mod = e.metaKey || e.ctrlKey;

      if (e.key === "Escape") {
        // Unwind one layer at a time, innermost first.
        if (editingTextId) return;            // the input handles its own Escape
        if (drawRef.current) { cancelActiveDraw(); return; }
        if (saveOpen || loadOpen) { setSaveOpen(false); setLoadOpen(false); return; }
        if (confirmClear) { setConfirmClear(false); return; }
        if (selected) { setSelected(null); return; }
        if (uiHidden) { setUiHidden(false); return; }
        if (tool !== "select") setTool("select");
        return;
      }
      if (typing) return;

      if (mod && e.key.toLowerCase() === "z" && !e.shiftKey) { e.preventDefault(); undo(); return; }
      if (mod && (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey))) {
        e.preventDefault(); redo(); return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selected) {
        e.preventDefault(); deleteSelected(); return;
      }
      if (mod) return;

      switch (e.key.toLowerCase()) {
        case "v": setTool("select"); break;
        case "e": setTool("erase"); break;
        case "c": setTool("car"); break;
        case "a": setTool("arrow"); break;
        case "t": setTool("text"); break;
        case "b": setTool("pen"); break;
        case "r": setTool("road"); break;
        case "d": if (selected?.type === "item") duplicateSelected(); break;
        case "[": rotateSelected(-15); break;
        case "]": rotateSelected(15); break;
        case "0": resetView(); break;
        case "+": case "=":
          zoomAbout(1.25, { x: vb.x + vb.w / 2, y: vb.y + vb.h / 2 }); break;
        case "-": case "_":
          zoomAbout(1 / 1.25, { x: vb.x + vb.w / 2, y: vb.y + vb.h / 2 }); break;
        default: break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function deleteSelected() {
    if (!selected) return;
    snapshotForUndo();
    if (selected.type === "item") setItems((p) => p.filter((i) => i.id !== selected.id));
    if (selected.type === "arrow") setArrows((p) => p.filter((i) => i.id !== selected.id));
    if (selected.type === "text") setTexts((p) => p.filter((i) => i.id !== selected.id));
    if (selected.type === "path") setPaths((p) => p.filter((i) => i.id !== selected.id));
    if (selected.type === "road") setRoadSegments((p) => p.filter((i) => i.id !== selected.id));
    setSelected(null);
  }

  function isPlacementTool(t) {
    return t === "car" || t === "truck" || t === "bike" || t === "pedestrian" || t.startsWith("sign-");
  }

  /* ---- gesture layer: sits in front of the drawing handlers ---- */
  function screenMid(a, b) { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }

  function clientToWorld(cx, cy) {
    const el = svgRef.current;
    if (!el) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    return {
      x: vb.x + ((cx - r.left) / r.width) * vb.w,
      y: vb.y + ((cy - r.top) / r.height) * vb.h,
    };
  }

  function gesturePointerDown(e) {
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointersRef.current.size === 2) {
      // second finger down: this is a navigation gesture, not a drawing one
      cancelActiveDraw();
      const [a, b] = [...pointersRef.current.values()];
      gestureRef.current = {
        startDist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        startMid: screenMid(a, b),
        startView: { ...view },
      };
      return true;
    }
    return pointersRef.current.size > 1;
  }

  function gesturePointerMove(e) {
    if (!pointersRef.current.has(e.pointerId)) return false;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gestureRef.current;
    if (!g || pointersRef.current.size < 2) return false;

    const [a, b] = [...pointersRef.current.values()];
    const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
    const mid = screenMid(a, b);
    const el = svgRef.current;
    if (!el) return true;
    const r = el.getBoundingClientRect();

    const z = clampZoom(g.startView.zoom * (dist / g.startDist));
    const aspect = size.w / size.h, base = W / H;
    let w = W, h = H, x = 0, y = 0;
    if (aspect > base) { w = H * aspect; x = (W - w) / 2; }
    else { h = W / aspect; y = (H - h) / 2; }

    // world point that was under the pinch midpoint when the gesture began
    const sw = w / g.startView.zoom, sh = h / g.startView.zoom;
    const sx = x + (w - sw) / 2 + g.startView.panX;
    const sy = y + (h - sh) / 2 + g.startView.panY;
    const anchor = {
      x: sx + ((g.startMid.x - r.left) / r.width) * sw,
      y: sy + ((g.startMid.y - r.top) / r.height) * sh,
    };

    // keep that point under the (possibly moved) midpoint => pan comes free
    const nw = w / z, nh = h / z;
    const fx = (mid.x - r.left) / r.width, fy = (mid.y - r.top) / r.height;
    const nx = anchor.x - fx * nw, ny = anchor.y - fy * nh;
    setView({
      zoom: z,
      panX: nx - (x + (w - nw) / 2),
      panY: ny - (y + (h - nh) / 2),
    });
    return true;
  }

  function gesturePointerUp(e) {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) gestureRef.current = null;
    return pointersRef.current.size >= 1 && gestureRef.current !== null;
  }

  function onWheel(e) {
    if (!e.ctrlKey && !e.metaKey && Math.abs(e.deltaY) < 2) return;
    e.preventDefault();
    const pt = clientToWorld(e.clientX, e.clientY);
    zoomAbout(e.deltaY < 0 ? 1.12 : 1 / 1.12, pt);
  }

  function handleCanvasPointerDown(e) {
    const p = getSVGPoint(svgRef.current, e);

    if (isPlacementTool(tool)) {
      // Pressing an existing object always manipulates it. Only empty ground
      // creates something new — otherwise every correction stacks a duplicate.
      const hit = topItemAt(p, items);
      if (hit) {
        setSelected({ type: "item", id: hit.id });
        drawRef.current = {
          mode: "aim", id: hit.id, center: { x: hit.x, y: hit.y },
          startRotation: hit.rotation || 0, moved: false, pendingSnapshot: true,
        };
        svgRef.current.setPointerCapture(e.pointerId);
        return;
      }
      snapshotForUndo();
      const newItem = {
        id: uid(), kind: tool, x: p.x, y: p.y, rotation: 0, color: activeColor,
        ...(tool === "sign-light" ? { signal: signalState } : {}),
      };
      setItems((prev) => [...prev, newItem]);
      setSelected({ type: "item", id: newItem.id });
      drawRef.current = {
        mode: "aim", id: newItem.id, center: { x: p.x, y: p.y },
        startRotation: 0, moved: false, pendingSnapshot: false,
      };
      svgRef.current.setPointerCapture(e.pointerId);
      return;
    }
    if (tool === "text") {
      snapshotForUndo();
      const id = uid();
      setTexts((prev) => [...prev, { id, x: p.x, y: p.y, content: "Label", color: activeColor }]);
      setSelected({ type: "text", id });
      setEditingTextId(id);
      return;
    }
    if (tool === "road" || tool === "road-curve") {
      snapshotForUndo();
      const preset = ROAD_WIDTHS.find((r) => r.key === roadWidth);
      const seg = { width: preset.width, lanes: preset.lanes };
      const start = snapToNetwork(p, roadSegments);
      if (tool === "road") {
        drawRef.current = { mode: "road", start, seg };
        setDrawPreview({ type: "road", points: [start, start], ...seg });
      } else {
        drawRef.current = { mode: "road-curve", points: [start], seg };
        setDrawPreview({ type: "road", points: [start], ...seg });
      }
      svgRef.current.setPointerCapture(e.pointerId);
      return;
    }
    if (tool === "arrow") {
      snapshotForUndo();
      drawRef.current = { mode: "arrow", x1: p.x, y1: p.y };
      setDrawPreview({ type: "arrow", x1: p.x, y1: p.y, x2: p.x, y2: p.y });
      svgRef.current.setPointerCapture(e.pointerId);
      return;
    }
    if (tool === "pen") {
      snapshotForUndo();
      drawRef.current = { mode: "pen", points: [{ x: p.x, y: p.y }] };
      setDrawPreview({ type: "pen", points: [{ x: p.x, y: p.y }] });
      svgRef.current.setPointerCapture(e.pointerId);
      return;
    }
    if (tool === "select") setSelected(null);
  }

  function handleCanvasPointerMove(e) {
    if (!drawRef.current) return;
    const p = getSVGPoint(svgRef.current, e);

    if (drawRef.current.mode === "aim") {
      const d = drawRef.current;
      const dx = p.x - d.center.x, dy = p.y - d.center.y;
      if (Math.hypot(dx, dy) > 14) {
        if (d.pendingSnapshot) { snapshotForUndo(); d.pendingSnapshot = false; }
        d.moved = true;
        const rotation = aimAngle(d.center.x, d.center.y, p.x, p.y);
        setItems((prev) => prev.map((i) => (i.id === d.id ? { ...i, rotation } : i)));
        setPlaceGuide({ x: d.center.x, y: d.center.y, tx: p.x, ty: p.y, deg: rotation });
      } else {
        setPlaceGuide(null);
      }
      return;
    }
    if (drawRef.current.mode === "road") {
      const s = drawRef.current.start;
      let end;
      if (e.shiftKey) {
        const dx = p.x - s.x, dy = p.y - s.y;
        const ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
        const len = Math.hypot(dx, dy);
        end = { x: s.x + Math.cos(ang) * len, y: s.y + Math.sin(ang) * len };
      } else {
        end = snapToNetwork(p, roadSegments);
      }
      setDrawPreview({ type: "road", points: [s, end], ...drawRef.current.seg });
      drawRef.current.end = end;
    } else if (drawRef.current.mode === "road-curve") {
      const pts = drawRef.current.points;
      const last = pts[pts.length - 1];
      if (Math.hypot(p.x - last.x, p.y - last.y) > 12) pts.push(p);
      setDrawPreview({ type: "road", points: [...pts], ...drawRef.current.seg });
    } else if (drawRef.current.mode === "arrow") {
      setDrawPreview({ type: "arrow", x1: drawRef.current.x1, y1: drawRef.current.y1, x2: p.x, y2: p.y });
    } else if (drawRef.current.mode === "pen") {
      drawRef.current.points.push({ x: p.x, y: p.y });
      setDrawPreview({ type: "pen", points: [...drawRef.current.points] });
    }
  }

  function handleCanvasPointerUp(e) {
    if (!drawRef.current) return;
    const p = getSVGPoint(svgRef.current, e);
    const d = drawRef.current;

    if (d.mode === "aim") {
      drawRef.current = null;
      setPlaceGuide(null);
      return;
    }
    if (d.mode === "road") {
      const s = d.start, end = d.end || p, seg = d.seg;
      if (Math.hypot(end.x - s.x, end.y - s.y) > 20) {
        const newSeg = { id: uid(), points: [s, end], width: seg.width, lanes: seg.lanes };
        setRoadSegments((prev) => [...prev, newSeg]);
      }
      drawRef.current = null;
      setDrawPreview(null);
      return;
    }
    if (d.mode === "road-curve") {
      const pts = d.points.slice(), seg = d.seg;
      if (pts.length > 1) {
        pts[pts.length - 1] = snapToNetwork(pts[pts.length - 1], roadSegments);
        const newSeg = { id: uid(), points: pts, width: seg.width, lanes: seg.lanes };
        setRoadSegments((prev) => [...prev, newSeg]);
      }
      drawRef.current = null;
      setDrawPreview(null);
      return;
    }
    if (d.mode === "arrow") {
      const { x1, y1 } = d;
      if (Math.hypot(p.x - x1, p.y - y1) > 8) {
        const id = uid();
        setArrows((prev) => [...prev, { id, x1, y1, x2: p.x, y2: p.y, color: activeColor, number: 0 }]);
        setSelected({ type: "arrow", id });
      }
    } else if (d.mode === "pen") {
      const pts = d.points.slice();
      if (pts.length > 1) setPaths((prev) => [...prev, { id: uid(), points: pts, color: activeColor }]);
    }
    drawRef.current = null;
    setDrawPreview(null);
  }

  function startItemDrag(e, obj, type) {
    if (tool === "erase") {
      e.stopPropagation();
      snapshotForUndo();
      if (type === "item") setItems((p) => p.filter((i) => i.id !== obj.id));
      if (type === "arrow") setArrows((p) => p.filter((i) => i.id !== obj.id));
      if (type === "text") setTexts((p) => p.filter((i) => i.id !== obj.id));
      if (type === "path") setPaths((p) => p.filter((i) => i.id !== obj.id));
      if (type === "road") setRoadSegments((p) => p.filter((i) => i.id !== obj.id));
      if (selected?.id === obj.id) setSelected(null);
      return;
    }
    if (tool !== "select") return;
    e.stopPropagation();
    setSelected({ type, id: obj.id });
    const p = getSVGPoint(svgRef.current, e);
    // Snapshot is deferred to the first actual movement, so a plain
    // select doesn't litter the undo history with no-op steps.
    const base = { type, id: obj.id, pendingSnapshot: true };
    if (type === "item" || type === "text") {
      dragRef.current = { ...base, offX: p.x - obj.x, offY: p.y - obj.y };
    } else if (type === "arrow") {
      dragRef.current = { ...base, offX: p.x, offY: p.y, orig: { x1: obj.x1, y1: obj.y1, x2: obj.x2, y2: obj.y2 } };
    } else if (type === "road") {
      dragRef.current = { ...base, offX: p.x, offY: p.y, orig: clone(obj.points) };
    } else if (type === "path") {
      dragRef.current = { ...base, offX: p.x, offY: p.y, orig: clone(obj.points) };
    }
    e.target.setPointerCapture?.(e.pointerId);
  }

  function startRotateHandle(e, it) {
    e.stopPropagation();
    setSelected({ type: "item", id: it.id });
    dragRef.current = { type: "rotate", id: it.id, cx: it.x, cy: it.y, pendingSnapshot: true };
    e.target.setPointerCapture?.(e.pointerId);
  }

  function onDragMove(e) {
    if (!dragRef.current) return;
    const p = getSVGPoint(svgRef.current, e);
    const d = dragRef.current;
    if (d.pendingSnapshot) { snapshotForUndo(); d.pendingSnapshot = false; }

    if (d.type === "rotate") {
      const rotation = aimAngle(d.cx, d.cy, p.x, p.y);
      setItems((prev) => prev.map((i) => (i.id === d.id ? { ...i, rotation } : i)));
      setPlaceGuide({ x: d.cx, y: d.cy, tx: p.x, ty: p.y, deg: rotation });
    } else if (d.type === "item") {
      setItems((prev) => prev.map((i) => (i.id === d.id ? { ...i, x: p.x - d.offX, y: p.y - d.offY } : i)));
    } else if (d.type === "text") {
      setTexts((prev) => prev.map((i) => (i.id === d.id ? { ...i, x: p.x - d.offX, y: p.y - d.offY } : i)));
    } else if (d.type === "road") {
      const dx = p.x - d.offX, dy = p.y - d.offY;
      setRoadSegments((prev) => prev.map((s) => (s.id === d.id
        ? { ...s, points: d.orig.map((pt) => ({ x: pt.x + dx, y: pt.y + dy })) } : s)));
    } else if (d.type === "path") {
      const dx = p.x - d.offX, dy = p.y - d.offY;
      setPaths((prev) => prev.map((s) => (s.id === d.id
        ? { ...s, points: d.orig.map((pt) => ({ x: pt.x + dx, y: pt.y + dy })) } : s)));
    } else if (d.type === "arrow") {
      const dx = p.x - d.offX, dy = p.y - d.offY;
      setArrows((prev) => prev.map((i) => (i.id === d.id ? {
        ...i, x1: d.orig.x1 + dx, y1: d.orig.y1 + dy, x2: d.orig.x2 + dx, y2: d.orig.y2 + dy
      } : i)));
    }
  }
  function onDragEnd() {
    if (dragRef.current?.type === "rotate") setPlaceGuide(null);
    dragRef.current = null;
  }

  function rotateSelected(delta) {
    if (selected?.type !== "item") return;
    setItems((prev) => prev.map((i) => (i.id === selected.id ? { ...i, rotation: (i.rotation + delta + 360) % 360 } : i)));
  }
  function duplicateSelected() {
    if (selected?.type !== "item") return;
    const it = items.find((i) => i.id === selected.id);
    if (!it) return;
    snapshotForUndo();
    const copy = { ...it, id: uid(), x: it.x + M(1.5), y: it.y + M(1.5) };
    setItems((prev) => [...prev, copy]);
    setSelected({ type: "item", id: copy.id });
  }
  // Picking a colour sets the default for new objects and, if something is
  // selected, restyles it immediately — no separate "change colour" control.
  function chooseColor(key) {
    setActiveColor(key);
    if (!selected) return;
    snapshotForUndo();
    const paint = (list) => list.map((o) => (o.id === selected.id ? { ...o, color: key } : o));
    if (selected.type === "item") setItems(paint);
    if (selected.type === "arrow") setArrows(paint);
    if (selected.type === "text") setTexts(paint);
    if (selected.type === "path") setPaths(paint);
  }

  function cycleSignal() {
    if (selected?.type !== "item") return;
    setItems((prev) => prev.map((i) => {
      if (i.id !== selected.id || i.kind !== "sign-light") return i;
      const idx = SIGNAL_STATES.findIndex((s) => s.key === (i.signal || "red"));
      return { ...i, signal: SIGNAL_STATES[(idx + 1) % SIGNAL_STATES.length].key };
    }));
  }

  function cycleArrowNumber() {
    if (selected?.type !== "arrow") return;
    setArrows((prev) => prev.map((a) => (a.id === selected.id ? { ...a, number: (a.number + 1) % 5 } : a)));
  }

  function clearScene() {
    snapshotForUndo();
    setItems([]); setArrows([]); setTexts([]); setPaths([]); setRoadSegments([]);
    setSelected(null);
    setConfirmClear(false);
  }

  async function openSaveMenu() {
    if (saveOpen) { setSaveOpen(false); return; }
    setSaveOpen(true); setLoadOpen(false);
    try {
      const keys = await Storage.keys(SCENARIO_PREFIX);
      setSavedList(keys.map((k) => k.slice(SCENARIO_PREFIX.length)));
    } catch (err) { /* list is advisory only */ }
  }
  async function doSave() {
    const name = saveName.trim();
    if (!name) return;
    try {
      await Storage.set(SCENARIO_PREFIX + name, JSON.stringify(currentScene));
      setStatus(`Saved "${name}"`);
      setSaveOpen(false);
      setSaveName("");
      setTimeout(() => setStatus(""), 2500);
    } catch (err) { setStatus("Save failed"); setTimeout(() => setStatus(""), 3000); }
  }
  async function openLoadMenu() {
    if (loadOpen) { setLoadOpen(false); return; }
    setLoadOpen(true);
    setConfirmDelete(null);
    try {
      const keys = await Storage.keys(SCENARIO_PREFIX);
      setSavedList(keys.map((k) => k.slice(SCENARIO_PREFIX.length)));
    } catch (err) { setSavedList([]); }
  }
  async function doLoad(name) {
    try {
      const raw = await Storage.get(SCENARIO_PREFIX + name);
      if (raw) {
        snapshotForUndo();
        applyScene(JSON.parse(raw));
        setSelected(null);
        setStatus(`Loaded "${name}"`);
        setTimeout(() => setStatus(""), 2500);
      }
    } catch (err) { setStatus("Load failed"); setTimeout(() => setStatus(""), 3000); }
    setLoadOpen(false);
  }
  async function deleteSaved(name, e) {
    e.stopPropagation();
    // First press arms, second confirms — deleting a lesson plan is not undoable.
    if (confirmDelete !== name) { setConfirmDelete(name); return; }
    try {
      await Storage.remove(SCENARIO_PREFIX + name);
      setSavedList((prev) => prev.filter((n) => n !== name));
      setStatus(`Deleted "${name}"`);
      setTimeout(() => setStatus(""), 2000);
    } catch (err) { /* ignore */ }
    setConfirmDelete(null);
  }

  /* ---- export ---- */
  async function exportPNG() {
    const src = svgRef.current;
    if (!src || exporting) return;
    setExporting(true);
    setSelected(null);
    try {
      await new Promise((r) => setTimeout(r, 40)); // let the selection UI clear
      const clone = src.cloneNode(true);
      // foreignObject (mini toolbars, text inputs) does not rasterise —
      // strip it along with any transient guides.
      clone.querySelectorAll("foreignObject").forEach((n) => n.remove());
      clone.querySelectorAll("[data-transient]").forEach((n) => n.remove());
      clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      clone.setAttribute("width", vb.w);
      clone.setAttribute("height", vb.h);

      const xml = new XMLSerializer().serializeToString(clone);
      const svgUrl = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(xml);

      const img = new Image();
      img.crossOrigin = "anonymous";
      await new Promise((res, rej) => {
        img.onload = res;
        img.onerror = () => rej(new Error("render failed"));
        img.src = svgUrl;
      });

      const scale = 2; // retina-ish output for projecting or printing
      const cv = document.createElement("canvas");
      cv.width = Math.round(vb.w * scale);
      cv.height = Math.round(vb.h * scale);
      const ctx = cv.getContext("2d");
      ctx.fillStyle = COLORS.shoulder;
      ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.drawImage(img, 0, 0, cv.width, cv.height);

      const name = `drivedraw-${TEMPLATES[roadTemplate]?.label || "scenario"}`
        .toLowerCase().replace(/[^a-z0-9]+/g, "-") + ".png";

      const blob = await new Promise((r) => cv.toBlob(r, "image/png"));
      if (!blob) throw new Error("encode failed");

      // Native share sheet where the shell supports it, else a download.
      let shared = false;
      try {
        if (typeof File === "function" && navigator.canShare && navigator.share) {
          const file = new File([blob], name, { type: "image/png" });
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file], title: "DriveDraw scenario" });
            shared = true;
          }
        }
      } catch (shareErr) {
        shared = false; // user dismissed, or sharing unsupported — fall through
      }
      if (!shared) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      }
      setStatus("Image exported");
      setTimeout(() => setStatus(""), 2500);
    } catch (err) {
      setStatus("Export failed — try again");
      setTimeout(() => setStatus(""), 3000);
    } finally {
      setExporting(false);
    }
  }

  function applyTemplate(key) {
    snapshotForUndo();
    setRoadTemplate(key);
    const props = (TEMPLATES[key]?.props || []).map((p) => ({
      id: uid(), color: "blue", rotation: 0, fromTemplate: true, ...p,
    }));
    // template props are real items, so swap out the old set and keep
    // anything the instructor placed by hand
    setItems((prev) => [...prev.filter((i) => !i.fromTemplate), ...props]);
    setSelected(null);
  }

  const intersections = React.useMemo(() => computeIntersections(roadSegments), [roadSegments]);
  const nameTaken = savedList.includes(saveName.trim()) && saveName.trim().length > 0;

  const groupStyle = { display: "flex", gap: 6, flexWrap: narrow ? "nowrap" : "wrap", alignItems: "center" };
  const subMenuStyle = {
    ...groupStyle,
    marginTop: narrow ? 0 : 8,
    padding: narrow ? "0 0 0 6px" : "8px 6px",
    background: narrow ? "transparent" : "rgba(12,14,18,0.55)",
    borderRadius: 8,
    borderLeft: narrow ? `2px solid ${COLORS.lane}` : "none",
  };
  const subLabelStyle = {
    width: "100%", fontSize: 9.5, color: COLORS.lane, fontWeight: 700,
    letterSpacing: 1, marginBottom: 3,
  };
  const Divider = () => narrow ? <div style={{ width: 1, alignSelf: "stretch", background: "rgba(255,255,255,0.14)", margin: "0 4px" }} /> : null;

  return (
    <div style={styles.app} ref={wrapRef}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;600;700&family=Inter:wght@400;500;600&display=swap');
        * { box-sizing: border-box; }
        html, body { overscroll-behavior: none; }
        .dd-btn { display:flex; flex-direction:column; align-items:center; gap:3px; background:rgba(58,62,70,0.9);
          border:1px solid rgba(255,255,255,0.10); border-radius:7px; color:${COLORS.edge}; padding:9px 5px; cursor:pointer;
          font-family:${FONT_UI}; font-size:10px; min-width:60px; min-height:44px; flex:0 0 auto;
          -webkit-tap-highlight-color: transparent; touch-action: manipulation; }
        .dd-btn:hover { border-color:${COLORS.lane}; }
        .dd-btn.active { background:${COLORS.blue}; border-color:#8fb4ff; }
        .dd-section-label { font-family:${FONT_DISPLAY}; font-weight:700; letter-spacing:1.5px; font-size:10px;
          color:${COLORS.lane}; text-transform:uppercase; margin: 9px 0 4px 2px; }
        .dd-swatch { width:26px; height:26px; border-radius:50%; cursor:pointer; border:2px solid transparent; flex:0 0 auto; }
        .dd-swatch.active { border-color:#fff; }
        .dd-topbtn { display:flex; align-items:center; justify-content:center; gap:6px; background:rgba(36,38,42,0.86);
          border:1px solid rgba(255,255,255,0.10); color:${COLORS.edge}; border-radius:8px; padding:10px 11px;
          font-family:${FONT_UI}; font-size:13px; cursor:pointer; min-width:42px; min-height:42px;
          backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
          -webkit-tap-highlight-color: transparent; touch-action: manipulation; }
        .dd-topbtn:hover { border-color:${COLORS.lane}; }
        .dd-topbtn:disabled { opacity:0.4; cursor:default; }
        .dd-select { background:rgba(36,38,42,0.86); color:${COLORS.edge}; border:1px solid rgba(255,255,255,0.10); border-radius:8px;
          padding:9px 10px; font-family:${FONT_UI}; font-size:13px;
          backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); }
        .dd-panel { background:rgba(26,28,32,0.82); border:1px solid rgba(255,255,255,0.09); border-radius:14px;
          box-shadow: 0 10px 30px rgba(0,0,0,0.45); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); }
        .dd-scroll::-webkit-scrollbar { height:6px; width:6px; }
        .dd-scroll::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.18); border-radius:3px; }
        .dd-btn:focus-visible, .dd-topbtn:focus-visible, .dd-swatch:focus-visible, .dd-select:focus-visible {
          outline: 3px solid ${COLORS.lane}; outline-offset: 2px; }
        .dd-swatch { padding:0; }
        .dd-swatch:hover { transform: scale(1.08); }
        @media (prefers-reduced-motion: reduce) {
          .dd-flash { animation: none; }
          .dd-swatch:hover { transform: none; }
        }
        @keyframes ddFlash { 0%, 55% { opacity: 1 } 56%, 100% { opacity: 0.18 } }
        .dd-flash { animation: ddFlash 1.05s steps(1, end) infinite; }
      `}</style>

      {uiHidden && (
        <button className="dd-topbtn" onClick={() => setUiHidden(false)} title="Show tools"
          style={{ position: "absolute", top: `calc(12px + ${SAFE_T})`, left: `calc(12px + ${SAFE_L})`, zIndex: 20 }}>
          <Eye size={16} />Tools
        </button>
      )}

      {!uiHidden && (
        <div style={styles.topLeft}>
          {!narrow && <div style={styles.title}>DRIVE<span style={{ color: COLORS.lane }}>DRAW</span></div>}
          <select className="dd-select" value={roadTemplate} onChange={(e) => applyTemplate(e.target.value)}>
            {TEMPLATE_GROUPS.map((g) => {
              const inGroup = ROAD_TEMPLATES.filter((t) => t.group === g);
              if (!inGroup.length) return null;
              return (
                <optgroup key={g} label={g}>
                  {inGroup.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                </optgroup>
              );
            })}
          </select>
        </div>
      )}

      {!uiHidden && (
        <div style={styles.topRight}>
          <button className="dd-topbtn" onClick={undo} disabled={!history.past.length}
            title="Undo (Ctrl+Z)" aria-label="Undo"><Undo2 size={16} />{!narrow && "Undo"}</button>
          <button className="dd-topbtn" onClick={redo} disabled={!history.future.length}
            title="Redo (Ctrl+Shift+Z)" aria-label="Redo"><Redo2 size={16} />{!narrow && "Redo"}</button>
          {!confirmClear ? (
            <button className="dd-topbtn" onClick={() => setConfirmClear(true)}
              title="Clear everything" aria-label="Clear everything"><Trash2 size={16} />{!narrow && "Clear"}</button>
          ) : (
            <>
              <button className="dd-topbtn" style={{ background: COLORS.red, borderColor: COLORS.red }}
                onClick={clearScene}>Clear all?</button>
              <button className="dd-topbtn" onClick={() => setConfirmClear(false)}>Cancel</button>
            </>
          )}
          <button className="dd-topbtn" onClick={openSaveMenu} aria-expanded={saveOpen}
            title="Save scenario" aria-label="Save scenario"><Save size={16} />{!narrow && "Save"}</button>
          <button className="dd-topbtn" onClick={() => { openLoadMenu(); setSaveOpen(false); }} aria-expanded={loadOpen}
            title="Open scenario" aria-label="Open scenario"><FolderOpen size={16} />{!narrow && "Open"}</button>
          <button className="dd-topbtn" onClick={exportPNG} disabled={exporting}
            title="Export as image" aria-label="Export as image">
            <Download size={16} />{!narrow && (exporting ? "Saving…" : "Image")}
          </button>
          <button className="dd-topbtn" onClick={() => setLowFx((v) => !v)} aria-pressed={lowFx}
            title={lowFx ? "Effects off — tap for full quality" : "Full quality — tap for faster drawing"}
            aria-label="Toggle visual effects"
            style={lowFx ? { borderColor: COLORS.lane, color: COLORS.lane } : undefined}><Zap size={16} /></button>
          <button className="dd-topbtn" onClick={() => { setSelected(null); setUiHidden(true); }}
            title="Present mode — hide all panels (Esc to exit)" aria-label="Enter present mode">
            <EyeOff size={16} />
          </button>
        </div>
      )}

      {status && <div style={styles.statusBar}><Check size={14} style={{ marginRight: 6 }} />{status}</div>}

      <div style={{
        ...styles.zoomCluster,
        bottom: narrow && !uiHidden ? `calc(128px + ${SAFE_B})` : `calc(16px + ${SAFE_B})`,
      }}>
        <button className="dd-topbtn" onClick={() => zoomAbout(1.25, { x: vb.x + vb.w / 2, y: vb.y + vb.h / 2 })}
          title="Zoom in" disabled={view.zoom >= MAX_ZOOM}><ZoomIn size={16} /></button>
        <button className="dd-topbtn" onClick={() => zoomAbout(1 / 1.25, { x: vb.x + vb.w / 2, y: vb.y + vb.h / 2 })}
          title="Zoom out" disabled={view.zoom <= MIN_ZOOM}><ZoomOut size={16} /></button>
        <button className="dd-topbtn" onClick={resetView} title="Fit to screen"
          disabled={view.zoom === 1 && view.panX === 0 && view.panY === 0}><Maximize2 size={16} /></button>
        {view.zoom !== 1 && (
          <div style={styles.zoomBadge}><Move size={11} />{view.zoom.toFixed(1)}×</div>
        )}
      </div>

      {(saveOpen || loadOpen) && (
        <div style={styles.backdrop}
          onPointerDown={() => { setSaveOpen(false); setLoadOpen(false); setConfirmDelete(null); }} />
      )}

      {saveOpen && (
        <div className="dd-panel" style={styles.popRow} role="dialog" aria-label="Save scenario">
          <input autoFocus value={saveName} onChange={(e) => setSaveName(e.target.value)}
            placeholder="Name this scenario"
            aria-label="Scenario name"
            style={styles.input} onKeyDown={(e) => e.key === "Enter" && doSave()} />
          <button className="dd-topbtn"
            style={saveName.trim()
              ? { background: nameTaken ? COLORS.orange : COLORS.green, borderColor: "transparent" }
              : undefined}
            disabled={!saveName.trim()} onClick={doSave}>
            {nameTaken ? "Overwrite" : "Save"}
          </button>
          <button className="dd-topbtn" onClick={() => setSaveOpen(false)} aria-label="Cancel"><X size={14} /></button>
          {nameTaken && (
            <span style={{ width: "100%", color: COLORS.orange, fontSize: 12 }}>
              A scenario with that name already exists.
            </span>
          )}
        </div>
      )}
      {loadOpen && (
        <div className="dd-panel" style={styles.popRow} role="dialog" aria-label="Open scenario">
          {savedList.length === 0 && (
            <span style={{ color: "#9aa0a6", fontSize: 13 }}>
              No saved scenarios yet — build one and press Save.
            </span>
          )}
          {savedList.map((name) => (
            <span key={name} style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
              <button className="dd-topbtn" onClick={() => doLoad(name)}>{name}</button>
              <button className="dd-topbtn" onClick={(e) => deleteSaved(name, e)}
                title={confirmDelete === name ? `Confirm delete "${name}"` : `Delete "${name}"`}
                aria-label={`Delete ${name}`}
                style={confirmDelete === name
                  ? { background: COLORS.red, borderColor: COLORS.red, padding: "10px 8px" }
                  : { padding: "10px 8px" }}>
                <Trash2 size={13} />
              </button>
            </span>
          ))}
          <button className="dd-topbtn" onClick={() => setLoadOpen(false)} aria-label="Close"><X size={14} /></button>
        </div>
      )}

      <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        <div className="dd-panel dd-scroll" style={{
          position: "absolute",
          pointerEvents: "auto",
          zIndex: 10,
          display: uiHidden ? "none" : (narrow ? "flex" : "block"),
          flexDirection: "row",
          alignItems: "center",
          gap: narrow ? 6 : 0,
          ...(narrow
            ? {
              left: `calc(8px + ${SAFE_L})`, right: `calc(8px + ${SAFE_R})`,
              bottom: `calc(8px + ${SAFE_B})`,
              overflowX: "auto", overflowY: "hidden", padding: "8px 10px",
              WebkitOverflowScrolling: "touch",
            }
            : {
              left: `calc(12px + ${SAFE_L})`, top: `calc(70px + ${SAFE_T})`,
              maxHeight: `calc(100% - 108px - ${SAFE_T} - ${SAFE_B})`,
              width: 172, overflowY: "auto", overflowX: "hidden", padding: "4px 10px 10px",
            }),
        }}>
          {!narrow && <div className="dd-section-label">Select</div>}
          <div style={groupStyle}>
            <button className={`dd-btn ${tool === "select" ? "active" : ""}`} aria-pressed={tool === "select"}
              aria-label="Select tool (V)" onClick={() => setTool("select")}><MousePointer2 size={18} />Select</button>
            <button className={`dd-btn ${tool === "erase" ? "active" : ""}`} aria-pressed={tool === "erase"}
              aria-label="Erase tool (E)" onClick={() => setTool("erase")}><Eraser size={18} />Erase</button>
          </div>
          <Divider />

          {!narrow && <div className="dd-section-label">Build Road</div>}
          <div style={groupStyle}>
            <button className={`dd-btn ${tool === "road" ? "active" : ""}`} aria-pressed={tool === "road"}
              onClick={() => setTool("road")}><Minus size={18} />Straight</button>
            <button className={`dd-btn ${tool === "road-curve" ? "active" : ""}`} aria-pressed={tool === "road-curve"}
              onClick={() => setTool("road-curve")}><Spline size={18} />Curved</button>
          </div>
          {(tool === "road" || tool === "road-curve") && (
            <div style={{ ...subMenuStyle, gap: 4 }}>
              {!narrow && <div style={subLabelStyle}>ROAD WIDTH</div>}
              {ROAD_WIDTHS.map((r) => (
                <button key={r.key} className={`dd-btn ${roadWidth === r.key ? "active" : ""}`}
                  aria-pressed={roadWidth === r.key} aria-label={`${r.label} road`}
                  style={{ minWidth: narrow ? 52 : 0, flex: narrow ? "0 0 auto" : 1, fontSize: 9, padding: "6px 3px" }}
                  onClick={() => setRoadWidth(r.key)}><Route size={14} />{r.label}</button>
              ))}
            </div>
          )}
          <Divider />

          {!narrow && <div className="dd-section-label">{selected ? "Colour — recolours selection" : "Colour"}</div>}
          <div style={{ ...groupStyle, gap: 8, marginBottom: narrow ? 0 : 6 }} role="radiogroup" aria-label="Colour">
            {VEHICLE_COLORS.map((c) => (
              <button key={c.key} className={`dd-swatch ${activeColor === c.key ? "active" : ""}`}
                style={{ background: c.hex }} title={c.label} aria-label={c.label}
                role="radio" aria-checked={activeColor === c.key}
                onClick={() => chooseColor(c.key)} />
            ))}
          </div>

          {!narrow && <div className="dd-section-label">Vehicles</div>}
          <div style={groupStyle}>
            {VEHICLE_TOOLS.map(({ kind, label, Icon }) => (
              <button key={kind} className={`dd-btn ${tool === kind ? "active" : ""}`}
                aria-pressed={tool === kind} aria-label={`Place ${label}`} onClick={() => setTool(kind)}>
                <Icon size={18} />{label}
              </button>
            ))}
          </div>
          <Divider />

          {!narrow && <div className="dd-section-label">Signs</div>}
          <div style={groupStyle}>
            {SIGN_TOOLS.map(({ kind, label, Icon }) => (
              <button key={kind} className={`dd-btn ${tool === kind ? "active" : ""}`}
                aria-pressed={tool === kind} aria-label={`Place ${label} sign`} onClick={() => setTool(kind)}>
                <Icon size={18} />{label}
              </button>
            ))}
          </div>
          {tool === "sign-light" && (
            <div style={{ ...subMenuStyle, gap: 4 }}>
              {!narrow && <div style={subLabelStyle}>SIGNAL STATE</div>}
              {SIGNAL_STATES.map((s) => (
                <button key={s.key} className={`dd-btn ${signalState === s.key ? "active" : ""}`}
                  aria-pressed={signalState === s.key} aria-label={`${s.label} signal`}
                  style={{ minWidth: narrow ? 50 : 0, flex: narrow ? "0 0 auto" : 1, fontSize: 9, padding: "5px 3px" }}
                  onClick={() => setSignalState(s.key)}>
                  <SignalSwatch state={s.key} />{s.label}
                </button>
              ))}
            </div>
          )}
          <Divider />

          {!narrow && <div className="dd-section-label">Draw</div>}
          <div style={groupStyle}>
            <button className={`dd-btn ${tool === "arrow" ? "active" : ""}`} aria-pressed={tool === "arrow"}
              aria-label="Path arrow tool (A)" onClick={() => setTool("arrow")}><MoveUpRight size={18} />Path</button>
            <button className={`dd-btn ${tool === "pen" ? "active" : ""}`} aria-pressed={tool === "pen"}
              aria-label="Freehand sketch tool (B)" onClick={() => setTool("pen")}><PenTool size={18} />Sketch</button>
            <button className={`dd-btn ${tool === "text" ? "active" : ""}`} aria-pressed={tool === "text"}
              aria-label="Text label tool (T)" onClick={() => setTool("text")}><Type size={18} />Label</button>
          </div>

          {!narrow && (
            <p style={styles.hint}>
              <strong style={{ color: "#c3c8cf" }}>Placing:</strong> press empty road to drop an object, keep
              holding and drag to aim it. Pressing an object you already placed re-aims it instead of adding another.
              <br /><br />
              <strong style={{ color: "#c3c8cf" }}>Select tool:</strong> drag to move, or drag the round handle at
              the object's nose to rotate. Colours recolour whatever is selected.
              <br /><br />
              One finger draws, two fingers pinch to zoom and pan. Scale is true to life — 1 lane = 3.6 m, a car
              is 4.5 m.
            </p>
          )}
        </div>

        <div style={styles.canvasWrap}>
          <svg
            ref={svgRef}
            viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
            style={{ width: "100%", height: "100%", display: "block", touchAction: "none", cursor: tool === "select" ? "default" : "crosshair" }}
            onPointerDown={(e) => { if (!gesturePointerDown(e)) handleCanvasPointerDown(e); }}
            onPointerMove={(e) => {
              if (gesturePointerMove(e)) return;
              handleCanvasPointerMove(e); onDragMove(e);
            }}
            onPointerUp={(e) => {
              const wasGesture = gesturePointerUp(e);
              if (wasGesture) return;
              handleCanvasPointerUp(e); onDragEnd(e);
            }}
            onPointerCancel={(e) => { gesturePointerUp(e); cancelActiveDraw(); }}
            onContextMenu={(e) => e.preventDefault()}
            onWheel={onWheel}
            role="application"
            aria-label="Traffic scenario canvas"
          >
            <defs>
              {!lowFx && (
                <filter id="dd-shadow" x="-25%" y="-25%" width="150%" height="150%">
                  <feDropShadow dx="0" dy="3.5" stdDeviation="3" floodColor="#0B0D10" floodOpacity="0.45" />
                </filter>
              )}
              {!lowFx && (
                <filter id="dd-roadlift" x="-10%" y="-10%" width="120%" height="120%">
                  <feDropShadow dx="0" dy="4" stdDeviation="5" floodColor="#16200F" floodOpacity="0.45" />
                </filter>
              )}
              {NOISE_TILE && (
                <pattern id="dd-noise" patternUnits="userSpaceOnUse" width={64} height={64}>
                  <image href={NOISE_TILE} x={0} y={0} width={64} height={64} />
                </pattern>
              )}
              {ARROW_COLORS.map((c) => (
                <marker key={c} id={`arrowhead-${c}`} markerWidth="8" markerHeight="8" refX="5.5" refY="4" orient="auto">
                  <path d="M0,0 L8,4 L0,8 z" fill={COLORS[c]} />
                </marker>
              ))}
            </defs>

            <Ground />

            <g filter={lowFx ? undefined : "url(#dd-roadlift)"}>
              <TemplateLayer tpl={TEMPLATES[roadTemplate]} />
              <CustomRoads
                segments={roadSegments}
                intersections={intersections}
                interactive={tool === "select" || tool === "erase"}
                onSegmentPointerDown={(e, s) => startItemDrag(e, s, "road")}
              />
            </g>

            {/* paper grain ties the flat fills together */}
            {NOISE_TILE && !lowFx && (
              <rect x={vb.x} y={vb.y} width={vb.w} height={vb.h} fill="url(#dd-noise)" opacity={0.06}
                pointerEvents="none" style={{ mixBlendMode: "overlay" }} />
            )}

            {selected?.type === "road" && (() => {
              const s = roadSegments.find((r) => r.id === selected.id);
              if (!s) return null;
              const mid = s.points[Math.floor(s.points.length / 2)];
              return (
                <>
                  <path d={segPath(s)} stroke={COLORS.lane} strokeWidth={s.width + 12} fill="none"
                    strokeLinecap="round" strokeLinejoin="round" opacity={0.3} pointerEvents="none" />
                  <MiniToolbar vb={vb} x={mid.x} y={mid.y - s.width / 2 - 52}>
                    <MiniBtn title="Delete road" onClick={deleteSelected}><Trash2 size={16} /></MiniBtn>
                  </MiniToolbar>
                </>
              );
            })()}
            {drawPreview?.type === "road" && (
              <g opacity={0.75} pointerEvents="none">
                <path d={segPath(drawPreview)} stroke={COLORS.edge} strokeWidth={drawPreview.width + MARK_PX * 2}
                  fill="none" strokeLinecap="round" strokeLinejoin="round" />
                <path d={segPath(drawPreview)} stroke={COLORS.asphalt} strokeWidth={drawPreview.width}
                  fill="none" strokeLinecap="round" strokeLinejoin="round" />
                <RoadMarkings seg={drawPreview} />
              </g>
            )}

            {paths.map((p) => {
              const isSel = selected?.type === "path" && selected.id === p.id;
              return (
                <g key={p.id}>
                  {isSel && (
                    <path d={ptsPath(p.points)} stroke={COLORS.lane} strokeWidth={11} fill="none"
                      strokeLinecap="round" strokeLinejoin="round" opacity={0.35} pointerEvents="none" />
                  )}
                  <path d={ptsPath(p.points)} stroke={COLORS[p.color]} strokeWidth={5} fill="none"
                    strokeLinecap="round" strokeLinejoin="round"
                    onPointerDown={(e) => startItemDrag(e, p, "path")}
                    style={{ cursor: tool === "select" || tool === "erase" ? "pointer" : "inherit" }} />
                </g>
              );
            })}
            {drawPreview?.type === "pen" && (
              <path d={ptsPath(drawPreview.points)} stroke={COLORS[activeColor]} strokeWidth={5} fill="none"
                strokeLinecap="round" strokeLinejoin="round" opacity={0.7} />
            )}

            {arrows.map((a) => {
              const isSel = selected?.type === "arrow" && selected.id === a.id;
              const mx = (a.x1 + a.x2) / 2, my = (a.y1 + a.y2) / 2;
              return (
                <g key={a.id}>
                  {/* fat invisible stroke widens the grab area to a touch target */}
                  <line x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2} stroke="transparent" strokeWidth={30}
                    strokeLinecap="round" onPointerDown={(e) => startItemDrag(e, a, "arrow")}
                    style={{ cursor: tool === "select" || tool === "erase" ? "pointer" : "inherit" }} />
                  <line x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2} stroke={COLORS[a.color]} strokeWidth={isSel ? 8 : 6}
                    markerEnd={`url(#arrowhead-${a.color})`} strokeLinecap="round" pointerEvents="none" />
                  {a.number > 0 && (
                    <g onPointerDown={(e) => startItemDrag(e, a, "arrow")} style={{ cursor: "pointer" }}>
                      <circle cx={mx} cy={my} r={15} fill="#fff" stroke={COLORS[a.color]} strokeWidth={3} />
                      <text x={mx} y={my + 6} fontSize={19} fontWeight="700" textAnchor="middle" fill={COLORS.ink}
                        fontFamily={FONT_DISPLAY}>{a.number}</text>
                    </g>
                  )}
                  {isSel && (
                    <MiniToolbar vb={vb} x={mx} y={my - 60}>
                      <MiniBtn title="Right-of-way order" onClick={cycleArrowNumber}>
                        {a.number > 0 ? a.number : "#"}
                      </MiniBtn>
                      <MiniBtn title="Delete" onClick={deleteSelected}><Trash2 size={16} /></MiniBtn>
                    </MiniToolbar>
                  )}
                </g>
              );
            })}
            {drawPreview?.type === "arrow" && (
              <line x1={drawPreview.x1} y1={drawPreview.y1} x2={drawPreview.x2} y2={drawPreview.y2}
                stroke={COLORS[activeColor]} strokeWidth={6} markerEnd={`url(#arrowhead-${activeColor})`} opacity={0.7} strokeLinecap="round" />
            )}

            {items.map((it) => {
              const isSel = selected?.type === "item" && selected.id === it.id;
              const { hl, hw } = itemHalf(it.kind);
              const hit = itemHitHalf(it.kind);
              const rad = ((it.rotation || 0) * Math.PI) / 180;
              const handleDist = hit.hl + 30;
              const hx = it.x + Math.cos(rad) * handleDist;
              const hy = it.y + Math.sin(rad) * handleDist;
              const bubbleAbove = it.y - Math.max(hit.hl, hit.hw) - 56 > vb.y + 8;
              return (
                <g key={it.id}>
                  <g transform={`translate(${it.x},${it.y}) rotate(${it.rotation})`}
                    filter={lowFx ? undefined : "url(#dd-shadow)"}
                    onPointerDown={(e) => startItemDrag(e, it, "item")} style={{ cursor: "pointer" }}>
                    {/* invisible target keeps small objects tappable */}
                    <rect x={-hit.hl} y={-hit.hw} width={hit.hl * 2} height={hit.hw * 2}
                      fill="transparent" />
                    {isSel && (
                      <rect x={-hl - 7} y={-hw - 7} width={hl * 2 + 14} height={hw * 2 + 14} rx={6}
                        fill="none" stroke={COLORS.lane} strokeWidth={2.5} strokeDasharray="6 5" />
                    )}
                    <ItemGraphic kind={it.kind} color={it.color} signal={it.signal} />
                  </g>
                  {isSel && tool === "select" && (
                    <g data-transient="1">
                      <line x1={it.x} y1={it.y} x2={hx} y2={hy}
                        stroke={COLORS.lane} strokeWidth={2} strokeDasharray="4 4" opacity={0.8} />
                      <circle cx={hx} cy={hy} r={15} fill="transparent"
                        onPointerDown={(e) => startRotateHandle(e, it)} style={{ cursor: "grab" }} />
                      <circle cx={hx} cy={hy} r={9} fill={COLORS.lane} stroke={COLORS.ink} strokeWidth={2}
                        pointerEvents="none" />
                      <path d="M -3.5,-1 A 3.5 3.5 0 1 1 0.6,3.2" transform={`translate(${hx},${hy})`}
                        fill="none" stroke={COLORS.ink} strokeWidth={1.6} strokeLinecap="round"
                        pointerEvents="none" />
                    </g>
                  )}
                  {isSel && (
                    <MiniToolbar vb={vb} x={it.x}
                      y={bubbleAbove
                        ? it.y - Math.max(hit.hl, hit.hw) - 56
                        : it.y + Math.max(hit.hl, hit.hw) + 14}>
                      {it.kind === "sign-light" && (
                        <MiniBtn title="Change signal state" onClick={cycleSignal}>
                          <SignalSwatch state={it.signal || "red"} />
                        </MiniBtn>
                      )}
                      <MiniBtn title="Rotate left 15°" onClick={() => rotateSelected(-15)}><RotateCcw size={16} /></MiniBtn>
                      <MiniBtn title="Rotate right 15°" onClick={() => rotateSelected(15)}><RotateCw size={16} /></MiniBtn>
                      <MiniBtn title="Duplicate" onClick={duplicateSelected}><Copy size={16} /></MiniBtn>
                      <MiniBtn title="Delete" onClick={deleteSelected}><Trash2 size={16} /></MiniBtn>
                    </MiniToolbar>
                  )}
                </g>
              );
            })}

            {placeGuide && (
              <g pointerEvents="none" data-transient="1">
                <line x1={placeGuide.x} y1={placeGuide.y} x2={placeGuide.tx} y2={placeGuide.ty}
                  stroke={COLORS.lane} strokeWidth={3} strokeDasharray="8 7" opacity={0.9} />
                <circle cx={placeGuide.x} cy={placeGuide.y} r={4} fill={COLORS.lane} />
                <g transform={`translate(${placeGuide.tx},${placeGuide.ty}) rotate(${placeGuide.deg})`}>
                  <path d="M -11,-8 L 4,0 L -11,8" fill="none" stroke={COLORS.lane} strokeWidth={3.5}
                    strokeLinecap="round" strokeLinejoin="round" />
                </g>
                <text x={placeGuide.tx} y={placeGuide.ty - 20} fontSize={17} fontWeight="700" textAnchor="middle"
                  fill={COLORS.ink} stroke="#fff" strokeWidth={5} paintOrder="stroke"
                  fontFamily={FONT_DISPLAY}>{placeGuide.deg}°</text>
              </g>
            )}

            {texts.map((t) => {
              const isSel = selected?.type === "text" && selected.id === t.id;
              return (
                <g key={t.id}>
                  {editingTextId === t.id ? (
                    <foreignObject x={t.x - 100} y={t.y - 20} width={200} height={40} data-transient="1">
                      <input xmlns="http://www.w3.org/1999/xhtml" autoFocus defaultValue={t.content}
                        aria-label="Label text"
                        onBlur={(e) => {
                          if (cancelEditRef.current) { cancelEditRef.current = false; setEditingTextId(null); return; }
                          setTexts((p) => p.map((x) => x.id === t.id ? { ...x, content: e.target.value || "Label" } : x));
                          setEditingTextId(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") e.target.blur();
                          if (e.key === "Escape") { cancelEditRef.current = true; e.target.blur(); }
                        }}
                        style={{ width: "100%", fontSize: 16, fontFamily: FONT_UI, border: `2px solid ${COLORS.lane}`, borderRadius: 6, padding: "5px 8px" }} />
                    </foreignObject>
                  ) : (
                    <text x={t.x} y={t.y} fontSize={21} fontWeight="600" fill={COLORS[t.color]} fontFamily={FONT_UI}
                      stroke="#fff" strokeWidth={5} paintOrder="stroke"
                      onPointerDown={(e) => startItemDrag(e, t, "text")}
                      onDoubleClick={() => setEditingTextId(t.id)} style={{ cursor: "pointer" }}>
                      {t.content}
                    </text>
                  )}
                  {isSel && editingTextId !== t.id && (
                    <MiniToolbar vb={vb} x={t.x} y={t.y - 52}>
                      <MiniBtn title="Edit text" onClick={() => setEditingTextId(t.id)}><Type size={16} /></MiniBtn>
                      <MiniBtn title="Delete" onClick={deleteSelected}><Trash2 size={16} /></MiniBtn>
                    </MiniToolbar>
                  )}
                </g>
              );
            })}

            <ScaleBar vb={vb} lift={narrow && !uiHidden ? 112 * worldPerPx : 0} />
          </svg>
        </div>
      </div>
    </div>
  );
}

const SAFE_T = "env(safe-area-inset-top, 0px)";
const SAFE_B = "env(safe-area-inset-bottom, 0px)";
const SAFE_L = "env(safe-area-inset-left, 0px)";
const SAFE_R = "env(safe-area-inset-right, 0px)";

const styles = {
  app: {
    position: "relative", width: "100%",
    // dvh tracks the collapsing mobile browser chrome; vh is the fallback
    height: "100vh", maxHeight: "100dvh", minHeight: "100dvh",
    overflow: "hidden", background: COLORS.shoulder, fontFamily: FONT_UI,
    touchAction: "none", overscrollBehavior: "none",
    WebkitUserSelect: "none", userSelect: "none",
    WebkitTapHighlightColor: "transparent",
  },
  topLeft: {
    position: "absolute", top: `calc(12px + ${SAFE_T})`, left: `calc(12px + ${SAFE_L})`,
    zIndex: 12, display: "flex", alignItems: "center", gap: 8,
  },
  topRight: {
    position: "absolute", top: `calc(12px + ${SAFE_T})`, right: `calc(12px + ${SAFE_R})`,
    zIndex: 12, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", justifyContent: "flex-end",
  },
  zoomCluster: {
    position: "absolute", right: `calc(12px + ${SAFE_R})`, zIndex: 12,
    display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
  },
  zoomBadge: {
    display: "flex", alignItems: "center", gap: 3, padding: "4px 7px", borderRadius: 7,
    background: "rgba(20,22,26,0.8)", color: COLORS.lane, fontSize: 11, fontWeight: 600,
    fontFamily: FONT_UI, backdropFilter: "blur(6px)",
  },
  title: { fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 23, letterSpacing: 1, color: COLORS.edge, textShadow: "0 2px 8px rgba(0,0,0,0.6)" },
  statusBar: {
    position: "absolute", top: `calc(64px + ${SAFE_T})`, left: "50%", transform: "translateX(-50%)", zIndex: 14,
    display: "flex", alignItems: "center", padding: "7px 14px", borderRadius: 10,
    background: "rgba(25,53,24,0.92)", color: "#9fe89f", fontSize: 13, backdropFilter: "blur(8px)",
    whiteSpace: "nowrap",
  },
  popRow: {
    position: "absolute", top: `calc(64px + ${SAFE_T})`,
    left: `calc(12px + ${SAFE_L})`, right: `calc(12px + ${SAFE_R})`, zIndex: 14,
    display: "flex", gap: 8, alignItems: "center", padding: "10px 12px", flexWrap: "wrap",
    maxHeight: "50vh", overflowY: "auto",
  },
  input: {
    flex: 1, minWidth: 180, background: "rgba(12,14,17,0.75)", border: "1px solid rgba(255,255,255,0.12)",
    color: COLORS.edge, borderRadius: 8, padding: "11px 10px", fontFamily: FONT_UI,
    fontSize: 16, // 16px stops iOS Safari zooming the page on focus
  },
  backdrop: {
    position: "absolute", inset: 0, zIndex: 13, background: "rgba(0,0,0,0.25)",
  },
  canvasWrap: { position: "absolute", inset: 0, zIndex: 0, pointerEvents: "auto" },
  hint: { color: "#9aa0a6", fontSize: 10.5, lineHeight: 1.5, marginTop: 12, fontFamily: FONT_UI },
};
