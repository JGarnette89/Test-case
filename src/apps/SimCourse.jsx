/* =====================================================================
   STAGE 3 OF THE REBUILD, first increment, on screen.

   Two intersections and the road between them. The claim this screen
   exists to make is narrow and it is the only one worth making yet:

     THE CAR THAT LEAVES ONE INTERSECTION IS THE CAR THAT ARRIVES AT THE
     NEXT ONE.

   Which is why it is built around FOLLOWING ONE CAR rather than around
   showing the whole course at once. A view wide enough to hold both
   boxes draws a car a pixel and a half long, and a pixel and a half
   crossing a boundary proves nothing to anybody -- you cannot tell it
   from a different pixel and a half. So the strip along the top is the
   map, and the window below it is the evidence: pick a car, watch it
   drive out of one intersection, down the street, and into the next.
   ===================================================================== */
import React, { useEffect, useRef, useState } from "react";
import { Play, Pause, RotateCcw, Crosshair } from "lucide-react";
import { C, FONT_D, FONT_U } from "../theme.js";
import {
  seedCourse, step, poseOf, overlapping, pathOf, CAR, M, DT, ALL_WAY, TWO_WAY,
} from "../sim/crossing.js";
import { joinedTo } from "../sim/course.js";

const CONTROLS = [
  { id: "two", label: "Two-way", control: TWO_WAY },
  { id: "all", label: "All-way", control: ALL_WAY },
];
const SIZES = [2, 3];
const EVERY = 2.2;
const LIMIT = 60;

/* How much road the close view holds. The same figure the stage 2 screen
   uses, for the same reason: it is about as much as you can show and
   still see what a car is doing. */
const HALF = 26;

