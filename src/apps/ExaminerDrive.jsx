/* =====================================================================
   THE EXAMINER DRIVE — the first playable loop

   Everything built for the examiner flip has been machinery for a game
   nobody could play. This is the loop: a course of junctions, one
   candidate driving it, and three of the four jobs running at once.

     OBSERVE   the candidate drives; you watch.
     MARK      what you saw — but on a SHEET at the end of the section,
               not the instant you see it. Deferred marking is what makes
               the job memory as well as attention.
     DIRECT    the candidate only knows what you told them, and an
               instruction has a deadline rather than a window.

   INTERVENTION is the fourth and is not here: it is still an open
   question what an intervention IS, in law and on the sheet, and that is
   the maintainer's to settle rather than mine to guess.

   THE INTERLOCK IS THE POINT, and it is what no measurement could tell
   us. Giving directions early buys back your own attention for watching
   the candidate — an instruction given early can never be given late —
   and it costs the candidate their composure, because a loaded driver is
   a worse driver. You are trading your risk for theirs. directions.js
   measures that trade; this screen is where somebody finds out whether it
   is any good to play.
   ===================================================================== */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Play, Pause, RotateCcw, Flag, CornerUpLeft, CornerUpRight, ArrowUp, ClipboardList } from "lucide-react";
import { C, FONT_D, FONT_U } from "../theme.js";
import { simulate, poseAt, CAR_L, CAR_W, PED_R, M, CX, CY, STEP } from "../engine/index.js";
import { specOf } from "../engine/road.js";
import { faultsIn } from "../engine/faults.js";
import { whatEgoSees, faultSeenAt, sightBlockersOf } from "../engine/sight.js";
import { instructionWindow, runInFor, pressureOf, skillUnderPressure, loadCandidate } from "../engine/directions.js";
import { sectionSheet, summarise } from "../engine/detect.js";
import { composeCandidate } from "../engine/candidate.js";
import { composeDriver, AXES, deficitOf, dominantAxis } from "../engine/ratings.js";
import { planDrive, composeForTile, CHARACTER } from "../engine/tiles.js";
import { driveThroughTiles, candidateAt } from "../engine/world.js";
import { approachDecel } from "../engine/paths.js";
import { chaseOn } from "../frame.js";
import { environmentFor, scatter } from "../environments.js";
import { Road, Environment } from "./RightOfWayTiming.jsx";

const JUNCTIONS = 6;
/* Three to a section, from the recall band: a competent player can hold
   three or four faults, and at the measured ~1 per junction that is three
   junctions. Derived in verify-candidate.mjs rather than picked here. */
const PER_SECTION = 3;
const TAIL = 1.2;                       // beat after the candidate clears
/* The least run-in that always shows the candidate arriving: their own
   approach, cruise over comfortable braking. Each leg then starts at
   whichever is greater, this or the time its own instruction needs — see
   runInFor, because the deadline is not a constant and a fixed run-in
   left 15 junctions in 48 undirectable. */
const APPROACH = M(11.5) / approachDecel(M(11.5));

/* How far ahead you may call. Two, not one: an instruction for the very
   next junction is discharged the moment they arrive there, so it never
   makes them CARRY anything — held counts what is outstanding beyond the
   one being executed. Stacking only exists at a distance of two. */
const LOOK_SECONDS = 6;

const AHEAD = [0, 1, 2];

const INTENTS = [
  ["left", "Turn left", CornerUpLeft],
  ["straight", "Follow the road", ArrowUp],
  ["right", "Turn right", CornerUpRight],
];

