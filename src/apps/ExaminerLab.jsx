/* =====================================================================
   EXAMINER LAB

   A bench, not a game. Everything built for the examiner flip so far is
   headless and verified but has never been looked at: the chase camera,
   the gaze cone, derived faults and their visibility, and what stacking
   directions does to the candidate. This screen puts all four on one
   canvas with the knobs exposed, so they can be judged by eye instead of
   by a passing check.

   It deliberately does not score anything. When there is a real examiner
   renderer this file is scaffolding and should go.
   ===================================================================== */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Play, Pause, RotateCcw, Eye, TriangleAlert } from "lucide-react";
import { C, FONT_D, FONT_U } from "../theme.js";
import { simulate, poseAt, basePose, CAR_L, CAR_W, PED_R, M, W, CX, CY } from "../engine/index.js";
import { specOf } from "../engine/road.js";
import { SCENARIOS } from "../engine/scenarios.js";
import { faultsIn } from "../engine/faults.js";
import {
  examinerEye, faultVisibility, whatExaminerSees, sightBlockersOf, EXAMINER_CONE,
} from "../engine/sight.js";
import {
  instructionWindow, pressureOf, skillUnderPressure, severityUnder, loadCandidate,
} from "../engine/directions.js";
import { chaseFor, worldHalfFor, frameFor, LOOK_AHEAD } from "../frame.js";
import { environmentFor, scatter } from "../environments.js";
import { Road, Environment } from "./RightOfWayTiming.jsx";

const RUN_FOR = 14;                       // seconds of drive per loop
const m1 = (px) => (px / 20).toFixed(1);

const VIS_COLOUR = {
  clear: C.green,
  partial: C.amber,
  hidden: C.red,
  away: "#7b828c",
};

