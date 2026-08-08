import React, { useState, useEffect, useCallback } from "react";
import { Share2, RotateCcw, HelpCircle, X, Check, Flame } from "lucide-react";

/* =====================================================================
   RIGHT OF WAY — one traffic puzzle a day.
   Tap the road users in the order they may legally proceed.
   Green = right user, right position. Amber = right user, wrong position.
   ===================================================================== */

const SCALE = 20;                 // px per metre
const M = (v) => v * SCALE;
const W = 720, H = 720;           // 36 m x 36 m
const CX = 360, CY = 360;
const LANE = M(3.6);              // 72
const HALF = LANE;                // half-width of a 2-lane road
const OFF = LANE / 2;             // lane centre offset

const C = {
  asphalt: "#43474F",
  grass: "#5E8A54",
  grassDark: "#4E7746",
  line: "#FAFAF2",
  yellow: "#FFC93C",
  ink: "#191C22",
  red: "#E05252",
  green: "#3BAA51",
  blue: "#3B7BE8",
  amber: "#F0A93C",
  white: "#FAFAF2",
  bg: "#1A1C20",
  panel: "rgba(32,35,40,0.92)",
};

const FONT_D = "'Rajdhani','Oswald','Arial Narrow',system-ui,sans-serif";
const FONT_U = "'Inter',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif";

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) =>
    Math.max(0, Math.min(255, Math.round(v + 255 * amt))));
  return `#${((ch[0] << 16) | (ch[1] << 8) | ch[2]).toString(16).padStart(6, "0")}`;
}

/* --- storage: sandbox-aware, swappable for Capacitor later --- */
const Store = (() => {
  const mem = new Map();
  const g = typeof window !== "undefined" ? window : {};
  const api = g.storage;
  return {
    async get(k) {
      if (api?.get) { try { const r = await api.get(k, false); return r?.value ?? null; } catch { return null; } }
      return mem.has(k) ? mem.get(k) : null;
    },
    async set(k, v) {
      if (api?.set) { try { await api.set(k, v, false); return; } catch { /* fall through */ } }
      mem.set(k, v);
    },
  };
})();

/* ---------------- puzzle scheduling ---------------- */
const EPOCH = Date.UTC(2026, 0, 1);
function todayIndex() {
  const now = new Date();
  const local = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(0, Math.floor((local - EPOCH) / 86400000));
}

/* ---------------- road graphics ---------------- */
const GRASS = (() => {
  let a = 1337;
  const rnd = () => { a = (a * 1103515245 + 12345) & 0x7fffffff; return a / 0x7fffffff; };
  return Array.from({ length: 150 }, () => ({
    x: rnd() * W, y: rnd() * H, rx: 6 + rnd() * 14, ry: 3 + rnd() * 5,
    rot: rnd() * 180, light: rnd() > 0.5, o: 0.06 + rnd() * 0.09,
  }));
})();

const Dash = (p) => <line {...p} stroke={C.yellow} strokeWidth={M(0.15)} strokeDasharray={`${M(3)} ${M(6)}`} />;
const Edge = (p) => <line {...p} stroke={C.line} strokeWidth={M(0.15)} />;
const StopBar = (p) => <line {...p} stroke={C.line} strokeWidth={M(0.4)} />;

function Crosswalk({ x1, y1, x2, y2, depth }) {
  const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
  const bw = M(0.5), pitch = M(0.95);
  const n = Math.floor(len / pitch);
  return (
    <g>
      {Array.from({ length: n }, (_, i) => {
        const t = (i + 0.5) * pitch;
        const px = x1 + ux * t, py = y1 + uy * t;
        return <line key={i} x1={px} y1={py} x2={px + nx * depth} y2={py + ny * depth}
          stroke={C.line} strokeWidth={bw} />;
      })}
    </g>
  );
}

