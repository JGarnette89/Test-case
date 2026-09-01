import React, { useState, useEffect, useRef, useCallback } from "react";
import { Play, RotateCcw, HelpCircle, X, ChevronRight, Gauge, AlertTriangle, Eye, Home, Check, Sparkles, Zap, Shuffle } from "lucide-react";

/* This file is now a renderer: it draws the numbers the engine produces and
   collects the player's press. All the judgment lives in ../engine. */
import { C, FONT_D, FONT_U, shade } from "../theme.js";
import { SCENARIOS } from "../engine/scenarios.js";
import {
  M, W, H, CX, CY, LANE, HALF, OFF, SET, CAR_L, CAR_W, PED_R,
  STEP, TIE, spanOf,
  crossingOf, BAR_HALF, STOP_LINE_AT, RA_OUTER,
  TRAITS, traitTells, poseAt, signalShowing, forwardClaim, conflicts,
  outranks, earliestClear, schedule, simulate, safeAtFor,
} from "../engine/index.js";
import { grade, tally, emptyTally, GRACE, REACTION_FLOOR } from "../engine/score.js";
import { planRoute, startRun, recordLeg, currentLeg, summary } from "../engine/route.js";
import { routeById } from "../engine/routes.js";
import { markPassed, logDaily, useProgress, dailyResult } from "../progress.js";
import { generateScenario, dailyScenario, WEEKDAY_NAMES } from "../engine/generate.js";
import { environmentFor, scatter } from "../environments.js";
import { endlessScenario, signatureOf } from "../engine/compose.js";
import {
  startRun as startRoguelikeRun, recordSituation, applyDraft, drawForRun,
  chooseBranch, spendConsumable, CONSUMABLES,
} from "../engine/roguelike.js";
import { TRAIT_CATALOG } from "../engine/traits.js";
/* The run's own screens and the art they share — see RoguelikeScreens.jsx
   for why those four live outside this file. */
import { Roundabout } from "./roadArt.jsx";
import { st } from "./timingStyles.js";
import {
  RoguelikeRunSummary, RoguelikeWinSummary, RoundaboutBody, TraitDraftScreen,
} from "./RoguelikeScreens.jsx";
import { crossSpec, hasLeg, controlOf, specOf, boxHalf, legOf } from "../engine/road.js";
import { cameraFor } from "../frame.js";
import {
  ACTIONS, sequenceFor, deriveWindows, gradeTask, FAULT,
} from "../engine/actions.js";
import {
  PULL_STEP, whatEgoSees, sightBlockersOf, encroaches, carWaitingInBox,
  crossedStopLine, creepPose,
} from "../engine/sight.js";

/* ---------------- drawing ---------------- */

/* Ground texture. Seeded per environment so city paving and a rural field
   do not share the same speckle pattern. */
function groundTexture(seed) {
  let a = seed >>> 0;
  const r = () => { a = (a * 1103515245 + 12345) & 0x7fffffff; return a / 0x7fffffff; };
  return Array.from({ length: 130 }, () => ({
    x: r() * W, y: r() * H, rx: 6 + r() * 13, ry: 3 + r() * 5,
    rot: r() * 180, light: r() > 0.5, o: 0.05 + r() * 0.08,
  }));
}

/* Everything either side of the road. One component for all settings —
   the environment declares what it contains, this only draws it. */
function Environment({ env, seed, keepOut }) {
  const texture = React.useMemo(() => groundTexture(seed ^ 0x9e37), [seed]);
  const items = React.useMemo(() => scatter(env, seed, keepOut), [env, seed, keepOut]);
  return (
    <>
      <rect width={W} height={H} fill={env.ground} />
      {texture.map((g, i) => (
        <ellipse key={i} cx={g.x} cy={g.y} rx={g.rx} ry={g.ry}
          transform={`rotate(${g.rot} ${g.x} ${g.y})`}
          fill={g.light ? shade(env.ground, 0.08) : env.groundDark} opacity={g.o} />
      ))}
      {items.map((it, i) => {
        if (it.kind === "patch") {
          return (
            <ellipse key={i} cx={it.x} cy={it.y} rx={it.w / 2} ry={it.h / 2}
              transform={`rotate(${it.rot} ${it.x} ${it.y})`} fill={it.fill} opacity={0.55} />
          );
        }
        if (it.kind === "tree") {
          return (
            <g key={i} transform={`translate(${it.x},${it.y})`}>
              <rect x={-2} y={0} width={4} height={it.r * 0.8} fill={it.trunk} />
              <circle r={it.r} fill={it.fill} />
              <circle cx={-it.r * 0.28} cy={-it.r * 0.28} r={it.r * 0.55} fill="#fff" opacity={0.09} />
            </g>
          );
        }
        if (it.kind === "pad") {
          return (
            <rect key={i} x={it.x - it.w / 2} y={it.y - it.h / 2} width={it.w} height={it.h}
              rx={3} fill={it.fill} opacity={0.85} />
          );
        }
        // block
        const inset = Math.min(it.w, it.h) * 0.18;
        return (
          <g key={i}>
            <rect x={it.x - it.w / 2} y={it.y - it.h / 2} width={it.w} height={it.h}
              rx={2} fill={it.fill} />
            <rect x={it.x - it.w / 2 + inset} y={it.y - it.h / 2 + inset}
              width={it.w - inset * 2} height={it.h - inset * 2} rx={2} fill={it.roof} />
          </g>
        );
      })}
    </>
  );
}

/* Paint a crosswalk on whichever leg actually has one. Derived from the
   same crossingOf() the engine yields to, so what is painted and what
   holds you up can never drift apart. */
function Crossing({ side, road }) {
  const cr = crossingOf(side, road);
  const n = 12;
  const bars = [];
  for (let i = 0; i < n; i++) {
    const f = i / (n - 1);
    const x = cr.a.x + (cr.b.x - cr.a.x) * f;
    const y = cr.a.y + (cr.b.y - cr.a.y) * f;
    const w = cr.vertical ? 0 : BAR_HALF;
    const h = cr.vertical ? BAR_HALF : 0;
    bars.push(
      <line key={i} x1={x - h} y1={y - w} x2={x + h} y2={y + w}
        stroke={C.line} strokeWidth={M(0.4)} />
    );
  }
  return <>{bars}</>;
}


/* Stop lines. One on every leg — a four-way stop has four, and so does a
   signalised crossroad.

   Position comes from the engine, which is also what SET is measured
   against, so the line and the bumper that stops behind it cannot drift
   apart. Order on the road, outward: stop line, crossing, intersection. */
/* Framing (frameFor, cameraFor) now lives in ../frame.js — pure geometry,
   testable headless the way the engine is, without needing React/JSX. */

/* Broken white line between lanes running the same way. */
const LaneMark = (p) => (
  <line {...p} stroke={C.line} strokeWidth={M(0.12)} opacity={0.75}
    strokeDasharray={`${M(3)} ${M(4.5)}`} />
);

function StopLines({ spec = null }) {
  const road = spec ?? crossSpec();
  const side = (s) => (s === "N" || s === "S");
  /* Painted across the whole inbound half, at whatever distance the road
     it crosses actually requires — the wider that road, the further back
     the line, exactly as the engine already parks the cars. */
  const { vx, hy } = boxHalf(road, LANE);
  const outN = hy + LINE_BEYOND_EDGE, outE = vx + LINE_BEYOND_EDGE;
  const half = { N: vx / 2, S: vx / 2, W: hy / 2, E: hy / 2 };
  const at = {
    N: { x: CX - vx / 2, y: CY - outN },
    S: { x: CX + vx / 2, y: CY + outN },
    W: { x: CX - outE, y: CY + hy / 2 },
    E: { x: CX + outE, y: CY - hy / 2 },
  };
  /* Only on legs that exist and are actually controlled: an uncontrolled
     through road has no line painted across it. */
  return ["N", "S", "E", "W"].filter((k) => hasLeg(road, k) && controlOf(road, k) !== "none").map((k) => {
    const p = at[k];
    const across = side(k);
    const reach = half[k];
    return (
      <line
        key={k}
        x1={across ? p.x - reach : p.x}
        y1={across ? p.y : p.y - reach}
        x2={across ? p.x + reach : p.x}
        y2={across ? p.y : p.y + reach}
        stroke={C.line}
        strokeWidth={M(0.4)}
      />
    );
  });
}

