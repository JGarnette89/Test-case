/* =====================================================================
   STAGE 2 OF THE REBUILD, on screen.

   Two drivers, the same seed, the same traffic, the same course leg for
   leg and turn for turn. One thing differs and it is the person.

   REBUILD.md section 6 sets the test and it is not a check: can you tell
   which is which by watching? So the names are hidden until you ask for
   them, because a label under a car answers the question for you and
   then nobody has learned anything.

   TWO WORLDS RATHER THAN TWO CARS IN ONE. Two candidates sharing a road
   would meet different traffic at different instants, and every
   difference between them would be partly the situation. Same seed, one
   axis moved, is the controlled comparison this project uses everywhere
   else -- and it is the only version of this screen that can honestly
   claim what it claims.
   ===================================================================== */
import React, { useEffect, useRef, useState } from "react";
import { Play, Pause, RotateCcw, Eye, EyeOff } from "lucide-react";
import { C, FONT_D, FONT_U } from "../theme.js";
import {
  seedCrossing, step, poseOf, overlapping, CAR, M, DT, ALL_WAY, TWO_WAY,
} from "../sim/crossing.js";
import { PROFILES, profileOf, withCandidates, keepDriving, watch } from "../sim/candidate.js";

const CONTROLS = [
  { id: "two", label: "Two-way", control: TWO_WAY },
  { id: "all", label: "All-way", control: ALL_WAY },
];
/* BELOW CAPACITY, DELIBERATELY, and it is a real trade rather than a
   convenience. A busy two-way stop starves the side street -- p90 waits
   of 110s, measured in verify-crossing section 8 -- so at `2.5` even a
   SOUND candidate sat 47s at every line and the screen was mostly two
   stationary cars. The hesitation being demonstrated has to be the
   driver's rather than the queue's. */
const EVERY = 5.0;
const LIMIT = 60;

/* THE VIEW FOLLOWS THE CANDIDATE, because a fixed one does not show
   them. An approach at a two-way stop is 279m at 60 km/h -- it has to
   be, or "is there a gap" is answered by the edge of the world -- and a
   view wide enough to hold all of that draws a car three pixels long.
   Fixed on the intersection, the candidate was off screen for about
   three quarters of every trip, which is a poor way to watch somebody.

   AXIS-ALIGNED, DELIBERATELY. It slides, it does not turn. A rotating
   chase view is stage 3's, it is where the steering axis becomes really
   legible (DECISIONS.md 5.14.4), and building half of it here would mean
   building it twice. */
const HALF = 24;
const view = (at) => ({
  x: M(at.x - HALF), y: M(at.y - HALF), w: M(HALF * 2), h: M(HALF * 2),
});

const seedWorld = (seed, kind, profile) =>
  withCandidates(
    seedCrossing(seed, LIMIT, { every: EVERY, control: CONTROLS.find((c) => c.id === kind).control }),
    [{ id: "them", profile }],
  );

