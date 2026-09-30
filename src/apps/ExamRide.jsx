/* =====================================================================
   STAGE 3 (#/exam): RIDE WITH A CANDIDATE -- the exam mode as a
   reinterpretation of the controls you drive with (SIMULATOR.md 1.1,
   stage 3; the logic is src/sim/exam.js).

   The test map, in the same traffic #/map runs, from the passenger
   seat. The candidate drives -- an ordinary driver of the sim, drawn
   from one of the named profiles -- and carries straight on unless told
   otherwise. The turn taps GIVE THE DIRECTION; the slider's lower half
   is your hand: ease it down to tell them to slow, push it to the
   bottom for the instructor's brake. It springs back when you let go.

   Deliberately rough: no marking, no sheet, nothing scored. The one
   question is whether this feels like examining.

   Same rules as every live screen: no React state from the frame loop
   (the world lives in a ref, the readouts are drawn on the canvas), and
   nothing here reaches src/engine/.
   ===================================================================== */
import React, { useEffect, useRef, useState } from "react";
import { Play, Pause, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import { C, FONT_D, FONT_U } from "../theme.js";
import { sceneFor, actorsOf, START, CARS } from "./MapRoad.jsx";
import { step, poseOf, DT } from "../sim/crossing.js";
import { aheadOf } from "../sim/drive.js";
import { postedAt } from "../sim/graph.js";
import { candidateOn, candidateOf, direct, interventionOf, withIntervention, pickProfile, DUAL_AT } from "../sim/exam.js";
import { PROFILES, profileOf } from "../sim/candidate.js";
import { NEUTRAL } from "../sim/player.js";
import { controls, SLIDER_TOP, SIGNAL_ZONE } from "../iso/controls.js";
import { drawFrame } from "../iso/draw.js";
import { drawSlider, drawSignals, drawReadout } from "../iso/hud.js";
import { newChase, chaseStep, zoomFor } from "../iso/chase.js";

const DIM = "#9AA3B2", TEXT = "#E6E8EC";
const DPR_CAP = 2;
const NODE_NAME = { n0: "the crossroads", n1: "the T", n2: "the five-way", n3: "the T", n4: "the arterial" };
const nameOf = (node) => NODE_NAME[node] ?? "the next intersection";
const SAID = { left: "Turn left", right: "Turn right" };

/* The ride, built on #/map's own scene with nobody at the wheel, and the
   candidate put where the player would start. */
function rideFor(seed, profile) {
  const sc = sceneFor(seed, 50, 2.0, false);
  const world = candidateOn(sc.world, { profile, road: START.road, end: START.end });
  if (!world) throw new Error("nowhere to put the candidate on this map");
  return { ...sc, world, profile };
}

export default function ExamRide() {
  const canvasRef = useRef(null);
  const [seed, setSeed] = useState(1);
  const [choice, setChoice] = useState("surprise");   // a profile id, or "surprise" -- a draw you are not told
  const [playing, setPlaying] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [ended, setEnded] = useState(false);          // the candidate drove off the edge of the map

  const scene = useRef(null);
  const cam = useRef({ ...newChase(), id: null });
  const owed = useRef(0);
  const last = useRef(0);
  const raf = useRef(0);
  const input = useRef(controls({ spring: true }));
  const held = useRef(new Set());
  const said = useRef(null);      // { intent, heard, node, at }: what you said last, and what became of it
  const endedRef = useRef(false);
  if (!scene.current) scene.current = rideFor(1, pickProfile(1, null));

  const restart = (s = seed, c = choice) => {
    setSeed(s); setChoice(c); setEnded(false); endedRef.current = false;
    scene.current = rideFor(s, pickProfile(s, c === "surprise" ? null : c));
    input.current.state.slider = 0; input.current.state.signal = null;
    cam.current = { ...newChase(), id: null };
    owed.current = 0; said.current = null;
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext("2d");

    const fit = () => {
      const dpr = Math.min(DPR_CAP, window.devicePixelRatio || 1);
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { w, h };
    };

    const onKey = (e) => {
      if (e.type === "keydown" && !e.repeat && (e.key === "q" || e.key === "e")) input.current.signal(e.key === "q" ? "left" : "right");
      if (e.type === "keydown") held.current.add(e.key); else held.current.delete(e.key);
      if (["ArrowUp", "ArrowDown", " "].includes(e.key)) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);

    const tick = (now) => {
      const size = fit();
      const dt = last.current ? Math.min(0.25, Math.max(0, (now - last.current) / 1000)) : 0;
      last.current = now;
      const st = input.current.state;
      if (held.current.size) input.current.keys(held.current, dt);
      /* Your hand leaves the slider and it springs back -- for keys as
         for a thumb, so a released key is not a brake still applied. */
      const onSlider = Object.values(st.touches ?? {}).some((t) => t?.role === "slider");
      if (!onSlider && !["ArrowDown", "s", " "].some((k) => held.current.has(k))) st.slider = 0;
      const sc = scene.current;

      /* A TAP IS SPOKEN AT ONCE: the direction goes to the candidate the
         moment you give it, and the arrow flashes to say it was said. */
      if (st.signal && !endedRef.current) {
        const r = direct(sc.world, st.signal);
        sc.world = r.world;
        const me = candidateOf(sc.world);
        const a = me && aheadOf(me, sc.world.course, sc.world);
        said.current = { intent: st.signal, heard: r.heard, node: a?.node ?? null, at: now };
        st.signal = null;
      }
      const hand = interventionOf(st.slider);

      if (playing && !endedRef.current) {
        owed.current += dt;
        while (owed.current >= DT) {
          owed.current -= DT;
          sc.world = step(withIntervention(sc.world, hand));
          if (!candidateOf(sc.world) || candidateOf(sc.world).crash) { endedRef.current = true; setEnded(true); break; }
        }
      }

      const me = candidateOf(sc.world);
      const carry = playing && !endedRef.current ? owed.current : 0;
      const actors = actorsOf(sc, carry);
      let k = Math.max(1, (size.w / 60) * zoom), rot = 0;
      if (me) {
        const p = poseOf(sc.world, me);
        cam.current = { ...chaseStep(cam.current, { x: p.x, y: p.y, z: p.z ?? 0, heading: p.rot, v: me.v }, dt, { rotate: true }), id: null };
        k = zoomFor(size.w, size.h, cam.current.lead) * zoom;
        rot = cam.current.rot;
      }
      drawFrame(ctx, size, { roads: sc.roads, terrain: sc.terrain, cam: cam.current, rot, k, tilt: false, actors, groundAt: sc.ground, junctions: sc.junctions, sidewalks: sc.sidewalks, props: sc.props, t: sc.world.t + carry });

      ctx.textAlign = "center"; ctx.textBaseline = "top";
      if (me) {
        /* Their speed, and the limit of the road they are on. */
        ctx.fillStyle = "#ffffff"; ctx.font = "700 26px system-ui, sans-serif";
        ctx.fillText(`${Math.round(me.v * 3.6)}`, size.w / 2, 6);
        ctx.fillStyle = "rgba(230,232,236,0.8)"; ctx.font = "12px system-ui, sans-serif";
        ctx.fillText("km/h", size.w / 2, 38);
        const posted = postedAt(sc.world.course, me.k, me.route);
        if (posted) {
          const lim = Math.round((posted * 3.6) / 10) * 10, over = me.v * 3.6 > lim + 3;
          const sx = size.w / 2 + 46, sy = 8, sw = 30, sh = 38;
          ctx.fillStyle = over ? "#e0574f" : "#f4f4f2"; ctx.fillRect(sx, sy, sw, sh);
          ctx.strokeStyle = "#111"; ctx.lineWidth = 1.5; ctx.strokeRect(sx + 2, sy + 2, sw - 4, sh - 4);
          ctx.fillStyle = over ? "#fff" : "#111"; ctx.font = "700 7px system-ui, sans-serif";
          ctx.fillText("MAX", sx + sw / 2, sy + 5);
          ctx.font = "700 15px system-ui, sans-serif"; ctx.fillText(String(lim), sx + sw / 2, sy + 15);
        }
        /* WHAT THEY ARE ABOUT TO DO at the intersection ahead -- what a
           passenger sees: which way they are going, and whether they are
           moving over for it. */
        const a = aheadOf(me, sc.world.course, sc.world);
        ctx.font = "12px system-ui, sans-serif";
        if (a.node) {
          const lay = sc.world.course.at[me.k].layout;
          const want = me.want && me.want.k === me.k && !a.committed
            ? Object.values(lay.paths).find((p) => (lay.legs[p.to]?.base ?? p.to) === me.want.to)?.intent ?? null
            : null;
          const word = want ? `moving over to turn ${want}` : a.intent === "left" ? "turning left" : a.intent === "right" ? "turning right" : "straight on";
          ctx.fillStyle = a.committed ? "#6cc070" : "rgba(230,232,236,0.75)";
          ctx.fillText(`${word} at ${nameOf(a.node)}${a.committed ? " — through the line" : ` in ${Math.round(a.toLine)} m`}`, size.w / 2, 54);
        }
        /* WHAT YOU SAID, and what became of it, for five seconds. */
        const s = said.current;
        if (s && now - s.at < 5000) {
          const fade = Math.min(1, (5000 - (now - s.at)) / 1000);
          const tail = s.heard === "now" ? ` at ${nameOf(s.node)}.”` : s.heard === "next" ? " at the next one.”" : "”";
          ctx.fillStyle = `rgba(242,184,75,${fade})`; ctx.font = "600 14px system-ui, sans-serif";
          ctx.fillText(`You: “${SAID[s.intent]}${tail}`, size.w / 2, 72);
          if (s.heard === "late") { ctx.font = "12px system-ui, sans-serif"; ctx.fillText(`too late to make it at ${nameOf(s.node)} — carrying straight on`, size.w / 2, 92); }
        }
        /* YOUR HAND, when it is on them. */
        if (hand.dual) {
          ctx.fillStyle = "#e0574f"; ctx.font = "700 16px system-ui, sans-serif";
          ctx.fillText("INSTRUCTOR'S BRAKE", size.w / 2, 112);
        } else if (hand.ease) {
          ctx.fillStyle = "#f2b84b"; ctx.font = "600 14px system-ui, sans-serif";
          ctx.fillText(`“Slow down.” — to ${Math.round((1 - hand.ease) * 100)}% of the speed they want`, size.w / 2, 112);
        }
      }

      /* The slider, and what its lower half means here. */
      drawSlider(ctx, size, st.slider);
      const x = size.w - 32, top = SLIDER_TOP, bottom = size.h - 24, mid = (top + bottom) / 2;
      const yOf = (u) => mid - (u * (bottom - top)) / 2;
      const dualY = yOf(-(NEUTRAL + DUAL_AT * (1 - NEUTRAL)));
      ctx.strokeStyle = "rgba(224,87,79,0.7)"; ctx.lineWidth = 10; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(x, dualY); ctx.lineTo(x, bottom); ctx.stroke();
      ctx.fillStyle = "rgba(230,232,236,0.7)"; ctx.font = "12px system-ui, sans-serif"; ctx.textAlign = "right"; ctx.textBaseline = "middle";
      ctx.fillText("slow down", x - 20, (yOf(-NEUTRAL) + dualY) / 2);
      ctx.fillStyle = "#e0574f"; ctx.fillText("brake", x - 20, (dualY + bottom) / 2);
      ctx.fillStyle = "rgba(230,232,236,0.4)"; ctx.fillText("(they drive)", x - 20, yOf(0.5));

      /* The turn taps: a flash on the side just said. */
      const flashing = said.current && now - said.current.at < 700 ? said.current.intent : null;
      drawSignals(ctx, size, flashing, now, { label: false });
      ctx.fillStyle = "rgba(255,255,255,0.55)"; ctx.font = "12px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "top";
      ctx.fillText("turn left", SIGNAL_ZONE.w / 2, SIGNAL_ZONE.h / 2 + 20);
      ctx.fillText("turn right", size.w - SIGNAL_ZONE.w / 2, SIGNAL_ZONE.h / 2 + 20);
      drawReadout(ctx, `${sc.world.actors.length} cars on the map`, 8, size.h - 24);

      raf.current = requestAnimationFrame(tick);
    };
    tick(performance.now());
    return () => { cancelAnimationFrame(raf.current); window.removeEventListener("keydown", onKey); window.removeEventListener("keyup", onKey); };
  }, [playing, zoom, seed, choice]);

  const at = (e) => { const r = e.currentTarget.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top, { w: r.width, h: r.height }]; };
  const onDown = (e) => { e.currentTarget.setPointerCapture?.(e.pointerId); const [x, y, box] = at(e); input.current.pointer("down", e.pointerId, x, y, box, performance.now()); };
  const onMove = (e) => { const [x, y, box] = at(e); input.current.pointer("move", e.pointerId, x, y, box, performance.now()); };
  const onUp = (e) => { const [x, y, box] = at(e); input.current.pointer("up", e.pointerId, x, y, box, performance.now()); };

  const who = profileOf(scene.current.profile);
  return (
    <div style={S.page}>
      <div style={S.head}>
        <span style={S.title}>Stage 3 — ride with a candidate</span>
        <span style={S.sub}>They drive. You give the directions with the turn taps, and the slider is your hand: ease it down to tell them to slow, push it to the bottom for the instructor's brake. No direction means straight on.</span>
      </div>

      <div style={S.view}>
        <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block", touchAction: "none" }}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} />
        {ended && (
          <div style={S.banner}>
            {candidateOf(scene.current.world)?.crash ? (
              <>
                <div style={{ fontFamily: FONT_D, fontSize: 18, fontWeight: 700, color: "#ff8a1e" }}>They collided.</div>
                <div style={{ fontFamily: FONT_U, fontSize: 13, color: DIM, margin: "4px 0 10px" }}>
                  The drive ends at a collision. What taking the wheel earlier would have meant is still Jay's question.{choice === "surprise" ? ` That was ${who.name}: ${who.watch}.` : ""}
                </div>
              </>
            ) : (
              <>
                <div style={{ fontFamily: FONT_D, fontSize: 18, fontWeight: 700 }}>They drove off the map.</div>
                <div style={{ fontFamily: FONT_U, fontSize: 13, color: DIM, margin: "4px 0 10px" }}>
                  The edge of the map is the end of the drive for now.{choice === "surprise" ? ` That was ${who.name}: ${who.watch}.` : ""}
                </div>
              </>
            )}
            <button className="btn" style={S.chip} onClick={() => restart(seed + 1)}>Another drive</button>
          </div>
        )}
      </div>

      <div style={S.panel}>
        <div style={S.row}>
          <button className="btn" style={S.btn} onClick={() => setPlaying((p) => !p)}>{playing ? <Pause size={16} /> : <Play size={16} />}</button>
          <button className="btn" style={S.btn} onClick={() => restart(seed + 1)} title="another drive, new traffic"><RotateCcw size={16} /></button>
          <button className="btn" style={S.btn} onClick={() => setZoom((z) => Math.max(0.5, z / 1.25))}><ZoomOut size={16} /></button>
          <button className="btn" style={S.btn} onClick={() => setZoom((z) => Math.min(4, z * 1.25))}><ZoomIn size={16} /></button>
          <label style={{ ...S.label, display: "inline-flex", alignItems: "center", gap: 8 }}>
            Candidate
            <select style={S.select} value={choice} onChange={(e) => restart(seed, e.target.value)}>
              <option value="surprise">surprise me (not told who)</option>
              {PROFILES.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.blurb}</option>)}
            </select>
          </label>
          <span style={S.label}>keys: q and e give directions, down arrow slows them, space is the brake</span>
        </div>
        <div style={S.note}>
          <b>What to judge.</b> One question: <b>does this feel like
          examining?</b> Does giving a direction with a tap feel like telling
          a candidate where to go? Does easing the slider down read as
          "slow down, please", and does the bottom of it feel like reaching
          for the brake? Is there enough time to say things, and can you
          tell what the candidate has understood?
          <br />
          <b>How it works.</b> The candidate starts at the top of the map,
          heading for the crossroads, and carries straight on at every
          intersection unless you say otherwise. Say a turn before they
          reach the line and they take it there, moving over a lane if
          they need to (a candidate may not manage to, like anybody else);
          say it too late to slow for the corner and they carry on, which
          is on you; say it once they are through the line and it is for
          the next one. The line under their speed is what they are about
          to do.
          <br />
          <b>Deliberately absent — please do not report these as faults.</b>{" "}
          No marking, no fault sheet, no score, nothing recorded about your
          interventions: this is only the ride. No way to take back a
          direction once said. The candidate cannot be told "straight on"
          (silence is straight on). The test map only, and the drive ends
          when they leave it. Their mirrors and head checks are not drawn,
          and they do not signal visibly. The candidate is one of six
          profiles; "surprise me" does not tell you which until the drive
          ends.
        </div>
      </div>
    </div>
  );
}