export default function SimCourse() {
  const [seed, setSeed] = useState(1);
  const [kind, setKind] = useState("two");
  const [size, setSize] = useState(2);
  const [playing, setPlaying] = useState(true);
  const [watched, setWatched] = useState(null);
  const [world, setWorld] = useState(() => seedCourse(1, LIMIT, { every: EVERY, control: TWO_WAY, n: 2 }));

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
          setWorld((w) => {
            let next = w;
            for (let i = 0; i < n; i++) next = step(next);
            return next;
          });
        }
      }
      last.current = now;
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [playing]);

  const restart = (s = seed, k = kind, n = size) => {
    setSeed(s); setKind(k); setSize(n);
    setWorld(seedCourse(s, LIMIT, {
      every: EVERY, control: CONTROLS.find((c) => c.id === k).control, n,
    }));
    setWatched(null);
    owed.current = 0;
  };

  const course = world.course;
  const span = course.at[course.n - 1].at.x;
  const edge = course.at[0].layout.place.reach;

  /* WHO TO WATCH: somebody who is about to PROVE THE POINT rather than
     somebody who already has. That means a car whose exit leg has another
     intersection on the end of it, and of those the one furthest from
     the boundary, so you get the whole approach and the crossing rather
     than the last two seconds of it. Sticky once picked -- the entire
     idea is that it stays the same car. */
  const them = watched ? world.actors.find((a) => a.id === watched) : null;
  const pickOne = () => {
    const going = world.actors
      .filter((a) => joinedTo(course, a.k, pathOf(world, a).to))
      .map((a) => ({ a, left: pathOf(world, a).length - a.s }))
      .sort((x, y) => y.left - x.left);
    setWatched(going.length ? going[0].a.id : (world.actors[0]?.id ?? null));
  };
  useEffect(() => { if (!them && world.actors.length) pickOne(); }, [world.actors.length, watched]);

  const at = them ? poseOf(world, them) : { x: span / 2, y: 0 };
  const touching = overlapping(world).length;
  const crossed = them ? (them.k ?? 0) : 0;

  return (
    <div style={S.page}>
      <div style={S.head}>
        <span style={S.title}>Stage 3 — one road, two intersections</span>
        <span style={S.sub}>
          the car that leaves one is the car that arrives at the next.
        </span>
      </div>

      {/* THE MAP. Everything at once, small, so the flow is visible even
          though an individual car is not. */}
      <div style={S.map}>
        <svg viewBox={`${M(-edge)} ${M(-26)} ${M(span + edge * 2)} ${M(52)}`}
          style={{ width: "100%", height: "100%", display: "block" }}
          preserveAspectRatio="none">
          <rect x={M(-edge)} y={M(-26)} width={M(span + edge * 2)} height={M(52)} fill="#1b1e23" />
          <rect x={M(-edge)} y={M(-3.6)} width={M(span + edge * 2)} height={M(7.2)} fill="#2c3037" />
          {course.at.map((spot) => (
            <rect key={spot.k} x={M(spot.at.x - 3.6)} y={M(-26)} width={M(7.2)} height={M(52)} fill="#2c3037" />
          ))}
          {course.at.map((spot) => (
            <rect key={"box" + spot.k} x={M(spot.at.x - 3.6)} y={M(-3.6)}
              width={M(7.2)} height={M(7.2)} fill="#343941" />
          ))}
          {world.actors.map((a) => {
            const p = poseOf(world, a);
            const mine = them && a.id === them.id;
            return (
              <rect key={a.id} x={M(p.x) - M(CAR.length) / 2} y={M(p.y) - M(1.4)}
                width={M(CAR.length)} height={M(2.8)}
                fill={mine ? C.amber : a.v < 0.3 ? "#4a5058" : "#69707b"} />
            );
          })}
          {them && (
            <rect x={M(at.x - HALF)} y={M(-26)} width={M(HALF * 2)} height={M(52)}
              fill="none" stroke={C.amber} strokeWidth={M(0.9)} opacity={0.7} />
          )}
        </svg>
      </div>

      {/* THE EVIDENCE. One car, close enough to see what it is doing. */}
      <div style={S.close}>
        <svg viewBox={`${M(at.x - HALF)} ${M(at.y - HALF)} ${M(HALF * 2)} ${M(HALF * 2)}`}
          style={{ width: "100%", height: "100%", display: "block" }}
          preserveAspectRatio="xMidYMid slice">
          <rect x={M(at.x - HALF * 2)} y={M(at.y - HALF * 2)} width={M(HALF * 4)} height={M(HALF * 4)} fill="#22262c" />
          <rect x={M(-edge)} y={M(-3.6)} width={M(span + edge * 2)} height={M(7.2)} fill="#2c3037" />
          {course.at.map((spot) => (
            <rect key={spot.k} x={M(spot.at.x - 3.6)} y={M(spot.at.y - spot.layout.place.reach)}
              width={M(7.2)} height={M(spot.layout.place.reach * 2)} fill="#2c3037" />
          ))}
          {/* Centre lines, broken at every box. */}
          <line x1={M(-edge)} y1={0} x2={M(span + edge)} y2={0}
            stroke="#7a6a3a" strokeWidth={M(0.15)} strokeDasharray={`${M(3)} ${M(3)}`} />
          {course.at.map((spot) => (
            <rect key={"gap" + spot.k} x={M(spot.at.x - 3.6)} y={M(-0.4)} width={M(7.2)} height={M(0.8)} fill="#2c3037" />
          ))}
          {/* Stop lines, on controlled legs only. */}
          {course.at.map((spot) =>
            [["N", 0, -1], ["S", 0, 1], ["E", 1, 0], ["W", -1, 0]].map(([side, ux, uy]) => {
              if (spot.layout.place.control[side] !== "stop") return null;
              const line = M(spot.layout.place.lineAt), lane = spot.layout.place.lane;
              const rx = -uy, ry = ux;
              const cx = M(spot.at.x) + ux * line - rx * M(lane / 2);
              const cy = M(spot.at.y) + uy * line - ry * M(lane / 2);
              return (
                <rect key={spot.k + side}
                  x={cx - (ux ? M(0.25) : M(lane / 2))} y={cy - (uy ? M(0.25) : M(lane / 2))}
                  width={ux ? M(0.5) : M(lane)} height={uy ? M(0.5) : M(lane)}
                  fill="#c9ccd1" opacity={0.75} />
              );
            }))}
          {world.actors.map((a) => {
            const p = poseOf(world, a);
            if (Math.abs(p.x - at.x) > HALF + 8 || Math.abs(p.y - at.y) > HALF + 8) return null;
            const mine = them && a.id === them.id;
            const hard = a.a < -0.5, held = a.v < 0.3;
            return (
              <g key={a.id} transform={`translate(${M(p.x)} ${M(p.y)}) rotate(${p.rot})`}>
                <rect x={-M(CAR.length) / 2} y={-M(CAR.width) / 2}
                  width={M(CAR.length)} height={M(CAR.width)} rx={M(0.3)}
                  fill={mine ? C.amber : hard ? "#8a4b4b" : held ? "#4a5058" : "#5a616b"}
                  stroke={mine ? C.white : "#12151a"} strokeWidth={M(mine ? 0.22 : 0.1)} />
                <rect x={M(CAR.length) / 2 - M(0.5)} y={-M(CAR.width) / 2}
                  width={M(0.5)} height={M(CAR.width)} fill="#12151a" opacity={0.55} />
              </g>
            );
          })}
        </svg>
      </div>

      <div style={S.panel}>
        <div style={S.row}>
          <button className="btn" style={S.btn} onClick={() => setPlaying((p) => !p)}>
            {playing ? <Pause size={16} /> : <Play size={16} />}
          </button>
          <button className="btn" style={S.btn} onClick={() => restart(seed + 1)}>
            <RotateCcw size={16} />
          </button>
          <button className="btn" style={{ ...S.btn, width: "auto", padding: "0 12px", gap: 6 }}
            onClick={pickOne}>
            <Crosshair size={16} />
            <span style={{ fontFamily: FONT_D, fontSize: 13 }}>another car</span>
          </button>
          {SIZES.map((n) => (
            <button key={n} className="btn" style={{
              ...S.chip,
              borderColor: size === n ? C.blue : "rgba(255,255,255,0.12)",
              color: size === n ? C.white : C.dim,
            }} onClick={() => restart(seed, kind, n)}>{n}</button>
          ))}
          {CONTROLS.map((c) => (
            <button key={c.id} className="btn" style={{
              ...S.chip,
              borderColor: kind === c.id ? C.green : "rgba(255,255,255,0.12)",
              color: kind === c.id ? C.white : C.dim,
            }} onClick={() => restart(seed, c.id)}>{c.label}</button>
          ))}
        </div>

        <div style={S.row}>
          <span style={S.readout}>
            {world.t.toFixed(0)}s · {world.actors.length} cars ·{" "}
            {them ? `watching ${them.id}, at intersection ${crossed + 1} of ${course.n}` : "nobody picked"}
            {(world.turnedAway ?? 0) > 0 && ` · ${world.turnedAway} turned away`}
            {touching > 0 && <b style={{ color: C.red }}> · {touching} TOUCHING</b>}
          </span>
        </div>

        <div style={S.note}>
          The amber car is one particular car. Watch it clear an
          intersection, drive the street, and arrive at the next one — it
          is the same car the whole way, keeping its speed, its place in
          the queue and whoever it was following. Until this stage every
          car was created at the far end of an approach and destroyed at
          the far end of its exit, so the traffic at one intersection had
          nothing to do with the traffic at the next.
          <br />
          <b>Nothing here is new geometry.</b> The exit of one
          intersection and the approach of the next are the same piece of
          road, so placing them a reach apart makes the paths meet
          exactly — same metre, same lane, same heading. The link is the
          two approaches back to back, which at 60 km/h is about 560m: a
          city block, and it is that long because an approach has to hold
          the biggest gap any driver could ask for.
          <br />
          That road is <b>where most of the marking will happen</b>.
          Steering, braking and pace all read while a car is driving;
          only judging a gap needs the intersection.
        </div>
      </div>
    </div>
  );
}

const S = {
  page: { minHeight: "100dvh", display: "flex", flexDirection: "column", background: C.bg, color: C.text },
  head: { padding: "10px 12px 6px", display: "flex", flexDirection: "column", gap: 2 },
  title: { fontFamily: FONT_D, fontSize: 18, color: C.white },
  sub: { fontFamily: FONT_U, fontSize: 12, color: C.dim },
  map: { height: 64, margin: "0 6px 6px", overflow: "hidden", borderRadius: 6 },
  close: { height: "40dvh", minHeight: 200, margin: "0 6px", overflow: "hidden", borderRadius: 6 },
  panel: { padding: 10, display: "flex", flexDirection: "column", gap: 8 },
  row: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" },
  btn: {
    minWidth: 44, minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center",
    background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 10, color: C.text, cursor: "pointer",
  },
  chip: {
    minWidth: 48, minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center",
    background: "rgba(255,255,255,0.05)", border: "1px solid", borderRadius: 10,
    fontFamily: FONT_D, fontSize: 14, cursor: "pointer",
  },
  readout: { fontFamily: FONT_D, fontSize: 13, color: C.dim },
  note: { fontFamily: FONT_U, fontSize: 12, color: C.dim, lineHeight: 1.45 },
};