function Layout({ kind }) {
  if (kind === "roundabout") {
    const outer = M(9), island = M(4);
    return (
      <>
        <rect x={CX - HALF} y={0} width={HALF * 2} height={CY - outer + 6} fill={C.asphalt} />
        <rect x={CX - HALF} y={CY + outer - 6} width={HALF * 2} height={H} fill={C.asphalt} />
        <rect x={0} y={CY - HALF} width={CX - outer + 6} height={HALF * 2} fill={C.asphalt} />
        <rect x={CX + outer - 6} y={CY - HALF} width={W} height={HALF * 2} fill={C.asphalt} />
        <circle cx={CX} cy={CY} r={outer} fill={C.asphalt} />
        <circle cx={CX} cy={CY} r={island} fill={C.grass} stroke={C.line} strokeWidth={M(0.15)} />
        <circle cx={CX} cy={CY} r={outer - M(0.2)} fill="none" stroke={C.line} strokeWidth={M(0.15)} />
        <Dash x1={CX} y1={0} x2={CX} y2={CY - outer - M(1)} />
        <Dash x1={CX} y1={CY + outer + M(1)} x2={CX} y2={H} />
        <Dash x1={0} y1={CY} x2={CX - outer - M(1)} y2={CY} />
        <Dash x1={CX + outer + M(1)} y1={CY} x2={W} y2={CY} />
      </>
    );
  }
  if (kind === "tjunction") {
    return (
      <>
        <rect x={0} y={CY - HALF} width={W} height={HALF * 2} fill={C.asphalt} />
        <rect x={CX - HALF} y={0} width={HALF * 2} height={CY} fill={C.asphalt} />
        <Edge x1={0} y1={CY + HALF} x2={W} y2={CY + HALF} />
        <Edge x1={0} y1={CY - HALF} x2={CX - HALF} y2={CY - HALF} />
        <Edge x1={CX + HALF} y1={CY - HALF} x2={W} y2={CY - HALF} />
        <Dash x1={0} y1={CY} x2={W} y2={CY} />
        <Dash x1={CX} y1={0} x2={CX} y2={CY - HALF} />
      </>
    );
  }
  if (kind === "straight") {
    return (
      <>
        <rect x={CX - HALF} y={0} width={HALF * 2} height={H} fill={C.asphalt} />
        <Edge x1={CX - HALF} y1={0} x2={CX - HALF} y2={H} />
        <Edge x1={CX + HALF} y1={0} x2={CX + HALF} y2={H} />
        <Dash x1={CX} y1={0} x2={CX} y2={H} />
      </>
    );
  }
  // crossroad
  return (
    <>
      <rect x={CX - HALF} y={0} width={HALF * 2} height={H} fill={C.asphalt} />
      <rect x={0} y={CY - HALF} width={W} height={HALF * 2} fill={C.asphalt} />
      <Edge x1={CX - HALF} y1={0} x2={CX - HALF} y2={CY - HALF} />
      <Edge x1={CX + HALF} y1={0} x2={CX + HALF} y2={CY - HALF} />
      <Edge x1={CX - HALF} y1={CY + HALF} x2={CX - HALF} y2={H} />
      <Edge x1={CX + HALF} y1={CY + HALF} x2={CX + HALF} y2={H} />
      <Edge x1={0} y1={CY - HALF} x2={CX - HALF} y2={CY - HALF} />
      <Edge x1={0} y1={CY + HALF} x2={CX - HALF} y2={CY + HALF} />
      <Edge x1={CX + HALF} y1={CY - HALF} x2={W} y2={CY - HALF} />
      <Edge x1={CX + HALF} y1={CY + HALF} x2={W} y2={CY + HALF} />
      <Dash x1={CX} y1={0} x2={CX} y2={CY - HALF} />
      <Dash x1={CX} y1={CY + HALF} x2={CX} y2={H} />
      <Dash x1={0} y1={CY} x2={CX - HALF} y2={CY} />
      <Dash x1={CX + HALF} y1={CY} x2={W} y2={CY} />
    </>
  );
}

/* ---------------- props (signs, signals, markings) ---------------- */
function Prop({ p }) {
  if (p.t === "stop") {
    const R = 15;
    return (
      <g transform={`translate(${p.x},${p.y})`}>
        <ellipse cx={0} cy={R * 0.6} rx={R * 0.5} ry={R * 0.2} fill="#000" opacity={0.25} />
        <polygon points={`${-R * .41},${-R} ${R * .41},${-R} ${R},${-R * .41} ${R},${R * .41} ${R * .41},${R} ${-R * .41},${R} ${-R},${R * .41} ${-R},${-R * .41}`}
          fill={C.red} stroke="#fff" strokeWidth={2.5} />
        <polygon points={`${-R * .41},${-R} ${R * .41},${-R} ${R},${-R * .41} ${R},${R * .41} ${R * .41},${R} ${-R * .41},${R} ${-R},${R * .41} ${-R},${-R * .41}`}
          fill="none" stroke={C.ink} strokeWidth={1.5} />
        <text y={4} fontSize={9} fontWeight="700" fill="#fff" textAnchor="middle" fontFamily={FONT_D}>STOP</text>
      </g>
    );
  }
  if (p.t === "signal") {
    const R = 15, on = p.state;
    const lamp = (cy, col, lit) => (
      <>
        {lit && <circle cx={0} cy={cy} r={R * 0.44} fill={col} opacity={0.35} />}
        <circle cx={0} cy={cy} r={R * 0.26} fill={lit ? col : shade(col, -0.42)} opacity={lit ? 1 : 0.45}
          stroke={C.ink} strokeWidth={1} />
      </>
    );
    return (
      <g transform={`translate(${p.x},${p.y})`}>
        <rect x={-R * .5} y={-R * 1.1} width={R} height={R * 2.2} rx={5} fill="#2A2E36" stroke={C.ink} strokeWidth={2} />
        {lamp(-R * 0.62, C.red, on === "red")}
        {lamp(0, C.yellow, on === "amber")}
        {lamp(R * 0.62, C.green, on === "green")}
      </g>
    );
  }
  if (p.t === "yield") {
    const R = 15;
    return (
      <g transform={`translate(${p.x},${p.y})`}>
        <polygon points={`${-R},${-R * .75} ${R},${-R * .75} 0,${R}`} fill="#fff" stroke={C.red} strokeWidth={4} strokeLinejoin="round" />
        <polygon points={`${-R},${-R * .75} ${R},${-R * .75} 0,${R}`} fill="none" stroke={C.ink} strokeWidth={1.4} strokeLinejoin="round" />
      </g>
    );
  }
  if (p.t === "crosswalk") return <Crosswalk {...p} />;
  if (p.t === "stopbar") return <StopBar x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2} />;
  if (p.t === "crossover") {
    // Ontario pedestrian crossover: ladder bars plus approach lines
    return (
      <g>
        <Crosswalk x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2} depth={p.depth} />
        <line x1={p.x1} y1={p.y1} x2={p.x1 + (p.x2 - p.x1)} y2={p.y1 + (p.y2 - p.y1)}
          stroke={C.line} strokeWidth={M(0.15)} />
      </g>
    );
  }
  return null;
}

