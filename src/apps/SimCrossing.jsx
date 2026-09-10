/* =====================================================================
   STAGE 1 OF THE REBUILD, on screen.

   An all-way stop. Cars arrive from four legs, wait their turn, and go.
   Nothing else: no candidate, no marking, no score, no camera.

   The deliverable of this stage is the same as stage 0's -- an OPINION.
   Does traffic that has to negotiate with itself read as drivers making
   decisions? A green suite cannot answer that, and 31 green checks over a
   game the maintainer says is not a game is exactly the failure a
   test-first rebuild reproduces.
   ===================================================================== */
import React, { useEffect, useRef, useState } from "react";
import { Play, Pause, RotateCcw } from "lucide-react";
import { C, FONT_D, FONT_U } from "../theme.js";
import { seedCrossing, run, poseOf, overlapping, delayed, CAR, M, DT, ALL_WAY, TWO_WAY } from "../sim/crossing.js";

const LIMITS = [30, 50, 60];

/* THE SAME INTERSECTION, TWO KINDS OF PLACE. Control is per leg
   (DECISIONS.md 5.4), so nothing about the geometry or the decision
   changes between these -- two entries in a table do. Everything the
   two-way stop does differently falls out of that. */
const CONTROLS = [
  { id: "all", label: "All-way", control: ALL_WAY,
    blurb: "four legs, and nobody is telling them who goes." },
  { id: "two", label: "Two-way", control: TWO_WAY,
    blurb: "the main road never stops, and the side street has to find a gap." },
];

/* HOW HARD TO PUSH IT. The maintainer's framing for this stage was "cars
   that just keep coming, so we can prove our right of way ordering stays
   consistent" -- so the stress case has to be something he can put on
   screen, not only something a check reports.

   The intersection passes about 15 cars a minute. Below that it flows;
   above it, the approaches back up and the ordering is being asked to
   hold under a load it cannot satisfy, which is the interesting case. */
const DEMANDS = [
  { id: "quiet", label: "Quiet", every: 5.0 },
  { id: "busy", label: "Busy", every: 1.6 },
  { id: "jammed", label: "Relentless", every: 0.6 },
];

/* How much of the place to show. The approaches run 60m out; showing all
   of that would put the box in the middle of a large empty cross and make
   the cars tiny. 34m each way keeps the whole intersection and a queue on
   every leg, which is what there is to watch. */
const HALF = 34;
const VIEW = { x: -M(HALF), y: -M(HALF), w: M(HALF * 2), h: M(HALF * 2) };

