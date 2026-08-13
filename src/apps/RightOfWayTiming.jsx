import React, { useState, useEffect, useRef, useCallback } from "react";
import { Play, RotateCcw, HelpCircle, X, ChevronRight, Gauge, AlertTriangle, Eye, Home } from "lucide-react";

/* This file is now a renderer: it draws the numbers the engine produces and
   collects the player's press. All the judgment lives in ../engine. */
import { C, FONT_D, FONT_U, shade } from "../theme.js";
import { SCENARIOS } from "../engine/scenarios.js";
import {
  M, W, H, CX, CY, LANE, HALF, OFF, SET, CAR_L, CAR_W, PED_R,
  CROSS, STEP, TIE, lerp, quad, angleTo, spanOf,
  STOPS, EXITS, crossingOf, PED_SETBACK, RA_OUTER, RA_ISLAND,
  TRAITS, traitTells, poseAt, signalShowing, forwardClaim, conflicts,
  outranks, earliestClear, schedule, simulate,
} from "../engine/index.js";
import { grade, tally, emptyTally, GRACE, REACTION_FLOOR } from "../engine/score.js";
import { planRoute, startRun, recordLeg, currentLeg, summary } from "../engine/route.js";
import { routeById } from "../engine/routes.js";
import { markPassed, logDaily, useProgress, dailyResult } from "../progress.js";
import { generateScenario, dailyScenario, WEEKDAY_NAMES } from "../engine/generate.js";
import { environmentFor, scatter } from "../environments.js";

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
function Crossing({ side }) {
  const cr = crossingOf(side);
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

/* Drawn from the same radii the engine drives on, so what is painted and
   what the cars do cannot drift apart. Give-way markings sit on the entry
   half of each approach only — the exit half is not yours to yield on. */
function Roundabout({ island = C.grass }) {
  const Edge = (p) => <line {...p} stroke={C.line} strokeWidth={M(0.15)} />;
  const set = RA_OUTER + M(2);
  const give = [
    { x1: CX, y1: CY + set, x2: CX + HALF, y2: CY + set },
    { x1: CX - HALF, y1: CY - set, x2: CX, y2: CY - set },
    { x1: CX - set, y1: CY, x2: CX - set, y2: CY + HALF },
    { x1: CX + set, y1: CY - HALF, x2: CX + set, y2: CY },
  ];
  return (
    <>
      <rect x={CX - HALF} y={0} width={HALF * 2} height={H} fill={C.asphalt} />
      <rect x={0} y={CY - HALF} width={W} height={HALF * 2} fill={C.asphalt} />

      <Edge x1={CX - HALF} y1={0} x2={CX - HALF} y2={H} />
      <Edge x1={CX + HALF} y1={0} x2={CX + HALF} y2={H} />
      <Edge x1={0} y1={CY - HALF} x2={W} y2={CY - HALF} />
      <Edge x1={0} y1={CY + HALF} x2={W} y2={CY + HALF} />

      {/* The circulating carriageway, painted over the approach stubs. */}
      <circle cx={CX} cy={CY} r={RA_OUTER} fill={C.asphalt} stroke={C.line} strokeWidth={M(0.15)} />
      {/* Central island, kerbed. */}
      <circle cx={CX} cy={CY} r={RA_ISLAND} fill={island} stroke={C.line} strokeWidth={M(0.3)} />
      <circle cx={CX} cy={CY} r={RA_ISLAND - M(0.9)} fill={shade(island, 0.06)} />

      {give.map((g, i) => (
        <line key={i} {...g} stroke={C.line} strokeWidth={M(0.4)}
          strokeDasharray={`${M(0.6)} ${M(0.5)}`} />
      ))}
    </>
  );
}

/* Half the depth of a crosswalk bar. Shared with Crossing so the stop line
   and the crossing it sits behind cannot drift apart. */
const BAR_HALF = M(1.1);

/* Stop lines. One on every leg — a four-way stop has four, and so does a
   signalised crossroad. Only one was ever drawn, on the south approach.

   Placed behind the crossing, which is the order these markings go in on a
   real road: stop line, then crosswalk, then the intersection. It is NOT
   placed at STOPS: that is where the engine rests a waiting car's centre,
   and painting a line there runs it under the middle of the car and over
   the crosswalk both.

   Worth knowing that the cars currently come to rest past this line — see
   the note in CLAUDE.md. That is a geometry question in the engine, not a
   painting one, and moving it would move every window. */
const STOP_LINE_AT = HALF + PED_SETBACK + BAR_HALF + M(0.7);

function StopLines() {
  const side = (s) => (s === "N" || s === "S");
  const at = {
    N: { x: CX - OFF, y: CY - STOP_LINE_AT },
    S: { x: CX + OFF, y: CY + STOP_LINE_AT },
    W: { x: CX - STOP_LINE_AT, y: CY + OFF },
    E: { x: CX + STOP_LINE_AT, y: CY - OFF },
  };
  return ["N", "S", "E", "W"].map((k) => {
    const p = at[k];
    const across = side(k);
    return (
      <line
        key={k}
        x1={across ? p.x - OFF : p.x}
        y1={across ? p.y : p.y - OFF}
        x2={across ? p.x + OFF : p.x}
        y2={across ? p.y : p.y + OFF}
        stroke={C.line}
        strokeWidth={M(0.4)}
      />
    );
  });
}

function Road({ control, crossings = ["N"] }) {
  const Dash = (p) => <line {...p} stroke={C.yellow} strokeWidth={M(0.15)} strokeDasharray={`${M(3)} ${M(6)}`} />;
  const Edge = (p) => <line {...p} stroke={C.line} strokeWidth={M(0.15)} />;
  const bars = crossings.map((s) => <Crossing key={s} side={s} />);
  const signs = [[CX + HALF + 30, CY + HALF + 34], [CX - HALF - 30, CY - HALF - 34],
  [CX - HALF - 30, CY + HALF + 34], [CX + HALF + 30, CY - HALF - 34]];
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
      {bars}
      <StopLines />
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
function Timeline({ duration, legalAt, pressedAt, verdict }) {
  const pct = (t) => `${Math.max(0, Math.min(100, (t / duration) * 100))}%`;
  const floorEnd = Math.min(duration, legalAt + REACTION_FLOOR);
  const graceEnd = Math.min(duration, legalAt + GRACE);
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
  const [crash, setCrash] = useState(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [session, setSession] = useState(emptyTally);
  const verdict = result?.verdict ?? null;

  const raf = useRef(null);
  const t0 = useRef(0);
  const pressRef = useRef(null);

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
     the same one without anything being coordinated. */
  const [seed, setSeed] = useState(0);
  const drawn = React.useMemo(() => {
    if (source === "endless") return generateScenario((Date.now() % 100000) + seed * 7717);
    if (source === "daily") return dailyScenario();
    return null;
  }, [source, seed]);

  const scn = run && !planFailed ? currentLeg(run) : (drawn ?? SCENARIOS[idx]);
  const runOver = run?.over ?? false;

  const isDaily = source === "daily";
  const progress = useProgress();
  // What is on record for today, ignoring whatever this run did.
  const logged = isDaily ? dailyResult(progress, scn.day) : null;

  const sim = React.useMemo(() => simulate(scn), [scn]);

  const stopLoop = useCallback(() => {
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = null;
  }, []);
  useEffect(() => stopLoop, [stopLoop]);

  // The engine decides what happened and what it was worth; this only shows it.
  function finish(at, hit) {
    stopLoop();
    const r = grade({ legalAt: sim.legalAt, pressedAt: at, collided: !!hit });
    setResult(r); setCrash(hit || null); setPhase("done");
    setSession((s) => tally(s, r));
    if (run) setRun((cur) => recordLeg(cur, r));
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
    pressRef.current = null;
    t0.current = performance.now();

    const loop = (now) => {
      const el = (now - t0.current) / 1000;
      setT(el);
      const P = pressRef.current;

      if (P != null) {
        // Ego is moving — play it forward and see what actually happens.
        const egoLive = { ...sim.ego, departAt: P };
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
  function retry() { stopLoop(); setPhase("ready"); setT(0); setPressedAt(null); setResult(null); setCrash(null); setCountedThisRun(false); pressRef.current = null; }

  // On a route, recordLeg has already advanced the index — "next" just clears
  // the board for the intersection you are now approaching.
  function next() {
    stopLoop();
    if (source === "endless") setSeed((s) => s + 1);
    else if (!run) setIdx((i) => (i + 1) % SCENARIOS.length);
    retry();
  }
  function restartRoute() { stopLoop(); setRun(startRun(plan)); setSession(emptyTally); retry(); }

  const showT = phase === "ready" ? 0 : t;
  const blink = Math.floor(showT * 1.7) % 2 === 0;
  const egoPose = poseAt(
    { ...sim.ego, departAt: pressedAt != null ? pressedAt : 1e9 },
    phase === "ready" ? Math.min(sim.ego.arriveAt, 0.001) : showT
  );

  const tells = sim.actors.flatMap((a) => traitTells(a));

  /* Setting cycles with the situation, derived from its id so it is stable
     across retries and identical for everyone playing the same daily.
     The renderer is what knows where the road is, so it is what tells the
     scatterer where scenery may not go — clear of the carriageway and of
     the crosswalk overhang either side of it. */
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
        .go:active:not(:disabled) { transform:translateY(4px); box-shadow:0 2px 0 ${shade(C.green, -0.18)}; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.78} }
        .live { animation:pulse 1.5s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) { .live { animation:none; } }
      `}</style>

      <header style={st.head}>
        <div>
          <div style={st.title}>RIGHT OF <span style={{ color: C.yellow }}>WAY</span></div>
          <div style={st.sub}>
            {run && <strong style={{ color: C.yellow }}>Leg {Math.min(run.index + 1, run.plan.legs.length)} of {run.plan.legs.length} · </strong>}
            {scn.weekday != null && (
              <strong style={{ color: C.yellow }}>{WEEKDAY_NAMES[scn.weekday]} · </strong>
            )}
            {scn.title}
            {scn.difficulty && (
              <span style={{ marginLeft: 6, letterSpacing: 1 }} title={`Difficulty ${scn.difficulty} of 4`}>
                {"●".repeat(scn.difficulty)}<span style={{ opacity: 0.28 }}>{"●".repeat(4 - scn.difficulty)}</span>
              </span>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {session.played > 0 && (
            <div style={st.chip} title={`${session.clean} clean of ${session.played}, best ${session.best}`}>
              <Gauge size={13} />{session.average} avg
            </div>
          )}
          <button className="btn" style={{ padding: 11, minWidth: 44, minHeight: 44 }} onClick={() => setHelpOpen(true)}
            aria-label="How it works"><HelpCircle size={18} /></button>
        </div>
      </header>

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
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "100%", display: "block" }}>
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
              crossings={[...new Set(sim.actors.filter((a) => a.kind === "ped").map((a) => a.from ?? "N"))]}
            />
          )}

          {sim.actors.map((a) => {
            const pose = poseAt(a, showT);
            return pose.gone ? null : <Vehicle key={a.id} p={a} pose={pose} blink={blink} tNow={showT} />;
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
          <button className="btn primary" style={{ width: "100%" }} onClick={begin}>
            <Play size={17} />{isDaily && logged ? "Replay for practice" : "Start"}
          </button>
        </>
      )}

      {phase === "running" && (
        <button className="go" onClick={go} disabled={pressedAt != null}>
          {pressedAt != null ? "…" : "GO"}
        </button>
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
          <Timeline duration={scn.duration} legalAt={sim.legalAt} pressedAt={pressedAt} verdict={verdict} />
          <div style={st.readout}>
            {verdict === "collision" && <>You pulled out at {pressedAt.toFixed(1)}s and met the {crash?.who?.toLowerCase()}. Your path was not clear until {sim.legalAt.toFixed(1)}s.</>}
            {verdict === "early" && <>You moved at {pressedAt.toFixed(1)}s. No contact, but the way was not yours until {sim.legalAt.toFixed(1)}s.</>}
            {verdict === "good" && (
              result.reaction <= REACTION_FLOOR
                ? <>Away at {pressedAt.toFixed(1)}s against a window opening at {sim.legalAt.toFixed(1)}s — inside the {REACTION_FLOOR}s nobody reacts faster than. Full marks.</>
                : <>Away at {pressedAt.toFixed(1)}s, {result.reaction.toFixed(2)}s after your window opened at {sim.legalAt.toFixed(1)}s.</>
            )}
            {verdict === "late" && <>Your window opened at {sim.legalAt.toFixed(1)}s; you moved at {pressedAt.toFixed(1)}s — {result.reaction.toFixed(1)}s of hesitation.</>}
            {verdict === "missed" && <>The window opened at {sim.legalAt.toFixed(1)}s and never closed.</>}
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

const st = {
  app: {
    position: "relative", width: "100%", minHeight: "100dvh", background: C.bg, color: C.white,
    fontFamily: FONT_U, display: "flex", flexDirection: "column", gap: 10,
    padding: `calc(12px + env(safe-area-inset-top,0px)) 12px calc(12px + env(safe-area-inset-bottom,0px))`,
    maxWidth: 540, margin: "0 auto", userSelect: "none",
  },
  head: { display: "flex", justifyContent: "space-between", alignItems: "flex-start" },
  title: { fontFamily: FONT_D, fontWeight: 700, fontSize: 26, letterSpacing: 1.5, lineHeight: 1 },
  sub: { fontSize: 12.5, color: "#8b9199", marginTop: 3 },
  chip: {
    display: "flex", alignItems: "center", gap: 5, background: "rgba(255,255,255,0.07)",
    padding: "9px 11px", borderRadius: 9, fontSize: 13, fontWeight: 600, color: "#c8cdd4",
  },
  brief: { fontSize: 13.5, color: "#c8cdd4", lineHeight: 1.5 },
  board: {
    borderRadius: 14, overflow: "hidden", border: "1px solid rgba(255,255,255,0.08)",
    boxShadow: "0 10px 30px rgba(0,0,0,0.45)",
  },
  hint: { fontSize: 13, color: "#a8aeb6", lineHeight: 1.5 },
  result: { background: "rgba(32,35,40,0.94)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 14, padding: 15 },
  readout: { fontSize: 13, color: "#c8cdd4", lineHeight: 1.55, marginTop: 12 },
  bandNote: { fontSize: 12.5, color: "#8b9199", marginTop: 4, lineHeight: 1.45 },
  scoreBox: {
    flexShrink: 0, minWidth: 74, textAlign: "center", padding: "6px 8px 7px",
    borderRadius: 11, border: "1px solid", background: "rgba(0,0,0,0.22)",
  },
  scoreNum: { fontFamily: FONT_D, fontSize: 30, fontWeight: 700, lineHeight: 1 },
  scoreLabel: {
    fontSize: 10, letterSpacing: 0.8, textTransform: "uppercase",
    color: "#8b9199", marginTop: 3, fontWeight: 600,
  },
  lesson: { fontSize: 13.5, color: "#e2e6ea", lineHeight: 1.6, marginTop: 10, borderLeft: `3px solid ${C.yellow}`, paddingLeft: 11 },
  tells: { marginTop: 12, background: "rgba(240,169,60,0.10)", border: "1px solid rgba(240,169,60,0.28)", borderRadius: 10, padding: "10px 12px" },
  tellsHead: { fontFamily: FONT_D, fontSize: 13, fontWeight: 700, letterSpacing: 1, color: C.amber, marginBottom: 6, textTransform: "uppercase" },
  tellRow: { display: "flex", gap: 7, alignItems: "flex-start", fontSize: 12.5, lineHeight: 1.5, color: "#d8cdb8", marginTop: 3 },
  modalWrap: {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 40,
    display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
  },
  modal: { background: "#22252A", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 16, padding: 18, maxWidth: 420, width: "100%" },
  p: { fontSize: 13.5, lineHeight: 1.6, color: "#c8cdd4", margin: "9px 0" },
};