/* ---------------- road users ---------------- */
function Actor({ a, badge, state }) {
  const col = a.color || C.blue;
  const o = C.ink;
  const glass = "#CFE3F0";
  let body = null;

  if (a.kind === "car" || a.kind === "ambulance" || a.kind === "bus") {
    const isBus = a.kind === "bus";
    const L = isBus ? M(9) : a.kind === "ambulance" ? M(6) : M(4.5);
    const Wd = isBus ? M(2.5) : a.kind === "ambulance" ? M(2.2) : M(1.8);
    const wheel = (wx, wy) => (
      <rect x={wx - M(0.35)} y={wy - M(0.13)} width={M(0.7)} height={M(0.26)} rx={M(0.1)}
        fill="#1D2026" stroke={o} strokeWidth={1.2} />
    );
    body = (
      <g>
        {wheel(L / 2 - M(1), -Wd / 2)}{wheel(L / 2 - M(1), Wd / 2)}
        {wheel(-L / 2 + M(0.9), -Wd / 2)}{wheel(-L / 2 + M(0.9), Wd / 2)}
        <rect x={-L / 2} y={-Wd / 2} width={L} height={Wd} rx={M(0.5)} fill={col} stroke={o} strokeWidth={2.5} />
        <rect x={-L / 2 + M(0.3)} y={-Wd / 2 + M(0.15)} width={L - M(0.6)} height={M(0.2)} rx={M(0.1)}
          fill="#fff" opacity={0.28} />
        <rect x={-M(1.3)} y={-Wd / 2 + M(0.16)} width={M(2.4)} height={Wd - M(0.32)} rx={M(0.3)}
          fill={shade(col, -0.14)} stroke={o} strokeWidth={1.6} />
        <path d={`M ${M(0.5)},${-Wd / 2 + M(0.22)} L ${M(1.1)},${-Wd / 2 + M(0.46)}
                  L ${M(1.1)},${Wd / 2 - M(0.46)} L ${M(0.5)},${Wd / 2 - M(0.22)} Z`}
          fill={glass} stroke={o} strokeWidth={1.2} />
        {a.kind === "ambulance" && (
          <>
            <rect x={-M(0.5)} y={-Wd / 2 - M(0.22)} width={M(1)} height={M(0.24)} rx={3} fill={C.red} stroke={o} strokeWidth={1} />
            <text x={-M(0.1)} y={M(0.15)} fontSize={9} fontWeight="700" fill="#fff" textAnchor="middle"
              fontFamily={FONT_D} transform={`rotate(180 ${-M(0.1)} 0)`}>AMB</text>
          </>
        )}
        {isBus && (
          <>
            <rect x={-L / 2 + M(0.4)} y={-Wd / 2 + M(0.3)} width={M(7)} height={Wd - M(0.6)} fill="#000" opacity={0.08} />
            <circle cx={-L / 2 + M(0.5)} cy={-Wd / 2 + M(0.2)} r={M(0.22)} fill={C.red} stroke={o} strokeWidth={1} />
            <circle cx={-L / 2 + M(0.5)} cy={Wd / 2 - M(0.2)} r={M(0.22)} fill={C.red} stroke={o} strokeWidth={1} />
          </>
        )}
      </g>
    );
  } else if (a.kind === "bike") {
    const L = M(1.8);
    body = (
      <g>
        <ellipse cx={-L / 2 + M(0.3)} cy={0} rx={M(0.3)} ry={M(0.1)} fill="#1D2026" stroke={o} strokeWidth={1.2} />
        <ellipse cx={L / 2 - M(0.3)} cy={0} rx={M(0.3)} ry={M(0.1)} fill="#1D2026" stroke={o} strokeWidth={1.2} />
        <rect x={-L / 2 + M(0.25)} y={-M(0.08)} width={L - M(0.5)} height={M(0.16)} rx={M(0.07)}
          fill={col} stroke={o} strokeWidth={1.2} />
        <circle cx={-M(0.1)} cy={0} r={M(0.3)} fill={shade(col, 0.1)} stroke={o} strokeWidth={1.8} />
        <circle cx={-M(0.1)} cy={0} r={M(0.14)} fill="#2A2D33" />
      </g>
    );
  } else {
    // pedestrian, viewed from above
    body = (
      <g>
        <ellipse cx={0} cy={0} rx={M(0.22)} ry={M(0.34)} fill={col} stroke={o} strokeWidth={2} />
        <circle cx={M(0.05)} cy={0} r={M(0.17)} fill="#2A2D33" stroke={o} strokeWidth={1.2} />
      </g>
    );
  }

  const ring = state === "green" ? C.green : state === "amber" ? C.amber : C.yellow;
  const bw = a.kind === "ped" ? M(1.5) : M(2.4);

  return (
    <g transform={`translate(${a.x},${a.y})`} style={{ cursor: "pointer" }}>
      {badge && <circle r={bw + 8} fill={ring} opacity={0.18} />}
      <g transform={`rotate(${a.rotation})`} filter="url(#sh)">{body}</g>
      {a.intent && (
        <g opacity={0.9}>
          <path d={intentPath(a)} fill="none" stroke={C.white} strokeWidth={3}
            strokeDasharray="6 5" strokeLinecap="round" markerEnd="url(#tip)" />
        </g>
      )}
      {badge && (
        <g>
          <circle cx={0} cy={-bw - 14} r={13} fill={ring} stroke={C.ink} strokeWidth={2.5} />
          <text x={0} y={-bw - 9} fontSize={16} fontWeight="700" textAnchor="middle" fill={C.ink}
            fontFamily={FONT_D}>{badge}</text>
        </g>
      )}
      <circle r={Math.max(30, bw + 12)} fill="transparent" />
    </g>
  );
}

