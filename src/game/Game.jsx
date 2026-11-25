/* =====================================================================
   YOUR TURN (working title): the short game's screen (GAME.md;
   WORK-game-slice2 section 7). Five rounds, each ONE FROZEN DECISION: the
   car is already at its stop line, the scene is frozen, and the player
   goes at once or holds the button while the sim runs and lets go when it
   is their turn. The car then drives itself (autopilot.js) and the
   traffic answers.

   REACT STATE CHANGES ONLY BETWEEN ROUNDS (GAME.md rule 3): the world, the
   camera and the button live in `runRound`'s own variables, the readouts
   and the button are drawn on the canvas, and when a round ends the loop
   is stopped FIRST and the result set after.

   The scene and the drawn poses are MapRoad's own (`sceneFor`, `actorsOf`):
   one implementation of the quantity (GAME.md rule 4). `sceneFor` also
   builds a world of its own from the same arguments (its static parts --
   roads, terrain, junctions -- are what is wanted); the round's world, built
   by round.js toDecision, replaces it.
   ===================================================================== */
import React, { useEffect, useRef, useState } from "react";
import { Play, RotateCcw, ChevronRight } from "lucide-react";
import { sceneFor, actorsOf } from "../apps/MapRoad.jsx";
import { withGameBody } from "./look.js";
import { drawSet, SET_SIZE } from "./rounds.js";
import { sceneArgs, toDecision, press, release, roundTick, verdictOf } from "./round.js";
import { END_WORDS, TASK_WORDS, delayWords } from "./words.js";
import { DT } from "../sim/crossing.js";
import { pageMore, pageLeft } from "../sim/pace.js";
import { driverPose, carriedPlayer } from "../sim/drive.js";
import { drawFrame } from "../iso/draw.js";
import { viewOf } from "../iso/project.js";
import { newChase, chaseStep, zoomFor } from "../iso/chase.js";
import { INTRO_END, RING_MIN_PX, REPLAY_RATE, introAt, frameCamera, decisionFrame, skidLines, relevantIds, stopOrder, arrivalSeconds, speedOf, edgePoint, replayAt, streaksFor } from "./stage.js";
import { panFree, pinchFree } from "../iso/freecam.js";
import { newBody } from "../iso/body.js";
import { BUILD } from "../iso/perf.js";

const DPR_CAP = 2;
const AFTER_END = 600;    // ms the round keeps drawing after it ends, so the player sees what happened [invented; slice 4: from 1000]
const TEXT = "#E6E8EC", DIM = "#9AA3B2", AMBER = "#F2B84B", BG = "#1A1C20";
const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

/* THE DECISION CAMERA holds the decision FRAME (stage.js decisionFrame: the box, the player's stop pose and the cars that decide it, from the
   first frame to GO); after GO it eases into the chase camera over BLEND ms [invented]. The player may pan and pinch while frozen or waiting
   (iso/freecam.js panFree, pinchFree) and the camera returns to the frame on its own after GO. */
export const BLEND = 600;         // ms
/* The camera follows the frame as the cars that decide it change, at this rate (1/s) [invented]. */
const FOLLOW = 6;
/* The button: at least 88 px tall [the spec's], near the bottom, full width minus margins. [instrument] */
export const BUTTON_H = 96, BUTTON_MARGIN = 16, BUTTON_FROM_BOTTOM = 24;

export const buttonRect = (box) => ({ x: BUTTON_MARGIN, y: box.h - BUTTON_H - BUTTON_FROM_BOTTOM, w: box.w - 2 * BUTTON_MARGIN, h: BUTTON_H });
const inRect = (r, x, y) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

/* THE POINTER'S READING OF THE DECISION, in one small pure function so that "hold to wait, let go to go" can change in one place (a
   separate GO button with a WAIT that re-freezes on release is a change here). `by` is who holds the button: a pointer id, "key", or null.
   ev is { type: "down" | "up", id, x, y } or { type: "key-down" | "key-up" }; box is { w, h } of the canvas.
   Returns { by, act }: act is "press" (the sim starts to run), "release" (GO) or null. [invented, the planner's reading of Jay's words] */