/* Each leg drawn only if the spec says it exists. Where one does not, the
   junction gets a kerb across the gap instead — that closed edge is the
   whole visual difference between a T and a crossroads, and drawing the
   road anyway would show a leg the engine will not let anyone use. */
/* How far past the kerb the stop line is painted. Constant, so it holds
   whatever the road is: the line moves out with the edge, not with a
   number typed for one lane each way. */
const LINE_BEYOND_EDGE = STOP_LINE_AT - HALF;

function Road({ control, crossings = ["N"], spec = null }) {
  const road = spec ?? crossSpec(control ?? "stop");
  const has = (side) => hasLeg(road, side);
  /* THE BOX: the two roads that cross here, each as wide as the lanes it
     carries. vx is the north-south road's half-width, hy the east-west
     road's — and a north-south leg stops outside hy, not its own. */
  const { vx, hy } = boxHalf(road, LANE);
  const LEG_RECT = {
    N: { x: CX - vx, y: 0, w: vx * 2, h: CY - hy },
    S: { x: CX - vx, y: CY + hy, w: vx * 2, h: H - (CY + hy) },
    W: { x: 0, y: CY - hy, w: CX - vx, h: hy * 2 },
    E: { x: CX + vx, y: CY - hy, w: W - (CX + vx), h: hy * 2 },
  };
  // Dividers between lanes running the same way; the centreline is separate.
  const vLanes = legOf(road, has("N") ? "N" : "S").lanes;
  const hLanes = legOf(road, has("E") ? "E" : "W").lanes;
  const Dash = (p) => <line {...p} stroke={C.yellow} strokeWidth={M(0.15)} strokeDasharray={`${M(3)} ${M(6)}`} />;
  const Edge = (p) => <line {...p} stroke={C.line} strokeWidth={M(0.15)} />;
  const bars = crossings.filter(has).map((s) => <Crossing key={s} side={s} road={road} />);
  /* Signs stand level with the stop line, at the roadside, and only on a
     leg that is actually stop-controlled. */
  const SIGN_AT = {
    S: [CX + vx + M(1.4), CY + hy + LINE_BEYOND_EDGE],
    N: [CX - vx - M(1.4), CY - hy - LINE_BEYOND_EDGE],
    W: [CX - vx - LINE_BEYOND_EDGE, CY + hy + M(1.4)],
    E: [CX + vx + LINE_BEYOND_EDGE, CY - hy - M(1.4)],
  };
  const signs = ["N", "S", "E", "W"]
    .filter((s) => has(s) && controlOf(road, s) === "stop")
    .map((s) => SIGN_AT[s]);
  return (
    <>
      {/* the junction itself, then whichever legs run off it */}
      <rect x={CX - vx} y={CY - hy} width={vx * 2} height={hy * 2} fill={C.asphalt} />
      {["N", "S", "E", "W"].filter(has).map((side) => {
        const r = LEG_RECT[side];
        return <rect key={side} x={r.x} y={r.y} width={r.w} height={r.h} fill={C.asphalt} />;
      })}

      {has("N") && <><Edge x1={CX - vx} y1={0} x2={CX - vx} y2={CY - hy} />
        <Edge x1={CX + vx} y1={0} x2={CX + vx} y2={CY - hy} />
        <Dash x1={CX} y1={0} x2={CX} y2={CY - hy} /></>}
      {has("S") && <><Edge x1={CX - vx} y1={CY + hy} x2={CX - vx} y2={H} />
        <Edge x1={CX + vx} y1={CY + hy} x2={CX + vx} y2={H} />
        <Dash x1={CX} y1={CY + hy} x2={CX} y2={H} /></>}
      {has("W") && <><Edge x1={0} y1={CY - hy} x2={CX - vx} y2={CY - hy} />
        <Edge x1={0} y1={CY + hy} x2={CX - vx} y2={CY + hy} />
        <Dash x1={0} y1={CY} x2={CX - vx} y2={CY} /></>}
      {has("E") && <><Edge x1={CX + vx} y1={CY - hy} x2={W} y2={CY - hy} />
        <Edge x1={CX + vx} y1={CY + hy} x2={W} y2={CY + hy} />
        <Dash x1={CX + vx} y1={CY} x2={W} y2={CY} /></>}

      {/* Lane dividers: white and broken, between lanes going the same
          way. Only where there is more than one, so a single-lane road
          looks exactly as it always did. */}
      {Array.from({ length: Math.max(0, vLanes - 1) }, (_, i) => (i + 1) * LANE).flatMap((d) => [
        has("N") && <LaneMark key={`nl${d}`} x1={CX - d} y1={0} x2={CX - d} y2={CY - hy} />,
        has("N") && <LaneMark key={`nr${d}`} x1={CX + d} y1={0} x2={CX + d} y2={CY - hy} />,
        has("S") && <LaneMark key={`sl${d}`} x1={CX - d} y1={CY + hy} x2={CX - d} y2={H} />,
        has("S") && <LaneMark key={`sr${d}`} x1={CX + d} y1={CY + hy} x2={CX + d} y2={H} />,
      ].filter(Boolean))}
      {Array.from({ length: Math.max(0, hLanes - 1) }, (_, i) => (i + 1) * LANE).flatMap((d) => [
        has("W") && <LaneMark key={`wt${d}`} x1={0} y1={CY - d} x2={CX - vx} y2={CY - d} />,
        has("W") && <LaneMark key={`wb${d}`} x1={0} y1={CY + d} x2={CX - vx} y2={CY + d} />,
        has("E") && <LaneMark key={`et${d}`} x1={CX + vx} y1={CY - d} x2={W} y2={CY - d} />,
        has("E") && <LaneMark key={`eb${d}`} x1={CX + vx} y1={CY + d} x2={W} y2={CY + d} />,
      ].filter(Boolean))}

      {/* closed sides, where a leg does not exist */}
      {!has("N") && <Edge x1={CX - vx} y1={CY - hy} x2={CX + vx} y2={CY - hy} />}
      {!has("S") && <Edge x1={CX - vx} y1={CY + hy} x2={CX + vx} y2={CY + hy} />}
      {!has("W") && <Edge x1={CX - vx} y1={CY - hy} x2={CX - vx} y2={CY + hy} />}
      {!has("E") && <Edge x1={CX + vx} y1={CY - hy} x2={CX + vx} y2={CY + hy} />}
      {bars}
      <StopLines spec={road} />
      {control === "signal" ? (
        <g transform={`translate(${CX + HALF + 34},${CY + HALF + 36})`}>
          <rect x={-8} y={-17} width={16} height={34} rx={5} fill="#2A2E36" stroke={C.ink} strokeWidth={2} />
          <circle cy={-10} r={4} fill={shade(C.red, -0.42)} opacity={0.45} />
          <circle cy={0} r={4} fill={shade(C.yellow, -0.42)} opacity={0.45} />
          <circle cy={10} r={6.5} fill={C.green} opacity={0.32} />
          <circle cy={10} r={4} fill={C.green} />
        </g>
      ) : signs.map(([x, y], i) => (
        <g key={i} transform={`translate(${x},${y})`}>
          <polygon points="-5.7,-14 5.7,-14 14,-5.7 14,5.7 5.7,14 -5.7,14 -14,5.7 -14,-5.7"
            fill={C.red} stroke="#fff" strokeWidth={2.4} />
          <polygon points="-5.7,-14 5.7,-14 14,-5.7 14,5.7 5.7,14 -5.7,14 -14,5.7 -14,-5.7"
            fill="none" stroke={C.ink} strokeWidth={1.4} />
          <text y={4} fontSize={8.5} fontWeight="700" fill="#fff" textAnchor="middle" fontFamily={FONT_D}>STOP</text>
        </g>
      ))}
    </>
  );
}

