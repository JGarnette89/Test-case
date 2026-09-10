/* =====================================================================
   STAGE 0 OF THE REBUILD, on screen.

   Six cars on one road, following each other. That is the whole of it.
   There is no candidate, no intersection, nothing to mark and nothing to
   score, and none of those are missing by oversight -- see REBUILD.md
   section 6. The deliverable of this stage is an OPINION: does traffic
   that queues, closes up and spreads out read as alive?

   A SCREEN'S FIRST RENDER MUST ALREADY HAVE A STATE. That convention was
   paid for: `ExaminerDrive` once rendered 98 characters of markup
   because its clock was state filled in by an effect, and effects do not
   run under SSR. So the world is seeded in the initialiser and the
   effect only ever advances it.
   ===================================================================== */
import React, { useEffect, useRef, useState } from "react";
import { Play, Pause, RotateCcw } from "lucide-react";
import { C, FONT_D, FONT_U } from "../theme.js";
import {
  seedTraffic, run, poseOf, ROAD, CAR, M, DT,
} from "../sim/traffic.js";

/* The viewBox is the road plus the ground either side, with s = 0 at the
   bottom. Everything the sim knows is in metres; this is the only place
   that becomes pixels.

   HOW MUCH GROUND IS A DRAWING DECISION, NOT A FACT ABOUT THE ROAD, so
   it lives here and not in `traffic.js`. It is chosen to match a phone
   held upright: a road is long and thin and a screen is tall and thin,
   and if the two do not agree the drawing letterboxes and most of the
   screen is empty -- which is the first thing the maintainer said about
   the current game. Measured at 375x812: the road was drawn 135px wide
   in a 375px pane before this. */
const ASPECT = 0.68;
const HALF_W = (ASPECT * ROAD.length) / 2;
const VIEW = {
  x: -M(HALF_W), y: -M(ROAD.length), w: M(HALF_W * 2), h: M(ROAD.length),
};