// short dashed arrow showing where each road user intends to go
function intentPath(a) {
  const r = (a.rotation * Math.PI) / 180;
  const fx = Math.cos(r), fy = Math.sin(r);
  const lx = Math.cos(r - Math.PI / 2), ly = Math.sin(r - Math.PI / 2);
  const d = M(3.4), t = M(2.6);
  const sx = fx * M(2.6), sy = fy * M(2.6);
  if (a.intent === "left") return `M ${sx},${sy} L ${fx * d},${fy * d} L ${fx * d + lx * t},${fy * d + ly * t}`;
  if (a.intent === "right") return `M ${sx},${sy} L ${fx * d},${fy * d} L ${fx * d - lx * t},${fy * d - ly * t}`;
  return `M ${sx},${sy} L ${fx * (d + t)},${fy * (d + t)}`;
}

/* =====================================================================
   PUZZLES
   Every answer is a strict chain: each road user is blocked by the one
   before it, so the order is not a matter of opinion.
   ===================================================================== */
const N_IN = { x: CX - OFF, rotation: 90 };    // from north, heading south
const S_IN = { x: CX + OFF, rotation: -90 };   // from south, heading north
const E_IN = { y: CY - OFF, rotation: 180 };   // from east, heading west
const W_IN = { y: CY + OFF, rotation: 0 };     // from west, heading east

