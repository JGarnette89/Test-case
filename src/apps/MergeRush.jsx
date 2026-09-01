/* =====================================================================
   MERGE RUSH
   A between-stages arcade aside, not a graded driving test — the genre
   seen in mobile ads: run forward through gates that grow (or shrink)
   your numbers, then hit a wave and see if you were big enough.

   Reskinned for this game's world rather than borrowed wholesale: the
   "swarm" is a convoy of cars merging down a multi-lane road, the gates
   are painted like real road-sign categories (green guide sign = add,
   amber diamond = a warning about a multiplier, red regulatory = a
   subtraction), and the "fights" are read as a merge through oncoming
   rush-hour traffic rather than a crash — nobody collides here, a losing
   merge just costs you cars held back at the gap, which keeps this in
   the same spirit as the rest of the game even though nothing here is
   graded and nothing here derives a legalAt.

   Standalone on purpose: no import from ../engine, no wiring into the
   roguelike run. It is not on the home screen either — reach it at
   #/merge-rush while it is still a prototype. Whatever comes next
   (hooking it up as an inter-stage minigame) is a separate decision.
   ===================================================================== */
import React, { useState, useRef, useCallback, useEffect } from "react";
import { Play, RotateCcw, Home, Zap } from "lucide-react";
import { C, FONT_D, FONT_U, shade } from "../theme.js";

/* ---------------- layout constants ---------------- */
const LANES = 3;
const W = 400, H = 700;
const LANE_W = W / LANES;
const laneX = (i) => LANE_W * (i + 0.5);
const PLAYER_Y = 560;
const SPEED = 150;       // px/s the world scrolls toward the player
const ITEM_GAP = 460;    // px between course items
const START_CONVOY = 3;

/* mulberry32 — the same small seeded RNG the rest of this project uses. */
function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------------- gate vocabulary ----------------
   Three sign families, matching real road-sign colour coding so a gate
   reads at a glance the way the rest of this game asks everything to:
   green guide sign = a gain, amber diamond = a multiplier (worth reading
   carefully — it cuts both ways), red regulatory = a cost. */
const GATE_ADD = [2, 3, 4, 5, 6].map((n) => ({ op: "add", n, label: `+${n}`, kind: "add" }));
const GATE_MUL = [1.5, 2].map((n) => ({ op: "mul", n, label: `×${n}`, kind: "mul" }));
const GATE_SUB = [2, 3, 4].map((n) => ({ op: "sub", n, label: `−${n}`, kind: "sub" }));
GATE_SUB.push({ op: "div", n: 2, label: "÷2", kind: "sub" });

function applyGate(convoy, v) {
  if (v.op === "add") return convoy + v.n;
  if (v.op === "sub") return Math.max(0, convoy - v.n);
  if (v.op === "mul") return Math.max(0, Math.round(convoy * v.n));
  if (v.op === "div") return Math.max(0, Math.round(convoy / v.n));
  return convoy;
}

/* Always one gain, one multiplier-or-gain, one cost — real variety in
   every gate rather than three near-identical options, then shuffled so
   the "good" lane is not predictably in the same place. */
function pickGateTrio(r) {
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  const trio = [pick(GATE_ADD), r() < 0.5 ? pick(GATE_MUL) : pick(GATE_ADD), pick(GATE_SUB)];
  for (let i = trio.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [trio[i], trio[j]] = [trio[j], trio[i]];
  }
  return trio;
}

/* Wave sizes are fixed at build time rather than scaled to whatever the
   convoy happens to be when it arrives — an oncoming wave you can see
   coming and size up in advance, same as the sign families, rather than
   a number that would only be knowable the instant it resolves. Growing
   big enough through the gates beforehand is the whole point. */
const WAVE_COUNTS = [7, 14, 24];

function buildCourse(seed) {
  const r = rng(seed);
  const items = [];
  let z = ITEM_GAP;
  let waveIndex = 0;
  const pattern = [
    "gate", "gate", "wave", "gate", "powerup",
    "gate", "wave", "gate", "gate", "wave", "gate", "gate",
  ];
  for (const kind of pattern) {
    if (kind === "gate") items.push({ kind: "gate", z, values: pickGateTrio(r) });
    else if (kind === "wave") items.push({ kind: "wave", z, count: WAVE_COUNTS[waveIndex++] });
    else if (kind === "powerup") items.push({ kind: "powerup", z, lane: Math.floor(r() * LANES) });
    z += ITEM_GAP;
  }
  items.push({ kind: "finish", z });
  return items;
}