export default function ExaminerLab() {
  const [scnId, setScnId] = useState("gap");
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [gaze, setGaze] = useState(0);
  const [cone, setCone] = useState(EXAMINER_CONE);
  const [lookAhead, setLookAhead] = useState(LOOK_AHEAD);
  const [held, setHeld] = useState(0);
  const [trait, setTrait] = useState("wander");
  const [chase, setChase] = useState(true);

  /* The candidate drives themselves — that is the whole flip — so the ego
     gets a departure of its own instead of waiting for a button. Derived
     from the engine's own window, so the candidate is competent by
     default and their faults come from traits rather than from timing. */
  const built = useMemo(() => {
    const raw = SCENARIOS.find((s) => s.id === scnId) || SCENARIOS[0];
    const withTrait = trait === "none"
      ? raw
      : { ...raw, ego: { ...raw.ego, traits: [...(raw.ego.traits || []), trait] } };
    const timed = { ...withTrait, ego: { ...withTrait.ego, departAt: simulate(raw).legalAt } };
    const scn = loadCandidate(timed, { held });
    const sim = simulate(scn);
    return {
      scn, sim,
      spec: specOf(scn),
      statics: sightBlockersOf(scn),
      faults: faultsIn(scn),
      window: instructionWindow(sim),
      env: environmentFor(scn.id),
    };
  }, [scnId, trait, held]);

  const { scn, sim, spec, statics, faults, env } = built;

  const view = useMemo(
    () => (chase
      ? chaseFor(spec, sim, t, scn.camera, { lookAhead })
      : { ...frameFor(spec), cx: CX, cy: CY, carX: null, rotate: 0, drift: null, ahead: 0, seconds: 0 }),
    [spec, sim, t, scn.camera, lookAhead, chase]
  );

  const worldHalf = useMemo(
    () => worldHalfFor(spec, sim, scn.camera, { chase }),
    [spec, sim, scn.camera, chase]
  );

  const scenery = useMemo(
    () => scatter(env, scn.id.length * 977, [], { cx: CX, cy: CY, half: worldHalf }),
    [env, scn.id, worldHalf]
  );

  /* Clock. rAF rather than an interval so it tracks real time when a
     frame is dropped instead of drifting. */
  const raf = useRef(0), last = useRef(0);
  useEffect(() => {
    if (!playing) return;
    last.current = performance.now();
    const tick = (now) => {
      const dt = Math.min(0.05, (now - last.current) / 1000);
      last.current = now;
      setT((x) => (x + dt) % RUN_FOR);
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [playing]);

  const egoPose = poseAt(sim.ego, t);
  const eye = examinerEye(egoPose);
  const sees = whatExaminerSees(sim, t, { gaze, cone, statics });
  const live = faults.filter((f) => t >= f.from && t <= f.to);

  const pressure = pressureOf(held);
  const skill = skillUnderPressure(1, pressure);

  return (
    <div style={S.page}>
      <div style={S.canvasWrap}>
        <svg viewBox={view.box} style={S.svg} preserveAspectRatio="xMidYMid meet">
          <g transform={`rotate(${view.rotate} ${view.cx} ${view.cy})`}>
            <Environment env={env} seed={scn.id.length * 977} keepOut={[]} worldHalf={worldHalf} />
            <Road control={scn.control} crossings={scn.crossings || []} spec={spec} reach={worldHalf} />

            {/* Where a clean drive would have been, so the deviation reads. */}
            <IntendedGhost p={sim.ego} t={t} />

            <GazeCone eye={eye} rot={egoPose.rot} gaze={gaze} cone={cone} reach={view.ahead || M(40)} />

            {sim.actors.map((a) => (
              <Actor key={a.id} p={a} pose={poseAt(a, t)} vis={sees[a.id]} />
            ))}
            <Actor p={sim.ego} pose={egoPose} vis="candidate" />
            {statics.map((b, i) => (
              <rect
                key={i} x={b.pose.x - b.hl} y={b.pose.y - b.hw}
                width={b.hl * 2} height={b.hw * 2}
                transform={`rotate(${b.pose.rot} ${b.pose.x} ${b.pose.y})`}
                fill="#2c3038" stroke="#464c56" strokeWidth={2}
              />
            ))}
          </g>
        </svg>

        <div style={S.hud}>
          <span style={S.hudT}>{t.toFixed(2)}s</span>
          {chase && <span style={S.hudDim}>{m1(view.ahead)}m ahead · {view.seconds.toFixed(1)}s</span>}
          {view.drift && (
            <span style={{ ...S.hudDim, color: Math.abs(view.drift.lateral) > M(0.4) ? C.amber : "#7b828c" }}>
              drift {m1(view.drift.lateral)}m · {view.drift.heading.toFixed(1)}°
            </span>
          )}
        </div>
      </div>

      <div style={S.panel}>
        <Row>
          <button className="btn" style={S.btn} onClick={() => setPlaying((p) => !p)}>
            {playing ? <Pause size={16} /> : <Play size={16} />}
          </button>
          <button className="btn" style={S.btn} onClick={() => setT(0)}><RotateCcw size={16} /></button>
          <input
            type="range" min={0} max={RUN_FOR} step={0.01} value={t}
            onChange={(e) => { setPlaying(false); setT(+e.target.value); }}
            style={S.scrub} aria-label="Time"
          />
        </Row>

        <Row>
          <Select label="Situation" value={scnId} onChange={setScnId}
            options={SCENARIOS.filter((s) => s.layout !== "roundabout").map((s) => [s.id, s.id])} />
          <Select label="Candidate does" value={trait} onChange={setTrait}
            options={[["none", "nothing wrong"], ["wander", "wander"], ["creep", "creep"],
              ["overshoot", "overshoot"], ["slowStart", "slowStart"], ["wideTurn", "wideTurn"],
              ["cutsCorner", "cutsCorner"], ["lateSignal", "lateSignal"]]} />
        </Row>

        <Slider label="Look ahead" value={lookAhead} min={2} max={20} step={0.5}
          fmt={(v) => `${v}s · ${m1(view.ahead)}m`} onChange={setLookAhead} disabled={!chase} />
        <Slider label="Gaze" value={gaze} min={-120} max={120} step={1}
          fmt={(v) => `${v > 0 ? "+" : ""}${v}°`} onChange={setGaze} />
        <Slider label="Cone" value={cone} min={20} max={160} step={5}
          fmt={(v) => `${v}°`} onChange={setCone} />

        <Row>
          <Toggle on={chase} onClick={() => setChase((v) => !v)}>
            {chase ? "Chase camera" : "Fixed camera"}
          </Toggle>
          <Toggle on={held > 0} onClick={() => setHeld((h) => (h + 1) % 4)}>
            {held} stacked
          </Toggle>
        </Row>

        <div style={S.meterRow}>
          <Meter label="Pressure" v={pressure} colour={C.amber} />
          <Meter label="Composure" v={skill} colour={skill > 0.7 ? C.green : C.red} />
          <div style={S.meterNote}>
            faults {severityUnder(held).toFixed(2)}× worse
          </div>
        </div>

        <div style={S.section}>
          <div style={S.sectionHead}><Eye size={13} /> Faults derived ({faults.length})</div>
          {faults.length === 0 && <div style={S.dim}>Nothing derivable in this situation.</div>}
          {faults.map((f) => {
            const v = faultVisibility(sim, f, { gaze, cone, statics });
            const isLive = live.includes(f);
            return (
              <div key={`${f.who}/${f.trait}`} style={{ ...S.fault, opacity: isLive ? 1 : 0.5 }}>
                <span style={{ ...S.dot, background: VIS_COLOUR[v.best] }} />
                <span style={S.faultWho}>{f.who}</span>
                <span style={S.faultTell}>{f.tell}</span>
                <span style={S.faultWhen}>{f.from.toFixed(1)}–{f.to.toFixed(1)}s</span>
                <span style={{ ...S.faultSeen, color: VIS_COLOUR[v.best] }}>
                  {Math.round(v.seen * 100)}% seen
                </span>
              </div>
            );
          })}
        </div>

        <div style={S.section}>
          <div style={S.sectionHead}><TriangleAlert size={13} /> Instruction</div>
          <div style={S.dim}>
            {built.window.phrase} — {built.window.viable
              ? `say it between ${built.window.opensAt.toFixed(1)}s and ${built.window.deadline.toFixed(1)}s`
              : `not directable here: needs ${(built.window.opensAt - built.window.deadline).toFixed(2)}s more approach`}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---- pieces -------------------------------------------------------- */

function IntendedGhost({ p, t }) {
  const b = basePose(p, t);
  if (!b || b.hidden || !Number.isFinite(b.x)) return null;
  return (
    <rect
      x={b.x - CAR_L / 2} y={b.y - CAR_W / 2} width={CAR_L} height={CAR_W} rx={M(0.3)}
      transform={`rotate(${b.rot} ${b.x} ${b.y})`}
      fill="none" stroke="#5c6470" strokeWidth={2} strokeDasharray="6 6"
    />
  );
}

function Actor({ p, pose, vis }) {
  if (!pose || pose.gone || pose.hidden) return null;
  const isCandidate = vis === "candidate";
  const fill = isCandidate ? C.blue : VIS_COLOUR[vis] || "#7b828c";
  const faded = !isCandidate && (vis === "away" || vis === "hidden");
  if (p.kind === "ped") {
    return <circle cx={pose.x} cy={pose.y} r={PED_R} fill={fill} opacity={faded ? 0.3 : 1} />;
  }
  return (
    <g transform={`rotate(${pose.rot} ${pose.x} ${pose.y})`} opacity={faded ? 0.3 : 1}>
      <rect x={pose.x - CAR_L / 2} y={pose.y - CAR_W / 2} width={CAR_L} height={CAR_W} rx={M(0.3)}
        fill={fill} stroke="#12151a" strokeWidth={2} />
      {/* nose, so heading is readable at any zoom */}
      <rect x={pose.x + CAR_L / 2 - M(0.5)} y={pose.y - CAR_W / 2} width={M(0.5)} height={CAR_W}
        fill="#12151a" opacity={0.55} />
    </g>
  );
}

/* The cone is drawn in world space from the examiner's seat, at the car's
   heading plus the gaze offset — so it turns with the car for free, which
   is the same reason gaze is stored relative rather than absolute. */
function GazeCone({ eye, rot, gaze, cone, reach }) {
  const a0 = ((rot + gaze - cone / 2) * Math.PI) / 180;
  const a1 = ((rot + gaze + cone / 2) * Math.PI) / 180;
  const p0 = { x: eye.x + Math.cos(a0) * reach, y: eye.y + Math.sin(a0) * reach };
  const p1 = { x: eye.x + Math.cos(a1) * reach, y: eye.y + Math.sin(a1) * reach };
  const large = cone > 180 ? 1 : 0;
  return (
    <g>
      <path
        d={`M${eye.x} ${eye.y} L${p0.x} ${p0.y} A${reach} ${reach} 0 ${large} 1 ${p1.x} ${p1.y} Z`}
        fill={C.yellow} opacity={0.10}
      />
      <path
        d={`M${eye.x} ${eye.y} L${p0.x} ${p0.y} M${eye.x} ${eye.y} L${p1.x} ${p1.y}`}
        stroke={C.yellow} strokeWidth={2} opacity={0.5} fill="none"
      />
      <circle cx={eye.x} cy={eye.y} r={M(0.35)} fill={C.yellow} />
    </g>
  );
}

const Row = ({ children }) => <div style={S.row}>{children}</div>;

function Select({ label, value, onChange, options }) {
  return (
    <label style={S.field}>
      <span style={S.label}>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={S.select}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}

function Slider({ label, value, min, max, step, fmt, onChange, disabled }) {
  return (
    <label style={{ ...S.field, opacity: disabled ? 0.4 : 1 }}>
      <span style={S.label}>{label}<span style={S.labelV}>{fmt ? fmt(value) : value}</span></span>
      <input type="range" min={min} max={max} step={step} value={value} disabled={disabled}
        onChange={(e) => onChange(+e.target.value)} style={S.scrub} />
    </label>
  );
}

function Toggle({ on, onClick, children }) {
  return (
    <button className="btn" onClick={onClick}
      style={{ ...S.toggle, borderColor: on ? C.blue : "rgba(255,255,255,0.14)", color: on ? C.blue : "#98a0ab" }}>
      {children}
    </button>
  );
}

function Meter({ label, v, colour }) {
  return (
    <div style={S.meter}>
      <div style={S.meterLabel}>{label}</div>
      <div style={S.meterTrack}>
        <div style={{ ...S.meterFill, width: `${Math.max(0, Math.min(1, v)) * 100}%`, background: colour }} />
      </div>
    </div>
  );
}

/* ---- styles -------------------------------------------------------- */
const S = {
  page: { display: "flex", flexDirection: "column", height: "100%", minHeight: 0, background: C.bg },
  canvasWrap: { position: "relative", flex: "1 1 auto", minHeight: 0, background: "#0f1115" },
  svg: { width: "100%", height: "100%", display: "block", touchAction: "none" },
  hud: {
    position: "absolute", top: 10, left: 10, display: "flex", gap: 10, alignItems: "baseline",
    fontFamily: FONT_D, pointerEvents: "none", flexWrap: "wrap",
  },
  hudT: { fontSize: 20, fontWeight: 700, color: C.white, letterSpacing: 0.5 },
  hudDim: { fontSize: 12.5, color: "#7b828c", fontFamily: FONT_U },
  panel: {
    flex: "0 0 auto", maxHeight: "52%", overflowY: "auto", padding: "10px 12px 16px",
    borderTop: "1px solid rgba(255,255,255,0.10)", display: "flex", flexDirection: "column", gap: 9,
    fontFamily: FONT_U,
  },
  row: { display: "flex", gap: 8, alignItems: "flex-end" },
  btn: {
    minWidth: 44, minHeight: 44, display: "grid", placeItems: "center",
    background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.14)",
    borderRadius: 6, color: C.white,
  },
  scrub: { flex: 1, minHeight: 44, accentColor: C.blue, width: "100%" },
  field: { display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0 },
  label: {
    fontSize: 10.5, letterSpacing: 1, textTransform: "uppercase", color: "#7b828c",
    display: "flex", justifyContent: "space-between", gap: 8,
  },
  labelV: { color: C.white, letterSpacing: 0, textTransform: "none", fontSize: 12 },
  select: {
    minHeight: 44, fontSize: 16, background: "rgba(255,255,255,0.05)", color: C.white,
    border: "1px solid rgba(255,255,255,0.14)", borderRadius: 6, padding: "0 8px",
  },
  toggle: {
    minHeight: 44, flex: 1, borderRadius: 6, border: "1px solid", fontSize: 13,
    background: "rgba(255,255,255,0.04)", fontFamily: FONT_D, letterSpacing: 0.6,
  },
  meterRow: { display: "flex", gap: 10, alignItems: "center" },
  meter: { flex: 1 },
  meterLabel: { fontSize: 10.5, letterSpacing: 1, textTransform: "uppercase", color: "#7b828c" },
  meterTrack: { height: 6, background: "rgba(255,255,255,0.08)", borderRadius: 3, overflow: "hidden", marginTop: 3 },
  meterFill: { height: "100%", transition: "width 140ms ease" },
  meterNote: { fontSize: 12, color: "#98a0ab", whiteSpace: "nowrap" },
  section: { borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 8 },
  sectionHead: {
    display: "flex", alignItems: "center", gap: 6, fontFamily: FONT_D, fontSize: 13,
    letterSpacing: 0.8, textTransform: "uppercase", color: "#98a0ab", marginBottom: 5,
  },
  dim: { fontSize: 12.5, color: "#98a0ab", lineHeight: 1.5 },
  fault: { display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, padding: "3px 0", flexWrap: "wrap" },
  dot: { width: 8, height: 8, borderRadius: 4, flex: "0 0 auto" },
  faultWho: { fontFamily: FONT_D, color: C.white, minWidth: 26 },
  faultTell: { color: "#c3c9d2", flex: 1, minWidth: 140 },
  faultWhen: { color: "#7b828c", fontVariantNumeric: "tabular-nums" },
  faultSeen: { fontVariantNumeric: "tabular-nums", minWidth: 62, textAlign: "right" },
};