/* Generated scenarios carry a colourKey rather than a colour, because the
   engine is not allowed to know what anything looks like. Hand-written
   scenarios still set `color` directly and win. */
const ACTOR_COLOR = { red: C.red, green: C.green, amber: C.amber, blue: C.blue, pale: "#F2E8D5" };

function Vehicle({ p, pose, isEgo, blink, tNow }) {
  if (pose.hidden) return null;
  const o = C.ink, color = p.color ?? ACTOR_COLOR[p.colorKey] ?? C.red;
  if (p.kind === "ped") {
    return (
      <g transform={`translate(${pose.x},${pose.y})`} filter="url(#sh)">
        <ellipse rx={M(0.22)} ry={M(0.34)} fill={color} stroke={o} strokeWidth={2} />
        <circle cx={M(0.05)} r={M(0.17)} fill="#2A2D33" stroke={o} strokeWidth={1.2} />
      </g>
    );
  }
  const L = CAR_L, Wd = CAR_W;
  const wheel = (wx, wy) => (
    <rect x={wx - M(0.35)} y={wy - M(0.13)} width={M(0.7)} height={M(0.26)} rx={M(0.1)}
      fill="#1D2026" stroke={o} strokeWidth={1.2} />
  );
  /* The player's own intent is shown on their car rather than written over
     the board. It is read the same way every other car's intent is read,
     which is the skill the game is about — and it stops the brief handing
     over half the situation in words.

     Not gated on signalShowing: a real indicator comes on a couple of
     seconds before the manoeuvre, but the player has to know the task
     before they decide, not after. So the ego indicates from the start. */
  const egoTurn = isEgo && p.intent !== "straight" ? p.intent : null;
  const sig = egoTurn ?? p.signal;
  // Indicators sit on the correct side: front-left is -y in the car's frame.
  const side = sig === "left" ? -1 : 1;
  const showSig = sig && blink && !pose.gone && (egoTurn ? true : signalShowing(p, tNow));
  const glow = egoTurn ? M(0.78) : M(0.55);
  return (
    <g transform={`translate(${pose.x},${pose.y})`}>
      {isEgo && <circle r={M(2.9)} fill={C.blue} opacity={0.15} />}
      {isEgo && <circle r={M(2.9)} fill="none" stroke={C.blue} strokeWidth={2.5} strokeDasharray="7 6" opacity={0.8} />}
      <g transform={`rotate(${pose.rot})`} filter="url(#sh)">
        {wheel(L / 2 - M(1), -Wd / 2)}{wheel(L / 2 - M(1), Wd / 2)}
        {wheel(-L / 2 + M(0.9), -Wd / 2)}{wheel(-L / 2 + M(0.9), Wd / 2)}
        <rect x={-L / 2} y={-Wd / 2} width={L} height={Wd} rx={M(0.5)} fill={color} stroke={o} strokeWidth={2.5} />
        <rect x={-L / 2 + M(0.3)} y={-Wd / 2 + M(0.15)} width={L - M(0.6)} height={M(0.2)} rx={M(0.1)} fill="#fff" opacity={0.28} />
        <rect x={-M(1.3)} y={-Wd / 2 + M(0.16)} width={M(2.4)} height={Wd - M(0.32)} rx={M(0.3)}
          fill={shade(color, -0.14)} stroke={o} strokeWidth={1.6} />
        <path d={`M ${M(0.5)},${-Wd / 2 + M(0.22)} L ${M(1.1)},${-Wd / 2 + M(0.46)}
                  L ${M(1.1)},${Wd / 2 - M(0.46)} L ${M(0.5)},${Wd / 2 - M(0.22)} Z`}
          fill="#CFE3F0" stroke={o} strokeWidth={1.2} />
        {pose.waiting && (
          <>
            <rect x={-L / 2 + M(0.08)} y={-Wd / 2 + M(0.18)} width={M(0.22)} height={M(0.38)} rx={2} fill={C.red} />
            <rect x={-L / 2 + M(0.08)} y={Wd / 2 - M(0.56)} width={M(0.22)} height={M(0.38)} rx={2} fill={C.red} />
          </>
        )}
        {showSig && (
          <g>
            <circle cx={L / 2 - M(0.22)} cy={side * (Wd / 2 - M(0.24))} r={glow} fill={C.signal} opacity={0.4} />
            <circle cx={L / 2 - M(0.22)} cy={side * (Wd / 2 - M(0.24))} r={M(0.24)} fill={C.signal} stroke={o} strokeWidth={1} />
            <circle cx={-L / 2 + M(0.22)} cy={side * (Wd / 2 - M(0.24))} r={M(0.24)} fill={C.signal} stroke={o} strokeWidth={1} />
          </g>
        )}
      </g>
    </g>
  );
}

/* The bar is the scoring curve drawn out: solid while the score is full,
   fading as it decays, so it is obvious that waiting costs something. */
function Timeline({ duration, legalAt, pressedAt, verdict, reactionFloor = REACTION_FLOOR, grace = GRACE }) {
  const pct = (t) => `${Math.max(0, Math.min(100, (t / duration) * 100))}%`;
  const floorEnd = Math.min(duration, legalAt + reactionFloor);
  const graceEnd = Math.min(duration, legalAt + grace);
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ position: "relative", height: 26, borderRadius: 7, overflow: "hidden", background: "#2A2E35" }}>
        <div style={{ position: "absolute", left: 0, width: pct(legalAt), height: "100%", background: "rgba(224,82,82,0.5)" }} />
        <div style={{ position: "absolute", left: pct(legalAt), width: pct(floorEnd - legalAt), height: "100%", background: C.green }} />
        <div style={{
          position: "absolute", left: pct(floorEnd), width: pct(graceEnd - floorEnd), height: "100%",
          background: "linear-gradient(90deg, rgba(59,170,81,0.85), rgba(59,170,81,0.10))",
        }} />
        <div style={{ position: "absolute", left: pct(graceEnd), right: 0, height: "100%", background: "rgba(240,169,60,0.35)" }} />
        {pressedAt != null && (
          <div style={{ position: "absolute", left: pct(pressedAt), top: -3, bottom: -3, width: 3, background: "#fff", boxShadow: "0 0 0 2px rgba(0,0,0,0.55)" }} />
        )}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: "#8b9199", marginTop: 5 }}>
        <span>yield</span>
        <span style={{ color: verdict === "good" ? C.green : "#8b9199" }}>sooner scores higher</span>
        <span>undue delay</span>
      </div>
    </div>
  );
}

/* End of a drive. The average matters more than the total, because routes
   differ in length — and finishing at all is worth saying when a collision
   would have ended it. */