const PUZZLES = [
  {
    layout: "crossroad",
    title: "All-way stop",
    props: [
      { t: "stop", x: CX - HALF - 34, y: CY + HALF + 30 },
      { t: "stop", x: CX + HALF + 34, y: CY - HALF - 30 },
      { t: "stop", x: CX - HALF - 34, y: CY - HALF - 30 },
      { t: "stopbar", x1: CX - HALF, y1: CY + HALF + 8, x2: CX, y2: CY + HALF + 8 },
    ],
    note: "All three arrive at exactly the same moment.",
    actors: [
      { id: "a", ...W_IN, x: 190, kind: "car", color: C.blue, intent: "straight", name: "Blue car" },
      { id: "b", ...N_IN, y: 190, kind: "car", color: C.red, intent: "straight", name: "Red car" },
      { id: "c", ...E_IN, x: 530, kind: "car", color: C.green, intent: "straight", name: "Green car" },
    ],
    answer: ["a", "b", "c"],
    rule: "Yield to the vehicle on your right",
    why: "The blue car has an empty leg on its right, so nobody outranks it — it goes first. That clears the red car's right, so the red car follows, and the green car goes last. Simultaneous arrivals unwind one at a time, not all at once.",
  },
  {
    layout: "crossroad",
    title: "Turning left on a green light",
    props: [
      { t: "signal", x: CX + HALF + 30, y: CY - HALF - 30, state: "green" },
      { t: "signal", x: CX - HALF - 30, y: CY + HALF + 30, state: "green" },
      { t: "crosswalk", x1: CX - HALF - 26, y1: CY - HALF, x2: CX - HALF - 26, y2: CY + HALF, depth: M(2.2) },
    ],
    note: "Both cars have a solid green — no arrow.",
    actors: [
      { id: "a", ...S_IN, y: 520, kind: "car", color: C.blue, intent: "left", name: "Blue car" },
      { id: "b", ...N_IN, y: 200, kind: "car", color: C.red, intent: "right", name: "Red car" },
      { id: "c", kind: "ped", x: CX - HALF - 14, y: CY + 10, rotation: -90, color: "#F2E8D5", name: "Pedestrian" },
    ],
    answer: ["c", "b", "a"],
    rule: "A green light is permission to go, not the right of way",
    why: "Both cars are turning into the same street, and the pedestrian is already in that crosswalk — everyone yields to them first. The red car turning right has priority over the blue car turning left, because a left turn must give way to oncoming traffic.",
  },
  {
    layout: "roundabout",
    title: "Entering a roundabout",
    props: [
      { t: "yield", x: CX + HALF + 30, y: CY + M(9) + 46 },
      { t: "yield", x: CX - HALF - 30, y: CY - M(9) - 46 },
    ],
    note: "Traffic circulates counter-clockwise.",
    actors: [
      { id: "a", kind: "car", color: C.blue, x: CX + OFF, y: 620, rotation: -90, intent: "straight", name: "Blue car" },
      { id: "b", kind: "car", color: C.red, x: CX - M(6.5), y: CY - M(1), rotation: 100, intent: "straight", name: "Red car" },
      { id: "c", kind: "car", color: C.green, x: CX - OFF, y: 100, rotation: 90, intent: "straight", name: "Green car" },
    ],
    answer: ["b", "c", "a"],
    rule: "Yield to traffic already in the circle",
    why: "The red car is already circulating, so it owes nobody. It is bearing down on the blue car's entry from the left, so the blue car waits. The green car's entry point is clear behind the red car, so it can slot in ahead of the blue car.",
  },
  {
    layout: "tjunction",
    title: "Joining from a side road",
    props: [{ t: "stop", x: CX + HALF + 32, y: CY - HALF - 30 }],
    note: "The side road has a stop sign. The through road does not.",
    actors: [
      { id: "a", ...W_IN, x: 180, kind: "car", color: C.red, intent: "straight", name: "Red car" },
      { id: "b", ...W_IN, x: 40, kind: "car", color: C.green, intent: "straight", name: "Green car" },
      { id: "c", ...N_IN, y: 210, kind: "car", color: C.blue, intent: "right", name: "Blue car" },
    ],
    answer: ["a", "b", "c"],
    rule: "A side road yields to the whole through road",
    why: "The blue car waits for a gap — and a gap means the entire stream, not just the first car. The red car leads, the green car follows close behind it, and only then is the road actually clear. Pulling out between them is the classic side-road mistake.",
  },
  {
    layout: "crossroad",
    title: "Right turn on a red light",
    props: [
      { t: "signal", x: CX - HALF - 30, y: CY + HALF + 30, state: "red" },
      { t: "signal", x: CX + HALF + 30, y: CY + HALF + 34, state: "green" },
      { t: "stopbar", x1: CX - HALF - 8, y1: CY, x2: CX - HALF - 8, y2: CY + HALF },
    ],
    note: "East–west has a red light. North–south has green.",
    actors: [
      { id: "a", ...S_IN, y: 540, kind: "car", color: C.green, intent: "straight", name: "Green car" },
      { id: "b", ...W_IN, x: 250, kind: "car", color: C.blue, intent: "right", name: "Blue car" },
      { id: "c", ...W_IN, x: 90, kind: "car", color: C.red, intent: "straight", name: "Red car" },
    ],
    answer: ["a", "b", "c"],
    rule: "Right on red is allowed — after a full stop, and after everyone else",
    why: "The green car has the light, so it goes first. The blue car may then turn right on the red once it has stopped completely and the way is clear. The red car behind it is going straight, so it has to sit through the whole red — it goes last.",
  },
  {
    layout: "straight",
    title: "Emergency vehicle approaching",
    props: [],
    note: "Lights and siren are on.",
    actors: [
      { id: "a", kind: "ambulance", color: "#F2F4F6", x: CX + OFF, y: 600, rotation: -90, intent: "straight", name: "Ambulance" },
      { id: "b", kind: "car", color: C.blue, x: CX + OFF, y: 250, rotation: -90, intent: "straight", name: "Blue car" },
      { id: "c", kind: "car", color: C.red, x: CX + OFF, y: 420, rotation: -90, intent: "straight", name: "Red car" },
    ],
    answer: ["a", "b", "c"],
    rule: "Pull to the right and stop",
    why: "Both cars move right and stop until the ambulance is past — it goes first, no argument. After it clears, the blue car is ahead so it pulls away first, and the red car follows. Stopping in place in the middle of the lane is what blocks emergency vehicles.",
  },
  {
    layout: "straight",
    title: "Pedestrian crossover",
    props: [
      { t: "crossover", x1: CX - HALF, y1: CY - 10, x2: CX + HALF, y2: CY - 10, depth: M(2.4) },
      { t: "stopbar", x1: CX, y1: CY + 76, x2: CX + HALF, y2: CY + 76 },
    ],
    note: "A marked crossover — not a signalised crossing.",
    actors: [
      { id: "a", kind: "ped", x: CX - M(1.4), y: CY + 2, rotation: 0, color: "#F2E8D5", name: "Pedestrian" },
      { id: "b", kind: "car", color: C.blue, x: CX + OFF, y: 520, rotation: -90, intent: "straight", name: "Blue car" },
      { id: "c", kind: "car", color: C.red, x: CX + OFF, y: 650, rotation: -90, intent: "straight", name: "Red car" },
    ],
    answer: ["a", "b", "c"],
    rule: "Wait until the pedestrian is completely across",
    why: "At a crossover you must stay put until the pedestrian has cleared the entire road — not just your own lane. Only then does the blue car go, followed by the red car behind it. Creeping forward behind someone still walking is an automatic fail, and a ticket.",
  },
  {
    layout: "crossroad",
    title: "Uncontrolled intersection",
    props: [],
    note: "No signs, no lights. All three arrive together.",
    actors: [
      { id: "a", ...N_IN, y: 200, kind: "bike", color: C.amber, intent: "straight", name: "Cyclist" },
      { id: "b", ...E_IN, x: 530, kind: "car", color: C.red, intent: "straight", name: "Red car" },
      { id: "c", ...S_IN, y: 530, kind: "car", color: C.blue, intent: "straight", name: "Blue car" },
    ],
    answer: ["a", "b", "c"],
    rule: "A bicycle is a vehicle and takes its turn like one",
    why: "Same right-hand rule as any intersection. Nothing sits to the cyclist's right, so they go first — cyclists are not pedestrians and do not get waved through out of turn. The red car's right is then clear, and the blue car goes last.",
  },
];