export function decisionInput(by, ev, box) {
  if (ev.type === "down") return by == null && inRect(buttonRect(box), ev.x, ev.y) ? { by: ev.id, act: "press" } : { by, act: null };
  if (ev.type === "key-down") return by == null ? { by: "key", act: "press" } : { by, act: null };
  if (ev.type === "up") return by === ev.id ? { by: null, act: "release" } : { by, act: null };
  if (ev.type === "key-up") return by === "key" ? { by: null, act: "release" } : { by, act: null };
  return { by, act: null };
}

const norm = (d) => ((((d + 180) % 360) + 360) % 360) - 180;
const ease = (b) => b * b * (3 - 2 * b);

/* ONE ROUND ON A CANVAS. The world, the player and the camera are this function's own variables, never React state. `rs0` is the frozen
   round (round.js toDecision); `onEnd(verdict)` is called once, AFTER the loop has been stopped. Returns a stop. */
export function runRound({ canvas, rs0, onEnd, raf: schedule = requestAnimationFrame, cancel = cancelAnimationFrame, win = typeof window !== "undefined" ? window : null }) {
  const ctx = canvas.getContext("2d");
  const def = rs0.def;
  const sc = sceneFor(...sceneArgs(def));
  let rs = rs0;
  sc.world = rs.world; sc.me = rs.me;
  /* BODY MOTION: on, as MapRoad's default (settings.js bodyMotion: true). Its saved setting is async to load and is not read here. */
  const body = newBody();
  let by = null, owed = 0, lastAt = 0, handle = 0, endAt = null, goneAt = null, stopped = false;
  let chase = null;   // the chase camera, started at GO
  /* THE CAMERA SHOWN: { x, y, z, k, rot }, eased toward the decision frame; `userCam` is the player's own (pan and pinch) and wins while set. */
  let shown = null, userCam = null, goCam = null, pinch = null;
  const ptrs = new Map();   // pointer id -> { x, y }: the fingers that are DRAGGING (never the one holding the button)
  /* THE INTRO CLOCK (stage.js): seconds since the round was shown. A closure variable, never React state. The decision is not
     accepted before INTRO_END; a tap during it skips to its end and counts as nothing. */
  let intro = 0;
  const trail = rs0.decision.trail ?? [];

  const fit = () => {
    const dpr = Math.min(DPR_CAP, (win && win.devicePixelRatio) || 1);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w, h };
  };
  /* The decision, from any input: press runs the sim, release is GO. */
  const decide = (ev) => {
    if (stopped || rs.end) return;
    if (intro < INTRO_END) { if (ev.type === "down" || ev.type === "key-down") intro = INTRO_END; return; }   // a tap skips the intro; it is not a decision
    const box ={ w: canvas.clientWidth, h: canvas.clientHeight };
    const r = decisionInput(by, ev, box);
    by = r.by;
    if (r.act === "press") rs = press(rs);
    else if (r.act === "release") { rs = release(rs); goneAt = performance.now(); goCam = shown; userCam = null; ptrs.clear(); pinch = null; }
  };
  const canPan = () => (rs.phase === "frozen" || rs.phase === "waiting") && intro >= INTRO_END && !rs.end && !stopped;
  const local = (e) => { const b = canvas.getBoundingClientRect(); return { id: e.pointerId, x: e.clientX - b.left, y: e.clientY - b.top }; };
  /* A DRAG IS NEVER THE BUTTON: a finger that lands outside the button's rectangle while the decision is open pans (one) or pinch-zooms (two) and
     takes no part in the decision; the button is its own rectangle and its own pointer. */
  const onDown = (e) => {
    canvas.setPointerCapture?.(e.pointerId);
    const q = local(e);
    if (canPan() && !inRect(buttonRect({ w: canvas.clientWidth, h: canvas.clientHeight }), q.x, q.y) && shown) {
      userCam = userCam ?? { ...shown };
      ptrs.set(q.id, { x: q.x, y: q.y });
      if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { cam: userCam, a: { ...a }, b: { ...b } }; }
      return;
    }
    decide({ type: "down", ...q });
  };
  const onMove = (e) => {
    const was = ptrs.get(e.pointerId);
    if (!was || !userCam) return;
    const q = local(e), size = { w: canvas.clientWidth, h: canvas.clientHeight };
    ptrs.set(q.id, { x: q.x, y: q.y });
    if (ptrs.size === 1) userCam = panFree(userCam, size, was, q);
    else if (ptrs.size === 2 && pinch) { const [a, b] = [...ptrs.values()]; userCam = pinchFree(pinch, size, a, b); }
  };
  const onUp = (e) => {
    if (ptrs.delete(e.pointerId)) { pinch = null; return; }
    decide({ type: "up", ...local(e) });
  };
  const onKey = (e) => {
    if (e.key !== " ") return;
    e.preventDefault();
    if (e.type === "keydown" && !e.repeat) decide({ type: "key-down" });
    else if (e.type === "keyup") decide({ type: "key-up" });
  };
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);
  win?.addEventListener("keydown", onKey);
  win?.addEventListener("keyup", onKey);
  const stop = () => {
    stopped = true;
    cancel(handle);
    canvas.removeEventListener("pointerdown", onDown);
    canvas.removeEventListener("pointermove", onMove);
    canvas.removeEventListener("pointerup", onUp);
    canvas.removeEventListener("pointercancel", onUp);
    win?.removeEventListener("keydown", onKey);
    win?.removeEventListener("keyup", onKey);
  };

  const tick = (now) => {
    if (stopped) return;
    const size = fit();
    const dt = lastAt ? Math.min(0.25, Math.max(0, (now - lastAt) / 1000)) : 0;
    lastAt = now;

    /* THE SIM STEPS AT 20 Hz FROM AN ACCUMULATOR, as #/map does (sim/pace.js) -- and not at all while frozen. */
    if (rs.phase === "frozen") { owed = 0; if (intro < INTRO_END) intro = Math.min(INTRO_END, intro + dt); }
    else {
      owed += dt * speedOf(rs.phase);   // FAST sim ticks per tick of real time once the player has let go (stage.js)
      const sp0 = performance.now();
      for (let steps = 0; pageMore(owed, steps, performance.now() - sp0); steps++) {
        owed -= DT;
        rs = roundTick(rs);
        if (rs.end && endAt == null) endAt = now;
      }
      owed = pageLeft(owed);
    }
    sc.world = rs.world; sc.me = rs.me;

    /* THE END: keep drawing for a second, THEN stop the loop, THEN tell the screen. */
    if (endAt != null && now - endAt >= AFTER_END) { stop(); onEnd(verdictOf(rs)); return; }

    const me = rs.me;
    /* THE ARRIVAL OF THE WORLD (slice 6; Jay: "it should actually be the most visually busy moment"): over the intro the drawn world is the sim's own
       last REPLAY seconds, recorded by round.js, played at REPLAY_RATE x (stage.js replayAt) and ending on the frozen world exactly. Every other
       road user moves and its body moves with it; the player's own car is the screech, below. A tap during the intro skips to its end. */
    const it = rs.phase === "frozen" && intro < INTRO_END ? introAt(trail, intro) : null;
    const rp = it && rs.decision.replay?.length ? replayAt(rs.decision.replay, intro) : null;
    const world = rp ? rp.world : rs.world, carry = rp ? rp.carry : owed;
    /* The player as THAT world has them (the rings and the order are read for the moment drawn); the frozen car once the intro is over. */
    const drawMe = rp ? (world.actors.find((a) => a.player && !a.shadow) ?? me) : me;
    body.dt = dt * (rp ? REPLAY_RATE : speedOf(rs.phase));
    const actors = actorsOf(withGameBody(rp ? { ...sc, world } : sc), carry, body);   // the game's exaggerated body motion (look.js)
    const p = driverPose(carriedPlayer(me, owed), world.course);
    /* THE INTRO (stage.js): the player's drawn pose and body are the screech's, for as long as it plays; every other car keeps its own. */
    if (it?.pose) {
      const mine = actors.find((a) => a.player);
      if (mine) { mine.x = it.pose.x; mine.y = it.pose.y; mine.z = it.pose.z; mine.heading = it.pose.heading; mine.body = it.body; mine.brakeLamp = true; }
    }
    /* THE DECISION FRAME holds from the first frame to GO (the intro included: no far shot, no dive), eased as the cars that decide it change;
       the player's own pan and pinch win while they last. After GO, the chase camera is blended in from where the camera was. */
    let cam, k;
    if (rs.phase !== "gone") {
      const fr = frameCamera(decisionFrame(rs), p, size), a = shown ? 1 - Math.exp(-FOLLOW * dt) : 1;
      shown = shown ? { x: shown.x + (fr.cam.x - shown.x) * a, y: shown.y + (fr.cam.y - shown.y) * a, z: 0, k: shown.k + (fr.k - shown.k) * a, rot: fr.rot } : { ...fr.cam, k: fr.k, rot: fr.rot };
      if (userCam) shown = { ...userCam, z: userCam.z ?? 0 };
      cam = { x: shown.x, y: shown.y, z: shown.z, rot: shown.rot }; k = shown.k;
    } else {
      const dec = goCam ?? shown, kDec = dec.k;
      chase = chase ? { ...chaseStep(chase, { ...p, v: me.v }, dt, { rotate: true }) } : newChase({ x: p.x, y: p.y, z: p.z ?? 0 }, p.heading);
      const kChase = zoomFor(size.w, size.h, chase.lead, 0.55, 30);
      const b = ease(Math.min(1, (performance.now() - (goneAt ?? now)) / BLEND));
      cam = { x: dec.x + (chase.x - dec.x) * b, y: dec.y + (chase.y - dec.y) * b, z: dec.z + (chase.z - dec.z) * b, rot: norm(dec.rot + norm(chase.rot - dec.rot) * b) };
      k = kDec + (kChase - kDec) * b;
    }
    drawFrame(ctx, size, { roads: sc.roads, terrain: sc.terrain, cam: { ...cam, id: null }, rot: cam.rot, k, tilt: false, actors, groundAt: sc.ground, junctions: sc.junctions, sidewalks: sc.sidewalks, stops: sc.stops, props: sc.props, t: world.t + carry, lights: world.lights });

    /* THE SKID MARKS: over the road, AFTER the cars (drawFrame is one painter's pass this slice may not edit, so they cannot go under
       the cars). Low alpha dark lines; they stop short of the player's own footprint (stage.js SKID_REAR), so nothing is drawn across
       its roof, and they stay for the rest of the round. During the intro they grow as the car covers the road. */
    const view = viewOf(k, { ...cam, id: null }, cam.rot, size);
    const marks = skidLines(trail, it ? it.u : 1);
    ctx.strokeStyle = "rgba(10,10,12,0.5)"; ctx.lineWidth = Math.max(1.5, 0.25 * k); ctx.lineCap = "round";
    for (const line of marks) {
      if (line.length < 2) continue;
      ctx.beginPath();
      line.forEach((q, i) => { const [qx, qy] = view.P(q.x, q.y, q.z); if (i) ctx.lineTo(qx, qy); else ctx.moveTo(qx, qy); });
      ctx.stroke();
    }
    /* THE RELEVANT TRAFFIC, ringed (stage.js relevantIds: conflicts with the player's route, not past it, and at its line, in the box or
       arriving within a few seconds), recomputed from the drawn world every frame, as MapRoad rings a picked driver. */
    if (rs.phase !== "gone") {
      /* THE MOTION STREAKS (stage.js streaksFor, slice 6): three fading lines behind every other car that is moving, STREAK_S of its travel
         long, drawn from the drawn world every frame, so a car that has been seen arriving still reads as moving once frozen and the
         streak shortens away as it slows while the player waits. Under the rings and badges. */
      ctx.lineCap = "round";
      for (const { lines } of streaksFor(actors, world)) {
        for (const l of lines) {
          const [ax, ay] = view.P(l.x0, l.y0, l.z), [bx, by2] = view.P(l.x1, l.y1, l.z);
          const g = ctx.createLinearGradient(ax, ay, bx, by2);
          g.addColorStop(0, `rgba(255,255,255,${l.alpha})`); g.addColorStop(1, "rgba(255,255,255,0)");
          ctx.strokeStyle = g; ctx.lineWidth = Math.max(1.5, 0.3 * k);
          ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by2); ctx.stroke();
        }
      }
      ctx.strokeStyle = AMBER; ctx.lineWidth = 2;
      for (const id of relevantIds(world, drawMe)) {
        const pose = actors.find((a) => a.id === id);
        if (!pose) continue;
        const [px, py] = view.P(pose.x, pose.y, pose.z ?? 0);
        /* A car off the screen has no ring: it has its edge badge (below). */
        if (px < 0 || px > size.w || py < 0 || py > size.h) continue;
        ctx.beginPath(); ctx.arc(px, py, Math.max(RING_MIN_PX, 3.2 * k), 0, Math.PI * 2); ctx.stroke();
      }
      /* THE STOPPING ORDER (stage.js stopOrder, from each car's own stoppedAt) in a disc above each car at its line, the player's reading YOU;
         an arriving car on a road with no stop shows its seconds to the conflict. Recomputed every frame, so it updates while the player waits. */
      const badge = (id, text, you) => {
        const pose = actors.find((a) => a.id === id);
        if (!pose) return;
        const [qx, qy] = view.P(pose.x, pose.y, pose.z ?? 0), e = edgePoint(qx, qy - Math.max(22, 4.5 * k), size);
        const px = e.x, py = e.y;
        /* OFF THE SCREEN (a car the careful driver waits for, further out than the frame): the badge sits at the edge with a pointer to it. */
        if (e.off) {
          ctx.fillStyle = "#ffffff"; ctx.strokeStyle = "#14161a"; ctx.lineWidth = 2;
          const a = e.angle, tx = px + Math.cos(a) * 20, ty = py + Math.sin(a) * 20;
          ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(px + Math.cos(a + 0.5) * 11, py + Math.sin(a + 0.5) * 11); ctx.lineTo(px + Math.cos(a - 0.5) * 11, py + Math.sin(a - 0.5) * 11); ctx.closePath(); ctx.fill(); ctx.stroke();
        }
        ctx.font = `700 ${you ? 14 : 15}px ${FONT}`;
        const w = Math.max(20, ctx.measureText(text).width + 12), h = 20;
        ctx.fillStyle = you ? AMBER : "#ffffff"; ctx.strokeStyle = "#14161a"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.roundRect(px - w / 2, py - h / 2, w, h, h / 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#14161a"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(text, px, py + 0.5);
      };
      for (const r of stopOrder(world, drawMe)) badge(r.id, r.you ? `YOU ${r.n}` : `${r.n}`, r.you);
      for (const r of arrivalSeconds(world, drawMe)) badge(r.id, `${r.secs}s`, false);
    }

    /* THE HUD, all on the canvas. */
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    ctx.fillStyle = AMBER; ctx.font = `700 22px ${FONT}`;
    ctx.fillText(TASK_WORDS[def.task] ?? def.task, size.w / 2, 14);
    ctx.fillStyle = "rgba(230,232,236,0.8)"; ctx.font = `13px ${FONT}`;
    ctx.fillText(def.say, size.w / 2, 42);
    if (rs.phase === "frozen") {
      ctx.fillStyle = "rgba(20,22,26,0.7)"; ctx.fillRect(size.w - 92, 12, 80, 24);
      ctx.fillStyle = "#ffffff"; ctx.font = `700 12px ${FONT}`; ctx.textBaseline = "middle"; ctx.fillText("FROZEN", size.w - 52, 24); ctx.textBaseline = "top";
    } else if (rs.phase === "waiting") {
      ctx.fillStyle = "#ffffff"; ctx.font = `700 34px ${FONT}`;
      ctx.fillText(`${(world.t - rs.decision.decideAt).toFixed(1)} s`, size.w / 2, 66);
    }
    if (rs.phase !== "gone" && intro >= INTRO_END) {
      const r = buttonRect(size), held = rs.phase === "waiting";
      ctx.fillStyle = held ? "#8fd694" : AMBER;
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.fillStyle = "#1a1c20"; ctx.textBaseline = "middle"; ctx.font = `700 ${size.w < 360 ? 16 : 19}px ${FONT}`;
      ctx.fillText(held ? "WAITING · LET GO TO GO" : "HOLD TO WAIT · LET GO TO GO", size.w / 2, r.y + r.h / 2);
    }
    /* The round is over: say so on the canvas for the second it is still drawn. */
    if (endAt != null) {
      ctx.fillStyle = "rgba(20,22,26,0.7)"; ctx.fillRect(0, size.h / 2 - 28, size.w, 56);
      ctx.fillStyle = "#ffffff"; ctx.font = `700 24px ${FONT}`; ctx.textBaseline = "middle";
      ctx.fillText(rs.end.why === "through" ? "Through" : END_WORDS[rs.end.why] ?? rs.end.why, size.w / 2, size.h / 2);
    }
    handle = schedule(tick);
  };
  handle = schedule(tick);
  return stop;
}