function RunSummary({ run }) {
  const s = summary(run);
  const ended = s.outcome === "ended-early";
  return (
    <div style={{ ...st.tells, background: "rgba(59,123,232,0.10)", borderColor: "rgba(59,123,232,0.30)" }}>
      <div style={{ ...st.tellsHead, color: C.blue }}>
        {ended ? "Drive ended early" : s.perfect ? "Route complete — clean sheet" : "Route complete"}
      </div>
      <div style={{ fontSize: 13, color: "#c8cdd4", lineHeight: 1.55 }}>
        {ended
          ? <>You got through {s.played} of {s.total} intersections before it ended. {s.remaining} never reached.</>
          : <>{s.total} intersections, {s.clean} of them clean.</>}
        {" "}Average {s.average} out of 100, {s.points} points in total.
      </div>
    </div>
  );
}

/* ================= GAME ================= */
/* `routeId` turns this from single intersections into one continuous drive.
   `scenarioId` starts the single-intersection list on a chosen situation
   rather than the first, which is how home launches one directly. */
export default function RightOfWayTiming({ routeId = null, scenarioId = null, source = "set" }) {
  const [idx, setIdx] = useState(() => {
    const i = SCENARIOS.findIndex((s) => s.id === scenarioId);
    return i < 0 ? 0 : i;
  });
  const [phase, setPhase] = useState("ready");
  const [t, setT] = useState(0);
  const [pressedAt, setPressedAt] = useState(null);
  const [result, setResult] = useState(null);   // what the engine made of the press
  const [countedThisRun, setCountedThisRun] = useState(false);
  // Multi-action manoeuvres: what has been pressed, and how far crept.
  const [performed, setPerformed] = useState({});
  const [creeps, setCreeps] = useState(0);
  const [criticals, setCriticals] = useState([]);
  const [sheet, setSheet] = useState(null);
  const [crash, setCrash] = useState(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [session, setSession] = useState(emptyTally);
  const verdict = result?.verdict ?? null;

  const raf = useRef(null);
  const t0 = useRef(0);
  const pressRef = useRef(null);
  // Read inside the animation loop, which cannot see state updates.
  const creepRef = useRef(0);

  // Planning is where a route's continuity is resolved: each leg gets rotated
  // to the approach the previous one leaves you on.
  const plan = React.useMemo(() => {
    const route = routeId ? routeById(routeId) : null;
    return route ? planRoute(route, SCENARIOS) : null;
  }, [routeId]);
  const [run, setRun] = useState(() => (plan ? startRun(plan) : null));

  // A route that will not plan is a content bug. Say so plainly rather than
  // playing three quarters of a drive and pretending it was the whole thing.
  const planFailed = plan != null && !plan.ok;

  /* Where situations come from. "set" is the tutorial list, "endless" draws
     a fresh one each time, "daily" is seeded by the date so everyone gets
     the same one without anything being coordinated, "roguelike" draws
     through the current run's own bias (see roguelike.js). */
  /* The draw seed, advanced deliberately whenever a NEW situation is
     wanted — never read from the clock while rendering.

     useMemo is a performance hint, not a promise: React may discard a
     memo and recompute it whenever it likes. A draw seeded by
     `Date.now()` inside the memo is therefore not stable — recompute it
     one second later and it hands back a different intersection, while
     `sim`, `safeAt` and the whole graded window quietly re-derive
     against a scene the player was never shown. Seeding from state
     instead makes the memo a pure function of (source, drawSeed): React
     may recompute it as often as it wants and always gets the same
     scenario back. */
  const [drawSeed, setDrawSeed] = useState(() => Date.now() % 100000);
  const nextDraw = useCallback(() => setDrawSeed((s) => (s + 7717) % 100000), []);

  /* Shapes already handed out this run, so endless does not repeat itself.
     A ref rather than state: it must not cause a redraw, and the composer
     only reads it when a new screen is drawn. Written in an effect after
     commit, never during render — see the recorder below the draw. */
  const seenShapes = useRef([]);

  /* The roguelike run. A ref mirrors the state, updated inside the same
     setState call rather than in a later effect — drawn's memo below
     reads the ref, and it has to see a just-drafted trait immediately,
     not one render behind. */
  const endlessRunRef = useRef(null);
  const [endlessRun, setEndlessRunState] = useState(() => {
    if (source !== "roguelike") return null;
    const r = startRoguelikeRun(Date.now() % 100000);
    endlessRunRef.current = r;
    return r;
  });
  const setEndlessRun = useCallback((updater) => {
    setEndlessRunState((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      endlessRunRef.current = next;
      return next;
    });
  }, []);

  /* Pure in (source, drawSeed): same inputs, same scenario, however many
     times React chooses to run it. Reads seenShapes but never writes it —
     the write happens in the effect below, after commit. */
  const drawn = React.useMemo(() => {
    if (source === "endless") {
      return endlessScenario(drawSeed, seenShapes.current) ?? generateScenario(drawSeed);
    }
    if (source === "roguelike") {
      const r = endlessRunRef.current;
      // Nothing to draw at a roundabout screen — there is no scenario
      // being played, only a stage to choose.
      if (!r || r.stage === "roundabout") return null;
      return drawForRun(r, drawSeed, seenShapes.current) ?? generateScenario(drawSeed);
    }
    if (source === "daily") return dailyScenario();
    return null;
  }, [source, drawSeed]);

  /* Remember the SHAPE of what was drawn so the next draw can avoid
     repeating it. Only generated draws take part: a boss and a Checkride
     leg are fixed content, and recording those would make a later
     composed scene look like a repeat of something it has nothing to do
     with. An effect rather than a line in the memo above, because a memo
     that mutates on the way past is a side effect during render — it
     double-fires under StrictMode and silently changes what the next
     recompute would return. */
  useEffect(() => {
    if (!drawn?.generated) return;
    if (source !== "endless" && source !== "roguelike") return;
    const sig = signatureOf(drawn);
    if (seenShapes.current[seenShapes.current.length - 1] === sig) return;
    seenShapes.current = [...seenShapes.current.slice(-40), sig];
  }, [drawn, source]);

  const scn = run && !planFailed ? currentLeg(run) : (drawn ?? SCENARIOS[idx]);
  const runOver = run?.over ?? false;

  /* Which buttons this situation asks for. A scenario that says nothing
     gets the old single GO, so every existing situation is untouched. */
  const statics = React.useMemo(() => sightBlockersOf(scn), [scn.id]);
  /* A scene with something blocking the view gets the means to deal with
     it, whether or not it was hand-written to. Hiding traffic and then
     offering only GO asks the player to read what they cannot see and
     gives them no way to fix it. */
  const sequence = React.useMemo(
    () => sequenceFor(scn.manoeuvre ?? (statics.length ? "blindApproach" : "straight")),
    [scn.manoeuvre, scn.id, statics.length]
  );
  const multi = sequence.length > 1;

  const isDaily = source === "daily";
  const progress = useProgress();
  // What is on record for today, ignoring whatever this run did.
  const logged = isDaily ? dailyResult(progress, scn.day) : null;

  const sim = React.useMemo(() => simulate(scn), [scn]);
  // Computed once per scenario load, not folded into simulate() itself —
  // see safeAtFor's own comment for why that split matters.
  const safeAt = React.useMemo(() => safeAtFor(sim), [sim]);

  const stopLoop = useCallback(() => {
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = null;
  }, []);
  useEffect(() => stopLoop, [stopLoop]);

  /* Windows for every action the manoeuvre asks for. The GO window is the
     engine's; the rest are worked backwards from it. */
  const windows = React.useMemo(
    () => deriveWindows(sequence, {
      manoeuvreAt: scn.manoeuvreAt ?? safeAt,
      legalAt: safeAt,
    }),
    [sequence, sim, scn.manoeuvreAt]
  );

  /* Graded against safeAt, not legalAt: physically safe against everyone,
     not only legally clear against whoever outranks you. Identical to
     legalAt for every scenario that does not deliberately author a
     driver who fails to yield — see index.js. */
  function finish(at, hit) {
    stopLoop();
    /* A drafted trait can widen the scoring curve for this run, never
       narrow it — see traits.js. Nothing else about grade() changes:
       EARLY_TOLERANCE stays fixed, and legalAt/safeAt are the engine's
       own, untouched. */
    const r = grade({
      legalAt: safeAt, pressedAt: at, collided: !!hit,
      ...(endlessRun ? { reactionFloor: endlessRun.mods.reactionFloor, grace: endlessRun.mods.grace } : {}),
    });

    /* On a multi-action manoeuvre the press score is only the GO part of
       it, so the sheet is what the player is actually shown. */
    let sheetResult = null;
    if (multi) {
      const pressed = Object.entries({ ...performed, ...(at != null ? { go: at } : {}) })
        .map(([action, time]) => ({ action, at: time }));
      const hard = [...criticals, ...(hit ? [FAULT.COLLISION] : [])];
      sheetResult = gradeTask({ sequence, windows, performed: pressed, faults: hard });
      setSheet(sheetResult);
    }

    setResult(r); setCrash(hit || null); setPhase("done");
    setSession((s) => tally(s, r));
    if (run) setRun((cur) => recordLeg(cur, r));
    if (endlessRun) setEndlessRun((cur) => recordSituation(cur, r, sheetResult, scn));
    // Credit the situation, not the rotation the route happened to use.
    // Generated draws are not tutorial situations, so they unlock nothing.
    if (r.verdict === "good" && !scn.generated) markPassed(scn.rotatedFrom ?? scn.id, r.score);

    /* The daily logs once, and it is the first attempt that counts. Replays
       are allowed and deliberately worth nothing — otherwise the score is
       just a measure of how many times you were willing to try. */
    if (isDaily) {
      logDaily(scn.day, { score: r.score, verdict: r.verdict, reaction: r.reaction })
        .then(({ counted }) => setCountedThisRun(counted));
    }
  }

  function begin() {
    setPhase("running"); setT(0); setPressedAt(null); setResult(null); setCrash(null);
    setPerformed({}); setCreeps(0); setCriticals([]); setSheet(null);
    pressRef.current = null;
    creepRef.current = 0;
    t0.current = performance.now();

    const loop = (now) => {
      const el = (now - t0.current) / 1000;
      setT(el);
      const P = pressRef.current;

      if (P != null) {
        /* Creeping is expressed as stopBias — the engine already knows how
           to rest a car further forward, so the departure runs from wherever
           the player edged to rather than from the line. */
        const egoLive = { ...sim.ego, departAt: P, stopBias: (sim.ego.stopBias || 0) + creepRef.current * PULL_STEP };
        const mine = poseAt(egoLive, el);
        for (const a of sim.actors) {
          const theirs = poseAt(a, el);
          if (theirs.gone || theirs.hidden) continue;
          if (conflicts(egoLive, mine, a, theirs, 0, 0, 0, "crash")) {
            finish(P, { x: (mine.x + theirs.x) / 2, y: (mine.y + theirs.y) / 2, who: a.name });
            return;
          }
        }
        // spanOf, not CROSS: a roundabout lap is several times longer than
        // any crossing, and cutting the run short would stop watching for
        // collisions while the ego is still going round.
        if (mine.gone || el > P + spanOf(sim.ego) + 0.35) {
          finish(P);
          return;
        }
      } else if (el >= scn.duration) {
        finish(null);
        return;
      }
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
  }

  function go() {
    if (phase !== "running" || pressRef.current != null) return;
    pressRef.current = t;
    setPressedAt(t);
  }

  /* One press of an action button. Each is pressed once, except pulling up,
     which is the whole point of pulling up. */
  function press(action) {
    if (phase !== "running") return;
    if (action === "go") { setPerformed((p) => ({ ...p, go: t })); go(); return; }

    if (action === "pullUp") {
      if (pressRef.current != null) return;      // already moving off
      const next = creepRef.current + 1;
      creepRef.current = next;
      setCreeps(next);
      // Edging forward is judged by what it exposes you to, not by a clock.
      const enc = encroaches(sim, t, next);
      if (enc.encroached) setCriticals((c) => c.some((f) => f.id === "encroach") ? c : [...c, { ...FAULT.ENCROACHED, who: enc.who }]);
      const pose = creepPose(sim.ego, t, next);
      if (crossedStopLine(pose)) {
        const box = carWaitingInBox(sim, t);
        if (box.blocked) setCriticals((c) => c.some((f) => f.id === "blockedBox") ? c : [...c, { ...FAULT.BLOCKED_BOX, who: box.who }]);
      }
      return;
    }

    setPerformed((p) => (p[action] != null ? p : { ...p, [action]: t }));
  }

  function retry() {
    stopLoop(); setPhase("ready"); setT(0); setPressedAt(null); setResult(null); setCrash(null);
    setCountedThisRun(false); setPerformed({}); setCreeps(0); setCriticals([]); setSheet(null);
    pressRef.current = null; creepRef.current = 0;
  }

  // On a route, recordLeg has already advanced the index — "next" just clears
  // the board for the intersection you are now approaching.
  function next() {
    stopLoop();
    if (source === "endless" || source === "roguelike") nextDraw();
    else if (!run) setIdx((i) => (i + 1) % SCENARIOS.length);
    retry();
  }
  function restartRoute() { stopLoop(); setRun(startRun(plan)); setSession(emptyTally); retry(); }

  // Drafting a trait folds it into the run, then moves on exactly like
  // pressing "Next situation" — the draft screen replaces that button
  // while one is pending, it does not add a step in front of it.
  function pickTrait(traitId) {
    setEndlessRun((cur) => applyDraft(cur, traitId));
    next();
  }
  function startNewRun() {
    setEndlessRun(startRoguelikeRun(Date.now() % 100000));
    seenShapes.current = [];
    nextDraw();
    setSession(emptyTally);
    retry();
  }

  // Picking an exit at a roundabout screen moves the run into that stage
  // and draws its first situation — same "advance, then redraw" shape as
  // pickTrait, just with a stage id instead of a trait id.
  function pickBranch(stageId) {
    setEndlessRun((cur) => chooseBranch(cur, stageId));
    next();
  }

  /* Insight spends. Each is a no-op inside spendConsumable itself when
     unaffordable or inapplicable, so these only have to decide when to
     disable a button, never guard correctness. Rerolling is the one that
     also has to redraw: it bumps the seed the same way "Next situation"
     does, and retry() keeps that safe even though nothing has actually
     been pressed yet. */
  function buyReroll() {
    if (!endlessRun) return;
    setEndlessRun((cur) => spendConsumable(cur, "peek-reroll"));
    nextDraw();
    retry();
  }
  function buyRevealBurst() {
    if (!endlessRun) return;
    setEndlessRun((cur) => spendConsumable(cur, "reveal-burst"));
  }
  function buyEarlyDraft() {
    if (!endlessRun) return;
    setEndlessRun((cur) => spendConsumable(cur, "early-draft"));
  }
  function buyRerollBranch() {
    if (!endlessRun) return;
    setEndlessRun((cur) => spendConsumable(cur, "reroll-branch"));
  }

  const showT = phase === "ready" ? 0 : t;
  const blink = Math.floor(showT * 1.7) % 2 === 0;
  const liveEgo = { ...sim.ego, stopBias: (sim.ego.stopBias || 0) + creeps * PULL_STEP };
  const egoPose = poseAt(
    { ...liveEgo, departAt: pressedAt != null ? pressedAt : 1e9 },
    phase === "ready" ? Math.min(sim.ego.arriveAt, 0.001) : showT
  );

  /* What the driver can actually see from where they are sitting. Only
     while playing: once it is over, everything is revealed, because the
     lesson is what was there — and being shown the car you never saw is
     the whole point of having hidden it. */
  const sees = React.useMemo(() => {
    // Occlusion applies wherever there is something to occlude, not only
    // in hand-written multi-action situations.
    if (phase !== "running" || !statics.length) return null;
    return whatEgoSees({ ...sim, ego: liveEgo }, showT, 0, statics);
  }, [phase, sim, showT, creeps, statics]);

  const tells = sim.actors.flatMap((a) => traitTells(a));

  /* Setting cycles with the situation, derived from its id so it is stable
     across retries and identical for everyone playing the same daily.
     The renderer is what knows where the road is, so it is what tells the
     scatterer where scenery may not go — clear of the carriageway and of
     the crosswalk overhang either side of it. */
  // Pull back far enough that the widest road on this junction fits, then
  // ease out further still for anything the scenario asks the camera to
  // track (see ../frame.js) — recomputed every frame, since that reach
  // changes with the clock for a tracked scenario and must not for any
  // other.
  const frame = React.useMemo(
    () => cameraFor(specOf(scn), sim, showT, scn.camera),
    [scn.id, scn.road, scn.camera, sim, showT]
  );
  const env = React.useMemo(() => environmentFor(scn.id), [scn.id]);
  const envSeed = React.useMemo(
    () => [...String(scn.id)].reduce((h, c) => (Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0), 2166136261),
    [scn.id]
  );
  const keepOut = React.useMemo(() => {
    const zones = [
      { kind: "band", axis: "x", at: CX, half: HALF, pad: 56 },
      { kind: "band", axis: "y", at: CY, half: HALF, pad: 56 },
    ];
    if (scn.layout === "roundabout") {
      zones.push({ kind: "circle", x: CX, y: CY, r: RA_OUTER, pad: 26 });
    }
    return zones;
  }, [scn.layout]);

  const vText = {
    collision: "Collision",
    early: "Too early — failure to yield",
    good: "Clean. That was your window.",
    late: "Too slow — undue delay",
    missed: "You never went",
  };
  const vColor = { collision: C.red, early: C.red, good: C.green, late: C.amber, missed: C.amber };

  // No scenario is being played at a roundabout screen — scn is just an
  // inert placeholder underneath it (see the drawn useMemo above), so the
  // whole board/phase view is swapped out for the branch choice instead.
  const atRoundabout = source === "roguelike" && endlessRun?.stage === "roundabout";
  const playingBoss = source === "roguelike" && Boolean(endlessRun?.pendingBoss) && !atRoundabout;
  const onCheckride = source === "roguelike" && endlessRun?.stage === "checkride";

  return (
    <div style={st.app}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@600;700&family=Inter:wght@400;500;600&display=swap');
        * { box-sizing:border-box; -webkit-tap-highlight-color:transparent; }
        html,body { overscroll-behavior:none; }
        .btn { font-family:${FONT_U}; border-radius:11px; cursor:pointer; border:1px solid rgba(255,255,255,0.12);
          background:rgba(58,62,70,0.9); color:${C.white}; padding:13px 16px; font-size:14px; font-weight:500;
          min-height:48px; display:flex; align-items:center; justify-content:center; gap:8px; }
        .btn:disabled { opacity:0.4; cursor:default; }
        .btn.primary { background:${C.green}; border-color:transparent; font-weight:600; }
        .btn:focus-visible { outline:3px solid ${C.yellow}; outline-offset:2px; }
        .go { width:100%; min-height:76px; font-family:${FONT_D}; font-size:31px; font-weight:700; letter-spacing:3px;
          background:${C.green}; border:none; border-radius:14px; color:#fff; cursor:pointer;
          box-shadow:0 6px 0 ${shade(C.green, -0.18)}; }
        .go:disabled { background:#3D424A; box-shadow:0 6px 0 #2A2E34; color:#8b9199; }
        .go.actionGo { flex:1.4; min-height:64px; font-size:24px; letter-spacing:2px; }
        .btn.action { min-height:64px; font-family:${FONT_D}; font-size:16px; font-weight:700;
          letter-spacing:1.5px; background:rgba(58,62,70,0.95); }
        .btn.action:disabled { opacity:0.45; }
        .go:active:not(:disabled) { transform:translateY(4px); box-shadow:0 2px 0 ${shade(C.green, -0.18)}; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.78} }
        .live { animation:pulse 1.5s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) { .live { animation:none; } }
      `}</style>

      <header style={st.head}>
        <div>
          <div style={st.title}>RIGHT OF <span style={{ color: C.yellow }}>WAY</span></div>
          <div style={st.sub}>
            {atRoundabout ? "Choose your next stage" : (
              <>
                {run && <strong style={{ color: C.yellow }}>Leg {Math.min(run.index + 1, run.plan.legs.length)} of {run.plan.legs.length} · </strong>}
                {onCheckride && (
                  <strong style={{ color: C.red }}>
                    Checkride — leg {endlessRun.checkrideRun.index + 1} of {endlessRun.checkrideRun.plan.legs.length} ·{" "}
                  </strong>
                )}
                {playingBoss && <strong style={{ color: C.red }}>BOSS · </strong>}
                {scn.weekday != null && (
                  <strong style={{ color: C.yellow }}>{WEEKDAY_NAMES[scn.weekday]} · </strong>
                )}
                {scn.title}
                {scn.difficulty && (
                  <span style={{ marginLeft: 6, letterSpacing: 1 }} title={`Difficulty ${scn.difficulty} of 4`}>
                    {"●".repeat(scn.difficulty)}<span style={{ opacity: 0.28 }}>{"●".repeat(4 - scn.difficulty)}</span>
                  </span>
                )}
              </>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {endlessRun && (
            <div
              style={st.chip}
              title={endlessRun.traits.length
                ? `Drafted: ${endlessRun.traits.map((id) => TRAIT_CATALOG.find((t) => t.id === id)?.name).join(", ")}`
                : "No traits drafted yet"}
            >
              <Sparkles size={13} />{endlessRun.situationsCleared} cleared · {endlessRun.traits.length} traits
            </div>
          )}
          {endlessRun && (
            <div style={st.chip} title="Spend Insight on a reroll, a reveal, an early draft, or a roundabout reshuffle">
              <Zap size={13} />{endlessRun.insight} insight
            </div>
          )}
          {session.played > 0 && (
            <div style={st.chip} title={`${session.clean} clean of ${session.played}, best ${session.best}`}>
              <Gauge size={13} />{session.average} avg
            </div>
          )}
          <button className="btn" style={{ padding: 11, minWidth: 44, minHeight: 44 }} onClick={() => setHelpOpen(true)}
            aria-label="How it works"><HelpCircle size={18} /></button>
        </div>
      </header>

      {atRoundabout ? (
        <RoundaboutBody run={endlessRun} onPick={pickBranch} onRerollBranch={buyRerollBranch} />
      ) : (
      <>
      {planFailed && (
        <div style={{ ...st.tells, background: "rgba(224,82,82,0.12)", borderColor: "rgba(224,82,82,0.35)" }}>
          <div style={{ ...st.tellsHead, color: C.red }}>This route will not plan</div>
          {plan.problems.map((p, i) => (
            <div key={i} style={{ fontSize: 12.5, color: "#c8cdd4", lineHeight: 1.5 }}>
              Leg {p.leg + 1} ({p.id}): {p.detail}
            </div>
          ))}
        </div>
      )}

      <div style={st.brief}>{scn.brief}</div>

      <div style={st.board}>
        <svg viewBox={frame.box} style={{ width: "100%", height: "100%", display: "block" }}>
          <defs>
            <filter id="sh" x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#0B0D10" floodOpacity="0.45" />
            </filter>
          </defs>
          <Environment env={env} seed={envSeed} keepOut={keepOut} />
          {scn.layout === "roundabout" ? (
            <Roundabout island={env.groundDark} />
          ) : (
            <Road
              control={scn.control}
              spec={specOf(scn)}
              crossings={[...new Set(sim.actors.filter((a) => a.kind === "ped").map((a) => a.from ?? "N"))]}
            />
          )}

          {statics.map((b) => (
            <g key={b.p.id} transform={`translate(${b.pose.x},${b.pose.y}) rotate(${b.pose.rot})`}>
              <rect x={-b.hl} y={-b.hw} width={b.hl * 2} height={b.hw * 2} rx={M(0.3)}
                fill="#6E6A63" stroke={C.ink} strokeWidth={2} />
              <rect x={-b.hl + M(0.3)} y={-b.hw + M(0.2)} width={b.hl * 2 - M(0.6)} height={M(0.3)}
                rx={M(0.1)} fill="#fff" opacity={0.16} />
            </g>
          ))}

          {sim.actors.map((a) => {
            const pose = poseAt(a, showT);
            if (pose.gone) return null;
            /* You cannot read what you cannot see — unless a drafted
               trait says otherwise. Render-only: sight.js's own idea of
               what is visible never changes, only how a "hidden" or
               "partial" read is drawn for this run. */
            const v = sees?.[a.id];
            if (v === "hidden") {
              const opacity = endlessRun?.mods.revealHiddenOpacity ?? 0;
              if (opacity <= 0) return null;
              return (
                <g key={a.id} opacity={opacity}>
                  <Vehicle p={a} pose={pose} blink={blink} tNow={showT} />
                </g>
              );
            }
            return (
              <g key={a.id} opacity={v === "partial" ? (endlessRun?.mods.partialOpacity ?? 0.45) : 1}>
                <Vehicle p={a} pose={pose} blink={blink} tNow={showT} />
              </g>
            );
          })}
          {!egoPose.gone && <Vehicle p={sim.ego} pose={egoPose} isEgo blink={blink} tNow={showT} />}

          {crash && (
            <g>
              <circle cx={crash.x} cy={crash.y} r={M(2.6)} fill={C.red} opacity={0.3} />
              <circle cx={crash.x} cy={crash.y} r={M(1.5)} fill={C.red} opacity={0.55} />
              {[0, 45, 90, 135, 180, 225, 270, 315].map((d) => (
                <line key={d} x1={crash.x} y1={crash.y}
                  x2={crash.x + Math.cos((d * Math.PI) / 180) * M(3.4)}
                  y2={crash.y + Math.sin((d * Math.PI) / 180) * M(3.4)}
                  stroke={C.red} strokeWidth={4} strokeLinecap="round" opacity={0.75} />
              ))}
            </g>
          )}
          {phase === "running" && <circle className="live" cx={W - 44} cy={44} r={9} fill={C.red} />}
        </svg>
      </div>

      {phase === "ready" && (
        <>
          <div style={st.hint}>
            You are the outlined car
            {sim.ego.intent !== "straight" && (
              <>, and <strong style={{ color: C.signal }}>your indicator</strong> shows where you are going</>
            )}
            . Press <strong style={{ color: C.green }}>GO</strong> as soon as your path is clear — you are
            waiting for the cars that cross you, not for the intersection to empty.
          </div>
          {isDaily && logged && (
            <div style={{ ...st.tells, background: "rgba(255,201,60,0.10)", borderColor: "rgba(255,201,60,0.30)" }}>
              <div style={{ ...st.tellsHead, color: C.yellow }}>Today is already on record</div>
              <div style={{ fontSize: 13, color: "#c8cdd4", lineHeight: 1.55 }}>
                You scored <strong style={{ color: C.white }}>{logged.score}</strong> on your first run.
                Playing again is practice — it will not change that.
              </div>
            </div>
          )}
          {endlessRun && !endlessRun.over && (
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              {!playingBoss && !onCheckride && (
                <button
                  className="btn" style={{ flex: 1, fontSize: 12.5 }}
                  disabled={endlessRun.insight < CONSUMABLES.find((c) => c.id === "peek-reroll").cost}
                  onClick={buyReroll} title="Discard this situation and draw another"
                >
                  <Shuffle size={14} />Reroll ({CONSUMABLES.find((c) => c.id === "peek-reroll").cost})
                </button>
              )}
              <button
                className="btn" style={{ flex: 1, fontSize: 12.5 }}
                disabled={endlessRun.insight < CONSUMABLES.find((c) => c.id === "reveal-burst").cost}
                onClick={buyRevealBurst} title="Show everything, just for this situation"
              >
                <Zap size={14} />Reveal ({CONSUMABLES.find((c) => c.id === "reveal-burst").cost})
              </button>
              {!endlessRun.pendingDraft && (
                <button
                  className="btn" style={{ flex: 1, fontSize: 12.5 }}
                  disabled={endlessRun.insight < CONSUMABLES.find((c) => c.id === "early-draft").cost}
                  onClick={buyEarlyDraft} title="Call your next trait choice now, milestone or not"
                >
                  <Sparkles size={14} />Draft ({CONSUMABLES.find((c) => c.id === "early-draft").cost})
                </button>
              )}
            </div>
          )}
          <button className="btn primary" style={{ width: "100%" }} onClick={begin}>
            <Play size={17} />{isDaily && logged ? "Replay for practice" : "Start"}
          </button>
        </>
      )}

      {phase === "running" && !multi && (
        <button className="go" onClick={go} disabled={pressedAt != null}>
          {pressedAt != null ? "…" : "GO"}
        </button>
      )}

      {phase === "running" && multi && (
        <div style={st.actionRow}>
          {sequence.map((id) => {
            const def = ACTIONS[id];
            const isGo = id === "go";
            const isCreep = id === "pullUp";
            const used = isCreep ? false : performed[id] != null || (isGo && pressedAt != null);
            const dead = used || (isCreep && pressedAt != null);
            return (
              <button
                key={id}
                className={isGo ? "go actionGo" : "btn action"}
                onClick={() => press(id)}
                disabled={dead}
                style={isGo ? undefined : { flex: 1 }}
              >
                {def.label}
                {isCreep && creeps > 0 && <span style={st.creepCount}>×{creeps}</span>}
                {used && !isGo && <Check size={14} style={{ marginLeft: 6 }} />}
              </button>
            );
          })}
        </div>
      )}

      {phase === "done" && (
        <div style={st.result}>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            {verdict === "collision" && <AlertTriangle size={22} color={C.red} style={{ flexShrink: 0, marginTop: 2 }} />}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: FONT_D, fontSize: 23, fontWeight: 700, color: vColor[verdict], lineHeight: 1.15 }}>
                {vText[verdict]}
              </div>
              {result?.band && <div style={st.bandNote}>{result.band.note}</div>}
            </div>
            <div style={{ ...st.scoreBox, borderColor: vColor[verdict] }}>
              <div style={{ ...st.scoreNum, color: vColor[verdict] }}>{result?.score ?? 0}</div>
              <div style={st.scoreLabel}>{result?.band?.label ?? "no score"}</div>
            </div>
          </div>
          {sheet && (
            <div style={{ ...st.tells, background: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.12)" }}>
              <div style={{ ...st.tellsHead, color: sheet.criticalCount ? C.red : C.white }}>
                {sheet.criticalCount ? "Failed — " + sheet.faults.find((f) => f.tier === "critical").text
                  : sheet.outcome === "passed" ? `Passed — ${sheet.marks} marks` : `Below standard — ${sheet.marks} marks`}
              </div>
              {sheet.steps.map((s) => (
                <div key={s.action} style={st.markRow}>
                  <span style={{ color: s.fault ? C.amber : C.green, minWidth: 74, fontWeight: 600 }}>
                    {ACTIONS[s.action]?.label}
                  </span>
                  <span style={{ color: "#8b9199", fontSize: 12.5 }}>
                    {s.fault ? s.fault.text : "as it should be"}
                  </span>
                  <span style={{ ...st.markScore, color: s.fault ? C.amber : C.green }}>{s.score}</span>
                </div>
              ))}
              {sheet.faults.filter((f) => f.tier === "critical").map((f, i) => (
                <div key={i} style={{ ...st.markRow, color: C.red }}>
                  <AlertTriangle size={15} style={{ flexShrink: 0 }} />
                  <span style={{ fontSize: 12.5 }}>{f.text}{f.who ? ` — ${f.who}` : ""}</span>
                </div>
              ))}
            </div>
          )}

          <Timeline
            duration={scn.duration} legalAt={safeAt} pressedAt={pressedAt} verdict={verdict}
            reactionFloor={endlessRun?.mods.reactionFloor} grace={endlessRun?.mods.grace}
          />
          <div style={st.readout}>
            {verdict === "collision" && <>You pulled out at {pressedAt.toFixed(1)}s and met the {crash?.who?.toLowerCase()}. Your path was not clear until {safeAt.toFixed(1)}s.</>}
            {verdict === "early" && <>You moved at {pressedAt.toFixed(1)}s. No contact, but the way was not yours until {safeAt.toFixed(1)}s.</>}
            {verdict === "good" && (
              result.reaction <= REACTION_FLOOR
                ? <>Away at {pressedAt.toFixed(1)}s against a window opening at {safeAt.toFixed(1)}s — inside the {REACTION_FLOOR}s nobody reacts faster than. Full marks.</>
                : <>Away at {pressedAt.toFixed(1)}s, {result.reaction.toFixed(2)}s after your window opened at {safeAt.toFixed(1)}s.</>
            )}
            {verdict === "late" && <>Your window opened at {safeAt.toFixed(1)}s; you moved at {pressedAt.toFixed(1)}s — {result.reaction.toFixed(1)}s of hesitation.</>}
            {verdict === "missed" && <>The window opened at {safeAt.toFixed(1)}s and never closed.</>}
            {/* Only ever shows where a scenario deliberately authors a driver
                who does not yield despite having no right of way, or
                where a second road user is still arriving inside the
                grace the scorer offers. Both are worth explaining; a
                one-STEP rounding difference is not, and below 0.15s the
                two numbers print identically at one decimal place, which
                would read as the same instant twice. */}
            {safeAt >= sim.legalAt + 0.15 && (
              <div style={{ marginTop: 6, opacity: 0.85 }}>
                The road was legally yours at {sim.legalAt.toFixed(1)}s — it just was not safe to take yet.
              </div>
            )}
          </div>
          {tells.length > 0 && (
            <div style={st.tells}>
              <div style={st.tellsHead}>What that driver was telling you</div>
              {tells.map((x, i) => (
                <div key={i} style={st.tellRow}><Eye size={13} style={{ flexShrink: 0, marginTop: 2 }} />{x}</div>
              ))}
            </div>
          )}
          <div style={st.lesson}>{scn.lesson}</div>
          {run && runOver && <RunSummary run={run} />}
          {endlessRun?.over && endlessRun.outcome === "won" && <RoguelikeWinSummary run={endlessRun} />}
          {endlessRun?.over && endlessRun.outcome === "ended" && <RoguelikeRunSummary run={endlessRun} />}
          {endlessRun && !endlessRun.over && endlessRun.pendingDraft && (
            <TraitDraftScreen options={endlessRun.pendingDraft} onPick={pickTrait} />
          )}

          {isDaily && (
            <div style={{ ...st.tells, background: "rgba(255,201,60,0.10)", borderColor: "rgba(255,201,60,0.30)" }}>
              <div style={{ ...st.tellsHead, color: C.yellow }}>
                {countedThisRun ? "Logged for today" : "Practice run — not counted"}
              </div>
              <div style={{ fontSize: 13, color: "#c8cdd4", lineHeight: 1.55 }}>
                {countedThisRun
                  ? <>That is today's score on record. There is one intersection a day and the first
                     run is the one that counts, so it stays as it is until tomorrow.</>
                  : <>Today is already on record at <strong style={{ color: C.white }}>{logged?.score ?? 0}</strong>.
                     Replay it as often as you like — it will not change that.</>}
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            {run && runOver ? (
              <button className="btn primary" style={{ flex: 1 }} onClick={restartRoute}>
                <RotateCcw size={16} />Drive it again
              </button>
            ) : endlessRun?.over ? (
              <button className="btn primary" style={{ flex: 1 }} onClick={startNewRun}>
                <RotateCcw size={16} />New run
              </button>
            ) : endlessRun?.pendingDraft ? (
              <div style={{ fontSize: 12.5, color: "#8b9199", textAlign: "center", flex: 1, padding: "10px 0" }}>
                Choose a trait above to continue.
              </div>
            ) : isDaily ? (
              <>
                <button className="btn" onClick={retry}><RotateCcw size={16} />Replay</button>
                <button className="btn primary" style={{ flex: 1 }} onClick={() => { window.location.hash = "#/"; }}>
                  <Home size={16} />Back to menu
                </button>
              </>
            ) : (
              <>
                <button className="btn" onClick={retry}><RotateCcw size={16} />Again</button>
                <button className="btn primary" style={{ flex: 1 }} onClick={next}>
                  {run ? "Next intersection" : "Next situation"}<ChevronRight size={16} />
                </button>
              </>
            )}
          </div>
        </div>
      )}
      </>
      )}

      {helpOpen && (
        <div style={st.modalWrap} onClick={() => setHelpOpen(false)}>
          <div style={st.modal} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong style={{ fontFamily: FONT_D, fontSize: 21, letterSpacing: 1 }}>HOW IT WORKS</strong>
              <button className="btn" style={{ padding: 9, minHeight: 38 }} onClick={() => setHelpOpen(false)}><X size={16} /></button>
            </div>
            <p style={st.p}>You are the outlined car. Press GO when your path is clear.</p>
            <p style={st.p}><strong style={{ color: C.signal }}>Your own indicator tells you where you are going.</strong> No indicator means straight through. You read your task off the car exactly the way you read everyone else's.</p>
            <p style={st.p}><strong style={{ color: C.yellow }}>Clear means your path, not the whole intersection.</strong> A car crossing in front of you blocks you. A car passing on its own side, going the other way, does not.</p>
            <p style={st.p}>That makes their intent the thing to read. Indicators tell you where a car is going — when the driver uses them, and when they mean it. Confirm against the wheels before you commit.</p>
            <p style={st.p}>Some drivers give themselves away — drifting inside the lane, rolling through the stop, sitting there when it is plainly their turn. Those are the ones to leave room for.</p>
            <p style={st.p}><strong style={{ color: C.red }}>Too early</strong> risks a collision. <strong style={{ color: C.amber }}>Too late</strong> is undue delay, which is marked too, and is the more common fault.</p>
            <p style={{ ...st.p, color: "#7d838c", fontSize: 12 }}>
              Windows are computed by simulating footprints through the intersection, not authored by hand.
              Rules follow Ontario, Canada. Always defer to local law and posted signs.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