export default function ExaminerDrive() {
  const [seed, setSeed] = useState(3);
  const [at, setAt] = useState(0);            // which junction
  /* Time within the leg, from zero. NOT the clock: the clock is
     -runIn + elapsed, because each leg starts as far back as its own
     instruction needs. Kept this way round so the first render already
     has a time — a `t` that begins null and is filled in by an effect
     draws nothing at all under SSR, which is how this screen shipped a
     98-character blank past everything except the smoke test. */
  const [elapsed, setElapsed] = useState(0);
  const [playing, setPlaying] = useState(true);
  /* How many seconds of road ahead the view holds. Fixed here, and the
     choice is NOT settled: 10s reads as anticipation and is too wide to
     spot a fault by on a phone, 4s reads a fault well and sees nothing
     coming. 6s is a middle the Examiner lab has on a slider so the
     question can actually be looked at. No control on this screen yet. */
  const look = LOOK_SECONDS;
  const [marks, setMarks] = useState([]);     // { at, junction }
  const [given, setGiven] = useState({});     // junction -> { at, intent }
  const [sheet, setSheet] = useState(null);
  /* How many instructions the candidate is carrying BEYOND the one they
     are executing — frozen when the leg begins rather than read per
     frame. Live, it would re-simulate the junction underneath them the
     instant you spoke, and the car would jump. Load lands on the driving
     done while holding it, which is the next leg onward. */
  const [held, setHeld] = useState(0);
  const [target, setTarget] = useState(0);    // which junction the buttons address
  const seen = useRef(new Map());             // fault key -> seconds on screen
  const shown = useRef(new Map());            // junction -> the window actually displayed

  /* The drive: one candidate, a planned course, composed once. The
     candidate is drawn from ratings and carries their weaknesses through
     every junction — that is the whole of driver identity, and it is what
     makes a habit something a player can find rather than an incident. */
  const drive = useMemo(() => {
    const candidate = { ...composeCandidate(seed * 7 + 3), ...composeDriver(seed * 11) };
    const plan = planDrive({ seed, length: JUNCTIONS, candidate });
    const tiles = [], made = [], intents = [];
    let since = 0;
    for (let i = 0; i < plan.length; i++) {
      const tile = plan[i].tile;
      const legTime = tile.runway / CHARACTER[tile.character].speed + 4;
      const { scn } = composeForTile(tile, since, (seed * 7919 + i * 104729) >>> 0, {
        legTime, candidate, at: { from: plan[i].entry, intent: plan[i].intent },
      });
      if (!scn) continue;
      since = faultsIn(scn).length ? 0 : since + legTime;
      /* THE TILE'S DECLARED ROAD AND THE COMPOSED JUNCTION'S ROAD
         DISAGREE -- 15 of 56 match, 0 of 13 for arterial -- and this is
         the moment CLAUDE.md said that would stop being latent, because
         a renderer is now consuming the world. The junction the candidate
         ACTUALLY DRIVES wins: laying the world out from the tile's
         declared spec would place roads that do not match the ones on
         screen. It also sidesteps the arterial-control question, which is
         a road-design call and not one to make in passing. */
      tiles.push({ ...tile, spec: specOf(scn) });
      made.push(scn);
      intents.push(plan[i].intent);
    }

    /* ONE COORDINATE SPACE. Every junction placed where it really is, with
       real road between them -- which is what world.js has always done and
       what this screen never called. Before it, each junction was drawn at
       the board centre and the candidate teleported 70-90m at every
       boundary onto new ground with every car and every tree replaced.
       Measured: nothing at all persisted across a boundary. */
    const world = driveThroughTiles({ tiles, legs: made, speed: M(11.5) });

    const legs = world.legs.map((placed, i) => {
      const runIn = runInFor(placed.sim, { floor: APPROACH });
      return {
        scn: placed.scn, sim: placed.sim, at: placed.junction.at,
        intent: intents[i], tile: tiles[i], runIn,
        window: instructionWindow(placed.sim, { legStartsAt: -runIn }),
        env: environmentFor(placed.scn.id),
      };
    });
    return { candidate, legs, world };
  }, [seed]);

  const leg = drive.legs[Math.min(at, drive.legs.length - 1)];

  /* WHERE THE CANDIDATE IS, ACROSS THE WHOLE DRIVE. One clock from zero,
     one position, and a `phase` that says whether they are at a junction
     or on the road between two. This is the continuity: the pose never
     jumps, so the camera that follows it never cuts. */
  const world = drive.world;
  const driveEnds = world.exits[world.exits.length - 1] ?? 0;
  const pose = useMemo(() => candidateAt(world, Math.min(elapsed, driveEnds)), [world, elapsed, driveEnds]);
  const t = pose.local ?? 0;                 // leg-local, which faults and windows speak

  const live = useMemo(() => {
    if (!leg) return null;
    /* Load is applied to the FAULT DERIVATION, which is what the sheet
       grades. The rendered path comes from the world, which is built once
       -- so at held > 0 the drawn drift understates the marked fault by
       the severity multiplier. Known, and the smallest thing that keeps
       the world from being rebuilt underneath a moving car. */
    const scn = loadCandidate(leg.scn, { held });
    const sim = simulate(scn);
    return {
      scn: leg.scn, sim: leg.sim,
      spec: specOf(leg.scn),
      statics: sightBlockersOf(leg.scn),
      faults: faultsIn(scn),
      runIn: leg.runIn,
      window: leg.window,
      env: leg.env,
      until: (leg.sim.ego.departAt ?? leg.sim.legalAt) + TAIL + 4,
    };
  }, [leg, held]);

  const view = useMemo(
    () => chaseOn(pose, M(11.5), { lookAhead: look }),
    [pose, look]
  );
  /* How far each junction's roads reach. Sized so neighbours MEET: the
     gaps are 53-72m, so anything less leaves the candidate driving over a
     void between them, which is the same failure as the ambulance in the
     void -- whatever the camera can reveal has to be drawn. */
  const reach = useMemo(() => {
    let widest = 0;
    for (let i = 0; i + 1 < drive.legs.length; i++) {
      const a = drive.legs[i].at, b = drive.legs[i + 1].at;
      widest = Math.max(widest, Math.hypot(b.x - a.x, b.y - a.y));
    }
    return Math.max(360, widest / 2 + M(12));
  }, [drive]);


  /* GRADE AGAINST THE DEADLINE THEY WERE SHOWN. Stacking writes skill,
     skill scales startDelay, startDelay moves departAt, and departAt is
     what the deadline is derived from — so a window recomputed at section
     close is not the one the player was racing. */
  useEffect(() => { if (live) shown.current.set(at, live.window); }, [live, at]);

  /* Clock. Advances the junction when the candidate is away and clear. */
  const raf = useRef(0), last = useRef(0), closed = useRef(false);
  useEffect(() => {
    if (!playing || sheet || !live) return;
    last.current = performance.now();
    /* ONE CLOCK FOR THE WHOLE DRIVE, not one per leg. The leg boundary
       stops being a clock event at all -- it is just the moment the
       candidate's position happens to be inside the next junction. */
    const end = driveEnds;
    const tick = (now) => {
      /* Clamped at BOTH ends. The ceiling is the familiar one — a
         backgrounded tab must not teleport the candidate through a
         junction on the first frame back. The floor is not: the baseline
         is set from performance.now() while `now` is rAF's own frame
         timestamp, and a stale frame delivered after a stall made those
         disagree by 8.96 SECONDS, running the clock backwards to a time
         before the leg began. Observed, not theorised. */
      const dt = Math.min(0.05, Math.max(0, (now - last.current) / 1000));
      last.current = now;
      setElapsed((x) => {
        const next = x + dt;
        if (next >= end) {
          // Once per drive. React may not have committed by the next frame.
          if (!closed.current) { closed.current = true; queueMicrotask(finishDrive); }
          return end;
        }
        return next;
      });
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  });

  /* What the screen actually showed, accumulated. The scorer may know
     only this: a fault the renderer hid must not be markable. */
  useEffect(() => {
    if (!live || sheet) return;
    for (const f of live.faults) {
      if (t < f.from || t > f.to) continue;
      const key = `${at}/${f.who}/${f.trait ?? f.kind}`;
      const v = faultSeenAt(live.sim, f, t, live.statics);
      if (v === "clear" || v === "partial") {
        seen.current.set(key, (seen.current.get(key) ?? 0) + STEP);
      }
    }
  });

  /* ARRIVING SOMEWHERE IS NOT A CLOCK EVENT ANY MORE. The candidate
     drives continuously and simply ends up at the next junction, so this
     watches their POSITION rather than counting down a per-leg timer. */
  useEffect(() => {
    const here = pose.junction ?? 0;
    if (here === at || sheet) return;
    if (here % PER_SECTION === 0 && here > 0) {
      setSheet(closeSection(here));
      setPlaying(false);
      return;
    }
    setAt(here);
    setTarget(here);
    setHeld(Object.keys(given).filter((k) => Number(k) > here).length);
  }, [pose.junction, at, sheet, given]);

  function finishDrive() {
    setSheet(closeSection(drive.legs.length));
    setPlaying(false);
  }

  /* THE SHEET. Deferred: everything the section produced, against
     everything the player called, scored in one go at the end. */
  function closeSection(upTo) {
    const from = Math.max(0, upTo - PER_SECTION);
    const legs = [];
    for (let i = from; i < upTo && i < drive.legs.length; i++) {
      legs.push({
        faults: faultsIn(drive.legs[i].scn),
        window: shown.current.get(i) ?? drive.legs[i].window,
        intent: drive.legs[i].intent,
      });
    }
    const sheet = sectionSheet({
      legs, from, given,
      marks: marks.filter((m) => m.junction >= from && m.junction < upTo),
      shownFor: (f) => seen.current.get(`${f.junction}/${f.who}/${f.trait ?? f.kind}`) ?? 0,
    });
    return { ...sheet, done: upTo >= drive.legs.length };
  }


  const restart = (s = seed) => {
    seed === s ? null : setSeed(s);
    setAt(0); setElapsed(0); setMarks([]); setGiven({}); setSheet(null);
    setHeld(0); setTarget(0);
    closed.current = false;
    seen.current = new Map();
    shown.current = new Map();
    setPlaying(true);
  };

  if (!live || !view) return <div style={S.page} />;

  const pressure = pressureOf(held);
  const skill = skillUnderPressure(1, pressure);
  /* The candidate is drawn at their WORLD pose, which is continuous, not
     at a per-leg one that restarts at every boundary. */
  const egoPose = pose;
  const sees = whatEgoSees(live.sim, t, 0, live.statics);

  /* Which junctions are close enough to be worth drawing. Culling by
     distance rather than by "the one we are at": on the road between two
     junctions BOTH are on screen, which is the entire point -- you watch
     the next one come to you instead of arriving in it. */
  const near = drive.legs
    .map((l, i) => ({ l, i, d: Math.hypot(l.at.x - view.cx, l.at.y - view.cy) }))
    .filter((x) => x.d < view.ahead + view.behind + reach)
    .sort((a, b) => b.d - a.d);
  const w = live.window;
  const late = t > w.deadline && !given[at];
  const section = Math.floor(at / PER_SECTION) + 1;

  /* An instruction for a junction they have not reached is given before
     that leg's window opens, which is what makes it STACKED rather than
     late — allowed, sometimes right, and paid for in their concentration
     instead of your mark. Recorded as a real lead: at the very least the
     rest of this leg has to run before that one starts, so the sheet is
     not grading a number nobody could have produced. */
  const callFor = (j, intent) => (j === at
    ? { at: +t.toFixed(2), intent }
    : { at: +(drive.legs[j].window.opensAt - Math.max(1, (world.arrivals[j] ?? 0) - elapsed)).toFixed(2), intent, ahead: true });

  return (
    <div style={S.page}>
      <div style={S.canvasWrap}>
        <svg viewBox={view.box} style={S.svg} preserveAspectRatio="xMidYMid meet">
          <g transform={`rotate(${view.rotate} ${view.cx} ${view.cy})`}>
            {/* Ground first, sized to the frame, so there is never a void
                under the candidate between two junctions. */}
            <rect
              x={view.cx - (view.ahead + view.behind)} y={view.cy - (view.ahead + view.behind)}
              width={(view.ahead + view.behind) * 2} height={(view.ahead + view.behind) * 2}
              fill={live.env.ground}
            />
            {/* EVERY NEARBY JUNCTION, each at the place it really is.
                Road and Environment are pinned to the board centre, so
                they are moved by transform rather than by changing them --
                the renderer needs no rewrite for the world to be one
                space. Furthest first, so the near one draws over it. */}
            {near.map(({ l, i }) => (
              <g key={i} transform={`translate(${l.at.x - CX} ${l.at.y - CY})`}>
                <Environment env={l.env} seed={i * 977 + 13} keepOut={[]} worldHalf={reach} />
                <Road control={l.scn.control} crossings={l.scn.crossings || []} spec={specOf(l.scn)} reach={reach} />
              </g>
            ))}
            {/* Traffic is drawn from the junction being driven. It does
                not yet persist across a boundary -- the cars at the next
                junction appear as it is reached. That is the next thing,
                and it is visible now only because the transit is. */}
            {live.sim.actors.map((a) => {
              const vis = sees[a.id] ?? "hidden";
              if (vis === "hidden") return null;
              return <Car key={a.id} p={a} pose={poseAt(a, t)} dim={vis === "partial"} />;
            })}
            <Car p={live.sim.ego} pose={egoPose} candidate />
            {live.statics.map((b, i) => (
              <rect key={i} x={b.pose.x - b.hl} y={b.pose.y - b.hw}
                width={b.hl * 2} height={b.hw * 2}
                transform={`rotate(${b.pose.rot} ${b.pose.x} ${b.pose.y})`}
                fill="#2c3038" stroke="#464c56" strokeWidth={2} />
            ))}
          </g>
        </svg>

        <div style={S.hud}>
          <span style={S.hudT}>Junction {at + 1}/{drive.legs.length}</span>
          <span style={S.hudDim}>Section {section}</span>
          <span style={S.hudDim}>{view.seconds.toFixed(0)}s of road</span>
          {held > 0 && <span style={{ ...S.hudDim, color: C.amber }}>{held} stacked</span>}
        </div>

        {/* The instruction, and the clock on it. Silence means straight
            on, so a late instruction is a missed turn rather than a
            pause — and it is the EXAMINER's fault, never the driver's. */}
        <div style={{ ...S.callout, borderColor: given[at] ? C.green : late ? C.red : C.amber }}>
          {given[at] ? (
            <span style={{ color: C.green }}>
              “{phraseOf(given[at].intent)}” — {given[at].ahead ? "called ahead" : `given at ${given[at].at.toFixed(1)}s`}
            </span>
          ) : late ? (
            <span style={{ color: C.red }}>Too late to be followed — that one is yours</span>
          ) : (
            <span style={{ color: C.dim }}>
              tell them within <b style={{ color: C.amber }}>{Math.max(0, w.deadline - t).toFixed(1)}s</b>
            </span>
          )}
        </div>
      </div>

      <div style={S.panel}>
        {/* WHICH junction you are directing. Calling ahead is the trade the
            whole design rests on: an instruction given early can never be
            given late, and it buys your attention back for watching — at
            the cost of a driver carrying more than one thing at once. */}
        <div style={S.row}>
          {AHEAD.map((d) => {
            const j = at + d;
            if (j >= drive.legs.length) return null;
            return (
              <button key={d} className="btn" style={{
                ...S.chip,
                borderColor: target === j ? C.blue : "rgba(255,255,255,0.12)",
                color: given[j] ? C.green : target === j ? C.white : C.dim,
              }} onClick={() => setTarget(j)}>
                {d === 0 ? "This one" : `Junction ${j + 1}`}{given[j] ? " ✓" : ""}
              </button>
            );
          })}
        </div>

        <div style={S.row}>
          {INTENTS.map(([id, label, Icon]) => (
            <button key={id} className="btn" style={{
              ...S.dirBtn,
              borderColor: given[target]?.intent === id ? C.green : "rgba(255,255,255,0.12)",
              opacity: given[target] ? 0.45 : 1,
            }} disabled={Boolean(given[target])}
              onClick={() => {
                setGiven((g) => ({ ...g, [target]: callFor(target, id) }));
                setTarget(at);          // back to the pressing one
              }}>
              <Icon size={16} /> {label}
            </button>
          ))}
        </div>

        <div style={S.row}>
          <button className="btn" style={{ ...S.mark }}
            onClick={() => setMarks((m) => [...m, { at: +t.toFixed(2), junction: at }])}>
            <Flag size={15} /> Mark a fault
          </button>
          <button className="btn" style={S.btn} onClick={() => setPlaying((p) => !p)}>
            {playing ? <Pause size={16} /> : <Play size={16} />}
          </button>
          <button className="btn" style={S.btn} onClick={() => restart(seed + 1)}><RotateCcw size={16} /></button>
        </div>

        <div style={S.meterRow}>
          <Meter label="Their composure" v={skill} colour={skill > 0.7 ? C.green : C.amber} />
          <div style={S.note}>
            {marks.filter((m) => m.junction === at).length} called here ·
            {" "}{held
              ? `${held} still in the air — a loaded driver is a worse driver`
              : "nothing in the air"}
          </div>
        </div>
      </div>

      {sheet && <Sheet sheet={sheet} drive={drive} onNext={() => {
        if (sheet.done) { restart(seed + 1); return; }
        setSheet(null);
        setAt(sheet.upTo);
        setTarget(sheet.upTo);
        setHeld(Object.keys(given).filter((k) => Number(k) > sheet.upTo).length);
        setPlaying(true);
      }} />}
    </div>
  );
}

const VERDICT = {
  "in-window": "in time",
  stacked: "called early — you traded their concentration for your attention",
  late: "too late to follow — yours, not theirs",
  "never-given": "nothing said — they carried straight on",
};

const phraseOf = (i) => (i === "left" ? "Turn left" : i === "right" ? "Turn right" : "Follow the road ahead");

function Car({ p, pose, candidate, dim }) {
  if (!pose || pose.gone || pose.hidden) return null;
  const fill = candidate ? C.blue : dim ? C.amber : "#8b9199";
  if (p.kind === "ped") return <circle cx={pose.x} cy={pose.y} r={PED_R} fill={fill} opacity={dim ? 0.6 : 1} />;
  return (
    <g transform={`rotate(${pose.rot} ${pose.x} ${pose.y})`} opacity={dim ? 0.6 : 1}>
      <rect x={pose.x - CAR_L / 2} y={pose.y - CAR_W / 2} width={CAR_L} height={CAR_W} rx={M(0.3)}
        fill={fill} stroke="#12151a" strokeWidth={2} />
      <rect x={pose.x + CAR_L / 2 - M(0.5)} y={pose.y - CAR_W / 2} width={M(0.5)} height={CAR_W}
        fill="#12151a" opacity={0.55} />
    </g>
  );
}

/* The sheet: what happened, what you called, and what it cost. The gap
   between the two IS the score — the marking sheet is the player's
   record, the derivation is what was actually true. */
function Sheet({ sheet, drive, onNext }) {
  const { result, calls } = sheet;
  const weak = drive.candidate.weakOn ?? [];
  return (
    <div style={S.sheetWrap}>
      <div style={S.sheet}>
        <div style={S.sheetHead}><ClipboardList size={16} /> Section {Math.floor(sheet.from / PER_SECTION) + 1}</div>
        <div style={S.big}>{result.score}</div>
        <div style={S.dim}>{summarise(result) || "nothing called, nothing happened"}</div>
        <div style={S.dim}>
          precision {result.precision} · recall {result.recall} · timeliness {result.timeliness}
        </div>

        <div style={S.sheetSection}>Directions</div>
        {calls.map((c) => (
          <div key={c.junction} style={S.line}>
            <span style={S.dim}>Junction {c.junction + 1}</span>
            <span style={{ color: c.blame || c.wrongTurn ? C.red : c.verdict === "stacked" ? C.amber : C.green }}>
              {c.said ? `${phraseOf(c.said)} — ` : ""}{VERDICT[c.verdict] ?? c.verdict}
              {c.wrongTurn ? " (they wanted " + phraseOf(c.wanted).toLowerCase() + ")" : ""}
            </span>
          </div>
        ))}

        <div style={S.sheetSection}>What you missed</div>
        {result.missed.length === 0 && <div style={S.dim}>nothing you could have seen</div>}
        {result.missed.slice(0, 6).map((m, i) => (
          <div key={i} style={S.line}>
            <span style={S.dim}>{m.who === "ego" ? "the candidate" : m.who}</span>
            <span style={{ textAlign: "right" }}>{m.tell}</span>
          </div>
        ))}

        {sheet.done && (
          <>
            <div style={S.sheetSection}>Your candidate</div>
            <div style={S.dim}>
              weak on <b style={{ color: C.amber }}>{weak.join(" and ") || "nothing in particular"}</b>
            </div>
          </>
        )}

        <button className="btn" style={S.next} onClick={onNext}>
          {sheet.done ? "Another candidate" : "Carry on"}
        </button>
      </div>
    </div>
  );
}

function Meter({ label, v, colour }) {
  return (
    <div style={{ flex: 1 }}>
      <div style={S.meterLabel}>{label}</div>
      <div style={S.meterTrack}>
        <div style={{ ...S.meterFill, width: `${Math.max(0, Math.min(1, v)) * 100}%`, background: colour }} />
      </div>
    </div>
  );
}

const S = {
  page: { display: "flex", flexDirection: "column", height: "100%", minHeight: 0, background: C.bg },
  canvasWrap: { position: "relative", flex: "1 1 auto", minHeight: 0, background: "#0f1115" },
  svg: { width: "100%", height: "100%", display: "block", touchAction: "none" },
  hud: {
    position: "absolute", top: 10, left: 10, display: "flex", gap: 10, alignItems: "baseline",
    fontFamily: FONT_D, pointerEvents: "none", flexWrap: "wrap",
  },
  hudT: { fontSize: 17, color: C.white },
  hudDim: { fontSize: 12, color: C.dim },
  callout: {
    position: "absolute", left: 10, right: 10, bottom: 10, padding: "8px 12px",
    background: "rgba(20,22,26,0.88)", border: "1px solid", borderRadius: 10,
    fontFamily: FONT_U, fontSize: 13, textAlign: "center",
  },
  panel: { padding: 10, display: "flex", flexDirection: "column", gap: 8, background: C.bg },
  row: { display: "flex", gap: 8, alignItems: "center" },
  dirBtn: {
    flex: 1, minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
    background: "rgba(255,255,255,0.04)", border: "1px solid", borderRadius: 10,
    color: C.text, fontFamily: FONT_U, fontSize: 12, cursor: "pointer",
  },
  chip: {
    flex: 1, minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center",
    background: "rgba(255,255,255,0.03)", border: "1px solid", borderRadius: 10,
    fontFamily: FONT_U, fontSize: 11, cursor: "pointer",
  },
  mark: {
    flex: 1, minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
    background: "rgba(240,169,60,0.10)", border: `1px solid ${C.amber}`, borderRadius: 10,
    color: C.amber, fontFamily: FONT_D, fontSize: 15, cursor: "pointer",
  },
  btn: {
    minWidth: 44, minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center",
    background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 10, color: C.text, cursor: "pointer",
  },
  meterRow: { display: "flex", gap: 10, alignItems: "center" },
  meterLabel: { fontFamily: FONT_U, fontSize: 10, color: C.dim, textTransform: "uppercase", letterSpacing: "0.06em" },
  meterTrack: { height: 6, borderRadius: 3, background: "rgba(255,255,255,0.08)", overflow: "hidden", marginTop: 3 },
  meterFill: { height: "100%", borderRadius: 3 },
  note: { flex: 1, fontFamily: FONT_U, fontSize: 11, color: C.dim },
  sheetWrap: {
    position: "absolute", inset: 0, background: "rgba(10,12,15,0.82)",
    display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 20,
  },
  sheet: {
    width: "min(440px,100%)", maxHeight: "86%", overflowY: "auto", padding: 16,
    background: C.panel ?? "rgba(32,35,40,0.97)", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 14,
  },
  sheetHead: { display: "flex", gap: 8, alignItems: "center", fontFamily: FONT_D, fontSize: 15, color: C.white },
  sheetSection: {
    marginTop: 14, marginBottom: 4, fontFamily: FONT_U, fontSize: 10, letterSpacing: "0.08em",
    textTransform: "uppercase", color: C.dim,
  },
  big: { fontFamily: FONT_D, fontSize: 40, color: C.white, lineHeight: 1.1, marginTop: 6 },
  dim: { fontFamily: FONT_U, fontSize: 12, color: C.text, opacity: 0.85, marginTop: 2 },
  line: { display: "flex", gap: 10, justifyContent: "space-between", fontFamily: FONT_U, fontSize: 12, marginTop: 3 },
  next: {
    marginTop: 16, width: "100%", minHeight: 44, background: "rgba(59,123,232,0.14)",
    border: `1px solid ${C.blue}`, borderRadius: 10, color: C.white,
    fontFamily: FONT_D, fontSize: 15, cursor: "pointer",
  },
};