const S = {
  page: { minHeight: "100dvh", display: "flex", flexDirection: "column", background: C.bg, color: TEXT },
  head: { padding: "10px 12px 6px", display: "flex", flexDirection: "column", gap: 2 },
  title: { fontFamily: FONT_D, fontSize: 18, fontWeight: 700, color: C.white },
  sub: { fontFamily: FONT_U, fontSize: 12, color: DIM },
  view: { position: "relative", height: "66vh", minHeight: 360, margin: "0 8px", borderRadius: 8, overflow: "hidden", background: "#1b1e23" },
  banner: { position: "absolute", left: 16, right: 80, top: "40%", padding: 14, borderRadius: 10, background: "rgba(20,22,26,0.92)", border: "1px solid rgba(255,255,255,0.15)", color: TEXT },
  panel: { padding: 10, display: "flex", flexDirection: "column", gap: 8 },
  row: { display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" },
  btn: { width: 44, height: 44, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 8, border: "1px solid rgba(255,255,255,0.12)", background: "transparent", color: C.white },
  chip: { minHeight: 44, minWidth: 64, padding: "0 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.12)", background: "transparent", fontFamily: FONT_D, fontSize: 13, color: TEXT },
  select: { height: 44, maxWidth: 260, padding: "0 8px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.12)", background: "#1b1e23", color: TEXT, fontSize: 16 },
  label: { fontFamily: FONT_D, fontSize: 13, color: DIM, marginLeft: 6 },
  note: { fontFamily: FONT_U, fontSize: 12, color: DIM, lineHeight: 1.45 },
};