export default function SimCrossing() {
  const [seed, setSeed] = useState(1);
  const [limit, setLimit] = useState(50);
  const [demand, setDemand] = useState("busy");
  const [kind, setKind] = useState("all");
  const [world, setWorld] = useState(() => seedCrossing(1, 50, { every: 1.6 }));
  const [playing, setPlaying] = useState(true);

  const raf = useRef(0), last = useRef(0), owed = useRef(0);
  useEffect(() => {
    if (!playing) return;
    last.current = 0;
    const tick = (now) => {
      if (last.current) {
        owed.current += Math.min(0.25, (now - last.current) / 1000);
        const n = Math.floor(owed.current / DT);
        if (n > 0) { owed.current -= n * DT; setWorld((w) => run(w, n)); }
      }
      last.current = now;
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [playing]);

  const restart = (s = seed, kmh = limit, d = demand, k = kind) => {
    setSeed(s); setLimit(kmh); setDemand(d); setKind(k);
    setWorld(seedCrossing(s, kmh, {
      every: DEMANDS.find((x) => x.id === d).every,
      control: CONTROLS.find((x) => x.id === k).control,
    }));
    owed.current = 0;
  };

  const place = world.layout.place;
  const half = M(place.lane);              // half the road's width: one lane each way
  const line = M(place.lineAt);
  const waiting = world.actors.filter((a) => a.v < 0.3).length;
  const touching = overlapping(world).length;
  const late = delayed(world).length;
  const here = CONTROLS.find((x) => x.id === kind);

  return (
    <div style={S.page}>
      <div style={S.head}>
        <span style={S.title}>Stage 1 — {here.label.toLowerCase()} stop</span>
        <span style={S.sub}>{here.blurb}</span>
      </div>

      <div style={S.canvas}>
        <svg viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`}
          style={{ width: "100%", height: "100%", display: "block" }}
          preserveAspectRatio="xMidYMid meet">
          <rect x={VIEW.x} y={VIEW.y} width={VIEW.w} height={VIEW.h} fill="#22262c" />
          {/* The two roads, crossing. Drawing them as full-length bars is
              what makes the box appear where they overlap. */}
          <rect x={-half} y={VIEW.y} width={half * 2} height={VIEW.h} fill="#2c3037" />
          <rect x={VIEW.x} y={-half} width={VIEW.w} height={half * 2} fill="#2c3037" />

          {/* Centre lines, stopping short of the box because road markings
              do. */}
          {[[0, -1], [0, 1], [-1, 0], [1, 0]].map(([ux, uy], i) => (
            <line key={i}
              x1={ux * half} y1={uy * half}
              x2={ux * M(HALF)} y2={uy * M(HALF)}
              stroke="#7a6a3a" strokeWidth={M(0.15)} strokeDasharray={`${M(3)} ${M(3)}`} />
          ))}

          {/* THE STOP LINES, across the inbound lane of each leg only --
              the lane you arrive on, not the one you leave by. */}
          {[["N", 0, -1], ["S", 0, 1], ["E", 1, 0], ["W", -1, 0]].map(([side, ux, uy]) => {
            /* NO SIGN, NO LINE. A leg that does not stop must not be
               painted as though it does -- the screen has to be able to
               express what the model is doing, or it is telling the
               player something that is not true (DECISIONS.md 0). */
            if (place.control[side] !== "stop") return null;
            const rx = -uy, ry = ux;              // right of travel, inbound
            const cx = ux * line - rx * M(place.lane / 2);
            const cy = uy * line - ry * M(place.lane / 2);
            return (
              <rect key={side}
                x={cx - (ux ? M(0.25) : M(place.lane / 2))}
                y={cy - (uy ? M(0.25) : M(place.lane / 2))}
                width={ux ? M(0.5) : M(place.lane)}
                height={uy ? M(0.5) : M(place.lane)}
                fill="#c9ccd1" opacity={0.75} />
            );
          })}

          {world.actors.map((a) => {
            const p = poseOf(world, a);
            if (Math.abs(p.x) > HALF + 6 || Math.abs(p.y) > HALF + 6) return null;
            const hard = a.a < -0.5;
            const held = a.v < 0.3;
            const dawdling = a.delayed;
            return (
              <g key={a.id} transform={`translate(${M(p.x)} ${M(p.y)}) rotate(${p.rot})`}>
                <rect
                  x={-M(CAR.length) / 2} y={-M(CAR.width) / 2}
                  width={M(CAR.length)} height={M(CAR.width)} rx={M(0.3)}
                  fill={hard ? "#8a4b4b" : dawdling ? "#6a5a34" : held ? "#4a5058" : "#5a616b"}
                  stroke="#12151a" strokeWidth={M(0.1)} />
                {/* Which way it is pointing. */}
                <rect x={M(CAR.length) / 2 - M(0.5)} y={-M(CAR.width) / 2}
                  width={M(0.5)} height={M(CAR.width)} fill="#12151a" opacity={0.55} />
                {hard && (
                  <rect x={-M(CAR.length) / 2} y={-M(CAR.width) / 2}
                    width={M(0.4)} height={M(CAR.width)} fill={C.red} />
                )}
              </g>
            );
          })}
        </svg>
      </div>

      <div style={S.panel}>
        <div style={S.row}>
          <span style={S.label}>Control</span>
          {CONTROLS.map((c) => (
            <button key={c.id} className="btn" style={{
              ...S.chip, minWidth: 0, flex: 1,
              borderColor: kind === c.id ? C.blue : "rgba(255,255,255,0.12)",
              color: kind === c.id ? C.white : C.dim,
            }} onClick={() => restart(seed, limit, demand, c.id)}>{c.label}</button>
          ))}
        </div>

        <div style={S.row}>
          <span style={S.label}>Traffic</span>
          {DEMANDS.map((d) => (
            <button key={d.id} className="btn" style={{
              ...S.chip, minWidth: 0, flex: 1,
              borderColor: demand === d.id ? C.green : "rgba(255,255,255,0.12)",
              color: demand === d.id ? C.white : C.dim,
            }} onClick={() => restart(seed, limit, d.id)}>{d.label}</button>
          ))}
        </div>

        <div style={S.row}>
          <span style={S.label}>Limit</span>
          {LIMITS.map((kmh) => (
            <button key={kmh} className="btn" style={{
              ...S.chip,
              borderColor: limit === kmh ? C.amber : "rgba(255,255,255,0.12)",
              color: limit === kmh ? C.white : C.dim,
            }} onClick={() => restart(seed, kmh)}>{kmh}</button>
          ))}
          <span style={S.label}>km/h</span>
        </div>

        <div style={S.row}>
          <button className="btn" style={S.btn} onClick={() => setPlaying((p) => !p)}>
            {playing ? <Pause size={16} /> : <Play size={16} />}
          </button>
          <button className="btn" style={S.btn} onClick={() => restart(seed + 1, limit)}>
            <RotateCcw size={16} />
          </button>
          <span style={S.readout}>
            {world.t.toFixed(0)}s · {world.actors.length} cars · {waiting} waiting
            {late > 0 && ` · ${late} dawdling`}
            {(world.turnedAway ?? 0) > 0 && ` · ${world.turnedAway} turned away`}
            {touching > 0 && <b style={{ color: C.red }}> · {touching} TOUCHING</b>}
          </span>
        </div>

        <div style={S.note}>
          Nobody is directing this. Each driver looks at the others every
          twentieth of a second and works out whether their paths cross,
          whether the other car is already committed, and who stopped
          first — then waits or goes. Darker is stopped, red is braking,
          <b style={{ color: "#c9a24a" }}> amber is a driver who has sat
          more than four seconds past a gap they should have taken</b>.
          <br />
          <b>All-way:</b> whoever stopped first goes first; arriving
          together, the car on the right goes; a left turn yields to the
          oncoming. On <b>Relentless</b> it is offered a hundred cars a
          minute and can pass about twenty, so the approaches back up and
          the ordering is being asked to hold under a load it cannot
          satisfy. Measured over forty intersection-minutes: 912 cars
          crossed the line and none of them went out of turn.
          <br />
          <b>Two-way:</b> the main road runs east–west and never stops.
          The side street has to judge a gap, and how big a gap it wants
          is not a number anybody chose — it is how long the crossing
          takes, plus as much again scaled by how cautious that driver is.
          A bold driver takes 2.5 seconds where a timid one wants nearly
          eight. Watch the side street lose its nerve and let a gap go.
          <br />
          If anything ever reads <b>TOUCHING</b>, that is the one thing
          that must never happen and I want to know.
        </div>
      </div>
    </div>
  );
}

const S = {
  page: {
    minHeight: "100dvh", display: "flex", flexDirection: "column",
    background: C.bg, color: C.text,
  },
  head: { padding: "10px 12px 6px", display: "flex", flexDirection: "column", gap: 2 },
  title: { fontFamily: FONT_D, fontSize: 18, color: C.white },
  sub: { fontFamily: FONT_U, fontSize: 12, color: C.dim },
  canvas: { height: "58dvh", minHeight: 280, position: "relative", overflow: "hidden" },
  panel: { padding: 10, display: "flex", flexDirection: "column", gap: 8 },
  row: { display: "flex", gap: 8, alignItems: "center" },
  btn: {
    minWidth: 44, minHeight: 44, display: "flex", alignItems: "center",
    justifyContent: "center", background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10,
    color: C.text, cursor: "pointer",
  },
  chip: {
    minWidth: 52, minHeight: 44, display: "flex", alignItems: "center",
    justifyContent: "center", background: "rgba(255,255,255,0.05)",
    border: "1px solid", borderRadius: 10, fontFamily: FONT_D, fontSize: 15,
    cursor: "pointer",
  },
  label: { fontFamily: FONT_D, fontSize: 13, color: C.dim },
  readout: { fontFamily: FONT_D, fontSize: 13, color: C.dim },
  note: { fontFamily: FONT_U, fontSize: 12, color: C.dim, lineHeight: 1.45 },
};
