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
import { Play, Pause, RotateCcw, Crosshair, Flag } from "lucide-react";
import { C, FONT_D, FONT_U } from "../theme.js";
import {
  seedCourse, step, poseOf, overlapping, CAR, M, DT, ALL_WAY, TWO_WAY,
} from "../sim/crossing.js";
import { walkRoute, poseOn, roadsOf } from "../sim/course.js";
import { chaseOn, LOOK_AHEAD } from "../frame.js";
import RoadStrip from "./RoadStrip.jsx";
import {
  withCandidates, keepDriving, PROFILES, toTell, tell,
} from "../sim/candidate.js";
import { noticing, mark, sheetFor, sectionDone, SECTION } from "../sim/marking.js";
import { summarise } from "../engine/detect.js";

const CONTROLS = [
  { id: "two", label: "Two-way", control: TWO_WAY },
  { id: "all", label: "All-way", control: ALL_WAY },
];
/* A ROW CANNOT HOLD A ROUTE. Every turn off it leaves the world, so the
   only drive expressible is a straight line -- which is why the grid
   exists and why it is the default here. The row is kept because it is
   the clearest possible view of the one thing stage 3's first increment
   established: a car crossing a boundary as the same car. */
const SIZES = [
  { id: "row", label: "2 in a row", cols: 2, rows: 1 },
  { id: "grid", label: "3 × 2", cols: 3, rows: 2 },
];
const EVERY = 2.6;
const LIMIT = 60;
/* WHAT SHARE OF THE LINKS BEND. A content decision rather than a
   physical one: some straight, some bent, so the course has more than
   one kind of road on it and the two can be compared on one drive. Each
   bend is as tight as a road at this speed is allowed to be. */
const BENDS = 0.6;

/* A polyline in metres, as SVG points. */
const ptsOf = (pts) => pts.map((p) => `${M(p.x)},${M(p.y)}`).join(" ");

/* How much road the FIXED view holds. Kept alongside the chase view so
   the two can be compared rather than argued about. */
const HALF = 26;

/* TWO WAYS OF WATCHING ONE DRIVER, and the difference is not zoom.

   The fixed view slides with the candidate and stays square to the
   world. It is the scaffolding stage 2 needed to get them on screen at
   all.

   The chase view is the old engine's `chaseOn`, unchanged, pointed at a
   pose in world coordinates -- which is what it was split out of
   `chaseFor` to allow, for exactly this case. It TURNS with the car, so
   the candidate's straight-ahead always draws upward, and it is sized as
   a DURATION of road ahead rather than a distance.

   AND IT RIDES THE INTENDED POSE RATHER THAN THE REAL ONE, which is the
   whole design and not an implementation detail. Lock a camera to where
   the car actually is and the car sits dead centre and perfectly
   straight forever while the WORLD wobbles around it -- every steering
   fault vanishing at exactly the moment it happens. Riding the clean
   pose means the car is drawn at its real position and its deviation
   from the centre of frame is a real quantity.

   IT DOES NOT MAKE THE WEAVE VISIBLE, AND CLAIMING IT DID WAS WRONG.
   Measured, on a 375px phone panel: a 0.38m stray is 0.68px at the 10s
   look-ahead, 1.71px at 4s, and 2.74px in the 52m fixed view. The chase
   view is the LEAST legible of the three for lane-keeping, because it is
   the widest -- and widening it is the thing Jay asked for on other
   grounds.

   So the deviation is reported as a NUMBER rather than left to the eye.
   That is information; magnifying it on screen would be a lie about how
   far off line the car is.

   What the chase view is actually for, both of which are real:
     - it TURNS with the car, so the candidate's straight-ahead is always
       one screen direction. That is what a gaze cone held in degrees off
       the car's heading needs, and it is why relative gaze was the right
       call in the old engine.
     - it is a DURATION of road rather than a distance, so a faster road
       shows further ahead. "The traffic looks great at 100kmh" is the
       maintainer on exactly that, and it is the argument for the longer
       look-ahead rather than the shorter. */
const VIEWS = [
  { id: "chase", label: "Chase" },
  { id: "fixed", label: "Fixed" },
];

const seedWorld = (seed, kind, size, profile = "sound", bends = true) => {
  const z = SIZES.find((x) => x.id === size);
  return withCandidates(
    seedCourse(seed, LIMIT, {
      every: EVERY, control: CONTROLS.find((c) => c.id === kind).control,
      cols: z.cols, rows: z.rows, bends: bends ? BENDS : 0,
    }),
    [{ id: "them", profile }],
  );
};