/* ---------------- small presentational bits ---------------- */
function GateSign({ v, x, y }) {
  const w = LANE_W - 26;
  if (v.kind === "mul") {
    const s = 34;
    return (
      <g transform={`translate(${x},${y})`}>
        <rect x={-s} y={-s} width={s * 2} height={s * 2} rx={6}
          transform="rotate(45)" fill={C.amber} stroke={C.ink} strokeWidth={2.5} />
        <text y={6} textAnchor="middle" fontFamily={FONT_D} fontWeight={700} fontSize={18} fill={C.ink}>
          {v.label}
        </text>
      </g>
    );
  }
  if (v.kind === "sub") {
    return (
      <g transform={`translate(${x},${y})`}>
        <polygon
          points={octagonPoints(38)}
          fill={C.red} stroke={C.white} strokeWidth={3}
        />
        <text y={6} textAnchor="middle" fontFamily={FONT_D} fontWeight={700} fontSize={17} fill={C.white}>
          {v.label}
        </text>
      </g>
    );
  }
  return (
    <g transform={`translate(${x},${y})`}>
      <rect x={-w / 2} y={-26} width={w} height={52} rx={7} fill={C.green} stroke={C.white} strokeWidth={2.5} />
      <text y={6} textAnchor="middle" fontFamily={FONT_D} fontWeight={700} fontSize={19} fill={C.white}>
        {v.label}
      </text>
    </g>
  );
}
function octagonPoints(r) {
  const pts = [];
  for (let i = 0; i < 8; i++) {
    const a = (Math.PI / 8) + (i * Math.PI) / 4;
    pts.push(`${(r * Math.cos(a)).toFixed(1)},${(r * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(" ");
}

function MiniCar({ x, y, color, scale = 1, rot = 0 }) {
  return (
    <g transform={`translate(${x},${y}) rotate(${rot}) scale(${scale})`}>
      <rect x={-9} y={-15} width={18} height={30} rx={5} fill={color} stroke={C.ink} strokeWidth={1.4} />
      <rect x={-6} y={-10} width={12} height={9} rx={2.5} fill={shade(color, 0.35)} opacity={0.85} />
    </g>
  );
}

/* Up to 9 followers drawn individually so a small convoy still reads as
   individual cars; past that it is a number, not a crowd you could count
   anyway. */
const CONVOY_SLOTS = [
  [0, 0], [-16, 22], [16, 22], [-30, 46], [30, 46],
  [0, 46], [-16, 68], [16, 68], [0, 90],
];
function ConvoyCluster({ x, y, count }) {
  const shown = Math.min(count - 1, CONVOY_SLOTS.length);
  return (
    <g>
      {Array.from({ length: Math.max(0, shown) }, (_, i) => (
        <MiniCar key={i} x={x + CONVOY_SLOTS[i][0]} y={y + 34 + CONVOY_SLOTS[i][1]} color={C.blue} scale={0.72} />
      ))}
      <MiniCar x={x} y={y} color={C.blue} scale={1} />
      {count - 1 > CONVOY_SLOTS.length && (
        <text x={x} y={y + 118} textAnchor="middle" fontFamily={FONT_D} fontWeight={700} fontSize={13} fill={C.white}>
          +{count - 1 - CONVOY_SLOTS.length} more
        </text>
      )}
    </g>
  );
}

function WaveCluster({ x0, count }) {
  const cars = Math.min(7, count);
  return (
    <g>
      {Array.from({ length: cars }, (_, i) => {
        const lane = i % LANES;
        const row = Math.floor(i / LANES);
        return <MiniCar key={i} x={laneX(lane) - x0 + (row % 2 ? 10 : -10)} y={row * 34} color={C.red} scale={0.85} rot={180} />;
      })}
      <g transform={`translate(0,${-30})`}>
        <rect x={-30} y={-16} width={60} height={32} rx={16} fill={C.red} stroke={C.white} strokeWidth={2} />
        <text y={6} textAnchor="middle" fontFamily={FONT_D} fontWeight={700} fontSize={17} fill={C.white}>{count}</text>
      </g>
    </g>
  );
}

/* ================= GAME ================= */
export default function MergeRush() {
  const [phase, setPhase] = useState("ready"); // ready | running | gameover | finished
  const [convoy, setConvoy] = useState(START_CONVOY);
  const [lane, setLane] = useState(1);
  const [shielded, setShielded] = useState(false);
  const [traveled, setTraveled] = useState(0);
  const [popups, setPopups] = useState([]);
  const [flash, setFlash] = useState(null);
  const [waveHit, setWaveHit] = useState(null); // "win" | "shield" | "loss" | null, for a brief screen flash

  const courseRef = useRef([]);
  const laneRef = useRef(1);
  const convoyRef = useRef(START_CONVOY);
  const shieldRef = useRef(false);
  const resolvedRef = useRef(new Set());
  const raf = useRef(null);
  const t0 = useRef(0);
  /* The loop reads this before re-arming itself. cancelAnimationFrame
     alone is not enough: endRun fires from inside a frame callback, so it
     cancels a frame that has already been delivered, and the callback
     goes on to schedule the next one regardless. Without this flag the
     run continues under the game-over screen — gates keep resolving, the
     convoy count keeps changing after death, and the final distance keeps
     climbing. */
  const runningRef = useRef(false);

  const stopLoop = useCallback(() => {
    runningRef.current = false;
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = null;
  }, []);
  useEffect(() => stopLoop, [stopLoop]);

  const pushPopup = useCallback((text, color) => {
    const id = Math.random().toString(36).slice(2);
    setPopups((p) => [...p.slice(-5), { id, text, color }]);
    setTimeout(() => setPopups((p) => p.filter((x) => x.id !== id)), 850);
  }, []);

  const flashHit = useCallback((kind) => {
    setWaveHit(kind);
    setTimeout(() => setWaveHit((cur) => (cur === kind ? null : cur)), 420);
  }, []);

  const endRun = useCallback((won) => {
    stopLoop();
    setPhase(won ? "finished" : "gameover");
  }, [stopLoop]);

  const resolveItem = useCallback((item) => {
    if (item.kind === "gate") {
      const v = item.values[laneRef.current];
      const after = applyGate(convoyRef.current, v);
      convoyRef.current = after;
      setConvoy(after);
      pushPopup(v.label, v.kind === "sub" ? C.red : v.kind === "mul" ? C.amber : C.green);
      if (after <= 0) endRun(false);
      return;
    }
    if (item.kind === "powerup") {
      if (laneRef.current === item.lane) {
        shieldRef.current = true; setShielded(true);
        pushPopup("SHIELD", C.yellow);
      }
      return;
    }
    if (item.kind === "wave") {
      const before = convoyRef.current;
      if (shieldRef.current) {
        shieldRef.current = false; setShielded(false);
        pushPopup("SHIELDED", C.yellow);
        flashHit("shield");
        return;
      }
      const after = before - item.count;
      convoyRef.current = Math.max(0, after);
      setConvoy(Math.max(0, after));
      /* Trading the whole convoy for the gap is not a merge, it is the
         end of the run — so "merged through" needs a survivor, not just a
         non-negative number. At exactly zero the old check congratulated
         the player and killed them in the same frame. */
      if (after > 0) {
        pushPopup(`−${item.count} merged through`, C.amber);
        flashHit("win");
      } else {
        pushPopup("held back at the gap", C.red);
        flashHit("loss");
        endRun(false);
      }
      return;
    }
    if (item.kind === "finish") {
      endRun(true);
    }
  }, [pushPopup, flashHit, endRun]);

  const start = useCallback(() => {
    const seed = Date.now() % 1000000;
    courseRef.current = buildCourse(seed);
    laneRef.current = 1; setLane(1);
    convoyRef.current = START_CONVOY; setConvoy(START_CONVOY);
    shieldRef.current = false; setShielded(false);
    resolvedRef.current = new Set();
    setPopups([]); setWaveHit(null);
    setTraveled(0);
    setPhase("running");

    t0.current = performance.now();
    runningRef.current = true;
    const loop = (now) => {
      const traveledNow = ((now - t0.current) / 1000) * SPEED;
      setTraveled(traveledNow);
      for (const item of courseRef.current) {
        if (resolvedRef.current.has(item)) continue;
        if (item.z - traveledNow <= 0) {
          resolvedRef.current.add(item);
          resolveItem(item);
          // resolveItem may have ended the run — stop resolving the rest
          // of this frame's items rather than applying gates past death.
          if (!runningRef.current) return;
        }
      }
      if (!runningRef.current) return;
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
  }, [resolveItem]);

  const moveLane = useCallback((delta) => {
    if (phase !== "running") return;
    const next = Math.max(0, Math.min(LANES - 1, laneRef.current + delta));
    laneRef.current = next;
    setLane(next);
  }, [phase]);

  useEffect(() => {
    if (phase !== "running") return;
    const onKey = (e) => {
      if (e.key === "ArrowLeft" || e.key === "a") moveLane(-1);
      if (e.key === "ArrowRight" || e.key === "d") moveLane(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, moveLane]);

  const finishZ = courseRef.current.find((i) => i.kind === "finish")?.z ?? 1;
  const progress = phase === "ready" ? 0 : Math.min(1, traveled / finishZ);

  return (
    <div style={st.app}>
      <style>{`
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
        html,body { overscroll-behavior: none; }
        .mr-btn { font-family: ${FONT_U}; border-radius: 11px; cursor: pointer;
          border: 1px solid rgba(255,255,255,0.12); background: rgba(58,62,70,0.9);
          color: ${C.white}; padding: 13px 16px; font-size: 14px; font-weight: 500;
          min-height: 48px; display: flex; align-items: center; justify-content: center; gap: 8px; }
        .mr-btn.primary { background: ${C.green}; border-color: transparent; font-weight: 600; }
        .mr-btn:focus-visible { outline: 3px solid ${C.yellow}; outline-offset: 2px; }
        .mr-lane { position: absolute; top: 0; bottom: 0; width: 50%; touch-action: none; }
        .mr-convoy { transition: transform 140ms ease; }
        @keyframes mr-pop { 0% { opacity: 0; transform: translateY(6px) scale(0.9); }
          20% { opacity: 1; transform: translateY(0) scale(1); }
          100% { opacity: 0; transform: translateY(-34px) scale(1); } }
        .mr-popup { animation: mr-pop 850ms ease forwards; }
        @keyframes mr-flash { 0% { opacity: 0.55; } 100% { opacity: 0; } }
        .mr-flash { animation: mr-flash 420ms ease forwards; }
      `}</style>

      <header style={st.head}>
        <div style={st.title}>MERGE <span style={{ color: C.yellow }}>RUSH</span></div>
        <div style={st.sub}>A convoy-run aside — not part of a graded drive.</div>
      </header>

      <div style={st.board}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "100%", display: "block" }}>
          <rect width={W} height={H} fill={C.asphalt} />
          {Array.from({ length: LANES - 1 }, (_, i) => (
            <line key={i} x1={LANE_W * (i + 1)} y1={0} x2={LANE_W * (i + 1)} y2={H}
              stroke={C.line} strokeWidth={4} strokeDasharray="26 22"
              strokeDashoffset={-(traveled % 48)} opacity={0.55} />
          ))}
          <rect x={0} y={0} width={6} height={H} fill={C.line} opacity={0.4} />
          <rect x={W - 6} y={0} width={6} height={H} fill={C.line} opacity={0.4} />

          {courseRef.current.map((item, idx) => {
            const y = PLAYER_Y - (item.z - traveled);
            if (y < -140 || y > H + 60) return null;
            if (item.kind === "gate") {
              return (
                <g key={idx}>
                  <rect x={8} y={y - 6} width={W - 16} height={10} rx={4} fill="#2A2E34" stroke={C.ink} strokeWidth={2} />
                  {item.values.map((v, i) => <GateSign key={i} v={v} x={laneX(i)} y={y} />)}
                </g>
              );
            }
            if (item.kind === "powerup") {
              return (
                <g key={idx} transform={`translate(${laneX(item.lane)},${y})`}>
                  <circle r={22} fill={C.yellow} stroke={C.ink} strokeWidth={2.5} />
                  <Zap size={22} x={-11} y={-11} color={C.ink} />
                </g>
              );
            }
            if (item.kind === "wave") {
              return <g key={idx} transform={`translate(${laneX(1)},${y})`}><WaveCluster x0={laneX(1)} count={item.count} /></g>;
            }
            if (item.kind === "finish") {
              return (
                <g key={idx}>
                  <rect x={0} y={y - 10} width={W} height={20} fill={C.white} />
                  {Array.from({ length: 10 }, (_, i) => (
                    <rect key={i} x={(i * W) / 10} y={y - 10} width={W / 20} height={20} fill={i % 2 ? C.ink : "transparent"} />
                  ))}
                  <text x={W / 2} y={y - 22} textAnchor="middle" fontFamily={FONT_D} fontWeight={700}
                    fontSize={20} letterSpacing={2} fill={C.white}>FINISH</text>
                </g>
              );
            }
            return null;
          })}

          <g className="mr-convoy" transform={`translate(${laneX(lane)},${PLAYER_Y})`}>
            <ConvoyCluster x={0} y={0} count={convoy} />
          </g>

          {popups.map((p) => (
            <text key={p.id} className="mr-popup" x={laneX(lane)} y={PLAYER_Y - 60}
              textAnchor="middle" fontFamily={FONT_D} fontWeight={700} fontSize={20} fill={p.color}>
              {p.text}
            </text>
          ))}

          {waveHit && (
            <rect className="mr-flash" width={W} height={H}
              fill={waveHit === "loss" ? C.red : waveHit === "shield" ? C.yellow : C.green} />
          )}
        </svg>

        {phase === "running" && (
          <>
            <div className="mr-lane" style={{ left: 0 }} onPointerDown={() => moveLane(-1)} />
            <div className="mr-lane" style={{ right: 0 }} onPointerDown={() => moveLane(1)} />
          </>
        )}
      </div>

      <div style={st.hud}>
        <div style={st.hudBox}>
          <div style={st.hudLabel}>CONVOY</div>
          <div style={{ ...st.hudValue, color: C.blue }}>{convoy}</div>
        </div>
        <div style={st.progressWrap}>
          <div style={st.progressTrack}><div style={{ ...st.progressFill, width: `${progress * 100}%` }} /></div>
        </div>
        {shielded && (
          <div style={{ ...st.hudBox, borderColor: "rgba(255,201,60,0.4)" }} title="Absorbs the next wave">
            <Zap size={16} color={C.yellow} />
          </div>
        )}
      </div>

      {phase === "ready" && (
        <div style={st.panel}>
          <div style={st.panelHead}>Grow the convoy, merge through the rush.</div>
          <div style={st.panelText}>
            Drift left or right to pick a lane at each sign gantry — green
            signs add cars, the amber diamond multiplies (both ways),
            red signs cost you. Every so often you hit oncoming rush-hour
            traffic: bigger convoy merges through and keeps going, smaller
            gets held back at the gap. Zero cars ends the run.
          </div>
          <button className="mr-btn primary" style={{ width: "100%" }} onClick={start}>
            <Play size={17} />Start
          </button>
        </div>
      )}

      {phase === "gameover" && (
        <div style={st.panel}>
          <div style={{ ...st.panelHead, color: C.red }}>Held back — convoy scattered</div>
          <div style={st.panelText}>Made it {Math.round((traveled / finishZ) * 100)}% of the way through.</div>
          <button className="mr-btn primary" style={{ width: "100%" }} onClick={start}>
            <RotateCcw size={16} />Run it again
          </button>
        </div>
      )}

      {phase === "finished" && (
        <div style={st.panel}>
          <div style={{ ...st.panelHead, color: C.green }}>Through — {convoy} cars made it</div>
          <div style={st.panelText}>The whole convoy cleared every gap on the way.</div>
          <button className="mr-btn primary" style={{ width: "100%" }} onClick={start}>
            <RotateCcw size={16} />Run it again
          </button>
        </div>
      )}
    </div>
  );
}

const st = {
  app: {
    minHeight: "100dvh", background: C.bg, color: C.white, fontFamily: FONT_U,
    display: "flex", flexDirection: "column", maxWidth: 480, margin: "0 auto",
    padding: "calc(10px + env(safe-area-inset-top,0px)) 12px calc(14px + env(safe-area-inset-bottom,0px))",
    gap: 10,
  },
  head: { textAlign: "center" },
  title: { fontFamily: FONT_D, fontWeight: 700, fontSize: 26, letterSpacing: 2 },
  sub: { fontSize: 12, color: "#8b9199", marginTop: 2 },
  board: {
    position: "relative", width: "100%", aspectRatio: `${W} / ${H}`,
    borderRadius: 16, overflow: "hidden", border: "1px solid rgba(255,255,255,0.1)",
    boxShadow: "0 10px 30px rgba(0,0,0,0.4)",
  },
  hud: { display: "flex", alignItems: "center", gap: 10 },
  hudBox: {
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
    padding: "6px 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(32,35,40,0.8)", minWidth: 60,
  },
  hudLabel: { fontSize: 9.5, letterSpacing: 1, color: "#8b9199", fontWeight: 700 },
  hudValue: { fontFamily: FONT_D, fontWeight: 700, fontSize: 22, lineHeight: 1.1 },
  progressWrap: { flex: 1 },
  progressTrack: { height: 8, borderRadius: 4, background: "rgba(255,255,255,0.1)", overflow: "hidden" },
  progressFill: { height: "100%", background: C.green, transition: "width 120ms linear" },
  panel: {
    background: "rgba(32,35,40,0.85)", border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 14, padding: 14, display: "flex", flexDirection: "column", gap: 10,
  },
  panelHead: { fontFamily: FONT_D, fontWeight: 700, fontSize: 18, letterSpacing: 0.5 },
  panelText: { fontSize: 13, color: "#c8cdd4", lineHeight: 1.55 },
};