/* ---------------- share grid ---------------- */
const SQ = { green: "🟩", amber: "🟨", grey: "⬜" };
function gradeGuess(guess, answer) {
  return guess.map((g, i) => (g === answer[i] ? "green" : answer.includes(g) ? "amber" : "grey"));
}

/* ================= GAME ================= */
export default function RightOfWay() {
  const dayIdx = todayIndex();
  const puzzle = PUZZLES[dayIdx % PUZZLES.length];
  const maxTries = puzzle.actors.length + 1;

  const [picks, setPicks] = useState([]);
  const [tries, setTries] = useState([]);
  const [done, setDone] = useState(false);
  const [won, setWon] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [streak, setStreak] = useState(0);
  const [toast, setToast] = useState("");
  const [shake, setShake] = useState(false);

  useEffect(() => {
    (async () => {
      const raw = await Store.get("row:state");
      if (!raw) return;
      try {
        const st = JSON.parse(raw);
        setStreak(st.streak || 0);
        if (st.day === dayIdx) {
          setTries(st.tries || []);
          setDone(!!st.done);
          setWon(!!st.won);
        }
      } catch { /* fresh start */ }
    })();
  }, [dayIdx]);

  const persist = useCallback(async (next) => {
    await Store.set("row:state", JSON.stringify({ day: dayIdx, ...next }));
  }, [dayIdx]);

  const flash = (m) => { setToast(m); setTimeout(() => setToast(""), 1800); };

  function tapActor(id) {
    if (done) return;
    if (picks.includes(id)) { setPicks(picks.filter((p) => p !== id)); return; }
    if (picks.length >= puzzle.actors.length) return;
    setPicks([...picks, id]);
  }

  function submit() {
    if (picks.length !== puzzle.actors.length || done) return;
    const marks = gradeGuess(picks, puzzle.answer);
    const nextTries = [...tries, { picks, marks }];
    setTries(nextTries);
    const solved = marks.every((m) => m === "green");
    const out = solved || nextTries.length >= maxTries;

    if (solved) {
      const s = streak + 1;
      setStreak(s); setWon(true); setDone(true);
      persist({ tries: nextTries, done: true, won: true, streak: s });
    } else if (out) {
      setDone(true); setWon(false); setStreak(0);
      persist({ tries: nextTries, done: true, won: false, streak: 0 });
    } else {
      setShake(true); setTimeout(() => setShake(false), 420);
      persist({ tries: nextTries, done: false, won: false, streak });
      flash("Not quite — look again");
    }
    setPicks([]);
  }

  async function share() {
    const head = `Right of Way #${dayIdx}  ${won ? tries.length : "X"}/${maxTries}`;
    const grid = tries.map((t) => t.marks.map((m) => SQ[m]).join("")).join("\n");
    const text = `${head}\n${grid}${streak > 1 ? `\n🔥 ${streak} day streak` : ""}`;
    try {
      if (navigator.share) await navigator.share({ text });
      else { await navigator.clipboard.writeText(text); flash("Copied to clipboard"); }
    } catch { flash("Copy failed"); }
  }

  const lastTry = tries.length ? tries[tries.length - 1] : null;
  // While choosing, show the live selection. Once submitted, replay the last
  // attempt on the board itself so you can see which vehicle was misplaced.
  const badgeFor = (id) => {
    if (picks.length) {
      const i = picks.indexOf(id);
      return i === -1 ? null : i + 1;
    }
    if (!lastTry) return null;
    const i = lastTry.picks.indexOf(id);
    return i === -1 ? null : i + 1;
  };
  const stateFor = (id) => {
    if (picks.length || !lastTry) return null;
    const i = lastTry.picks.indexOf(id);
    return i === -1 ? null : lastTry.marks[i];
  };

  return (
    <div style={s.app}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@600;700&family=Inter:wght@400;500;600&display=swap');
        * { box-sizing:border-box; -webkit-tap-highlight-color:transparent; }
        html,body { overscroll-behavior:none; }
        .btn { font-family:${FONT_U}; border-radius:10px; cursor:pointer; border:1px solid rgba(255,255,255,0.12);
          background:rgba(58,62,70,0.9); color:${C.white}; padding:12px 16px; font-size:14px; font-weight:500;
          min-height:46px; display:flex; align-items:center; justify-content:center; gap:8px; }
        .btn:disabled { opacity:0.4; cursor:default; }
        .btn.primary { background:${C.green}; border-color:transparent; font-weight:600; }
        .btn:focus-visible { outline:3px solid ${C.yellow}; outline-offset:2px; }
        @keyframes nudge { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-7px)} 75%{transform:translateX(7px)} }
        .shake { animation: nudge 0.42s ease; }
        @media (prefers-reduced-motion: reduce) { .shake { animation:none; } }
      `}</style>

      <header style={s.head}>
        <div>
          <div style={s.title}>RIGHT OF <span style={{ color: C.yellow }}>WAY</span></div>
          <div style={s.sub}>#{dayIdx} · {puzzle.title}</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {streak > 0 && (
            <div style={s.streak}><Flame size={14} />{streak}</div>
          )}
          <button className="btn" style={{ padding: 10, minHeight: 40 }} onClick={() => setHelpOpen(true)}
            aria-label="How to play"><HelpCircle size={18} /></button>
        </div>
      </header>

      <div style={s.prompt}>
        Tap the road users in the order they may <strong style={{ color: C.yellow }}>legally proceed</strong>.
        {puzzle.note && <span style={s.note}>{puzzle.note}</span>}
      </div>

      <div style={s.board} className={shake ? "shake" : ""}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "100%", display: "block", touchAction: "manipulation" }}>
          <defs>
            <filter id="sh" x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#0B0D10" floodOpacity="0.45" />
            </filter>
            <marker id="tip" markerWidth="6" markerHeight="6" refX="4" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 z" fill={C.white} />
            </marker>
          </defs>

          <rect x={0} y={0} width={W} height={H} fill={C.grass} />
          {GRASS.map((g, i) => (
            <ellipse key={i} cx={g.x} cy={g.y} rx={g.rx} ry={g.ry}
              transform={`rotate(${g.rot} ${g.x} ${g.y})`}
              fill={g.light ? shade(C.grass, 0.08) : C.grassDark} opacity={g.o} />
          ))}

          <Layout kind={puzzle.layout} />
          {puzzle.props.map((p, i) => <Prop key={i} p={p} />)}

          {puzzle.actors.map((a) => (
            <g key={a.id} onClick={() => tapActor(a.id)} onPointerDown={(e) => e.preventDefault()}>
              <Actor a={a}
                badge={done && !won ? puzzle.answer.indexOf(a.id) + 1 : badgeFor(a.id)}
                state={done && !won ? "green" : stateFor(a.id)} />
            </g>
          ))}
        </svg>
      </div>

      {/* guess history */}
      {tries.length > 0 && (
        <div style={s.history}>
          {tries.map((t, i) => (
            <div key={i} style={{ display: "flex", gap: 5 }}>
              {t.marks.map((m, j) => (
                <div key={j} style={{
                  ...s.cell,
                  background: m === "green" ? C.green : m === "amber" ? C.amber : "#4A4E56",
                }}>
                  {puzzle.actors.find((a) => a.id === t.picks[j])?.name.split(" ")[0].slice(0, 3)}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {toast && <div style={s.toast}>{toast}</div>}

      {/* result panel */}
      {done ? (
        <div style={s.result}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            {won ? <Check size={18} color={C.green} /> : <X size={18} color={C.red} />}
            <strong style={{ fontSize: 15 }}>
              {won ? `Solved in ${tries.length}` : "Out of tries"}
            </strong>
          </div>
          <div style={s.ruleLine}>{puzzle.rule}</div>
          <div style={s.why}>{puzzle.why}</div>
          <div style={s.answerRow}>
            {puzzle.answer.map((id, i) => (
              <span key={id} style={s.answerChip}>
                {i + 1}. {puzzle.actors.find((a) => a.id === id)?.name}
              </span>
            ))}
          </div>
          <button className="btn primary" style={{ width: "100%", marginTop: 12 }} onClick={share}>
            <Share2 size={16} />Share result
          </button>
          <div style={s.next}>Next puzzle tomorrow.</div>
        </div>
      ) : (
        <div style={s.controls}>
          <button className="btn" onClick={() => setPicks([])} disabled={!picks.length}
            aria-label="Clear selection"><RotateCcw size={16} />Clear</button>
          <button className="btn primary" style={{ flex: 1 }} onClick={submit}
            disabled={picks.length !== puzzle.actors.length}>
            {picks.length !== puzzle.actors.length
              ? `Pick ${puzzle.actors.length - picks.length} more`
              : `Submit — ${maxTries - tries.length} ${maxTries - tries.length === 1 ? "try" : "tries"} left`}
          </button>
        </div>
      )}

      {helpOpen && (
        <div style={s.modalWrap} onClick={() => setHelpOpen(false)}>
          <div style={s.modal} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong style={{ fontFamily: FONT_D, fontSize: 20, letterSpacing: 1 }}>HOW TO PLAY</strong>
              <button className="btn" style={{ padding: 8, minHeight: 36 }} onClick={() => setHelpOpen(false)}><X size={16} /></button>
            </div>
            <p style={s.p}>One traffic situation a day. Tap each road user in the order they may legally proceed.</p>
            <div style={{ display: "flex", gap: 8, alignItems: "center", margin: "10px 0" }}>
              <div style={{ ...s.cell, background: C.green }}>1</div>
              <span style={s.p}>Right user, right position.</span>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
              <div style={{ ...s.cell, background: C.amber }}>2</div>
              <span style={s.p}>Goes at some point — but not in that slot.</span>
            </div>
            <p style={s.p}>
              Dashed arrows show where each road user intends to go. Every puzzle has one defensible
              answer and a short explanation of the rule behind it.
            </p>
            <p style={{ ...s.p, color: "#7d838c", fontSize: 12 }}>
              Rules follow Ontario, Canada. Always defer to local law and posted signs.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

const s = {
  app: {
    position: "relative", width: "100%", minHeight: "100dvh", background: C.bg, color: C.white,
    fontFamily: FONT_U, display: "flex", flexDirection: "column", gap: 10,
    padding: `calc(12px + env(safe-area-inset-top,0px)) 12px calc(12px + env(safe-area-inset-bottom,0px))`,
    maxWidth: 560, margin: "0 auto", userSelect: "none",
  },
  head: { display: "flex", justifyContent: "space-between", alignItems: "flex-start" },
  title: { fontFamily: FONT_D, fontWeight: 700, fontSize: 26, letterSpacing: 1.5, lineHeight: 1 },
  sub: { fontSize: 12, color: "#8b9199", marginTop: 3 },
  streak: {
    display: "flex", alignItems: "center", gap: 4, background: "rgba(240,169,60,0.15)",
    color: C.amber, padding: "8px 10px", borderRadius: 9, fontSize: 13, fontWeight: 600,
  },
  prompt: { fontSize: 13.5, lineHeight: 1.5, color: "#c8cdd4" },
  note: { display: "block", color: "#8b9199", fontSize: 12.5, marginTop: 3, fontStyle: "italic" },
  board: {
    borderRadius: 14, overflow: "hidden", border: "1px solid rgba(255,255,255,0.08)",
    boxShadow: "0 10px 30px rgba(0,0,0,0.4)", background: C.grass,
  },
  history: { display: "flex", flexDirection: "column", gap: 5, alignItems: "center" },
  cell: {
    width: 42, height: 32, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 12, fontWeight: 700, color: C.ink, fontFamily: FONT_D, letterSpacing: 0.5,
  },
  controls: { display: "flex", gap: 8 },
  result: { background: C.panel, border: "1px solid rgba(255,255,255,0.09)", borderRadius: 14, padding: 14 },
  ruleLine: { fontFamily: FONT_D, fontSize: 19, fontWeight: 700, color: C.yellow, lineHeight: 1.2, marginBottom: 6 },
  why: { fontSize: 13.5, lineHeight: 1.6, color: "#c8cdd4" },
  answerRow: { display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 },
  answerChip: {
    background: "rgba(255,255,255,0.07)", padding: "5px 9px", borderRadius: 7,
    fontSize: 12, color: "#c8cdd4",
  },
  next: { textAlign: "center", fontSize: 12, color: "#7d838c", marginTop: 10 },
  toast: {
    position: "fixed", bottom: 90, left: "50%", transform: "translateX(-50%)",
    background: "rgba(20,22,26,0.95)", padding: "10px 16px", borderRadius: 10, fontSize: 13,
    border: "1px solid rgba(255,255,255,0.12)", zIndex: 30,
  },
  modalWrap: {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 40,
    display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
  },
  modal: {
    background: "#22252A", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 16,
    padding: 18, maxWidth: 420, width: "100%",
  },
  p: { fontSize: 13.5, lineHeight: 1.6, color: "#c8cdd4", margin: "8px 0" },
};