export default function SimCandidates() {
  const [seed, setSeed] = useState(4);
  const [kind, setKind] = useState("two");
  const [left, setLeft] = useState("timid");
  const [right, setRight] = useState("bold");
  const [named, setNamed] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [worlds, setWorlds] = useState(() => [seedWorld(4, "two", "timid"), seedWorld(4, "two", "bold")]);

  const raf = useRef(0), last = useRef(0), owed = useRef(0);
  useEffect(() => {
    if (!playing) return;
    last.current = 0;
    const tick = (now) => {
      if (last.current) {
        owed.current += Math.min(0.25, (now - last.current) / 1000);
        const n = Math.floor(owed.current / DT);
        if (n > 0) {
          owed.current -= n * DT;
          setWorlds((ws) => ws.map((w) => {
            let next = w;
            for (let i = 0; i < n; i++) next = keepDriving(step(next));
            return next;
          }));
        }
      }
      last.current = now;
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [playing]);

  const restart = (s = seed, k = kind, l = left, r = right) => {
    setSeed(s); setKind(k); setLeft(l); setRight(r);
    setWorlds([seedWorld(s, k, l), seedWorld(s, k, r)]);
    owed.current = 0;
  };

  const sides = [
    { tag: "A", profile: left, set: (p) => restart(seed, kind, p, right), world: worlds[0], accent: C.amber },
    { tag: "B", profile: right, set: (p) => restart(seed, kind, left, p), world: worlds[1], accent: C.blue },
  ];

  return (
    <div style={S.page}>
      <div style={S.head}>
        <span style={S.title}>Stage 2 — two candidates, one course</span>
        <span style={S.sub}>
          same seed, same traffic, same turns. One of them is a different person.
        </span>
      </div>

      <div style={S.pair}>
        {sides.map((s) => (
          <Panel key={s.tag} {...s} named={named} />
        ))}
      </div>

      <div style={S.panel}>
        <div style={S.row}>
          <span style={S.label}>A is</span>
          <Pick value={left} onPick={(p) => sides[0].set(p)} hidden={!named} accent={C.amber} />
        </div>
        <div style={S.row}>
          <span style={S.label}>B is</span>
          <Pick value={right} onPick={(p) => sides[1].set(p)} hidden={!named} accent={C.blue} />
        </div>

        <div style={S.row}>
          <button className="btn" style={S.btn} onClick={() => setPlaying((p) => !p)}>
            {playing ? <Pause size={16} /> : <Play size={16} />}
          </button>
          <button className="btn" style={S.btn} onClick={() => restart(seed + 1)}>
            <RotateCcw size={16} />
          </button>
          <button className="btn" style={{ ...S.btn, width: "auto", padding: "0 12px", gap: 6 }}
            onClick={() => setNamed((n) => !n)}>
            {named ? <EyeOff size={16} /> : <Eye size={16} />}
            <span style={{ fontFamily: FONT_D, fontSize: 13 }}>{named ? "hide" : "who is who"}</span>
          </button>
          {CONTROLS.map((c) => (
            <button key={c.id} className="btn" style={{
              ...S.chip,
              borderColor: kind === c.id ? C.green : "rgba(255,255,255,0.12)",
              color: kind === c.id ? C.white : C.dim,
            }} onClick={() => restart(seed, c.id)}>{c.label}</button>
          ))}
        </div>

        <div style={S.note}>
          Both sides run the same seeded traffic and send their candidate
          round the same legs in the same order, so anything you can see
          between them is the driver rather than the day. The candidate is
          the outlined car; everybody else is drawn from the same model
          with ratings of their own.
          <br />
          What each weakness looks like: a <b>hesitant</b> driver lets
          gaps go that were plainly big enough and then sits at the line;
          a <b>pushy</b> one takes gaps nobody else would and spends a
          fifth of the time at the line; a <b>ragged</b> one never holds a steady
          line; a <b>heavy-footed</b> one leaves the braking late and
          stands on it; an <b>unschooled</b> one slows to a crawl at a
          stop sign and carries on through it.
          <br />
          <b>Two-way</b> is where confidence shows, because the side
          street has to judge a gap. At an <b>all-way</b> stop everybody
          stops, so there is no gap to judge and a hesitant driver looks
          much like a sound one — which is correct, and worth knowing.
        </div>
      </div>
    </div>
  );
}

function Pick({ value, onPick, hidden, accent }) {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", flex: 1 }}>
      {PROFILES.map((p) => (
        <button key={p.id} className="btn" style={{
          ...S.chip, minWidth: 0, padding: "0 10px",
          borderColor: value === p.id ? accent : "rgba(255,255,255,0.12)",
          color: value === p.id ? C.white : C.dim,
        }} onClick={() => onPick(p.id)}>
          {hidden && value === p.id ? "•••" : p.name}
        </button>
      ))}
    </div>
  );
}

function Panel({ tag, world, accent, named, profile }) {
  const place = world.layout.place;
  const half = M(place.lane);
  const line = M(place.lineAt);
  const them = watch(world, "them");
  const touching = overlapping(world).length;

  /* Centred a little AHEAD of the candidate rather than on them, so the
     frame holds what they are driving into rather than what they have
     already passed -- the old engine's `LOOK_AHEAD` idea at a fraction
     of the size. On the intersection while they are between trips, so
     the view never sits over empty road. */
  const me = world.actors.find((a) => a.candidate === "them");
  const at = me ? poseOf(world, me) : { x: 0, y: 0, rot: 0 };
  const ahead = me ? HALF * 0.35 : 0;
  const eye = {
    x: at.x + Math.cos((at.rot * Math.PI) / 180) * ahead,
    y: at.y + Math.sin((at.rot * Math.PI) / 180) * ahead,
  };
  const VIEW = view(eye);
  const edge = eye;

  return (
    <div style={S.cell}>
      <svg viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`}
        style={{ width: "100%", height: "100%", display: "block" }}
        preserveAspectRatio="xMidYMid slice">
        <rect x={VIEW.x} y={VIEW.y} width={VIEW.w} height={VIEW.h} fill="#22262c" />
        {/* The roads run the whole length of the legs, so they have to be
            drawn past the view rather than to it -- the same rule the old
            renderer learned the hard way: whatever the camera can reveal
            has to have been drawn. */}
        <rect x={-half} y={-M(place.reach)} width={half * 2} height={M(place.reach * 2)} fill="#2c3037" />
        <rect x={-M(place.reach)} y={-half} width={M(place.reach * 2)} height={half * 2} fill="#2c3037" />

        {[[0, -1], [0, 1], [-1, 0], [1, 0]].map(([ux, uy], i) => (
          <line key={i} x1={ux * half} y1={uy * half}
            x2={ux * M(place.reach)} y2={uy * M(place.reach)}
            stroke="#7a6a3a" strokeWidth={M(0.15)} strokeDasharray={`${M(3)} ${M(3)}`} />
        ))}

        {[["N", 0, -1], ["S", 0, 1], ["E", 1, 0], ["W", -1, 0]].map(([side, ux, uy]) => {
          if (place.control[side] !== "stop") return null;
          const rx = -uy, ry = ux;
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
          if (Math.abs(p.x - edge.x) > HALF + 6 || Math.abs(p.y - edge.y) > HALF + 6) return null;
          const mine = a.candidate === "them";
          const hard = a.a < -0.5;
          const held = a.v < 0.3;
          return (
            <g key={a.id} transform={`translate(${M(p.x)} ${M(p.y)}) rotate(${p.rot})`}>
              <rect
                x={-M(CAR.length) / 2} y={-M(CAR.width) / 2}
                width={M(CAR.length)} height={M(CAR.width)} rx={M(0.3)}
                fill={mine ? accent : hard ? "#8a4b4b" : held ? "#4a5058" : "#5a616b"}
                stroke={mine ? C.white : "#12151a"} strokeWidth={M(mine ? 0.22 : 0.1)} />
              <rect x={M(CAR.length) / 2 - M(0.5)} y={-M(CAR.width) / 2}
                width={M(0.5)} height={M(CAR.width)} fill="#12151a" opacity={0.55} />
              {hard && !mine && (
                <rect x={-M(CAR.length) / 2} y={-M(CAR.width) / 2}
                  width={M(0.4)} height={M(CAR.width)} fill={C.red} />
              )}
            </g>
          );
        })}
      </svg>

      <div style={S.cap}>
        <span style={{ ...S.tag, background: accent }}>{tag}</span>
        <span style={S.capName}>{named ? profileOf(profile).name : "candidate " + tag}</span>
        <span style={S.capStat}>
          {them.on
            ? `${(them.v * 3.6).toFixed(0)} km/h · trip ${them.trips + 1}` +
              (them.waiting ? ` · waiting ${them.waited > 0 ? them.waited.toFixed(0) + "s" : ""}` : "")
            : "joining"}
          {them.delayed && <b style={{ color: "#c9a24a" }}> · DAWDLING</b>}
          {touching > 0 && <b style={{ color: C.red }}> · TOUCHING</b>}
        </span>
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
  pair: { display: "flex", gap: 6, padding: "0 6px", height: "44dvh", minHeight: 220 },
  cell: {
    flex: 1, minWidth: 0, position: "relative", overflow: "hidden",
    display: "flex", flexDirection: "column", borderRadius: 8,
  },
  cap: {
    display: "flex", alignItems: "center", gap: 6, padding: "4px 6px",
    background: "rgba(0,0,0,0.25)",
  },
  tag: {
    width: 18, height: 18, borderRadius: 4, display: "flex", alignItems: "center",
    justifyContent: "center", fontFamily: FONT_D, fontSize: 12, color: "#12151a",
  },
  capName: { fontFamily: FONT_D, fontSize: 13, color: C.white },
  capStat: { fontFamily: FONT_D, fontSize: 11, color: C.dim, marginLeft: "auto", textAlign: "right" },
  panel: { padding: 10, display: "flex", flexDirection: "column", gap: 8 },
  row: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" },
  btn: {
    minWidth: 44, minHeight: 44, display: "flex", alignItems: "center",
    justifyContent: "center", background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10,
    color: C.text, cursor: "pointer",
  },
  chip: {
    minWidth: 52, minHeight: 44, display: "flex", alignItems: "center",
    justifyContent: "center", background: "rgba(255,255,255,0.05)",
    border: "1px solid", borderRadius: 10, fontFamily: FONT_D, fontSize: 14,
    cursor: "pointer",
  },
  label: { fontFamily: FONT_D, fontSize: 13, color: C.dim, width: 32 },
  note: { fontFamily: FONT_U, fontSize: 12, color: C.dim, lineHeight: 1.45 },
};