export default function SimCourse() {
  const [seed, setSeed] = useState(1);
  const [kind, setKind] = useState("two");
  const [size, setSize] = useState("grid");
  const [look, setLook] = useState("chase");
  const [who, setWho] = useState("sound");
  const [bends, setBends] = useState(true);
  const [playing, setPlaying] = useState(true);
  const [world, setWorld] = useState(() => seedWorld(1, "two", "grid", "sound", true));

  /* THE SECTION BEING TRACKED, AND THE SHEETS SO FAR. Marking is
     DEFERRED: nothing is graded until a section fills or the drive ends,
     which is what makes the job memory as well as attention. */
  const [section, setSection] = useState({ trip: -1, from: 1 });
  const [sheets, setSheets] = useState([]);
  useEffect(() => {
    const done = section.trip >= 0 && sectionDone(world, "them", section.from, section.trip);
    if (done) {
      const sheet = sheetFor(world, "them", { from: section.from, trip: done.trip });
      if (sheet) setSheets((all) => [sheet, ...all].slice(0, 6));
      setSection(done.ended ? { trip: -1, from: 1 } : { ...section, from: section.from + SECTION });
      return;
    }
    const a = world.actors.find((x) => x.candidate === "them");
    if (a && a.trip !== section.trip) setSection({ trip: a.trip, from: 1 });
  }, [world]);

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
            for (let i = 0; i < n; i++) next = noticing(keepDriving(step(next)));
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

  const restart = (s = seed, k = kind, n = size, p = who, b = bends) => {
    setSeed(s); setKind(k); setSize(n); setWho(p); setBends(b);
    setWorld(seedWorld(s, k, n, p, b));
    setSection({ trip: -1, from: 1 });
    setSheets([]);
    owed.current = 0;
  };
  const markIt = () => setWorld((w) => mark(w, "them"));

  const course = world.course;
  const roads = roadsOf(course);

  /* THE CANDIDATE, and nobody else. Watching a random car proved the
     first half of this stage -- that a car crossing a boundary is the
     same car -- and the second half needs somebody with somewhere to be.
     They are driving a route now: a sequence of intersections and what to
     do at each, decided before they set off. */
  const them = world.actors.find((a) => a.candidate === "them") ?? null;
  const told = them
    ? walkRoute(course, { from: { k: them.k, side: them.route.split("/")[0] }, plan: them.plan ?? [] })
    : [];

  const at = them ? poseOf(world, them) : { x: course.at[course.n - 1].at.x / 2, y: 0 };

  /* THE CAMERA RIDES THE CLEAN POSE. `poseOn` is the path without the
     weave on it; `poseOf` is where the car really is. The gap between
     them is the steering fault, and pointing the camera at the second
     would hide it. */
  const clean = them ? poseOn(course, them.k, them.route, them.s) : { ...at, rot: 0 };
  /* THE DRIVER'S WANTED SPEED, NEVER THEIR CURRENT ONE. The frame is a
     duration of road, and reading it against the instantaneous speed
     would collapse the view to nothing at a stop line and heave it open
     again on the pull-away. */
  const chase = chaseOn(
    { x: M(clean.x), y: M(clean.y), rot: clean.rot },
    M(them ? them.v0 : course.speed),
    { lookAhead: LOOK_AHEAD },
  );
  /* HOW FAR OFF THE LINE THEY ARE, RIGHT NOW. The gap between where the
     car is and where it was supposed to be -- which is the steering
     fault, stated rather than drawn, because at this zoom it is under a
     pixel. */
  const drift = them ? Math.hypot(at.x - clean.x, at.y - clean.y) : 0;

  /* WHAT CAN STILL BE SAID. Three intersections, because stacking only
     exists from a distance of two: an instruction for the very next one
     is discharged the moment they arrive, so it never makes them carry
     anything. */
  const ahead = them ? toTell(world, "them", 3) : [];
  const say = (at, intent) => setWorld((w) => tell(w, "them", at, intent));
  const touching = overlapping(world).length;
  const done = them ? (them.leg ?? 0) : 0;

  return (
    <div style={S.page}>
      <div style={S.head}>
        <span style={S.title}>Stage 3 — a course, and a route through it</span>
        <span style={S.sub}>
          the candidate has somewhere to be, and the car that leaves one
          intersection is the car that arrives at the next.
        </span>
      </div>

      {/* THE STRIP: the whole course at once. Its own component now,
          because the maintainer wants it reused -- "something we can use
          later on to display things to the user along the road" -- and
          the `marks` prop is that. See RoadStrip.jsx. */}
      <RoadStrip
        course={course}
        cars={world.actors.map((a) => {
          const p = poseOf(world, a);
          return { id: a.id, x: p.x, y: p.y, mine: them && a.id === them.id, still: a.v < 0.3 };
        })}
        route={told.map((leg, i) => ({ k: leg.k, reached: i <= done }))}
        view={them ? { x: at.x, y: at.y, half: HALF } : null}
      />

      {/* THE EVIDENCE. One car, close enough to see what it is doing. */}
      <div style={S.close}>
        <svg
          viewBox={look === "chase"
            ? chase.box
            : `${M(at.x - HALF)} ${M(at.y - HALF)} ${M(HALF * 2)} ${M(HALF * 2)}`}
          style={{ width: "100%", height: "100%", display: "block" }}
          preserveAspectRatio="xMidYMid slice">
          {/* The ground is drawn OUTSIDE the rotation, so it fills the
              frame at every angle. Whatever the camera can reveal has to
              have been drawn, and a rotating square sweeps its own
              diagonal. */}
          <rect x={chase.cx - chase.ahead - chase.behind} y={chase.cy - chase.ahead - chase.behind}
            width={(chase.ahead + chase.behind) * 2} height={(chase.ahead + chase.behind) * 2}
            fill="#22262c" />
          <g transform={look === "chase" ? `rotate(${chase.rotate} ${chase.cx} ${chase.cy})` : undefined}>
            {/* THE ROAD IS DRAWN FROM THE PATH, not from a rectangle that
                happens to agree with it while it is straight. A stroke
                along each road's axis, and the centre line as a dash along
                the same axis -- so a bend the engine produces is a bend
                the screen shows, which is the rule this stage's first
                section was written under. The box is the one rectangle
                left, because it is one. */}
            {roads.map((road, i) => (
              <polyline key={"road" + i} points={ptsOf(road.pts)} fill="none"
                stroke="#2c3037" strokeWidth={M(7.2)} strokeLinejoin="round" strokeLinecap="butt" />
            ))}
            {roads.map((road, i) => (
              <polyline key={"line" + i} points={ptsOf(road.pts)} fill="none"
                stroke="#7a6a3a" strokeWidth={M(0.15)} strokeDasharray={`${M(3)} ${M(3)}`} />
            ))}
            {course.at.map((spot) => (
              <rect key={"gap" + spot.k} x={M(spot.at.x - 3.6)} y={M(spot.at.y - 3.6)}
                width={M(7.2)} height={M(7.2)} fill="#2c3037" />
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
              if (Math.abs(p.x - clean.x) > 220 || Math.abs(p.y - clean.y) > 220) return null;
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
          </g>
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
            onClick={() => restart(seed + 1)}>
            <Crosshair size={16} />
            <span style={{ fontFamily: FONT_D, fontSize: 13 }}>another route</span>
          </button>
          {VIEWS.map((v) => (
            <button key={v.id} className="btn" style={{
              ...S.chip, minWidth: 0, padding: "0 10px",
              borderColor: look === v.id ? C.amber : "rgba(255,255,255,0.12)",
              color: look === v.id ? C.white : C.dim,
            }} onClick={() => setLook(v.id)}>{v.label}</button>
          ))}
          {SIZES.map((z) => (
            <button key={z.id} className="btn" style={{
              ...S.chip, minWidth: 0, padding: "0 10px",
              borderColor: size === z.id ? C.blue : "rgba(255,255,255,0.12)",
              color: size === z.id ? C.white : C.dim,
            }} onClick={() => restart(seed, kind, z.id)}>{z.label}</button>
          ))}
          {CONTROLS.map((c) => (
            <button key={c.id} className="btn" style={{
              ...S.chip,
              borderColor: kind === c.id ? C.green : "rgba(255,255,255,0.12)",
              color: kind === c.id ? C.white : C.dim,
            }} onClick={() => restart(seed, c.id)}>{c.label}</button>
          ))}
          {/* BENDS ON OR OFF, so a bend can be compared with the straight
              road it replaced on the same seed. */}
          <button className="btn" style={{
            ...S.chip,
            borderColor: bends ? C.amber : "rgba(255,255,255,0.12)",
            color: bends ? C.white : C.dim,
          }} onClick={() => restart(seed, kind, size, who, !bends)}>{bends ? "Bends" : "Straight"}</button>
        </div>

        {/* THE MARK. Say "that" -- when, and at which intersection. What
            it was is the maintainer's open question and is not asked. */}
        <div style={S.row}>
          <button className="btn" style={{ ...S.btn, width: "auto", padding: "0 16px", gap: 8, borderColor: C.red }}
            onClick={markIt}>
            <Flag size={16} />
            <span style={{ fontFamily: FONT_D, fontSize: 14 }}>Mark that</span>
          </button>
          <span style={S.readout}>
            {(world.marks ?? []).filter((m) => m.who === "them" && m.trip === (them?.trip ?? -1)).length} marked this drive
            {" · "}sheet after {SECTION} intersections
          </span>
        </div>

        {/* THE DIRECTIONS. One of the examiner's four jobs, and the
            first the rebuild can do. Say nothing and they carry straight
            on -- which is what makes a LATE instruction a missed turn
            rather than a pause. */}
        {ahead.map((slot, i) => (
          <div key={slot.at} style={S.row}>
            <span style={{ ...S.readout, width: 74 }}>
              {["at the next", "then", "after that"][i]}
            </span>
            {[["left", "Left"], ["straight", "Straight on"], ["right", "Right"]].map(([id, label]) => (
              <button key={id} className="btn" style={{
                ...S.chip, minWidth: 0, padding: "0 10px", minHeight: 38, fontSize: 13,
                borderColor: slot.told === id ? C.green : "rgba(255,255,255,0.12)",
                color: slot.told === id ? C.white : C.dim,
              }} onClick={() => say(slot.at, id)}>{label}</button>
            ))}
            {slot.told === null && (
              <span style={{ ...S.readout, fontSize: 11, opacity: 0.6 }}>
                nothing said
              </span>
            )}
          </div>
        ))}

        <div style={S.row}>
          <span style={S.readout}>Candidate</span>
          {PROFILES.map((pr) => (
            <button key={pr.id} className="btn" style={{
              ...S.chip, minWidth: 0, padding: "0 10px", minHeight: 38, fontSize: 13,
              borderColor: who === pr.id ? C.amber : "rgba(255,255,255,0.12)",
              color: who === pr.id ? C.white : C.dim,
            }} onClick={() => restart(seed, kind, size, pr.id)}>{pr.name}</button>
          ))}
        </div>

        <div style={S.row}>
          <span style={S.readout}>
            {world.t.toFixed(0)}s · {world.actors.length} cars ·{" "}
            {them
              ? `intersection ${done + 1} of ${told.length}` +
                (them.plan?.filter(Boolean).length ? ` · told ${them.plan.filter(Boolean).length} so far` : " · told nothing yet") +
                ` · ${drift.toFixed(2)}m off line`
              : "the candidate is joining"}
            {(world.turnedAway ?? 0) > 0 && ` · ${world.turnedAway} turned away`}
            {touching > 0 && <b style={{ color: C.red }}> · {touching} TOUCHING</b>}
          </span>
        </div>

        {/* THE SHEET. What you recorded against what actually happened,
            one section at a time, most recent first. */}
        {sheets.map((sheet, i) => (
          <div key={`${sheet.trip}-${sheet.from}`} style={S.sheet}>
            <div style={S.sheetHead}>
              <span>drive {sheet.trip + 1}, intersections {sheet.from}–{sheet.upTo - 1}</span>
              <b style={{ color: sheet.result.score >= 70 ? C.green : sheet.result.score >= 40 ? C.amber : C.red }}>
                {sheet.result.score}
              </b>
            </div>
            <div>{summarise(sheet.result)}</div>
            {sheet.result.missed.map((f, j) => (
              <div key={"m" + j} style={{ color: C.amber }}>
                missed: {f.trait} at intersection {f.intersection}, {(f.to - f.from).toFixed(1)}s long
              </div>
            ))}
            {sheet.result.hits.map((h, j) => (
              <div key={"h" + j} style={{ color: C.green }}>
                caught: {h.fault.trait} at intersection {h.fault.intersection}
                {h.value < 1 ? " (late)" : ""}
              </div>
            ))}
            <div style={{ marginTop: 4 }}>
              directions:{" "}
              {sheet.calls.map((c) => (
                <span key={c.intersection} style={{ marginRight: 8,
                  color: c.blame === "examiner" && c.followed !== c.wanted ? C.red : c.wrongTurn ? C.red : C.dim }}>
                  {c.intersection}:{c.wanted}
                  {c.said === null ? " (nothing said)" : c.said !== c.wanted ? ` (said ${c.said})` : ""}
                  {c.verdict === "late" ? " late" : c.verdict === "stacked" ? " early" : ""}
                </span>
              ))}
              {sheet.directionsOnYou > 0 && <b style={{ color: C.red }}> · {sheet.directionsOnYou} on you</b>}
            </div>
          </div>
        ))}

        <div style={S.note}>
          The amber car is the candidate, and <b>they only know what
          you have told them</b>. Say nothing and they carry straight on;
          the rings on the map are where that takes them, and they move
          as you give instructions. Tell them late — after they have
          already reached the intersection — and the button does nothing,
          because by then they have made the turn or not made it. That is
          the interlock the whole design rests on: being busy with one job
          makes you late with another, and the error that follows is
          <i> yours</i> rather than theirs.
          <br />
          Watch them clear an intersection, drive the street, and arrive
          at the next one: it is the same car the whole way, keeping its
          speed, its place in the queue and whoever it was following.
          Until this stage every car was created at the far end of an
          approach and destroyed at the far end of its exit, so the
          traffic at one intersection had nothing to do with the traffic
          at the next.
          <br />
          <b>Mark what you see, and settle up later.</b> Press the flag
          when the candidate does something wrong; the sheet comes after
          every three intersections, or when the drive ends, and it grades
          <i> you</i> — what you caught, what you missed, what you called
          that never happened, and which directions you gave too late. The
          candidate's rolling stops, undue delays and abrupt braking are on
          it, and so is a wide line on a bend. Lane-keeping on a straight
          is not: the most a driver here can stray there is exactly the
          old engine's threshold for a fault anybody could see, and a fault
          that cannot be seen is not one you missed.
          <br />
          <b>The road bends, and the bend is where steering shows.</b>
          Some links bow sideways and come back parallel — as tightly as a
          road at this speed is allowed to, 189m at 60 km/h — and the road
          is drawn from the path the cars follow rather than from a
          rectangle. A driver who cannot hold a line weaves on the straight
          and runs wide on the bend, toward the centre line on a right-hand
          bend and no further than it; the two together are visible where
          the weave alone never was, and that is the <i>wide line</i> on
          the sheet. <b>Bends</b> switches them off for the same seed, so
          the straight road it replaced is one press away.
          <br />
          <b>Nothing here is new geometry.</b> The exit of one
          intersection and the approach of the next are the same piece of
          road, so placing them a reach apart makes the paths meet
          exactly — same metre, same lane, same heading. The link is the
          two approaches back to back, which at 60 km/h is about 560m: a
          city block, and it is that long because an approach has to hold
          the biggest gap any driver could ask for. The same rule places
          the north-south roads, so a grid costs nothing a row did not.
          <br />
          <b>A row cannot hold a route.</b> Every turn off it leaves the
          world, so the only drive expressible is a straight line — which
          is a corridor rather than a course, and no instruction given on
          it could ever be wrong.
          <br />
          <b>Chase</b> turns with the candidate, so their straight-ahead
          always draws upward, and it is sized as ten seconds of road
          rather than as a distance — so a faster road shows further
          ahead. It rides where the car was <i>supposed</i> to be rather
          than where it is, which is what stops a wandering driver reading
          as a wobbling camera.
          <br />
          It does <b>not</b> make the wandering visible, and it is worth
          being plain about that: 0.38m of stray is under a pixel at this
          width, against about three in the fixed view. The number beside
          the readout is the honest way to show it — drawing it larger
          would be a lie about how far off line the car is. Reading
          lane-keeping by eye wants a closer view than reading the road
          ahead does, and no single width does both.
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
  sheet: {
    fontFamily: FONT_D, fontSize: 12, color: C.text, lineHeight: 1.5,
    padding: "8px 10px", borderRadius: 8, background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.10)",
  },
  sheetHead: { display: "flex", justifyContent: "space-between", fontSize: 13, color: C.white },
};