export default function Game() {
  const canvasRef = useRef(null);
  const frozen = useRef(null);                      // the frozen round the loop starts from
  const [phase, setPhase] = useState("title");      // title | building | round | result | summary
  const [plan, setPlan] = useState([]);              // the set: five { type, pool, seed, cars }
  const [ix, setIx] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [verdict, setVerdict] = useState(null);
  const [stars, setStars] = useState([]);            // the last verdict's stars per round
  const cur = plan[ix];
  const def = cur?.type;

  /* BUILDING THE DECISION POINT, after the card has painted (not in the first paint). */
  useEffect(() => {
    if (phase !== "building" || !cur) return undefined;
    let cancelled = false;
    const h = setTimeout(() => {
      const rs = toDecision(cur.type, cur.seed, cur.cars);
      if (cancelled) return;
      frozen.current = rs;
      setPhase(rs ? "round" : "summary");
    }, 60);
    return () => { cancelled = true; clearTimeout(h); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, ix, attempt]);

  useEffect(() => {
    if (phase !== "round" || !canvasRef.current || !frozen.current) return undefined;
    return runRound({
      canvas: canvasRef.current, rs0: frozen.current,
      /* The loop has stopped; only now does React hear of the round. */
      onEnd: (v) => { setVerdict(v); setStars((s) => { const n = s.slice(); n[ix] = v.stars; return n; }); setPhase("result"); },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, ix, attempt]);

  const total = stars.reduce((s, n) => s + (n ?? 0), 0);
  const isLast = ix >= plan.length - 1;
  /* The set's seed is taken here, when Play is pressed: never inside a render or a useMemo (GAME.md). */
  const play = () => { const p = drawSet((Math.random() * 2 ** 31) >>> 0); setPlan(p); setIx(0); setStars([]); setVerdict(null); setAttempt((a) => a + 1); setPhase(p.length ? "building" : "title"); };

  if (phase === "round") {
    return (
      <div style={S.fill}>
        <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block", touchAction: "none" }} />
      </div>
    );
  }

  return (
    <div style={S.page}>
      {phase === "title" && (
        <div style={S.card}>
          <div style={S.big}>Your Turn</div>
          <div style={S.sub}>{SET_SIZE} intersections. At each, decide: go now, or wait for your turn.</div>
          <button style={S.btn} onClick={play}><Play size={18} /> Play</button>
          <div style={S.stamp}>{BUILD}</div>
        </div>
      )}

      {phase === "building" && def && (
        <div style={S.card}>
          <div style={S.dim}>Round {ix + 1} of {plan.length}</div>
          <div style={S.big}>{TASK_WORDS[def.task]}</div>
          <div style={S.sub}>{def.brief}</div>
          {ix === 0 && attempt === 1 && <div style={S.hint}>Hold the big button to let the traffic move while you wait. Let go to go.</div>}
        </div>
      )}

      {phase === "result" && verdict && def && (
        <div style={S.card}>
          <div style={S.dim}>Round {ix + 1} of {plan.length} · {def.title}</div>
          <div style={S.starsRow} aria-label={`${verdict.stars} of 3 stars`}>{[0, 1, 2].map((i) => (i < verdict.stars ? "★" : "☆")).join(" ")}</div>
          {verdict.why !== "through" && <div style={S.fault}>{END_WORDS[verdict.why] ?? verdict.why}</div>}
          {verdict.delay != null && <div style={S.sub}>{delayWords(verdict.delay, verdict.openAtFreeze)}</div>}
          {verdict.faults.map((f) => <div key={f.id} style={S.fault}>{f.words}{f.count > 1 ? ` (×${f.count})` : ""}</div>)}
          {verdict.notes.map((f) => <div key={f.id} style={S.note}>{f.words}</div>)}
          {verdict.praise.map((f) => <div key={f.id} style={S.praise}>{f.words}{f.count > 1 ? ` (×${f.count})` : ""}</div>)}
          {verdict.why === "through" && !verdict.faults.length && !verdict.praise.length && <div style={S.praise}>A clean round.</div>}
          <div style={S.row}>
            <button style={S.btnGhost} onClick={() => { setAttempt((a) => a + 1); setPhase("building"); }}><RotateCcw size={18} /> Try again</button>
            <button style={S.btn} onClick={() => { if (isLast) setPhase("summary"); else { setIx(ix + 1); setPhase("building"); } }}>{isLast ? "See your set" : "Next"} <ChevronRight size={18} /></button>
          </div>
        </div>
      )}

      {phase === "summary" && (
        <div style={S.card}>
          <div style={S.big}>Your set</div>
          {plan.map((r, i) => (
            <div key={i} style={S.sumRow}><span>{r.type.title}</span><span style={S.starsSmall}>{[0, 1, 2].map((j) => (j < (stars[i] ?? 0) ? "★" : "☆")).join("")}</span></div>
          ))}
          <div style={S.sub}>{total} of {plan.length * 3} stars</div>
          <button style={S.btn} onClick={play}><RotateCcw size={18} /> Play again</button>
        </div>
      )}
    </div>
  );
}

const pad = "max(16px, env(safe-area-inset-left))";
const S = {
  fill: { position: "fixed", inset: 0, height: "100dvh", background: BG },
  page: { minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", background: BG, color: TEXT, fontFamily: FONT, padding: `max(16px, env(safe-area-inset-top)) ${pad} max(16px, env(safe-area-inset-bottom)) ${pad}` },
  card: { width: "100%", maxWidth: 420, display: "flex", flexDirection: "column", gap: 14, alignItems: "stretch", textAlign: "center" },
  big: { fontSize: 36, fontWeight: 700, color: "#fff" },
  sub: { fontSize: 16, color: TEXT, lineHeight: 1.4 },
  dim: { fontSize: 13, color: DIM },
  hint: { fontSize: 14, color: AMBER, lineHeight: 1.4 },
  stamp: { fontSize: 11, color: "rgba(154,163,178,0.6)" },
  btn: { minHeight: 48, padding: "0 20px", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 10, border: "none", background: AMBER, color: "#1a1c20", fontSize: 17, fontWeight: 700, fontFamily: FONT },
  btnGhost: { minHeight: 48, padding: "0 20px", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 10, border: "1px solid rgba(255,255,255,0.25)", background: "transparent", color: TEXT, fontSize: 16, fontFamily: FONT },
  row: { display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" },
  starsRow: { fontSize: 48, color: AMBER, letterSpacing: 6 },
  starsSmall: { fontSize: 20, color: AMBER, letterSpacing: 3 },
  fault: { fontSize: 16, color: "#ff9a8f", lineHeight: 1.35 },
  note: { fontSize: 15, color: DIM, lineHeight: 1.35 },
  praise: { fontSize: 16, color: "#8fd694", lineHeight: 1.35 },
  sumRow: { display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 17, padding: "6px 4px", borderBottom: "1px solid rgba(255,255,255,0.1)" },
};