export default function SimRoad() {
  const [seed, setSeed] = useState(1);
  const [world, setWorld] = useState(() => seedTraffic(1));
  const [playing, setPlaying] = useState(true);

  /* A fixed timestep with an accumulator, so the simulation advances by
     exactly DT whatever the frame rate does. A variable step would make
     the result depend on the machine, and determinism is the thing this
     rebuild is not going to retrofit later. */
  const raf = useRef(0), last = useRef(0), owed = useRef(0);
  useEffect(() => {
    if (!playing) return;
    last.current = 0;
    const tick = (now) => {
      if (last.current) {
        /* Clamped: a backgrounded tab must not owe us four thousand
           ticks on the first frame back. */
        owed.current += Math.min(0.25, (now - last.current) / 1000);
        const n = Math.floor(owed.current / DT);
        if (n > 0) {
          owed.current -= n * DT;
          setWorld((w) => run(w, n));
        }
      }
      last.current = now;
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [playing]);

  const restart = (s) => {
    setSeed(s);
    setWorld(seedTraffic(s));
    owed.current = 0;
  };

  const lane = M(ROAD.laneWidth * ROAD.lanes) / 2;

  return (
    <div style={S.page}>
      <div style={S.head}>
        <span style={S.title}>Stage 0 — cars that follow each other</span>
        <span style={S.sub}>
          one road at {Math.round(ROAD.speed * 3.6)} km/h, following distance.
          Nothing else yet.
        </span>
      </div>

      <div style={S.canvas}>
        <svg viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`}
          style={{ width: "100%", height: "100%", display: "block" }}
          preserveAspectRatio="xMidYMid meet">
          {/* The ground either side, so the road is a road rather than a
              strip floating on nothing. */}
          <rect x={VIEW.x} y={VIEW.y} width={VIEW.w} height={VIEW.h} fill="#22262c" />
          <rect x={-lane} y={VIEW.y} width={lane * 2} height={VIEW.h} fill="#2c3037" />
          {/* Edge lines, 0.15m as everywhere else in this project. */}
          <rect x={-lane} y={VIEW.y} width={M(0.15)} height={VIEW.h} fill="#5b6067" />
          <rect x={lane - M(0.15)} y={VIEW.y} width={M(0.15)} height={VIEW.h} fill="#5b6067" />
          {/* The centre line, dashed, so the oncoming lane reads as a lane
              rather than as spare road. Nothing uses it yet. */}
          <line x1={0} y1={VIEW.y} x2={0} y2={0} stroke="#7a6a3a" strokeWidth={M(0.15)}
            strokeDasharray={`${M(3)} ${M(3)}`} />

          {world.actors.map((a) => {
            const p = poseOf(a);
            /* Braking reads as red. It is the one piece of presentation
               here and it earns its place: without it you cannot see
               WHY a car closed up, only that it did. */
            const hard = a.a < -0.5;
            return (
              <g key={a.id} transform={`translate(${M(p.x)} ${M(p.y)})`}>
                <rect
                  x={-M(CAR.width) / 2} y={-M(CAR.length) / 2}
                  width={M(CAR.width)} height={M(CAR.length)}
                  rx={M(0.3)}
                  fill={hard ? "#8a4b4b" : "#5a616b"}
                  stroke="#12151a" strokeWidth={M(0.1)} />
                {/* Which way it is pointing. */}
                <rect
                  x={-M(CAR.width) / 2} y={-M(CAR.length) / 2}
                  width={M(CAR.width)} height={M(0.5)}
                  fill="#12151a" opacity={0.55} />
                {hard && (
                  <rect
                    x={-M(CAR.width) / 2} y={M(CAR.length) / 2 - M(0.4)}
                    width={M(CAR.width)} height={M(0.4)}
                    fill={C.red} />
                )}
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
          <span style={S.readout}>
            {world.t.toFixed(1)}s · seed {seed} ·{" "}
            {world.actors.map((a) => (a.v * 3.6).toFixed(0)).join(" ")} km/h
          </span>
        </div>
        <div style={S.note}>
          Most drivers sit near the limit and a few are badly slow or badly
          quick, so the slow ones gather a queue behind them. Watch what the
          cars behind do about it — close up, hold a gap, and open out again
          once the road clears. Red is braking.
        </div>
      </div>
    </div>
  );
}

const S = {
  /* THE CANVAS GETS AN EXPLICIT HEIGHT, and that is not a style choice.
     `flex: 1` inside a column whose own height resolves to `auto` gives
     the child its CONTENT height, and an SVG asked for `height: 100%` of
     an auto-height parent falls back to sizing itself from its viewBox
     aspect ratio. For a road 80m long and 24m wide that is a box four
     times taller than the screen. Measured here before it shipped: the
     road SVG came back 0 x 0.

     This is the third time this project has had a screen that mounts
     correctly and shows nothing, so: give the box a height, in a unit
     the viewport actually has. */
  page: {
    minHeight: "100dvh", display: "flex", flexDirection: "column",
    background: C.bg, color: C.text,
  },
  head: { padding: "10px 12px 6px", display: "flex", flexDirection: "column", gap: 2 },
  title: { fontFamily: FONT_D, fontSize: 18, color: C.white },
  sub: { fontFamily: FONT_U, fontSize: 12, color: C.dim },
  canvas: {
    height: "68dvh", minHeight: 300, position: "relative", overflow: "hidden",
  },
  panel: { padding: 10, display: "flex", flexDirection: "column", gap: 8 },
  row: { display: "flex", gap: 8, alignItems: "center" },
  btn: {
    minWidth: 44, minHeight: 44, display: "flex", alignItems: "center",
    justifyContent: "center", background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10,
    color: C.text, cursor: "pointer",
  },
  readout: { fontFamily: FONT_D, fontSize: 13, color: C.dim },
  note: { fontFamily: FONT_U, fontSize: 12, color: C.dim, lineHeight: 1.45 },
};
